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
import { getDefaultSpatial3d, getDefaultDevicePorts } from '../devices/device-schema.js';
import { CABLE_CATEGORIES } from '../connections/cable-library.js';
import {
  createDevice3DMesh,
  create3DLabelSprite,
  create3DRoomGroup,
  createCustomObject3DGroup,
  OBJECT3D_PRESETS,
  loadCustomGlbModel,
  create3DPortsSubGroup
} from './map-3d-models.js';
import { clamp, generateId } from '../utils/helpers.js';
import { CAMPUS_MAP_DATA_URL } from './campus-map-data.js';

export class Map3DEngine {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   */
  constructor({ container, mapEngine = null, deviceManager, cableManager }) {
    this.container = container;
    this.mapEngine = mapEngine;
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
    this.objects3dGroup = new THREE.Group();
    this.devicesGroup = new THREE.Group();
    this.cablesGroup = new THREE.Group();
    this.coverageGroup = new THREE.Group();

    // Lookup maps
    this.deviceMeshMap = new Map(); // deviceId -> THREE.Group
    this.object3dMeshMap = new Map(); // object3dId -> THREE.Group
    this.cableMeshMap = new Map();  // cableId -> THREE.Mesh
    this.effectivePosMap = new Map(); // deviceId -> THREE.Vector3
    this.portWorldPosMap = new Map(); // "${deviceId}::${portName}" -> THREE.Vector3
    this.portWorldDirMap = new Map(); // "${deviceId}::${portName}" -> THREE.Vector3 (outward normal)

    // User view options
    this.deviceScaleMultiplier = 3.0; // Balanced default visibility on campus/building map
    this.cableDiameterMultiplier = 1.0; // 1.0 = matched to 3D port socket size
    this.explodeStacks = false;
    this.showLabels = true;
    this.showCoverage = true;

    this.animFrameId = null;
    this.resizeObserver = null;
    this.pointerDownScreen = { x: 0, y: 0 };
    this.activeMapUrl = 'assets/maps/campus-map.jpg';
    this.activeMapImage = null;
    this.groundTexture = null;

    // SketchUp-style navigation state
    this.navTool = 'orbit'; // 'orbit' | 'pan' | 'zoom' | 'look' | 'move' | 'box' | 'draw3d'
    this.keysPressed = new Set();
    this.lastFrameTime = 0;
    this.cameraAnim = null; // { startPos, endPos, startTarget, endTarget, startTime, duration }
    this.isLookDragging = false;
    this.lookPrevPointer = { x: 0, y: 0 };
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.pendingCableSourceId = null;
    this.pending3dWaypoints = [];
    this.pen3dPathStyle = 'curve';
    this.pen3dCategory = 'cat6';
    this.dragMoveState = null;
    this.boxSelectState = null;
    this.activeDraw3dTemplate = { ...OBJECT3D_PRESETS.pole };
    this.object3dDragState = null;
    this._marqueeEl = null;
    this._temporarilyDisabledControlsForBox = false;
    this._pendingSyncRaf = null;

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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    this.scene.add(this.objects3dGroup);
    this.scene.add(this.coverageGroup);
    this.scene.add(this.devicesGroup);
    this.scene.add(this.cablesGroup);

    // Pointer interaction: Look-Around drag, Box/Marquee select, SketchUp Gizmo/Draw3D, click raycast
    const dom = this.renderer.domElement;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // Capture-phase guard so Box Select, Draw 3D, or Push/Pull Gizmos intercept before OrbitControls starts orbiting/panning
    dom.addEventListener('pointerdown', (e) => {
      if (!this.isActive) return;
      if (stateManager.getMode() !== 'draw-cable' && e.button === 0) {
        const shouldBlockOrbit =
          this.navTool === 'box' ||
          this.navTool === 'draw3d' ||
          e.ctrlKey ||
          e.metaKey ||
          Boolean(this.checkGizmoHitAtEvent(e));
        if (shouldBlockOrbit && this.controls && this.controls.enabled) {
          this.controls.enabled = false;
          this._temporarilyDisabledControlsForBox = true;
        }
      }
    }, { capture: true });

    dom.addEventListener('pointerdown', (e) => {
      if (!this.isActive) return;
      this.cameraAnim = null; // User manual input cancels glide
      this.pointerDownScreen = { x: e.clientX, y: e.clientY };
      this.container.classList.add('is-dragging');

      if (stateManager.getMode() !== 'draw-cable' && e.button === 0) {
        const gizmoHit = this.checkGizmoHitAtEvent(e);
        if (gizmoHit) {
          this.startObject3dGizmoDrag(e, dom, gizmoHit);
        } else if (this.navTool === 'box' || e.ctrlKey || e.metaKey) {
          this.startBoxSelect(e, dom);
        } else if (this.navTool === 'draw3d') {
          this.startObject3dCreateDraw(e, dom);
        } else if (this.navTool === 'look') {
          this.isLookDragging = true;
          this.lookPrevPointer = { x: e.clientX, y: e.clientY };
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          this.lookYaw = Math.atan2(dir.x, dir.z);
          this.lookPitch = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
          dom.setPointerCapture?.(e.pointerId);
        } else if (this.navTool === 'move') {
          this.startDeviceDragMove(e, dom);
        }
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (!this.isActive) return;
      if (this.object3dDragState) {
        this.updateObject3dDrag(e);
        return;
      }
      if (this.boxSelectState) {
        this.updateBoxSelect(e);
        return;
      }
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
      if (this._temporarilyDisabledControlsForBox) {
        this._temporarilyDisabledControlsForBox = false;
        if (this.controls) this.controls.enabled = true;
      }
      if (this.object3dDragState) {
        this.finishObject3dDrag(e, dom);
      }
      if (this.boxSelectState) {
        this.finishBoxSelect(e, dom);
      }
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
      if (this._suppressNextClick) {
        this._suppressNextClick = false;
        return;
      }
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
    if (!this.groundTexture) {
      this.rebuildGround();
    }
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
    this.scene.fog = new THREE.FogExp2(isDark ? 0x0b160a : 0xeef5e6, 0.00035);
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

    const applyGroundTexture = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
      tex.anisotropy = Math.min(8, maxAniso);
      tex.needsUpdate = true;
      if (this.groundTexture && this.groundTexture !== tex) {
        this.groundTexture.dispose();
      }
      this.groundTexture = tex;

      const geo = new THREE.PlaneGeometry(worldW, worldD);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.92,
        metalness: 0.0
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.receiveShadow = true;
      this.groundGroup.add(plane);
    };

    const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';
    const isSafeDataOrBlob = typeof this.activeMapUrl === 'string' &&
      (this.activeMapUrl.startsWith('data:') || this.activeMapUrl.startsWith('blob:'));
    const cachedImg = this.activeMapImage || this.mapEngine?.bgImageNode?.image?.();

    const loadImgUrl = (url) => {
      const img = new Image();
      img.onload = () => {
        if (!this.isInitialized) return;
        this.activeMapImage = img;
        applyGroundTexture(new THREE.Texture(img));
      };
      img.onerror = (err) => {
        console.warn('[Map3DEngine] Failed to load 3D ground map image:', url, err);
        const geo = new THREE.PlaneGeometry(worldW, worldD);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0xdbe6cf, roughness: 0.95 });
        this.groundGroup.add(new THREE.Mesh(geo, mat));
      };
      img.src = url;
    };

    if (isFileProtocol && !isSafeDataOrBlob) {
      // On file:// protocol, external file paths taint WebGL2 texSubImage2D; use embedded data URL
      loadImgUrl(CAMPUS_MAP_DATA_URL);
    } else if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      applyGroundTexture(new THREE.Texture(cachedImg));
    } else {
      loadImgUrl(this.activeMapUrl);
    }

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
    this.syncObjects3d();
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

