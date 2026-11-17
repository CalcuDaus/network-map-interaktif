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
  applyRoomGlbScale,
  create3DPortsSubGroup,
  createRobloxAvatar3DGroup,
  updateRobloxAvatarLabel,
  animateRobloxAvatarRig,
  createFppHandsViewmodelGroup
} from './map-3d-models.js';
import { clamp, generateId } from '../utils/helpers.js';
import { CAMPUS_MAP_DATA_URL } from './campus-map-data.js';
import {
  authManager,
  getPeerColorHex,
  AVATAR_SCALE_MIN,
  AVATAR_SCALE_MAX,
  AVATAR_SCALE_DEFAULT,
  AVATAR_SCALE_STEP,
  clampAvatarScale
} from '../storage/auth-manager.js';

const AVATAR_SCALE_STORAGE_KEY = 'netmap_avatar_scale_v1';
const BASE_AVATAR_COLLIDER = { radius: 0.48, height: 1.88, stepHeight: 0.38 };

const AVATAR_MOUSE_SENS_STORAGE_KEY = 'netmap_avatar_mouse_sens_v1';
export const AVATAR_MOUSE_SENS_MIN = 0.15;
export const AVATAR_MOUSE_SENS_MAX = 2.5;
export const AVATAR_MOUSE_SENS_DEFAULT = 1.0;
export const AVATAR_MOUSE_SENS_STEP = 0.05;
const AVATAR_MOUSE_SENS_BASE_RAD_PER_PX = 0.0016;

/**
 * Clamp Mode Teknisi mouse sensitivity multiplier to a smooth comfortable range.
 * @param {*} rawSens
 * @returns {number}
 */
export function clampAvatarMouseSensitivity(rawSens) {
  const n = Number(rawSens);
  if (!Number.isFinite(n) || n <= 0) return AVATAR_MOUSE_SENS_DEFAULT;
  const clamped = Math.min(AVATAR_MOUSE_SENS_MAX, Math.max(AVATAR_MOUSE_SENS_MIN, n));
  return Math.round(clamped * 100) / 100;
}

function resolveEngineAvatarScale(ctx) {
  if (ctx && typeof ctx.getAvatarScale === 'function') {
    return ctx.getAvatarScale();
  }
  return clampAvatarScale(ctx?.avatarScale);
}

function resolveEngineMouseSensitivity(ctx) {
  if (ctx && typeof ctx.getAvatarMouseSensitivity === 'function') {
    return ctx.getAvatarMouseSensitivity();
  }
  return clampAvatarMouseSensitivity(ctx?.avatarMouseSensitivity);
}

