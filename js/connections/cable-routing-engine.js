/**
 * NetMap — Physical 3D Cable Routing, Auto-Tidy 90°, Parallel Bundling & Neatness Evaluator
 * Menyediakan:
 *  - Klasifikasi permukaan klem 3D (wall/ceiling/floor/pole/tray/air)
 *  - Kalkulasi panjang 3D sejati termasuk riser vertikal antar klem (wp.z)
 *  - Generator jalur rapi 90° (Plafon, Skirting Lantai, Siku Klem Eksisting) + parallel bundling
 *  - Corner fillet radius tekukan halus (standar minimum bend radius TIA/EIA-568)
 *  - Penilaian Skor Kerapian Instalasi Fisik (0-100 poin) untuk praktikum SMK TKJ/TJKT
 */

export const CABLE_SURFACE_TYPES = new Set(['wall', 'ceiling', 'floor', 'pole', 'tray', 'air']);
export const CABLE_CLIP_TYPES = new Set(['u-clip', 'p-clamp', 'cable-tie', 'none']);
export const CONDUIT_TYPES = new Set(['none', 'pvc-duct', 'cable-tray']);

/**
 * Determine physical mounting surface label from a unit 3D normal vector.
 * @param {{x: number, y: number, z: number}|null} normal
 * @returns {'wall'|'ceiling'|'floor'|'air'}
 */
export function classifySurfaceFromNormal(normal) {
  if (!normal || typeof normal.y !== 'number') return 'air';
  if (normal.y <= -0.55) return 'ceiling';
  if (normal.y >= 0.55) return 'floor';
  return 'wall';
}

/**
 * Default clip hardware type for a given cable category and mounting surface.
 * @param {string} cableCategory
 * @param {string} surface
 * @returns {'u-clip'|'p-clamp'|'cable-tie'|'none'}
 */
export function getDefaultClipType(cableCategory = 'cat6', surface = 'wall') {
  if (surface === 'air') return 'none';
  if (surface === 'tray') return 'cable-tie';
  if (surface === 'pole' || String(cableCategory || '').startsWith('fiber')) return 'p-clamp';
  return 'u-clip';
}

/**
 * Maximum IEEE / TIA standard cable length (in meters) per category.
 * @param {string} cableCategory
 * @returns {number}
 */
export function getStandardMaxLengthMeters(cableCategory = 'cat6') {
  const cat = String(cableCategory || 'cat6').toLowerCase();
  if (cat === 'fiber-sm') return 10000;
  if (cat === 'fiber-mm') return 550;
  if (cat === 'wireless-link') return 5000;
  if (cat === 'coaxial') return 500;
  return 100; // Cat5e / Cat6 / Cat6A IEEE 802.3 limit
}

/**
 * Compute true 3D Euclidean length (including vertical risers along wp.z) when any waypoint carries explicit Z.
 * Returns { has3dZ: false } for legacy 2D routes without wp.z so CableManager keeps exact legacy BOM calculation.
 * @param {Object} cable
 * @param {Object} sourceDev
 * @param {Object} destDev
 * @param {number} [mapWidthMeters=170]
 * @param {number} [mapHeightMeters=170]
 */
