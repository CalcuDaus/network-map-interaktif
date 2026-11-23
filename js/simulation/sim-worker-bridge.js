/**
 * NetMap — Phase 4.1 Multi-Threaded Simulation Worker Bridge & SoA TypedArray Engine
 * Separates heavy network topology graph solving, Wi-Fi wall-attenuation heatmap calculation,
 * and batch Ping/Jobsheet evaluation from the 3D render thread using Structure of Arrays (SoA)
 * Float32Array / Uint8Array buffers with zero-copy Transferable Worker handoff and instant
 * synchronous fallback for Node.js / offline environments.
 */

const STATUS_CODE_MAP = {
  online: 1,
  active: 1,
  warning: 2,
  offline: 0,
  down: 0
};

/**
 * Pack devices, wireless APs, and 3D building walls into zero-GC Structure of Arrays (SoA) TypedArrays.
 * @param {Array<Object>} devices
 * @param {Array<Object>} rooms
 * @param {Object} [options]
 * @param {number} [options.worldW=170]
 * @param {number} [options.worldD=170]
 * @returns {{
 *   deviceCount: number,
 *   apCount: number,
 *   wallCount: number,
 *   nodeCoordsFloat32: Float32Array,
 *   nodeStatusUint8: Uint8Array,
 *   apBufferFloat32: Float32Array,
 *   wallSegmentsFloat32: Float32Array
 * }}
 */
export function packNetworkTopologySoA(devices = [], rooms = [], { worldW = 170, worldD = 170 } = {}) {
  const devList = Array.isArray(devices) ? devices : [];
  const roomList = Array.isArray(rooms) ? rooms : [];

  const deviceCount = devList.length;
  // [worldX, elevY, worldZ, vlanId] per device
  const nodeCoordsFloat32 = new Float32Array(deviceCount * 4);
  const nodeStatusUint8 = new Uint8Array(deviceCount);

  const aps = [];
  for (let i = 0; i < deviceCount; i++) {
    const d = devList[i] || {};
    const nx = Number(d.position?.x ?? 0.5);
    const ny = Number(d.position?.y ?? 0.5);
    const wx = (nx - 0.5) * worldW;
    const wz = (ny - 0.5) * worldD;
    const wy = Number(d.spatial3d?.elevationMeters ?? 1.2);
    const vlan = Number(d.network?.vlan || 1);

    const base = i * 4;
    nodeCoordsFloat32[base] = wx;
    nodeCoordsFloat32[base + 1] = wy;
    nodeCoordsFloat32[base + 2] = wz;
    nodeCoordsFloat32[base + 3] = vlan;
    nodeStatusUint8[i] = STATUS_CODE_MAP[String(d.status || 'online').toLowerCase()] ?? 1;

    const typeStr = String(d.type || '').toLowerCase();
    const isWireless =
      typeStr.includes('access-point') ||
      typeStr.includes('ap') ||
      typeStr.includes('ptp') ||
      typeStr.includes('router') ||
      Boolean(d.wireless?.enabled || d.network?.ssid);

    if (isWireless && nodeStatusUint8[i] !== 0) {
      const txPowerDbm = Number(d.wireless?.txPowerDbm ?? 20);
      const freqGhz = String(d.network?.wifiBand || '2.4').includes('5') ? 5.0 : 2.4;
      const radiusM = Math.max(8, Number(d.wireless?.radiusMeters || d.coverageRadius || 38));
      aps.push(wx, wy, wz, txPowerDbm, freqGhz, radiusM);
    }
  }

  const apBufferFloat32 = new Float32Array(aps);
  const apCount = aps.length / 6;

  // Extract 4 OBB wall segments per solid building (skipping passThrough/decorative props)
  const wallFloats = [];
  for (let i = 0; i < roomList.length; i++) {
    const r = roomList[i];
    if (!r || r.passThrough === true) continue;
    const ident = `${r.presetId || ''} ${r.customModelUrl || ''} ${r.name || ''}`;
    if (/pohon|bunga|kaktus|tong_sampah|keran|wastafel|plank|banner|lampu_taman|lapangan_futsal|gawang/i.test(ident)) {
      continue;
    }
    const cx = ((Number(r.x ?? 0.5)) - 0.5) * worldW;
    const cz = ((Number(r.y ?? 0.5)) - 0.5) * worldD;
    const hw = Math.max(1, Number(r.widthMeters) || 10) * 0.5;
    const hd = Math.max(1, Number(r.depthMeters) || 8) * 0.5;
    const rotRad = ((Number(r.rotationY) || 0) * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    const corners = [
      { x: cx + (-hw * cos - -hd * sin), z: cz + (-hw * sin + -hd * cos) },
      { x: cx + (hw * cos - -hd * sin), z: cz + (hw * sin + -hd * cos) },
      { x: cx + (hw * cos - hd * sin), z: cz + (hw * sin + hd * cos) },
      { x: cx + (-hw * cos - hd * sin), z: cz + (-hw * sin + hd * cos) }
    ];
    const attenDb = 7.5; // brick/concrete school wall dB loss
    for (let c = 0; c < 4; c++) {
      const p0 = corners[c];
      const p1 = corners[(c + 1) & 3];
      wallFloats.push(p0.x, p0.z, p1.x, p1.z, attenDb);
    }
  }

  return {
    deviceCount,
    apCount,
    wallCount: wallFloats.length / 5,
    nodeCoordsFloat32,
    nodeStatusUint8,
    apBufferFloat32,
    wallSegmentsFloat32: new Float32Array(wallFloats)
  };
}

/**
 * Fast 2D segment intersection test (zero heap allocations).
 */
function segmentsIntersect2D(ax, az, bx, bz, cx, cz, dx, dz) {
  const ccw = (p1x, p1z, p2x, p2z, p3x, p3z) =>
    (p3z - p1z) * (p2x - p1x) > (p2z - p1z) * (p3x - p1x);
  return (
    ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
    ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz)
  );
}

