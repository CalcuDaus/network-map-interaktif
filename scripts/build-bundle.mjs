/**
 * NetMap Build Script
 * 1. Bundles application JS (without the 43.5 MB base64 GLB blob!) for ultra-fast mobile/HTTP load (~2 MB).
 * 2. Generates assets/vendor/glb-offline-bundle.js from js/map/builtin-glb-data.js only when missing or outdated,
 *    keeping offline/file:// protocol 100% functional on demand without bloating js/bundle.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const SRC_GLB_DATA = path.join(ROOT, 'js', 'map', 'builtin-glb-data.js');
const OUT_OFFLINE_GLB = path.join(ROOT, 'assets', 'vendor', 'glb-offline-bundle.js');
const OUT_BUNDLE = path.join(ROOT, 'js', 'bundle.js');

async function ensureBuiltinGlbExportsGlobal() {
  const stat = fs.statSync(SRC_GLB_DATA);
  let needsSync = true;
  if (fs.existsSync(OUT_OFFLINE_GLB)) {
    const outStat = fs.statSync(OUT_OFFLINE_GLB);
    if (outStat.mtimeMs >= stat.mtimeMs && outStat.size > 1000) {
      needsSync = false;
    }
  }

  // Ensure builtin-glb-data.js exposes globalThis.__NETMAP_BUILTIN_GLB_BASE64__ when imported in Node/ESM
  let latest = fs.readFileSync(SRC_GLB_DATA, 'utf8');
  if (!latest.includes('__NETMAP_BUILTIN_GLB_BASE64__')) {
    latest = `${latest.trimEnd()}\nif (typeof globalThis !== 'undefined') { globalThis.__NETMAP_BUILTIN_GLB_BASE64__ = BUILTIN_GLB_BASE64; }\n`;
    fs.writeFileSync(SRC_GLB_DATA, latest, 'utf8');
    needsSync = true;
  }

  if (needsSync) {
    const offlineScript = latest
      .replace(/^export\s+const\s+BUILTIN_GLB_BASE64\s*=/m, 'var BUILTIN_GLB_BASE64 =');
    fs.mkdirSync(path.dirname(OUT_OFFLINE_GLB), { recursive: true });
    fs.writeFileSync(OUT_OFFLINE_GLB, offlineScript, 'utf8');
    console.log(`[build] Updated offline fallback bundle: ${path.relative(ROOT, OUT_OFFLINE_GLB)}`);
  }
}

async function main() {
  const t0 = Date.now();
  await ensureBuiltinGlbExportsGlobal();

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'js', 'app.js')],
    bundle: true,
    format: 'iife',
    outfile: OUT_BUNDLE,
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    logLevel: 'info'
  });

  const bundleSizeMb = (fs.statSync(OUT_BUNDLE).size / (1024 * 1024)).toFixed(2);
  console.log(`[build] Wrote ${path.relative(ROOT, OUT_BUNDLE)} (${bundleSizeMb} MB) in ${Date.now() - t0} ms`);
}

main().catch((err) => {
  console.error('[build] Failed:', err);
  process.exit(1);
});
