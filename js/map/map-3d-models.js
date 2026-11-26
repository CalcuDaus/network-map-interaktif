/**
 * NetMap — 3D Hardware & Room Model Factory (Three.js)
 * Menyediakan model 3D prosedural untuk Router, Switch/Hub, Server, AP, PtP Dish, Rack, CCTV,
 * Ruangan 3D kustom, Sprite Label, serta loader model eksternal .glb/.gltf.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const glbCache = new Map(); // url -> Promise<THREE.Group>
const glbCollisionCache = new Map(); // url -> CollisionProfile
const OFFLINE_GLB_BUNDLE_URL = 'assets/vendor/glb-offline-bundle.js';

const NON_ENTERABLE_GLB_RE = /(?:^|\/)(?:pohon_|batu_kolam|wastafel_|tong_sampah|keran_|plank_|banner_|penunjuk_arah|rak_bunga|tempat_duduk|kandang_burung|tandon_air|mikrotik_|ruijie_|tp_link_|dahua_|hpe_)/i;

/**
 * Determine whether a GLB URL represents a walk-inside building needing door extraction & triangle collision baking.
 * Decorative props (trees, faucets, benches, trash bins) and small network devices skip heavy door/triangle preprocessing.
 * @param {string} url
 * @returns {boolean}
 */
export function isEnterableBuildingGlbUrl(url = '') {
  const clean = String(url || '').trim();
  if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return false;
  return !NON_ENTERABLE_GLB_RE.test(clean);
}

/**
 * Register an embedded GLB base64 lookup map (used by offline/file:// bundle and Node tests).
 * @param {Record<string, string>} map
 */
export function registerEmbeddedGlbMap(map) {
  if (typeof globalThis !== 'undefined' && map && typeof map === 'object') {
    globalThis.__NETMAP_BUILTIN_GLB_BASE64__ = map;
  }
}

function getEmbeddedGlbMap() {
  return (typeof globalThis !== 'undefined' && globalThis.__NETMAP_BUILTIN_GLB_BASE64__) || null;
}

let _offlineGlbScriptPromise = null;
function ensureOfflineGlbBundleLoaded() {
  const existing = getEmbeddedGlbMap();
  if (existing) return Promise.resolve(existing);
  if (typeof document === 'undefined' || typeof window === 'undefined') return Promise.resolve(null);
  if (_offlineGlbScriptPromise) return _offlineGlbScriptPromise;

  _offlineGlbScriptPromise = new Promise((resolve) => {
    try {
      const script = document.createElement('script');
      script.src = OFFLINE_GLB_BUNDLE_URL;
      script.async = true;
      script.onload = () => resolve(getEmbeddedGlbMap());
      script.onerror = () => {
        _offlineGlbScriptPromise = null;
        resolve(null);
      };
      (document.head || document.body || document.documentElement)?.appendChild?.(script);
    } catch {
      _offlineGlbScriptPromise = null;
      resolve(null);
    }
  });
  return _offlineGlbScriptPromise;
}

const ROOM_ROOF_RE = /atap|plafon|kanopi|lisplang|roof|ceiling/i;
const ROOM_FLOOR_RE = /lantai|selasar|koridor|beranda|panggung|umpak|floor/i;
const DOOR_MESH_CANDIDATE_RE = /pintu|door|shutter|kusen|kaca_jendela|kaca.*pintu/i;
const DOOR_MESH_EXCLUDE_RE = /atap|lantai|plafon|tanaman|ac_|papan|signage|ornamen|plat_pintu|list_batu|handle|grendel|daun_hijau|daun_jarum|pohon|etalase/i;