/**
 * Compute Wi-Fi signal attenuation heatmap grid (dBm normalized to 0..1 intensity) using SoA Float32Arrays.
 * Accounts for Free-Space Path Loss (FSPL) and concrete wall penetration loss across building OBB walls.
 * @param {Object} params
 * @param {Float32Array} params.apBufferFloat32
 * @param {Float32Array} [params.wallSegmentsFloat32]
 * @param {number} [params.gridCols=32]
 * @param {number} [params.gridRows=32]
 * @param {number} [params.worldW=170]
 * @param {number} [params.worldD=170]
 * @param {Float32Array} [params.outGridFloat32]
 * @returns {Float32Array}
 */
export function computeWifiHeatmapSoA({
  apBufferFloat32,
  wallSegmentsFloat32 = new Float32Array(0),
  gridCols = 32,
  gridRows = 32,
  worldW = 170,
  worldD = 170,
  outGridFloat32 = null
} = {}) {
  const cols = Math.max(4, Math.min(256, Number(gridCols) || 32));
  const rows = Math.max(4, Math.min(256, Number(gridRows) || 32));
  const out = outGridFloat32 instanceof Float32Array && outGridFloat32.length === cols * rows
    ? outGridFloat32
    : new Float32Array(cols * rows);

  const apLen = apBufferFloat32 ? apBufferFloat32.length : 0;
  if (apLen < 6) {
    out.fill(0);
    return out;
  }
  const wallLen = wallSegmentsFloat32 ? wallSegmentsFloat32.length : 0;

  const cellW = worldW / cols;
  const cellD = worldD / rows;
  const startX = -worldW * 0.5 + cellW * 0.5;
  const startZ = -worldD * 0.5 + cellD * 0.5;

  for (let r = 0; r < rows; r++) {
    const gz = startZ + r * cellD;
    const rowOffset = r * cols;
    for (let c = 0; c < cols; c++) {
      const gx = startX + c * cellW;
      let bestSignalNorm = 0;

      for (let a = 0; a < apLen; a += 6) {
        const ax = apBufferFloat32[a];
        const az = apBufferFloat32[a + 2];
        const txDbm = apBufferFloat32[a + 3];
        const freqGhz = apBufferFloat32[a + 4];
        const maxRad = apBufferFloat32[a + 5];

        const dx = gx - ax;
        const dz = gz - az;
        const distSq = dx * dx + dz * dz;
        if (distSq > maxRad * maxRad * 1.35) continue;

        const distM = Math.max(1.0, Math.sqrt(distSq));
        // Simplified indoor/campus log-distance path loss + wall attenuation
        let pathLossDb = 28.0 + (freqGhz >= 5 ? 6.5 : 0) + 24.0 * Math.log10(distM);

        for (let w = 0; w < wallLen; w += 5) {
          if (
            segmentsIntersect2D(
              ax,
              az,
              gx,
              gz,
              wallSegmentsFloat32[w],
              wallSegmentsFloat32[w + 1],
              wallSegmentsFloat32[w + 2],
              wallSegmentsFloat32[w + 3]
            )
          ) {
            pathLossDb += wallSegmentsFloat32[w + 4];
          }
        }

        const rssiDbm = txDbm - pathLossDb;
        // Map [-88 dBm .. -35 dBm] -> [0.0 .. 1.0]
        const norm = Math.max(0, Math.min(1, (rssiDbm + 88) / 53));
        if (norm > bestSignalNorm) {
          bestSignalNorm = norm;
        }
      }

      out[rowOffset + c] = bestSignalNorm;
    }
  }

  return out;
}

