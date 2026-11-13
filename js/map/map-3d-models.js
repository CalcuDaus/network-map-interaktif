/**
 * NetMap — 3D Hardware & Room Model Factory (Three.js)
 * Menyediakan model 3D prosedural untuk Router, Switch/Hub, Server, AP, PtP Dish, Rack, CCTV,
 * Ruangan 3D kustom, Sprite Label, serta loader model eksternal .glb/.gltf.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const glbCache = new Map(); // url -> Promise<THREE.Group>

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
    return wrapper;
  });
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