function _buildSubGeometryFromTriangles(mesh, triIndices, pivotWorld = null) {
  const srcGeo = mesh.geometry;
  const posAttr = srcGeo.attributes.position;
  const normAttr = srcGeo.attributes.normal || null;
  const uvAttr = srcGeo.attributes.uv || null;
  const idxAttr = srcGeo.index || null;
  const vertCount = triIndices.length * 3;
  const outPos = new Float32Array(vertCount * 3);
  const outNorm = normAttr ? new Float32Array(vertCount * 3) : null;
  const outUv = uvAttr ? new Float32Array(vertCount * 2) : null;

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const matWorld = pivotWorld ? mesh.matrixWorld : null;
  const normMat = pivotWorld && normAttr ? new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld) : null;

  let pOff = 0;
  let nOff = 0;
  let uOff = 0;
  for (let i = 0; i < triIndices.length; i++) {
    const t = triIndices[i];
    for (let k = 0; k < 3; k++) {
      const vi = idxAttr ? idxAttr.getX(t * 3 + k) : (t * 3 + k);
      v.fromBufferAttribute(posAttr, vi);
      if (pivotWorld) {
        v.applyMatrix4(matWorld);
        outPos[pOff++] = v.x - pivotWorld.x;
        outPos[pOff++] = v.y - pivotWorld.y;
        outPos[pOff++] = v.z - pivotWorld.z;
      } else {
        outPos[pOff++] = v.x;
        outPos[pOff++] = v.y;
        outPos[pOff++] = v.z;
      }
      if (outNorm && normAttr) {
        n.fromBufferAttribute(normAttr, vi);
        if (normMat) n.applyMatrix3(normMat).normalize();
        outNorm[nOff++] = n.x;
        outNorm[nOff++] = n.y;
        outNorm[nOff++] = n.z;
      }
      if (outUv && uvAttr) {
        outUv[uOff++] = uvAttr.getX(vi);
        outUv[uOff++] = uvAttr.getY(vi);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  if (outNorm) {
    geo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  } else {
    geo.computeVertexNormals();
  }
  if (outUv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function _buildPlanarRectGeoFromSourceTris(mesh, srcTriIndices, rect, pivotWorld = null, { asGeometry = false } = {}) {
  const srcGeo = mesh.geometry;
  const posAttr = srcGeo.attributes.position;
  const normAttr = srcGeo.attributes.normal || null;
  const uvAttr = srcGeo.attributes.uv || null;
  const idxAttr = srcGeo.index || null;
  const matWorld = mesh.matrixWorld;

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const cr = new THREE.Vector3();

  let bestTri = srcTriIndices[0];
  let bestArea = -1;
  for (const t of srcTriIndices) {
    const i0 = idxAttr ? idxAttr.getX(t * 3) : (t * 3);
    const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : (t * 3 + 1);
    const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : (t * 3 + 2);
    p0.fromBufferAttribute(posAttr, i0).applyMatrix4(matWorld);
    p1.fromBufferAttribute(posAttr, i1).applyMatrix4(matWorld);
    p2.fromBufferAttribute(posAttr, i2).applyMatrix4(matWorld);
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    const area = cr.crossVectors(e1, e2).length();
    if (area > bestArea) {
      bestArea = area;
      bestTri = t;
    }
  }

  const i0 = idxAttr ? idxAttr.getX(bestTri * 3) : (bestTri * 3);
  const i1 = idxAttr ? idxAttr.getX(bestTri * 3 + 1) : (bestTri * 3 + 1);
  const i2 = idxAttr ? idxAttr.getX(bestTri * 3 + 2) : (bestTri * 3 + 2);
  p0.fromBufferAttribute(posAttr, i0).applyMatrix4(matWorld);
  p1.fromBufferAttribute(posAttr, i1).applyMatrix4(matWorld);
  p2.fromBufferAttribute(posAttr, i2).applyMatrix4(matWorld);
  const origNorm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (origNorm.lengthSq() > 1e-10) {
    origNorm.normalize();
  } else if (normAttr) {
    origNorm.fromBufferAttribute(normAttr, i0).normalize();
  } else {
    origNorm.set(0, 0, 1);
  }

  const uv0 = uvAttr ? new THREE.Vector2().fromBufferAttribute(uvAttr, i0) : new THREE.Vector2(0, 0);
  const uv1 = uvAttr ? new THREE.Vector2().fromBufferAttribute(uvAttr, i1) : new THREE.Vector2(1, 0);
  const uv2 = uvAttr ? new THREE.Vector2().fromBufferAttribute(uvAttr, i2) : new THREE.Vector2(1, 1);

  const isZPlane = rect.axis === 'z';
  const aU = isZPlane ? p0.x : p0.z;
  const aV = p0.y;
  const bU = isZPlane ? p1.x : p1.z;
  const bV = p1.y;
  const cU = isZPlane ? p2.x : p2.z;
  const cV = p2.y;
  const uvDenom = (bV - cV) * (aU - cU) + (cU - bU) * (aV - cV);

  const interpUv = (u, v) => {
    if (Math.abs(uvDenom) < 1e-8) return [0, 0];
    const w0 = ((bV - cV) * (u - cU) + (cU - bU) * (v - cV)) / uvDenom;
    const w1 = ((cV - aV) * (u - cU) + (aU - cU) * (v - cV)) / uvDenom;
    const w2 = 1 - w0 - w1;
    return [
      w0 * uv0.x + w1 * uv1.x + w2 * uv2.x,
      w0 * uv0.y + w1 * uv1.y + w2 * uv2.y
    ];
  };

  const toWorld = (u, v) => (isZPlane
    ? new THREE.Vector3(u, v, rect.fixedCoord)
    : new THREE.Vector3(rect.fixedCoord, v, u));

  const c00 = toWorld(rect.u0, rect.v0);
  const c10 = toWorld(rect.u1, rect.v0);
  const c11 = toWorld(rect.u1, rect.v1);
  const c01 = toWorld(rect.u0, rect.v1);
  const uv00 = interpUv(rect.u0, rect.v0);
  const uv10 = interpUv(rect.u1, rect.v0);
  const uv11 = interpUv(rect.u1, rect.v1);
  const uv01 = interpUv(rect.u0, rect.v1);

  const testNorm = new THREE.Vector3().subVectors(c10, c00).cross(new THREE.Vector3().subVectors(c11, c00));
  const flipWinding = testNorm.dot(origNorm) < 0;
  const verts = flipWinding
    ? [[c00, uv00], [c11, uv11], [c10, uv10], [c00, uv00], [c01, uv01], [c11, uv11]]
    : [[c00, uv00], [c10, uv10], [c11, uv11], [c00, uv00], [c11, uv11], [c01, uv01]];

  const positions = new Float32Array(18);
  const normals = new Float32Array(18);
  const uvs = new Float32Array(12);
  const invWorld = pivotWorld ? null : new THREE.Matrix4().copy(matWorld).invert();
  const invNormMat = invWorld ? new THREE.Matrix3().getNormalMatrix(invWorld) : null;
  const localNorm = origNorm.clone();
  if (invNormMat) localNorm.applyMatrix3(invNormMat).normalize();

  const tmpPos = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const [wp, uvp] = verts[i];
    tmpPos.copy(wp);
    if (pivotWorld) {
      tmpPos.sub(pivotWorld);
    } else if (invWorld) {
      tmpPos.applyMatrix4(invWorld);
    }
    positions[i * 3] = tmpPos.x;
    positions[i * 3 + 1] = tmpPos.y;
    positions[i * 3 + 2] = tmpPos.z;
    normals[i * 3] = localNorm.x;
    normals[i * 3 + 1] = localNorm.y;
    normals[i * 3 + 2] = localNorm.z;
    uvs[i * 2] = uvp[0];
    uvs[i * 2 + 1] = uvp[1];
  }

  if (!asGeometry) {
    return { positions, normals, uvs };
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function _subtractRects2D(baseRect, cutouts) {
  let rects = [{ u0: baseRect.u0, u1: baseRect.u1, v0: baseRect.v0, v1: baseRect.v1 }];
  for (const cut of cutouts) {
    const next = [];
    for (const r of rects) {
      const cu0 = Math.max(r.u0, cut.u0);
      const cu1 = Math.min(r.u1, cut.u1);
      const cv0 = Math.max(r.v0, cut.v0);
      const cv1 = Math.min(r.v1, cut.v1);
      if (cu1 - cu0 <= 0.005 || cv1 - cv0 <= 0.005) {
        next.push(r);
        continue;
      }
      if (cu0 - r.u0 > 0.005) next.push({ u0: r.u0, u1: cu0, v0: r.v0, v1: r.v1 });
      if (r.u1 - cu1 > 0.005) next.push({ u0: cu1, u1: r.u1, v0: r.v0, v1: r.v1 });
      if (cv0 - r.v0 > 0.005) next.push({ u0: cu0, u1: cu1, v0: r.v0, v1: cv0 });
      if (r.v1 - cv1 > 0.005) next.push({ u0: cu0, u1: cu1, v0: cv1, v1: r.v1 });
    }
    rects = next;
  }
  return rects;
}

/**
 * Automatically extract individual door leaves (swinging single/double doors, sliding glass/folding doors,
 * and rolling shutters) from merged school-building GLB meshes and rig each leaf on an accurate hinge pivot.
 * Runs once per cached GLB template before cloning & collision profile generation.
 * @param {THREE.Object3D} root
 * @returns {Array<Object>}
 */
export function extractInteractiveDoorsFromGlbRoot(root) {
  if (!root) return [];
  root.updateMatrixWorld(true);
  const rootBox = new THREE.Box3().setFromObject(root);
  const rootSize = new THREE.Vector3();
  const rootCenter = new THREE.Vector3();
  rootBox.getSize(rootSize);
  rootBox.getCenter(rootCenter);

  // Skip small non-building GLBs (routers, switches, APs, props < 1.8m tall)
  if (rootSize.y < 1.8 || Math.max(rootSize.x, rootSize.z) < 2.0) {
    return [];
  }

  const candidateMeshes = [];
  root.traverse((obj) => {
    if (!obj?.isMesh || !obj.geometry?.attributes?.position) return;
    const name = String(obj.name || '');
    if (!DOOR_MESH_CANDIDATE_RE.test(name) || DOOR_MESH_EXCLUDE_RE.test(name)) return;
    candidateMeshes.push(obj);
  });
  let isBakedSingleMesh = false;
  if (candidateMeshes.length === 0 && rootSize.y >= 3.0 && Math.max(rootSize.x, rootSize.z) >= 8.0) {
    const BAKED_NON_BUILDING_RE = /pohon|lapangan|gawang|kandang|tandon|parkiran|tiang|wastafel|tong_sampah|rak_bunga|bunga|kaktus|halte|joglo|pendopo/i;
    root.traverse((obj) => {
      if (!obj?.isMesh || !obj.geometry?.attributes?.position) return;
      const name = String(obj.name || '');
      if (DOOR_MESH_EXCLUDE_RE.test(name) || BAKED_NON_BUILDING_RE.test(name)) return;
      candidateMeshes.push(obj);
    });
    if (candidateMeshes.length > 0 && candidateMeshes.length <= 4) {
      isBakedSingleMesh = true;
    } else {
      candidateMeshes.length = 0;
    }
  }
  if (candidateMeshes.length === 0) return [];

  const frames = [];
  const meshIslandEntries = [];
  const meshAllIslandsMap = new Map(); // mesh -> { triCount, islands: [] }
  const removedTrisByMesh = new Map(); // mesh -> Set<triIndex>
  const markRemoved = (mesh, tris) => {
    let s = removedTrisByMesh.get(mesh);
    if (!s) {
      s = new Set();
      removedTrisByMesh.set(mesh, s);
    }
    for (const t of tris) s.add(t);
  };
  const tmpV = new THREE.Vector3();

  for (const mesh of candidateMeshes) {
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
    if (triCount === 0) continue;

    const parent = new Int32Array(triCount);
    for (let i = 0; i < triCount; i++) parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const vertToTri = new Map();
    const triBounds = new Array(triCount);
    const matW = mesh.matrixWorld;

    for (let t = 0; t < triCount; t++) {
      let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
      let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(t * 3 + k) : (t * 3 + k);
        tmpV.fromBufferAttribute(pos, vi).applyMatrix4(matW);
        if (tmpV.x < mnX) mnX = tmpV.x;
        if (tmpV.x > mxX) mxX = tmpV.x;
        if (tmpV.y < mnY) mnY = tmpV.y;
        if (tmpV.y > mxY) mxY = tmpV.y;
        if (tmpV.z < mnZ) mnZ = tmpV.z;
        if (tmpV.z > mxZ) mxZ = tmpV.z;
        const vKey = `${Math.round(tmpV.x * 100)},${Math.round(tmpV.y * 100)},${Math.round(tmpV.z * 100)}`;
        const prev = vertToTri.get(vKey);
        if (prev !== undefined) union(prev, t);
        else vertToTri.set(vKey, t);
      }
      triBounds[t] = { mnX, mnY, mnZ, mxX, mxY, mxZ };
    }

    const compMap = new Map();
    for (let t = 0; t < triCount; t++) {
      const r = find(t);
      let comp = compMap.get(r);
      const b = triBounds[t];
      if (!comp) {
        comp = {
          mnX: b.mnX, mnY: b.mnY, mnZ: b.mnZ,
          mxX: b.mxX, mxY: b.mxY, mxZ: b.mxZ,
          tris: [t]
        };
        compMap.set(r, comp);
      } else {
        if (b.mnX < comp.mnX) comp.mnX = b.mnX;
        if (b.mxX > comp.mxX) comp.mxX = b.mxX;
        if (b.mnY < comp.mnY) comp.mnY = b.mnY;
        if (b.mxY > comp.mxY) comp.mxY = b.mxY;
        if (b.mnZ < comp.mnZ) comp.mnZ = b.mnZ;
        if (b.mxZ > comp.mxZ) comp.mxZ = b.mxZ;
        comp.tris.push(t);
      }
    }

    const meshName = String(mesh.name || '');
    const isGlassMesh = /kaca_jendela|kaca.*pintu/i.test(meshName);
    const doorIslands = [];
    const allIslandsForMesh = [];

    for (const comp of compMap.values()) {
      const w = comp.mxX - comp.mnX;
      const h = comp.mxY - comp.mnY;
      const d = comp.mxZ - comp.mnZ;
      const span = Math.max(w, d);
      const thick = Math.min(w, d);
      const tLen = comp.tris.length;
      const cx = (comp.mnX + comp.mxX) * 0.5;
      const cy = (comp.mnY + comp.mxY) * 0.5;
      const cz = (comp.mnZ + comp.mxZ) * 0.5;
      const nearFloor = (comp.mnY >= rootBox.min.y - 0.05 && comp.mnY <= rootBox.min.y + 0.58)
        || (comp.mnY >= rootBox.min.y + 3.05 && comp.mnY <= rootBox.min.y + 4.15);

      const rec = {
        mesh,
        meshName,
        mnX: comp.mnX, mxX: comp.mxX,
        mnY: comp.mnY, mxY: comp.mxY,
        mnZ: comp.mnZ, mxZ: comp.mxZ,
        w, h, d, span, thick, cx, cy, cz, tLen,
        tris: comp.tris,
        used: false
      };
      allIslandsForMesh.push(rec);

      // Record 3-bar door frames (typically 36 tris) for accurate hinge-side, composite glass door & open doorway detection
      if (tLen >= 28 && tLen <= 44 && h >= 1.75 && h <= 2.75 && span >= 0.65 && span <= 2.45 && thick <= 0.28 && nearFloor) {
        frames.push({
          ...rec,
          frameMat: Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        });
        continue;
      }

      if (!nearFloor) continue;
      if (tLen < 2 || tLen > 20) continue;
      if (isBakedSingleMesh) {
        if (h < 1.85 || h > 2.75 || span < 0.70 || span > 2.20 || thick > 0.18 || tLen > 16) continue;
      } else {
        if (h < 1.65 || h > 2.65) continue;
        if (span < 0.48 || span > 2.35) continue;

        const isAngledAjar = thick > 0.18 && thick <= 0.44 && span >= 0.72 && (span / Math.max(0.01, thick)) >= 2.2 && tLen <= 16;
        if (thick > 0.18 && !isAngledAjar) continue;
      }

      if (isGlassMesh) {
        // Only full-height entrance glass doors, never upper windows
        if (h < 1.90 || comp.mnY > rootBox.min.y + 0.45 || span < 1.1) continue;
      }

      rec.used = true;
      rec.paired = false;
      rec.pairIdx = -1;
      rec.extraParts = [];
      doorIslands.push(rec);
    }

    meshAllIslandsMap.set(mesh, { triCount, islands: allIslandsForMesh });
    if (doorIslands.length > 0) {
      meshIslandEntries.push({ mesh, triCount, doorIslands });
    }
  }

  // Merge co-located split 2-tri front/back leaf faces (e.g. ajar wood doors modeled as 2 thin sheets)
  const rawDoors = [];
  for (const entry of meshIslandEntries) {
    for (const isl of entry.doorIslands) {
      const twinFace = rawDoors.find((existing) =>
        existing.mesh === isl.mesh
        && existing.tLen <= 4
        && isl.tLen <= 4
        && Math.abs(existing.cx - isl.cx) < 0.12
        && Math.abs(existing.cz - isl.cz) < 0.12
        && Math.abs(existing.mnY - isl.mnY) < 0.12
        && Math.abs(existing.h - isl.h) < 0.15
      );
      if (twinFace) {
        twinFace.tris = twinFace.tris.concat(isl.tris);
        twinFace.mnX = Math.min(twinFace.mnX, isl.mnX);
        twinFace.mxX = Math.max(twinFace.mxX, isl.mxX);
        twinFace.mnY = Math.min(twinFace.mnY, isl.mnY);
        twinFace.mxY = Math.max(twinFace.mxY, isl.mxY);
        twinFace.mnZ = Math.min(twinFace.mnZ, isl.mnZ);
        twinFace.mxZ = Math.max(twinFace.mxZ, isl.mxZ);
        twinFace.w = twinFace.mxX - twinFace.mnX;
        twinFace.h = twinFace.mxY - twinFace.mnY;
        twinFace.d = twinFace.mxZ - twinFace.mnZ;
        twinFace.cx = (twinFace.mnX + twinFace.mxX) * 0.5;
        twinFace.cy = (twinFace.mnY + twinFace.mxY) * 0.5;
        twinFace.cz = (twinFace.mnZ + twinFace.mxZ) * 0.5;
      } else {
        rawDoors.push(isl);
      }
    }
  }

  // Stage 2: Composite framed doors (e.g., Perpustakaan Room 1 & Kepsek/TU glass doors with wooden mullions/kickplates)
  // Collect all kusen/kaca sub-islands strictly inside each 36-tri door frame opening
  const allUnclaimedIslands = [];
  for (const { islands } of meshAllIslandsMap.values()) {
    for (const rec of islands) {
      if (!rec.used && !(rec.tLen >= 28 && rec.tLen <= 44)) {
        allUnclaimedIslands.push(rec);
      }
    }
  }

  for (const fr of frames) {
    const frSpanX = fr.w >= fr.d;
    const isInsideFrame = (rec) => {
      if (rec.used || rec === fr) return false;
      const inY = rec.mnY >= fr.mnY - 0.05 && rec.mxY <= fr.mxY - 0.01;
      if (!inY) return false;
      if (frSpanX) {
        return rec.mnX >= fr.mnX + 0.01 && rec.mxX <= fr.mxX - 0.01
          && rec.mnZ >= fr.mnZ - 0.06 && rec.mxZ <= fr.mxZ + 0.06;
      }
      return rec.mnZ >= fr.mnZ + 0.01 && rec.mxZ <= fr.mxZ - 0.01
        && rec.mnX >= fr.mnX - 0.06 && rec.mxX <= fr.mxX + 0.06;
    };

    const innerParts = allUnclaimedIslands.filter(isInsideFrame);
    // Check if an existing Stage-1 door already occupies or touches this frame
    const existingInside = rawDoors.find((d) => {
      const gapX = Math.max(0, Math.max(fr.mnX - d.mxX, d.mnX - fr.mxX));
      const gapZ = Math.max(0, Math.max(fr.mnZ - d.mxZ, d.mnZ - fr.mxZ));
      return Math.abs(d.mnY - fr.mnY) < 0.3 && gapX <= 0.18 && gapZ <= 0.18;
    });

    if (existingInside) {
      // Attach any interior mullions/rails/kickplates strictly inside the frame to an existing glass door pane
      if (innerParts.length > 0 && /kaca/i.test(existingInside.meshName)) {
        for (const part of innerParts) {
          part.used = true;
          existingInside.extraParts.push({ mesh: part.mesh, tris: part.tris });
          existingInside.mnX = Math.min(existingInside.mnX, part.mnX);
          existingInside.mxX = Math.max(existingInside.mxX, part.mxX);
          existingInside.mnY = Math.min(existingInside.mnY, part.mnY);
          existingInside.mxY = Math.max(existingInside.mxY, part.mxY);
          existingInside.mnZ = Math.min(existingInside.mnZ, part.mnZ);
          existingInside.mxZ = Math.max(existingInside.mxZ, part.mxZ);
        }
        existingInside.w = existingInside.mxX - existingInside.mnX;
        existingInside.h = existingInside.mxY - existingInside.mnY;
        existingInside.d = existingInside.mxZ - existingInside.mnZ;
        existingInside.span = Math.max(existingInside.w, existingInside.d);
        existingInside.cx = (existingInside.mnX + existingInside.mxX) * 0.5;
        existingInside.cy = (existingInside.mnY + existingInside.mxY) * 0.5;
        existingInside.cz = (existingInside.mnZ + existingInside.mxZ) * 0.5;
      }
      continue;
    }

    if (innerParts.length > 0) {
      let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
      let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
      for (const part of innerParts) {
        if (part.mnX < mnX) mnX = part.mnX; if (part.mxX > mxX) mxX = part.mxX;
        if (part.mnY < mnY) mnY = part.mnY; if (part.mxY > mxY) mxY = part.mxY;
        if (part.mnZ < mnZ) mnZ = part.mnZ; if (part.mxZ > mxZ) mxZ = part.mxZ;
      }
      const cw = mxX - mnX;
      const ch = mxY - mnY;
      const cd = mxZ - mnZ;
      const cSpan = Math.max(cw, cd);
      if (ch >= fr.h * 0.65 && cSpan >= fr.span * 0.65) {
        innerParts.forEach((p) => { p.used = true; });
        const primary = innerParts[0];
        rawDoors.push({
          mesh: primary.mesh,
          meshName: innerParts.some((p) => /kaca/i.test(p.meshName)) ? 'Pintu_Kaca_Bingkai' : primary.meshName,
          mnX, mxX, mnY, mxY, mnZ, mxZ,
          w: cw, h: ch, d: cd, span: cSpan, thick: Math.min(cw, cd),
          cx: (mnX + mxX) * 0.5, cy: (mnY + mxY) * 0.5, cz: (mnZ + mxZ) * 0.5,
          tLen: primary.tLen,
          tris: primary.tris,
          extraParts: innerParts.slice(1).map((p) => ({ mesh: p.mesh, tris: p.tris })),
          paired: false,
          pairIdx: -1
        });
        continue;
      }
    }

    // Stage 3: Empty open 36-tri door frames (e.g. Lab ULW, Gedung Kelas Perhotelan)
    // Mount a matching realistic procedural wooden hinged door leaf starting OPEN (swung cleanly inward)
    if (fr.h >= 1.85 && fr.h <= 2.65 && fr.span >= 0.72 && fr.span <= 1.85 && !/etalase/i.test(fr.meshName)) {
      const leafW = frSpanX ? Math.max(0.60, fr.w - 0.12) : 0.05;
      const leafD = frSpanX ? 0.05 : Math.max(0.60, fr.d - 0.12);
      const leafH = Math.max(1.78, fr.h - 0.10);
      const mnX = frSpanX ? fr.mnX + 0.06 : fr.cx - 0.025;
      const mxX = mnX + leafW;
      const mnZ = frSpanX ? fr.cz - 0.025 : fr.mnZ + 0.06;
      const mxZ = mnZ + leafD;
      const mnY = fr.mnY;
      const mxY = fr.mnY + leafH;
      rawDoors.push({
        isProceduralLeaf: true,
        proceduralColor: fr.frameMat?.color ? fr.frameMat.color.clone().offsetHSL(0, -0.05, 0.08) : new THREE.Color('#6b4423'),
        mesh: null,
        meshName: 'Pintu_Ruangan_Procedural',
        mnX, mxX, mnY, mxY, mnZ, mxZ,
        w: leafW, h: leafH, d: leafD,
        span: Math.max(leafW, leafD),
        thick: Math.min(leafW, leafD),
        cx: (mnX + mxX) * 0.5, cy: (mnY + mxY) * 0.5, cz: (mnZ + mxZ) * 0.5,
        tris: [],
        extraParts: [],
        paired: false,
        pairIdx: -1,
        defaultStartOpen: true
      });
    }
  }

  const allDoors = [];
  const bakedPairLinks = [];
  for (const isl of rawDoors) {
    if (isBakedSingleMesh && isl.span >= 1.40 && isl.tLen <= 4 && isl.thick <= 0.06) {
      const leafSpanX = isl.w >= isl.d;
      const baseCutout = leafSpanX
        ? { axis: 'z', fixedCoord: isl.cz, u0: isl.mnX, u1: isl.mxX, v0: isl.mnY, v1: isl.mxY }
        : { axis: 'x', fixedCoord: isl.cx, u0: isl.mnZ, u1: isl.mxZ, v0: isl.mnY, v1: isl.mxY };
      if (leafSpanX) {
        const midX = (isl.mnX + isl.mxX) * 0.5;
        const leftLeaf = {
          ...isl,
          mxX: midX, w: midX - isl.mnX, span: midX - isl.mnX, cx: (isl.mnX + midX) * 0.5,
          isBakedHalfLeaf: true,
          halfRect: { axis: 'z', fixedCoord: isl.cz, u0: isl.mnX, u1: midX, v0: isl.mnY, v1: isl.mxY },
          cutoutRect: baseCutout,
          paired: true, pairSide: 'left', pairMode: 'closed-x'
        };
        const rightLeaf = {
          ...isl,
          mnX: midX, w: isl.mxX - midX, span: isl.mxX - midX, cx: (midX + isl.mxX) * 0.5,
          isBakedHalfLeaf: true,
          halfRect: { axis: 'z', fixedCoord: isl.cz, u0: midX, u1: isl.mxX, v0: isl.mnY, v1: isl.mxY },
          cutoutRect: baseCutout,
          paired: true, pairSide: 'right', pairMode: 'closed-x'
        };
        leftLeaf.doorIdx = allDoors.length;
        allDoors.push(leftLeaf);
        rightLeaf.doorIdx = allDoors.length;
        allDoors.push(rightLeaf);
        bakedPairLinks.push([leftLeaf, rightLeaf]);
      } else {
        const midZ = (isl.mnZ + isl.mxZ) * 0.5;
        const leftLeaf = {
          ...isl,
          mxZ: midZ, d: midZ - isl.mnZ, span: midZ - isl.mnZ, cz: (isl.mnZ + midZ) * 0.5,
          isBakedHalfLeaf: true,
          halfRect: { axis: 'x', fixedCoord: isl.cx, u0: isl.mnZ, u1: midZ, v0: isl.mnY, v1: isl.mxY },
          cutoutRect: baseCutout,
          paired: true, pairSide: 'left', pairMode: 'closed-z'
        };
        const rightLeaf = {
          ...isl,
          mnZ: midZ, d: isl.mxZ - midZ, span: isl.mxZ - midZ, cz: (midZ + isl.mxZ) * 0.5,
          isBakedHalfLeaf: true,
          halfRect: { axis: 'x', fixedCoord: isl.cx, u0: midZ, u1: isl.mxZ, v0: isl.mnY, v1: isl.mxY },
          cutoutRect: baseCutout,
          paired: true, pairSide: 'right', pairMode: 'closed-z'
        };
        leftLeaf.doorIdx = allDoors.length;
        allDoors.push(leftLeaf);
        rightLeaf.doorIdx = allDoors.length;
        allDoors.push(rightLeaf);
        bakedPairLinks.push([leftLeaf, rightLeaf]);
      }
    } else {
      if (isBakedSingleMesh && isl.thick <= 0.06) {
        const leafSpanX = isl.w >= isl.d;
        isl.cutoutRect = leafSpanX
          ? { axis: 'z', fixedCoord: isl.cz, u0: isl.mnX, u1: isl.mxX, v0: isl.mnY, v1: isl.mxY }
          : { axis: 'x', fixedCoord: isl.cx, u0: isl.mnZ, u1: isl.mxZ, v0: isl.mnY, v1: isl.mxY };
      }
      isl.doorIdx = allDoors.length;
      allDoors.push(isl);
    }
  }
  for (const [a, b] of bakedPairLinks) {
    a.pairIdx = b.doorIdx;
    b.pairIdx = a.doorIdx;
  }
  if (allDoors.length === 0) return [];

  // Helper: find a perpendicular frame touching a given door island
  const findTouchingPerpFrame = (isl) => {
    const leafSpanX = isl.w >= isl.d;
    for (const fr of frames) {
      if (Math.abs(fr.mnY - isl.mnY) > 0.35) continue;
      const frameSpanX = fr.w >= fr.d;
      if (frameSpanX === leafSpanX) continue; // not perpendicular
      const gapX = Math.max(0, Math.max(fr.mnX - isl.mxX, isl.mnX - fr.mxX));
      const gapZ = Math.max(0, Math.max(fr.mnZ - isl.mxZ, isl.mnZ - fr.mxZ));
      if (gapX <= 0.28 && gapZ <= 0.28) return fr;
    }
    return null;
  };

  // Detect double-door pairs (both closed side-by-side along X and pre-opened parallel along Z)
  for (let i = 0; i < allDoors.length; i++) {
    const a = allDoors[i];
    if (a.paired || a.isProceduralLeaf) continue;
    for (let j = i + 1; j < allDoors.length; j++) {
      const b = allDoors[j];
      if (b.paired || b.isProceduralLeaf) continue;
      if (Math.abs(a.mnY - b.mnY) > 0.25 || Math.abs(a.h - b.h) > 0.16) continue;
      if (Math.abs(a.span - b.span) > 0.16) continue;

      const aSpanX = a.w >= a.d;
      const bSpanX = b.w >= b.d;
      if (aSpanX && bSpanX && Math.abs(a.cz - b.cz) < 0.14) {
        const left = a.cx <= b.cx ? a : b;
        const right = a.cx <= b.cx ? b : a;
        const gap = right.mnX - left.mxX;
        if (gap >= -0.05 && gap <= 0.20) {
          left.paired = true;
          right.paired = true;
          left.pairIdx = right.doorIdx;
          right.pairIdx = left.doorIdx;
          left.pairSide = 'left';
          right.pairSide = 'right';
          left.pairMode = 'closed-x';
          right.pairMode = 'closed-x';
          break;
        }
      } else if (!aSpanX && !bSpanX && Math.abs(a.cz - b.cz) < 0.18) {
        const left = a.cx <= b.cx ? a : b;
        const right = a.cx <= b.cx ? b : a;
        const distX = right.cx - left.cx;
        if (distX >= 0.95 && distX <= 1.85) {
          left.paired = true;
          right.paired = true;
          left.pairIdx = right.doorIdx;
          right.pairIdx = left.doorIdx;
          left.pairSide = 'left';
          right.pairSide = 'right';
          left.pairMode = 'open-z';
          right.pairMode = 'open-z';
          break;
        }
      }
    }
  }

  const handleMat = new THREE.MeshStandardMaterial({
    color: 0xd9c28c,
    metalness: 0.78,
    roughness: 0.28
  });
  const hitboxMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // Compute hinge pivot, doorType, closedAngle, openAngle, initialOpen for every door leaf
  const extractedMeta = [];
  for (const isl of allDoors) {
    let doorType = 'swing';
    let initialOpen = Boolean(isl.defaultStartOpen);
    let hinge = new THREE.Vector3(isl.mnX, isl.mnY, isl.cz);
    let closedAngle = 0;
    let openAngle = Math.PI * 0.52;
    let slideAxis = 'x';
    let labelKind = 'Pintu';

    if (/rolling_shutter/i.test(isl.meshName)) {
      doorType = 'shutter';
      hinge.set(isl.cx, isl.mxY, isl.cz);
      closedAngle = 0;
      openAngle = 0;
      labelKind = 'Rolling Shutter';
    } else if (isl.span >= 1.55 && /kaca|lipat|geser|sliding/i.test(isl.meshName)) {
      doorType = 'slide';
      slideAxis = isl.w >= isl.d ? 'x' : 'z';
      hinge.set(slideAxis === 'x' ? isl.mnX : isl.cx, isl.mnY, slideAxis === 'x' ? isl.cz : isl.mnZ);
      closedAngle = 0;
      openAngle = 0;
      labelKind = /lipat/i.test(isl.meshName) ? 'Pintu Lipat' : 'Pintu Kaca Geser';
    } else if (isl.pairMode === 'closed-x') {
      initialOpen = false;
      const inwardSign = isl.cz >= rootCenter.z ? 1 : -1;
      if (isl.pairSide === 'left') {
        hinge.set(isl.mnX, isl.mnY, isl.cz);
        closedAngle = 0;
        openAngle = inwardSign * Math.PI * 0.52;
      } else {
        hinge.set(isl.mxX, isl.mnY, isl.cz);
        closedAngle = 0;
        openAngle = -inwardSign * Math.PI * 0.52;
      }
      labelKind = 'Pintu Ganda';
    } else if (isl.pairMode === 'closed-z') {
      initialOpen = false;
      const inwardSign = isl.cx < rootCenter.x ? 1 : -1;
      if (isl.pairSide === 'left') {
        hinge.set(isl.cx, isl.mnY, isl.mnZ);
        closedAngle = 0;
        openAngle = inwardSign * Math.PI * 0.52;
      } else {
        hinge.set(isl.cx, isl.mnY, isl.mxZ);
        closedAngle = 0;
        openAngle = -inwardSign * Math.PI * 0.52;
      }
      labelKind = 'Pintu Ganda';
    } else if (isl.pairMode === 'open-z') {
      initialOpen = true;
      const touchFrame = findTouchingPerpFrame(isl);
      let hingeAtMaxZ;
      if (touchFrame) {
        hingeAtMaxZ = Math.abs(isl.mxZ - touchFrame.cz) <= Math.abs(isl.mnZ - touchFrame.cz);
      } else {
        hingeAtMaxZ = Math.abs(isl.mxZ - rootCenter.z) < Math.abs(isl.mnZ - rootCenter.z);
      }
      hinge.set(isl.cx, isl.mnY, hingeAtMaxZ ? isl.mxZ : isl.mnZ);
      const extendsPosZ = !hingeAtMaxZ;
      openAngle = 0;
      if (isl.pairSide === 'left') {
        closedAngle = extendsPosZ ? Math.PI * 0.47 : -Math.PI * 0.47;
      } else {
        closedAngle = extendsPosZ ? -Math.PI * 0.47 : Math.PI * 0.47;
      }
      labelKind = 'Pintu Ganda';
    } else {
      const touchFrame = !isl.isProceduralLeaf ? findTouchingPerpFrame(isl) : null;
      if (touchFrame) {
        initialOpen = true;
        openAngle = 0;
        if (isl.d > isl.w) {
          const hingeAtMaxZ = Math.abs(isl.mxZ - touchFrame.cz) <= Math.abs(isl.mnZ - touchFrame.cz);
          hinge.set(isl.cx, isl.mnY, hingeAtMaxZ ? isl.mxZ : isl.mnZ);
          const extendsPosZ = !hingeAtMaxZ;
          const closeToPosX = touchFrame.cx >= isl.cx;
          closedAngle = (extendsPosZ === closeToPosX ? 1 : -1) * Math.PI * 0.48;
        } else {
          const hingeAtMaxX = Math.abs(isl.mxX - touchFrame.cx) <= Math.abs(isl.mnX - touchFrame.cx);
          hinge.set(hingeAtMaxX ? isl.mxX : isl.mnX, isl.mnY, isl.cz);
          const extendsPosX = !hingeAtMaxX;
          const closeToPosZ = touchFrame.cz >= isl.cz;
          closedAngle = (extendsPosX === closeToPosZ ? -1 : 1) * Math.PI * 0.48;
        }
      } else if (isl.w >= isl.d) {
        hinge.set(isl.mnX, isl.mnY, isl.cz);
        closedAngle = 0;
        openAngle = (isl.cz >= rootCenter.z ? 1 : -1) * Math.PI * 0.50;
      } else {
        hinge.set(isl.cx, isl.mnY, isl.mnZ);
        closedAngle = 0;
        openAngle = (isl.cx < rootCenter.x ? 1 : -1) * Math.PI * 0.50;
      }
      labelKind = isl.span >= 1.25 ? 'Pintu Ganda' : 'Pintu';
    }

    const pivotGroup = new THREE.Group();
    pivotGroup.name = `InteractiveDoorPivot_${isl.doorIdx}`;
    pivotGroup.position.copy(hinge);
    pivotGroup.userData.isInteractiveDoorPivot = true;
    pivotGroup.userData.doorMeta = {
      doorIdx: isl.doorIdx,
      pairIdx: isl.pairIdx,
      doorType,
      slideAxis,
      initialOpen,
      closedAngle,
      openAngle,
      labelKind,
      localCenterOffset: {
        x: isl.cx - hinge.x,
        y: isl.cy - hinge.y,
        z: isl.cz - hinge.z
      },
      span: Number(isl.span.toFixed(2)),
      height: Number(isl.h.toFixed(2))
    };

    const addLeafPart = (srcMesh, tris) => {
      const partGeo = _buildSubGeometryFromTriangles(srcMesh, tris, hinge);
      const srcMat = Array.isArray(srcMesh.material) ? srcMesh.material[0] : srcMesh.material;
      const partMat = srcMat && srcMat.side !== THREE.DoubleSide ? srcMat.clone() : srcMat;
      if (partMat) partMat.side = THREE.DoubleSide;
      const partMesh = new THREE.Mesh(partGeo, partMat);
      partMesh.name = `InteractiveDoorLeaf_${isl.doorIdx}`;
      partMesh.castShadow = true;
      partMesh.receiveShadow = true;
      partMesh.userData.isInteractiveDoorMesh = true;
      partMesh.userData.doorIdx = isl.doorIdx;
      pivotGroup.add(partMesh);
      markRemoved(srcMesh, tris);
    };

    if (isl.isProceduralLeaf) {
      const pMat = new THREE.MeshStandardMaterial({
        color: isl.proceduralColor || 0x6b4423,
        roughness: 0.62,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
      const pGeo = new THREE.BoxGeometry(isl.w, isl.h, isl.d);
      pGeo.translate(isl.cx - hinge.x, isl.cy - hinge.y, isl.cz - hinge.z);
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.name = `InteractiveDoorLeaf_${isl.doorIdx}`;
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      pMesh.userData.isInteractiveDoorMesh = true;
      pMesh.userData.doorIdx = isl.doorIdx;
      pivotGroup.add(pMesh);
    } else if (isl.isBakedHalfLeaf && isl.halfRect) {
      const partGeo = _buildPlanarRectGeoFromSourceTris(isl.mesh, isl.tris, isl.halfRect, hinge, { asGeometry: true });
      const srcMat = Array.isArray(isl.mesh.material) ? isl.mesh.material[0] : isl.mesh.material;
      const partMat = srcMat && srcMat.side !== THREE.DoubleSide ? srcMat.clone() : srcMat;
      if (partMat) partMat.side = THREE.DoubleSide;
      const partMesh = new THREE.Mesh(partGeo, partMat);
      partMesh.name = `InteractiveDoorLeaf_${isl.doorIdx}`;
      partMesh.castShadow = true;
      partMesh.receiveShadow = true;
      partMesh.userData.isInteractiveDoorMesh = true;
      partMesh.userData.doorIdx = isl.doorIdx;
      pivotGroup.add(partMesh);
      markRemoved(isl.mesh, isl.tris);
    } else {
      addLeafPart(isl.mesh, isl.tris);
      if (Array.isArray(isl.extraParts)) {
        for (const ep of isl.extraParts) {
          addLeafPart(ep.mesh, ep.tris);
        }
      }
    }

    // Add full-doorway invisible double-sided hitbox so clicking/aiming works reliably from BOTH inside & outside
    const hitGeo = new THREE.BoxGeometry(
      Math.max(0.08, isl.w + 0.04),
      Math.max(0.2, isl.h),
      Math.max(0.08, isl.d + 0.04)
    );
    hitGeo.translate(isl.cx - hinge.x, isl.cy - hinge.y, isl.cz - hinge.z);
    const hitMesh = new THREE.Mesh(hitGeo, hitboxMat);
    hitMesh.name = `InteractiveDoorHitbox_${isl.doorIdx}`;
    hitMesh.userData.isInteractiveDoorMesh = true;
    hitMesh.userData.isDoorHitbox = true;
    hitMesh.userData.doorIdx = isl.doorIdx;
    pivotGroup.add(hitMesh);

    // Add subtle metallic 3D door handle on both sides of swinging/sliding leaves so interactive doors are unmistakable
    if (doorType !== 'shutter') {
      const spanX = isl.w >= isl.d;
      const farX = isl.cx - hinge.x + (spanX ? (isl.cx >= hinge.x ? isl.w * 0.36 : -isl.w * 0.36) : 0);
      const farZ = isl.cz - hinge.z + (!spanX ? (isl.cz >= hinge.z ? isl.d * 0.36 : -isl.d * 0.36) : 0);
      const handleY = Math.min(isl.h * 0.56, 0.98);
      const handleGeo = new THREE.BoxGeometry(
        spanX ? 0.11 : Math.max(0.11, isl.w + 0.08),
        0.04,
        spanX ? Math.max(0.11, isl.d + 0.08) : 0.11
      );
      const handleMesh = new THREE.Mesh(handleGeo, handleMat);
      handleMesh.position.set(farX, handleY, farZ);
      handleMesh.name = `InteractiveDoorHandle_${isl.doorIdx}`;
      handleMesh.userData.isInteractiveDoorMesh = true;
      handleMesh.userData.isDoorHandle = true;
      handleMesh.userData.doorIdx = isl.doorIdx;
      pivotGroup.add(handleMesh);
    }

    root.add(pivotGroup);
    extractedMeta.push({ pivotGroup, meta: pivotGroup.userData.doorMeta });
  }

  // Punch real walkable doorway openings into baked single-mesh walls directly behind doors
  const extraGeoTrisByMesh = new Map();
  if (isBakedSingleMesh) {
    const cutoutsByMesh = new Map();
    for (const isl of allDoors) {
      if (!isl.mesh || !isl.cutoutRect) continue;
      let list = cutoutsByMesh.get(isl.mesh);
      if (!list) {
        list = [];
        cutoutsByMesh.set(isl.mesh, list);
      }
      const dup = list.some((c) =>
        c.axis === isl.cutoutRect.axis
        && Math.abs(c.fixedCoord - isl.cutoutRect.fixedCoord) < 0.02
        && Math.abs(c.u0 - isl.cutoutRect.u0) < 0.02
        && Math.abs(c.v0 - isl.cutoutRect.v0) < 0.02
      );
      if (!dup) list.push(isl.cutoutRect);
    }

    const tmpTri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const [mesh, cutouts] of cutoutsByMesh.entries()) {
      const geo = mesh.geometry;
      const posAttr = geo.attributes.position;
      const idxAttr = geo.index || null;
      const matWorld = mesh.matrixWorld;
      const removedSet = removedTrisByMesh.get(mesh) || new Set();
      const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);
      const wallGroups = [];

      for (let t = 0; t < triCount; t++) {
        if (removedSet.has(t)) continue;
        const i0 = idxAttr ? idxAttr.getX(t * 3) : (t * 3);
        const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : (t * 3 + 1);
        const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : (t * 3 + 2);
        tmpTri[0].fromBufferAttribute(posAttr, i0).applyMatrix4(matWorld);
        tmpTri[1].fromBufferAttribute(posAttr, i1).applyMatrix4(matWorld);
        tmpTri[2].fromBufferAttribute(posAttr, i2).applyMatrix4(matWorld);

        const mnX = Math.min(tmpTri[0].x, tmpTri[1].x, tmpTri[2].x);
        const mxX = Math.max(tmpTri[0].x, tmpTri[1].x, tmpTri[2].x);
        const mnY = Math.min(tmpTri[0].y, tmpTri[1].y, tmpTri[2].y);
        const mxY = Math.max(tmpTri[0].y, tmpTri[1].y, tmpTri[2].y);
        const mnZ = Math.min(tmpTri[0].z, tmpTri[1].z, tmpTri[2].z);
        const mxZ = Math.max(tmpTri[0].z, tmpTri[1].z, tmpTri[2].z);
        const flatZ = (mxZ - mnZ) <= 0.03;
        const flatX = (mxX - mnX) <= 0.03;
        if (!flatZ && !flatX) continue;

        for (const cut of cutouts) {
          const matchZ = cut.axis === 'z' && flatZ
            && Math.abs(((mnZ + mxZ) * 0.5) - cut.fixedCoord) <= 0.18
            && mxX > cut.u0 + 0.05 && mnX < cut.u1 - 0.05
            && mxY > cut.v0 + 0.05 && mnY < cut.v1 - 0.05;
          const matchX = cut.axis === 'x' && flatX
            && Math.abs(((mnX + mxX) * 0.5) - cut.fixedCoord) <= 0.18
            && mxZ > cut.u0 + 0.05 && mnZ < cut.u1 - 0.05
            && mxY > cut.v0 + 0.05 && mnY < cut.v1 - 0.05;
          if (!matchZ && !matchX) continue;

          const planeCoord = cut.axis === 'z' ? ((mnZ + mxZ) * 0.5) : ((mnX + mxX) * 0.5);
          const uMin = cut.axis === 'z' ? mnX : mnZ;
          const uMax = cut.axis === 'z' ? mxX : mxZ;
          const grp = wallGroups.find((g) =>
            g.axis === cut.axis
            && Math.abs(g.fixedCoord - planeCoord) < 0.03
            && uMin <= g.u1 + 0.04 && uMax >= g.u0 - 0.04
            && mnY <= g.v1 + 0.04 && mxY >= g.v0 - 0.04
          );
          if (grp) {
            grp.u0 = Math.min(grp.u0, uMin);
            grp.u1 = Math.max(grp.u1, uMax);
            grp.v0 = Math.min(grp.v0, mnY);
            grp.v1 = Math.max(grp.v1, mxY);
            if (!grp.tris.includes(t)) grp.tris.push(t);
          } else {
            wallGroups.push({
              axis: cut.axis,
              fixedCoord: planeCoord,
              u0: uMin, u1: uMax, v0: mnY, v1: mxY,
              tris: [t]
            });
          }
          break;
        }
      }

      if (wallGroups.length > 0) {
        const bakedChunks = [];
        for (const wg of wallGroups) {
          const matchingCuts = cutouts
            .filter((c) => c.axis === wg.axis && Math.abs(c.fixedCoord - wg.fixedCoord) <= 0.18)
            .map((c) => ({
              u0: c.u0 + 0.01,
              u1: c.u1 - 0.01,
              v0: c.v0,
              v1: c.v1 - 0.01
            }));
          if (matchingCuts.length === 0) continue;
          const remaining = _subtractRects2D(wg, matchingCuts);
          markRemoved(mesh, wg.tris);
          for (const subR of remaining) {
            bakedChunks.push(_buildPlanarRectGeoFromSourceTris(
              mesh,
              wg.tris,
              { axis: wg.axis, fixedCoord: wg.fixedCoord, ...subR },
              null,
              { asGeometry: false }
            ));
          }
        }
        if (bakedChunks.length > 0) {
          extraGeoTrisByMesh.set(mesh, bakedChunks);
          // Ensure single-plane walls remain visible from inside the room too
          if (mesh.material && !Array.isArray(mesh.material) && mesh.material.side !== THREE.DoubleSide) {
            mesh.material = mesh.material.clone();
            mesh.material.side = THREE.DoubleSide;
          }
        }
      }
    }
  }

  // Strip extracted door triangles from original static meshes so doors don't render twice
  for (const [mesh, removedSet] of removedTrisByMesh.entries()) {
    const info = meshAllIslandsMap.get(mesh);
    const extraChunks = extraGeoTrisByMesh.get(mesh) || [];
    if (!info || (removedSet.size === 0 && extraChunks.length === 0)) continue;
    const keepTris = [];
    for (let t = 0; t < info.triCount; t++) {
      if (!removedSet.has(t)) keepTris.push(t);
    }
    if (keepTris.length === 0 && extraChunks.length === 0) {
      mesh.visible = false;
      mesh.parent?.remove(mesh);
    } else if (extraChunks.length === 0) {
      mesh.geometry = _buildSubGeometryFromTriangles(mesh, keepTris, null);
    } else {
      const baseGeo = keepTris.length > 0 ? _buildSubGeometryFromTriangles(mesh, keepTris, null) : null;
      const basePos = baseGeo?.attributes?.position?.array || new Float32Array(0);
      const baseNorm = baseGeo?.attributes?.normal?.array || null;
      const baseUv = baseGeo?.attributes?.uv?.array || null;
      const extraPosCount = extraChunks.reduce((acc, c) => acc + c.positions.length, 0);
      const extraUvCount = extraChunks.reduce((acc, c) => acc + c.uvs.length, 0);

      const mergedPos = new Float32Array(basePos.length + extraPosCount);
      mergedPos.set(basePos, 0);
      const mergedNorm = new Float32Array(basePos.length + extraPosCount);
      if (baseNorm) mergedNorm.set(baseNorm, 0);
      const mergedUv = new Float32Array((baseUv ? baseUv.length : (basePos.length / 3) * 2) + extraUvCount);
      if (baseUv) mergedUv.set(baseUv, 0);

      let pOff = basePos.length;
      let uOff = baseUv ? baseUv.length : (basePos.length / 3) * 2;
      for (const ch of extraChunks) {
        mergedPos.set(ch.positions, pOff);
        mergedNorm.set(ch.normals, pOff);
        mergedUv.set(ch.uvs, uOff);
        pOff += ch.positions.length;
        uOff += ch.uvs.length;
      }
      baseGeo?.dispose?.();
      const outGeo = new THREE.BufferGeometry();
      outGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
      outGeo.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
      outGeo.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
      outGeo.computeBoundingBox();
      outGeo.computeBoundingSphere();
      mesh.geometry = outGeo;
    }
  }

  root.updateMatrixWorld(true);
  return extractedMeta;
}

function _addTriToGridCells(cellMap, cellSize, tri) {
  const gx0 = Math.floor(tri.minX / cellSize);
  const gx1 = Math.floor(tri.maxX / cellSize);
  const gz0 = Math.floor(tri.minZ / cellSize);
  const gz1 = Math.floor(tri.maxZ / cellSize);
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const key = `${gx},${gz}`;
      let arr = cellMap.get(key);
      if (!arr) {
        arr = [];
        cellMap.set(key, arr);
      }
      arr.push(tri);
    }
  }
}

/**
 * Extract spatial triangle hash grids (walls, walkable floors, roofs) from a loaded GLB root
 * in centered-bottom meter coordinates (x in [-W/2, W/2], y in [0, H], z in [-D/2, D/2]).
 * @param {THREE.Object3D} root
 * @returns {Object}
 */
export function buildGlbCollisionProfile(root) {
  root.updateMatrixWorld(true);
  const rootBox = new THREE.Box3().setFromObject(root);
  const rawSizeVec = new THREE.Vector3();
  const rootCenter = new THREE.Vector3();
  rootBox.getSize(rawSizeVec);
  rootBox.getCenter(rootCenter);

  const rawSize = {
    x: Math.max(0.01, rawSizeVec.x),
    y: Math.max(0.01, rawSizeVec.y),
    z: Math.max(0.01, rawSizeVec.z)
  };
  const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
  const unitSize = {
    x: rawSize.x / maxDim,
    y: rawSize.y / maxDim,
    z: rawSize.z / maxDim
  };

  const offX = -rootCenter.x;
  const offY = -rootBox.min.y;
  const offZ = -rootCenter.z;

  const cellSize = 1.25;
  const wallCells = new Map();
  const floorCells = new Map();
  const roofCells = new Map();

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const norm = new THREE.Vector3();

  let wallTriCount = 0;
  let floorTriCount = 0;

  // Temporarily pose any pre-opened interactive doors into their CLOSED position while baking wallCells
  // so closed doorways reliably block avatar passage and open doorways cleanly skip tri.doorIdx.
  const tempDoorRestores = [];
  root.traverse((obj) => {
    if (obj?.userData?.isInteractiveDoorPivot && obj.userData?.doorMeta) {
      const dm = obj.userData.doorMeta;
      if (dm.doorType === 'swing' && Math.abs((dm.closedAngle || 0) - obj.rotation.y) > 1e-4) {
        tempDoorRestores.push({ obj, prevRotY: obj.rotation.y });
        obj.rotation.y = dm.closedAngle || 0;
      }
    }
  });
  if (tempDoorRestores.length > 0) {
    root.updateMatrixWorld(true);
  }

  root.traverse((obj) => {
    if (!obj?.isMesh || !obj.geometry?.attributes?.position) return;
    if (obj.userData?.isDoorHitbox || obj.userData?.isDoorHandle) return;
    const meshName = String(obj.name || '');
    const doorIdx = Number.isInteger(obj.userData?.doorIdx) ? obj.userData.doorIdx : -1;
    const isFloorNamed = ROOM_FLOOR_RE.test(meshName);
    const isRoof = doorIdx < 0 && ROOM_ROOF_RE.test(meshName) && !isFloorNamed && !/tangga|stair/i.test(meshName);
    const posAttr = obj.geometry.attributes.position;
    const indexAttr = obj.geometry.index;
    const matWorld = obj.matrixWorld;
    const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

      vA.fromBufferAttribute(posAttr, i0).applyMatrix4(matWorld);
      vB.fromBufferAttribute(posAttr, i1).applyMatrix4(matWorld);
      vC.fromBufferAttribute(posAttr, i2).applyMatrix4(matWorld);

      const ax = vA.x + offX;
      const ay = vA.y + offY;
      const az = vA.z + offZ;
      const bx = vB.x + offX;
      const by = vB.y + offY;
      const bz = vB.z + offZ;
      const cx = vC.x + offX;
      const cy = vC.y + offY;
      const cz = vC.z + offZ;

      e1.set(bx - ax, by - ay, bz - az);
      e2.set(cx - ax, cy - ay, cz - az);
      norm.crossVectors(e1, e2);
      const len = norm.length();
      if (len < 1e-7) continue;
      norm.divideScalar(len);

      const tri = {
        ax, ay, az,
        bx, by, bz,
        cx, cy, cz,
        minX: Math.min(ax, bx, cx),
        maxX: Math.max(ax, bx, cx),
        minY: Math.min(ay, by, cy),
        maxY: Math.max(ay, by, cy),
        minZ: Math.min(az, bz, cz),
        maxZ: Math.max(az, bz, cz),
        ny: norm.y,
        doorIdx
      };

      if (isRoof) {
        _addTriToGridCells(roofCells, cellSize, tri);
      } else if (doorIdx >= 0) {
        _addTriToGridCells(wallCells, cellSize, tri);
        wallTriCount += 1;
      } else if (Math.abs(tri.ny) > 0.72) {
        _addTriToGridCells(floorCells, cellSize, tri);
        floorTriCount += 1;
      } else if (!isFloorNamed || (tri.maxY - tri.minY) > 0.08) {
        _addTriToGridCells(wallCells, cellSize, tri);
        wallTriCount += 1;
      }
    }
  });

  if (tempDoorRestores.length > 0) {
    tempDoorRestores.forEach(({ obj, prevRotY }) => {
      obj.rotation.y = prevRotY;
    });
    root.updateMatrixWorld(true);
  }

  return {
    rawSize,
    unitSize,
    halfW: rawSize.x * 0.5,
    halfD: rawSize.z * 0.5,
    height: rawSize.y,
    cellSize,
    wallCells,
    floorCells,
    roofCells,
    wallTriCount,
    floorTriCount
  };
}

/**
 * Return minimum allowed room dimensions in meters.
 * Custom GLB props (e.g. signposts or bird cages) can be narrower than 2m without distortion.
 * @param {Object} room
 * @returns {{ minW: number, minD: number, minH: number }}
 */
export function getRoomMinDimensions(room) {
  if (room?.customModelUrl) {
    return { minW: 0.1, minD: 0.1, minH: 0.1 };
  }
  return { minW: 2, minD: 2, minH: 1.5 };
}

/**
 * Scale a normalized GLB room wrapper smoothly across X/Y/Z to match room widthMeters/heightMeters/depthMeters.
 * @param {THREE.Group} glbWrapper
 * @param {Object} room
 */
export function applyRoomGlbScale(glbWrapper, room) {
  if (!glbWrapper || !room) return { sx: 1, sy: 1, sz: 1 };
  const { minW, minD, minH } = getRoomMinDimensions(room);
  const targetW = Math.max(minW, Number(room.widthMeters) || 14);
  const targetD = Math.max(minD, Number(room.depthMeters) || 12);
  const targetH = Math.max(minH, Number(room.heightMeters) || 3.5);
  const unitSize = glbWrapper.userData?.unitSize || { x: 1, y: 0.25, z: 0.6 };
  const loadedTarget = Number(glbWrapper.userData?.loadedTargetSize) || 1;
  const curW = Math.max(0.01, unitSize.x * loadedTarget);
  const curH = Math.max(0.01, unitSize.y * loadedTarget);
  const curD = Math.max(0.01, unitSize.z * loadedTarget);

  glbWrapper.scale.set(targetW / curW, targetH / curH, targetD / curD);
  glbWrapper.position.y = 0.025;
  glbWrapper.updateMatrixWorld(true);

  const rawSize = glbWrapper.userData?.rawSize || unitSize;
  return {
    sx: targetW / Math.max(0.01, rawSize.x),
    sy: targetH / Math.max(0.01, rawSize.y),
    sz: targetD / Math.max(0.01, rawSize.z)
  };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Shared geometry/material helpers to minimize GPU allocations
function makeMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.35,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: Boolean(opts.transparent),
    opacity: opts.opacity ?? 1
  });
}

function addBox(group, w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/**
 * Load & cache an external .glb / .gltf 3D model, normalized to targetSize with base at y = 0
 * @param {string} url
 * @param {number} [targetSize=1.2]
 * @returns {Promise<THREE.Group>}
 */
const LEGACY_BUILDING_GLB_ALIASES = {
  'assets/models/gedung_utama_kepsek_tu.glb': 'assets/models/gedung_utama_kepsek_tu_cutaway.glb',
  'assets/models/gedung_sekolah_3ruangan.glb': 'assets/models/gedung_sekolah_3ruangan_cutaway.glb',
  'assets/models/gedung_perhotelan_2lantai.glb': 'assets/models/gedung_perhotelan_2lantai_web.glb',
  'assets/models/gedung_perhotelan_2lantai_cutaway.glb': 'assets/models/gedung_perhotelan_2lantai_web.glb'
};

function normalizeGlbCacheKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:') || /^https?:\/\//i.test(raw)) {
    return raw;
  }
  const clean = raw.replace(/^\/+/, '').replace(/^\.\//, '');
  return LEGACY_BUILDING_GLB_ALIASES[clean] || clean;
}

/**
 * Lightweight O(1) box collision profile for non-enterable GLB props (trees, trash bins, faucets, hardware).
 */
