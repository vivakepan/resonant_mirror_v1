#!/usr/bin/env node
/**
 * Build dist/vocal_resonance.html — single-file portable bundle (file:// safe).
 * Run from repo root: node tools/build_portable.mjs
 * Requires: npx esbuild (fetched on first run via verify_all / build).
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'vocal_resonance.html');
const BUNDLE_TMP = path.join(ROOT, 'dist', '_bundle.js');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

console.log('Bundling src/main.js…');
execSync(
  `npx --yes esbuild src/main.js --bundle --format=iife --target=es2020 --outfile=dist/_bundle.js`,
  { cwd: ROOT, stdio: 'inherit' },
);

const css = read('styles/main.css');
let html = read('index.html');

html = html.replace(
  /<link rel="stylesheet" href="styles\/main\.css">\s*/,
  `<style>\n${css}\n</style>\n`,
);
html = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>\n${fs.readFileSync(BUNDLE_TMP, 'utf8')}\n</script>`,
);

// Portable note in title
html = html.replace(
  /<title>[^<]+<\/title>/,
  '<title>The Resonant Singer — portable build</title>',
);

const banner = `<!-- Built ${new Date().toISOString()} from src/ via tools/build_portable.mjs — file:// safe -->\n`;
if (!html.startsWith('<!DOCTYPE')) {
  throw new Error('Unexpected index.html shape');
}
html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n${banner}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
fs.unlinkSync(BUNDLE_TMP);

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`Wrote ${OUT} (${kb} KB)`);
