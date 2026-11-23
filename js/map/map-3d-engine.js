/**
 * NetMap — Interactive 3D Map Viewport Engine (Three.js WebGL)
 * Visualisasi 3D perangkat bertumpuk (Server, Router, Switch, Access Point),
 * kabel 3D ber-elevasi, cakupan sinyal nirkabel, ruangan 3D kustom, serta loader model .glb/.gltf.
 */

import * as THREE from 'three';

const { Vector3, Matrix3, Color, Raycaster, CurvePath, LineCurve3, TubeGeometry, MeshBasicMaterial, Mesh, RingGeometry, DoubleSide, Group } = THREE;
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { attachMap3DSubsystems } from './map-3d-subsystems.js';
import { attachMap3DNextGenPerf } from './map-3d-nextgen-perf.js';
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
  create3DRoadGroup,
  ROAD3D_PRESETS,
  OBJECT3D_PRESETS,
  loadCustomGlbModel,
  applyRoomGlbScale,
  getRoomMinDimensions,
  create3DPortsSubGroup,
  createRobloxAvatar3DGroup,
  updateRobloxAvatarLabel,
  animateRobloxAvatarRig,
  createFppHandsViewmodelGroup,
  createFppCableSpoolViewmodelGroup,
  createCableClip3DMesh,
  createInstancedCableClips3DGroup,
  createConduitSegmentMesh,
  findCutawayPairPreset,
  createBuildingSignboard3DGroup,
  getDefaultRoomPassThrough
} from './map-3d-models.js';
import {
  buildBuildingDocumentationSummary,
  isBuildingSignboardEligible,
  isPointInsideRoomOBB,
  findBuildingForPoint,
  isDecorationRoom
} from './room-spatial-index.js';
import {
  classifySurfaceFromNormal,
  getDefaultClipType,
  getStandardMaxLengthMeters,
  buildFilletedPolylinePoints,
  evaluateCableNeatness
} from '../connections/cable-routing-engine.js';
import { clamp, generateId, isMobileTouchDevice, uiIcon } from '../utils/helpers.js';
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
    this.roadsGroup = new THREE.Group();
    this.roadsGroup.name = 'Roads3DGroup';
    this.roadPreviewGroup = new THREE.Group();
    this.roadPreviewGroup.name = 'Road3DPreviewGroup';
    this.roomsGroup = new THREE.Group();
    this.buildingSignboardsGroup = new THREE.Group();
    this.buildingSignboardsGroup.name = 'BuildingSignboardsGroup';
    this.objects3dGroup = new THREE.Group();
    this.devicesGroup = new THREE.Group();
    this.cablesGroup = new THREE.Group();
    this.coverageGroup = new THREE.Group();
    this.packetFlowGroup = new THREE.Group();
    this.packetFlowGroup.name = 'PacketFlow3DGroup';
    this.activePacketFlows = [];
    this.workspaceGhostDevices = false;

    // Lookup maps
    this.deviceMeshMap = new Map(); // deviceId -> THREE.Group
    this.object3dMeshMap = new Map(); // object3dId -> THREE.Group
    this.room3dMeshMap = new Map(); // roomId -> THREE.Group
    this.signboardMeshMap = new Map(); // roomId -> { group: THREE.Group, sig: string }
    this.road3dMeshMap = new Map(); // roadId -> THREE.Group
    this.cableMeshMap = new Map();  // cableId -> THREE.Mesh
    this.effectivePosMap = new Map(); // deviceId -> THREE.Vector3
    this.portWorldPosMap = new Map(); // "${deviceId}::${portName}" -> THREE.Vector3
    this.portWorldDirMap = new Map(); // "${deviceId}::${portName}" -> THREE.Vector3 (outward normal)

    // Phase 8 Digital Twin state (X-Ray Gedung & Floating Building Signboards)
    this.buildingXrayMode = false;
    this.perRoomXrayIds = new Set();
    this._xrayMeshMaterialBackup = new WeakMap();
    this._xrayHighlightBackup = new WeakMap();
    this.showBuildingSignboards = true;

    // User view options
    this.deviceScaleMultiplier = 1.0; // Real-world 1:1 device scale matching avatar & buildings
    this.cableDiameterMultiplier = 1.0; // 1.0 = matched to 3D port socket size
    this.explodeStacks = false;
    this.showLabels = stateManager.state?.layers?.annotations !== false;
    this.showCoverage = true;
    this.viewFilters = {
      showCctv: true,
      showFiber: true,
      showWireless: true,
      showCoverage: true,
      dimOnSelection: true
    };

    this.animFrameId = null;
    this.resizeObserver = null;
    this.pointerDownScreen = { x: 0, y: 0 };
    this.activeMapUrl = 'assets/maps/campus-map.jpg';
    this.activeMapImage = null;
    this.groundTexture = null;

    // SketchUp-style navigation state
    this.navTool = 'orbit'; // 'orbit' | 'pan' | 'zoom' | 'look' | 'move' | 'rotate' | 'box' | 'draw3d'
    this.keysPressed = new Set();
    let savedRoomsLocked = false;
    try {
      savedRoomsLocked = typeof localStorage !== 'undefined' && localStorage.getItem('netmap_rooms3d_locked_v1') === '1';
    } catch { /* ignore */ }
    this.roomsLocked = Boolean(savedRoomsLocked);
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
    this.activeCablePull = null;
    this.cablePullPreviewGroup = new THREE.Group();
    this.cablePullPreviewGroup.name = 'AvatarCablePullPreview3D';
    this.fppCableSpoolGroup = null;
    this.dragMoveState = null;
    this.dragRotateState = null;
    this._activeMoveGuideIds = new Set();
    this._moveGuideTimer = null;
    this.boxSelectState = null;
    this.activeDraw3dTemplate = { ...OBJECT3D_PRESETS.pole };
    this.activeRoad3dConfig = {
      style: 'stepping-slab',
      pathMode: 'smooth',
      widthMeters: ROAD3D_PRESETS['stepping-slab'].widthMeters,
      slabLengthMeters: ROAD3D_PRESETS['stepping-slab'].slabLengthMeters,
      slabGapMeters: ROAD3D_PRESETS['stepping-slab'].slabGapMeters
    };
    this.roadBuildState = null;
    this.object3dDragState = null;
    this.cableDragState = null;
    this.doorStatesByKey = new Map(); // `${roomId}::${doorIdx}` -> boolean isOpen
    this.activeDoorRigs = new Map();  // `${roomId}::${doorIdx}` -> DoorRig
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
    let savedHudMin = null;
    try {
      savedHudMin = typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_avatar_hud_min_v1') : null;
    } catch { /* ignore storage restrictions */ }
    this.avatarHudMinimized = savedHudMin !== null ? savedHudMin === '1' : isMobileTouchDevice();
    let savedLabelMode = 'proximity';
    try {
      const m = typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_avatar_label_mode_v1') : null;
      if (m === 'proximity' || m === 'all' || m === 'off') savedLabelMode = m;
    } catch { /* ignore storage restrictions */ }
    this.avatarLabelMode = savedLabelMode; // 'proximity' | 'all' | 'off'
    this.avatarSimDeckOpen = false;
    this.avatarSimSettingsOpen = false;
    this.avatarSimDeckFilter = 'all';
    this.avatarSimDeckSearch = '';
    this.transformGizmoGroup = new THREE.Group();
    this.transformGizmoGroup.name = 'TransformGizmo3D';
    this.transformGizmoGroup.visible = false;
    this.transformGizmoDragState = null;
    this.simplePlacementIndicatorGroup = new THREE.Group();
    this.simplePlacementIndicatorGroup.name = 'HouseFlipperPlacementIndicator3D';
    this.simplePlacementIndicatorGroup.visible = false;
    this._lastHouseFlipperHudKey = '';
    this.buildPlacementConfig = this._loadSavedBuildPlacementConfig();
    this.mobileJoystickState = {
      active: false,
      pointerId: null,
      originX: 0,
      originY: 0,
      xRatio: 0,
      yRatio: 0,
      sprint: false
    };
    this.mobileJumpHeld = false;
    this._touchActiveInSession = false;
    this._avatarTouchPointers = new Map();
    this._avatarTouchPinchDist = 0;
    this._mobileLongPressTimer = null;
    this._mobileLongPressOrigin = null;
    this.isPausedByModal = false;
    let savedQuality = null;
    try {
      savedQuality = typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_3d_quality_v1') : null;
    } catch { /* ignore storage restrictions */ }
    this.graphicsQuality = (savedQuality === 'lite' || savedQuality === 'standard')
      ? savedQuality
      : (isMobileTouchDevice() ? 'lite' : 'standard');
    this.dirLight = null;

    // Mobile 3D Rendering Performance State (LOD, Frustum/Indoor Occlusion Culling & Smart Frame Pacing)
    this._dirtyFramesRemaining = 45;
    this._lastFrameCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._lastFrameCamQuat = new THREE.Quaternion();
    this._lastLodCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._lastLodCamQuat = new THREE.Quaternion();
    this._lastLodAt = 0;
    this._lodFrustum = typeof THREE.Frustum === 'function' ? new THREE.Frustum() : null;
    this._lodProjMatrix = typeof THREE.Matrix4 === 'function' ? new THREE.Matrix4() : null;
    this._lodSphere = typeof THREE.Sphere === 'function' ? new THREE.Sphere() : null;
    this._lastOcclusionRoomId = null;
    this.renderPerfStats = {
      lod0Count: 0,
      lod1Count: 0,
      lod2Count: 0,
      lodNearCount: 0,
      lodMidCount: 0,
      lodFarCount: 0,
      lodCulledPropsCount: 0,
      occlusionCulledCount: 0,
      activeIndoorRoomId: null,
      idleSkippedFrames: 0
    };

    this.initNextGenPerfPipeline?.();
    this.bindGlobalListeners();
    this.bindRoomLockButton();
    this.syncRoomLockUI();
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
      antialias: !isMobileTouchDevice(),
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Static shadow caching: update shadows only when geometry/doors change instead of every frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
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
    this.controls.addEventListener?.('change', () => this.markSceneDirty?.(18));

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x334155, 1.15);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(120, 220, 140);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.dirLight = dirLight;
    this.scene.add(dirLight);
    this.applyGraphicsQuality();

    this.scene.add(this.groundGroup);
    this.scene.add(this.roadsGroup);
    this.scene.add(this.roadPreviewGroup);
    this.scene.add(this.roomsGroup);
    this.scene.add(this.buildingSignboardsGroup);
    this.scene.add(this.objects3dGroup);
    this.scene.add(this.coverageGroup);
    this.scene.add(this.devicesGroup);
    this.scene.add(this.cablesGroup);
    this.scene.add(this.cablePullPreviewGroup);
    this.scene.add(this.packetFlowGroup);
    this.scene.add(this.remoteAvatarsGroup);
    this.scene.add(this.transformGizmoGroup);

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
          Boolean(this.checkTransformGizmoHitAtEvent(e)) ||
          Boolean(this.checkGizmoHitAtEvent(e));
        if (shouldBlockOrbit && this.controls && this.controls.enabled) {
          this.controls.enabled = false;
          this._temporarilyDisabledControlsForBox = true;
        }
      }
    }, { capture: true });

    const cancelLongPress = () => {
      if (this._mobileLongPressTimer) {
        clearTimeout(this._mobileLongPressTimer);
        this._mobileLongPressTimer = null;
      }
      this._mobileLongPressOrigin = null;
    };

    dom.addEventListener('pointerdown', (e) => {
      if (!this.isActive) return;
      this.markSceneDirty?.(24);
      this.cameraAnim = null; // User manual input cancels glide
      this.pointerDownScreen = { x: e.clientX, y: e.clientY };
      this.container.classList.add('is-dragging');

      const isTouch = e.pointerType === 'touch';
      if (isTouch) {
        this._touchActiveInSession = true;
      }

      if (stateManager.getMode() !== 'draw-cable' && (e.button === 0 || isTouch)) {
        const transformGizmoHit = this.checkTransformGizmoHitAtEvent(e);
        if (transformGizmoHit) {
          cancelLongPress();
          this.startTransformGizmoDrag(e, dom, transformGizmoHit);
          return;
        }
      }

      if (this.avatarMode && !this.simulatorFocusedDeviceId && isTouch) {
        this._avatarTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._avatarTouchPointers.size === 2) {
          cancelLongPress();
          const pts = Array.from(this._avatarTouchPointers.values());
          this._avatarTouchPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 0;
          return;
        }
        if (this._avatarTouchPointers.size === 1) {
          this.syncMobileRobloxControlsVisibility();
          this._mobileLongPressOrigin = { x: e.clientX, y: e.clientY };
          clearTimeout(this._mobileLongPressTimer);
          this._mobileLongPressTimer = setTimeout(() => {
            this._mobileLongPressTimer = null;
            this._suppressNextClick = true;
            this.handleCanvasRightClick({ clientX: e.clientX, clientY: e.clientY });
          }, 520);
        }
        return;
      }

      if (isTouch && !this.cableDragState && !this.object3dDragState && !this.boxSelectState && !this.dragMoveState && !this.dragRotateState && this.navTool !== 'draw3d') {
        this._mobileLongPressOrigin = { x: e.clientX, y: e.clientY };
        clearTimeout(this._mobileLongPressTimer);
        this._mobileLongPressTimer = setTimeout(() => {
          this._mobileLongPressTimer = null;
          this._suppressNextClick = true;
          this.container.classList.remove('is-dragging');
          this.handleCanvasRightClick({ clientX: e.clientX, clientY: e.clientY });
        }, 520);
      } else {
        cancelLongPress();
      }

      if (stateManager.getMode() !== 'draw-cable' && (e.button === 0 || isTouch)) {
        const cableHandleHit = this.checkCableHandleHitAtEvent(e);
        if (cableHandleHit) {
          cancelLongPress();
          this.startCableHandleDrag(e, dom, cableHandleHit);
          return;
        }
        const gizmoHit = this.checkGizmoHitAtEvent(e);
        if (gizmoHit) {
          cancelLongPress();
          this.startObject3dGizmoDrag(e, dom, gizmoHit);
        } else if (!this.avatarMode && (this.navTool === 'box' || e.ctrlKey || e.metaKey)) {
          this.startBoxSelect(e, dom);
        } else if (this.navTool === 'draw3d' && !this.avatarMode) {
          this.startObject3dCreateDraw(e, dom);
        } else if (this.navTool === 'look') {
          this.isLookDragging = true;
          this.lookPrevPointer = { x: e.clientX, y: e.clientY };
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          this.lookYaw = Math.atan2(dir.x, dir.z);
          this.lookPitch = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
          dom.setPointerCapture?.(e.pointerId);
        } else if (this.navTool === 'move' && !this.avatarMode) {
          this.startDeviceDragMove(e, dom);
        } else if (this.navTool === 'rotate' && !this.avatarMode) {
          this.startRotateDrag(e, dom);
        }
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (!this.isActive) return;
      if ((e.buttons || 0) !== 0 || this.avatarMode || this.navTool === 'road3d') {
        this.markSceneDirty?.(12);
      }
      if (this._mobileLongPressOrigin && e.pointerType === 'touch') {
        if (Math.hypot(e.clientX - this._mobileLongPressOrigin.x, e.clientY - this._mobileLongPressOrigin.y) > 10) {
          cancelLongPress();
        }
      }
      if (this.transformGizmoDragState) {
        this.updateTransformGizmoDrag(e);
        return;
      }
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
      if (this.navTool === 'road3d' && this.roadBuildState && !this.avatarMode) {
        this.updateRoad3dBuildHover(e);
      }
      if (this.avatarMode && !this.simulatorFocusedDeviceId) {
        this.handleAvatarPointerMove(e, dom);
        return;
      }
      if (!this.isLookDragging) {
        // Subtle pointer cursor cue when hovering over an interactive 3D building door
        if (this.navTool === 'orbit' && this.activeDoorRigs?.size > 0 && (e.buttons || 0) === 0) {
          const nowHover = performance.now();
          if (nowHover - (this._lastDoorHoverCheck || 0) > 65) {
            this._lastDoorHoverCheck = nowHover;
            const rect = dom.getBoundingClientRect();
            this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.pointer, this.camera);
            const overDoor = Boolean(this.findInteractiveDoorHit(this.raycaster, 140));
            dom.style.cursor = overDoor ? 'pointer' : '';
          }
        }
        return;
      }
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
      cancelLongPress();
      if (e?.pointerType === 'touch') {
        this._avatarTouchPointers?.delete(e.pointerId);
        if ((this._avatarTouchPointers?.size || 0) < 2) {
          this._avatarTouchPinchDist = 0;
        }
      }
      this.container.classList.remove('is-dragging');
      if (this._temporarilyDisabledControlsForBox) {
        this._temporarilyDisabledControlsForBox = false;
        if (this.controls) this.controls.enabled = true;
      }
      if (this.transformGizmoDragState) {
        this.finishTransformGizmoDrag(e, dom);
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
      this.markSceneDirty?.(18);
      if (!this.isActive || !this.avatarMode || this.simulatorFocusedDeviceId) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey && (this.carriedObjects?.length > 0 || this.navTool === 'move')) {
        const step = e.deltaY < 0 ? 0.25 : -0.25;
        this.adjustAvatarTargetOrCarriedElevation(step);
        return;
      }
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
        this.markSceneDirty?.(8);
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
    this.apply3dViewFilters();
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
    this.roadBuildState = null;
    this.clearGroup(this.roadPreviewGroup);
    if (this.carriedObjects?.length > 0) {
      this.dropCarriedObjectsFromAvatar?.({ dropAll: true, silent: true });
    }
    this.avatarMode = false;
    this.avatarState._lastMouseClient = null;
    this.avatarState.isCarrying = false;
    this.transformGizmoDragState = null;
    if (this.transformGizmoGroup) this.transformGizmoGroup.visible = false;
    if (this.avatarGroup) this.avatarGroup.visible = false;
    if (this.fppViewmodelGroup) this.fppViewmodelGroup.visible = false;
    authManager.updateLocalPresence({ viewMode: '2d', avatarMode: false, isMoving: false, isRunning: false, isCarrying: false });
    this.releaseAvatarPointerLock();
    this.syncAvatarCrosshair();
    this.syncAvatarControlsUI();
    this.syncMobileRobloxControlsVisibility?.();
    this.renderRoad3dHudBar?.();
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
    this.markSceneDirty?.(30);
    const animate = (now) => {
      if (!this.isActive) return;
      this.animFrameId = requestAnimationFrame(animate);
      if (this.isPausedByModal) {
        this.lastFrameTime = now;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - (this.lastFrameTime || now)) / 1000));
      this.lastFrameTime = now;

      const hadCamAnim = Boolean(this.cameraAnim);
      this.updateCameraAnimation(now);
      let avatarMoved = false;
      if (this.avatarMode) {
        this.updateAvatarController(dt);
        avatarMoved = Boolean(
          this.avatarState?.isMoving
          || !this.avatarState?.isGrounded
          || this.keysPressed?.size > 0
          || this.mobileJoystickState?.active
        );
      } else {
        this.updateWalkMovement(dt);
        if (this.keysPressed?.size > 0) avatarMoved = true;
        this.publishLocalPresence(false);
      }
      if (this.remoteAvatarMap.size > 0) {
        this.updateRemoteAvatars(dt);
      }
      const doorMoved = this.updateInteractiveDoors?.(dt);
      if (this.activeCablePull) {
        this.updateAvatarCablePullLivePreview?.(dt);
      }
      const hasPackets = Array.isArray(this.activePacketFlows) && this.activePacketFlows.length > 0;
      if (hasPackets) {
        this.updatePacketFlows3D?.(now);
      }

      let controlsMoved = false;
      if (this.avatarMode && !this.simulatorFocusedDeviceId) {
        if (this.camera && this.controls) {
          this.camera.lookAt?.(this.controls.target);
        }
      } else if (this.controls) {
        controlsMoved = Boolean(this.controls.update());
      }

      let cameraMoved = false;
      if (this.camera?.position && this.camera?.quaternion) {
        const posDeltaSq = this._lastFrameCamPos.distanceToSquared(this.camera.position);
        const rotDelta = typeof this._lastFrameCamQuat.angleTo === 'function'
          ? this._lastFrameCamQuat.angleTo(this.camera.quaternion)
          : 0;
        if (posDeltaSq > 1e-6 || rotDelta > 1e-4) {
          cameraMoved = true;
          this._lastFrameCamPos.copy(this.camera.position);
          this._lastFrameCamQuat.copy(this.camera.quaternion);
        }
      }

      const hasActivity = Boolean(
        hadCamAnim
        || cameraMoved
        || controlsMoved
        || avatarMoved
        || doorMoved
        || hasPackets
        || this.activeCablePull
        || this.remoteAvatarMap.size > 0
        || (this._dirtyFramesRemaining || 0) > 0
      );

      if (!hasActivity) {
        if (this.renderPerfStats) {
          this.renderPerfStats.idleSkippedFrames = (this.renderPerfStats.idleSkippedFrames || 0) + 1;
        }
        return;
      }

      if (this._dirtyFramesRemaining > 0) {
        this._dirtyFramesRemaining -= 1;
      }

      if (cameraMoved || avatarMoved || this._dirtyFramesRemaining > 10) {
        this.updateBuildingSignboardsFrame?.();
        this.updateSceneLOD?.(false);
        this.updateSceneOcclusionCulling?.(false);
      }

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
    this.syncBuildingSignboards?.();
    this.markSceneDirty?.(8);
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
      this.apply3dViewFilters?.();
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
        this.apply3dViewFilters?.();
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
    this.apply3dViewFilters?.();
    this.updateSceneLOD?.(true);
    this.requestShadowUpdate?.();
  }

  syncAll() {
    if (!this.isActive || !this.isInitialized) return;
    this.syncRoads();
    this.syncRooms();
    this.syncObjects3d();
    this.syncDevices();
    this.syncCables();
    this.apply3dViewFilters?.();
    this.updateSceneLOD?.(true);
    this.updateSceneOcclusionCulling?.(true);
    this.requestShadowUpdate?.();
  }

  _attachRoomFallbackMesh(room, roomGroup) {
    if (!roomGroup || roomGroup.userData?.hasFallbackRoomMesh) return;
    const { minW, minD, minH } = getRoomMinDimensions(room);
    const w = Math.max(minW, Number(room.widthMeters) || 14);
    const d = Math.max(minD, Number(room.depthMeters) || 12);
    const h = Math.max(minH, Number(room.heightMeters) || 4);
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
    this._registerRoomInteractiveDoors(room, roomGroup, glb);
    if (this.buildingXrayMode || this.perRoomXrayIds?.has?.(room.id)) {
      this.applyBuildingXrayMaterials?.();
    }
    this.requestShadowUpdate?.();
  }

  _registerRoomInteractiveDoors(room, roomGroup, glb) {
    if (!room?.id || !roomGroup || !glb) return;
    if (!this.doorStatesByKey) this.doorStatesByKey = new Map();
    if (!this.activeDoorRigs) this.activeDoorRigs = new Map();

    // Remove stale door rigs belonging to this room before re-registering
    const prefix = `${room.id}::`;
    for (const k of Array.from(this.activeDoorRigs.keys())) {
      if (k.startsWith(prefix)) this.activeDoorRigs.delete(k);
    }

    const openDoorIndices = new Set();
    const roomDoorRigs = [];

    glb.traverse((node) => {
      if (!node?.userData?.isInteractiveDoorPivot || !node.userData?.doorMeta) return;
      const meta = node.userData.doorMeta;
      const doorKey = `${room.id}::${meta.doorIdx}`;
      const isOpen = this.doorStatesByKey.has(doorKey)
        ? Boolean(this.doorStatesByKey.get(doorKey))
        : Boolean(meta.initialOpen);

      const rig = {
        key: doorKey,
        roomId: room.id,
        roomName: room.name || 'Ruangan',
        doorIdx: meta.doorIdx,
        pairKey: meta.pairIdx >= 0 ? `${room.id}::${meta.pairIdx}` : null,
        doorType: meta.doorType || 'swing',
        slideAxis: meta.slideAxis || 'x',
        closedAngle: Number(meta.closedAngle) || 0,
        openAngle: Number(meta.openAngle) || 0,
        labelKind: meta.labelKind || 'Pintu',
        localCenterOffset: meta.localCenterOffset || { x: 0, y: 1.0, z: 0 },
        pivotGroup: node,
        roomGroup,
        isOpen,
        openProgress: isOpen ? 1 : 0,
        targetProgress: isOpen ? 1 : 0
      };

      node.userData.interactiveDoorKey = doorKey;
      node.traverse((ch) => {
        ch.userData.interactiveDoorKey = doorKey;
        ch.userData.roomId = room.id;
      });

      this._applyDoorRigPose(rig);
      if (isOpen) openDoorIndices.add(meta.doorIdx);
      this.activeDoorRigs.set(doorKey, rig);
      roomDoorRigs.push(rig);
    });

    roomGroup.userData.doorRigs = roomDoorRigs;
    roomGroup.userData.openDoorIndices = openDoorIndices;
  }

  _applyDoorRigPose(rig) {
    if (!rig?.pivotGroup) return;
    const t = clamp(Number(rig.openProgress) || 0, 0, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    if (rig.doorType === 'shutter') {
      rig.pivotGroup.scale.y = Math.max(0.1, 1 - ease * 0.88);
    } else if (rig.doorType === 'slide') {
      if (rig.slideAxis === 'z') {
        rig.pivotGroup.scale.z = Math.max(0.14, 1 - ease * 0.84);
      } else {
        rig.pivotGroup.scale.x = Math.max(0.14, 1 - ease * 0.84);
      }
    } else {
      rig.pivotGroup.rotation.y = rig.closedAngle + (rig.openAngle - rig.closedAngle) * ease;
    }
  }

  toggleInteractiveDoor(doorKey, { forceOpen = null, silent = false } = {}) {
    const rig = this.activeDoorRigs?.get(doorKey);
    if (!rig) return false;
    const nextOpen = forceOpen !== null ? Boolean(forceOpen) : !rig.isOpen;
    const targets = [rig];
    if (rig.pairKey && this.activeDoorRigs.has(rig.pairKey)) {
      const twin = this.activeDoorRigs.get(rig.pairKey);
      if (twin && twin !== rig) targets.push(twin);
    }

    for (const r of targets) {
      r.isOpen = nextOpen;
      r.targetProgress = nextOpen ? 1 : 0;
      this.doorStatesByKey.set(r.key, nextOpen);
      const openSet = r.roomGroup?.userData?.openDoorIndices;
      if (openSet) {
        if (nextOpen) openSet.add(r.doorIdx);
        else openSet.delete(r.doorIdx);
      }
    }

    this.renderHouseFlipperPromptHud?.();
    if (!silent) {
      this.showStatusHint(`${nextOpen ? 'Membuka' : 'Menutup'} ${rig.labelKind} ${rig.roomName}`);
    }
    return nextOpen;
  }

  setAllInteractiveDoorsOpen(open = true) {
    if (!this.activeDoorRigs || this.activeDoorRigs.size === 0) return 0;
    let count = 0;
    const visited = new Set();
    for (const [key, rig] of this.activeDoorRigs.entries()) {
      if (visited.has(key)) continue;
      visited.add(key);
      if (rig.pairKey) visited.add(rig.pairKey);
      this.toggleInteractiveDoor(key, { forceOpen: Boolean(open), silent: true });
      count++;
    }
    this.showStatusHint(
      open
        ? `Semua pintu ruangan dibuka (${count} pintu).`
        : `Semua pintu ruangan ditutup (${count} pintu).`
    );
    return count;
  }

  _getDoorRigWorldCenter(rig, outVec = new THREE.Vector3()) {
    if (!rig?.pivotGroup) return outVec.set(0, 0, 0);
    const off = rig.localCenterOffset || { x: 0, y: 1.0, z: 0 };
    outVec.set(Number(off.x) || 0, Number(off.y) || 1.0, Number(off.z) || 0);
    if (typeof rig.pivotGroup.localToWorld === 'function') {
      rig.pivotGroup.updateWorldMatrix?.(true, false);
      return rig.pivotGroup.localToWorld(outVec);
    }
    return rig.pivotGroup.getWorldPosition(outVec);
  }

  updateInteractiveDoors(dt = 0.016) {
    if (!this.activeDoorRigs || this.activeDoorRigs.size === 0) return false;
    const step = Math.min(0.25, Math.max(0.004, Number(dt) || 0.016)) * 4.8;
    const isCarryingInAvatar = Boolean(
      this.avatarMode
      && !this.simulatorFocusedDeviceId
      && ((Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) || Boolean(this.activeCablePull))
    );
    const avX = Number(this.avatarState?.x) || 0;
    const avY = Number(this.avatarState?.y) || 0;
    const avZ = Number(this.avatarState?.z) || 0;
    const doorWorldPos = isCarryingInAvatar ? (this._doorScratchVec || (this._doorScratchVec = new THREE.Vector3())) : null;
    let doorMoved = false;

    for (const rig of this.activeDoorRigs.values()) {
      if (!rig?.pivotGroup) continue;
      const diff = rig.targetProgress - rig.openProgress;
      if (Math.abs(diff) > 0.0005) {
        if (Math.abs(diff) <= step) {
          rig.openProgress = rig.targetProgress;
        } else {
          rig.openProgress += Math.sign(diff) * step;
        }
        this._applyDoorRigPose(rig);
        doorMoved = true;
      }

      // Smart auto-open when carrying network devices up to a closed doorway
      if (isCarryingInAvatar && !rig.isOpen && doorWorldPos) {
        this._getDoorRigWorldCenter(rig, doorWorldPos);
        const dy = Math.abs((doorWorldPos.y - 1.0) - avY);
        if (dy <= 1.8) {
          const distXZ = Math.hypot(doorWorldPos.x - avX, doorWorldPos.z - avZ);
          if (distXZ <= 2.25) {
            this.toggleInteractiveDoor(rig.key, { forceOpen: true, silent: true });
            doorMoved = true;
          }
        }
      }
    }
    if (doorMoved) {
      this.requestShadowUpdate?.();
    }
    return doorMoved;
  }

  findInteractiveDoorHit(raycaster = this.raycaster, maxDist = Infinity) {
    if (!raycaster || !this.roomsGroup || !this.roomsGroup.visible || this.roomsGroup.children.length === 0) {
      return null;
    }
    const hits = this._filterVisibleRayHits(raycaster.intersectObjects(this.roomsGroup.children, true));
    if (!hits || hits.length === 0) return null;
    const firstDist = hits[0].distance;
    if (!Number.isFinite(firstDist) || firstDist > maxDist) return null;

    // Allow a small 0.18m tolerance past the first room hit so thin door frames/mullions
    // right beside the leaf never block clicking or aiming through glass doors.
    const maxOcclusionDist = Math.min(maxDist, firstDist + 0.18);
    for (const h of hits) {
      if (!Number.isFinite(h.distance) || h.distance > maxOcclusionDist) break;
      let curr = h.object;
      while (curr && curr !== this.roomsGroup) {
        const key = curr.userData?.interactiveDoorKey;
        if (key && this.activeDoorRigs?.has(key)) {
          return {
            doorKey: key,
            rig: this.activeDoorRigs.get(key),
            distance: h.distance,
            point: h.point.clone()
          };
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  findTargetInteractiveDoorForAvatar() {
    if (!this.avatarMode || !this.activeDoorRigs || this.activeDoorRigs.size === 0) return null;

    // 1) Crosshair direct 3D raycast to any door (inside or outside) within 5.4m
    if (this.camera && this.raycaster && (this.camera.isPerspectiveCamera || this.camera.isOrthographicCamera)) {
      try {
        this.camera.updateMatrixWorld?.();
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
        const aimed = this.findInteractiveDoorHit(this.raycaster, 5.4);
        if (aimed?.rig) {
          return { ...aimed, fromAim: true };
        }
      } catch { /* ignore mock camera */ }
    }

    // 2) Proximity fallback to center of doorway within 3.4m horizontally & same floor level
    const ax = Number(this.avatarState?.x) || 0;
    const ay = Number(this.avatarState?.y) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const yaw = Number(this.avatarState?.yaw) || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const wPos = this._doorScratchVec || (this._doorScratchVec = new THREE.Vector3());
    let best = null;

    for (const rig of this.activeDoorRigs.values()) {
      if (!rig?.pivotGroup || rig.roomGroup?.visible === false) continue;
      this._getDoorRigWorldCenter(rig, wPos);
      if (Math.abs((wPos.y - 1.0) - ay) > 1.8) continue;
      const dx = wPos.x - ax;
      const dz = wPos.z - az;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.4) continue;
      const dot = dist > 0.01 ? (dx * fwdX + dz * fwdZ) / dist : 1;
      const score = dist - (dot > 0.35 ? 0.65 : 0);
      if (!best || score < best.score) {
        best = { doorKey: rig.key, rig, distance: dist, score, fromAim: false };
      }
    }
    return best;
  }

  interactOrPickupFromAvatar() {
    if (!this.avatarMode) return false;
    const isDrawingCable = Boolean(
      this.activeCablePull
      || this.pendingCableSourceId
      || stateManager.getMode?.() === 'draw-cable'
    );
    if (isDrawingCable) {
      return false;
    }
    const nearestPick = this.findNearestPickableObjectToAvatar?.();
    // Priority 1: Explicitly selected device/object always wins
    if (nearestPick?.source === 'selected') {
      return this.pickupNearestObjectFromAvatar();
    }
    const doorTarget = this.findTargetInteractiveDoorForAvatar?.();
    // Priority 2: Direct crosshair aim on a door closer than any aimed device
    if (doorTarget?.fromAim && (!nearestPick || nearestPick.source !== 'aim' || doorTarget.distance <= (nearestPick.distance ?? Infinity))) {
      this.toggleInteractiveDoor(doorTarget.doorKey);
      return true;
    }
    // Priority 3: Direct crosshair aim on a device/object
    if (nearestPick?.source === 'aim') {
      return this.pickupNearestObjectFromAvatar();
    }
    // Priority 4: Standing right beside a door
    if (doorTarget?.doorKey) {
      this.toggleInteractiveDoor(doorTarget.doorKey);
      return true;
    }
    // Priority 5: Nearest pickable device/object fallback
    return this.pickupNearestObjectFromAvatar();
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
          `Model GLB "${room.name || 'Ruangan 3D'}" gagal dimuat — menampilkan bentuk fallback.`
        );
      });
  }

  isRoomLocked(roomOrId) {
    if (this.roomsLocked) return true;
    const room = typeof roomOrId === 'string'
      ? stateManager.getRoom3dById?.(roomOrId)
      : roomOrId;
    return Boolean(room?.locked);
  }

  isObject3dLocked(objOrId) {
    if (this.roomsLocked) return true;
    const obj = typeof objOrId === 'string'
      ? stateManager.getObject3dById?.(objOrId)
      : objOrId;
    return Boolean(obj?.locked);
  }

  bindRoomLockButton() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btn-3d-lock-rooms');
    if (!btn || btn.dataset?.roomLockBound === '1') return;
    if (btn.dataset) btn.dataset.roomLockBound = '1';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      this.toggleRoomsLocked();
    });
  }

  setRoomsLocked(locked, { silent = false } = {}) {
    this.roomsLocked = Boolean(locked);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('netmap_rooms3d_locked_v1', this.roomsLocked ? '1' : '0');
      }
    } catch { /* ignore */ }
    if (this.roomsLocked) {
      if (stateManager.getSelectedRoom3dId?.()) {
        stateManager.deselectRoom3d?.();
      }
      if (stateManager.getSelectedObject3dId?.()) {
        stateManager.deselectObject3d?.();
      }
    }
    this.syncRoomLockUI();
    if (this.isActive && this.isInitialized) {
      this.syncRooms();
      this.syncObjects3d();
    }
    eventBus.emit('rooms3d:lock-changed', { locked: this.roomsLocked });
    if (!silent) {
      this.showStatusHint(
        this.roomsLocked
          ? 'Semua Ruangan & Struktur 3D dikunci — aman menggeser perangkat tanpa menggeser ruangan.'
          : 'Kunci Ruangan 3D dibuka — ruangan dapat dipilih & digeser kembali.'
      );
    }
    return this.roomsLocked;
  }

  toggleRoomsLocked(options = {}) {
    return this.setRoomsLocked(!this.roomsLocked, options);
  }

  toggleSingleRoomLock(roomId, { silent = false } = {}) {
    const room = stateManager.getRoom3dById?.(roomId);
    if (!room) return false;
    const nextLocked = !room.locked;
    stateManager.updateRoom3d?.(room.id, { locked: nextLocked });
    if (nextLocked && stateManager.getSelectedRoom3dId?.() === room.id) {
      stateManager.deselectRoom3d?.();
    }
    eventBus.emit('rooms3d:lock-changed', { roomId: room.id, roomLocked: nextLocked, locked: this.roomsLocked });
    if (!silent) {
      this.showStatusHint(
        nextLocked
          ? `Ruangan "${room.name}" dikunci agar tidak bergeser.`
          : `Kunci ruangan "${room.name}" dibuka.`
      );
    }
    return nextLocked;
  }

  syncRoomLockUI() {
    if (typeof document === 'undefined') return;
    this.bindRoomLockButton();
    const btn = document.getElementById('btn-3d-lock-rooms');
    if (!btn) return;
    const locked = Boolean(this.roomsLocked);
    btn.classList?.toggle('active', locked);
    btn.setAttribute?.('aria-pressed', String(locked));
    if (btn.style) {
      btn.style.backgroundColor = locked ? '#d97706' : '';
      btn.style.borderColor = locked ? '#b45309' : '';
      btn.style.color = locked ? '#ffffff' : '';
    }
    btn.innerHTML = locked
      ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><span>Ruangan Terkunci</span>`
      : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg><span>Kunci Ruangan</span>`;
  }

  _annotateRoomLodBounds(roomGroup, room) {
    if (!roomGroup || !room) return;
    const w = Math.max(0.5, Number(room.widthMeters) || 14);
    const d = Math.max(0.5, Number(room.depthMeters) || 12);
    const h = Math.max(0.5, Number(room.heightMeters) || 3.5);
    const pos = roomGroup.position || this.normToWorld(room.x ?? 0.5, room.y ?? 0.5);
    roomGroup.userData.isDecorationProp = isDecorationRoom(room);
    roomGroup.userData.propMaxHeight = h;
    roomGroup.userData.lodCenter = {
      x: Number(pos.x) || 0,
      y: h * 0.5,
      z: Number(pos.z) || 0
    };
    roomGroup.userData.lodRadius = Math.max(1.5, Math.hypot(w, d, h) * 0.62);
  }

  syncRooms() {
    this._spatialGridDirty = true;
    this._bvhDirty = true;
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.roomsGroup);
    this.room3dMeshMap.clear();
    this.activeDoorRigs?.clear?.();

    const rooms = stateManager.getRooms3d();
    const selectedRoomId = stateManager.getSelectedRoom3dId?.() || null;
    rooms.forEach((room) => {
      const isRoomSelected = room.id === selectedRoomId && !this.isRoomLocked(room);
      const roomGroup = create3DRoomGroup(
        room,
        (nx, ny) => this.normToWorld(nx, ny),
        isRoomSelected
      );
      roomGroup.userData.roomId = room.id;
      this._annotateRoomLodBounds(roomGroup, room);
      this.roomsGroup.add(roomGroup);
      this.room3dMeshMap.set(room.id, roomGroup);
      this._attachRoomCustomGlb(room, roomGroup);
    });
    this.applyBuildingXrayMaterials?.();
    this.syncBuildingSignboards?.();
    this.apply3dViewFilters?.();
    this.updateSceneLOD?.(true);
    this.updateSceneOcclusionCulling?.(true);
    this.requestShadowUpdate?.();
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
    this._annotateRoomLodBounds(next, room);
    this.roomsGroup.add(next);
    this.room3dMeshMap.set(room.id, next);

    if (reusedGlb) {
      this._mountRoomGlbIntoGroup(next, reusedGlb, room);
    } else {
      this._attachRoomCustomGlb(room, next);
    }
    this.applyBuildingXrayMaterials?.();
    this.syncBuildingSignboards?.();
    this.apply3dViewFilters?.();
    this.requestShadowUpdate?.();
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
    this._spatialGridDirty = true;
    this._bvhDirty = true;
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.objects3dGroup);
    this.object3dMeshMap.clear();

    const objects = stateManager.getObjects3d();
    const selectedId = stateManager.getSelectedObject3dId();
    objects.forEach((obj) => {
      const meshGroup = createCustomObject3DGroup(
        obj,
        (nx, ny) => this.normToWorld(nx, ny),
        obj.id === selectedId && !this.isObject3dLocked(obj)
      );
      this.objects3dGroup.add(meshGroup);
      this.object3dMeshMap.set(obj.id, meshGroup);
    });
    if (this.avatarMode && this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }
    this.updateAvatarDeviceLabelsVisibility?.();
    this.syncTransformGizmo?.();
    this.apply3dViewFilters?.();
    this.requestShadowUpdate?.();
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
    this.apply3dViewFilters?.();
    this.requestShadowUpdate?.();
    return next;
  }

  _annotateRoadCenter(meshGroup, road) {
    if (!meshGroup || !Array.isArray(road?.points) || road.points.length === 0) return;
    const midPt = road.points[Math.floor(road.points.length * 0.5)] || road.points[0];
    const wPos = this.normToWorld(midPt.x ?? 0.5, midPt.y ?? 0.5);
    meshGroup.userData.roadCenterWorld = {
      x: wPos.x,
      y: Math.max(0, Number(road.elevationMeters) || 0),
      z: wPos.z
    };
  }

  syncRoads() {
    if (!this.isActive || !this.isInitialized) return;
    this.clearGroup(this.roadsGroup);
    this.road3dMeshMap.clear();

    const roads = stateManager.getRoads3d?.() || [];
    const selectedId = stateManager.getSelectedRoad3dId?.() || null;
    roads.forEach((road) => {
      if (!road || road.visible === false || !Array.isArray(road.points) || road.points.length < 2) return;
      const meshGroup = create3DRoadGroup(
        road,
        (nx, ny) => this.normToWorld(nx, ny),
        road.id === selectedId
      );
      this._annotateRoadCenter(meshGroup, road);
      this.roadsGroup.add(meshGroup);
      this.road3dMeshMap.set(road.id, meshGroup);
    });
    this.renderRoad3dHudBar?.();
    this.apply3dViewFilters?.();
    this.updateSceneLOD?.(true);
    this.requestShadowUpdate?.();
  }

  rebuildSingleRoad3dMesh(road, isSelected = true) {
    if (!this.isInitialized || !road?.id) return null;
    const prev = this.road3dMeshMap.get(road.id);
    if (prev) {
      this.roadsGroup.remove(prev);
      this._disposeObject3DResources(prev);
    }
    const next = create3DRoadGroup(road, (nx, ny) => this.normToWorld(nx, ny), isSelected);
    this._annotateRoadCenter(next, road);
    this.roadsGroup.add(next);
    this.road3dMeshMap.set(road.id, next);
    this.apply3dViewFilters?.();
    this.requestShadowUpdate?.();
    return next;
  }

  _snapRoadWorldPoint(wx, wz, { excludeRoadId = null, excludeNodeIdx = -1, anchorWorld = null, shiftKey = false } = {}) {
    let x = Number(wx) || 0;
    let z = Number(wz) || 0;
    let nodeSnapped = false;

    // 1. Snap to any nearby existing road vertex within 1.25m for clean intersections/branches
    const roads = stateManager.getRoads3d?.() || [];
    let bestDist = 1.25;
    let bestPt = null;
    roads.forEach((r) => {
      const pts = Array.isArray(r?.points) ? r.points : [];
      pts.forEach((pt, idx) => {
        if (r.id === excludeRoadId && idx === excludeNodeIdx) return;
        const w = this.normToWorld(pt.x, pt.y);
        const d = Math.hypot(w.x - x, w.z - z);
        if (d < bestDist) {
          bestDist = d;
          bestPt = w;
        }
      });
    });
    if (bestPt) {
      return { x: bestPt.x, z: bestPt.z, nodeSnapped: true };
    }

    // 2. Angle Snap relative to anchor segment when Shift held or Build Mode angle snap active
    const angleStepDeg = shiftKey
      ? 15
      : (this.buildPlacementConfig?.buildModeEnabled && (Number(this.buildPlacementConfig?.angleSnapDeg) || 0) > 0
        ? Number(this.buildPlacementConfig.angleSnapDeg)
        : 0);
    if (anchorWorld && angleStepDeg > 0) {
      const dx = x - anchorWorld.x;
      const dz = z - anchorWorld.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.2) {
        const stepRad = (angleStepDeg * Math.PI) / 180;
        const snappedRad = Math.round(Math.atan2(dz, dx) / stepRad) * stepRad;
        x = anchorWorld.x + Math.cos(snappedRad) * dist;
        z = anchorWorld.z + Math.sin(snappedRad) * dist;
      }
    }

    // 3. Optional Grid Snap
    if (this.applyBuildGridSnapWorld) {
      const g = this.applyBuildGridSnapWorld(x, z);
      x = g.x;
      z = g.z;
    }

    return { x, z, nodeSnapped };
  }

  _resolveRoadGroundWorldFromEvent(e) {
    if (!this.camera || !this.renderer?.domElement) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(floorPlane, hitPt)) {
      return { x: hitPt.x, z: hitPt.z };
    }
    const groundHits = this.raycaster.intersectObjects(this.groundGroup?.children || [], true);
    if (groundHits.length > 0) {
      return { x: groundHits[0].point.x, z: groundHits[0].point.z };
    }
    return null;
  }

  syncRoadBuildPreview() {
    if (!this.roadPreviewGroup) return;
    this.clearGroup(this.roadPreviewGroup);
    if (!this.isActive || this.navTool !== 'road3d' || !this.roadBuildState) return;
    const { points, cursorPoint } = this.roadBuildState;
    if (!Array.isArray(points) || points.length === 0) return;

    const previewPts = cursorPoint ? [...points, cursorPoint] : [...points];
    const preset = ROAD3D_PRESETS[this.activeRoad3dConfig?.style] || ROAD3D_PRESETS['stepping-slab'];

    if (previewPts.length >= 2) {
      const previewRoad = {
        id: '__road3d_preview__',
        ...preset,
        ...(this.activeRoad3dConfig || {}),
        points: previewPts
      };
      const prevMesh = create3DRoadGroup(previewRoad, (nx, ny) => this.normToWorld(nx, ny), false, { isPreview: true });
      this.roadPreviewGroup.add(prevMesh);
    }

    // Show cyan anchor pin at active last point & cursor point
    const pinGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.35, 14);
    const lastPt = points[points.length - 1];
    const lastW = this.normToWorld(lastPt.x, lastPt.y);
    const startPin = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    startPin.position.set(lastW.x, 0.25, lastW.z);
    this.roadPreviewGroup.add(startPin);
    if (cursorPoint) {
      const curW = this.normToWorld(cursorPoint.x, cursorPoint.y);
      const endPin = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      endPin.position.set(curW.x, 0.25, curW.z);
      this.roadPreviewGroup.add(endPin);
    }
  }

  updateRoad3dBuildHover(e) {
    if (!this.roadBuildState || !Array.isArray(this.roadBuildState.points) || this.roadBuildState.points.length === 0) return;
    const raw = this._resolveRoadGroundWorldFromEvent(e);
    if (!raw) return;
    const lastPt = this.roadBuildState.points[this.roadBuildState.points.length - 1];
    const anchorWorld = this.normToWorld(lastPt.x, lastPt.y);
    const snapped = this._snapRoadWorldPoint(raw.x, raw.z, {
      anchorWorld,
      shiftKey: Boolean(e.shiftKey)
    });
    const { normX, normY } = this.worldToNorm(snapped.x, snapped.z);
    this.roadBuildState.cursorPoint = { x: Number(normX.toFixed(5)), y: Number(normY.toFixed(5)) };
    this.syncRoadBuildPreview();

    const segLen = Math.hypot(snapped.x - anchorWorld.x, snapped.z - anchorWorld.z);
    const deg = ((Math.round((Math.atan2(snapped.x - anchorWorld.x, snapped.z - anchorWorld.z) * 180) / Math.PI) % 360) + 360) % 360;
    this.showStatusHint(
      `Jalan 3D: ${segLen.toFixed(1)}m (${deg}°) — Klik untuk sambung belokan • Klik kanan / Enter untuk selesai • Shift = kunci sudut 15°${snapped.nodeSnapped ? ' • Simpul Tertaut' : ''}`
    );
  }

  handleRoad3dBuildClick(e, explicitWorld = null) {
    if (
      authManager?.isAuthenticated?.()
      && authManager.getActiveWorkspaceKey?.() === 'main'
      && authManager.isMainWorkspaceUnlocked?.() === false
    ) {
      this.showStatusHint('Server Utama terkunci (hanya lihat). Buka kunci terlebih dahulu untuk membangun jalan.');
      return null;
    }

    const raw = explicitWorld || this._resolveRoadGroundWorldFromEvent(e);
    if (!raw) return null;

    const anchorNorm = this.roadBuildState?.points?.length > 0
      ? this.roadBuildState.points[this.roadBuildState.points.length - 1]
      : null;
    const anchorWorld = anchorNorm ? this.normToWorld(anchorNorm.x, anchorNorm.y) : null;
    const snapped = this._snapRoadWorldPoint(raw.x, raw.z, {
      anchorWorld,
      shiftKey: Boolean(e?.shiftKey)
    });
    const { normX, normY } = this.worldToNorm(snapped.x, snapped.z);
    const ptNorm = { x: Number(normX.toFixed(5)), y: Number(normY.toFixed(5)) };

    if (!this.roadBuildState) {
      this.roadBuildState = {
        roadId: null,
        points: [ptNorm],
        cursorPoint: ptNorm
      };
      this.syncRoadBuildPreview();
      this.renderRoad3dHudBar?.();
      this.showStatusHint('Titik awal Jalan 3D diletakkan — Klik titik berikutnya untuk membangun & belokkan jalur (Klik kanan / Enter = selesai).');
      return { started: true, point: ptNorm };
    }

    if (anchorWorld && Math.hypot(snapped.x - anchorWorld.x, snapped.z - anchorWorld.z) < 0.25) {
      this.showStatusHint('Titik terlalu dekat dengan titik sebelumnya — geser kursor sedikit lebih jauh.');
      return null;
    }

    const nextPoints = [...this.roadBuildState.points, ptNorm];
    this.roadBuildState.points = nextPoints;
    this.roadBuildState.cursorPoint = ptNorm;

    if (!this.roadBuildState.roadId) {
      const preset = ROAD3D_PRESETS[this.activeRoad3dConfig?.style] || ROAD3D_PRESETS['stepping-slab'];
      const count = (stateManager.getRoads3d?.()?.length || 0) + 1;
      const newRoad = stateManager.addRoad3d?.({
        id: generateId('road3d'),
        name: `${preset.name} #${count}`,
        ...preset,
        ...(this.activeRoad3dConfig || {}),
        points: nextPoints
      });
      this.roadBuildState.roadId = newRoad?.id || null;
      this.showStatusHint(`Segmen jalan #${count} dibangun (${nextPoints.length} titik) — Klik lagi untuk belokkan, atau Klik Kanan / Enter untuk selesai.`);
    } else {
      stateManager.updateRoad3d?.(this.roadBuildState.roadId, { points: nextPoints });
      this.showStatusHint(`Jalan diperpanjang (${nextPoints.length} titik) — Klik lanjut belok, Backspace undo titik, Klik Kanan / Enter selesai.`);
    }

    this.syncRoadBuildPreview();
    this.renderRoad3dHudBar?.();
    return { roadId: this.roadBuildState.roadId, points: nextPoints };
  }

  undoLastRoadBuildPoint() {
    if (!this.roadBuildState || !Array.isArray(this.roadBuildState.points)) return false;
    if (this.roadBuildState.points.length <= 1) {
      if (this.roadBuildState.roadId) {
        stateManager.deleteRoad3d?.(this.roadBuildState.roadId);
      }
      this.roadBuildState = null;
      this.clearGroup(this.roadPreviewGroup);
      this.renderRoad3dHudBar?.();
      this.showStatusHint('↶ Pembangunan jalan dibatalkan.');
      return true;
    }

    const nextPts = this.roadBuildState.points.slice(0, -1);
    this.roadBuildState.points = nextPts;
    this.roadBuildState.cursorPoint = nextPts[nextPts.length - 1];
    if (this.roadBuildState.roadId) {
      if (nextPts.length < 2) {
        stateManager.deleteRoad3d?.(this.roadBuildState.roadId);
        this.roadBuildState.roadId = null;
      } else {
        stateManager.updateRoad3d?.(this.roadBuildState.roadId, { points: nextPts });
      }
    }
    this.syncRoadBuildPreview();
    this.renderRoad3dHudBar?.();
    this.showStatusHint(`↶ 1 titik dikurangi (sisa ${nextPts.length} titik).`);
    return true;
  }

  finishActiveRoadBuild({ silent = false } = {}) {
    const hadBuild = Boolean(this.roadBuildState);
    const finishedId = this.roadBuildState?.roadId || null;
    this.roadBuildState = null;
    this.clearGroup(this.roadPreviewGroup);
    if (finishedId) {
      stateManager.selectRoad3d?.(finishedId);
    }
    this.renderRoad3dHudBar?.();
    if (!silent && hadBuild) {
      this.showStatusHint('Pembangunan jalur jalan selesai — Seret titik kuning untuk menggeser sudut belokan, atau klik tanah untuk membuat jalur baru.');
    }
    return hadBuild;
  }

  startRoad3dGizmoDrag(e, dom, gizmoHit) {
    const road = stateManager.getRoad3dById?.(gizmoHit?.roadId);
    if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
    if (this.controls) {
      this.controls.enabled = false;
      this._temporarilyDisabledControlsForBox = true;
    }
    stateManager.selectRoad3d?.(road.id);
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();
    stateManager.deselectObject3d?.();
    stateManager.deselectRoom3d?.();

    const elev = Math.max(0, Number(road.elevationMeters) || 0);
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev);

    if (gizmoHit.gizmoType === 'road-insert-node' && gizmoHit.insertAfterIndex >= 0) {
      const pts = road.points.map((p) => ({ ...p }));
      const a = pts[gizmoHit.insertAfterIndex];
      const b = pts[gizmoHit.insertAfterIndex + 1];
      if (!a || !b) return;
      const midPt = {
        x: Number((((a.x ?? 0.5) + (b.x ?? 0.5)) * 0.5).toFixed(5)),
        y: Number((((a.y ?? 0.5) + (b.y ?? 0.5)) * 0.5).toFixed(5))
      };
      const newIdx = gizmoHit.insertAfterIndex + 1;
      pts.splice(newIdx, 0, midPt);
      const updatedRoad = stateManager.updateRoad3d?.(road.id, { points: pts }) || { ...road, points: pts };
      this.object3dDragState = {
        kind: 'road-node',
        roadId: road.id,
        nodeIndex: newIdx,
        plane: dragPlane,
        anchorWorld: this.normToWorld(a.x, a.y),
        draftRoad: { ...updatedRoad },
        latestPoints: pts,
        moved: true
      };
      dom.setPointerCapture?.(e.pointerId);
      return;
    }

    if (gizmoHit.gizmoType === 'road-node' && gizmoHit.nodeIndex >= 0) {
      const prevIdx = gizmoHit.nodeIndex > 0 ? gizmoHit.nodeIndex - 1 : 1;
      const anchorPt = road.points[prevIdx] || road.points[0];
      this.object3dDragState = {
        kind: 'road-node',
        roadId: road.id,
        nodeIndex: gizmoHit.nodeIndex,
        plane: dragPlane,
        anchorWorld: this.normToWorld(anchorPt.x, anchorPt.y),
        draftRoad: { ...road },
        latestPoints: road.points.map((p) => ({ ...p })),
        moved: false
      };
      dom.setPointerCapture?.(e.pointerId);
      return;
    }

    // Whole road move ('road-move')
    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(dragPlane, hitPt)) return;
    const refWorld = this.normToWorld(road.points[0].x, road.points[0].y);
    this.object3dDragState = {
      kind: 'road-move',
      roadId: road.id,
      plane: dragPlane,
      startRefWorld: refWorld,
      startPoints: road.points.map((p) => ({ ...p })),
      grabOffsetX: refWorld.x - hitPt.x,
      grabOffsetZ: refWorld.z - hitPt.z,
      draftRoad: { ...road },
      latestPoints: road.points.map((p) => ({ ...p })),
      moved: false
    };
    dom.setPointerCapture?.(e.pointerId);
  }

  nudgeSelectedRoad3d(deltaWorldX = 0, deltaWorldZ = 0) {
    const selId = stateManager.getSelectedRoad3dId?.();
    if (!selId) return false;
    const road = stateManager.getRoad3dById?.(selId);
    if (!road || !Array.isArray(road.points) || road.points.length < 2) return false;
    const nextPts = road.points.map((pt) => {
      const w = this.normToWorld(pt.x, pt.y);
      const n = this.worldToNorm(w.x + deltaWorldX, w.z + deltaWorldZ);
      return { x: Number(n.normX.toFixed(5)), y: Number(n.normY.toFixed(5)) };
    });
    stateManager.updateRoad3d?.(road.id, { points: nextPts });
    this.showStatusHint(`"${road.name || 'Jalan 3D'}" digeser`);
    return true;
  }

  bindRoad3dHudControls() {
    if (typeof document === 'undefined' || this._roadHudBound) return;
    const bar = document.getElementById('hud-3d-road-bar');
    if (!bar) return;
    this._roadHudBound = true;
    bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    const applyPatch = (patch, rebuildStyleDefaults = false) => {
      this.activeRoad3dConfig = { ...this.activeRoad3dConfig, ...patch };
      const selId = stateManager.getSelectedRoad3dId?.();
      if (selId) {
        const cur = stateManager.getRoad3dById?.(selId);
        if (cur) {
          let fullPatch = { ...patch };
          if (rebuildStyleDefaults && patch.style && ROAD3D_PRESETS[patch.style]) {
            const p = ROAD3D_PRESETS[patch.style];
            fullPatch = {
              style: p.style,
              widthMeters: p.widthMeters,
              curbWidthMeters: p.curbWidthMeters,
              curbHeightMeters: p.curbHeightMeters,
              slabLengthMeters: p.slabLengthMeters,
              slabGapMeters: p.slabGapMeters,
              sideGutterMeters: p.sideGutterMeters,
              slabColor: p.slabColor,
              curbColor: p.curbColor,
              gravelColor: p.gravelColor
            };
            this.activeRoad3dConfig = { ...this.activeRoad3dConfig, ...fullPatch };
          }
          stateManager.updateRoad3d?.(selId, fullPatch);
        }
      }
      this.syncRoadBuildPreview();
      this.renderRoad3dHudBar();
    };

    bar.querySelector('#select-road3d-style')?.addEventListener('change', (ev) => {
      applyPatch({ style: ev.target.value }, true);
    });
    bar.querySelector('#select-road3d-path-mode')?.addEventListener('change', (ev) => {
      applyPatch({ pathMode: ev.target.value === 'straight' ? 'straight' : 'smooth' });
    });
    bar.querySelector('#input-road3d-width')?.addEventListener('change', (ev) => {
      applyPatch({ widthMeters: clamp(Number(ev.target.value) || 1.55, 0.6, 14) });
    });
    bar.querySelector('#input-road3d-slab-len')?.addEventListener('change', (ev) => {
      applyPatch({ slabLengthMeters: clamp(Number(ev.target.value) || 0.64, 0.2, 4.0) });
    });
    bar.querySelector('#input-road3d-slab-gap')?.addEventListener('change', (ev) => {
      applyPatch({ slabGapMeters: clamp(Number(ev.target.value) || 0.14, 0.01, 1.5) });
    });
    bar.querySelector('#select-road3d-list')?.addEventListener('change', (ev) => {
      const id = ev.target.value;
      if (id) {
        stateManager.selectRoad3d?.(id);
        const road = stateManager.getRoad3dById?.(id);
        if (road?.points?.[0] && this.controls && this.camera) {
          const w = this.normToWorld(road.points[0].x, road.points[0].y);
          this.animateCameraTo(new THREE.Vector3(w.x + 8, 9, w.z + 8), new THREE.Vector3(w.x, 0.2, w.z), 380);
        }
      } else {
        stateManager.deselectRoad3d?.();
      }
    });
    bar.querySelector('#btn-road3d-undo-pt')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.undoLastRoadBuildPoint();
    });
    bar.querySelector('#btn-road3d-finish-chain')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.finishActiveRoadBuild();
    });
    bar.querySelector('#btn-road3d-delete')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const selId = stateManager.getSelectedRoad3dId?.();
      if (selId) {
        if (this.roadBuildState?.roadId === selId) {
          this.roadBuildState = null;
          this.clearGroup(this.roadPreviewGroup);
        }
        stateManager.deleteRoad3d?.(selId);
        this.renderRoad3dHudBar();
      }
    });
    bar.querySelector('#btn-road3d-close')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.finishActiveRoadBuild({ silent: true });
      stateManager.deselectRoad3d?.();
      if (this.navTool === 'road3d') this.setNavTool('orbit');
      else this.renderRoad3dHudBar();
    });
  }

  renderRoad3dHudBar() {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('hud-3d-road-bar');
    if (!bar) return;
    this.bindRoad3dHudControls();

    const selId = stateManager.getSelectedRoad3dId?.();
    const selRoad = selId ? stateManager.getRoad3dById?.(selId) : null;
    const isVisible = Boolean(this.isActive && !this.avatarMode && (this.navTool === 'road3d' || selRoad));
    bar.classList.toggle('hidden', !isVisible);
    bar.style.display = isVisible ? 'flex' : 'none';
    if (!isVisible) return;

    const cfg = selRoad || this.activeRoad3dConfig || ROAD3D_PRESETS['stepping-slab'];
    const styleSel = bar.querySelector('#select-road3d-style');
    const modeSel = bar.querySelector('#select-road3d-path-mode');
    const widthInp = bar.querySelector('#input-road3d-width');
    const slabLenInp = bar.querySelector('#input-road3d-slab-len');
    const slabGapInp = bar.querySelector('#input-road3d-slab-gap');
    const roadListSel = bar.querySelector('#select-road3d-list');
    const btnUndo = bar.querySelector('#btn-road3d-undo-pt');
    const btnFinish = bar.querySelector('#btn-road3d-finish-chain');
    const btnDel = bar.querySelector('#btn-road3d-delete');

    if (styleSel) styleSel.value = cfg.style || 'stepping-slab';
    if (modeSel) modeSel.value = cfg.pathMode === 'straight' ? 'straight' : 'smooth';
    if (widthInp) widthInp.value = String(Number(cfg.widthMeters ?? 1.55).toFixed(2));
    if (slabLenInp) slabLenInp.value = String(Number(cfg.slabLengthMeters ?? 0.64).toFixed(2));
    if (slabGapInp) slabGapInp.value = String(Number(cfg.slabGapMeters ?? 0.14).toFixed(2));

    if (roadListSel) {
      const roads = stateManager.getRoads3d?.() || [];
      roadListSel.innerHTML = `<option value="">-- Jalan (${roads.length}) --</option>` + roads.map(
        (r) => `<option value="${this.escapeHudHtml(r.id)}" ${r.id === selId ? 'selected' : ''}>${this.escapeHudHtml(r.name || 'Jalan 3D')} (${r.points?.length || 0}ttk)</option>`
      ).join('');
    }
    if (btnUndo) btnUndo.disabled = !this.roadBuildState;
    if (btnFinish) btnFinish.disabled = !this.roadBuildState;
    if (btnDel) btnDel.disabled = !selRoad;
  }

  getDeviceCollisionFootprint(dev, userModelScale = 1) {
    const scale = Math.max(0.1, Number(userModelScale) || this.deviceScaleMultiplier || 1.0);
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
    this._spatialGridDirty = true;
    this._bvhDirty = true;
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
    } else if (this.avatarMode) {
      // Automatically separate identical co-located devices vertically into clean rack-like slots during Mode Teknisi
      const stackVisited = new Set();
      for (let i = 0; i < basePositions.length; i++) {
        if (stackVisited.has(i)) continue;
        const slotGroup = [i];
        stackVisited.add(i);
        for (let j = i + 1; j < basePositions.length; j++) {
          if (stackVisited.has(j)) continue;
          const dx = basePositions[j].baseX - basePositions[i].baseX;
          const dz = basePositions[j].baseZ - basePositions[i].baseZ;
          const de = Math.abs((basePositions[j].elev || 0) - (basePositions[i].elev || 0));
          if (Math.hypot(dx, dz) <= 0.85 && de < 0.08) {
            slotGroup.push(j);
            stackVisited.add(j);
          }
        }
        if (slotGroup.length > 1) {
          slotGroup.forEach((idx, k) => {
            explodeOffsets.set(basePositions[idx].dev.id, { dx: 0, dz: 0, dy: k * 0.48 });
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

      // Vertical Elevation Pole down to ground (hidden by default; shown only while moving device)
      if (finalY > 0.15) {
        const showGuide = this.shouldShowElevationGuide(dev.id);
        const stemGeo = new THREE.CylinderGeometry(0.05 * Math.max(1, this.deviceScaleMultiplier * 0.4), 0.05 * Math.max(1, this.deviceScaleMultiplier * 0.4), finalY, 8);
        const stemMat = new THREE.MeshBasicMaterial({
          color: cat.color,
          transparent: true,
          opacity: 0.45
        });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(0, -finalY / 2, 0);
        stem.visible = showGuide;
        stem.userData.isElevationGuide = true;
        stem.raycast = () => { };
        holder.add(stem);

        // Floor footprint dot
        const footprint = new THREE.Mesh(
          new THREE.RingGeometry(0.35, 0.55, 16),
          new THREE.MeshBasicMaterial({ color: cat.color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
        );
        footprint.rotation.x = -Math.PI / 2;
        footprint.position.set(0, -finalY + 0.05, 0);
        footprint.visible = showGuide;
        footprint.userData.isElevationGuide = true;
        footprint.raycast = () => { };
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
      selRing.raycast = () => { };
      holder.add(selRing);

      // Active Cable Source Ring (when drawing cable in 3D or Simulator port patching)
      if ((stateManager.getMode() === 'draw-cable' || this.pendingCableSourcePort) && this.pendingCableSourceId === dev.id) {
        const srcRing = new THREE.Mesh(
          new THREE.RingGeometry(1.25 * userModelScale, 1.52 * userModelScale, 32),
          new THREE.MeshBasicMaterial({ color: 0x0ea5e9, side: THREE.DoubleSide })
        );
        srcRing.rotation.x = -Math.PI / 2;
        srcRing.position.y = 0.06;
        srcRing.raycast = () => { };
        holder.add(srcRing);
      }

      // Floating Label Sprite (always attach so layer:annotations toggle works without rebuild)
      const label = create3DLabelSprite(dev, elev);
      label.userData = { ...(label.userData || {}), isDeviceLabel: true, isLabelSprite: true };
      const labelScaleFactor = Math.max(0.75, Math.min(1.6, this.deviceScaleMultiplier * 0.42));
      label.scale.multiplyScalar(labelScaleFactor);
      label.position.set(0, 1.15 * userModelScale + 0.8, 0);
      label.visible = Boolean(this.showLabels);
      holder.add(label);

      this.tagDescendantDeviceId(holder, dev.id);
      this.devicesGroup.add(holder);
      this.deviceMeshMap.set(dev.id, holder);

      // Wireless Coverage 3D Volume (Dome + Ground Footprint)
      if (dev.wirelessCoverage?.enabled) {
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
        disc.userData = { deviceId: dev.id, isCoverageOverlay: true };
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
        ring.userData = { deviceId: dev.id, isCoverageOverlay: true };
        this.coverageGroup.add(ring);
      }
    });
    if (this.avatarMode && this.carriedObjects?.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }
    this.updateAvatarDeviceLabelsVisibility?.();
    this.syncTransformGizmo?.();
    this.apply3dViewFilters?.();
    this.updateSceneLOD?.(true);
    this.updateSceneOcclusionCulling?.(true);
    this.requestShadowUpdate?.();
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
    const instancedClipsQueue = [];

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

      // Parallel Cable Bundling lateral separation for cables sharing the same corridor
      const bundleLane = Number(cable.details?.bundleLane) || 0;
      const bundleOffsetVec = bundleLane !== 0
        ? sideDir.clone().multiplyScalar(bundleLane * 0.026)
        : new THREE.Vector3();

      if (Array.isArray(cable.route) && cable.route.length > 0) {
        const rawWps = cable.route.map((wp) => {
          const wpWorld = this.normToWorld(wp.x, wp.y);
          const wpY = (typeof wp.z === 'number' && !isNaN(wp.z)) ? Math.max(0.02, wp.z) : trayY;
          return new THREE.Vector3(wpWorld.x, wpY, wpWorld.z).add(bundleOffsetVec);
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
      if (pathStyle === 'orthogonal') {
        const filleted = buildFilletedPolylinePoints(cleanPts, 0.06).map((p) => new THREE.Vector3(p.x, p.y, p.z));
        curve = new THREE.CurvePath();
        for (let i = 0; i < filleted.length - 1; i++) {
          curve.add(new THREE.LineCurve3(filleted[i], filleted[i + 1]));
        }
      } else if (pathStyle === 'straight') {
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
      const tubularSegs = this.graphicsQuality === 'lite'
        ? Math.max(24, cleanPts.length * 10)
        : Math.max(40, cleanPts.length * 16);
      const tubeGeo = new THREE.TubeGeometry(curve, tubularSegs, radius, this.graphicsQuality === 'lite' ? 8 : 12, false);
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

      // Physical 3D Cable Clips (U-Clip / P-Clamp / Cable Tie) & PVC Duct / Cable Tray
      if (!isWireless && waypointMarkers.length > 0) {
        const showClips = cable.details?.showClips3d !== false;
        const allowClipsNow = showClips && (this.graphicsQuality !== 'lite' || isSelected || waypointMarkers.length <= 8);
        if (allowClipsNow) {
          const upAxis = new THREE.Vector3(0, 1, 0);
          const useInstancedBatch = !isSelected && typeof THREE.InstancedMesh === 'function';
          waypointMarkers.forEach((wpVec, idx) => {
            const rawWp = cable.route?.[idx];
            const clipType = rawWp?.clipType || getDefaultClipType(cable.cableCategory, rawWp?.surface || 'wall');
            if (clipType === 'none') return;
            // Render physical clip when waypoint has surface metadata OR orthogonal/mounted path
            if (!rawWp?.surface && pathStyle !== 'orthogonal' && !isSelected) return;

            const q = new THREE.Quaternion();
            if (rawWp?.normal && typeof rawWp.normal.x === 'number') {
              const nVec = new THREE.Vector3(rawWp.normal.x, rawWp.normal.y, rawWp.normal.z);
              if (nVec.lengthSq() > 0.01) {
                nVec.normalize();
                if (nVec.y < -0.999) {
                  q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
                } else {
                  q.setFromUnitVectors(upAxis, nVec);
                }
              }
            }

            if (useInstancedBatch) {
              instancedClipsQueue.push({
                position: wpVec.clone(),
                quaternion: q,
                clipType,
                radius: Math.max(radius, 0.012),
                cableId: cable.id,
                waypointIdx: idx
              });
              return;
            }

            const clipGroup = createCableClip3DMesh({ clipType, radius: Math.max(radius, 0.012), isSelected });
            clipGroup.position.copy(wpVec);
            clipGroup.quaternion.copy(q);
            clipGroup.traverse((ch) => {
              ch.userData.cableId = cable.id;
              ch.userData.isCableClip3d = true;
              ch.userData.cableHandleType = 'waypoint';
              ch.userData.waypointIdx = idx;
              ch.userData.bowOffset = wpBowOffset.clone();
            });
            clipGroup.userData.cableId = cable.id;
            clipGroup.userData.waypointIdx = idx;
            this.cablesGroup.add(clipGroup);
          });
        }

        const conduitType = cable.details?.conduitType || 'none';
        if ((conduitType === 'pvc-duct' || conduitType === 'cable-tray') && cleanPts.length >= 2) {
          // Wrap straight wall/ceiling runs between waypoints in PVC Duct or Steel Cable Tray
          const conduitPts = pathStyle === 'orthogonal' ? cleanPts.slice(1, -1) : waypointMarkers;
          for (let i = 0; i < conduitPts.length - 1; i++) {
            const segMesh = createConduitSegmentMesh({
              startVec: conduitPts[i],
              endVec: conduitPts[i + 1],
              conduitType,
              radius
            });
            if (segMesh) {
              segMesh.traverse((ch) => { ch.userData.cableId = cable.id; });
              segMesh.userData.cableId = cable.id;
              this.cablesGroup.add(segMesh);
            }
          }
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
          const stemLine = new THREE.Line(stemGeo, stemMat);
          stemLine.userData = { cableId: cable.id };
          this.cablesGroup.add(stemLine);
        });

        // Translucent Pen-Tool control polygon + per-segment "+" add-waypoint handles
        if (!isWireless) {
          const ctrlPts = [srcBootTipWorld.clone(), ...waypointMarkers, dstBootTipWorld.clone()];
          const ctrlGeo = new THREE.BufferGeometry().setFromPoints(ctrlPts);
          const ctrlMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
          const ctrlLine = new THREE.Line(ctrlGeo, ctrlMat);
          ctrlLine.userData = { cableId: cable.id };
          this.cablesGroup.add(ctrlLine);

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

    if (instancedClipsQueue.length > 0) {
      const batchGroup = createInstancedCableClips3DGroup(instancedClipsQueue);
      if (batchGroup?.children?.length > 0) {
        this.cablesGroup.add(batchGroup);
      }
    }

    // Render live 3D Pen Tool waypoints & preview tube while drawing a cable in 3D
    if (stateManager.getMode() === 'draw-cable' && this.pendingCableSourceId && this.pending3dWaypoints.length > 0) {
      const srcPos = this.effectivePosMap.get(this.pendingCableSourceId);
      if (srcPos) {
        const previewPts = [srcPos.clone()];
        const dotGeo = new THREE.SphereGeometry(0.14 * Math.max(1, this.deviceScaleMultiplier * 0.4), 12, 12);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });

        this.pending3dWaypoints.forEach((wp) => {
          const wpW = this.normToWorld(wp.x, wp.y);
          const wpY = (typeof wp.z === 'number' && !isNaN(wp.z)) ? Math.max(0.02, wp.z) : Math.max(0.15, srcPos.y * 0.4);
          const v = new THREE.Vector3(wpW.x, wpY, wpW.z);
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
    this.apply3dViewFilters?.();
    this.updateSceneLOD?.(true);
    this.requestShadowUpdate?.();
  }

  _resolveCableIdFromHit(hit) {
    if (!hit?.object) return null;
    const ud = hit.object.userData;
    if (ud?.cableId) return ud.cableId;
    if (ud?.isInstancedClips && Number.isInteger(hit.instanceId) && Array.isArray(ud.instanceMeta)) {
      return ud.instanceMeta[hit.instanceId]?.cableId || null;
    }
    return null;
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

    // Phase 7B: First-Person / Third-Person Cable Spool Pulling priority state
    // Clicking a destination device selects/opens its port picker (or plugs straight into aimed 3D port);
    // clicking floor/wall/ceiling places a 3D cable clip! Never picks up devices while pulling cables.
    if (
      this.avatarMode
      && !this.simulatorFocusedDeviceId
      && this.activeCablePull
      && !e.ctrlKey
      && !e.metaKey
    ) {
      const pull = this.activeCablePull;
      const directDevHits = !this.workspaceGhostDevices && this.devicesGroup?.visible
        ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
        : [];
      const firstDirect = directDevHits.length > 0 && directDevHits[0].distance <= 14.0 ? directDevHits[0] : null;
      const directDevId = firstDirect ? this.findDeviceIdFromObject(firstDirect.object) : null;
      const directPortName = firstDirect ? this.findPortNameFromObject(firstDirect.object) : '';

      if (directDevId && directDevId === pull.sourceDeviceId) {
        if (directPortName) {
          this.setActiveCablePullSourcePort(directPortName);
        } else {
          this.showStatusHint('Pilih port asal di panel bawah, lalu klik perangkat tujuan atau klik dinding untuk Klem 3D.');
        }
        return;
      }

      if (directDevId && directDevId !== pull.sourceDeviceId) {
        const dstPorts = this.getDevicePortsStatusList(directDevId);
        const freePorts = dstPorts.filter((p) => !p.occupied);
        if (directPortName) {
          this.finishAvatarCablePull(directDevId, directPortName);
          if (e.pointerType !== 'touch') {
            this.tryLockAvatarPointer?.();
          }
          return;
        }
        if (freePorts.length <= 1) {
          this.finishAvatarCablePull(directDevId, freePorts[0]?.name || '');
          if (e.pointerType !== 'touch') {
            this.tryLockAvatarPointer?.();
          }
          return;
        }
        pull.targetDeviceId = directDevId;
        pull.targetPort = freePorts[0]?.name || '';
        this._lastHouseFlipperHudKey = '';
        this.releaseAvatarPointerLock?.();
        this.renderHouseFlipperPromptHud?.();
        const dstDev = this.deviceManager?.getDeviceById?.(directDevId);
        this.showStatusHint(
          `Tujuan "${dstDev?.name || directDevId}" dipilih — Klik port tujuan di panel bawah (atau tekan E untuk colok ke [${pull.targetPort}]).`
        );
        return;
      }

      const aimTarget = this.computeAvatarCableAimTarget({ shiftKey: Boolean(e.shiftKey) });
      if (aimTarget?.kind === 'device' && aimTarget.deviceId && aimTarget.deviceId !== pull.sourceDeviceId) {
        const dstPorts = this.getDevicePortsStatusList(aimTarget.deviceId);
        const freePorts = dstPorts.filter((p) => !p.occupied);
        if (aimTarget.hitPortDirectly || freePorts.length <= 1 || pull.targetDeviceId === aimTarget.deviceId) {
          this.finishAvatarCablePull(aimTarget.deviceId, aimTarget.portName || freePorts[0]?.name || '');
        } else {
          pull.targetDeviceId = aimTarget.deviceId;
          pull.targetPort = aimTarget.portName || freePorts[0]?.name || '';
          this._lastHouseFlipperHudKey = '';
          this.releaseAvatarPointerLock?.();
          this.renderHouseFlipperPromptHud?.();
          const dstDev = this.deviceManager?.getDeviceById?.(aimTarget.deviceId);
          this.showStatusHint(
            `Tujuan "${dstDev?.name || aimTarget.deviceId}" dipilih — Klik port tujuan di panel bawah (atau tekan E untuk colok ke [${pull.targetPort}]).`
          );
          return;
        }
      } else {
        this.placeAvatarCableClip({ shiftKey: Boolean(e.shiftKey), aimTarget });
      }
      if (e.pointerType !== 'touch') {
        this.tryLockAvatarPointer?.();
      }
      return;
    }

    // House-Flipper 1-click Place: when carrying items in Mode Teknisi, left-clicking places onto the aimed surface/wall
    if (
      this.avatarMode
      && !this.simulatorFocusedDeviceId
      && stateManager.getMode() !== 'draw-cable'
      && stateManager.getMode() !== 'add-device'
      && Array.isArray(this.carriedObjects)
      && this.carriedObjects.length > 0
      && !e.ctrlKey
      && !e.metaKey
    ) {
      this.dropCarriedObjectsFromAvatar({ dropAll: Boolean(e.shiftKey), useAimTarget: true });
      if (e.pointerType !== 'touch') {
        this.tryLockAvatarPointer?.();
      }
      return;
    }

    // 1. Raycast Devices & Cables (skipped when Studio Bangunan dims/ghosts devices or layer hidden)
    const devHits = !this.workspaceGhostDevices && this.devicesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
      : [];
    const cableHitsPre = !this.workspaceGhostDevices && this.cablesGroup?.visible && stateManager.getMode() !== 'draw-cable'
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.cablesGroup.children, true))
      : [];

    const cableDistBias = (this.avatarMode || this.navTool === 'move') ? -0.02 : 0.25;
    if (cableHitsPre.length > 0 && (
      devHits.length === 0 ||
      cableHitsPre[0].distance <= devHits[0].distance + cableDistBias ||
      Boolean(cableHitsPre[0].object?.userData?.cableHandleType)
    )) {
      const cabId = this._resolveCableIdFromHit(cableHitsPre[0]);
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
        // Clicking any destination 3D port or device completes the pending patch cord cleanly (never triggers pickup)
        if (this.pendingCableSourceId && this.pendingCableSourceId !== devId) {
          const targetPort = hitPortName || this._findFirstFreePortName(devId);
          if (targetPort) {
            this.handleSimulatorPortClick(devId, targetPort);
          } else {
            this.showStatusHint(`Semua port pada "${this.deviceManager?.getDeviceById?.(devId)?.name || devId}" sudah terpakai.`);
          }
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
          if (this.avatarMode) {
            const devObj = this.deviceManager.getDeviceById?.(devId);
            this.showStatusHint(
              `"${devObj?.name || devId}" dipilih — Tekan E untuk mengangkat • Tekan C untuk tarik kabel.`
            );
          } else if (this.navTool === 'move') {
            const devObj = this.deviceManager.getDeviceById?.(devId);
            this.showStatusHint(
              `"${devObj?.name || devId}" dipilih — Seret langsung di lantai/meja untuk pindah • Panah : Geser • R : Putar 45°`
            );
          } else if (['rotate', 'box'].includes(this.navTool)) {
            const devObj = this.deviceManager.getDeviceById?.(devId);
            this.showStatusHint(
              `"${devObj?.name || devId}" dipilih — Gunakan tombol Panah (Arrow) atau R untuk memutar/geser.`
            );
          } else if (this.buildPlacementConfig?.buildModeEnabled && this.buildPlacementConfig?.gizmoEnabled) {
            const devObj = this.deviceManager.getDeviceById?.(devId);
            this.showStatusHint(
              `"${devObj?.name || devId}" dipilih — Seret panah/lingkaran Gizmo RGB (X Merah, Y Hijau, Z Biru) untuk geser & putar presisi.`
            );
          } else if (this.autoFocusOnClick || this.simulatorFocusedDeviceId) {
            this.focusOnDevice(devId, { viewAngle: this.simulatorViewAngle || 'front' });
          }
        }
        return;
      }
    }

    // 1b. In 3D draw-cable mode with source selected, clicking wall/ceiling/floor/pole adds a true 3D waypoint clip
    if (stateManager.getMode() === 'draw-cable' && this.pendingCableSourceId) {
      const envHits = this._filterVisibleRayHits(this.raycaster.intersectObjects(
        [...this.roomsGroup.children, ...this.objects3dGroup.children, ...this.groundGroup.children],
        true
      ));
      const firstHit = envHits.length > 0 ? envHits[0] : null;
      let hitPoint = firstHit ? firstHit.point.clone() : null;
      let hitNormal = { x: 0, y: 1, z: 0 };
      if (firstHit?.face?.normal && firstHit.object?.matrixWorld) {
        const nMat = new THREE.Matrix3().getNormalMatrix(firstHit.object.matrixWorld);
        const wNorm = firstHit.face.normal.clone().applyMatrix3(nMat).normalize();
        if (wNorm.dot(this.raycaster.ray.direction) > 0) wNorm.negate();
        hitNormal = {
          x: Number(wNorm.x.toFixed(3)),
          y: Number(wNorm.y.toFixed(3)),
          z: Number(wNorm.z.toFixed(3))
        };
        hitPoint.addScaledVector(wNorm, 0.018);
      }
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
        const surface = classifySurfaceFromNormal(hitNormal);
        const wpZ = Number(Math.max(0.02, hitPoint.y).toFixed(2));
        this.pending3dWaypoints.push({
          x: Number(Math.max(0.01, Math.min(0.99, normX)).toFixed(4)),
          y: Number(Math.max(0.01, Math.min(0.99, normY)).toFixed(4)),
          z: wpZ,
          surface,
          normal: hitNormal,
          clipType: getDefaultClipType(this.pen3dCategory || 'cat6', surface)
        });
        this.syncCables();
        this.showStatusHint(`Klem #${this.pending3dWaypoints.length} dipasang (${surface}, Z=${wpZ.toFixed(2)}m). Klik permukaan lagi atau klik perangkat tujuan.`);
        return;
      }
    }

    // 1c. In Add Device mode, clicking or tapping 3D floor / room places device directly on 3D map
    if (stateManager.getMode() === 'add-device') {
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
        const { normX, normY } = this.worldToNorm(hitPoint.x, hitPoint.z);
        const elev = hitPoint.y > 0.12 && hitPoint.y < 12 ? Number(hitPoint.y.toFixed(2)) : undefined;
        eventBus.emit('canvas:place-device', {
          normalizedX: clamp(normX, 0.01, 0.99),
          normalizedY: clamp(normY, 0.01, 0.99),
          elevationMeters: elev,
          isInside: true
        });
        return;
      }
    }

    // 1c-road. City-Builder Road Drawing Mode (click ground or snap to road nodes to place segments)
    if (this.navTool === 'road3d' && !this.avatarMode) {
      this.handleRoad3dBuildClick(e);
      return;
    }

    // 1d. Interactive Building Doors: clicking any door leaf toggles Open/Close smoothly
    if (
      stateManager.getMode() !== 'draw-cable'
      && stateManager.getMode() !== 'add-device'
      && this.navTool !== 'road3d'
      && !e.ctrlKey
      && !e.metaKey
      && !e.shiftKey
    ) {
      const doorHit = this.findInteractiveDoorHit?.(this.raycaster, this.avatarMode ? 5.5 : 160);
      if (doorHit?.doorKey) {
        this.toggleInteractiveDoor(doorHit.doorKey);
        return;
      }
    }

    // 1e. Floating Building Signboard 3D click -> Focus building & open Documentation Card
    if (
      stateManager.getMode() !== 'draw-cable'
      && stateManager.getMode() !== 'add-device'
      && this.navTool !== 'road3d'
      && !e.ctrlKey
      && !e.metaKey
    ) {
      const signHit = this.findBuildingSignboardHit?.(this.raycaster);
      if (signHit?.roomId) {
        const room = stateManager.getRoom3dById?.(signHit.roomId);
        if (room) {
          this.deviceManager.deselectDevice();
          this.cableManager.deselectConnection();
          stateManager.deselectObject3d?.();
          stateManager.deselectRoad3d?.();
          if (this.isRoomLocked(room)) {
            stateManager.deselectRoom3d?.();
            stateManager.inspectRoom3d?.(room.id);
          } else {
            stateManager.selectRoom3d?.(room.id);
          }
          this.focusOnRoom3d(room.id);
          this.showStatusHint(
            `Dokumentasi Gedung "${room.name}" — Lihat inventaris perangkat, VLAN/SSID & catatan di panel kanan.`
          );
          return;
        }
      }
    }

    // 2. Check Custom 3D Builder Object selection (Tiang, Rak Server, Balok, dll)
    if (stateManager.getMode() !== 'draw-cable') {
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit?.object3dId) {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
        stateManager.deselectRoom3d?.();
        stateManager.deselectRoad3d?.();
        stateManager.selectObject3d(objHit.object3dId);
        return;
      }
    }

    // 3. Check Cable selection
    const cableHits = !this.workspaceGhostDevices && this.cablesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.cablesGroup.children, true))
      : [];
    if (cableHits.length > 0) {
      const cabId = this._resolveCableIdFromHit(cableHits[0]);
      if (cabId) {
        stateManager.deselectObject3d?.();
        stateManager.deselectRoom3d?.();
        stateManager.deselectRoad3d?.();
        this.cableManager.selectConnection(cabId);
        return;
      }
    }

    // 3a. Check 3D Road selection (City-Builder Walkway / Road)
    if (stateManager.getMode() !== 'draw-cable') {
      const roadHit = this.findRoad3dHit?.(this.raycaster);
      if (roadHit?.roadId) {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
        stateManager.deselectObject3d?.();
        stateManager.deselectRoom3d?.();
        stateManager.selectRoad3d?.(roadHit.roadId);
        const road = stateManager.getRoad3dById?.(roadHit.roadId);
        this.showStatusHint(
          `Jalan "${road?.name || 'Jalan 3D'}" dipilih — Tarik titik kuning untuk belok/panjang • Tarik titik biru (+) untuk tambah tekukan • Delete untuk hapus`
        );
        return;
      }
    }

    // 3b. Check Ruangan 3D selection (drag/resize/rotate via gizmos or Move/Rotate tools)
    //     or Read-Only Documentation Inspection when locked (e.g. Simulasi Jaringan mode)
    if (stateManager.getMode() !== 'draw-cable') {
      const roomHit = this.findRoom3dHit?.(this.raycaster);
      if (roomHit?.roomId) {
        this.deviceManager.deselectDevice();
        this.cableManager.deselectConnection();
        stateManager.deselectObject3d?.();
        stateManager.deselectRoad3d?.();
        stateManager.selectRoom3d?.(roomHit.roomId);
        const room = stateManager.getRoom3dById?.(roomHit.roomId);
        this.showStatusHint(
          `Ruangan "${room?.name || 'Ruangan 3D'}" dipilih — Drag handle oranye / Move (M) geser • Rotate (R) / [ ] putar • Kuning / + - ubah skala`
        );
        return;
      }

      const lockedRoomHit = this.findRoom3dHit?.(this.raycaster, { includeLocked: true });
      if (lockedRoomHit?.roomId && !this.avatarMode) {
        const room = stateManager.getRoom3dById?.(lockedRoomHit.roomId);
        if (room) {
          this.deviceManager.deselectDevice();
          this.cableManager.deselectConnection();
          stateManager.deselectObject3d?.();
          stateManager.deselectRoad3d?.();
          stateManager.deselectRoom3d?.();
          stateManager.inspectRoom3d?.(room.id);
          this.showStatusHint(
            `Kartu Dokumentasi Gedung "${room.name}" terbuka (posisi gedung terkunci aman).`
          );
          return;
        }
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
      stateManager.clearInspectedRoom3d?.();
      stateManager.deselectRoad3d?.();
      if (this.simulatorFocusedDeviceId) {
        this.exitSimulatorFocus({ restoreCamera: false });
      } else if (this.avatarMode && e.pointerType !== 'touch') {
        // Clicking empty canvas while in Mode Teknisi re-locks desktop mouse for 360-deg infinite look
        this.tryLockAvatarPointer();
      }
    }
  }

  handleCanvasRightClick(e) {
    if (this.navTool === 'road3d' && this.roadBuildState) {
      this.finishActiveRoadBuild();
      return;
    }
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

    const devHits = !this.workspaceGhostDevices && this.devicesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
      : [];
    const cableHits = !this.workspaceGhostDevices && this.cablesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.cablesGroup.children, true))
      : [];

    // 1. Prioritize Right-click on foreground 3D Cable / Handle -> Cable Context Menu
    if (cableHits.length > 0 && (
      devHits.length === 0 ||
      cableHits[0].distance <= devHits[0].distance + 0.25 ||
      Boolean(cableHits[0].object?.userData?.cableHandleType)
    )) {
      const cabId = this._resolveCableIdFromHit(cableHits[0]);
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
    const envRoots = [];
    if (this.roomsGroup?.visible) envRoots.push(...this.roomsGroup.children);
    if (this.objects3dGroup?.visible) envRoots.push(...this.objects3dGroup.children);
    if (this.groundGroup?.visible) envRoots.push(...this.groundGroup.children);
    const envHits = this._filterVisibleRayHits(this.raycaster.intersectObjects(envRoots, true));
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

    const devHits = !this.workspaceGhostDevices && this.devicesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
      : [];
    const cableHits = !this.workspaceGhostDevices && this.cablesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.cablesGroup.children, true))
      : [];

    // Priority: Double-click on Cable / Waypoint -> Delete Waypoint or Insert Smart Pen-Tool Point
    if (cableHits.length > 0 && (
      devHits.length === 0 ||
      cableHits[0].distance <= devHits[0].distance + 0.25 ||
      Boolean(cableHits[0].object?.userData?.cableHandleType)
    )) {
      const cabId = this._resolveCableIdFromHit(cableHits[0]);
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
    const validTools = ['orbit', 'pan', 'zoom', 'look', 'move', 'rotate', 'box', 'draw3d', 'road3d'];
    if (!validTools.includes(tool)) return;
    if (this.navTool === 'road3d' && tool !== 'road3d' && this.roadBuildState) {
      this.finishActiveRoadBuild({ silent: true });
    }
    this.navTool = tool;
    this.applyNavToolConfig();
    this.syncElevationGuides();
    this.syncTransformGizmo?.();
    this.renderRoad3dHudBar?.();
    eventBus.emit('map3d:navtool-changed', { tool });
  }

  applyNavToolConfig() {
    if (this.container) {
      this.container.classList.remove('tool-orbit', 'tool-pan', 'tool-zoom', 'tool-look', 'tool-move', 'tool-rotate', 'tool-box', 'tool-draw3d', 'tool-road3d');
      this.container.classList.add(`tool-${this.navTool}`);
    }
    if (!this.controls) return;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };

    if (this.navTool === 'draw3d' || this.navTool === 'road3d') {
      this.controls.mouseButtons = {
        LEFT: -1, // Click on 3D floor to place SketchUp 3D objects or City-Builder 3D roads
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
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN
      };
      this.controls.maxPolarAngle = Math.PI * 0.495;
    } else if (this.navTool === 'zoom') {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.DOLLY,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.DOLLY_ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
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
    if (this.avatarMode && !this.simulatorFocusedDeviceId) {
      this.configureControlsForAvatarMode(true);
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
      this.showStatusHint(`${totalSel} perangkat terpilih — Aktifkan Move (M) untuk geser bersamaan.`);
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

  _isObjectAndAncestorsVisible(obj) {
    let cur = obj;
    while (cur) {
      if (cur.visible === false) return false;
      cur = cur.parent;
    }
    return true;
  }

  _filterVisibleRayHits(hits) {
    if (!Array.isArray(hits) || hits.length === 0) return hits;
    return hits.filter((h) => h?.object && this._isObjectAndAncestorsVisible(h.object));
  }

  findObject3dHit(raycaster = this.raycaster, { includeLocked = false } = {}) {
    if (!this.objects3dGroup || !this.objects3dGroup.visible || this.objects3dGroup.children.length === 0) return null;
    if (!includeLocked && this.roomsLocked) return null;
    const hits = this._filterVisibleRayHits(raycaster.intersectObjects(this.objects3dGroup.children, true));
    for (let i = 0; i < hits.length; i++) {
      let curr = hits[i].object;
      let gizmoType = null;
      let object3dId = null;
      while (curr) {
        if (!gizmoType && curr.userData?.gizmoType) gizmoType = curr.userData.gizmoType;
        if (!object3dId && curr.userData?.object3dId) object3dId = curr.userData.object3dId;
        if (object3dId) {
          if (!includeLocked && this.isObject3dLocked(object3dId)) {
            break;
          }
          return { object3dId, gizmoType, point: hits[i].point.clone(), object: hits[i].object };
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  findRoom3dHit(raycaster = this.raycaster, { includeLocked = false } = {}) {
    if (!this.roomsGroup || !this.roomsGroup.visible || this.roomsGroup.children.length === 0) return null;
    if (!includeLocked && this.roomsLocked) return null;
    const hits = this._filterVisibleRayHits(raycaster.intersectObjects(this.roomsGroup.children, true));
    for (let i = 0; i < hits.length; i++) {
      let curr = hits[i].object;
      let gizmoType = null;
      let roomId = null;
      while (curr && curr !== this.roomsGroup) {
        if (!gizmoType && curr.userData?.gizmoType) gizmoType = curr.userData.gizmoType;
        if (!roomId && curr.userData?.roomId) roomId = curr.userData.roomId;
        if (roomId) {
          if (!includeLocked && this.isRoomLocked(roomId)) {
            break;
          }
          return { roomId, gizmoType, point: hits[i].point.clone(), object: hits[i].object };
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  findRoad3dHit(raycaster = this.raycaster) {
    if (!this.roadsGroup || !this.roadsGroup.visible || this.roadsGroup.children.length === 0) return null;
    const hits = this._filterVisibleRayHits(raycaster.intersectObjects(this.roadsGroup.children, true));
    for (let i = 0; i < hits.length; i++) {
      let curr = hits[i].object;
      let gizmoType = null;
      let roadId = null;
      let nodeIndex = -1;
      let insertAfterIndex = -1;
      while (curr && curr !== this.roadsGroup) {
        if (!gizmoType && curr.userData?.gizmoType) {
          gizmoType = curr.userData.gizmoType;
          if (typeof curr.userData.nodeIndex === 'number') nodeIndex = curr.userData.nodeIndex;
          if (typeof curr.userData.insertAfterIndex === 'number') insertAfterIndex = curr.userData.insertAfterIndex;
        }
        if (!roadId && curr.userData?.roadId) roadId = curr.userData.roadId;
        if (roadId) {
          return {
            roadId,
            gizmoType,
            nodeIndex,
            insertAfterIndex,
            point: hits[i].point.clone(),
            object: hits[i].object
          };
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
    const hasSelRoad = Boolean(
      (stateManager.getSelectedRoad3dId?.() || this.navTool === 'road3d' || this.navTool === 'move')
      && this.roadsGroup?.children?.length > 0
    );
    if (!hasSelObj && !hasSelRoom && !hasSelRoad) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (hasSelObj) {
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit && objHit.gizmoType) return objHit;
    }
    if (hasSelRoad) {
      const roadHit = this.findRoad3dHit(this.raycaster);
      if (roadHit && roadHit.gizmoType) return roadHit;
    }
    if (hasSelRoom) {
      const roomHit = this.findRoom3dHit(this.raycaster);
      if (roomHit && roomHit.gizmoType) return roomHit;
    }
    return null;
  }

  startObject3dGizmoDrag(e, dom, gizmoHit) {
    if (gizmoHit?.roadId || String(gizmoHit?.gizmoType || '').startsWith('road-')) {
      return this.startRoad3dGizmoDrag(e, dom, gizmoHit);
    }
    if (gizmoHit?.roomId || String(gizmoHit?.gizmoType || '').startsWith('room-')) {
      return this.startRoom3dGizmoDrag(e, dom, gizmoHit);
    }
    const obj = stateManager.getObject3dById(gizmoHit.object3dId);
    if (!obj) return;
    if (this.isObject3dLocked(obj)) {
      this.showStatusHint(`Ruangan / Objek "${obj.name}" sedang dikunci.`);
      return;
    }
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
    const objHit = this.findObject3dHit(this.raycaster, { includeLocked: true });
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
    if (this.isObject3dLocked(obj)) {
      this.showStatusHint(`Ruangan / Objek "${obj.name}" sedang dikunci.`);
      return;
    }
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
    if (this.isRoomLocked(room)) {
      this.showStatusHint(`Ruangan "${room.name}" sedang dikunci.`);
      return;
    }
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
    if (this.isRoomLocked(room)) {
      this.showStatusHint(`Ruangan "${room.name}" sedang dikunci.`);
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
      this.showStatusHint(`Push/Pull Tinggi "${state.draftObj.name}": ${nextH.toFixed(2)}m`);
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
      this.showStatusHint(`Tinggi Ruangan "${state.draftRoom.name}": ${nextH.toFixed(2)}m`);
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
      this.showStatusHint(`Ukuran "${state.draftObj.name}": ${nextW.toFixed(2)}m × ${nextD.toFixed(2)}m`);
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
        `Skala Ruangan "${state.draftRoom.name}": ${nextW.toFixed(1)}×${nextD.toFixed(1)}×${nextH.toFixed(1)}m (${pct}%) • Tahan Shift untuk ubah Lebar/Panjang bebas`
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
        `Rotasi "${state.draftObj.name}": X:${rx}° Y:${ry}° Z:${rz}° (Drag=Y • Shift=Miring X/Dinding • Alt=Roll Z • Ctrl=Snap 15°)`
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
        `Rotasi Ruangan "${state.draftRoom.name}": Y:${ry}° (Ctrl=Snap 15°)`
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
        this.showStatusHint(`Menggambar "${state.draftObj.name}": ${w.toFixed(1)}m × ${d.toFixed(1)}m`);
      }
      return;
    }

    if (state.kind === 'road-node') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;
      state.moved = true;
      const snapped = this._snapRoadWorldPoint(hitPt.x, hitPt.z, {
        excludeRoadId: state.roadId,
        excludeNodeIdx: state.nodeIndex,
        anchorWorld: state.anchorWorld,
        shiftKey: Boolean(e.shiftKey)
      });
      const { normX, normY } = this.worldToNorm(snapped.x, snapped.z);
      const pts = (state.draftRoad.points || []).map((p) => ({ ...p }));
      if (state.nodeIndex >= 0 && state.nodeIndex < pts.length) {
        pts[state.nodeIndex] = { x: Number(normX.toFixed(5)), y: Number(normY.toFixed(5)) };
      }
      state.draftRoad = { ...state.draftRoad, points: pts };
      state.latestPoints = pts;
      this.rebuildSingleRoad3dMesh(state.draftRoad, true);
      this.showStatusHint(
        `Titik #${state.nodeIndex + 1} "${state.draftRoad.name || 'Jalan 3D'}": X:${snapped.x.toFixed(1)}m Z:${snapped.z.toFixed(1)}m${snapped.nodeSnapped ? ' (Tertaut Simpul)' : ''}`
      );
      return;
    }

    if (state.kind === 'road-move') {
      const hitPt = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;
      state.moved = true;
      let targetX = hitPt.x + state.grabOffsetX;
      let targetZ = hitPt.z + state.grabOffsetZ;
      if (this.applyBuildGridSnapWorld) {
        const g = this.applyBuildGridSnapWorld(targetX, targetZ);
        targetX = g.x;
        targetZ = g.z;
      }
      const dx = targetX - state.startRefWorld.x;
      const dz = targetZ - state.startRefWorld.z;
      const pts = state.startPoints.map((pt) => {
        const w = this.normToWorld(pt.x, pt.y);
        const n = this.worldToNorm(w.x + dx, w.z + dz);
        return { x: Number(n.normX.toFixed(5)), y: Number(n.normY.toFixed(5)) };
      });
      state.draftRoad = { ...state.draftRoad, points: pts };
      state.latestPoints = pts;
      this.rebuildSingleRoad3dMesh(state.draftRoad, true);
      this.showStatusHint(`Geser "${state.draftRoad.name || 'Jalan 3D'}"`);
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
        `Geser Ruangan "${state.room?.name || 'Ruangan 3D'}": X=${state.latestNorm.x.toFixed(3)}, Y=${state.latestNorm.y.toFixed(3)}`
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
    if (state.kind === 'road-node' || state.kind === 'road-move') {
      if (state.moved && Array.isArray(state.latestPoints)) {
        this._suppressNextClick = true;
        stateManager.updateRoad3d?.(state.roadId, { points: state.latestPoints });
        this.renderRoad3dHudBar?.();
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
      this.showStatusHint(`"${state.draftObj.name}" dibuat! Tarik panah biru di atas untuk Push/Pull tinggi.`);
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
    if (this.isBuildingEditWorkspace?.()) return null;
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
    let snappedSurface = null;
    let snappedNormal = null;

    if (!e.shiftKey && state.handleType !== 'apex') {
      const envTargets = [
        ...(this.roomsGroup?.children || []),
        ...(this.objects3dGroup?.children || []),
        ...(this.groundGroup?.children || [])
      ];
      const surfHits = envTargets.length > 0
        ? this._filterVisibleRayHits(this.raycaster.intersectObjects(envTargets, true))
        : [];
      if (surfHits.length > 0) {
        const fh = surfHits[0];
        hitPt.copy(fh.point);
        if (fh.face?.normal && fh.object?.matrixWorld) {
          const nMat = new THREE.Matrix3().getNormalMatrix(fh.object.matrixWorld);
          const wNorm = fh.face.normal.clone().applyMatrix3(nMat).normalize();
          if (wNorm.dot(this.raycaster.ray.direction) > 0) wNorm.negate();
          hitPt.addScaledVector(wNorm, 0.018);
          snappedNormal = {
            x: Number(wNorm.x.toFixed(3)),
            y: Number(wNorm.y.toFixed(3)),
            z: Number(wNorm.z.toFixed(3))
          };
          snappedSurface = classifySurfaceFromNormal(snappedNormal);
        }
      } else if (!this.raycaster.ray.intersectPlane(state.dragPlane, hitPt)) {
        return;
      }
    } else if (!this.raycaster.ray.intersectPlane(state.dragPlane, hitPt)) {
      return;
    }

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
    const prevWp = state.handleType === 'waypoint' ? cable.route[state.waypointIdx] : null;
    const finalSurface = snappedSurface || prevWp?.surface || 'air';
    const wp = {
      ...(prevWp || {}),
      x: normX,
      y: normY,
      z: wpZ,
      ...(snappedSurface ? { surface: snappedSurface } : {}),
      ...(snappedNormal ? { normal: snappedNormal } : {}),
      ...(snappedSurface ? { clipType: prevWp?.clipType || getDefaultClipType(cable.cableCategory, finalSurface) } : {})
    };

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

    const devHits = !this.workspaceGhostDevices && this.devicesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
      : [];
    if (devHits.length === 0) {
      // If user clicked a 3D Builder object in Move mode, drag that object (+ mounted devices)
      const objHit = this.findObject3dHit(this.raycaster);
      if (objHit?.object3dId) {
        this.startObject3dMoveDrag(e, dom, objHit);
        return;
      }
      // Or drag a 3D Road / Walkway directly on the map ground
      const roadHit = this.findRoad3dHit?.(this.raycaster);
      if (roadHit?.roadId) {
        this.startRoad3dGizmoDrag(e, dom, { ...roadHit, gizmoType: roadHit.gizmoType || 'road-move' });
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
      this.showStatusHint(`Perangkat "${device.name}" dikunci pada Layer.`);
      return;
    }

    this.deviceManager.selectDevice(devId, {
      additive: Boolean(e.shiftKey),
      preserveMultiOnDrag: preserveMulti
    });

    const meshGroup = this.deviceMeshMap.get(devId);
    const devWorld = this.normToWorld(device.position.x, device.position.y);
    const planeY = meshGroup ? meshGroup.position.y : (Number(device.spatial3d?.elevationMeters) || 0);
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const devAnchor = new THREE.Vector3(
      meshGroup ? meshGroup.position.x : devWorld.x,
      planeY,
      meshGroup ? meshGroup.position.z : devWorld.z
    );
    const camFwd = new THREE.Vector3(0, 0, -1);
    this.camera?.getWorldDirection?.(camFwd);
    const camHorizNormal = new THREE.Vector3(camFwd.x, 0, camFwd.z);
    if (camHorizNormal.lengthSq() < 0.0001) camHorizNormal.set(0, 0, 1);
    else camHorizNormal.normalize();
    const verticalFallbackPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camHorizNormal, devAnchor);

    const hitPt = new THREE.Vector3();
    const hitPlaneOk = this.raycaster.ray.intersectPlane(dragPlane, hitPt)
      && Math.abs(this.raycaster.ray.direction.y) >= 0.06
      && hitPt.distanceTo(devAnchor) <= 35;
    if (!hitPlaneOk) {
      if (devHits[0]?.point) {
        hitPt.copy(devHits[0].point);
      } else if (!this.raycaster.ray.intersectPlane(verticalFallbackPlane, hitPt)) {
        hitPt.copy(devAnchor);
      }
    }

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
    const startHolderY = meshGroup ? meshGroup.position.y : (Number(device.spatial3d?.elevationMeters) || 0);
    const startSupportY = typeof this.getCarriedDropSupportElevation === 'function'
      ? this.getCarriedDropSupportElevation(devWorld.x, devWorld.z, devId)
      : 0;

    this.dragMoveState = {
      deviceId: devId,
      device,
      startNormX: device.position.x,
      startNormY: device.position.y,
      startWorldX: devWorld.x,
      startWorldZ: devWorld.z,
      effY,
      startHolderY,
      startSupportY,
      startRotY,
      hasModelContainer: Boolean(mc),
      plane: dragPlane,
      verticalFallbackPlane,
      startClientY: e.clientY,
      camDistAtStart: this.camera?.position ? Math.max(1.5, this.camera.position.distanceTo(devAnchor)) : 8,
      grabOffsetX: devWorld.x - hitPt.x,
      grabOffsetZ: devWorld.z - hitPt.z,
      meshOffsetX,
      meshOffsetZ,
      portInitials: this._collectDevicePortInitials(devId),
      peers,
      latestNorm: null,
      wallMountSnap: null,
      surfaceSnapElev: null
    };

    this.syncElevationGuides();
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
      if (
        node.userData?.gizmoType
        || node.userData?.isSelectionRing
        || node.userData?.isCarriedByAvatar
        || node.userData?.isInteractiveDoorPivot
        || node.userData?.isInteractiveDoorMesh
      ) return;
      if (node.userData?.object3dId) {
        const objRec = stateManager?.getObject3dById?.(node.userData.object3dId);
        const shp = String(objRec?.shape || '').toLowerCase();
        if (shp === 'table' || shp === 'floor') return;
      }
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

      const devScale = ((device?.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 1.0));
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

    // Shift + Drag Up/Down adjusts vertical Z elevation smoothly in 3D Move mode
    if (e.shiftKey && state.peers.length === 0) {
      const dyPx = (Number(state.startClientY) || e.clientY) - e.clientY;
      const meterPerPx = clamp((Number(state.camDistAtStart) || 8) * 0.0028, 0.006, 0.06);
      const rawElev = clamp(state.startHolderY + dyPx * meterPerPx, 0, 20);
      const newElev = Math.round(rawElev * 20) / 20;
      const curNorm = state.latestNorm || { x: state.startNormX, y: state.startNormY };
      const curWorld = this.normToWorld(curNorm.x, curNorm.y);
      const shiftX = curWorld.x - state.startWorldX;
      const shiftZ = curWorld.z - state.startWorldZ;
      const shiftY = newElev - state.startHolderY;

      state.wallMountSnap = null;
      state.surfaceSnapElev = newElev;
      state.latestNorm = curNorm;
      if (meshGroup) {
        meshGroup.position.set(curWorld.x + state.meshOffsetX, newElev, curWorld.z + state.meshOffsetZ);
        this.effectivePosMap.set(
          state.deviceId,
          new THREE.Vector3(meshGroup.position.x, state.effY + shiftY, meshGroup.position.z)
        );
        state.portInitials.forEach(({ key, initial }) => {
          this.portWorldPosMap.set(
            key,
            new THREE.Vector3(initial.x + shiftX, initial.y + shiftY, initial.z + shiftZ)
          );
        });
      }
      this.syncCables();
      this.syncTransformGizmo?.();
      this.showStatusHint(`Atur Elevasi Z (Shift + Drag): ${newElev.toFixed(2)}m`);
      return;
    }

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
          const userScale = meshGroup.userData?.userModelScale || ((state.device?.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 1.0));
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
            new THREE.Vector3(clampedWorld.x, mountY + 0.35 * (this.deviceScaleMultiplier || 1.0), clampedWorld.z)
          );
        }
        state.latestNorm = { x: normX, y: normY };
        state.wallMountSnap = {
          elevationMeters: mountY,
          rotationY: wallHit.rotationY,
          mountType: 'wall'
        };
        this.syncCables();
        this.syncTransformGizmo?.();
        this.showStatusHint(`Menempel ke dinding 3D (Tinggi: ${mountY.toFixed(2)}m • Hadap: ${wallHit.rotationY}°)`);
        return;
      }
      if (state.wallMountSnap) {
        state.wallMountSnap = null;
        if (meshGroup) meshGroup.position.y = state.startHolderY;
        if (modelContainer) modelContainer.rotation.y = (state.startRotY * Math.PI) / 180;
      }
    }

    const hitPt = new THREE.Vector3();
    const isGrazingHorizontal = Math.abs(this.raycaster.ray.direction.y) < 0.06;
    const hitHorizOk = !isGrazingHorizontal
      && this.raycaster.ray.intersectPlane(state.plane, hitPt)
      && (!this.camera?.position || hitPt.distanceTo(this.camera.position) <= 350);
    if (!hitHorizOk) {
      if (!state.verticalFallbackPlane || !this.raycaster.ray.intersectPlane(state.verticalFallbackPlane, hitPt)) {
        return;
      }
    }

    let newWorldX = hitPt.x + state.grabOffsetX;
    let newWorldZ = hitPt.z + state.grabOffsetZ;
    let activeElevY = state.startHolderY;
    let snappedToGrid = false;
    let surfaceSnapped = false;
    let collisionBlocker = null;

    if (state.peers.length === 0) {
      if (this.applyBuildGridSnapWorld) {
        const g = this.applyBuildGridSnapWorld(newWorldX, newWorldZ);
        newWorldX = g.x;
        newWorldZ = g.z;
        snappedToGrid = g.snapped;
      }
      if (this.buildPlacementConfig?.surfaceSnapEnabled && this.resolveBuildPlacementSurfaceElevation) {
        const sup = this.resolveBuildPlacementSurfaceElevation(newWorldX, newWorldZ, state.startHolderY, {
          excludeId: state.deviceId,
          startSupportY: state.startSupportY
        });
        activeElevY = sup.elevationMeters;
        surfaceSnapped = sup.surfaceSnapped;
      }
      if (!this.buildPlacementConfig?.allowClipping && this.resolveBuildPlacementCollision) {
        const sp = { ...getDefaultSpatial3d(state.device?.type), ...(state.device?.spatial3d || {}) };
        const scale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
        const fp = this.getDeviceCollisionFootprint
          ? this.getDeviceCollisionFootprint(state.device, scale)
          : { halfW: 0.45, halfD: 0.38, height: 0.35 };
        const colRes = this.resolveBuildPlacementCollision(newWorldX, newWorldZ, activeElevY, {
          halfW: fp.halfW,
          halfD: fp.halfD,
          height: fp.height,
          excludeIds: [state.deviceId]
        });
        newWorldX = colRes.x;
        newWorldZ = colRes.z;
        if (colRes.collided) {
          collisionBlocker = colRes.blockerName || 'Objek lain';
        }
      }
    }

    const { normX, normY } = this.worldToNorm(newWorldX, newWorldZ);
    const clampedWorld = this.normToWorld(normX, normY);

    const primaryShiftX = clampedWorld.x - state.startWorldX;
    const primaryShiftZ = clampedWorld.z - state.startWorldZ;
    const primaryShiftY = activeElevY - state.startHolderY;
    state.surfaceSnapElev = Math.abs(primaryShiftY) > 0.005 ? activeElevY : null;

    if (meshGroup) {
      meshGroup.position.x = clampedWorld.x + state.meshOffsetX;
      meshGroup.position.y = activeElevY;
      meshGroup.position.z = clampedWorld.z + state.meshOffsetZ;

      this.effectivePosMap.set(
        state.deviceId,
        new THREE.Vector3(meshGroup.position.x, state.effY + primaryShiftY, meshGroup.position.z)
      );
      state.portInitials.forEach(({ key, initial }) => {
        this.portWorldPosMap.set(
          key,
          new THREE.Vector3(initial.x + primaryShiftX, initial.y + primaryShiftY, initial.z + primaryShiftZ)
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
    this.syncTransformGizmo?.();
    if (collisionBlocker) {
      this.showStatusHint(`Anti-Tabrakan aktif: digeser menghindari "${collisionBlocker}" (aktifkan MoveObjects untuk tumpuk bebas)`);
    } else if (surfaceSnapped) {
      this.showStatusHint(`Surface Snap: menempel rata pada elevasi Z:${activeElevY.toFixed(2)}m`);
    } else if (snappedToGrid) {
      const step = this.buildPlacementConfig?.gridSnapMeters || 0.5;
      this.showStatusHint(`Snap Grid (${step}m): X:${clampedWorld.x.toFixed(1)}m • Y:${clampedWorld.z.toFixed(1)}m`);
    }
  }

  finishDeviceDragMove(e, dom) {
    const state = this.dragMoveState;
    this.dragMoveState = null;
    dom.releasePointerCapture?.(e.pointerId);
    this.syncElevationGuides();
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
        `Perangkat ditempelkan ke dinding 3D (Tinggi: ${state.wallMountSnap.elevationMeters.toFixed(2)}m • Hadap: ${state.wallMountSnap.rotationY}°)`
      );
      return;
    }
    if (state.surfaceSnapElev !== null && state.surfaceSnapElev !== undefined && this.deviceManager?.updateDevice) {
      this.deviceManager.moveDeviceGroup(moves, { syncRenderer: false });
      const dev = this.deviceManager.getDeviceById?.(state.deviceId);
      const baseSp = { ...getDefaultSpatial3d(dev?.type), ...(dev?.spatial3d || {}) };
      this.deviceManager.updateDevice(state.deviceId, {
        spatial3d: {
          ...baseSp,
          elevationMeters: Number(state.surfaceSnapElev.toFixed(2)),
          offsetY: 0
        }
      });
      this.syncDevices();
      this.syncCables();
      return;
    }
    this.deviceManager.moveDeviceGroup(moves, { syncRenderer: true });
    this.syncTransformGizmo?.();
  }

  _computeDragAngles(startRx, startRy, startRz, startClientX, startClientY, e) {
    const dx = e.clientX - startClientX;
    const dy = startClientY - e.clientY;
    const snapKey = Boolean(e.ctrlKey || e.metaKey);
    const buildSnapDeg = this.buildPlacementConfig?.buildModeEnabled
      ? (Number(this.buildPlacementConfig?.angleSnapDeg) || 0)
      : 0;
    const snapStep = snapKey ? 15 : buildSnapDeg;
    const snapFn = (val) => (snapStep > 0 ? Math.round(val / snapStep) * snapStep : Math.round(val));

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

    const devHits = !this.workspaceGhostDevices && this.devicesGroup?.visible
      ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
      : [];
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
        `Rotasi "${state.primaryName}"${suffix}: X:${firstAngles.rx}° Y:${firstAngles.ry}° Z:${firstAngles.rz}° (Drag=Y • Shift=Miring X/Dinding • Alt=Roll Z • Ctrl=Snap 15°)`
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
    const angleSnap = this.buildPlacementConfig?.buildModeEnabled
      ? (Number(this.buildPlacementConfig?.angleSnapDeg) || 0)
      : (this.avatarMode ? (Number(this.buildPlacementConfig?.angleSnapDeg) || 0) : 0);
    const effStep = (val) => {
      if (!val || reset) return val;
      if (angleSnap > 0 && Math.abs(val) === 15) return Math.sign(val) * angleSnap;
      return val;
    };
    const stepX = effStep(dX);
    const stepY = effStep(dY);
    const stepZ = effStep(dZ);
    const snapSigned = (deg) => (angleSnap > 0 ? clamp(Math.round(deg / angleSnap) * angleSnap, -180, 180) : clamp(Math.round(deg), -180, 180));
    const snapYaw = (deg) => {
      if (angleSnap > 0 && this.applyBuildAngleSnap) return this.applyBuildAngleSnap(deg);
      return ((Math.round(deg) % 360) + 360) % 360;
    };

    if (this.avatarMode && Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      const topItem = this.carriedObjects[this.carriedObjects.length - 1];
      if (reset) {
        topItem.relativeYawOffset = 0;
      } else {
        const delta = stepY || stepZ || 0;
        const avatarDeg = ((Number(this.avatarState?.yaw) || 0) * 180) / Math.PI;
        const targetWorldYaw = snapYaw(avatarDeg + (Number(topItem.relativeYawOffset) || 0) + delta);
        topItem.relativeYawOffset = angleSnap > 0 ? (targetWorldYaw - avatarDeg) : ((Number(topItem.relativeYawOffset) || 0) + delta);
      }
      this.updateCarriedObjectsTransform?.();
      this.showStatusHint(`Putar "${topItem.name}"${angleSnap > 0 ? ` (Snap ${angleSnap}°)` : ''} sebelum ditaruh (${this.carriedObjects.length} objek dibawa)`);
      return true;
    }

    const selectedIds = this.deviceManager?.getSelectedDeviceIds?.() || [];
    if (selectedIds.length > 0) {
      let summary = null;
      selectedIds.forEach((id) => {
        const dev = this.deviceManager.getDeviceById(id);
        if (!dev || dev.layerLocked) return;
        const base = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
        const rx = reset ? 0 : snapSigned((Number(base.rotationX) || 0) + stepX);
        const ry = reset ? 0 : snapYaw((Number(base.rotationY) || 0) + stepY);
        const rz = reset ? 0 : snapSigned((Number(base.rotationZ) || 0) + stepZ);
        this.deviceManager.updateDevice(id, {
          spatial3d: { ...base, rotationX: rx, rotationY: ry, rotationZ: rz }
        });
        if (!summary) summary = { name: dev.name, rx, ry, rz };
      });
      if (summary) {
        this.showStatusHint(`Rotasi "${summary.name}": X:${summary.rx}° Y:${summary.ry}° Z:${summary.rz}°`);
      }
      return true;
    }

    const selObjId = stateManager.getSelectedObject3dId?.();
    if (selObjId) {
      const obj = stateManager.getObject3dById(selObjId);
      if (!obj || this.isObject3dLocked(obj)) {
        if (obj) this.showStatusHint(`Ruangan / Objek "${obj.name}" sedang dikunci.`);
        return false;
      }
      const rx = reset ? 0 : snapSigned((Number(obj.rotationX) || 0) + stepX);
      const ry = reset ? 0 : snapYaw((Number(obj.rotationY ?? obj.rotationDeg) || 0) + stepY);
      const rz = reset ? 0 : snapSigned((Number(obj.rotationZ) || 0) + stepZ);
      stateManager.updateObject3d(selObjId, { rotationX: rx, rotationY: ry, rotationZ: rz });
      this.showStatusHint(`Rotasi "${obj.name}": X:${rx}° Y:${ry}° Z:${rz}°`);
      return true;
    }

    const selRoomId = stateManager.getSelectedRoom3dId?.();
    if (selRoomId) {
      const room = stateManager.getRoom3dById?.(selRoomId);
      if (!room || this.isRoomLocked(room)) {
        if (room) this.showStatusHint(`Ruangan "${room.name}" sedang dikunci.`);
        return false;
      }
      const rx = reset ? 0 : snapSigned((Number(room.rotationX) || 0) + stepX);
      const ry = reset ? 0 : snapYaw((Number(room.rotationY ?? room.rotationDeg) || 0) + stepY);
      const rz = reset ? 0 : snapSigned((Number(room.rotationZ) || 0) + stepZ);
      stateManager.updateRoom3d?.(selRoomId, { rotationX: rx, rotationY: ry, rotationZ: rz });
      this.showStatusHint(`Rotasi Ruangan "${room.name}": X:${rx}° Y:${ry}° Z:${rz}°`);
      return true;
    }

    return false;
  }

  scaleSelectedRoomIn3D(factor = 1.1) {
    const selRoomId = stateManager.getSelectedRoom3dId?.();
    if (!selRoomId) return false;
    const room = stateManager.getRoom3dById?.(selRoomId);
    if (!room || this.isRoomLocked(room)) {
      if (room) this.showStatusHint(`Ruangan "${room.name}" sedang dikunci.`);
      return false;
    }

    const mul = Math.max(0.25, Math.min(4.0, Number(factor) || 1));
    const { minW, minD, minH } = getRoomMinDimensions(room);
    const curW = Math.max(minW, Number(room.widthMeters) || 14);
    const curD = Math.max(minD, Number(room.depthMeters) || 12);
    const curH = Math.max(minH, Number(room.heightMeters) || 3.5);
    const nextW = clamp(Number((curW * mul).toFixed(2)), minW, 200);
    const nextD = clamp(Number((curD * mul).toFixed(2)), minD, 200);
    const nextH = clamp(Number((curH * mul).toFixed(2)), minH, 40);
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
      `Skala Ruangan "${room.name}": ${nextW.toFixed(1)}×${nextD.toFixed(1)}×${nextH.toFixed(1)}m (${pct}%)`
    );
    return true;
  }

  shouldShowElevationGuide(devId) {
    if (!devId || this.avatarMode || this.simulatorFocusedDeviceId) return false;
    if (this.dragMoveState) {
      if (this.dragMoveState.deviceId === devId) return true;
      if (Array.isArray(this.dragMoveState.peers) && this.dragMoveState.peers.some((p) => p?.id === devId)) {
        return true;
      }
    }
    if (this._activeMoveGuideIds?.has(devId)) return true;
    const isSelected = Boolean(this.deviceManager?.isDeviceSelected?.(devId)) || this.deviceManager?.selectedDeviceId === devId;
    return Boolean(this.navTool === 'move' && isSelected);
  }

  syncElevationGuides() {
    if (!this.deviceMeshMap) return;
    this.deviceMeshMap.forEach((holder, devId) => {
      const showGuide = this.shouldShowElevationGuide(devId);
      holder.traverse((child) => {
        if (child.userData?.isElevationGuide) {
          child.visible = showGuide;
        }
      });
    });
  }

  flashMoveElevationGuide(deviceIds = [], durationMs = 950) {
    if (!this._activeMoveGuideIds) this._activeMoveGuideIds = new Set();
    this._activeMoveGuideIds.clear();
    (Array.isArray(deviceIds) ? deviceIds : [deviceIds]).forEach((id) => {
      if (id) this._activeMoveGuideIds.add(id);
    });
    this.syncElevationGuides();
    if (this._moveGuideTimer) {
      clearTimeout(this._moveGuideTimer);
      this._moveGuideTimer = null;
    }
    if (this._activeMoveGuideIds.size > 0) {
      this._moveGuideTimer = setTimeout(() => {
        this._moveGuideTimer = null;
        this._activeMoveGuideIds?.clear();
        this.syncElevationGuides();
      }, durationMs);
      this._moveGuideTimer?.unref?.();
    }
  }

  syncSelectionRings() {
    if (!this.isInitialized || !this.deviceMeshMap) return;
    const hideDevRings = Boolean(this.isBuildingEditWorkspace?.());
    const primaryId = hideDevRings ? null : this.deviceManager?.selectedDeviceId;
    this.deviceMeshMap.forEach((holder, devId) => {
      const isPrimary = !hideDevRings && primaryId === devId;
      const isSelected = !hideDevRings && (Boolean(this.deviceManager?.isDeviceSelected?.(devId)) || isPrimary);
      holder.traverse((child) => {
        if (child.userData?.isSelectionRing) {
          child.visible = isSelected;
          if (child.material?.color) {
            child.material.color.setHex(isPrimary ? 0xfacc15 : 0x38bdf8);
          }
        }
      });
    });
    this.syncElevationGuides();
    this.syncTransformGizmo?.();
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

    // Arrow keys are dedicated exclusively to moving/nudging selected devices; WASD/QE control 3D camera
    if (this.keysPressed.has('w')) forward += 1;
    if (this.keysPressed.has('s')) forward -= 1;
    if (this.keysPressed.has('d')) right += 1;
    if (this.keysPressed.has('a')) right -= 1;
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
    if (this._touchActiveInSession || isMobileTouchDevice()) return;
    if (typeof document === 'undefined' || !this.renderer?.domElement) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    try {
      const res = this.renderer.domElement.requestPointerLock?.();
      if (res && typeof res.catch === 'function') {
        res.catch(() => { });
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
    const isPullingCable = Boolean(this.activeCablePull);
    if (this.avatarGroup) {
      this.avatarGroup.visible = Boolean(this.avatarMode && !isFppFreeRoam && !isFocusedHide);
    }
    if (isFppFreeRoam && !this.fppViewmodelGroup) {
      this.fppViewmodelGroup = createFppHandsViewmodelGroup();
    }
    if (isFppFreeRoam && isPullingCable && !this.fppCableSpoolGroup) {
      const catDef = CABLE_CATEGORIES[this.activeCablePull?.cableCategory || 'cat6'] || CABLE_CATEGORIES.cat6;
      this.fppCableSpoolGroup = createFppCableSpoolViewmodelGroup(catDef.color || '#2563eb');
    }
    if (this.fppViewmodelGroup) {
      if (isFppFreeRoam && !isPullingCable && this.scene && !this.scene.children.includes(this.fppViewmodelGroup)) {
        this.scene.add(this.fppViewmodelGroup);
      }
      this.fppViewmodelGroup.visible = isFppFreeRoam && !isPullingCable;
    }
    if (this.fppCableSpoolGroup) {
      if (isFppFreeRoam && isPullingCable && this.scene && !this.scene.children.includes(this.fppCableSpoolGroup)) {
        this.scene.add(this.fppCableSpoolGroup);
      }
      if (isPullingCable) {
        const catDef = CABLE_CATEGORIES[this.activeCablePull?.cableCategory || 'cat6'] || CABLE_CATEGORIES.cat6;
        this.fppCableSpoolGroup.userData?.setCableColor?.(catDef.color || '#2563eb');
      }
      this.fppCableSpoolGroup.visible = isFppFreeRoam && isPullingCable;
    }
  }

  syncFppViewmodelTransform() {
    const activeVm = (this.fppCableSpoolGroup && this.fppCableSpoolGroup.visible)
      ? this.fppCableSpoolGroup
      : ((this.fppViewmodelGroup && this.fppViewmodelGroup.visible) ? this.fppViewmodelGroup : null);
    if (!activeVm || !this.camera) return;
    activeVm.position.copy(this.camera.position);
    activeVm.quaternion.copy(this.camera.quaternion);
    const swayRoot = activeVm.userData?.swayRoot;
    if (swayRoot) {
      const moving = Boolean(this.avatarState.isMoving && this.avatarState.isGrounded);
      const phase = Number(this.avatarState.walkPhase) || 0;
      const amp = this.avatarState.isRunning ? 0.018 : 0.011;
      const sx = moving ? Math.cos(phase) * amp : 0;
      const sy = moving ? Math.abs(Math.sin(phase)) * amp : 0;
      swayRoot.position.set(0.32 + sx, -0.27 + sy, -0.52);
    }
    const drum = activeVm.userData?.spoolDrum;
    if (drum && this.activeCablePull) {
      drum.rotation.x = Number(this.activeCablePull.spoolSpin) || 0;
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
    this.configureControlsForAvatarMode(true);
    this.syncAvatarMeshVisibilityForPerspective();
    this.updateBuildingSignboardsVisibility?.();
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
    this.camera.lookAt?.(target);
    this.camera.updateMatrixWorld?.();
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
  }

  /** Handle touch pinch/swipe and desktop mouse cursor-follow or drag-look while in Mode Teknisi. */
  handleAvatarPointerMove(e, dom = this.renderer?.domElement) {
    if (!this.avatarMode || this.simulatorFocusedDeviceId || !e) return false;
    if (e.pointerType === 'touch') {
      const prevTouch = this._avatarTouchPointers.get(e.pointerId);
      this._avatarTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._avatarTouchPointers.size >= 2) {
        const pts = Array.from(this._avatarTouchPointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 0;
        if (this._avatarTouchPinchDist > 0 && dist > 0) {
          const pinchDelta = this._avatarTouchPinchDist - dist;
          if (this.avatarPerspective === 'fpp' && pinchDelta > 16) {
            this.avatarState.camDist = 2.6;
            this.setAvatarPerspective('tpp');
          } else if (this.avatarPerspective === 'tpp' && Math.abs(pinchDelta) > 1.5) {
            const nextDist = (this.avatarState.camDist || 5.8) + pinchDelta * 0.032;
            if (nextDist <= 1.7) {
              this.avatarState.camDist = 2.0;
              this.setAvatarPerspective('fpp');
            } else {
              this.avatarState.camDist = clamp(nextDist, 2.0, 22.0);
              this.syncAvatarCameraFromAngles();
            }
          }
        }
        this._avatarTouchPinchDist = dist;
        return true;
      }
      if (prevTouch) {
        const dx = e.clientX - prevTouch.x;
        const dy = e.clientY - prevTouch.y;
        if (dx !== 0 || dy !== 0) {
          this.applyAvatarMouseLookDelta(dx, dy);
        }
      }
      return true;
    }

    const isLocked = typeof document !== 'undefined' && dom && document.pointerLockElement === dom;
    if (isLocked) {
      this.avatarState._lastMouseClient = null;
      const dx = Math.abs(e.movementX || 0) <= 250 ? (e.movementX || 0) : 0;
      const dy = Math.abs(e.movementY || 0) <= 250 ? (e.movementY || 0) : 0;
      if (dx !== 0 || dy !== 0) {
        this.applyAvatarMouseLookDelta(dx, dy);
      }
      return true;
    }

    // Support smooth cursor mouse-look in both Lab Jaringan and Studio Bangunan:
    // moving cursor hovers camera view (hold Alt to pause), and Left/Right/Middle drag also rotates view
    const buttons = Number(e.buttons) || 0;
    const allowHoverLook = buttons === 0 && !e.altKey;
    const allowDragLook = ((buttons & 1) !== 0) || ((buttons & 2) !== 0) || ((buttons & 4) !== 0);
    if (allowHoverLook || allowDragLook) {
      const prev = this.avatarState._lastMouseClient;
      this.avatarState._lastMouseClient = { x: e.clientX, y: e.clientY };
      if (prev) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= 200 && Math.abs(dy) <= 200) {
          this.applyAvatarMouseLookDelta(dx, dy);
          return true;
        }
      }
      return false;
    }

    this.avatarState._lastMouseClient = null;
    return false;
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
      this.avatarSimDeckOpen = false;
      this.avatarSimSettingsOpen = false;
      this.mobileJumpHeld = false;
      this.resetMobileJoystick?.();
      this._avatarTouchPointers?.clear?.();
      this._avatarTouchPinchDist = 0;
      if (this.avatarGroup) {
        this.avatarGroup.visible = false;
      }
      if (this.fppViewmodelGroup) {
        this.fppViewmodelGroup.visible = false;
      }
      this.updateAvatarDeviceLabelsVisibility?.();
      this.updateBuildingSignboardsVisibility?.();
      this.syncElevationGuides?.();
      this.syncTransformGizmo?.();
      this.renderRoad3dHudBar?.();
      this.releaseAvatarPointerLock();
      this.syncAvatarCrosshair();
      this.syncAvatarControlsUI();
      this.syncMobileRobloxControlsVisibility?.();
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
      eventBus.emit('map3d:avatar-toggled', { active: false });
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
    const selectedId = this.isBuildingEditWorkspace?.() ? null : this.deviceManager?.selectedDeviceId;
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
    this.syncElevationGuides?.();
    this.syncTransformGizmo?.();
    this.renderRoad3dHudBar?.();
    this.syncAvatarMeshVisibilityForPerspective();
    this.updateBuildingSignboardsVisibility?.();
    this.syncAvatarControlsUI();
    this.syncAvatarCrosshair();
    this.findNearestDeviceToAvatar();
    if (isMobileTouchDevice()) {
      let savedHudMin = null;
      try {
        savedHudMin = typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_avatar_hud_min_v1') : null;
      } catch { /* ignore */ }
      if (savedHudMin === null) {
        this.avatarHudMinimized = true;
      }
    }
    this.renderAvatarHudBar();
    this.bindMobileRobloxControls?.();
    this.syncMobileRobloxControlsVisibility?.();
    this.tryLockAvatarPointer();
    this.publishLocalPresence?.(true);
    this.showStatusHint(
      this.avatarPerspective === 'fpp'
        ? 'Mode FPP aktif: Gerakkan mouse lihat dari mata teknisi, WASD jalan, Spasi lompat, V ke TPP, F inspeksi.'
        : 'Mode Teknisi aktif: Gerakkan mouse lihat sekeliling, WASD jalan, Shift lari, Spasi lompat, V ke FPP, F inspeksi.'
    );
    eventBus.emit('map3d:avatar-toggled', { active: true, perspective: this.avatarPerspective });
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
    if (this.isBuildingEditWorkspace?.()) {
      if (this.avatarState) {
        this.avatarState.nearestDeviceId = null;
        this.avatarState.nearestDist = Infinity;
      }
      return { deviceId: null, distance: Infinity };
    }
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
    if (this.isBuildingEditWorkspace?.()) return false;
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

  findAimedPickableObjectFromCrosshair(carriedIds = new Set()) {
    if (!this.camera || !this.raycaster) return null;
    if (!this.camera.isPerspectiveCamera && !this.camera.isOrthographicCamera) return null;
    try {
      this.camera.updateMatrixWorld?.();
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    } catch {
      return null;
    }

    const maxAimDist = Math.max(14, (Number(this.objectCarryReachMeters) || 6.5) * 2.4);
    let bestHit = null;

    if (!this.workspaceGhostDevices && this.devicesGroup?.visible && this.devicesGroup.children?.length > 0) {
      const devHits = (!this.isBuildingEditWorkspace?.() && this.devicesGroup?.visible)
        ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true))
        : [];
      for (const h of devHits) {
        if (!Number.isFinite(h.distance) || h.distance > maxAimDist) break;
        const devId = this.findDeviceIdFromObject?.(h.object);
        if (!devId || carriedIds.has(devId)) continue;
        const dev = this.deviceManager?.getDeviceById?.(devId);
        if (!dev || dev.layerVisible === false || dev.layerLocked === true) continue;
        bestHit = {
          kind: 'device',
          id: dev.id,
          name: dev.name || 'Perangkat',
          obj: dev,
          dev,
          distance: h.distance,
          source: 'aim'
        };
        break;
      }
    }

    if (!this.roomsLocked && this.objects3dGroup?.visible && this.objects3dGroup.children?.length > 0) {
      const objHits = this._filterVisibleRayHits(this.raycaster.intersectObjects(this.objects3dGroup.children, true));
      for (const h of objHits) {
        if (!Number.isFinite(h.distance) || h.distance > maxAimDist) break;
        if (bestHit && h.distance >= bestHit.distance) break;
        let curr = h.object;
        let objId = null;
        while (curr && !objId) {
          if (curr.userData?.object3dId) objId = curr.userData.object3dId;
          curr = curr.parent;
        }
        if (!objId || carriedIds.has(objId) || this.isObject3dLocked?.(objId)) continue;
        const obj = stateManager?.getObject3dById?.(objId);
        if (!obj || obj.visible === false || obj.locked === true) continue;
        bestHit = {
          kind: 'object3d',
          id: obj.id,
          name: obj.name || 'Objek 3D',
          obj,
          dev: null,
          distance: h.distance,
          source: 'aim'
        };
        break;
      }
    }

    return bestHit;
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
    const ay = Number(this.avatarState.y) || 0;
    const az = Number(this.avatarState.z) || 0;
    const yaw = Number(this.avatarState.yaw) || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const maxReach = Number(this.objectCarryReachMeters) || 6.5;

    // Priority 1: Explicitly selected Device or 3D Object (yellow selection ring)
    // Guarantees 1-by-1 accurate pickup even when multiple devices are tightly stacked/adjacent.
    const selDevId = !this.isBuildingEditWorkspace?.() ? (this.deviceManager?.selectedDeviceId || null) : null;
    if (selDevId && !carriedIds.has(selDevId)) {
      const selDev = this.deviceManager?.getDeviceById?.(selDevId);
      if (selDev && selDev.layerVisible !== false && selDev.layerLocked !== true) {
        const effPos = this.effectivePosMap?.get(selDev.id);
        const pos = effPos || (this.normToWorld && selDev.position ? this.normToWorld(selDev.position.x, selDev.position.y) : null);
        const selElev = Number(selDev.spatial3d?.elevationMeters) || 0;
        const dist3d = pos
          ? Math.hypot((pos.x ?? 0) - ax, ((pos.y ?? selElev) - (ay + 1.5)), (pos.z ?? 0) - az)
          : 0;
        return {
          kind: 'device',
          id: selDev.id,
          name: selDev.name || 'Perangkat',
          obj: selDev,
          dev: selDev,
          distance: dist3d,
          source: 'selected'
        };
      }
    }

    const selObjId = stateManager?.getSelectedObject3dId?.() || null;
    if (selObjId && !carriedIds.has(selObjId) && !this.roomsLocked && !this.isObject3dLocked?.(selObjId)) {
      const selObj = stateManager?.getObject3dById?.(selObjId);
      if (selObj && selObj.visible !== false && selObj.locked !== true) {
        const pos = this.normToWorld ? this.normToWorld(selObj.x ?? 0.5, selObj.y ?? 0.5) : { x: 0, z: 0 };
        const dist3d = Math.hypot((pos.x ?? 0) - ax, ((Number(selObj.elevationMeters) || 0) - ay), (pos.z ?? 0) - az);
        return {
          kind: 'object3d',
          id: selObj.id,
          name: selObj.name || 'Objek 3D',
          obj: selObj,
          dev: null,
          distance: dist3d,
          source: 'selected'
        };
      }
    }

    // Priority 2: Direct 3D Crosshair Raycast Aim (FPP / TPP center reticle)
    const aimed = this.findAimedPickableObjectFromCrosshair(carriedIds);
    if (aimed) {
      return aimed;
    }

    // Priority 3: Nearest reachable proximity fallback (with 3D elevation & camera look direction)
    let lookDir3 = null;
    if (this.camera && typeof this.camera.getWorldDirection === 'function') {
      try {
        lookDir3 = new THREE.Vector3();
        this.camera.getWorldDirection(lookDir3);
      } catch {
        lookDir3 = null;
      }
    }
    const eyeY = ay + 1.66 * resolveEngineAvatarScale(this);
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
    const devices = (!this.isBuildingEditWorkspace?.() && typeof this.deviceManager?.getAllDevices === 'function')
      ? this.deviceManager.getAllDevices()
      : [];
    for (const dev of devices) {
      if (!dev || dev.layerVisible === false || dev.layerLocked === true || carriedIds.has(dev.id)) continue;
      const effPos = this.effectivePosMap?.get(dev.id);
      const pos = effPos || (this.normToWorld && dev.position ? this.normToWorld(dev.position.x, dev.position.y) : null);
      if (!pos) continue;
      const sp = dev.spatial3d || getDefaultSpatial3d(dev.type);
      const userModelScale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
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
      const devY = Number.isFinite(pos.y) ? pos.y : devElev;
      let aimBonus = dot > 0.45 ? 0.65 : 0;
      if (lookDir3) {
        const toDev = new THREE.Vector3(dx, devY - eyeY, dz);
        const len3 = toDev.length();
        if (len3 > 0.01) {
          const dot3 = toDev.dot(lookDir3) / len3;
          if (dot3 > 0.85) aimBonus = Math.max(aimBonus, 1.35);
          else if (dot3 > 0.65) aimBonus = Math.max(aimBonus, 0.9);
        }
      }
      const mountedOnUncarriedObj = objects.some(
        (o) =>
          o &&
          o.visible !== false &&
          !carriedIds.has(o.id) &&
          Math.hypot((dev.position?.x ?? 0) - (o.x ?? 0.5), (dev.position?.y ?? 0) - (o.y ?? 0.5)) < 0.018 &&
          devElev >= (Number(o.elevationMeters) || 0)
      );
      // If device is mounted onto an uncarried rack/pole/table, prefer lifting the parent structure first
      const score = edgeDist - aimBonus + (mountedOnUncarriedObj ? 1.8 : 0);
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
        distance: best.distance,
        source: 'nearest'
      }
      : null;
  }

  pickupNearestObjectFromAvatar() {
    if (!this.avatarMode) return false;
    if (this.activeCablePull || this.pendingCableSourceId || stateManager.getMode?.() === 'draw-cable') {
      return false;
    }
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
    if (this.activeCablePull || this.pendingCableSourceId || stateManager.getMode?.() === 'draw-cable') {
      return false;
    }
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
      carryElevationOffset: 0,
      mountedPeers
    });

    this.avatarState.isCarrying = true;
    this.updateCarriedObjectsTransform();
    this.updateAvatarProximityHud();
    this.publishLocalPresence?.(true);
    this.showStatusHint(
      `Mengangkat "${obj.name || 'Objek 3D'}" (${this.carriedObjects.length} dibawa) — E tambah lagi • Q taruh • Shift+Q taruh semua • [ / ] putar`
    );
    return true;
  }

  pickupDeviceFromAvatar(devId) {
    if (this.isBuildingEditWorkspace?.() || !this.avatarMode || !devId) return false;
    if (this.activeCablePull || this.pendingCableSourceId || stateManager.getMode?.() === 'draw-cable') {
      return false;
    }
    if (!this._canAvatarCarryMoreAndWrite()) return false;

    const dev = this.deviceManager?.getDeviceById?.(devId);
    if (!dev || dev.layerVisible === false || dev.layerLocked === true) return false;
    if (this.carriedObjects.some((c) => c.devId === dev.id || c.objId === dev.id || c.mountedPeers?.some((p) => p?.id === dev.id))) return false;

    const sp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    const userModelScale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
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
      carryElevationOffset: 0,
      portInitials: this._collectDevicePortInitials?.(dev.id) || [],
      mountedPeers: []
    });

    this.avatarState.isCarrying = true;
    this.updateCarriedObjectsTransform();
    this.updateAvatarProximityHud();
    this.publishLocalPresence?.(true);
    this.showStatusHint(
      `Mengangkat "${dev.name}" (${this.carriedObjects.length} dibawa) — E tambah lagi • Q taruh • Shift+Q taruh semua • [ / ] putar`
    );
    return true;
  }

  _getAvatarWallAimRay(maxDistOverride = null) {
    const ax = Number(this.avatarState?.x) || 0;
    const ay = Number(this.avatarState?.y) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const scale = resolveEngineAvatarScale(this);
    if ((this.avatarPerspective === 'fpp' || maxDistOverride !== null) && typeof this.getAvatarFollowCameraPose === 'function') {
      const pose = this.getAvatarFollowCameraPose(this.avatarState?.camDist);
      const dir = pose.target.clone().sub(pose.endPos).normalize();
      const origin = this.avatarPerspective === 'fpp'
        ? pose.endPos.clone()
        : new THREE.Vector3(ax, ay + 1.42 * scale, az);
      const fallbackMax = Number((4.2 + Math.max(0, scale - 1) * 0.8).toFixed(2));
      return { origin, dir, maxDist: Number(maxDistOverride) || fallbackMax };
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
          holder.children?.forEach((c) => {
            if (c?.userData?.isDeviceLabel) c.visible = false;
          });
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
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
  }

  dropCarriedDevicesOnly() {
    if (!Array.isArray(this.carriedObjects) || this.carriedObjects.length === 0) return 0;
    const keep = [];
    const devItems = [];
    for (const item of this.carriedObjects) {
      if (item?.kind === 'device') devItems.push(item);
      else keep.push(item);
    }
    if (devItems.length === 0) return 0;
    this.carriedObjects = devItems;
    const dropped = this.dropCarriedObjectsFromAvatar({ dropAll: true, silent: true });
    this.carriedObjects = keep;
    if (this.avatarState) this.avatarState.isCarrying = this.carriedObjects.length > 0;
    this.updateCarriedObjectsTransform?.();
    this.updateAvatarProximityHud?.();
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
    return dropped;
  }

  dropCarriedObjectsFromAvatar({ dropAll = false, silent = false, useAimTarget = false } = {}) {
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
      const normRotY = this.applyBuildAngleSnap
        ? this.applyBuildAngleSnap(worldRotY)
        : (((Math.round(worldRotY) % 360) + 360) % 360);
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
    const surfaceSnapOn = this.buildPlacementConfig?.surfaceSnapEnabled !== false;
    const firstDevItem = placements.find((p) => p.item.kind === 'device');
    const aimRay = (!silent && surfaceSnapOn && firstDevItem)
      ? this._getAvatarWallAimRay(useAimTarget ? 6.8 : null)
      : null;
    const sampleDev = firstDevItem ? this.deviceManager?.getDeviceById?.(firstDevItem.item.devId) : null;
    const wallMountHit = (aimRay && sampleDev)
      ? this.find3DWallMountTarget(aimRay.origin, aimRay.dir, aimRay.maxDist, { device: sampleDev, minHitY: 0.25, maxHitY: 12.0 })
      : null;
    const floorAimTarget = (useAimTarget && !wallMountHit)
      ? this.computeAvatarAimPlacementTarget?.({ item: placements[0]?.item || null })
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
        const rawWallElev = (this.avatarPerspective === 'fpp' || useAimTarget)
          ? clamp(devHit.elevationMeters, 0.25, 11.5)
          : clamp(avatarBaseY + Math.max(1.35, defaultElev), 0.35, 11.5);
        const carryZ = Number(item.carryElevationOffset) || 0;
        dropElev = Number(clamp(rawWallElev + carryZ, 0, 20).toFixed(2));
        targetRotY = devHit.rotationY;
        wallMountedThisItem = true;
        mountedOnWallCount += 1;
      } else {
        if (floorAimTarget && Number.isFinite(floorAimTarget.worldX) && Number.isFinite(floorAimTarget.worldZ)) {
          rawDropX = floorAimTarget.worldX + rightX * latOffset;
          rawDropZ = floorAimTarget.worldZ + rightZ * latOffset;
        } else {
          const fwdDist = placements.length === 1
            ? Math.max(1.35, avatarRadius + projFwd + 0.35)
            : Math.max(1.5, avatarRadius + maxProjFwd + 0.4);

          rawDropX = ax + fwdX * fwdDist + rightX * latOffset;
          rawDropZ = az + fwdZ * fwdDist + rightZ * latOffset;
        }
        if (this.applyBuildGridSnapWorld) {
          const snappedXZ = this.applyBuildGridSnapWorld(rawDropX, rawDropZ);
          rawDropX = snappedXZ.x;
          rawDropZ = snappedXZ.z;
        }
        dropNorm = this.worldToNorm ? this.worldToNorm(rawDropX, rawDropZ) : { normX: 0.5, normY: 0.5 };
        dropWorld = this.normToWorld ? this.normToWorld(dropNorm.normX, dropNorm.normY) : { x: rawDropX, z: rawDropZ };
        const carryZ = Number(item.carryElevationOffset) || 0;
        const rawBaseElev = surfaceSnapOn
          ? this.getCarriedDropSupportElevation(dropWorld.x, dropWorld.z, item.objId || item.devId)
          : Math.max(0, Number(this.avatarState?.y) || 0);
        dropElev = Number(clamp(rawBaseElev + carryZ, 0, 20).toFixed(2));

        if (!this.buildPlacementConfig?.allowClipping && this.resolveBuildPlacementCollision && item.kind === 'device') {
          const colRes = this.resolveBuildPlacementCollision(dropWorld.x, dropWorld.z, dropElev, {
            halfW: (item.widthMeters || 0.9) * 0.5,
            halfD: (item.depthMeters || 0.7) * 0.5,
            height: item.heightMeters || 0.45,
            excludeIds: [item.devId]
          });
          if (colRes.collided) {
            dropNorm = this.worldToNorm ? this.worldToNorm(colRes.x, colRes.z) : dropNorm;
            dropWorld = this.normToWorld ? this.normToWorld(dropNorm.normX, dropNorm.normY) : { x: colRes.x, z: colRes.z };
            const bumpedBase = surfaceSnapOn
              ? this.getCarriedDropSupportElevation(dropWorld.x, dropWorld.z, item.objId || item.devId)
              : Math.max(0, Number(this.avatarState?.y) || 0);
            dropElev = Number(clamp(bumpedBase + carryZ, 0, 20).toFixed(2));
          }
        }
      }

      if (item.kind === 'device') {
        needsDeviceSync = true;
        const holder = this.deviceMeshMap?.get(item.devId);
        if (holder) {
          holder.scale.setScalar(1);
          holder.rotation.y = 0;
          holder.userData.isCarriedByAvatar = false;
          holder.children?.forEach((c) => {
            if (c?.userData?.isDeviceLabel) c.visible = true;
          });
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
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
    this.publishLocalPresence?.(true);

    if (!silent) {
      let msg;
      if (mountedOnWallCount > 0) {
        msg = mountedOnWallCount === 1 && toDrop.length === 1
          ? `Menempelkan "${toDrop[0].name}" langsung ke dinding 3D ruangan${this.carriedObjects.length > 0 ? ` (sisa dibawa: ${this.carriedObjects.length})` : ''}`
          : `Menempelkan ${mountedOnWallCount} perangkat ke dinding 3D ruangan`;
      } else {
        msg = toDrop.length === 1
          ? `Menaruh "${toDrop[0].name}"${this.carriedObjects.length > 0 ? ` (sisa dibawa: ${this.carriedObjects.length})` : ''}`
          : `Menaruh ${toDrop.length} item sekaligus ke posisi teknisi`;
      }
      this.showStatusHint(msg);
    }
    return toDrop.length;
  }

  setAvatarLabelMode(mode = 'proximity') {
    const valid = ['proximity', 'all', 'off'];
    this.avatarLabelMode = valid.includes(mode) ? mode : 'proximity';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('netmap_avatar_label_mode_v1', this.avatarLabelMode);
      }
    } catch { /* ignore */ }
    this.updateAvatarDeviceLabelsVisibility();
    this.showStatusHint(
      this.avatarLabelMode === 'proximity'
        ? 'Label 3D: Hanya tampilkan perangkat terdekat agar pandangan bersih.'
        : (this.avatarLabelMode === 'off'
          ? 'Label 3D: Disembunyikan di Mode Teknisi.'
          : 'Label 3D: Tampilkan semua perangkat.')
    );
    return this.avatarLabelMode;
  }

  updateAvatarDeviceLabelsVisibility() {
    if (!this.deviceMeshMap || this.deviceMeshMap.size === 0) return;
    if (this.isBuildingEditWorkspace?.()) {
      this.deviceMeshMap.forEach((holder) => {
        holder.children?.forEach((c) => {
          if (c?.userData?.isDeviceLabel) c.visible = false;
        });
      });
      return;
    }
    if (!this.avatarMode) {
      this.deviceMeshMap.forEach((holder) => {
        if (holder.userData?.isCarriedByAvatar) return;
        holder.children?.forEach((c) => {
          if (c?.userData?.isDeviceLabel) c.visible = Boolean(this.showLabels);
        });
      });
      return;
    }

    const mode = this.avatarLabelMode || 'proximity';
    const visibleLabelIds = new Set();
    if (mode === 'proximity') {
      const selId = this.deviceManager?.selectedDeviceId;
      const nearId = this.avatarState?.nearestDeviceId;
      if (selId) visibleLabelIds.add(selId);
      if (nearId) visibleLabelIds.add(nearId);
      const ax = Number(this.avatarState?.x) || 0;
      const az = Number(this.avatarState?.z) || 0;
      const ranked = [];
      this.effectivePosMap?.forEach((pos, devId) => {
        const d = Math.hypot((pos?.x ?? 0) - ax, (pos?.z ?? 0) - az);
        if (d <= 16.0) ranked.push({ devId, d });
      });
      ranked.sort((a, b) => a.d - b.d);
      ranked.slice(0, 4).forEach((item) => visibleLabelIds.add(item.devId));
    }

    this.deviceMeshMap.forEach((holder, devId) => {
      if (holder.userData?.isCarriedByAvatar) {
        holder.children?.forEach((c) => {
          if (c?.userData?.isDeviceLabel) c.visible = false;
        });
        return;
      }
      const showThis = this.showLabels && (
        mode === 'all' ||
        (mode === 'proximity' && visibleLabelIds.has(devId))
      );
      holder.children?.forEach((c) => {
        if (c?.userData?.isDeviceLabel) c.visible = Boolean(showThis);
      });
    });
  }

  cycleAvatarTargetDevice(step = 1) {
    const devs = (this.deviceManager?.getAllDevices?.() || [])
      .filter((d) => d && d.layerVisible !== false)
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    if (devs.length === 0) {
      this.showStatusHint('Belum ada perangkat di denah.');
      return null;
    }
    const curId = this.avatarState?.nearestDeviceId || this.deviceManager?.selectedDeviceId || null;
    let idx = devs.findIndex((d) => d.id === curId);
    if (idx < 0) idx = step >= 0 ? -1 : 0;
    const nextIdx = ((idx + step) % devs.length + devs.length) % devs.length;
    const nextDev = devs[nextIdx];
    this.deviceManager?.selectDevice?.(nextDev.id);
    if (this.effectivePosMap?.has(nextDev.id)) {
      this.teleportAvatarToDevice(nextDev.id);
    }
    this.updateAvatarDeviceLabelsVisibility();
    this.renderAvatarSimDeckList?.();
    this.showStatusHint(`Fokus ke "${nextDev.name}" (${nextIdx + 1}/${devs.length})`);
    return nextDev;
  }

  _resolveAvatarTargetDevices({ radiusMeters = 12, fallbackCluster = true } = {}) {
    const carriedIds = [];
    const seen = new Set();
    if (Array.isArray(this.carriedObjects)) {
      this.carriedObjects.forEach((c) => {
        if (c?.kind === 'device' && c.devId && !seen.has(c.devId)) {
          const d = this.deviceManager?.getDeviceById?.(c.devId);
          if (d && !d.layerLocked && d.layerVisible !== false) {
            seen.add(c.devId);
            carriedIds.push(d);
          }
        }
      });
    }
    if (carriedIds.length > 0) return { devices: carriedIds, fromCarried: true };

    const allUnlocked = (this.deviceManager?.getAllDevices?.() || [])
      .filter((d) => d && d.layerVisible !== false && !d.layerLocked && d.position);
    if (allUnlocked.length === 0) return { devices: [], fromCarried: false };

    const ax = Number(this.avatarState?.x) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const withDist = allUnlocked.map((dev) => {
      const w = this.effectivePosMap?.get(dev.id)
        || (this.normToWorld ? this.normToWorld(dev.position.x, dev.position.y) : { x: 0, z: 0 });
      return { dev, dist: Math.hypot((w?.x ?? 0) - ax, (w?.z ?? 0) - az) };
    }).sort((a, b) => a.dist - b.dist);

    const nearby = withDist.filter((entry) => entry.dist <= radiusMeters).map((entry) => entry.dev);
    if (nearby.length > 0) return { devices: nearby, fromCarried: false };

    if (fallbackCluster && withDist.length > 0) {
      return { devices: withDist.slice(0, 8).map((entry) => entry.dev), fromCarried: false };
    }
    return { devices: [], fromCarried: false };
  }

  /** Resets any manual Z elevation offset on carried items (or selected device in free-cam) back to floor/surface. */
  resetCarriedElevationOffset() {
    if (Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      this.carriedObjects.forEach((item) => {
        if (item) item.carryElevationOffset = 0;
      });
      this.syncSimplePlacementIndicator?.();
      this.renderHouseFlipperPromptHud?.();
      const aim = this.computeAvatarAimPlacementTarget?.({ item: this.carriedObjects[this.carriedObjects.length - 1] });
      this.showStatusHint(`Tinggi Z direset ke permukaan (${Number(aim?.elevationMeters ?? 0).toFixed(2)}m)`);
      return true;
    }

    const selId = this.deviceManager?.selectedDeviceId;
    const dev = selId ? this.deviceManager?.getDeviceById?.(selId) : null;
    if (!dev || dev.layerLocked) return false;
    const baseSp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    this.deviceManager?.updateDevice?.(dev.id, {
      spatial3d: { ...baseSp, elevationMeters: 0, offsetY: 0 }
    });
    if (this.isActive && this.isInitialized) {
      this.syncDevices();
      this.syncCables();
    }
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
    this.showStatusHint(`Tinggi Z "${dev.name}" direset ke lantai (0.00m)`);
    return true;
  }

  adjustAvatarTargetOrCarriedElevation(deltaMeters = 0.25) {
    const step = Number(deltaMeters) || 0;
    if (Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      const topItem = this.carriedObjects[this.carriedObjects.length - 1];
      const baseAim = this.computeAvatarAimPlacementTarget?.({ item: topItem, includeCarryOffset: false });
      const baseElev = Math.max(0, Number(baseAim?.baseElevationMeters ?? baseAim?.elevationMeters) || 0);
      let finalTargetElev = baseElev;
      this.carriedObjects.forEach((item) => {
        if (!item) return;
        const prevOff = Number(item.carryElevationOffset) || 0;
        const nextOff = clamp(prevOff + step, -baseElev, 20 - baseElev);
        item.carryElevationOffset = Number(nextOff.toFixed(2));
      });
      const updatedAim = this.computeAvatarAimPlacementTarget?.({ item: topItem, includeCarryOffset: true });
      finalTargetElev = Number(updatedAim?.elevationMeters ?? clamp(baseElev + (topItem?.carryElevationOffset || 0), 0, 20));
      this.syncSimplePlacementIndicator?.();
      this.renderHouseFlipperPromptHud?.();
      this.showStatusHint(`Ketinggian Z penempatan: ${finalTargetElev.toFixed(2)}m`);
      return true;
    }

    const targetId = this.deviceManager?.selectedDeviceId
      || (this.avatarMode && this.avatarState?.nearestDist <= 10 ? this.avatarState.nearestDeviceId : null)
      || (this.avatarMode ? this.avatarState?.nearestDeviceId : null);
    const dev = targetId ? this.deviceManager?.getDeviceById?.(targetId) : null;
    if (!dev || dev.layerLocked) {
      this.showStatusHint('Dekati atau bawa perangkat terlebih dahulu untuk ubah ketinggian Z.');
      return false;
    }

    const baseSp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    const curElev = Number(baseSp.elevationMeters) || 0;
    const nextElev = clamp(Number((curElev + step).toFixed(2)), 0, 20);
    this.deviceManager?.updateDevice?.(dev.id, {
      spatial3d: { ...baseSp, elevationMeters: nextElev }
    });

    if (this.isActive && this.isInitialized) {
      this.syncDevices();
      this.syncCables();
    }
    this.updateAvatarProximityHud();
    this.renderAvatarSimDeckList?.();
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
    this.showStatusHint(`Ketinggian "${dev.name}": ${nextElev.toFixed(2)}m`);
    return true;
  }

  rotateAvatarTargetOrCarriedToFace(deviceId = null) {
    const targetId = deviceId
      || (this.avatarState?.nearestDist <= 10 ? this.avatarState?.nearestDeviceId : null)
      || this.deviceManager?.selectedDeviceId
      || this.avatarState?.nearestDeviceId;
    const dev = targetId ? this.deviceManager?.getDeviceById?.(targetId) : null;
    if (!dev || dev.layerLocked) {
      this.showStatusHint('Dekati atau pilih perangkat yang tidak terkunci untuk diputar.');
      return false;
    }

    const pos = this.effectivePosMap?.get(dev.id)
      || (this.normToWorld && dev.position ? this.normToWorld(dev.position.x, dev.position.y) : { x: 0, z: 0 });
    const ax = Number(this.avatarState?.x) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const dx = ax - (pos?.x ?? 0);
    const dz = az - (pos?.z ?? 0);
    const faceDeg = Math.hypot(dx, dz) > 0.05
      ? ((Math.round((Math.atan2(dx, dz) * 180) / Math.PI) % 360) + 360) % 360
      : 0;

    const baseSp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    this.deviceManager?.updateDevice?.(dev.id, {
      spatial3d: { ...baseSp, rotationY: faceDeg }
    });
    if (this.isActive && this.isInitialized) {
      this.syncDevices();
      this.syncCables();
    }
    this.renderAvatarSimDeckList?.();
    this.showStatusHint(`⟳ "${dev.name}" diputar menghadap teknisi (${faceDeg}°)`);
    return true;
  }

  arrangeDevicesFromAvatar(layout = 'row', { deviceIds = null } = {}) {
    if (
      authManager?.isAuthenticated?.()
      && authManager.getActiveWorkspaceKey?.() === 'main'
      && authManager.isMainWorkspaceUnlocked?.() === false
    ) {
      this.showStatusHint('Server Utama terkunci (hanya lihat). Buka kunci dulu untuk merapikan perangkat.');
      return null;
    }

    let targets = [];
    let usingCarried = false;
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
      targets = deviceIds
        .map((id) => this.deviceManager?.getDeviceById?.(id))
        .filter((d) => d && !d.layerLocked && d.layerVisible !== false);
    } else {
      const resolved = this._resolveAvatarTargetDevices({ radiusMeters: 12, fallbackCluster: true });
      targets = resolved.devices;
      usingCarried = resolved.fromCarried;
    }

    if (targets.length === 0) {
      this.showStatusHint('Tidak ada perangkat yang dapat dirapikan.');
      return null;
    }

    if (usingCarried && Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      const targetIdSet = new Set(targets.map((d) => d.id));
      this.carriedObjects = this.carriedObjects.filter((c) => !(c?.kind === 'device' && targetIdSet.has(c.devId)));
      this.avatarState.isCarrying = this.carriedObjects.length > 0;
      targets.forEach((d) => {
        const holder = this.deviceMeshMap?.get(d.id);
        if (holder) {
          holder.scale.setScalar(1);
          holder.rotation.y = 0;
          holder.userData.isCarriedByAvatar = false;
        }
      });
    }

    const ax = Number(this.avatarState?.x) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const ay = Math.max(0, Number(this.avatarState?.y) || 0);
    const yaw = Number(this.avatarState?.yaw) || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const faceDeg = ((Math.round((Math.atan2(-fwdX, -fwdZ) * 180) / Math.PI) % 360) + 360) % 360;

    const moves = [];
    const sortedTargets = [...targets].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    const count = sortedTargets.length;
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));

    sortedTargets.forEach((dev, idx) => {
      let wx = ax + fwdX * 2.5;
      let wz = az + fwdZ * 2.5;
      let elev = Number((ay + 0.85).toFixed(2));

      if (layout === 'rack') {
        wx = ax + fwdX * 2.45;
        wz = az + fwdZ * 2.45;
        elev = Number((ay + 0.45 + idx * 0.55).toFixed(2));
      } else if (layout === 'grid') {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const colOffset = (col - (Math.min(cols, count) - 1) * 0.5) * 1.9;
        const rowOffset = row * 1.9;
        wx = ax + fwdX * (2.4 + rowOffset) + rightX * colOffset;
        wz = az + fwdZ * (2.4 + rowOffset) + rightZ * colOffset;
        elev = Number((ay + 0.85).toFixed(2));
      } else {
        // 'row': neat single simulator workbench line facing the technician
        const latOffset = (idx - (count - 1) * 0.5) * 1.75;
        wx = ax + fwdX * 2.6 + rightX * latOffset;
        wz = az + fwdZ * 2.6 + rightZ * latOffset;
        elev = Number((ay + 0.85).toFixed(2));
      }

      const norm = this.worldToNorm ? this.worldToNorm(wx, wz) : { normX: dev.position?.x ?? 0.5, normY: dev.position?.y ?? 0.5 };
      const nx = clamp(Number(norm.normX.toFixed(4)), 0.01, 0.99);
      const ny = clamp(Number(norm.normY.toFixed(4)), 0.01, 0.99);
      moves.push({ id: dev.id, position: { x: nx, y: ny }, elev, rotY: faceDeg });
    });

    if (typeof this.deviceManager?.moveDeviceGroup === 'function') {
      this.deviceManager.moveDeviceGroup(
        moves.map((m) => ({ id: m.id, position: m.position })),
        { syncRenderer: false }
      );
    }
    moves.forEach((m) => {
      const dev = this.deviceManager?.getDeviceById?.(m.id);
      if (!dev) return;
      const baseSp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
      this.deviceManager?.updateDevice?.(m.id, {
        spatial3d: { ...baseSp, elevationMeters: m.elev, rotationY: m.rotY, offsetX: 0, offsetY: 0, offsetZ: 0 }
      });
    });

    if (this.isActive && this.isInitialized) {
      this.syncDevices();
      this.syncCables();
    }
    this.findNearestDeviceToAvatar();
    this.updateAvatarProximityHud();
    this.renderAvatarSimDeckList?.();

    const modeName = layout === 'rack' ? 'Susun Rak Vertikal' : (layout === 'grid' ? 'Grid Rapi' : 'Baris Rapi');
    this.showStatusHint(`${moves.length} perangkat dirapikan (${modeName}) tepat di depan teknisi!`);
    return { count: moves.length, layout, moves };
  }

  resetMobileJoystick() {
    if (this.mobileJoystickState) {
      this.mobileJoystickState.active = false;
      this.mobileJoystickState.pointerId = null;
      this.mobileJoystickState.xRatio = 0;
      this.mobileJoystickState.yRatio = 0;
      this.mobileJoystickState.sprint = false;
    }
    if (typeof document !== 'undefined') {
      const knob = document.getElementById('mob-joystick-knob');
      const base = document.getElementById('mob-joystick-base');
      if (knob) knob.style.transform = 'translate3d(0, 0, 0)';
      base?.classList?.remove('is-sprinting');
    }
  }

  syncMobileRobloxControlsVisibility() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('mobile-roblox-controls');
    if (!el) return;
    const isTouchCapable = isMobileTouchDevice()
      || this._touchActiveInSession
      || Boolean(document.body?.classList?.contains('is-mobile-touch'))
      || Boolean(this.forceMobileHud);
    const show = Boolean(this.isActive && this.avatarMode && !this.simulatorFocusedDeviceId && isTouchCapable);
    el.classList.toggle('hidden', !show);
    el.style.display = show ? 'block' : 'none';
    if (!show) {
      this.mobileJumpHeld = false;
      this.resetMobileJoystick();
    } else {
      this.bindMobileRobloxControls();
      const perspBtn = document.getElementById('btn-mob-persp');
      const perspSpan = perspBtn?.querySelector('span');
      if (perspSpan) perspSpan.textContent = this.avatarPerspective === 'fpp' ? 'FPP' : 'TPP';
      perspBtn?.classList?.toggle('active', this.avatarPerspective === 'fpp');

      const cableCluster = document.getElementById('mob-cable-pull-cluster');
      if (cableCluster) {
        const pulling = Boolean(this.activeCablePull);
        cableCluster.classList.toggle('hidden', !pulling);
        cableCluster.style.display = pulling ? 'flex' : 'none';
      }
    }
  }

  bindMobileRobloxControls() {
    if (this._mobileRobloxControlsBound || typeof document === 'undefined') return;
    const root = document.getElementById('mobile-roblox-controls');
    if (!root) return;
    this._mobileRobloxControlsBound = true;

    const zone = document.getElementById('mob-joystick-zone');
    const base = document.getElementById('mob-joystick-base');
    const knob = document.getElementById('mob-joystick-knob');
    const maxR = 42;

    if (zone && base && knob) {
      const updateStickFromEvent = (ev) => {
        const dx = ev.clientX - this.mobileJoystickState.originX;
        const dy = ev.clientY - this.mobileJoystickState.originY;
        const dist = Math.hypot(dx, dy);
        const clamped = dist > maxR ? maxR : dist;
        const ang = dist > 0.001 ? Math.atan2(dy, dx) : 0;
        const cx = Math.cos(ang) * clamped;
        const cy = Math.sin(ang) * clamped;
        knob.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        const xRatio = cx / maxR;
        const yRatio = cy / maxR;
        const mag = Math.hypot(xRatio, yRatio);
        const sprint = mag >= 0.78;
        this.mobileJoystickState.xRatio = xRatio;
        this.mobileJoystickState.yRatio = yRatio;
        this.mobileJoystickState.sprint = sprint;
        base.classList.toggle('is-sprinting', sprint);
      };

      zone.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._touchActiveInSession = true;
        const rect = base.getBoundingClientRect();
        this.mobileJoystickState.active = true;
        this.mobileJoystickState.pointerId = ev.pointerId;
        this.mobileJoystickState.originX = rect.left + rect.width * 0.5;
        this.mobileJoystickState.originY = rect.top + rect.height * 0.5;
        zone.setPointerCapture?.(ev.pointerId);
        updateStickFromEvent(ev);
      });

      zone.addEventListener('pointermove', (ev) => {
        if (!this.mobileJoystickState.active || ev.pointerId !== this.mobileJoystickState.pointerId) return;
        ev.preventDefault();
        ev.stopPropagation();
        updateStickFromEvent(ev);
      });

      const releaseStick = (ev) => {
        if (this.mobileJoystickState.pointerId !== null && ev.pointerId !== this.mobileJoystickState.pointerId) return;
        zone.releasePointerCapture?.(ev.pointerId);
        this.resetMobileJoystick();
      };
      zone.addEventListener('pointerup', releaseStick);
      zone.addEventListener('pointercancel', releaseStick);
    }

    const jumpBtn = document.getElementById('btn-mob-jump');
    if (jumpBtn) {
      jumpBtn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.mobileJumpHeld = true;
      });
      const releaseJump = (ev) => {
        ev.stopPropagation();
        this.mobileJumpHeld = false;
      };
      jumpBtn.addEventListener('pointerup', releaseJump);
      jumpBtn.addEventListener('pointercancel', releaseJump);
      jumpBtn.addEventListener('pointerleave', releaseJump);
    }

    const bindTap = (id, fn) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        fn(ev);
      });
    };

    bindTap('btn-mob-persp', () => {
      this.toggleAvatarPerspective();
      this.syncMobileRobloxControlsVisibility();
    });
    bindTap('btn-mob-inspect', () => this.inspectNearestDeviceFromAvatar());
    bindTap('btn-mob-pickup', () => this.pickupNearestObjectFromAvatar());
    bindTap('btn-mob-drop', () => this.dropCarriedObjectsFromAvatar({ dropAll: false, useAimTarget: true }));
    bindTap('btn-mob-drop-all', () => this.dropCarriedObjectsFromAvatar({ dropAll: true, useAimTarget: true }));
    bindTap('btn-mob-rot-left', () => this.rotateSelectedIn3D({ dY: -15 }));
    bindTap('btn-mob-rot-right', () => this.rotateSelectedIn3D({ dY: 15 }));
    bindTap('btn-mob-cable-clip', () => this.placeAvatarCableClip());
    bindTap('btn-mob-cable-undo', () => this.undoAvatarCableClip());
    bindTap('btn-mob-cable-plug', () => {
      const pull = this.activeCablePull;
      const aim = this.computeAvatarCableAimTarget();
      const destId = (aim?.kind === 'device' && aim.deviceId && aim.deviceId !== pull?.sourceDeviceId)
        ? aim.deviceId
        : (pull?.targetDeviceId && pull.targetDeviceId !== pull?.sourceDeviceId ? pull.targetDeviceId : null);
      const destPort = (aim?.kind === 'device' && aim.deviceId === destId)
        ? (aim.portName || pull?.targetPort || '')
        : (pull?.targetPort || '');
      if (destId) {
        this.finishAvatarCablePull(destId, destPort);
      } else {
        this.showStatusHint('Arahkan crosshair atau klik perangkat tujuan terlebih dahulu untuk mencolok kabel.');
      }
    });
  }

  updateAvatarController(dt = 0.016) {
    if (!this.avatarMode) return;

    let forward = 0;
    let right = 0;
    if (this.keysPressed.has('w')) forward += 1;
    if (this.keysPressed.has('s')) forward -= 1;
    if (this.keysPressed.has('d')) right += 1;
    if (this.keysPressed.has('a')) right -= 1;

    let joyForward = 0;
    let joyRight = 0;
    let joySprint = false;
    let joyStrength = 1;
    if (this.mobileJoystickState?.active) {
      const jr = Number(this.mobileJoystickState.xRatio) || 0;
      const jy = Number(this.mobileJoystickState.yRatio) || 0;
      const mag = Math.hypot(jr, jy);
      if (mag > 0.12) {
        joyRight = jr;
        joyForward = -jy;
        joySprint = Boolean(this.mobileJoystickState.sprint);
        joyStrength = joySprint ? 1 : Math.min(1, Math.max(0.35, mag));
      }
    }
    forward += joyForward;
    right += joyRight;

    const jumpPressed = this.keysPressed.has('space') || Boolean(this.mobileJumpHeld);
    const hasMoveInput = Math.abs(forward) > 0.05 || Math.abs(right) > 0.05;
    const isRunning = this.keysPressed.has('shift') || joySprint;

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
        const speed = (isRunning ? 11.5 : 6.2) * (joyForward !== 0 || joyRight !== 0 ? joyStrength : 1);
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
      if (this.isObject3dPassThrough?.(obj)) continue;
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
        const userModelScale = (dev.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
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
      if (this.isRoomPassThrough?.(room)) continue;
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
      if (this.isRoomPassThrough?.(room)) continue;
      const roomGroup = this.room3dMeshMap?.get(room.id);
      const profile = roomGroup?.userData?.roomCollisionProfile;
      const colScale = roomGroup?.userData?.roomCollisionScale;
      const openDoorIndices = roomGroup?.userData?.openDoorIndices;
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
              if (tri.doorIdx >= 0 && openDoorIndices?.has(tri.doorIdx)) continue;
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
            if (tri.doorIdx >= 0 && openDoorIndices?.has(tri.doorIdx)) continue;

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
    if (!authManager?.isAuthenticated?.() || stateManager?.isStudentSandbox?.()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isActivelyMoving = this.avatarMode && Boolean(this.avatarState.isMoving);
    const hasRemotePeers = this.remoteAvatarMap && this.remoteAvatarMap.size > 0;
    const minIntervalMs = this.avatarMode
      ? (isActivelyMoving ? 32 : 120)
      : (hasRemotePeers ? 350 : 2500);
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

  setAvatarHudMinimized(minimized, { persist = true } = {}) {
    this.avatarHudMinimized = Boolean(minimized);
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('netmap_avatar_hud_min_v1', this.avatarHudMinimized ? '1' : '0');
      } catch { /* ignore storage errors */ }
    }
    if (typeof document !== 'undefined') {
      const hudEl = document.getElementById('hud-3d-avatar-bar');
      hudEl?.classList?.toggle('is-minimized', this.avatarHudMinimized);
      const minBtn = document.getElementById('btn-avatar-hud-minimize');
      if (minBtn) {
        minBtn.setAttribute('aria-expanded', String(!this.avatarHudMinimized));
        minBtn.textContent = this.avatarHudMinimized ? '▴ Panel' : '▾ Minimize';
      }
    }
    return this.avatarHudMinimized;
  }

  toggleAvatarHudMinimized() {
    return this.setAvatarHudMinimized(!this.avatarHudMinimized);
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
    const isMin = Boolean(this.avatarHudMinimized);
    const isDeckOpen = Boolean(this.avatarSimDeckOpen);
    const isSettingsOpen = Boolean(this.avatarSimSettingsOpen);
    const curLabelMode = this.avatarLabelMode || 'proximity';
    const buildCfg = this.getBuildPlacementConfig();
    const isBuildOpen = Boolean(buildCfg.buildModeEnabled && !isDeckOpen && !isSettingsOpen);

    hudEl.innerHTML = `
      <div class="avatar-bar-status">
        <span class="avatar-bar-title">
          <span class="avatar-bar-dot"></span>
          <span>${isFpp ? 'Mode Teknisi (FPP)' : 'Mode Teknisi (TPP)'}</span>
          <span id="avatar-online-peers-slot" class="sim-inspector-badge">Rekan: 0 online</span>
          <span id="avatar-compact-nearest" class="avatar-compact-nearest">Siap</span>
        </span>
        <div class="avatar-hud-top-tools">
          <button type="button" id="btn-avatar-build-mode" class="avatar-hud-pill-btn ${buildCfg.buildModeEnabled ? 'active' : ''}" title="Build / Placement Mode (B): Grid Snap, Angle Snap, Collision/MoveObjects, Gizmo RGB, Surface Snap">${uiIcon('wrench', 12)} Build Mode</button>
          <button type="button" id="btn-avatar-sim-devices" class="avatar-hud-pill-btn ${isDeckOpen ? 'active' : ''}" title="Buka Pengatur Perangkat &amp; Tata Letak Simulator">${uiIcon('box', 12)} Layout (${allDevs.length})</button>
          <button type="button" id="btn-avatar-sim-settings" class="avatar-hud-pill-btn ${isSettingsOpen ? 'active' : ''}" title="Atur Ukuran Avatar, Sensitivitas &amp; Label 3D">${uiIcon('settings', 12)} Setelan</button>
          <button type="button" id="btn-avatar-hud-minimize" class="avatar-hud-min-btn" aria-expanded="${!isMin}" title="Minimize / Tampilkan Panel Mode Teknisi">${isMin ? 'Panel' : 'Minimize'}</button>
          <button type="button" id="btn-avatar-compact-exit" class="avatar-hud-min-btn is-exit" title="Keluar dari Mode Teknisi">${uiIcon('x', 11)} Keluar</button>
        </div>
      </div>
      <div id="avatar-sim-build-panel" class="avatar-sim-build-panel ${isBuildOpen ? '' : 'hidden'}">
        <div class="build-mode-header">
          <span class="avatar-sim-strip-label">${uiIcon('wrench', 12)} Build Mode</span>
          <span id="build-mode-target-badge" class="sim-inspector-badge">Target: --</span>
        </div>
        <div class="build-mode-grid">
          <div class="build-mode-row" title="Grid Snapping: sejajarkan posisi objek ke kotak grid lantai, atau Free Placement untuk geser bebas">
            <span class="build-mode-key">Grid Snap</span>
            <button type="button" id="btn-build-grid-snap" class="avatar-sim-chip ${buildCfg.gridSnapEnabled ? 'active' : ''}">${buildCfg.gridSnapEnabled ? `${uiIcon('grid', 11)} Snap Grid: ON` : `${uiIcon('move', 11)} Free Placement`}</button>
            <select id="select-build-grid-size" class="avatar-teleport-select build-mini-select" title="Ukuran kotak Grid (meter)">
              <option value="0.25" ${Math.abs(buildCfg.gridSnapMeters - 0.25) < 0.02 ? 'selected' : ''}>0.25m</option>
              <option value="0.5" ${Math.abs(buildCfg.gridSnapMeters - 0.5) < 0.02 ? 'selected' : ''}>0.50m</option>
              <option value="1" ${Math.abs(buildCfg.gridSnapMeters - 1) < 0.02 ? 'selected' : ''}>1.00m</option>
              <option value="2" ${Math.abs(buildCfg.gridSnapMeters - 2) < 0.02 ? 'selected' : ''}>2.00m</option>
            </select>
          </div>
          <div class="build-mode-row" title="Rotation / Angle Snap: putar bebas 360° atau per sudut 15° / 45° / 90°">
            <span class="build-mode-key">Angle Snap</span>
            <select id="select-build-angle-snap" class="avatar-teleport-select build-mini-select" title="Sudut kunci rotasi">
              <option value="0" ${buildCfg.angleSnapDeg === 0 ? 'selected' : ''}>Bebas (360°)</option>
              <option value="15" ${buildCfg.angleSnapDeg === 15 ? 'selected' : ''}>Snap 15°</option>
              <option value="45" ${buildCfg.angleSnapDeg === 45 ? 'selected' : ''}>Snap 45°</option>
              <option value="90" ${buildCfg.angleSnapDeg === 90 ? 'selected' : ''}>Snap 90°</option>
            </select>
            <button type="button" id="btn-build-rot-ccw" class="avatar-sim-mini-btn" title="Putar kiri ([)">${uiIcon('rotate-ccw', 11)}</button>
            <button type="button" id="btn-build-rot-cw" class="avatar-sim-mini-btn" title="Putar kanan (])">${uiIcon('rotate-cw', 11)}</button>
          </div>
          <div class="build-mode-row" title="Collision / Clipping: Anti-Tabrakan mencegah objek menembus; MoveObjects mengizinkan tumpuk bebas">
            <span class="build-mode-key">Collision</span>
            <button type="button" id="btn-build-collision" class="avatar-sim-chip ${buildCfg.allowClipping ? 'is-moveobjects active' : ''}">${buildCfg.allowClipping ? `${uiIcon('layers', 11)} MoveObjects (Bebas)` : `${uiIcon('shield', 11)} Anti-Tabrakan`}</button>
          </div>
          <div class="build-mode-row" title="Surface Snapping / Object Alignment: tempelkan objek rata di atas permukaan meja, rak, lantai, atau dinding 3D">
            <span class="build-mode-key">Surface Snap</span>
            <button type="button" id="btn-build-surface-snap" class="avatar-sim-chip ${buildCfg.surfaceSnapEnabled ? 'active' : ''}">${buildCfg.surfaceSnapEnabled ? `${uiIcon('magnet', 11)} Tempel Meja/Rak: ON` : `${uiIcon('magnet', 11)} Surface Snap: OFF`}</button>
          </div>
          <div class="build-mode-row is-gizmo-row" title="Gizmo / Transform Controls: seret panah atau lingkaran merah (X), hijau (Y/Tinggi), biru (Z) pada objek">
            <span class="build-mode-key">Gizmo RGB</span>
            <button type="button" id="btn-build-gizmo" class="avatar-sim-chip ${buildCfg.gizmoEnabled ? 'active' : ''}">${buildCfg.gizmoEnabled ? `${uiIcon('target', 11)} Gizmo: ON` : `${uiIcon('target', 11)} Gizmo: OFF`}</button>
            <select id="select-build-gizmo-mode" class="avatar-teleport-select build-mini-select" title="Jenis sumbu Gizmo">
              <option value="both" ${buildCfg.gizmoMode === 'both' ? 'selected' : ''}>Panah + Putar</option>
              <option value="translate" ${buildCfg.gizmoMode === 'translate' ? 'selected' : ''}>Panah Geser</option>
              <option value="rotate" ${buildCfg.gizmoMode === 'rotate' ? 'selected' : ''}>Lingkaran Putar</option>
            </select>
            <div class="gizmo-nudge-group">
              <button type="button" class="gizmo-axis-btn is-x" data-gizmo-nudge="x:-1" title="Geser X-">-X</button>
              <button type="button" class="gizmo-axis-btn is-x" data-gizmo-nudge="x:1" title="Geser X+">+X</button>
              <button type="button" class="gizmo-axis-btn is-y" data-gizmo-nudge="y:-1" title="Turun Y/Tinggi-">-Y</button>
              <button type="button" class="gizmo-axis-btn is-y" data-gizmo-nudge="y:1" title="Naik Y/Tinggi+">+Y</button>
              <button type="button" class="gizmo-axis-btn is-z" data-gizmo-nudge="z:-1" title="Geser Z-">-Z</button>
              <button type="button" class="gizmo-axis-btn is-z" data-gizmo-nudge="z:1" title="Geser Z+">+Z</button>
            </div>
          </div>
          <div class="build-mode-row" title="Buka Alat Bangun Jalan / Trotoar 3D ala City-Builder">
            <button type="button" id="btn-build-road-tool" class="avatar-sim-chip">${uiIcon('route', 11)} Bangun Jalan 3D</button>
          </div>
        </div>
      </div>
      <div id="avatar-sim-settings-popover" class="avatar-sim-popover ${isSettingsOpen ? '' : 'hidden'}">
        <div class="avatar-scale-control" title="Ukuran karakter teknisi (${AVATAR_SCALE_MIN}x - ${AVATAR_SCALE_MAX}x)">
          <span class="avatar-scale-label">Ukuran</span>
          <button type="button" id="btn-avatar-scale-down" class="avatar-scale-step-btn" title="Perkecil karakter (${AVATAR_SCALE_MIN}x min)" ${curScale <= AVATAR_SCALE_MIN + 1e-4 ? 'disabled' : ''}>-</button>
          <input type="range" id="range-avatar-scale" class="avatar-scale-range" min="${AVATAR_SCALE_MIN}" max="${AVATAR_SCALE_MAX}" step="${AVATAR_SCALE_STEP}" value="${curScale.toFixed(2)}" aria-label="Skala Karakter Teknisi">
          <button type="button" id="btn-avatar-scale-up" class="avatar-scale-step-btn" title="Perbesar karakter (${AVATAR_SCALE_MAX}x maks)" ${curScale >= AVATAR_SCALE_MAX - 1e-4 ? 'disabled' : ''}>+</button>
          <span id="avatar-scale-value" class="avatar-scale-value">${curScale.toFixed(2)}x</span>
        </div>
        <div class="avatar-scale-control avatar-sens-control" title="Sensitivitas mouse Mode Teknisi (${AVATAR_MOUSE_SENS_MIN}x - ${AVATAR_MOUSE_SENS_MAX}x)">
          <span class="avatar-scale-label">Mouse</span>
          <button type="button" id="btn-avatar-sens-down" class="avatar-scale-step-btn" title="Pelankan mouse (,)" ${curSens <= AVATAR_MOUSE_SENS_MIN + 1e-4 ? 'disabled' : ''}>-</button>
          <input type="range" id="range-avatar-sens" class="avatar-scale-range" min="${AVATAR_MOUSE_SENS_MIN}" max="${AVATAR_MOUSE_SENS_MAX}" step="${AVATAR_MOUSE_SENS_STEP}" value="${curSens.toFixed(2)}" aria-label="Sensitivitas Mouse Mode Teknisi">
          <button type="button" id="btn-avatar-sens-up" class="avatar-scale-step-btn" title="Cepatkan mouse (.)" ${curSens >= AVATAR_MOUSE_SENS_MAX - 1e-4 ? 'disabled' : ''}>+</button>
          <span id="avatar-sens-value" class="avatar-sens-value">${curSens.toFixed(2)}x</span>
        </div>
        <div class="avatar-scale-control" title="Mode Label 3D saat Mode Teknisi aktif agar pandangan tidak penuh">
          <span class="avatar-scale-label">Label 3D</span>
          <select id="select-avatar-label-mode" class="avatar-teleport-select" style="height:22px;font-size:10px;max-width:118px;">
            <option value="proximity" ${curLabelMode === 'proximity' ? 'selected' : ''}>Hanya Terdekat</option>
            <option value="all" ${curLabelMode === 'all' ? 'selected' : ''}>Semua</option>
            <option value="off" ${curLabelMode === 'off' ? 'selected' : ''}>Sembunyikan</option>
          </select>
        </div>
      </div>
      <div id="avatar-sim-device-deck" class="avatar-sim-deck ${isDeckOpen ? '' : 'hidden'}">
        <div class="avatar-sim-deck-head">
          <input type="text" id="avatar-sim-dev-search" class="avatar-sim-deck-search" placeholder="Cari perangkat / IP..." value="${this.escapeHudHtml(this.avatarSimDeckSearch || '')}">
          <div class="avatar-sim-deck-filters">
            <button type="button" class="avatar-sim-chip ${this.avatarSimDeckFilter === 'all' ? 'active' : ''}" data-sim-filter="all">Semua</button>
            <button type="button" class="avatar-sim-chip ${this.avatarSimDeckFilter === 'nearby' ? 'active' : ''}" data-sim-filter="nearby">Dekat (&lt;15m)</button>
            <button type="button" class="avatar-sim-chip ${this.avatarSimDeckFilter === 'net' ? 'active' : ''}" data-sim-filter="net">Router/Switch</button>
            <button type="button" class="avatar-sim-chip ${this.avatarSimDeckFilter === 'wifi' ? 'active' : ''}" data-sim-filter="wifi">AP/Radio</button>
          </div>
        </div>
        <div class="avatar-sim-layout-strip">
          <span class="avatar-sim-strip-label">Tata Letak Simulator:</span>
          <button type="button" id="btn-avatar-layout-row" class="sim-action-btn" title="Susun perangkat terdekat/dibawa dalam 1 baris rapi menghadap teknisi">${uiIcon('ruler', 11)} Baris Rapi</button>
          <button type="button" id="btn-avatar-layout-rack" class="sim-action-btn" title="Susun vertikal seperti slot rak server">${uiIcon('server', 11)} Susun Rak</button>
          <button type="button" id="btn-avatar-layout-grid" class="sim-action-btn" title="Susun menjadi grid rapi agar tidak bertumpuk">${uiIcon('grid', 11)} Grid Rapi</button>
          <button type="button" id="btn-avatar-elev-down" class="sim-action-btn" title="Turunkan Z perangkat target/dibawa (-0.25m)">${uiIcon('arrow-down', 11)} Z-</button>
          <button type="button" id="btn-avatar-elev-up" class="sim-action-btn" title="Naikkan Z perangkat target/dibawa (+0.25m)">${uiIcon('arrow-up', 11)} Z+</button>
          <button type="button" id="btn-avatar-rot-face" class="sim-action-btn" title="Putar panel port perangkat menghadap ke teknisi">${uiIcon('rotate-cw', 11)} Hadap</button>
        </div>
        <div id="avatar-sim-deck-list" class="avatar-sim-deck-list"></div>
      </div>
      <div class="avatar-bar-nearest" id="avatar-nearest-slot">
        <span>Terdekat: --</span>
      </div>
      <div class="avatar-bar-actions">
        <div class="avatar-perspective-switch" title="Pilih perspektif kamera (Pintasan: V atau Scroll)">
          <button type="button" class="avatar-persp-btn ${!isFpp ? 'active' : ''}" data-avatar-persp="tpp">TPP</button>
          <button type="button" class="avatar-persp-btn ${isFpp ? 'active' : ''}" data-avatar-persp="fpp">FPP (V)</button>
        </div>
        <div class="avatar-scale-control avatar-sens-control" title="Sensitivitas mouse Mode Teknisi (${AVATAR_MOUSE_SENS_MIN}x - ${AVATAR_MOUSE_SENS_MAX}x • Pintasan: , / .)">
          <span class="avatar-scale-label">Mouse</span>
          <button type="button" id="btn-avatar-sens-down" class="avatar-scale-step-btn" title="Pelankan mouse (,)" ${curSens <= AVATAR_MOUSE_SENS_MIN + 1e-4 ? 'disabled' : ''}>-</button>
          <input type="range" id="range-avatar-sens" class="avatar-scale-range" min="${AVATAR_MOUSE_SENS_MIN}" max="${AVATAR_MOUSE_SENS_MAX}" step="${AVATAR_MOUSE_SENS_STEP}" value="${curSens.toFixed(2)}" aria-label="Sensitivitas Mouse Mode Teknisi">
          <button type="button" id="btn-avatar-sens-up" class="avatar-scale-step-btn" title="Cepatkan mouse (.)" ${curSens >= AVATAR_MOUSE_SENS_MAX - 1e-4 ? 'disabled' : ''}>+</button>
          <span id="avatar-sens-value" class="avatar-scale-value">${curSens.toFixed(2)}x</span>
        </div>
        <div class="avatar-nav-step-group ws-network-only" title="Berpindah antar perangkat dengan cepat">
          <button type="button" id="btn-avatar-prev-device" class="avatar-step-btn" title="Teleport ke perangkat sebelumnya">${uiIcon('chevron-left', 12)}</button>
          <select id="select-avatar-teleport" class="avatar-teleport-select" title="Teleport karakter ke depan perangkat">
            <option value="">Ke Perangkat...</option>
            ${optionsHtml}
          </select>
          <button type="button" id="btn-avatar-next-device" class="avatar-step-btn" title="Teleport ke perangkat berikutnya">${uiIcon('chevron-right', 12)}</button>
        </div>
        <button type="button" id="btn-avatar-carry-pickup" class="sim-action-btn is-carry" title="Angkat (E) • Tambah (Shift+E)">Angkat (E)</button>
        <button type="button" id="btn-avatar-carry-drop" class="sim-action-btn is-drop hidden" title="Taruh (E / Q) • Taruh Semua (Shift+Q)">Taruh (E)</button>
        <button type="button" id="btn-avatar-inspect-nearest" class="sim-action-btn is-primary ws-network-only" title="Fokus & Inspeksi Port perangkat terdekat (F)">Inspeksi Port (F)</button>
        <button type="button" id="btn-avatar-exit" class="sim-action-btn is-exit" title="Keluar dari Mode Teknisi (G)">Keluar</button>
      </div>
    `;

    hudEl.classList.remove('hidden');
    hudEl.classList.toggle('is-minimized', isMin);
    hudEl.style.display = 'flex';
    this._lastAvatarHudNearestId = null;
    this._lastAvatarHudDistKey = '';
    this._lastAvatarHudCarryKey = '';

    hudEl.onpointerdown = (ev) => ev.stopPropagation();

    hudEl.querySelector('#btn-avatar-hud-minimize')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggleAvatarHudMinimized();
    });

    hudEl.querySelector('#btn-avatar-compact-exit')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarMode(false);
    });

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
      this.dropCarriedObjectsFromAvatar({ dropAll: Boolean(ev.shiftKey), useAimTarget: true });
    });

    hudEl.querySelector('#btn-avatar-inspect-nearest')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.inspectNearestDeviceFromAvatar();
    });

    hudEl.querySelector('#btn-avatar-exit')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarMode(false);
    });

    hudEl.querySelector('#btn-avatar-build-mode')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggleBuildMode();
    });

    hudEl.querySelector('#btn-build-grid-snap')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ gridSnapEnabled: !this.buildPlacementConfig.gridSnapEnabled });
    });

    hudEl.querySelector('#select-build-grid-size')?.addEventListener('change', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ gridSnapMeters: Number(ev.target.value) || 0.5, gridSnapEnabled: true });
    });

    hudEl.querySelector('#select-build-angle-snap')?.addEventListener('change', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ angleSnapDeg: Number(ev.target.value) || 0 });
    });

    hudEl.querySelector('#btn-build-rot-ccw')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const targetDev = this.getTransformGizmoTargetDevice();
      if (targetDev && !this.deviceManager?.selectedDeviceId) {
        this.deviceManager?.selectDevice?.(targetDev.id);
      }
      this.rotateSelectedIn3D({ dY: -15 });
    });

    hudEl.querySelector('#btn-build-rot-cw')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const targetDev = this.getTransformGizmoTargetDevice();
      if (targetDev && !this.deviceManager?.selectedDeviceId) {
        this.deviceManager?.selectDevice?.(targetDev.id);
      }
      this.rotateSelectedIn3D({ dY: 15 });
    });

    hudEl.querySelector('#btn-build-collision')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ allowClipping: !this.buildPlacementConfig.allowClipping });
    });

    hudEl.querySelector('#btn-build-surface-snap')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ surfaceSnapEnabled: !this.buildPlacementConfig.surfaceSnapEnabled });
    });

    hudEl.querySelector('#btn-build-gizmo')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ gizmoEnabled: !this.buildPlacementConfig.gizmoEnabled });
    });

    hudEl.querySelector('#select-build-gizmo-mode')?.addEventListener('change', (ev) => {
      ev.stopPropagation();
      this.setBuildPlacementConfig({ gizmoMode: ev.target.value, gizmoEnabled: true });
    });

    hudEl.querySelector('#btn-build-road-tool')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setAvatarMode(false);
      this.setNavTool('road3d');
      this.showStatusHint('Mode Bangun Jalan 3D aktif — Klik pada lantai denah untuk meletakkan jalur batu pijakan & kerikil sekolah.');
    });

    hudEl.querySelectorAll('[data-gizmo-nudge]')?.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const spec = String(btn.getAttribute('data-gizmo-nudge') || '').split(':');
        const axis = spec[0];
        const dir = Number(spec[1]) || 1;
        this.nudgeDeviceAlongGizmoAxis(axis, dir);
      });
    });

    hudEl.querySelector('#btn-avatar-sim-devices')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.avatarSimDeckOpen = !this.avatarSimDeckOpen;
      if (this.avatarSimDeckOpen) this.avatarSimSettingsOpen = false;
      hudEl.querySelector('#btn-avatar-sim-devices')?.classList?.toggle('active', this.avatarSimDeckOpen);
      hudEl.querySelector('#btn-avatar-sim-settings')?.classList?.toggle('active', this.avatarSimSettingsOpen);
      hudEl.querySelector('#avatar-sim-device-deck')?.classList?.toggle('hidden', !this.avatarSimDeckOpen);
      hudEl.querySelector('#avatar-sim-settings-popover')?.classList?.toggle('hidden', !this.avatarSimSettingsOpen);
      this.syncBuildPlacementHudUI?.();
      if (this.avatarSimDeckOpen) this.renderAvatarSimDeckList();
    });

    hudEl.querySelector('#btn-avatar-sim-settings')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.avatarSimSettingsOpen = !this.avatarSimSettingsOpen;
      if (this.avatarSimSettingsOpen) this.avatarSimDeckOpen = false;
      hudEl.querySelector('#btn-avatar-sim-settings')?.classList?.toggle('active', this.avatarSimSettingsOpen);
      hudEl.querySelector('#btn-avatar-sim-devices')?.classList?.toggle('active', this.avatarSimDeckOpen);
      hudEl.querySelector('#avatar-sim-settings-popover')?.classList?.toggle('hidden', !this.avatarSimSettingsOpen);
      hudEl.querySelector('#avatar-sim-device-deck')?.classList?.toggle('hidden', !this.avatarSimDeckOpen);
      this.syncBuildPlacementHudUI?.();
    });

    hudEl.querySelector('#select-avatar-label-mode')?.addEventListener('change', (ev) => {
      ev.stopPropagation();
      this.setAvatarLabelMode(ev.target.value);
    });

    hudEl.querySelector('#btn-avatar-prev-device')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.cycleAvatarTargetDevice(-1);
    });
    hudEl.querySelector('#btn-avatar-next-device')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.cycleAvatarTargetDevice(1);
    });

    hudEl.querySelector('#btn-avatar-layout-row')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.arrangeDevicesFromAvatar('row');
    });
    hudEl.querySelector('#btn-avatar-layout-rack')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.arrangeDevicesFromAvatar('rack');
    });
    hudEl.querySelector('#btn-avatar-layout-grid')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.arrangeDevicesFromAvatar('grid');
    });
    hudEl.querySelector('#btn-avatar-elev-down')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.adjustAvatarTargetOrCarriedElevation(-0.25);
    });
    hudEl.querySelector('#btn-avatar-elev-up')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.adjustAvatarTargetOrCarriedElevation(0.25);
    });
    hudEl.querySelector('#btn-avatar-rot-face')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.rotateAvatarTargetOrCarriedToFace();
    });

    const deckSearch = hudEl.querySelector('#avatar-sim-dev-search');
    deckSearch?.addEventListener('input', (ev) => {
      this.avatarSimDeckSearch = String(ev.target.value || '');
      this.renderAvatarSimDeckList();
    });
    deckSearch?.addEventListener('keydown', (ev) => ev.stopPropagation());

    hudEl.querySelectorAll('[data-sim-filter]')?.forEach((chip) => {
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.avatarSimDeckFilter = chip.getAttribute('data-sim-filter') || 'all';
        hudEl.querySelectorAll('[data-sim-filter]')?.forEach((c) => {
          c.classList.toggle('active', c === chip);
        });
        this.renderAvatarSimDeckList();
      });
    });

    this.renderAvatarSimDeckList();
    this.updateAvatarDeviceLabelsVisibility();
    this.updateAvatarProximityHud();
    this.syncBuildPlacementHudUI?.();
    this.updateRemotePeersHud?.(authManager.getRemotePeers());
  }

  renderAvatarSimDeckList() {
    if (typeof document === 'undefined' || !this.avatarMode) return;
    const listEl = document.getElementById('avatar-sim-deck-list');
    if (!listEl) return;

    const ax = Number(this.avatarState?.x) || 0;
    const az = Number(this.avatarState?.z) || 0;
    const q = String(this.avatarSimDeckSearch || '').trim().toLowerCase();
    const filter = this.avatarSimDeckFilter || 'all';
    const nearestId = this.avatarState?.nearestDeviceId || null;
    const carriedIds = new Set((this.carriedObjects || []).map((c) => c?.devId).filter(Boolean));

    const items = (this.deviceManager?.getAllDevices?.() || [])
      .filter((d) => d && d.layerVisible !== false)
      .map((dev) => {
        const w = this.effectivePosMap?.get(dev.id)
          || (this.normToWorld && dev.position ? this.normToWorld(dev.position.x, dev.position.y) : { x: 0, z: 0 });
        const dist = Math.hypot((w?.x ?? 0) - ax, (w?.z ?? 0) - az);
        const typeStr = String(dev.type || '').toLowerCase();
        return { dev, dist, typeStr };
      })
      .filter(({ dev, dist, typeStr }) => {
        if (q) {
          const hay = `${dev.name || ''} ${dev.model || ''} ${dev.network?.ip || ''} ${typeStr}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === 'nearby') return dist <= 15;
        if (filter === 'net') return typeStr.includes('router') || typeStr.includes('switch') || typeStr.includes('firewall') || typeStr.includes('hub') || typeStr.includes('eg');
        if (filter === 'wifi') return typeStr.includes('access-point') || typeStr.includes('wireless') || typeStr.includes('cctv') || typeStr.includes('ap');
        return true;
      })
      .sort((a, b) => a.dist - b.dist);

    if (items.length === 0) {
      listEl.innerHTML = `<div class="avatar-sim-deck-empty">Tidak ada perangkat yang cocok dengan filter ini.</div>`;
      return;
    }

    listEl.innerHTML = items.map(({ dev, dist }) => {
      const elev = Number(dev.spatial3d?.elevationMeters ?? getDefaultSpatial3d(dev.type).elevationMeters ?? 0).toFixed(2);
      const isNear = dev.id === nearestId;
      const isCarried = carriedIds.has(dev.id);
      const ipBadge = dev.network?.ip ? `<span class="sim-inspector-badge is-ip">${this.escapeHudHtml(dev.network.ip)}</span>` : '';
      return `
        <div class="avatar-sim-dev-card ${isNear ? 'is-nearest' : ''} ${isCarried ? 'is-carried' : ''}">
          <div class="avatar-sim-dev-info">
            <div class="avatar-sim-dev-name" title="${this.escapeHudHtml(dev.name)}">${this.escapeHudHtml(dev.name)}</div>
            <div class="avatar-sim-dev-meta">${ipBadge}<span>${dist.toFixed(1)}m • Z:${elev}m</span></div>
          </div>
          <div class="avatar-sim-dev-btns">
            <button type="button" class="avatar-sim-mini-btn" data-sim-card-go="${this.escapeHudHtml(dev.id)}" title="Teleport tepat di depan perangkat">${uiIcon('footprints', 11)}</button>
            <button type="button" class="avatar-sim-mini-btn" data-sim-card-port="${this.escapeHudHtml(dev.id)}" title="Buka &amp; inspeksi port perangkat">${uiIcon('plug', 11)}</button>
            <button type="button" class="avatar-sim-mini-btn" data-sim-card-face="${this.escapeHudHtml(dev.id)}" title="Putar panel port perangkat menghadap teknisi">${uiIcon('rotate-cw', 11)}</button>
            <button type="button" class="avatar-sim-mini-btn is-carry" data-sim-card-pick="${this.escapeHudHtml(dev.id)}" ${dev.layerLocked || isCarried ? 'disabled' : ''} title="${isCarried ? 'Sedang dibawa' : 'Angkat perangkat untuk dipindahkan'}">${uiIcon('hand', 11)}</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-sim-card-go]')?.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-sim-card-go');
        if (id) {
          this.deviceManager?.selectDevice?.(id);
          this.teleportAvatarToDevice(id);
          this.renderAvatarSimDeckList();
        }
      });
    });
    listEl.querySelectorAll('[data-sim-card-port]')?.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-sim-card-port');
        if (id) {
          this.deviceManager?.selectDevice?.(id);
          this.focusOnDevice(id, { viewAngle: this.simulatorViewAngle || 'front', saveReturnCamera: true });
        }
      });
    });
    listEl.querySelectorAll('[data-sim-card-face]')?.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-sim-card-face');
        if (id) this.rotateAvatarTargetOrCarriedToFace(id);
      });
    });
    listEl.querySelectorAll('[data-sim-card-pick]')?.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-sim-card-pick');
        if (id) {
          this.pickupDeviceFromAvatar(id);
          this.renderAvatarSimDeckList();
        }
      });
    });
  }

  updateAvatarProximityHud() {
    if (typeof document === 'undefined' || !this.avatarMode || this.simulatorFocusedDeviceId) return;
    const slot = document.getElementById('avatar-nearest-slot');
    if (!slot) return;

    if (this.isBuildingEditWorkspace?.()) {
      const carriedCount = Array.isArray(this.carriedObjects) ? this.carriedObjects.length : 0;
      const np = this.findNearestPickableObjectToAvatar?.();
      if (carriedCount > 0) {
        slot.innerHTML = `<span class="sim-inspector-badge is-pickable">Bawa ${carriedCount} objek 3D — [E] Taruh</span>`;
      } else if (np?.id) {
        slot.innerHTML = `<span class="sim-inspector-badge is-pickable">[E] Angkat ${this.escapeHudHtml(np.name || 'Objek 3D')} (${np.distance.toFixed(1)}m)</span>`;
      } else {
        slot.innerHTML = '<span>Edit Bangunan: Fokus Gedung &amp; Objek 3D</span>';
      }
      return;
    }

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

    const mobPick = document.getElementById('btn-mob-pickup');
    const mobDrop = document.getElementById('btn-mob-drop');
    const mobDropAll = document.getElementById('btn-mob-drop-all');
    const mobRotGroup = document.getElementById('mob-carry-rot-group');
    const mobInspect = document.getElementById('btn-mob-inspect');
    const mobPersp = document.getElementById('btn-mob-persp');
    if (mobPick) {
      mobPick.disabled = !nearestPick || carriedCount >= (this.maxCarriedObjects || 8);
      const sp = mobPick.querySelector('span');
      if (sp) sp.textContent = carriedCount > 0 ? `+Angkat` : `Angkat`;
    }
    if (mobDrop) {
      mobDrop.classList.toggle('hidden', carriedCount === 0);
      const sp = mobDrop.querySelector('span');
      if (sp) sp.textContent = wallReadyHit ? 'Tempel' : (carriedCount > 1 ? `Taruh (${carriedCount})` : 'Taruh');
    }
    if (mobDropAll) {
      mobDropAll.style.display = carriedCount > 1 ? 'inline-flex' : 'none';
    }
    if (mobRotGroup) {
      mobRotGroup.classList.toggle('hidden', carriedCount === 0);
    }
    if (mobInspect) {
      const canInspect = Boolean(nearestId && dist <= 6.5);
      mobInspect.classList.toggle('is-ready', canInspect);
      mobInspect.disabled = !nearestId;
    }
    if (mobPersp) {
      const sp = mobPersp.querySelector('span');
      if (sp) sp.textContent = this.avatarPerspective === 'fpp' ? 'FPP' : 'TPP';
      mobPersp.classList.toggle('active', this.avatarPerspective === 'fpp');
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
    this.updateAvatarDeviceLabelsVisibility?.();
    this.syncTransformGizmo?.();
    this.syncBuildPlacementHudUI?.();
    if (this.avatarSimDeckOpen) this.renderAvatarSimDeckList?.();

    const dev = nearestId ? this.deviceManager?.getDeviceById?.(nearestId) : null;
    const compactSlot = document.getElementById('avatar-compact-nearest');
    if (compactSlot) {
      if (carriedCount > 0) {
        compactSlot.textContent = wallReadyHit
          ? `Siap Tempel (${carriedCount})`
          : `Bawa (${carriedCount})`;
      } else if (dev) {
        compactSlot.textContent = `${dev.name} (${distText})`;
      } else if (pickObjId) {
        compactSlot.textContent = `${pickName} (${pickDistText})`;
      } else {
        compactSlot.textContent = 'Siap';
      }
    }
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

  _loadSavedBuildPlacementConfig() {
    const defaults = {
      buildModeEnabled: false,
      gridSnapEnabled: false,
      gridSnapMeters: 0.5,
      angleSnapDeg: 45,
      allowClipping: false,
      gizmoEnabled: false,
      gizmoOptIn: false,
      gizmoMode: 'both',
      surfaceSnapEnabled: true
    };
    try {
      if (typeof localStorage === 'undefined') return defaults;
      const raw = localStorage.getItem('netmap_build_placement_cfg_v1');
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const gizmoOptIn = Boolean(parsed?.gizmoOptIn);
      return {
        buildModeEnabled: Boolean(parsed?.buildModeEnabled),
        gridSnapEnabled: Boolean(parsed?.gridSnapEnabled),
        gridSnapMeters: clamp(Number(parsed?.gridSnapMeters) || 0.5, 0.1, 5.0),
        angleSnapDeg: [0, 15, 45, 90].includes(Number(parsed?.angleSnapDeg)) ? Number(parsed.angleSnapDeg) : 45,
        allowClipping: Boolean(parsed?.allowClipping),
        gizmoOptIn,
        gizmoEnabled: Boolean(gizmoOptIn && parsed?.gizmoEnabled),
        gizmoMode: ['both', 'translate', 'rotate'].includes(parsed?.gizmoMode) ? parsed.gizmoMode : 'both',
        surfaceSnapEnabled: parsed?.surfaceSnapEnabled !== false
      };
    } catch {
      return defaults;
    }
  }

  getBuildPlacementConfig() {
    return { ...(this.buildPlacementConfig || this._loadSavedBuildPlacementConfig()) };
  }

  setBuildPlacementConfig(patch = {}, { silent = false } = {}) {
    const prev = this.getBuildPlacementConfig();
    const nextGizmoEnabled = patch.gizmoEnabled !== undefined ? Boolean(patch.gizmoEnabled) : prev.gizmoEnabled;
    const next = {
      buildModeEnabled: patch.buildModeEnabled !== undefined ? Boolean(patch.buildModeEnabled) : prev.buildModeEnabled,
      gridSnapEnabled: patch.gridSnapEnabled !== undefined ? Boolean(patch.gridSnapEnabled) : prev.gridSnapEnabled,
      gridSnapMeters: patch.gridSnapMeters !== undefined ? clamp(Number(patch.gridSnapMeters) || 0.5, 0.1, 5.0) : prev.gridSnapMeters,
      angleSnapDeg: patch.angleSnapDeg !== undefined
        ? ([0, 15, 45, 90].includes(Number(patch.angleSnapDeg)) ? Number(patch.angleSnapDeg) : 0)
        : prev.angleSnapDeg,
      allowClipping: patch.allowClipping !== undefined ? Boolean(patch.allowClipping) : prev.allowClipping,
      gizmoEnabled: nextGizmoEnabled,
      gizmoOptIn: patch.gizmoEnabled !== undefined ? nextGizmoEnabled : Boolean(prev.gizmoOptIn || nextGizmoEnabled),
      gizmoMode: (patch.gizmoMode && ['both', 'translate', 'rotate'].includes(patch.gizmoMode)) ? patch.gizmoMode : prev.gizmoMode,
      surfaceSnapEnabled: patch.surfaceSnapEnabled !== undefined ? Boolean(patch.surfaceSnapEnabled) : prev.surfaceSnapEnabled
    };
    this.buildPlacementConfig = next;

    if (next.buildModeEnabled && !prev.buildModeEnabled) {
      this.avatarSimDeckOpen = false;
      this.avatarSimSettingsOpen = false;
      this.releaseAvatarPointerLock?.();
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('netmap_build_placement_cfg_v1', JSON.stringify(next));
      }
    } catch { /* ignore storage restrictions */ }

    this.syncTransformGizmo();
    this.syncBuildPlacementHudUI();
    if (Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      this.updateCarriedObjectsTransform?.();
    }

    if (!silent) {
      if (patch.buildModeEnabled !== undefined) {
        this.showStatusHint(
          next.buildModeEnabled
            ? 'Build / Placement Mode AKTIF — Gunakan Gizmo RGB (X/Y/Z), Grid Snap, Angle Snap, MoveObjects & Surface Snap.'
            : 'Build / Placement Mode dimatikan.'
        );
      } else if (patch.gridSnapEnabled !== undefined || patch.gridSnapMeters !== undefined) {
        this.showStatusHint(
          next.gridSnapEnabled
            ? `Grid Snapping AKTIF (${next.gridSnapMeters}m)`
            : 'Free Placement AKTIF (geser bebas tanpa snap grid)'
        );
      } else if (patch.angleSnapDeg !== undefined) {
        this.showStatusHint(
          next.angleSnapDeg > 0
            ? `Rotation Angle Snap: ${next.angleSnapDeg}°`
            : 'Rotasi Bebas (360° tanpa snap sudut)'
        );
      } else if (patch.allowClipping !== undefined) {
        this.showStatusHint(
          next.allowClipping
            ? 'MoveObjects AKTIF: Objek boleh saling menumpuk / tembus'
            : 'Collision / Anti-Tabrakan AKTIF: Objek tidak saling menembus'
        );
      } else if (patch.surfaceSnapEnabled !== undefined) {
        this.showStatusHint(
          next.surfaceSnapEnabled
            ? 'Surface Snapping AKTIF: Objek otomatis menempel rata di atas meja/rak/dinding'
            : 'Surface Snapping dimatikan: Pertahankan elevasi manual'
        );
      } else if (patch.gizmoEnabled !== undefined || patch.gizmoMode !== undefined) {
        this.showStatusHint(
          next.gizmoEnabled
            ? `Gizmo RGB Transform Controls AKTIF (${next.gizmoMode})`
            : 'Gizmo RGB disembunyikan'
        );
      }
    }
    return { ...next };
  }

  toggleBuildMode(force) {
    const nextEnabled = force !== undefined ? Boolean(force) : !Boolean(this.buildPlacementConfig?.buildModeEnabled);
    return this.setBuildPlacementConfig({ buildModeEnabled: nextEnabled });
  }

}

attachMap3DSubsystems(Map3DEngine);
attachMap3DNextGenPerf(Map3DEngine);