export function buildLightweightBoxCollisionProfile(root) {
  root.updateMatrixWorld(true);
  const rootBox = new THREE.Box3().setFromObject(root);
  const rawSizeVec = new THREE.Vector3();
  rootBox.getSize(rawSizeVec);
  const rawSize = {
    x: Math.max(0.01, rawSizeVec.x),
    y: Math.max(0.01, rawSizeVec.y),
    z: Math.max(0.01, rawSizeVec.z)
  };
  const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
  return {
    rawSize,
    unitSize: {
      x: rawSize.x / maxDim,
      y: rawSize.y / maxDim,
      z: rawSize.z / maxDim
    },
    halfW: rawSize.x * 0.5,
    halfD: rawSize.z * 0.5,
    height: rawSize.y,
    cellSize: 1.25,
    wallCells: new Map(),
    floorCells: new Map(),
    roofCells: new Map(),
    wallTriCount: 0,
    floorTriCount: 0,
    isBoxProxy: true
  };
}

function resolveEmbeddedGlbBase64(url) {
  const map = getEmbeddedGlbMap();
  if (!map) return '';
  const raw = String(url || '').trim();
  if (!raw) return '';
  const canonical = normalizeGlbCacheKey(raw);
  const clean = raw.replace(/^\/+/, '').replace(/^\.\//, '');
  return map[raw] || map[clean] || map[canonical] || '';
}

function parseGlbArrayBuffer(buffer) {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(
      buffer,
      '',
      (gltf) => {
        const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!root) {
          reject(new Error('GLB does not contain a scene'));
          return;
        }
        resolve(root);
      },
      (err) => reject(err)
    );
  });
}

function extractRawPortsFromGlbRoot(root) {
  if (!root) return [];
  root.updateMatrixWorld(true);
  const ports = [];
  const seen = new Set();
  const wp = new THREE.Vector3();
  root.traverse((obj) => {
    const parsed = parseGlbPortNodeName(obj.name, obj.userData);
    if (!parsed || seen.has(parsed.name)) return;
    seen.add(parsed.name);
    obj.getWorldPosition(wp);
    const localPos = root.worldToLocal(wp.clone());
    ports.push({
      name: parsed.name,
      type: parsed.type,
      speed: parsed.speed,
      rawPos: { x: localPos.x, y: localPos.y, z: localPos.z }
    });
  });
  return ports;
}

const GLB_IDB_NAME = 'SmartSchoolNetMapGlbCacheV1';
const GLB_IDB_STORE = 'glb_binaries';
const GLB_ASSET_REVISIONS = {
  'assets/models/gedung_lab_pplg_web.glb': 'v2'
};
const glbIdbMemoryCache = new Map();

function resolveGlbIdbStorageKey(cacheKey) {
  const rev = GLB_ASSET_REVISIONS[cacheKey];
  return rev ? `${cacheKey}::${rev}` : cacheKey;
}

function resolveGlbHttpFetchUrl(cacheKey) {
  const rev = GLB_ASSET_REVISIONS[cacheKey];
  if (!rev || cacheKey.startsWith('data:') || cacheKey.startsWith('blob:') || cacheKey.includes('?')) {
    return cacheKey;
  }
  return `${cacheKey}?rev=${rev}`;
}
const glbIdbStats = {
  hits: 0,
  misses: 0,
  writes: 0
};
let _glbIdbOpenPromise = null;

function openGlbIndexedDb() {
  if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
  if (_glbIdbOpenPromise) return _glbIdbOpenPromise;
  _glbIdbOpenPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(GLB_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(GLB_IDB_STORE)) {
          db.createObjectStore(GLB_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return _glbIdbOpenPromise;
}

/**
 * Load a cached binary .GLB ArrayBuffer from persistent IndexedDB (or in-memory mirror).
 * @param {string} cacheKey
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function loadGlbArrayBufferFromIdb(cacheKey) {
  const key = normalizeGlbCacheKey(cacheKey);
  if (!key) return null;
  const storageKey = resolveGlbIdbStorageKey(key);
  if (glbIdbMemoryCache.has(storageKey)) {
    glbIdbStats.hits += 1;
    return glbIdbMemoryCache.get(storageKey);
  }
  const db = await openGlbIndexedDb();
  if (!db) {
    glbIdbStats.misses += 1;
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(GLB_IDB_STORE, 'readonly');
      const store = tx.objectStore(GLB_IDB_STORE);
      const req = store.get(storageKey);
      req.onsuccess = () => {
        const buf = req.result;
        if (buf instanceof ArrayBuffer && buf.byteLength > 0) {
          glbIdbMemoryCache.set(storageKey, buf);
          glbIdbStats.hits += 1;
          resolve(buf);
        } else {
          glbIdbStats.misses += 1;
          resolve(null);
        }
      };
      req.onerror = () => {
        glbIdbStats.misses += 1;
        resolve(null);
      };
    } catch {
      glbIdbStats.misses += 1;
      resolve(null);
    }
  });
}

/**
 * Persist a binary .GLB ArrayBuffer into IndexedDB and in-memory mirror for instant subsequent loads.
 * @param {string} cacheKey
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<boolean>}
 */
export async function cacheGlbArrayBufferInIdb(cacheKey, arrayBuffer) {
  const key = normalizeGlbCacheKey(cacheKey);
  if (!key || !(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) return false;
  const storageKey = resolveGlbIdbStorageKey(key);
  glbIdbMemoryCache.set(storageKey, arrayBuffer);
  glbIdbStats.writes += 1;
  const db = await openGlbIndexedDb();
  if (!db) return true;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(GLB_IDB_STORE, 'readwrite');
      const store = tx.objectStore(GLB_IDB_STORE);
      const req = store.put(arrayBuffer, storageKey);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Inspect IndexedDB binary GLB cache hit/miss/write telemetry.
 */
export function getGlbIndexedDbCacheStats() {
  return {
    hits: glbIdbStats.hits,
    misses: glbIdbStats.misses,
    writes: glbIdbStats.writes,
    memoryEntries: glbIdbMemoryCache.size
  };
}

/**
 * Load and normalize a custom .glb/.gltf model (cached by URL + persistent IndexedDB binary cache,
 * scaled to targetSize, centered on ground y=0).
 * On http(s), checks IndexedDB binary cache first, then streams binary .glb assets on demand;
 * on file:// or offline fallback, lazily loads the base64 GLB bundle once and caches its binary buffer.
 * Automatically evicts failed promises from glbCache so transient network errors can recover on retry.
 * @param {string} url
 * @param {number} [targetSize=1.2]
 * @returns {Promise<THREE.Group>}
 */
export function loadCustomGlbModel(url, targetSize = 1.2) {
  if (!url) return Promise.reject(new Error('Empty model URL'));

  const cacheKey = normalizeGlbCacheKey(url);
  if (!glbCache.has(cacheKey)) {
    const isInlineOrBlob = cacheKey.startsWith('data:') || cacheKey.startsWith('blob:');
    const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';

    const promise = (async () => {
      // 1. If already inline data/blob URL, parse directly
      if (isInlineOrBlob) {
        return new Promise((resolve, reject) => {
          gltfLoader.load(
            cacheKey,
            (gltf) => {
              const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
              if (!root) reject(new Error('GLB does not contain a scene'));
              else resolve(root);
            },
            undefined,
            (err) => reject(err)
          );
        });
      }

      // 1b. Persistent IndexedDB / Memory Binary ArrayBuffer Cache fast-path (Fase 3)
      const cachedIdbBuffer = await loadGlbArrayBufferFromIdb(cacheKey);
      if (cachedIdbBuffer) {
        try {
          return await parseGlbArrayBuffer(cachedIdbBuffer);
        } catch {
          glbIdbMemoryCache.delete(resolveGlbIdbStorageKey(cacheKey));
        }
      }

      // 2. Fast-path if embedded base64 map is already loaded (e.g., Node tests or file:// offline cache)
      const immediateB64 = resolveEmbeddedGlbBase64(url);
      if (immediateB64) {
        try {
          const buf = base64ToArrayBuffer(immediateB64);
          await cacheGlbArrayBufferInIdb(cacheKey, buf);
          return await parseGlbArrayBuffer(buf);
        } catch (err) {
          console.warn('[Map3DModels] Embedded GLB parse failed, falling back to fetch:', err);
        }
      }

      // 3. On file:// protocol, lazily load the offline base64 bundle script once on demand
      if (isFileProtocol) {
        await ensureOfflineGlbBundleLoaded();
        const loadedB64 = resolveEmbeddedGlbBase64(url);
        if (loadedB64) {
          const buf = base64ToArrayBuffer(loadedB64);
          await cacheGlbArrayBufferInIdb(cacheKey, buf);
          return await parseGlbArrayBuffer(buf);
        }
      }

      // 4. On http:// / https:// (mobile & desktop browser), stream compact binary .glb directly
      try {
        return await new Promise((resolve, reject) => {
          gltfLoader.load(
            resolveGlbHttpFetchUrl(cacheKey),
            (gltf) => {
              const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
              if (!root) reject(new Error('GLB does not contain a scene'));
              else resolve(root);
            },
            undefined,
            (err) => reject(err)
          );
        });
      } catch (networkErr) {
        // Offline / fallback recovery if binary fetch fails
        await ensureOfflineGlbBundleLoaded();
        const fallbackB64 = resolveEmbeddedGlbBase64(url);
        if (fallbackB64) {
          const buf = base64ToArrayBuffer(fallbackB64);
          await cacheGlbArrayBufferInIdb(cacheKey, buf);
          return await parseGlbArrayBuffer(buf);
        }
        throw networkErr;
      }
    })().catch((err) => {
      glbCache.delete(cacheKey);
      throw err;
    });
    glbCache.set(cacheKey, promise);
  }

  return glbCache.get(cacheKey).then((cachedRoot) => {
    const enterableBuilding = isEnterableBuildingGlbUrl(cacheKey);
    if (!cachedRoot.userData._interactiveDoorsExtracted) {
      cachedRoot.userData._interactiveDoorsExtracted = true;
      if (enterableBuilding) {
        extractInteractiveDoorsFromGlbRoot(cachedRoot);
      }
    }
    if (!glbCollisionCache.has(cacheKey)) {
      glbCollisionCache.set(
        cacheKey,
        enterableBuilding
          ? buildGlbCollisionProfile(cachedRoot)
          : buildLightweightBoxCollisionProfile(cachedRoot)
      );
    }
    const profile = glbCollisionCache.get(cacheKey);

    if (!cachedRoot.userData._rawBounds) {
      cachedRoot.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(cachedRoot);
      const rawSize = new THREE.Vector3();
      const rawCenter = new THREE.Vector3();
      rawBox.getSize(rawSize);
      rawBox.getCenter(rawCenter);
      cachedRoot.userData._rawBounds = {
        rawSize,
        rawCenter,
        minY: rawBox.min.y,
        zeroOrigin: cachedRoot.position.lengthSq() < 1e-10
      };
    }
    if (!cachedRoot.userData._rawPortsScanned) {
      cachedRoot.userData._rawPortsScanned = true;
      cachedRoot.userData._rawPorts = extractRawPortsFromGlbRoot(cachedRoot);
    }

    const clone = cachedRoot.clone(true);
    // Tag cloned meshes so scene clear/rebuild helpers never dispose cached shared GPU geometries/textures
    clone.traverse((node) => {
      node.userData.sharedGlbResource = true;
    });

    const rb = cachedRoot.userData._rawBounds;
    const size = rb.rawSize;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    clone.scale.setScalar(scale);

    let offsetX;
    let offsetY;
    let offsetZ;
    if (rb.zeroOrigin) {
      offsetX = -rb.rawCenter.x * scale;
      offsetY = -rb.minY * scale;
      offsetZ = -rb.rawCenter.z * scale;
      clone.position.set(offsetX, offsetY, offsetZ);
    } else {
      const scaledBox = new THREE.Box3().setFromObject(clone);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      offsetX = -scaledCenter.x;
      offsetY = -scaledBox.min.y;
      offsetZ = -scaledCenter.z;
      clone.position.x += offsetX;
      clone.position.z += offsetZ;
      clone.position.y += offsetY;
    }

    const wrapper = new THREE.Group();
    wrapper.userData.sharedGlbResource = true;
    wrapper.userData.loadedTargetSize = targetSize;
    wrapper.userData.rawSize = {
      x: Math.max(0.01, size.x),
      y: Math.max(0.01, size.y),
      z: Math.max(0.01, size.z)
    };
    wrapper.userData.unitSize = {
      x: wrapper.userData.rawSize.x / maxDim,
      y: wrapper.userData.rawSize.y / maxDim,
      z: wrapper.userData.rawSize.z / maxDim
    };
    wrapper.userData.collisionProfile = profile;
    wrapper.add(clone);

    const rawPorts = cachedRoot.userData._rawPorts || [];
    if (rawPorts.length > 0 && rb.zeroOrigin) {
      wrapper.userData.extractedPorts = rawPorts.map((rp) => ({
        name: rp.name,
        type: rp.type,
        speed: rp.speed,
        local3d: {
          x: Number((rp.rawPos.x * scale + offsetX).toFixed(4)),
          y: Number((rp.rawPos.y * scale + offsetY).toFixed(4)),
          z: Number((rp.rawPos.z * scale + offsetZ).toFixed(4))
        }
      }));
    } else if (rawPorts.length > 0) {
      wrapper.updateMatrixWorld(true);
      wrapper.userData.extractedPorts = extractPortsFromGlbWrapper(wrapper);
    } else {
      wrapper.userData.extractedPorts = [];
    }
    return wrapper;
  });
}

/**
 * Parse a GLB node name such as "PORT_ether1_rj45_1G" or "PORT_Gi0/1_rj45_1G"
 * @param {string} rawName
 * @param {Object} [userData]
 * @returns {{name: string, type: string, speed: string}|null}
 */
export function parseGlbPortNodeName(rawName = '', userData = {}) {
  if (userData && typeof userData.portName === 'string' && userData.portName.trim()) {
    return {
      name: userData.portName.trim(),
      type: (userData.portType || 'rj45').toLowerCase(),
      speed: userData.portSpeed || '1G'
    };
  }
  const sourceName = (userData && typeof userData.name === 'string' && userData.name.trim())
    ? userData.name.trim()
    : String(rawName).trim();
  const match = sourceName.match(/^(?:PORT|SOCKET)[_\-\s:]+(.+)$/i);
  if (!match) return null;

  const parts = match[1].split('_').filter(Boolean);
  let speed = '1G';
  let type = 'rj45';

  if (parts.length >= 2 && /^(?:\d+(?:\.\d+)?[MG])$/i.test(parts[parts.length - 1])) {
    speed = parts.pop().toUpperCase();
  }
  if (parts.length >= 2) {
    const cand = parts[parts.length - 1].toLowerCase();
    if (['rj45', 'sfp+', 'sfp', 'fiber', 'fo', 'coax', 'wireless', 'wlan'].includes(cand)) {
      parts.pop();
      type = cand === 'fo' ? 'fiber' : cand === 'wlan' ? 'wireless' : cand;
    }
  }
  let name = parts.join('_') || 'port1';
  // Restore slash if Three.js PropertyBinding.sanitizeNodeName stripped "/" from Gi0/1 -> Gi01
  if (/^(Gi|Fa|Te|Fo)(\d)(\d+)$/i.test(name)) {
    name = name.replace(/^(Gi|Fa|Te|Fo)(\d)(\d+)$/i, '$1$2/$3');
  }
  if (/sfp/i.test(name) && type === 'rj45') {
    type = 'sfp+';
    if (speed === '1G') speed = '10G';
  }
  return { name, type, speed };
}

/**
 * Synchronously extract all embedded PORT_* / SOCKET_* nodes from a normalized GLB wrapper group.
 * @param {THREE.Object3D} wrapper
 * @returns {Array<{name: string, type: string, speed: string, local3d: {x: number, y: number, z: number}}>}
 */
export function extractPortsFromGlbWrapper(wrapper) {
  if (!wrapper) return [];
  wrapper.updateMatrixWorld(true);

  const ports = [];
  const seen = new Set();

  wrapper.traverse((obj) => {
    const parsed = parseGlbPortNodeName(obj.name, obj.userData);
    if (!parsed || seen.has(parsed.name)) return;
    seen.add(parsed.name);

    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    const localPos = wrapper.worldToLocal(worldPos.clone());

    ports.push({
      name: parsed.name,
      type: parsed.type,
      speed: parsed.speed,
      local3d: {
        x: Number(localPos.x.toFixed(4)),
        y: Number(localPos.y.toFixed(4)),
        z: Number(localPos.z.toFixed(4))
      }
    });
  });

  return ports;
}

/**
 * Inspect a custom .glb/.gltf model and extract any embedded PORT_* / SOCKET_* nodes
 * along with the normalized 3D bounding box of the model.
 * @param {string} url
 * @param {number} [targetSize=1.3]
 * @returns {Promise<{ports: Array, bounds: {width: number, height: number, depth: number, frontZ: number, midY: number}}>}
 */
export async function extractGlbCustomPorts(url, targetSize = 1.3) {
  const wrapper = await loadCustomGlbModel(url, targetSize);
  wrapper.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrapper);
  const size = new THREE.Vector3();
  box.getSize(size);
  const bounds = {
    width: Number((size.x || 1).toFixed(3)),
    height: Number((size.y || 0.25).toFixed(3)),
    depth: Number((size.z || 0.7).toFixed(3)),
    frontZ: Number((box.max.z || 0.35).toFixed(3)),
    midY: Number(((box.min.y + box.max.y) * 0.5 || 0.12).toFixed(3))
  };

  const ports = Array.isArray(wrapper.userData?.extractedPorts)
    ? wrapper.userData.extractedPorts
    : extractPortsFromGlbWrapper(wrapper);

  return { ports, bounds };
}

// Shared GPU geometry & material pool for 3D port sockets & status LEDs
const _portsGeoMatPool = {
  glbSocketGeo: null,
  procSocketGeo: null,
  glbLedGeo: null,
  procLedGeo: null,
  glbHitGeo: null,
  glbHitMat: null,
  socketMats: new Map(),
  ledMats: new Map()
};

function _ensurePortsPool() {
  if (!_portsGeoMatPool.glbSocketGeo) {
    _portsGeoMatPool.glbSocketGeo = new THREE.BoxGeometry(0.018, 0.014, 0.020);
    _portsGeoMatPool.procSocketGeo = new THREE.BoxGeometry(0.052, 0.042, 0.032);
    _portsGeoMatPool.glbLedGeo = new THREE.SphereGeometry(0.0045, 6, 6);
    _portsGeoMatPool.procLedGeo = new THREE.SphereGeometry(0.014, 8, 8);
    _portsGeoMatPool.glbHitGeo = new THREE.BoxGeometry(0.028, 0.026, 0.036);
    _portsGeoMatPool.glbHitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
  }
  return _portsGeoMatPool;
}

function _getPooledSocketMat(hexColor) {
  const pool = _ensurePortsPool();
  if (!pool.socketMats.has(hexColor)) {
    pool.socketMats.set(hexColor, new THREE.MeshStandardMaterial({
      color: hexColor,
      roughness: 0.4,
      metalness: 0.45
    }));
  }
  return pool.socketMats.get(hexColor);
}

function _getPooledLedMat(hexColor) {
  const pool = _ensurePortsPool();
  if (!pool.ledMats.has(hexColor)) {
    pool.ledMats.set(hexColor, new THREE.MeshBasicMaterial({ color: hexColor }));
  }
  return pool.ledMats.get(hexColor);
}

/**
 * Create a 3D group of physical port sockets & status LEDs at their local3d coordinates.
 * When `isCustomGlb` is true, the .GLB model already has sculpted 3D port cavities and gold pins,
 * so we do NOT draw bulky procedural socket boxes over unconnected ports; we only render a compact,
 * flush RJ45/SFP connector boot + micro link LED inside connected ports.
 * Reuses pooled geometries and materials to drastically cut GPU buffer allocations & shader binds on mobile.
 * @param {Array} ports
 * @param {Map<string, {status: string, cableId: string}>} [portStatusMap]
 * @param {boolean} [isCustomGlb=false]
 * @returns {THREE.Group}
 */
export function create3DPortsSubGroup(ports = [], portStatusMap = new Map(), isCustomGlb = false) {
  const group = new THREE.Group();
  group.name = 'DevicePorts3DGroup';
  if (!Array.isArray(ports) || ports.length === 0) return group;

  const pool = _ensurePortsPool();
  const socketGeo = isCustomGlb ? pool.glbSocketGeo : pool.procSocketGeo;
  const ledGeo = isCustomGlb ? pool.glbLedGeo : pool.procLedGeo;

  ports.forEach((p) => {
    const lx = typeof p.local3d?.x === 'number' ? p.local3d.x : 0;
    const ly = typeof p.local3d?.y === 'number' ? p.local3d.y : 0.12;
    const lz = typeof p.local3d?.z === 'number' ? p.local3d.z : 0.36;
    const zSign = lz < 0 ? -1 : 1;

    const linkState = portStatusMap.get(p.name);
    const isConnected = Boolean(linkState);
    if (isCustomGlb && !isConnected) {
      // Keep sculpted .GLB port cavity visually clean while exposing an accurate raycast socket hitbox
      const hitSocket = new THREE.Mesh(pool.glbHitGeo, pool.glbHitMat);
      hitSocket.position.set(lx, ly, lz + 0.008 * zSign);
      hitSocket.userData.portName = p.name;
      hitSocket.userData.isPortSocket = true;
      hitSocket.userData.sharedPooledGeo = true;
      hitSocket.userData.sharedPooledMat = true;
      group.add(hitSocket);
      return;
    }

    const isSfpOrFiber = p.type === 'sfp+' || p.type === 'sfp' || p.type === 'fiber';

    const socketColor = isConnected
      ? (isSfpOrFiber ? 0x0284c7 : 0x1e293b)
      : (isSfpOrFiber ? 0x0f172a : 0x334155);
    const socketMat = _getPooledSocketMat(socketColor);
    const socketMesh = new THREE.Mesh(socketGeo, socketMat);
    socketMesh.position.set(lx, ly, lz);
    socketMesh.userData.portName = p.name;
    socketMesh.userData.isPortSocket = true;
    socketMesh.userData.sharedPooledGeo = true;
    socketMesh.userData.sharedPooledMat = true;
    group.add(socketMesh);

    let ledColor = 0x475569; // unplugged
    if (isConnected) {
      if (linkState.status === 'damaged' || linkState.status === 'inactive') {
        ledColor = 0xef4444;
      } else if (linkState.status === 'maintenance') {
        ledColor = 0xf59e0b;
      } else {
        ledColor = 0x22c55e;
      }
    }
    const ledMat = _getPooledLedMat(ledColor);
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    if (isCustomGlb) {
      ledMesh.position.set(lx, ly + 0.010, lz + zSign * 0.004);
    } else {
      ledMesh.position.set(lx, ly + 0.028, lz + zSign * 0.012);
    }
    ledMesh.userData.portName = p.name;
    ledMesh.userData.isPortSocket = true;
    ledMesh.userData.sharedPooledGeo = true;
    ledMesh.userData.sharedPooledMat = true;
    group.add(ledMesh);
  });

  return group;
}

/**
 * Build a procedural 3D hardware mesh tailored to the NetMap device type
 * Base sits at local y = 0.
 * @param {Object} device
 * @param {string} catColorHex
 * @param {string} statusColorHex
 * @returns {THREE.Group}
 */
export function createDevice3DMesh(device, catColorHex = '#2a5367', statusColorHex = '#22c55e') {
  const type = device.type || 'router';
  const group = new THREE.Group();
  const bodyDark = makeMat(0x1e293b, { metalness: 0.55, roughness: 0.38 });
  const bodySilver = makeMat(0xcbd5e1, { metalness: 0.7, roughness: 0.3 });
  const accentMat = makeMat(catColorHex, { metalness: 0.3, roughness: 0.4 });
  const ledMat = makeMat(statusColorHex, {
    emissive: statusColorHex,
    emissiveIntensity: 0.9,
    roughness: 0.2
  });
  const portMat = makeMat(0x0f172a, { roughness: 0.7, metalness: 0.2 });
  const sfpMat = makeMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.35 });

  // 1. Server / NVR / Storage / Database (Rackmount 2U/4U Box with Drive Bays)
  if (['server', 'nvr', 'storage', 'database'].includes(type)) {
    addBox(group, 1.0, 0.34, 1.3, 0, 0.17, 0, bodyDark);
    addBox(group, 1.06, 0.32, 0.04, 0, 0.17, 0.64, bodySilver); // Front bezel
    // Drive bays
    for (let i = -2; i <= 1; i++) {
      addBox(group, 0.18, 0.16, 0.05, i * 0.21 + 0.06, 0.17, 0.65, portMat);
    }
    // Status LED strip
    addBox(group, 0.1, 0.06, 0.05, 0.42, 0.24, 0.65, ledMat);
    addBox(group, 0.96, 0.03, 1.24, 0, 0.355, 0, accentMat);
    return group;
  }

  // 2. Network Rack 19" Cabinet (Transparent Glass Frame so stacked gear is visible inside!)
  if (['network-rack', 'patch-panel', 'odp', 'fo-terminal'].includes(type)) {
    if (type === 'network-rack') {
      const rackW = 1.25;
      const rackD = 1.25;
      const rackH = 2.4;
      const postMat = makeMat(0x0f172a, { metalness: 0.7, roughness: 0.35 });
      const glassMat = makeMat(0x38bdf8, { transparent: true, opacity: 0.14, roughness: 0.15 });
      // Base & Top cap
      addBox(group, rackW, 0.08, rackD, 0, 0.04, 0, postMat);
      addBox(group, rackW, 0.08, rackD, 0, rackH - 0.04, 0, postMat);
      // 4 Vertical Corner Posts
      const offX = rackW / 2 - 0.04;
      const offZ = rackD / 2 - 0.04;
      addBox(group, 0.07, rackH, 0.07, -offX, rackH / 2, -offZ, postMat);
      addBox(group, 0.07, rackH, 0.07, offX, rackH / 2, -offZ, postMat);
      addBox(group, 0.07, rackH, 0.07, -offX, rackH / 2, offZ, postMat);
      addBox(group, 0.07, rackH, 0.07, offX, rackH / 2, offZ, postMat);
      // Tinted translucent front/side panels
      addBox(group, rackW - 0.1, rackH - 0.16, 0.02, 0, rackH / 2, offZ, glassMat);
      addBox(group, 0.02, rackH - 0.16, rackD - 0.1, -offX, rackH / 2, 0, glassMat);
      addBox(group, 0.02, rackH - 0.16, rackD - 0.1, offX, rackH / 2, 0, glassMat);
      // Top LED bar
      addBox(group, 0.3, 0.04, 0.05, 0, rackH - 0.03, offZ + 0.02, ledMat);
    } else {
      // ODP / OTB / Patch Panel Wall Box
      addBox(group, 0.68, 0.85, 0.35, 0, 0.425, 0, bodySilver);
      addBox(group, 0.56, 0.72, 0.05, 0, 0.425, 0.17, accentMat);
      addBox(group, 0.1, 0.1, 0.05, 0.2, 0.7, 0.18, ledMat);
    }
    return group;
  }

  // 3. Access Points (Ceiling Dome / Square Reyee RAP / MikroTik cAP)
  if (['access-point', 'mikrotik-cap-ax', 'mikrotik-hap-ax2', 'ruijie-rap2260', 'ruijie-rap2200', 'ruijie-rap1200', 'ruijie-rap6260'].includes(type)) {
    const isSquare = type.startsWith('ruijie-rap');
    if (isSquare) {
      addBox(group, 0.64, 0.12, 0.64, 0, 0.06, 0, makeMat(0xf8fafc, { roughness: 0.3 }));
      addBox(group, 0.16, 0.04, 0.16, 0, 0.13, 0, ledMat);
    } else {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, 0.12, 24),
        makeMat(0xf8fafc, { roughness: 0.25, metalness: 0.1 })
      );
      disc.position.y = 0.06;
      disc.castShadow = true;
      group.add(disc);
      // Center status ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 8, 24), ledMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.125;
      group.add(ring);
    }
    return group;
  }

  // 4. Wireless PtP Dish / Sector Outdoor (LHG, SXT, EST, mANTBox, Bridge, Pole)
  if ([
    'wireless-bridge', 'network-pole',
    'mikrotik-lhg5', 'mikrotik-sxtsq', 'mikrotik-mantbox', 'ruijie-est350'
  ].includes(type)) {
    // Mounting pole section
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.9, 12),
      bodySilver
    );
    pole.position.y = 0.45;
    pole.castShadow = true;
    group.add(pole);

    if (type === 'mikrotik-lhg5') {
      // Parabolic dish reflector
      const dish = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.12, 0.18, 20),
        makeMat(0xe2e8f0, { metalness: 0.4, roughness: 0.35 })
      );
      dish.rotation.x = Math.PI / 2;
      dish.position.set(0, 0.72, 0.12);
      group.add(dish);
      addBox(group, 0.12, 0.12, 0.32, 0, 0.72, 0.32, ledMat);
    } else {
      // Directional sector / CPE panel
      addBox(group, 0.42, 0.65, 0.16, 0, 0.72, 0.1, makeMat(0xf8fafc, { roughness: 0.3 }));
      addBox(group, 0.36, 0.08, 0.04, 0, 0.92, 0.19, ledMat);
    }
    return group;
  }

  // 5. Switches & Hubs (CRS, NBS, ES, TP-Link JetStream & Desktop Hub)
  if ([
    'core-switch', 'dist-switch', 'managed-switch', 'poe-switch', 'unmanaged-switch',
    'mikrotik-crs317', 'mikrotik-crs326', 'mikrotik-crs328', 'mikrotik-crs310',
    'ruijie-s5750', 'ruijie-nbs5200', 'ruijie-nbs3100', 'ruijie-nbs3100-poe', 'ruijie-es218gc', 'ruijie-es209gc',
    'tplink-ls1005g', 'tplink-sg1008d', 'tplink-sg108e', 'tplink-sg108pe', 'tplink-sg1016d',
    'tplink-sg1024d', 'tplink-sg1218mp', 'tplink-sg2210mp', 'tplink-sg2428p', 'tplink-sg3428x', 'tplink-sx3016f'
  ].includes(type)) {
    const isSmallHub = ['tplink-ls1005g', 'tplink-sg1008d', 'tplink-sg108e', 'tplink-sg108pe'].includes(type);
    const w = isSmallHub ? 0.66 : 1.04;
    const d = isSmallHub ? 0.44 : 0.68;
    const h = isSmallHub ? 0.14 : 0.2;
    const chassisColor = type.startsWith('tplink-') ? 0x1e3a5f : 0x1e293b;
    addBox(group, w, h, d, 0, h / 2, 0, makeMat(chassisColor, { metalness: 0.55, roughness: 0.35 }));
    // Accent top stripe
    addBox(group, w - 0.04, 0.025, 0.06, 0, h + 0.01, d / 2 - 0.05, accentMat);
    // Front RJ45 port bank
    const portCount = isSmallHub ? 5 : 8;
    for (let i = 0; i < portCount; i++) {
      const px = -w / 2 + 0.1 + (i * (w - 0.32)) / Math.max(1, portCount - 1);
      addBox(group, 0.06, 0.06, 0.03, px, h * 0.45, d / 2 + 0.01, portMat);
    }
    // SFP+ Uplink ports on right
    if (!isSmallHub) {
      addBox(group, 0.07, 0.07, 0.03, w / 2 - 0.16, h * 0.45, d / 2 + 0.01, sfpMat);
      addBox(group, 0.07, 0.07, 0.03, w / 2 - 0.07, h * 0.45, d / 2 + 0.01, sfpMat);
    }
    addBox(group, 0.06, 0.04, 0.03, -w / 2 + 0.05, h * 0.72, d / 2 + 0.01, ledMat);
    return group;
  }

  // 6. Routers & Firewalls (CCR, RB, Ruijie EG/NBR, Core Router, Gateway)
  if ([
    'router', 'main-router', 'gateway', 'firewall',
    'mikrotik-ccr2116', 'mikrotik-ccr2004', 'mikrotik-rb5009', 'mikrotik-rb4011', 'mikrotik-l009', 'mikrotik-hex',
    'ruijie-eg210g', 'ruijie-eg310gh', 'ruijie-nbr6210'
  ].includes(type)) {
    const isCompact = ['mikrotik-hex', 'mikrotik-rb5009', 'gateway'].includes(type);
    const w = isCompact ? 0.68 : 1.02;
    const d = isCompact ? 0.5 : 0.68;
    const h = 0.22;
    const bodyColor = type.startsWith('mikrotik-') ? 0x18181b : (type === 'firewall' ? 0x7c2d12 : 0x0f172a);
    addBox(group, w, h, d, 0, h / 2, 0, makeMat(bodyColor, { metalness: 0.5, roughness: 0.35 }));
    // Metallic face plate + accent band
    addBox(group, w * 0.94, h * 0.65, 0.03, 0, h * 0.5, d / 2 + 0.01, bodySilver);
    addBox(group, w * 0.9, 0.03, d * 0.88, 0, h + 0.015, 0, accentMat);
    // Ports & Status LED
    for (let i = 0; i < 4; i++) {
      addBox(group, 0.07, 0.06, 0.03, -w * 0.25 + i * 0.13, h * 0.45, d / 2 + 0.02, portMat);
    }
    addBox(group, 0.08, 0.06, 0.03, w * 0.32, h * 0.45, d / 2 + 0.02, sfpMat);
    addBox(group, 0.07, 0.05, 0.03, -w * 0.38, h * 0.5, d / 2 + 0.02, ledMat);
    return group;
  }

  // 7. CCTV Camera
  if (type === 'cctv') {
    addBox(group, 0.16, 0.16, 0.32, 0, 0.16, 0, bodySilver);
    addBox(group, 0.32, 0.24, 0.44, 0, 0.26, 0.12, makeMat(0xf8fafc, { roughness: 0.3 }));
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16),
      portMat
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.26, 0.35);
    group.add(lens);
    addBox(group, 0.06, 0.06, 0.04, 0, 0.33, 0.35, ledMat);
    return group;
  }

  // 8. End Devices & Default Fallback (PC, Printer, IP Phone, IoT, Custom)
  addBox(group, 0.72, 0.08, 0.5, 0, 0.04, 0, bodyDark);
  addBox(group, 0.64, 0.44, 0.06, 0, 0.34, -0.08, bodyDark);
  addBox(group, 0.56, 0.36, 0.02, 0, 0.34, -0.04, sfpMat);
  addBox(group, 0.12, 0.12, 0.08, 0, 0.11, -0.08, bodySilver);
  addBox(group, 0.08, 0.04, 0.04, 0.26, 0.08, 0.23, ledMat);
  return group;
}

