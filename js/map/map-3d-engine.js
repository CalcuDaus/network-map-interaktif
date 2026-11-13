/**
 * NetMap — Interactive 3D Map Viewport Engine (Three.js WebGL)
 * Visualisasi 3D perangkat bertumpuk (Server, Router, Switch, Access Point),
 * kabel 3D ber-elevasi, cakupan sinyal nirkabel, ruangan 3D kustom, serta loader model .glb/.gltf.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';
import { getDefaultSpatial3d } from '../devices/device-schema.js';
import { CABLE_CATEGORIES } from '../connections/cable-library.js';
import {
  createDevice3DMesh,
  create3DLabelSprite,
  create3DRoomGroup,
  loadCustomGlbModel
} from './map-3d-models.js';

export class Map3DEngine {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   */
  constructor({ container, deviceManager, cableManager }) {
    this.container = container;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;

    this.isActive = false;
    this.isInitialized = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Scene Groups
    this.groundGroup = new THREE.Group();
    this.roomsGroup = new THREE.Group();
    this.devicesGroup = new THREE.Group();
    this.cablesGroup = new THREE.Group();
    this.coverageGroup = new THREE.Group();

    // Lookup maps
    this.deviceMeshMap = new Map(); // deviceId -> THREE.Group
    this.cableMeshMap = new Map();  // cableId -> THREE.Mesh
    this.effectivePosMap = new Map(); // deviceId -> THREE.Vector3

    // User view options
    this.deviceScaleMultiplier = 3.0; // Balanced default visibility on campus/building map
    this.explodeStacks = false;
    this.showLabels = true;
    this.showCoverage = true;

    this.animFrameId = null;
    this.resizeObserver = null;
    this.pointerDownScreen = { x: 0, y: 0 };
    this.activeMapUrl = 'assets/maps/campus-map.jpg';
    this.groundTexture = null;

    // SketchUp-style navigation state
    this.navTool = 'orbit'; // 'orbit' | 'pan' | 'zoom' | 'look'
    this.keysPressed = new Set();
    this.lastFrameTime = 0;
    this.cameraAnim = null; // { startPos, endPos, startTarget, endTarget, startTime, duration }
    this.isLookDragging = false;
    this.lookPrevPointer = { x: 0, y: 0 };
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.pendingCableSourceId = null;
    this.dragMoveState = null;

    this.bindGlobalListeners();
  }

  init() {
    if (this.isInitialized || !this.container) return;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.applyThemeColors();

    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.08, 3000);
    this.camera.position.set(0, 140, 160);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // SketchUp-inspired OrbitControls configuration
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.zoomSpeed = 1.25;
    this.controls.panSpeed = 1.05;
    this.controls.rotateSpeed = 0.85;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 1200;
    this.controls.target.set(0, 0, 0);
    this.applyNavToolConfig();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x334155, 1.15);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(120, 220, 140);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    this.scene.add(this.groundGroup);
    this.scene.add(this.roomsGroup);
    this.scene.add(this.coverageGroup);
    this.scene.add(this.devicesGroup);
    this.scene.add(this.cablesGroup);

    // Pointer interaction: Look-Around drag, click raycast, double-click focus-to-point
    const dom = this.renderer.domElement;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointerdown', (e) => {
      if (!this.isActive) return;
      this.cameraAnim = null; // User manual input cancels glide
      this.pointerDownScreen = { x: e.clientX, y: e.clientY };
      this.container.classList.add('is-dragging');

      if (stateManager.getMode() !== 'draw-cable') {
        if (this.navTool === 'look' && e.button === 0) {
          this.isLookDragging = true;
          this.lookPrevPointer = { x: e.clientX, y: e.clientY };
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          this.lookYaw = Math.atan2(dir.x, dir.z);
          this.lookPitch = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
          dom.setPointerCapture?.(e.pointerId);
        } else if (this.navTool === 'move' && e.button === 0) {
          this.startDeviceDragMove(e, dom);
        }
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (!this.isActive) return;
      if (this.dragMoveState) {
        this.updateDeviceDragMove(e);
        return;
      }
      if (!this.isLookDragging) return;
      const dx = e.clientX - this.lookPrevPointer.x;
      const dy = e.clientY - this.lookPrevPointer.y;
      this.lookPrevPointer = { x: e.clientX, y: e.clientY };

      const sensitivity = 0.0042;
      this.lookYaw -= dx * sensitivity;
      this.lookPitch = Math.max(-Math.PI * 0.46, Math.min(Math.PI * 0.46, this.lookPitch + dy * sensitivity));

      const lookDist = Math.max(1, this.camera.position.distanceTo(this.controls.target));
      const newDir = new THREE.Vector3(
        Math.cos(this.lookPitch) * Math.sin(this.lookYaw),
        Math.sin(this.lookPitch),
        Math.cos(this.lookPitch) * Math.cos(this.lookYaw)
      );
      this.controls.target.copy(this.camera.position).addScaledVector(newDir, lookDist);
    });

    const endDrag = (e) => {
      this.container.classList.remove('is-dragging');
      if (this.isLookDragging) {
        this.isLookDragging = false;
        dom.releasePointerCapture?.(e.pointerId);
      }
      if (this.dragMoveState) {
        this.finishDeviceDragMove(e, dom);
      }
    };

    dom.addEventListener('pointerup', (e) => {
      endDrag(e);
      if (!this.isActive) return;
      const dist = Math.hypot(e.clientX - this.pointerDownScreen.x, e.clientY - this.pointerDownScreen.y);
      const maxClickDist = stateManager.getMode() === 'draw-cable' ? 10 : 6;
      if (dist > maxClickDist) return;
      if (e.button === 0) {
        this.handleCanvasClick(e);
      } else if (e.button === 2) {
        this.handleCanvasRightClick(e);
      }
    });

    dom.addEventListener('pointercancel', endDrag);

    // Double-click anywhere in 3D scene to smoothly focus & set orbit pivot (SketchUp feel)
    dom.addEventListener('dblclick', (e) => {
      if (!this.isActive) return;
      this.handleCanvasDoubleClick(e);
    });

    // ResizeObserver throttled cleanly
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.isActive || !this.renderer || !this.camera) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    });
    this.resizeObserver.observe(this.container);

    this.isInitialized = true;
    this.rebuildGround();
  }

  activate() {
    this.init();
    this.isActive = true;
    this.keysPressed.clear();
    this.container.style.display = 'block';
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    this.syncAll();
    this.lastFrameTime = performance.now();
    this.startLoop();
  }

  deactivate() {
    this.isActive = false;
    this.keysPressed.clear();
    this.cameraAnim = null;
    this.isLookDragging = false;
    this.container.style.display = 'none';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  startLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const animate = (now) => {
      if (!this.isActive) return;
      this.animFrameId = requestAnimationFrame(animate);

      const dt = Math.min(0.05, Math.max(0.001, (now - (this.lastFrameTime || now)) / 1000));
      this.lastFrameTime = now;

      this.updateCameraAnimation(now);
      this.updateWalkMovement(dt);
      this.controls?.update();
      this.renderer?.render(this.scene, this.camera);
    };
    this.animFrameId = requestAnimationFrame(animate);
  }

  applyThemeColors() {
    if (!this.scene) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.scene.background = new THREE.Color(isDark ? 0x0b160a : 0xeef5e6);
    this.scene.fog = new THREE.FogExp2(isDark ? 0x0b160a : 0xeef5e6, 0.0011);
  }

  getWorldDimensions() {
    const projectMap = stateManager.getState().project.map;
    const natW = projectMap.naturalWidth || 1024;
    const natH = projectMap.naturalHeight || 1024;
    const worldW = this.cableManager?.mapWidthMeters || 400;
    const worldD = worldW * (natH / natW);
    return { worldW, worldD };
  }

  normToWorld(normX, normY) {
    const { worldW, worldD } = this.getWorldDimensions();
    return {
      x: (normX - 0.5) * worldW,
      z: (normY - 0.5) * worldD
    };
  }

  worldToNorm(worldX, worldZ) {
    const { worldW, worldD } = this.getWorldDimensions();
    return {
      normX: Math.max(0.01, Math.min(0.99, (worldX / worldW) + 0.5)),
      normY: Math.max(0.01, Math.min(0.99, (worldZ / worldD) + 0.5))
    };
  }

  rebuildGround() {
    if (!this.isInitialized) return;
    this.clearGroup(this.groundGroup);

    const { worldW, worldD } = this.getWorldDimensions();

    // Load map texture
    const loader = new THREE.TextureLoader();
    loader.load(
      this.activeMapUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        if (this.groundTexture) this.groundTexture.dispose();
        this.groundTexture = tex;

        const geo = new THREE.PlaneGeometry(worldW, worldD);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.9,
          metalness: 0.02
        });
        const plane = new THREE.Mesh(geo, mat);
        plane.receiveShadow = true;
        this.groundGroup.add(plane);
      },
      undefined,
      () => {
        // Fallback plain floor if image unavailable
        const geo = new THREE.PlaneGeometry(worldW, worldD);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0xdbe6cf, roughness: 0.95 });
        this.groundGroup.add(new THREE.Mesh(geo, mat));
      }
    );

    const gridSize = Math.max(worldW, worldD) * 1.2;
    const grid = new THREE.GridHelper(gridSize, 40, 0x2a7c13, 0x94a3b8);
    grid.position.y = 0.02;
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    this.groundGroup.add(grid);
  }

  syncAll() {
    if (!this.isActive || !this.isInitialized) return;
    this.syncRooms();
    this.syncDevices();
    this.syncCables();
  }

  syncRooms() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.roomsGroup);

    const rooms = stateManager.getRooms3d();
    rooms.forEach((room) => {
      const roomGroup = create3DRoomGroup(room, (nx, ny) => this.normToWorld(nx, ny));
      roomGroup.userData.roomId = room.id;
      this.roomsGroup.add(roomGroup);

      if (room.customModelUrl) {
        const targetSpan = Math.max(room.widthMeters || 10, room.depthMeters || 10);
        loadCustomGlbModel(room.customModelUrl, targetSpan)
          .then((glb) => {
            if (!this.roomsGroup.children.includes(roomGroup)) return;
            roomGroup.add(glb);
          })
          .catch((err) => console.warn('[Map3DEngine] Custom room GLB failed:', err));
      }
    });
  }

  syncDevices() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.devicesGroup);
    this.clearGroup(this.coverageGroup);
    this.deviceMeshMap.clear();
    this.effectivePosMap.clear();

    const devices = this.deviceManager.getAllDevices();
    const basePositions = devices.map((dev) => {
      const p = this.normToWorld(dev.position.x, dev.position.y);
      const elev = dev.spatial3d?.elevationMeters ?? getDefaultSpatial3d(dev.type).elevationMeters;
      return { dev, baseX: p.x, baseZ: p.z, elev };
    });

    // Optional explode offsets for overlapping stacked devices in the same room
    const explodeOffsets = new Map();
    if (this.explodeStacks) {
      const threshold = 5.5 * Math.max(1, this.deviceScaleMultiplier * 0.5);
      const visited = new Set();

      for (let i = 0; i < basePositions.length; i++) {
        if (visited.has(i)) continue;
        const cluster = [i];
        visited.add(i);

        for (let j = i + 1; j < basePositions.length; j++) {
          if (visited.has(j)) continue;
          const dx = basePositions[j].baseX - basePositions[i].baseX;
          const dz = basePositions[j].baseZ - basePositions[i].baseZ;
          if (Math.hypot(dx, dz) <= threshold) {
            cluster.push(j);
            visited.add(j);
          }
        }

        if (cluster.length > 1) {
          const radius = Math.max(4.5, this.deviceScaleMultiplier * 2.2);
          cluster.forEach((idx, k) => {
            const angle = (k / cluster.length) * Math.PI * 2;
            explodeOffsets.set(basePositions[idx].dev.id, {
              dx: Math.cos(angle) * radius,
              dz: Math.sin(angle) * radius,
              dy: k * 1.4
            });
          });
        }
      }
    }

    basePositions.forEach(({ dev, baseX, baseZ, elev }) => {
      const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;
      const offset = explodeOffsets.get(dev.id) || { dx: 0, dy: 0, dz: 0 };
      const finalX = baseX + offset.dx;
      const finalY = Math.max(0, elev + offset.dy);
      const finalZ = baseZ + offset.dz;

      this.effectivePosMap.set(dev.id, new THREE.Vector3(finalX, finalY + 0.35 * this.deviceScaleMultiplier, finalZ));

      const holder = new THREE.Group();
      holder.position.set(finalX, finalY, finalZ);
      holder.userData.deviceId = dev.id;

      const userModelScale = (dev.spatial3d?.modelScale || 1) * this.deviceScaleMultiplier;
      const rotYRad = ((dev.spatial3d?.rotationY || 0) * Math.PI) / 180;

      // Placeholder / Procedural Hardware Mesh
      const modelContainer = new THREE.Group();
      modelContainer.scale.setScalar(userModelScale);
      modelContainer.rotation.y = rotYRad;
      const proceduralMesh = createDevice3DMesh(dev, cat.color, statusDef.color);
      modelContainer.add(proceduralMesh);
      holder.add(modelContainer);

      // Load custom GLB asynchronously if configured
      if (dev.spatial3d?.customModelUrl) {
        loadCustomGlbModel(dev.spatial3d.customModelUrl, 1.3)
          .then((glb) => {
            if (!this.deviceMeshMap.has(dev.id)) return;
            modelContainer.clear();
            modelContainer.add(glb);
            this.tagDescendantDeviceId(glb, dev.id);
          })
          .catch((err) => {
            console.warn(`[Map3DEngine] Custom 3D model load failed for ${dev.name}:`, err);
          });
      }

      // Vertical Elevation Pole down to ground (helps read Z stacking!)
      if (finalY > 0.15) {
        const stemGeo = new THREE.CylinderGeometry(0.05 * Math.max(1, this.deviceScaleMultiplier * 0.4), 0.05 * Math.max(1, this.deviceScaleMultiplier * 0.4), finalY, 8);
        const stemMat = new THREE.MeshBasicMaterial({
          color: cat.color,
          transparent: true,
          opacity: 0.45
        });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(0, -finalY / 2, 0);
        holder.add(stem);

        // Floor footprint dot
        const footprint = new THREE.Mesh(
          new THREE.RingGeometry(0.35, 0.55, 16),
          new THREE.MeshBasicMaterial({ color: cat.color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
        );
        footprint.rotation.x = -Math.PI / 2;
        footprint.position.set(0, -finalY + 0.05, 0);
        holder.add(footprint);
      }

      // Selection Highlight Ring
      if (this.deviceManager.selectedDeviceId === dev.id) {
        const selRing = new THREE.Mesh(
          new THREE.RingGeometry(0.95 * userModelScale, 1.18 * userModelScale, 28),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
        );
        selRing.rotation.x = -Math.PI / 2;
        selRing.position.y = 0.04;
        holder.add(selRing);
      }

      // Active Cable Source Ring (when drawing cable in 3D)
      if (stateManager.getMode() === 'draw-cable' && this.pendingCableSourceId === dev.id) {
        const srcRing = new THREE.Mesh(
          new THREE.RingGeometry(1.25 * userModelScale, 1.52 * userModelScale, 32),
          new THREE.MeshBasicMaterial({ color: 0x0ea5e9, side: THREE.DoubleSide })
        );
        srcRing.rotation.x = -Math.PI / 2;
        srcRing.position.y = 0.06;
        holder.add(srcRing);
      }

      // Floating Label Sprite
      if (this.showLabels) {
        const label = create3DLabelSprite(dev, elev);
        const labelScaleFactor = Math.max(0.75, Math.min(1.6, this.deviceScaleMultiplier * 0.42));
        label.scale.multiplyScalar(labelScaleFactor);
        label.position.set(0, 1.15 * userModelScale + 0.8, 0);
        holder.add(label);
      }

      this.tagDescendantDeviceId(holder, dev.id);
      this.devicesGroup.add(holder);
      this.deviceMeshMap.set(dev.id, holder);

      // Wireless Coverage 3D Volume (Dome + Ground Footprint)
      if (this.showCoverage && dev.wirelessCoverage?.enabled) {
        const covRadius = Math.max(2, Number(dev.wirelessCoverage.radiusMeters) || 25);
        const covColor = dev.wirelessCoverage.color || '#76c457';
        const covOpacity = typeof dev.wirelessCoverage.opacity === 'number' ? dev.wirelessCoverage.opacity : 0.16;

        const discGeo = new THREE.CircleGeometry(covRadius, 40);
        discGeo.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshBasicMaterial({
          color: covColor,
          transparent: true,
          opacity: covOpacity * 0.85,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(baseX, 0.06, baseZ);
        this.coverageGroup.add(disc);

        const ringGeo = new THREE.RingGeometry(covRadius - 0.35, covRadius, 48);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: covColor,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(baseX, 0.08, baseZ);
        this.coverageGroup.add(ring);
      }
    });
  }

  syncCables() {
    if (!this.isActive || !this.isInitialized) return;
    if (this.effectivePosMap.size === 0 && this.deviceManager.getAllDevices().length > 0) {
      this.syncDevices();
    }
    this.clearGroup(this.cablesGroup);
    this.cableMeshMap.clear();

    const { worldW } = this.getWorldDimensions();
    const mapScaleFactor = Math.max(0.55, Math.min(2.4, worldW / 180));
    const cables = this.cableManager.getAllConnections();

    cables.forEach((cable) => {
      const srcPos = this.effectivePosMap.get(cable.source);
      const dstPos = this.effectivePosMap.get(cable.destination);
      if (!srcPos || !dstPos) return;

      const catDef = CABLE_CATEGORIES[cable.cableCategory] || CABLE_CATEGORIES['cat6'];
      const color = cable.customColor || catDef?.color || '#3b82f6';
      const isSelected = this.cableManager.selectedCableId === cable.id;
      const isWireless = cable.type === 'wireless' || cable.cableCategory === 'wireless-ptp';

      const pts = [srcPos.clone()];
      if (Array.isArray(cable.route) && cable.route.length > 0) {
        const trayY = Math.max(0.45, Math.min(srcPos.y, dstPos.y, 0.85));
        cable.route.forEach((wp) => {
          const wpWorld = this.normToWorld(wp.x, wp.y);
          pts.push(new THREE.Vector3(wpWorld.x, trayY, wpWorld.z));
        });
      } else if (!isWireless && srcPos.distanceTo(dstPos) > 1.5) {
        // Gentle mid-arc above floor so cables never sink into ground plane
        const mid = srcPos.clone().add(dstPos).multiplyScalar(0.5);
        mid.y = Math.max(0.45, Math.min(srcPos.y, dstPos.y) - 0.1);
        pts.push(mid);
      }
      pts.push(dstPos.clone());

      // Ensure unique adjacent points for CatmullRomCurve3
      const cleanPts = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].distanceToSquared(cleanPts[cleanPts.length - 1]) > 0.001) {
          cleanPts.push(pts[i]);
        }
      }
      if (cleanPts.length < 2) {
        cleanPts.push(dstPos.clone().add(new THREE.Vector3(0.15, 0.2, 0.15)));
      }

      const curve = new THREE.CatmullRomCurve3(cleanPts, false, 'catmullrom', 0.25);
      const baseRadius = isSelected ? 0.34 : 0.22;
      const radius = baseRadius * Math.max(0.85, this.deviceScaleMultiplier * 0.42) * mapScaleFactor;
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(20, cleanPts.length * 12), radius, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: isSelected ? '#facc15' : color,
        emissive: isSelected ? '#eab308' : color,
        emissiveIntensity: isSelected ? 0.7 : (isWireless ? 0.55 : 0.32),
        roughness: 0.3,
        transparent: isWireless,
        opacity: isWireless ? 0.72 : 1.0
      });

      const mesh = new THREE.Mesh(tubeGeo, tubeMat);
      mesh.userData.cableId = cable.id;
      mesh.castShadow = !isWireless;
      this.cablesGroup.add(mesh);
      this.cableMeshMap.set(cable.id, mesh);
    });
  }

  tagDescendantDeviceId(obj, deviceId) {
    obj.traverse((child) => {
      child.userData.deviceId = deviceId;
    });
  }

  findDeviceIdFromObject(obj) {
    let cur = obj;
    while (cur && cur !== this.devicesGroup) {
      if (cur.userData?.deviceId) return cur.userData.deviceId;
      cur = cur.parent;
    }
    return null;
  }

  handleCanvasClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 1. Prioritize Device selection (or 3D cable drawing when mode === 'draw-cable')
    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length > 0) {
      const devId = this.findDeviceIdFromObject(devHits[0].object);
      if (devId) {
        if (stateManager.getMode() === 'draw-cable') {
          if (!this.pendingCableSourceId) {
            this.pendingCableSourceId = devId;
            this.deviceManager.selectDevice(devId);
            const srcDev = this.deviceManager.getDeviceById(devId);
            this.showStatusHint(`🔌 Sumber kabel 3D: "${srcDev?.name || devId}". Klik perangkat tujuan untuk menghubungkan.`);
            return;
          }
          if (this.pendingCableSourceId === devId) {
            this.showStatusHint('⚠️ Perangkat tujuan tidak boleh sama dengan perangkat sumber.');
            return;
          }
          const srcDev = this.deviceManager.getDeviceById(this.pendingCableSourceId);
          const dstDev = this.deviceManager.getDeviceById(devId);
          const newCab = this.cableManager.addConnection({
            name: `Link ${srcDev?.name || 'Source'} ➔ ${dstDev?.name || 'Dest'}`,
            source: this.pendingCableSourceId,
            destination: devId,
            type: 'ethernet',
            cableCategory: 'cat6',
            route: [],
            status: 'active'
          });
          this.pendingCableSourceId = null;
          stateManager.setMode('select');
          if (newCab) {
            this.cableManager.selectConnection(newCab.id);
            this.syncCables();
            this.showStatusHint(`✅ Kabel terhubung: "${newCab.name}"`);
          }
          return;
        }
        this.deviceManager.selectDevice(devId);
        return;
      }
    }

    // 2. Check Cable selection
    const cableHits = this.raycaster.intersectObjects(this.cablesGroup.children, true);
    if (cableHits.length > 0) {
      const cabId = cableHits[0].object.userData?.cableId;
      if (cabId) {
        this.cableManager.selectConnection(cabId);
        return;
      }
    }

    // 3. Deselect on empty ground click (or cancel pending cable source)
    this.pendingCableSourceId = null;
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();
  }

  handleCanvasRightClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 1. Right-click on 3D Device -> Device Context Menu
    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length > 0) {
      const devId = this.findDeviceIdFromObject(devHits[0].object);
      const device = devId ? this.deviceManager.getDeviceById(devId) : null;
      if (device) {
        eventBus.emit('contextmenu:device', {
          device,
          screenX: e.clientX,
          screenY: e.clientY
        });
        return;
      }
    }

    // 2. Right-click on 3D Cable -> Cable Context Menu
    const cableHits = this.raycaster.intersectObjects(this.cablesGroup.children, true);
    if (cableHits.length > 0) {
      const cabId = cableHits[0].object.userData?.cableId;
      const cable = cabId ? this.cableManager.getConnectionById(cabId) : null;
      if (cable) {
        eventBus.emit('contextmenu:cable', {
          cable,
          screenX: e.clientX,
          screenY: e.clientY
        });
        return;
      }
    }

    // 3. Right-click on Room / Ground -> Canvas Context Menu with converted 2D norm coords
    const envHits = this.raycaster.intersectObjects(
      [...this.roomsGroup.children, ...this.groundGroup.children],
      true
    );
    let hitPoint = envHits.length > 0 ? envHits[0].point : null;
    if (!hitPoint) {
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(floorPlane, intersectPt)) {
        hitPoint = intersectPt;
      }
    }

    const { normX, normY } = hitPoint
      ? this.worldToNorm(hitPoint.x, hitPoint.z)
      : { normX: 0.5, normY: 0.5 };

    eventBus.emit('contextmenu:canvas', {
      normX,
      normY,
      screenX: e.clientX,
      screenY: e.clientY
    });
  }

  handleCanvasDoubleClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Priority: Device -> Room -> Ground -> Math floor plane
    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length > 0) {
      const devId = devHits[0].object.userData?.deviceId;
      if (devId) {
        this.deviceManager.selectDevice(devId);
        this.focusOnDevice(devId);
        return;
      }
    }

    const envHits = this.raycaster.intersectObjects(
      [...this.roomsGroup.children, ...this.groundGroup.children],
      true
    );
    let hitPoint = envHits.length > 0 ? envHits[0].point.clone() : null;
    if (!hitPoint) {
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(floorPlane, intersectPt)) {
        hitPoint = intersectPt;
      }
    }
    if (!hitPoint) return;

    const currentDist = this.camera.position.distanceTo(this.controls.target);
    const desiredDist = Math.max(4, Math.min(currentDist * 0.55, 36));
    const offset = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(desiredDist);
    const endPos = hitPoint.clone().add(offset);
    endPos.y = Math.max(0.6, endPos.y);
    this.animateCameraTo(endPos, hitPoint, 380);
  }

  setNavTool(tool) {
    const validTools = ['orbit', 'pan', 'zoom', 'look', 'move'];
    if (!validTools.includes(tool)) return;
    this.navTool = tool;
    this.applyNavToolConfig();
    eventBus.emit('map3d:navtool-changed', { tool });
  }

  applyNavToolConfig() {
    if (this.container) {
      this.container.classList.remove('tool-orbit', 'tool-pan', 'tool-zoom', 'tool-look', 'tool-move');
      this.container.classList.add(`tool-${this.navTool}`);
    }
    if (!this.controls) return;

    if (this.navTool === 'move') {
      this.controls.mouseButtons = {
        LEFT: -1, // Dragging a 3D device moves it on horizontal X/Y plane
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    } else if (this.navTool === 'pan') {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    } else if (this.navTool === 'zoom') {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.DOLLY,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    } else if (this.navTool === 'look') {
      this.controls.mouseButtons = {
        LEFT: -1, // Custom in-place eye look handler
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.92;
    } else {
      // 'orbit' — SketchUp style (Middle/Left=Orbit, Shift+Drag/Right=Pan, Wheel=Zoom to Cursor)
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    }
  }

  startDeviceDragMove(e, dom) {
    const rect = dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length === 0) return;

    const devId = devHits[0].object.userData?.deviceId;
    const device = devId ? this.deviceManager.getDeviceById(devId) : null;
    if (!device) return;

    const meshGroup = this.deviceMeshMap.get(devId);
    const devWorld = this.normToWorld(device.position.x, device.position.y);
    const planeY = meshGroup ? meshGroup.position.y : 0;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);

    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(dragPlane, hitPt)) return;

    const meshOffsetX = meshGroup ? (meshGroup.position.x - devWorld.x) : 0;
    const meshOffsetZ = meshGroup ? (meshGroup.position.z - devWorld.z) : 0;

    this.dragMoveState = {
      deviceId: devId,
      plane: dragPlane,
      grabOffsetX: devWorld.x - hitPt.x,
      grabOffsetZ: devWorld.z - hitPt.z,
      meshOffsetX,
      meshOffsetZ,
      latestNorm: null
    };

    this.deviceManager.selectDevice(devId);
    dom.setPointerCapture?.(e.pointerId);
  }

  updateDeviceDragMove(e) {
    if (!this.dragMoveState) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragMoveState.plane, hitPt)) return;

    const newWorldX = hitPt.x + this.dragMoveState.grabOffsetX;
    const newWorldZ = hitPt.z + this.dragMoveState.grabOffsetZ;
    const { normX, normY } = this.worldToNorm(newWorldX, newWorldZ);
    const clampedWorld = this.normToWorld(normX, normY);

    const meshGroup = this.deviceMeshMap.get(this.dragMoveState.deviceId);
    if (meshGroup) {
      meshGroup.position.x = clampedWorld.x + this.dragMoveState.meshOffsetX;
      meshGroup.position.z = clampedWorld.z + this.dragMoveState.meshOffsetZ;

      const prevEff = this.effectivePosMap.get(this.dragMoveState.deviceId);
      const effY = prevEff ? prevEff.y : meshGroup.position.y;
      this.effectivePosMap.set(
        this.dragMoveState.deviceId,
        new THREE.Vector3(meshGroup.position.x, effY, meshGroup.position.z)
      );
      this.syncCables();
    }

    this.dragMoveState.latestNorm = { x: normX, y: normY };
  }

  finishDeviceDragMove(e, dom) {
    const state = this.dragMoveState;
    this.dragMoveState = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (state?.latestNorm) {
      this.deviceManager.updateDevice(state.deviceId, { position: state.latestNorm });
    }
  }

  animateCameraTo(endPos, endTarget, duration = 380) {
    if (!this.camera || !this.controls) return;
    this.cameraAnim = {
      startPos: this.camera.position.clone(),
      endPos: endPos.clone(),
      startTarget: this.controls.target.clone(),
      endTarget: endTarget.clone(),
      startTime: performance.now(),
      duration
    };
  }

  updateCameraAnimation(now) {
    if (!this.cameraAnim || !this.camera || !this.controls) return;
    const elapsed = now - this.cameraAnim.startTime;
    const t = Math.min(1, elapsed / Math.max(1, this.cameraAnim.duration));
    // Smooth easeOutCubic
    const ease = 1 - Math.pow(1 - t, 3);
    this.camera.position.lerpVectors(this.cameraAnim.startPos, this.cameraAnim.endPos, ease);
    this.controls.target.lerpVectors(this.cameraAnim.startTarget, this.cameraAnim.endTarget, ease);
    if (t >= 1) {
      this.cameraAnim = null;
    }
  }

  updateWalkMovement(dt) {
    if (!this.keysPressed.size || !this.camera || !this.controls) return;

    let forward = 0;
    let right = 0;
    let up = 0;

    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) forward += 1;
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) forward -= 1;
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) right += 1;
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) right -= 1;
    if (this.keysPressed.has('e') || this.keysPressed.has('pageup')) up += 1;
    if (this.keysPressed.has('q') || this.keysPressed.has('pagedown')) up -= 1;

    if (forward === 0 && right === 0 && up === 0) return;
    this.cameraAnim = null;

    // Adaptive walk speed: slow & precise inside a control room, faster on wide campus
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const boost = this.keysPressed.has('shift') ? 2.6 : 1.0;
    const speed = Math.max(3.5, Math.min(90, camDist * 0.75)) * boost * dt;

    const viewDir = new THREE.Vector3();
    this.camera.getWorldDirection(viewDir);
    viewDir.y = 0;
    if (viewDir.lengthSq() > 0.0001) viewDir.normalize();

    const rightDir = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize();
    const moveVec = new THREE.Vector3()
      .addScaledVector(viewDir, forward * speed)
      .addScaledVector(rightDir, right * speed);
    moveVec.y = up * speed * 0.65;

    // Keep camera safely above ground floor
    if (this.camera.position.y + moveVec.y < 0.25) {
      moveVec.y = Math.max(0, 0.25 - this.camera.position.y);
    }

    this.camera.position.add(moveVec);
    this.controls.target.add(moveVec);
  }

  zoomExtents() {
    if (!this.camera || !this.controls) return;
    const box = new THREE.Box3();
    if (this.devicesGroup.children.length > 0) box.expandByObject(this.devicesGroup);
    if (this.roomsGroup.children.length > 0) box.expandByObject(this.roomsGroup);

    if (box.isEmpty()) {
      const { worldW } = this.getWorldDimensions();
      const span = Math.max(40, worldW * 0.5);
      this.animateCameraTo(
        new THREE.Vector3(span * 0.72, span * 0.68, span * 0.85),
        new THREE.Vector3(0, 0, 0),
        420
      );
      return;
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 8);
    const dist = maxDim * 1.15;
    const endPos = new THREE.Vector3(center.x + dist * 0.68, center.y + dist * 0.62, center.z + dist * 0.82);
    this.animateCameraTo(endPos, center, 420);
  }

  setCameraPreset(preset) {
    if (!this.camera || !this.controls) return;
    if (preset === 'extents') {
      this.zoomExtents();
      return;
    }

    const { worldW } = this.getWorldDimensions();
    const span = Math.max(40, worldW * 0.45);

    if (preset === 'focus') {
      const selDevId = this.deviceManager.selectedDeviceId;
      if (selDevId && this.effectivePosMap.has(selDevId)) {
        this.focusOnDevice(selDevId);
        return;
      }
      const rooms = stateManager.getRooms3d();
      if (rooms.length > 0) {
        const rp = this.normToWorld(rooms[0].x ?? 0.5, rooms[0].y ?? 0.5);
        this.animateCameraTo(
          new THREE.Vector3(rp.x + 12, 8.5, rp.z + 12),
          new THREE.Vector3(rp.x, 1.8, rp.z),
          380
        );
        return;
      }
    }

    const target = new THREE.Vector3(0, 0, 0);
    let pos;
    if (preset === 'top') {
      pos = new THREE.Vector3(0, span * 1.45, 0.5);
    } else if (preset === 'front') {
      pos = new THREE.Vector3(0, span * 0.16, span * 1.05);
    } else if (preset === 'side') {
      pos = new THREE.Vector3(span * 1.05, span * 0.18, 0);
    } else {
      pos = new THREE.Vector3(span * 0.72, span * 0.68, span * 0.85);
    }
    this.animateCameraTo(pos, target, 400);
  }

  focusOnDevice(deviceId) {
    if (!this.isActive || !this.effectivePosMap.has(deviceId)) return;
    const p = this.effectivePosMap.get(deviceId);
    const offsetDist = Math.max(4.5, Math.min(14, this.deviceScaleMultiplier * 3.5));
    const endPos = new THREE.Vector3(p.x + offsetDist, p.y + offsetDist * 0.72, p.z + offsetDist);
    this.animateCameraTo(endPos, p, 360);
  }

  setDeviceScaleMultiplier(scaleVal) {
    this.deviceScaleMultiplier = Number(scaleVal) || 3.0;
    if (this.isActive) {
      this.syncDevices();
      this.syncCables();
    }
  }

  setExplodeStacks(enabled) {
    this.explodeStacks = Boolean(enabled);
    if (this.isActive) {
      this.syncDevices();
      this.syncCables();
    }
  }

  setShowLabels(enabled) {
    this.showLabels = Boolean(enabled);
    if (this.isActive) {
      this.syncDevices();
    }
  }

  setShowCoverage(enabled) {
    this.showCoverage = Boolean(enabled);
    if (this.isActive) {
      this.syncDevices();
    }
  }

  clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if (m.map && m.map !== this.groundTexture) m.map.dispose();
              m.dispose();
            });
          } else {
            if (obj.material.map && obj.material.map !== this.groundTexture) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
    }
  }

  showStatusHint(message) {
    const statusHint = document.querySelector('#app-status-bar .status-item:last-child');
    if (statusHint) {
      statusHint.innerHTML = `<span style="color: var(--accent-blue); font-weight: 600;">${message}</span>`;
    }
  }

  bindGlobalListeners() {
    const syncDevAndCables = () => {
      if (!this.isActive) return;
      this.syncDevices();
      this.syncCables();
    };

    eventBus.on('device:added', syncDevAndCables);
    eventBus.on('device:updated', syncDevAndCables);
    eventBus.on('device:deleted', syncDevAndCables);
    eventBus.on('device:moved', syncDevAndCables);
    eventBus.on('device:selected', syncDevAndCables);
    eventBus.on('device:deselected', syncDevAndCables);

    const syncCablesOnly = () => {
      if (!this.isActive) return;
      this.syncCables();
    };

    eventBus.on('connection:added', syncCablesOnly);
    eventBus.on('connection:updated', syncCablesOnly);
    eventBus.on('connection:deleted', syncCablesOnly);
    eventBus.on('connection:selected', syncCablesOnly);
    eventBus.on('connection:deselected', syncCablesOnly);

    eventBus.on('room3d:changed', () => {
      if (this.isActive) this.syncRooms();
    });

    eventBus.on('map:scale-changed', () => {
      if (this.isInitialized) {
        this.rebuildGround();
        if (this.isActive) this.syncAll();
      }
    });

    eventBus.on('map:image-changed', ({ src }) => {
      if (src) {
        this.activeMapUrl = src;
        if (this.isInitialized) this.rebuildGround();
      }
    });

    eventBus.on('theme:changed', () => {
      this.applyThemeColors();
    });

    eventBus.on('mode:changed', ({ mode }) => {
      if (this.container) {
        this.container.classList.toggle('mode-draw-cable', mode === 'draw-cable');
      }
      if (mode !== 'draw-cable') {
        this.pendingCableSourceId = null;
        if (this.isActive) this.syncDevices();
      }
    });

    eventBus.on('map3d:start-cable', ({ deviceId }) => {
      this.pendingCableSourceId = deviceId || null;
      if (this.isActive) this.syncDevices();
    });

    eventBus.on('map3d:zoom-extents', () => {
      if (this.isActive) this.zoomExtents();
    });

    eventBus.on('map3d:set-navtool', ({ tool }) => {
      if (tool) this.setNavTool(tool);
    });

    // Keyboard state tracking for smooth WASD/QE SketchUp-style walk/fly in 3D mode
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      this.keysPressed.add(e.key.toLowerCase());
      if (e.shiftKey) this.keysPressed.add('shift');
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.key.toLowerCase());
      if (!e.shiftKey) this.keysPressed.delete('shift');
    });

    window.addEventListener('blur', () => {
      this.keysPressed.clear();
    });
  }
}
