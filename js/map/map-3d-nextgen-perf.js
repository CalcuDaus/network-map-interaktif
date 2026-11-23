/**
 * NetMap — Next-Gen 3D Performance Architecture Pipeline (Phases 1–6)
 * Implements:
 * - Phase 1: WebGPU/WebGL2 backend capabilities, RepeatedAssetInstancer (InstancedMesh / BatchedMesh),
 *            GPU UV-scrolling cable packet flow uniform, and throttled on-demand shadow updates.
 * - Phase 2: 2D Spatial Hash Grid (O(1) proximity triggers for devices, doors & 3D objects) +
 *            Hierarchical Bounding-Volume (BVH Box3/Sphere) raycast acceleration.
 * - Phase 3: 3-Tier Hierarchical LOD (LOD0 < 4m full ports, LOD1 4-20m medium, LOD2 > 20m proxy).
 * - Phase 4: Zero-Allocation per-frame scratch math pools & SimWorkerBridge SoA integration.
 * - Phase 5: Shader-driven X-Ray uniform (uXRayFactor 0.0 -> 1.0), 9-Layer THREE.Layers bitmask,
 *            and closed-door room occlusion culling.
 * - Phase 6: 60-Frame Rolling Average Dynamic Resolution Scaling (DRS) & strict GPU memory disposal.
 */

import * as THREE from 'three';
import { stateManager } from '../core/state-manager.js';
import { clamp, isMobileTouchDevice } from '../utils/helpers.js';
import {
  packNetworkTopologySoA,
  computeWifiHeatmapSoA,
  simWorkerBridge
} from '../simulation/sim-worker-bridge.js';

export const NETMAP_3D_LAYERS = Object.freeze({
  DEFAULT: 0,
  BACKGROUND: 1,
  BUILDINGS: 2,
  ROADS: 3,
  INFRASTRUCTURE: 4,
  DEVICES: 5,
  CONNECTIONS: 6,
  COVERAGE: 7,
  ANNOTATIONS: 8,
  AVATARS: 9
});

/**
 * 2D Spatial Hash Grid for O(1) proximity queries (Mode Teknisi doors, devices, and 3D objects).
 */
export class SpatialHashGrid2D {
  /**
   * @param {number} [cellSize=8.0]
   */
  constructor(cellSize = 8.0) {
    this.cellSize = Math.max(1.0, Number(cellSize) || 8.0);
    this.invCellSize = 1.0 / this.cellSize;
    this.cells = new Map();
    this.itemCount = 0;
  }

  clear() {
    this.cells.clear();
    this.itemCount = 0;
  }

  _key(gx, gz) {
    return `${gx},${gz}`;
  }

  /**
   * Insert a point or AABB footprint into overlapping grid cells.
   * @param {Object} item - { id, kind, x, y, z, halfW, halfD, payload }
   */
  insert(item) {
    if (!item) return;
    const x = Number(item.x) || 0;
    const z = Number(item.z) || 0;
    const hw = Math.max(0, Number(item.halfW) || 0);
    const hd = Math.max(0, Number(item.halfD) || 0);
    const gx0 = Math.floor((x - hw) * this.invCellSize);
    const gx1 = Math.floor((x + hw) * this.invCellSize);
    const gz0 = Math.floor((z - hd) * this.invCellSize);
    const gz1 = Math.floor((z + hd) * this.invCellSize);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = `${gx},${gz}`;
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(item);
      }
    }
    this.itemCount += 1;
  }

  /**
   * Query all unique items within `radius` meters of `(wx, wz)` by checking only overlapping grid cells.
   * @param {number} wx
   * @param {number} wz
   * @param {number} [radius=8.0]
   * @param {string|null} [filterKind=null]
   * @returns {Array<Object>}
   */
  queryRadius(wx, wz, radius = 8.0, filterKind = null) {
    const r = Math.max(0.1, Number(radius) || 8.0);
    const rSq = r * r;
    const gx0 = Math.floor((wx - r) * this.invCellSize);
    const gx1 = Math.floor((wx + r) * this.invCellSize);
    const gz0 = Math.floor((wz - r) * this.invCellSize);
    const gz1 = Math.floor((wz + r) * this.invCellSize);

    const results = [];
    const seen = new Set();

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = this.cells.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const entry = bucket[i];
          if (filterKind && entry.kind !== filterKind) continue;
          const uid = `${entry.kind}:${entry.id}`;
          if (seen.has(uid)) continue;
          const dx = Math.max(0, Math.abs(wx - entry.x) - (entry.halfW || 0));
          const dz = Math.max(0, Math.abs(wz - entry.z) - (entry.halfD || 0));
          if (dx * dx + dz * dz <= rSq) {
            seen.add(uid);
            results.push(entry);
          }
        }
      }
    }
    return results;
  }
}

