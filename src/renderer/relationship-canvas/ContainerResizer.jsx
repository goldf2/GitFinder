import React, { useEffect, useRef } from 'react';
import { useViewport } from '@xyflow/react';

const sides = [['top','上边'],['right','右边'],['bottom','下边'],['left','左边'],
  ['top-left','左上角'],['top-right','右上角'],['bottom-left','左下角'],['bottom-right','右下角']];

// Own the pointer transaction: React Flow's stock resizer clamps to the old
// child extent before wrapping, which prevents narrowing a multi-column group.
export default function ContainerResizer({ id, data }) {
  const { zoom } = useViewport();
  const active = useRef(null);
  const cleanup = useRef(() => {});
  useEffect(() => () => { if (active.current) { active.current.dispatch('container-resize-cancel', data.entity); active.current=null; } cleanup.current(); }, []);
  function start(event, edge) {
    if (event.button !== 0 || event.isPrimary === false || data.resizeAllowed === false) return;
    event.preventDefault(); event.stopPropagation();
    const target=event.currentTarget, pointer=event.pointerId;
    const dispatch=data.onAction;
    if (dispatch?.('container-resize-start', data.entity, {nodeId:id}) === false) return;
    try { target.setPointerCapture(pointer); } catch (_) { dispatch?.('container-resize-cancel', data.entity); return; }
    const state={dispatch, edge, x:event.clientX, y:event.clientY, scale:Math.max(.03,zoom), pending:null, frame:null};
    active.current=state;
    const update=e=>({edge,dx:(e.clientX-state.x)/state.scale,dy:(e.clientY-state.y)/state.scale});
    const flush=()=>{if(state.frame!==null)cancelAnimationFrame(state.frame);state.frame=null;
      if(state.pending){dispatch('container-resize-preview',data.entity,state.pending);state.pending=null;}};
    const move=e=>{if(e.pointerId!==pointer||!active.current)return;e.preventDefault();e.stopPropagation();
      state.pending=update(e);if(state.frame===null)state.frame=requestAnimationFrame(flush);};
    const finish=(commit,e)=>{if(!active.current)return;if(e&&e.pointerId!==undefined&&e.pointerId!==pointer)return;
      e?.preventDefault();e?.stopPropagation();
      if(commit&&e?.clientX!==undefined){state.pending=update(e);flush();}
      if(state.frame!==null)cancelAnimationFrame(state.frame);
      active.current=null;cleanup.current();
      if(target.hasPointerCapture(pointer))target.releasePointerCapture(pointer);
      dispatch(commit?'container-resize-commit':'container-resize-cancel',data.entity);
    };
    const up=e=>finish(true,e),cancel=e=>finish(false,e);
    const key=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();finish(false,e);}};
    const blur=()=>finish(false);
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);
    target.addEventListener('pointercancel',cancel);target.addEventListener('lostpointercapture',cancel);
    window.addEventListener('keydown',key,true);window.addEventListener('blur',blur);
    cleanup.current=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);
      target.removeEventListener('pointercancel',cancel);target.removeEventListener('lostpointercapture',cancel);
      window.removeEventListener('keydown',key,true);window.removeEventListener('blur',blur);
      if(state.frame!==null)cancelAnimationFrame(state.frame);};
  }
  return <div className="gf-container-resizer" data-container-resizer={id}
    style={{'--resize-hit':`${8/Math.max(.03,zoom)}px`,'--resize-corner':`${10/Math.max(.03,zoom)}px`}}>
    {sides.map(([side,label])=><button key={side} type="button" data-container-resize={side}
      className={`gf-container-resize-control is-${side} nodrag nopan`}
      disabled={data.resizeAllowed===false}
      aria-label={`${data.entity.name} ${label}调整尺寸`}
      title={data.resizeAllowed===false?'容器、上级或内部部件已锁定，请先解锁':'拖动调整容器尺寸，内部自动换行；Esc 取消'}
      onPointerDown={event=>start(event,side)}
      onClick={event=>{event.preventDefault();event.stopPropagation();}} />)}
  </div>;
}