export function compute3DCablePathLengthMeters(cable, sourceDev, destDev, mapWidthMeters = 170, mapHeightMeters = 170) {
  const route = Array.isArray(cable?.route) ? cable.route : [];
  const has3dZ = route.some((wp) => typeof wp?.z === 'number' && !Number.isNaN(wp.z));
  if (!has3dZ || !sourceDev?.position || !destDev?.position) {
    return { has3dZ: false, horizontalMeters: 0, verticalTotal: 0, direct3dMeters: 0, segmentLengths: [] };
  }

  const srcElev = typeof sourceDev.spatial3d?.elevationMeters === 'number' ? sourceDev.spatial3d.elevationMeters : 0.8;
  const dstElev = typeof destDev.spatial3d?.elevationMeters === 'number' ? destDev.spatial3d.elevationMeters : 0.8;
  const fallbackZ = typeof cable?.details?.elevationZ === 'number' ? cable.details.elevationZ : Math.max(srcElev, dstElev);

  const chain = [
    { x: Number(sourceDev.position.x) || 0.5, y: Number(sourceDev.position.y) || 0.5, z: srcElev },
    ...route.map((wp) => ({
      x: Number(wp.x) || 0.5,
      y: Number(wp.y) || 0.5,
      z: (typeof wp.z === 'number' && !Number.isNaN(wp.z)) ? Math.max(0.02, wp.z) : fallbackZ
    })),
    { x: Number(destDev.position.x) || 0.5, y: Number(destDev.position.y) || 0.5, z: dstElev }
  ];

  let horizontalMeters = 0;
  let verticalTotal = 0;
  let direct3dMeters = 0;
  const segmentLengths = [];

  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    const dxM = (b.x - a.x) * mapWidthMeters;
    const dyM = (b.y - a.y) * mapHeightMeters;
    const dzM = b.z - a.z;
    const horiz = Math.hypot(dxM, dyM);
    const vert = Math.abs(dzM);
    const seg3d = Math.hypot(dxM, dyM, dzM);
    horizontalMeters += horiz;
    verticalTotal += vert;
    direct3dMeters += seg3d;
    segmentLengths.push(Math.round(seg3d * 10) / 10);
  }

  return {
    has3dZ: true,
    horizontalMeters: Math.round(horizontalMeters * 10) / 10,
    verticalTotal: Math.round(verticalTotal * 10) / 10,
    direct3dMeters: Math.round(direct3dMeters * 10) / 10,
    segmentLengths
  };
}

/**
 * Compute deterministic non-overlapping parallel bundle lane index (0, +1, -1, +2, -2...)
 * for cables sharing endpoints or passing through the same corridor so tubes never z-fight.
 * @param {Object} cable
 * @param {Object[]} allCables
 * @returns {number}
 */
export function computeParallelBundleLane(cable, allCables = []) {
  if (!cable || !Array.isArray(allCables) || allCables.length <= 1) return 0;
  const pairKey = [cable.source, cable.destination].sort().join('::');

  const sameCorridor = allCables.filter((other) => {
    if (!other || other.type === 'wireless' || other.cableCategory === 'wireless-link') return false;
    const otherKey = [other.source, other.destination].sort().join('::');
    if (otherKey === pairKey) return true;
    // Check shared intermediate route corridor (average XY midpoint within ~0.008 norm)
    if (Array.isArray(cable.route) && cable.route.length > 0 && Array.isArray(other.route) && other.route.length > 0) {
      const aMid = cable.route[Math.floor(cable.route.length / 2)];
      const bMid = other.route[Math.floor(other.route.length / 2)];
      const dist = Math.hypot((aMid.x || 0) - (bMid.x || 0), (aMid.y || 0) - (bMid.y || 0));
      const dz = Math.abs((aMid.z ?? 1.2) - (bMid.z ?? 1.2));
      if (dist <= 0.009 && dz <= 0.25) return true;
    }
    return false;
  });

  if (sameCorridor.length <= 1) return 0;
  sameCorridor.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = sameCorridor.findIndex((c) => c.id === cable.id);
  if (idx <= 0) return 0;
  const mag = Math.ceil(idx / 2);
  return idx % 2 === 1 ? mag : -mag;
}

/**
 * Generate a neat 90° orthogonal 3D cable route with wall/ceiling clip metadata.
 * Presets:
 *  - 'ceiling-run' (default 2.75m overhead tray/ceiling)
 *  - 'skirting-run' (0.25m floor/wall skirting)
 *  - 'snap-90-existing' (straightens existing drawn waypoints to crisp 90° axes & equalizes close Z)
 *
 * @param {Object} cable
 * @param {Object} sourceDev
 * @param {Object} destDev
 * @param {{
 *   preset?: 'ceiling-run'|'skirting-run'|'snap-90-existing',
 *   targetElevation?: number,
 *   allCables?: Object[],
 *   mapWidthMeters?: number,
 *   wallSnapFn?: (nx: number, ny: number, z: number) => { x: number, y: number, z: number, surface?: string, normal?: {x:number,y:number,z:number} } | null
 * }} [options]
 */
