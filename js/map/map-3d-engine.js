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

    this.bindGlobalListeners();
  }

  init() {
    if (this.isInitialized || !this.container) return;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.applyThemeColors();

    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 2500);
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 900;
    this.controls.target.set(0, 0, 0);

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

    // Pointer click raycasting (ignore drags)
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.pointerDownScreen = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (!this.isActive) return;
      const dist = Math.hypot(e.clientX - this.pointerDownScreen.x, e.clientY - this.pointerDownScreen.y);
      if (dist > 5) return; // Ignore orbit/pan drag
      if (e.button === 0) {
        this.handleCanvasClick(e);
      }
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
    this.container.style.display = 'block';
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    this.syncAll();
    this.startLoop();
  }

  deactivate() {
    this.isActive = false;
    this.container.style.display = 'none';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  startLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const animate = () => {
      if (!this.isActive) return;
      this.animFrameId = requestAnimationFrame(animate);
      this.controls?.update();
      this.renderer?.render(this.scene, this.camera);
    };
    animate();
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
    this.clearGroup(this.cablesGroup);
    this.cableMeshMap.clear();

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
        const trayY = Math.min(srcPos.y, dstPos.y, 0.45);
        cable.route.forEach((wp) => {
          const wpWorld = this.normToWorld(wp.x, wp.y);
          pts.push(new THREE.Vector3(wpWorld.x, Math.max(0.25, trayY), wpWorld.z));
        });
      } else if (!isWireless && srcPos.distanceTo(dstPos) > 1.5) {
        // Gentle mid-arc sag/tray curve so close cables inside a room are visually distinct
        const mid = srcPos.clone().add(dstPos).multiplyScalar(0.5);
        mid.y = Math.max(0.2, Math.min(srcPos.y, dstPos.y) - 0.15);
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
        cleanPts.push(dstPos.clone().add(new THREE.Vector3(0.05, 0.1, 0.05)));
      }

      const curve = new THREE.CatmullRomCurve3(cleanPts, false, 'catmullrom', 0.25);
      const radius = (isSelected ? 0.24 : 0.14) * Math.max(0.7, this.deviceScaleMultiplier * 0.45);
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(16, cleanPts.length * 10), radius, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: isSelected ? '#facc15' : color,
        emissive: isSelected ? '#ca8a04' : color,
        emissiveIntensity: isSelected ? 0.5 : (isWireless ? 0.45 : 0.18),
        roughness: 0.35,
        transparent: isWireless,
        opacity: isWireless ? 0.65 : 1.0
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

  handleCanvasClick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 1. Prioritize Device selection
    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length > 0) {
      const devId = devHits[0].object.userData?.deviceId;
      if (devId) {
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

    // 3. Deselect on empty ground click
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();
  }

  setCameraPreset(preset) {
    if (!this.camera || !this.controls) return;
    const { worldW } = this.getWorldDimensions();
    const span = Math.max(40, worldW * 0.45);

    if (preset === 'focus') {
      const selDevId = this.deviceManager.selectedDeviceId;
      if (selDevId && this.effectivePosMap.has(selDevId)) {
        const targetPos = this.effectivePosMap.get(selDevId);
        this.controls.target.copy(targetPos);
        this.camera.position.set(targetPos.x + 14, targetPos.y + 10, targetPos.z + 14);
        this.controls.update();
        return;
      }
      const rooms = stateManager.getRooms3d();
      if (rooms.length > 0) {
        const rp = this.normToWorld(rooms[0].x ?? 0.5, rooms[0].y ?? 0.5);
        this.controls.target.set(rp.x, 2, rp.z);
        this.camera.position.set(rp.x + 18, 14, rp.z + 18);
        this.controls.update();
        return;
      }
    }

    this.controls.target.set(0, 0, 0);
    if (preset === 'top') {
      this.camera.position.set(0, span * 1.45, 0.5);
    } else if (preset === 'side') {
      this.camera.position.set(0, span * 0.18, span * 1.15);
    } else {
      // 'iso' default
      this.camera.position.set(span * 0.72, span * 0.68, span * 0.85);
    }
    this.controls.update();
  }

  focusOnDevice(deviceId) {
    if (!this.isActive || !this.effectivePosMap.has(deviceId)) return;
    const p = this.effectivePosMap.get(deviceId);
    this.controls.target.copy(p);
    this.camera.position.set(p.x + 12, p.y + 9, p.z + 12);
    this.controls.update();
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
  }
}