/**
 * Create a floating high-DPI CanvasTexture sprite badge for a 3D device
 * @param {Object} device
 * @param {number} elevationMeters
 * @returns {THREE.Sprite}
 */
export function create3DLabelSprite(device, elevationMeters = 0) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d') || null;
  if (!ctx) {
    const fallbackSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    fallbackSprite.scale.set(5.2, 1.5, 1);
    fallbackSprite.renderOrder = 20;
    fallbackSprite.userData = { isLabelSprite: true };
    fallbackSprite.raycast = () => { };
    return fallbackSprite;
  }

  const width = 512;
  const height = 148;
  canvas.width = width;
  canvas.height = height;

  const title = device.name || 'Device';
  const ipText = device.network?.ip ? `${device.network.ip} • ` : '';
  const subText = `${ipText}Z: ${Number(elevationMeters).toFixed(1)}m`;

  // Rounded dark translucent background pill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  roundRect(ctx, 8, 8, width - 16, height - 16, 20);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = device.status === 'online'
    ? '#22c55e'
    : device.status === 'warning'
      ? '#f59e0b'
      : device.status === 'offline'
        ? '#ef4444'
        : '#94a3b8';
  roundRect(ctx, 8, 8, width - 16, height - 16, 20);
  ctx.stroke();

  ctx.font = 'bold 34px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncateText(ctx, title, width - 48), width / 2, 54);

  ctx.font = '600 26px Consolas, monospace';
  ctx.fillStyle = '#537b8e';
  ctx.fillText(truncateText(ctx, subText, width - 48), width / 2, 102);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5.2, 1.5, 1);
  sprite.renderOrder = 20;
  sprite.userData = { isLabelSprite: true };
  sprite.raycast = () => { };
  return sprite;
}

export const BUILTIN_ROOM_BUILDING_PRESETS = [
  {
    id: 'gedung-kepsek-tu-cutaway',
    name: 'Gedung Kepsek & TU (Cutaway)',
    subtitle: 'Ruangan bersih tanpa dekorasi (28×15×5.9m)',
    widthMeters: 28,
    depthMeters: 15,
    heightMeters: 5.9,
    wallColor: '#3b82f6',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_utama_kepsek_tu_cutaway.glb'
  },
  {
    id: 'gedung-3ruangan-cutaway',
    name: 'Gedung 3 Ruangan (Cutaway)',
    subtitle: 'Ruangan bersih tanpa dekorasi (27.9×9.5×5.25m)',
    widthMeters: 27.9,
    depthMeters: 9.5,
    heightMeters: 5.25,
    wallColor: '#2a5367',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_sekolah_3ruangan_cutaway.glb'
  },
  {
    id: 'gedung-perhotelan-2lantai',
    name: 'Gedung Perhotelan 2 Lantai',
    subtitle: 'Gedung Perhotelan 2 lantai PBR 1K dengan 7 pintu interaktif & tangga (24.9×13.5×10.2m)',
    widthMeters: 24.85,
    depthMeters: 13.5,
    heightMeters: 10.18,
    wallColor: '#15803d',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_perhotelan_2lantai_web.glb'
  },
  {
    id: 'gedung-lab-pplg-2lantai-cutaway',
    name: 'Gedung Lab PPLG 2 Lantai (Cutaway)',
    subtitle: '2 lantai lab komputer atap transparan (20.1×10.2×9m)',
    widthMeters: 20.05,
    depthMeters: 10.2,
    heightMeters: 8.95,
    wallColor: '#ea580c',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_lab_pplg_2lantai_cutaway.glb'
  },
  {
    id: 'gedung-lab-pplg-2lantai',
    name: 'Gedung Lab PPLG 2 Lantai',
    subtitle: '2 lantai lab komputer atap penuh (20.1×10.2×9m)',
    widthMeters: 20.05,
    depthMeters: 10.2,
    heightMeters: 8.95,
    wallColor: '#c2410c',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_lab_pplg_2lantai.glb'
  },
  {
    id: 'gedung-lab-ulw-cutaway',
    name: 'Gedung Lab ULW / Workshop (Cutaway)',
    subtitle: 'Workshop ULW atap transparan (25.7×13.2×5.4m)',
    widthMeters: 25.7,
    depthMeters: 13.15,
    heightMeters: 5.35,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_lab_ulw_cutaway.glb'
  },
  {
    id: 'gedung-lab-ulw',
    name: 'Gedung Lab ULW / Workshop',
    subtitle: 'Workshop ULW atap penuh & pergola (25.7×13.2×5.4m)',
    widthMeters: 25.7,
    depthMeters: 13.15,
    heightMeters: 5.35,
    wallColor: '#0369a1',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_lab_ulw.glb'
  },
  {
    id: 'gedung-lab-pplg-web',
    name: 'Gedung Lab PPLG 2 Lantai (Web PBR)',
    subtitle: 'Gedung Lab PPLG 2 lantai PBR 1K dengan pintu interaktif (23.5×10.8×9.1m)',
    widthMeters: 23.5,
    depthMeters: 10.8,
    heightMeters: 9.05,
    wallColor: '#ea580c',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_lab_pplg_web.glb'
  },
  {
    id: 'gedung-lab-upw-web',
    name: 'Gedung Lab UPW (Web PBR)',
    subtitle: 'Gedung Lab UPW PBR 1K dengan pintu interaktif (27.5×11×5.7m)',
    widthMeters: 27.5,
    depthMeters: 11.02,
    heightMeters: 5.65,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_lab_upw_web.glb'
  },
  {
    id: 'gedung-kantin-cutaway',
    name: 'Gedung Kantin Sehat (Cutaway)',
    subtitle: 'Area kios & meja kantin transparan (22.3×11.4×6m)',
    widthMeters: 22.32,
    depthMeters: 11.41,
    heightMeters: 5.95,
    wallColor: '#059669',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_kantin_cutaway.glb'
  },
  {
    id: 'gedung-kantin',
    name: 'Gedung Kantin Sehat',
    subtitle: 'Kantin sekolah atap penuh (22.3×11.4×6m)',
    widthMeters: 22.32,
    depthMeters: 11.41,
    heightMeters: 5.95,
    wallColor: '#047857',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kantin.glb'
  },
  {
    id: 'sanggar-tari-cutaway',
    name: 'Sanggar Tari (Cutaway)',
    subtitle: 'Pendopo sanggar atap transparan (11.9×10.3×5.2m)',
    widthMeters: 11.9,
    depthMeters: 10.29,
    heightMeters: 5.15,
    wallColor: '#0891b2',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/sanggar_tari_cutaway.glb'
  },
  {
    id: 'sanggar-tari',
    name: 'Sanggar Tari',
    subtitle: 'Pendopo sanggar atap limasan penuh (11.9×10.3×5.2m)',
    widthMeters: 11.9,
    depthMeters: 10.29,
    heightMeters: 5.15,
    wallColor: '#0e7490',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/sanggar_tari.glb'
  },
  {
    id: 'parkiran-motor-cutaway',
    name: 'Parkiran Motor (Cutaway)',
    subtitle: 'Kanopi parkiran atap transparan (10.6×12.8×4.4m)',
    widthMeters: 10.6,
    depthMeters: 12.8,
    heightMeters: 4.35,
    wallColor: '#475569',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/parkiran_motor_cutaway.glb'
  },
  {
    id: 'parkiran-motor',
    name: 'Parkiran Motor',
    subtitle: 'Area parkiran motor atap kanopi penuh (10.6×12.8×4.4m)',
    widthMeters: 10.6,
    depthMeters: 12.8,
    heightMeters: 4.35,
    wallColor: '#334155',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/parkiran_motor.glb'
  },
  {
    id: 'pos-security-cutaway',
    name: 'Pos Security (Cutaway)',
    subtitle: 'Pos jaga gerbang atap transparan (4.3×4.3×3.2m)',
    widthMeters: 4.32,
    depthMeters: 4.32,
    heightMeters: 3.2,
    wallColor: '#65a30d',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/pos_security_cutaway.glb'
  },
  {
    id: 'pos-security',
    name: 'Pos Security',
    subtitle: 'Pos jaga gerbang atap dak penuh (4.3×4.3×3.2m)',
    widthMeters: 4.32,
    depthMeters: 4.32,
    heightMeters: 3.2,
    wallColor: '#4d7c0f',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pos_security.glb'
  },
  {
    id: 'mading-pusat-informasi',
    name: 'Mading Pusat Informasi',
    subtitle: 'Gazebo informasi & papan mading (4×3×4.4m)',
    widthMeters: 3.96,
    depthMeters: 3.04,
    heightMeters: 4.36,
    wallColor: '#1d4ed8',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/mading_pusat_informasi.glb'
  },
  {
    id: 'gedung-perpustakaan',
    name: 'Gedung Perpustakaan',
    subtitle: 'Full exterior + atap (25.7×9.4×5.6m)',
    widthMeters: 25.72,
    depthMeters: 9.42,
    heightMeters: 5.6,
    wallColor: '#0f766e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_perpustakaan.glb'
  },
  {
    id: 'gedung-perpustakaan-cutaway',
    name: 'Gedung Perpustakaan (Cutaway)',
    subtitle: 'Terbuka dari atas untuk penempatan rak & AP (25.7×9.4m)',
    widthMeters: 25.72,
    depthMeters: 9.42,
    heightMeters: 5.6,
    wallColor: '#0d9488',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_perpustakaan_cutaway.glb'
  },
  {
    id: 'gedung-kelas-pplg',
    name: 'Gedung Kelas PPLG',
    subtitle: 'Full exterior + atap (27.2×9.4×5.5m)',
    widthMeters: 27.22,
    depthMeters: 9.35,
    heightMeters: 5.45,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_pplg.glb'
  },
  {
    id: 'gedung-kelas-pplg-cutaway',
    name: 'Gedung Kelas PPLG (Cutaway)',
    subtitle: 'Terbuka dari atas untuk lihat posisi perangkat (27.2×9.4m)',
    widthMeters: 27.22,
    depthMeters: 9.35,
    heightMeters: 5.45,
    wallColor: '#38bdf8',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_kelas_pplg_cutaway.glb'
  },
  {
    id: 'gedung-kelas-perhotelan',
    name: 'Gedung Kelas Perhotelan',
    subtitle: 'Full exterior + atap (24.9×9.3×5.4m)',
    widthMeters: 24.86,
    depthMeters: 9.33,
    heightMeters: 5.4,
    wallColor: '#b45309',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_perhotelan.glb'
  },
  {
    id: 'gedung-kelas-perhotelan-cutaway',
    name: 'Gedung Kelas Perhotelan (Cutaway)',
    subtitle: 'Terbuka dari atas untuk lihat posisi perangkat (24.9×9.3m)',
    widthMeters: 24.86,
    depthMeters: 9.33,
    heightMeters: 5.4,
    wallColor: '#d97706',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_kelas_perhotelan_cutaway.glb'
  },
  {
    id: 'ruang-pramuka',
    name: 'Ruang Pramuka',
    subtitle: 'Full exterior + atap (6.5×7.9×3.9m)',
    widthMeters: 6.47,
    depthMeters: 7.91,
    heightMeters: 3.88,
    wallColor: '#78350f',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/ruang_pramuka.glb'
  },
  {
    id: 'ruang-pramuka-cutaway',
    name: 'Ruang Pramuka (Cutaway)',
    subtitle: 'Terbuka dari atas untuk interior ruangan (6.5×7.9m)',
    widthMeters: 6.47,
    depthMeters: 7.91,
    heightMeters: 3.88,
    wallColor: '#92400e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/ruang_pramuka_cutaway.glb'
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse Sekolah',
    subtitle: 'Rumah kaca tanaman & hidroponik (8×4.3×3.1m)',
    widthMeters: 8.0,
    depthMeters: 4.3,
    heightMeters: 3.1,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/greenhouse.glb'
  },
  {
    id: 'pendopo-kecil',
    name: 'Pendopo Kecil',
    subtitle: 'Gazebo kayu / saung istirahat taman (3.7×3.4×3.2m)',
    widthMeters: 3.66,
    depthMeters: 3.42,
    heightMeters: 3.22,
    wallColor: '#9a3412',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pendopo_kecil.glb'
  },
  {
    id: 'tandon-air',
    name: 'Menara Tandon Air',
    subtitle: 'Menara besi & tangki air oranye (2.2×2.2×6.4m)',
    widthMeters: 2.18,
    depthMeters: 2.18,
    heightMeters: 6.35,
    wallColor: '#ea580c',
    floorColor: '#334155',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/tandon_air.glb'
  },
  {
    id: 'halte-tempat-duduk',
    name: 'Halte Tempat Duduk',
    subtitle: 'Shelter tunggu & bangku kanopi (2.5×2×2.9m)',
    widthMeters: 2.48,
    depthMeters: 2.04,
    heightMeters: 2.85,
    wallColor: '#2563eb',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/halte_tempat_duduk.glb'
  },
  {
    id: 'penunjuk-arah',
    name: 'Tiang Penunjuk Arah',
    subtitle: 'Plang papan penunjuk arah area sekolah (1.2×0.7×2.1m)',
    widthMeters: 1.16,
    depthMeters: 0.73,
    heightMeters: 2.1,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/penunjuk_arah.glb'
  },
  {
    id: 'kandang-burung',
    name: 'Kandang Burung',
    subtitle: 'Aviari taman sekolah ukuran sedang (1.9×1.7×2.4m)',
    widthMeters: 1.88,
    depthMeters: 1.68,
    heightMeters: 2.38,
    wallColor: '#15803d',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/kandang_burung.glb'
  },
  {
    id: 'kandang-burung-2',
    name: 'Kandang Burung 2',
    subtitle: 'Aviari besar area taman sekolah (4.6×2.2×2.5m)',
    widthMeters: 4.57,
    depthMeters: 2.16,
    heightMeters: 2.54,
    wallColor: '#22c55e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/kandang_burung_2.glb'
  },
  {
    id: 'ruang-bk',
    name: 'Ruang BK',
    subtitle: 'Ruang Bimbingan Konseling utuh + atap (10.3×8.6×5m)',
    widthMeters: 10.26,
    depthMeters: 8.6,
    heightMeters: 5.02,
    wallColor: '#0f766e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/ruang_bk.glb'
  },
  {
    id: 'ruang-bk-cutaway',
    name: 'Ruang BK (Cutaway)',
    subtitle: 'Ruang BK terbuka dari atas untuk tata perangkat (10.3×8.6m)',
    widthMeters: 10.26,
    depthMeters: 8.6,
    heightMeters: 5.02,
    wallColor: '#14b8a6',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/ruang_bk_cutaway.glb'
  },
  {
    id: 'gedung-kelas-4-ruangan',
    name: 'Gedung Kelas 4 Ruangan',
    subtitle: 'Gedung 4 ruang kelas utuh + atap (31.9×9.6×5.6m)',
    widthMeters: 31.9,
    depthMeters: 9.55,
    heightMeters: 5.55,
    wallColor: '#15803d',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_4_ruangan.glb'
  },
  {
    id: 'gedung-kelas-4-ruangan-cutaway',
    name: 'Gedung Kelas 4 Ruangan (Cutaway)',
    subtitle: 'Gedung 4 kelas terbuka dari atas untuk lab/AP (31.9×9.6m)',
    widthMeters: 31.9,
    depthMeters: 9.55,
    heightMeters: 5.55,
    wallColor: '#22c55e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_kelas_4_ruangan_cutaway.glb'
  },
  {
    id: 'ruang-perakitan-1',
    name: 'Ruang Perakitan 1',
    subtitle: 'Bengkel & ruang perakitan 1 utuh (11.7×9.9×5.4m)',
    widthMeters: 11.7,
    depthMeters: 9.88,
    heightMeters: 5.39,
    wallColor: '#0369a1',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/ruang_perakitan_1.glb'
  },
  {
    id: 'ruang-perakitan-1-cutaway',
    name: 'Ruang Perakitan 1 (Cutaway)',
    subtitle: 'Ruang perakitan 1 terbuka dari atas (11.7×9.9m)',
    widthMeters: 11.7,
    depthMeters: 9.88,
    heightMeters: 5.39,
    wallColor: '#0ea5e9',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/ruang_perakitan_1_cutaway.glb'
  },
  {
    id: 'lab-perakitan-2',
    name: 'Lab Perakitan 2',
    subtitle: 'Lab perakitan 2 full exterior + atap (12.1×9.7×5.4m)',
    widthMeters: 12.06,
    depthMeters: 9.73,
    heightMeters: 5.43,
    wallColor: '#1d4ed8',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/lab_perakitan_2.glb'
  },
  {
    id: 'lab-perakitan-2-cutaway',
    name: 'Lab Perakitan 2 (Cutaway)',
    subtitle: 'Lab perakitan 2 terbuka dari atas (12.1×9.7m)',
    widthMeters: 12.06,
    depthMeters: 9.73,
    heightMeters: 5.43,
    wallColor: '#3b82f6',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/lab_perakitan_2_cutaway.glb'
  },
  {
    id: 'lab-kc',
    name: 'Lab KC',
    subtitle: 'Gedung Lab KC utuh + atap (23.1×9.1×5.6m)',
    widthMeters: 23.12,
    depthMeters: 9.1,
    heightMeters: 5.55,
    wallColor: '#7e22ce',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/lab_kc.glb'
  },
  {
    id: 'lab-kc-cutaway',
    name: 'Lab KC (Cutaway)',
    subtitle: 'Gedung Lab KC terbuka dari atas (23.1×9.1m)',
    widthMeters: 23.12,
    depthMeters: 9.1,
    heightMeters: 5.55,
    wallColor: '#a855f7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/lab_kc_cutaway.glb'
  },
  {
    id: 'gedung-kelas-belakang',
    name: 'Gedung Kelas Belakang',
    subtitle: 'Gedung kelas 2 lantai area belakang (19.3×9.5×9m)',
    widthMeters: 19.26,
    depthMeters: 9.49,
    heightMeters: 9.02,
    wallColor: '#166534',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_belakang.glb'
  },
  {
    id: 'gedung-kelas-belakang-cutaway',
    name: 'Gedung Kelas Belakang (Cutaway)',
    subtitle: 'Gedung kelas belakang terbuka dari atas (19.3×9.5m)',
    widthMeters: 19.26,
    depthMeters: 9.49,
    heightMeters: 9.02,
    wallColor: '#16a34a',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_kelas_belakang_cutaway.glb'
  },
  {
    id: 'gedung-lab-tata-busana',
    name: 'Gedung Lab Tata Busana',
    subtitle: 'Gedung praktik & lab tata busana (29.3×9.6×6m)',
    widthMeters: 29.32,
    depthMeters: 9.59,
    heightMeters: 5.99,
    wallColor: '#be185d',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_lab_tata_busana.glb'
  },
  {
    id: 'mushola',
    name: 'Mushola Sekolah',
    subtitle: 'Bangunan mushola kampus atap kubah/limasan (15.7×13.7×7.4m)',
    widthMeters: 15.66,
    depthMeters: 13.65,
    heightMeters: 7.42,
    wallColor: '#047857',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/mushola.glb'
  },
  {
    id: 'joglo-belakang',
    name: 'Joglo Belakang',
    subtitle: 'Pendopo joglo istirahat area belakang (5.1×4.5×4.5m)',
    widthMeters: 5.08,
    depthMeters: 4.48,
    heightMeters: 4.54,
    wallColor: '#92400e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/joglo_belakang.glb'
  },
  {
    id: 'halte-tempat-duduk-2',
    name: 'Halte Tempat Duduk 2',
    subtitle: 'Shelter tunggu & bangku panjang kanopi (3.4×2.1×2.6m)',
    widthMeters: 3.44,
    depthMeters: 2.1,
    heightMeters: 2.57,
    wallColor: '#2563eb',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/halte_tempat_duduk_2.glb'
  },
  {
    id: 'tong-sampah',
    name: 'Tong Sampah Pilah',
    subtitle: 'Set tempat sampah pilah sekolah (2.4×1×1.9m)',
    widthMeters: 2.36,
    depthMeters: 0.96,
    heightMeters: 1.91,
    wallColor: '#15803d',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/tong_sampah.glb'
  },
  {
    id: 'wastafel-semen-corak-kayu',
    name: 'Wastafel Semen Corak Kayu',
    subtitle: 'Wastafel cuci tangan taman sekolah (1.1×0.7×1.5m)',
    widthMeters: 1.08,
    depthMeters: 0.72,
    heightMeters: 1.48,
    wallColor: '#78350f',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/wastafel_semen_corak_kayu.glb'
  },
  {
    id: 'keran-air-kecil',
    name: 'Keran Air Kecil',
    subtitle: 'Tiang keran air taman ukuran kompak (0.4×0.3×0.8m)',
    widthMeters: 0.37,
    depthMeters: 0.3,
    heightMeters: 0.78,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/keran_air_kecil.glb'
  },
  {
    id: 'plank-motivasi',
    name: 'Plank Motivasi',
    subtitle: 'Papan slogan & plank motivasi taman (0.9×0.5×1.1m)',
    widthMeters: 0.94,
    depthMeters: 0.46,
    heightMeters: 1.07,
    wallColor: '#d97706',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/plank_motivasi.glb'
  },
  {
    id: 'banner-kejuruan',
    name: 'Banner Kejuruan',
    subtitle: 'Standing banner informasi jurusan (0.9×0.14×2.2m)',
    widthMeters: 0.86,
    depthMeters: 0.14,
    heightMeters: 2.15,
    wallColor: '#2563eb',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/banner_kejuruan.glb'
  },
  {
    id: 'pohon-mahoni-kecil',
    name: 'Pohon Mahoni Kecil',
    subtitle: 'Tanaman & pohon mahoni taman kampus (1.3×1.3×2.5m)',
    widthMeters: 1.33,
    depthMeters: 1.25,
    heightMeters: 2.47,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_mahoni_kecil.glb'
  },
  {
    id: 'pohon-pinus-kecil',
    name: 'Pohon Pinus Kecil',
    subtitle: 'Tanaman & pohon pinus taman kampus (0.9×0.9×2m)',
    widthMeters: 0.92,
    depthMeters: 0.88,
    heightMeters: 2.02,
    wallColor: '#15803d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_pinus_kecil.glb'
  },
  {
    id: 'gedung-kelas-2-ruangan',
    name: 'Gedung Kelas 2 Ruangan',
    subtitle: 'Gedung 2 ruang kelas utuh + atap (22×9.9×5.7m)',
    widthMeters: 22.0,
    depthMeters: 9.91,
    heightMeters: 5.68,
    wallColor: '#16a34a',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_2_ruangan.glb'
  },
  {
    id: 'gedung-kelas-2-ruangan-toilet',
    name: 'Gedung Kelas 2 Ruangan & Toilet',
    subtitle: 'Gedung 2 kelas dengan unit toilet utuh + atap (22×9.9×5.7m)',
    widthMeters: 22.0,
    depthMeters: 9.91,
    heightMeters: 5.68,
    wallColor: '#059669',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_2_ruangan_toilet.glb'
  },
  {
    id: 'gedung-pmr',
    name: 'Gedung PMR / UKS',
    subtitle: 'Gedung PMR & UKS sekolah utuh + atap (5.1×6.4×4.4m)',
    widthMeters: 5.14,
    depthMeters: 6.37,
    heightMeters: 4.4,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_pmr.glb'
  },
  {
    id: 'gedung-pmr-cutaway',
    name: 'Gedung PMR / UKS (Cutaway)',
    subtitle: 'Gedung PMR terbuka dari atas untuk tata perangkat (5.1×6.4m)',
    widthMeters: 5.14,
    depthMeters: 6.37,
    heightMeters: 4.4,
    wallColor: '#38bdf8',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: true,
    customModelUrl: 'assets/models/gedung_pmr_cutaway.glb'
  },
  {
    id: 'gedung-kelas-belakang-samsung',
    name: 'Gedung Kelas Belakang Samsung',
    subtitle: 'Gedung kelas lab Samsung area belakang (18×16.9×5.7m)',
    widthMeters: 17.96,
    depthMeters: 16.85,
    heightMeters: 5.7,
    wallColor: '#2563eb',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gedung_kelas_belakang_samsung.glb'
  },
  {
    id: 'pendopo-kolam-ikan',
    name: 'Pendopo Kolam Ikan',
    subtitle: 'Gazebo pendopo santai di atas kolam ikan (11.7×10.4×6m)',
    widthMeters: 11.66,
    depthMeters: 10.44,
    heightMeters: 6.03,
    wallColor: '#0284c7',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pendopo_kolam_ikan.glb'
  },
  {
    id: 'halte-tempat-duduk-saung',
    name: 'Halte Tempat Duduk Saung',
    subtitle: 'Shelter halte saung Ki Hajar Dewantara (5.2×3.8×3m)',
    widthMeters: 5.24,
    depthMeters: 3.82,
    heightMeters: 2.98,
    wallColor: '#92400e',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/halte_tempat_duduk_saung.glb'
  },
  {
    id: 'tempat-duduk-corak-kayu',
    name: 'Tempat Duduk Corak Kayu',
    subtitle: 'Bangku santai corak kayu taman (3.2×2.4×0.8m)',
    widthMeters: 3.2,
    depthMeters: 2.4,
    heightMeters: 0.78,
    wallColor: '#78350f',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/tempat_duduk_corak_kayu.glb'
  },
  {
    id: 'rak-bunga-lapangan',
    name: 'Rak Bunga Lapangan',
    subtitle: 'Rak display pot tanaman & baja ringan (2.5×1.2×2.5m)',
    widthMeters: 2.5,
    depthMeters: 1.15,
    heightMeters: 2.45,
    wallColor: '#475569',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/rak_bunga_lapangan.glb'
  },
  {
    id: 'wastafel-batang-kayu',
    name: 'Wastafel Batang Kayu',
    subtitle: 'Wastafel cuci tangan batang kayu alami (0.7×0.6×0.9m)',
    widthMeters: 0.66,
    depthMeters: 0.6,
    heightMeters: 0.85,
    wallColor: '#78350f',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/wastafel_batang_kayu.glb'
  },
  {
    id: 'pohon-cemara-pinus-besar',
    name: 'Pohon Cemara Pinus Besar',
    subtitle: 'Pohon cemara pinus tinggi peneduh kampus (4.5×4.6×8.7m)',
    widthMeters: 4.49,
    depthMeters: 4.55,
    heightMeters: 8.7,
    wallColor: '#15803d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_cemara_pinus_besar.glb'
  },
  {
    id: 'pohon-mangga-sedang',
    name: 'Pohon Mangga Sedang',
    subtitle: 'Pohon mangga rindang taman sekolah (3.6×3.7×5m)',
    widthMeters: 3.64,
    depthMeters: 3.7,
    heightMeters: 4.98,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_mangga_sedang.glb'
  },
  {
    id: 'pohon-palem-hiasan-sedang',
    name: 'Pohon Palem Hiasan Sedang',
    subtitle: 'Tanaman palem hiasan taman kampus (3.1×2.6×3.4m)',
    widthMeters: 3.11,
    depthMeters: 2.59,
    heightMeters: 3.43,
    wallColor: '#65a30d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_palem_hiasan_sedang.glb'
  },
  {
    id: 'pohon-rindang-besar',
    name: 'Pohon Rindang Besar',
    subtitle: 'Pohon pelindung rindang besar taman (8.3×7.7×8.9m)',
    widthMeters: 8.32,
    depthMeters: 7.7,
    heightMeters: 8.9,
    wallColor: '#14532d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_rindang_besar.glb'
  },
  {
    id: 'pohon-kaktus',
    name: 'Pohon Kaktus',
    subtitle: 'Tanaman kaktus hias taman sekolah (0.2×0.2×0.7m)',
    widthMeters: 0.15,
    depthMeters: 0.15,
    heightMeters: 0.68,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_kaktus.glb'
  },
  {
    id: 'bunga-keladi',
    name: 'Bunga Keladi',
    subtitle: 'Tanaman hias bunga keladi taman (0.6×0.6×0.5m)',
    widthMeters: 0.59,
    depthMeters: 0.59,
    heightMeters: 0.47,
    wallColor: '#22c55e',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/bunga_keladi.glb'
  },
  {
    id: 'bunga-pucuk-merah',
    name: 'Bunga Pucuk Merah',
    subtitle: 'Tanaman perdu pucuk merah taman (1.8×1.7×1.8m)',
    widthMeters: 1.75,
    depthMeters: 1.74,
    heightMeters: 1.75,
    wallColor: '#dc2626',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/bunga_pucuk_merah.glb'
  },
  {
    id: 'bunga-taman-merah',
    name: 'Bunga Taman Merah',
    subtitle: 'Rangkaian bunga taman merah (1.7×1.4×0.8m)',
    widthMeters: 1.73,
    depthMeters: 1.42,
    heightMeters: 0.81,
    wallColor: '#ef4444',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/bunga_taman_merah.glb'
  },
  {
    id: 'bunga-bonsai-taman',
    name: 'Bunga Bonsai Taman',
    subtitle: 'Tanaman hias bonsai taman sekolah (1.3×1×2m)',
    widthMeters: 1.31,
    depthMeters: 1.0,
    heightMeters: 1.96,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/bunga_bonsai_taman.glb'
  },
  {
    id: 'kaktus-karang-taman',
    name: 'Kaktus Karang Taman',
    subtitle: 'Ornamen kaktus karang batu taman (1.1×1.1×1.7m)',
    widthMeters: 1.13,
    depthMeters: 1.09,
    heightMeters: 1.74,
    wallColor: '#15803d',
    floorColor: '#475569',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/kaktus_karang_taman.glb'
  },
  {
    id: 'kandang-burung-samping-futsal',
    name: 'Kandang Burung Samping Futsal',
    subtitle: 'Fasilitas kandang burung area futsal (4.8×2.2×2.4m)',
    widthMeters: 4.84,
    depthMeters: 2.24,
    heightMeters: 2.41,
    wallColor: '#0284c7',
    floorColor: '#334155',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/kandang_burung_samping_futsal.glb'
  },
  {
    id: 'lapangan-futsal',
    name: 'Lapangan Futsal',
    subtitle: 'Lapangan olahraga futsal sekolah (26×16×0.1m)',
    widthMeters: 26.0,
    depthMeters: 16.0,
    heightMeters: 0.14,
    wallColor: '#16a34a',
    floorColor: '#15803d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/lapangan_futsal.glb'
  },
  {
    id: 'gawang-lapangan-futsal',
    name: 'Gawang Lapangan Futsal',
    subtitle: 'Tiang gawang jaring lapangan futsal (3.1×1×2m)',
    widthMeters: 3.07,
    depthMeters: 1.0,
    heightMeters: 2.0,
    wallColor: '#f8fafc',
    floorColor: '#475569',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/gawang_lapangan_futsal.glb'
  },
  {
    id: 'lorong-bunga-anggrek',
    name: 'Lorong Bunga Anggrek',
    subtitle: 'Pergola lorong hias bunga anggrek (1.5×4.4×2.4m)',
    widthMeters: 1.47,
    depthMeters: 4.44,
    heightMeters: 2.36,
    wallColor: '#a855f7',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/lorong_bunga_anggrek.glb'
  },
  {
    id: 'tong-sampah-krisbow-hijau',
    name: 'Tong Sampah Krisbow Hijau',
    subtitle: 'Tempat sampah Krisbow hijau kampus (0.6×0.7×1.1m)',
    widthMeters: 0.6,
    depthMeters: 0.71,
    heightMeters: 1.05,
    wallColor: '#16a34a',
    floorColor: '#334155',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/tong_sampah_krisbow_hijau.glb'
  },
  {
    id: 'tiang-pull-up-bar',
    name: 'Tiang Pull Up Bar',
    subtitle: 'Fasilitas tiang olahraga pull up bar (2.3×1.1×2.4m)',
    widthMeters: 2.28,
    depthMeters: 1.1,
    heightMeters: 2.38,
    wallColor: '#64748b',
    floorColor: '#334155',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/tiang_pull_up_bar.glb'
  },
  {
    id: 'lampu-taman',
    name: 'Lampu Taman',
    subtitle: 'Tiang lampu penerangan taman sekolah (0.3×0.3×1.6m)',
    widthMeters: 0.29,
    depthMeters: 0.29,
    heightMeters: 1.64,
    wallColor: '#f59e0b',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/lampu_taman.glb'
  },
  {
    id: 'plank-dasa-pesona',
    name: 'Plank Dasa Pesona',
    subtitle: 'Papan informasi Dasa Pesona sekolah (0.9×0.1×2.4m)',
    widthMeters: 0.92,
    depthMeters: 0.13,
    heightMeters: 2.4,
    wallColor: '#0ea5e9',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/plank_dasa_pesona.glb'
  },
  {
    id: 'plank-nilai-karakter',
    name: 'Plank Nilai Karakter',
    subtitle: 'Papan informasi Nilai Karakter siswa (0.9×0.1×2.4m)',
    widthMeters: 0.92,
    depthMeters: 0.13,
    heightMeters: 2.44,
    wallColor: '#10b981',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/plank_nilai_karakter.glb'
  },
  {
    id: 'plank-tjkt',
    name: 'Plank TJKT',
    subtitle: 'Papan informasi jurusan TJKT sekolah (0.9×0.1×2.2m)',
    widthMeters: 0.86,
    depthMeters: 0.14,
    heightMeters: 2.15,
    wallColor: '#2563eb',
    floorColor: '#1e293b',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/plank_tjkt.glb'
  },
  {
    id: 'pohon-pinang',
    name: 'Pohon Pinang',
    subtitle: 'Pohon pinang hias halaman sekolah (3.7×3.8×4.7m)',
    widthMeters: 3.66,
    depthMeters: 3.78,
    heightMeters: 4.7,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_pinang.glb'
  },
  {
    id: 'pohon-mahoni-super-besar',
    name: 'Pohon Mahoni Super Besar',
    subtitle: 'Pohon mahoni raksasa peneduh kampus (11.4×10.7×12.9m)',
    widthMeters: 11.42,
    depthMeters: 10.67,
    heightMeters: 12.94,
    wallColor: '#15803d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_mahoni_super_besar.glb'
  },
  {
    id: 'pohon-rindang-super-besar',
    name: 'Pohon Rindang Super Besar',
    subtitle: 'Pohon rindang raksasa pelindung area sekolah (9.9×10.1×11.3m)',
    widthMeters: 9.91,
    depthMeters: 10.05,
    heightMeters: 11.3,
    wallColor: '#14532d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_rindang_super_besar.glb'
  },
  {
    id: 'pohon-pinus-ekstra-besar',
    name: 'Pohon Pinus Ekstra Besar',
    subtitle: 'Pohon pinus tinggi ekstra besar kampus (5×5.1×10.7m)',
    widthMeters: 4.97,
    depthMeters: 5.06,
    heightMeters: 10.73,
    wallColor: '#166534',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    customModelUrl: 'assets/models/pohon_pinus_ekstra_besar.glb'
  },
  {
    id: 'pohon-trembesi-sulur',
    name: 'Pohon Trembesi Sulur',
    subtitle: 'Pohon trembesi besar bersulur rimbun (15.3×15×11.7m)',
    widthMeters: 15.33,
    depthMeters: 15.01,
    heightMeters: 11.73,
    wallColor: '#15803d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_trembesi_sulur_instanced.glb'
  },
  {
    id: 'pohon-ketapang-kencana',
    name: 'Pohon Ketapang Kencana',
    subtitle: 'Pohon ketapang kencana bertingkat rimbun (8.4×8.3×7.6m)',
    widthMeters: 8.42,
    depthMeters: 8.25,
    heightMeters: 7.6,
    wallColor: '#16a34a',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_ketapang_kencana_instanced.glb'
  },
  {
    id: 'lorong-bunga-anggrek-web',
    name: 'Lorong Bunga Anggrek (Web PBR)',
    subtitle: 'Pergola lorong hias bunga anggrek PBR 1K (1.8×3.9×2.4m)',
    widthMeters: 1.76,
    depthMeters: 3.86,
    heightMeters: 2.36,
    wallColor: '#a855f7',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/lorong_bunga_anggrek_web.glb'
  },
  {
    id: 'pohon-mahoni-rindang',
    name: 'Pohon Mahoni Rindang',
    subtitle: 'Pohon mahoni besar rindang peneduh kampus (15.9×15.7×13.2m)',
    widthMeters: 15.87,
    depthMeters: 15.66,
    heightMeters: 13.23,
    wallColor: '#15803d',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_mahoni_rindang_instanced.glb'
  },
  {
    id: 'pohon-cemara-rindang',
    name: 'Pohon Cemara Rindang',
    subtitle: 'Pohon cemara tinggi rindang peneduh kampus (10.3×7.6×13.7m)',
    widthMeters: 10.33,
    depthMeters: 7.6,
    heightMeters: 13.68,
    wallColor: '#166534',
    floorColor: '#14532d',
    opacity: 0.18,
    isCutaway: false,
    passThrough: true,
    customModelUrl: 'assets/models/pohon_cemara_rindang_instanced.glb'
  },
  {
    id: 'batu-kolam-hiasan',
    name: 'Batu Kolam Hiasan',
    subtitle: 'Taman batu alam dan kolam hias dekoratif kampus (5.5×5.5×2.4m)',
    widthMeters: 5.52,
    depthMeters: 5.52,
    heightMeters: 2.44,
    wallColor: '#64748b',
    floorColor: '#0284c7',
    opacity: 0.18,
    isCutaway: false,
    passThrough: false,
    customModelUrl: 'assets/models/batu_kolam_hiasan.glb'
  }
];