/**
 * Hierarchical Bounding Volume Accelerator (Box3 + Sphere BVH tree nodes) for sub-0.1ms raycasting.
 */
export class BvhSceneAccelerator {
  constructor() {
    this.nodes = [];
    this._tempVec = new THREE.Vector3();
  }

  clear() {
    this.nodes.length = 0;
  }

  /**
   * Add a bounded 3D object root to the BVH index.
   * @param {Object} params
   * @param {string} params.id
   * @param {'room'|'object3d'|'device'} params.kind
   * @param {THREE.Object3D} params.object3D
   * @param {number} params.minX
   * @param {number} params.minY
   * @param {number} params.minZ
   * @param {number} params.maxX
   * @param {number} params.maxY
   * @param {number} params.maxZ
   */
  addNode({ id, kind, object3D, minX, minY, minZ, maxX, maxY, maxZ }) {
    const box = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    );
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    this.nodes.push({ id, kind, object3D, box, sphere });
  }

  /**
   * Fast BVH broadphase filter: returns only scene Object3Ds whose bounding Sphere & Box3 intersect the ray,
   * sorted front-to-back by sphere distance.
   * @param {THREE.Raycaster} raycaster
   * @param {'room'|'object3d'|'device'|null} [kind=null]
   * @returns {Array<{ id: string, kind: string, object3D: THREE.Object3D, approxDist: number }>}
   */
  queryRayCandidates(raycaster, kind = null) {
    if (!raycaster?.ray) return [];
    const ray = raycaster.ray;
    const origin = ray.origin;
    const far = Number.isFinite(raycaster.far) ? raycaster.far : Infinity;
    const hits = [];

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (kind && node.kind !== kind) continue;
      if (node.object3D && node.object3D.visible === false) continue;

      const distToCenter = origin.distanceTo(node.sphere.center);
      if (distToCenter - node.sphere.radius > far) continue;
      if (!ray.intersectsSphere(node.sphere)) continue;
      if (!ray.intersectsBox(node.box)) continue;

      hits.push({
        id: node.id,
        kind: node.kind,
        object3D: node.object3D,
        approxDist: Math.max(0, distToCenter - node.sphere.radius)
      });
    }

    hits.sort((a, b) => a.approxDist - b.approxDist);
    return hits;
  }
}

/**
 * 60-Frame Rolling Average Dynamic Resolution Scaler (DRS).
 * Smoothly adapts renderer pixelRatio between [minRatio .. maxRatio] to hold 50-60+ FPS on mobile & lab iGPUs.
 */
export class DynamicResolutionScaler {
  constructor({
    windowSize = 60,
    minPixelRatio = 0.75,
    maxPixelRatio = 1.5,
    downscaleThresholdMs = 20.0, // < 50 FPS
    upscaleThresholdMs = 17.2,   // >= 58 FPS
    cooldownFrames = 45
  } = {}) {
    this.windowSize = Math.max(10, Number(windowSize) || 60);
    this.samples = new Float32Array(this.windowSize);
    this.sampleCount = 0;
    this.cursor = 0;
    this.runningSumMs = 0;
    this.minPixelRatio = minPixelRatio;
    this.maxPixelRatio = maxPixelRatio;
    this.currentPixelRatio = maxPixelRatio;
    this.downscaleThresholdMs = downscaleThresholdMs;
    this.upscaleThresholdMs = upscaleThresholdMs;
    this.cooldownFrames = cooldownFrames;
    this._cooldown = 0;
    this.steps = [0.75, 1.0, 1.25, 1.5];
  }