export function autoTidyCableRoute(cable, sourceDev, destDev, options = {}) {
  if (!cable || !sourceDev?.position || !destDev?.position) {
    return { route: cable?.route || [], detailsPatch: {} };
  }

  const preset = options.preset || 'ceiling-run';
  const allCables = Array.isArray(options.allCables) ? options.allCables : [];
  const mapWidthMeters = Number(options.mapWidthMeters) || 170;
  const wallSnapFn = typeof options.wallSnapFn === 'function' ? options.wallSnapFn : null;
  const clipType = getDefaultClipType(cable.cableCategory, preset === 'ceiling-run' ? 'ceiling' : 'wall');
  const clampN = (v) => Number(Math.max(0.01, Math.min(0.99, v)).toFixed(4));

  const srcX = clampN(sourceDev.position.x);
  const srcY = clampN(sourceDev.position.y);
  const dstX = clampN(destDev.position.x);
  const dstY = clampN(destDev.position.y);

  const lane = computeParallelBundleLane(cable, allCables);
  const laneNormOffset = (lane * 0.03) / Math.max(20, mapWidthMeters);

  const applySnap = (pt) => {
    if (!wallSnapFn) return pt;
    try {
      const snapped = wallSnapFn(pt.x, pt.y, pt.z);
      if (snapped && typeof snapped.x === 'number' && typeof snapped.y === 'number') {
        return {
          ...pt,
          x: clampN(snapped.x),
          y: clampN(snapped.y),
          z: Number(Math.max(0.02, snapped.z ?? pt.z).toFixed(2)),
          surface: snapped.surface || pt.surface,
          normal: snapped.normal || pt.normal
        };
      }
    } catch { /* fallback cleanly */ }
    return pt;
  };

  let route = [];
  let chosenElev = 2.75;

  if (preset === 'snap-90-existing' && Array.isArray(cable.route) && cable.route.length > 0) {
    // Equalize elevations within 0.18m of median & snap segments to nearest 90° axis
    const zVals = cable.route.map((w) => (typeof w.z === 'number' ? w.z : 2.6)).sort((a, b) => a - b);
    const medianZ = zVals[Math.floor(zVals.length / 2)] || 2.6;
    chosenElev = Number(medianZ.toFixed(2));

    let prev = { x: srcX, y: srcY, z: chosenElev };
    for (const rawWp of cable.route) {
      const rawZ = typeof rawWp.z === 'number' ? rawWp.z : chosenElev;
      const snappedZ = Math.abs(rawZ - chosenElev) <= 0.18 ? chosenElev : Number(Math.max(0.02, rawZ).toFixed(2));
      const dx = rawWp.x - prev.x;
      const dy = rawWp.y - prev.y;
      const wpSurface = rawWp.surface || (snappedZ >= 2.3 ? 'ceiling' : (snappedZ <= 0.35 ? 'floor' : 'wall'));
      const wpNormal = rawWp.normal || (wpSurface === 'ceiling' ? { x: 0, y: -1, z: 0 } : (wpSurface === 'floor' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }));

      if (Math.abs(dx) > 0.002 && Math.abs(dy) > 0.002) {
        // Insert crisp 90° elbow along dominant axis first
        const elbow = Math.abs(dx) >= Math.abs(dy)
          ? { x: clampN(rawWp.x), y: clampN(prev.y), z: snappedZ, surface: wpSurface, normal: wpNormal, clipType }
          : { x: clampN(prev.x), y: clampN(rawWp.y), z: snappedZ, surface: wpSurface, normal: wpNormal, clipType };
        route.push(applySnap(elbow));
      }

      const nextPt = applySnap({
        x: clampN(rawWp.x),
        y: clampN(rawWp.y),
        z: snappedZ,
        surface: wpSurface,
        normal: wpNormal,
        clipType: rawWp.clipType || clipType
      });
      route.push(nextPt);
      prev = nextPt;
    }
  } else {
    const isSkirting = preset === 'skirting-run';
    chosenElev = Number(
      (typeof options.targetElevation === 'number'
        ? options.targetElevation
        : (isSkirting ? 0.25 : 2.75)
      ).toFixed(2)
    );
    const surface = isSkirting ? 'wall' : 'ceiling';
    const normal = isSkirting ? { x: 0, y: 0, z: 1 } : { x: 0, y: -1, z: 0 };

    // Climb / drop vertically directly above/below source, run 90° L-corner, then drop to dest
    const p1 = applySnap({
      x: clampN(srcX + laneNormOffset),
      y: clampN(srcY + laneNormOffset),
      z: chosenElev,
      surface,
      normal,
      clipType
    });

    const p3 = applySnap({
      x: clampN(dstX + laneNormOffset),
      y: clampN(dstY + laneNormOffset),
      z: chosenElev,
      surface,
      normal,
      clipType
    });

    const dx = Math.abs(p3.x - p1.x);
    const dy = Math.abs(p3.y - p1.y);
    route.push(p1);
    if (dx > 0.002 && dy > 0.002) {
      const pCorner = applySnap({
        x: p3.x,
        y: p1.y,
        z: chosenElev,
        surface,
        normal,
        clipType
      });
      route.push(pCorner);
    }
    if (Math.hypot(p3.x - p1.x, p3.y - p1.y) > 0.001) {
      route.push(p3);
    }
  }

  // Deduplicate adjacent nearly-identical waypoints
  const deduped = [];
  for (const pt of route) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.0004 || Math.abs((pt.z ?? 0) - (prev.z ?? 0)) > 0.04) {
      deduped.push(pt);
    }
  }

  return {
    route: deduped,
    detailsPatch: {
      pathStyle: 'orthogonal',
      elevationZ: chosenElev,
      showClips3d: true,
      bundleLane: lane,
      bowOut: 0,
      sideOffset: 0,
      sagDrop: 0
    }
  };
}