export function getDefaultRoomPassThrough(room) {
  if (!room || typeof room !== 'object') return false;
  if (typeof room.passThrough === 'boolean') return room.passThrough;
  const ident = `${room.presetId || ''} ${room.customModelUrl || ''} ${room.name || ''}`;
  if (/wastafel|keran/i.test(ident)) return false;
  if (/pohon.*(kecil|palem|kaktus)|bunga|lorong[-_ ]bunga|semak|rumput|bush|shrub/i.test(ident)) return true;
  return false;
}

export function getDefaultObject3dPassThrough(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.passThrough === 'boolean') return obj.passThrough;
  const ident = `${obj.preset || ''} ${obj.name || ''} ${obj.label || ''}`;
  if (/wastafel|keran/i.test(ident)) return false;
  if (/pohon.*(kecil|palem)|semak|rumput|bush|shrub/i.test(ident)) return true;
  return false;
}

export function createBuildingRoomPresetData(presetOrId, { x = 0.5, y = 0.5, elevationMeters = 0, existingRooms = [], id = '' } = {}) {
  const preset = typeof presetOrId === 'string'
    ? BUILTIN_ROOM_BUILDING_PRESETS.find((b) => b.id === presetOrId)
    : presetOrId;
  if (!preset) return null;
  const list = Array.isArray(existingRooms) ? existingRooms : [];
  const countSame = list.filter((r) => r?.customModelUrl === preset.customModelUrl).length;
  return {
    id: id || `room3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: countSame > 0 ? `${preset.name} #${countSame + 1}` : preset.name,
    presetId: preset.id,
    x,
    y,
    elevationMeters: Math.max(0, Number(elevationMeters) || 0),
    widthMeters: preset.widthMeters,
    depthMeters: preset.depthMeters,
    heightMeters: preset.heightMeters,
    baseWidthMeters: preset.widthMeters,
    baseDepthMeters: preset.depthMeters,
    baseHeightMeters: preset.heightMeters,
    modelScale: 1,
    lockAspectRatio: true,
    rotationY: 0,
    wallColor: preset.wallColor || '#2a5367',
    floorColor: preset.floorColor || '#1e293b',
    opacity: preset.opacity ?? 0.18,
    passThrough: typeof preset.passThrough === 'boolean'
      ? preset.passThrough
      : getDefaultRoomPassThrough(preset),
    customModelUrl: preset.customModelUrl
  };
}

/**
 * Find the paired cutaway / full-roof preset for a building room, presetId, or GLB URL.
 * Automatically matches `foo.glb` <-> `foo_cutaway.glb` across BUILTIN_ROOM_BUILDING_PRESETS.
 * @param {Object|string} roomOrPresetOrUrl
 * @returns {{ currentPreset: Object|null, pairPreset: Object, isCurrentlyCutaway: boolean }|null}
 */
export function findCutawayPairPreset(roomOrPresetOrUrl) {
  if (!roomOrPresetOrUrl) return null;
  const rawUrl = typeof roomOrPresetOrUrl === 'string'
    ? roomOrPresetOrUrl
    : (roomOrPresetOrUrl.customModelUrl || '');
  const rawId = typeof roomOrPresetOrUrl === 'string'
    ? roomOrPresetOrUrl
    : (roomOrPresetOrUrl.presetId || '');

  const currentPreset = BUILTIN_ROOM_BUILDING_PRESETS.find((b) =>
    (rawUrl && b.customModelUrl === rawUrl) || (rawId && b.id === rawId)
  ) || null;

  const probeUrl = currentPreset?.customModelUrl || rawUrl;
  if (!probeUrl) return null;

  const normalizedUrl = String(probeUrl).trim();
  const isCurrentlyCutaway = Boolean(currentPreset?.isCutaway) || /_cutaway\.glb$/i.test(normalizedUrl);
  const baseUrl = normalizedUrl.replace(/_cutaway(\.glb)$/i, '$1');
  const targetUrl = isCurrentlyCutaway
    ? baseUrl
    : baseUrl.replace(/(\.glb)$/i, '_cutaway$1');

  const pairPreset = BUILTIN_ROOM_BUILDING_PRESETS.find((b) =>
    b.customModelUrl === targetUrl && b !== currentPreset
  ) || null;

  if (!pairPreset) return null;
  return {
    currentPreset,
    pairPreset,
    isCurrentlyCutaway
  };
}

/**
 * Create a floating, raycast-clickable 3D Building Signboard (High-DPI 512x160 Canvas Sprite + Pin Stem).
 * Displays Building Name, optional roomCode, device count status dot, active VLAN pills, and alert badge.
 * @param {Object} room
 * @param {Object} summary - Output of buildBuildingDocumentationSummary()
 * @param {Object} [options]
 * @param {boolean} [options.isDark=false]
 * @param {Function} [options.normToWorldFn]
 * @param {boolean} [options.isInspected=false]
 * @returns {THREE.Group}
 */
export function createBuildingSignboard3DGroup(room, summary = null, {
  isDark = false,
  normToWorldFn = null,
  isInspected = false
} = {}) {
  const group = new THREE.Group();
  const wPos = normToWorldFn ? normToWorldFn(room?.x ?? 0.5, room?.y ?? 0.5) : { x: 0, z: 0 };
  const elevY = Math.max(0, Number(room?.elevationMeters) || 0);
  const roofY = elevY + Math.max(2.6, Number(room?.heightMeters) || 4.5);
  const pinHeight = 2.6;

  group.position.set(wPos.x, roofY, wPos.z);
  group.name = `BuildingSignboard_${room?.id || 'room'}`;
  group.userData = {
    isBuildingSignboard: true,
    isLabelSprite: true,
    signboardRoomId: room?.id || ''
  };

  const statusCounts = summary?.statusCounts || { online: 0, warning: 0, offline: 0, total: 0 };
  const vlans = Array.isArray(summary?.networkSummary?.vlans) ? summary.networkSummary.vlans : [];
  const doc = summary?.doc || room?.doc || {};
  const hasOffline = statusCounts.offline > 0;
  const hasWarning = statusCounts.warning > 0;
  const accentColor = hasOffline
    ? '#ef4444'
    : (hasWarning ? '#f59e0b' : (isInspected ? '#2563eb' : (isDark ? '#537b8e' : '#2a5367')));

  // Vertical pin stem connecting roof to floating signboard
  const stemGeo = new THREE.CylinderGeometry(0.055, 0.055, pinHeight, 6);
  const stemMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.72
  });
  const stemMesh = new THREE.Mesh(stemGeo, stemMat);
  stemMesh.position.y = pinHeight * 0.5;
  stemMesh.userData = {
    isBuildingSignboard: true,
    signboardRoomId: room?.id || ''
  };
  group.add(stemMesh);

  // Small anchor dot on roof
  const capGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const capMat = new THREE.MeshBasicMaterial({ color: accentColor });
  const capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.position.y = 0.08;
  capMesh.userData = {
    isBuildingSignboard: true,
    signboardRoomId: room?.id || ''
  };
  group.add(capMesh);

  const width = 512;
  const height = 160;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d') || null;
  let spriteMat;

  if (ctx) {
    canvas.width = width;
    canvas.height = height;

    // Pill background (Botanical Cream / Forest Dark)
    ctx.fillStyle = isDark ? 'rgba(13, 27, 15, 0.93)' : 'rgba(255, 252, 238, 0.95)';
    roundRect(ctx, 8, 8, width - 16, height - 16, 22);
    ctx.fill();

    // Accent border
    ctx.lineWidth = isInspected ? 6 : 4;
    ctx.strokeStyle = accentColor;
    roundRect(ctx, 8, 8, width - 16, height - 16, 22);
    ctx.stroke();

    // Top row: Building Name + optional roomCode pill
    const roomTitle = String(room?.name || 'Gedung 3D');
    const codeText = String(doc.roomCode || '').trim();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Building badge marker circle
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(36, 54, 10, 0, Math.PI * 2);
    ctx.fill();

    const maxTitleWidth = codeText ? (width - 190) : (width - 78);
    ctx.font = '700 32px Poppins, system-ui, sans-serif';
    ctx.fillStyle = isDark ? '#f4f9ee' : '#1b2b18';
    ctx.fillText(truncateText(ctx, roomTitle, maxTitleWidth), 58, 54);

    if (codeText) {
      ctx.font = '700 20px Consolas, monospace';
      const codeLabel = truncateText(ctx, codeText, 118);
      const codeW = Math.min(126, ctx.measureText(codeLabel).width + 20);
      const codeX = width - 24 - codeW;
      ctx.fillStyle = isDark ? 'rgba(83, 123, 142, 0.22)' : 'rgba(42, 83, 103, 0.14)';
      roundRect(ctx, codeX, 36, codeW, 34, 10);
      ctx.fill();
      ctx.fillStyle = isDark ? '#a7e38c' : '#1f6410';
      ctx.textAlign = 'center';
      ctx.fillText(codeLabel, codeX + codeW * 0.5, 54);
    }

    // Divider line
    ctx.strokeStyle = isDark ? 'rgba(148, 185, 134, 0.22)' : 'rgba(142, 116, 72, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 86);
    ctx.lineTo(width - 24, 86);
    ctx.stroke();

    // Bottom row: device count + VLAN chips + alert badge
    ctx.textAlign = 'left';
    let cursorX = 28;
    const rowY = 118;

    // Status dot + unit count
    const dotColor = statusCounts.total === 0
      ? '#94a3b8'
      : (hasOffline ? '#ef4444' : (hasWarning ? '#f59e0b' : '#22c55e'));
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(cursorX + 8, rowY, 7, 0, Math.PI * 2);
    ctx.fill();
    cursorX += 24;

    ctx.font = '700 23px Poppins, system-ui, sans-serif';
    ctx.fillStyle = isDark ? '#dcfce7' : '#263823';
    const unitLabel = `${statusCounts.total} Unit`;
    ctx.fillText(unitLabel, cursorX, rowY);
    cursorX += ctx.measureText(unitLabel).width + 16;

    // VLAN chip
    if (vlans.length > 0) {
      const vlanText = `VLAN ${vlans.slice(0, 3).join(', ')}${vlans.length > 3 ? '+' : ''}`;
      ctx.font = '600 20px Consolas, monospace';
      const vW = Math.min(200, ctx.measureText(vlanText).width + 20);
      ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(37, 99, 235, 0.12)';
      roundRect(ctx, cursorX, rowY - 16, vW, 32, 9);
      ctx.fill();
      ctx.fillStyle = isDark ? '#7dd3fc' : '#1d4ed8';
      ctx.fillText(truncateText(ctx, vlanText, vW - 16), cursorX + 10, rowY);
      cursorX += vW + 10;
    } else if (doc.zone) {
      ctx.font = '600 20px Poppins, system-ui, sans-serif';
      ctx.fillStyle = isDark ? '#9fb598' : '#5e6b57';
      ctx.fillText(truncateText(ctx, doc.zone, width - cursorX - 28), cursorX, rowY);
    }

    // Alert badge on bottom-right if any device offline/warning
    if (hasOffline || hasWarning) {
      const alertText = hasOffline ? `${statusCounts.offline} OFF` : `${statusCounts.warning} WARN`;
      ctx.font = '700 19px Consolas, monospace';
      const aW = ctx.measureText(alertText).width + 24;
      const aX = width - 24 - aW;
      ctx.fillStyle = hasOffline ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.22)';
      roundRect(ctx, aX, rowY - 16, aW, 32, 9);
      ctx.fill();
      ctx.fillStyle = hasOffline ? '#dc2626' : '#d97706';
      ctx.textAlign = 'center';
      ctx.fillText(alertText, aX + aW * 0.5, rowY);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });
  } else {
    spriteMat = new THREE.SpriteMaterial({
      color: accentColor,
      transparent: true,
      depthWrite: false
    });
  }

  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, pinHeight + 1.15, 0);
  const baseScaleW = Math.min(11.5, Math.max(6.8, (Number(room?.widthMeters) || 12) * 0.42));
  const baseScaleH = baseScaleW * (height / width);
  sprite.scale.set(baseScaleW, baseScaleH, 1);
  sprite.renderOrder = 22;
  sprite.userData = {
    isBuildingSignboard: true,
    isLabelSprite: true,
    signboardRoomId: room?.id || '',
    baseScaleW,
    baseScaleH
  };
  group.add(sprite);
  group.userData.sprite = sprite;

  return group;
}

/**
 * Create a customizable 3D Room / Building zone mesh with optional selection gizmos (Move, Resize, Height, Rotate)
 * @param {Object} room
 * @param {Function} normToWorldFn - (normX, normY) => { x, z }
 * @param {boolean} [isSelected=false]
 * @returns {THREE.Group}
 */
export function create3DRoomGroup(room, normToWorldFn, isSelected = false) {
  const group = new THREE.Group();
  const pos = normToWorldFn ? normToWorldFn(room.x ?? 0.5, room.y ?? 0.5) : { x: 0, z: 0 };
  const elevY = Math.max(0, Number(room.elevationMeters) || 0);
  group.position.set(pos.x, elevY, pos.z);
  group.userData.elevationMeters = elevY;
  const rotX = ((Number(room.rotationX) || 0) * Math.PI) / 180;
  const rotY = ((Number(room.rotationY ?? room.rotationDeg) || 0) * Math.PI) / 180;
  const rotZ = ((Number(room.rotationZ) || 0) * Math.PI) / 180;
  group.rotation.set(rotX, rotY, rotZ, 'YXZ');

  const { minW, minD, minH } = getRoomMinDimensions(room);
  const w = Math.max(minW, Number(room.widthMeters) || 14);
  const d = Math.max(minD, Number(room.depthMeters) || 12);
  const h = Math.max(minH, Number(room.heightMeters) || 3.5);
  const wallColor = room.wallColor || '#2a5367';
  const floorColor = room.floorColor || '#1e293b';
  const opacity = typeof room.opacity === 'number' ? room.opacity : 0.22;
  const hasCustomGlb = Boolean(room.customModelUrl);
  const wallBoxGeo = new THREE.BoxGeometry(w, h, d);

  if (!hasCustomGlb) {
    // Procedural floor pad
    const floorGeo = new THREE.BoxGeometry(w, 0.08, d);
    const floorMat = new THREE.MeshStandardMaterial({
      color: floorColor,
      roughness: 0.7,
      metalness: 0.1,
      transparent: true,
      opacity: Math.min(0.85, opacity + 0.35)
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0.04;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Translucent 4 walls enclosure box (without blocking interior view)
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      transparent: true,
      opacity: isSelected ? Math.min(0.45, opacity + 0.08) : opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.25
    });
    const wallBox = new THREE.Mesh(wallBoxGeo, wallMat);
    wallBox.position.y = h / 2;
    group.add(wallBox);
  }

  // Crisp wireframe outline (permanent for procedural room, placeholder/selection outline for .GLB building)
  if (!hasCustomGlb || isSelected) {
    const edges = new THREE.EdgesGeometry(wallBoxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0xfacc15 : wallColor,
      transparent: true,
      opacity: isSelected ? 0.98 : 0.85
    });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.y = h / 2;
    group.add(wireframe);
  } else {
    // Lightweight temporary wireframe removed automatically once the .GLB finishes loading
    const edges = new THREE.EdgesGeometry(wallBoxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: wallColor,
      transparent: true,
      opacity: 0.35
    });
    const placeholderWire = new THREE.LineSegments(edges, lineMat);
    placeholderWire.position.y = h / 2;
    group.userData.placeholderWireframe = placeholderWire;
    group.add(placeholderWire);
  }

  // Floating Room Label above roof
  const labelSprite = create3DLabelSprite(
    {
      name: room.name || 'Ruangan 3D',
      network: { ip: `${w.toFixed(1)}×${d.toFixed(1)}m` },
      status: 'online'
    },
    h
  );
  labelSprite.position.set(0, h + 1.4, 0);
  labelSprite.scale.set(6.4, 1.85, 1);
  group.add(labelSprite);

  // Tag all base geometry descendants before attaching interactive handles
  group.traverse((child) => {
    child.userData.roomId = room.id;
  });
  group.userData.roomId = room.id;

  if (isSelected) {
    const handleScale = Math.max(1.0, Math.min(2.2, Math.hypot(w, d) * 0.045));

    // 1. Orange Center Move Pad (drag anywhere in Orbit mode to relocate room cleanly)
    const moveMat = makeMat(0xf97316, {
      emissive: 0xea580c,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    const roofMovePad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65 * handleScale, 0.72 * handleScale, 0.18 * handleScale, 8),
      moveMat
    );
    roofMovePad.position.set(0, h + 0.25, 0);
    roofMovePad.userData.roomId = room.id;
    roofMovePad.userData.gizmoType = 'room-move';
    group.add(roofMovePad);

    const floorMovePad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55 * handleScale, 0.6 * handleScale, 0.14 * handleScale, 8),
      moveMat
    );
    floorMovePad.position.set(0, 0.14, 0);
    floorMovePad.userData.roomId = room.id;
    floorMovePad.userData.gizmoType = 'room-move';
    group.add(floorMovePad);

    // 2. Blue Top Push/Pull Height Handle
    const pushGroup = new THREE.Group();
    pushGroup.position.set(Math.min(w * 0.3, 2.2), h + 0.35, 0);
    const pushMat = makeMat(0x38bdf8, {
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.2
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32 * handleScale, 0.52 * handleScale, 14), pushMat);
    cone.position.y = 0.22 * handleScale;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * handleScale, 0.42 * handleScale, 0.14 * handleScale, 20), pushMat);
    disc.position.y = -0.1 * handleScale;
    [cone, disc].forEach((m) => {
      m.userData.roomId = room.id;
      m.userData.gizmoType = 'room-pushpull';
      pushGroup.add(m);
    });
    group.add(pushGroup);

    // 2b. Emerald Z-Elevation Handle (drag up/down to lift building/facility/prop onto roofs or floors)
    const elevGroup = new THREE.Group();
    elevGroup.position.set(-Math.min(w * 0.3, 2.2), h + 0.35, 0);
    const elevMat = makeMat(0x10b981, {
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    const elevUpCone = new THREE.Mesh(new THREE.ConeGeometry(0.28 * handleScale, 0.42 * handleScale, 14), elevMat);
    elevUpCone.position.y = 0.26 * handleScale;
    const elevShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * handleScale, 0.11 * handleScale, 0.36 * handleScale, 10), elevMat);
    const elevDownCone = new THREE.Mesh(new THREE.ConeGeometry(0.28 * handleScale, 0.42 * handleScale, 14), elevMat);
    elevDownCone.rotation.x = Math.PI;
    elevDownCone.position.y = -0.26 * handleScale;
    [elevUpCone, elevShaft, elevDownCone].forEach((m) => {
      m.userData.roomId = room.id;
      m.userData.gizmoType = 'room-elevate';
      elevGroup.add(m);
    });
    group.add(elevGroup);

    // 3. Yellow Corner Scale Handle (drag to resize Width x Depth)
    const cornerHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 * handleScale, 0.55 * handleScale, 0.55 * handleScale),
      makeMat(0xfacc15, { emissive: 0xca8a04, emissiveIntensity: 0.5, roughness: 0.2 })
    );
    cornerHandle.position.set(w / 2 + 0.38 * handleScale, 0.3 * handleScale, d / 2 + 0.38 * handleScale);
    cornerHandle.userData.roomId = room.id;
    cornerHandle.userData.gizmoType = 'room-scale';
    group.add(cornerHandle);

    // 4. Green Outer Rotate Ring + Knob (drag to align room angle with map building)
    const ringRadius = Math.max(2.2, Math.hypot(w, d) * 0.5 + 0.65);
    const rotMat = makeMat(0x22c55e, {
      emissive: 0x16a34a,
      emissiveIntensity: 0.5,
      roughness: 0.25
    });
    const rotRing = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.08 * handleScale, 10, 48),
      rotMat
    );
    rotRing.rotation.x = Math.PI / 2;
    rotRing.position.y = 0.1;
    rotRing.userData.roomId = room.id;
    rotRing.userData.gizmoType = 'room-rotate';
    group.add(rotRing);

    const rotKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.38 * handleScale, 14, 14),
      rotMat
    );
    rotKnob.position.set(0, 0.24 * handleScale, ringRadius);
    rotKnob.userData.roomId = room.id;
    rotKnob.userData.gizmoType = 'room-rotate';
    group.add(rotKnob);
  }

  return group;
}

export const OBJECT3D_PRESETS = {
  pole: {
    shape: 'pole',
    name: 'Tiang CCTV',
    widthMeters: 0.35,
    depthMeters: 0.35,
    heightMeters: 4.5,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#64748b',
    accentColor: '#2a5367',
    opacity: 1,
    showEdges: true,
    hasArm: true,
    showLabel: true
  },
  'server-rack': {
    shape: 'server-rack',
    name: 'Rak Server Custom',
    widthMeters: 1.2,
    depthMeters: 1.2,
    heightMeters: 2.4,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#1e293b',
    accentColor: '#2a5367',
    opacity: 0.45,
    showEdges: true,
    rackUnits: 42,
    showLabel: true
  },
  'tower-lattice': {
    shape: 'tower-lattice',
    name: 'Tower Jaringan',
    widthMeters: 1.8,
    depthMeters: 1.8,
    heightMeters: 12.0,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#94a3b8',
    accentColor: '#ef4444',
    opacity: 1,
    showEdges: true,
    showLabel: true
  },
  box: {
    shape: 'box',
    name: 'Balok 3D',
    widthMeters: 2.0,
    depthMeters: 2.0,
    heightMeters: 2.5,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#cbd5e1',
    accentColor: '#2a5367',
    opacity: 0.92,
    showEdges: true,
    showLabel: false
  },
  cylinder: {
    shape: 'cylinder',
    name: 'Pilar Silinder',
    widthMeters: 1.0,
    depthMeters: 1.0,
    heightMeters: 3.5,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#94a3b8',
    accentColor: '#2a5367',
    opacity: 0.95,
    showEdges: true,
    showLabel: false
  },
  wall: {
    shape: 'wall',
    name: 'Dinding 3D',
    widthMeters: 6.0,
    depthMeters: 0.3,
    heightMeters: 3.2,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#e2e8f0',
    accentColor: '#475569',
    opacity: 0.85,
    showEdges: true,
    showLabel: false
  },
  table: {
    shape: 'table',
    name: 'Meja NOC',
    widthMeters: 2.2,
    depthMeters: 1.1,
    heightMeters: 0.9,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#78350f',
    accentColor: '#334155',
    opacity: 1,
    showEdges: true,
    showLabel: false
  },
  cabinet: {
    shape: 'cabinet',
    name: 'Box Panel ODP',
    widthMeters: 0.8,
    depthMeters: 0.5,
    heightMeters: 1.4,
    elevationMeters: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: '#475569',
    accentColor: '#22c55e',
    opacity: 1,
    showEdges: true,
    showLabel: true
  }
};

function attachSketchupEdges(mesh, edgeColor, showEdges = true) {
  if (!showEdges || !mesh?.geometry) return;
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const lineMat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.9 });
  const segs = new THREE.LineSegments(edges, lineMat);
  mesh.add(segs);
}

/**
 * Create a customizable SketchUp-style procedural 3D Object (CCTV Pole, Custom Server Rack, Tower, Box, etc.)
 * @param {Object} obj
 * @param {Function} normToWorldFn - (normX, normY) => { x, z }
 * @param {boolean} [isSelected=false]
 * @returns {THREE.Group}
 */
