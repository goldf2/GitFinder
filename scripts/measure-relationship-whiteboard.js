#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baseline = 14545;
const target = Math.floor(baseline / 3);
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
  'src/renderer/scripts/relationshipBoardController.js',
  'src/renderer/styles/relationships.css',
  'src/shared/panelTopologyProjection.js',
  'src/shared/relationshipFlowAdapter.js',
  'src/shared/relationshipPortRouter.js',
  'src/shared/relationshipGraphModel.js',
  'src/shared/relationshipLayoutPrimitives.js',
  'src/shared/relationshipProjectGalaxyLayout.js',
  'src/shared/relationshipProjectStructure.js'
];

const measured = files.map(file => {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  return { file, lines: content === '' ? 0 : content.split('\n').length - Number(content.endsWith('\n')) };
});
const current = measured.reduce((sum, item) => sum + item.lines, 0);
const remainingReduction = Math.max(0, current - target);

console.log(JSON.stringify({ baseline, target, current, remainingReduction, files: measured }, null, 2));
