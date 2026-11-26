/**
 * NetMap 3D — Extracted Subsystems Mixin (Build Placement HUD, Room Cutaway,
 * 3-Tier Hierarchical LOD, Indoor Occlusion Culling, View Filters & X-Ray Shaders)
 * Keeps map-3d-engine.js compact and modular (< 450 KB).
 */

/**
 * NetMap — Interactive 3D Map Viewport Engine (Three.js WebGL)
 * Visualisasi 3D perangkat bertumpuk (Server, Router, Switch, Access Point),
 * kabel 3D ber-elevasi, cakupan sinyal nirkabel, ruangan 3D kustom, serta loader model .glb/.gltf.
 */

import * as THREE from 'three';

const { Vector3, Matrix3, Color, Raycaster, CurvePath, LineCurve3, TubeGeometry, MeshBasicMaterial, Mesh, RingGeometry, DoubleSide, Group } = THREE;
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


class Map3DSubsystemsMixin {
  syncBuildPlacementHudUI() {
    if (typeof document === 'undefined') return;
    const hudEl = document.getElementById('hud-3d-avatar-bar');
    const cfg = this.getBuildPlacementConfig();
    if (hudEl) {
      const isBuildOpen = Boolean(cfg.buildModeEnabled && !this.avatarSimDeckOpen && !this.avatarSimSettingsOpen);

      hudEl.querySelector('#btn-avatar-build-mode')?.classList?.toggle('active', Boolean(cfg.buildModeEnabled));
      hudEl.querySelector('#btn-avatar-sim-devices')?.classList?.toggle('active', Boolean(this.avatarSimDeckOpen));
      hudEl.querySelector('#btn-avatar-sim-settings')?.classList?.toggle('active', Boolean(this.avatarSimSettingsOpen));
      hudEl.querySelector('#avatar-sim-device-deck')?.classList?.toggle('hidden', !this.avatarSimDeckOpen);
      hudEl.querySelector('#avatar-sim-settings-popover')?.classList?.toggle('hidden', !this.avatarSimSettingsOpen);
      hudEl.querySelector('#avatar-sim-build-panel')?.classList?.toggle('hidden', !isBuildOpen);

      const gridBtn = hudEl.querySelector('#btn-build-grid-snap');
      if (gridBtn) {
        gridBtn.classList.toggle('active', cfg.gridSnapEnabled);
        gridBtn.innerHTML = cfg.gridSnapEnabled
          ? `${uiIcon('grid', 11)} Snap Grid: ON`
          : `${uiIcon('move', 11)} Free Placement`;
      }
      const gridSel = hudEl.querySelector('#select-build-grid-size');
      if (gridSel) gridSel.value = String(cfg.gridSnapMeters);

      const angleSel = hudEl.querySelector('#select-build-angle-snap');
      if (angleSel) angleSel.value = String(cfg.angleSnapDeg);

      const colBtn = hudEl.querySelector('#btn-build-collision');
      if (colBtn) {
        colBtn.classList.toggle('active', cfg.allowClipping);
        colBtn.classList.toggle('is-moveobjects', cfg.allowClipping);
        colBtn.innerHTML = cfg.allowClipping
          ? `${uiIcon('layers', 11)} MoveObjects (Bebas)`
          : `${uiIcon('shield', 11)} Anti-Tabrakan`;
      }

      const surfBtn = hudEl.querySelector('#btn-build-surface-snap');
      if (surfBtn) {
        surfBtn.classList.toggle('active', cfg.surfaceSnapEnabled);
        surfBtn.innerHTML = cfg.surfaceSnapEnabled
          ? `${uiIcon('magnet', 11)} Tempel Meja/Rak: ON`
          : `${uiIcon('magnet', 11)} Surface Snap: OFF`;
      }

      const gizBtn = hudEl.querySelector('#btn-build-gizmo');
      if (gizBtn) {
        gizBtn.classList.toggle('active', cfg.gizmoEnabled);
        gizBtn.innerHTML = cfg.gizmoEnabled
          ? `${uiIcon('target', 11)} Gizmo: ON`
          : `${uiIcon('target', 11)} Gizmo: OFF`;
      }
      const gizSel = hudEl.querySelector('#select-build-gizmo-mode');
      if (gizSel) gizSel.value = cfg.gizmoMode;

      const badge = hudEl?.querySelector('#build-mode-target-badge');
      if (badge) {
        const targetDev = this.getTransformGizmoTargetDevice();
        badge.textContent = targetDev ? `Target: ${targetDev.name}` : 'Target: --';
      }
    }

    // Sync dedicated Edit Bangunan 3D floating bar when rendered in DOM
    const studioBar = document.getElementById('hud-3d-build-studio');
    if (studioBar) {
      const sGrid = studioBar.querySelector('#btn-studio-grid-snap');
      if (sGrid) {
        sGrid.classList.toggle('active', cfg.gridSnapEnabled);
        sGrid.innerHTML = `${uiIcon('grid', 12)} <span>${cfg.gridSnapEnabled ? 'Snap: ON' : 'Bebas'}</span>`;
      }
      const sGridSz = studioBar.querySelector('#select-studio-grid-size');
      if (sGridSz) {
        sGridSz.value = String(cfg.gridSnapMeters);
        sGridSz.style.display = cfg.gridSnapEnabled ? '' : 'none';
      }
      const sAngle = studioBar.querySelector('#select-studio-angle-snap');
      if (sAngle) sAngle.value = String(cfg.angleSnapDeg);
      const sCol = studioBar.querySelector('#btn-studio-collision');
      if (sCol) {
        sCol.classList.toggle('active', cfg.allowClipping);
        sCol.innerHTML = `${uiIcon(cfg.allowClipping ? 'layers' : 'shield', 12)} <span>${cfg.allowClipping ? 'Tembus' : 'Anti-Tabrakan'}</span>`;
      }
      const sSurf = studioBar.querySelector('#btn-studio-surface-snap');
      if (sSurf) {
        sSurf.classList.toggle('active', cfg.surfaceSnapEnabled);
      }
      const sGiz = studioBar.querySelector('#btn-studio-gizmo');
      if (sGiz) {
        sGiz.classList.toggle('active', cfg.gizmoEnabled);
        sGiz.innerHTML = `${uiIcon('move', 12)} <span>${cfg.gizmoEnabled ? 'Gizmo: ON' : 'Gizmo: OFF'}</span>`;
      }
      const sGizMode = studioBar.querySelector('#select-studio-gizmo-mode');
      if (sGizMode) {
        sGizMode.value = cfg.gizmoMode;
        sGizMode.style.display = cfg.gizmoEnabled ? '' : 'none';
      }
    }
  }

  applyBuildGridSnapWorld(wx, wz) {
    const rawX = Number(wx) || 0;
    const rawZ = Number(wz) || 0;
    if (!this.buildPlacementConfig?.gridSnapEnabled) {
      return { x: rawX, z: rawZ, snapped: false };
    }
    const step = clamp(Number(this.buildPlacementConfig?.gridSnapMeters) || 0.5, 0.1, 5.0);
    return {
      x: Math.round(rawX / step) * step,
      z: Math.round(rawZ / step) * step,
      snapped: true
    };
  }

  applyBuildAngleSnap(deg, { signed = false } = {}) {
    const raw = Number(deg) || 0;
    const snap = Number(this.buildPlacementConfig?.angleSnapDeg) || 0;
    const val = snap > 0 ? Math.round(raw / snap) * snap : Math.round(raw);
    if (signed) {
      return clamp(val, -180, 180);
    }
    return ((val % 360) + 360) % 360;
  }

  resolveBuildPlacementSurfaceElevation(wx, wz, currentElev = 0, { excludeId = '', startSupportY = 0 } = {}) {
    const curY = Number(currentElev) || 0;
    if (!this.buildPlacementConfig?.surfaceSnapEnabled || typeof this.getCarriedDropSupportElevation !== 'function') {
      return { elevationMeters: curY, surfaceSnapped: false };
    }
    const supY = this.getCarriedDropSupportElevation(wx, wz, excludeId);
    const startSup = Number(startSupportY) || 0;
    if (supY > 0.01 && (this.buildPlacementConfig?.buildModeEnabled || supY >= curY - 0.15 || Math.abs(curY - startSup) < 0.15)) {
      return { elevationMeters: Number(supY.toFixed(2)), surfaceSnapped: true };
    }
    if (startSup > 0.01 && supY <= 0.01 && Math.abs(curY - startSup) < 0.15) {
      return { elevationMeters: 0, surfaceSnapped: false };
    }
    return { elevationMeters: curY, surfaceSnapped: false };
  }