export function createCustomObject3DGroup(obj, normToWorldFn, isSelected = false) {
  const group = new THREE.Group();
  const pos = normToWorldFn ? normToWorldFn(obj.x ?? 0.5, obj.y ?? 0.5) : { x: 0, z: 0 };
  const elev = Number(obj.elevationMeters) || 0;
  group.position.set(pos.x, elev, pos.z);
  const rotX = ((Number(obj.rotationX) || 0) * Math.PI) / 180;
  const rotY = ((Number(obj.rotationY ?? obj.rotationDeg) || 0) * Math.PI) / 180;
  const rotZ = ((Number(obj.rotationZ) || 0) * Math.PI) / 180;
  group.rotation.set(rotX, rotY, rotZ, 'YXZ');

  const shape = obj.shape || 'box';
  const w = Math.max(0.15, Number(obj.widthMeters) || 1);
  const d = Math.max(0.15, Number(obj.depthMeters) || 1);
  const h = Math.max(0.15, Number(obj.heightMeters) || 2);
  const opacity = typeof obj.opacity === 'number' ? Math.max(0.05, Math.min(1, obj.opacity)) : 1;
  const isTransparent = opacity < 0.99;
  const showEdges = obj.showEdges !== false;

  const baseColor = obj.color || '#94a3b8';
  const accentColor = obj.accentColor || '#2a5367';
  const edgeColor = isSelected ? 0xfacc15 : accentColor;

  const mainMat = makeMat(baseColor, {
    roughness: 0.42,
    metalness: 0.35,
    transparent: isTransparent,
    opacity
  });
  const frameMat = makeMat(baseColor, { roughness: 0.35, metalness: 0.55 });
  const accentMat = makeMat(accentColor, { roughness: 0.3, metalness: 0.45 });

  if (shape === 'pole') {
    const baseH = Math.min(0.4, h * 0.15);
    const pedestal = addBox(group, w * 1.4, baseH, w * 1.4, 0, baseH / 2, 0, accentMat);
    attachSketchupEdges(pedestal, edgeColor, showEdges);

    const shaftGeo = new THREE.CylinderGeometry(w * 0.28, w * 0.32, h, 18);
    const shaft = new THREE.Mesh(shaftGeo, mainMat);
    shaft.position.y = h / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);
    attachSketchupEdges(shaft, edgeColor, showEdges);

    if (obj.hasArm !== false) {
      const armLen = Math.max(0.5, d * 1.2);
      const armThick = Math.max(0.06, w * 0.2);
      const arm = addBox(group, armThick, armThick, armLen, 0, h - 0.15, armLen / 2, frameMat);
      attachSketchupEdges(arm, edgeColor, showEdges);
      const plate = addBox(group, armThick * 2.2, armThick * 0.7, armThick * 2.2, 0, h - 0.08, armLen, accentMat);
      attachSketchupEdges(plate, edgeColor, showEdges);
    }
  } else if (shape === 'server-rack') {
    const postT = Math.max(0.04, Math.min(0.1, Math.min(w, d) * 0.08));
    const offX = Math.max(0.05, w / 2 - postT / 2);
    const offZ = Math.max(0.05, d / 2 - postT / 2);

    [
      [-offX, -offZ],
      [offX, -offZ],
      [-offX, offZ],
      [offX, offZ]
    ].forEach(([px, pz]) => {
      const post = addBox(group, postT, h, postT, px, h / 2, pz, frameMat);
      attachSketchupEdges(post, edgeColor, showEdges);
    });

    // Top and bottom frame plates
    const topPlate = addBox(group, w, postT, d, 0, h - postT / 2, 0, frameMat);
    const botPlate = addBox(group, w, postT, d, 0, postT / 2, 0, frameMat);
    attachSketchupEdges(topPlate, edgeColor, showEdges);
    attachSketchupEdges(botPlate, edgeColor, showEdges);

    // Horizontal shelves spaced every ~0.45m inside rack
    const shelfMat = makeMat(accentColor, { roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.75 });
    for (let sy = 0.45; sy < h - 0.25; sy += 0.45) {
      addBox(group, Math.max(0.08, w - postT * 2), 0.025, Math.max(0.08, d - postT * 2), 0, sy, 0, shelfMat);
    }

    // Translucent front & side enclosure panels
    const panelMat = makeMat(baseColor, {
      roughness: 0.18,
      metalness: 0.2,
      transparent: true,
      opacity: Math.min(0.75, opacity)
    });
    const frontPanel = addBox(group, Math.max(0.08, w - postT * 2), Math.max(0.1, h - postT * 2), 0.02, 0, h / 2, offZ, panelMat);
    const leftPanel = addBox(group, 0.02, Math.max(0.1, h - postT * 2), Math.max(0.08, d - postT * 2), -offX, h / 2, 0, panelMat);
    const rightPanel = addBox(group, 0.02, Math.max(0.1, h - postT * 2), Math.max(0.08, d - postT * 2), offX, h / 2, 0, panelMat);
    attachSketchupEdges(frontPanel, edgeColor, showEdges);
    attachSketchupEdges(leftPanel, edgeColor, showEdges);
    attachSketchupEdges(rightPanel, edgeColor, showEdges);

    // Top accent status bar
    addBox(group, Math.max(0.1, w * 0.5), 0.04, 0.04, 0, h - 0.02, offZ + 0.02, accentMat);
  } else if (shape === 'tower-lattice') {
    const legR = Math.max(0.035, Math.min(w, d) * 0.045);
    const botOffX = w / 2 - legR;
    const botOffZ = d / 2 - legR;
    const topScale = 0.58;
    const topOffX = botOffX * topScale;
    const topOffZ = botOffZ * topScale;

    const addStrut = (p1, p2, radius, mat) => {
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      if (len < 0.01) return;
      const geo = new THREE.CylinderGeometry(radius, radius, len, 8);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(p1).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      mesh.castShadow = true;
      group.add(mesh);
    };

    const cornersBot = [
      new THREE.Vector3(-botOffX, 0, -botOffZ),
      new THREE.Vector3(botOffX, 0, -botOffZ),
      new THREE.Vector3(botOffX, 0, botOffZ),
      new THREE.Vector3(-botOffX, 0, botOffZ)
    ];
    const cornersTop = [
      new THREE.Vector3(-topOffX, h, -topOffZ),
      new THREE.Vector3(topOffX, h, -topOffZ),
      new THREE.Vector3(topOffX, h, topOffZ),
      new THREE.Vector3(-topOffX, h, topOffZ)
    ];

    // 4 inclined main legs
    for (let i = 0; i < 4; i++) {
      addStrut(cornersBot[i], cornersTop[i], legR, mainMat);
    }

    // Horizontal & X-diagonal lattice bracing every 1.5m
    const segments = Math.max(2, Math.round(h / 1.5));
    const lerpCorner = (idx, t) => new THREE.Vector3().lerpVectors(cornersBot[idx], cornersTop[idx], t);
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      for (let i = 0; i < 4; i++) {
        const nextI = (i + 1) % 4;
        const a0 = lerpCorner(i, t0);
        const b0 = lerpCorner(nextI, t0);
        const a1 = lerpCorner(i, t1);
        const b1 = lerpCorner(nextI, t1);
        addStrut(a1, b1, legR * 0.65, mainMat);
        addStrut(a0, b1, legR * 0.45, frameMat);
        addStrut(b0, a1, legR * 0.45, frameMat);
      }
    }

    // Top platform + warning beacon cap
    const plat = addBox(group, w * 0.68, 0.08, d * 0.68, 0, h, 0, frameMat);
    attachSketchupEdges(plat, edgeColor, showEdges);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.08, Math.min(w, d) * 0.08), 12, 12),
      makeMat(accentColor, { emissive: accentColor, emissiveIntensity: 0.7 })
    );
    beacon.position.y = h + 0.14;
    group.add(beacon);
  } else if (shape === 'cylinder') {
    const cylGeo = new THREE.CylinderGeometry(w / 2, d / 2, h, 28);
    const cyl = new THREE.Mesh(cylGeo, mainMat);
    cyl.position.y = h / 2;
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    group.add(cyl);
    attachSketchupEdges(cyl, edgeColor, showEdges);
  } else if (shape === 'table') {
    const slabH = Math.min(0.1, h * 0.18);
    const top = addBox(group, w, slabH, d, 0, h - slabH / 2, 0, mainMat);
    attachSketchupEdges(top, edgeColor, showEdges);

    const legW = Math.max(0.05, Math.min(0.12, Math.min(w, d) * 0.08));
    const legH = Math.max(0.05, h - slabH);
    const offX = Math.max(0.04, w / 2 - legW / 2 - 0.04);
    const offZ = Math.max(0.04, d / 2 - legW / 2 - 0.04);
    [
      [-offX, -offZ],
      [offX, -offZ],
      [-offX, offZ],
      [offX, offZ]
    ].forEach(([lx, lz]) => {
      const leg = addBox(group, legW, legH, legW, lx, legH / 2, lz, accentMat);
      attachSketchupEdges(leg, edgeColor, showEdges);
    });
  } else if (shape === 'cabinet') {
    const pedH = Math.min(0.14, h * 0.12);
    const ped = addBox(group, w * 0.9, pedH, d * 0.9, 0, pedH / 2, 0, accentMat);
    const bodyH = Math.max(0.1, h - pedH);
    const cab = addBox(group, w, bodyH, d, 0, pedH + bodyH / 2, 0, mainMat);
    const seam = addBox(group, w * 0.86, bodyH * 0.84, 0.02, 0, pedH + bodyH / 2, d / 2 + 0.005, accentMat);
    attachSketchupEdges(ped, edgeColor, showEdges);
    attachSketchupEdges(cab, edgeColor, showEdges);
    attachSketchupEdges(seam, edgeColor, showEdges);
  } else {
    // 'box' or 'wall'
    const box = addBox(group, w, h, d, 0, h / 2, 0, mainMat);
    attachSketchupEdges(box, edgeColor, showEdges);
    if (shape === 'wall') {
      const coping = addBox(group, w + 0.04, 0.06, d + 0.04, 0, h, 0, accentMat);
      attachSketchupEdges(coping, edgeColor, showEdges);
    }
  }

  // Tag all geometry descendants before appending interactive gizmos
  group.traverse((child) => {
    child.userData.object3dId = obj.id;
  });

  if (isSelected) {
    // Base selection halo
    const ringInner = Math.max(0.45, Math.hypot(w, d) * 0.54);
    const selRing = new THREE.Mesh(
      new THREE.RingGeometry(ringInner, ringInner + 0.16, 32),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
    );
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = 0.03;
    selRing.userData.object3dId = obj.id;
    selRing.raycast = () => { };
    group.add(selRing);

    // SketchUp Push/Pull Top Extrude Gizmo (blue handle above object)
    const gizmoGroup = new THREE.Group();
    gizmoGroup.position.set(0, h + 0.22, 0);
    const handleMat = makeMat(0x38bdf8, {
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.2
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 14), handleMat);
    cone.position.y = 0.12;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 20), handleMat);
    disc.position.y = -0.06;
    [cone, disc].forEach((m) => {
      m.userData.object3dId = obj.id;
      m.userData.gizmoType = 'pushpull';
      gizmoGroup.add(m);
    });
    group.add(gizmoGroup);

    // SketchUp Corner Scale Gizmo (yellow handle at corner footprint)
    const cornerHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.24),
      makeMat(0xfacc15, { emissive: 0xca8a04, emissiveIntensity: 0.5, roughness: 0.2 })
    );
    cornerHandle.position.set(w / 2 + 0.14, 0.14, d / 2 + 0.14);
    cornerHandle.userData.object3dId = obj.id;
    cornerHandle.userData.gizmoType = 'scale';
    group.add(cornerHandle);

    // SketchUp Green Rotate Ring + Handle (gizmoType: 'rotate')
    const rotateRingRadius = ringInner + 0.28;
    const rotateMat = makeMat(0x22c55e, {
      emissive: 0x16a34a,
      emissiveIntensity: 0.48,
      roughness: 0.25
    });
    const rotateRing = new THREE.Mesh(
      new THREE.TorusGeometry(rotateRingRadius, 0.035, 10, 36),
      rotateMat
    );
    rotateRing.rotation.x = Math.PI / 2;
    rotateRing.position.y = 0.08;
    rotateRing.userData.object3dId = obj.id;
    rotateRing.userData.gizmoType = 'rotate';
    group.add(rotateRing);

    const rotateKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 14),
      rotateMat
    );
    rotateKnob.position.set(0, 0.14, rotateRingRadius);
    rotateKnob.userData.object3dId = obj.id;
    rotateKnob.userData.gizmoType = 'rotate';
    group.add(rotateKnob);
  }

  if (obj.showLabel && typeof document !== 'undefined') {
    const labelSprite = create3DLabelSprite(
      {
        name: obj.name || 'Objek 3D',
        network: { ip: `${w.toFixed(1)}×${d.toFixed(1)}×${h.toFixed(1)}m` },
        status: 'online'
      },
      elev + h
    );
    labelSprite.position.set(0, h + 0.9, 0);
    labelSprite.scale.set(4.8, 1.4, 1);
    labelSprite.userData.object3dId = obj.id;
    group.add(labelSprite);
  }

  return group;
}

function drawAvatarLabelCanvas(canvas, label, accentHex = '#537b8e') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(18, 28, 16, 0.92)';
  roundRect(ctx, 8, 8, 304, 60, 14);
  ctx.fill();
  ctx.strokeStyle = accentHex || '#537b8e';
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 8, 304, 60, 14);
  ctx.stroke();
  ctx.fillStyle = '#e3edf0';
  ctx.font = 'bold 24px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncateText(ctx, label || 'Teknisi', 278), 160, 38);
}

/**
 * Dynamically update the floating nameplate above a Roblox technician avatar.
 * @param {THREE.Group} avatarGroup
 * @param {string} newLabel
 * @param {string} [accentHex='#537b8e']
 */
export function updateRobloxAvatarLabel(avatarGroup, newLabel, accentHex = '#537b8e') {
  if (!avatarGroup?.userData) return;
  const safeLabel = String(newLabel || 'Teknisi');
  const safeAccent = accentHex || avatarGroup.userData.accentHex || '#537b8e';
  if (avatarGroup.userData.currentLabel === safeLabel && avatarGroup.userData.accentHex === safeAccent) {
    return;
  }
  const canvas = avatarGroup.userData.labelCanvas;
  const tex = avatarGroup.userData.labelTexture;
  if (canvas && tex) {
    drawAvatarLabelCanvas(canvas, safeLabel, safeAccent);
    tex.needsUpdate = true;
  }
  avatarGroup.userData.currentLabel = safeLabel;
  avatarGroup.userData.accentHex = safeAccent;
}

/**
 * Create a Roblox-style R6 blocky Network Engineer 3D character rig.
 * Origin sits on the floor at (0, 0, 0) and faces +Z.
 * All child meshes disable raycasting so the avatar never blocks clicking devices or ports.
 * @param {string} [label='Teknisi Jaringan']
 * @param {Object} [options]
 * @returns {THREE.Group}
 */
export function createRobloxAvatar3DGroup(label = 'Teknisi Jaringan', options = {}) {
  const root = new THREE.Group();
  root.name = options.isRemote ? 'RemoteRobloxNetworkEngineer' : 'RobloxNetworkEngineer';

  const rigRoot = new THREE.Group();
  rigRoot.name = 'RobloxAvatarRig';
  root.add(rigRoot);

  const vestHex = options.vestColor !== undefined ? new THREE.Color(options.vestColor).getHex() : 0x2a5367;
  const helmetHex = options.helmetColor !== undefined
    ? new THREE.Color(options.helmetColor).getHex()
    : (options.isRemote ? vestHex : 0x537b8e);
  const ringHex = options.ringColor !== undefined ? new THREE.Color(options.ringColor).getHex() : helmetHex;
  const accentCss = options.accentHex || `#${helmetHex.toString(16).padStart(6, '0')}`;

  // Classic Roblox R6 colors + SmartSchool Network Engineer high-vis vest
  const skinMat = makeMat(0xfacc15, { roughness: 0.42, metalness: 0.05 });
  const torsoNavyMat = makeMat(0x1e293b, { roughness: 0.55, metalness: 0.1 });
  const vestGreenMat = makeMat(vestHex, { roughness: 0.4, metalness: 0.12 });
  const stripeMat = makeMat(0xd9f99d, { emissive: vestHex, emissiveIntensity: 0.35, roughness: 0.25 });
  const pantsMat = makeMat(0x334155, { roughness: 0.65, metalness: 0.05 });
  const bootMat = makeMat(0x0f172a, { roughness: 0.7, metalness: 0.1 });
  const helmetMat = makeMat(helmetHex, { roughness: 0.32, metalness: 0.18 });
  const tabletBodyMat = makeMat(0x0f172a, { roughness: 0.35, metalness: 0.4 });
  const tabletScreenMat = makeMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.75, roughness: 0.2 });
  const faceDarkMat = makeMat(0x111827, { roughness: 0.3 });

  // Ground indicator ring under feet
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65
  });
  const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 24), ringMat);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.025;
  root.add(groundRing);

  // Small forward pointer arrow on ground ring (+Z)
  const dirArrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 6), ringMat);
  dirArrow.rotation.x = Math.PI / 2;
  dirArrow.position.set(0, 0.03, 0.58);
  root.add(dirArrow);

  // Legs (hip pivots at y = 0.70)
  const makeLeg = (xPos, name) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(xPos, 0.70, 0);
    addBox(pivot, 0.24, 0.60, 0.24, 0, -0.30, 0, pantsMat);
    addBox(pivot, 0.26, 0.12, 0.28, 0, -0.64, 0.02, bootMat);
    rigRoot.add(pivot);
    return pivot;
  };
  const leftLegPivot = makeLeg(-0.14, 'LeftLegPivot');
  const rightLegPivot = makeLeg(0.14, 'RightLegPivot');

  // Torso (center y = 1.06)
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'TorsoGroup';
  torsoGroup.position.set(0, 1.06, 0);
  addBox(torsoGroup, 0.54, 0.72, 0.28, 0, 0, 0, torsoNavyMat);
  addBox(torsoGroup, 0.57, 0.60, 0.30, 0, -0.02, 0, vestGreenMat);
  // Reflective safety stripes front & back + ID card badge
  addBox(torsoGroup, 0.585, 0.07, 0.31, 0, -0.14, 0, stripeMat);
  addBox(torsoGroup, 0.12, 0.14, 0.03, -0.15, 0.14, 0.16, tabletScreenMat);
  rigRoot.add(torsoGroup);

  // Arms (shoulder pivots at y = 1.38)
  const makeArm = (xPos, name, withTester = false) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(xPos, 1.38, 0);
    addBox(pivot, 0.22, 0.42, 0.22, 0, -0.21, 0, torsoNavyMat);
    addBox(pivot, 0.20, 0.28, 0.20, 0, -0.54, 0, skinMat);
    if (withTester) {
      // Handheld Network Cable Tester / Mini Field Laptop
      addBox(pivot, 0.18, 0.04, 0.24, 0, -0.66, 0.12, tabletBodyMat);
      addBox(pivot, 0.14, 0.02, 0.16, 0, -0.635, 0.12, tabletScreenMat);
    }
    rigRoot.add(pivot);
    return pivot;
  };
  const leftArmPivot = makeArm(-0.40, 'LeftArmPivot', false);
  const rightArmPivot = makeArm(0.40, 'RightArmPivot', true);

  // Head + Safety Hard-Hat (neck pivot at y = 1.44)
  const headPivot = new THREE.Group();
  headPivot.name = 'HeadPivot';
  headPivot.position.set(0, 1.44, 0);
  addBox(headPivot, 0.40, 0.40, 0.40, 0, 0.22, 0, skinMat);
  // Blocky eyes & smile facing +Z
  addBox(headPivot, 0.055, 0.075, 0.02, -0.085, 0.25, 0.20, faceDarkMat);
  addBox(headPivot, 0.055, 0.075, 0.02, 0.085, 0.25, 0.20, faceDarkMat);
  addBox(headPivot, 0.14, 0.03, 0.02, 0, 0.12, 0.20, faceDarkMat);
  // Engineer Safety Hard-Hat
  addBox(headPivot, 0.45, 0.14, 0.46, 0, 0.41, 0, helmetMat);
  addBox(headPivot, 0.28, 0.07, 0.48, 0, 0.48, 0, helmetMat);
  addBox(headPivot, 0.42, 0.04, 0.18, 0, 0.36, 0.24, helmetMat);
  rigRoot.add(headPivot);

  // Overhead floating role label when canvas is available
  root.userData.currentLabel = label || '';
  root.userData.accentHex = accentCss;
  if (typeof document !== 'undefined' && label) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 76;
      drawAvatarLabelCanvas(canvas, label, accentCss);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, 2.28, 0);
      sprite.scale.set(2.1, 0.5, 1);
      sprite.renderOrder = 25;
      rigRoot.add(sprite);
      root.userData.labelCanvas = canvas;
      root.userData.labelTexture = tex;
    } catch { /* ignore headless canvas errors */ }
  }

  // Ensure avatar meshes never block picking devices, ports, or cables underneath
  root.traverse((child) => {
    child.userData.isAvatarMesh = true;
    child.raycast = () => { };
  });

  root.userData.rigs = {
    rigRoot,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot
  };

  return root;
}

/**
 * Animate the Roblox R6 Network Engineer limbs cleanly based on walk/sprint/jump state.
 * @param {THREE.Group} avatarGroup
 * @param {Object} animState
 * @param {number} [dt=0.016]
 */
export function animateRobloxAvatarRig(avatarGroup, animState = {}, dt = 0.016) {
  const rigs = avatarGroup?.userData?.rigs;
  if (!rigs) return;

  const { rigRoot, headPivot, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot } = rigs;
  const isGrounded = animState.isGrounded !== false;
  const isMoving = Boolean(animState.isMoving);
  const isRunning = Boolean(animState.isRunning);
  const isCarrying = Boolean(animState.isCarrying);
  const phase = Number(animState.walkPhase) || 0;

  if (!isGrounded) {
    // Crisp jump pose
    leftLegPivot.rotation.x = 0.38;
    rightLegPivot.rotation.x = -0.32;
    if (isCarrying) {
      leftArmPivot.rotation.x = -1.25;
      rightArmPivot.rotation.x = -1.25;
      leftArmPivot.rotation.z = -0.14;
      rightArmPivot.rotation.z = 0.14;
    } else {
      leftArmPivot.rotation.x = -0.75;
      rightArmPivot.rotation.x = -0.65;
      leftArmPivot.rotation.z = 0.24;
      rightArmPivot.rotation.z = -0.24;
    }
    rigRoot.position.y = 0;
    headPivot.rotation.y = 0;
    return;
  }

  if (isMoving) {
    const amp = isRunning ? 0.85 : 0.58;
    const swing = Math.sin(phase) * amp;
    leftLegPivot.rotation.x = swing;
    rightLegPivot.rotation.x = -swing;
    if (isCarrying) {
      const carryBounce = Math.sin(phase) * 0.06;
      leftArmPivot.rotation.x = -1.25 + carryBounce;
      rightArmPivot.rotation.x = -1.25 - carryBounce;
      leftArmPivot.rotation.z = -0.14;
      rightArmPivot.rotation.z = 0.14;
    } else {
      leftArmPivot.rotation.x = -swing * 0.85;
      rightArmPivot.rotation.x = swing * 0.6 - 0.16;
      leftArmPivot.rotation.z = 0.06;
      rightArmPivot.rotation.z = -0.06;
    }
    rigRoot.position.y = Math.abs(Math.cos(phase)) * (isRunning ? 0.085 : 0.045);
    headPivot.rotation.y = Math.sin(phase * 0.5) * 0.05;
    return;
  }

  // Smooth damp back to idle (or standing carry) pose
  const damp = Math.min(1, Math.max(0.05, dt * 12));
  leftLegPivot.rotation.x += (0 - leftLegPivot.rotation.x) * damp;
  rightLegPivot.rotation.x += (0 - rightLegPivot.rotation.x) * damp;
  if (isCarrying) {
    leftArmPivot.rotation.x += (-1.25 - leftArmPivot.rotation.x) * damp;
    rightArmPivot.rotation.x += (-1.25 - rightArmPivot.rotation.x) * damp;
    leftArmPivot.rotation.z += (-0.14 - leftArmPivot.rotation.z) * damp;
    rightArmPivot.rotation.z += (0.14 - rightArmPivot.rotation.z) * damp;
  } else {
    leftArmPivot.rotation.x += (0 - leftArmPivot.rotation.x) * damp;
    rightArmPivot.rotation.x += (-0.15 - rightArmPivot.rotation.x) * damp;
    leftArmPivot.rotation.z += (0.04 - leftArmPivot.rotation.z) * damp;
    rightArmPivot.rotation.z += (-0.04 - rightArmPivot.rotation.z) * damp;
  }
  rigRoot.position.y += (0 - rigRoot.position.y) * damp;
  headPivot.rotation.y += (0 - headPivot.rotation.y) * damp;
}

/**
 * Create a lightweight first-person (FPP) Roblox blocky right hand + glowing Network Cable Tester viewmodel.
 * Positioned in camera-local frame at bottom-right; raycasting disabled on all child meshes.
 * @returns {THREE.Group}
 */
export function createFppHandsViewmodelGroup() {
  const root = new THREE.Group();
  root.name = 'FppHandsViewmodel';

  const swayRoot = new THREE.Group();
  swayRoot.name = 'FppSwayRoot';
  swayRoot.position.set(0.32, -0.27, -0.52);
  swayRoot.rotation.set(0.18, -0.24, 0.06);
  root.add(swayRoot);

  const sleeveMat = makeMat(0x1e293b, { roughness: 0.55, metalness: 0.1 });
  const vestCuffMat = makeMat(0x2a5367, { roughness: 0.45 });
  const skinMat = makeMat(0xfacc15, { roughness: 0.42 });
  const tabletBodyMat = makeMat(0x0f172a, { roughness: 0.32, metalness: 0.45 });
  const tabletScreenMat = makeMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.85, roughness: 0.18 });
  const ledOnlineMat = makeMat(0x22c55e, { emissive: 0x16a34a, emissiveIntensity: 0.9 });

  // Blocky sleeve + cuff + yellow Roblox hand
  const sleeve = addBox(swayRoot, 0.11, 0.11, 0.24, 0.08, -0.05, 0.14, sleeveMat);
  sleeve.rotation.x = -0.25;
  addBox(swayRoot, 0.115, 0.115, 0.04, 0.08, -0.02, 0.04, vestCuffMat);
  addBox(swayRoot, 0.10, 0.10, 0.12, 0.04, 0.01, -0.03, skinMat);

  // Handheld SmartSchool Network Tester / Mini Tablet
  const testerGroup = new THREE.Group();
  testerGroup.position.set(-0.02, 0.04, -0.06);
  testerGroup.rotation.set(-0.32, 0.18, -0.06);
  addBox(testerGroup, 0.16, 0.024, 0.22, 0, 0, 0, tabletBodyMat);
  addBox(testerGroup, 0.13, 0.008, 0.15, 0, 0.014, 0.01, tabletScreenMat);
  addBox(testerGroup, 0.02, 0.01, 0.02, -0.04, 0.014, -0.085, ledOnlineMat);
  addBox(testerGroup, 0.02, 0.01, 0.02, 0.0, 0.014, -0.085, ledOnlineMat);
  swayRoot.add(testerGroup);

  root.traverse((child) => {
    child.userData.isAvatarMesh = true;
    child.raycast = () => { };
    if (child.isMesh) {
      child.castShadow = false;
    }
  });

  root.userData.swayRoot = swayRoot;
  return root;
}

/**
 * Create first-person (FPP) Roblox technician Cable Spool + RJ45/LC connector viewmodel.
 * Displayed when technician is actively pulling a physical 3D cable through rooms & walls.
 * @param {string|number} [cableColorHex='#2563eb']
 * @returns {THREE.Group}
 */
export function createFppCableSpoolViewmodelGroup(cableColorHex = '#2563eb') {
  const root = new THREE.Group();
  root.name = 'FppCableSpoolViewmodel';

  const swayRoot = new THREE.Group();
  swayRoot.name = 'FppCableSpoolSwayRoot';
  swayRoot.position.set(0.30, -0.26, -0.50);
  swayRoot.rotation.set(0.14, -0.28, 0.05);
  root.add(swayRoot);

  const sleeveMat = makeMat(0x1e293b, { roughness: 0.55, metalness: 0.1 });
  const vestCuffMat = makeMat(0x2a5367, { roughness: 0.45 });
  const skinMat = makeMat(0xfacc15, { roughness: 0.42 });
  const flangeMat = makeMat(0x334155, { roughness: 0.35, metalness: 0.42 });
  const hubMat = makeMat(0x94a3b8, { roughness: 0.28, metalness: 0.65 });
  const cableMat = makeMat(cableColorHex, { roughness: 0.38, metalness: 0.08, emissive: cableColorHex, emissiveIntensity: 0.18 });
  const plugBodyMat = makeMat(0xe2e8f0, { roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.88 });
  const goldPinMat = makeMat(0xf59e0b, { roughness: 0.2, metalness: 0.85 });

  // Right arm holding the rotating cable spool drum
  const sleeve = addBox(swayRoot, 0.10, 0.10, 0.22, 0.09, -0.05, 0.14, sleeveMat);
  sleeve.rotation.x = -0.22;
  addBox(swayRoot, 0.105, 0.105, 0.036, 0.09, -0.02, 0.04, vestCuffMat);
  addBox(swayRoot, 0.095, 0.095, 0.11, 0.05, 0.01, -0.03, skinMat);

  const spoolGroup = new THREE.Group();
  spoolGroup.name = 'CableSpoolDrum';
  spoolGroup.position.set(-0.02, 0.055, -0.06);
  spoolGroup.rotation.z = Math.PI * 0.5;
  swayRoot.add(spoolGroup);

  // Spool flanges (left & right discs) + coiled cable core + metal axle
  const flangeGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.012, 20);
  const f1 = new THREE.Mesh(flangeGeo, flangeMat);
  f1.position.y = -0.055;
  const f2 = new THREE.Mesh(flangeGeo, flangeMat);
  f2.position.y = 0.055;
  const coilGeo = new THREE.CylinderGeometry(0.092, 0.092, 0.096, 20);
  const coilMesh = new THREE.Mesh(coilGeo, cableMat);
  const axleGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.132, 12);
  const axleMesh = new THREE.Mesh(axleGeo, hubMat);
  spoolGroup.add(f1, f2, coilMesh, axleMesh);

  // Left-side connector tip (RJ45 / LC plug) aimed slightly forward
  const plugGroup = new THREE.Group();
  plugGroup.name = 'CableSpoolConnectorTip';
  plugGroup.position.set(-0.46, -0.02, -0.05);
  plugGroup.rotation.set(0.12, 0.26, -0.05);
  swayRoot.add(plugGroup);

  addBox(plugGroup, 0.09, 0.09, 0.11, -0.03, -0.04, 0.08, skinMat);
  addBox(plugGroup, 0.026, 0.022, 0.052, 0, 0.01, -0.01, cableMat); // strain-relief boot
  addBox(plugGroup, 0.030, 0.024, 0.038, 0, 0.01, -0.052, plugBodyMat); // translucent RJ45 head
  addBox(plugGroup, 0.022, 0.008, 0.014, 0, 0.021, -0.062, goldPinMat); // gold contacts

  root.traverse((child) => {
    child.userData.isAvatarMesh = true;
    child.raycast = () => { };
    if (child.isMesh) child.castShadow = false;
  });

  root.userData.swayRoot = swayRoot;
  root.userData.spoolDrum = spoolGroup;
  root.userData.cableMat = cableMat;
  root.userData.setCableColor = (hex) => {
    try {
      cableMat.color.set(hex || '#2563eb');
      cableMat.emissive.set(hex || '#2563eb');
    } catch { /* ignore invalid hex */ }
  };
  return root;
}