/**
 * Smoothly fillet sharp 90° corners along a 3D polyline (satisfying realistic minimum bend radius).
 * Works with any {x, y, z} vector-like objects (such as THREE.Vector3) and returns plain {x, y, z} points.
 * @param {Array<{x: number, y: number, z: number}>} points
 * @param {number} [filletRadius=0.06]
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function buildFilletedPolylinePoints(points, filletRadius = 0.06) {
  if (!Array.isArray(points) || points.length < 3 || filletRadius <= 0) {
    return Array.isArray(points) ? points.map((p) => ({ x: p.x, y: p.y, z: p.z })) : [];
  }

  const out = [{ x: points[0].x, y: points[0].y, z: points[0].z }];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v1z = prev.z - curr.z;
    const len1 = Math.hypot(v1x, v1y, v1z);

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const v2z = next.z - curr.z;
    const len2 = Math.hypot(v2x, v2y, v2z);

    if (len1 < 0.015 || len2 < 0.015) {
      out.push({ x: curr.x, y: curr.y, z: curr.z });
      continue;
    }

    const u1x = v1x / len1, u1y = v1y / len1, u1z = v1z / len1;
    const u2x = v2x / len2, u2y = v2y / len2, u2z = v2z / len2;
    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y + u1z * u2z));

    // Skip nearly straight segments (>165°)
    if (dot < -0.96) {
      out.push({ x: curr.x, y: curr.y, z: curr.z });
      continue;
    }

    const r = Math.min(filletRadius, len1 * 0.36, len2 * 0.36);
    const pStart = { x: curr.x + u1x * r, y: curr.y + u1y * r, z: curr.z + u1z * r };
    const pEnd = { x: curr.x + u2x * r, y: curr.y + u2y * r, z: curr.z + u2z * r };

    // 3-step quadratic Bezier corner arc around curr
    out.push(pStart);
    for (const t of [0.33, 0.67]) {
      const omt = 1 - t;
      out.push({
        x: omt * omt * pStart.x + 2 * omt * t * curr.x + t * t * pEnd.x,
        y: omt * omt * pStart.y + 2 * omt * t * curr.y + t * t * pEnd.y,
        z: omt * omt * pStart.z + 2 * omt * t * curr.z + t * t * pEnd.z
      });
    }
    out.push(pEnd);
  }

  const last = points[points.length - 1];
  out.push({ x: last.x, y: last.y, z: last.z });
  return out;
}

/**
 * Evaluate Physical Installation Neatness Score (0-100 points) for SMK TKJ/TJKT practical grading.
 * Criteria:
 *  1. Standard length compliance (25 pts) — UTP <= 100m (warn > 85m), Fiber SM/MM per IEEE/TIA
 *  2. Surface mounting / non-floating ratio (25 pts)
 *  3. Clip density / spacing (20 pts)
 *  4. Angle / bend-radius cleanliness (15 pts)
 *  5. Port & label documentation completeness (15 pts)
 *
 * @param {Object} cable
 * @param {Object} [sourceDev]
 * @param {Object} [destDev]
 * @param {{ mapWidthMeters?: number }} [options]
 */
