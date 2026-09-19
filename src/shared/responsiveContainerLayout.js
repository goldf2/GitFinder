// Pure, gesture-baseline layout: no DOM, persistence, source mutation or scaling.
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ResponsiveContainerLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const EDGES = ['top','right','bottom','left','top-left','top-right','bottom-left','bottom-right'];
  const container = node => ['relationshipGroup','hostBubble'].includes(node?.type);
  const size = n => ({ width: Number(n?.measured?.width || n?.width || n?.style?.width) || 280,
    height: Number(n?.measured?.height || n?.height || n?.style?.height) || 143 });
  const children = (nodes, parent) => nodes.filter(n => n.parentId === parent.id
    || (!n.parentId && parent.type === 'hostBubble' && parent.data?.memberIds?.includes(n.id)));
  function descendants(nodes, root) {
    const result = new Set(); const todo = [...children(nodes,root)];
    while(todo.length) { const n=todo.pop(); if(result.has(n.id))continue; result.add(n.id); todo.push(...children(nodes,n)); }
    return result;
  }
  function canResize(nodes, id) {
    const map=new Map(nodes.map(n=>[n.id,n])), n=map.get(id);
    if(!container(n)||n.data?.resizeBlocked)return false;
    const ids=descendants(nodes,n);
    const affected=[n,...nodes.filter(x=>ids.has(x.id))];
    let parent=map.get(n.parentId); const seen=new Set([id]);
    while(parent&&!seen.has(parent.id)){seen.add(parent.id);affected.push(parent);parent=map.get(parent.parentId);}
    return !affected.some(x=>x.data?.placement?.locked);
  }
  function absolute(nodes) {
    const map=new Map(nodes.map(n=>[n.id,n])),cache=new Map();
    const visit=(n,seen=new Set())=>{if(!n||seen.has(n.id))return{x:0,y:0};if(cache.has(n.id))return cache.get(n.id);seen.add(n.id);
      const p=visit(map.get(n.parentId),seen),v={x:p.x+n.position.x,y:p.y+n.position.y};cache.set(n.id,v);return v;};
    nodes.forEach(n=>visit(n));return cache;
  }
  function setSize(node,width,height) {
    node.style={...node.style,width,height};node.width=width;node.height=height;
    node.measured={...node.measured,width,height};
    node.data={...node.data,placement:{...node.data?.placement,containerLayout:'wrap',groupWidth:width,groupHeight:height,
      ...(node.type==='relationshipGroup'?{groupLayout:'manual'}:{})}};
  }
  function resize(input,id,change,options={}) {
    const unchanged={nodes:input,changed:false};
    if(!EDGES.includes(change?.edge)||!Number.isFinite(change.dx)||!Number.isFinite(change.dy)||!canResize(input,id))return unchanged;
    const old=input.find(n=>n.id===id),oldSize=size(old),edge=change.edge;
    if((!edge.includes('left')&&!edge.includes('right')||Math.abs(change.dx)<.01)
      &&(!edge.includes('top')&&!edge.includes('bottom')||Math.abs(change.dy)<.01))return unchanged;
    const nodes=input.map(n=>({...n,position:{...n.position},style:{...n.style},data:{...n.data,placement:{...n.data?.placement}}}));
    const current=nodes.find(n=>n.id===id),world=absolute(input),origin=world.get(id);
    const gapX=Math.max(16,Number(options.horizontalSpacing)||24),gapY=Math.max(16,Number(options.verticalSpacing)||24);
    const header=Math.max(current.type==='hostBubble'?88:72,Number(current.data?.headerHeight)||0,Number(options.headerHeight)||72),padding=24;
    const items=children(nodes,current).sort((a,b)=>{
      const pa=world.get(a.id),pb=world.get(b.id);return pa.y-pb.y||pa.x-pb.x||a.id.localeCompare(b.id);
    });
    const polygon=current.data?.placement?.groupShape==='polygon';
    const largest=Math.max(0,...items.map(n=>size(n).width));
    const minWidth=Math.max(current.type==='hostBubble'?424:320,Number(options.minTitleWidth)||0,
      polygon?(largest+padding*2)/.76:largest+padding*2);
    let width=oldSize.width+(edge.includes('left')?-change.dx:edge.includes('right')?change.dx:0);
    width=Math.ceil(Math.min(100000,Math.max(minWidth,width)));
    if(minWidth>100000)return unchanged;
    const inset=polygon?Math.max(padding,width*.12+padding):padding;
    let x=inset,y=header,rowHeight=0;
    const positions=new Map();
    for(const n of items){const s=size(n);
      if(x>inset&&x+s.width>width-inset+.01){x=inset;y+=rowHeight+gapY;rowHeight=0;}
      positions.set(n.id,{x,y});x+=s.width+gapX;rowHeight=Math.max(rowHeight,s.height);
    }
    const needed=Math.max(180,y+rowHeight+padding);
    if(needed>100000)return unchanged;
    let height=oldSize.height+(edge.includes('top')?-change.dy:edge.includes('bottom')?change.dy:0);
    height=Math.ceil(Math.min(100000,Math.max(needed,height)));
    current.position={x:old.position.x+(edge.includes('left')?oldSize.width-width:0),
      y:old.position.y+(edge.includes('top')?oldSize.height-height:0)};
    setSize(current,width,height);
    const movedOrigin={x:origin.x+current.position.x-old.position.x,y:origin.y+current.position.y-old.position.y};
    for(const n of items){const p=positions.get(n.id);
      n.position=n.parentId===id?p:{x:movedOrigin.x+p.x,y:movedOrigin.y+p.y};
    }
    // Keep enclosing frames large enough without moving unrelated siblings in
    // world space. A nested container is a single layout item, never scaled.
    const byId=new Map(nodes.map(n=>[n.id,n]));let parent=byId.get(current.parentId);const seen=new Set([id]);
    while(parent&&!seen.has(parent.id)){
      seen.add(parent.id);if(!container(parent))break;
      const kids=children(nodes,parent),s=size(parent);
      const parentHeader=Math.max(parent.type==='hostBubble'?88:72,Number(parent.data?.headerHeight)||0,header);
      const shiftX=Math.min(0,...kids.filter(n=>n.parentId===parent.id).map(n=>n.position.x-padding));
      const shiftY=Math.min(0,...kids.filter(n=>n.parentId===parent.id).map(n=>n.position.y-parentHeader));
      const w=Math.max(s.width,...kids.map(n=>n.position.x+size(n).width+padding))-shiftX;
      const h=Math.max(s.height,...kids.map(n=>n.position.y+size(n).height+padding))-shiftY;
      if(w>100000||h>100000)return unchanged;
      if(w!==s.width||h!==s.height||shiftX||shiftY){
        parent.position={x:parent.position.x+shiftX,y:parent.position.y+shiftY};
        for(const n of kids)if(n.parentId===parent.id)n.position={x:n.position.x-shiftX,y:n.position.y-shiftY};
        setSize(parent,w,h);
      }
      parent=byId.get(parent.parentId);
    }
    return {nodes,changed:true};
  }
  return { EDGES, size, canResize, resize };
});