// Shared geometry / material cache for 3D cable clips & conduit segments (keeps HP GPU light!)
const _cableClipCache = {
  uClipMat: null,
  pClampMat: null,
  tieMat: null,
  selectedMat: null,
  nailMat: null,
  pvcDuctMat: null,
  trayMetalMat: null,
  trayRailMat: null,
  geoPool: new Map()
};

function _ensureCableHardwareMats() {
  if (!_cableClipCache.uClipMat) {
    _cableClipCache.uClipMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.06 });
    _cableClipCache.pClampMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.36, metalness: 0.65 });
    _cableClipCache.tieMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.1 });
    _cableClipCache.selectedMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xeab308, emissiveIntensity: 0.45, roughness: 0.3 });
    _cableClipCache.nailMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.85 });
    _cableClipCache.pvcDuctMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.04 });
    _cableClipCache.trayMetalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.38, metalness: 0.68 });
    _cableClipCache.trayRailMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.72 });
  }
  return _cableClipCache;
}

function _getClipGeometries(clipType, rawRadius) {
  const r = Number(Math.max(0.012, Math.min(0.08, Number(rawRadius) || 0.014)).toFixed(3));
  const key = `${clipType}:${r}`;
  if (_cableClipCache.geoPool.has(key)) return _cableClipCache.geoPool.get(key);
  let geos;
  if (clipType === 'cable-tie') {
    geos = {
      r,
      bandGeo: new THREE.TorusGeometry(r * 1.45, r * 0.28, 6, 12),
      headGeo: new THREE.BoxGeometry(r * 0.9, r * 0.7, r * 0.9)
    };
  } else if (clipType === 'p-clamp') {
    geos = {
      r,
      ringGeo: new THREE.TorusGeometry(r * 1.55, r * 0.36, 6, 14),
      tabGeo: new THREE.BoxGeometry(r * 2.2, r * 0.55, r * 1.4),
      boltGeo: new THREE.CylinderGeometry(r * 0.36, r * 0.36, r * 0.9, 6)
    };
  } else {
    geos = {
      r,
      archGeo: new THREE.TorusGeometry(r * 1.5, r * 0.42, 6, 12, Math.PI * 1.15),
      plateGeo: new THREE.BoxGeometry(r * 3.8, r * 0.55, r * 1.45),
      nailGeo: new THREE.CylinderGeometry(r * 0.42, r * 0.32, r * 0.9, 6)
    };
  }
  _cableClipCache.geoPool.set(key, geos);
  return geos;
}

/**
 * Create a lightweight physical 3D Cable Clip (U-Clip, P-Clamp, or Cable Tie) using pooled geometries & materials.
 * Local +Y points away from the mounting surface (wall/ceiling/floor/pole).
 * @param {{ clipType?: 'u-clip'|'p-clamp'|'cable-tie', radius?: number, isSelected?: boolean }} [options]
 * @returns {THREE.Group}
 */
export function createCableClip3DMesh({ clipType = 'u-clip', radius = 0.012, isSelected = false } = {}) {
  const mats = _ensureCableHardwareMats();
  const group = new THREE.Group();
  const g = _getClipGeometries(clipType, radius);
  const r = g.r;
  const bodyMat = isSelected
    ? mats.selectedMat
    : (clipType === 'p-clamp' ? mats.pClampMat : (clipType === 'cable-tie' ? mats.tieMat : mats.uClipMat));

  const tagPooled = (m) => {
    m.userData.sharedPooledGeo = true;
    m.userData.sharedPooledMat = true;
    return m;
  };

  if (clipType === 'cable-tie') {
    const band = tagPooled(new THREE.Mesh(g.bandGeo, bodyMat));
    group.add(band);
    const lockHead = tagPooled(new THREE.Mesh(g.headGeo, bodyMat));
    lockHead.position.set(0, r * 1.5, 0);
    group.add(lockHead);
  } else if (clipType === 'p-clamp') {
    const ring = tagPooled(new THREE.Mesh(g.ringGeo, bodyMat));
    group.add(ring);
    const tab = tagPooled(new THREE.Mesh(g.tabGeo, bodyMat));
    tab.position.set(r * 1.2, -r * 0.85, 0);
    group.add(tab);
    const bolt = tagPooled(new THREE.Mesh(g.boltGeo, mats.nailMat));
    bolt.position.set(r * 1.8, -r * 0.85, 0);
    group.add(bolt);
  } else {
    // Classic white plastic U-Clip with side steel nail
    const arch = tagPooled(new THREE.Mesh(g.archGeo, bodyMat));
    arch.rotation.z = -Math.PI * 0.075;
    group.add(arch);

    const basePlate = tagPooled(new THREE.Mesh(g.plateGeo, bodyMat));
    basePlate.position.set(r * 0.35, -r * 1.05, 0);
    group.add(basePlate);

    const nailHead = tagPooled(new THREE.Mesh(g.nailGeo, mats.nailMat));
    nailHead.position.set(r * 1.65, -r * 0.7, 0);
    group.add(nailHead);
  }

  group.userData.isCableClip3d = true;
  group.userData.clipType = clipType;
  return group;
}

/**
 * Batch multiple physical 3D Cable Clips into GPU InstancedMesh draw calls to minimize mobile WebGL overhead.
 * @param {Array<{ position: THREE.Vector3, quaternion: THREE.Quaternion, clipType?: string, radius?: number, cableId?: string, waypointIdx?: number }>} clips
 * @returns {THREE.Group}
 */
export function createInstancedCableClips3DGroup(clips = []) {
  const group = new THREE.Group();
  group.name = 'InstancedCableClips3DGroup';
  group.userData.isCableClip3d = true;
  group.userData.isInstancedClipsGroup = true;
  if (!Array.isArray(clips) || clips.length === 0 || typeof THREE.InstancedMesh !== 'function') {
    return group;
  }

  const mats = _ensureCableHardwareMats();
  const dummy = new THREE.Object3D();
  const buckets = new Map();

  clips.forEach((c) => {
    const clipType = c.clipType || 'u-clip';
    const r = Number(Math.max(0.012, Math.min(0.08, Number(c.radius) || 0.014)).toFixed(3));
    const key = `${clipType}:${r}`;
    if (!buckets.has(key)) buckets.set(key, { clipType, r, items: [] });
    buckets.get(key).items.push(c);
  });

  buckets.forEach(({ clipType, r, items }) => {
    const g = _getClipGeometries(clipType, r);
    const bodyMat = clipType === 'p-clamp' ? mats.pClampMat : (clipType === 'cable-tie' ? mats.tieMat : mats.uClipMat);
    const count = items.length;
    const primaryGeo = clipType === 'cable-tie' ? g.bandGeo : (clipType === 'p-clamp' ? g.ringGeo : g.archGeo);
    const instPrimary = new THREE.InstancedMesh(primaryGeo, bodyMat, count);
    instPrimary.name = `InstancedClips_${clipType}`;
    instPrimary.userData.isCableClip3d = true;
    instPrimary.userData.isInstancedClips = true;
    instPrimary.userData.sharedPooledGeo = true;
    instPrimary.userData.sharedPooledMat = true;
    instPrimary.userData.instanceMeta = items.map((c) => ({
      cableId: c.cableId || '',
      waypointIdx: typeof c.waypointIdx === 'number' ? c.waypointIdx : -1
    }));

    const nailGeo = clipType === 'p-clamp' ? g.boltGeo : (clipType === 'u-clip' ? g.nailGeo : null);
    const instNail = nailGeo ? new THREE.InstancedMesh(nailGeo, mats.nailMat, count) : null;
    if (instNail) {
      instNail.userData.isCableClip3d = true;
      instNail.userData.isInstancedClips = true;
      instNail.userData.sharedPooledGeo = true;
      instNail.userData.sharedPooledMat = true;
      instNail.userData.instanceMeta = instPrimary.userData.instanceMeta;
    }

    const nailLocal = clipType === 'p-clamp'
      ? new THREE.Vector3(r * 1.8, -r * 0.85, 0)
      : new THREE.Vector3(r * 1.65, -r * 0.7, 0);
    const archRot = clipType === 'u-clip' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI * 0.075) : null;

    items.forEach((c, idx) => {
      const q = c.quaternion || new THREE.Quaternion();
      dummy.position.copy(c.position);
      dummy.scale.set(1, 1, 1);
      if (archRot) {
        dummy.quaternion.copy(q).multiply(archRot);
      } else {
        dummy.quaternion.copy(q);
      }
      dummy.updateMatrix();
      instPrimary.setMatrixAt(idx, dummy.matrix);

      if (instNail) {
        const wOff = nailLocal.clone().applyQuaternion(q);
        dummy.position.copy(c.position).add(wOff);
        dummy.quaternion.copy(q);
        dummy.updateMatrix();
        instNail.setMatrixAt(idx, dummy.matrix);
      }
    });

    instPrimary.instanceMatrix.needsUpdate = true;
    instPrimary.computeBoundingSphere?.();
    group.add(instPrimary);
    if (instNail) {
      instNail.instanceMatrix.needsUpdate = true;
      instNail.computeBoundingSphere?.();
      group.add(instNail);
    }
  });

  return group;
}

/**
 * Create a realistic 3D Conduit (PVC Trunking Duct or Perforated Steel Cable Tray) along a straight segment.
 * @param {{ startVec: THREE.Vector3, endVec: THREE.Vector3, conduitType: 'pvc-duct'|'cable-tray', radius?: number }} options
 * @returns {THREE.Group|null}
 */
export function createConduitSegmentMesh({ startVec, endVec, conduitType = 'pvc-duct', radius = 0.015 } = {}) {
  if (!startVec || !endVec || conduitType === 'none') return null;
  const dir = new THREE.Vector3().subVectors(endVec, startVec);
  const segLen = dir.length();
  if (segLen < 0.06) return null;

  const mats = _ensureCableHardwareMats();
  const group = new THREE.Group();
  const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  group.position.copy(mid);

  const up = new THREE.Vector3(0, 1, 0);
  const dirNorm = dir.clone().normalize();
  group.quaternion.setFromUnitVectors(up, dirNorm);

  if (conduitType === 'cable-tray') {
    const trayW = Math.max(0.11, radius * 5.2);
    const trayH = Math.max(0.026, radius * 1.8);
    // Base metal bed slightly offset below cable centerline
    const base = new THREE.Mesh(new THREE.BoxGeometry(trayW, segLen, 0.012), mats.trayMetalMat);
    base.position.set(0, 0, -trayH * 0.48);
    group.add(base);
    // Raised left & right side flanges
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.012, segLen, trayH), mats.trayRailMat);
    railL.position.set(-trayW * 0.48, 0, 0);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.012, segLen, trayH), mats.trayRailMat);
    railR.position.set(trayW * 0.48, 0, 0);
    group.add(railL, railR);
  } else {
    // White PVC Wall/Ceiling Ducting Trunking
    const ductW = Math.max(0.036, radius * 2.9);
    const ductD = Math.max(0.024, radius * 2.2);
    const casing = new THREE.Mesh(new THREE.BoxGeometry(ductW, segLen + ductW * 0.45, ductD), mats.pvcDuctMat);
    group.add(casing);
  }

  group.userData.isCableConduit3d = true;
  group.userData.conduitType = conduitType;
  return group;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let str = text;
  while (str.length > 1 && ctx.measureText(str + '…').width > maxWidth) {
    str = str.slice(0, -1);
  }
  return str + '…';
}

// =============================================================================
// City-Builder 3D School Walkway & Road System (roads3d)
// =============================================================================

export const ROAD3D_PRESETS = {
  'stepping-slab': {
    style: 'stepping-slab',
    kind: 'road',
    name: 'Jalan Setapak Beton & Kerikil',
    pathMode: 'smooth',
    widthMeters: 1.55,
    curbWidthMeters: 0.11,
    curbHeightMeters: 0.085,
    slabLengthMeters: 0.64,
    slabGapMeters: 0.14,
    sideGutterMeters: 0.11,
    elevationMeters: 0,
    slabColor: '#d4d1ca',
    curbColor: '#dedad2',
    gravelColor: '#4f4942'
  },
  'asphalt-school-gravel': {
    style: 'asphalt-school-gravel',
    kind: 'road',
    name: 'Jalan Aspal Sekolah & Bahu Kerikil',
    pathMode: 'smooth',
    widthMeters: 5.2,
    curbWidthMeters: 0.14,
    curbHeightMeters: 0.1,
    slabLengthMeters: 3.2,
    slabGapMeters: 0,
    sideGutterMeters: 0.62,
    elevationMeters: 0,
    slabColor: '#8b8d8f',
    curbColor: '#d7d5ce',
    gravelColor: '#8e908c'
  },
  'asphalt-courtyard': {
    style: 'asphalt-courtyard',
    kind: 'road',
    name: 'Aspal Halaman Sekolah Luas',
    pathMode: 'smooth',
    widthMeters: 8.5,
    curbWidthMeters: 0.12,
    curbHeightMeters: 0.06,
    slabLengthMeters: 4.0,
    slabGapMeters: 0,
    sideGutterMeters: 0.18,
    elevationMeters: 0,
    slabColor: '#8d8f91',
    curbColor: '#d4d2cb',
    gravelColor: '#858784'
  },
  'paving-block': {
    style: 'paving-block',
    kind: 'road',
    name: 'Jalan Paving Block Sekolah',
    pathMode: 'smooth',
    widthMeters: 2.6,
    curbWidthMeters: 0.14,
    curbHeightMeters: 0.1,
    slabLengthMeters: 0.4,
    slabGapMeters: 0.02,
    sideGutterMeters: 0,
    elevationMeters: 0,
    slabColor: '#9ca3af',
    curbColor: '#e2e8f0',
    gravelColor: '#475569'
  },
  'concrete-corridor': {
    style: 'concrete-corridor',
    kind: 'road',
    name: 'Jalan Rabat Beton Sekolah',
    pathMode: 'smooth',
    widthMeters: 1.9,
    curbWidthMeters: 0.12,
    curbHeightMeters: 0.08,
    slabLengthMeters: 0.8,
    slabGapMeters: 0.015,
    sideGutterMeters: 0,
    elevationMeters: 0,
    slabColor: '#cbd5e1',
    curbColor: '#e2e8f0',
    gravelColor: '#64748b'
  },
  'asphalt-campus': {
    style: 'asphalt-campus',
    kind: 'road',
    name: 'Jalan Aspal Lingkungan + Marka',
    pathMode: 'smooth',
    widthMeters: 4.5,
    curbWidthMeters: 0.18,
    curbHeightMeters: 0.12,
    slabLengthMeters: 1.6,
    slabGapMeters: 0.9,
    sideGutterMeters: 0,
    elevationMeters: 0,
    slabColor: '#334155',
    curbColor: '#cbd5e1',
    gravelColor: '#1e293b'
  },
  'school-fence-slotted': {
    style: 'school-fence-slotted',
    kind: 'fence',
    name: 'Pagar Tembok Sekolah (Celah)',
    pathMode: 'straight',
    widthMeters: 0.24,
    heightMeters: 1.35,
    curbWidthMeters: 0.42,
    curbHeightMeters: 0.11,
    slabLengthMeters: 3.0,
    slabGapMeters: 0.09,
    sideGutterMeters: 0,
    elevationMeters: 0,
    hasSlots: true,
    passThrough: false,
    slabColor: '#c6dfb0',
    curbColor: '#78a238',
    gravelColor: '#eef3e8'
  },
  'school-fence-tall': {
    style: 'school-fence-tall',
    kind: 'fence',
    name: 'Tembok Pembatas Sekolah Tinggi',
    pathMode: 'straight',
    widthMeters: 0.26,
    heightMeters: 2.45,
    curbWidthMeters: 0.46,
    curbHeightMeters: 0.12,
    slabLengthMeters: 3.5,
    slabGapMeters: 0.09,
    sideGutterMeters: 0,
    elevationMeters: 0,
    hasSlots: false,
    passThrough: false,
    slabColor: '#c6dfb0',
    curbColor: '#78a238',
    gravelColor: '#eef3e8'
  }
};

export function isFence3DStyle(roadOrStyle) {
  if (!roadOrStyle) return false;
  if (typeof roadOrStyle === 'string') {
    const preset = ROAD3D_PRESETS[roadOrStyle];
    return Boolean(preset?.kind === 'fence' || /fence|pagar|tembok/i.test(roadOrStyle));
  }
  if (roadOrStyle.kind === 'fence') return true;
  const style = String(roadOrStyle.style || '');
  const preset = ROAD3D_PRESETS[style];
  return Boolean(preset?.kind === 'fence' || /fence|pagar|tembok/i.test(style));
}

export function getRoad3DTotalLength(road, normToWorldFn) {
  const { totalLength } = sampleRoad3DPathWorld(road, normToWorldFn);
  return Number.isFinite(totalLength) ? totalLength : 0;
}

const _roadTexCache = new Map();

function _seededRoadRand(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function getProceduralRoadGravelTexture(baseHex = '#4f4942') {
  const key = `gravel:${baseHex}`;
  if (_roadTexCache.has(key)) return _roadTexCache.get(key);
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;
    canvas.width = 256;
    canvas.height = 256;

    const isBrightRiver = baseHex.toLowerCase() === '#8e908c' || baseHex.toLowerCase() === '#858784';
    ctx.fillStyle = isBrightRiver ? '#6d6b66' : '#2d2620';
    ctx.fillRect(0, 0, 256, 256);

    const rand = _seededRoadRand(isBrightRiver ? 88421 : 71829);
    const tones = isBrightRiver
      ? ['#9ea09d', '#7a7c7a', '#b8b7b2', '#656765', '#c7c5be', '#888a87', baseHex]
      : ['#57534e', '#78716c', '#a8a29e', '#6b7280', '#44403c', '#9ca3af', baseHex];
    for (let i = 0; i < 420; i++) {
      const px = rand() * 256;
      const py = rand() * 256;
      const rad = 2.2 + rand() * 5.2;
      const tone = tones[Math.floor(rand() * tones.length)];
      // Draw tiled (wrap across edges) for seamless repeat
      for (const ox of [-256, 0, 256]) {
        for (const oy of [-256, 0, 256]) {
          const cx = px + ox;
          const cy = py + oy;
          if (cx < -10 || cx > 266 || cy < -10 || cy > 266) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fillStyle = tone;
          ctx.fill();
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = 'rgba(20, 16, 12, 0.55)';
          ctx.stroke();
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    _roadTexCache.set(key, tex);
    return tex;
  } catch {
    return null;
  }
}

function getProceduralConcreteSlabTexture(style = 'stepping-slab', baseHex = '#d4d1ca') {
  const key = `slab:${style}:${baseHex}`;
  if (_roadTexCache.has(key)) return _roadTexCache.get(key);
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;
    canvas.width = 256;
    canvas.height = 256;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    const rand = _seededRoadRand(style === 'paving-block' ? 9921 : 44123);
    if (style === 'paving-block') {
      // Interlocking paving brick joints
      const rows = 8;
      const cols = 4;
      const rh = 256 / rows;
      const cw = 256 / cols;
      for (let r = 0; r < rows; r++) {
        const shift = (r % 2) * (cw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const shade = 135 + Math.floor(rand() * 34);
          ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
          ctx.fillRect(c * cw + shift + 2, r * rh + 2, cw - 4, rh - 4);
        }
      }
    } else if (style === 'asphalt-school-gravel' || style === 'asphalt-courtyard') {
      // Sun-weathered light/medium grey school campus asphalt (matching real SMK photos: fine aggregate + faint transverse seams, NO lane stripes)
      for (let i = 0; i < 65; i++) {
        const shade = 122 + Math.floor(rand() * 34);
        ctx.fillStyle = `rgba(${shade}, ${shade + 1}, ${shade + 2}, ${0.08 + rand() * 0.12})`;
        ctx.beginPath();
        ctx.arc(rand() * 256, rand() * 256, 10 + rand() * 28, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 1100; i++) {
        const shade = 78 + Math.floor(rand() * 98);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 2}, 0.42)`;
        ctx.fillRect(rand() * 256, rand() * 256, 1.5 + rand() * 2.2, 1.5 + rand() * 2.2);
      }
      // Subtle weathered transverse construction seam / hairline crack across width
      ctx.strokeStyle = 'rgba(66, 68, 70, 0.36)';
      ctx.lineWidth = 1.25;
      let sy = 96 + rand() * 64;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      for (let sx = 16; sx <= 256; sx += 16) {
        sy += (rand() - 0.5) * 3.5;
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    } else if (style === 'asphalt-campus') {
      for (let i = 0; i < 650; i++) {
        const shade = 38 + Math.floor(rand() * 38);
        ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 8}, 0.55)`;
        ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 3, 2 + rand() * 3);
      }
    } else {
      // Brushed weathered concrete with subtle moisture blotches & hairline cracks
      for (let i = 0; i < 90; i++) {
        const shade = 165 + Math.floor(rand() * 55);
        ctx.fillStyle = `rgba(${shade - 12}, ${shade - 15}, ${shade - 20}, ${0.08 + rand() * 0.14})`;
        ctx.beginPath();
        ctx.arc(rand() * 256, rand() * 256, 8 + rand() * 26, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fine broom finish horizontal lines
      ctx.lineWidth = 1;
      for (let y = 0; y < 256; y += 4) {
        ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(60,55,48,0.08)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y + (rand() - 0.5) * 2);
        ctx.stroke();
      }
      // Subtle concrete edge border & hairline fracture lines like reference close-up
      ctx.strokeStyle = 'rgba(72, 66, 58, 0.35)';
      ctx.lineWidth = 1.3;
      for (let c = 0; c < 3; c++) {
        let cx = rand() * 220 + 18;
        let cy = rand() * 220 + 18;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 5; s++) {
          cx += (rand() - 0.5) * 32;
          cy += (rand() - 0.5) * 32;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    _roadTexCache.set(key, tex);
    return tex;
  } catch {
    return null;
  }
}

function getProceduralFencePlasterTexture(baseHex = '#c6dfb0') {
  const key = `fence-plaster:${baseHex}`;
  if (_roadTexCache.has(key)) return _roadTexCache.get(key);
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return null;
    canvas.width = 256;
    canvas.height = 256;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    const rand = _seededRoadRand(314159);
    // Subtle plaster stucco grain & natural exterior shading
    for (let i = 0; i < 140; i++) {
      const alpha = 0.03 + rand() * 0.06;
      ctx.fillStyle = rand() > 0.45 ? `rgba(255, 255, 250, ${alpha})` : `rgba(82, 102, 68, ${alpha})`;
      ctx.beginPath();
      ctx.arc(rand() * 256, rand() * 256, 6 + rand() * 24, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(65,78,52,0.08)';
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
    // Subtle lower damp/weathering patina near soil line (bottom of UV)
    const grad = ctx.createLinearGradient(0, 178, 0, 256);
    grad.addColorStop(0, 'rgba(72, 78, 60, 0)');
    grad.addColorStop(1, 'rgba(64, 70, 52, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 178, 256, 78);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    _roadTexCache.set(key, tex);
    return tex;
  } catch {
    return null;
  }
}

function _create3DSchoolFenceGroup(road, normToWorldFn, isSelected = false, { isPreview = false } = {}) {
  const group = new THREE.Group();
  const preset = ROAD3D_PRESETS[road?.style] || ROAD3D_PRESETS['school-fence-slotted'];
  const elev = Math.max(0, Number(road?.elevationMeters ?? preset.elevationMeters) || 0);
  const wallThick = Math.max(0.12, Math.min(1.5, Number(road?.widthMeters ?? preset.widthMeters) || 0.24));
  const wallH = Math.max(0.45, Math.min(5.5, Number(road?.heightMeters ?? preset.heightMeters) || 1.35));
  const bayPitch = Math.max(1.2, Math.min(8.0, Number(road?.slabLengthMeters ?? preset.slabLengthMeters) || 3.0));
  const slotW = Math.max(0.04, Math.min(0.28, Number(road?.slabGapMeters ?? preset.slabGapMeters) || 0.09));
  const hasSlots = typeof road?.hasSlots === 'boolean' ? road.hasSlots : Boolean(preset.hasSlots);
  const pillarW = Math.max(wallThick * 1.72, 0.36);
  const pillarExtraH = Math.max(0.24, Math.min(0.48, wallH * 0.22));
  const pillarH = wallH + pillarExtraH;
  const copingH = Math.max(0.08, Math.min(0.16, wallH * 0.085));
  const opacity = isPreview ? 0.65 : 1.0;

  const { controlWorldPts, samples, totalLength } = sampleRoad3DPathWorld(road, normToWorldFn);
  if (controlWorldPts.length < 2) return group;

  const wallHex = road?.slabColor || preset.slabColor || '#c6dfb0';
  const copingHex = road?.curbColor || preset.curbColor || '#78a238';
  const grooveHex = road?.gravelColor || preset.gravelColor || '#eef3e8';

  const wallTex = getProceduralFencePlasterTexture(wallHex);
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallTex ? 0xffffff : wallHex,
    map: wallTex || undefined,
    roughness: 0.86,
    metalness: 0.03,
    transparent: isPreview,
    opacity
  });
  const copingMat = new THREE.MeshStandardMaterial({
    color: copingHex,
    roughness: 0.54,
    metalness: 0.06,
    transparent: isPreview,
    opacity
  });
  const grooveMat = new THREE.MeshStandardMaterial({
    color: grooveHex,
    roughness: 0.72,
    metalness: 0.02,
    transparent: isPreview,
    opacity
  });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: '#8f9b85',
    roughness: 0.92,
    metalness: 0.02,
    transparent: isPreview,
    opacity
  });

  // Build ordered pillar chain: always a pillar at every corner vertex + evenly spaced bay pillars along each span
  const pathPts = road?.pathMode === 'smooth' && samples.length >= 3
    ? samples.filter((_, idx) => idx === 0 || idx === samples.length - 1 || idx % 4 === 0).map((s) => s.pos)
    : controlWorldPts;

  const pillars = [];
  const bays = [];
  const addPillarUnique = (x, z, yaw) => {
    for (const p of pillars) {
      if (Math.hypot(p.x - x, p.z - z) < 0.16) return p;
    }
    const rec = { x, z, yaw };
    pillars.push(rec);
    return rec;
  };

  for (let i = 0; i < pathPts.length - 1; i++) {
    const a = pathPts[i];
    const b = pathPts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.15) continue;
    const yaw = Math.atan2(dx, dz);
    const bayCount = Math.max(1, Math.min(80, Math.round(segLen / bayPitch)));

    for (let k = 0; k <= bayCount; k++) {
      const t = k / bayCount;
      addPillarUnique(a.x + dx * t, a.z + dz * t, yaw);
    }
    for (let k = 0; k < bayCount; k++) {
      const t0 = k / bayCount;
      const t1 = (k + 1) / bayCount;
      const x0 = a.x + dx * t0;
      const z0 = a.z + dz * t0;
      const x1 = a.x + dx * t1;
      const z1 = a.z + dz * t1;
      bays.push({
        x: (x0 + x1) * 0.5,
        z: (z0 + z1) * 0.5,
        len: Math.hypot(x1 - x0, z1 - z0),
        yaw
      });
    }
  }

  // 1. Pillars (GPU InstancedMesh: shaft, horizontal white reveal grooves, 2-tier stepped flared olive-green crown)
  if (pillars.length > 0) {
    const pCount = pillars.length;
    const grooveCount = Math.max(2, Math.min(6, Math.round(pillarH / 0.46)));
    const dummy = new THREE.Object3D();

    const shaftGeo = new THREE.BoxGeometry(pillarW, pillarH, pillarW);
    const grooveGeo = new THREE.BoxGeometry(pillarW + 0.014, 0.024, pillarW + 0.014);
    const crownLowGeo = new THREE.BoxGeometry(pillarW + 0.085, 0.058, pillarW + 0.085);
    const crownTopGeo = new THREE.BoxGeometry(pillarW + 0.165, 0.072, pillarW + 0.165);
    const crownCapGeo = new THREE.BoxGeometry(pillarW + 0.105, 0.026, pillarW + 0.105);

    const addInstancedOrMeshes = (name, geo, mat, transforms) => {
      if (transforms.length === 0) return;
      if (typeof THREE.InstancedMesh === 'function') {
        const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
        inst.name = name;
        inst.castShadow = !isPreview;
        inst.receiveShadow = true;
        transforms.forEach((tr, idx) => {
          dummy.position.set(tr.x, tr.y, tr.z);
          dummy.rotation.set(0, tr.yaw || 0, 0);
          dummy.scale.set(tr.sx ?? 1, tr.sy ?? 1, tr.sz ?? 1);
          dummy.updateMatrix();
          inst.setMatrixAt(idx, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere?.();
        group.add(inst);
      } else {
        transforms.forEach((tr) => {
          const m = new THREE.Mesh(geo, mat);
          m.name = name;
          m.position.set(tr.x, tr.y, tr.z);
          m.rotation.y = tr.yaw || 0;
          m.scale.set(tr.sx ?? 1, tr.sy ?? 1, tr.sz ?? 1);
          m.castShadow = !isPreview;
          m.receiveShadow = true;
          group.add(m);
        });
      }
    };

    const shaftTr = [];
    const grooveTr = [];
    const crownLowTr = [];
    const crownTopTr = [];
    const crownCapTr = [];

    for (const p of pillars) {
      shaftTr.push({ x: p.x, y: elev + pillarH * 0.5, z: p.z, yaw: p.yaw });
      for (let g = 1; g <= grooveCount; g++) {
        const gy = elev + (pillarH * 0.84) * (g / (grooveCount + 0.45));
        grooveTr.push({ x: p.x, y: gy, z: p.z, yaw: p.yaw });
      }
      crownLowTr.push({ x: p.x, y: elev + pillarH + 0.029, z: p.z, yaw: p.yaw });
      crownTopTr.push({ x: p.x, y: elev + pillarH + 0.094, z: p.z, yaw: p.yaw });
      crownCapTr.push({ x: p.x, y: elev + pillarH + 0.143, z: p.z, yaw: p.yaw });
    }

    addInstancedOrMeshes('FencePillarShafts', shaftGeo, wallMat, shaftTr);
    addInstancedOrMeshes('FencePillarGrooves', grooveGeo, grooveMat, grooveTr);
    addInstancedOrMeshes('FencePillarCrownLow', crownLowGeo, copingMat, crownLowTr);
    addInstancedOrMeshes('FencePillarCrownTop', crownTopGeo, copingMat, crownTopTr);
    addInstancedOrMeshes('FencePillarCrownCap', crownCapGeo, copingMat, crownCapTr);

    // 2. Wall Bays (with REAL 3D see-through vertical ventilation slots OR solid tall concrete panel + beveled olive-green coping)
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const panelTr = [];
    const copingLowTr = [];
    const copingTopTr = [];
    const plinthTr = [];
    const slotTrimTr = [];

    const bodyH = Math.max(0.25, wallH - copingH);
    for (const bay of bays) {
      const clearSpan = Math.max(0.08, bay.len - pillarW * 0.72);
      const copeSpan = Math.max(0.1, bay.len - pillarW * 0.62);
      const sinY = Math.sin(bay.yaw);
      const cosY = Math.cos(bay.yaw);

      // Olive-green 2-tier rounded/beveled coping along top of bay
      copingLowTr.push({
        x: bay.x,
        y: elev + bodyH + copingH * 0.26,
        z: bay.z,
        yaw: bay.yaw,
        sx: wallThick + 0.04,
        sy: copingH * 0.52,
        sz: copeSpan
      });
      copingTopTr.push({
        x: bay.x,
        y: elev + bodyH + copingH * 0.74,
        z: bay.z,
        yaw: bay.yaw,
        sx: wallThick + 0.076,
        sy: copingH * 0.56,
        sz: copeSpan
      });

      // Grounded base plinth kickstrip
      plinthTr.push({
        x: bay.x,
        y: elev + 0.045,
        z: bay.z,
        yaw: bay.yaw,
        sx: wallThick + 0.018,
        sy: 0.09,
        sz: clearSpan
      });

      if (hasSlots && bodyH >= 0.72 && clearSpan >= 0.78) {
        const slotCount = Math.max(1, Math.min(7, Math.round(clearSpan / 0.66)));
        const effSlotW = Math.min(slotW, (clearSpan / (slotCount + 1)) * 0.42);
        const slotH = Math.max(0.20, Math.min(0.62, bodyH * 0.36));
        const slotBot = Math.max(0.22, bodyH * 0.34);
        const slotTop = Math.min(bodyH - 0.14, slotBot + slotH);
        const realSlotH = Math.max(0.14, slotTop - slotBot);
        const topBandH = Math.max(0.10, bodyH - slotTop);

        // Lower solid wall strip below vertical slots
        panelTr.push({
          x: bay.x,
          y: elev + slotBot * 0.5,
          z: bay.z,
          yaw: bay.yaw,
          sx: wallThick,
          sy: slotBot,
          sz: clearSpan
        });
        // Upper solid wall strip above vertical slots
        panelTr.push({
          x: bay.x,
          y: elev + slotTop + topBandH * 0.5,
          z: bay.z,
          yaw: bay.yaw,
          sx: wallThick,
          sy: topBandH,
          sz: clearSpan
        });

        // Solid piers separating each real see-through vertical slot
        const totalSlotsW = slotCount * effSlotW;
        const pierW = Math.max(0.06, (clearSpan - totalSlotsW) / (slotCount + 1));
        let cursor = -clearSpan * 0.5;
        for (let s = 0; s <= slotCount; s++) {
          const pCenter = cursor + pierW * 0.5;
          panelTr.push({
            x: bay.x + sinY * pCenter,
            y: elev + slotBot + realSlotH * 0.5,
            z: bay.z + cosY * pCenter,
            yaw: bay.yaw,
            sx: wallThick,
            sy: realSlotH,
            sz: pierW
          });
          cursor += pierW;
          if (s < slotCount) {
            const sCenter = cursor + effSlotW * 0.5;
            // Subtle bottom/top cream sill trim inside each real slot opening
            slotTrimTr.push({
              x: bay.x + sinY * sCenter,
              y: elev + slotBot + 0.012,
              z: bay.z + cosY * sCenter,
              yaw: bay.yaw,
              sx: wallThick + 0.008,
              sy: 0.024,
              sz: effSlotW + 0.01
            });
            slotTrimTr.push({
              x: bay.x + sinY * sCenter,
              y: elev + slotTop - 0.012,
              z: bay.z + cosY * sCenter,
              yaw: bay.yaw,
              sx: wallThick + 0.008,
              sy: 0.024,
              sz: effSlotW + 0.01
            });
            cursor += effSlotW;
          }
        }
      } else {
        // Solid privacy wall panel (matches tall perimeter wall in reference photo #1)
        panelTr.push({
          x: bay.x,
          y: elev + bodyH * 0.5,
          z: bay.z,
          yaw: bay.yaw,
          sx: wallThick,
          sy: bodyH,
          sz: clearSpan
        });
      }
    }

    addInstancedOrMeshes('FenceWallPanels', unitBoxGeo, wallMat, panelTr);
    addInstancedOrMeshes('FenceCopingLow', unitBoxGeo, copingMat, copingLowTr);
    addInstancedOrMeshes('FenceCopingTop', unitBoxGeo, copingMat, copingTopTr);
    addInstancedOrMeshes('FenceBasePlinth', unitBoxGeo, plinthMat, plinthTr);
    if (slotTrimTr.length > 0) {
      addInstancedOrMeshes('FenceSlotTrims', unitBoxGeo, grooveMat, slotTrimTr);
    }
  }

  group.traverse((child) => {
    child.userData.roadId = road.id;
  });
  group.userData.roadId = road.id;
  group.userData.isFence3D = true;
  group.userData.fenceStats = {
    pillarCount: pillars.length,
    bayCount: bays.length,
    totalLength: Number(totalLength.toFixed(2)),
    wallHeight: wallH,
    wallThickness: wallThick,
    hasSlots
  };

  if (isSelected && !isPreview) {
    const gizmoY = elev + pillarH + 0.26;
    const linePts = samples.map((s) => new THREE.Vector3(s.pos.x, elev + wallH + 0.12, s.pos.z));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 });
    const selLine = new THREE.Line(lineGeo, lineMat);
    selLine.userData.roadId = road.id;
    group.add(selLine);

    const nodeMat = makeMat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.65, roughness: 0.2 });
    const midMat = makeMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.6, roughness: 0.2 });
    const moveMat = makeMat(0xf97316, { emissive: 0xea580c, emissiveIntensity: 0.6, roughness: 0.2 });

    controlWorldPts.forEach((wp, idx) => {
      const nodeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.24, 16), nodeMat);
      nodeMesh.position.set(wp.x, gizmoY, wp.z);
      nodeMesh.userData = { roadId: road.id, gizmoType: 'road-node', nodeIndex: idx };
      group.add(nodeMesh);

      if (idx < controlWorldPts.length - 1) {
        const nextWp = controlWorldPts[idx + 1];
        const midX = (wp.x + nextWp.x) * 0.5;
        const midZ = (wp.z + nextWp.z) * 0.5;
        const midMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), midMat);
        midMesh.position.set(midX, elev + wallH + 0.26, midZ);
        midMesh.userData = { roadId: road.id, gizmoType: 'road-insert-node', insertAfterIndex: idx };
        group.add(midMesh);
      }
    });

    const centerSample = _interpolateRoadSampleAtDist(samples, totalLength * 0.5) || samples[0];
    if (centerSample) {
      const movePad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 8), moveMat);
      movePad.position.set(centerSample.pos.x, gizmoY + 0.22, centerSample.pos.z);
      movePad.userData = { roadId: road.id, gizmoType: 'road-move' };
      group.add(movePad);
    }
  }

  return group;
}

