(function exposeArchitectureSnapshotProjection(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ArchitectureSnapshotProjection = api;
})(typeof window !== 'undefined' ? window : globalThis, function createArchitectureSnapshotProjection() {
  const MAX_COMPONENTS = 120;
  const MAX_BOUNDARIES = 32;
  const MAX_CONNECTIONS = 300;
  const CARD_WIDTH = 280;
  const CARD_HEIGHT = 143;
  const GROUP_PADDING_X = 28;
  const GROUP_HEADER_HEIGHT = 54;
  const GROUP_PADDING_BOTTOM = 28;

  function cleanText(value, maxLength, fallback = '') {
    const text = String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (text || fallback).slice(0, maxLength);
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(-100000, Math.min(100000, number)) : fallback;
  }

  function idFor(prefix, snapshotId, index) {
    const safeSnapshotId = cleanText(snapshotId, 32, 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `entity_${prefix}_${safeSnapshotId}_${index}`.slice(0, 79);
  }

  function relationshipId(snapshotId, index) {
    const safeSnapshotId = cleanText(snapshotId, 32, 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `relationship_arch_${safeSnapshotId}_${index}`.slice(0, 79);
  }

  function componentPosition(component, index) {
    const raw = Array.isArray(component?.pos) ? component.pos : [];
    const column = index % 4;
    const row = Math.floor(index / 4);
    return {
      x: Math.round(finite(raw[0], 80 + column * 360)),
      y: Math.round(finite(raw[1], 80 + row * 220))
    };
  }

  function project(document, metadata = {}) {
    const components = Array.isArray(document?.components) ? document.components.slice(0, MAX_COMPONENTS) : [];
    const boundaries = Array.isArray(document?.boundaries) ? document.boundaries.slice(0, MAX_BOUNDARIES) : [];
    const connections = Array.isArray(document?.connections) ? document.connections.slice(0, MAX_CONNECTIONS) : [];
    const snapshotId = cleanText(metadata.snapshotId, 32, 'unknown');
    const componentBySourceId = new Map();
    const entities = [];
    const placements = [];

    components.forEach((component, index) => {
      const sourceId = cleanText(component?.id, 160, `component-${index + 1}`);
      const id = idFor('arch', snapshotId, index);
      const position = componentPosition(component, index);
      componentBySourceId.set(sourceId, id);
      entities.push({
        id,
        type: 'architecture',
        name: cleanText(component?.label, 160, sourceId),
        details: {
          architectureComponentId: sourceId,
          architectureKind: cleanText(component?.type, 80, 'external'),
          architectureSublabel: cleanText(component?.sublabel, 240),
          architectureTag: cleanText(component?.tag, 160),
          architectureSnapshotId: snapshotId,
          repositoryHead: cleanText(metadata.repositoryHead, 80),
          notes: cleanText(component?.sublabel, 1000)
        },
        source: 'imported',
        evidenceSummary: `Archify ${cleanText(metadata.diagramType, 40, 'architecture')} · ${cleanText(metadata.repositoryName, 160, '代码架构')}`
      });
      placements.push({ entityId: id, x: position.x, y: position.y, architectureReadOnly: true, locked: true });
    });

    const componentPositions = new Map(components.map((component, index) => {
      const position = componentPosition(component, index);
      return [cleanText(component?.id, 160, `component-${index + 1}`), position];
    }));
    const groupIds = new Map();
    boundaries.forEach((boundary, index) => {
      const wraps = Array.isArray(boundary?.wraps)
        ? boundary.wraps.map(value => cleanText(value, 160)).filter(Boolean)
        : [];
      const memberIds = wraps.map(sourceId => componentBySourceId.get(sourceId)).filter(Boolean);
      if (!memberIds.length) return;
      const id = idFor('archgroup', snapshotId, index);
      groupIds.set(cleanText(boundary?.label, 160, `boundary-${index + 1}`), id);
      const bounds = memberIds.map(entityId => {
        const sourceId = [...componentBySourceId.entries()].find(([, value]) => value === entityId)?.[0];
        const position = componentPositions.get(sourceId) || { x: 80, y: 80 };
        return { ...position, width: CARD_WIDTH, height: CARD_HEIGHT };
      });
      const minX = Math.min(...bounds.map(item => item.x));
      const minY = Math.min(...bounds.map(item => item.y));
      const maxX = Math.max(...bounds.map(item => item.x + item.width));
      const maxY = Math.max(...bounds.map(item => item.y + item.height));
      entities.push({
        id,
        type: 'group',
        name: cleanText(boundary?.label, 160, `架构边界 ${index + 1}`),
        details: {
          architectureBoundaryKind: cleanText(boundary?.kind, 80, 'region'),
          architectureSnapshotId: snapshotId,
          notes: 'Archify 代码架构边界，只读显示'
        },
        source: 'imported',
        transient: true
      });
      placements.push({
        entityId: id,
        x: minX - GROUP_PADDING_X,
        y: minY - GROUP_HEADER_HEIGHT,
        groupWidth: Math.max(320, maxX - minX + GROUP_PADDING_X * 2),
        groupHeight: Math.max(180, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING_BOTTOM),
        groupLayout: 'manual',
        groupAppearance: 'outline',
        architectureReadOnly: true,
        locked: true
      });
      memberIds.forEach(memberId => {
        const placement = placements.find(item => item.entityId === memberId);
        if (placement) placement.groupId = id;
      });
    });

    const relationships = [];
    connections.forEach((connection, index) => {
      const sourceId = componentBySourceId.get(cleanText(connection?.from, 160));
      const targetId = componentBySourceId.get(cleanText(connection?.to, 160));
      if (!sourceId || !targetId || sourceId === targetId) return;
      relationships.push({
        id: relationshipId(snapshotId, index),
        type: 'connects_to',
        sourceId,
        targetId,
        ...(cleanText(connection?.label, 80) ? { label: cleanText(connection.label, 80) } : {}),
        source: 'imported',
        evidenceSummary: `Archify 连接 · ${cleanText(metadata.repositoryHead, 80, '未关联提交')}`
      });
    });

    return {
      entities,
      relationships,
      placements,
      metadata: {
        source: 'archify',
        snapshotId,
        title: cleanText(document?.meta?.title, 160, '代码架构'),
        diagramType: cleanText(document?.diagram_type, 40, 'architecture'),
        repositoryName: cleanText(metadata.repositoryName, 160),
        repositoryPath: cleanText(metadata.repositoryPath, 1000),
        repositoryHead: cleanText(metadata.repositoryHead, 80),
        generatedAt: cleanText(metadata.generatedAt, 80),
        componentCount: components.length,
        boundaryCount: boundaries.length,
        connectionCount: relationships.length
      }
    };
  }

  return Object.freeze({ project, MAX_COMPONENTS, MAX_BOUNDARIES, MAX_CONNECTIONS });
});
