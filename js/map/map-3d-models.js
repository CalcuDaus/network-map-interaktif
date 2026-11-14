/**
 * NetMap — 3D Hardware & Room Model Factory (Three.js)
 * Menyediakan model 3D prosedural untuk Router, Switch/Hub, Server, AP, PtP Dish, Rack, CCTV,
 * Ruangan 3D kustom, Sprite Label, serta loader model eksternal .glb/.gltf.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BUILTIN_GLB_BASE64 } from './builtin-glb-data.js';

const gltfLoader = new GLTFLoader();
const glbCache = new Map(); // url -> Promise<THREE.Group>

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
export function loadCustomGlbModel(url, targetSize = 1.2) {
  if (!url) return Promise.reject(new Error('Empty model URL'));

  if (!glbCache.has(url)) {
    const promise = new Promise((resolve, reject) => {
      const embeddedB64 = BUILTIN_GLB_BASE64[url];
      if (embeddedB64) {
        try {
          const buffer = base64ToArrayBuffer(embeddedB64);
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
          return;
        } catch (err) {
          console.warn('[Map3DModels] Embedded GLB parse failed, falling back to fetch:', err);
        }
      }

      gltfLoader.load(
        url,
        (gltf) => {
          const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!root) {
            reject(new Error('GLB does not contain a scene'));
            return;
          }
          resolve(root);
        },
        undefined,
        (err) => reject(err)
      );
    });
    glbCache.set(url, promise);
  }

  return glbCache.get(url).then((cachedRoot) => {
    const clone = cachedRoot.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    clone.scale.setScalar(scale);

    // Recompute bounds after scaling so base sits cleanly at y = 0
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);

    clone.position.x -= scaledCenter.x;
    clone.position.z -= scaledCenter.z;
    clone.position.y -= scaledBox.min.y;

    const wrapper = new THREE.Group();
    wrapper.add(clone);
    wrapper.updateMatrixWorld(true);
    wrapper.userData.extractedPorts = extractPortsFromGlbWrapper(wrapper);
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

/**
 * Create a 3D group of physical port sockets & status LEDs at their local3d coordinates.
 * When `isCustomGlb` is true, the .GLB model already has sculpted 3D port cavities and gold pins,
 * so we do NOT draw bulky procedural socket boxes over unconnected ports; we only render a compact,
 * flush RJ45/SFP connector boot + micro link LED inside connected ports.
 * @param {Array} ports
 * @param {Map<string, {status: string, cableId: string}>} [portStatusMap]
 * @param {boolean} [isCustomGlb=false]
 * @returns {THREE.Group}
 */
