#!/usr/bin/env node
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');

esbuild.build({
  entryPoints: [path.join(projectRoot, 'src/renderer/relationship-canvas/index.jsx')],
  outdir: path.join(projectRoot, 'src/renderer/generated'),
  entryNames: 'relationship-canvas',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120'],
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
}).catch(() => process.exit(1));
