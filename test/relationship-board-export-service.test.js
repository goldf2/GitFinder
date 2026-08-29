const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  RelationshipBoardExportService,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION
} = require('../src/main/services/relationshipBoardExportService');

function makeTemporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-relationship-export-'));
}

function portableStore() {
  return {
    schemaVersion: 1,
    activeBoardId: 'board_export001',
    entities: [
      {
        id: 'entity_repo0001',
        type: 'repository',
        name: 'MES Repo',
        refId: 'r_123456789abc',
        details: {},
        source: 'gitfinder-registry'
      },
      {
        id: 'entity_deploy01',
        type: 'deployment',
        name: 'MES production',
        details: { environment: 'production', status: 'running' },
        source: 'observed',
        verifiedAt: '2026-08-29T03:30:00.000Z'
      }
    ],
    relationships: [{
      id: 'relationship_export01',
      type: 'source_of',
      label: '生产部署来源',
      sourceId: 'entity_repo0001',
      targetId: 'entity_deploy01',
      source: 'observed'
    }],
    boards: [{
      id: 'board_export001',
      name: '生产 / 部署关系',
      viewport: { x: 40, y: 60, zoom: 0.9 },
      placements: [
        { entityId: 'entity_repo0001', x: 80, y: 100 },
        { entityId: 'entity_deploy01', x: 420, y: 100 }
      ]
    }]
  };
}

test('当前关系白板导出为带格式标识的可移植 JSON 文件', t => {
  const directory = makeTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = new RelationshipBoardExportService({
    now: () => new Date('2026-08-29T04:00:00.000Z')
  });
  const outputPath = path.join(directory, 'production.gitfinder-board.json');

  const result = service.exportToFile(outputPath, portableStore());
  const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.cancelled, false);
  assert.equal(result.nodeCount, 2);
  assert.equal(result.relationshipCount, 1);
  assert.equal(exported.format, EXPORT_FORMAT);
  assert.equal(exported.formatVersion, EXPORT_FORMAT_VERSION);
  assert.equal(exported.exportedAt, '2026-08-29T04:00:00.000Z');
  assert.equal(exported.store.boards[0].name, '生产 / 部署关系');
  assert.equal(exported.store.relationships[0].label, '生产部署来源');
  assert.equal(JSON.stringify(exported).includes('/Volumes/'), false);
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
});

test('导出文件名跨平台安全且不会静默导出疑似凭据', t => {
  const directory = makeTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = new RelationshipBoardExportService();
  assert.equal(service.suggestedFileName(portableStore()), '生产-部署关系.gitfinder-board.json');

  const unsafe = portableStore();
  unsafe.entities[1].evidenceSummary = 'token=abc123';
  assert.throws(
    () => service.exportToFile(path.join(directory, 'unsafe.json'), unsafe),
    /疑似包含密码、令牌或私钥/
  );
  assert.equal(fs.existsSync(path.join(directory, 'unsafe.json')), false);
});

test('导出拒绝符号链接目标且不留下半完成文件', t => {
  const directory = makeTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const realPath = path.join(directory, 'real.json');
  const linkPath = path.join(directory, 'link.json');
  fs.writeFileSync(realPath, 'keep');
  fs.symlinkSync(realPath, linkPath);

  const service = new RelationshipBoardExportService();
  assert.throws(() => service.exportToFile(linkPath, portableStore()), /不能是符号链接/);
  assert.equal(fs.readFileSync(realPath, 'utf8'), 'keep');
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
});

test('导出可安全替换已有普通文件且不留下旧文件或临时文件', t => {
  const directory = makeTemporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'board.json');
  fs.writeFileSync(outputPath, 'previous content');

  new RelationshipBoardExportService().exportToFile(outputPath, portableStore());

  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).format, EXPORT_FORMAT);
  assert.deepEqual(fs.readdirSync(directory), ['board.json']);
});