/**
 * Sample a 3D road's normalized polyline into evenly annotated world-space path samples.
 * Supports straight multi-segment polylines and Catmull-Rom smooth city-builder curves.
 */
export function sampleRoad3DPathWorld(road, normToWorldFn) {
  const rawPts = Array.isArray(road?.points) ? road.points : [];
  if (rawPts.length < 2) {
    return { controlWorldPts: [], samples: [], totalLength: 0 };
  }

  const elev = Math.max(0, Number(road?.elevationMeters) || 0);
  const controlWorldPts = rawPts.map((pt) => {
    const w = normToWorldFn ? normToWorldFn(pt.x ?? 0.5, pt.y ?? 0.5) : { x: pt.x ?? 0, z: pt.y ?? 0 };
    return new THREE.Vector3(Number(w.x) || 0, elev, Number(w.z) || 0);
  });

  // Deduplicate near-zero segments while keeping endpoints
  const cleanPts = [controlWorldPts[0]];
  for (let i = 1; i < controlWorldPts.length; i++) {
    if (controlWorldPts[i].distanceTo(cleanPts[cleanPts.length - 1]) > 0.05) {
      cleanPts.push(controlWorldPts[i]);
    }
  }
  if (cleanPts.length < 2) {
    return { controlWorldPts, samples: [], totalLength: 0 };
  }

  const pathMode = road?.pathMode === 'straight' ? 'straight' : 'smooth';
  const rawSamples = [];
  if (pathMode === 'smooth' && cleanPts.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(cleanPts, false, 'catmullrom', 0.42);
    const estLen = curve.getLength();
    const divs = Math.max(18, Math.min(240, Math.ceil(estLen / 0.35)));
    for (let i = 0; i <= divs; i++) {
      rawSamples.push(curve.getPoint(i / divs));
    }
  } else {
    for (let i = 0; i < cleanPts.length - 1; i++) {
      const a = cleanPts[i];
      const b = cleanPts[i + 1];
      const segLen = a.distanceTo(b);
      const subSteps = Math.max(1, Math.min(60, Math.ceil(segLen / 0.6)));
      for (let s = (i === 0 ? 0 : 1); s <= subSteps; s++) {
        rawSamples.push(new THREE.Vector3().lerpVectors(a, b, s / subSteps));
      }
    }
  }

  const up = new THREE.Vector3(0, 1, 0);
  const samples = [];
  let cumDist = 0;
  for (let i = 0; i < rawSamples.length; i++) {
    const p = rawSamples[i];
    if (i > 0) cumDist += p.distanceTo(rawSamples[i - 1]);
    const prev = rawSamples[Math.max(0, i - 1)];
    const next = rawSamples[Math.min(rawSamples.length - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(next, prev);
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-8) {
      tangent.set(0, 0, -1);
    } else {
      tangent.normalize();
    }
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    samples.push({ pos: p, tangent, right, cumDist });
  }

  return { controlWorldPts, samples, totalLength: cumDist };
}

function _interpolateRoadSampleAtDist(samples, targetDist) {
  if (!samples || samples.length === 0) return null;
  if (targetDist <= 0) return samples[0];
  const last = samples[samples.length - 1];
  if (targetDist >= last.cumDist) return last;

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (targetDist >= a.cumDist && targetDist <= b.cumDist) {
      const span = Math.max(1e-6, b.cumDist - a.cumDist);
      const t = (targetDist - a.cumDist) / span;
      const pos = new THREE.Vector3().lerpVectors(a.pos, b.pos, t);
      const tangent = new THREE.Vector3().lerpVectors(a.tangent, b.tangent, t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      return { pos, tangent, right, cumDist: targetDist };
    }
  }
  return last;
}

function _buildExtrudedRoadRibbonGeo(samples, offsetLeft, offsetRight, bottomY, topY, uvScaleU = 1, uvScaleV = 1) {
  const n = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  const addQuad = (a, b, c, d, u0, v0, u1, v1) => {
    const base = positions.length / 3;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let i = 0; i < n - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];

    const tL0 = s0.pos.clone().addScaledVector(s0.right, offsetLeft).setY(topY);
    const tR0 = s0.pos.clone().addScaledVector(s0.right, offsetRight).setY(topY);
    const tL1 = s1.pos.clone().addScaledVector(s1.right, offsetLeft).setY(topY);
    const tR1 = s1.pos.clone().addScaledVector(s1.right, offsetRight).setY(topY);

    const v0 = s0.cumDist / Math.max(0.1, uvScaleV);
    const v1 = s1.cumDist / Math.max(0.1, uvScaleV);
    // Top walkable surface
    addQuad(tL0, tR0, tR1, tL1, 0, v0, uvScaleU, v1);

    if (topY - bottomY > 0.008) {
      const bL0 = tL0.clone().setY(bottomY);
      const bR0 = tR0.clone().setY(bottomY);
      const bL1 = tL1.clone().setY(bottomY);
      const bR1 = tR1.clone().setY(bottomY);
      // Outer / inner vertical walls
      addQuad(bL0, tL0, tL1, bL1, 0, v0, 0.25, v1);
      addQuad(tR0, bR0, bR1, tR1, 0, v0, 0.25, v1);
    }
  }

  // Front & end caps
  if (n >= 2 && topY - bottomY > 0.008) {
    const first = samples[0];
    const last = samples[n - 1];
    addQuad(
      first.pos.clone().addScaledVector(first.right, offsetLeft).setY(bottomY),
      first.pos.clone().addScaledVector(first.right, offsetRight).setY(bottomY),
      first.pos.clone().addScaledVector(first.right, offsetRight).setY(topY),
      first.pos.clone().addScaledVector(first.right, offsetLeft).setY(topY),
      0, 0, 1, 0.25
    );
    addQuad(
      last.pos.clone().addScaledVector(last.right, offsetRight).setY(bottomY),
      last.pos.clone().addScaledVector(last.right, offsetLeft).setY(bottomY),
      last.pos.clone().addScaledVector(last.right, offsetLeft).setY(topY),
      last.pos.clone().addScaledVector(last.right, offsetRight).setY(topY),
      0, 0, 1, 0.25
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Create a high-detail 3D city-builder road/walkway group matching the school stepping-slab + pebble-gravel walkway reference.
 * Includes interactive vertex handles, segment midpoint '+' handles, and whole-road move handle when selected.
 */
export function create3DRoadGroup(road, normToWorldFn, isSelected = false, { isPreview = false } = {}) {
  if (isFence3DStyle(road)) {
    return _create3DSchoolFenceGroup(road, normToWorldFn, isSelected, { isPreview });
  }
  const group = new THREE.Group();
  const preset = ROAD3D_PRESETS[road?.style] || ROAD3D_PRESETS['stepping-slab'];
  const style = preset.style;
  const elev = Math.max(0, Number(road?.elevationMeters ?? preset.elevationMeters) || 0);
  const width = Math.max(0.6, Math.min(24, Number(road?.widthMeters ?? preset.widthMeters) || 1.55));
  const curbW = Math.max(0.04, Math.min(width * 0.25, Number(road?.curbWidthMeters ?? preset.curbWidthMeters) || 0.11));
  const curbH = Math.max(0.03, Math.min(0.4, Number(road?.curbHeightMeters ?? preset.curbHeightMeters) || 0.085));
  const slabLen = Math.max(0.2, Math.min(6.0, Number(road?.slabLengthMeters ?? preset.slabLengthMeters) || 0.64));
  const slabGap = Math.max(0, Math.min(1.5, Number(road?.slabGapMeters ?? preset.slabGapMeters) ?? 0.14));
  const isSchoolAsphalt = style === 'asphalt-school-gravel' || style === 'asphalt-courtyard';
  const sideGutter = style === 'stepping-slab'
    ? Math.max(0.04, Math.min((width - curbW * 2) * 0.28, Number(road?.sideGutterMeters ?? preset.sideGutterMeters) || 0.11))
    : (isSchoolAsphalt
      ? Math.max(0, Math.min((width - curbW * 2) * 0.38, Number(road?.sideGutterMeters ?? preset.sideGutterMeters) || 0))
      : 0);
  const halfW = width * 0.5;
  const innerHalfW = Math.max(0.2, halfW - curbW);
  const opacity = isPreview ? 0.65 : 1.0;

  const { controlWorldPts, samples, totalLength } = sampleRoad3DPathWorld(road, normToWorldFn);
  if (samples.length < 2) return group;

  const gravelColor = road?.gravelColor || preset.gravelColor;
  const curbColor = road?.curbColor || preset.curbColor;
  const slabColor = road?.slabColor || preset.slabColor;

  const gravelTex = getProceduralRoadGravelTexture(gravelColor);
  const slabTex = getProceduralConcreteSlabTexture(style, slabColor);

  // 1. Gravel / Sub-base Ribbon Bed (visible inside pebble gaps & gutters)
  const bedMat = new THREE.MeshStandardMaterial({
    color: gravelTex ? 0xffffff : gravelColor,
    map: gravelTex || undefined,
    roughness: 0.94,
    metalness: 0.04,
    side: THREE.DoubleSide,
    transparent: isPreview,
    opacity
  });
  const bedGeo = _buildExtrudedRoadRibbonGeo(samples, -innerHalfW, innerHalfW, elev + 0.004, elev + 0.026, innerHalfW * 1.4, 1.15);
  const bedMesh = new THREE.Mesh(bedGeo, bedMat);
  bedMesh.name = 'RoadGravelBed';
  bedMesh.receiveShadow = true;
  group.add(bedMesh);

  // 2. Left & Right Raised Concrete Curbs (Kanstin)
  const curbMat = new THREE.MeshStandardMaterial({
    color: curbColor,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.DoubleSide,
    transparent: isPreview,
    opacity
  });
  const leftCurbGeo = _buildExtrudedRoadRibbonGeo(samples, -halfW, -innerHalfW, elev + 0.004, elev + curbH, 0.4, 1.5);
  const leftCurb = new THREE.Mesh(leftCurbGeo, curbMat);
  leftCurb.name = 'RoadCurbLeft';
  leftCurb.castShadow = !isPreview;
  leftCurb.receiveShadow = true;
  group.add(leftCurb);

  const rightCurbGeo = _buildExtrudedRoadRibbonGeo(samples, innerHalfW, halfW, elev + 0.004, elev + curbH, 0.4, 1.5);
  const rightCurb = new THREE.Mesh(rightCurbGeo, curbMat);
  rightCurb.name = 'RoadCurbRight';
  rightCurb.castShadow = !isPreview;
  rightCurb.receiveShadow = true;
  group.add(rightCurb);

  // Curb expansion joints along outer border stones (rendered in 1 draw call via GPU InstancedMesh)
  if (!isPreview && totalLength >= 0.75) {
    const jointMat = makeMat('#6b665e', { roughness: 0.9, metalness: 0 });
    const jointCount = Math.min(220, Math.floor(totalLength / 0.75));
    const jointGeo = new THREE.BoxGeometry(curbW + 0.008, 0.008, 0.016);
    if (jointCount > 0 && typeof THREE.InstancedMesh === 'function') {
      const jointInst = new THREE.InstancedMesh(jointGeo, jointMat, jointCount * 2);
      jointInst.name = 'RoadCurbJointsInstanced';
      const dummy = new THREE.Object3D();
      let instIdx = 0;
      for (let j = 1; j <= jointCount; j++) {
        const sample = _interpolateRoadSampleAtDist(samples, j * 0.75);
        if (!sample) continue;
        const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        for (const sideSign of [-1, 1]) {
          const jPos = sample.pos.clone().addScaledVector(sample.right, sideSign * (innerHalfW + curbW * 0.5));
          dummy.position.set(jPos.x, elev + curbH + 0.001, jPos.z);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          jointInst.setMatrixAt(instIdx++, dummy.matrix);
        }
      }
      if (instIdx > 0) {
        jointInst.count = instIdx;
        jointInst.instanceMatrix.needsUpdate = true;
        jointInst.computeBoundingSphere?.();
        group.add(jointInst);
      } else {
        jointGeo.dispose();
        jointMat.dispose();
      }
    } else {
      for (let j = 1; j <= jointCount; j++) {
        const sample = _interpolateRoadSampleAtDist(samples, j * 0.75);
        if (!sample) continue;
        const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        for (const sideSign of [-1, 1]) {
          const jPos = sample.pos.clone().addScaledVector(sample.right, sideSign * (innerHalfW + curbW * 0.5));
          const jMesh = new THREE.Mesh(jointGeo, jointMat);
          jMesh.position.set(jPos.x, elev + curbH + 0.001, jPos.z);
          jMesh.rotation.y = yaw;
          group.add(jMesh);
        }
      }
    }
  }

  // 3. Road Surface Layer (Stepping Slabs w/ Pebble Gaps OR Continuous Pavement)
  const slabMat = new THREE.MeshStandardMaterial({
    color: slabTex ? 0xffffff : slabColor,
    map: slabTex || undefined,
    roughness: style === 'asphalt-campus' ? 0.85 : 0.74,
    metalness: 0.05,
    side: THREE.DoubleSide,
    transparent: isPreview,
    opacity
  });

  if (style === 'stepping-slab') {
    const slabWidth = Math.max(0.32, (innerHalfW - sideGutter) * 2);
    const slabThick = Math.max(0.038, curbH - 0.016);
    const slabCenterY = elev + 0.02 + slabThick * 0.5;
    const stepPeriod = slabLen + slabGap;
    const maxSlabs = 320;
    const slabCount = Math.max(1, Math.min(maxSlabs, Math.floor((totalLength + slabGap * 0.5) / stepPeriod)));
    const slabGeo = new THREE.BoxGeometry(slabWidth, slabThick, slabLen);

    const slabsGroup = new THREE.Group();
    slabsGroup.name = 'RoadSteppingSlabs';
    const pebbleCoords = [];

    for (let k = 0; k < slabCount; k++) {
      const dist = slabLen * 0.5 + k * stepPeriod;
      if (dist > totalLength - 0.05 && slabCount > 1) break;
      const sample = _interpolateRoadSampleAtDist(samples, Math.min(totalLength, dist));
      if (!sample) continue;

      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.name = 'RoadSteppingSlabPiece';
      slabMesh.position.set(sample.pos.x, slabCenterY, sample.pos.z);
      slabMesh.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      slabMesh.castShadow = !isPreview;
      slabMesh.receiveShadow = true;
      slabsGroup.add(slabMesh);

      if (!isPreview) {
        // Side gutter pebbles beside slab + transverse gap pebbles between slabs
        for (const sideSign of [-1, 1]) {
          const lat = sideSign * (slabWidth * 0.5 + sideGutter * 0.52);
          for (const zOff of [-slabLen * 0.25, slabLen * 0.25]) {
            const px = sample.pos.x + sample.right.x * lat + sample.tangent.x * zOff;
            const pz = sample.pos.z + sample.right.z * lat + sample.tangent.z * zOff;
            pebbleCoords.push({ x: px, z: pz });
          }
        }
        if (k < slabCount - 1) {
          const gapSample = _interpolateRoadSampleAtDist(samples, Math.min(totalLength, dist + slabLen * 0.5 + slabGap * 0.5));
          if (gapSample) {
            for (const f of [-0.42, -0.18, 0.08, 0.34]) {
              const px = gapSample.pos.x + gapSample.right.x * (innerHalfW * f);
              const pz = gapSample.pos.z + gapSample.right.z * (innerHalfW * f);
              pebbleCoords.push({ x: px, z: pz });
            }
          }
        }
      }
    }
    group.add(slabsGroup);

    // 3D River Pebbles rendered in 1 draw call via InstancedMesh
    if (!isPreview && pebbleCoords.length > 0 && typeof THREE.InstancedMesh === 'function') {
      const maxPebbles = Math.min(pebbleCoords.length, 480);
      const pebGeo = new THREE.DodecahedronGeometry(0.032, 0);
      const pebMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
      const pebMesh = new THREE.InstancedMesh(pebGeo, pebMat, maxPebbles);
      pebMesh.name = 'RoadRiverPebbles';
      const dummy = new THREE.Object3D();
      const pebPalette = [0x78716c, 0x57534e, 0x9ca3af, 0xa8a29e, 0x6b7280];
      const pebRand = _seededRoadRand(202611);
      for (let i = 0; i < maxPebbles; i++) {
        const pc = pebbleCoords[i];
        dummy.position.set(
          pc.x + (pebRand() - 0.5) * 0.06,
          elev + 0.031,
          pc.z + (pebRand() - 0.5) * 0.06
        );
        dummy.rotation.set(pebRand() * 0.4, pebRand() * Math.PI * 2, pebRand() * 0.4);
        const sScale = 0.72 + pebRand() * 0.65;
        dummy.scale.set(sScale * 1.25, sScale * 0.52, sScale * 0.95);
        dummy.updateMatrix();
        pebMesh.setMatrixAt(i, dummy.matrix);
        pebMesh.setColorAt?.(i, new THREE.Color(pebPalette[i % pebPalette.length]));
      }
      pebMesh.instanceMatrix.needsUpdate = true;
      if (pebMesh.instanceColor) pebMesh.instanceColor.needsUpdate = true;
      group.add(pebMesh);
    }
  } else if (isSchoolAsphalt) {
    // Authentic school campus weathered grey asphalt with optional river-pebble gravel shoulders (matching reference photos)
    const asphaltHalfW = Math.max(0.35, innerHalfW - sideGutter);
    const deckTopY = elev + Math.max(0.052, Math.min(0.08, curbH - 0.022));
    const deckGeo = _buildExtrudedRoadRibbonGeo(samples, -asphaltHalfW, asphaltHalfW, elev + 0.022, deckTopY, Math.max(1, asphaltHalfW * 0.65), 2.8);
    const deckMesh = new THREE.Mesh(deckGeo, slabMat);
    deckMesh.name = 'RoadSchoolAsphaltSurface';
    deckMesh.castShadow = !isPreview;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    // Subtle organic weathered edge bevel where asphalt meets the river-pebble shoulder
    if (sideGutter >= 0.06 && !isPreview) {
      const edgeMat = new THREE.MeshStandardMaterial({ color: '#6b6d6e', roughness: 0.92, metalness: 0.02 });
      const edgeL = new THREE.Mesh(_buildExtrudedRoadRibbonGeo(samples, -asphaltHalfW - 0.06, -asphaltHalfW, elev + 0.024, deckTopY - 0.008, 0.25, 1.4), edgeMat);
      const edgeR = new THREE.Mesh(_buildExtrudedRoadRibbonGeo(samples, asphaltHalfW, asphaltHalfW + 0.06, elev + 0.024, deckTopY - 0.008, 0.25, 1.4), edgeMat);
      edgeL.name = 'RoadAsphaltEdgeLeft';
      edgeR.name = 'RoadAsphaltEdgeRight';
      edgeL.receiveShadow = true;
      edgeR.receiveShadow = true;
      group.add(edgeL, edgeR);

      // 3D River Pebbles scattered along BOTH shoulders via 1 GPU InstancedMesh
      if (typeof THREE.InstancedMesh === 'function' && totalLength >= 0.6) {
        const stepDist = 0.42;
        const rows = Math.min(180, Math.floor(totalLength / stepDist));
        const perSide = Math.max(1, Math.min(3, Math.round(sideGutter / 0.28)));
        const maxPebbles = Math.min(680, rows * perSide * 2);
        if (maxPebbles > 0) {
          const pebGeo = new THREE.DodecahedronGeometry(0.036, 0);
          const pebMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.04 });
          const pebMesh = new THREE.InstancedMesh(pebGeo, pebMat, maxPebbles);
          pebMesh.name = 'RoadRiverPebbles';
          const dummy = new THREE.Object3D();
          const pebPalette = [0x9ea09d, 0x7a7c7a, 0xb8b7b2, 0x656765, 0xc7c5be];
          const pebRand = _seededRoadRand(20261126);
          let pIdx = 0;
          for (let r = 0; r < rows && pIdx < maxPebbles; r++) {
            const sample = _interpolateRoadSampleAtDist(samples, (r + 0.5) * stepDist);
            if (!sample) continue;
            for (const sideSign of [-1, 1]) {
              for (let c = 0; c < perSide && pIdx < maxPebbles; c++) {
                const frac = (c + 0.2 + pebRand() * 0.6) / perSide;
                const lat = sideSign * (asphaltHalfW + 0.08 + frac * Math.max(0.04, sideGutter - 0.14));
                const along = (pebRand() - 0.5) * stepDist * 0.85;
                dummy.position.set(
                  sample.pos.x + sample.right.x * lat + sample.tangent.x * along,
                  elev + 0.032,
                  sample.pos.z + sample.right.z * lat + sample.tangent.z * along
                );
                dummy.rotation.set(pebRand() * 0.4, pebRand() * Math.PI * 2, pebRand() * 0.4);
                const sScale = 0.78 + pebRand() * 0.72;
                dummy.scale.set(sScale * 1.3, sScale * 0.48, sScale * 0.95);
                dummy.updateMatrix();
                pebMesh.setMatrixAt(pIdx, dummy.matrix);
                pebMesh.setColorAt?.(pIdx, new THREE.Color(pebPalette[pIdx % pebPalette.length]));
                pIdx++;
              }
            }
          }
          pebMesh.count = pIdx;
          pebMesh.instanceMatrix.needsUpdate = true;
          if (pebMesh.instanceColor) pebMesh.instanceColor.needsUpdate = true;
          pebMesh.computeBoundingSphere?.();
          group.add(pebMesh);
        }
      }
    }
  } else {
    // Continuous road surface (paving block / concrete corridor / asphalt campus with lane dashes)
    const deckGeo = _buildExtrudedRoadRibbonGeo(samples, -innerHalfW, innerHalfW, elev + 0.02, elev + Math.max(0.052, curbH - 0.015), innerHalfW * 1.25, 1.3);
    const deckMesh = new THREE.Mesh(deckGeo, slabMat);
    deckMesh.name = 'RoadPavementSurface';
    deckMesh.castShadow = !isPreview;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    if (style === 'asphalt-campus' && !isPreview && totalLength >= 1.5) {
      const stripeMat = makeMat(0xf8fafc, { roughness: 0.55, metalness: 0.05 });
      const stripeGeo = new THREE.BoxGeometry(0.11, 0.012, slabLen);
      const count = Math.min(180, Math.floor(totalLength / (slabLen + slabGap)));
      const deckTopY = elev + Math.max(0.058, curbH - 0.008);
      if (count > 0 && typeof THREE.InstancedMesh === 'function') {
        const stripeInst = new THREE.InstancedMesh(stripeGeo, stripeMat, count);
        stripeInst.name = 'RoadAsphaltStripesInstanced';
        const dummy = new THREE.Object3D();
        let sWritten = 0;
        for (let sIdx = 0; sIdx < count; sIdx++) {
          const sample = _interpolateRoadSampleAtDist(samples, slabLen * 0.5 + sIdx * (slabLen + slabGap));
          if (!sample) continue;
          dummy.position.set(sample.pos.x, deckTopY, sample.pos.z);
          dummy.rotation.set(0, Math.atan2(sample.tangent.x, sample.tangent.z), 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          stripeInst.setMatrixAt(sWritten++, dummy.matrix);
        }
        if (sWritten > 0) {
          stripeInst.count = sWritten;
          stripeInst.instanceMatrix.needsUpdate = true;
          stripeInst.computeBoundingSphere?.();
          group.add(stripeInst);
        } else {
          stripeGeo.dispose();
          stripeMat.dispose();
        }
      } else {
        for (let sIdx = 0; sIdx < count; sIdx++) {
          const sample = _interpolateRoadSampleAtDist(samples, slabLen * 0.5 + sIdx * (slabLen + slabGap));
          if (!sample) continue;
          const stripe = new THREE.Mesh(stripeGeo, stripeMat);
          stripe.position.set(sample.pos.x, deckTopY, sample.pos.z);
          stripe.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
          group.add(stripe);
        }
      }
    }
  }

  // Selection Centerline & Vertex/Midpoint/Move Gizmo Handles
  group.traverse((child) => {
    child.userData.roadId = road.id;
  });
  group.userData.roadId = road.id;

  if (isSelected && !isPreview) {
    const linePts = samples.map((s) => new THREE.Vector3(s.pos.x, elev + curbH + 0.06, s.pos.z));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95 });
    const selLine = new THREE.Line(lineGeo, lineMat);
    selLine.userData.roadId = road.id;
    group.add(selLine);

    const nodeMat = makeMat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.65, roughness: 0.2 });
    const midMat = makeMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.6, roughness: 0.2 });
    const moveMat = makeMat(0xf97316, { emissive: 0xea580c, emissiveIntensity: 0.6, roughness: 0.2 });

    controlWorldPts.forEach((wp, idx) => {
      const nodeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.22, 16), nodeMat);
      nodeMesh.position.set(wp.x, elev + curbH + 0.14, wp.z);
      nodeMesh.userData = { roadId: road.id, gizmoType: 'road-node', nodeIndex: idx };
      group.add(nodeMesh);

      if (idx < controlWorldPts.length - 1) {
        const nextWp = controlWorldPts[idx + 1];
        const midX = (wp.x + nextWp.x) * 0.5;
        const midZ = (wp.z + nextWp.z) * 0.5;
        const midMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), midMat);
        midMesh.position.set(midX, elev + curbH + 0.14, midZ);
        midMesh.userData = { roadId: road.id, gizmoType: 'road-insert-node', insertAfterIndex: idx };
        group.add(midMesh);
      }
    });

    const centerSample = _interpolateRoadSampleAtDist(samples, totalLength * 0.5) || samples[0];
    if (centerSample) {
      const movePad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 8), moveMat);
      movePad.position.set(centerSample.pos.x, elev + curbH + 0.34, centerSample.pos.z);
      movePad.userData = { roadId: road.id, gizmoType: 'road-move' };
      group.add(movePad);
    }
  }

  return group;
}