export function evaluateCableNeatness(cable, sourceDev = null, destDev = null, options = {}) {
  const cat = String(cable?.cableCategory || 'cat6').toLowerCase();
  const isWireless = cable?.type === 'wireless' || cat === 'wireless-link';
  const lengthM = Number(cable?.length || 0);
  const maxLen = getStandardMaxLengthMeters(cat);
  const warnLen = maxLen === 100 ? 85 : maxLen * 0.85;
  const route = Array.isArray(cable?.route) ? cable.route : [];
  const mapWidthMeters = Number(options.mapWidthMeters) || 170;

  let lengthStatus = 'ok';
  let lengthScore = 25;
  const tips = [];

  if (lengthM > maxLen) {
    lengthStatus = 'exceeded';
    lengthScore = 0;
    tips.push(`Panjang ${lengthM.toFixed(1)}m melebihi batas standar ${maxLen}m (${cat.toUpperCase()}). Ganti ke Fiber Optic (SM/MM).`);
  } else if (lengthM > warnLen) {
    lengthStatus = 'warning';
    lengthScore = 18;
    tips.push(`Panjang ${lengthM.toFixed(1)}m mendekati batas maksimum ${maxLen}m. Pertimbangkan jalur lebih pendek atau Fiber Optic.`);
  }

  if (isWireless) {
    const portDocScore = (cable?.name && cable.name !== 'New Cable Link') ? 15 : 10;
    const score = Math.min(100, lengthScore + 60 + portDocScore);
    return {
      score,
      grade: score >= 85 ? 'A' : (score >= 70 ? 'B' : (score >= 55 ? 'C' : 'D')),
      lengthStatus,
      maxLengthMeters: maxLen,
      clipCount: 0,
      checks: [
        { key: 'length', label: 'Jarak Link Wireless', ok: lengthStatus !== 'exceeded', score: lengthScore, max: 25 },
        { key: 'docs', label: 'Dokumentasi Link', ok: portDocScore >= 12, score: portDocScore, max: 15 }
      ],
      tips
    };
  }

  // Short rack patch cords (< 2.8m) do not require wall clips
  const isShortPatch = lengthM <= 2.8;

  // 2. Surface mounting score (25 pts)
  let surfaceScore = 25;
  let mountedCount = 0;
  if (!isShortPatch) {
    if (route.length === 0) {
      surfaceScore = 6;
      tips.push('Kabel panjang masih melayang lurus tanpa klem dinding/plafon. Gunakan Mode Teknisi atau tombol Auto-Rapikan 90°.');
    } else {
      mountedCount = route.filter((wp) => wp && wp.surface && wp.surface !== 'air').length;
      const ratio = mountedCount / route.length;
      surfaceScore = Math.round(ratio * 25);
      if (ratio < 0.7) {
        tips.push('Sebagian titik klem masih melayang di udara. Tempelkan klem ke dinding, plafon, atau tray.');
      }
    }
  } else {
    mountedCount = route.filter((wp) => wp && wp.surface && wp.surface !== 'air').length;
  }

  // 3. Clip spacing / support density (20 pts)
  let clipScore = 20;
  if (!isShortPatch) {
    const idealMinClips = Math.max(2, Math.floor(lengthM / 3.2));
    if (route.length === 0) {
      clipScore = 0;
    } else if (route.length >= idealMinClips) {
      clipScore = 20;
    } else {
      clipScore = Math.max(6, Math.round((route.length / idealMinClips) * 20));
      tips.push(`Tambahkan klem penahan kabel (saat ini ${route.length} klem untuk ${lengthM.toFixed(1)}m; ideal tiap 2.5–3m).`);
    }
  }

  // 4. Corner angle / bend-radius cleanliness (15 pts)
  let angleScore = 15;
  if (route.length >= 1 && sourceDev?.position && destDev?.position) {
    const srcZ = Number(sourceDev.spatial3d?.elevationMeters ?? 0.8);
    const dstZ = Number(destDev.spatial3d?.elevationMeters ?? 0.8);
    const pts = [
      { x: sourceDev.position.x * mapWidthMeters, y: sourceDev.position.y * mapWidthMeters, z: srcZ },
      ...route.map((wp) => ({ x: wp.x * mapWidthMeters, y: wp.y * mapWidthMeters, z: Number(wp.z ?? 1.2) })),
      { x: destDev.position.x * mapWidthMeters, y: destDev.position.y * mapWidthMeters, z: dstZ }
    ];
    let sharpKinks = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const v1x = pts[i - 1].x - pts[i].x, v1y = pts[i - 1].y - pts[i].y, v1z = pts[i - 1].z - pts[i].z;
      const v2x = pts[i + 1].x - pts[i].x, v2y = pts[i + 1].y - pts[i].y, v2z = pts[i + 1].z - pts[i].z;
      const l1 = Math.hypot(v1x, v1y, v1z), l2 = Math.hypot(v2x, v2y, v2z);
      if (l1 < 0.05 || l2 < 0.05) continue;
      const cosAng = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2)));
      const deg = (Math.acos(cosAng) * 180) / Math.PI;
      if (deg < 55) sharpKinks++;
    }
    if (sharpKinks > 0) {
      angleScore = Math.max(3, 15 - sharpKinks * 6);
      tips.push(`Terdeteksi ${sharpKinks} tekukan kabel terlalu tajam (< 55°). Hindari tekukan ekstrem agar tidak merusak inti kabel.`);
    }
  } else if (!isShortPatch && cable?.details?.pathStyle !== 'orthogonal') {
    angleScore = 10;
  }

  // 5. Port & label documentation completeness (15 pts)
  let docScore = 0;
  const hasPorts = Boolean(cable?.details?.portSource && cable?.details?.portDestination);
  const hasGoodName = Boolean(cable?.name && cable.name.trim() && cable.name !== 'New Cable Link');
  if (hasPorts) docScore += 10;
  else tips.push('Pilih Port Sumber & Port Tujuan spesifik pada kabel untuk dokumentasi lengkap.');
  if (hasGoodName) docScore += 5;

  const score = Math.max(0, Math.min(100, lengthScore + surfaceScore + clipScore + angleScore + docScore));
  const grade = score >= 85 ? 'A' : (score >= 70 ? 'B' : (score >= 55 ? 'C' : 'D'));

  return {
    score,
    grade,
    lengthStatus,
    maxLengthMeters: maxLen,
    clipCount: route.length,
    mountedClipCount: mountedCount,
    checks: [
      { key: 'length', label: `Panjang Standar (${lengthM.toFixed(1)}/${maxLen}m)`, ok: lengthStatus === 'ok', score: lengthScore, max: 25 },
      { key: 'surface', label: 'Menempel Dinding/Plafon', ok: surfaceScore >= 18, score: surfaceScore, max: 25 },
      { key: 'clips', label: `Klem Penahan (${route.length})`, ok: clipScore >= 14, score: clipScore, max: 20 },
      { key: 'angle', label: 'Radius Tekukan & Siku', ok: angleScore >= 12, score: angleScore, max: 15 },
      { key: 'docs', label: 'Port & Label Dokumentasi', ok: docScore >= 12, score: docScore, max: 15 }
    ],
    tips
  };
}