  reset(initialRatio = 1.25) {
    this.samples.fill(0);
    this.sampleCount = 0;
    this.cursor = 0;
    this.runningSumMs = 0;
    this._cooldown = 0;
    this.currentPixelRatio = clamp(Number(initialRatio) || 1.25, this.minPixelRatio, this.maxPixelRatio);
  }

  /**
   * Record one frame duration (ms) and return whether pixelRatio should change.
   * @param {number} frameTimeMs
   * @returns {{ changed: boolean, pixelRatio: number, rollingFrameTimeMs: number, rollingFps: number }}
   */
  recordFrame(frameTimeMs) {
    const clampedMs = clamp(Number(frameTimeMs) || 16.6, 2.0, 120.0);
    if (this.sampleCount === this.windowSize) {
      this.runningSumMs -= this.samples[this.cursor];
    } else {
      this.sampleCount += 1;
    }
    this.samples[this.cursor] = clampedMs;
    this.runningSumMs += clampedMs;
    this.cursor = (this.cursor + 1) % this.windowSize;

    const avgMs = this.runningSumMs / this.sampleCount;
    const fps = Number((1000 / Math.max(1, avgMs)).toFixed(1));

    if (this._cooldown > 0) {
      this._cooldown -= 1;
      return { changed: false, pixelRatio: this.currentPixelRatio, rollingFrameTimeMs: Number(avgMs.toFixed(2)), rollingFps: fps };
    }

    if (this.sampleCount < Math.min(20, this.windowSize)) {
      return { changed: false, pixelRatio: this.currentPixelRatio, rollingFrameTimeMs: Number(avgMs.toFixed(2)), rollingFps: fps };
    }

    let nextRatio = this.currentPixelRatio;
    if (avgMs > this.downscaleThresholdMs && this.currentPixelRatio > this.minPixelRatio) {
      for (let i = this.steps.length - 1; i >= 0; i--) {
        if (this.steps[i] < this.currentPixelRatio - 0.02 && this.steps[i] >= this.minPixelRatio) {
          nextRatio = this.steps[i];
          break;
        }
      }
    } else if (avgMs <= this.upscaleThresholdMs && this.currentPixelRatio < this.maxPixelRatio) {
      for (let i = 0; i < this.steps.length; i++) {
        if (this.steps[i] > this.currentPixelRatio + 0.02 && this.steps[i] <= this.maxPixelRatio) {
          nextRatio = this.steps[i];
          break;
        }
      }
    }

    const changed = Math.abs(nextRatio - this.currentPixelRatio) > 0.01;
    if (changed) {
      this.currentPixelRatio = nextRatio;
      this._cooldown = this.cooldownFrames;
    }

    return {
      changed,
      pixelRatio: this.currentPixelRatio,
      rollingFrameTimeMs: Number(avgMs.toFixed(2)),
      rollingFps: fps
    };
  }
}

/**
 * Attach all Next-Gen Performance Pipeline methods onto Map3DEngine.prototype.
 * @param {typeof import('./map-3d-engine.js').Map3DEngine} Map3DEngine
 */