  resolveBuildPlacementCollision(wx, wz, elevY = 0, { halfW = 0.45, halfD = 0.38, height = 0.35, excludeIds = [] } = {}) {
    let x = Number(wx) || 0;
    let z = Number(wz) || 0;
    const elev = Number(elevY) || 0;
    if (this.buildPlacementConfig?.allowClipping) {
      return { x, z, collided: false, blockerName: null };
    }
    const excluded = new Set((Array.isArray(excludeIds) ? excludeIds : [excludeIds]).filter(Boolean));
    (this.carriedObjects || []).forEach((c) => {
      if (c?.devId) excluded.add(c.devId);
    });
    const devices = (this.deviceManager?.getAllDevices?.() || []).filter(
      (d) => d && d.layerVisible !== false && !excluded.has(d.id)
    );
    if (devices.length === 0) {
      return { x, z, collided: false, blockerName: null };
    }

    let collided = false;
    let blockerName = null;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const other of devices) {
        const sp = { ...getDefaultSpatial3d(other.type), ...(other.spatial3d || {}) };
        const otherElev = (Number(sp.elevationMeters) || 0) + (Number(sp.offsetY) || 0);
        const otherScale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
        const fp = this.getDeviceCollisionFootprint
          ? this.getDeviceCollisionFootprint(other, otherScale)
          : { halfW: 0.45, halfD: 0.38, height: 0.35 };
        if (elev >= otherElev + fp.height - 0.04 || elev + height <= otherElev + 0.04) {
          continue;
        }

        const otherWorld = (this.normToWorld && other.position)
          ? this.normToWorld(other.position.x, other.position.y)
          : this.effectivePosMap?.get(other.id);
        if (!otherWorld) continue;

        const dx = x - otherWorld.x;
        const dz = z - otherWorld.z;
        const minSepX = halfW + fp.halfW + 0.08;
        const minSepZ = halfD + fp.halfD + 0.08;

        if (Math.abs(dx) < minSepX && Math.abs(dz) < minSepZ) {
          const overlapX = minSepX - Math.abs(dx);
          const overlapZ = minSepZ - Math.abs(dz);
          if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) {
            x += minSepX;
          } else if (overlapX <= overlapZ) {
            x += overlapX * (dx >= 0 ? 1 : -1);
          } else {
            z += overlapZ * (dz >= 0 ? 1 : -1);
          }
          collided = true;
          moved = true;
          if (!blockerName) blockerName = other.name || other.id;
        }
      }
      if (!moved) break;
    }

    return {
      x: Number(x.toFixed(4)),
      z: Number(z.toFixed(4)),
      collided,
      blockerName
    };
  }

  getTransformGizmoTargetDevice() {
    if (this.isBuildingEditWorkspace?.()) return null;
    if (!this.isInitialized || this.simulatorFocusedDeviceId) return null;
    // Keep beginners' view clean (House Flipper style): only render the 3-axis RGB CAD gizmo
    // when both Build Mode AND explicit Gizmo opt-in are enabled.
    if (!this.buildPlacementConfig?.buildModeEnabled || this.buildPlacementConfig?.gizmoEnabled !== true) {
      return null;
    }
    const carriedIds = new Set((this.carriedObjects || []).map((c) => c?.devId).filter(Boolean));

    const selId = this.deviceManager?.selectedDeviceId || null;
    if (selId && !carriedIds.has(selId)) {
      const dev = this.deviceManager?.getDeviceById?.(selId);
      if (dev && dev.layerVisible !== false) return dev;
    }

    if (this.avatarMode) {
      const nearId = this.avatarState?.nearestDeviceId || null;
      const nearDist = Number(this.avatarState?.nearestDist ?? Infinity);
      if (nearId && nearDist <= 15 && !carriedIds.has(nearId)) {
        const nearDev = this.deviceManager?.getDeviceById?.(nearId);
        if (nearDev && nearDev.layerVisible !== false) return nearDev;
      }
    }
    return null;
  }

  _rebuildTransformGizmoVisuals(deviceId, scaleBase, gizmoMode) {
    this.clearGroup(this.transformGizmoGroup);
    const armLen = 1.15 * scaleBase;
    const shaftRad = 0.032 * scaleBase;
    const coneRad = 0.088 * scaleBase;
    const coneLen = 0.24 * scaleBase;
    const hitRad = 0.14 * scaleBase;
    const ringRad = 0.88 * scaleBase;
    const ringTube = 0.026 * scaleBase;

    const showTranslate = gizmoMode === 'both' || gizmoMode === 'translate';
    const showRotate = gizmoMode === 'both' || gizmoMode === 'rotate';

    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * scaleBase, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 })
    );
    coreMesh.renderOrder = 1000;
    this.transformGizmoGroup.add(coreMesh);

    const axes = [
      { axis: 'x', color: 0xef4444, arrowRotZ: -Math.PI / 2, arrowRotX: 0, ringRotX: 0, ringRotY: Math.PI / 2, rScale: 1.0 },
      { axis: 'y', color: 0x22c55e, arrowRotZ: 0, arrowRotX: 0, ringRotX: Math.PI / 2, ringRotY: 0, rScale: 1.04 },
      { axis: 'z', color: 0x3b82f6, arrowRotZ: 0, arrowRotX: Math.PI / 2, ringRotX: 0, ringRotY: 0, rScale: 0.96 }
    ];

    axes.forEach((cfg) => {
      if (showTranslate) {
        const axisGroup = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          depthTest: false,
          transparent: true,
          opacity: 0.94
        });

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRad, shaftRad, armLen, 10), mat);
        shaft.position.y = armLen * 0.5;
        shaft.renderOrder = 1000;
        shaft.userData = { isTransformGizmo: true, gizmoKind: 'translate', gizmoAxis: cfg.axis, deviceId };
        axisGroup.add(shaft);

        const cone = new THREE.Mesh(new THREE.ConeGeometry(coneRad, coneLen, 12), mat);
        cone.position.y = armLen + coneLen * 0.5;
        cone.renderOrder = 1000;
        cone.userData = { isTransformGizmo: true, gizmoKind: 'translate', gizmoAxis: cfg.axis, deviceId };
        axisGroup.add(cone);

        const hitMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(hitRad, hitRad, armLen + coneLen, 8),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false, depthTest: false })
        );
        hitMesh.position.y = (armLen + coneLen) * 0.5;
        hitMesh.renderOrder = 1000;
        hitMesh.userData = { isTransformGizmo: true, gizmoKind: 'translate', gizmoAxis: cfg.axis, deviceId };
        axisGroup.add(hitMesh);

        axisGroup.rotation.set(cfg.arrowRotX, 0, cfg.arrowRotZ);
        this.transformGizmoGroup.add(axisGroup);
      }

      if (showRotate) {
        const ringMat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          depthTest: false,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRad * cfg.rScale, ringTube, 8, 42), ringMat);
        ring.rotation.set(cfg.ringRotX, cfg.ringRotY, 0);
        ring.renderOrder = 999;
        ring.userData = { isTransformGizmo: true, gizmoKind: 'rotate', gizmoAxis: cfg.axis, deviceId };
        this.transformGizmoGroup.add(ring);
      }
    });

    this.transformGizmoGroup.userData = { deviceId, scaleBase, gizmoMode };
  }

  /** Compute where the held object will land along the crosshair/camera ray (House-Flipper aim target). */
  computeAvatarAimPlacementTarget({ item = null, includeCarryOffset = true } = {}) {
    const ax = Number(this.avatarState?.x) || 0;
    const ay = Math.max(0, Number(this.avatarState?.y) || 0);
    const az = Number(this.avatarState?.z) || 0;
    const yaw = Number(this.avatarState?.yaw) || 0;
    const scale = resolveEngineAvatarScale(this);
    const surfaceSnapOn = this.buildPlacementConfig?.surfaceSnapEnabled !== false;

    const pose = typeof this.getAvatarFollowCameraPose === 'function'
      ? this.getAvatarFollowCameraPose(this.avatarState?.camDist)
      : null;
    const rayOrigin = pose?.endPos
      ? pose.endPos.clone()
      : new THREE.Vector3(ax, ay + 1.5 * scale, az);
    const rayDir = (pose?.target && pose?.endPos)
      ? pose.target.clone().sub(pose.endPos).normalize()
      : new THREE.Vector3(Math.sin(this.avatarState?.camYaw ?? yaw), -0.25, Math.cos(this.avatarState?.camYaw ?? yaw)).normalize();

    const activeItem = item || (Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0
      ? this.carriedObjects[this.carriedObjects.length - 1]
      : null);
    const carryZOffset = includeCarryOffset ? (Number(activeItem?.carryElevationOffset) || 0) : 0;

    // 1) Check direct 3D Wall mount if carrying a network device and surface snap is active
    if (activeItem?.kind === 'device' && surfaceSnapOn && this.find3DWallMountTarget) {
      const dev = this.deviceManager?.getDeviceById?.(activeItem.devId);
      const wallOrigin = this.avatarPerspective === 'fpp'
        ? rayOrigin.clone()
        : new THREE.Vector3(ax, ay + 1.42 * scale, az);
      const wallHit = dev
        ? this.find3DWallMountTarget(wallOrigin, rayDir, 6.8, { device: dev, minHitY: 0.25, maxHitY: 12.0 })
        : null;
      if (wallHit) {
        const rawWallElev = clamp(wallHit.elevationMeters, 0.25, 11.5);
        return {
          mode: 'wall',
          worldX: wallHit.worldPos.x,
          worldZ: wallHit.worldPos.z,
          baseElevationMeters: Number(rawWallElev.toFixed(2)),
          elevationMeters: Number(clamp(rawWallElev + carryZOffset, 0, 20).toFixed(2)),
          rotationY: wallHit.rotationY,
          worldNormal: wallHit.worldNormal,
          hitPoint: wallHit.point
        };
      }
    }

    // 2) Raycast onto horizontal desks, server racks, room floors, or ground plane within comfortable reach
    let hitWorldX = null;
    let hitWorldZ = null;

    if (this.raycaster && this.scene) {
      const carriedIds = new Set((this.carriedObjects || []).map((c) => c.objId || c.devId));
      const surfaceRoots = [];
      if (this.objects3dGroup?.visible) {
        this.object3dMeshMap?.forEach((grp, id) => {
          if (grp && grp.visible !== false && !carriedIds.has(id)) surfaceRoots.push(grp);
        });
      }
      if (this.roomsGroup?.visible && this.roomsGroup?.children?.length > 0) {
        surfaceRoots.push(...this.roomsGroup.children);
      }

      if (surfaceRoots.length > 0) {
        if (this.camera) this.raycaster.camera = this.camera;
        this.raycaster.set(rayOrigin, rayDir);
        const hits = this._filterVisibleRayHits(this.raycaster.intersectObjects(surfaceRoots, true));
        const nMat = new THREE.Matrix3();
        const wNorm = new THREE.Vector3();
        for (const h of hits) {
          if (!h?.object?.isMesh || !h.face) continue;
          if (h.object.userData?.isRoomGizmo || h.object.userData?.isObject3dGizmo) continue;
          nMat.getNormalMatrix(h.object.matrixWorld);
          wNorm.copy(h.face.normal).applyMatrix3(nMat).normalize();
          if (wNorm.y < 0.65) continue; // Only upward support surfaces
          const dAvatar = Math.hypot(h.point.x - ax, h.point.z - az);
          if (dAvatar >= 1.0 && dAvatar <= 9.5) {
            hitWorldX = h.point.x;
            hitWorldZ = h.point.z;
            break;
          }
        }
      }

      if (hitWorldX === null && rayDir.y < -0.04) {
        const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ay);
        const pt = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(floorPlane, pt)) {
          const dAvatar = Math.hypot(pt.x - ax, pt.z - az);
          if (dAvatar <= 14) {
            const clampedD = clamp(dAvatar, 1.3, 9.0);
            const ratio = dAvatar > 0.001 ? clampedD / dAvatar : 1;
            hitWorldX = ax + (pt.x - ax) * ratio;
            hitWorldZ = az + (pt.z - az) * ratio;
          }
        }
      }
    }

    if (hitWorldX === null || hitWorldZ === null) {
      const hLen = Math.hypot(rayDir.x, rayDir.z) || 1;
      const hx = rayDir.x / hLen;
      const hz = rayDir.z / hLen;
      const distAhead = 3.2;
      hitWorldX = ax + hx * distAhead;
      hitWorldZ = az + hz * distAhead;
    }

    if (this.applyBuildGridSnapWorld) {
      const snappedXZ = this.applyBuildGridSnapWorld(hitWorldX, hitWorldZ);
      hitWorldX = snappedXZ.x;
      hitWorldZ = snappedXZ.z;
    }

    const { worldW, worldD } = this.getWorldDimensions ? this.getWorldDimensions() : { worldW: 100, worldD: 80 };
    hitWorldX = clamp(hitWorldX, -worldW * 0.49, worldW * 0.49);
    hitWorldZ = clamp(hitWorldZ, -worldD * 0.49, worldD * 0.49);

    const dropElev = surfaceSnapOn && this.getCarriedDropSupportElevation
      ? this.getCarriedDropSupportElevation(hitWorldX, hitWorldZ, activeItem?.objId || activeItem?.devId || '')
      : ay;
    const baseElev = Math.max(0, Number(dropElev) || 0);
    const finalElev = clamp(baseElev + carryZOffset, 0, 20);
    const worldRotY = ((yaw * 180) / Math.PI) + (Number(activeItem?.relativeYawOffset) || 0);
    const normRotY = this.applyBuildAngleSnap
      ? this.applyBuildAngleSnap(worldRotY)
      : (((Math.round(worldRotY) % 360) + 360) % 360);

    return {
      mode: 'surface',
      worldX: Number(hitWorldX.toFixed(3)),
      worldZ: Number(hitWorldZ.toFixed(3)),
      baseElevationMeters: Number(baseElev.toFixed(2)),
      elevationMeters: Number(finalElev.toFixed(2)),
      rotationY: normRotY
    };
  }

  _ensureSimplePlacementIndicatorGroup() {
    if (!this.simplePlacementIndicatorGroup) {
      this.simplePlacementIndicatorGroup = new THREE.Group();
      this.simplePlacementIndicatorGroup.name = 'HouseFlipperPlacementIndicator3D';
    }
    if (this.simplePlacementIndicatorGroup.children.length > 0) return this.simplePlacementIndicatorGroup;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.50, 36), ringMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.renderOrder = 950;
    outerRing.userData = { isSimplePlacementIndicator: true, part: 'ring' };

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 36), innerMat);
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.renderOrder = 949;
    innerDisc.userData = { isSimplePlacementIndicator: true, part: 'disc' };

    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 3), arrowMat);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.02, 0.59);
    arrow.renderOrder = 951;
    arrow.userData = { isSimplePlacementIndicator: true, part: 'arrow' };

    // Plumb-line stem & floor reference ring when elevated above ground/surface
    const stemMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const elevStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), stemMat);
    elevStem.visible = false;
    elevStem.renderOrder = 948;
    elevStem.userData = { isSimplePlacementIndicator: true, part: 'elevStem' };

    const footMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const elevFoot = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), footMat);
    elevFoot.rotation.x = -Math.PI / 2;
    elevFoot.visible = false;
    elevFoot.renderOrder = 948;
    elevFoot.userData = { isSimplePlacementIndicator: true, part: 'elevFoot' };

    this.simplePlacementIndicatorGroup.add(innerDisc, outerRing, arrow, elevStem, elevFoot);
    return this.simplePlacementIndicatorGroup;
  }

  /** Renders a subtle green House-Flipper footprint indicator instead of overwhelming RGB rings. */
  syncSimplePlacementIndicator() {
    if (this.isBuildingEditWorkspace?.() && (!Array.isArray(this.carriedObjects) || this.carriedObjects.length === 0)) {
      if (this.simplePlacementIndicatorGroup) this.simplePlacementIndicatorGroup.visible = false;
      return;
    }
    if (!this.scene || !this.isActive || !this.isInitialized) {
      if (this.simplePlacementIndicatorGroup) this.simplePlacementIndicatorGroup.visible = false;
      return;
    }
    const group = this._ensureSimplePlacementIndicatorGroup();
    if (!this.scene.children.includes(group)) {
      this.scene.add(group);
    }

    const updatePlumbStem = (stemHeightMeters, radiusScaleVal) => {
      const stemChild = group.children.find((c) => c?.userData?.part === 'elevStem');
      const footChild = group.children.find((c) => c?.userData?.part === 'elevFoot');
      const len = Math.max(0, Number(stemHeightMeters) || 0);
      const rs = Math.max(0.1, Number(radiusScaleVal) || 1);
      if (len > 0.05) {
        if (stemChild) {
          stemChild.visible = true;
          stemChild.scale.set(1 / rs, len / rs, 1 / rs);
          stemChild.position.set(0, (-len * 0.5) / rs, 0);
        }
        if (footChild) {
          footChild.visible = true;
          footChild.position.set(0, -len / rs + 0.02, 0);
        }
      } else {
        if (stemChild) stemChild.visible = false;
        if (footChild) footChild.visible = false;
      }
    };

    // 1) Carrying items in Mode Teknisi -> show live landing target under crosshair/camera aim
    if (this.avatarMode && !this.simulatorFocusedDeviceId && Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      const topItem = this.carriedObjects[this.carriedObjects.length - 1];
      const aim = this.computeAvatarAimPlacementTarget({ item: topItem });
      const radiusScale = clamp(Math.max(Number(topItem.widthMeters) || 1, Number(topItem.depthMeters) || 1) * 0.72, 0.65, 2.8);
      group.scale.setScalar(radiusScale);
      if (aim.mode === 'wall' && aim.worldNormal) {
        group.position.set(aim.worldX, aim.elevationMeters, aim.worldZ);
        group.rotation.set(Math.PI / 2, (aim.rotationY * Math.PI) / 180, 0, 'YXZ');
        updatePlumbStem(0, radiusScale);
      } else {
        group.position.set(aim.worldX, aim.elevationMeters + 0.03, aim.worldZ);
        group.rotation.set(0, (aim.rotationY * Math.PI) / 180, 0, 'YXZ');
        const stemHeight = Math.max(0, aim.elevationMeters - (aim.baseElevationMeters ?? 0));
        updatePlumbStem(stemHeight > 0.05 ? stemHeight : aim.elevationMeters, radiusScale);
      }
      group.visible = true;
      return;
    }

    updatePlumbStem(0, 1);

    // 2) Hovering / within easy grab reach in Mode Teknisi + Move tool -> highlight target floor ring
    if (this.avatarMode && !this.simulatorFocusedDeviceId && this.navTool === 'move') {
      const nearestPick = this.findNearestPickableObjectToAvatar?.();
      if (nearestPick?.obj) {
        let px = 0;
        let py = 0;
        let pz = 0;
        let rotY = 0;
        let radius = 0.85;
        if (nearestPick.kind === 'device') {
          const holder = this.deviceMeshMap?.get(nearestPick.id);
          const w = holder ? holder.position : this.normToWorld?.(nearestPick.obj.position?.x ?? 0.5, nearestPick.obj.position?.y ?? 0.5);
          px = w?.x ?? 0;
          py = holder ? holder.position.y : Math.max(0, Number(nearestPick.obj.spatial3d?.elevationMeters) || 0);
          pz = w?.z ?? 0;
          rotY = Number(nearestPick.obj.spatial3d?.rotationY) || 0;
          radius = clamp(0.45 * (this.deviceScaleMultiplier || 1.0), 0.7, 2.2);
        } else {
          const w = this.normToWorld?.(nearestPick.obj.x ?? 0.5, nearestPick.obj.y ?? 0.5);
          px = w?.x ?? 0;
          py = Math.max(0, Number(nearestPick.obj.elevationMeters) || 0);
          pz = w?.z ?? 0;
          rotY = Number(nearestPick.obj.rotationY ?? nearestPick.obj.rotationDeg) || 0;
          radius = clamp(Math.max(Number(nearestPick.obj.widthMeters) || 1, Number(nearestPick.obj.depthMeters) || 1) * 0.65, 0.7, 2.8);
        }
        group.position.set(px, py + 0.025, pz);
        group.rotation.set(0, (rotY * Math.PI) / 180, 0, 'YXZ');
        group.scale.setScalar(radius);
        group.visible = true;
        return;
      }
    }

    // 3) Free-Camera Move mode with selected or dragged device (when RGB gizmo is hidden)
    if (!this.avatarMode && (this.navTool === 'move' || this.dragMoveState) && !this.transformGizmoGroup?.visible) {
      const targetId = this.dragMoveState?.deviceId || this.deviceManager?.selectedDeviceId || null;
      const dev = targetId ? this.deviceManager?.getDeviceById?.(targetId) : null;
      if (dev && dev.layerVisible !== false) {
        const holder = this.deviceMeshMap?.get(dev.id);
        const w = holder ? holder.position : this.normToWorld?.(dev.position?.x ?? 0.5, dev.position?.y ?? 0.5);
        const py = holder ? holder.position.y : Math.max(0, Number(dev.spatial3d?.elevationMeters) || 0);
        const rotY = Number(dev.spatial3d?.rotationY) || 0;
        const radius = clamp(0.45 * (this.deviceScaleMultiplier || 1.0), 0.7, 2.2);
        group.position.set(w?.x ?? 0, py + 0.025, w?.z ?? 0);
        group.rotation.set(0, (rotY * Math.PI) / 180, 0, 'YXZ');
        group.scale.setScalar(radius);
        group.visible = true;
        return;
      }
    }

    group.visible = false;
  }

  /** Renders concise 1-line House-Flipper style controls below center crosshair or during Move mode. */
  renderHouseFlipperPromptHud() {
    if (typeof document === 'undefined') return;
    const tipEl = document.getElementById('hud-3d-houseflipper-tip');
    if (!tipEl) return;

    const mobDoorBtn = document.getElementById('btn-mob-door');
    const hideMobDoorBtn = () => {
      if (!mobDoorBtn) return;
      mobDoorBtn.classList?.add('hidden');
      if (mobDoorBtn.style) mobDoorBtn.style.display = 'none';
      if (mobDoorBtn.dataset) delete mobDoorBtn.dataset.doorKey;
    };
    const isMobileTouch = Boolean(
      this._touchActiveInSession
      || document.body?.classList?.contains('is-mobile-touch')
      || this.forceMobileHud
      || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches)
    );

    if (!tipEl.dataset.hfBound) {
      tipEl.dataset.hfBound = '1';
      tipEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      tipEl.addEventListener('click', (ev) => {
        const btn = ev.target?.closest?.('[data-hf-action]');
        if (!btn) return;
        ev.stopPropagation();
        const act = btn.dataset.hfAction;
        if (act === 'rotate') {
          this.rotateSelectedIn3D({ dY: 45 });
        } else if (act === 'z-up') {
          this.adjustAvatarTargetOrCarriedElevation(ev.shiftKey ? 0.1 : 0.25);
        } else if (act === 'z-down') {
          this.adjustAvatarTargetOrCarriedElevation(ev.shiftKey ? -0.1 : -0.25);
        } else if (act === 'z-reset') {
          this.resetCarriedElevationOffset();
        } else if (act === 'drop') {
          this.dropCarriedObjectsFromAvatar({ dropAll: Boolean(ev.shiftKey), useAimTarget: true });
        } else if (act === 'pickup') {
          this.pickupNearestObjectFromAvatar();
        } else if (act === 'start-cable') {
          const devId = btn.dataset.deviceId;
          if (devId) this.startAvatarCablePull(devId);
        } else if (act === 'cable-src-port') {
          const portName = btn.dataset.portName || '';
          if (portName) this.setActiveCablePullSourcePort(portName);
        } else if (act === 'cable-dst-clear') {
          if (this.activeCablePull) {
            this.activeCablePull.targetDeviceId = null;
            this.activeCablePull.targetPort = '';
            this._lastHouseFlipperHudKey = '';
            this.renderHouseFlipperPromptHud();
          }
        } else if (act === 'cable-clip') {
          this.placeAvatarCableClip({ shiftKey: Boolean(ev.shiftKey) });
        } else if (act === 'cable-plug') {
          const targetId = btn.dataset.deviceId;
          const targetPort = btn.dataset.portName || '';
          if (targetId) {
            if (targetPort) this.setActiveCablePullTargetPort(targetId, targetPort);
            else this.finishAvatarCablePull(targetId, '');
          }
        } else if (act === 'cable-undo') {
          this.undoAvatarCableClip();
        } else if (act === 'cable-ortho') {
          if (this.activeCablePull) {
            this.activeCablePull.orthoLock = !this.activeCablePull.orthoLock;
            this.activeCablePull.pathStyle = this.activeCablePull.orthoLock ? 'orthogonal' : 'curve';
            this._lastHouseFlipperHudKey = '';
            this.renderHouseFlipperPromptHud();
          }
        } else if (act === 'cable-z-up') {
          this.adjustAvatarCablePullElevation(ev.shiftKey ? 0.1 : 0.25);
        } else if (act === 'cable-z-down') {
          this.adjustAvatarCablePullElevation(ev.shiftKey ? -0.1 : -0.25);
        } else if (act === 'cable-switch-fo') {
          this.setActiveCablePullCategory('fiber-sm');
        } else if (act === 'cable-cancel') {
          this.cancelAvatarCablePull();
        } else if (act === 'toggle-door') {
          const dKey = btn.dataset.doorKey;
          if (dKey) this.toggleInteractiveDoor(dKey);
        }
      });
    }

    if (!this.isActive || this.simulatorFocusedDeviceId) {
      hideMobDoorBtn();
      if (this._lastHouseFlipperHudKey !== 'hidden') {
        this._lastHouseFlipperHudKey = 'hidden';
        tipEl.className = 'hud-3d-houseflipper-tip hidden';
        tipEl.style.display = 'none';
        tipEl.innerHTML = '';
      }
      return;
    }

    if (this.avatarMode && this.activeCablePull) {
      hideMobDoorBtn();
      const pull = this.activeCablePull;
      const aim = this.computeAvatarCableAimTarget();
      const cat = pull.cableCategory || 'cat6';
      const maxLen = getStandardMaxLengthMeters(cat);
      const liveLen = Number(pull.lastLiveLength || 0);
      const lenStatus = liveLen > maxLen ? 'exceeded' : (liveLen > maxLen * 0.85 ? 'warning' : 'ok');
      const srcDev = this.deviceManager?.getDeviceById?.(pull.sourceDeviceId);
      const destDeviceId = (aim?.kind === 'device' && aim.deviceId && aim.deviceId !== pull.sourceDeviceId)
        ? aim.deviceId
        : (pull.targetDeviceId && pull.targetDeviceId !== pull.sourceDeviceId ? pull.targetDeviceId : null);
      const isAimingDest = Boolean(destDeviceId);
      const destDev = isAimingDest ? this.deviceManager?.getDeviceById?.(destDeviceId) : null;
      const srcPorts = this.getDevicePortsStatusList(pull.sourceDeviceId);
      const dstPorts = isAimingDest ? this.getDevicePortsStatusList(destDeviceId) : [];
      const activeDstPort = isAimingDest
        ? ((aim?.kind === 'device' && aim.deviceId === destDeviceId && aim.portName)
          ? aim.portName
          : (pull.targetDeviceId === destDeviceId && pull.targetPort ? pull.targetPort : this._findFirstFreePortName(destDeviceId)))
        : '';
      const clipCount = pull.waypoints.length;
      const zOffStr = Number(pull.elevationOffset || 0).toFixed(2);
      const srcUsedKey = srcPorts.map((p) => (p.occupied ? '1' : '0')).join('');
      const dstUsedKey = dstPorts.map((p) => (p.occupied ? '1' : '0')).join('');
      const key = `cablepull:${cat}:${liveLen.toFixed(1)}:${clipCount}:${pull.orthoLock ? 1 : 0}:${zOffStr}:${pull.sourcePort || ''}:${srcUsedKey}:${destDeviceId || (aim?.surface || 'none')}:${activeDstPort || ''}:${dstUsedKey}`;

      if (this._lastHouseFlipperHudKey !== key) {
        this._lastHouseFlipperHudKey = key;
        tipEl.className = `hud-3d-houseflipper-tip is-pulling-cable is-len-${lenStatus}`;
        tipEl.style.display = 'inline-flex';
        const meterText = `${cat.toUpperCase()} • ${liveLen.toFixed(1)}m / ${maxLen}m • ${clipCount} Klem`;
        const primaryActionHtml = isAimingDest
          ? `<button type="button" class="hf-tip-btn is-primary" data-hf-action="cable-plug" data-device-id="${this.escapeHudHtml(destDeviceId)}" data-port-name="${this.escapeHudHtml(activeDstPort || '')}">Colok ${this.escapeHudHtml(destDev?.name || 'Port')}${activeDstPort ? ` [${this.escapeHudHtml(activeDstPort)}]` : ''} (E)</button>`
          : `<button type="button" class="hf-tip-btn is-primary" data-hf-action="cable-clip">Pasang Klem (Klik)</button>`;
        const foSuggestHtml = (lenStatus === 'exceeded' && !cat.startsWith('fiber'))
          ? `<button type="button" class="hf-tip-btn is-warn" data-hf-action="cable-switch-fo" title="Panjang melebihi 100m UTP — ganti otomatis ke Fiber Optic">Ganti Fiber</button>`
          : '';
        const clearDestBtnHtml = pull.targetDeviceId
          ? `<button type="button" class="hf-tip-btn" data-hf-action="cable-dst-clear" title="Batal kunci perangkat tujuan">Ganti Tujuan</button>`
          : '';

        const srcChipsHtml = srcPorts.length > 0
          ? srcPorts.map((p, idx) => {
            const isSel = p.name === pull.sourcePort;
            const numHint = idx < 9 && !isAimingDest ? `${idx + 1}.` : '';
            return `<button type="button" class="hf-port-chip ${isSel ? 'is-active' : ''} ${p.occupied ? 'is-occupied' : ''}" data-hf-action="cable-src-port" data-port-name="${this.escapeHudHtml(p.name)}" ${p.occupied && !isSel ? 'disabled' : ''} title="${p.occupied ? `Port ${this.escapeHudHtml(p.name)} sudah terpakai` : `Tarik kabel dari port ${this.escapeHudHtml(p.name)}`}">${numHint}${this.escapeHudHtml(p.name)}</button>`;
          }).join('')
          : '';

        const dstChipsHtml = isAimingDest && dstPorts.length > 0
          ? dstPorts.map((p, idx) => {
            const isSel = p.name === activeDstPort;
            const numHint = idx < 9 ? `${idx + 1}.` : '';
            return `<button type="button" class="hf-port-chip is-dest ${isSel ? 'is-active' : ''} ${p.occupied ? 'is-occupied' : ''}" data-hf-action="cable-plug" data-device-id="${this.escapeHudHtml(destDeviceId)}" data-port-name="${this.escapeHudHtml(p.name)}" ${p.occupied ? 'disabled' : ''} title="${p.occupied ? `Port ${this.escapeHudHtml(p.name)} sudah terpakai` : `Pasang kabel ke port ${this.escapeHudHtml(p.name)}`}">${numHint}${this.escapeHudHtml(p.name)}</button>`;
          }).join('')
          : '';

        const portBarsHtml = `
          ${srcChipsHtml ? `<div class="hf-cable-port-bar"><div class="hf-cable-port-group"><span class="hf-cable-port-label">Port Asal (${this.escapeHudHtml(srcDev?.name || 'Sumber')}):</span><div class="hf-cable-port-list">${srcChipsHtml}</div></div></div>` : ''}
          ${dstChipsHtml ? `<div class="hf-cable-port-bar is-dest-bar"><div class="hf-cable-port-group"><span class="hf-cable-port-label">Pilih Port Tujuan (${this.escapeHudHtml(destDev?.name || 'Tujuan')}):</span><div class="hf-cable-port-list">${dstChipsHtml}</div></div></div>` : ''}
        `;

        tipEl.innerHTML = `
          <div class="hf-cable-top-row">
            <span class="hf-cable-meter is-${lenStatus}">${this.escapeHudHtml(meterText)}</span>
            ${foSuggestHtml}
            <button type="button" class="hf-tip-btn" data-hf-action="cable-z-down" title="Turunkan tinggi klem (-0.25m)">Z-</button>
            <button type="button" class="hf-tip-btn" data-hf-action="cable-z-up" title="Naikkan tinggi klem (+0.25m)">Z+</button>
            <button type="button" class="hf-tip-btn ${pull.orthoLock ? 'is-active' : ''}" data-hf-action="cable-ortho" title="Toggle Siku 90° / Bebas">${pull.orthoLock ? '90° Siku' : 'Bebas'}</button>
            <button type="button" class="hf-tip-btn" data-hf-action="cable-undo" ${clipCount === 0 ? 'disabled' : ''} title="Lepas klem terakhir (Backspace)">Undo</button>
            ${primaryActionHtml}
            ${clearDestBtnHtml}
            <button type="button" class="hf-tip-btn is-danger" data-hf-action="cable-cancel" title="Batalkan tarik kabel (Esc)">Batal</button>
          </div>
          ${portBarsHtml}
        `;
      }
      return;
    }

    if (this.avatarMode && Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0) {
      hideMobDoorBtn();
      const topItem = this.carriedObjects[this.carriedObjects.length - 1];
      const aim = this.computeAvatarAimPlacementTarget({ item: topItem });
      const targetElevStr = Number(aim?.elevationMeters ?? 0).toFixed(2);
      const hasCustomZ = Math.abs(Number(topItem?.carryElevationOffset) || 0) > 0.005;
      const countSuffix = this.carriedObjects.length > 1 ? ` (${this.carriedObjects.length})` : '';
      const key = `carry:${this.carriedObjects.length}:${targetElevStr}:${hasCustomZ ? 1 : 0}`;
      if (this._lastHouseFlipperHudKey !== key) {
        this._lastHouseFlipperHudKey = key;
        tipEl.className = 'hud-3d-houseflipper-tip is-carrying';
        tipEl.style.display = 'inline-flex';
        tipEl.innerHTML = `
          <button type="button" class="hf-tip-btn" data-hf-action="z-down" title="Turun Z (-0.25m) • PgDn / ↓ / Shift+Scroll">Z-</button>
          <button type="button" class="hf-tip-zval ${hasCustomZ ? 'is-custom' : ''}" data-hf-action="z-reset" title="Reset Z ke permukaan">Z ${targetElevStr}m</button>
          <button type="button" class="hf-tip-btn" data-hf-action="z-up" title="Naik Z (+0.25m) • PgUp / ↑ / Shift+Scroll">Z+</button>
          <button type="button" class="hf-tip-btn" data-hf-action="rotate" title="Putar 45° (R)">Putar (R)</button>
          <button type="button" class="hf-tip-btn is-primary" data-hf-action="drop" title="Taruh (Klik / E)">Taruh (Klik / E)${countSuffix}</button>
        `;
      }
      return;
    }

    if (this.avatarMode) {
      const nearestPick = this.findNearestPickableObjectToAvatar?.();
      const doorTarget = this.findTargetInteractiveDoorForAvatar?.();
      const preferDoor = Boolean(
        doorTarget?.rig && (
          !nearestPick
          || (nearestPick.source !== 'selected' && nearestPick.source !== 'aim')
          || (doorTarget.fromAim && nearestPick.source === 'aim' && doorTarget.distance <= (nearestPick.distance ?? Infinity))
        )
      );
      if (preferDoor) {
        const rig = doorTarget.rig;
        if (mobDoorBtn) {
          mobDoorBtn.classList?.remove('hidden');
          mobDoorBtn.classList?.toggle('is-open', Boolean(rig.isOpen));
          if (mobDoorBtn.style) mobDoorBtn.style.display = 'inline-flex';
          if (mobDoorBtn.dataset) mobDoorBtn.dataset.doorKey = rig.key;
          mobDoorBtn.title = `${rig.isOpen ? 'Tutup' : 'Buka'} ${rig.labelKind} ${rig.roomName}`;
          const sp = mobDoorBtn.querySelector?.('span');
          if (sp) sp.textContent = rig.isOpen ? 'Tutup' : 'Buka';
        }
        if (isMobileTouch) {
          const mobileDoorKey = `door-mobile:${rig.key}:${rig.isOpen ? 1 : 0}`;
          if (this._lastHouseFlipperHudKey !== mobileDoorKey) {
            this._lastHouseFlipperHudKey = mobileDoorKey;
            tipEl.className = 'hud-3d-houseflipper-tip hidden';
            tipEl.style.display = 'none';
            tipEl.innerHTML = '';
          }
          return;
        }
        const key = `door:${rig.key}:${rig.isOpen ? 1 : 0}`;
        if (this._lastHouseFlipperHudKey !== key) {
          this._lastHouseFlipperHudKey = key;
          const label = `${rig.labelKind} ${rig.roomName}`;
          const actionText = rig.isOpen ? 'Tutup (Klik / E)' : 'Buka (Klik / E)';
          tipEl.className = 'hud-3d-houseflipper-tip';
          tipEl.style.display = 'inline-flex';
          tipEl.innerHTML = `
            <span class="hf-tip-name">${this.escapeHudHtml(label)}</span>
            <button type="button" class="hf-tip-btn is-primary" data-hf-action="toggle-door" data-door-key="${this.escapeHudHtml(rig.key)}">${actionText}</button>
          `;
        }
        return;
      }
      hideMobDoorBtn();

      const isDevicePick = Boolean(nearestPick?.id && (nearestPick.kind === 'device' || Boolean(this.deviceManager?.getDeviceById?.(nearestPick.id))));
      const shouldShowPick = Boolean(
        nearestPick?.id
        && !(isDevicePick && this.isBuildingEditWorkspace?.())
        && (
          this.navTool === 'move'
          || nearestPick.source === 'selected'
          || nearestPick.source === 'aim'
        )
      );
      if (shouldShowPick) {
        const key = `pick:${nearestPick.id}:${nearestPick.source || 'nearest'}:${isDevicePick ? 1 : 0}`;
        if (this._lastHouseFlipperHudKey !== key) {
          this._lastHouseFlipperHudKey = key;
          const escName = this.escapeHudHtml(nearestPick.name || 'Alat');
          const actionLabel = 'Angkat (E)';
          const cableBtnHtml = isDevicePick && !this.isBuildingEditWorkspace?.()
            ? `<button type="button" class="hf-tip-btn is-cable" data-hf-action="start-cable" data-device-id="${this.escapeHudHtml(nearestPick.id)}" title="Ambil gulungan kabel & tarik dari perangkat ini (C)">Tarik Kabel (C)</button>`
            : '';
          tipEl.className = 'hud-3d-houseflipper-tip';
          tipEl.style.display = 'inline-flex';
          tipEl.innerHTML = `
            <span class="hf-tip-name">${escName}</span>
            <button type="button" class="hf-tip-btn is-primary" data-hf-action="pickup">${actionLabel}</button>
            ${cableBtnHtml}
          `;
        }
        return;
      }
    }

    if (!this.avatarMode && this.navTool === 'move' && !this.transformGizmoGroup?.visible && !this.isBuildingEditWorkspace?.()) {
      hideMobDoorBtn();
      const selId = this.dragMoveState?.deviceId || this.deviceManager?.selectedDeviceId;
      const dev = selId ? this.deviceManager?.getDeviceById?.(selId) : null;
      if (dev && dev.layerVisible !== false) {
        const holder = this.deviceMeshMap?.get(dev.id);
        const curZ = holder ? holder.position.y : Math.max(0, Number(dev.spatial3d?.elevationMeters) || 0);
        const curZStr = Number(curZ).toFixed(2);
        const key = `orbitmove:${dev.id}:${curZStr}`;
        if (this._lastHouseFlipperHudKey !== key) {
          this._lastHouseFlipperHudKey = key;
          tipEl.className = 'hud-3d-houseflipper-tip is-orbit-move';
          tipEl.style.display = 'inline-flex';
          tipEl.innerHTML = `
            <span class="hf-tip-name">${this.escapeHudHtml(dev.name || 'Alat')}</span>
            <button type="button" class="hf-tip-btn" data-hf-action="z-down" title="Turun Z (-0.25m) • PgDn / Shift+Drag">Z-</button>
            <button type="button" class="hf-tip-zval ${curZ > 0.01 ? 'is-custom' : ''}" data-hf-action="z-reset" title="Reset Z ke 0.00m">Z ${curZStr}m</button>
            <button type="button" class="hf-tip-btn" data-hf-action="z-up" title="Naik Z (+0.25m) • PgUp / Shift+Drag">Z+</button>
            <button type="button" class="hf-tip-btn" data-hf-action="rotate" title="Putar 45° (R)">Putar (R)</button>
          `;
        }
        return;
      }
    }

    hideMobDoorBtn();
    if (this._lastHouseFlipperHudKey !== 'hidden') {
      this._lastHouseFlipperHudKey = 'hidden';
      tipEl.className = 'hud-3d-houseflipper-tip hidden';
      tipEl.style.display = 'none';
      tipEl.innerHTML = '';
    }
  }

  syncTransformGizmo() {
    this.syncSimplePlacementIndicator?.();
    this.renderHouseFlipperPromptHud?.();
    if (!this.transformGizmoGroup || !this.scene) return;
    const targetDev = this.isBuildingEditWorkspace?.() ? null : this.getTransformGizmoTargetDevice();
    if (!this.isActive || !targetDev) {
      this.transformGizmoGroup.visible = false;
      return;
    }
    if (!this.scene.children.includes(this.transformGizmoGroup)) {
      this.scene.add(this.transformGizmoGroup);
    }

    const holder = this.deviceMeshMap?.get(targetDev.id);
    const sp = { ...getDefaultSpatial3d(targetDev.type), ...(targetDev.spatial3d || {}) };
    const userScale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
    const scaleBase = Number(clamp(userScale * 0.52, 0.9, 3.2).toFixed(2));
    const gizmoMode = this.buildPlacementConfig?.gizmoMode || 'both';

    const cached = this.transformGizmoGroup.userData || {};
    if (
      this.transformGizmoGroup.children.length === 0
      || cached.deviceId !== targetDev.id
      || cached.gizmoMode !== gizmoMode
      || Math.abs((cached.scaleBase || 0) - scaleBase) > 0.05
    ) {
      this._rebuildTransformGizmoVisuals(targetDev.id, scaleBase, gizmoMode);
    }

    let wx;
    let wy;
    let wz;
    if (holder) {
      wx = holder.position.x;
      wy = holder.position.y;
      wz = holder.position.z;
    } else {
      const w = this.normToWorld ? this.normToWorld(targetDev.position?.x ?? 0.5, targetDev.position?.y ?? 0.5) : { x: 0, z: 0 };
      wx = w.x + (Number(sp.offsetX) || 0);
      wy = Math.max(0, (Number(sp.elevationMeters) || 0) + (Number(sp.offsetY) || 0));
      wz = w.z + (Number(sp.offsetZ) || 0);
    }

    this.transformGizmoGroup.position.set(wx, wy + 0.14 * scaleBase, wz);
    this.transformGizmoGroup.visible = true;
    this.transformGizmoGroup.updateMatrixWorld?.(true);
  }

  checkTransformGizmoHitAtEvent(e) {
    if (this.isBuildingEditWorkspace?.()) return null;
    if (!this.isInitialized || !this.camera || !this.renderer?.domElement) return null;
    if (!this.transformGizmoGroup?.visible || this.transformGizmoGroup.children.length === 0) return null;

    const isPointerLocked = typeof document !== 'undefined' && document.pointerLockElement === this.renderer.domElement;
    if (isPointerLocked) {
      this.pointer.set(0, 0);
    } else {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.transformGizmoGroup.updateMatrixWorld?.(true);
    const hits = this.raycaster.intersectObjects(this.transformGizmoGroup.children, true);
    for (const h of hits) {
      const ud = h.object?.userData;
      if (ud?.isTransformGizmo && ud.deviceId) {
        return {
          gizmoKind: ud.gizmoKind,
          gizmoAxis: ud.gizmoAxis,
          deviceId: ud.deviceId,
          point: h.point.clone(),
          object: h.object
        };
      }
    }
    return null;
  }

  startTransformGizmoDrag(e, dom, hit) {
    const dev = this.deviceManager?.getDeviceById?.(hit?.deviceId);
    if (!dev) return false;
    if (dev.layerLocked) {
      this.showStatusHint(`Perangkat "${dev.name}" dikunci pada Layer.`);
      return false;
    }
    if (
      authManager?.isAuthenticated?.()
      && authManager.getActiveWorkspaceKey?.() === 'main'
      && authManager.isMainWorkspaceUnlocked?.() === false
    ) {
      this.showStatusHint('Server Utama terkunci (hanya lihat).');
      return false;
    }

    this.deviceManager?.selectDevice?.(dev.id);
    if (this.controls) {
      this.controls.enabled = false;
      this._temporarilyDisabledControlsForBox = true;
    }
    dom.setPointerCapture?.(e.pointerId);

    const meshGroup = this.deviceMeshMap?.get(dev.id);
    const devWorld = this.normToWorld(dev.position.x, dev.position.y);
    const sp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    const startHolderY = meshGroup ? meshGroup.position.y : Math.max(0, (Number(sp.elevationMeters) || 0) + (Number(sp.offsetY) || 0));
    const meshOffsetX = meshGroup ? (meshGroup.position.x - devWorld.x) : 0;
    const meshOffsetZ = meshGroup ? (meshGroup.position.z - devWorld.z) : 0;
    const prevEff = this.effectivePosMap.get(dev.id);
    const effY = prevEff ? prevEff.y : startHolderY;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -startHolderY);
    const hitPt = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(dragPlane, hitPt);

    if (hit.gizmoKind === 'translate' && hit.gizmoAxis === 'y') {
      this.flashMoveElevationGuide?.(dev.id, 1500);
    }

    this.transformGizmoDragState = {
      deviceId: dev.id,
      dev,
      gizmoKind: hit.gizmoKind,
      gizmoAxis: hit.gizmoAxis,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: devWorld.x,
      startWorldZ: devWorld.z,
      startElev: Math.max(0, Number(sp.elevationMeters) || 0),
      startHolderY,
      startSupportY: typeof this.getCarriedDropSupportElevation === 'function'
        ? this.getCarriedDropSupportElevation(devWorld.x, devWorld.z, dev.id)
        : 0,
      startRx: Number(sp.rotationX) || 0,
      startRy: Number(sp.rotationY ?? dev.rotation ?? 0) || 0,
      startRz: Number(sp.rotationZ) || 0,
      meshOffsetX,
      meshOffsetZ,
      effY,
      plane: dragPlane,
      grabOffsetX: hitPt ? (devWorld.x - hitPt.x) : 0,
      grabOffsetZ: hitPt ? (devWorld.z - hitPt.z) : 0,
      portInitials: this._collectDevicePortInitials(dev.id),
      moved: false,
      latestNorm: null,
      latestElev: null,
      latestRot: null
    };
    return true;
  }

  updateTransformGizmoDrag(e) {
    const state = this.transformGizmoDragState;
    if (!state) return;
    if (Math.hypot(e.clientX - state.startClientX, e.clientY - state.startClientY) > 2) {
      state.moved = true;
    }

    const meshGroup = this.deviceMeshMap?.get(state.deviceId);
    const modelContainer = meshGroup?.getObjectByName?.('DeviceModelContainer');
    const holderPorts = meshGroup?.userData?.devPorts || [];
    const userScale = meshGroup?.userData?.userModelScale || ((state.dev?.spatial3d?.modelScale || 1) * (this.deviceScaleMultiplier || 1.0));

    if (state.gizmoKind === 'rotate') {
      const deltaDeg = (e.clientX - state.startClientX) * 0.75 + (state.startClientY - e.clientY) * 0.35;
      let rx = state.startRx;
      let ry = state.startRy;
      let rz = state.startRz;
      if (state.gizmoAxis === 'x') {
        rx = this.applyBuildAngleSnap(state.startRx + deltaDeg, { signed: true });
      } else if (state.gizmoAxis === 'z') {
        rz = this.applyBuildAngleSnap(state.startRz + deltaDeg, { signed: true });
      } else {
        ry = this.applyBuildAngleSnap(state.startRy + deltaDeg);
      }
      state.latestRot = { rx, ry, rz };
      const euler = new THREE.Euler((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180, 'YXZ');
      if (modelContainer) {
        modelContainer.rotation.copy(euler);
      }
      const wx = meshGroup ? meshGroup.position.x : state.startWorldX;
      const wy = meshGroup ? meshGroup.position.y : state.startHolderY;
      const wz = meshGroup ? meshGroup.position.z : state.startWorldZ;
      this.registerDevicePortTransforms(state.dev, holderPorts, wx, wy, wz, userScale, euler);
      this.syncCables();
      const axisBadge = state.gizmoAxis === 'x' ? '[X] Rotasi X' : (state.gizmoAxis === 'z' ? '[Z] Rotasi Z' : '[Y] Rotasi Y');
      this.showStatusHint(`${axisBadge}: "${state.dev.name}" -> X:${rx}° Y:${ry}° Z:${rz}°`);
      return;
    }

    if (state.gizmoAxis === 'y') {
      const camDist = this.camera ? this.camera.position.distanceTo(this.transformGizmoGroup.position) : 6;
      const stepFactor = Math.max(0.004, camDist * 0.0022);
      const rawElev = clamp(state.startElev + (state.startClientY - e.clientY) * stepFactor, 0, 25);
      const nextElev = this.buildPlacementConfig?.gridSnapEnabled
        ? Math.round(rawElev / Math.min(0.5, Number(this.buildPlacementConfig.gridSnapMeters) || 0.25)) * Math.min(0.5, Number(this.buildPlacementConfig.gridSnapMeters) || 0.25)
        : Math.round(rawElev * 20) / 20;
      const finalElev = Number(clamp(nextElev, 0, 25).toFixed(2));
      const shiftY = finalElev - state.startElev;
      state.latestElev = finalElev;
      if (meshGroup) {
        meshGroup.position.y = state.startHolderY + shiftY;
      }
      this.effectivePosMap.set(
        state.deviceId,
        new THREE.Vector3(meshGroup ? meshGroup.position.x : state.startWorldX, state.effY + shiftY, meshGroup ? meshGroup.position.z : state.startWorldZ)
      );
      state.portInitials.forEach(({ key, initial }) => {
        this.portWorldPosMap.set(key, new THREE.Vector3(initial.x, initial.y + shiftY, initial.z));
      });
      this.syncTransformGizmo();
      this.flashMoveElevationGuide?.(state.deviceId, 800);
      this.syncCables();
      this.showStatusHint(`[Y] Geser Sumbu Y (Elevasi): "${state.dev.name}" -> Z:${finalElev.toFixed(2)}m`);
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hitPt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(state.plane, hitPt)) return;

    let targetX = state.gizmoAxis === 'x' ? (hitPt.x + state.grabOffsetX) : state.startWorldX;
    let targetZ = state.gizmoAxis === 'z' ? (hitPt.z + state.grabOffsetZ) : state.startWorldZ;
    const snapped = this.applyBuildGridSnapWorld(targetX, targetZ);
    if (state.gizmoAxis === 'x') targetX = snapped.x;
    if (state.gizmoAxis === 'z') targetZ = snapped.z;

    let targetElev = state.startHolderY;
    if (this.buildPlacementConfig?.surfaceSnapEnabled) {
      const sup = this.resolveBuildPlacementSurfaceElevation(targetX, targetZ, state.startHolderY, {
        excludeId: state.deviceId,
        startSupportY: state.startSupportY
      });
      targetElev = sup.elevationMeters;
    }

    let collisionMsg = '';
    if (!this.buildPlacementConfig?.allowClipping) {
      const fp = this.getDeviceCollisionFootprint
        ? this.getDeviceCollisionFootprint(state.dev, userScale)
        : { halfW: 0.45, halfD: 0.38, height: 0.35 };
      const col = this.resolveBuildPlacementCollision(targetX, targetZ, targetElev, {
        halfW: fp.halfW,
        halfD: fp.halfD,
        height: fp.height,
        excludeIds: [state.deviceId]
      });
      if (state.gizmoAxis === 'x') targetX = col.x;
      if (state.gizmoAxis === 'z') targetZ = col.z;
      if (col.collided) {
        collisionMsg = ` • Tertahan "${col.blockerName}"`;
      }
    }

    const { normX, normY } = this.worldToNorm(targetX, targetZ);
    const clamped = this.normToWorld(normX, normY);
    const shiftX = clamped.x - state.startWorldX;
    const shiftY = targetElev - state.startHolderY;
    const shiftZ = clamped.z - state.startWorldZ;

    state.latestNorm = { x: normX, y: normY };
    state.latestElev = Math.abs(shiftY) > 0.005 ? Number(targetElev.toFixed(2)) : null;

    if (meshGroup) {
      meshGroup.position.set(clamped.x + state.meshOffsetX, targetElev, clamped.z + state.meshOffsetZ);
    }
    this.effectivePosMap.set(
      state.deviceId,
      new THREE.Vector3(clamped.x + state.meshOffsetX, state.effY + shiftY, clamped.z + state.meshOffsetZ)
    );
    state.portInitials.forEach(({ key, initial }) => {
      this.portWorldPosMap.set(key, new THREE.Vector3(initial.x + shiftX, initial.y + shiftY, initial.z + shiftZ));
    });
    this.syncTransformGizmo();
    this.syncCables();
    const axisTag = state.gizmoAxis === 'x' ? '[X] Geser Sumbu X' : '[Z] Geser Sumbu Z';
    this.showStatusHint(`${axisTag}: "${state.dev.name}" -> X:${clamped.x.toFixed(1)}m Z:${clamped.z.toFixed(1)}m${collisionMsg}`);
  }

  finishTransformGizmoDrag(e, dom) {
    const state = this.transformGizmoDragState;
    this.transformGizmoDragState = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (!state || !state.moved) return;

    this._suppressNextClick = true;
    if (state.latestNorm && this.deviceManager?.moveDeviceGroup) {
      this.deviceManager.moveDeviceGroup([{ id: state.deviceId, position: state.latestNorm }], { syncRenderer: false });
    }
    const dev = this.deviceManager?.getDeviceById?.(state.deviceId);
    if (dev && (state.latestElev !== null || state.latestRot !== null)) {
      const baseSp = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
      this.deviceManager?.updateDevice?.(state.deviceId, {
        spatial3d: {
          ...baseSp,
          ...(state.latestElev !== null ? { elevationMeters: state.latestElev, offsetY: 0 } : {}),
          ...(state.latestRot !== null ? {
            rotationX: state.latestRot.rx,
            rotationY: state.latestRot.ry,
            rotationZ: state.latestRot.rz
          } : {})
        }
      });
    }
    this.syncDevices();
    this.syncCables();
    this.syncTransformGizmo();
  }

  nudgeDeviceAlongGizmoAxis(axis = 'x', dir = 1, kind = 'translate') {
    const targetDev = this.getTransformGizmoTargetDevice() || (this.deviceManager?.selectedDeviceId ? this.deviceManager.getDeviceById(this.deviceManager.selectedDeviceId) : null);
    if (!targetDev || targetDev.layerLocked) {
      this.showStatusHint(targetDev ? `Perangkat "${targetDev.name}" dikunci.` : 'Pilih atau dekati perangkat untuk digeser.');
      return false;
    }

    const ax = String(axis || 'x').toLowerCase();
    const sign = dir >= 0 ? 1 : -1;
    if (kind === 'rotate') {
      const step = this.buildPlacementConfig?.angleSnapDeg > 0 ? this.buildPlacementConfig.angleSnapDeg : 15;
      if (ax === 'x') return this.rotateSelectedIn3D({ dX: sign * step });
      if (ax === 'z') return this.rotateSelectedIn3D({ dZ: sign * step });
      return this.rotateSelectedIn3D({ dY: sign * step });
    }

    const sp = { ...getDefaultSpatial3d(targetDev.type), ...(targetDev.spatial3d || {}) };
    const stepMeters = this.buildPlacementConfig?.gridSnapEnabled
      ? Math.max(0.1, Number(this.buildPlacementConfig.gridSnapMeters) || 0.5)
      : 0.25;

    if (ax === 'y') {
      const curElev = Number(sp.elevationMeters) || 0;
      const nextElev = Number(clamp(curElev + sign * Math.min(0.5, stepMeters), 0, 25).toFixed(2));
      this.deviceManager?.updateDevice?.(targetDev.id, {
        spatial3d: { ...sp, elevationMeters: nextElev }
      });
      this.flashMoveElevationGuide?.(targetDev.id, 900);
      this.syncDevices();
      this.syncCables();
      this.syncTransformGizmo();
      this.showStatusHint(`[Y] Sumbu Y (Elevasi) "${targetDev.name}": Z:${nextElev.toFixed(2)}m`);
      return true;
    }

    const curW = this.normToWorld(targetDev.position.x, targetDev.position.y);
    let nextX = curW.x + (ax === 'x' ? sign * stepMeters : 0);
    let nextZ = curW.z + (ax === 'z' ? sign * stepMeters : 0);
    const snapped = this.applyBuildGridSnapWorld(nextX, nextZ);
    nextX = snapped.x;
    nextZ = snapped.z;

    let nextElev = Number(sp.elevationMeters) || 0;
    if (this.buildPlacementConfig?.surfaceSnapEnabled) {
      const startSup = typeof this.getCarriedDropSupportElevation === 'function'
        ? this.getCarriedDropSupportElevation(curW.x, curW.z, targetDev.id)
        : 0;
      const supRes = this.resolveBuildPlacementSurfaceElevation(nextX, nextZ, nextElev, {
        excludeId: targetDev.id,
        startSupportY: startSup
      });
      nextElev = supRes.elevationMeters;
    }

    if (!this.buildPlacementConfig?.allowClipping) {
      const scale = (sp.modelScale || 1) * (this.deviceScaleMultiplier || 1.0);
      const fp = this.getDeviceCollisionFootprint
        ? this.getDeviceCollisionFootprint(targetDev, scale)
        : { halfW: 0.45, halfD: 0.38, height: 0.35 };
      const colRes = this.resolveBuildPlacementCollision(nextX, nextZ, nextElev, {
        halfW: fp.halfW,
        halfD: fp.halfD,
        height: fp.height,
        excludeIds: [targetDev.id]
      });
      nextX = colRes.x;
      nextZ = colRes.z;
    }

    const { normX, normY } = this.worldToNorm(nextX, nextZ);
    this.deviceManager?.moveDeviceGroup?.([{ id: targetDev.id, position: { x: normX, y: normY } }], { syncRenderer: false });
    if (Math.abs(nextElev - (Number(sp.elevationMeters) || 0)) > 0.005) {
      this.deviceManager?.updateDevice?.(targetDev.id, {
        spatial3d: { ...sp, elevationMeters: Number(nextElev.toFixed(2)), offsetY: 0 }
      });
    }
    this.syncDevices();
    this.syncCables();
    this.syncTransformGizmo();
    const label = ax === 'x' ? '[X] X' : '[Z] Z';
    this.showStatusHint(`${label} "${targetDev.name}": (${nextX.toFixed(2)}m, ${nextZ.toFixed(2)}m • Z:${nextElev.toFixed(2)}m)`);
    return true;
  }

  zoomExtents() {
    if (!this.camera || !this.controls) return;
    if (this.avatarMode) {
      this.setAvatarMode?.(false);
    }
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
    if (this.avatarMode) {
      this.setAvatarMode?.(false);
    }
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
    if (this.isBuildingEditWorkspace?.()) return;
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
    this.syncMobileRobloxControlsVisibility?.();
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
    this.syncMobileRobloxControlsVisibility?.();
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
    if (this.isBuildingEditWorkspace?.()) return null;
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
        this.syncBuildingSignboards?.();
        if (this.buildingXrayMode || this.perRoomXrayIds?.size > 0) {
          this.applyBuildingXrayMaterials?.();
        }
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
        this.syncBuildingSignboards?.();
        if (this.buildingXrayMode || this.perRoomXrayIds?.size > 0) {
          this.applyBuildingXrayMaterials?.();
        }
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
      const ifaceCfg = dev.network?.interfaces?.[p.name] || null;
      const isPortAdminDown = ifaceCfg?.status === 'down' || dev.status === 'offline';

      let ledClass = '';
      if (isPendingSrc) {
        ledClass = 'is-pulling';
      } else if (isPortAdminDown) {
        ledClass = 'is-offline';
      } else if (isConnected) {
        const st = link.cable.status || 'active';
        ledClass = (st === 'damaged' || st === 'inactive' || st === 'cut')
          ? 'is-offline'
          : (st === 'maintenance' ? 'is-warning' : 'is-online');
      }

      const pType = String(p.type || 'rj45').toLowerCase();
      const socketIcon = pType.includes('wireless') || pType.includes('wifi')
        ? 'wifi'
        : (pType.includes('sfp') || pType.includes('fiber') ? 'cable' : 'ethernet-port');
      const peerLabel = isConnected
        ? `${link.peerName}${link.peerPort ? ` [${link.peerPort}]` : ''}`
        : (isPendingSrc
          ? 'Sumber Kabel Aktif'
          : (isPortAdminDown
            ? 'Port DOWN'
            : (pendingSrcDev && pendingSrcDev.id !== deviceId ? 'Pasang ke Sini' : '+ Kabel')));

      const vlanChip = ifaceCfg?.mode === 'trunk'
        ? `T:${(ifaceCfg.allowedVlans || [1]).slice(0, 3).join(',')}`
        : (ifaceCfg?.vlan && ifaceCfg.vlan > 1 ? `V${ifaceCfg.vlan}` : '');

      return `<button type="button" class="sim-port-card ${isConnected ? 'is-connected' : ''} ${isCableSel ? 'is-cable-selected' : ''} ${isPendingSrc ? 'is-pending-source' : ''} ${isPortAdminDown ? 'is-admin-down' : ''}" data-sim-port="${this.escapeHudHtml(p.name)}" title="${isConnected ? `Pilih kabel ke ${this.escapeHudHtml(peerLabel)}` : (pendingSrcDev && pendingSrcDev.id !== deviceId ? `Sambungkan kabel dari ${this.escapeHudHtml(pendingSrcDev.name)} ke port ${this.escapeHudHtml(p.name)}` : `Tarik kabel dari port ${this.escapeHudHtml(p.name)}`)}">
        <div class="sim-port-top-row">
          <span class="sim-port-name-wrap">
            <span class="sim-port-led ${ledClass}"></span>
            <span class="sim-port-socket-glyph" aria-hidden="true">${uiIcon(socketIcon, 11)}</span>
            <span class="sim-port-name">${this.escapeHudHtml(p.name)}</span>
          </span>
          <span class="sim-port-speed">${this.escapeHudHtml(vlanChip || p.speed || p.type || '')}</span>
        </div>
        <span class="sim-port-peer">${this.escapeHudHtml(peerLabel)}</span>
      </button>`;
    }).join('');

    const selectedLinkEntry = [...portConnMap.entries()].find(([, l]) => l.cable.id === selectedCableId);
    const selectedCableBarHtml = selectedLinkEntry
      ? (() => {
        const [selPortName, selLink] = selectedLinkEntry;
        const peerId = selLink.cable.source === deviceId ? selLink.cable.destination : selLink.cable.source;
        return `<div class="sim-selected-cable-bar">
            <span>Port <strong>${this.escapeHudHtml(selPortName)}</strong> → <strong>${this.escapeHudHtml(selLink.peerName)}</strong></span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="sim-action-btn" data-sim-jump-peer="${this.escapeHudHtml(peerId)}">Lihat Perangkat Tujuan</button>
              <button type="button" class="sim-action-btn is-exit" data-sim-disconnect-cable="${this.escapeHudHtml(selLink.cable.id)}">Lepas Kabel</button>
            </div>
          </div>`;
      })()
      : '';

    hudEl.innerHTML = `
      <div class="sim-inspector-header">
        <div class="sim-inspector-title-group">
          <span class="sim-inspector-device-name">${this.escapeHudHtml(dev.name)}</span>
          <span class="sim-inspector-badge">${this.escapeHudHtml(modelText)}</span>
          <span class="sim-inspector-badge is-ip">${this.escapeHudHtml(ipText)}</span>
        </div>
        <div class="sim-inspector-controls-group">
          ${angles.map((a) => `<button type="button" class="sim-angle-pill ${this.simulatorViewAngle === a.key ? 'active' : ''}" data-sim-angle="${a.key}">${a.label}</button>`).join('')}
          <button type="button" class="sim-action-btn is-sim-winbox" data-sim-action="winbox" title="Buka Quick Config (WinBox) & Terminal CLI untuk perangkat ini">${uiIcon('sliders', 12)} WinBox / CLI</button>
          <button type="button" class="sim-action-btn is-sim-ping" data-sim-action="ping" title="Uji Ping & Animasi Paket 3D dari perangkat ini">${uiIcon('zap', 12)} Ping Dari Sini</button>
          <button type="button" class="sim-action-btn is-primary" data-sim-action="detail" title="Detail Lengkap, Spesifikasi & Anggaran (DAK/BOS)">Detail</button>
          <button type="button" class="sim-action-btn" data-sim-action="config" title="Konfigurasi Detail IP, VLAN & SSID">Konfigurasi</button>
          <button type="button" class="sim-action-btn is-exit" data-sim-action="exit" title="Keluar Mode Fokus Simulator (Esc)">Keluar Fokus</button>
        </div>
      </div>
      ${stackBarHtml}
      ${pendingBannerHtml}
      ${selectedCableBarHtml}
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
        this.syncBuildingSignboards?.();
        if (this.buildingXrayMode || this.perRoomXrayIds?.size > 0) {
          this.applyBuildingXrayMaterials?.();
        }
        this.renderSimulatorInspectorHud(deviceId);
        return;
      }

      const disconnectBtn = evt.target.closest('[data-sim-disconnect-cable]');
      if (disconnectBtn) {
        const cabId = disconnectBtn.getAttribute('data-sim-disconnect-cable');
        if (cabId) {
          this.cableManager?.deleteConnection?.(cabId);
          this.syncCables();
          this.renderSimulatorInspectorHud(deviceId);
        }
        return;
      }

      const jumpPeerBtn = evt.target.closest('[data-sim-jump-peer]');
      if (jumpPeerBtn) {
        const peerId = jumpPeerBtn.getAttribute('data-sim-jump-peer');
        if (peerId) {
          this.deviceManager?.selectDevice?.(peerId);
          this.focusOnDevice(peerId, { viewAngle: this.simulatorViewAngle || 'front', saveReturnCamera: false, duration: 360 });
        }
        return;
      }

      const actionBtn = evt.target.closest('[data-sim-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-sim-action');
        if (action === 'winbox') {
          eventBus.emit('modal:open-simulator', { deviceId, tab: 'winbox' });
        } else if (action === 'ping') {
          eventBus.emit('modal:open-simulator', { deviceId, tab: 'sim' });
        } else if (action === 'detail') {
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

  markSceneDirty(frames = 20) {
    const n = Math.max(1, Number(frames) || 12);
    this._dirtyFramesRemaining = Math.max(this._dirtyFramesRemaining || 0, n);
  }

  requestShadowUpdate() {
    if (this.renderer?.shadowMap?.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.markSceneDirty?.(4);
  }

  getLodThresholds() {
    const isLite = this.graphicsQuality === 'lite' || isMobileTouchDevice();
    return isLite
      ? { nearMax: 24, midMax: 55, farPropCull: 48, labelCull: 42 }
      : { nearMax: 38, midMax: 88, farPropCull: 76, labelCull: 72 };
  }

  /**
   * Multi-Tier 3D Level of Detail (LOD):
   * - Near: Full device body + 3D ports sub-group + labels + road pebbles + clips.
   * - Mid: Hides tiny 2cm 3D port sockets, distant cable clips & high-density road pebbles.
   * - Far: Hides distant device floating sprites & street-level decorative props (trees/faucets/bins).
   * @param {boolean} [force=false]
   */
  updateSceneLOD(force = false) {
    if (!this.isInitialized || !this.camera?.position) return null;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const camPos = this.camera.position;
    if (!force) {
      if (now - (this._lastLodAt || 0) < 75) return this.renderPerfStats;
      const moveSq = this._lastLodCamPos?.distanceToSquared?.(camPos) ?? Infinity;
      const rotDelta = (this._lastLodCamQuat && typeof this._lastLodCamQuat.angleTo === 'function' && this.camera.quaternion)
        ? this._lastLodCamQuat.angleTo(this.camera.quaternion)
        : 1;
      if (moveSq < 0.3 && rotDelta < 0.03) return this.renderPerfStats;
    }

    this._lastLodAt = now;
    this._lastLodCamPos?.copy?.(camPos);
    if (this.camera.quaternion) this._lastLodCamQuat?.copy?.(this.camera.quaternion);

    const th = this.getLodThresholds();
    const nearSq = th.nearMax * th.nearMax;
    const midSq = th.midMax * th.midMax;
    const labelSq = th.labelCull * th.labelCull;
    const propCullSq = th.farPropCull * th.farPropCull;
    const roadDetailSq = (th.nearMax * 1.35) * (th.nearMax * 1.35);
    const isBirdsEyeOverview = camPos.y >= 32;

    const selDevId = this.deviceManager?.selectedDeviceId || null;
    const selCabId = this.cableManager?.selectedCableId || null;
    const selRoomId = stateManager.getSelectedRoom3dId?.() || null;

    let lodNearCount = 0;
    let lodMidCount = 0;
    let lodFarCount = 0;
    let lodCulledPropsCount = 0;

    // 1. Device LOD (hide tiny RJ45 port sockets & labels beyond near/mid thresholds)
    this.deviceMeshMap?.forEach((holder, devId) => {
      if (!holder) return;
      const hp = holder.position;
      const dx = camPos.x - (hp?.x || 0);
      const dy = camPos.y - (hp?.y || 0);
      const dz = camPos.z - (hp?.z || 0);
      const distSq = dx * dx + dy * dy + dz * dz;
      const tier = distSq <= nearSq ? 'near' : (distSq <= midSq ? 'mid' : 'far');
      holder.userData.lodTier = tier;
      if (tier === 'near') lodNearCount += 1;
      else if (tier === 'mid') lodMidCount += 1;
      else lodFarCount += 1;

      const keepDetailed = (devId === selDevId || devId === this.simulatorFocusedDeviceId || devId === this.pendingCableSourceId);
      const children = holder.children || [];
      for (let i = 0; i < children.length; i++) {
        const ch = children[i];
        if (!ch) continue;
        if (ch.name === 'DeviceModelContainer' && ch.children) {
          for (let j = 0; j < ch.children.length; j++) {
            const sub = ch.children[j];
            if (sub?.name === 'DevicePorts3DGroup') {
              sub.visible = keepDetailed || tier === 'near';
            }
          }
        } else if (ch.userData?.isDeviceLabel && !this.avatarMode) {
          const allowLabel = Boolean(this.showLabels);
          ch.visible = allowLabel && (keepDetailed || isBirdsEyeOverview || distSq <= labelSq);
        }
      }
    });

    // 2. Cable LOD (hide distant non-selected cable clips/handles)
    this.cableMeshMap?.forEach((mesh, cabId) => {
      if (!mesh) return;
      const mid = mesh.userData?.linearMid || mesh.position;
      const dx = camPos.x - (mid?.x || 0);
      const dy = camPos.y - (mid?.y || 0);
      const dz = camPos.z - (mid?.z || 0);
      const distSq = dx * dx + dy * dy + dz * dz;
      mesh.userData.lodTier = distSq <= nearSq ? 'near' : (distSq <= midSq ? 'mid' : 'far');
    });
    if (this.cablesGroup?.children) {
      for (let i = 0; i < this.cablesGroup.children.length; i++) {
        const ch = this.cablesGroup.children[i];
        if (!ch?.userData?.isCableClip3d) continue;
        const cabId = ch.userData.cableId;
        if (cabId && cabId === selCabId) {
          ch.visible = true;
        } else if (ch.userData.isInstancedClipsGroup) {
          ch.visible = camPos.y < (th.midMax * 1.45);
        } else if (cabId) {
          const cabMesh = this.cableMeshMap.get(cabId);
          ch.visible = !cabMesh || cabMesh.userData.lodTier === 'near';
        }
      }
    }

    // 3. Road LOD (hide dense 3D river pebbles & curb joints when zoomed far away)
    this.road3dMeshMap?.forEach((roadGroup) => {
      if (!roadGroup) return;
      const rc = roadGroup.userData?.roadCenterWorld || roadGroup.position || { x: 0, y: 0, z: 0 };
      const dx = camPos.x - (rc.x || 0);
      const dy = camPos.y - (rc.y || 0);
      const dz = camPos.z - (rc.z || 0);
      const distSq = dx * dx + dy * dy + dz * dz;
      const showDetail = distSq <= roadDetailSq;
      roadGroup.userData.lodTier = showDetail ? 'near' : 'mid';
      const children = roadGroup.children || [];
      for (let i = 0; i < children.length; i++) {
        const ch = children[i];
        if (ch?.name === 'RoadRiverPebbles' || ch?.name === 'RoadCurbJointsInstanced') {
          ch.visible = showDetail;
        }
      }
    });

    // 4. Room & Decorative Prop LOD (cull tiny/far outdoor trees & props when street-level)
    const layers = stateManager.state?.layers || {};
    const allowBuildings = layers.buildings !== false;
    this.room3dMeshMap?.forEach((roomGroup, roomId) => {
      if (!roomGroup) return;
      const c = roomGroup.userData?.lodCenter || roomGroup.position || { x: 0, y: 0, z: 0 };
      const dx = camPos.x - (c.x || 0);
      const dy = camPos.y - (c.y || 0);
      const dz = camPos.z - (c.z || 0);
      const distSq = dx * dx + dy * dy + dz * dz;
      const tier = distSq <= nearSq ? 'near' : (distSq <= midSq ? 'mid' : 'far');
      roomGroup.userData.lodTier = tier;

      const isDecor = Boolean(roomGroup.userData?.isDecorationProp);
      const propH = Number(roomGroup.userData?.propMaxHeight) || 3;
      const cullProp = isDecor && roomId !== selRoomId && (
        (!isBirdsEyeOverview && distSq > propCullSq) ||
        (isBirdsEyeOverview && propH <= 2.6 && distSq > propCullSq * 5)
      );
      roomGroup.userData.lodCulled = Boolean(cullProp);
      if (cullProp) lodCulledPropsCount += 1;
      roomGroup.visible = allowBuildings && !roomGroup.userData.lodCulled && !roomGroup.userData.occlusionCulled;
    });

    this.renderPerfStats = {
      ...(this.renderPerfStats || {}),
      lodNearCount,
      lodMidCount,
      lodFarCount,
      lodCulledPropsCount
    };
    return this.renderPerfStats;
  }

  /**
   * Resolve the building object the technician avatar is currently standing inside (null if outdoors).
   * @returns {Object|null}
   */
  _getAvatarCurrentBuilding() {
    if (!this.avatarMode || !this.avatarState) return null;
    const rooms = stateManager.getRooms3d?.() || [];
    if (rooms.length === 0) return null;
    const { normX, normY } = this.worldToNorm(
      Number(this.avatarState.x) || 0,
      Number(this.avatarState.z) || 0
    );
    const projectMap = stateManager.getState()?.project?.map || {};
    return findBuildingForPoint(normX, normY, rooms, {
      mapWidthMeters: this.cableManager?.mapWidthMeters || 170,
      naturalWidth: projectMap.naturalWidth || 1024,
      naturalHeight: projectMap.naturalHeight || 1024,
      marginMeters: 0.15,
      includeDecorations: false
    });
  }

  /**
   * Frustum & Indoor FPP Room Occlusion Culling:
   * When the technician walks inside a building in FPP mode, culls outdoor decorative props,
   * unrelated far buildings outside frustum/room shell, and devices far outside the active room.
   * Also performs group-level bounding-sphere frustum culling when camera matrices are ready.
   * @param {boolean} [force=false]
   */
  updateSceneOcclusionCulling(force = false) {
    if (!this.isInitialized || !this.camera) return null;
    let indoorRoom = this.avatarMode && this.avatarPerspective === "fpp" ? this._getAvatarCurrentBuilding() : null, indoorId = indoorRoom?.id || null;
    if (!force && indoorId === null && this._lastOcclusionRoomId === null && !this.camera.projectionMatrix) return this.renderPerfStats;
    this._lastOcclusionRoomId = indoorId;
    let hasValidFrustum = false;
    if (this._lodFrustum && this._lodProjMatrix && this._lodSphere && this.camera.projectionMatrix && this.camera.matrixWorldInverse) try {
      this.camera.updateMatrixWorld?.(), typeof this.camera.matrixWorldInverse.copy == "function" && this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert(), this._lodProjMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      let pe = this._lodProjMatrix.elements;
      Number.isFinite(pe?.[0]) && Math.abs(pe[0]) > 1e-6 && (this._lodFrustum.setFromProjectionMatrix(this._lodProjMatrix), hasValidFrustum = true);
    } catch {
      hasValidFrustum = false;
    }
    let layers = stateManager.state?.layers || {}, allowBuildings = layers.buildings !== false, selRoomId = stateManager.getSelectedRoom3dId?.() || null, selDevId = this.deviceManager?.selectedDeviceId || null, carriedSet = new Set(Array.isArray(this.carriedObjects) ? this.carriedObjects.map((o) => o?.id) : []), indoorSpan = indoorRoom ? Math.max(Number(indoorRoom.widthMeters) || 14, Number(indoorRoom.depthMeters) || 12) : 0, indoorCenter = indoorRoom ? this.normToWorld(indoorRoom.x ?? 0.5, indoorRoom.y ?? 0.5) : null, refX = indoorCenter ? indoorCenter.x : Number(this.avatarState?.x) || this.camera.position?.x || 0, refZ = indoorCenter ? indoorCenter.z : Number(this.avatarState?.z) || this.camera.position?.z || 0, deviceKeepRadiusSq = Math.pow(indoorSpan * 0.65 + 9, 2), buildingKeepRadiusSq = Math.pow(indoorSpan * 0.65 + 16, 2), occlusionCulledCount = 0;
    return this.room3dMeshMap?.forEach((roomGroup, roomId) => {
      if (!roomGroup) return;
      let c = roomGroup.userData?.lodCenter || roomGroup.position || { x: 0, y: 2, z: 0 }, r = Number(roomGroup.userData?.lodRadius) || 14, culled = false;
      if (roomId !== selRoomId && roomId !== indoorId) {
        if (indoorRoom) if (roomGroup.userData?.isDecorationProp) culled = true;
        else {
          let dx = (c.x || 0) - refX, dz = (c.z || 0) - refZ;
          dx * dx + dz * dz > buildingKeepRadiusSq && (culled = true);
        }
        !culled && hasValidFrustum && (this._lodSphere.set(new Vector3(c.x || 0, c.y || 2, c.z || 0), r), this._lodFrustum.intersectsSphere(this._lodSphere) || (culled = true));
      }
      roomGroup.userData.occlusionCulled = culled, culled && (occlusionCulledCount += 1), roomGroup.visible = allowBuildings && !roomGroup.userData.lodCulled && !culled;
    }), this.deviceMeshMap?.forEach((holder, devId) => {
      if (!holder) return;
      let dev = this.deviceManager?.getDeviceById?.(devId), baseVis = dev ? this.isDeviceVisibleIn3d(dev) : layers.devices !== false, culled = false;
      if (indoorRoom && devId !== selDevId && !carriedSet.has(devId) && devId !== this.pendingCableSourceId) {
        let dx = (holder.position?.x || 0) - refX, dz = (holder.position?.z || 0) - refZ;
        dx * dx + dz * dz > deviceKeepRadiusSq && (culled = true);
      }
      holder.userData.occlusionCulled = culled, culled && (occlusionCulledCount += 1), holder.visible = baseVis && !culled;
    }), this.renderPerfStats = { ...this.renderPerfStats || {}, occlusionCulledCount, activeIndoorRoomId: indoorId }, this.renderPerfStats;
  }
  setGraphicsQuality(mode = "standard") {
    let normalized = mode === "lite" ? "lite" : "standard";
    this.graphicsQuality = normalized;
    try {
      typeof localStorage !== 'undefined' && localStorage.setItem("netmap_3d_quality_v1", normalized);
    } catch {
    }
    return this.applyGraphicsQuality(), eventBus.emit("map3d:quality-changed", { quality: normalized }), normalized;
  }
  getGraphicsQuality() {
    return this.graphicsQuality || "standard";
  }
  applyGraphicsQuality() {
    let isLite = this.graphicsQuality === "lite", dpr = typeof window !== 'undefined' && window.devicePixelRatio || 1, targetRatio = isLite ? Math.min(dpr, 1) : Math.min(dpr, 1.5);
    if (this.renderer?.setPixelRatio?.(targetRatio), this.renderer?.shadowMap && (this.renderer.shadowMap.enabled = !isLite, this.renderer.shadowMap.autoUpdate = false, this.renderer.shadowMap.needsUpdate = true), this.dirLight && (this.dirLight.castShadow = !isLite, this.dirLight.shadow?.mapSize)) {
      let sz = isLite ? 512 : 1024;
      this.dirLight.shadow.mapSize.width = sz, this.dirLight.shadow.mapSize.height = sz;
    }
    return this.updateSceneLOD?.(true), this.markSceneDirty?.(12), { quality: this.graphicsQuality, pixelRatio: targetRatio, shadows: !isLite };
  }
  setPausedByModal(paused) {
    return this.isPausedByModal = !!paused, !this.isPausedByModal && this.isActive && this.renderer && this.scene && this.camera && this.renderer.render(this.scene, this.camera), this.isPausedByModal;
  }
  setDeviceScaleMultiplier(scaleVal) {
    this.deviceScaleMultiplier = Number(scaleVal) || 1, this.isActive && (this.syncDevices(), this.syncCables());
  }
  setCableDiameterMultiplier(scaleVal) {
    this.cableDiameterMultiplier = Math.max(0.1, Number(scaleVal) || 1), this.isActive && this.syncCables();
  }
  setExplodeStacks(enabled) {
    this.explodeStacks = !!enabled, this.isActive && (this.syncDevices(), this.syncCables());
  }
  setShowLabels(enabled) {
    let val = !!enabled;
    if (this.showLabels = val, stateManager.state?.layers && stateManager.state.layers.annotations !== val && stateManager.toggleLayer("annotations", val), typeof document !== 'undefined') {
      let cb = document.getElementById("layer-toggle-annotations");
      cb && cb.checked !== val && (cb.checked = val), document.getElementById("btn-3d-labels")?.classList.toggle("active", val);
    }
    this.apply3dViewFilters();
  }
  setShowCoverage(enabled) {
    let val = !!enabled;
    this.showCoverage = val, this.viewFilters.showCoverage = val, this.apply3dViewFilters();
  }
  setViewFilters(partialFilters = {}) {
    return this.viewFilters = { ...this.viewFilters, ...partialFilters || {} }, Object.prototype.hasOwnProperty.call(this.viewFilters, "showCoverage") && (this.showCoverage = !!this.viewFilters.showCoverage), this.apply3dViewFilters(), { ...this.viewFilters };
  }
  _isBuildingStructureObject3d(obj) {
    return obj ? String(obj.shape || obj.preset || "").toLowerCase() === "wall" || String(obj.category || "").toLowerCase() === "building" : false;
  }
  isDeviceVisibleIn3d(dev) {
    return !(!dev || (stateManager.state?.layers || {}).devices === false || dev.layerVisible === false || dev.type === "cctv" && this.viewFilters?.showCctv === false);
  }
  isCableVisibleIn3d(cable) {
    if (!cable || this.workspaceGhostDevices) return false;
    let layers = stateManager.state?.layers || {};
    if (layers.connections === false) return false;
    let srcDev = this.deviceManager?.getDeviceById?.(cable.source), dstDev = this.deviceManager?.getDeviceById?.(cable.destination);
    if (srcDev && !this.isDeviceVisibleIn3d(srcDev) && layers.devices !== false || dstDev && !this.isDeviceVisibleIn3d(dstDev) && layers.devices !== false) return false;
    let isWireless = cable.type === "wireless" || cable.cableCategory === "wireless-ptp";
    return !((cable.type === "fiber" || String(cable.cableCategory || "").toLowerCase().startsWith("fiber")) && this.viewFilters?.showFiber === false || isWireless && this.viewFilters?.showWireless === false);
  }
  _setMaterialDimState(material, shouldDim, { opacity = 0.42, tintHex = null } = {}) {
    material && (Array.isArray(material) ? material : [material]).forEach((m) => {
      if (!m) return;
      m.userData || (m.userData = {}), m.userData._origFilterState || (m.userData._origFilterState = { opacity: m.opacity ?? 1, transparent: !!m.transparent, colorHex: typeof m.color?.getHex == "function" ? m.color.getHex() : null });
      let orig = m.userData._origFilterState;
      shouldDim ? (m.transparent = true, m.opacity = Math.min(opacity, orig.opacity), tintHex !== null && typeof m.color?.setHex == "function" && m.color.setHex(tintHex)) : (m.opacity = orig.opacity, m.transparent = orig.transparent, orig.colorHex !== null && typeof m.color?.setHex == "function" && m.color.setHex(orig.colorHex));
    });
  }
  apply3dViewFilters() {
    this.syncCameraLayerBitmask?.();
    this.syncInstancedRepeatedProps?.();
    if (!this.isInitialized) return;
    let layers = stateManager.state?.layers || {}, showBg = layers.background !== false, showDevices = layers.devices !== false, showConnections = layers.connections !== false, showInfra = layers.infrastructure !== false, showBuildings = layers.buildings !== false, showAnnotations = layers.annotations !== false;
    this.showLabels = showAnnotations, typeof document !== 'undefined' && document.getElementById("btn-3d-labels")?.classList.toggle("active", showAnnotations);
    let selDevId = this.workspaceGhostDevices ? null : this.deviceManager?.selectedDeviceId || null, selCabId = this.workspaceGhostDevices ? null : this.cableManager?.selectedCableId || null, shouldDimBg = !!((selDevId || selCabId) && this.viewFilters?.dimOnSelection !== false);
    this.groundGroup && (this.groundGroup.visible = true, this.groundGroup.children.forEach((child) => {
      child.type === "GridHelper" ? (child.visible = true, child.material && (child.material.userData || (child.material.userData = {}), child.material.userData._origGridOpacity === void 0 && (child.material.userData._origGridOpacity = child.material.opacity ?? 0.18), child.material.opacity = shouldDimBg ? 0.07 : showBg ? child.material.userData._origGridOpacity : 0.22)) : child.isMesh && (child.visible = showBg, this._setMaterialDimState(child.material, shouldDimBg, { opacity: 0.42, tintHex: 9741240 }));
    })), this.roomsGroup && (this.roomsGroup.visible = showBuildings, this.room3dMeshMap?.forEach((roomGroup) => {
      roomGroup && (roomGroup.visible = showBuildings && !roomGroup.userData?.lodCulled && !roomGroup.userData?.occlusionCulled);
    })), this.roadsGroup && (this.roadsGroup.visible = showBuildings), this.objects3dGroup && (this.objects3dGroup.visible = showInfra || showBuildings, this.object3dMeshMap.forEach((meshGroup, objId) => {
      let obj = stateManager.getObject3dById?.(objId), isBldg = this._isBuildingStructureObject3d(obj);
      meshGroup.visible = isBldg ? showBuildings : showInfra;
    })), this.devicesGroup && (this.devicesGroup.visible = showDevices, this.deviceMeshMap.forEach((holder, devId) => {
      let dev = this.deviceManager?.getDeviceById?.(devId), baseVis = dev ? this.isDeviceVisibleIn3d(dev) : showDevices;
      holder.visible = baseVis && !holder.userData?.occlusionCulled;
    }));
    let cablesActive = !this.workspaceGhostDevices && showConnections;
    this.cablesGroup && (this.cablesGroup.visible = cablesActive, this.cablesGroup.children.forEach((child) => {
      let cabId = child.userData?.cableId;
      if (!cabId) return;
      let cable = this.cableManager?.getConnectionById?.(cabId), isVis = cable ? this.isCableVisibleIn3d(cable) : cablesActive;
      if (child.visible = isVis, isVis && child.isMesh && child.material) {
        let isHighlighted = !shouldDimBg || cabId === selCabId || cable?.source === selDevId || cable?.destination === selDevId;
        this._setMaterialDimState(child.material, !isHighlighted, { opacity: 0.26 });
      }
    }));
    let showCov = !this.workspaceGhostDevices && showDevices && this.viewFilters?.showCoverage !== false;
    this.coverageGroup && (this.coverageGroup.visible = showCov, this.coverageGroup.children.forEach((child) => {
      let devId = child.userData?.deviceId, dev = devId ? this.deviceManager?.getDeviceById?.(devId) : null;
      child.visible = showCov && (!dev || this.isDeviceVisibleIn3d(dev));
    })), this.updateAvatarDeviceLabelsVisibility?.(), this.updateBuildingSignboardsVisibility?.(), [this.roomsGroup, this.objects3dGroup].forEach((grp) => {
      grp?.traverse?.((child) => {
        (child?.userData?.isLabelSprite || child?.userData?.isDeviceLabel) && (child.visible = showAnnotations);
      });
    }), this.markSceneDirty?.(8);
  }
  _disposeObject3DResources(root) {
    root && root.traverse((obj) => {
      obj.userData?.sharedGlbResource || (obj.geometry && !obj.userData?.sharedPooledGeo && obj.geometry.dispose(), obj.material && !obj.userData?.sharedPooledMat && (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => {
        m && (m.map && m.map !== this.groundTexture && m.map.dispose(), m.dispose());
      }));
    });
  }
  clearGroup(group) {
    if (group) for (; group.children.length > 0; ) {
      let child = group.children[0];
      group.remove(child), this._disposeObject3DResources(child);
    }
  }
  showStatusHint(message) {
    let statusHint = document.querySelector("#app-status-bar .status-item:last-child");
    statusHint && (statusHint.innerHTML = `<span style="color: var(--accent-blue); font-weight: 600;">${message}</span>`);
  }
  bindGlobalListeners() {
    let scheduleSyncDevAndCables = () => {
      !this.isActive || this.dragMoveState || this.dragRotateState || this.transformGizmoDragState || this._pendingSyncRaf || (this._pendingSyncRaf = requestAnimationFrame(() => {
        this._pendingSyncRaf = null, !(!this.isActive || this.dragMoveState || this.dragRotateState || this.transformGizmoDragState) && (this.syncDevices(), this.syncCables(), this.syncBuildingSignboards?.(), (this.buildingXrayMode || this.perRoomXrayIds?.size > 0) && this.applyBuildingXrayMaterials?.(), this.simulatorFocusedDeviceId ? this.deviceManager?.getDeviceById?.(this.simulatorFocusedDeviceId) ? this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId) : this.exitSimulatorFocus({ restoreCamera: false }) : this.avatarMode && (this.findNearestDeviceToAvatar(), this.renderAvatarHudBar()));
      }));
    }, handleSelectionVisuals = () => {
      this.isActive && (this.syncSelectionRings(), this.apply3dViewFilters(), this.avatarMode && (this.syncBuildPlacementHudUI?.(), this.renderHouseFlipperPromptHud?.(), this.updateAvatarProximityHud?.()), this.simulatorFocusedDeviceId && (this.deviceManager?.getDeviceById?.(this.simulatorFocusedDeviceId) ? this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId) : this.exitSimulatorFocus({ restoreCamera: false })));
    };
    eventBus.on("layer:visibility-changed", ({ layer, visible } = {}) => {
      layer === "annotations" && (this.showLabels = !!visible, typeof document !== 'undefined' && document.getElementById("btn-3d-labels")?.classList.toggle("active", !!visible)), this.isInitialized && this.apply3dViewFilters();
    }), eventBus.on("device:added", scheduleSyncDevAndCables), eventBus.on("device:updated", scheduleSyncDevAndCables), eventBus.on("device:deleted", scheduleSyncDevAndCables), eventBus.on("device:moved", scheduleSyncDevAndCables), eventBus.on("device:selected", handleSelectionVisuals), eventBus.on("device:deselected", handleSelectionVisuals), eventBus.on("device:selection-changed", handleSelectionVisuals);
    let syncCablesOnly = () => {
      this.isActive && (this.syncCables(), this.syncBuildingSignboards?.(), (this.buildingXrayMode || this.perRoomXrayIds?.size > 0) && this.applyBuildingXrayMaterials?.(), this.simulatorFocusedDeviceId && this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId));
    };
    eventBus.on("connection:added", syncCablesOnly), eventBus.on("connection:updated", syncCablesOnly), eventBus.on("connection:deleted", syncCablesOnly), eventBus.on("connection:selected", syncCablesOnly), eventBus.on("connection:deselected", syncCablesOnly);
    let syncRoomsOnly = () => {
      this.isActive && !this.object3dDragState && this.syncRooms();
    }, syncSignboardsOnly = () => {
      this.isActive && this.syncBuildingSignboards?.();
    };
    eventBus.on("room3d:changed", syncRoomsOnly), eventBus.on("room3d:selected", syncRoomsOnly), eventBus.on("room3d:deselected", syncRoomsOnly), eventBus.on("room3d:doc-updated", syncSignboardsOnly), eventBus.on("room3d:inspect", syncSignboardsOnly), eventBus.on("room3d:inspect-closed", syncSignboardsOnly);
    let syncObjects3dOnly = () => {
      this.isActive && !this.object3dDragState && (this.syncObjects3d(), this.avatarMode && (this.renderHouseFlipperPromptHud?.(), this.updateAvatarProximityHud?.()));
    };
    eventBus.on("object3d:changed", syncObjects3dOnly), eventBus.on("object3d:selected", syncObjects3dOnly), eventBus.on("object3d:deselected", syncObjects3dOnly);
    let syncRoadsOnly = () => {
      this.isActive && !this.object3dDragState && this.syncRoads();
    };
    eventBus.on("road3d:changed", syncRoadsOnly), eventBus.on("road3d:selected", syncRoadsOnly), eventBus.on("road3d:deselected", syncRoadsOnly), eventBus.on("map:scale-changed", () => {
      this.isInitialized && (this.rebuildGround(), this.isActive && this.syncAll());
    }), eventBus.on("map:image-changed", ({ src, image }) => {
      src && (this.activeMapUrl = src, this.activeMapImage = image || null, this.isInitialized && this.rebuildGround());
    }), eventBus.on("theme:changed", () => {
      this.applyThemeColors();
    }), eventBus.on("presence:updated", ({ peers, deltaPeer, deltaType, deltaClientId } = {}) => {
      if (deltaType === "update" && deltaPeer) {
        this.syncSingleRemoteAvatar(deltaPeer);
        return;
      }
      if (deltaType === "remove" && deltaClientId) {
        this.removeSingleRemoteAvatar(deltaClientId);
        return;
      }
      this.syncRemoteAvatars(peers || authManager.getRemotePeers());
    }), eventBus.on("auth:changed", () => {
      let u = authManager.getCurrentUser?.();
      this.avatarGroup && updateRobloxAvatarLabel(this.avatarGroup, u ? `@${u.username}` : "Teknisi Jaringan", "#537b8e"), this.syncRemoteAvatars(authManager.getRemotePeers());
    }), eventBus.on("mode:changed", ({ mode }) => {
      this.container && this.container.classList.toggle("mode-draw-cable", mode === "draw-cable"), mode !== "draw-cable" && (this.pendingCableSourceId = null, this.pendingCableSourcePort = "", this.pending3dWaypoints = [], this.isActive && (this.syncDevices(), this.syncCables(), this.simulatorFocusedDeviceId && this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId)));
    }), eventBus.on("pen-tool:options-changed", ({ pathStyle, category }) => {
      pathStyle && (this.pen3dPathStyle = pathStyle), category && (this.pen3dCategory = category), this.isActive && this.syncCables();
    }), eventBus.on("pen-tool:undo-3d-point", () => {
      this.pending3dWaypoints.length > 0 && (this.pending3dWaypoints.pop(), this.isActive && this.syncCables());
    }), eventBus.on("map3d:start-cable", ({ deviceId, portName = "" }) => {
      this.pendingCableSourceId = deviceId || null, this.pendingCableSourcePort = portName || "", this.pending3dWaypoints = [], this.isActive && (this.syncDevices(), this.syncCables(), this.syncBuildingSignboards?.(), (this.buildingXrayMode || this.perRoomXrayIds?.size > 0) && this.applyBuildingXrayMaterials?.(), this.simulatorFocusedDeviceId && this.renderSimulatorInspectorHud(this.simulatorFocusedDeviceId));
    }), eventBus.on("map3d:zoom-extents", () => {
      this.isActive && this.zoomExtents();
    }), eventBus.on("map3d:set-navtool", ({ tool }) => {
      tool && this.setNavTool(tool);
    }), eventBus.on("map3d:bake-cable-pen-points", ({ cableId, count = 3 }) => {
      let cable = this.cableManager?.getConnectionById(cableId);
      if (!cable) return;
      let numPts = Math.max(1, Math.min(8, Number(count) || 3)), curve = this.cableMeshMap.get(cableId)?.userData?.curve || null, srcDev = this.deviceManager?.getDeviceById(cable.source), dstDev = this.deviceManager?.getDeviceById(cable.destination), sampledRoute = [];
      if (curve && typeof curve.getPoint == "function") for (let i = 1; i <= numPts; i++) {
        let t = i / (numPts + 1), pt = curve.getPoint(t), { normX, normY } = this.worldToNorm(pt.x, pt.z);
        sampledRoute.push({ x: Number(Math.max(0.01, Math.min(0.99, normX)).toFixed(4)), y: Number(Math.max(0.01, Math.min(0.99, normY)).toFixed(4)), z: Number(Math.max(0.02, pt.y).toFixed(2)) });
      }
      else if (srcDev && dstDev) {
        let srcElev = srcDev.spatial3d?.elevationMeters ?? 1.2, dstElev = dstDev.spatial3d?.elevationMeters ?? 1.2;
        for (let i = 1; i <= numPts; i++) {
          let t = i / (numPts + 1);
          sampledRoute.push({ x: Number(Math.max(0.01, Math.min(0.99, srcDev.position.x + (dstDev.position.x - srcDev.position.x) * t)).toFixed(4)), y: Number(Math.max(0.01, Math.min(0.99, srcDev.position.y + (dstDev.position.y - srcDev.position.y) * t)).toFixed(4)), z: Number(Math.max(0.02, srcElev + (dstElev - srcElev) * t).toFixed(2)) });
        }
      }
      sampledRoute.length > 0 && this.cableManager.updateConnection(cableId, { route: sampledRoute, details: { ...cable.details || {}, pathStyle: "curve", bowOut: 0, sideOffset: 0, sagDrop: 0 } });
    }), window.addEventListener("keydown", (e) => {
      if (!this.isActive || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (e.key === "Alt" && this.avatarMode && this.releaseAvatarPointerLock(), e.code === "Space" || e.key === " ") {
        this.avatarMode && (e.preventDefault(), this.keysPressed.add("space"));
        return;
      }
      let lowerKey = e.key.toLowerCase();
      ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(lowerKey) || (this.keysPressed.add(lowerKey), e.shiftKey && this.keysPressed.add("shift"));
    }), window.addEventListener("keyup", (e) => {
      (e.code === "Space" || e.key === " ") && this.keysPressed.delete("space"), this.keysPressed.delete(e.key.toLowerCase()), e.shiftKey || this.keysPressed.delete("shift");
    }), window.addEventListener("blur", () => {
      this.keysPressed.clear();
    });
  }
  isBuildingEditWorkspace() {
    return !!(this.workspaceGhostDevices || stateManager.getWorkspaceMode?.() === "build");
  }
  isRoomPassThrough(room) {
    return getDefaultRoomPassThrough(room);
  }
  isObject3dPassThrough(obj) {
    if (!obj || typeof obj != "object") return false;
    if (typeof obj.passThrough == "boolean") return obj.passThrough;
    let ident = `${obj.preset || ""} ${obj.name || ""} ${obj.label || ""}`;
    return /wastafel|keran/i.test(ident) ? false : !!/pohon.*(kecil|palem)|semak|rumput|bush|shrub/i.test(ident);
  }
  setWorkspaceGhostDevices(enabled) {
    return this.workspaceGhostDevices = !!enabled, this.devicesGroup && this.devicesGroup.traverse((obj) => {
      !obj.isMesh || !obj.material || (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => {
        m && (m.userData?._origOpacity === void 0 && (m.userData = { ...m.userData || {}, _origOpacity: m.opacity ?? 1, _origTransparent: !!m.transparent }), this.workspaceGhostDevices ? (m.transparent = true, m.opacity = Math.min(0.28, m.userData._origOpacity)) : (m.opacity = m.userData._origOpacity, m.transparent = m.userData._origTransparent));
      });
    }), this.syncTransformGizmo?.(), this.syncSelectionRings?.(), this.updateAvatarDeviceLabelsVisibility?.(), this.apply3dViewFilters?.(), this.workspaceGhostDevices;
  }
  animatePacketPath3D(deviceIds = [], { success = true, durationMs = 1500 } = {}) {
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return { hopCount: 0, success: !!success };
    let waypoints = deviceIds.map((id) => {
      let eff = this.effectivePosMap?.get?.(id);
      if (eff) return eff.clone().add(new Vector3(0, 0.35, 0));
      let dev = this.deviceManager?.getDeviceById?.(id);
      if (!dev) return null;
      let w = this.normToWorld?.(dev.position?.x ?? 0.5, dev.position?.y ?? 0.5) || { x: 0, z: 0 }, elev = Number(dev.spatial3d?.elevationMeters) || 0.4;
      return new Vector3(w.x, elev + 0.35, w.z);
    }).filter(Boolean);
    if (waypoints.length === 0) return { hopCount: 0, success: !!success };
    let color = success ? 2278750 : 15680580, sphere = new Mesh(new THREE.SphereGeometry(0.32, 16, 16), new MeshBasicMaterial({ color }));
    sphere.position.copy(waypoints[0]), sphere.userData.isPacketProbe = true, this.packetFlowGroup?.add(sphere);
    let now = typeof performance < "u" ? performance.now() : Date.now();
    return this.activePacketFlows.push({ mesh: sphere, waypoints, startTime: now, duration: Math.max(400, Number(durationMs) || 1500) }), { hopCount: waypoints.length, success: !!success };
  }
  updatePacketFlows3D(now = typeof performance < "u" ? performance.now() : Date.now()) {
    if (!Array.isArray(this.activePacketFlows) || this.activePacketFlows.length === 0) return;
    let remaining = [];
    for (let flow of this.activePacketFlows) {
      let elapsed = now - flow.startTime, t = Math.min(1, Math.max(0, elapsed / flow.duration));
      if (t >= 1 || !flow.mesh) {
        this.packetFlowGroup?.remove(flow.mesh), flow.mesh?.geometry?.dispose?.(), flow.mesh?.material?.dispose?.();
        continue;
      }
      let pts = flow.waypoints;
      if (pts.length === 1) flow.mesh.position.copy(pts[0]);
      else {
        let segFloat = t * (pts.length - 1), idx = Math.min(pts.length - 2, Math.floor(segFloat)), alpha = segFloat - idx;
        flow.mesh.position.lerpVectors(pts[idx], pts[idx + 1], alpha), flow.mesh.position.y += Math.sin(alpha * Math.PI) * 0.45;
      }
      remaining.push(flow);
    }
    this.activePacketFlows = remaining;
  }
  _findFirstFreePortName(deviceId) {
    let dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return "";
    let ports = Array.isArray(dev.ports) && dev.ports.length > 0 ? dev.ports : getDefaultDevicePorts(dev.type, dev.model, dev.spatial3d?.customModelUrl), used = /* @__PURE__ */ new Set();
    return (this.cableManager?.getAllConnections?.() || []).forEach((cab) => {
      cab.source === deviceId && cab.details?.portSource && used.add(cab.details.portSource), cab.destination === deviceId && cab.details?.portDestination && used.add(cab.details.portDestination);
    }), ports.find((p) => !used.has(p.name))?.name || ports[0]?.name || "";
  }
  getDevicePortsStatusList(deviceId) {
    let dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return [];
    let ports = Array.isArray(dev.ports) && dev.ports.length > 0 ? dev.ports : getDefaultDevicePorts(dev.type, dev.model, dev.spatial3d?.customModelUrl), cables = this.cableManager?.getAllConnections?.() || [];
    return (ports || []).map((p) => {
      let conn = cables.find((cab) => cab.source === deviceId && cab.details?.portSource === p.name || cab.destination === deviceId && cab.details?.portDestination === p.name);
      return { name: p.name, type: p.type || "rj45", speed: p.speed || "1G", occupied: !!conn, connectedCableId: conn?.id || null };
    });
  }
  _findAimedFreePortOnDevice(deviceId) {
    if (!deviceId || !this.camera || !this.raycaster || !this.devicesGroup?.visible || !(this.camera.isPerspectiveCamera || this.camera.isOrthographicCamera)) return "";
    try {
      this.camera.updateMatrixWorld?.(), this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
      let hits = this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true));
      hits.length === 0 && this.pointer && (this.raycaster.setFromCamera(this.pointer, this.camera), hits = this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true)));
      for (let h of hits) if (!(h.distance > 12) && this.findDeviceIdFromObject(h.object) === deviceId) {
        let pName = this.findPortNameFromObject(h.object);
        if (pName) {
          let found = this.getDevicePortsStatusList(deviceId).find((p) => p.name === pName && !p.occupied);
          if (found) return found.name;
        }
        break;
      }
    } catch {
    }
    return "";
  }
  setActiveCablePullSourcePort(portName) {
    if (!this.activeCablePull || !portName) return false;
    let srcId = this.activeCablePull.sourceDeviceId, entry = this.getDevicePortsStatusList(srcId).find((p) => p.name === portName);
    return entry ? entry.occupied ? (this.showStatusHint(`Port ${portName} sudah terpakai oleh kabel lain. Pilih port yang kosong.`), false) : (this.activeCablePull.sourcePort = portName, this._lastHouseFlipperHudKey = "", this.updateAvatarCablePullLivePreview?.(0.016), this.renderHouseFlipperPromptHud?.(), this.markSceneDirty?.(10), this.showStatusHint(`Port asal kabel dipilih: [${portName}]. Arahkan ke perangkat tujuan atau klik dinding untuk Klem 3D.`), true) : false;
  }
  setActiveCablePullTargetPort(deviceId, portName) {
    return !this.activeCablePull || !deviceId || !portName ? null : (this.activeCablePull.targetDeviceId = deviceId, this.activeCablePull.targetPort = portName, this.finishAvatarCablePull(deviceId, portName));
  }
  startAvatarCablePull(deviceId = null, portName = "", options = {}) {
    if (this.isBuildingEditWorkspace?.()) return null;
    let targetId = deviceId;
    if (!targetId) {
      let pick = this.findNearestPickableObjectToAvatar?.();
      pick?.id && this.deviceManager?.getDeviceById?.(pick.id) ? targetId = pick.id : targetId = this.deviceManager?.selectedDeviceId || null;
    }
    let srcDev = targetId ? this.deviceManager?.getDeviceById?.(targetId) : null;
    if (!srcDev) return this.showStatusHint("Arahkan crosshair ke perangkat jaringan terlebih dahulu lalu tekan C untuk menarik kabel."), null;
    Array.isArray(this.carriedObjects) && this.carriedObjects.length > 0 && this.dropCarriedObjectsFromAvatar?.({ dropAll: true, silent: true });
    let aimedPort = portName ? "" : this._findAimedFreePortOnDevice(srcDev.id), srcPorts = this.getDevicePortsStatusList(srcDev.id), chosenPort = portName || aimedPort || this._findFirstFreePortName(srcDev.id), cableCategory = options.cableCategory || this.pen3dCategory || "cat6", orthoLock = options.orthoLock !== void 0 ? !!options.orthoLock : true;
    this.activeCablePull = { sourceDeviceId: srcDev.id, sourcePort: chosenPort, targetDeviceId: null, targetPort: "", cableCategory, pathStyle: orthoLock ? "orthogonal" : "curve", conduitType: options.conduitType || "none", waypoints: [], elevationOffset: 0, orthoLock, spoolSpin: 0, lastLiveLength: 0 }, !portName && !aimedPort && srcPorts.length > 1 && this.releaseAvatarPointerLock?.(), this.syncAvatarMeshVisibilityForPerspective?.(), this.syncMobileRobloxControlsVisibility?.(), this._lastHouseFlipperHudKey = "", this.renderHouseFlipperPromptHud?.(), this.updateAvatarCablePullLivePreview?.(0.016);
    let portSelectNote = srcPorts.length > 1 ? " \u2022 Pilih Port Asal di panel bawah (atau tombol 1-9)." : "";
    return this.showStatusHint(`Gulungan ${cableCategory.toUpperCase()} diambil dari ${srcDev.name}${chosenPort ? ` [${chosenPort}]` : ""}${portSelectNote} Klik perangkat tujuan atau klik dinding untuk Klem 3D!`), eventBus.emit("map3d:cable-pull-started", { ...this.activeCablePull }), this.activeCablePull;
  }
  setActiveCablePullCategory(cableCategory = "fiber-sm") {
    this.activeCablePull && (this.activeCablePull.cableCategory = cableCategory, this.pen3dCategory = cableCategory, this.syncAvatarMeshVisibilityForPerspective?.(), this._lastHouseFlipperHudKey = "", this.renderHouseFlipperPromptHud?.(), this.updateAvatarCablePullLivePreview?.(0.016), this.showStatusHint(`Jenis kabel diganti ke ${cableCategory.toUpperCase()}.`));
  }
  adjustAvatarCablePullElevation(delta = 0.25) {
    return this.activeCablePull ? (this.activeCablePull.elevationOffset = Number(clamp((Number(this.activeCablePull.elevationOffset) || 0) + delta, -2.5, 4).toFixed(2)), this._lastHouseFlipperHudKey = "", this.renderHouseFlipperPromptHud?.(), this.updateAvatarCablePullLivePreview?.(0.016), this.activeCablePull.elevationOffset) : 0;
  }
  computeAvatarCableAimTarget({ shiftKey = false } = {}) {
    if (this.isBuildingEditWorkspace?.() || !this.activeCablePull) return null;
    let pull = this.activeCablePull, prevWp = pull.waypoints.length > 0 ? pull.waypoints[pull.waypoints.length - 1] : null, srcDev = this.deviceManager?.getDeviceById?.(pull.sourceDeviceId), refNorm = prevWp || srcDev?.position || { x: 0.5, y: 0.5 }, refWorld = this.normToWorld(refNorm.x, refNorm.y), refY = prevWp?.z ?? Number(srcDev?.spatial3d?.elevationMeters ?? 0.9);
    if (this.camera && this.raycaster && (this.camera.isPerspectiveCamera || this.camera.isOrthographicCamera)) try {
      this.camera.updateMatrixWorld?.();
      let isLocked = typeof document !== 'undefined' && !!(document.pointerLockElement && document.pointerLockElement === this.renderer?.domElement);
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
      let devHits = this.devicesGroup?.visible ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true)) : [];
      if (devHits.length === 0 && !isLocked && this.pointer && (this.raycaster.setFromCamera(this.pointer, this.camera), devHits = this.devicesGroup?.visible ? this._filterVisibleRayHits(this.raycaster.intersectObjects(this.devicesGroup.children, true)) : [], devHits.length === 0 && this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera)), devHits.length > 0 && devHits[0].distance <= 12) {
        let hitDevId = this.findDeviceIdFromObject(devHits[0].object);
        if (hitDevId && hitDevId !== pull.sourceDeviceId) {
          let directPort = this.findPortNameFromObject(devHits[0].object), hitPort = directPort || (pull.targetDeviceId === hitDevId ? pull.targetPort : "") || this._findFirstFreePortName(hitDevId);
          return { kind: "device", deviceId: hitDevId, portName: hitPort, hitPortDirectly: !!directPort, worldPoint: devHits[0].point.clone(), distance: devHits[0].distance };
        }
      }
      let envTargets = [...this.roomsGroup?.children || [], ...this.objects3dGroup?.children || [], ...this.groundGroup?.children || []], surfHits = envTargets.length > 0 ? this._filterVisibleRayHits(this.raycaster.intersectObjects(envTargets, true)) : [];
      if (surfHits.length > 0 && surfHits[0].distance <= 9) {
        let fh = surfHits[0], wp = fh.point.clone(), normal = { x: 0, y: 1, z: 0 };
        if (fh.face?.normal && fh.object?.matrixWorld) {
          let nMat = new Matrix3().getNormalMatrix(fh.object.matrixWorld), wNorm = fh.face.normal.clone().applyMatrix3(nMat).normalize();
          wNorm.dot(this.raycaster.ray.direction) > 0 && wNorm.negate(), wp.addScaledVector(wNorm, 0.018), normal = { x: Number(wNorm.x.toFixed(3)), y: Number(wNorm.y.toFixed(3)), z: Number(wNorm.z.toFixed(3)) };
        }
        if (wp.y = Math.max(0.02, wp.y + (Number(pull.elevationOffset) || 0)), pull.orthoLock || shiftKey) {
          let dx = Math.abs(wp.x - refWorld.x), dz = Math.abs(wp.z - refWorld.z), dy = Math.abs(wp.y - refY);
          dy > dx * 1.4 && dy > dz * 1.4 && Math.max(dx, dz) < 0.65 ? (wp.x = refWorld.x, wp.z = refWorld.z) : dx >= dz ? wp.z = refWorld.z : wp.x = refWorld.x;
        }
        let { normX: normX2, normY: normY2 } = this.worldToNorm(wp.x, wp.z), surface = classifySurfaceFromNormal(normal);
        return { kind: "surface", worldPoint: wp, normX: Number(clamp(normX2, 0.01, 0.99).toFixed(4)), normY: Number(clamp(normY2, 0.01, 0.99).toFixed(4)), z: Number(Math.max(0.02, wp.y).toFixed(2)), surface, normal, clipType: getDefaultClipType(pull.cableCategory, surface) };
      }
    } catch {
    }
    let yaw = Number(this.avatarState?.camYaw ?? this.avatarState?.yaw) || 0, fx = (Number(this.avatarState?.x) || 0) - Math.sin(yaw) * 1.8, fz = (Number(this.avatarState?.z) || 0) - Math.cos(yaw) * 1.8, fy = Math.max(0.05, (Number(this.avatarState?.y) || 0) + 1.35 + (Number(pull.elevationOffset) || 0)), { normX, normY } = this.worldToNorm(fx, fz);
    return { kind: "surface", worldPoint: new Vector3(fx, fy, fz), normX: Number(clamp(normX, 0.01, 0.99).toFixed(4)), normY: Number(clamp(normY, 0.01, 0.99).toFixed(4)), z: Number(fy.toFixed(2)), surface: "wall", normal: { x: 0, y: 0, z: 1 }, clipType: getDefaultClipType(pull.cableCategory, "wall") };
  }
  placeAvatarCableClip({ shiftKey = false, aimTarget = null, customPoint = null } = {}) {
    if (!this.activeCablePull) return null;
    let target = customPoint || aimTarget || this.computeAvatarCableAimTarget({ shiftKey });
    if (!target) return null;
    let clip = { x: Number(clamp(target.normX ?? target.x ?? 0.5, 0.01, 0.99).toFixed(4)), y: Number(clamp(target.normY ?? target.y ?? 0.5, 0.01, 0.99).toFixed(4)), z: Number(Math.max(0.02, target.z ?? 1.2).toFixed(2)), surface: target.surface || "wall", normal: target.normal || { x: 0, y: 0, z: 1 }, clipType: target.clipType || getDefaultClipType(this.activeCablePull.cableCategory, target.surface || "wall") };
    return this.activeCablePull.waypoints.push(clip), this.activeCablePull.elevationOffset = 0, this._lastHouseFlipperHudKey = "", this.updateAvatarCablePullLivePreview?.(0.016), this.renderHouseFlipperPromptHud?.(), this.showStatusHint(`Klem #${this.activeCablePull.waypoints.length} terpasang (${clip.surface}, Z=${clip.z}m).`), clip;
  }
  undoAvatarCableClip() {
    if (!this.activeCablePull || this.activeCablePull.waypoints.length === 0) return null;
    let removed = this.activeCablePull.waypoints.pop();
    return this._lastHouseFlipperHudKey = "", this.updateAvatarCablePullLivePreview?.(0.016), this.renderHouseFlipperPromptHud?.(), this.showStatusHint(`Klem terakhir dilepas (sisa ${this.activeCablePull.waypoints.length} klem).`), removed;
  }
  cancelAvatarCablePull({ silent = false } = {}) {
    return this.activeCablePull ? (this.activeCablePull = null, this.clearGroup(this.cablePullPreviewGroup), this.syncAvatarMeshVisibilityForPerspective?.(), this.syncMobileRobloxControlsVisibility?.(), this._lastHouseFlipperHudKey = "", this.renderHouseFlipperPromptHud?.(), silent || this.showStatusHint("Penarikan kabel dibatalkan."), true) : false;
  }
  finishAvatarCablePull(destDeviceId, destPortName = "") {
    if (!this.activeCablePull || !destDeviceId) return null;
    let pull = this.activeCablePull;
    if (destDeviceId === pull.sourceDeviceId) return this.showStatusHint("Tidak bisa mencolok ke perangkat sumber yang sama."), null;
    let srcDev = this.deviceManager?.getDeviceById?.(pull.sourceDeviceId), dstDev = this.deviceManager?.getDeviceById?.(destDeviceId);
    if (!srcDev || !dstDev) return null;
    let chosenDstPort = destPortName || (pull.targetDeviceId === destDeviceId ? pull.targetPort : "") || this._findFirstFreePortName(destDeviceId), catDef = CABLE_CATEGORIES[pull.cableCategory] || CABLE_CATEGORIES.cat6, newCab = this.cableManager?.addConnection?.({ name: `${srcDev.name}${pull.sourcePort ? ` [${pull.sourcePort}]` : ""} -> ${dstDev.name}${chosenDstPort ? ` [${chosenDstPort}]` : ""}`, source: pull.sourceDeviceId, destination: destDeviceId, type: catDef.type || "ethernet", cableCategory: pull.cableCategory, route: pull.waypoints.map((w) => ({ ...w, ...w.normal ? { normal: { ...w.normal } } : {} })), status: "active", details: { pathStyle: pull.pathStyle || "orthogonal", conduitType: pull.conduitType || "none", showClips3d: true, ...pull.sourcePort ? { portSource: pull.sourcePort } : {}, ...chosenDstPort ? { portDestination: chosenDstPort } : {} } });
    if (this.activeCablePull = null, this.clearGroup(this.cablePullPreviewGroup), this.syncAvatarMeshVisibilityForPerspective?.(), this.syncMobileRobloxControlsVisibility?.(), this._lastHouseFlipperHudKey = "", newCab) {
      this.cableManager?.selectConnection?.(newCab.id), this.isActive && this.syncCables();
      let report = newCab.details?.neatnessReport || evaluateCableNeatness(newCab, srcDev, dstDev, { mapWidthMeters: this.cableManager?.mapWidthMeters || 170 });
      this.showStatusHint(`Kabel terpasang (${srcDev.name}${pull.sourcePort ? ` [${pull.sourcePort}]` : ""} -> ${dstDev.name}${chosenDstPort ? ` [${chosenDstPort}]` : ""}, ${newCab.length}m, ${pull.waypoints.length} Klem) \u2014 Skor Kerapian: ${report.score}/100 (Grade ${report.grade})!`), eventBus.emit("map3d:cable-pull-finished", { cable: newCab, neatnessReport: report });
    }
    return this.renderHouseFlipperPromptHud?.(), newCab || null;
  }
  updateAvatarCablePullLivePreview(dt = 0.016) {
    if (!this.cablePullPreviewGroup) return;
    if (!this.activeCablePull || !this.avatarMode || !this.isActive) {
      this.cablePullPreviewGroup.children.length > 0 && this.clearGroup(this.cablePullPreviewGroup);
      return;
    }
    let pull = this.activeCablePull, srcDev = this.deviceManager?.getDeviceById?.(pull.sourceDeviceId);
    if (!srcDev) {
      this.cancelAvatarCablePull({ silent: true });
      return;
    }
    this.avatarState?.isMoving && (pull.spoolSpin = (Number(pull.spoolSpin) || 0) + (Number(dt) || 0.016) * (this.avatarState.isRunning ? 7.5 : 4.2));
    let srcPortKey = pull.sourcePort ? `${pull.sourceDeviceId}::${pull.sourcePort}` : "", pts = [(srcPortKey && this.portWorldPosMap?.has?.(srcPortKey) ? this.portWorldPosMap.get(srcPortKey) : null)?.clone() || this.effectivePosMap?.get?.(pull.sourceDeviceId)?.clone() || (() => {
      let w = this.normToWorld(srcDev.position?.x ?? 0.5, srcDev.position?.y ?? 0.5);
      return new Vector3(w.x, Number(srcDev.spatial3d?.elevationMeters ?? 0.8), w.z);
    })()];
    pull.waypoints.forEach((wp) => {
      let w = this.normToWorld(wp.x, wp.y);
      pts.push(new Vector3(w.x, Math.max(0.02, Number(wp.z) || 1.2), w.z));
    });
    let aim = this.computeAvatarCableAimTarget(), handPos = this.camera ? this.camera.position.clone().add(new Vector3(0, -0.32, 0)) : new Vector3(Number(this.avatarState?.x) || 0, (Number(this.avatarState?.y) || 0) + 1.25, Number(this.avatarState?.z) || 0);
    aim?.worldPoint ? pts.push(aim.worldPoint.clone()) : pts.push(handPos);
    let totalM = 0;
    for (let i = 0; i < pts.length - 1; i++) totalM += pts[i].distanceTo(pts[i + 1]);
    pull.lastLiveLength = Math.round(totalM * 10) / 10, this.renderHouseFlipperPromptHud?.(), this.clearGroup(this.cablePullPreviewGroup);
    let catDef = CABLE_CATEGORIES[pull.cableCategory] || CABLE_CATEGORIES.cat6, maxLen = getStandardMaxLengthMeters(pull.cableCategory), lineColor = totalM > maxLen ? 15680580 : totalM > maxLen * 0.85 ? 16096779 : catDef.color || "#2563eb";
    if (pts.length >= 2) {
      let pathPts = pull.orthoLock ? buildFilletedPolylinePoints(pts, 0.05).map((p) => new Vector3(p.x, p.y, p.z)) : pts, curve = new CurvePath();
      for (let i = 0; i < pathPts.length - 1; i++) pathPts[i].distanceToSquared(pathPts[i + 1]) > 1e-4 && curve.add(new LineCurve3(pathPts[i], pathPts[i + 1]));
      if (curve.curves.length > 0) {
        let tubeGeo = new TubeGeometry(curve, Math.max(12, pathPts.length * 8), 0.014, 8, false), tubeMat = new MeshBasicMaterial({ color: lineColor, transparent: true, opacity: 0.9 });
        this.cablePullPreviewGroup.add(new Mesh(tubeGeo, tubeMat));
      }
    }
    let upAxis = new Vector3(0, 1, 0);
    if (pull.waypoints.forEach((wp) => {
      let w = this.normToWorld(wp.x, wp.y), clipMesh = createCableClip3DMesh({ clipType: wp.clipType || "u-clip", radius: 0.015 });
      if (clipMesh.position.set(w.x, Math.max(0.02, wp.z), w.z), wp.normal) {
        let nVec = new Vector3(wp.normal.x, wp.normal.y, wp.normal.z);
        nVec.lengthSq() > 0.01 && (nVec.normalize(), nVec.y < -0.999 ? clipMesh.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI) : clipMesh.quaternion.setFromUnitVectors(upAxis, nVec));
      }
      this.cablePullPreviewGroup.add(clipMesh);
    }), aim?.worldPoint) {
      let ghostColor = aim.kind === "device" ? 3718648 : totalM > maxLen ? 15680580 : 2278750, ghostGeo = new RingGeometry(0.03, 0.065, 18), ghostMat = new MeshBasicMaterial({ color: ghostColor, side: DoubleSide, transparent: true, opacity: 0.85 }), ghostMesh = new Mesh(ghostGeo, ghostMat);
      if (ghostMesh.position.copy(aim.worldPoint), aim.normal) {
        let nVec = new Vector3(aim.normal.x, aim.normal.y, aim.normal.z).normalize();
        ghostMesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), nVec);
      }
      this.cablePullPreviewGroup.add(ghostMesh);
    }
    this.renderHouseFlipperPromptHud?.();
  }
  snapNormalizedPointToNearestWall3D(normX, normY, elevZ = 2.75, maxRadiusMeters = 0.85) {
    if (!this.roomsGroup || this.roomsGroup.children.length === 0) return null;
    let w = this.normToWorld(normX, normY), origin = new Vector3(w.x, Math.max(0.15, elevZ), w.z), dirs = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)], bestHit = null, rc = new Raycaster();
    rc.far = maxRadiusMeters;
    for (let dir of dirs) {
      rc.set(origin, dir);
      let hits = this._filterVisibleRayHits(rc.intersectObjects(this.roomsGroup.children, true));
      hits.length > 0 && (!bestHit || hits[0].distance < bestHit.distance) && (bestHit = { hit: hits[0], dir });
    }
    if (!bestHit) return null;
    let pt = bestHit.hit.point.clone().addScaledVector(bestHit.dir, -0.025), normBack = this.worldToNorm(pt.x, pt.z);
    return { x: Number(clamp(normBack.normX, 0.01, 0.99).toFixed(4)), y: Number(clamp(normBack.normY, 0.01, 0.99).toFixed(4)), z: Number(Math.max(0.02, elevZ).toFixed(2)), surface: "wall", normal: { x: -bestHit.dir.x, y: 0, z: -bestHit.dir.z } };
  }
  findBuildingSignboardHit(raycaster = this.raycaster) {
    if (!this.buildingSignboardsGroup || !this.buildingSignboardsGroup.visible || this.buildingSignboardsGroup.children.length === 0) return null;
    let hits = this._filterVisibleRayHits(raycaster.intersectObjects(this.buildingSignboardsGroup.children, true));
    for (let i = 0; i < hits.length; i++) {
      let curr = hits[i].object;
      for (; curr && curr !== this.buildingSignboardsGroup; ) {
        if (curr.userData?.signboardRoomId) return { roomId: curr.userData.signboardRoomId, point: hits[i].point.clone() };
        curr = curr.parent;
      }
    }
    return null;
  }
  setShowBuildingSignboards(enabled) {
    let val = !!enabled;
    if (this.showBuildingSignboards = val, typeof document !== 'undefined') {
      let cb = document.getElementById("layer-toggle-building-labels");
      cb && cb.checked !== val && (cb.checked = val);
    }
    return this.updateBuildingSignboardsVisibility(), this.showBuildingSignboards;
  }
  syncBuildingSignboards() {
    if (!this.isInitialized || !this.buildingSignboardsGroup) return;
    this.signboardMeshMap || (this.signboardMeshMap = /* @__PURE__ */ new Map());
    let rooms = stateManager.getRooms3d?.() || [], devices = this.deviceManager?.getAllDevices?.() || [], connections = this.cableManager?.getAllConnections?.() || [], objects3d = stateManager.getObjects3d?.() || [], inspectedId = stateManager.getInspectedRoom3dId?.() || null, isDark = typeof document !== 'undefined' && document.documentElement?.getAttribute?.("data-theme") === "dark", projectMap = stateManager.getState()?.project?.map || {}, spatialOpts = { mapWidthMeters: this.cableManager?.mapWidthMeters || 170, naturalWidth: projectMap.naturalWidth || 1024, naturalHeight: projectMap.naturalHeight || 1024, allRooms: rooms }, validIds = /* @__PURE__ */ new Set();
    rooms.forEach((room) => {
      if (!room?.id || !isBuildingSignboardEligible(room)) return;
      validIds.add(room.id);
      let summary = buildBuildingDocumentationSummary(room, devices, connections, objects3d, spatialOpts), st = summary.statusCounts, vlansKey = summary.networkSummary.vlans.slice(0, 4).join(","), sig = [room.name || "", summary.doc.roomCode || "", summary.doc.zone || "", Number(room.x ?? 0.5).toFixed(4), Number(room.y ?? 0.5).toFixed(4), Number(room.widthMeters ?? 12).toFixed(1), Number(room.heightMeters ?? 4.5).toFixed(1), st.total, st.online, st.warning, st.offline, vlansKey, isDark ? "1" : "0", inspectedId === room.id ? "1" : "0"].join("|"), existing = this.signboardMeshMap.get(room.id);
      if (existing && existing.sig === sig) return;
      existing && (this.buildingSignboardsGroup.remove(existing.group), this._disposeObject3DResources(existing.group), this.signboardMeshMap.delete(room.id));
      let boardGroup = createBuildingSignboard3DGroup(room, summary, { isDark, normToWorldFn: (nx, ny) => this.normToWorld(nx, ny), isInspected: inspectedId === room.id });
      this.buildingSignboardsGroup.add(boardGroup), this.signboardMeshMap.set(room.id, { group: boardGroup, sig });
    });
    for (let [roomId, entry] of Array.from(this.signboardMeshMap.entries())) validIds.has(roomId) || (this.buildingSignboardsGroup.remove(entry.group), this._disposeObject3DResources(entry.group), this.signboardMeshMap.delete(roomId));
    this.updateBuildingSignboardsVisibility();
  }
  _isAvatarInsideAnyBuilding() {
    return !!this._getAvatarCurrentBuilding();
  }
  updateBuildingSignboardsVisibility() {
    if (!this.buildingSignboardsGroup) return;
    let layers = stateManager.state?.layers || {}, allowBase = !!(this.showBuildingSignboards && this.showLabels && layers.buildings !== false && layers.annotations !== false), fppIndoorHidden = !!(this.avatarMode && this.avatarPerspective === "fpp" && this._isAvatarInsideAnyBuilding());
    this.buildingSignboardsGroup.visible = allowBase && !fppIndoorHidden;
  }
  updateBuildingSignboardsFrame() {
    if (!this.buildingSignboardsGroup || this.signboardMeshMap.size === 0 || (this.avatarMode && this.avatarPerspective === "fpp" && this.updateBuildingSignboardsVisibility(), !this.buildingSignboardsGroup.visible || !this.camera)) return;
    let camPos = this.camera.position;
    this.signboardMeshMap.forEach(({ group }) => {
      let sprite = group?.userData?.sprite;
      if (!sprite) return;
      let dist = camPos.distanceTo(group.position), factor = clamp(dist / 58, 0.72, 1.65), bw = sprite.userData?.baseScaleW || 8.4, bh = sprite.userData?.baseScaleH || 2.6;
      sprite.scale.set(bw * factor, bh * factor, 1);
    });
  }
  applyBuildingXrayMaterials() {
    if (this._xrayMeshMaterialBackup || (this._xrayMeshMaterialBackup = /* @__PURE__ */ new WeakMap()), this._xrayHighlightBackup || (this._xrayHighlightBackup = /* @__PURE__ */ new WeakMap()), this.perRoomXrayIds || (this.perRoomXrayIds = /* @__PURE__ */ new Set()), !this.room3dMeshMap) return;
    let FLOOR_RE = /lantai|selasar|koridor|beranda|panggung|umpak|floor/i, xrayTint = new Color("#38bdf8"), anyXrayActive = !!(this.buildingXrayMode || this.perRoomXrayIds && this.perRoomXrayIds.size > 0);
    if (this.room3dMeshMap.forEach((roomGroup, roomId) => {
      let wantXray = !!(this.buildingXrayMode || this.perRoomXrayIds?.has?.(roomId));
      roomGroup.traverse((obj) => {
        if (!obj?.isMesh || !obj.material || obj.userData?.gizmoType || obj.userData?.isPlaceholderWireframe || obj.userData?.isLabelSprite) return;
        let existingBackup = this._xrayMeshMaterialBackup.get(obj);
        if (wantXray) {
          if (existingBackup) return;
          let origMaterial = obj.material, origList = Array.isArray(origMaterial) ? origMaterial : [origMaterial], isFloor = !!obj.userData?.isFloorMesh || FLOOR_RE.test(String(obj.name || "")), targetOpacity = isFloor ? 0.35 : 0.18, tempClones = origList.map((m) => {
            if (!m || typeof m.clone != "function") return m;
            let cloned = m.clone();
            return cloned.transparent = true, cloned.opacity = targetOpacity, cloned.depthWrite = false, !isFloor && cloned.color && typeof cloned.color.lerp == "function" && cloned.color.lerp(xrayTint, 0.25), cloned.needsUpdate = true, cloned;
          });
          this._xrayMeshMaterialBackup.set(obj, { origMaterial, tempClones: tempClones.filter((c, i) => c && c !== origList[i]) }), obj.material = Array.isArray(origMaterial) ? tempClones : tempClones[0];
        } else existingBackup && (obj.material = existingBackup.origMaterial, existingBackup.tempClones.forEach((cm) => {
          try {
            cm.dispose?.();
          } catch {
          }
        }), this._xrayMeshMaterialBackup.delete(obj));
      });
    }), [this.cablesGroup, this.devicesGroup].filter(Boolean).forEach((grp) => {
      let isCableGrp = grp === this.cablesGroup;
      grp.traverse((obj) => {
        if (!obj?.isMesh || !obj.material) return;
        let backup = this._xrayHighlightBackup.get(obj);
        if (anyXrayActive) {
          if (backup) return;
          let mats = Array.isArray(obj.material) ? obj.material : [obj.material], matStates = mats.map((m) => ({ mat: m, emissiveHex: m?.emissive?.getHex ? m.emissive.getHex() : null, emissiveIntensity: typeof m?.emissiveIntensity == "number" ? m.emissiveIntensity : null }));
          this._xrayHighlightBackup.set(obj, { renderOrder: obj.renderOrder || 0, matStates }), obj.renderOrder = Math.max(obj.renderOrder || 0, isCableGrp ? 14 : 11), isCableGrp && mats.forEach((m) => {
            m?.emissive && m?.color && typeof m.emissive.copy == "function" && (m.emissive.copy(m.color), m.emissiveIntensity = 0.45);
          });
        } else backup && (obj.renderOrder = backup.renderOrder, backup.matStates.forEach(({ mat, emissiveHex, emissiveIntensity }) => {
          mat && (emissiveHex !== null && mat.emissive?.setHex && mat.emissive.setHex(emissiveHex), emissiveIntensity !== null && (mat.emissiveIntensity = emissiveIntensity));
        }), this._xrayHighlightBackup.delete(obj));
      });
    }), typeof document !== 'undefined') {
      let btn = document.getElementById("btn-3d-xray");
      btn && (btn.classList.toggle("active", !!this.buildingXrayMode), btn.setAttribute("aria-pressed", String(!!this.buildingXrayMode)));
    }
  }
  setBuildingXrayMode(enabled, { silent = false } = {}) {
    let next = !!enabled;
    return this.buildingXrayMode = next, this.applyBuildingXrayMaterials(), eventBus.emit("map3d:xray-changed", { globalXray: this.buildingXrayMode, perRoomXrayIds: Array.from(this.perRoomXrayIds) }), silent || this.showStatusHint(next ? "Mode X-Ray Gedung AKTIF (X) \u2014 Dinding tembus pandang untuk audit jalur backbone FO & UTP." : "Mode X-Ray Gedung dimatikan \u2014 Material asli bangunan dipulihkan."), this.buildingXrayMode;
  }
  toggleBuildingXrayMode(options = {}) {
    return this.setBuildingXrayMode(!this.buildingXrayMode, options);
  }
  toggleRoomXray(roomId, { silent = false } = {}) {
    if (!roomId) return false;
    this.perRoomXrayIds || (this.perRoomXrayIds = /* @__PURE__ */ new Set());
    let nowOn = false;
    if (this.perRoomXrayIds.has(roomId) ? (this.perRoomXrayIds.delete(roomId), nowOn = false) : (this.perRoomXrayIds.add(roomId), nowOn = true), this.applyBuildingXrayMaterials(), eventBus.emit("map3d:xray-changed", { globalXray: this.buildingXrayMode, roomId, roomXray: nowOn, perRoomXrayIds: Array.from(this.perRoomXrayIds) }), !silent) {
      let room = stateManager.getRoom3dById?.(roomId);
      this.showStatusHint(nowOn ? `Mode X-Ray diaktifkan untuk "${room?.name || "Gedung"}".` : `Mode X-Ray dimatikan untuk "${room?.name || "Gedung"}".`);
    }
    return nowOn;
  }
  toggleRoomCutawayVariant(roomId) {
    let room = stateManager.getRoom3dById?.(roomId);
    if (!room) return null;
    let pair = findCutawayPairPreset(room);
    if (!pair?.pairPreset) return null;
    let updated = stateManager.updateRoom3d(room.id, { customModelUrl: pair.pairPreset.customModelUrl, presetId: pair.pairPreset.id });
    return updated && this.showStatusHint(pair.isCurrentlyCutaway ? `Model "${room.name}" diubah ke Atap Utuh.` : `Model "${room.name}" diubah ke Cutaway (atap terbuka).`), updated;
  }
  teleportAvatarToRoom(roomId) {
    let room = stateManager.getRoom3dById?.(roomId);
    if (!room) return false;
    let center = this.normToWorld(room.x ?? 0.5, room.y ?? 0.5), spawnX = center.x, spawnZ = center.z + Math.max(4, Number(room.depthMeters) || 12) * 0.5 + 2.2, foundDoor = false;
    if (this.activeDoorRigs && this.activeDoorRigs.size > 0) {
      let doorCenter = new Vector3();
      for (let rig of this.activeDoorRigs.values()) {
        if (rig.roomId !== room.id || !rig.pivotGroup) continue;
        this._getDoorRigWorldCenter?.(rig, doorCenter);
        let outX = doorCenter.x - center.x, outZ = doorCenter.z - center.z, len = Math.hypot(outX, outZ) || 1;
        spawnX = doorCenter.x + outX / len * 2, spawnZ = doorCenter.z + outZ / len * 2, foundDoor = true;
        break;
      }
    }
    if (!foundDoor) {
      let rotRad = (Number(room.rotationY ?? room.rotationDeg) || 0) * Math.PI / 180, offsetDist = Math.max(4, Number(room.depthMeters) || 12) * 0.5 + 2.2;
      spawnX = center.x + Math.sin(rotRad) * offsetDist, spawnZ = center.z + Math.cos(rotRad) * offsetDist;
    }
    (!this.avatarMode || this.avatarPerspective !== "fpp") && this.setAvatarMode(true, { perspective: "fpp" });
    let lookDx = center.x - spawnX, lookDz = center.z - spawnZ, faceYaw = Math.atan2(lookDx, lookDz);
    return this.avatarState.x = spawnX, this.avatarState.y = 0, this.avatarState.z = spawnZ, this.avatarState.vy = 0, this.avatarState.yaw = faceYaw, this.avatarState.pitch = -0.05, this.avatarGroup && (this.avatarGroup.position.set(spawnX, 0, spawnZ), this.avatarGroup.rotation.y = faceYaw), this.syncAvatarCameraFromAngles?.(), this.updateBuildingSignboardsVisibility(), this.showStatusHint(`Teknisi FPP dipindahkan ke depan pintu "${room.name}" \u2014 tekan E pada pintu untuk masuk.`), true;
  }
  capture3DSnapshot({ forceXray = false, quality = 0.92 } = {}) {
    if (!this.isInitialized || !this.renderer || !this.scene || !this.camera) return null;
    let prevXray = this.buildingXrayMode;
    try {
      return forceXray && !prevXray && this.setBuildingXrayMode(true, { silent: true }), this.renderer.render(this.scene, this.camera), typeof this.renderer.domElement?.toDataURL == "function" ? this.renderer.domElement.toDataURL("image/jpeg", quality) : null;
    } catch (err) {
      return console.warn("[Map3DEngine] capture3DSnapshot failed:", err), null;
    } finally {
      forceXray && !prevXray && this.setBuildingXrayMode(false, { silent: true });
    }
  }
}

export function attachMap3DSubsystems(Map3DEngine) {
  if (!Map3DEngine || !Map3DEngine.prototype) return;
  for (const name of Object.getOwnPropertyNames(Map3DSubsystemsMixin.prototype)) {
    if (name === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(Map3DSubsystemsMixin.prototype, name);
    if (desc) {
      Object.defineProperty(Map3DEngine.prototype, name, desc);
    }
  }
}