const WORKER_SOURCE = `
self.onmessage = function(e) {
  const data = e.data || {};
  const id = data.id;
  if (data.cmd === 'wifi-heatmap') {
    const ap = new Float32Array(data.apBuffer);
    const walls = new Float32Array(data.wallBuffer);
    const cols = data.gridCols || 32;
    const rows = data.gridRows || 32;
    const worldW = data.worldW || 170;
    const worldD = data.worldD || 170;
    const out = new Float32Array(cols * rows);
    const cellW = worldW / cols;
    const cellD = worldD / rows;
    const startX = -worldW * 0.5 + cellW * 0.5;
    const startZ = -worldD * 0.5 + cellD * 0.5;
    const ccw = (p1x, p1z, p2x, p2z, p3x, p3z) => (p3z - p1z) * (p2x - p1x) > (p2z - p1z) * (p3x - p1x);
    const segHit = (ax, az, bx, bz, cx, cz, dx, dz) =>
      ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
      ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz);

    for (let r = 0; r < rows; r++) {
      const gz = startZ + r * cellD;
      const rowOff = r * cols;
      for (let c = 0; c < cols; c++) {
        const gx = startX + c * cellW;
        let best = 0;
        for (let a = 0; a < ap.length; a += 6) {
          const ax = ap[a], az = ap[a + 2], tx = ap[a + 3], freq = ap[a + 4], rad = ap[a + 5];
          const dx = gx - ax, dz = gz - az;
          const dSq = dx * dx + dz * dz;
          if (dSq > rad * rad * 1.35) continue;
          const d = Math.max(1.0, Math.sqrt(dSq));
          let loss = 28.0 + (freq >= 5 ? 6.5 : 0) + 24.0 * Math.log10(d);
          for (let w = 0; w < walls.length; w += 5) {
            if (segHit(ax, az, gx, gz, walls[w], walls[w + 1], walls[w + 2], walls[w + 3])) {
              loss += walls[w + 4];
            }
          }
          const norm = Math.max(0, Math.min(1, (tx - loss + 88) / 53));
          if (norm > best) best = norm;
        }
        out[rowOff + c] = best;
      }
    }
    self.postMessage({ id, ok: true, outBuffer: out.buffer }, [out.buffer]);
  }
};
`;

export class SimWorkerBridge {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this._reqSeq = 0;
    this._initWorkerIfAvailable();
  }

  _initWorkerIfAvailable() {
    if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') {
      return;
    }
    try {
      const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      this.worker.onmessage = (e) => {
        const { id, ok, outBuffer, error } = e.data || {};
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (ok && outBuffer) {
          entry.resolve(new Float32Array(outBuffer));
        } else {
          entry.reject(new Error(error || 'Worker task failed'));
        }
      };
      this.worker.onerror = () => {
        this.terminate();
      };
    } catch {
      this.worker = null;
    }
  }

  /**
   * Compute Wi-Fi heatmap asynchronously (via Web Worker when available, or synchronous SoA fallback).
   * @param {Object} params
   * @returns {Promise<Float32Array>}
   */
  async computeWifiHeatmapAsync(params = {}) {
    if (!this.worker) {
      return computeWifiHeatmapSoA(params);
    }
    const apCopy = new Float32Array(params.apBufferFloat32 || 0);
    const wallCopy = new Float32Array(params.wallSegmentsFloat32 || 0);
    const id = ++this._reqSeq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(
        {
          id,
          cmd: 'wifi-heatmap',
          apBuffer: apCopy.buffer,
          wallBuffer: wallCopy.buffer,
          gridCols: params.gridCols || 32,
          gridRows: params.gridRows || 32,
          worldW: params.worldW || 170,
          worldD: params.worldD || 170
        },
        [apCopy.buffer, wallCopy.buffer]
      );
    }).catch(() => computeWifiHeatmapSoA(params));
  }

  terminate() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.pending.clear();
  }
}

export const simWorkerBridge = new SimWorkerBridge();