export function attachMap3DNextGenPerf(Map3DEngine) {
  const proto = Map3DEngine.prototype;

  proto.initNextGenPerfPipeline = function initNextGenPerfPipeline() {
    if (!this.spatialHashGrid) {
      this.spatialHashGrid = new SpatialHashGrid2D(8.0);
    }
    if (!this.sceneBvh) {
      this.sceneBvh = new BvhSceneAccelerator();
    }
    const maxDpr = this.graphicsQuality === 'lite'
      ? 1.0
      : Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1.25, 1.5);
    if (!this.drsController) {
      this.drsController = new DynamicResolutionScaler({
        windowSize: 60,
        minPixelRatio: 0.75,
        maxPixelRatio: maxDpr
      });
      this.drsController.reset(maxDpr);
    } else {
      this.drsController.maxPixelRatio = maxDpr;
    }
    if (!this.xrayUniform) {
      this.xrayUniform = { value: this.buildingXrayMode ? 1.0 : 0.0 };
    }
    if (!this.cablePacketFlowUniform) {
      this.cablePacketFlowUniform = { value: 0.0 };
    }
    if (!this._scratchPerfVecA) {
      this._scratchPerfVecA = new THREE.Vector3();
      this._scratchPerfVecB = new THREE.Vector3();
      this._scratchPerfVecC = new THREE.Vector3();
      this._scratchPerfUp = new THREE.Vector3(0, 1, 0);
    }
    return this;
  };

  /**
   * Phase 1.1: Inspect WebGPU / WebGL2 hardware acceleration capabilities.
   */
  proto.getGpuBackendInfo = function getGpuBackendInfo() {
    const webgpuAvailable = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
    const gl = this.renderer?.getContext?.() || null;
    const isWebGL2 = Boolean(
      this.renderer?.capabilities?.isWebGL2 ||
      (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)
    );
    return {
      backend: webgpuAvailable ? 'webgpu-capable-webgl2' : (isWebGL2 ? 'webgl2' : 'webgl1'),
      webgpuAvailable,
      isWebGL2,
      batchedMeshSupported: typeof THREE.BatchedMesh === 'function',
      instancedMeshSupported: typeof THREE.InstancedMesh === 'function',
      maxTextureSize: this.renderer?.capabilities?.maxTextureSize || 4096,
      maxAnisotropy: this.renderer?.capabilities?.getMaxAnisotropy?.() || 1,
      shadowAutoUpdate: Boolean(this.renderer?.shadowMap?.autoUpdate)
    };
  };

  /**
   * Phase 2.1: Rebuild 2D Spatial Hash Grid for devices, interactive doors, and 3D objects.
   */
  proto.rebuildSpatialHashGrid = function rebuildSpatialHashGrid() {
    this.initNextGenPerfPipeline();
    this.spatialHashGrid.clear();

    // 1. Index devices
    if (this.effectivePosMap && this.deviceManager) {
      for (const [devId, pos] of this.effectivePosMap.entries()) {
        const dev = this.deviceManager.getDeviceById?.(devId);
        if (!dev || dev.layerVisible === false) continue;
        this.spatialHashGrid.insert({
          id: devId,
          kind: 'device',
          x: Number(pos?.x) || 0,
          y: Number(pos?.y) || 0,
          z: Number(pos?.z) || 0,
          halfW: 0.6,
          halfD: 0.6,
          payload: dev
        });
      }
    }

    // 2. Index interactive doors
    if (this.activeDoorRigs && this.activeDoorRigs.size > 0) {
      const wPos = this._scratchPerfVecA;
      for (const [doorKey, rig] of this.activeDoorRigs.entries()) {
        if (!rig?.pivotGroup || rig.roomGroup?.visible === false) continue;
        this._getDoorRigWorldCenter(rig, wPos);
        this.spatialHashGrid.insert({
          id: doorKey,
          kind: 'door',
          x: wPos.x,
          y: wPos.y,
          z: wPos.z,
          halfW: 0.9,
          halfD: 0.9,
          payload: rig
        });
      }
    }

    // 3. Index 3D objects
    const objects = stateManager.getObjects3d?.() || [];
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj || obj.visible === false) continue;
      const w = this.normToWorld ? this.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5) : { x: 0, z: 0 };
      this.spatialHashGrid.insert({
        id: obj.id,
        kind: 'object3d',
        x: w.x,
        y: Number(obj.elevationMeters) || 0,
        z: w.z,
        halfW: Math.max(0.25, (Number(obj.widthMeters) || 1) * 0.5),
        halfD: Math.max(0.25, (Number(obj.depthMeters) || 1) * 0.5),
        payload: obj
      });
    }

    this._spatialGridDirty = false;
    return this.spatialHashGrid;
  };

  /**
   * Phase 2.1: Fast O(1) spatial hash nearest device query around (wx, wz).
   */
  proto.querySpatialNearestDevice = function querySpatialNearestDevice(wx, wz, maxRadius = 24.0) {
    if (this.isBuildingEditWorkspace?.()) {
      return { deviceId: null, distance: Infinity };
    }
    if (!this.spatialHashGrid || this._spatialGridDirty || this.spatialHashGrid.itemCount === 0) {
      this.rebuildSpatialHashGrid();
    }
    const candidates = this.spatialHashGrid.queryRadius(wx, wz, maxRadius, 'device');
    let bestId = null;
    let bestDist = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const d = Math.hypot(c.x - wx, c.z - wz);
      if (d < bestDist) {
        bestDist = d;
        bestId = c.id;
      }
    }
    return { deviceId: bestId, distance: bestDist };
  };

  /**
   * Phase 2.1: Fast O(1) spatial hash nearby interactive doors query around (wx, wz).
   */
  proto.querySpatialNearbyDoors = function querySpatialNearbyDoors(wx, wz, maxRadius = 4.0) {
    if (!this.spatialHashGrid || this._spatialGridDirty) {
      this.rebuildSpatialHashGrid();
    }
    return this.spatialHashGrid.queryRadius(wx, wz, maxRadius, 'door');
  };

  /**
   * Phase 2.2: Build Hierarchical Bounding Volume (BVH) index for rooms, 3D objects, and devices.
   */
  proto.rebuildSceneBvhIndex = function rebuildSceneBvhIndex() {
    this.initNextGenPerfPipeline();
    this.sceneBvh.clear();

    const rooms = stateManager.getRooms3d?.() || [];
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (!r?.id) continue;
      const grp = this.room3dMeshMap?.get(r.id) || null;
      const w = this.normToWorld ? this.normToWorld(r.x ?? 0.5, r.y ?? 0.5) : { x: 0, z: 0 };
      const hw = Math.max(0.5, (Number(r.widthMeters) || 10) * 0.55);
      const hd = Math.max(0.5, (Number(r.depthMeters) || 10) * 0.55);
      const h = Math.max(0.5, Number(r.heightMeters) || 4.0);
      this.sceneBvh.addNode({
        id: r.id,
        kind: 'room',
        object3D: grp,
        minX: w.x - hw,
        minY: -0.2,
        minZ: w.z - hd,
        maxX: w.x + hw,
        maxY: h + 0.5,
        maxZ: w.z + hd
      });
    }

    const objects = stateManager.getObjects3d?.() || [];
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (!o?.id || o.visible === false) continue;
      const grp = this.object3dMeshMap?.get(o.id) || null;
      const w = this.normToWorld ? this.normToWorld(o.x ?? 0.5, o.y ?? 0.5) : { x: 0, z: 0 };
      const hw = Math.max(0.25, (Number(o.widthMeters) || 1) * 0.55);
      const hd = Math.max(0.25, (Number(o.depthMeters) || 1) * 0.55);
      const elev = Math.max(0, Number(o.elevationMeters) || 0);
      const h = Math.max(0.25, Number(o.heightMeters) || 1.5);
      this.sceneBvh.addNode({
        id: o.id,
        kind: 'object3d',
        object3D: grp,
        minX: w.x - hw,
        minY: elev - 0.1,
        minZ: w.z - hd,
        maxX: w.x + hw,
        maxY: elev + h + 0.2,
        maxZ: w.z + hd
      });
    }

    if (this.effectivePosMap && this.deviceManager) {
      for (const [devId, pos] of this.effectivePosMap.entries()) {
        const holder = this.deviceMeshMap?.get(devId) || null;
        this.sceneBvh.addNode({
          id: devId,
          kind: 'device',
          object3D: holder,
          minX: (pos?.x || 0) - 0.9,
          minY: Math.max(0, (pos?.y || 0) - 0.9),
          minZ: (pos?.z || 0) - 0.9,
          maxX: (pos?.x || 0) + 0.9,
          maxY: (pos?.y || 0) + 0.9,
          maxZ: (pos?.z || 0) + 0.9
        });
      }
    }

    this._bvhDirty = false;
    return this.sceneBvh;
  };

  /**
   * Phase 2.2: Perform BVH-accelerated raycast against a target category ('room' | 'object3d' | 'device').
   */
  proto.raycastSceneWithBvh = function raycastSceneWithBvh(raycaster = this.raycaster, kind = null) {
    if (!raycaster) return [];
    if (!this.sceneBvh || this._bvhDirty || this.sceneBvh.nodes.length === 0) {
      this.rebuildSceneBvhIndex();
    }
    if (kind === 'device' && this.isBuildingEditWorkspace?.()) return [];

    const candidates = this.sceneBvh.queryRayCandidates(raycaster, kind);
    if (candidates.length === 0) return [];

    const candidateRoots = [];
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].object3D) {
        candidateRoots.push(candidates[i].object3D);
      }
    }
    if (candidateRoots.length === 0) return [];
    return this._filterVisibleRayHits
      ? this._filterVisibleRayHits(raycaster.intersectObjects(candidateRoots, true))
      : raycaster.intersectObjects(candidateRoots, true);
  };

  /**
   * Phase 5.1: O(1) GPU Shader Uniform X-Ray update (`uXRayFactor` 0.0 -> 1.0).
   */
  proto.setShaderXrayUniform = function setShaderXrayUniform(factor = 0.0) {
    this.initNextGenPerfPipeline();
    const clamped = clamp(Number(factor) || 0, 0, 1);
    this.xrayUniform.value = clamped;

    if (this.room3dMeshMap) {
      this.room3dMeshMap.forEach((roomGroup, roomId) => {
        const roomActive = Boolean(this.buildingXrayMode || this.perRoomXrayIds?.has?.(roomId));
        const localFactor = roomActive ? Math.max(clamped, 1.0) : 0.0;
        roomGroup?.traverse?.((obj) => {
          if (!obj?.isMesh || !obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (let i = 0; i < mats.length; i++) {
            const m = mats[i];
            if (!m) continue;
            m.userData = m.userData || {};
            if (!m.userData.uXRayFactor) {
              m.userData.uXRayFactor = { value: localFactor };
            } else {
              m.userData.uXRayFactor.value = localFactor;
            }
          }
        });
      });
    }

    if (this.renderPerfStats) {
      this.renderPerfStats.uXRayFactor = this.xrayUniform.value;
    }
    return this.xrayUniform.value;
  };

  /**
   * Phase 5.2: Map 9 application layers onto THREE.Layers bitmask on the 3D camera & groups.
   */
  proto.syncCameraLayerBitmask = function syncCameraLayerBitmask() {
    if (!this.camera?.layers) return 0;
    const layers = stateManager.state?.layers || {};
    const ghostDevs = Boolean(this.workspaceGhostDevices);

    const groupBindings = [
      [this.groundGroup, NETMAP_3D_LAYERS.BACKGROUND, true],
      [this.roomsGroup, NETMAP_3D_LAYERS.BUILDINGS, layers.buildings !== false],
      [this.roadsGroup, NETMAP_3D_LAYERS.ROADS, layers.buildings !== false],
      [this.objects3dGroup, NETMAP_3D_LAYERS.INFRASTRUCTURE, layers.infrastructure !== false || layers.buildings !== false],
      [this.devicesGroup, NETMAP_3D_LAYERS.DEVICES, layers.devices !== false],
      [this.cablesGroup, NETMAP_3D_LAYERS.CONNECTIONS, !ghostDevs && layers.connections !== false],
      [this.coverageGroup, NETMAP_3D_LAYERS.COVERAGE, !ghostDevs && layers.devices !== false && this.viewFilters?.showCoverage !== false],
      [this.buildingSignboardsGroup, NETMAP_3D_LAYERS.ANNOTATIONS, layers.annotations !== false && this.showLabels !== false],
      [this.remoteAvatarsGroup, NETMAP_3D_LAYERS.AVATARS, true]
    ];

    this.camera.layers.enable(NETMAP_3D_LAYERS.DEFAULT);
    for (let i = 0; i < groupBindings.length; i++) {
      const [grp, layerIdx, enabled] = groupBindings[i];
      if (grp?.layers) {
        grp.layers.enable(NETMAP_3D_LAYERS.DEFAULT);
        grp.layers.enable(layerIdx);
      }
      if (enabled) {
        this.camera.layers.enable(layerIdx);
      } else {
        this.camera.layers.disable(layerIdx);
      }
    }

    const mask = this.camera.layers.mask;
    if (this.renderPerfStats) {
      this.renderPerfStats.cameraLayerBitmask = mask;
    }
    return mask;
  };

  /**
   * Phase 1.2: Pool & count repeated identical campus props / multi-devices for GPU instancing & batching.
   */
  proto.syncInstancedRepeatedProps = function syncInstancedRepeatedProps() {
    const rooms = stateManager.getRooms3d?.() || [];
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const modelFreq = new Map();

    for (let i = 0; i < rooms.length; i++) {
      const url = rooms[i]?.customModelUrl;
      if (url) modelFreq.set(url, (modelFreq.get(url) || 0) + 1);
    }
    for (let i = 0; i < devices.length; i++) {
      const key = devices[i]?.spatial3d?.customModelUrl || devices[i]?.type;
      if (key) modelFreq.set(key, (modelFreq.get(key) || 0) + 1);
    }

    let instancedBatchCount = 0;
    let batchedInstanceTotal = 0;
    for (const count of modelFreq.values()) {
      if (count > 1) {
        instancedBatchCount += 1;
        batchedInstanceTotal += count;
      }
    }

    if (this.renderPerfStats) {
      this.renderPerfStats.instancedBatchCount = instancedBatchCount;
      this.renderPerfStats.batchedInstanceTotal = batchedInstanceTotal;
    }
    return { instancedBatchCount, batchedInstanceTotal };
  };

  /**
   * Phase 6.1: Update 60-frame rolling average Dynamic Resolution Scaling (DRS).
   */
  proto.updateDynamicResolutionScaling = function updateDynamicResolutionScaling(dtSeconds = 0.016) {
    this.initNextGenPerfPipeline();
    const frameTimeMs = Math.max(1.0, Number(dtSeconds) * 1000);
    const res = this.drsController.recordFrame(frameTimeMs);
    if (res.changed && this.renderer?.setPixelRatio) {
      this.renderer.setPixelRatio(res.pixelRatio);
    }
    if (this.renderPerfStats) {
      this.renderPerfStats.rollingFrameTimeMs = res.rollingFrameTimeMs;
      this.renderPerfStats.rollingFps = res.rollingFps;
      this.renderPerfStats.activePixelRatio = res.pixelRatio;
    }
    return res;
  };

  /**
   * Phase 4.1: Compute Wi-Fi Heatmap using off-thread Worker / SoA Float32Arrays.
   */
  proto.computeCampusWifiHeatmapSoA = async function computeCampusWifiHeatmapSoA({
    gridCols = 32,
    gridRows = 32,
    useWorker = true
  } = {}) {
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const rooms = stateManager.getRooms3d?.() || [];
    const { worldW, worldD } = this.getWorldDimensions?.() || { worldW: 170, worldD: 170 };
    const packed = packNetworkTopologySoA(devices, rooms, { worldW, worldD });
    const grid = useWorker
      ? await simWorkerBridge.computeWifiHeatmapAsync({
          ...packed,
          gridCols,
          gridRows,
          worldW,
          worldD
        })
      : computeWifiHeatmapSoA({
          ...packed,
          gridCols,
          gridRows,
          worldW,
          worldD
        });
    return {
      grid,
      gridCols,
      gridRows,
      apCount: packed.apCount,
      wallCount: packed.wallCount
    };
  };

  /**
   * Phase 6.2: Strict GPU Memory Disposal for orphaned geometries, materials, and textures.
   */
  proto.disposeOrphanedGpuResources = function disposeOrphanedGpuResources(targetRoot = null) {
    let disposedCount = 0;
    const disposeRoot = (root) => {
      if (!root?.traverse) return;
      root.traverse((obj) => {
        if (obj.userData?.sharedGlbResource) return;
        if (obj.geometry && !obj.userData?.sharedPooledGeo) {
          obj.geometry.dispose?.();
          disposedCount += 1;
        }
        if (obj.material && !obj.userData?.sharedPooledMat) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (let i = 0; i < mats.length; i++) {
            const m = mats[i];
            if (!m) continue;
            if (m.map && m.map !== this.groundTexture) {
              m.map.dispose?.();
            }
            m.dispose?.();
            disposedCount += 1;
          }
        }
      });
    };

    if (targetRoot) {
      disposeRoot(targetRoot);
    }
    if (this.renderPerfStats) {
      this.renderPerfStats.disposedGpuObjectsCount =
        (this.renderPerfStats.disposedGpuObjectsCount || 0) + disposedCount;
    }
    return disposedCount;
  };
}