export function create3DPortsSubGroup(ports = [], portStatusMap = new Map(), isCustomGlb = false) {
  const group = new THREE.Group();
  group.name = 'DevicePorts3DGroup';
  if (!Array.isArray(ports) || ports.length === 0) return group;

  const socketGeo = isCustomGlb
    ? new THREE.BoxGeometry(0.018, 0.014, 0.020)
    : new THREE.BoxGeometry(0.052, 0.042, 0.032);
  const ledGeo = isCustomGlb
    ? new THREE.SphereGeometry(0.0045, 8, 8)
    : new THREE.SphereGeometry(0.014, 8, 8);

  ports.forEach((p) => {
    const lx = typeof p.local3d?.x === 'number' ? p.local3d.x : 0;
    const ly = typeof p.local3d?.y === 'number' ? p.local3d.y : 0.12;
    const lz = typeof p.local3d?.z === 'number' ? p.local3d.z : 0.36;
    const zSign = lz < 0 ? -1 : 1;

    const linkState = portStatusMap.get(p.name);
    const isConnected = Boolean(linkState);
    if (isCustomGlb && !isConnected) {
      // Leave the .GLB model's own sculpted RJ45/SFP port cavity completely clean when unplugged
      return;
    }

    const isSfpOrFiber = p.type === 'sfp+' || p.type === 'sfp' || p.type === 'fiber';

    const socketColor = isConnected
      ? (isSfpOrFiber ? 0x0284c7 : 0x1e293b)
      : (isSfpOrFiber ? 0x0f172a : 0x334155);
    const socketMat = new THREE.MeshStandardMaterial({
      color: socketColor,
      roughness: 0.4,
      metalness: 0.45
    });
    const socketMesh = new THREE.Mesh(socketGeo, socketMat);
    socketMesh.position.set(lx, ly, lz);
    socketMesh.userData.portName = p.name;
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
    const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    if (isCustomGlb) {
      ledMesh.position.set(lx, ly + 0.010, lz + zSign * 0.004);
    } else {
      ledMesh.position.set(lx, ly + 0.028, lz + zSign * 0.012);
    }
    ledMesh.userData.portName = p.name;
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
export function createDevice3DMesh(device, catColorHex = '#2a7c13', statusColorHex = '#22c55e') {
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
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
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
  ctx.fillStyle = '#76c457';
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
  return sprite;
}

/**
 * Create a customizable 3D Room / Building zone mesh
 * @param {Object} room
 * @param {Function} normToWorldFn - (normX, normY) => { x, z }
 * @returns {THREE.Group}
 */
export function create3DRoomGroup(room, normToWorldFn) {
  const group = new THREE.Group();
  const pos = normToWorldFn(room.x ?? 0.5, room.y ?? 0.5);
  group.position.set(pos.x, 0, pos.z);

  const w = Math.max(2, Number(room.widthMeters) || 14);
  const d = Math.max(2, Number(room.depthMeters) || 12);
  const h = Math.max(1.5, Number(room.heightMeters) || 3.5);
  const wallColor = room.wallColor || '#2a7c13';
  const floorColor = room.floorColor || '#1e293b';
  const opacity = typeof room.opacity === 'number' ? room.opacity : 0.22;

  // Floor pad
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
  const wallBoxGeo = new THREE.BoxGeometry(w, h, d);
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    roughness: 0.25
  });
  const wallBox = new THREE.Mesh(wallBoxGeo, wallMat);
  wallBox.position.y = h / 2;
  group.add(wallBox);

  // Crisp wireframe outline on walls
  const edges = new THREE.EdgesGeometry(wallBoxGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: wallColor, transparent: true, opacity: 0.85 });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.position.y = h / 2;
  group.add(wireframe);

  // Floating Room Label above roof
  const labelSprite = create3DLabelSprite(
    {
      name: room.name || 'Ruangan 3D',
      network: { ip: `${w}x${d}m` },
      status: 'online'
    },
    h
  );
  labelSprite.position.set(0, h + 1.4, 0);
  labelSprite.scale.set(6.4, 1.85, 1);
  group.add(labelSprite);

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
    rotationY: 0,
    color: '#64748b',
    accentColor: '#2a7c13',
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
    rotationY: 0,
    color: '#1e293b',
    accentColor: '#2a7c13',
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
    rotationY: 0,
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
    rotationY: 0,
    color: '#cbd5e1',
    accentColor: '#2a7c13',
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
    rotationY: 0,
    color: '#94a3b8',
    accentColor: '#2a7c13',
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
    rotationY: 0,
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
    rotationY: 0,
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
    rotationY: 0,
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
  group.rotation.y = ((Number(obj.rotationY) || 0) * Math.PI) / 180;

  const shape = obj.shape || 'box';
  const w = Math.max(0.15, Number(obj.widthMeters) || 1);
  const d = Math.max(0.15, Number(obj.depthMeters) || 1);
  const h = Math.max(0.15, Number(obj.heightMeters) || 2);
  const opacity = typeof obj.opacity === 'number' ? Math.max(0.05, Math.min(1, obj.opacity)) : 1;
  const isTransparent = opacity < 0.99;
  const showEdges = obj.showEdges !== false;

  const baseColor = obj.color || '#94a3b8';
  const accentColor = obj.accentColor || '#2a7c13';
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
    selRing.raycast = () => {};
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