  syncObjects3d() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.objects3dGroup);
    this.object3dMeshMap.clear();

    const objects = stateManager.getObjects3d();
    const selectedId = stateManager.getSelectedObject3dId();
    objects.forEach((obj) => {
      const meshGroup = createCustomObject3DGroup(
        obj,
        (nx, ny) => this.normToWorld(nx, ny),
        obj.id === selectedId
      );
      this.objects3dGroup.add(meshGroup);
      this.object3dMeshMap.set(obj.id, meshGroup);
    });
  }

  rebuildSingleObject3dMesh(obj, isSelected = true) {
    if (!this.isInitialized || !obj?.id) return;
    const prev = this.object3dMeshMap.get(obj.id);
    if (prev) {
      this.objects3dGroup.remove(prev);
      prev.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    const next = createCustomObject3DGroup(obj, (nx, ny) => this.normToWorld(nx, ny), isSelected);
    this.objects3dGroup.add(next);
    this.object3dMeshMap.set(obj.id, next);
    return next;
  }

  syncDevices() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.devicesGroup);
    this.clearGroup(this.coverageGroup);
    this.deviceMeshMap.clear();
    this.effectivePosMap.clear();
    this.portWorldPosMap.clear();
    this.portWorldDirMap.clear();

    const devices = this.deviceManager.getAllDevices();
    const allCables = this.cableManager.getAllConnections();
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
      holder.visible = dev.layerVisible !== false;
      holder.userData.deviceId = dev.id;

      const userModelScale = (dev.spatial3d?.modelScale || 1) * this.deviceScaleMultiplier;
      const rotYRad = ((dev.spatial3d?.rotationY || 0) * Math.PI) / 180;

      // Resolve device ports and auto-upgrade legacy procedural ports if a specific model/GLB preset exists
      const modelDefaults = getDefaultDevicePorts(dev.type, dev.model, dev.spatial3d?.customModelUrl);
      let devPorts = Array.isArray(dev.ports) && dev.ports.length > 0
        ? dev.ports
        : modelDefaults;
      if (this.isLegacyProceduralPortSet(devPorts) && !this.isLegacyProceduralPortSet(modelDefaults)) {
        devPorts = modelDefaults.map((p) => ({ ...p, local3d: { ...p.local3d } }));
        dev.ports = devPorts;
      }

      this.reconcileDeviceCablePorts(dev.id, devPorts, allCables);
      const portStatusMap = this.buildPortStatusMap(dev.id, allCables);
      this.registerDevicePortTransforms(dev, devPorts, finalX, finalY, finalZ, userModelScale, rotYRad);

      const hasCustomGlb = Boolean(dev.spatial3d?.customModelUrl);
      const modelContainer = new THREE.Group();
      modelContainer.scale.setScalar(userModelScale);
      modelContainer.rotation.y = rotYRad;
      const proceduralMesh = createDevice3DMesh(dev, cat.color, statusDef.color);
      modelContainer.add(proceduralMesh);
      if (!hasCustomGlb) {
        modelContainer.add(create3DPortsSubGroup(devPorts, portStatusMap, false));
      }
      holder.add(modelContainer);

      // Load custom GLB asynchronously if configured
      if (hasCustomGlb) {
        loadCustomGlbModel(dev.spatial3d.customModelUrl, 1.3)
          .then((glb) => {
            if (!this.deviceMeshMap.has(dev.id)) return;
            const glbPorts = Array.isArray(glb.userData?.extractedPorts) ? glb.userData.extractedPorts : [];
            if (glbPorts.length > 0 && !this.portsMatchGlbSockets(devPorts, glbPorts)) {
              devPorts = glbPorts.map((p) => ({ ...p, local3d: { ...p.local3d } }));
              dev.ports = devPorts;
            }
            const latestCables = this.cableManager.getAllConnections();
            this.reconcileDeviceCablePorts(dev.id, devPorts, latestCables);
            const updatedStatusMap = this.buildPortStatusMap(dev.id, latestCables);
            this.registerDevicePortTransforms(dev, devPorts, finalX, finalY, finalZ, userModelScale, rotYRad);

            modelContainer.clear();
            modelContainer.add(glb);
            modelContainer.add(create3DPortsSubGroup(devPorts, updatedStatusMap, true));
            this.tagDescendantDeviceId(modelContainer, dev.id);
            this.syncCables();
          })
          .catch((err) => {
            console.warn(`[Map3DEngine] Custom 3D model load failed for ${dev.name}:`, err);
            modelContainer.add(create3DPortsSubGroup(devPorts, portStatusMap, false));
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

      // Selection Highlight Ring (always attached so multi-select updates without reloading .glb)
      const isPrimarySel = this.deviceManager.selectedDeviceId === dev.id;
      const isAnySel = this.deviceManager.isDeviceSelected?.(dev.id) || isPrimarySel;
      const selRing = new THREE.Mesh(
        new THREE.RingGeometry(0.95 * userModelScale, 1.18 * userModelScale, 28),
        new THREE.MeshBasicMaterial({ color: isPrimarySel ? 0xfacc15 : 0x38bdf8, side: THREE.DoubleSide })
      );
      selRing.rotation.x = -Math.PI / 2;
      selRing.position.y = 0.04;
      selRing.visible = isAnySel;
      selRing.userData.isSelectionRing = true;
      selRing.raycast = () => {};
      holder.add(selRing);

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

  isLegacyProceduralPortSet(ports) {
    if (!Array.isArray(ports) || ports.length === 0) return true;
    // Legacy procedural defaults had z in {0.34, 0.36, 0.37, 0.41} and y in {0.11, 0.12, 0.14}
    const firstZ = Number(ports[0]?.local3d?.z);
    const firstY = Number(ports[0]?.local3d?.y);
    const legacyZ = [0.34, 0.36, 0.37, 0.41];
    const legacyY = [0.11, 0.12, 0.14];
    const isLegacyCoord = legacyZ.some((z) => Math.abs(firstZ - z) < 0.002)
      && legacyY.some((y) => Math.abs(firstY - y) < 0.002);
    return isLegacyCoord;
  }

  portsMatchGlbSockets(currentPorts, glbPorts) {
    if (!Array.isArray(currentPorts) || !Array.isArray(glbPorts)) return false;
    if (currentPorts.length !== glbPorts.length) return false;
    for (let i = 0; i < glbPorts.length; i++) {
      const cp = currentPorts[i];
      const gp = glbPorts[i];
      if (!cp || !gp || cp.name !== gp.name) return false;
      const dz = Math.abs((cp.local3d?.z ?? 0) - (gp.local3d?.z ?? 0));
      const dy = Math.abs((cp.local3d?.y ?? 0) - (gp.local3d?.y ?? 0));
      if (dz > 0.015 || dy > 0.015) return false;
    }
    return true;
  }

  matchPortNameToAvailable(requestedName, availablePorts, usedPortsSet, fallbackIdx = 0) {
    if (!Array.isArray(availablePorts) || availablePorts.length === 0) return '';
    const req = String(requestedName || '').trim();
    if (req) {
      const exact = availablePorts.find((p) => p.name === req);
      if (exact) {
        usedPortsSet.add(exact.name);
        return exact.name;
      }
      const lower = req.toLowerCase();
      const ci = availablePorts.find((p) => p.name.toLowerCase() === lower);
      if (ci) {
        usedPortsSet.add(ci.name);
        return ci.name;
      }
      if (lower.includes('wlan') || lower.includes('wifi')) {
        const wl = availablePorts.find((p) => p.type === 'wireless' || p.name.toLowerCase().includes('wlan'));
        if (wl) {
          usedPortsSet.add(wl.name);
          return wl.name;
        }
      }
      if (lower.includes('wan')) {
        const wan = availablePorts.find((p) => p.name.toLowerCase().includes('wan'))
          || availablePorts[0];
        if (wan) {
          usedPortsSet.add(wan.name);
          return wan.name;
        }
      }
      const numMatch = req.match(/(\d+)(?!.*\d)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const byNum = availablePorts.find((p) => {
          const m = p.name.match(/(\d+)(?!.*\d)/);
          return m && parseInt(m[1], 10) === num;
        }) || (num >= 1 && num <= availablePorts.length ? availablePorts[num - 1] : null);
        if (byNum) {
          usedPortsSet.add(byNum.name);
          return byNum.name;
        }
      }
    }
    // Pick first unused wired port, or fallback by index
    const unused = availablePorts.find((p) => !usedPortsSet.has(p.name) && p.type !== 'wireless')
      || availablePorts.find((p) => !usedPortsSet.has(p.name))
      || availablePorts[fallbackIdx % availablePorts.length];
    if (unused) {
      usedPortsSet.add(unused.name);
      return unused.name;
    }
    return availablePorts[0].name;
  }

  reconcileDeviceCablePorts(deviceId, devPorts, allCables) {
    if (!Array.isArray(devPorts) || devPorts.length === 0 || !Array.isArray(allCables)) return;
    const usedPorts = new Set();
    let idx = 0;
    allCables.forEach((cab) => {
      if (!cab.details) cab.details = {};
      if (cab.source === deviceId) {
        cab.details.portSource = this.matchPortNameToAvailable(cab.details.portSource, devPorts, usedPorts, idx++);
      }
      if (cab.destination === deviceId) {
        cab.details.portDestination = this.matchPortNameToAvailable(cab.details.portDestination, devPorts, usedPorts, idx++);
      }
    });
  }

  buildPortStatusMap(deviceId, allCables) {
    const portStatusMap = new Map();
    if (!Array.isArray(allCables)) return portStatusMap;
    allCables.forEach((cab) => {
      if (cab.source === deviceId && cab.details?.portSource) {
        portStatusMap.set(cab.details.portSource, { status: cab.status || 'active', cableId: cab.id });
      }
      if (cab.destination === deviceId && cab.details?.portDestination) {
        portStatusMap.set(cab.details.portDestination, { status: cab.status || 'active', cableId: cab.id });
      }
    });
    return portStatusMap;
  }

  registerDevicePortTransforms(dev, devPorts, finalX, finalY, finalZ, userModelScale, rotYRad) {
    const cosR = Math.cos(rotYRad);
    const sinR = Math.sin(rotYRad);
    devPorts.forEach((p) => {
      const rawLx = typeof p.local3d?.x === 'number' ? p.local3d.x : 0;
      const rawLy = typeof p.local3d?.y === 'number' ? p.local3d.y : 0.12;
      const rawLz = typeof p.local3d?.z === 'number' ? p.local3d.z : 0.36;
      const lx = rawLx * userModelScale;
      const ly = rawLy * userModelScale;
      const lz = rawLz * userModelScale;
      const wx = finalX + (lx * cosR + lz * sinR);
      const wy = finalY + ly;
      const wz = finalZ + (-lx * sinR + lz * cosR);
      const key = `${dev.id}::${p.name}`;
      this.portWorldPosMap.set(key, new THREE.Vector3(wx, wy, wz));
      const zSign = rawLz < -0.015 ? -1 : 1;
      this.portWorldDirMap.set(key, new THREE.Vector3(sinR * zSign, 0, cosR * zSign).normalize());
    });
  }

  resolveDevicePortKey(deviceId, requestedPortName, fallbackIdx = 0) {
    const directKey = requestedPortName ? `${deviceId}::${requestedPortName}` : '';
    if (directKey && this.portWorldPosMap.has(directKey)) return directKey;
    const prefix = `${deviceId}::`;
    const matchingKeys = [];
    for (const k of this.portWorldPosMap.keys()) {
      if (k.startsWith(prefix)) matchingKeys.push(k);
    }
    if (matchingKeys.length === 0) return '';
    return matchingKeys[fallbackIdx % matchingKeys.length];
  }

  syncCables() {
    if (!this.isActive || !this.isInitialized) return;
    if (this.effectivePosMap.size === 0 && this.deviceManager.getAllDevices().length > 0) {
      this.syncDevices();
    }
    this.clearGroup(this.cablesGroup);
    this.cableMeshMap.clear();

    const cables = this.cableManager.getAllConnections();

    cables.forEach((cable, cableIdx) => {
      const srcPortKey = this.resolveDevicePortKey(cable.source, cable.details?.portSource, cableIdx);
      const dstPortKey = this.resolveDevicePortKey(cable.destination, cable.details?.portDestination, cableIdx);
      const hasSrcPort = Boolean(srcPortKey && this.portWorldPosMap.has(srcPortKey));
      const hasDstPort = Boolean(dstPortKey && this.portWorldPosMap.has(dstPortKey));
      const srcPos = hasSrcPort ? this.portWorldPosMap.get(srcPortKey) : this.effectivePosMap.get(cable.source);
      const dstPos = hasDstPort ? this.portWorldPosMap.get(dstPortKey) : this.effectivePosMap.get(cable.destination);
      if (!srcPos || !dstPos) return;

      const srcDev = this.deviceManager.getDeviceById(cable.source);
      const dstDev = this.deviceManager.getDeviceById(cable.destination);
      const srcScale = (srcDev?.spatial3d?.modelScale || 1) * this.deviceScaleMultiplier;
      const dstScale = (dstDev?.spatial3d?.modelScale || 1) * this.deviceScaleMultiplier;
      const avgPortScale = (srcScale + dstScale) * 0.5;

      const catDef = CABLE_CATEGORIES[cable.cableCategory] || CABLE_CATEGORIES['cat6'];
      const color = cable.customColor || catDef?.color || '#3b82f6';
      const isSelected = this.cableManager.selectedCableId === cable.id;
      const isWireless = cable.type === 'wireless' || cable.cableCategory === 'wireless-ptp';

      const sRot = ((srcDev?.spatial3d?.rotationY || 0) * Math.PI) / 180;
      const dRot = ((dstDev?.spatial3d?.rotationY || 0) * Math.PI) / 180;
      const srcDir = (hasSrcPort && this.portWorldDirMap.get(srcPortKey))
        || new THREE.Vector3(Math.sin(sRot), 0, Math.cos(sRot));
      const dstDir = (hasDstPort && this.portWorldDirMap.get(dstPortKey))
        || new THREE.Vector3(Math.sin(dRot), 0, Math.cos(dRot));

      const pts = [];
      if (hasSrcPort && !isWireless) {
        // Anchor slightly inside the RJ45/SFP socket cavity so the cable plugs in 100% flush with zero gap
        pts.push(srcPos.clone().addScaledVector(srcDir, -0.008 * srcScale));
        pts.push(srcPos.clone());
        pts.push(srcPos.clone().addScaledVector(srcDir, 0.022 * srcScale));
      } else {
        pts.push(srcPos.clone());
      }

      const pathStyle = cable.details?.pathStyle || 'curve';
      const hasCustomElev = typeof cable.details?.elevationZ === 'number' && !isNaN(cable.details.elevationZ);
      const trayY = hasCustomElev
        ? Math.max(0.02, cable.details.elevationZ)
        : Math.max(0.06, Math.min(srcPos.y, dstPos.y));
      const waypointMarkers = [];

      if (Array.isArray(cable.route) && cable.route.length > 0) {
        const rawWps = cable.route.map((wp) => {
          const wpWorld = this.normToWorld(wp.x, wp.y);
          const wpY = (typeof wp.z === 'number' && !isNaN(wp.z)) ? Math.max(0.02, wp.z) : trayY;
          const vec = new THREE.Vector3(wpWorld.x, wpY, wpWorld.z);
          waypointMarkers.push(vec);
          return vec;
        });
        if (pathStyle === 'orthogonal') {
          let prevPt = pts[pts.length - 1];
          rawWps.forEach((wpVec) => {
            // Vertical riser / drop to waypoint Z level first if Z differs noticeably
            if (Math.abs(wpVec.y - prevPt.y) > 0.05) {
              pts.push(new THREE.Vector3(prevPt.x, wpVec.y, prevPt.z));
            }
            if (Math.abs(wpVec.x - prevPt.x) > 0.1 && Math.abs(wpVec.z - prevPt.z) > 0.1) {
              pts.push(new THREE.Vector3(wpVec.x, wpVec.y, prevPt.z));
            }
            pts.push(wpVec);
            prevPt = wpVec;
          });
          if (Math.abs(dstPos.x - prevPt.x) > 0.1 && Math.abs(dstPos.z - prevPt.z) > 0.1) {
            pts.push(new THREE.Vector3(dstPos.x, prevPt.y, prevPt.z));
          }
          if (Math.abs(dstPos.y - prevPt.y) > 0.05) {
            const dstExitRef = hasDstPort ? dstPos.clone().addScaledVector(dstDir, 0.022 * dstScale) : dstPos;
            pts.push(new THREE.Vector3(dstExitRef.x, prevPt.y, dstExitRef.z));
          }
        } else {
          rawWps.forEach((wpVec) => pts.push(wpVec));
        }
      } else if (hasCustomElev && !isWireless) {
        // Lift/drop direct cable cleanly to the custom Z tray elevation
        const srcExitPt = pts[pts.length - 1];
        const dstExitPt = hasDstPort ? dstPos.clone().addScaledVector(dstDir, 0.022 * dstScale) : dstPos;
        const riserA = srcExitPt.clone().lerp(dstExitPt, 0.06);
        riserA.y = trayY;
        const riserB = srcExitPt.clone().lerp(dstExitPt, 0.94);
        riserB.y = trayY;
        pts.push(riserA);
        if (pathStyle === 'orthogonal' && Math.abs(riserB.x - riserA.x) > 0.1 && Math.abs(riserB.z - riserA.z) > 0.1) {
          pts.push(new THREE.Vector3(riserB.x, trayY, riserA.z));
        }
        pts.push(riserB);
      } else if (pathStyle === 'orthogonal' && !isWireless) {
        const prevPt = pts[pts.length - 1];
        if (Math.abs(dstPos.x - prevPt.x) > 0.1 && Math.abs(dstPos.z - prevPt.z) > 0.1) {
          pts.push(new THREE.Vector3(dstPos.x, trayY, prevPt.z));
        }
      } else if (!isWireless && srcPos.distanceTo(dstPos) > 0.6) {
        // Gentle mid-arc that respects port elevation without ballooning above the device
        const srcExitPt = pts[pts.length - 1];
        const dstExitPt = hasDstPort ? dstPos.clone().addScaledVector(dstDir, 0.022 * dstScale) : dstPos;
        const mid = srcExitPt.clone().add(dstExitPt).multiplyScalar(0.5);
        const sag = Math.min(0.08 * avgPortScale, srcPos.distanceTo(dstPos) * 0.025);
        mid.y = Math.max(0.03, Math.min(srcPos.y, dstPos.y) - sag * 0.25);
        pts.push(mid);
      }

      if (hasDstPort && !isWireless) {
        pts.push(dstPos.clone().addScaledVector(dstDir, 0.022 * dstScale));
        pts.push(dstPos.clone());
        pts.push(dstPos.clone().addScaledVector(dstDir, -0.008 * dstScale));
      } else {
        pts.push(dstPos.clone());
      }

      // Ensure unique adjacent points with fine tolerance so socket anchor + exit boot are preserved
      const cleanPts = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].distanceToSquared(cleanPts[cleanPts.length - 1]) > 0.000001) {
          cleanPts.push(pts[i]);
        }
      }
      if (cleanPts.length < 2) {
        cleanPts.push(dstPos.clone().add(new THREE.Vector3(0.05, 0.02, 0.05)));
      }

      let curve;
      if (pathStyle === 'straight' || pathStyle === 'orthogonal') {
        curve = new THREE.CurvePath();
        for (let i = 0; i < cleanPts.length - 1; i++) {
          curve.add(new THREE.LineCurve3(cleanPts[i], cleanPts[i + 1]));
        }
      } else {
        const tension = typeof cable.details?.curveTension === 'number' ? cable.details.curveTension : 0.35;
        curve = new THREE.CatmullRomCurve3(cleanPts, false, 'catmullrom', tension);
      }
      // Sculpted GLB RJ45 port opening is ~0.020 wide; local radius 0.0085 fits snugly inside the port cavity
      const portMatchedLocalRadius = 0.0085;
      const perCableScale = Number(cable.details?.cableDiameterScale) > 0
        ? Number(cable.details.cableDiameterScale)
        : 1.0;
      const selectBoost = isSelected ? 1.3 : 1.0;
      const radius = Math.max(
        0.005,
        portMatchedLocalRadius * avgPortScale * this.cableDiameterMultiplier * perCableScale * selectBoost
      );
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(24, cleanPts.length * 12), radius, 8, false);
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

      if (isSelected && waypointMarkers.length > 0) {
        const wpGeo = new THREE.SphereGeometry(Math.max(0.06, radius * 2.1), 10, 10);
        const wpMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const stemMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.45 });
        waypointMarkers.forEach((wpVec) => {
          const wpDot = new THREE.Mesh(wpGeo, wpMat);
          wpDot.position.copy(wpVec);
          wpDot.userData.cableId = cable.id;
          this.cablesGroup.add(wpDot);

          const stemGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(wpVec.x, 0.01, wpVec.z),
            wpVec.clone()
          ]);
          this.cablesGroup.add(new THREE.Line(stemGeo, stemMat));
        });
      }
    });

    // Render live 3D Pen Tool waypoints & preview tube while drawing a cable in 3D
    if (stateManager.getMode() === 'draw-cable' && this.pendingCableSourceId && this.pending3dWaypoints.length > 0) {
      const srcPos = this.effectivePosMap.get(this.pendingCableSourceId);
      if (srcPos) {
        const previewPts = [srcPos.clone()];
        const dotGeo = new THREE.SphereGeometry(0.14 * Math.max(1, this.deviceScaleMultiplier * 0.4), 12, 12);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });

        this.pending3dWaypoints.forEach((wp) => {
          const wpW = this.normToWorld(wp.x, wp.y);
          const v = new THREE.Vector3(wpW.x, Math.max(0.15, srcPos.y * 0.4), wpW.z);
          previewPts.push(v);

          const marker = new THREE.Mesh(dotGeo, dotMat);
          marker.position.copy(v);
          this.cablesGroup.add(marker);
        });

        if (previewPts.length >= 2) {
          const prevCurve = new THREE.CatmullRomCurve3(previewPts, false, 'catmullrom', this.pen3dPathStyle === 'curve' ? 0.35 : 0.01);
          const prevGeo = new THREE.TubeGeometry(prevCurve, Math.max(16, previewPts.length * 10), 0.016 * this.deviceScaleMultiplier, 8, false);
          const prevMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.85 });
          this.cablesGroup.add(new THREE.Mesh(prevGeo, prevMat));
        }
      }
    }
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
            this.pending3dWaypoints = [];
            this.deviceManager.selectDevice(devId);
            this.syncDevices();
            const srcDev = this.deviceManager.getDeviceById(devId);
            this.showStatusHint(`✒️ Pen Tool 3D: Sumber "${srcDev?.name || devId}". Klik lantai untuk titik belok (Shift=45°/90°), atau klik perangkat tujuan.`);
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
            cableCategory: this.pen3dCategory || 'cat6',
            route: [...this.pending3dWaypoints],
            status: 'active',
            details: {
              pathStyle: this.pen3dPathStyle || 'curve',
              curveTension: 0.38
            }
          });
          this.pendingCableSourceId = null;
          this.pending3dWaypoints = [];
          stateManager.setMode('select');
          this.syncDevices();
          if (newCab) {
            this.cableManager.selectConnection(newCab.id);
            this.syncCables();
            this.showStatusHint(`✅ Kabel terhubung: "${newCab.name}" — Pilih port interface.`);
            eventBus.emit('cable:prompt-port-picker', { cableId: newCab.id });
          }
          return;
        }
        stateManager.deselectObject3d?.();
        this.deviceManager.selectDevice(devId, {
          toggle: Boolean(e.ctrlKey || e.metaKey),
          additive: Boolean(e.shiftKey)
        });
        return;
      }
    }

    // 1b. In 3D draw-cable mode with source selected, clicking ground/room floor adds a Pen Tool waypoint
    if (stateManager.getMode() === 'draw-cable' && this.pendingCableSourceId) {
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
      if (hitPoint) {
        let { normX, normY } = this.worldToNorm(hitPoint.x, hitPoint.z);
        if (e.shiftKey) {
          const srcDev = this.deviceManager.getDeviceById(this.pendingCableSourceId);
          const prev = this.pending3dWaypoints.length > 0
            ? this.pending3dWaypoints[this.pending3dWaypoints.length - 1]
            : srcDev?.position;
          if (prev) {
            const dx = normX - prev.x;
            const dy = normY - prev.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
              const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
              normX = Math.max(0.01, Math.min(0.99, prev.x + Math.cos(snapped) * dist));
              normY = Math.max(0.01, Math.min(0.99, prev.y + Math.sin(snapped) * dist));
            }
          }
        }
        this.pending3dWaypoints.push({ x: normX, y: normY });
        this.syncCables();
        this.showStatusHint(`✒️ Titik belok #${this.pending3dWaypoints.length} ditambahkan. Klik lantai lagi atau klik perangkat tujuan.`);
        return;
      }
    }

    // 2. Check Custom 3D Builder Object selection (Tiang, Rak Server, Balok, dll)
    if (stateManager.getMode() !== 'draw-cable') {
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit?.object3dId) {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
        stateManager.selectObject3d(objHit.object3dId);
        return;
      }
    }

    // 3. Check Cable selection
    const cableHits = this.raycaster.intersectObjects(this.cablesGroup.children, true);
    if (cableHits.length > 0) {
      const cabId = cableHits[0].object.userData?.cableId;
      if (cabId) {
        stateManager.deselectObject3d?.();
        this.cableManager.selectConnection(cabId);
        return;
      }
    }

    // 4. Deselect on empty ground click (or cancel pending cable source)
    const hadPending = Boolean(this.pendingCableSourceId);
    this.pendingCableSourceId = null;
    if (hadPending) this.syncDevices();
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      this.deviceManager.deselectDevice();
      this.cableManager.deselectConnection();
      stateManager.deselectObject3d?.();
    }
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
      [...this.roomsGroup.children, ...this.objects3dGroup.children, ...this.groundGroup.children],
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
      const devId = this.findDeviceIdFromObject(devHits[0].object);
      if (devId) {
        this.deviceManager.selectDevice(devId, {
          toggle: Boolean(e.ctrlKey || e.metaKey),
          additive: Boolean(e.shiftKey)
        });
        this.focusOnDevice(devId);
        return;
      }
    }

    const envHits = this.raycaster.intersectObjects(
      [...this.roomsGroup.children, ...this.objects3dGroup.children, ...this.groundGroup.children],
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
    const validTools = ['orbit', 'pan', 'zoom', 'look', 'move', 'box', 'draw3d'];
    if (!validTools.includes(tool)) return;
    this.navTool = tool;
    this.applyNavToolConfig();
    eventBus.emit('map3d:navtool-changed', { tool });
  }

  applyNavToolConfig() {
    if (this.container) {
      this.container.classList.remove('tool-orbit', 'tool-pan', 'tool-zoom', 'tool-look', 'tool-move', 'tool-box', 'tool-draw3d');
      this.container.classList.add(`tool-${this.navTool}`);
    }
    if (!this.controls) return;

    if (this.navTool === 'draw3d') {
      this.controls.mouseButtons = {
        LEFT: -1, // Click or drag on 3D floor to place/draw SketchUp 3D objects
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    } else if (this.navTool === 'box') {
      this.controls.mouseButtons = {
        LEFT: -1, // Drag left button draws 3D marquee box selection
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    } else if (this.navTool === 'move') {
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

  ensureMarqueeOverlay() {
    if (this._marqueeEl && this._marqueeEl.parentElement === this.container) {
      return this._marqueeEl;
    }
    const el = document.createElement('div');
    el.id = 'map-3d-marquee';
    el.className = 'map-3d-marquee';
    el.style.display = 'none';
    this.container?.appendChild(el);
    this._marqueeEl = el;
    return el;
  }

  startBoxSelect(e, dom) {
    const rect = dom.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    this.boxSelectState = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX,
      startY,
      endX: startX,
      endY: startY,
      active: false,
      additive: Boolean(e.shiftKey || e.ctrlKey || e.metaKey)
    };
    dom.setPointerCapture?.(e.pointerId);
  }

  updateBoxSelect(e) {
    if (!this.boxSelectState || !this.renderer?.domElement) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const curX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const curY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    this.boxSelectState.endX = curX;
    this.boxSelectState.endY = curY;

    const dist = Math.hypot(
      e.clientX - this.boxSelectState.startClientX,
      e.clientY - this.boxSelectState.startClientY
    );
    if (!this.boxSelectState.active && dist > 6) {
      this.boxSelectState.active = true;
    }

    if (this.boxSelectState.active) {
      const marquee = this.ensureMarqueeOverlay();
      const left = Math.min(this.boxSelectState.startX, curX);
      const top = Math.min(this.boxSelectState.startY, curY);
      const width = Math.abs(curX - this.boxSelectState.startX);
      const height = Math.abs(curY - this.boxSelectState.startY);
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${width}px`;
      marquee.style.height = `${height}px`;
      marquee.style.display = 'block';
    }
  }

  finishBoxSelect(e, dom) {
    const state = this.boxSelectState;
    this.boxSelectState = null;
    if (this._marqueeEl) {
      this._marqueeEl.style.display = 'none';
    }
    dom.releasePointerCapture?.(e.pointerId);
    if (!state || !state.active || !this.camera || !this.renderer?.domElement) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const curX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const curY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const minX = Math.min(state.startX, curX);
    const maxX = Math.max(state.startX, curX);
    const minY = Math.min(state.startY, curY);
    const maxY = Math.max(state.startY, curY);

    this.camera.updateMatrixWorld();
    const matchedIds = [];
    this.deviceManager.getAllDevices().forEach((dev) => {
      if (dev.layerVisible === false) return;
      const eff = this.effectivePosMap.get(dev.id);
      let pos;
      if (eff) {
        pos = eff.clone();
      } else {
        const w = this.normToWorld(dev.position.x, dev.position.y);
        pos = new THREE.Vector3(w.x, 0.3, w.z);
      }
      pos.project(this.camera);
      if (pos.z < -1 || pos.z > 1) return;
      const sx = ((pos.x + 1) / 2) * rect.width;
      const sy = ((-pos.y + 1) / 2) * rect.height;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        matchedIds.push(dev.id);
      }
    });

    const additive = Boolean(state.additive || e.shiftKey || e.ctrlKey || e.metaKey);
    if (matchedIds.length > 0) {
      this.cableManager?.deselectConnection();
      this.deviceManager.selectMultipleDevices(matchedIds, { additive });
      const totalSel = this.deviceManager.getSelectedDeviceIds().length;
      this.showStatusHint(`✅ ${totalSel} perangkat terpilih — Aktifkan Move (M) untuk geser bersamaan.`);
    } else if (!additive) {
      this.deviceManager.deselectDevice();
      this.cableManager?.deselectConnection();
    }
  }

  _collectDevicePortInitials(deviceId) {
    const entries = [];
    const prefix = `${deviceId}::`;
    this.portWorldPosMap.forEach((vec, key) => {
      if (key.startsWith(prefix)) {
        entries.push({ key, initial: vec.clone() });
      }
    });
    return entries;
  }

  findObject3dHit(raycaster = this.raycaster) {
    if (!this.objects3dGroup || this.objects3dGroup.children.length === 0) return null;
    const hits = raycaster.intersectObjects(this.objects3dGroup.children, true);
    for (let i = 0; i < hits.length; i++) {
      let curr = hits[i].object;
      let gizmoType = null;
      let object3dId = null;
      while (curr) {
        if (!gizmoType && curr.userData?.gizmoType) gizmoType = curr.userData.gizmoType;
        if (!object3dId && curr.userData?.object3dId) object3dId = curr.userData.object3dId;
        if (object3dId) {
          return { object3dId, gizmoType, point: hits[i].point.clone(), object: hits[i].object };
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  checkGizmoHitAtEvent(e) {
    if (!this.isInitialized || !this.camera || !this.renderer?.domElement) return null;
    if (!stateManager.getSelectedObject3dId() || this.objects3dGroup.children.length === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.findObject3dHit(this.raycaster);
    return hit && hit.gizmoType ? hit : null;
  }

  startObject3dGizmoDrag(e, dom, gizmoHit) {
    const obj = stateManager.getObject3dById(gizmoHit.object3dId);
    if (!obj) return;
    if (gizmoHit.gizmoType === 'pushpull') {
      this.object3dDragState = {
        kind: 'pushpull',
        objId: obj.id,
        startClientY: e.clientY,
        startHeight: Number(obj.heightMeters) || 2,
        latestHeight: Number(obj.heightMeters) || 2,
        draftObj: { ...obj }
      };
      dom.setPointerCapture?.(e.pointerId);
    } else if (gizmoHit.gizmoType === 'scale') {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(Number(obj.elevationMeters) || 0));
      const worldCenter = this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5);
      this.object3dDragState = {
        kind: 'scale',
        objId: obj.id,
        plane,
        centerX: worldCenter.x,
        centerZ: worldCenter.z,
        startWidth: Number(obj.widthMeters) || 1,
        startDepth: Number(obj.depthMeters) || 1,
        latestWidth: Number(obj.widthMeters) || 1,
        latestDepth: Number(obj.depthMeters) || 1,
        draftObj: { ...obj }
      };
      dom.setPointerCapture?.(e.pointerId);
    }
  }

  startObject3dCreateDraw(e, dom) {
    const rect = dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let hitPt = null;
    let baseElev = 0;

    // Check if placing on top of an existing 3D object
    const objHit = this.findObject3dHit(this.raycaster);
    if (objHit?.object3dId) {
      const baseObj = stateManager.getObject3dById(objHit.object3dId);
      if (baseObj) {
        hitPt = objHit.point.clone();
        baseElev = (Number(baseObj.elevationMeters) || 0) + (Number(baseObj.heightMeters) || 0);
      }
    }

    if (!hitPt) {
      const envHits = this.raycaster.intersectObjects(
        [...this.roomsGroup.children, ...this.groundGroup.children],
        true
      );
      if (envHits.length > 0) {
        hitPt = envHits[0].point.clone();
      } else {
        const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPt = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(floorPlane, intersectPt)) {
          hitPt = intersectPt;
        }
      }
    }
    if (!hitPt) return;

    const { normX, normY } = this.worldToNorm(hitPt.x, hitPt.z);
    const tpl = this.activeDraw3dTemplate || OBJECT3D_PRESETS.pole;
    const presetDefaults = OBJECT3D_PRESETS[tpl.shape] || OBJECT3D_PRESETS.box;
    const existingCount = stateManager.getObjects3d().length + 1;

    const draftObj = {
      ...presetDefaults,
      ...tpl,
      id: generateId('obj3d'),
      name: `${tpl.name || presetDefaults.name} #${existingCount}`,
      x: normX,
      y: normY,
      elevationMeters: baseElev
    };

    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -baseElev);
    this.object3dDragState = {
      kind: 'create-draw',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPt: hitPt.clone(),
      dragPlane,
      baseElev,
      hasDraggedFootprint: false,
      draftObj
    };

    this.rebuildSingleObject3dMesh(draftObj, true);
    dom.setPointerCapture?.(e.pointerId);
  }

  startObject3dMoveDrag(e, dom, objHit) {
    const obj = stateManager.getObject3dById(objHit.object3dId);
    if (!obj) return;
    stateManager.selectObject3d(obj.id);
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();

    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(Number(obj.elevationMeters) || 0));
    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(dragPlane, hitPt)) return;

    const objWorld = this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5);
    const objElev = Number(obj.elevationMeters) || 0;

    // Co-move devices mounted on the same footprint
    const mountedPeers = this.deviceManager
      .getAllDevices()
      .filter(
        (d) =>
          !d.layerLocked &&
          Math.hypot((d.position?.x ?? 0) - (obj.x ?? 0.5), (d.position?.y ?? 0) - (obj.y ?? 0.5)) < 0.018 &&
          (d.spatial3d?.elevationMeters ?? 0) >= objElev
      )
      .map((d) => {
        const pMesh = this.deviceMeshMap.get(d.id);
        const pWorld = this.normToWorld(d.position.x, d.position.y);
        const pPrevEff = this.effectivePosMap.get(d.id);
        return {
          id: d.id,
          startNormX: d.position.x,
          startNormY: d.position.y,
          startWorldX: pWorld.x,
          startWorldZ: pWorld.z,
          meshGroup: pMesh,
          meshStartX: pMesh ? pMesh.position.x : pWorld.x,
          meshStartZ: pMesh ? pMesh.position.z : pWorld.z,
          effY: pPrevEff ? pPrevEff.y : (pMesh ? pMesh.position.y : 0),
          portInitials: this._collectDevicePortInitials(d.id),
          latestNorm: null
        };
      });

    this.object3dDragState = {
      kind: 'move-obj3d',
      objId: obj.id,
      obj,
      plane: dragPlane,
      startNormX: obj.x ?? 0.5,
      startNormY: obj.y ?? 0.5,
      grabOffsetX: objWorld.x - hitPt.x,
      grabOffsetZ: objWorld.z - hitPt.z,
      mountedPeers,
      latestNorm: null
    };
    dom.setPointerCapture?.(e.pointerId);
  }

  updateObject3dDrag(e) {
    const state = this.object3dDragState;
    if (!state || !this.renderer?.domElement) return;
    const rect = this.renderer.domElement.getBoundingClientRect();

    if (state.kind === 'pushpull') {
      const dyPx = state.startClientY - e.clientY;
      const camDist = this.camera ? this.camera.position.distanceTo(this.controls.target) : 20;
      const deltaMeters = (dyPx / Math.max(200, rect.height)) * camDist * 1.15;
      const nextH = clamp(Number((state.startHeight + deltaMeters).toFixed(2)), 0.2, 80);
      state.latestHeight = nextH;
      state.draftObj = { ...state.draftObj, heightMeters: nextH };
      this.rebuildSingleObject3dMesh(state.draftObj, true);
      this.showStatusHint(`📐 Push/Pull Tinggi "${state.draftObj.name}": ${nextH.toFixed(2)}m`);
      return;
    }

    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (state.kind === 'scale') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;
      let nextW = clamp(Number((Math.abs(hitPt.x - state.centerX) * 2).toFixed(2)), 0.2, 120);
      let nextD = clamp(Number((Math.abs(hitPt.z - state.centerZ) * 2).toFixed(2)), 0.2, 120);
      if (state.draftObj.shape === 'pole' || state.draftObj.shape === 'cylinder') {
        const uniform = Math.max(nextW, nextD);
        nextW = uniform;
        nextD = uniform;
      }
      state.latestWidth = nextW;
      state.latestDepth = nextD;
      state.draftObj = { ...state.draftObj, widthMeters: nextW, depthMeters: nextD };
      this.rebuildSingleObject3dMesh(state.draftObj, true);
      this.showStatusHint(`📐 Ukuran "${state.draftObj.name}": ${nextW.toFixed(2)}m × ${nextD.toFixed(2)}m`);
      return;
    }

    if (state.kind === 'create-draw') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.dragPlane, hitPt)) return;
      const dragPx = Math.hypot(e.clientX - state.startClientX, e.clientY - state.startClientY);
      const shape = state.draftObj.shape;
      if (dragPx > 8 && shape !== 'pole') {
        state.hasDraggedFootprint = true;
        const midX = (state.startPt.x + hitPt.x) / 2;
        const midZ = (state.startPt.z + hitPt.z) / 2;
        const { normX, normY } = this.worldToNorm(midX, midZ);
        let w = clamp(Number(Math.abs(hitPt.x - state.startPt.x).toFixed(2)), 0.4, 120);
        let d = clamp(Number(Math.abs(hitPt.z - state.startPt.z).toFixed(2)), 0.4, 120);
        if (shape === 'cylinder') {
          const diam = Math.max(w, d);
          w = diam;
          d = diam;
        }
        state.draftObj = { ...state.draftObj, x: normX, y: normY, widthMeters: w, depthMeters: d };
        this.rebuildSingleObject3dMesh(state.draftObj, true);
        this.showStatusHint(`📐 Menggambar "${state.draftObj.name}": ${w.toFixed(1)}m × ${d.toFixed(1)}m`);
      }
      return;
    }

    if (state.kind === 'move-obj3d') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;
      const newWorldX = hitPt.x + state.grabOffsetX;
      const newWorldZ = hitPt.z + state.grabOffsetZ;
      const { normX, normY } = this.worldToNorm(newWorldX, newWorldZ);
      const clampedWorld = this.normToWorld(normX, normY);
      const meshGroup = this.object3dMeshMap.get(state.objId);
      if (meshGroup) {
        meshGroup.position.x = clampedWorld.x;
        meshGroup.position.z = clampedWorld.z;
      }
      state.latestNorm = { x: normX, y: normY };

      if (state.mountedPeers.length > 0) {
        const deltaNormX = normX - state.startNormX;
        const deltaNormY = normY - state.startNormY;
        state.mountedPeers.forEach((peer) => {
          const pNormX = clamp(peer.startNormX + deltaNormX, 0.01, 0.99);
          const pNormY = clamp(peer.startNormY + deltaNormY, 0.01, 0.99);
          const pClampedWorld = this.normToWorld(pNormX, pNormY);
          const pShiftX = pClampedWorld.x - peer.startWorldX;
          const pShiftZ = pClampedWorld.z - peer.startWorldZ;
          if (peer.meshGroup) {
            peer.meshGroup.position.x = peer.meshStartX + pShiftX;
            peer.meshGroup.position.z = peer.meshStartZ + pShiftZ;
          }
          this.effectivePosMap.set(
            peer.id,
            new THREE.Vector3(peer.meshStartX + pShiftX, peer.effY, peer.meshStartZ + pShiftZ)
          );
          peer.portInitials.forEach(({ key, initial }) => {
            this.portWorldPosMap.set(
              key,
              new THREE.Vector3(initial.x + pShiftX, initial.y, initial.z + pShiftZ)
            );
          });
          peer.latestNorm = { x: pNormX, y: pNormY };
        });
        this.syncCables();
      }
    }
  }

  finishObject3dDrag(e, dom) {
    const state = this.object3dDragState;
    this.object3dDragState = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (!state) return;

    if (state.kind === 'pushpull') {
      this._suppressNextClick = true;
      stateManager.updateObject3d(state.objId, { heightMeters: state.latestHeight });
      return;
    }
    if (state.kind === 'scale') {
      this._suppressNextClick = true;
      stateManager.updateObject3d(state.objId, {
        widthMeters: state.latestWidth,
        depthMeters: state.latestDepth
      });
      return;
    }
    if (state.kind === 'create-draw') {
      this._suppressNextClick = true;
      stateManager.addObject3d(state.draftObj);
      this.showStatusHint(`✅ "${state.draftObj.name}" dibuat! Tarik panah biru di atas untuk Push/Pull tinggi.`);
      return;
    }
    if (state.kind === 'move-obj3d' && state.latestNorm) {
      stateManager.updateObject3d(state.objId, {
        x: state.latestNorm.x,
        y: state.latestNorm.y
      });
      if (state.mountedPeers.length > 0) {
        const moves = state.mountedPeers
          .filter((p) => p.latestNorm)
          .map((p) => ({ id: p.id, position: p.latestNorm }));
        if (moves.length > 0) {
          this.deviceManager.moveDeviceGroup(moves, { syncRenderer: true });
        }
      }
    }
  }

  startDeviceDragMove(e, dom) {
    const rect = dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length === 0) {
      // If user clicked a 3D Builder object in Move mode, drag that object (+ mounted devices)
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit?.object3dId) {
        this.startObject3dMoveDrag(e, dom, objHit);
      }
      return;
    }

    const devId = this.findDeviceIdFromObject(devHits[0].object);
    const device = devId ? this.deviceManager.getDeviceById(devId) : null;
    if (!device) return;

    const preserveMulti = this.deviceManager.getSelectedDeviceIds().length > 1
      && this.deviceManager.isDeviceSelected?.(devId);

    if (device.layerLocked) {
      this.deviceManager.selectDevice(devId, {
        additive: Boolean(e.shiftKey),
        preserveMultiOnDrag: preserveMulti
      });
      this.showStatusHint(`🔒 Perangkat "${device.name}" dikunci pada Layer.`);
      return;
    }

    this.deviceManager.selectDevice(devId, {
      additive: Boolean(e.shiftKey),
      preserveMultiOnDrag: preserveMulti
    });

    const meshGroup = this.deviceMeshMap.get(devId);
    const devWorld = this.normToWorld(device.position.x, device.position.y);
    const planeY = meshGroup ? meshGroup.position.y : 0;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);

    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(dragPlane, hitPt)) return;

    const meshOffsetX = meshGroup ? (meshGroup.position.x - devWorld.x) : 0;
    const meshOffsetZ = meshGroup ? (meshGroup.position.z - devWorld.z) : 0;
    const prevEff = this.effectivePosMap.get(devId);
    const effY = prevEff ? prevEff.y : (meshGroup ? meshGroup.position.y : 0);

    const peers = [];
    this.deviceManager.getSelectedDeviceIds().forEach((peerId) => {
      if (peerId === devId) return;
      const peerDev = this.deviceManager.getDeviceById(peerId);
      if (!peerDev || peerDev.layerLocked || peerDev.layerVisible === false) return;
      const peerMesh = this.deviceMeshMap.get(peerId);
      const peerWorld = this.normToWorld(peerDev.position.x, peerDev.position.y);
      const peerPrevEff = this.effectivePosMap.get(peerId);
      peers.push({
        id: peerId,
        startNormX: peerDev.position.x,
        startNormY: peerDev.position.y,
        startWorldX: peerWorld.x,
        startWorldZ: peerWorld.z,
        meshGroup: peerMesh,
        meshStartX: peerMesh ? peerMesh.position.x : peerWorld.x,
        meshStartZ: peerMesh ? peerMesh.position.z : peerWorld.z,
        effY: peerPrevEff ? peerPrevEff.y : (peerMesh ? peerMesh.position.y : 0),
        portInitials: this._collectDevicePortInitials(peerId),
        latestNorm: null
      });
    });

    this.dragMoveState = {
      deviceId: devId,
      startNormX: device.position.x,
      startNormY: device.position.y,
      startWorldX: devWorld.x,
      startWorldZ: devWorld.z,
      effY,
      plane: dragPlane,
      grabOffsetX: devWorld.x - hitPt.x,
      grabOffsetZ: devWorld.z - hitPt.z,
      meshOffsetX,
      meshOffsetZ,
      portInitials: this._collectDevicePortInitials(devId),
      peers,
      latestNorm: null
    };

    dom.setPointerCapture?.(e.pointerId);
  }

  updateDeviceDragMove(e) {
    const state = this.dragMoveState;
    if (!state) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;

    const newWorldX = hitPt.x + state.grabOffsetX;
    const newWorldZ = hitPt.z + state.grabOffsetZ;
    const { normX, normY } = this.worldToNorm(newWorldX, newWorldZ);
    const clampedWorld = this.normToWorld(normX, normY);

    const primaryShiftX = clampedWorld.x - state.startWorldX;
    const primaryShiftZ = clampedWorld.z - state.startWorldZ;

    const meshGroup = this.deviceMeshMap.get(state.deviceId);
    if (meshGroup) {
      meshGroup.position.x = clampedWorld.x + state.meshOffsetX;
      meshGroup.position.z = clampedWorld.z + state.meshOffsetZ;

      this.effectivePosMap.set(
        state.deviceId,
        new THREE.Vector3(meshGroup.position.x, state.effY, meshGroup.position.z)
      );
      state.portInitials.forEach(({ key, initial }) => {
        this.portWorldPosMap.set(
          key,
          new THREE.Vector3(initial.x + primaryShiftX, initial.y, initial.z + primaryShiftZ)
        );
      });
    }

    state.latestNorm = { x: normX, y: normY };

    if (state.peers.length > 0) {
      const deltaNormX = normX - state.startNormX;
      const deltaNormY = normY - state.startNormY;
      state.peers.forEach((peer) => {
        const pNormX = Math.max(0.01, Math.min(0.99, peer.startNormX + deltaNormX));
        const pNormY = Math.max(0.01, Math.min(0.99, peer.startNormY + deltaNormY));
        const pClampedWorld = this.normToWorld(pNormX, pNormY);
        const pShiftX = pClampedWorld.x - peer.startWorldX;
        const pShiftZ = pClampedWorld.z - peer.startWorldZ;

        if (peer.meshGroup) {
          peer.meshGroup.position.x = peer.meshStartX + pShiftX;
          peer.meshGroup.position.z = peer.meshStartZ + pShiftZ;
        }
        this.effectivePosMap.set(
          peer.id,
          new THREE.Vector3(peer.meshStartX + pShiftX, peer.effY, peer.meshStartZ + pShiftZ)
        );
        peer.portInitials.forEach(({ key, initial }) => {
          this.portWorldPosMap.set(
            key,
            new THREE.Vector3(initial.x + pShiftX, initial.y, initial.z + pShiftZ)
          );
        });
        peer.latestNorm = { x: pNormX, y: pNormY };
      });
    }

    this.syncCables();
  }

  finishDeviceDragMove(e, dom) {
    const state = this.dragMoveState;
    this.dragMoveState = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (!state?.latestNorm) return;

    const moves = [{ id: state.deviceId, position: state.latestNorm }];
    state.peers.forEach((peer) => {
      if (peer.latestNorm) {
        moves.push({ id: peer.id, position: peer.latestNorm });
      }
    });
    this.deviceManager.moveDeviceGroup(moves, { syncRenderer: true });
  }

  syncSelectionRings() {
    if (!this.isInitialized || !this.deviceMeshMap) return;
    const primaryId = this.deviceManager?.selectedDeviceId;
    this.deviceMeshMap.forEach((holder, devId) => {
      const isPrimary = primaryId === devId;
      const isSelected = Boolean(this.deviceManager?.isDeviceSelected?.(devId)) || isPrimary;
      holder.traverse((child) => {
        if (child.userData?.isSelectionRing) {
          child.visible = isSelected;
          if (child.material?.color) {
            child.material.color.setHex(isPrimary ? 0xfacc15 : 0x38bdf8);
          }
        }
      });
    });
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
    if (this.objects3dGroup.children.length > 0) box.expandByObject(this.objects3dGroup);

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

  setCableDiameterMultiplier(scaleVal) {
    this.cableDiameterMultiplier = Math.max(0.1, Number(scaleVal) || 1.0);
    if (this.isActive) {
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
    const scheduleSyncDevAndCables = () => {
      if (!this.isActive || this.dragMoveState) return;
      if (this._pendingSyncRaf) return;
      this._pendingSyncRaf = requestAnimationFrame(() => {
        this._pendingSyncRaf = null;
        if (!this.isActive || this.dragMoveState) return;
        this.syncDevices();
        this.syncCables();
      });
    };

    const handleSelectionVisuals = () => {
      if (!this.isActive) return;
      this.syncSelectionRings();
    };

    eventBus.on('device:added', scheduleSyncDevAndCables);
    eventBus.on('device:updated', scheduleSyncDevAndCables);
    eventBus.on('device:deleted', scheduleSyncDevAndCables);
    eventBus.on('device:moved', scheduleSyncDevAndCables);
    eventBus.on('device:selected', handleSelectionVisuals);
    eventBus.on('device:deselected', handleSelectionVisuals);
    eventBus.on('device:selection-changed', handleSelectionVisuals);

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

    const syncObjects3dOnly = () => {
      if (this.isActive && !this.object3dDragState) {
        this.syncObjects3d();
      }
    };
    eventBus.on('object3d:changed', syncObjects3dOnly);
    eventBus.on('object3d:selected', syncObjects3dOnly);
    eventBus.on('object3d:deselected', syncObjects3dOnly);

    eventBus.on('map:scale-changed', () => {
      if (this.isInitialized) {
        this.rebuildGround();
        if (this.isActive) this.syncAll();
      }
    });

    eventBus.on('map:image-changed', ({ src, image }) => {
      if (src) {
        this.activeMapUrl = src;
        this.activeMapImage = image || null;
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
        this.pending3dWaypoints = [];
        if (this.isActive) {
          this.syncDevices();
          this.syncCables();
        }
      }
    });

    eventBus.on('pen-tool:options-changed', ({ pathStyle, category }) => {
      if (pathStyle) this.pen3dPathStyle = pathStyle;
      if (category) this.pen3dCategory = category;
      if (this.isActive) this.syncCables();
    });

    eventBus.on('pen-tool:undo-3d-point', () => {
      if (this.pending3dWaypoints.length > 0) {
        this.pending3dWaypoints.pop();
        if (this.isActive) this.syncCables();
      }
    });

    eventBus.on('map3d:start-cable', ({ deviceId }) => {
      this.pendingCableSourceId = deviceId || null;
      this.pending3dWaypoints = [];
      if (this.isActive) {
        this.syncDevices();
        this.syncCables();
      }
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
