#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baseline = 14545;
const target = Math.floor(baseline / 3);
const sharedFiles = fs.readdirSync(path.join(root, 'src/shared'))
  .filter(name => name === 'panelTopologyProjection.js' || /^relationship.*\.js$/.test(name))
  .sort()
  .map(name => `src/shared/${name}`);
const rendererBoardScripts = fs.readdirSync(path.join(root, 'src/renderer/scripts'))
  .filter(name => /^relationshipBoard.*\.js$/.test(name))
  .sort()
  .map(name => `src/renderer/scripts/${name}`);
const files = [
  'src/main/ipc/relationshipBoards.js',
  'src/main/services/relationshipBoardExportService.js',
  'src/main/services/relationshipBoardFileFormat.js',
  'src/main/services/relationshipBoardImportService.js',
  'src/main/services/relationshipBoardService.js',
  'src/main/services/whiteboardDocumentService.js',
  'src/main/services/whiteboardPackageService.js',
  'src/renderer/relationship-canvas/index.jsx',
  'src/renderer/relationship-canvas/relationshipCanvas.css',
  ...rendererBoardScripts,
  'src/renderer/styles/relationships.css',
  ...sharedFiles
];

const measured = files.map(file => {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  return { file, lines: content === '' ? 0 : content.split('\n').length - Number(content.endsWith('\n')) };
});
const current = measured.reduce((sum, item) => sum + item.lines, 0);
const remainingReduction = Math.max(0, current - target);

console.log(JSON.stringify({ baseline, target, current, remainingReduction, files: measured }, null, 2));