function buildScaledAvatarCollider(scale = AVATAR_SCALE_DEFAULT, base = BASE_AVATAR_COLLIDER) {
  const s = clampAvatarScale(scale);
  return {
    radius: Math.round((Number(base?.radius) || BASE_AVATAR_COLLIDER.radius) * s * 1000) / 1000,
    height: Math.round((Number(base?.height) || BASE_AVATAR_COLLIDER.height) * s * 1000) / 1000,
    stepHeight: Number(base?.stepHeight) || BASE_AVATAR_COLLIDER.stepHeight
  };
}

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
    this.room3dMeshMap = new Map(); // roomId -> THREE.Group
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
    this.navTool = 'orbit'; // 'orbit' | 'pan' | 'zoom' | 'look' | 'move' | 'rotate' | 'box' | 'draw3d'
    this.keysPressed = new Set();
    this.lastFrameTime = 0;
    this.cameraAnim = null; // { startPos, endPos, startTarget, endTarget, startTime, duration }
    this.isLookDragging = false;
    this.lookPrevPointer = { x: 0, y: 0 };
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.pendingCableSourceId = null;
    this.pendingCableSourcePort = '';
    this.pending3dWaypoints = [];
    this.pen3dPathStyle = 'curve';
    this.pen3dCategory = 'cat6';
    this.dragMoveState = null;
    this.dragRotateState = null;
    this.boxSelectState = null;
    this.activeDraw3dTemplate = { ...OBJECT3D_PRESETS.pole };
    this.object3dDragState = null;
    this.cableDragState = null;
    this._marqueeEl = null;
    this._temporarilyDisabledControlsForBox = false;
    this._pendingSyncRaf = null;

    // Simulator Auto-Focus View & Port Inspector HUD state
    let autoFocusPref = true;
    try {
      if (typeof localStorage !== 'undefined') {
        autoFocusPref = localStorage.getItem('netmap_sim_autofocus_3d') !== '0';
      }
    } catch { /* ignore storage errors */ }
    this.autoFocusOnClick = autoFocusPref;
    this.simulatorViewAngle = 'front'; // 'front' | 'stack' | 'iso' | 'side' | 'back'
    this.simulatorFocusedDeviceId = null;
    this.savedPreFocusCamera = null;

    // Mode Teknisi (Roblox-style engineer character + TPP/FPP perspective + Remote Multiplayer Peers) state
    this.avatarMode = false;
    this.avatarPerspective = 'tpp'; // 'tpp' | 'fpp'
    this.avatarGroup = null;
    this.fppViewmodelGroup = null;
    this.remoteAvatarsGroup = new THREE.Group();
    this.remoteAvatarsGroup.name = 'RemoteTechniciansGroup';
    this.remoteAvatarMap = new Map();
    this._lastPresenceEmitAt = 0;
    this._lastPresenceSnapshotKey = '';
    this._lastPeersHudKey = '';
    this._baseAvatarCollider = { radius: 0.48, height: 1.88, stepHeight: 0.38 };
    this.avatarScale = this._loadSavedAvatarScale();
    this.avatarMouseSensitivity = this._loadSavedAvatarMouseSensitivity();
    this.avatarCollider = this._computeAvatarCollider(this.avatarScale);
    this.deviceColliders = [];
    this.avatarState = {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      vy: 0,
      camYaw: 0,
      camPitch: 0.32,
      camDist: 5.8,
      _lastMouseClient: null,
      isGrounded: true,
      walkPhase: 0,
      isMoving: false,
      isRunning: false,
      isCarrying: false,
      nearestDeviceId: null,
      nearestDist: Infinity
    };
    this.carriedObjects = [];
    this.maxCarriedObjects = 8;
    this.objectCarryReachMeters = 6.5;
    this._lastAvatarHudNearestId = null;
    this._lastAvatarHudDistKey = '';
    this._lastAvatarHudCarryKey = '';

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
    this.scene.add(this.remoteAvatarsGroup);

    // Pointer interaction: Look-Around drag, Box/Marquee select, SketchUp Gizmo/Draw3D, click raycast
    const dom = this.renderer.domElement;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.container?.addEventListener('contextmenu', (e) => e.preventDefault());

    // Capture-phase guard so Box Select, Draw 3D, Cable Handles, or Push/Pull Gizmos intercept before OrbitControls starts orbiting/panning
    dom.addEventListener('pointerdown', (e) => {
      if (!this.isActive) return;
      if (stateManager.getMode() !== 'draw-cable' && e.button === 0) {
        const shouldBlockOrbit =
          this.navTool === 'box' ||
          this.navTool === 'draw3d' ||
          this.navTool === 'rotate' ||
          e.ctrlKey ||
          e.metaKey ||
          Boolean(this.checkCableHandleHitAtEvent(e)) ||
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
        const cableHandleHit = this.checkCableHandleHitAtEvent(e);
        if (cableHandleHit) {
          this.startCableHandleDrag(e, dom, cableHandleHit);
          return;
        }
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
        } else if (this.navTool === 'rotate') {
          this.startRotateDrag(e, dom);
        }
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (!this.isActive) return;
      if (this.cableDragState) {
        this.updateCableHandleDrag(e);
        return;
      }
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
      if (this.dragRotateState) {
        this.updateDeviceDragRotate(e);
        return;
      }
      if (this.avatarMode && !this.simulatorFocusedDeviceId) {
        const isLocked = typeof document !== 'undefined' && document.pointerLockElement === dom;
        if (isLocked) {
          this.avatarState._lastMouseClient = null;
          const dx = Math.abs(e.movementX || 0) <= 250 ? (e.movementX || 0) : 0;
          const dy = Math.abs(e.movementY || 0) <= 250 ? (e.movementY || 0) : 0;
          if (dx !== 0 || dy !== 0) {
            this.applyAvatarMouseLookDelta(dx, dy);
          }
          return;
        }
        if (e.buttons === 0 && !e.altKey) {
          const prev = this.avatarState._lastMouseClient;
          this.avatarState._lastMouseClient = { x: e.clientX, y: e.clientY };
          if (prev) {
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= 200 && Math.abs(dy) <= 200) {
              this.applyAvatarMouseLookDelta(dx, dy);
            }
          }
          return;
        }
        this.avatarState._lastMouseClient = null;
        return;
      }
      if (!this.isLookDragging) return;
      const dx = e.clientX - this.lookPrevPointer.x;
      const dy = e.clientY - this.lookPrevPointer.y;
      this.lookPrevPointer = { x: e.clientX, y: e.clientY };

      const sensitivity = 0.0022 * resolveEngineMouseSensitivity(this);
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
      if (this.cableDragState) {
        this.finishCableHandleDrag(e, dom);
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
      if (this.dragRotateState) {
        this.finishDeviceDragRotate(e, dom);
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

    dom.addEventListener('pointerleave', () => {
      if (this.avatarState) this.avatarState._lastMouseClient = null;
    });

    dom.addEventListener('wheel', (e) => {
      if (!this.isActive || !this.avatarMode || this.simulatorFocusedDeviceId) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.avatarPerspective === 'fpp') {
        if (e.deltaY > 0) {
          this.avatarState.camDist = 2.6;
          this.setAvatarPerspective('tpp');
        }
        return;
      }
      const nextDist = (this.avatarState.camDist || 5.8) + Math.sign(e.deltaY) * 0.65;
      if (e.deltaY < 0 && nextDist <= 1.6) {
        this.avatarState.camDist = 2.0;
        this.setAvatarPerspective('fpp');
        return;
      }
      this.avatarState.camDist = clamp(nextDist, 2.0, 22.0);
      this.syncAvatarCameraFromAngles();
    }, { passive: false });

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
    this.syncRemoteAvatars(authManager.getRemotePeers());
    this.publishLocalPresence(true);
    this.lastFrameTime = performance.now();
    this.startLoop();
  }

  deactivate() {
    this.isActive = false;
    this.keysPressed.clear();
    this.cameraAnim = null;
    this.isLookDragging = false;
    this.simulatorFocusedDeviceId = null;
    this.savedPreFocusCamera = null;
    this.pendingCableSourceId = null;
    this.pendingCableSourcePort = '';
    this.pending3dWaypoints = [];
    if (this.carriedObjects?.length > 0) {
      this.dropCarriedObjectsFromAvatar?.({ dropAll: true, silent: true });
    }
    this.avatarMode = false;
    this.avatarState._lastMouseClient = null;
    this.avatarState.isCarrying = false;
    if (this.avatarGroup) this.avatarGroup.visible = false;
    if (this.fppViewmodelGroup) this.fppViewmodelGroup.visible = false;
    authManager.updateLocalPresence({ viewMode: '2d', avatarMode: false, isMoving: false, isRunning: false, isCarrying: false });
    this.releaseAvatarPointerLock();
    this.syncAvatarCrosshair();
    this.syncAvatarControlsUI();
    this.configureControlsForAvatarMode(false);
    if (typeof document !== 'undefined') {
      const avatarHudEl = document.getElementById('hud-3d-avatar-bar');
      if (avatarHudEl) {
        avatarHudEl.innerHTML = '';
        avatarHudEl.classList.add('hidden');
        avatarHudEl.style.display = 'none';
      }
      const hudEl = document.getElementById('hud-3d-sim-inspector');
      if (hudEl) {
        hudEl.innerHTML = '';
        hudEl.classList.add('hidden');
        hudEl.style.display = 'none';
      }
    }
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
      if (this.avatarMode) {
        this.updateAvatarController(dt);
      } else {
        this.updateWalkMovement(dt);
        this.publishLocalPresence(false);
      }
      this.updateRemoteAvatars(dt);
      this.controls?.update();
      this.syncFppViewmodelTransform();
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

  _attachRoomFallbackMesh(room, roomGroup) {
    if (!roomGroup || roomGroup.userData?.hasFallbackRoomMesh) return;
    const w = Math.max(2, Number(room.widthMeters) || 14);
    const d = Math.max(2, Number(room.depthMeters) || 12);
    const h = Math.max(1.5, Number(room.heightMeters) || 4);
    const wallHex = room.wallColor || '#2a7c13';
    const floorHex = room.floorColor || '#1e293b';

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({
        color: floorHex,
        roughness: 0.9,
        metalness: 0.05,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
      })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.04;
    floorMesh.userData.roomId = room.id;

    const wallBox = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: wallHex,
        transparent: true,
        opacity: Math.max(0.12, Math.min(0.45, Number(room.opacity) || 0.2)),
        roughness: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    wallBox.position.y = h / 2;
    wallBox.userData.roomId = room.id;

    roomGroup.add(floorMesh);
    roomGroup.add(wallBox);
    roomGroup.userData.hasFallbackRoomMesh = true;
  }

  _mountRoomGlbIntoGroup(roomGroup, glb, room) {
    if (!roomGroup || !glb || !room) return;
    if (roomGroup.userData.placeholderWireframe) {
      roomGroup.remove(roomGroup.userData.placeholderWireframe);
      roomGroup.userData.placeholderWireframe.geometry?.dispose?.();
      roomGroup.userData.placeholderWireframe.material?.dispose?.();
      roomGroup.userData.placeholderWireframe = null;
    }
    const colScale = applyRoomGlbScale(glb, room);
    glb.traverse((c) => {
      c.userData.roomId = room.id;
    });
    roomGroup.add(glb);
    roomGroup.userData.attachedRoomGlb = glb;
    roomGroup.userData.attachedRoomUrl = room.customModelUrl;
    roomGroup.userData.roomCollisionProfile = glb.userData?.collisionProfile || null;
    roomGroup.userData.roomCollisionScale = colScale;
  }

  _attachRoomCustomGlb(room, roomGroup) {
    if (!room?.customModelUrl || !roomGroup) return;
    loadCustomGlbModel(room.customModelUrl, 1.0)
      .then((glb) => {
        if (!this.roomsGroup.children.includes(roomGroup)) return;
        this._mountRoomGlbIntoGroup(roomGroup, glb, room);
      })
      .catch((err) => {
        console.warn('[Map3DEngine] Custom room GLB failed:', err);
        if (!this.roomsGroup.children.includes(roomGroup)) return;
        this._attachRoomFallbackMesh(room, roomGroup);
        this.showStatusHint?.(
          `⚠️ Model GLB "${room.name || 'Ruangan 3D'}" gagal dimuat — menampilkan bentuk fallback.`
        );
      });
  }

  syncRooms() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.roomsGroup);
    this.room3dMeshMap.clear();

    const rooms = stateManager.getRooms3d();
    const selectedRoomId = stateManager.getSelectedRoom3dId?.() || null;
    rooms.forEach((room) => {
      const roomGroup = create3DRoomGroup(
        room,
        (nx, ny) => this.normToWorld(nx, ny),
        room.id === selectedRoomId
      );
      roomGroup.userData.roomId = room.id;
      this.roomsGroup.add(roomGroup);
      this.room3dMeshMap.set(room.id, roomGroup);
      this._attachRoomCustomGlb(room, roomGroup);
    });
  }

  rebuildSingleRoom3dMesh(room, isSelected = true) {
    if (!this.isInitialized || !room?.id) return null;
    const prev = this.room3dMeshMap.get(room.id);
    let reusedGlb = null;
    if (prev) {
      if (
        prev.userData?.attachedRoomGlb &&
        prev.userData?.attachedRoomUrl === room.customModelUrl
      ) {
        reusedGlb = prev.userData.attachedRoomGlb;
        prev.remove(reusedGlb);
      }
      this.roomsGroup.remove(prev);
      this._disposeObject3DResources(prev);
    }
    const next = create3DRoomGroup(room, (nx, ny) => this.normToWorld(nx, ny), isSelected);
    next.userData.roomId = room.id;
    this.roomsGroup.add(next);
    this.room3dMeshMap.set(room.id, next);

    if (reusedGlb) {
      this._mountRoomGlbIntoGroup(next, reusedGlb, room);
    } else {
      this._attachRoomCustomGlb(room, next);
    }
    return next;
  }

  focusOnRoom3d(roomId, { duration = 450 } = {}) {
    const room = stateManager.getRoom3dById?.(roomId);
    if (!room) return false;
    const wPos = this.normToWorld(room.x ?? 0.5, room.y ?? 0.5);
    const span = Math.max(12, Math.max(Number(room.widthMeters) || 14, Number(room.depthMeters) || 12) * 1.45);
    const h = Math.max(2, Number(room.heightMeters) || 4);
    const target = new THREE.Vector3(wPos.x, h * 0.35, wPos.z);
    const endPos = new THREE.Vector3(wPos.x + span * 0.6, Math.max(12, h + span * 0.55), wPos.z + span * 0.72);
    this.animateCameraTo(endPos, target, duration);
    return true;
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
    if (this.avatarMode && this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }
  }

  rebuildSingleObject3dMesh(obj, isSelected = true) {
    if (!this.isInitialized || !obj?.id) return;
    const prev = this.object3dMeshMap.get(obj.id);
    if (prev) {
      this.objects3dGroup.remove(prev);
      this._disposeObject3DResources(prev);
    }
    const next = createCustomObject3DGroup(obj, (nx, ny) => this.normToWorld(nx, ny), isSelected);
    this.objects3dGroup.add(next);
    this.object3dMeshMap.set(obj.id, next);
    return next;
  }

  getDeviceCollisionFootprint(dev, userModelScale = 1) {
    const scale = Math.max(0.1, Number(userModelScale) || this.deviceScaleMultiplier || 3.0);
    const type = String(dev?.type || '').toLowerCase();
    const model = String(dev?.model || '').toLowerCase();
    let rawW = 0.72;
    let rawH = 0.5;
    let rawD = 0.5;

    if (dev?.spatial3d?.customModelUrl) {
      rawW = 1.05;
      rawH = 1.1;
      rawD = 0.85;
    } else if (type === 'network-rack') {
      rawW = 1.25;
      rawH = 2.4;
      rawD = 1.25;
    } else if (['server', 'nvr', 'storage', 'database'].includes(type)) {
      rawW = 1.0;
      rawH = 0.34;
      rawD = 1.3;
    } else if (['odp', 'patch-panel', 'fo-terminal'].includes(type)) {
      rawW = 0.68;
      rawH = 0.85;
      rawD = 0.35;
    } else if (type === 'access-point' || model.includes('rap')) {
      rawW = 0.72;
      rawH = 0.14;
      rawD = 0.72;
    } else if (['wireless-bridge', 'network-pole'].includes(type) || model.includes('dish')) {
      rawW = 0.7;
      rawH = 0.9;
      rawD = 0.5;
    } else if (['managed-switch', 'core-switch', 'switch', 'hub', 'unmanaged-switch', 'ruijie-switch'].includes(type)) {
      const isCompact = type === 'hub' || type === 'unmanaged-switch' || model.includes('8-port') || model.includes('5-port');
      rawW = isCompact ? 0.66 : 1.04;
      rawH = isCompact ? 0.14 : 0.2;
      rawD = isCompact ? 0.44 : 0.68;
    } else if (['router', 'firewall', 'ruijie-eg'].includes(type)) {
      const isCompact = model.includes('mikrotik') || model.includes('hex') || model.includes('rb750');
      rawW = isCompact ? 0.68 : 1.02;
      rawH = 0.22;
      rawD = isCompact ? 0.5 : 0.68;
    } else if (type === 'cctv') {
      rawW = 0.32;
      rawH = 0.33;
      rawD = 0.44;
    }

    return {
      halfW: (rawW * 0.5) * scale,
      halfD: (rawD * 0.5) * scale,
      height: rawH * scale
    };
  }

  syncDevices() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.devicesGroup);
    this.clearGroup(this.coverageGroup);
    this.deviceMeshMap.clear();
    this.effectivePosMap.clear();
    this.portWorldPosMap.clear();
    this.portWorldDirMap.clear();
    this.deviceColliders = [];

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
      const devEuler = this.getDeviceEuler(dev);

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
      this.registerDevicePortTransforms(dev, devPorts, finalX, finalY, finalZ, userModelScale, devEuler);

      const devFootprint = this.getDeviceCollisionFootprint(dev, userModelScale);
      if (dev.layerVisible !== false) {
        this.deviceColliders.push({
          id: dev.id,
          kind: 'box',
          category: 'device',
          x: finalX,
          z: finalZ,
          baseY: finalY,
          topY: finalY + devFootprint.height,
          halfW: devFootprint.halfW,
          halfD: devFootprint.halfD,
          rotY: devEuler.y || 0
        });
      }

      const hasCustomGlb = Boolean(dev.spatial3d?.customModelUrl);
      const modelContainer = new THREE.Group();
      modelContainer.name = 'DeviceModelContainer';
      modelContainer.scale.setScalar(userModelScale);
      modelContainer.rotation.copy(devEuler);
      const proceduralMesh = createDevice3DMesh(dev, cat.color, statusDef.color);
      modelContainer.add(proceduralMesh);
      if (!hasCustomGlb) {
        modelContainer.add(create3DPortsSubGroup(devPorts, portStatusMap, false));
      }
      holder.userData.devPorts = devPorts;
      holder.userData.userModelScale = userModelScale;
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
            holder.userData.devPorts = devPorts;
            this.registerDevicePortTransforms(dev, devPorts, finalX, finalY, finalZ, userModelScale, this.getDeviceEuler(dev));

            if (typeof THREE?.Box3 === 'function') {
              try {
                const glbBox = new THREE.Box3().setFromObject(glb);
                if (!glbBox.isEmpty()) {
                  const glbSize = new THREE.Vector3();
                  glbBox.getSize(glbSize);
                  const targetCollider = this.deviceColliders?.find((c) => c.id === dev.id);
                  if (targetCollider) {
                    targetCollider.halfW = Math.max(0.25, glbSize.x * 0.5 * userModelScale);
                    targetCollider.halfD = Math.max(0.25, glbSize.z * 0.5 * userModelScale);
                    targetCollider.baseY = Math.max(0, finalY + glbBox.min.y * userModelScale);
                    targetCollider.topY = targetCollider.baseY + Math.max(0.15, glbSize.y * userModelScale);
                  }
                }
              } catch {
                // ignore mock/non-geometry bounds
              }
            }

            modelContainer.clear();
            modelContainer.add(glb);
            modelContainer.add(create3DPortsSubGroup(devPorts, updatedStatusMap, true));
            this.tagDescendantDeviceId(modelContainer, dev.id);
            this.syncCables();
            if (this.simulatorFocusedDeviceId === dev.id) {
              this.focusOnDevice(dev.id, {
                viewAngle: this.simulatorViewAngle || 'front',
                saveReturnCamera: false,
                duration: 220
              });
            }
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

      // Active Cable Source Ring (when drawing cable in 3D or Simulator port patching)
      if ((stateManager.getMode() === 'draw-cable' || this.pendingCableSourcePort) && this.pendingCableSourceId === dev.id) {
        const srcRing = new THREE.Mesh(
          new THREE.RingGeometry(1.25 * userModelScale, 1.52 * userModelScale, 32),
          new THREE.MeshBasicMaterial({ color: 0x0ea5e9, side: THREE.DoubleSide })
        );
        srcRing.rotation.x = -Math.PI / 2;
        srcRing.position.y = 0.06;
        srcRing.raycast = () => {};
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
    if (this.avatarMode && this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }
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

  getDeviceEuler(dev) {
    const rx = ((Number(dev?.spatial3d?.rotationX) || 0) * Math.PI) / 180;
    const ry = ((Number(dev?.spatial3d?.rotationY) || 0) * Math.PI) / 180;
    const rz = ((Number(dev?.spatial3d?.rotationZ) || 0) * Math.PI) / 180;
    return new THREE.Euler(rx, ry, rz, 'YXZ');
  }

  registerDevicePortTransforms(dev, devPorts, finalX, finalY, finalZ, userModelScale, rotOrEuler) {
    const euler = (rotOrEuler && rotOrEuler.isEuler)
      ? rotOrEuler
      : new THREE.Euler(0, Number(rotOrEuler) || 0, 0, 'YXZ');
    devPorts.forEach((p) => {
      const rawLx = typeof p.local3d?.x === 'number' ? p.local3d.x : 0;
      const rawLy = typeof p.local3d?.y === 'number' ? p.local3d.y : 0.12;
      const rawLz = typeof p.local3d?.z === 'number' ? p.local3d.z : 0.36;
      const localVec = new THREE.Vector3(
        rawLx * userModelScale,
        rawLy * userModelScale,
        rawLz * userModelScale
      ).applyEuler(euler);
      const key = `${dev.id}::${p.name}`;
      this.portWorldPosMap.set(key, new THREE.Vector3(finalX + localVec.x, finalY + localVec.y, finalZ + localVec.z));
      const zSign = rawLz < -0.015 ? -1 : 1;
      const dirVec = new THREE.Vector3(0, 0, zSign).applyEuler(euler).normalize();
      this.portWorldDirMap.set(key, dirVec);
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

      const srcDir = (hasSrcPort && this.portWorldDirMap.get(srcPortKey))
        || new THREE.Vector3(0, 0, 1).applyEuler(this.getDeviceEuler(srcDev)).normalize();
      const dstDir = (hasDstPort && this.portWorldDirMap.get(dstPortKey))
        || new THREE.Vector3(0, 0, 1).applyEuler(this.getDeviceEuler(dstDev)).normalize();

      // Local orthonormal frame for the cable span
      const outDir = srcDir.clone().add(dstDir);
      if (outDir.lengthSq() < 0.01) {
        outDir.set(-(dstPos.z - srcPos.z), 0, dstPos.x - srcPos.x);
      }
      if (outDir.lengthSq() < 0.01) {
        outDir.set(0, 0, 1);
      }
      outDir.normalize();

      const sideDir = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outDir);
      if (sideDir.lengthSq() < 0.01) {
        sideDir.set(1, 0, 0);
      }
      sideDir.normalize();

      const vertDist = Math.abs(srcPos.y - dstPos.y);
      const portDist = srcPos.distanceTo(dstPos);

      const rawTension = typeof cable.details?.curveTension === 'number' ? cable.details.curveTension : 0.38;
      const tensionScale = Math.max(0.2, rawTension / 0.38);
      const hasCustomBow = typeof cable.details?.bowOut === 'number' && !isNaN(cable.details.bowOut);
      const hasCustomSag = typeof cable.details?.sagDrop === 'number' && !isNaN(cable.details.sagDrop);
      const hasCustomSide = typeof cable.details?.sideOffset === 'number' && !isNaN(cable.details.sideOffset) && cable.details.sideOffset !== 0;

      const fanStep = ((cableIdx % 5) - 2) * 0.008 * avgPortScale;
      const autoBowUnits = ((hasSrcPort || hasDstPort)
        ? Math.max(0.09, Math.min(0.36, (vertDist / Math.max(0.3, avgPortScale)) * 0.42 + (portDist / Math.max(0.3, avgPortScale)) * 0.14))
        : 0.04) * tensionScale;
      const bowUnits = hasCustomBow
        ? cable.details.bowOut * (0.6 + 0.4 * tensionScale)
        : autoBowUnits;
      const bowDist = bowUnits * avgPortScale + (!hasCustomBow ? fanStep : 0);

      const autoSagUnits = ((vertDist < 0.18 * avgPortScale)
        ? (0.09 + Math.min(0.08, portDist / Math.max(0.3, avgPortScale) * 0.12))
        : Math.min(0.14, portDist / Math.max(0.3, avgPortScale) * 0.12)) * tensionScale;
      const sagUnits = hasCustomSag
        ? cable.details.sagDrop * (0.6 + 0.4 * tensionScale)
        : autoSagUnits;
      const sagDist = sagUnits * avgPortScale;

      const sideUnits = (typeof cable.details?.sideOffset === 'number' && !isNaN(cable.details.sideOffset))
        ? cable.details.sideOffset * (0.6 + 0.4 * tensionScale)
        : 0;
      const sideDist = sideUnits * avgPortScale;

      const bootLenSrc = 0.028 * srcScale;
      const bootLenDst = 0.028 * dstScale;
      const srcBootTipWorld = hasSrcPort ? srcPos.clone().addScaledVector(srcDir, bootLenSrc) : srcPos.clone();
      const dstBootTipWorld = hasDstPort ? dstPos.clone().addScaledVector(dstDir, bootLenDst) : dstPos.clone();

      const pts = [];
      if (hasSrcPort && !isWireless) {
        // Anchor slightly inside the RJ45/SFP socket cavity so the cable plugs in 100% flush with zero gap
        pts.push(srcPos.clone().addScaledVector(srcDir, -0.008 * srcScale));
        pts.push(srcPos.clone());
        pts.push(srcBootTipWorld.clone());
      } else {
        pts.push(srcPos.clone());
      }

      const pathStyle = cable.details?.pathStyle || 'curve';
      const hasCustomElev = typeof cable.details?.elevationZ === 'number' && !isNaN(cable.details.elevationZ);
      const trayY = hasCustomElev
        ? Math.max(0.02, cable.details.elevationZ)
        : Math.max(0.06, Math.min(srcPos.y, dstPos.y));
      let waypointMarkers = [];

      const wpBowOffset = new THREE.Vector3();
      if (pathStyle === 'curve' && (hasCustomBow || hasCustomSide || hasCustomSag)) {
        if (hasCustomBow) wpBowOffset.addScaledVector(outDir, bowUnits * avgPortScale);
        if (hasCustomSide) wpBowOffset.addScaledVector(sideDir, sideDist);
        if (hasCustomSag) wpBowOffset.y -= sagDist * 0.5;
      }

      if (Array.isArray(cable.route) && cable.route.length > 0) {
        const rawWps = cable.route.map((wp) => {
          const wpWorld = this.normToWorld(wp.x, wp.y);
          const wpY = (typeof wp.z === 'number' && !isNaN(wp.z)) ? Math.max(0.02, wp.z) : trayY;
          return new THREE.Vector3(wpWorld.x, wpY, wpWorld.z);
        });
        if (pathStyle === 'orthogonal') {
          waypointMarkers = rawWps;
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
            const dstExitRef = hasDstPort ? dstPos.clone().addScaledVector(dstDir, bootLenDst) : dstPos;
            pts.push(new THREE.Vector3(dstExitRef.x, prevPt.y, dstExitRef.z));
          }
        } else {
          const shapedWps = rawWps.map((wpVec) => {
            const v = wpVec.clone().add(wpBowOffset);
            v.y = Math.max(0.02, v.y);
            return v;
          });
          waypointMarkers = shapedWps;
          if (pathStyle === 'curve' && hasSrcPort && !isWireless) {
            pts.push(srcPos.clone().addScaledVector(srcDir, Math.max(0.045 * srcScale, Math.abs(bowDist) * 0.35)));
          }
          shapedWps.forEach((wpVec) => pts.push(wpVec));
          if (pathStyle === 'curve' && hasDstPort && !isWireless) {
            pts.push(dstPos.clone().addScaledVector(dstDir, Math.max(0.045 * dstScale, Math.abs(bowDist) * 0.35)));
          }
        }
      } else if (hasCustomElev && !isWireless) {
        // Lift/drop direct cable cleanly to the custom Z tray elevation
        const srcExitPt = pts[pts.length - 1];
        const dstExitPt = hasDstPort ? dstPos.clone().addScaledVector(dstDir, bootLenDst) : dstPos;
        const riserA = srcExitPt.clone().lerp(dstExitPt, 0.06);
        riserA.y = trayY;
        const riserB = srcExitPt.clone().lerp(dstExitPt, 0.94);
        riserB.y = trayY;
        pts.push(riserA);
        if (pathStyle === 'orthogonal' && Math.abs(riserB.x - riserA.x) > 0.1 && Math.abs(riserB.z - riserA.z) > 0.1) {
          pts.push(new THREE.Vector3(riserB.x, trayY, riserA.z));
        } else if (pathStyle === 'curve' && (hasCustomBow || hasCustomSide || hasCustomSag)) {
          const elevMid = riserA.clone().lerp(riserB, 0.5)
            .addScaledVector(outDir, bowDist)
            .addScaledVector(sideDir, sideDist);
          elevMid.y = Math.max(0.02, elevMid.y - sagDist * 0.5);
          pts.push(elevMid);
        }
        pts.push(riserB);
      } else if (pathStyle === 'orthogonal' && !isWireless) {
        const prevPt = pts[pts.length - 1];
        if (Math.abs(dstPos.x - prevPt.x) > 0.1 && Math.abs(dstPos.z - prevPt.z) > 0.1) {
          pts.push(new THREE.Vector3(dstPos.x, trayY, prevPt.z));
        }
      } else if (!isWireless && pathStyle === 'curve') {
        const srcBootTip = hasSrcPort ? srcPos.clone().addScaledVector(srcDir, bootLenSrc) : srcPos.clone();
        const dstBootTip = hasDstPort ? dstPos.clone().addScaledVector(dstDir, bootLenDst) : dstPos.clone();

        const sameFace = srcDir.dot(dstDir) > 0.2;
        const frontBaseProj = Math.max(srcBootTip.dot(outDir), dstBootTip.dot(outDir));
        const pushToFrontPlane = (pt, extraBow) => {
          if (!sameFace) {
            pt.addScaledVector(outDir, extraBow);
            return pt;
          }
          if (bowDist >= 0) {
            const curProj = pt.dot(outDir);
            const targetProj = frontBaseProj + extraBow;
            if (targetProj > curProj) {
              pt.addScaledVector(outDir, targetProj - curProj);
            }
          } else {
            pt.addScaledVector(outDir, extraBow);
          }
          return pt;
        };

        const srcShoulder = srcBootTip.clone().lerp(dstBootTip, 0.22)
          .addScaledVector(sideDir, sideDist * 0.55);
        pushToFrontPlane(srcShoulder, bowDist * 0.72);

        const midApex = srcBootTip.clone().lerp(dstBootTip, 0.50)
          .addScaledVector(sideDir, sideDist);
        pushToFrontPlane(midApex, bowDist + (sagDist > 0 ? sagDist * 0.28 : 0));

        const dstShoulder = srcBootTip.clone().lerp(dstBootTip, 0.78)
          .addScaledVector(sideDir, sideDist * 0.55);
        pushToFrontPlane(dstShoulder, bowDist * 0.72);

        const minPortY = Math.min(srcBootTip.y, dstBootTip.y);
        if (sagDist > 0) {
          midApex.y = Math.max(0.02, Math.min(midApex.y - sagDist, minPortY - sagDist * 0.55 + vertDist * 0.12));
          if (srcBootTip.y >= dstBootTip.y) {
            srcShoulder.y = Math.max(0.02, srcShoulder.y - sagDist * 0.28);
            dstShoulder.y = Math.max(0.02, minPortY - sagDist * 0.45);
          } else {
            srcShoulder.y = Math.max(0.02, minPortY - sagDist * 0.45);
            dstShoulder.y = Math.max(0.02, dstShoulder.y - sagDist * 0.28);
          }
        } else if (sagDist < 0) {
          const archUp = Math.abs(sagDist);
          srcShoulder.y = Math.max(0.02, srcShoulder.y + archUp * 0.55);
          midApex.y = Math.max(0.02, midApex.y + archUp);
          dstShoulder.y = Math.max(0.02, dstShoulder.y + archUp * 0.55);
        }

        pts.push(srcShoulder, midApex, dstShoulder);
      }

      if (hasDstPort && !isWireless) {
        pts.push(dstPos.clone().addScaledVector(dstDir, bootLenDst));
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
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(40, cleanPts.length * 16), radius, 12, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: isSelected ? 0.48 : (isWireless ? 0.55 : 0.16),
        roughness: 0.4,
        metalness: 0.08,
        transparent: isWireless,
        opacity: isWireless ? 0.72 : 1.0
      });

      const mesh = new THREE.Mesh(tubeGeo, tubeMat);
      mesh.userData = {
        cableId: cable.id,
        cableTubeSelected: isSelected,
        curve,
        linearMid: srcPos.clone().add(dstPos).multiplyScalar(0.5),
        outDir: outDir.clone(),
        sideDir: sideDir.clone(),
        avgPortScale
      };
      mesh.castShadow = !isWireless;
      this.cablesGroup.add(mesh);
      this.cableMeshMap.set(cable.id, mesh);

      // 3D RJ45 Strain-Relief Boots at port endpoints
      if (!isWireless) {
        const upAxis = new THREE.Vector3(0, 1, 0);
        const bootMat = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: isSelected ? 0.42 : 0.1,
          roughness: 0.35,
          metalness: 0.12
        });
        if (hasSrcPort) {
          const srcBootGeo = new THREE.CylinderGeometry(radius * 1.15, radius * 1.45, bootLenSrc, 10);
          const srcBoot = new THREE.Mesh(srcBootGeo, bootMat);
          srcBoot.position.copy(srcPos).addScaledVector(srcDir, bootLenSrc * 0.45);
          srcBoot.quaternion.setFromUnitVectors(upAxis, srcDir.clone().normalize());
          srcBoot.userData.cableId = cable.id;
          this.cablesGroup.add(srcBoot);
        }
        if (hasDstPort) {
          const dstBootGeo = new THREE.CylinderGeometry(radius * 1.15, radius * 1.45, bootLenDst, 10);
          const dstBoot = new THREE.Mesh(dstBootGeo, bootMat);
          dstBoot.position.copy(dstPos).addScaledVector(dstDir, bootLenDst * 0.45);
          dstBoot.quaternion.setFromUnitVectors(upAxis, dstDir.clone().normalize());
          dstBoot.userData.cableId = cable.id;
          this.cablesGroup.add(dstBoot);
        }
      }

      // Interactive 3D Curve Handles when selected
      if (isSelected && !isWireless) {
        const apexPt = curve.getPoint(0.5);
        const apexGeo = new THREE.SphereGeometry(Math.max(0.11, radius * 3.2, 0.048 * avgPortScale), 14, 14);
        const apexMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0xffffff,
          emissiveIntensity: 0.45,
          roughness: 0.2
        });
        const apexDot = new THREE.Mesh(apexGeo, apexMat);
        apexDot.position.copy(apexPt);
        apexDot.userData = {
          cableId: cable.id,
          cableHandleType: 'apex',
          linearMid: srcPos.clone().add(dstPos).multiplyScalar(0.5),
          outDir: outDir.clone(),
          sideDir: sideDir.clone(),
          avgPortScale
        };
        this.cablesGroup.add(apexDot);

        if (waypointMarkers.length === 0) {
          const qGeo = new THREE.SphereGeometry(Math.max(0.08, radius * 2.4, 0.035 * avgPortScale), 12, 12);
          const qMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
          [0.25, 0.75].forEach((tVal) => {
            const qPt = curve.getPoint(tVal);
            const qDot = new THREE.Mesh(qGeo, qMat);
            qDot.position.copy(qPt);
            qDot.userData = {
              cableId: cable.id,
              cableHandleType: 'add-waypoint',
              insertIdx: 0,
              tVal,
              bowOffset: wpBowOffset.clone()
            };
            this.cablesGroup.add(qDot);
          });
        }
      }

      if (isSelected && waypointMarkers.length > 0) {
        const wpGeo = new THREE.SphereGeometry(Math.max(0.08, radius * 2.4, 0.035 * avgPortScale), 12, 12);
        const wpMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const stemMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.45 });
        waypointMarkers.forEach((wpVec, idx) => {
          const wpDot = new THREE.Mesh(wpGeo, wpMat);
          wpDot.position.copy(wpVec);
          wpDot.userData = {
            cableId: cable.id,
            cableHandleType: 'waypoint',
            waypointIdx: idx,
            bowOffset: wpBowOffset.clone()
          };
          this.cablesGroup.add(wpDot);

          const stemGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(wpVec.x, 0.01, wpVec.z),
            wpVec.clone()
          ]);
          this.cablesGroup.add(new THREE.Line(stemGeo, stemMat));
        });

        // Translucent Pen-Tool control polygon + per-segment "+" add-waypoint handles
        if (!isWireless) {
          const ctrlPts = [srcBootTipWorld.clone(), ...waypointMarkers, dstBootTipWorld.clone()];
          const ctrlGeo = new THREE.BufferGeometry().setFromPoints(ctrlPts);
          const ctrlMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
          this.cablesGroup.add(new THREE.Line(ctrlGeo, ctrlMat));

          const midGeo = new THREE.SphereGeometry(Math.max(0.065, radius * 1.9, 0.028 * avgPortScale), 10, 10);
          const midMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
          const segCount = waypointMarkers.length + 1;
          for (let segIdx = 0; segIdx < segCount; segIdx++) {
            const tVal = (segIdx + 0.5) / segCount;
            const mPt = curve.getPoint(tVal);
            const mDot = new THREE.Mesh(midGeo, midMat);
            mDot.position.copy(mPt);
            mDot.userData = {
              cableId: cable.id,
              cableHandleType: 'add-waypoint',
              insertIdx: segIdx,
              tVal,
              bowOffset: wpBowOffset.clone()
            };
            this.cablesGroup.add(mDot);
          }
        }
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

  findPortNameFromObject(obj) {
    let cur = obj;
    while (cur && cur !== this.devicesGroup) {
      if (cur.userData?.portName) return cur.userData.portName;
      cur = cur.parent;
    }
    return '';
  }

  handleCanvasClick(e) {
    const isPointerLocked = typeof document !== 'undefined' && document.pointerLockElement === this.renderer?.domElement;
    if (isPointerLocked) {
      this.pointer.set(0, 0);
    } else {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 1. Raycast Devices & Cables; prioritize foreground Cables/Handles outside draw-cable mode
    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    const cableHitsPre = stateManager.getMode() !== 'draw-cable'
      ? this.raycaster.intersectObjects(this.cablesGroup.children, true)
      : [];

    if (cableHitsPre.length > 0 && (
      devHits.length === 0 ||
      cableHitsPre[0].distance <= devHits[0].distance + 0.25 ||
      Boolean(cableHitsPre[0].object?.userData?.cableHandleType)
    )) {
      const cabId = cableHitsPre[0].object.userData?.cableId;
      if (cabId) {
        stateManager.deselectObject3d?.();
        stateManager.deselectRoom3d?.();
        this.cableManager.selectConnection(cabId);
        return;
      }
    }

    if (devHits.length > 0) {
      const devId = this.findDeviceIdFromObject(devHits[0].object);
      const hitPortName = this.findPortNameFromObject(devHits[0].object);
      if (devId) {
        if (stateManager.getMode() === 'draw-cable') {
          if (!this.pendingCableSourceId) {
            this.pendingCableSourceId = devId;
            this.pendingCableSourcePort = hitPortName || '';
            this.pending3dWaypoints = [];
            this.deviceManager.selectDevice(devId);
            this.syncDevices();
            const srcDev = this.deviceManager.getDeviceById(devId);
            const portHint = hitPortName ? ` [${hitPortName}]` : '';
            this.showStatusHint(`Pen Tool 3D: Sumber "${srcDev?.name || devId}"${portHint}. Klik lantai untuk titik belok (Shift=45°/90°), atau klik perangkat/port tujuan.`);
            if (this.simulatorFocusedDeviceId) {
              this.renderSimulatorInspectorHud(devId);
            }
            return;
          }
          if (this.pendingCableSourceId === devId) {
            this.showStatusHint('Perangkat tujuan tidak boleh sama dengan perangkat sumber.');
            return;
          }
          const srcDev = this.deviceManager.getDeviceById(this.pendingCableSourceId);
          const dstDev = this.deviceManager.getDeviceById(devId);
          const newCab = this.cableManager.addConnection({
            name: `Link ${srcDev?.name || 'Source'} -> ${dstDev?.name || 'Dest'}`,
            source: this.pendingCableSourceId,
            destination: devId,
            cableCategory: this.pen3dCategory || 'cat6',
            route: [...this.pending3dWaypoints],
            status: 'active',
            details: {
              pathStyle: this.pen3dPathStyle || 'curve',
              curveTension: 0.38,
              ...(this.pendingCableSourcePort ? { portSource: this.pendingCableSourcePort } : {}),
              ...(hitPortName ? { portDestination: hitPortName } : {})
            }
          });
          this.pendingCableSourceId = null;
          this.pendingCableSourcePort = '';
          this.pending3dWaypoints = [];
          stateManager.setMode('select');
          this.syncDevices();
          if (newCab) {
            this.cableManager.selectConnection(newCab.id);
            this.syncCables();
            this.showStatusHint(`Kabel terhubung: "${newCab.name}" — Pilih port interface.`);
            if (!hitPortName) {
              eventBus.emit('cable:prompt-port-picker', { cableId: newCab.id });
            }
          }
          return;
        }

        // Simulator Port Patching outside draw-cable mode:
        // Direct click on a destination 3D port cavity completes the pending patch cord immediately
        if (this.pendingCableSourceId && this.pendingCableSourcePort && hitPortName && this.pendingCableSourceId !== devId) {
          this.handleSimulatorPortClick(devId, hitPortName);
          return;
        }

        // Direct click on a 3D port socket of the already-focused device selects cable or starts patching
        if (hitPortName && this.simulatorFocusedDeviceId === devId && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          this.handleSimulatorPortClick(devId, hitPortName);
          return;
        }

        stateManager.deselectObject3d?.();
        stateManager.deselectRoom3d?.();
        this.deviceManager.selectDevice(devId, {
          toggle: Boolean(e.ctrlKey || e.metaKey),
          additive: Boolean(e.shiftKey)
        });
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          if (this.autoFocusOnClick || this.simulatorFocusedDeviceId) {
            this.focusOnDevice(devId, { viewAngle: this.simulatorViewAngle || 'front' });
          }
        }
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
        stateManager.deselectRoom3d?.();
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
        stateManager.deselectRoom3d?.();
        this.cableManager.selectConnection(cabId);
        return;
      }
    }

    // 3b. Check Ruangan 3D selection (drag/resize/rotate via gizmos or Move/Rotate tools)
    if (stateManager.getMode() !== 'draw-cable') {
      const roomHit = this.findRoom3dHit?.(this.raycaster);
      if (roomHit?.roomId) {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
        stateManager.deselectObject3d?.();
        stateManager.selectRoom3d?.(roomHit.roomId);
        const room = stateManager.getRoom3dById?.(roomHit.roomId);
        this.showStatusHint(
          `🏠 Ruangan "${room?.name || 'Ruangan 3D'}" dipilih — Drag handle oranye / Move (M) geser • Rotate (R) / [ ] putar • Kuning / + - ubah skala`
        );
        return;
      }
    }

    // 4. Deselect on empty ground click (or cancel pending cable source)
    const hadPending = Boolean(this.pendingCableSourceId);
    this.pendingCableSourceId = null;
    this.pendingCableSourcePort = '';
    if (hadPending) {
      this.syncDevices();
      if (this.simulatorFocusedDeviceId) {
        this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId);
        return;
      }
    }
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      this.deviceManager.deselectDevice();
      this.cableManager.deselectConnection();
      stateManager.deselectObject3d?.();
      stateManager.deselectRoom3d?.();
      if (this.simulatorFocusedDeviceId) {
        this.exitSimulatorFocus({ restoreCamera: false });
      } else if (this.avatarMode) {
        // Clicking empty canvas while in Mode Teknisi re-locks mouse for 360-deg infinite look
        this.tryLockAvatarPointer();
      }
    }
  }

  handleCanvasRightClick(e) {
    const isPointerLocked = typeof document !== 'undefined' && document.pointerLockElement === this.renderer?.domElement;
    if (isPointerLocked) {
      this.pointer.set(0, 0);
      this.releaseAvatarPointerLock();
    } else {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    const cableHits = this.raycaster.intersectObjects(this.cablesGroup.children, true);

    // 1. Prioritize Right-click on foreground 3D Cable / Handle -> Cable Context Menu
    if (cableHits.length > 0 && (
      devHits.length === 0 ||
      cableHits[0].distance <= devHits[0].distance + 0.25 ||
      Boolean(cableHits[0].object?.userData?.cableHandleType)
    )) {
      const cabId = cableHits[0].object.userData?.cableId;
      const cable = cabId ? this.cableManager.getConnectionById(cabId) : null;
      if (cable) {
        const hitPt = cableHits[0].point.clone();
        const rawNorm = this.worldToNorm(hitPt.x, hitPt.z);
        const hitCoord = {
          x: Math.max(0.01, Math.min(0.99, Number(rawNorm.normX.toFixed(4)))),
          y: Math.max(0.01, Math.min(0.99, Number(rawNorm.normY.toFixed(4)))),
          z: Number(Math.max(0.02, hitPt.y).toFixed(2))
        };
        const waypointIdx = cableHits[0].object?.userData?.cableHandleType === 'waypoint'
          ? cableHits[0].object.userData.waypointIdx
          : null;
        eventBus.emit('contextmenu:cable', {
          cable,
          screenX: e.clientX,
          screenY: e.clientY,
          hitCoord,
          waypointIdx
        });
        return;
      }
    }

    // 2. Right-click on 3D Device -> Device Context Menu
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

    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    const cableHits = this.raycaster.intersectObjects(this.cablesGroup.children, true);

    // Priority: Double-click on Cable / Waypoint -> Delete Waypoint or Insert Smart Pen-Tool Point
    if (cableHits.length > 0 && (
      devHits.length === 0 ||
      cableHits[0].distance <= devHits[0].distance + 0.25 ||
      Boolean(cableHits[0].object?.userData?.cableHandleType)
    )) {
      const cabId = cableHits[0].object?.userData?.cableId;
      if (cabId) {
        if (cableHits[0].object?.userData?.cableHandleType === 'waypoint') {
          this.cableManager.deleteWaypoint(cabId, cableHits[0].object.userData.waypointIdx);
          return;
        }
        const hitPt = cableHits[0].point.clone();
        const rawNorm = this.worldToNorm(hitPt.x, hitPt.z);
        const hitCoord = {
          x: Math.max(0.01, Math.min(0.99, Number(rawNorm.normX.toFixed(4)))),
          y: Math.max(0.01, Math.min(0.99, Number(rawNorm.normY.toFixed(4)))),
          z: Number(Math.max(0.02, hitPt.y).toFixed(2))
        };
        this.cableManager.selectConnection(cabId);
        this.cableManager.addSmartWaypoint(cabId, hitCoord);
        return;
      }
    }

    // Priority: Device -> Room -> Ground -> Math floor plane
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
    const validTools = ['orbit', 'pan', 'zoom', 'look', 'move', 'rotate', 'box', 'draw3d'];
    if (!validTools.includes(tool)) return;
    this.navTool = tool;
    this.applyNavToolConfig();
    eventBus.emit('map3d:navtool-changed', { tool });
  }

  applyNavToolConfig() {
    if (this.container) {
      this.container.classList.remove('tool-orbit', 'tool-pan', 'tool-zoom', 'tool-look', 'tool-move', 'tool-rotate', 'tool-box', 'tool-draw3d');
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
    } else if (this.navTool === 'rotate') {
      this.controls.mouseButtons = {
        LEFT: -1, // Drag left button rotates 3D device / custom object along X/Y/Z
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

  findRoom3dHit(raycaster = this.raycaster) {
    if (!this.roomsGroup || this.roomsGroup.children.length === 0) return null;
    const hits = raycaster.intersectObjects(this.roomsGroup.children, true);
    for (let i = 0; i < hits.length; i++) {
      let curr = hits[i].object;
      let gizmoType = null;
      let roomId = null;
      while (curr && curr !== this.roomsGroup) {
        if (!gizmoType && curr.userData?.gizmoType) gizmoType = curr.userData.gizmoType;
        if (!roomId && curr.userData?.roomId) roomId = curr.userData.roomId;
        if (roomId) {
          return { roomId, gizmoType, point: hits[i].point.clone(), object: hits[i].object };
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  checkGizmoHitAtEvent(e) {
    if (!this.isInitialized || !this.camera || !this.renderer?.domElement) return null;
    const hasSelObj = Boolean(stateManager.getSelectedObject3dId?.() && this.objects3dGroup?.children?.length > 0);
    const hasSelRoom = Boolean(stateManager.getSelectedRoom3dId?.() && this.roomsGroup?.children?.length > 0);
    if (!hasSelObj && !hasSelRoom) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (hasSelObj) {
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit && objHit.gizmoType) return objHit;
    }
    if (hasSelRoom) {
      const roomHit = this.findRoom3dHit(this.raycaster);
      if (roomHit && roomHit.gizmoType) return roomHit;
    }
    return null;
  }

  startObject3dGizmoDrag(e, dom, gizmoHit) {
    if (gizmoHit?.roomId || String(gizmoHit?.gizmoType || '').startsWith('room-')) {
      return this.startRoom3dGizmoDrag(e, dom, gizmoHit);
    }
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
    } else if (gizmoHit.gizmoType === 'rotate') {
      stateManager.selectObject3d(obj.id);
      this.deviceManager.deselectDevice();
      this.cableManager.deselectConnection();
      const startRx = Number(obj.rotationX) || 0;
      const startRy = Number(obj.rotationY ?? obj.rotationDeg) || 0;
      const startRz = Number(obj.rotationZ) || 0;
      this.object3dDragState = {
        kind: 'rotate-obj3d',
        objId: obj.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startRx,
        startRy,
        startRz,
        latestRx: startRx,
        latestRy: startRy,
        latestRz: startRz,
        moved: false,
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

  _collectMountedDevicePeersForObject(obj) {
    if (!obj || typeof this.deviceManager?.getAllDevices !== 'function') return [];
    const objWorld = this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5);
    const objElev = Number(obj.elevationMeters) || 0;
    return this.deviceManager
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
        const devElev = d.spatial3d?.elevationMeters ?? getDefaultSpatial3d(d.type).elevationMeters;
        return {
          id: d.id,
          startNormX: d.position.x,
          startNormY: d.position.y,
          startWorldX: pWorld.x,
          startWorldZ: pWorld.z,
          startElev: Number(devElev) || 0,
          localOffsetX: pWorld.x - objWorld.x,
          localOffsetZ: pWorld.z - objWorld.z,
          meshGroup: pMesh,
          meshStartX: pMesh ? pMesh.position.x : pWorld.x,
          meshStartY: pMesh ? pMesh.position.y : (Number(devElev) || 0),
          meshStartZ: pMesh ? pMesh.position.z : pWorld.z,
          effY: pPrevEff ? pPrevEff.y : (pMesh ? pMesh.position.y : 0),
          portInitials: this._collectDevicePortInitials(d.id),
          latestNorm: null,
          latestElev: Number(devElev) || 0
        };
      });
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

    // Co-move devices mounted on the same footprint
    const mountedPeers = this._collectMountedDevicePeersForObject(obj);

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

  startRoom3dGizmoDrag(e, dom, gizmoHit) {
    const room = stateManager.getRoom3dById?.(gizmoHit.roomId);
    if (!room) return;
    if (gizmoHit.gizmoType === 'room-move') {
      return this.startRoom3dMoveDrag(e, dom, gizmoHit);
    }

    stateManager.selectRoom3d?.(room.id);
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();
    stateManager.deselectObject3d?.();

    if (gizmoHit.gizmoType === 'room-pushpull') {
      this.object3dDragState = {
        kind: 'room-pushpull',
        roomId: room.id,
        startClientY: e.clientY,
        startHeight: Number(room.heightMeters) || 3.5,
        latestHeight: Number(room.heightMeters) || 3.5,
        draftRoom: { ...room }
      };
      dom.setPointerCapture?.(e.pointerId);
    } else if (gizmoHit.gizmoType === 'room-scale') {
      const planeY = Math.max(0, Number(gizmoHit.point?.y) || 0);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const worldCenter = this.normToWorld(room.x ?? 0.5, room.y ?? 0.5);
      const startW = Number(room.widthMeters) || 14;
      const startD = Number(room.depthMeters) || 12;
      const startH = Number(room.heightMeters) || 3.5;
      this.object3dDragState = {
        kind: 'room-scale',
        roomId: room.id,
        plane,
        centerX: worldCenter.x,
        centerZ: worldCenter.z,
        rotYRad: ((Number(room.rotationY ?? room.rotationDeg) || 0) * Math.PI) / 180,
        startWidth: startW,
        startDepth: startD,
        startHeight: startH,
        latestWidth: startW,
        latestDepth: startD,
        latestHeight: startH,
        lockAspectRatio: room.lockAspectRatio !== undefined ? Boolean(room.lockAspectRatio) : Boolean(room.customModelUrl),
        draftRoom: { ...room }
      };
      dom.setPointerCapture?.(e.pointerId);
    } else if (gizmoHit.gizmoType === 'room-rotate') {
      const startRx = Number(room.rotationX) || 0;
      const startRy = Number(room.rotationY ?? room.rotationDeg) || 0;
      const startRz = Number(room.rotationZ) || 0;
      this.object3dDragState = {
        kind: 'rotate-room3d',
        roomId: room.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startRx,
        startRy,
        startRz,
        latestRx: startRx,
        latestRy: startRy,
        latestRz: startRz,
        moved: false,
        draftRoom: { ...room }
      };
      dom.setPointerCapture?.(e.pointerId);
    }
  }

  startRoom3dMoveDrag(e, dom, roomHit) {
    const room = stateManager.getRoom3dById?.(roomHit?.roomId);
    if (!room) return;
    if (room.locked) {
      stateManager.selectRoom3d?.(room.id);
      this.showStatusHint(`🔒 Ruangan "${room.name}" dikunci.`);
      return;
    }

    stateManager.selectRoom3d?.(room.id);
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();
    stateManager.deselectObject3d?.();

    const planeY = Math.max(0, Number(roomHit?.point?.y) || 0);
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(dragPlane, hitPt)) {
      hitPt.copy(roomHit?.point || new THREE.Vector3());
    }

    const roomWorld = this.normToWorld(room.x ?? 0.5, room.y ?? 0.5);
    this.object3dDragState = {
      kind: 'move-room3d',
      roomId: room.id,
      room,
      plane: dragPlane,
      grabOffsetX: roomWorld.x - hitPt.x,
      grabOffsetZ: roomWorld.z - hitPt.z,
      latestNorm: null,
      moved: false
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

    if (state.kind === 'room-pushpull') {
      const dyPx = state.startClientY - e.clientY;
      const camDist = Math.max(4, this.camera ? this.camera.position.distanceTo(this.controls.target) : 25);
      const deltaMeters = (dyPx / Math.max(200, rect.height)) * camDist * 1.15;
      const nextH = clamp(Number((state.startHeight + deltaMeters).toFixed(2)), 1.5, 40);
      state.latestHeight = nextH;
      state.draftRoom = { ...state.draftRoom, heightMeters: nextH };
      this.rebuildSingleRoom3dMesh(state.draftRoom, true);
      this.showStatusHint(`📐 Tinggi Ruangan "${state.draftRoom.name}": ${nextH.toFixed(2)}m`);
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

    if (state.kind === 'room-scale') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;
      const dx = hitPt.x - state.centerX;
      const dz = hitPt.z - state.centerZ;
      const cos = Math.cos(state.rotYRad || 0);
      const sin = Math.sin(state.rotYRad || 0);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const rawW = Math.abs(lx) * 2;
      const rawD = Math.abs(lz) * 2;
      let nextW;
      let nextD;
      let nextH = state.startHeight;
      if (state.lockAspectRatio && !e.shiftKey && state.startWidth > 0 && state.startDepth > 0) {
        const ratio = clamp(Math.max(rawW / state.startWidth, rawD / state.startDepth), 0.15, 6.0);
        nextW = clamp(Number((state.startWidth * ratio).toFixed(2)), 2, 200);
        nextD = clamp(Number((state.startDepth * ratio).toFixed(2)), 2, 200);
        nextH = clamp(Number((state.startHeight * ratio).toFixed(2)), 1.5, 40);
      } else {
        nextW = clamp(Number(rawW.toFixed(2)), 2, 200);
        nextD = clamp(Number(rawD.toFixed(2)), 2, 200);
      }
      state.latestWidth = nextW;
      state.latestDepth = nextD;
      state.latestHeight = nextH;
      state.draftRoom = { ...state.draftRoom, widthMeters: nextW, depthMeters: nextD, heightMeters: nextH };
      this.rebuildSingleRoom3dMesh(state.draftRoom, true);
      const pct = state.startWidth > 0 ? Math.round((nextW / (state.draftRoom.baseWidthMeters || state.startWidth)) * 100) : 100;
      this.showStatusHint(
        `📐 Skala Ruangan "${state.draftRoom.name}": ${nextW.toFixed(1)}×${nextD.toFixed(1)}×${nextH.toFixed(1)}m (${pct}%) • Tahan Shift untuk ubah Lebar/Panjang bebas`
      );
      return;
    }

    if (state.kind === 'rotate-obj3d') {
      if (Math.hypot(e.clientX - state.startClientX, e.clientY - state.startClientY) > 3) {
        state.moved = true;
      }
      const { rx, ry, rz } = this._computeDragAngles(
        state.startRx,
        state.startRy,
        state.startRz,
        state.startClientX,
        state.startClientY,
        e
      );
      state.latestRx = rx;
      state.latestRy = ry;
      state.latestRz = rz;
      state.draftObj = { ...state.draftObj, rotationX: rx, rotationY: ry, rotationZ: rz };
      const meshGroup = this.object3dMeshMap.get(state.objId);
      if (meshGroup) {
        meshGroup.rotation.set(
          (rx * Math.PI) / 180,
          (ry * Math.PI) / 180,
          (rz * Math.PI) / 180,
          'YXZ'
        );
      }
      this.showStatusHint(
        `🔄 Rotasi "${state.draftObj.name}": X:${rx}° Y:${ry}° Z:${rz}° (Drag=Y • Shift=Miring X/Dinding • Alt=Roll Z • Ctrl=Snap 15°)`
      );
      return;
    }

    if (state.kind === 'rotate-room3d') {
      if (Math.hypot(e.clientX - state.startClientX, e.clientY - state.startClientY) > 3) {
        state.moved = true;
      }
      const { rx, ry, rz } = this._computeDragAngles(
        state.startRx,
        state.startRy,
        state.startRz,
        state.startClientX,
        state.startClientY,
        e
      );
      state.latestRx = rx;
      state.latestRy = ry;
      state.latestRz = rz;
      state.draftRoom = { ...state.draftRoom, rotationX: rx, rotationY: ry, rotationZ: rz };
      const roomGroup = this.room3dMeshMap.get(state.roomId);
      if (roomGroup) {
        roomGroup.rotation.set(
          (rx * Math.PI) / 180,
          (ry * Math.PI) / 180,
          (rz * Math.PI) / 180,
          'YXZ'
        );
      }
      this.showStatusHint(
        `🔄 Rotasi Ruangan "${state.draftRoom.name}": Y:${ry}° (Ctrl=Snap 15°)`
      );
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

    if (state.kind === 'move-room3d') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;
      state.moved = true;
      const newWorldX = hitPt.x + state.grabOffsetX;
      const newWorldZ = hitPt.z + state.grabOffsetZ;
      const { normX, normY } = this.worldToNorm(newWorldX, newWorldZ);
      const clampedWorld = this.normToWorld(normX, normY);
      const roomGroup = this.room3dMeshMap.get(state.roomId);
      if (roomGroup) {
        roomGroup.position.x = clampedWorld.x;
        roomGroup.position.z = clampedWorld.z;
      }
      state.latestNorm = { x: Number(normX.toFixed(4)), y: Number(normY.toFixed(4)) };
      this.showStatusHint(
        `🏠 Geser Ruangan "${state.room?.name || 'Ruangan 3D'}": X=${state.latestNorm.x.toFixed(3)}, Y=${state.latestNorm.y.toFixed(3)}`
      );
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
    if (state.kind === 'room-pushpull') {
      this._suppressNextClick = true;
      stateManager.updateRoom3d?.(state.roomId, { heightMeters: state.latestHeight });
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
    if (state.kind === 'room-scale') {
      this._suppressNextClick = true;
      const baseW = Number(state.draftRoom?.baseWidthMeters) || 0;
      const scaleUpdate = baseW > 0
        ? { modelScale: Number((state.latestWidth / baseW).toFixed(3)) }
        : {};
      stateManager.updateRoom3d?.(state.roomId, {
        widthMeters: state.latestWidth,
        depthMeters: state.latestDepth,
        heightMeters: state.latestHeight ?? state.startHeight,
        ...scaleUpdate
      });
      return;
    }
    if (state.kind === 'rotate-obj3d') {
      if (state.moved) {
        this._suppressNextClick = true;
        stateManager.updateObject3d(state.objId, {
          rotationX: state.latestRx,
          rotationY: state.latestRy,
          rotationZ: state.latestRz
        });
      }
      return;
    }
    if (state.kind === 'rotate-room3d') {
      if (state.moved) {
        this._suppressNextClick = true;
        stateManager.updateRoom3d?.(state.roomId, {
          rotationX: state.latestRx,
          rotationY: state.latestRy,
          rotationZ: state.latestRz
        });
      }
      return;
    }
    if (state.kind === 'move-room3d' && state.latestNorm) {
      if (state.moved) {
        this._suppressNextClick = true;
      }
      stateManager.updateRoom3d?.(state.roomId, {
        x: state.latestNorm.x,
        y: state.latestNorm.y
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

  checkCableHandleHitAtEvent(e) {
    if (!this.isInitialized || !this.camera || !this.renderer?.domElement) return null;
    if (!this.cableManager?.selectedCableId || this.cablesGroup.children.length === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cablesGroup.children, false);
    for (const hit of hits) {
      if (hit.object?.userData?.cableHandleType) {
        return {
          object: hit.object,
          point: hit.point.clone(),
          ...hit.object.userData
        };
      }
    }
    const canGrabSelectedTube = this.navTool === 'move'
      || stateManager.getMode() === 'select'
      || Boolean(e.shiftKey)
      || Boolean(e.altKey);
    if (canGrabSelectedTube) {
      for (const hit of hits) {
        if (hit.object?.userData?.cableTubeSelected === true) {
          return {
            object: hit.object,
            point: hit.point.clone(),
            cableHandleType: 'apex',
            ...hit.object.userData
          };
        }
      }
    }
    return null;
  }

  startCableHandleDrag(e, dom, handleHit) {
    const cable = this.cableManager.getConnectionById(handleHit.cableId);
    if (!cable) return;
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const initPos = handleHit.point?.clone() || handleHit.object?.position?.clone() || new THREE.Vector3();
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.normalize(), initPos);
    this.cableDragState = {
      cableId: cable.id,
      handleType: handleHit.cableHandleType,
      waypointIdx: typeof handleHit.waypointIdx === 'number' ? handleHit.waypointIdx : -1,
      insertIdx: typeof handleHit.insertIdx === 'number' ? handleHit.insertIdx : -1,
      tVal: typeof handleHit.tVal === 'number' ? handleHit.tVal : 0.5,
      bowOffset: handleHit.bowOffset?.clone() || new THREE.Vector3(),
      startWorldPt: initPos.clone(),
      linearMid: handleHit.linearMid?.clone() || initPos.clone(),
      outDir: handleHit.outDir?.clone() || new THREE.Vector3(0, 0, 1),
      sideDir: handleHit.sideDir?.clone() || new THREE.Vector3(1, 0, 0),
      avgPortScale: Number(handleHit.avgPortScale) || 1,
      dragPlane,
      moved: false
    };
    dom.setPointerCapture?.(e.pointerId);
  }

  updateCableHandleDrag(e) {
    const state = this.cableDragState;
    if (!state || !this.renderer?.domElement) return;
    const cable = this.cableManager.getConnectionById(state.cableId);
    if (!cable) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(state.dragPlane, hitPt)) return;

    state.moved = true;
    if (state.handleType === 'apex') {
      if (!cable.details) cable.details = {};
      cable.details.pathStyle = 'curve';
      const scale = Math.max(0.1, state.avgPortScale);
      const rel = hitPt.clone().sub(state.linearMid);
      cable.details.bowOut = Number(Math.max(-1.5, Math.min(3.0, rel.dot(state.outDir) / scale)).toFixed(2));
      cable.details.sideOffset = Number(Math.max(-3.0, Math.min(3.0, rel.dot(state.sideDir) / scale)).toFixed(2));
      cable.details.sagDrop = Number(Math.max(-1.5, Math.min(2.5, -rel.y / scale)).toFixed(2));
      this.syncCables();
      return;
    }

    if (!Array.isArray(cable.route)) cable.route = [];
    if (state.handleType === 'add-waypoint' && cable.route.length === 0) {
      cable.details = {
        ...(cable.details || {}),
        pathStyle: 'curve',
        bowOut: 0,
        sideOffset: 0,
        sagDrop: 0
      };
      state.bowOffset.set(0, 0, 0);
    }

    const rawHit = hitPt.clone().sub(state.bowOffset);
    if (e.shiftKey) {
      const lockedXZ = state.startWorldPt.clone().sub(state.bowOffset);
      rawHit.x = lockedXZ.x;
      rawHit.z = lockedXZ.z;
    }

    const rawNorm = this.worldToNorm(rawHit.x, rawHit.z);
    const normX = Math.max(0.01, Math.min(0.99, rawNorm.normX));
    const normY = Math.max(0.01, Math.min(0.99, rawNorm.normY));
    const wpZ = Math.max(0.02, Number(rawHit.y.toFixed(2)));
    const wp = { x: normX, y: normY, z: wpZ };

    if (state.handleType === 'add-waypoint') {
      const insertIdx = state.insertIdx >= 0
        ? Math.max(0, Math.min(cable.route.length, state.insertIdx))
        : (state.tVal < 0.5 ? 0 : cable.route.length);
      cable.route.splice(insertIdx, 0, wp);
      state.handleType = 'waypoint';
      state.waypointIdx = insertIdx;
    } else if (state.handleType === 'waypoint' && state.waypointIdx >= 0 && state.waypointIdx < cable.route.length) {
      cable.route[state.waypointIdx] = wp;
    }
    this.syncCables();
  }

  finishCableHandleDrag(e, dom) {
    const state = this.cableDragState;
    this.cableDragState = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (!state || !state.moved) return;

    this._suppressNextClick = true;
    const cable = this.cableManager.getConnectionById(state.cableId);
    if (!cable) return;
    this.cableManager.updateConnection(cable.id, {
      details: { ...(cable.details || {}) },
      route: Array.isArray(cable.route) ? cable.route.map((p) => ({ ...p })) : []
    });
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
        return;
      }
      // Or drag a 3D Room / Building zone directly on the map ground
      const roomHit = this.findRoom3dHit?.(this.raycaster);
      if (roomHit?.roomId) {
        this.startRoom3dMoveDrag(e, dom, roomHit);
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

    const mc = meshGroup?.getObjectByName?.('DeviceModelContainer');
    const startRotY = Number(device.spatial3d?.rotationY ?? device.rotation ?? 0) || 0;
    const startHolderY = meshGroup ? meshGroup.position.y : 0;

    this.dragMoveState = {
      deviceId: devId,
      device,
      startNormX: device.position.x,
      startNormY: device.position.y,
      startWorldX: devWorld.x,
      startWorldZ: devWorld.z,
      effY,
      startHolderY,
      startRotY,
      hasModelContainer: Boolean(mc),
      plane: dragPlane,
      grabOffsetX: devWorld.x - hitPt.x,
      grabOffsetZ: devWorld.z - hitPt.z,
      meshOffsetX,
      meshOffsetZ,
      portInitials: this._collectDevicePortInitials(devId),
      peers,
      latestNorm: null,
      wallMountSnap: null
    };

    dom.setPointerCapture?.(e.pointerId);
  }

  /**
   * Raycast against vertical 3D walls of buildings (roomsGroup) and 3D objects (objects3dGroup)
   * so devices can snap/mount flush onto any wall facing outward along the surface normal.
   */
  find3DWallMountTarget(rayOrigin, rayDir, maxDist = 4.2, { device = null, minHitY = 0.25, maxHitY = 5.2 } = {}) {
    if (!rayOrigin || !rayDir) return null;
    const roots = [
      ...(this.roomsGroup?.children || []),
      ...(this.objects3dGroup?.children || [])
    ];
    if (roots.length === 0) return null;

    const meshTargets = [];
    const visit = (node) => {
      if (!node || node.visible === false) return;
      if (node.userData?.gizmoType || node.userData?.isSelectionRing || node.userData?.isCarriedByAvatar) return;
      if (node.isMesh) {
        const meshName = String(node.name || '');
        if (!/atap|plafon|kanopi|lisplang|roof|ceiling/i.test(meshName) || /tangga|stair/i.test(meshName)) {
          meshTargets.push(node);
        }
        return;
      }
      if (Array.isArray(node.children)) {
        for (const ch of node.children) visit(ch);
      }
    };
    roots.forEach((root) => {
      root?.updateMatrixWorld?.(true);
      visit(root);
    });
    if (meshTargets.length === 0) return null;

    const wallRay = new THREE.Raycaster(rayOrigin.clone(), rayDir.clone().normalize(), 0.05, maxDist);
    wallRay.camera = this.camera || null;
    const hits = wallRay.intersectObjects(meshTargets, false);
    if (!hits || hits.length === 0) return null;

    const normalMat = new THREE.Matrix3();
    const worldNormal = new THREE.Vector3();

    for (const hit of hits) {
      const obj = hit?.object;
      if (!obj || !obj.isMesh || !hit.face) continue;

      normalMat.getNormalMatrix(obj.matrixWorld);
      worldNormal.copy(hit.face.normal).applyMatrix3(normalMat).normalize();
      if (worldNormal.dot(wallRay.ray.direction) > 0) {
        worldNormal.negate();
      }

      // Only accept near-vertical surfaces (walls, pillars, rack sides, cabinets)
      if (Math.abs(worldNormal.y) >= 0.52) continue;
      if (hit.point.y < minHitY || hit.point.y > maxHitY) continue;

      const devScale = ((device?.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 3.0));
      const existingCol = device?.id ? this.deviceColliders?.find((c) => c.id === device.id) : null;
      const fp = this.getDeviceCollisionFootprint
        ? this.getDeviceCollisionFootprint(device, devScale)
        : { halfD: 0.45 };
      const wallStandoff = existingCol
        ? Math.max(0.14, Math.min(0.6, (Number(existingCol.halfD) || 0.35) * 0.9 + 0.04))
        : Math.max(0.14, Math.min(0.55, (Number(fp.halfD) || 0.4) * 0.6 + 0.04));

      const horizLen = Math.hypot(worldNormal.x, worldNormal.z) || 1;
      const nx = worldNormal.x / horizLen;
      const nz = worldNormal.z / horizLen;
      const worldPos = new THREE.Vector3(
        hit.point.x + nx * wallStandoff,
        hit.point.y,
        hit.point.z + nz * wallStandoff
      );
      const wallRotYDeg = ((Math.round((Math.atan2(nx, nz) * 180) / Math.PI) % 360) + 360) % 360;

      return {
        point: hit.point.clone(),
        worldPos,
        worldNormal: new THREE.Vector3(nx, 0, nz),
        elevationMeters: Number(clamp(hit.point.y, 0.25, maxHitY).toFixed(2)),
        rotationY: wallRotYDeg,
        distance: hit.distance,
        objectName: obj.name || 'Dinding 3D'
      };
    }
    return null;
  }

  updateDeviceDragMove(e) {
    const state = this.dragMoveState;
    if (!state) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshGroup = this.deviceMeshMap.get(state.deviceId);
    const modelContainer = meshGroup?.getObjectByName?.('DeviceModelContainer');

    // Allow snapping a single dragged device flush onto any 3D building/room wall under the cursor
    if (state.peers.length === 0) {
      const wallHit = this.find3DWallMountTarget(
        this.raycaster.ray.origin,
        this.raycaster.ray.direction,
        500,
        { device: state.device, minHitY: 0.25, maxHitY: 12.0 }
      );
      if (wallHit) {
        const { normX, normY } = this.worldToNorm(wallHit.worldPos.x, wallHit.worldPos.z);
        const clampedWorld = this.normToWorld(normX, normY);
        const mountY = wallHit.elevationMeters;
        if (meshGroup) {
          meshGroup.position.set(clampedWorld.x, mountY, clampedWorld.z);
          if (modelContainer) {
            modelContainer.rotation.y = (wallHit.rotationY * Math.PI) / 180;
          }
          const holderPorts = meshGroup.userData?.devPorts || [];
          const userScale = meshGroup.userData?.userModelScale || ((state.device?.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 3.0));
          this.registerDevicePortTransforms(
            state.device,
            holderPorts,
            clampedWorld.x,
            mountY,
            clampedWorld.z,
            userScale,
            new THREE.Euler(0, (wallHit.rotationY * Math.PI) / 180, 0, 'YXZ')
          );
          this.effectivePosMap.set(
            state.deviceId,
            new THREE.Vector3(clampedWorld.x, mountY + 0.35 * (this.deviceScaleMultiplier || 3.0), clampedWorld.z)
          );
        }
        state.latestNorm = { x: normX, y: normY };
        state.wallMountSnap = {
          elevationMeters: mountY,
          rotationY: wallHit.rotationY,
          mountType: 'wall'
        };
        this.syncCables();
        this.showStatusHint(`📌 Menempel ke dinding 3D (Tinggi: ${mountY.toFixed(2)}m • Hadap: ${wallHit.rotationY}°)`);
        return;
      }
      if (state.wallMountSnap) {
        state.wallMountSnap = null;
        if (meshGroup) meshGroup.position.y = state.startHolderY;
        if (modelContainer) modelContainer.rotation.y = (state.startRotY * Math.PI) / 180;
      }
    }

    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;

    const newWorldX = hitPt.x + state.grabOffsetX;
    const newWorldZ = hitPt.z + state.grabOffsetZ;
    const { normX, normY } = this.worldToNorm(newWorldX, newWorldZ);
    const clampedWorld = this.normToWorld(normX, normY);

    const primaryShiftX = clampedWorld.x - state.startWorldX;
    const primaryShiftZ = clampedWorld.z - state.startWorldZ;

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
    if (state.wallMountSnap && this.deviceManager?.updateDevice) {
      this.deviceManager.moveDeviceGroup(moves, { syncRenderer: false });
      const dev = this.deviceManager.getDeviceById?.(state.deviceId);
      const baseSp = { ...getDefaultSpatial3d(dev?.type), ...(dev?.spatial3d || {}) };
      this.deviceManager.updateDevice(state.deviceId, {
        spatial3d: {
          ...baseSp,
          elevationMeters: state.wallMountSnap.elevationMeters,
          rotationY: state.wallMountSnap.rotationY,
          mountType: 'wall',
          offsetX: 0,
          offsetY: 0,
          offsetZ: 0
        }
      });
      this.syncDevices();
      this.syncCables();
      this.showStatusHint(
        `📌 Perangkat ditempelkan ke dinding 3D (Tinggi: ${state.wallMountSnap.elevationMeters.toFixed(2)}m • Hadap: ${state.wallMountSnap.rotationY}°)`
      );
      return;
    }
    this.deviceManager.moveDeviceGroup(moves, { syncRenderer: true });
  }

  _computeDragAngles(startRx, startRy, startRz, startClientX, startClientY, e) {
    const dx = e.clientX - startClientX;
    const dy = startClientY - e.clientY;
    const snap = Boolean(e.ctrlKey || e.metaKey);
    const snapFn = (val) => (snap ? Math.round(val / 15) * 15 : Math.round(val));

    let rx = Number(startRx) || 0;
    let ry = Number(startRy) || 0;
    let rz = Number(startRz) || 0;

    if (e.altKey) {
      rz = clamp(snapFn(rz + dx * 0.65), -180, 180);
    } else if (e.shiftKey) {
      rx = clamp(snapFn(rx + dy * 0.65), -180, 180);
    } else {
      ry = ((snapFn(ry + dx * 0.65) % 360) + 360) % 360;
    }
    return { rx, ry, rz };
  }

  startRotateDrag(e, dom) {
    const rect = dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const devHits = this.raycaster.intersectObjects(this.devicesGroup.children, true);
    if (devHits.length === 0) {
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit?.object3dId) {
        this.startObject3dGizmoDrag(e, dom, { ...objHit, gizmoType: 'rotate' });
        return;
      }
      const roomHit = this.findRoom3dHit?.(this.raycaster);
      if (roomHit?.roomId) {
        this.startRoom3dGizmoDrag(e, dom, { ...roomHit, gizmoType: 'room-rotate' });
      }
      return;
    }

    const devId = this.findDeviceIdFromObject(devHits[0].object);
    const device = devId ? this.deviceManager.getDeviceById(devId) : null;
    if (!device) return;

    const preserveMulti = this.deviceManager.getSelectedDeviceIds().length > 1
      && this.deviceManager.isDeviceSelected?.(devId);

    this.deviceManager.selectDevice(devId, {
      additive: false,
      preserveMultiOnDrag: preserveMulti
    });
    stateManager.deselectObject3d?.();

    const targetIds = preserveMulti ? this.deviceManager.getSelectedDeviceIds() : [devId];
    const items = [];
    targetIds.forEach((id) => {
      const d = this.deviceManager.getDeviceById(id);
      const holder = this.deviceMeshMap.get(id);
      if (!d || !holder || d.layerLocked) return;
      const modelContainer = holder.getObjectByName('DeviceModelContainer');
      if (!modelContainer) return;
      const startRx = Number(d.spatial3d?.rotationX) || 0;
      const startRy = Number(d.spatial3d?.rotationY) || 0;
      const startRz = Number(d.spatial3d?.rotationZ) || 0;
      items.push({
        dev: d,
        holder,
        modelContainer,
        finalX: holder.position.x,
        finalY: holder.position.y,
        finalZ: holder.position.z,
        userModelScale: holder.userData.userModelScale || ((d.spatial3d?.modelScale || 1) * this.deviceScaleMultiplier),
        devPorts: holder.userData.devPorts || getDefaultDevicePorts(d.type, d.model, d.spatial3d?.customModelUrl),
        startRx,
        startRy,
        startRz,
        latestRx: startRx,
        latestRy: startRy,
        latestRz: startRz
      });
    });

    if (items.length === 0) return;

    this.dragRotateState = {
      primaryName: device.name,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      items
    };
    dom.setPointerCapture?.(e.pointerId);
  }

  updateDeviceDragRotate(e) {
    const state = this.dragRotateState;
    if (!state) return;
    if (Math.hypot(e.clientX - state.startClientX, e.clientY - state.startClientY) > 3) {
      state.moved = true;
    }

    let firstAngles = null;
    state.items.forEach((item) => {
      const { rx, ry, rz } = this._computeDragAngles(
        item.startRx,
        item.startRy,
        item.startRz,
        state.startClientX,
        state.startClientY,
        e
      );
      item.latestRx = rx;
      item.latestRy = ry;
      item.latestRz = rz;
      if (!firstAngles) firstAngles = { rx, ry, rz };

      const euler = new THREE.Euler(
        (rx * Math.PI) / 180,
        (ry * Math.PI) / 180,
        (rz * Math.PI) / 180,
        'YXZ'
      );
      item.modelContainer.rotation.copy(euler);
      this.registerDevicePortTransforms(
        item.dev,
        item.devPorts,
        item.finalX,
        item.finalY,
        item.finalZ,
        item.userModelScale,
        euler
      );
    });

    this.syncCables();
    if (firstAngles) {
      const suffix = state.items.length > 1 ? ` (${state.items.length} perangkat)` : '';
      this.showStatusHint(
        `🔄 Rotasi "${state.primaryName}"${suffix}: X:${firstAngles.rx}° Y:${firstAngles.ry}° Z:${firstAngles.rz}° (Drag=Y • Shift=Miring X/Dinding • Alt=Roll Z • Ctrl=Snap 15°)`
      );
    }
  }

  finishDeviceDragRotate(e, dom) {
    const state = this.dragRotateState;
    this.dragRotateState = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (!state || !state.moved) return;

    this._suppressNextClick = true;
    state.items.forEach((item) => {
      const latestDev = this.deviceManager.getDeviceById(item.dev.id) || item.dev;
      const nextSpatial = {
        ...getDefaultSpatial3d(latestDev.type),
        ...(latestDev.spatial3d || {}),
        rotationX: item.latestRx,
        rotationY: item.latestRy,
        rotationZ: item.latestRz
      };
      this.deviceManager.updateDevice(item.dev.id, { spatial3d: nextSpatial });
    });
    this.syncDevices();
    this.syncCables();
  }

  rotateSelectedIn3D({ dX = 0, dY = 0, dZ = 0, reset = false } = {}) {
    if (this.avatarMode && Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      const topItem = this.carriedObjects[this.carriedObjects.length - 1];
      if (reset) {
        topItem.relativeYawOffset = 0;
      } else {
        topItem.relativeYawOffset = ((Number(topItem.relativeYawOffset) || 0) + (dY || dZ || 0));
      }
      this.updateCarriedObjectsTransform?.();
      this.showStatusHint(`🔄 Putar "${topItem.name}" sebelum ditaruh (${this.carriedObjects.length} objek dibawa)`);
      return true;
    }

    const selectedIds = this.deviceManager?.getSelectedDeviceIds?.() || [];
    if (selectedIds.length > 0) {
      let summary = null;
      selectedIds.forEach((id) => {
        const dev = this.deviceManager.getDeviceById(id);
        if (!dev || dev.layerLocked) return;
        const base = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
        const rx = reset ? 0 : clamp((Number(base.rotationX) || 0) + dX, -180, 180);
        const ry = reset ? 0 : (((Number(base.rotationY) || 0) + dY) % 360 + 360) % 360;
        const rz = reset ? 0 : clamp((Number(base.rotationZ) || 0) + dZ, -180, 180);
        this.deviceManager.updateDevice(id, {
          spatial3d: { ...base, rotationX: rx, rotationY: ry, rotationZ: rz }
        });
        if (!summary) summary = { name: dev.name, rx, ry, rz };
      });
      if (summary) {
        this.showStatusHint(`🔄 Rotasi "${summary.name}": X:${summary.rx}° Y:${summary.ry}° Z:${summary.rz}°`);
      }
      return true;
    }

    const selObjId = stateManager.getSelectedObject3dId?.();
    if (selObjId) {
      const obj = stateManager.getObject3dById(selObjId);
      if (!obj) return false;
      const rx = reset ? 0 : clamp((Number(obj.rotationX) || 0) + dX, -180, 180);
      const ry = reset ? 0 : (((Number(obj.rotationY ?? obj.rotationDeg) || 0) + dY) % 360 + 360) % 360;
      const rz = reset ? 0 : clamp((Number(obj.rotationZ) || 0) + dZ, -180, 180);
      stateManager.updateObject3d(selObjId, { rotationX: rx, rotationY: ry, rotationZ: rz });
      this.showStatusHint(`🔄 Rotasi "${obj.name}": X:${rx}° Y:${ry}° Z:${rz}°`);
      return true;
    }

    const selRoomId = stateManager.getSelectedRoom3dId?.();
    if (selRoomId) {
      const room = stateManager.getRoom3dById?.(selRoomId);
      if (!room || room.locked) return false;
      const rx = reset ? 0 : clamp((Number(room.rotationX) || 0) + dX, -180, 180);
      const ry = reset ? 0 : (((Number(room.rotationY ?? room.rotationDeg) || 0) + dY) % 360 + 360) % 360;
      const rz = reset ? 0 : clamp((Number(room.rotationZ) || 0) + dZ, -180, 180);
      stateManager.updateRoom3d?.(selRoomId, { rotationX: rx, rotationY: ry, rotationZ: rz });
      this.showStatusHint(`🔄 Rotasi Ruangan "${room.name}": X:${rx}° Y:${ry}° Z:${rz}°`);
      return true;
    }

    return false;
  }

  scaleSelectedRoomIn3D(factor = 1.1) {
    const selRoomId = stateManager.getSelectedRoom3dId?.();
    if (!selRoomId) return false;
    const room = stateManager.getRoom3dById?.(selRoomId);
    if (!room || room.locked) return false;

    const mul = Math.max(0.25, Math.min(4.0, Number(factor) || 1));
    const curW = Math.max(2, Number(room.widthMeters) || 14);
    const curD = Math.max(2, Number(room.depthMeters) || 12);
    const curH = Math.max(1.5, Number(room.heightMeters) || 3.5);
    const nextW = clamp(Number((curW * mul).toFixed(2)), 2, 200);
    const nextD = clamp(Number((curD * mul).toFixed(2)), 2, 200);
    const nextH = clamp(Number((curH * mul).toFixed(2)), 1.5, 40);
    const baseW = Number(room.baseWidthMeters) || curW;
    const nextScale = Number((nextW / baseW).toFixed(3));

    stateManager.updateRoom3d?.(selRoomId, {
      widthMeters: nextW,
      depthMeters: nextD,
      heightMeters: nextH,
      modelScale: nextScale
    });
    const pct = Math.round(nextScale * 100);
    this.showStatusHint(
      `📐 Skala Ruangan "${room.name}": ${nextW.toFixed(1)}×${nextD.toFixed(1)}×${nextH.toFixed(1)}m (${pct}%)`
    );
    return true;
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

  tryLockAvatarPointer() {
    if (typeof document === 'undefined' || !this.renderer?.domElement) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    try {
      const res = this.renderer.domElement.requestPointerLock?.();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch { /* ignore pointer lock gesture restrictions */ }
  }

  releaseAvatarPointerLock() {
    if (typeof document === 'undefined') return;
    if (document.pointerLockElement && (!this.renderer?.domElement || document.pointerLockElement === this.renderer.domElement)) {
      try {
        document.exitPointerLock?.();
      } catch { /* ignore */ }
    }
    if (this.avatarState) {
      this.avatarState._lastMouseClient = null;
    }
  }

  syncAvatarCrosshair() {
    if (typeof document === 'undefined') return;
    const ch = document.getElementById('hud-3d-crosshair');
    if (!ch) return;
    const visible = Boolean(this.isActive && this.avatarMode && !this.simulatorFocusedDeviceId);
    ch.classList.toggle('hidden', !visible);
    ch.style.display = visible ? 'block' : 'none';
  }

  configureControlsForAvatarMode(active) {
    if (!this.controls) return;
    if (active && !this.simulatorFocusedDeviceId) {
      this.controls.enableRotate = false;
      this.controls.enableZoom = false;
      this.controls.enablePan = false;
      this.controls.minPolarAngle = 0.05;
      this.controls.maxPolarAngle = Math.PI - 0.05;
    } else {
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.controls.enablePan = true;
      this.controls.minPolarAngle = 0;
      this.applyNavToolConfig();
    }
  }

  syncAvatarControlsUI() {
    if (typeof document === 'undefined') return;
    document.getElementById('btn-3d-avatar')?.classList.toggle('active', Boolean(this.avatarMode));
    document.getElementById('btn-3d-fpp')?.classList.toggle('active', Boolean(this.avatarMode && this.avatarPerspective === 'fpp'));
  }

  syncAvatarMeshVisibilityForPerspective() {
    const isFppFreeRoam = Boolean(this.isActive && this.avatarMode && this.avatarPerspective === 'fpp' && !this.simulatorFocusedDeviceId);
    const isFocusedHide = Boolean(this.simulatorFocusedDeviceId);
    if (this.avatarGroup) {
      this.avatarGroup.visible = Boolean(this.avatarMode && !isFppFreeRoam && !isFocusedHide);
    }
    if (isFppFreeRoam && !this.fppViewmodelGroup) {
      this.fppViewmodelGroup = createFppHandsViewmodelGroup();
    }
    if (this.fppViewmodelGroup) {
      if (isFppFreeRoam && this.scene && !this.scene.children.includes(this.fppViewmodelGroup)) {
        this.scene.add(this.fppViewmodelGroup);
      }
      this.fppViewmodelGroup.visible = isFppFreeRoam;
    }
  }

  syncFppViewmodelTransform() {
    if (!this.fppViewmodelGroup || !this.fppViewmodelGroup.visible || !this.camera) return;
    this.fppViewmodelGroup.position.copy(this.camera.position);
    this.fppViewmodelGroup.quaternion.copy(this.camera.quaternion);
    const swayRoot = this.fppViewmodelGroup.userData?.swayRoot;
    if (swayRoot) {
      const moving = Boolean(this.avatarState.isMoving && this.avatarState.isGrounded);
      const phase = Number(this.avatarState.walkPhase) || 0;
      const amp = this.avatarState.isRunning ? 0.018 : 0.011;
      const sx = moving ? Math.cos(phase) * amp : 0;
      const sy = moving ? Math.abs(Math.sin(phase)) * amp : 0;
      swayRoot.position.set(0.32 + sx, -0.27 + sy, -0.52);
    }
  }

  setAvatarPerspective(mode) {
    const nextPersp = mode === 'fpp' ? 'fpp' : 'tpp';
    if (!this.avatarMode) {
      return this.setAvatarMode(true, { perspective: nextPersp });
    }
    this.avatarPerspective = nextPersp;
    if (nextPersp === 'fpp') {
      this.avatarState.camPitch = clamp(Number.isFinite(this.avatarState.camPitch) ? this.avatarState.camPitch : 0, -0.5, 0.55);
      this.avatarState.yaw = Number(this.avatarState.camYaw) || 0;
    } else {
      this.avatarState.camPitch = clamp(Number.isFinite(this.avatarState.camPitch) ? this.avatarState.camPitch : 0.32, -0.1, 0.85);
      this.avatarState.camDist = clamp(this.avatarState.camDist || 5.8, 2.2, 22.0);
    }
    this.syncAvatarMeshVisibilityForPerspective();
    this.syncAvatarControlsUI();
    this.syncAvatarCameraFromAngles();
    this.renderAvatarHudBar();
    this.showStatusHint(
      nextPersp === 'fpp'
        ? 'Mode FPP (Orang Pertama) aktif: Gerakkan mouse lihat dari mata teknisi, tekan V atau Scroll mundur untuk TPP.'
        : 'Mode TPP (Orang Ketiga) aktif: Tekan V atau Scroll maju ke karakter untuk masuk ke Mode FPP.'
    );
    return this.avatarPerspective;
  }

  toggleAvatarPerspective() {
    return this.setAvatarPerspective(this.avatarPerspective === 'fpp' ? 'tpp' : 'fpp');
  }

  _loadSavedAvatarScale() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(AVATAR_SCALE_STORAGE_KEY);
        if (raw !== null && raw !== '') {
          return clampAvatarScale(raw);
        }
      }
    } catch { /* ignore storage restrictions */ }
    return AVATAR_SCALE_DEFAULT;
  }

  _computeAvatarCollider(scale = this.avatarScale) {
    return buildScaledAvatarCollider(scale, this._baseAvatarCollider || BASE_AVATAR_COLLIDER);
  }

  getAvatarScale() {
    return clampAvatarScale(this.avatarScale);
  }

  getAvatarScaleBounds() {
    return {
      min: AVATAR_SCALE_MIN,
      max: AVATAR_SCALE_MAX,
      defaultScale: AVATAR_SCALE_DEFAULT,
      step: AVATAR_SCALE_STEP
    };
  }

  _loadSavedAvatarMouseSensitivity() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(AVATAR_MOUSE_SENS_STORAGE_KEY);
        if (raw !== null && raw !== '') {
          return clampAvatarMouseSensitivity(raw);
        }
      }
    } catch { /* ignore storage restrictions */ }
    return AVATAR_MOUSE_SENS_DEFAULT;
  }

  getAvatarMouseSensitivity() {
    return clampAvatarMouseSensitivity(this.avatarMouseSensitivity);
  }

  getAvatarMouseSensitivityBounds() {
    return {
      min: AVATAR_MOUSE_SENS_MIN,
      max: AVATAR_MOUSE_SENS_MAX,
      defaultSensitivity: AVATAR_MOUSE_SENS_DEFAULT,
      step: AVATAR_MOUSE_SENS_STEP,
      baseRadPerPx: AVATAR_MOUSE_SENS_BASE_RAD_PER_PX
    };
  }

  _syncAvatarHudSliderControl({ rangeId, valueId, downId, upId, val, min, max }) {
    if (typeof document === 'undefined') return;
    const rangeEl = document.getElementById(rangeId);
    if (rangeEl) rangeEl.value = val.toFixed(2);
    const valEl = document.getElementById(valueId);
    if (valEl) valEl.textContent = `${val.toFixed(2)}x`;
    const downBtn = document.getElementById(downId);
    if (downBtn) downBtn.disabled = val <= min + 1e-4;
    const upBtn = document.getElementById(upId);
    if (upBtn) upBtn.disabled = val >= max - 1e-4;
  }

  _syncAvatarScaleHudControl() {
    this._syncAvatarHudSliderControl({
      rangeId: 'range-avatar-scale',
      valueId: 'avatar-scale-value',
      downId: 'btn-avatar-scale-down',
      upId: 'btn-avatar-scale-up',
      val: this.getAvatarScale(),
      min: AVATAR_SCALE_MIN,
      max: AVATAR_SCALE_MAX
    });
  }

  _syncAvatarMouseSensitivityHudControl() {
    this._syncAvatarHudSliderControl({
      rangeId: 'range-avatar-sens',
      valueId: 'avatar-sens-value',
      downId: 'btn-avatar-sens-down',
      upId: 'btn-avatar-sens-up',
      val: this.getAvatarMouseSensitivity(),
      min: AVATAR_MOUSE_SENS_MIN,
      max: AVATAR_MOUSE_SENS_MAX
    });
  }

  /**
   * Adjust Mode Teknisi mouse-look sensitivity multiplier cleanly with localStorage persistence.
   * @param {number} sensitivity
   * @param {{ persist?: boolean, silent?: boolean }} [options]
   * @returns {number} Clamped sensitivity multiplier
   */
  setAvatarMouseSensitivity(sensitivity, { persist = true, silent = false } = {}) {
    const nextSens = clampAvatarMouseSensitivity(sensitivity);
    this.avatarMouseSensitivity = nextSens;

    if (persist) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AVATAR_MOUSE_SENS_STORAGE_KEY, String(nextSens));
        }
      } catch { /* ignore storage restrictions */ }
    }

    this._syncAvatarMouseSensitivityHudControl();

    if (!silent) {
      this.showStatusHint?.(
        `Sensitivitas mouse Mode Teknisi: ${nextSens.toFixed(2)}x (${AVATAR_MOUSE_SENS_MIN}x - ${AVATAR_MOUSE_SENS_MAX}x).`
      );
    }
    return nextSens;
  }

  /**
   * Adjust local technician character scale strictly within safe multiplayer limits.
   * @param {number} scale
   * @param {{ persist?: boolean, silent?: boolean }} [options]
   * @returns {number} Clamped avatar scale
   */
  setAvatarScale(scale, { persist = true, silent = false } = {}) {
    const parsed = Number(scale);
    const nextScale = clampAvatarScale(scale);
    const wasClamped = Number.isFinite(parsed) && (parsed < AVATAR_SCALE_MIN - 1e-6 || parsed > AVATAR_SCALE_MAX + 1e-6);

    this.avatarScale = nextScale;
    this.avatarCollider = this._computeAvatarCollider(nextScale);

    if (persist) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AVATAR_SCALE_STORAGE_KEY, String(nextScale));
        }
      } catch { /* ignore storage restrictions */ }
    }

    if (this.avatarGroup) {
      this.avatarGroup.scale.setScalar(nextScale);
    }

    if (this.avatarMode) {
      if (typeof this.resolveAvatarCollisionStep === 'function') {
        const ax = Number(this.avatarState.x) || 0;
        const ay = Number(this.avatarState.y) || 0;
        const az = Number(this.avatarState.z) || 0;
        const resolved = this.resolveAvatarCollisionStep(ax, ay, az, {
          prevX: ax,
          prevY: ay,
          prevZ: az,
          vy: Number(this.avatarState.vy) || 0,
          isTeleport: true
        });
        this.avatarState.x = resolved.x;
        this.avatarState.y = resolved.y;
        this.avatarState.z = resolved.z;
        if (this.avatarGroup) {
          this.avatarGroup.position.set(resolved.x, resolved.y, resolved.z);
        }
      }
      if (this.carriedObjects?.length > 0) {
        this.updateCarriedObjectsTransform?.();
      }
      if (!this.simulatorFocusedDeviceId) {
        this.syncAvatarCameraFromAngles();
      }
    }

    this._syncAvatarScaleHudControl();
    this.publishLocalPresence?.(true);

    if (!silent) {
      this.showStatusHint?.(
        wasClamped
          ? `Skala karakter dibatasi ${AVATAR_SCALE_MIN}x - ${AVATAR_SCALE_MAX}x (${nextScale.toFixed(2)}x) agar multiplayer tetap kondusif.`
          : `Ukuran karakter teknisi: ${nextScale.toFixed(2)}x (batas ${AVATAR_SCALE_MIN}x - ${AVATAR_SCALE_MAX}x).`
      );
    }
    return nextScale;
  }

  getAvatarFollowCameraPose(followDist = this.avatarState.camDist || 5.8) {
    const camYaw = Number.isFinite(this.avatarState.camYaw)
      ? this.avatarState.camYaw
      : (Number(this.avatarState.yaw) || 0);
    const scale = resolveEngineAvatarScale(this);

    if (this.avatarPerspective === 'fpp') {
      const bobOffset = (this.avatarState.isMoving && this.avatarState.isGrounded)
        ? Math.sin((Number(this.avatarState.walkPhase) || 0) * 2) * 0.032 * scale
        : 0;
      const eyePos = new THREE.Vector3(
        this.avatarState.x,
        Math.max(0.45, this.avatarState.y + 1.66 * scale + bobOffset),
        this.avatarState.z
      );
      const lookPitch = clamp(-(Number.isFinite(this.avatarState.camPitch) ? this.avatarState.camPitch : 0), -1.35, 1.35);
      const cosP = Math.cos(lookPitch);
      const lookTarget = eyePos.clone().add(new THREE.Vector3(
        Math.sin(camYaw) * cosP * 5,
        Math.sin(lookPitch) * 5,
        Math.cos(camYaw) * cosP * 5
      ));
      return { endPos: eyePos, target: lookTarget };
    }

    const camPitch = clamp(
      Number.isFinite(this.avatarState.camPitch) ? this.avatarState.camPitch : 0.32,
      -0.15,
      1.18
    );
    const dist = clamp(Number(followDist) || 5.8, Math.max(2.0, 2.0 * scale), 22.0);
    const target = new THREE.Vector3(
      this.avatarState.x,
      this.avatarState.y + 1.38 * scale,
      this.avatarState.z
    );
    const horiz = Math.cos(camPitch) * dist;
    const vert = Math.sin(camPitch) * dist;
    const endPos = new THREE.Vector3(
      target.x - Math.sin(camYaw) * horiz,
      Math.max(0.35, target.y + vert),
      target.z - Math.cos(camYaw) * horiz
    );
    return { endPos, target };
  }

  syncAvatarCameraFromAngles() {
    if (!this.camera || !this.controls) return;
    this.cameraAnim = null;
    const { endPos, target } = this.getAvatarFollowCameraPose(this.avatarState.camDist);
    this.controls.target.copy(target);
    this.camera.position.copy(endPos);
  }

  applyAvatarMouseLookDelta(dx, dy) {
    if (!this.avatarMode || this.simulatorFocusedDeviceId) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const sensMult = resolveEngineMouseSensitivity(this);
    const sensitivity = AVATAR_MOUSE_SENS_BASE_RAD_PER_PX * sensMult;
    const minPitch = this.avatarPerspective === 'fpp' ? -1.35 : -0.15;
    const maxPitch = this.avatarPerspective === 'fpp' ? 1.35 : 1.18;
    this.avatarState.camYaw = (Number(this.avatarState.camYaw) || 0) - dx * sensitivity;
    this.avatarState.camPitch = clamp((Number(this.avatarState.camPitch) ?? 0.32) + dy * sensitivity, minPitch, maxPitch);
    if (this.avatarPerspective === 'fpp') {
      this.avatarState.yaw = this.avatarState.camYaw;
      if (this.carriedObjects?.length > 0) {
        this.updateCarriedObjectsTransform?.();
      }
    }
    this.syncAvatarCameraFromAngles();
  }

  setAvatarMode(enabled, { perspective } = {}) {
    const next = Boolean(enabled);
    if (!next && this.carriedObjects?.length > 0) {
      this.dropCarriedObjectsFromAvatar?.({ dropAll: true, silent: true });
    }
    this.avatarMode = next;
    this.avatarState._lastMouseClient = null;
    if (perspective === 'fpp' || perspective === 'tpp') {
      this.avatarPerspective = perspective;
      if (this.carriedObjects?.length > 0) {
        this.updateCarriedObjectsTransform?.();
      }
    }

    if (!next) {
      this.avatarState.isCarrying = false;
      if (this.avatarGroup) {
        this.avatarGroup.visible = false;
      }
      if (this.fppViewmodelGroup) {
        this.fppViewmodelGroup.visible = false;
      }
      this.releaseAvatarPointerLock();
      this.syncAvatarCrosshair();
      this.syncAvatarControlsUI();
      this.configureControlsForAvatarMode(false);
      if (typeof document !== 'undefined') {
        const hudEl = document.getElementById('hud-3d-avatar-bar');
        if (hudEl) {
          hudEl.innerHTML = '';
          hudEl.classList.add('hidden');
          hudEl.style.display = 'none';
        }
      }
      this.showStatusHint('Mode Teknisi dimatikan — kembali ke navigasi kamera bebas.');
      this.publishLocalPresence?.(true);
      return false;
    }

    const activeUser = authManager.getCurrentUser?.();
    const localAvatarLabel = activeUser ? `@${activeUser.username}` : 'Teknisi Jaringan';
    if (!this.avatarGroup) {
      this.avatarGroup = createRobloxAvatar3DGroup(localAvatarLabel);
    } else {
      updateRobloxAvatarLabel(this.avatarGroup, localAvatarLabel, '#76c457');
    }
    const curScale = resolveEngineAvatarScale(this);
    this.avatarCollider = buildScaledAvatarCollider(curScale, this._baseAvatarCollider || BASE_AVATAR_COLLIDER);
    this.avatarGroup.scale.setScalar(curScale);
    if (this.scene && !this.scene.children.includes(this.avatarGroup)) {
      this.scene.add(this.avatarGroup);
    }

    // Exit open port inspector if switching directly into Mode Teknisi
    if (this.simulatorFocusedDeviceId) {
      this.exitSimulatorFocus({ restoreCamera: false });
    }

    // Ensure devices are synced so teleport/spawn positions are populated
    if (this.isActive && this.effectivePosMap.size === 0 && (this.deviceManager?.getAllDevices?.() || []).length > 0) {
      this.syncDevices();
    }

    // Spawn near selected device, camera target on floor, or first available device
    const selectedId = this.deviceManager?.selectedDeviceId;
    const fallbackId = selectedId && this.effectivePosMap.has(selectedId)
      ? selectedId
      : (this.effectivePosMap.keys().next().value || null);

    if (selectedId && this.effectivePosMap.has(selectedId)) {
      this.teleportAvatarToDevice(selectedId, { duration: 380 });
    } else {
      let spawnX = 0;
      let spawnZ = 0;
      let spawnYaw = 0;
      const { worldW, worldD } = this.getWorldDimensions();
      const target = this.controls?.target;
      if (target && Math.abs(target.x) <= worldW * 0.55 && Math.abs(target.z) <= worldD * 0.55) {
        spawnX = target.x;
        spawnZ = target.z;
      } else if (fallbackId && this.effectivePosMap.has(fallbackId)) {
        const fp = this.effectivePosMap.get(fallbackId);
        spawnX = fp.x;
        spawnZ = fp.z + 2.8;
        spawnYaw = Math.PI;
      }

      // Apply slight deterministic offset if other online teammates are already near spawn point
      if (this.remoteAvatarMap?.size > 0) {
        const cid = String(authManager.clientId || 'local');
        let h = 0;
        for (let i = 0; i < cid.length; i++) h = ((h << 5) - h + cid.charCodeAt(i)) | 0;
        const ang = (Math.abs(h) % 360) * (Math.PI / 180);
        spawnX = Math.max(-worldW * 0.55, Math.min(worldW * 0.55, spawnX + Math.cos(ang) * 1.6));
        spawnZ = Math.max(-worldD * 0.55, Math.min(worldD * 0.55, spawnZ + Math.sin(ang) * 1.6));
      }

      const resolvedSpawn = this.resolveAvatarCollisionStep
        ? this.resolveAvatarCollisionStep(spawnX, 0, spawnZ, { prevY: 0, vy: 0, isTeleport: true })
        : { x: spawnX, y: 0, z: spawnZ };
      spawnX = resolvedSpawn.x;
      const spawnY = resolvedSpawn.y;
      spawnZ = resolvedSpawn.z;

      this.avatarState.x = spawnX;
      this.avatarState.y = spawnY;
      this.avatarState.z = spawnZ;
      this.avatarState.yaw = spawnYaw;
      this.avatarState.camYaw = spawnYaw;
      this.avatarState.camPitch = this.avatarPerspective === 'fpp' ? 0.02 : 0.32;
      this.avatarState.vy = 0;
      this.avatarState.isGrounded = true;
      this.avatarGroup.position.set(spawnX, spawnY, spawnZ);
      this.avatarGroup.rotation.y = spawnYaw;
      animateRobloxAvatarRig(this.avatarGroup, this.avatarState, 0.016);

      const camPose = this.getAvatarFollowCameraPose();
      this.animateCameraTo(camPose.endPos, camPose.target, 380);
    }

    this.configureControlsForAvatarMode(true);
    this.syncAvatarMeshVisibilityForPerspective();
    this.syncAvatarControlsUI();
    this.syncAvatarCrosshair();
    this.findNearestDeviceToAvatar();
    this.renderAvatarHudBar();
    this.tryLockAvatarPointer();
    this.publishLocalPresence?.(true);
    this.showStatusHint(
      this.avatarPerspective === 'fpp'
        ? 'Mode FPP aktif: Gerakkan mouse lihat dari mata teknisi, WASD jalan, Spasi lompat, V ke TPP, F inspeksi.'
        : 'Mode Teknisi aktif: Gerakkan mouse lihat sekeliling, WASD jalan, Shift lari, Spasi lompat, V ke FPP, F inspeksi.'
    );
    return true;
  }

  toggleAvatarMode() {
    return this.setAvatarMode(!this.avatarMode);
  }

  teleportAvatarToDevice(deviceId, { duration = 360 } = {}) {
    if (!deviceId || !this.effectivePosMap.has(deviceId)) return false;

    const { panelCenter, panelNormal } = this.getDevicePortPanelPose(deviceId);
    const { worldW, worldD } = this.getWorldDimensions();
    const distInFront = Math.max(2.2, Math.min(3.5, this.deviceScaleMultiplier * 0.95));
    const rawX = panelCenter.x + panelNormal.x * distInFront;
    const rawZ = panelCenter.z + panelNormal.z * distInFront;
    const tx = Math.max(-worldW * 0.55, Math.min(worldW * 0.55, rawX));
    const tz = Math.max(-worldD * 0.55, Math.min(worldD * 0.55, rawZ));

    const resolvedTeleport = this.resolveAvatarCollisionStep
      ? this.resolveAvatarCollisionStep(tx, 0, tz, { prevY: 0, vy: 0, isTeleport: true })
      : { x: tx, y: 0, z: tz };
    const finalTx = resolvedTeleport.x;
    const finalTy = resolvedTeleport.y;
    const finalTz = resolvedTeleport.z;

    // Face the device ports cleanly
    const yaw = Math.atan2(panelCenter.x - finalTx, panelCenter.z - finalTz);
    this.avatarState.x = finalTx;
    this.avatarState.y = finalTy;
    this.avatarState.z = finalTz;
    this.avatarState.yaw = yaw;
    this.avatarState.camYaw = yaw;
    this.avatarState.camPitch = this.avatarPerspective === 'fpp' ? 0.02 : 0.28;
    this.avatarState.vy = 0;
    this.avatarState.isGrounded = true;
    this.avatarState.isMoving = false;

    if (this.avatarGroup) {
      this.avatarGroup.position.set(finalTx, finalTy, finalTz);
      this.avatarGroup.rotation.y = yaw;
      animateRobloxAvatarRig(this.avatarGroup, this.avatarState, 0.016);
    }

    const camPose = this.getAvatarFollowCameraPose();
    this.animateCameraTo(camPose.endPos, camPose.target, duration);
    if (this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }
    this.findNearestDeviceToAvatar();
    this.updateAvatarProximityHud();
    this.publishLocalPresence?.(true);
    return true;
  }

  findNearestDeviceToAvatar() {
    let bestId = null;
    let bestDist = Infinity;
    for (const [devId, pos] of this.effectivePosMap.entries()) {
      const dev = this.deviceManager?.getDeviceById?.(devId);
      if (dev && dev.layerVisible === false) continue;
      const d = Math.hypot((pos?.x ?? 0) - this.avatarState.x, (pos?.z ?? 0) - this.avatarState.z);
      if (d < bestDist) {
        bestDist = d;
        bestId = devId;
      }
    }
    this.avatarState.nearestDeviceId = bestId;
    this.avatarState.nearestDist = bestDist;
    return { deviceId: bestId, distance: bestDist };
  }

  inspectNearestDeviceFromAvatar() {
    const { deviceId } = this.findNearestDeviceToAvatar();
    const targetId = deviceId || this.deviceManager?.selectedDeviceId || null;
    if (!targetId) {
      this.showStatusHint('Tidak ada perangkat di area denah untuk diinspeksi.');
      return false;
    }
    stateManager.deselectObject3d?.();
    this.deviceManager?.selectDevice?.(targetId);
    this.focusOnDevice(targetId, { viewAngle: this.simulatorViewAngle || 'front', saveReturnCamera: true });
    return true;
  }

  findNearestPickableObjectToAvatar() {
    const carriedIds = new Set();
    if (Array.isArray(this.carriedObjects)) {
      for (const c of this.carriedObjects) {
        if (c.objId) carriedIds.add(c.objId);
        if (c.devId) carriedIds.add(c.devId);
        c.mountedPeers?.forEach((p) => { if (p?.id) carriedIds.add(p.id); });
      }
    }
    const ax = Number(this.avatarState.x) || 0;
    const az = Number(this.avatarState.z) || 0;
    const yaw = Number(this.avatarState.yaw) || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const maxReach = Number(this.objectCarryReachMeters) || 6.5;

    let best = null;

    // 1) Custom 3D Objects (walls, racks, poles, tables, boxes, cylinders, cabinets)
    const objects = typeof stateManager?.getObjects3d === 'function' ? stateManager.getObjects3d() : [];
    for (const obj of objects) {
      if (!obj || obj.visible === false || obj.locked === true || carriedIds.has(obj.id)) continue;
      const pos = this.normToWorld ? this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5) : { x: 0, z: 0 };
      const w = Math.max(0.15, Number(obj.widthMeters) || 1);
      const d = Math.max(0.15, Number(obj.depthMeters) || 1);
      const dx = pos.x - ax;
      const dz = pos.z - az;
      const centerDist = Math.hypot(dx, dz);
      const halfReach = Math.min(2.6, Math.hypot(w, d) * 0.4);
      const edgeDist = Math.max(0, centerDist - halfReach);
      if (edgeDist > maxReach) continue;

      const invD = centerDist > 0.001 ? 1 / centerDist : 0;
      const dot = (dx * fwdX + dz * fwdZ) * invD;
      const score = edgeDist - (dot > 0.45 ? 0.65 : 0);
      if (!best || score < best.score || (Math.abs(score - best.score) < 0.05 && centerDist < best.centerDist)) {
        best = {
          kind: 'object3d',
          id: obj.id,
          name: obj.name || 'Objek 3D',
          obj,
          distance: edgeDist,
          centerDist,
          score
        };
      }
    }

    // 2) Visible unlocked Network Devices (routers, switches, APs, servers, racks, etc.)
    const devices = typeof this.deviceManager?.getAllDevices === 'function' ? this.deviceManager.getAllDevices() : [];
    for (const dev of devices) {
      if (!dev || dev.layerVisible === false || dev.layerLocked === true || carriedIds.has(dev.id)) continue;
      const effPos = this.effectivePosMap?.get(dev.id);
      const pos = effPos || (this.normToWorld && dev.position ? this.normToWorld(dev.position.x, dev.position.y) : null);
      if (!pos) continue;
      const sp = dev.spatial3d || getDefaultSpatial3d(dev.type);
      const userModelScale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 3.0);
      const fp = this.getDeviceCollisionFootprint
        ? this.getDeviceCollisionFootprint(dev, userModelScale)
        : { halfW: 0.9, halfD: 0.7, height: 0.8 };
      const dx = pos.x - ax;
      const dz = pos.z - az;
      const centerDist = Math.hypot(dx, dz);
      const halfReach = Math.min(4.5, Math.hypot(fp.halfW, fp.halfD));
      const edgeDist = Math.max(0, centerDist - halfReach);
      if (edgeDist > maxReach) continue;

      const invD = centerDist > 0.001 ? 1 / centerDist : 0;
      const dot = (dx * fwdX + dz * fwdZ) * invD;
      const devElev = Number(sp.elevationMeters) || 0;
      const mountedOnUncarriedObj = objects.some(
        (o) =>
          o &&
          o.visible !== false &&
          !carriedIds.has(o.id) &&
          Math.hypot((dev.position?.x ?? 0) - (o.x ?? 0.5), (dev.position?.y ?? 0) - (o.y ?? 0.5)) < 0.018 &&
          devElev >= (Number(o.elevationMeters) || 0)
      );
      // If device is mounted onto an uncarried rack/pole/table, prefer lifting the parent structure first
      const score = edgeDist - (dot > 0.45 ? 0.65 : 0) + (mountedOnUncarriedObj ? 1.8 : 0);
      if (!best || score < best.score || (Math.abs(score - best.score) < 0.05 && centerDist < best.centerDist)) {
        best = {
          kind: 'device',
          id: dev.id,
          name: dev.name || 'Perangkat',
          obj: dev,
          dev,
          distance: edgeDist,
          centerDist,
          score
        };
      }
    }

    return best
      ? {
          kind: best.kind,
          id: best.id,
          name: best.name,
          obj: best.obj,
          dev: best.dev || null,
          distance: best.distance
        }
      : null;
  }

  pickupNearestObjectFromAvatar() {
    if (!this.avatarMode) return false;
    const nearest = this.findNearestPickableObjectToAvatar();
    if (!nearest?.id) {
      this.showStatusHint(`Tidak ada objek/perangkat dalam jangkauan (<= ${(this.objectCarryReachMeters || 6.5).toFixed(1)}m) untuk diangkat.`);
      return false;
    }
    if (nearest.kind === 'device') {
      return this.pickupDeviceFromAvatar(nearest.id);
    }
    return this.pickupObjectFromAvatar(nearest.id);
  }

  _canAvatarCarryMoreAndWrite() {
    if (
      authManager?.isAuthenticated?.()
      && authManager.getActiveWorkspaceKey?.() === 'main'
      && authManager.isMainWorkspaceUnlocked?.() === false
    ) {
      this.showStatusHint('Server Utama terkunci (hanya lihat). Buka kunci Server Utama dulu untuk memindahkan objek.');
      return false;
    }
    if (!Array.isArray(this.carriedObjects)) this.carriedObjects = [];
    const maxCarry = Number(this.maxCarriedObjects) || 8;
    if (this.carriedObjects.length >= maxCarry) {
      this.showStatusHint(`Maksimal ${maxCarry} objek/perangkat dapat dibawa sekaligus. Tekan Q untuk menaruh.`);
      return false;
    }
    return true;
  }

  pickupObjectFromAvatar(objId) {
    if (!this.avatarMode || !objId) return false;
    if (!this._canAvatarCarryMoreAndWrite()) return false;

    const obj = stateManager.getObject3dById?.(objId);
    if (!obj || obj.visible === false || obj.locked === true) return false;
    if (this.carriedObjects.some((c) => c.objId === obj.id || c.devId === obj.id)) return false;

    const w = Math.max(0.15, Number(obj.widthMeters) || 1);
    const d = Math.max(0.15, Number(obj.depthMeters) || 1);
    const h = Math.max(0.15, Number(obj.heightMeters) || 2);
    const maxDim = Math.max(w, d, h);
    const tppScale = maxDim > 1.8 ? Math.max(0.38, 1.55 / maxDim) : 1.0;
    const fppScale = maxDim > 0.9 ? Math.max(0.28, 0.72 / maxDim) : 0.75;

    const avatarDeg = ((Number(this.avatarState.yaw) || 0) * 180) / Math.PI;
    const origRotY = Number(obj.rotationY ?? obj.rotationDeg) || 0;
    const mountedPeers = this._collectMountedDevicePeersForObject(obj);

    if (stateManager.getSelectedObject3dId?.() === obj.id) {
      stateManager.deselectObject3d?.();
    }

    this.carriedObjects.push({
      kind: 'object3d',
      objId: obj.id,
      devId: null,
      name: obj.name || 'Objek 3D',
      shape: obj.shape || 'box',
      initialNormX: obj.x ?? 0.5,
      initialNormY: obj.y ?? 0.5,
      initialElev: Number(obj.elevationMeters) || 0,
      initialRotY: origRotY,
      relativeYawOffset: origRotY - avatarDeg,
      widthMeters: w,
      depthMeters: d,
      heightMeters: h,
      tppScale,
      fppScale,
      mountedPeers
    });

    this.avatarState.isCarrying = true;
    this.updateCarriedObjectsTransform();
    this.updateAvatarProximityHud();
    this.publishLocalPresence?.(true);
    this.showStatusHint(
      `📦 Mengangkat "${obj.name || 'Objek 3D'}" (${this.carriedObjects.length} dibawa) — E tambah lagi • Q taruh • Shift+Q taruh semua • [ / ] putar`
    );
    return true;
  }

  pickupDeviceFromAvatar(devId) {
    if (!this.avatarMode || !devId) return false;
    if (!this._canAvatarCarryMoreAndWrite()) return false;

    const dev = this.deviceManager?.getDeviceById?.(devId);
    if (!dev || dev.layerVisible === false || dev.layerLocked === true) return false;
    if (this.carriedObjects.some((c) => c.devId === dev.id || c.objId === dev.id || c.mountedPeers?.some((p) => p?.id === dev.id))) return false;

    const sp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    const userModelScale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 3.0);
    const fp = this.getDeviceCollisionFootprint
      ? this.getDeviceCollisionFootprint(dev, userModelScale)
      : { halfW: 0.9, halfD: 0.7, height: 0.8 };
    const w = Math.max(0.25, fp.halfW * 2);
    const d = Math.max(0.25, fp.halfD * 2);
    const h = Math.max(0.25, fp.height);
    const maxDim = Math.max(w, d, h);
    const tppScale = maxDim > 1.6 ? Math.max(0.32, 1.35 / maxDim) : 1.0;
    const fppScale = maxDim > 0.8 ? Math.max(0.22, 0.65 / maxDim) : 0.72;

    const avatarDeg = ((Number(this.avatarState.yaw) || 0) * 180) / Math.PI;
    const origRotY = Number(sp.rotationY ?? dev.rotation ?? 0) || 0;
    const pWorld = this.normToWorld ? this.normToWorld(dev.position.x, dev.position.y) : { x: 0, z: 0 };
    const holder = this.deviceMeshMap?.get(dev.id);
    const startX = holder ? holder.position.x : pWorld.x;
    const startY = holder ? holder.position.y : Math.max(0, (Number(sp.elevationMeters) || 0) + (Number(sp.offsetY) || 0));
    const startZ = holder ? holder.position.z : pWorld.z;

    if (this.deviceManager?.selectedDeviceId === dev.id) {
      this.deviceManager.deselectDevice?.();
    }

    this.carriedObjects.push({
      kind: 'device',
      objId: dev.id,
      devId: dev.id,
      name: dev.name || 'Perangkat',
      shape: 'device',
      initialNormX: dev.position?.x ?? 0.5,
      initialNormY: dev.position?.y ?? 0.5,
      initialWorldX: startX,
      initialElev: startY,
      initialWorldZ: startZ,
      initialRotY: origRotY,
      relativeYawOffset: origRotY - avatarDeg,
      widthMeters: w,
      depthMeters: d,
      heightMeters: h,
      tppScale,
      fppScale,
      portInitials: this._collectDevicePortInitials?.(dev.id) || [],
      mountedPeers: []
    });

    this.avatarState.isCarrying = true;
    this.updateCarriedObjectsTransform();
    this.updateAvatarProximityHud();
    this.publishLocalPresence?.(true);
    this.showStatusHint(
      `📦 Mengangkat "${dev.name}" (${this.carriedObjects.length} dibawa) — E tambah lagi • Q taruh • Shift+Q taruh semua • [ / ] putar`
    );
    return true;
  }

  _getAvatarWallAimRay() {
    const ax = Number(this.avatarState?.x) || 0;
    const ay = Number(this.avatarState?.y) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const scale = resolveEngineAvatarScale(this);
    if (this.avatarPerspective === 'fpp' && typeof this.getAvatarFollowCameraPose === 'function') {
      const pose = this.getAvatarFollowCameraPose(this.avatarState?.camDist);
      const dir = pose.target.clone().sub(pose.endPos).normalize();
      return { origin: pose.endPos.clone(), dir, maxDist: Number((4.2 + Math.max(0, scale - 1) * 0.8).toFixed(2)) };
    }
    const yaw = Number(this.avatarState?.yaw) || 0;
    return {
      origin: new THREE.Vector3(ax, ay + 1.35 * scale, az),
      dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      maxDist: Number((3.4 + Math.max(0, scale - 1) * 0.8).toFixed(2))
    };
  }

  getCarriedDropSupportElevation(dropX, dropZ, excludeId = '') {
    const objects = typeof stateManager?.getObjects3d === 'function' ? stateManager.getObjects3d() : [];
    const carriedIds = new Set((this.carriedObjects || []).map((c) => c.objId || c.devId));
    if (excludeId) carriedIds.add(excludeId);
    let supportY = 0;

    for (const obj of objects) {
      if (!obj || obj.visible === false || carriedIds.has(obj.id)) continue;
      const shape = String(obj.shape || 'box').toLowerCase();
      if (shape === 'pole' || shape === 'tower-lattice') continue;
      const h = Math.max(0.15, Number(obj.heightMeters) || 2);
      const elev = Math.max(0, Number(obj.elevationMeters) || 0);
      const topY = elev + h;
      if (topY > 2.4) continue;

      const pos = this.normToWorld ? this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5) : { x: 0, z: 0 };
      const w = Math.max(0.15, Number(obj.widthMeters) || 1);
      const d = Math.max(0.15, Number(obj.depthMeters) || 1);
      const rotY = ((Number(obj.rotationY ?? obj.rotationDeg) || 0) * Math.PI) / 180;
      const inside = shape === 'cylinder'
        ? Math.hypot(dropX - pos.x, dropZ - pos.z) <= Math.max(w, d) * 0.5
        : this._isCircleOverRotatedBoxXZ(dropX, dropZ, 0.05, pos.x, pos.z, w * 0.5, d * 0.5, rotY);
      if (inside && topY > supportY) {
        supportY = topY;
      }
    }

    const avatarFloorLimit = Math.max(2.4, (Number(this.avatarState?.y) || 0) + 1.5);
    const roomFloorY = this._sampleRoomFloorHeightAtWorld?.(dropX, dropZ, avatarFloorLimit) || 0;
    if (roomFloorY > supportY) {
      supportY = roomFloorY;
    }

    return Number(supportY.toFixed(2));
  }

  updateCarriedObjectsTransform() {
    if (!Array.isArray(this.carriedObjects) || this.carriedObjects.length === 0) return;
    const ax = Number(this.avatarState.x) || 0;
    const ay = Number(this.avatarState.y) || 0;
    const az = Number(this.avatarState.z) || 0;
    const yaw = Number(this.avatarState.yaw) || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const isFpp = this.avatarPerspective === 'fpp';

    let maxFootRad = 0.35;
    for (const item of this.carriedObjects) {
      const scale = isFpp ? item.fppScale : item.tppScale;
      const rad = Math.min(1.0, Math.max(item.widthMeters, item.depthMeters) * scale * 0.45);
      if (rad > maxFootRad) maxFootRad = rad;
    }

    const carryScale = resolveEngineAvatarScale(this);
    const carryDistMul = 1 + (carryScale - 1) * 0.55;
    const carryFwdDist = (isFpp ? 1.1 : 0.95) * carryDistMul + maxFootRad * (isFpp ? 0.55 : 0.65);
    const rawAnchorX = ax + fwdX * carryFwdDist;
    const rawAnchorZ = az + fwdZ * carryFwdDist;
    const anchorNorm = this.worldToNorm ? this.worldToNorm(rawAnchorX, rawAnchorZ) : { normX: 0.5, normY: 0.5 };
    const anchorWorld = this.normToWorld ? this.normToWorld(anchorNorm.normX, anchorNorm.normY) : { x: rawAnchorX, z: rawAnchorZ };

    let stackY = ay + (isFpp ? 0.68 : 0.86) * carryScale;
    let anyMovedDevices = false;

    for (const item of this.carriedObjects) {
      const scale = isFpp ? item.fppScale : item.tppScale;
      const worldRotY = ((yaw * 180) / Math.PI) + (Number(item.relativeYawOffset) || 0);

      if (item.kind === 'device') {
        const holder = this.deviceMeshMap?.get(item.devId);
        const deltaRotRad = ((worldRotY - item.initialRotY) * Math.PI) / 180;
        const cosD = Math.cos(deltaRotRad);
        const sinD = Math.sin(deltaRotRad);
        if (holder) {
          holder.position.set(anchorWorld.x, stackY, anchorWorld.z);
          holder.scale.setScalar(scale);
          holder.rotation.y = deltaRotRad;
          holder.userData.isCarriedByAvatar = true;
        }
        this.effectivePosMap?.set(item.devId, new THREE.Vector3(anchorWorld.x, stackY + 0.35 * scale, anchorWorld.z));
        if (Array.isArray(item.portInitials) && item.portInitials.length > 0) {
          anyMovedDevices = true;
          item.portInitials.forEach(({ key, initial }) => {
            const ox = initial.x - item.initialWorldX;
            const oy = initial.y - item.initialElev;
            const oz = initial.z - item.initialWorldZ;
            const rx = ox * cosD + oz * sinD;
            const rz = -ox * sinD + oz * cosD;
            this.portWorldPosMap?.set(
              key,
              new THREE.Vector3(anchorWorld.x + rx * scale, stackY + oy * scale, anchorWorld.z + rz * scale)
            );
          });
        }
      } else {
        const latestObj = stateManager.getObject3dById?.(item.objId);
        const rxRad = ((Number(latestObj?.rotationX) || 0) * Math.PI) / 180;
        const ryRad = (worldRotY * Math.PI) / 180;
        const rzRad = ((Number(latestObj?.rotationZ) || 0) * Math.PI) / 180;

        const meshGroup = this.object3dMeshMap?.get(item.objId);
        if (meshGroup) {
          meshGroup.position.set(anchorWorld.x, stackY, anchorWorld.z);
          meshGroup.scale.setScalar(scale);
          meshGroup.rotation.set(rxRad, ryRad, rzRad, 'YXZ');
          meshGroup.userData.isCarriedByAvatar = true;
        }

        if (Array.isArray(item.mountedPeers) && item.mountedPeers.length > 0) {
          anyMovedDevices = true;
          const pShiftY = stackY - item.initialElev;
          item.mountedPeers.forEach((peer) => {
            const px = anchorWorld.x + (peer.localOffsetX || 0) * scale;
            const pz = anchorWorld.z + (peer.localOffsetZ || 0) * scale;
            if (peer.meshGroup) {
              peer.meshGroup.position.x = px;
              peer.meshGroup.position.y = peer.meshStartY + pShiftY;
              peer.meshGroup.position.z = pz;
            }
            this.effectivePosMap?.set(peer.id, new THREE.Vector3(px, peer.effY + pShiftY, pz));
            const deltaX = px - peer.startWorldX;
            const deltaZ = pz - peer.startWorldZ;
            peer.portInitials?.forEach(({ key, initial }) => {
              this.portWorldPosMap?.set(key, new THREE.Vector3(initial.x + deltaX, initial.y + pShiftY, initial.z + deltaZ));
            });
          });
        }
      }

      stackY += Math.min(0.85, Math.max(0.28, item.heightMeters * scale));
    }

    if (anyMovedDevices) {
      this.syncCables?.();
    }
  }

  dropCarriedObjectsFromAvatar({ dropAll = false, silent = false } = {}) {
    if (!Array.isArray(this.carriedObjects) || this.carriedObjects.length === 0) return 0;

    const toDrop = dropAll
      ? [...this.carriedObjects]
      : [this.carriedObjects.pop()];
    if (dropAll) {
      this.carriedObjects = [];
    }
    this.avatarState.isCarrying = this.carriedObjects.length > 0;

    const ax = Number(this.avatarState.x) || 0;
    const az = Number(this.avatarState.z) || 0;
    const yaw = Number(this.avatarState.yaw) || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const avatarRadius = Number(this.avatarCollider?.radius) || 0.48;

    const placements = toDrop.map((item) => {
      const worldRotY = (((yaw * 180) / Math.PI) + (Number(item.relativeYawOffset) || 0));
      const normRotY = ((Math.round(worldRotY) % 360) + 360) % 360;
      const rotRad = (normRotY * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      const projFwd = Math.abs(fwdX * cosR - fwdZ * sinR) * (item.widthMeters * 0.5)
        + Math.abs(fwdX * sinR + fwdZ * cosR) * (item.depthMeters * 0.5);
      const projLat = Math.abs(rightX * cosR - rightZ * sinR) * (item.widthMeters * 0.5)
        + Math.abs(rightX * sinR + rightZ * cosR) * (item.depthMeters * 0.5);
      return { item, normRotY, projFwd, projLat };
    });

    const gap = 0.35;
    const totalSpan = placements.reduce((acc, p) => acc + p.projLat * 2, 0) + Math.max(0, placements.length - 1) * gap;
    const maxProjFwd = Math.max(...placements.map((p) => p.projFwd));
    let latCursor = -totalSpan * 0.5;
    let needsDeviceSync = false;
    let mountedOnWallCount = 0;

    // Detect if technician is aiming/facing a 3D room wall to mount device(s) directly onto it
    const firstDevItem = placements.find((p) => p.item.kind === 'device');
    const aimRay = (!silent && firstDevItem) ? this._getAvatarWallAimRay() : null;
    const sampleDev = firstDevItem ? this.deviceManager?.getDeviceById?.(firstDevItem.item.devId) : null;
    const wallMountHit = (aimRay && sampleDev)
      ? this.find3DWallMountTarget(aimRay.origin, aimRay.dir, aimRay.maxDist, { device: sampleDev, minHitY: 0.25, maxHitY: 12.0 })
      : null;

    for (let i = 0; i < placements.length; i++) {
      const { item, normRotY, projFwd, projLat } = placements[i];
      const latOffset = placements.length === 1 ? 0 : (latCursor + projLat);
      latCursor += projLat * 2 + gap;

      let rawDropX;
      let rawDropZ;
      let dropNorm;
      let dropWorld;
      let dropElev;
      let targetRotY = normRotY;
      let wallMountedThisItem = false;

      if (item.kind === 'device' && wallMountHit) {
        const dev = this.deviceManager?.getDeviceById?.(item.devId);
        const tangentX = -wallMountHit.worldNormal.z;
        const tangentZ = wallMountHit.worldNormal.x;
        // Recompute standoff per device when dropping multiple items onto the wall
        const devHit = (dev && dev !== sampleDev)
          ? this.find3DWallMountTarget(aimRay.origin, aimRay.dir, aimRay.maxDist, { device: dev, minHitY: 0.25, maxHitY: 12.0 }) || wallMountHit
          : wallMountHit;
        rawDropX = devHit.worldPos.x + tangentX * latOffset;
        rawDropZ = devHit.worldPos.z + tangentZ * latOffset;
        dropNorm = this.worldToNorm ? this.worldToNorm(rawDropX, rawDropZ) : { normX: 0.5, normY: 0.5 };
        dropWorld = this.normToWorld ? this.normToWorld(dropNorm.normX, dropNorm.normY) : { x: rawDropX, z: rawDropZ };
        const defaultElev = Number(getDefaultSpatial3d(dev?.type)?.elevationMeters) || 1.65;
        const avatarBaseY = Math.max(0, Number(this.avatarState?.y) || 0);
        dropElev = this.avatarPerspective === 'fpp'
          ? clamp(devHit.elevationMeters, 0.25, 11.5)
          : Number(clamp(avatarBaseY + Math.max(1.35, defaultElev), 0.35, 11.5).toFixed(2));
        targetRotY = devHit.rotationY;
        wallMountedThisItem = true;
        mountedOnWallCount += 1;
      } else {
        const fwdDist = placements.length === 1
          ? Math.max(1.35, avatarRadius + projFwd + 0.35)
          : Math.max(1.5, avatarRadius + maxProjFwd + 0.4);

        rawDropX = ax + fwdX * fwdDist + rightX * latOffset;
        rawDropZ = az + fwdZ * fwdDist + rightZ * latOffset;
        dropNorm = this.worldToNorm ? this.worldToNorm(rawDropX, rawDropZ) : { normX: 0.5, normY: 0.5 };
        dropWorld = this.normToWorld ? this.normToWorld(dropNorm.normX, dropNorm.normY) : { x: rawDropX, z: rawDropZ };
        dropElev = this.getCarriedDropSupportElevation(dropWorld.x, dropWorld.z, item.objId || item.devId);
      }

      if (item.kind === 'device') {
        needsDeviceSync = true;
        const holder = this.deviceMeshMap?.get(item.devId);
        if (holder) {
          holder.scale.setScalar(1);
          holder.rotation.y = 0;
          holder.userData.isCarriedByAvatar = false;
        }
        const dev = this.deviceManager?.getDeviceById?.(item.devId);
        if (dev && this.deviceManager) {
          if (typeof this.deviceManager.moveDeviceGroup === 'function') {
            this.deviceManager.moveDeviceGroup([{ id: item.devId, position: { x: dropNorm.normX, y: dropNorm.normY } }], { syncRenderer: false });
          }
          const latestDev = this.deviceManager.getDeviceById?.(item.devId) || dev;
          const baseSp = { ...getDefaultSpatial3d(latestDev.type), ...(latestDev.spatial3d || {}) };
          this.deviceManager.updateDevice?.(item.devId, {
            spatial3d: {
              ...baseSp,
              elevationMeters: dropElev,
              rotationY: targetRotY,
              ...(wallMountedThisItem ? { mountType: 'wall' } : {}),
              offsetX: 0,
              offsetY: 0,
              offsetZ: 0
            }
          });
        }
        continue;
      }

      const meshGroup = this.object3dMeshMap?.get(item.objId);
      if (meshGroup) {
        meshGroup.scale.setScalar(1);
        meshGroup.userData.isCarriedByAvatar = false;
      }

      const updatedObj = stateManager.updateObject3d?.(item.objId, {
        x: dropNorm.normX,
        y: dropNorm.normY,
        elevationMeters: dropElev,
        rotationY: normRotY
      });
      if (updatedObj && this.isInitialized) {
        this.rebuildSingleObject3dMesh?.(updatedObj, false);
      }

      if (Array.isArray(item.mountedPeers) && item.mountedPeers.length > 0 && this.deviceManager) {
        needsDeviceSync = true;
        const deltaNormX = dropNorm.normX - item.initialNormX;
        const deltaNormY = dropNorm.normY - item.initialNormY;
        const deltaElev = dropElev - item.initialElev;
        const moves = item.mountedPeers.map((p) => ({
          id: p.id,
          position: {
            x: clamp(p.startNormX + deltaNormX, 0.01, 0.99),
            y: clamp(p.startNormY + deltaNormY, 0.01, 0.99)
          }
        }));
        if (moves.length > 0 && typeof this.deviceManager.moveDeviceGroup === 'function') {
          this.deviceManager.moveDeviceGroup(moves, { syncRenderer: false });
        }
        if (Math.abs(deltaElev) > 0.01 && typeof this.deviceManager.updateDevice === 'function') {
          item.mountedPeers.forEach((p) => {
            const dev = this.deviceManager.getDeviceById?.(p.id);
            if (!dev) return;
            const baseSp = dev.spatial3d || {};
            this.deviceManager.updateDevice(p.id, {
              spatial3d: {
                ...baseSp,
                elevationMeters: Math.max(0, Number(((Number(p.startElev) || 0) + deltaElev).toFixed(2)))
              }
            });
          });
        }
      }
    }

    if (needsDeviceSync && this.isActive && this.isInitialized) {
      this.syncDevices();
      this.syncCables();
    }
    if (this.carriedObjects.length > 0) {
      this.updateCarriedObjectsTransform();
    }
    this.updateAvatarProximityHud();
    this.publishLocalPresence?.(true);

    if (!silent) {
      let msg;
      if (mountedOnWallCount > 0) {
        msg = mountedOnWallCount === 1 && toDrop.length === 1
          ? `📌 Menempelkan "${toDrop[0].name}" langsung ke dinding 3D ruangan${this.carriedObjects.length > 0 ? ` (sisa dibawa: ${this.carriedObjects.length})` : ''}`
          : `📌 Menempelkan ${mountedOnWallCount} perangkat ke dinding 3D ruangan`;
      } else {
        msg = toDrop.length === 1
          ? `✅ Menaruh "${toDrop[0].name}"${this.carriedObjects.length > 0 ? ` (sisa dibawa: ${this.carriedObjects.length})` : ''}`
          : `✅ Menaruh ${toDrop.length} item sekaligus ke posisi teknisi`;
      }
      this.showStatusHint(msg);
    }
    return toDrop.length;
  }

  updateAvatarController(dt = 0.016) {
    if (!this.avatarMode) return;

    let forward = 0;
    let right = 0;
    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) forward += 1;
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) forward -= 1;
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) right += 1;
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) right -= 1;
    const jumpPressed = this.keysPressed.has('space');
    const hasMoveInput = forward !== 0 || right !== 0;
    const isRunning = this.keysPressed.has('shift');

    // Walking or jumping out of Simulator Port Focus immediately resumes third-person tracking
    if ((hasMoveInput || jumpPressed) && this.simulatorFocusedDeviceId) {
      this.exitSimulatorFocus({ restoreCamera: false });
      this.syncAvatarCameraFromAngles();
    }

    // Do not hijack camera when port inspector zoom is open
    if (this.simulatorFocusedDeviceId) {
      animateRobloxAvatarRig(this.avatarGroup, { ...this.avatarState, isMoving: false }, dt);
      return;
    }

    const prevX = this.avatarState.x;
    const prevY = this.avatarState.y;
    const prevZ = this.avatarState.z;
    const prevMoving = Boolean(this.avatarState.isMoving);
    const prevGrounded = this.avatarState.isGrounded !== false;

    let candX = prevX;
    let candY = prevY;
    let candZ = prevZ;
    let candVy = Number(this.avatarState.vy) || 0;
    let candGrounded = Boolean(this.avatarState.isGrounded);

    if (jumpPressed && candGrounded) {
      candVy = 7.6;
      candGrounded = false;
    }

    if (!candGrounded || prevY > 0) {
      candVy -= 21.0 * dt;
      candY += candVy * dt;
      if (candY <= 0) {
        candY = 0;
        candVy = 0;
        candGrounded = true;
      }
    }

    if (hasMoveInput) {
      this.cameraAnim = null;

      // Camera-relative horizontal forward vector from controls target minus camera position
      const viewDir = new THREE.Vector3(0, 0, -1);
      if (this.camera && this.controls) {
        viewDir.copy(this.controls.target).sub(this.camera.position);
        viewDir.y = 0;
      }
      if (viewDir.lengthSq() < 0.0001) {
        viewDir.set(Math.sin(this.avatarState.camYaw || 0), 0, Math.cos(this.avatarState.camYaw || 0));
      } else {
        viewDir.normalize();
      }
      const rightDir = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize();

      const moveDir = new THREE.Vector3()
        .addScaledVector(viewDir, forward)
        .addScaledVector(rightDir, right);
      if (moveDir.lengthSq() > 0.0001) {
        moveDir.normalize();
        const speed = isRunning ? 11.5 : 6.2;
        const { worldW, worldD } = this.getWorldDimensions();
        const maxX = worldW * 0.55;
        const maxZ = worldD * 0.55;
        candX = Math.max(-maxX, Math.min(maxX, prevX + moveDir.x * speed * dt));
        candZ = Math.max(-maxZ, Math.min(maxZ, prevZ + moveDir.z * speed * dt));

        // Smoothly turn character toward travel direction
        const targetYaw = Math.atan2(moveDir.x, moveDir.z);
        const angleDiff = Math.atan2(Math.sin(targetYaw - this.avatarState.yaw), Math.cos(targetYaw - this.avatarState.yaw));
        this.avatarState.yaw += angleDiff * Math.min(1, dt * 14);
        this.avatarState.walkPhase += dt * (isRunning ? 14.5 : 9.5);
      }
      this.avatarState.isMoving = true;
      this.avatarState.isRunning = isRunning;
    } else {
      this.avatarState.isMoving = false;
      this.avatarState.isRunning = false;
    }

    const resolved = this.resolveAvatarCollisionStep
      ? this.resolveAvatarCollisionStep(candX, candY, candZ, { prevX, prevY, prevZ, vy: candVy })
      : { x: candX, y: candY, z: candZ, vy: candVy, isGrounded: candGrounded, collided: false };

    this.avatarState.x = resolved.x;
    this.avatarState.y = resolved.y;
    this.avatarState.z = resolved.z;
    this.avatarState.vy = resolved.vy;
    this.avatarState.isGrounded = resolved.isGrounded;

    const dx = this.avatarState.x - prevX;
    const dy = this.avatarState.y - prevY;
    const dz = this.avatarState.z - prevZ;
    const safeDt = Math.max(0.001, Number(dt) || 0.016);
    this.avatarState.vx = dx / safeDt;
    this.avatarState.vz = dz / safeDt;

    if (this.avatarGroup) {
      this.avatarGroup.position.set(this.avatarState.x, this.avatarState.y, this.avatarState.z);
      if (this.avatarPerspective === 'fpp') {
        this.avatarState.yaw = Number(this.avatarState.camYaw) || 0;
      }
      this.avatarGroup.rotation.y = this.avatarState.yaw;
      this.avatarState.isCarrying = Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0;
      animateRobloxAvatarRig(this.avatarGroup, this.avatarState, dt);
    }

    if (this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }

    if (this.camera && this.controls && !this.cameraAnim && (dx !== 0 || dy !== 0 || dz !== 0 || (this.avatarPerspective === 'fpp' && hasMoveInput))) {
      this.syncAvatarCameraFromAngles();
    }

    this.findNearestDeviceToAvatar();
    this.updateAvatarProximityHud();
    const stateTransition = (prevMoving !== Boolean(this.avatarState.isMoving))
      || (prevGrounded !== (this.avatarState.isGrounded !== false));
    this.publishLocalPresence?.(stateTransition);
  }

  _isCircleOverRotatedBoxXZ(cx, cz, radius, bx, bz, halfW, halfD, rotY = 0) {
    const hw = Math.max(0.05, Number(halfW) || 0.05);
    const hd = Math.max(0.05, Number(halfD) || 0.05);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const dx = cx - bx;
    const dz = cz - bz;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const clampedX = Math.max(-hw, Math.min(hw, lx));
    const clampedZ = Math.max(-hd, Math.min(hd, lz));
    const diffX = lx - clampedX;
    const diffZ = lz - clampedZ;
    return diffX * diffX + diffZ * diffZ <= radius * radius;
  }

  _resolveCircleVsRotatedBoxXZ(cx, cz, radius, bx, bz, halfW, halfD, rotY = 0) {
    const hw = Math.max(0.05, Number(halfW) || 0.05);
    const hd = Math.max(0.05, Number(halfD) || 0.05);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const dx = cx - bx;
    const dz = cz - bz;

    // Transform world delta into box-local XZ space (-rotY)
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;

    if (Math.abs(lx) >= hw + radius - 1e-6 || Math.abs(lz) >= hd + radius - 1e-6) {
      return null;
    }

    const clampedX = Math.max(-hw, Math.min(hw, lx));
    const clampedZ = Math.max(-hd, Math.min(hd, lz));
    const diffX = lx - clampedX;
    const diffZ = lz - clampedZ;
    const distSq = diffX * diffX + diffZ * diffZ;

    let plx = 0;
    let plz = 0;

    if (distSq > 1e-8) {
      if (distSq >= radius * radius) return null;
      const dist = Math.sqrt(distSq);
      const pen = radius - dist;
      plx = (diffX / dist) * pen;
      plz = (diffZ / dist) * pen;
    } else {
      // Center is inside box; push out along the shallowest face
      const penX = hw - Math.abs(lx) + radius;
      const penZ = hd - Math.abs(lz) + radius;
      if (penX < penZ) {
        plx = (lx >= 0 ? 1 : -1) * penX;
      } else {
        plz = (lz >= 0 ? 1 : -1) * penZ;
      }
    }

    // Transform local pushout vector back into world XZ (+rotY)
    const wx = plx * cos + plz * sin;
    const wz = -plx * sin + plz * cos;
    return { nx: cx + wx, nz: cz + wz, collided: true };
  }

  _resolveCircleVsCircleXZ(cx, cz, radiusA, tx, tz, radiusB, seedKey = '') {
    const minDist = radiusA + radiusB;
    const dx = cx - tx;
    const dz = cz - tz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist - 1e-6) return null;

    if (distSq < 1e-8) {
      let h = 0;
      const s = String(seedKey || 'avatar');
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      const ang = (Math.abs(h) % 360) * (Math.PI / 180);
      return {
        nx: tx + Math.cos(ang) * minDist,
        nz: tz + Math.sin(ang) * minDist,
        collided: true
      };
    }

    const dist = Math.sqrt(distSq);
    const scale = minDist / dist;
    return {
      nx: tx + dx * scale,
      nz: tz + dz * scale,
      collided: true
    };
  }

  collectAvatarColliders() {
    const colliders = [];
    const carriedObjIds = new Set();
    const carriedDevIds = new Set();
    if (Array.isArray(this.carriedObjects)) {
      for (const c of this.carriedObjects) {
        if (c.kind === 'device' || c.devId) {
          carriedDevIds.add(c.devId || c.objId);
        } else if (c.objId) {
          carriedObjIds.add(c.objId);
        }
        c.mountedPeers?.forEach((p) => { if (p?.id) carriedDevIds.add(p.id); });
      }
    }

    // 1. Custom 3D objects (walls, poles, racks, cylinders, tables, cabinets, boxes)
    const objects = typeof stateManager?.getObjects3d === 'function' ? stateManager.getObjects3d() : [];
    for (const obj of objects) {
      if (!obj || obj.visible === false || carriedObjIds.has(obj.id)) continue;
      const pos = this.normToWorld ? this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5) : { x: 0, z: 0 };
      const elev = Math.max(0, Number(obj.elevationMeters) || 0);
      const w = Math.max(0.15, Number(obj.widthMeters) || 1);
      const d = Math.max(0.15, Number(obj.depthMeters) || 1);
      const h = Math.max(0.15, Number(obj.heightMeters) || 2);
      const rotY = ((Number(obj.rotationY ?? obj.rotationDeg) || 0) * Math.PI) / 180;
      const shape = String(obj.shape || 'box').toLowerCase();

      if (shape === 'pole' || shape === 'cylinder') {
        const rad = shape === 'pole'
          ? Math.max(0.28, w * 0.45)
          : Math.max(0.15, Math.max(w, d) * 0.5);
        colliders.push({
          id: obj.id,
          kind: 'circle',
          category: 'object3d',
          supportable: shape === 'cylinder',
          x: pos.x,
          z: pos.z,
          baseY: elev,
          topY: elev + h,
          radius: rad
        });
      } else {
        colliders.push({
          id: obj.id,
          kind: 'box',
          category: 'object3d',
          supportable: true,
          x: pos.x,
          z: pos.z,
          baseY: elev,
          topY: elev + h,
          halfW: w * 0.5,
          halfD: d * 0.5,
          rotY
        });
      }
    }

    // 2. Visible network devices (using synced bounds or live fallback)
    if (Array.isArray(this.deviceColliders) && this.deviceColliders.length > 0) {
      for (const dc of this.deviceColliders) {
        if (carriedDevIds.has(dc.id)) continue;
        colliders.push({ ...dc, supportable: true });
      }
    } else if (typeof this.deviceManager?.getAllDevices === 'function') {
      const devices = this.deviceManager.getAllDevices();
      for (const dev of devices) {
        if (!dev || dev.layerVisible === false || carriedDevIds.has(dev.id)) continue;
        const p = this.effectivePosMap?.get(dev.id)
          || (this.normToWorld && dev.position ? this.normToWorld(dev.position.x, dev.position.y) : null);
        if (!p) continue;
        const userModelScale = (dev.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 3.0);
        const fp = this.getDeviceCollisionFootprint
          ? this.getDeviceCollisionFootprint(dev, userModelScale)
          : { halfW: 0.9, halfD: 0.7, height: 0.8 };
        const elev = Math.max(0, Number(dev.spatial3d?.elevationMeters ?? 0) || 0);
        const rotY = this.getDeviceEuler ? (this.getDeviceEuler(dev)?.y || 0) : 0;
        colliders.push({
          id: dev.id,
          kind: 'box',
          category: 'device',
          supportable: true,
          x: p.x,
          z: p.z,
          baseY: elev,
          topY: elev + fp.height,
          halfW: fp.halfW,
          halfD: fp.halfD,
          rotY
        });
      }
    }

    // 3. Online remote technician characters (clamped per-peer scale prevents giant-collider griefing)
    const selfCid = String(authManager?.clientId || '');
    const basePeerCol = this._baseAvatarCollider || { radius: 0.48, height: 1.88 };
    if (this.remoteAvatarMap instanceof Map) {
      for (const [cid, entry] of this.remoteAvatarMap.entries()) {
        if (!entry || String(cid) === selfCid) continue;
        if (entry.group && entry.group.visible === false) continue;
        const pos = entry.group?.position || entry.targetPos;
        const px = Number(pos?.x ?? entry.currentX ?? entry.targetX);
        const py = Math.max(0, Number(pos?.y ?? entry.currentY ?? entry.targetY) || 0);
        const pz = Number(pos?.z ?? entry.currentZ ?? entry.targetZ);
        if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
        const peerScale = clampAvatarScale(entry.scale ?? entry.peer?.avatarScale);
        const peerRadius = Math.round(basePeerCol.radius * peerScale * 1000) / 1000;
        const peerHeight = Math.round(basePeerCol.height * peerScale * 1000) / 1000;
        colliders.push({
          id: `peer:${cid}`,
          kind: 'circle',
          category: 'peer',
          supportable: false,
          x: px,
          z: pz,
          baseY: py,
          topY: py + peerHeight,
          radius: peerRadius
        });
      }
    }

    return colliders;
  }

  _closestPointOnSegment2D(px, pz, x1, z1, x2, z2) {
    const vx = x2 - x1;
    const vz = z2 - z1;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 1e-10) return { qx: x1, qz: z1, dxSeg: 0, dzSeg: 0 };
    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / lenSq));
    return { qx: x1 + t * vx, qz: z1 + t * vz, dxSeg: vx, dzSeg: vz };
  }

  _isPointInTriangle2D(px, pz, ax, az, bx, bz, cx, cz) {
    const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
    const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
    const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
    const hasNeg = (d1 < -1e-7) || (d2 < -1e-7) || (d3 < -1e-7);
    const hasPos = (d1 > 1e-7) || (d2 > 1e-7) || (d3 > 1e-7);
    return !(hasNeg && hasPos);
  }

  _closestPointOnTriangleXZ(px, pz, ax, az, bx, bz, cx, cz) {
    const s1 = this._closestPointOnSegment2D(px, pz, ax, az, bx, bz);
    const s2 = this._closestPointOnSegment2D(px, pz, bx, bz, cx, cz);
    const s3 = this._closestPointOnSegment2D(px, pz, cx, cz, ax, az);
    const d1Sq = (px - s1.qx) ** 2 + (pz - s1.qz) ** 2;
    const d2Sq = (px - s2.qx) ** 2 + (pz - s2.qz) ** 2;
    const d3Sq = (px - s3.qx) ** 2 + (pz - s3.qz) ** 2;
    let best = s1;
    let bestSq = d1Sq;
    if (d2Sq < bestSq) { best = s2; bestSq = d2Sq; }
    if (d3Sq < bestSq) { best = s3; bestSq = d3Sq; }
    const area2 = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az));
    const inside = area2 > 1e-6 && this._isPointInTriangle2D(px, pz, ax, az, bx, bz, cx, cz);
    return { qx: best.qx, qz: best.qz, distSq: bestSq, inside, dxSeg: best.dxSeg, dzSeg: best.dzSeg };
  }

  _mapWorldToRoomFrame(room, colScale, wx, wz) {
    const wPos = this.normToWorld ? this.normToWorld(room.x ?? 0.5, room.y ?? 0.5) : { x: 0, z: 0 };
    const rotY = ((Number(room.rotationY ?? room.rotationDeg) || 0) * Math.PI) / 180;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const dx = wx - wPos.x;
    const dz = wz - wPos.z;
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    return {
      wPos,
      cos,
      sin,
      rx,
      rz,
      px: rx / Math.max(0.01, colScale.sx),
      pz: rz / Math.max(0.01, colScale.sz)
    };
  }

  _sampleRoomFloorHeightAtWorld(wx, wz, maxClimbY = 2.4) {
    const rooms = typeof stateManager?.getRooms3d === 'function' ? stateManager.getRooms3d() : [];
    let bestY = 0;
    for (const room of rooms) {
      if (!room) continue;
      const roomGroup = this.room3dMeshMap?.get(room.id);
      const profile = roomGroup?.userData?.roomCollisionProfile;
      const colScale = roomGroup?.userData?.roomCollisionScale;
      if (!profile || !colScale) {
        if (!room.customModelUrl) {
          const wPos = this.normToWorld ? this.normToWorld(room.x ?? 0.5, room.y ?? 0.5) : { x: 0, z: 0 };
          const rw = (Number(room.widthMeters) || 14) * 0.5;
          const rd = (Number(room.depthMeters) || 12) * 0.5;
          const rotY = ((Number(room.rotationY ?? room.rotationDeg) || 0) * Math.PI) / 180;
          if (0.08 <= maxClimbY && this._isCircleOverRotatedBoxXZ(wx, wz, 0.05, wPos.x, wPos.z, rw, rd, rotY)) {
            bestY = Math.max(bestY, 0.08);
          }
        }
        continue;
      }

      const f = this._mapWorldToRoomFrame(room, colScale, wx, wz);
      if (Math.abs(f.rx) > profile.halfW * colScale.sx + 0.35 || Math.abs(f.rz) > profile.halfD * colScale.sz + 0.35) {
        continue;
      }

      const gx = Math.floor(f.px / profile.cellSize);
      const gz = Math.floor(f.pz / profile.cellSize);
      for (let ix = gx - 1; ix <= gx + 1; ix++) {
        for (let iz = gz - 1; iz <= gz + 1; iz++) {
          const tris = profile.floorCells.get(`${ix},${iz}`);
          if (!tris) continue;
          for (const tri of tris) {
            if (f.px < tri.minX - 0.15 || f.px > tri.maxX + 0.15 || f.pz < tri.minZ - 0.15 || f.pz > tri.maxZ + 0.15) continue;
            const worldTriMaxY = tri.maxY * colScale.sy + 0.025;
            if (worldTriMaxY > maxClimbY + 0.12) continue;

            const v0x = tri.cx - tri.ax;
            const v0z = tri.cz - tri.az;
            const v1x = tri.bx - tri.ax;
            const v1z = tri.bz - tri.az;
            const v2x = f.px - tri.ax;
            const v2z = f.pz - tri.az;
            const denom = v0x * v1z - v1x * v0z;
            if (Math.abs(denom) < 1e-6) continue;
            const u = (v2x * v1z - v1x * v2z) / denom;
            const v = (v0x * v2z - v2x * v0z) / denom;
            const w = 1 - u - v;
            if (u < -0.15 || v < -0.15 || w < -0.15) continue;

            const uc = Math.max(0, Math.min(1, u));
            const vc = Math.max(0, Math.min(1, v));
            const wc = Math.max(0, 1 - uc - vc);
            const sum = uc + vc + wc || 1;
            const localY = (wc * tri.ay + vc * tri.by + uc * tri.cy) / sum;
            const worldSurfY = localY * colScale.sy + 0.025;
            if (worldSurfY <= maxClimbY && worldSurfY > bestY) {
              bestY = worldSurfY;
            }
          }
        }
      }
    }
    return bestY;
  }

  _intersectSegments2D(p0x, p0z, p1x, p1z, e0x, e0z, e1x, e1z) {
    const dx1 = p1x - p0x;
    const dz1 = p1z - p0z;
    const dx2 = e1x - e0x;
    const dz2 = e1z - e0z;
    const denom = dx1 * dz2 - dz1 * dx2;
    if (Math.abs(denom) < 1e-8) return null;
    const rx = e0x - p0x;
    const rz = e0z - p0z;
    const t = (rx * dz2 - rz * dx2) / denom;
    const u = (rx * dz1 - rz * dx1) / denom;
    if (t >= 0 && t <= 1 && u >= -1e-4 && u <= 1 + 1e-4) {
      return {
        t,
        hx: p0x + t * dx1,
        hz: p0z + t * dz1,
        ex: dx2,
        ez: dz2
      };
    }
    return null;
  }

  _resolveAvatarAgainstRoomBuildings(x, y, z, { prevX, prevZ, radius, height, stepHeight, isTeleport }) {
    const rooms = typeof stateManager?.getRooms3d === 'function' ? stateManager.getRooms3d() : [];
    if (rooms.length === 0) return { x, z, collided: false };

    let curX = x;
    let curZ = z;
    let collided = false;
    const minWallClearY = isTeleport ? y + 0.06 : y + stepHeight;
    // Allow walking smoothly underneath 2.1m GLB doorway headers while standing on 0.30m interior floors
    const doorClearHeight = Math.min(height, 1.65);

    for (const room of rooms) {
      if (!room) continue;
      const roomGroup = this.room3dMeshMap?.get(room.id);
      const profile = roomGroup?.userData?.roomCollisionProfile;
      const colScale = roomGroup?.userData?.roomCollisionScale;
      if (!profile || !colScale) continue;

      const f = this._mapWorldToRoomFrame(room, colScale, curX, curZ);
      const prevFrame = this._mapWorldToRoomFrame(room, colScale, prevX ?? curX, prevZ ?? curZ);
      const sx = colScale.sx;
      const sy = colScale.sy;
      const sz = colScale.sz;
      const margin = radius + 0.6;
      const minRx = Math.min(f.rx, prevFrame.rx);
      const maxRx = Math.max(f.rx, prevFrame.rx);
      const minRz = Math.min(f.rz, prevFrame.rz);
      const maxRz = Math.max(f.rz, prevFrame.rz);
      if (maxRx < -profile.halfW * sx - margin || minRx > profile.halfW * sx + margin ||
          maxRz < -profile.halfD * sz - margin || minRz > profile.halfD * sz + margin) {
        continue;
      }

      let rx = f.rx;
      let rz = f.rz;
      let roomMoved = false;
      const invSx = 1 / Math.max(0.01, sx);
      const invSz = 1 / Math.max(0.01, sz);

      // 1. Continuous swept segment clamp: prevents tunneling across thin GLB walls on fast steps
      const stepDistSq = (rx - prevFrame.rx) ** 2 + (rz - prevFrame.rz) ** 2;
      if (!isTeleport && stepDistSq > 1e-6) {
        const sgx0 = Math.floor((minRx * invSx - radius * invSx) / profile.cellSize);
        const sgx1 = Math.floor((maxRx * invSx + radius * invSx) / profile.cellSize);
        const sgz0 = Math.floor((minRz * invSz - radius * invSz) / profile.cellSize);
        const sgz1 = Math.floor((maxRz * invSz + radius * invSz) / profile.cellSize);
        const sweptSeen = new Set();
        let earliest = null;

        for (let gx = sgx0; gx <= sgx1; gx++) {
          for (let gz = sgz0; gz <= sgz1; gz++) {
            const tris = profile.wallCells.get(`${gx},${gz}`);
            if (!tris) continue;
            for (const tri of tris) {
              if (sweptSeen.has(tri)) continue;
              sweptSeen.add(tri);
              const triMinY = tri.minY * sy + 0.025;
              const triMaxY = tri.maxY * sy + 0.025;
              if (minWallClearY >= triMaxY - 1e-4 || y + doorClearHeight <= triMinY + 1e-4) continue;
              if (maxRx < tri.minX * sx - 0.05 || minRx > tri.maxX * sx + 0.05 ||
                  maxRz < tri.minZ * sz - 0.05 || minRz > tri.maxZ * sz + 0.05) continue;

              const ax = tri.ax * sx; const az = tri.az * sz;
              const bx = tri.bx * sx; const bz = tri.bz * sz;
              const cx = tri.cx * sx; const cz = tri.cz * sz;
              for (const edgeHit of [
                this._intersectSegments2D(prevFrame.rx, prevFrame.rz, rx, rz, ax, az, bx, bz),
                this._intersectSegments2D(prevFrame.rx, prevFrame.rz, rx, rz, bx, bz, cx, cz),
                this._intersectSegments2D(prevFrame.rx, prevFrame.rz, rx, rz, cx, cz, ax, az)
              ]) {
                if (edgeHit && (!earliest || edgeHit.t < earliest.t)) {
                  earliest = edgeHit;
                }
              }
            }
          }
        }

        if (earliest) {
          const segLen = Math.hypot(earliest.ex, earliest.ez) || 1;
          let nx = -earliest.ez / segLen;
          let nz = earliest.ex / segLen;
          const toPrevX = prevFrame.rx - earliest.hx;
          const toPrevZ = prevFrame.rz - earliest.hz;
          if (nx * toPrevX + nz * toPrevZ < 0) {
            nx = -nx;
            nz = -nz;
          }
          const signedDist = (rx - earliest.hx) * nx + (rz - earliest.hz) * nz;
          if (signedDist < radius) {
            const push = radius - signedDist + 0.01;
            rx += nx * push;
            rz += nz * push;
            roomMoved = true;
            collided = true;
          }
        }
      }

      // 2. Circle-vs-Triangle pushout around current position (slides cleanly along walls & corners)
      const radLocalX = radius * invSx;
      const radLocalZ = radius * invSz;
      const gx0 = Math.floor((rx * invSx - radLocalX) / profile.cellSize);
      const gx1 = Math.floor((rx * invSx + radLocalX) / profile.cellSize);
      const gz0 = Math.floor((rz * invSz - radLocalZ) / profile.cellSize);
      const gz1 = Math.floor((rz * invSz + radLocalZ) / profile.cellSize);
      const seenTris = new Set();

      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const tris = profile.wallCells.get(`${gx},${gz}`);
          if (!tris) continue;
          for (const tri of tris) {
            if (seenTris.has(tri)) continue;
            seenTris.add(tri);

            const triMinY = tri.minY * sy + 0.025;
            const triMaxY = tri.maxY * sy + 0.025;
            if (minWallClearY >= triMaxY - 1e-4 || y + doorClearHeight <= triMinY + 1e-4) {
              continue;
            }

            if (
              rx + radius < tri.minX * sx || rx - radius > tri.maxX * sx ||
              rz + radius < tri.minZ * sz || rz - radius > tri.maxZ * sz
            ) {
              continue;
            }

            const hit = this._closestPointOnTriangleXZ(
              rx, rz,
              tri.ax * sx, tri.az * sz,
              tri.bx * sx, tri.bz * sz,
              tri.cx * sx, tri.cz * sz
            );

            if (hit.inside || hit.distSq < radius * radius - 1e-7) {
              const dist = Math.sqrt(hit.distSq);
              let pushDirX;
              let pushDirZ;
              let pen;

              if (hit.inside) {
                pushDirX = dist > 1e-6 ? (hit.qx - rx) / dist : 0;
                pushDirZ = dist > 1e-6 ? (hit.qz - rz) / dist : 1;
                pen = dist + radius;
              } else if (dist > 1e-6) {
                pushDirX = (rx - hit.qx) / dist;
                pushDirZ = (rz - hit.qz) / dist;
                pen = radius - dist;
              } else {
                const backX = prevFrame.rx - rx;
                const backZ = prevFrame.rz - rz;
                const backLen = Math.hypot(backX, backZ);
                if (backLen > 1e-6) {
                  pushDirX = backX / backLen;
                  pushDirZ = backZ / backLen;
                } else {
                  const segLen = Math.hypot(hit.dxSeg, hit.dzSeg) || 1;
                  pushDirX = -hit.dzSeg / segLen;
                  pushDirZ = hit.dxSeg / segLen;
                }
                pen = radius;
              }

              rx += pushDirX * pen;
              rz += pushDirZ * pen;
              roomMoved = true;
              collided = true;
            }
          }
        }
      }

      if (roomMoved) {
        curX = f.wPos.x + rx * f.cos + rz * f.sin;
        curZ = f.wPos.z - rx * f.sin + rz * f.cos;
      }
    }

    return { x: curX, z: curZ, collided };
  }

  resolveAvatarCollisionStep(candX, candY, candZ, { prevX = candX, prevY = candY, prevZ = candZ, vy = 0, isTeleport = false } = {}) {
    const colCfg = this.avatarCollider || { radius: 0.48, height: 1.88, stepHeight: 0.38 };
    const radius = Number(colCfg.radius) || 0.48;
    const height = Number(colCfg.height) || 1.88;
    const stepHeight = Number(colCfg.stepHeight) || 0.38;
    const footRadius = radius * 0.65;

    const { worldW, worldD } = this.getWorldDimensions ? this.getWorldDimensions() : { worldW: 48, worldD: 32 };
    const maxX = worldW * 0.55;
    const maxZ = worldD * 0.55;

    let x = Math.max(-maxX, Math.min(maxX, Number(candX) || 0));
    let y = Math.max(0, Number(candY) || 0);
    let z = Math.max(-maxZ, Math.min(maxZ, Number(candZ) || 0));
    let nextVy = Number(vy) || 0;
    let isGrounded = y <= 0;
    let collided = false;

    const colliders = this.collectAvatarColliders();
    const seedKey = String(authManager?.clientId || 'local');

    // Vertical head-bonk against overhead undersides when jumping up
    if (!isTeleport && nextVy > 0) {
      for (const c of colliders) {
        if (c.category === 'peer') continue;
        if (prevY + height <= c.baseY + 0.15 && y + height > c.baseY) {
          const overlapsXZ = c.kind === 'circle'
            ? Math.hypot(x - c.x, z - c.z) < (radius * 0.85 + c.radius)
            : this._isCircleOverRotatedBoxXZ(x, z, radius * 0.85, c.x, c.z, c.halfW, c.halfD, c.rotY);
          if (overlapsXZ) {
            y = Math.max(0, c.baseY - height);
            nextVy = 0;
            collided = true;
          }
        }
      }
    }

    // Vertical platform landing / standing check (tables, low boxes, cabinets, plus 3D building interior floors)
    let supportY = this._sampleRoomFloorHeightAtWorld(x, z, (isTeleport ? y : prevY) + stepHeight);
    if (isTeleport && supportY > y) {
      y = supportY;
      isGrounded = true;
    }
    if (!isTeleport) {
      for (const c of colliders) {
        if (!c.supportable) continue;
        if (prevY >= c.topY - stepHeight && y <= c.topY + 0.04) {
          const onFootprint = c.kind === 'circle'
            ? Math.hypot(x - c.x, z - c.z) <= (c.radius + footRadius)
            : this._isCircleOverRotatedBoxXZ(x, z, footRadius, c.x, c.z, c.halfW, c.halfD, c.rotY);
          if (onFootprint && c.topY > supportY) {
            supportY = c.topY;
          }
        }
      }
      if (y <= supportY + 0.001 && nextVy <= 0) {
        y = supportY;
        nextVy = 0;
        isGrounded = true;
      } else {
        isGrounded = y <= 0;
      }
    }

    // Iterative XZ pushout & wall sliding (2 passes handle wall corners, building walls & nearby peers)
    const verticalFloorCheck = isTeleport ? y + 0.05 : y + stepHeight;
    const buildingRadius = Math.min(radius, 0.42);
    for (let pass = 0; pass < 2; pass++) {
      let movedInPass = false;
      const roomRes = this._resolveAvatarAgainstRoomBuildings(x, y, z, {
        prevX,
        prevZ,
        radius: buildingRadius,
        height,
        stepHeight,
        isTeleport
      });
      if (roomRes.collided) {
        x = Math.max(-maxX, Math.min(maxX, roomRes.x));
        z = Math.max(-maxZ, Math.min(maxZ, roomRes.z));
        collided = true;
        movedInPass = true;
      }

      for (const c of colliders) {
        const minClearY = c.category === 'peer' ? y + 0.05 : verticalFloorCheck;
        if (minClearY >= c.topY - 1e-4 || y + height <= c.baseY + 1e-4) {
          continue;
        }
        const res = c.kind === 'circle'
          ? this._resolveCircleVsCircleXZ(x, z, radius, c.x, c.z, c.radius, `${seedKey}:${c.id}`)
          : this._resolveCircleVsRotatedBoxXZ(x, z, radius, c.x, c.z, c.halfW, c.halfD, c.rotY);
        if (res && res.collided) {
          x = Math.max(-maxX, Math.min(maxX, res.nx));
          z = Math.max(-maxZ, Math.min(maxZ, res.nz));
          collided = true;
          movedInPass = true;
        }
      }
      if (!movedInPass) break;
    }

    // Re-sample floor height cleanly after sliding along a wall step
    if (!isTeleport && collided) {
      const postSupportY = this._sampleRoomFloorHeightAtWorld(x, z, prevY + stepHeight);
      if (y <= postSupportY + 0.001 && nextVy <= 0) {
        y = postSupportY;
        isGrounded = true;
      }
    }

    return {
      x,
      y,
      z,
      vy: nextVy,
      isGrounded,
      collided
    };
  }

  publishLocalPresence(force = false) {
    if (!authManager?.isAuthenticated?.()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isActivelyMoving = this.avatarMode && Boolean(this.avatarState.isMoving);
    const minIntervalMs = this.avatarMode ? (isActivelyMoving ? 28 : 90) : 220;
    if (!force && (now - this._lastPresenceEmitAt < minIntervalMs)) return;

    let wx = 0;
    let wy = 0;
    let wz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let yaw = 0;
    let moving = false;
    let running = false;
    let grounded = true;
    let carrying = false;
    let walkPhase = 0;

    if (this.avatarMode) {
      wx = Number(this.avatarState.x) || 0;
      wy = Number(this.avatarState.y) || 0;
      wz = Number(this.avatarState.z) || 0;
      vx = Number(this.avatarState.vx) || 0;
      vy = Number(this.avatarState.vy) || 0;
      vz = Number(this.avatarState.vz) || 0;
      yaw = Number(this.avatarState.yaw) || 0;
      moving = Boolean(this.avatarState.isMoving);
      running = Boolean(this.avatarState.isRunning);
      grounded = this.avatarState.isGrounded !== false;
      carrying = Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0;
      walkPhase = Number(this.avatarState.walkPhase) || 0;
    } else if (this.controls?.target) {
      const { worldW, worldD } = this.getWorldDimensions();
      wx = Math.max(-worldW * 0.55, Math.min(worldW * 0.55, Number(this.controls.target.x) || 0));
      wz = Math.max(-worldD * 0.55, Math.min(worldD * 0.55, Number(this.controls.target.z) || 0));
      wy = 0;
      if (this.camera) {
        yaw = Math.atan2(wx - this.camera.position.x, wz - this.camera.position.z);
      }
    }

    const avatarScale = resolveEngineAvatarScale(this);
    const snapKey = `${this.avatarMode ? 1 : 0}:${this.avatarPerspective}:${avatarScale.toFixed(2)}:${wx.toFixed(2)}:${wy.toFixed(2)}:${wz.toFixed(2)}:${vx.toFixed(1)}:${vz.toFixed(1)}:${yaw.toFixed(2)}:${moving ? 1 : 0}:${grounded ? 1 : 0}:${carrying ? 1 : 0}`;
    if (!force && snapKey === this._lastPresenceSnapshotKey) return;

    this._lastPresenceEmitAt = now;
    this._lastPresenceSnapshotKey = snapKey;
    const { normX, normY } = this.worldToNorm(wx, wz);
    authManager.updateLocalPresence({
      viewMode: '3d',
      avatarMode: Boolean(this.avatarMode),
      perspective: this.avatarPerspective,
      avatarScale,
      x: Number(wx.toFixed(3)),
      y: Number(wy.toFixed(3)),
      z: Number(wz.toFixed(3)),
      vx: Number(vx.toFixed(3)),
      vy: Number(vy.toFixed(3)),
      vz: Number(vz.toFixed(3)),
      normX: Number(normX.toFixed(4)),
      normY: Number(normY.toFixed(4)),
      yaw: Number(yaw.toFixed(3)),
      isMoving: moving,
      isRunning: running,
      isGrounded: grounded,
      isCarrying: carrying,
      walkPhase: Number(walkPhase.toFixed(3)),
      nearestDeviceId: this.avatarState.nearestDeviceId || null,
      clientTs: Date.now()
    }, { immediate: Boolean(force) });
  }

  _disposeAvatarMeshGroup(group) {
    if (!group) return;
    this._disposeObject3DResources(group);
    if (this.avatarMode && this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }
  }

  _resolveRemotePeerPose(peer) {
    let tx = Number(peer.x);
    let ty = Number(peer.y) || 0;
    let tz = Number(peer.z);
    if (peer.viewMode === '2d' || !Number.isFinite(tx) || !Number.isFinite(tz)) {
      const wpos = this.normToWorld(
        Number.isFinite(Number(peer.normX)) ? Number(peer.normX) : 0.5,
        Number.isFinite(Number(peer.normY)) ? Number(peer.normY) : 0.5
      );
      tx = wpos.x;
      tz = wpos.z;
      ty = 0;
    }
    const tyaw = Number.isFinite(Number(peer.yaw)) ? Number(peer.yaw) : 0;
    const colorHex = peer.colorHex || getPeerColorHex(peer.username || peer.clientId);
    const labelText = peer.viewMode === '2d'
      ? `@${peer.username} (2D)`
      : `@${peer.username}`;
    return { tx, ty, tz, tyaw, colorHex, labelText };
  }

  syncSingleRemoteAvatar(peer, { updateHud = true } = {}) {
    if (!peer || !peer.clientId) return false;
    if (authManager?.clientId && peer.clientId === authManager.clientId) return false;

    const { tx, ty, tz, tyaw, colorHex, labelText } = this._resolveRemotePeerPose(peer);
    const peerScale = clampAvatarScale(peer.avatarScale);
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const hasExplicitVel = Number.isFinite(Number(peer.vx)) && Number.isFinite(Number(peer.vz));
    const maxSpeed = peer.isRunning ? 12.5 : 8.0;

    let entry = this.remoteAvatarMap.get(peer.clientId);
    if (!entry) {
      const group = createRobloxAvatar3DGroup(labelText, {
        isRemote: true,
        vestColor: colorHex,
        helmetColor: colorHex,
        ringColor: colorHex,
        accentHex: colorHex
      });
      group.visible = true;
      group.position.set(tx, ty, tz);
      group.rotation.y = tyaw;
      group.scale.setScalar(peerScale);
      this.remoteAvatarsGroup.add(group);
      entry = {
        clientId: peer.clientId,
        group,
        scale: peerScale,
        currentX: tx,
        currentY: ty,
        currentZ: tz,
        currentYaw: tyaw,
        targetX: tx,
        targetY: ty,
        targetZ: tz,
        targetYaw: tyaw,
        vx: hasExplicitVel ? Math.max(-maxSpeed, Math.min(maxSpeed, Number(peer.vx))) : 0,
        vy: Number.isFinite(Number(peer.vy)) ? Number(peer.vy) : 0,
        vz: hasExplicitVel ? Math.max(-maxSpeed, Math.min(maxSpeed, Number(peer.vz))) : 0,
        lastPacketAt: nowPerf,
        state: {
          isMoving: Boolean(peer.isMoving),
          isRunning: Boolean(peer.isRunning),
          isGrounded: peer.isGrounded !== false,
          isCarrying: Boolean(peer.isCarrying),
          walkPhase: Number(peer.walkPhase) || 0
        },
        peer
      };
      animateRobloxAvatarRig(group, entry.state, 0.016);
      this.remoteAvatarMap.set(peer.clientId, entry);
      if (updateHud) this.updateRemotePeersHud();
      return true;
    }

    updateRobloxAvatarLabel(entry.group, labelText, colorHex);
    const dtPacket = Math.max(0.025, (nowPerf - (entry.lastPacketAt || nowPerf)) / 1000);
    if (hasExplicitVel) {
      entry.vx = Math.max(-maxSpeed, Math.min(maxSpeed, Number(peer.vx)));
      entry.vy = Number.isFinite(Number(peer.vy)) ? Number(peer.vy) : 0;
      entry.vz = Math.max(-maxSpeed, Math.min(maxSpeed, Number(peer.vz)));
    } else if (peer.isMoving) {
      const ivx = (tx - entry.targetX) / dtPacket;
      const ivz = (tz - entry.targetZ) / dtPacket;
      entry.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ivx));
      entry.vz = Math.max(-maxSpeed, Math.min(maxSpeed, ivz));
      entry.vy = 0;
    } else {
      entry.vx = 0;
      entry.vy = 0;
      entry.vz = 0;
    }

    entry.targetX = tx;
    entry.targetY = ty;
    entry.targetZ = tz;
    entry.targetYaw = tyaw;
    entry.scale = peerScale;
    entry.group?.scale?.setScalar?.(peerScale);
    entry.lastPacketAt = nowPerf;
    entry.state.isMoving = Boolean(peer.isMoving);
    entry.state.isRunning = Boolean(peer.isRunning);
    entry.state.isGrounded = peer.isGrounded !== false;
    entry.state.isCarrying = Boolean(peer.isCarrying);
    if (!entry.state.isMoving && Number.isFinite(Number(peer.walkPhase))) {
      entry.state.walkPhase = Number(peer.walkPhase);
    }
    entry.peer = peer;
    if (updateHud) this.updateRemotePeersHud();
    return false;
  }

  removeSingleRemoteAvatar(clientId, { updateHud = true } = {}) {
    if (!clientId) return false;
    const entry = this.remoteAvatarMap.get(clientId);
    if (!entry) return false;
    this.remoteAvatarsGroup.remove(entry.group);
    this._disposeAvatarMeshGroup(entry.group);
    this.remoteAvatarMap.delete(clientId);
    if (updateHud) this.updateRemotePeersHud();
    return true;
  }

  syncRemoteAvatars(peers = []) {
    const activeIds = new Set();
    const list = Array.isArray(peers) ? peers : [];

    for (const peer of list) {
      if (!peer || !peer.clientId) continue;
      if (authManager?.clientId && peer.clientId === authManager.clientId) continue;
      activeIds.add(peer.clientId);
      this.syncSingleRemoteAvatar(peer, { updateHud: false });
    }

    for (const cid of Array.from(this.remoteAvatarMap.keys())) {
      if (!activeIds.has(cid)) {
        this.removeSingleRemoteAvatar(cid, { updateHud: false });
      }
    }

    this.updateRemotePeersHud(list);
  }

  updateRemoteAvatars(dt = 0.016) {
    if (this.remoteAvatarMap.size === 0) return;
    const safeDt = Math.max(0.001, Math.min(0.1, Number(dt) || 0.016));
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const posAlpha = 1 - Math.exp(-22 * safeDt);
    const yAlpha = 1 - Math.exp(-26 * safeDt);
    const yawAlpha = 1 - Math.exp(-24 * safeDt);

    for (const entry of this.remoteAvatarMap.values()) {
      const packetAge = Math.min(0.14, Math.max(0, (nowPerf - (entry.lastPacketAt || nowPerf)) / 1000));
      const extrapTime = entry.state.isMoving
        ? (packetAge <= 0.06 ? packetAge : 0.06 + (packetAge - 0.06) * 0.45)
        : 0;
      const predX = entry.targetX + (entry.vx || 0) * extrapTime;
      const predZ = entry.targetZ + (entry.vz || 0) * extrapTime;
      let predY = entry.targetY;
      if ((!entry.state.isGrounded || entry.targetY > 0.01) && extrapTime > 0) {
        predY = Math.max(0, entry.targetY + (entry.vy || 0) * extrapTime - 0.5 * 21.0 * extrapTime * extrapTime);
      }

      const dist = Math.hypot(predX - entry.currentX, predZ - entry.currentZ);
      if (dist > 18) {
        entry.currentX = predX;
        entry.currentY = predY;
        entry.currentZ = predZ;
        entry.currentYaw = entry.targetYaw;
      } else if (dist > 0.001 || Math.abs(predY - entry.currentY) > 0.001) {
        entry.currentX += (predX - entry.currentX) * posAlpha;
        entry.currentY += (predY - entry.currentY) * yAlpha;
        entry.currentZ += (predZ - entry.currentZ) * posAlpha;
        const yawDiff = Math.atan2(
          Math.sin(entry.targetYaw - entry.currentYaw),
          Math.cos(entry.targetYaw - entry.currentYaw)
        );
        entry.currentYaw += yawDiff * yawAlpha;
      } else {
        entry.currentX = predX;
        entry.currentY = predY;
        entry.currentZ = predZ;
        const yawDiff = Math.atan2(
          Math.sin(entry.targetYaw - entry.currentYaw),
          Math.cos(entry.targetYaw - entry.currentYaw)
        );
        entry.currentYaw += yawDiff * yawAlpha;
      }

      const animMoving = entry.state.isMoving || dist > 0.04;
      if (animMoving) {
        entry.state.walkPhase += safeDt * (entry.state.isRunning ? 14.5 : 9.5);
      }

      entry.group.position.set(entry.currentX, entry.currentY, entry.currentZ);
      entry.group.rotation.y = entry.currentYaw;
      animateRobloxAvatarRig(entry.group, {
        ...entry.state,
        isMoving: animMoving
      }, safeDt);
    }
  }

  updateRemotePeersHud(peers = authManager?.getRemotePeers?.() || []) {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('avatar-online-peers-slot');
    if (!badge) return;
    const list = Array.isArray(peers) ? peers : [];
    const namesKey = list.map((p) => p?.username || p?.clientId || '').join('|');
    if (namesKey === this._lastPeersHudKey) return;
    this._lastPeersHudKey = namesKey;

    const count = list.length;
    if (count === 0) {
      badge.textContent = 'Rekan: 0 online';
    } else {
      const names = list.slice(0, 3).map((p) => `@${p.username}`).join(', ');
      badge.textContent = `Rekan (${count}): ${names}${count > 3 ? '…' : ''}`;
    }
  }

  renderAvatarHudBar() {
    if (typeof document === 'undefined') return;
    const hudEl = document.getElementById('hud-3d-avatar-bar');
    if (!hudEl) return;

    if (!this.isActive || !this.avatarMode || this.simulatorFocusedDeviceId) {
      hudEl.classList.add('hidden');
      hudEl.style.display = 'none';
      return;
    }

    const allDevs = (this.deviceManager?.getAllDevices?.() || []).filter((d) => d.layerVisible !== false);
    const optionsHtml = allDevs.map((d) => `<option value="${this.escapeHudHtml(d.id)}">${this.escapeHudHtml(d.name)}${d.network?.ip ? ` (${this.escapeHudHtml(d.network.ip)})` : ''}</option>`).join('');
    const isFpp = this.avatarPerspective === 'fpp';
    const curScale = resolveEngineAvatarScale(this);
    const curSens = resolveEngineMouseSensitivity(this);

    hudEl.innerHTML = `
      <div class="avatar-bar-status">
        <span class="avatar-bar-title">
          <span class="avatar-bar-dot"></span>
          <span>${isFpp ? 'Mode Teknisi (FPP)' : 'Mode Teknisi (TPP)'}</span>
          <span id="avatar-online-peers-slot" class="sim-inspector-badge">Rekan: 0 online</span>
        </span>
        <span class="avatar-bar-controls-hint"><strong>WASD</strong> Jalan • <strong>Spasi</strong> Lompat • <strong>E</strong> Angkat • <strong>Q</strong> Taruh / Tempel Dinding • <strong>[ / ]</strong> Putar • <strong>, / .</strong> Mouse • <strong>V</strong> View</span>
      </div>
      <div class="avatar-bar-nearest" id="avatar-nearest-slot">
        <span>Terdekat: --</span>
      </div>
      <div class="avatar-bar-actions">
        <div class="avatar-perspective-switch" title="Pilih perspektif kamera (Pintasan: V atau Scroll)">
          <button type="button" class="avatar-persp-btn ${!isFpp ? 'active' : ''}" data-avatar-persp="tpp">TPP</button>
          <button type="button" class="avatar-persp-btn ${isFpp ? 'active' : ''}" data-avatar-persp="fpp">FPP (V)</button>
        </div>
        <div class="avatar-scale-control" title="Ukuran karakter teknisi (dibatasi ${AVATAR_SCALE_MIN}x - ${AVATAR_SCALE_MAX}x agar multiplayer kondusif)">
          <span class="avatar-scale-label">Ukuran</span>
          <button type="button" id="btn-avatar-scale-down" class="avatar-scale-step-btn" title="Perkecil karakter (${AVATAR_SCALE_MIN}x min)" ${curScale <= AVATAR_SCALE_MIN + 1e-4 ? 'disabled' : ''}>-</button>
          <input type="range" id="range-avatar-scale" class="avatar-scale-range" min="${AVATAR_SCALE_MIN}" max="${AVATAR_SCALE_MAX}" step="${AVATAR_SCALE_STEP}" value="${curScale.toFixed(2)}" aria-label="Skala Karakter Teknisi">
          <button type="button" id="btn-avatar-scale-up" class="avatar-scale-step-btn" title="Perbesar karakter (${AVATAR_SCALE_MAX}x maks)" ${curScale >= AVATAR_SCALE_MAX - 1e-4 ? 'disabled' : ''}>+</button>
          <span id="avatar-scale-value" class="avatar-scale-value">${curScale.toFixed(2)}x</span>
        </div>
        <div class="avatar-scale-control avatar-sens-control" title="Sensitivitas mouse Mode Teknisi (${AVATAR_MOUSE_SENS_MIN}x - ${AVATAR_MOUSE_SENS_MAX}x • Pintasan: , / .)">
          <span class="avatar-scale-label">Mouse</span>
          <button type="button" id="btn-avatar-sens-down" class="avatar-scale-step-btn" title="Pelankan mouse (,)" ${curSens <= AVATAR_MOUSE_SENS_MIN + 1e-4 ? 'disabled' : ''}>-</button>
          <input type="range" id="range-avatar-sens" class="avatar-scale-range" min="${AVATAR_MOUSE_SENS_MIN}" max="${AVATAR_MOUSE_SENS_MAX}" step="${AVATAR_MOUSE_SENS_STEP}" value="${curSens.toFixed(2)}" aria-label="Sensitivitas Mouse Mode Teknisi">
          <button type="button" id="btn-avatar-sens-up" class="avatar-scale-step-btn" title="Cepatkan mouse (.)" ${curSens >= AVATAR_MOUSE_SENS_MAX - 1e-4 ? 'disabled' : ''}>+</button>
          <span id="avatar-sens-value" class="avatar-scale-value">${curSens.toFixed(2)}x</span>
        </div>
        <select id="select-avatar-teleport" class="avatar-teleport-select" title="Teleport karakter ke depan perangkat">
          <option value="">Teleport ke Perangkat...</option>
          ${optionsHtml}
        </select>
        <button type="button" id="btn-avatar-carry-pickup" class="sim-action-btn is-carry" title="Angkat / tambah objek 3D terdekat agar mudah dipindahkan (E)">Angkat (E)</button>
        <button type="button" id="btn-avatar-carry-drop" class="sim-action-btn is-drop hidden" title="Taruh 1 objek (Q) • Taruh Semua (Shift+Q)">Taruh (Q)</button>
        <button type="button" id="btn-avatar-inspect-nearest" class="sim-action-btn is-primary" title="Fokus & Inspeksi Port perangkat terdekat (F)">Inspeksi Port (F)</button>
        <button type="button" id="btn-avatar-exit" class="sim-action-btn is-exit" title="Keluar dari Mode Teknisi (G)">Keluar</button>
      </div>
    `;

    hudEl.classList.remove('hidden');
    hudEl.style.display = 'flex';
    this._lastAvatarHudNearestId = null;
    this._lastAvatarHudDistKey = '';
    this._lastAvatarHudCarryKey = '';

    hudEl.onpointerdown = (ev) => ev.stopPropagation();

    hudEl.querySelectorAll('[data-avatar-persp]')?.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const mode = btn.getAttribute('data-avatar-persp');
        if (mode) this.setAvatarPerspective(mode);
      });
    });

    const scaleRange = hudEl.querySelector('#range-avatar-scale');
    if (scaleRange) {
      scaleRange.addEventListener('input', (ev) => {
        ev.stopPropagation();
        this.setAvatarScale(ev.target.value, { silent: true });
      });
      scaleRange.addEventListener('change', (ev) => {
        ev.stopPropagation();
        this.setAvatarScale(ev.target.value, { silent: false });
      });
    }

    hudEl.querySelector('#btn-avatar-scale-down')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarScale(Math.round((this.getAvatarScale() - AVATAR_SCALE_STEP) * 100) / 100);
    });

    hudEl.querySelector('#btn-avatar-scale-up')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarScale(Math.round((this.getAvatarScale() + AVATAR_SCALE_STEP) * 100) / 100);
    });

    const sensRange = hudEl.querySelector('#range-avatar-sens');
    if (sensRange) {
      sensRange.addEventListener('input', (ev) => {
        ev.stopPropagation();
        this.setAvatarMouseSensitivity(ev.target.value, { silent: true });
      });
      sensRange.addEventListener('change', (ev) => {
        ev.stopPropagation();
        this.setAvatarMouseSensitivity(ev.target.value, { silent: false });
      });
    }

    hudEl.querySelector('#btn-avatar-sens-down')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarMouseSensitivity(Math.round((this.getAvatarMouseSensitivity() - AVATAR_MOUSE_SENS_STEP) * 100) / 100);
    });

    hudEl.querySelector('#btn-avatar-sens-up')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarMouseSensitivity(Math.round((this.getAvatarMouseSensitivity() + AVATAR_MOUSE_SENS_STEP) * 100) / 100);
    });

    const teleportSel = hudEl.querySelector('#select-avatar-teleport');
    if (teleportSel) {
      teleportSel.onchange = (ev) => {
        const devId = ev.target.value;
        if (devId) {
          this.teleportAvatarToDevice(devId);
          ev.target.value = '';
        }
      };
    }

    hudEl.querySelector('#btn-avatar-carry-pickup')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.pickupNearestObjectFromAvatar();
    });

    hudEl.querySelector('#btn-avatar-carry-drop')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.dropCarriedObjectsFromAvatar({ dropAll: Boolean(ev.shiftKey) });
    });

    hudEl.querySelector('#btn-avatar-inspect-nearest')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.inspectNearestDeviceFromAvatar();
    });

    hudEl.querySelector('#btn-avatar-exit')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarMode(false);
    });

    this.updateAvatarProximityHud();
    this.updateRemotePeersHud?.(authManager.getRemotePeers());
  }

  updateAvatarProximityHud() {
    if (typeof document === 'undefined' || !this.avatarMode || this.simulatorFocusedDeviceId) return;
    const slot = document.getElementById('avatar-nearest-slot');
    if (!slot) return;

    const nearestId = this.avatarState.nearestDeviceId;
    const dist = this.avatarState.nearestDist;
    const distText = Number.isFinite(dist) ? `${dist.toFixed(1)}m` : '--';

    const nearestPick = this.findNearestPickableObjectToAvatar?.();
    const pickObjId = nearestPick?.id || nearestPick?.obj?.id || '';
    const pickName = nearestPick?.name || nearestPick?.obj?.name || '';
    const pickDistText = nearestPick ? `${nearestPick.distance.toFixed(1)}m` : '';
    const carriedCount = Array.isArray(this.carriedObjects) ? this.carriedObjects.length : 0;
    const carryNamesKey = carriedCount > 0
      ? this.carriedObjects.map((c) => c.objId || c.devId).join(',')
      : '';
    const carriedDev = carriedCount > 0
      ? this.carriedObjects.find((c) => c.kind === 'device')
      : null;
    const aimRay = carriedDev ? this._getAvatarWallAimRay?.() : null;
    const sampleCarryDev = carriedDev ? this.deviceManager?.getDeviceById?.(carriedDev.devId) : null;
    const wallReadyHit = (aimRay && sampleCarryDev)
      ? this.find3DWallMountTarget?.(aimRay.origin, aimRay.dir, aimRay.maxDist, { device: sampleCarryDev, minHitY: 0.25, maxHitY: 12.0 })
      : null;
    const wallKey = wallReadyHit ? `W:${wallReadyHit.elevationMeters}` : '';
    const carryKey = `${carriedCount}:${carryNamesKey}:${pickObjId}:${pickDistText}:${wallKey}`;

    const btnPick = document.getElementById('btn-avatar-carry-pickup');
    const btnDrop = document.getElementById('btn-avatar-carry-drop');
    if (btnPick) {
      btnPick.disabled = !nearestPick || carriedCount >= (this.maxCarriedObjects || 8);
      btnPick.textContent = carriedCount > 0 ? `+Angkat (E)` : `Angkat (E)`;
    }
    if (btnDrop) {
      btnDrop.classList.toggle('hidden', carriedCount === 0);
      if (wallReadyHit) {
        btnDrop.textContent = carriedCount > 1 ? `Tempel (${carriedCount}) (Q)` : `Tempel Dinding (Q)`;
      } else {
        btnDrop.textContent = carriedCount > 1 ? `Taruh (${carriedCount}) (Q)` : `Taruh (Q)`;
      }
    }

    if (
      this._lastAvatarHudNearestId === nearestId
      && this._lastAvatarHudDistKey === distText
      && this._lastAvatarHudCarryKey === carryKey
    ) {
      return;
    }
    this._lastAvatarHudNearestId = nearestId;
    this._lastAvatarHudDistKey = distText;
    this._lastAvatarHudCarryKey = carryKey;

    const dev = nearestId ? this.deviceManager?.getDeviceById?.(nearestId) : null;
    const devPart = !dev
      ? '<span>Perangkat: --</span>'
      : `<span>Perangkat:</span> <span class="avatar-bar-nearest-name">${this.escapeHudHtml(dev.name)}</span>${dev.network?.ip ? ` <span class="sim-inspector-badge is-ip">${this.escapeHudHtml(dev.network.ip)}</span>` : ''} <span class="sim-inspector-badge">${distText}</span>`;

    let carryPart = '';
    if (carriedCount > 0) {
      const names = this.carriedObjects.slice(-2).map((c) => this.escapeHudHtml(c.name)).join(', ');
      const prefix = carriedCount > 2 ? `+${carriedCount - 2} lagi, ` : '';
      carryPart = ` <span class="sim-inspector-badge is-carrying">Dibawa (${carriedCount}): ${prefix}${names}</span>`;
      if (wallReadyHit) {
        carryPart += ` <span class="sim-inspector-badge is-pickable">[Q] Tempel ke Dinding 3D (${wallReadyHit.elevationMeters.toFixed(1)}m)</span>`;
      }
    }
    if (pickObjId && carriedCount < (this.maxCarriedObjects || 8)) {
      const hintVerb = carriedCount > 0 ? '+[E] Angkat' : '[E] Angkat';
      carryPart += ` <span class="sim-inspector-badge is-pickable">${hintVerb} ${this.escapeHudHtml(pickName)} (${pickDistText})</span>`;
    }

    slot.innerHTML = `${devPart}${carryPart}`;
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

  escapeHudHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  setAutoFocusOnClick(enabled) {
    this.autoFocusOnClick = Boolean(enabled);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('netmap_sim_autofocus_3d', this.autoFocusOnClick ? '1' : '0');
      }
    } catch { /* ignore storage errors */ }
    if (typeof document !== 'undefined') {
      document.getElementById('btn-3d-autofocus')?.classList.toggle('active', this.autoFocusOnClick);
    }
    this.showStatusHint(
      this.autoFocusOnClick
        ? 'Auto-Fokus Simulator aktif: klik perangkat untuk zoom ke panel port & kelola kabel.'
        : 'Auto-Fokus Simulator dimatikan: gunakan tombol Fokus / Double-Klik untuk zoom perangkat.'
    );
    return this.autoFocusOnClick;
  }

  toggleAutoFocusOnClick() {
    return this.setAutoFocusOnClick(!this.autoFocusOnClick);
  }

  getDeviceStackPeers(deviceId) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev || !dev.position) return dev ? [dev] : [];
    const allDevs = this.deviceManager?.getAllDevices?.() || [];
    const peers = allDevs.filter((d) => (
      d && d.position &&
      Math.hypot((d.position.x ?? 0) - (dev.position.x ?? 0), (d.position.y ?? 0) - (dev.position.y ?? 0)) < 0.025
    ));
    peers.sort((a, b) => {
      const ezB = b.spatial3d?.elevationMeters ?? getDefaultSpatial3d(b.type).elevationMeters;
      const ezA = a.spatial3d?.elevationMeters ?? getDefaultSpatial3d(a.type).elevationMeters;
      if (Math.abs(ezB - ezA) > 0.001) return ezB - ezA;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return peers.length > 0 ? peers : [dev];
  }

  getDevicePortPanelPose(deviceId) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const basePos = this.effectivePosMap.get(deviceId) || new THREE.Vector3();
    const userScale = (dev?.spatial3d?.modelScale > 0 ? Number(dev.spatial3d.modelScale) : 1) * this.deviceScaleMultiplier;

    const prefix = `${deviceId}::`;
    const posSum = new THREE.Vector3();
    const dirSum = new THREE.Vector3();
    let posCount = 0;
    let dirCount = 0;

    for (const [key, pt] of this.portWorldPosMap.entries()) {
      if (key.startsWith(prefix) && pt) {
        posSum.add(pt);
        posCount += 1;
      }
    }
    for (const [key, dir] of this.portWorldDirMap.entries()) {
      if (key.startsWith(prefix) && dir) {
        dirSum.add(dir);
        dirCount += 1;
      }
    }

    const panelCenter = posCount > 0
      ? posSum.multiplyScalar(1 / posCount)
      : basePos.clone().add(new THREE.Vector3(0, 0.14 * this.deviceScaleMultiplier, 0));

    let panelNormal = dirCount > 0
      ? dirSum.multiplyScalar(1 / dirCount)
      : new THREE.Vector3(0, 0, 1).applyEuler(this.getDeviceEuler(dev));
    panelNormal.y = 0;
    if (panelNormal.lengthSq() < 0.001) {
      panelNormal = new THREE.Vector3(0, 0, 1).applyEuler(this.getDeviceEuler(dev));
      panelNormal.y = 0;
    }
    if (panelNormal.lengthSq() < 0.001) {
      panelNormal.set(0, 0, 1);
    } else {
      panelNormal.normalize();
    }

    const rightVec = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), panelNormal);
    if (rightVec.lengthSq() < 0.001) rightVec.set(1, 0, 0);
    else rightVec.normalize();

    return { panelCenter, panelNormal, rightVec, userScale, dev, basePos };
  }

  computeSimulatorCameraPose(deviceId, viewAngle = 'front') {
    const validAngles = ['front', 'stack', 'iso', 'side', 'back'];
    const angle = validAngles.includes(viewAngle) ? viewAngle : 'front';
    const { panelCenter, panelNormal, rightVec, userScale, basePos } = this.getDevicePortPanelPose(deviceId);
    const stackPeers = this.getDeviceStackPeers(deviceId);

    let target;
    let endPos;

    if (angle === 'stack' && stackPeers.length > 0) {
      let minY = Infinity;
      let maxY = -Infinity;
      const centerAccum = new THREE.Vector3();
      let cnt = 0;
      stackPeers.forEach((peer) => {
        const peerPose = this.getDevicePortPanelPose(peer.id);
        const py = peerPose.panelCenter.y;
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
        centerAccum.add(peerPose.panelCenter);
        cnt += 1;
      });
      const stackCenter = cnt > 0 ? centerAccum.multiplyScalar(1 / cnt) : panelCenter.clone();
      stackCenter.y = (minY + maxY) * 0.5;
      const stackSpan = Math.max(0.9, (maxY - minY) + userScale * 0.65);
      const dist = Math.max(2.1, stackSpan * 1.35, userScale * 1.55);
      target = stackCenter;
      endPos = stackCenter.clone()
        .addScaledVector(panelNormal, dist)
        .add(new THREE.Vector3(0, stackSpan * 0.04, 0));
    } else if (angle === 'iso') {
      const dist = Math.max(1.8, userScale * 1.6);
      target = panelCenter.clone();
      endPos = panelCenter.clone()
        .addScaledVector(panelNormal, dist * 0.85)
        .addScaledVector(rightVec, dist * 0.52)
        .add(new THREE.Vector3(0, userScale * 0.34, 0));
    } else if (angle === 'side') {
      const dist = Math.max(1.75, userScale * 1.55);
      target = panelCenter.clone().addScaledVector(panelNormal, userScale * 0.16);
      endPos = target.clone()
        .addScaledVector(rightVec, dist)
        .add(new THREE.Vector3(0, userScale * 0.10, 0));
    } else if (angle === 'back') {
      const dist = Math.max(1.65, userScale * 1.5);
      target = basePos.clone();
      endPos = target.clone()
        .addScaledVector(panelNormal, -dist)
        .add(new THREE.Vector3(0, userScale * 0.14, 0));
    } else {
      // 'front': crisp dead-center close-up of the device's port panel
      const dist = Math.max(1.55, userScale * 1.45);
      target = panelCenter.clone();
      endPos = panelCenter.clone()
        .addScaledVector(panelNormal, dist)
        .add(new THREE.Vector3(0, userScale * 0.05, 0));
    }

    endPos.y = Math.max(0.25, endPos.y);
    return { target, endPos, viewAngle: angle, stackPeers };
  }

  focusOnDevice(deviceId, { viewAngle = this.simulatorViewAngle || 'front', saveReturnCamera = true, duration = 400 } = {}) {
    if (!this.isActive || !this.effectivePosMap.has(deviceId)) return;

    if (saveReturnCamera && !this.simulatorFocusedDeviceId && this.camera && this.controls) {
      this.savedPreFocusCamera = {
        pos: this.camera.position.clone(),
        target: this.controls.target.clone()
      };
    }

    const pose = this.computeSimulatorCameraPose(deviceId, viewAngle);
    this.simulatorFocusedDeviceId = deviceId;
    this.simulatorViewAngle = pose.viewAngle;

    this.releaseAvatarPointerLock?.();
    this.syncAvatarCrosshair?.();
    this.syncAvatarMeshVisibilityForPerspective?.();
    this.syncAvatarControlsUI?.();
    this.configureControlsForAvatarMode?.(false);
    this.animateCameraTo(pose.endPos, pose.target, duration);
    if (typeof document !== 'undefined') {
      const avatarHud = document.getElementById('hud-3d-avatar-bar');
      if (avatarHud) {
        avatarHud.classList.add('hidden');
        avatarHud.style.display = 'none';
      }
    }
    this.renderSimulatorInspectorHud(deviceId);
  }

  exitSimulatorFocus({ restoreCamera = true } = {}) {
    if (restoreCamera && this.savedPreFocusCamera && this.camera && this.controls) {
      this.animateCameraTo(this.savedPreFocusCamera.pos, this.savedPreFocusCamera.target, 380);
    }
    this.savedPreFocusCamera = null;
    this.simulatorFocusedDeviceId = null;

    if (typeof document !== 'undefined') {
      const hudEl = document.getElementById('hud-3d-sim-inspector');
      if (hudEl) {
        hudEl.innerHTML = '';
        hudEl.classList.add('hidden');
        hudEl.style.display = 'none';
      }
    }
    this.configureControlsForAvatarMode?.(this.avatarMode);
    this.syncAvatarMeshVisibilityForPerspective?.();
    this.syncAvatarControlsUI?.();
    this.syncAvatarCrosshair?.();
    if (this.avatarMode && this.isActive) {
      this.renderAvatarHudBar?.();
    }
  }

  startCableFromDevicePort(deviceId, portName = '') {
    if (!deviceId) return;
    this.pendingCableSourceId = deviceId;
    this.pendingCableSourcePort = portName || '';
    this.pending3dWaypoints = [];
    this.simulatorFocusedDeviceId = deviceId;
    const srcDev = this.deviceManager?.getDeviceById?.(deviceId);
    const portSuffix = portName ? ` [${portName}]` : '';
    this.showStatusHint(`Menarik kabel dari ${srcDev?.name || deviceId}${portSuffix} — klik perangkat & port tujuan.`);
    if (this.isActive) {
      this.syncDevices();
      this.syncCables();
      this.renderSimulatorInspectorHud(deviceId);
    }
  }

  handleSimulatorPortClick(deviceId, portName) {
    if (!deviceId || !portName) return null;
    const allCables = this.cableManager?.getAllConnections?.() || [];
    const existingConn = allCables.find((cab) => (
      (cab.source === deviceId && cab.details?.portSource === portName) ||
      (cab.destination === deviceId && cab.details?.portDestination === portName)
    ));

    if (existingConn) {
      if (this.pendingCableSourceId) {
        this.showStatusHint(`Port ${portName} sudah terhubung. Pilih port yang masih kosong.`);
        return null;
      }
      stateManager.deselectObject3d?.();
      this.cableManager?.selectConnection?.(existingConn.id);
      this.simulatorFocusedDeviceId = deviceId;
      this.renderSimulatorInspectorHud(deviceId);
      return existingConn;
    }

    // Empty port clicked while another device is pending cable source -> create cable right away
    if (this.pendingCableSourceId && this.pendingCableSourceId !== deviceId) {
      const srcId = this.pendingCableSourceId;
      const srcPort = this.pendingCableSourcePort || '';
      const srcDev = this.deviceManager?.getDeviceById?.(srcId);
      const dstDev = this.deviceManager?.getDeviceById?.(deviceId);
      const newCab = this.cableManager?.addConnection?.({
        name: `${srcDev?.name || 'Source'}${srcPort ? ` [${srcPort}]` : ''} -> ${dstDev?.name || 'Dest'} [${portName}]`,
        source: srcId,
        destination: deviceId,
        cableCategory: this.pen3dCategory || 'cat6',
        route: [...this.pending3dWaypoints],
        status: 'active',
        details: {
          pathStyle: 'curve',
          curveTension: 0.38,
          ...(srcPort ? { portSource: srcPort } : {}),
          portDestination: portName
        }
      });

      this.pendingCableSourceId = null;
      this.pendingCableSourcePort = '';
      this.pending3dWaypoints = [];
      this.simulatorFocusedDeviceId = deviceId;

      if (this.isActive) {
        this.syncDevices();
        this.syncCables();
      }
      if (newCab) {
        this.cableManager?.selectConnection?.(newCab.id);
        this.showStatusHint(`Kabel terpasang: ${srcDev?.name || srcId} [${srcPort || 'auto'}] -> ${dstDev?.name || deviceId} [${portName}]`);
      }
      this.renderSimulatorInspectorHud(deviceId);
      return newCab || null;
    }

    // Same device pending port clicked again -> toggle/cancel pending cable
    if (this.pendingCableSourceId === deviceId && this.pendingCableSourcePort === portName) {
      this.pendingCableSourceId = null;
      this.pendingCableSourcePort = '';
      this.pending3dWaypoints = [];
      if (this.isActive) {
        this.syncDevices();
        this.syncCables();
      }
      this.renderSimulatorInspectorHud(deviceId);
      return null;
    }

    // Start cable from this port
    this.startCableFromDevicePort(deviceId, portName);
    return null;
  }

  renderSimulatorInspectorHud(deviceId) {
    if (typeof document === 'undefined') return;
    const hudEl = document.getElementById('hud-3d-sim-inspector');
    if (!hudEl) return;

    if (!this.isActive || !deviceId) {
      hudEl.innerHTML = '';
      hudEl.classList.add('hidden');
      hudEl.style.display = 'none';
      return;
    }

    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) {
      hudEl.innerHTML = '';
      hudEl.classList.add('hidden');
      hudEl.style.display = 'none';
      return;
    }

    const holder = this.deviceMeshMap.get(deviceId);
    const devPorts = Array.isArray(holder?.userData?.devPorts) && holder.userData.devPorts.length > 0
      ? holder.userData.devPorts
      : (Array.isArray(dev.ports) && dev.ports.length > 0
        ? dev.ports
        : getDefaultDevicePorts(dev.type, dev.model, dev.spatial3d?.customModelUrl));

    const allCables = this.cableManager?.getAllConnections?.() || [];
    const portConnMap = new Map();
    allCables.forEach((cab) => {
      if (cab.source === deviceId && cab.details?.portSource) {
        const peer = this.deviceManager?.getDeviceById?.(cab.destination);
        portConnMap.set(cab.details.portSource, {
          cable: cab,
          peerName: peer?.name || cab.destination,
          peerPort: cab.details?.portDestination || ''
        });
      }
      if (cab.destination === deviceId && cab.details?.portDestination) {
        const peer = this.deviceManager?.getDeviceById?.(cab.source);
        portConnMap.set(cab.details.portDestination, {
          cable: cab,
          peerName: peer?.name || cab.source,
          peerPort: cab.details?.portSource || ''
        });
      }
    });

    const stackPeers = this.getDeviceStackPeers(deviceId);
    const selectedCableId = this.cableManager?.selectedCableId || null;
    const ipText = dev.network?.ip ? dev.network.ip : 'Tanpa IP';
    const modelText = [dev.brand, dev.model].filter(Boolean).join(' ') || (dev.type || 'Device');

    const angles = [
      { key: 'front', label: 'Depan Port' },
      { key: 'stack', label: 'Satu Rak' },
      { key: 'iso', label: 'Diagonal' },
      { key: 'side', label: 'Samping' },
      { key: 'back', label: 'Belakang' }
    ];

    const pendingSrcDev = this.pendingCableSourceId
      ? this.deviceManager?.getDeviceById?.(this.pendingCableSourceId)
      : null;

    const stackBarHtml = stackPeers.length > 1
      ? `<div class="sim-inspector-stack-bar">
           <span class="sim-stack-label">Tumpukan (${stackPeers.length}):</span>
           ${stackPeers.map((peer) => {
             const elev = peer.spatial3d?.elevationMeters ?? getDefaultSpatial3d(peer.type).elevationMeters;
             const isCur = peer.id === deviceId;
             return `<button type="button" class="sim-stack-pill ${isCur ? 'active' : ''}" data-sim-stack-id="${this.escapeHudHtml(peer.id)}" title="Fokus ke ${this.escapeHudHtml(peer.name)} (${elev}m)">${this.escapeHudHtml(peer.name)} (${elev}m)</button>`;
           }).join('')}
         </div>`
      : '';

    const pendingBannerHtml = pendingSrcDev
      ? `<div class="sim-port-pending-banner">
           <span>Menarik kabel dari <strong>${this.escapeHudHtml(pendingSrcDev.name)}</strong>${this.pendingCableSourcePort ? ` [<strong>${this.escapeHudHtml(this.pendingCableSourcePort)}</strong>]` : ''} — pilih port tujuan pada perangkat lain${stackPeers.length > 1 ? ' atau klik perangkat di Tumpukan' : ''}.</span>
           <button type="button" class="sim-action-btn" data-sim-cancel-cable="1">Batal Kabel</button>
         </div>`
      : '';

    const portsHtml = devPorts.map((p) => {
      const link = portConnMap.get(p.name);
      const isConnected = Boolean(link);
      const isCableSel = isConnected && link.cable.id === selectedCableId;
      const isPendingSrc = this.pendingCableSourceId === deviceId && this.pendingCableSourcePort === p.name;
      let ledClass = '';
      if (isPendingSrc) {
        ledClass = 'is-warning';
      } else if (isConnected) {
        const st = link.cable.status || 'active';
        ledClass = (st === 'damaged' || st === 'inactive')
          ? 'is-offline'
          : (st === 'maintenance' ? 'is-warning' : 'is-online');
      }
      const peerLabel = isConnected
        ? `${link.peerName}${link.peerPort ? ` [${link.peerPort}]` : ''}`
        : (isPendingSrc
          ? 'Sumber Kabel Aktif'
          : (pendingSrcDev && pendingSrcDev.id !== deviceId ? 'Pasang ke Sini' : '+ Kabel'));

      return `<button type="button" class="sim-port-card ${isConnected ? 'is-connected' : ''} ${isCableSel ? 'is-cable-selected' : ''} ${isPendingSrc ? 'is-pending-source' : ''}" data-sim-port="${this.escapeHudHtml(p.name)}" title="${isConnected ? `Pilih kabel ke ${this.escapeHudHtml(peerLabel)}` : (pendingSrcDev && pendingSrcDev.id !== deviceId ? `Sambungkan kabel dari ${this.escapeHudHtml(pendingSrcDev.name)} ke port ${this.escapeHudHtml(p.name)}` : `Tarik kabel dari port ${this.escapeHudHtml(p.name)}`)}">
        <div class="sim-port-top-row">
          <span class="sim-port-name-wrap">
            <span class="sim-port-led ${ledClass}"></span>
            <span class="sim-port-name">${this.escapeHudHtml(p.name)}</span>
          </span>
          <span class="sim-port-speed">${this.escapeHudHtml(p.speed || p.type || '')}</span>
        </div>
        <span class="sim-port-peer">${this.escapeHudHtml(peerLabel)}</span>
      </button>`;
    }).join('');

    hudEl.innerHTML = `
      <div class="sim-inspector-header">
        <div class="sim-inspector-title-group">
          <span class="sim-inspector-device-name">${this.escapeHudHtml(dev.name)}</span>
          <span class="sim-inspector-badge">${this.escapeHudHtml(modelText)}</span>
          <span class="sim-inspector-badge is-ip">${this.escapeHudHtml(ipText)}</span>
        </div>
        <div class="sim-inspector-controls-group">
          ${angles.map((a) => `<button type="button" class="sim-angle-pill ${this.simulatorViewAngle === a.key ? 'active' : ''}" data-sim-angle="${a.key}">${a.label}</button>`).join('')}
          <button type="button" class="sim-action-btn is-primary" data-sim-action="detail" title="Detail Lengkap, Spesifikasi & Anggaran (DAK/BOS)">Detail</button>
          <button type="button" class="sim-action-btn" data-sim-action="config" title="Konfigurasi Detail IP, VLAN & SSID">Konfigurasi</button>
          <button type="button" class="sim-action-btn is-exit" data-sim-action="exit" title="Keluar Mode Fokus Simulator (Esc)">Keluar Fokus</button>
        </div>
      </div>
      ${stackBarHtml}
      ${pendingBannerHtml}
      <div class="sim-port-grid">${portsHtml}</div>
    `;

    hudEl.classList.remove('hidden');
    hudEl.style.display = 'flex';
    hudEl.onpointerdown = (ev) => ev.stopPropagation();
    hudEl.onclick = (evt) => {
      evt.stopPropagation();
      const angleBtn = evt.target.closest('[data-sim-angle]');
      if (angleBtn) {
        const angle = angleBtn.getAttribute('data-sim-angle');
        this.focusOnDevice(deviceId, { viewAngle: angle, saveReturnCamera: false, duration: 360 });
        return;
      }

      const stackBtn = evt.target.closest('[data-sim-stack-id]');
      if (stackBtn) {
        const targetId = stackBtn.getAttribute('data-sim-stack-id');
        if (targetId) {
          stateManager.deselectObject3d?.();
          this.deviceManager.selectDevice(targetId);
          this.focusOnDevice(targetId, {
            viewAngle: this.simulatorViewAngle || 'front',
            saveReturnCamera: false,
            duration: 340
          });
        }
        return;
      }

      const cancelBtn = evt.target.closest('[data-sim-cancel-cable]');
      if (cancelBtn) {
        this.pendingCableSourceId = null;
        this.pendingCableSourcePort = '';
        this.pending3dWaypoints = [];
        this.syncDevices();
        this.syncCables();
        this.renderSimulatorInspectorHud(deviceId);
        return;
      }

      const actionBtn = evt.target.closest('[data-sim-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-sim-action');
        if (action === 'detail') {
          eventBus.emit('modal:open-device-detail', { deviceId, tab: 'overview' });
        } else if (action === 'config') {
          eventBus.emit('modal:open-device-detail', { deviceId, tab: 'network' });
        } else if (action === 'exit') {
          this.exitSimulatorFocus({ restoreCamera: true });
        }
        return;
      }

      const portBtn = evt.target.closest('[data-sim-port]');
      if (portBtn) {
        const portName = portBtn.getAttribute('data-sim-port');
        if (portName) {
          this.handleSimulatorPortClick(deviceId, portName);
        }
      }
    };
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

  _disposeObject3DResources(root) {
    if (!root) return;
    root.traverse((obj) => {
      // Never dispose shared geometries/materials/textures originating from glbCache clones
      if (obj.userData?.sharedGlbResource) return;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (!m) return;
          if (m.map && m.map !== this.groundTexture) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      this._disposeObject3DResources(child);
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
      if (!this.isActive || this.dragMoveState || this.dragRotateState) return;
      if (this._pendingSyncRaf) return;
      this._pendingSyncRaf = requestAnimationFrame(() => {
        this._pendingSyncRaf = null;
        if (!this.isActive || this.dragMoveState || this.dragRotateState) return;
        this.syncDevices();
        this.syncCables();
        if (this.simulatorFocusedDeviceId) {
          if (this.deviceManager?.getDeviceById?.(this.simulatorFocusedDeviceId)) {
            this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId);
          } else {
            this.exitSimulatorFocus({ restoreCamera: false });
          }
        } else if (this.avatarMode) {
          this.findNearestDeviceToAvatar();
          this.renderAvatarHudBar();
        }
      });
    };

    const handleSelectionVisuals = () => {
      if (!this.isActive) return;
      this.syncSelectionRings();
      if (this.simulatorFocusedDeviceId) {
        if (this.deviceManager?.getDeviceById?.(this.simulatorFocusedDeviceId)) {
          this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId);
        } else {
          this.exitSimulatorFocus({ restoreCamera: false });
        }
      }
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
      if (this.simulatorFocusedDeviceId) {
        this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId);
      }
    };

    eventBus.on('connection:added', syncCablesOnly);
    eventBus.on('connection:updated', syncCablesOnly);
    eventBus.on('connection:deleted', syncCablesOnly);
    eventBus.on('connection:selected', syncCablesOnly);
    eventBus.on('connection:deselected', syncCablesOnly);

    const syncRoomsOnly = () => {
      if (this.isActive && !this.object3dDragState) {
        this.syncRooms();
      }
    };
    eventBus.on('room3d:changed', syncRoomsOnly);
    eventBus.on('room3d:selected', syncRoomsOnly);
    eventBus.on('room3d:deselected', syncRoomsOnly);

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

    eventBus.on('presence:updated', ({ peers, deltaPeer, deltaType, deltaClientId } = {}) => {
      if (deltaType === 'update' && deltaPeer) {
        this.syncSingleRemoteAvatar(deltaPeer);
        return;
      }
      if (deltaType === 'remove' && deltaClientId) {
        this.removeSingleRemoteAvatar(deltaClientId);
        return;
      }
      this.syncRemoteAvatars(peers || authManager.getRemotePeers());
    });

    eventBus.on('auth:changed', () => {
      const u = authManager.getCurrentUser?.();
      if (this.avatarGroup) {
        updateRobloxAvatarLabel(this.avatarGroup, u ? `@${u.username}` : 'Teknisi Jaringan', '#76c457');
      }
      this.syncRemoteAvatars(authManager.getRemotePeers());
    });

    eventBus.on('mode:changed', ({ mode }) => {
      if (this.container) {
        this.container.classList.toggle('mode-draw-cable', mode === 'draw-cable');
      }
      if (mode !== 'draw-cable') {
        this.pendingCableSourceId = null;
        this.pendingCableSourcePort = '';
        this.pending3dWaypoints = [];
        if (this.isActive) {
          this.syncDevices();
          this.syncCables();
          if (this.simulatorFocusedDeviceId) {
            this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId);
          }
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

    eventBus.on('map3d:start-cable', ({ deviceId, portName = '' }) => {
      this.pendingCableSourceId = deviceId || null;
      this.pendingCableSourcePort = portName || '';
      this.pending3dWaypoints = [];
      if (this.isActive) {
        this.syncDevices();
        this.syncCables();
        if (this.simulatorFocusedDeviceId) {
          this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId);
        }
      }
    });

    eventBus.on('map3d:zoom-extents', () => {
      if (this.isActive) this.zoomExtents();
    });

    eventBus.on('map3d:set-navtool', ({ tool }) => {
      if (tool) this.setNavTool(tool);
    });

    eventBus.on('map3d:bake-cable-pen-points', ({ cableId, count = 3 }) => {
      const cable = this.cableManager?.getConnectionById(cableId);
      if (!cable) return;
      const numPts = Math.max(1, Math.min(8, Number(count) || 3));
      const mesh = this.cableMeshMap.get(cableId);
      const curve = mesh?.userData?.curve || null;
      const srcDev = this.deviceManager?.getDeviceById(cable.source);
      const dstDev = this.deviceManager?.getDeviceById(cable.destination);

      const sampledRoute = [];
      if (curve && typeof curve.getPoint === 'function') {
        for (let i = 1; i <= numPts; i++) {
          const t = i / (numPts + 1);
          const pt = curve.getPoint(t);
          const { normX, normY } = this.worldToNorm(pt.x, pt.z);
          sampledRoute.push({
            x: Number(Math.max(0.01, Math.min(0.99, normX)).toFixed(4)),
            y: Number(Math.max(0.01, Math.min(0.99, normY)).toFixed(4)),
            z: Number(Math.max(0.02, pt.y).toFixed(2))
          });
        }
      } else if (srcDev && dstDev) {
        const srcElev = srcDev.spatial3d?.elevationMeters ?? 1.2;
        const dstElev = dstDev.spatial3d?.elevationMeters ?? 1.2;
        for (let i = 1; i <= numPts; i++) {
          const t = i / (numPts + 1);
          sampledRoute.push({
            x: Number(Math.max(0.01, Math.min(0.99, srcDev.position.x + (dstDev.position.x - srcDev.position.x) * t)).toFixed(4)),
            y: Number(Math.max(0.01, Math.min(0.99, srcDev.position.y + (dstDev.position.y - srcDev.position.y) * t)).toFixed(4)),
            z: Number(Math.max(0.02, srcElev + (dstElev - srcElev) * t).toFixed(2))
          });
        }
      }

      if (sampledRoute.length > 0) {
        this.cableManager.updateConnection(cableId, {
          route: sampledRoute,
          details: {
            ...(cable.details || {}),
            pathStyle: 'curve',
            bowOut: 0,
            sideOffset: 0,
            sagDrop: 0
          }
        });
      }
    });

    // Keyboard state tracking for smooth WASD/QE walk/fly and Roblox Mode Teknisi jump/sprint in 3D mode
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Alt' && this.avatarMode) {
        this.releaseAvatarPointerLock();
      }
      if (e.code === 'Space' || e.key === ' ') {
        if (this.avatarMode) {
          e.preventDefault();
          this.keysPressed.add('space');
        }
        return;
      }
      this.keysPressed.add(e.key.toLowerCase());
      if (e.shiftKey) this.keysPressed.add('shift');
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        this.keysPressed.delete('space');
      }
      this.keysPressed.delete(e.key.toLowerCase());
      if (!e.shiftKey) this.keysPressed.delete('shift');
    });

    window.addEventListener('blur', () => {
      this.keysPressed.clear();
    });
  }
}
