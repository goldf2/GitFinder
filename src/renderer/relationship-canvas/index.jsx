import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  NodeToolbar,
  Position,
  ReactFlow,
  SelectionMode,
  useUpdateNodeInternals
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './relationshipCanvas.css';
import Adapter from '../../shared/relationshipFlowAdapter';

const HANDLE_POSITIONS = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left
};

const RelationshipEdge = memo(function RelationshipEdge({
  id, data, label, markerEnd, style, sourceX, sourceY, targetX, targetY
}) {
  const path = data?.routedPath || `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  const labelX = Number(data?.labelX);
  const labelY = Number(data?.labelY);
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
    {label && Number.isFinite(labelX) && Number.isFinite(labelY) ? <EdgeLabelRenderer>
      <span className="gf-flow-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span>
    </EdgeLabelRenderer> : null}
  </>;
});

function ConnectionHandles({ nodeId, handles = [] }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const signature = handles.map(handle => `${handle.id}:${handle.side}:${handle.offset}`).join('|');
  useLayoutEffect(() => {
    updateNodeInternals(nodeId);
  }, [nodeId, signature, updateNodeInternals]);
  return handles.map(handle => <Handle
    key={handle.id}
    id={handle.id}
    type={handle.type}
    position={HANDLE_POSITIONS[handle.side]}
    className="gf-flow-handle"
    style={handle.side === 'left' || handle.side === 'right'
      ? { top: `${handle.offset}%` }
      : { left: `${handle.offset}%` }}
  />);
}

function entityGlyph(type) {
  return { server: '▰', deployment: '◆', endpoint: '↗', repository: '⑂', text: 'T', note: 'T', image: '▧', attachment: '⌁' }[type] || '•';
}

function entityKind(type) {
  return { endpoint: '访问点', deployment: '部署', server: '主机', repository: 'Git 仓库', text: '文字', image: '图片', attachment: '附件' }[type] || '元素';
}

function entitySubtitle(entity) {
  const details = entity.details || {};
  const runtime = entity.runtime || {};
  if (entity.type === 'endpoint') {
    const url = runtime.url || details.url || details.urlLabel || '';
    let protocol = details.protocol || '';
    try { protocol = new URL(url).protocol.replace(':', '').toUpperCase(); } catch (_) { /* Keep the supplied protocol. */ }
    return [
      protocol,
      runtime.httpStatus ? `HTTP ${runtime.httpStatus}` : '',
      Number.isFinite(runtime.latencyMs) ? `${runtime.latencyMs} ms` : ''
    ].filter(Boolean).join(' · ') || url || '访问点';
  }
  return runtime.environmentName || details.environmentName || details.environment
    || runtime.repositoryUrl || details.repositoryUrl || runtime.status || details.status || details.notes || '';
}

function entityUpdatedLabel(entity) {
  const runtime = entity.runtime || {};
  return runtime.observedAt || entity.details?.updatedAt || entity.details?.observedAt || '无待办';
}

function deploymentSignals(entity) {
  if (entity.type !== 'deployment') return [];
  const runtime = entity.runtime || {};
  const commit = String(runtime.commit || '').trim();
  const repositoryIds = Array.isArray(runtime.repositoryIds) ? runtime.repositoryIds : [];
  const missingIds = Array.isArray(runtime.missingRepositoryIds) ? runtime.missingRepositoryIds : [];
  const association = runtime.repositoryAssociation || {};
  const signals = [commit && commit !== 'HEAD' ? `最近部署 ${commit.slice(0, 8)}` : '提交未知'];
  if (missingIds.length) signals.push('本地目录缺失');
  else if (repositoryIds.length) signals.push('已关联本地');
  else if (association.mode === 'ambiguous') signals.push(`待确认 ${(association.candidateIds || []).length}`);
  return signals;
}

function CanvasElementContent({ data, entity }) {
  const details = entity.details || {};
  if (entity.type === 'text') return <div
    className="gf-flow-text-element nodrag"
    style={{ color: details.color || '#334155', fontSize: `${Number(details.fontSize) || 24}px`, textAlign: details.align || 'left' }}
    onDoubleClick={() => data.onAction?.('edit-canvas-element', entity)}
  >{details.content || entity.name}</div>;
  if (entity.type === 'image') return <figure className="gf-flow-media-element nodrag" onDoubleClick={() => data.onAction?.('edit-canvas-element', entity)}>
    {details.imageData ? <img src={details.imageData} alt={details.caption || entity.name} style={{ objectFit: details.fit || 'contain' }} /> : <div className="gf-flow-media-placeholder">图片未加载</div>}
    {details.caption ? <figcaption>{details.caption}</figcaption> : null}
  </figure>;
  if (entity.type === 'attachment') return <div className="gf-flow-attachment-element nodrag" onDoubleClick={() => data.onAction?.('edit-canvas-element', entity)}>
    <span aria-hidden="true">⌑</span><strong>{entity.name}</strong><small>{details.caption || '双击编辑文件说明'}</small>
  </div>;
  return null;
}

function ToolbarButton({ data, action, entity, children, className = '', ...props }) {
  return <button
    type="button"
    className={`nodrag nopan${className ? ` ${className}` : ''}`}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      data.onAction?.(action, action === 'toggle-descendants' ? (data.placement?.entityId || entity?.id) : entity);
    }}
    {...props}
  >{children}</button>;
}

const RelationshipCard = memo(function RelationshipCard({ id, data, selected }) {
  const { entity, tone } = data;
  const subtitle = entitySubtitle(entity);
  const endpointUrl = entity.runtime?.url || entity.details?.url || entity.details?.urlLabel;
  const showsEndpointPreview = entity.type === 'endpoint' && data.placement.endpointView === 'web' && endpointUrl;
  const isCanvasElement = ['text', 'image', 'attachment'].includes(entity.type);
  const deploymentMeta = deploymentSignals(entity);
  if (isCanvasElement) return <article className={`gf-flow-canvas-element is-${entity.type}${selected ? ' is-selected' : ''}`}>
    <ConnectionHandles nodeId={id} handles={data.connectionHandles} />
    <NodeToolbar isVisible={selected} className="gf-flow-node-toolbar" position={Position.Bottom} offset={12}>
      <ToolbarButton data={data} action="edit-canvas-element" entity={entity}>编辑</ToolbarButton>
      <ToolbarButton data={data} action="details" entity={entity}>属性</ToolbarButton>
    </NodeToolbar>
    <CanvasElementContent data={data} entity={entity} />
  </article>;
  const snapClass = data.snapState ? `${data.snapState.x ? ' is-snap-x' : ''}${data.snapState.y ? ' is-snap-y' : ''}` : '';
  return <article className={`gf-flow-card is-${tone}${showsEndpointPreview ? ' is-endpoint-preview' : ''}${selected ? ' is-selected' : ''}${data.filterState ? ` is-filter-${data.filterState}` : ''}${snapClass}`}>
    <ConnectionHandles nodeId={id} handles={data.connectionHandles} />
    <NodeToolbar isVisible={selected} className="gf-flow-node-toolbar" position={Position.Bottom} offset={12}>
      <ToolbarButton data={data} action="details" entity={entity}>详情</ToolbarButton>
      <ToolbarButton
        data={data}
        action="toggle-descendants"
        entity={entity}
        className={data.placement.moveWithDescendants ? 'is-active' : ''}
        aria-pressed={data.placement.moveWithDescendants === true}
      >固定下级</ToolbarButton>
      {entity.type === 'endpoint' && endpointUrl
        ? <ToolbarButton data={data} action="toggle-endpoint-view" entity={entity}>{showsEndpointPreview ? '卡片' : '网页'}</ToolbarButton>
        : null}
    </NodeToolbar>
    <div className="gf-flow-card-accent" />
    <header>
      <span className="gf-flow-card-icon" aria-hidden="true">{entityGlyph(entity.type)}</span>
      <span className="gf-flow-card-heading">
        <small>{entityKind(entity.type)}</small>
        <strong title={entity.name}>{entity.name}</strong>
      </span>
      <span className="gf-flow-status"><i />{tone === 'healthy' ? '正常' : tone === 'warning' ? '预警' : '停止/未知'}</span>
    </header>
    <p className="gf-flow-card-subtitle" title={subtitle}>{subtitle || '暂无详细信息'}</p>
    {deploymentMeta.length ? <div className="gf-flow-deployment-signals">{deploymentMeta.map(signal => <span key={signal}>{signal}</span>)}</div> : null}
    {showsEndpointPreview ? <iframe
      className="gf-flow-endpoint-preview nodrag nopan"
      src={endpointUrl}
      title={`${entity.name} 网页预览`}
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
    /> : null}
    <footer>
      <span>{entityUpdatedLabel(entity)}</span>
      {entity.type === 'endpoint' && endpointUrl
        ? <span className="gf-flow-endpoint-actions">
          <button type="button" className="nodrag nopan" onClick={() => data.onAction?.('toggle-endpoint-view', entity)}>{showsEndpointPreview ? '卡片' : '预览'}</button>
          <button type="button" className="nodrag nopan" onClick={() => data.onAction?.('open-endpoint', entity)}>访问</button>
        </span>
        : <button type="button" className="nodrag nopan" onClick={() => data.onAction?.('details', entity)}>详情</button>}
    </footer>
  </article>;
});

const RelationshipGroup = memo(function RelationshipGroup({ id, data, selected }) {
  const entity = data.entity;
  const requestedShape = data.placement.groupShape || data.placement.projectGroupShape || 'rounded';
  const shape = requestedShape === 'polygon' ? 'polygon' : 'rounded';
  const style = {
    '--group-background': data.placement.groupBackground || '#7a67c7',
    '--group-border': data.placement.groupBorder || '#7a67c7'
  };
  return <section className={`gf-flow-group is-${shape}${selected ? ' is-selected' : ''}${data.filterState ? ` is-filter-${data.filterState}` : ''}`} style={style}>
    <ConnectionHandles nodeId={id} handles={data.connectionHandles} />
    <NodeResizer
      isVisible={selected}
      minWidth={320}
      minHeight={220}
      keepAspectRatio={shape === 'polygon'}
      onResizeStart={() => data.onAction?.('resize-start', entity)}
      onResizeEnd={() => data.onAction?.('resize-end', entity)}
      lineClassName="gf-flow-resize-line"
      handleClassName="gf-flow-resize-handle"
    />
    <NodeToolbar isVisible className="gf-flow-group-title-toolbar" position={Position.Top} offset={8}>
      <button type="button" className="nodrag nopan" onClick={() => data.onAction?.('details', entity)}><strong>{entity.name}</strong></button>
      <span>{data.memberCount || 0} 个成员</span>
    </NodeToolbar>
    <NodeToolbar isVisible={selected} className="gf-flow-node-toolbar" position={Position.Top} offset={52}>
      <ToolbarButton data={data} action="arrange-group" entity={entity}>自动排列</ToolbarButton>
      <ToolbarButton
        data={data}
        action="toggle-descendants"
        entity={entity}
        className={data.placement.moveWithDescendants ? 'is-active' : ''}
        aria-pressed={data.placement.moveWithDescendants === true}
      >固定下级</ToolbarButton>
      <ToolbarButton data={data} action="edit-group" entity={entity}>编辑</ToolbarButton>
      <ToolbarButton data={data} action="delete-group" entity={entity} className="is-danger">删除</ToolbarButton>
    </NodeToolbar>
  </section>;
});

const NODE_TYPES = { relationshipCard: RelationshipCard, relationshipGroup: RelationshipGroup };
const EDGE_TYPES = { relationshipEdge: RelationshipEdge };

function Canvas({
  model,
  onModelChange,
  onAction,
  onSelectionChange,
  onInteractionStart,
  onInteractionEnd,
  onViewportChange,
  onReady,
  initialViewport,
  snapMode = 'smart',
  horizontalSpacing = 64,
  verticalSpacing = 36,
  groupTitleFontSize = 20,
  fitView = true
}) {
  const dispatchAction = useCallback((action, value, point) => {
    const result = onAction?.(action, value, point);
    if (action === 'toggle-descendants' && typeof result === 'boolean') {
      setNodes(current => current.map(node => node.id === value ? {
        ...node,
        data: { ...node.data, placement: { ...node.data.placement, moveWithDescendants: result } }
      } : node));
    }
    return result;
  }, [onAction]);
  const withActions = useCallback(items => items.map(node => ({ ...node, data: { ...node.data, onAction: dispatchAction } })), [dispatchAction]);
  const [nodes, setNodes] = useState(() => withActions(model.nodes));
  const [edges, setEdges] = useState(model.edges);
  const dragState = useRef(null);
  const modifierState = useRef({ alt: false });
  const viewportZoom = useRef(Number(initialViewport?.zoom) || 1);

  useEffect(() => setNodes(withActions(model.nodes)), [model.nodes, withActions]);
  useEffect(() => setEdges(model.edges), [model.edges]);
  useEffect(() => {
    const updateModifier = event => { modifierState.current.alt = event.altKey; };
    const clearModifier = () => { modifierState.current.alt = false; };
    window.addEventListener('keydown', updateModifier);
    window.addEventListener('keyup', updateModifier);
    window.addEventListener('blur', clearModifier);
    return () => {
      window.removeEventListener('keydown', updateModifier);
      window.removeEventListener('keyup', updateModifier);
      window.removeEventListener('blur', clearModifier);
    };
  }, []);

  const memberCounts = useMemo(() => nodes.reduce((counts, node) => {
    if (node.parentId) counts.set(node.parentId, (counts.get(node.parentId) || 0) + 1);
    return counts;
  }, new Map()), [nodes]);
  const displayedNodes = useMemo(() => nodes.map(node => node.type === 'relationshipGroup'
    ? { ...node, data: { ...node.data, memberCount: memberCounts.get(node.id) || 0 } } : node), [nodes, memberCounts]);

  const handleNodesChange = useCallback(changes => {
    setNodes(current => {
      let next = applyNodeChanges(changes, current);
      const userGeometryChange = changes.some(change => change.type === 'position'
        || (change.type === 'dimensions' && change.resizing === true)
        || change.type === 'remove');
      if (userGeometryChange) {
        const drag = dragState.current;
        if (drag) {
          next = Adapter.snapProjectDeployment(next, drag.primaryId, {
            snapMode,
            horizontalSpacing,
            verticalSpacing,
            zoom: viewportZoom.current,
            disabled: modifierState.current.alt
          });
          const primary = next.find(node => node.id === drag.primaryId);
          const changedIds = changes.filter(change => change.type === 'position').map(change => change.id);
          if (primary) next = Adapter.applyLinkedDrag(next, {
            ...drag,
            changedIds,
            delta: {
              x: (primary.position?.x || 0) - drag.primaryPosition.x,
              y: (primary.position?.y || 0) - drag.primaryPosition.y
            }
          });
        }
        next = Adapter.constrainProjectNodes(next);
        const routed = Adapter.rerouteFlowConnections(next, edges, { zoom: viewportZoom.current, groupTitleFontSize });
        next = routed.nodes;
        setEdges(routed.edges);
        onModelChange?.(routed);
      }
      return next;
    });
  }, [edges, groupTitleFontSize, horizontalSpacing, onModelChange, snapMode, verticalSpacing]);

  const handleNodeDragStart = useCallback((_, node) => {
    dragState.current = {
      primaryId: node.id,
      primaryPosition: { x: node.position?.x || 0, y: node.position?.y || 0 },
      linkedIds: node.data?.linkedNodeIds || [node.id],
      startPositions: Object.fromEntries(nodes.map(item => [item.id, { x: item.position?.x || 0, y: item.position?.y || 0 }]))
    };
    onInteractionStart?.('move', node);
  }, [nodes, onInteractionStart]);

  const handleNodeDragStop = useCallback((_, node) => {
    dragState.current = null;
    setNodes(current => Adapter.clearProjectSnap(current, node.id));
    onInteractionEnd?.('move', node);
  }, [onInteractionEnd]);

  const handleEdgesChange = useCallback(changes => {
    setEdges(current => applyEdgeChanges(changes, current));
  }, []);

  return <ReactFlow
    nodes={displayedNodes}
    edges={edges.map(edge => ({ ...edge, markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: edge.data?.diagnostic?.severity === 'error' ? '#d9485f' : '#747fbd'
    } }))}
    nodeTypes={NODE_TYPES}
    edgeTypes={EDGE_TYPES}
    onNodesChange={handleNodesChange}
    onEdgesChange={handleEdgesChange}
    onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => onSelectionChange?.({
      nodeIds: selectedNodes.map(node => node.id),
      edgeIds: selectedEdges.map(edge => edge.id)
    })}
    onNodeDragStart={handleNodeDragStart}
    onNodeDragStop={handleNodeDragStop}
    onMoveEnd={(_, viewport) => {
      viewportZoom.current = Number(viewport?.zoom) || 1;
      setNodes(current => {
        const routed = Adapter.rerouteFlowConnections(current, edges, { zoom: viewportZoom.current, groupTitleFontSize });
        setEdges(routed.edges);
        return routed.nodes;
      });
      onViewportChange?.(viewport);
    }}
    onNodeContextMenu={(event, node) => {
      event.preventDefault();
      onAction?.('context-node', node.data.entity, { clientX: event.clientX, clientY: event.clientY });
    }}
    onEdgeContextMenu={(event, edge) => {
      event.preventDefault();
      onAction?.('context-edge', edge.data?.relationship, { clientX: event.clientX, clientY: event.clientY });
    }}
    onPaneContextMenu={event => {
      event.preventDefault();
      onAction?.('context-pane', null, { clientX: event.clientX, clientY: event.clientY });
    }}
    onInit={onReady}
    minZoom={0.03}
    maxZoom={8}
    fitView={fitView}
    defaultViewport={initialViewport}
    fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
    panOnScroll
    panOnScrollSpeed={0.65}
    panOnDrag={[1, 2]}
    selectionOnDrag
    selectionMode={SelectionMode.Partial}
    selectionKeyCode={null}
    zoomOnScroll={false}
    zoomOnPinch
    zoomActivationKeyCode={['Meta', 'Control']}
    autoPanOnNodeDrag
    autoPanOnSelection
    autoPanSpeed={18}
    deleteKeyCode={null}
    nodesConnectable={false}
    elevateNodesOnSelect
    proOptions={{ hideAttribution: true }}
    className="gf-relationship-flow"
  >
    <Background variant={BackgroundVariant.Dots} gap={24} size={1.6} color="#cbd2df" />
    <Controls position="bottom-right" showInteractive={false} />
    <MiniMap
      position="bottom-right"
      pannable
      zoomable
      nodeStrokeWidth={3}
      nodeColor={node => node.type === 'relationshipGroup' ? '#edeaff' : ({ healthy: '#dff3e8', warning: '#fde6e8', inactive: '#edf0f4' }[node.data?.tone] || '#edf0f4')}
    />
  </ReactFlow>;
}

function mount(container, options = {}) {
  if (!(container instanceof Element)) throw new TypeError('Relationship canvas requires a DOM container');
  const root = createRoot(container);
  let instance = null;
  let current = { ...options };
  const render = next => {
    current = { ...current, ...next };
    root.render(<Canvas {...current} onReady={value => { instance = value; current.onReady?.(value); }} />);
  };
  render(current);
  return {
    update: render,
    setSelection: (selectedIds = [], selectedRelationshipId = '') => render({
      model: {
        nodes: current.model.nodes.map(node => ({ ...node, selected: selectedIds.includes(node.id) })),
        edges: current.model.edges.map(edge => ({ ...edge, selected: edge.id === selectedRelationshipId }))
      }
    }),
    fitView: next => instance?.fitView(next),
    setViewport: (viewport, next) => instance?.setViewport(viewport, next),
    zoomTo: (zoom, next) => instance?.zoomTo(zoom, next),
    setCenter: (x, y, next) => instance?.setCenter(x, y, next),
    getViewport: () => instance?.getViewport(),
    unmount: () => root.unmount()
  };
}

window.RelationshipCanvasEngine = { mount, toFlowModel: Adapter.toFlowModel, toPlacements: Adapter.toPlacements };
