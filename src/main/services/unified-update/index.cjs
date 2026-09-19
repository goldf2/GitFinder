/* oxlint-disable typescript/no-require-imports -- Shared CJS runtime used by both Electron module systems. */
'use strict';
const crypto = require('node:crypto');
const https = require('node:https');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const VERSION = '1.1.0';
const MAX_MANIFEST = 1024 * 1024;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function fail(message) { throw new Error(message); }
function httpsURL(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) fail('更新来源必须是无嵌入凭据的 HTTPS 地址');
  return url;
}
function rawKey(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'base64');
  if (raw.length !== 32) fail('更新公钥无效');
  return crypto.createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]), format:'der', type:'spki'});
}
function signature(key, data, sig) { return crypto.verify(null,data,rawKey(key),Buffer.from(sig,'base64')); }
function compareOS(a,b) {
  function parts(v) { if (!/^\d{1,6}(\.\d{1,6}){0,3}$/.test(v)) fail('系统版本条件无效'); return [...v.split('.').map(Number),0,0,0].slice(0,4); }
  const x=parts(a),y=parts(b);for(let i=0;i<4;i++) if(x[i]!==y[i]) return Math.sign(x[i]-y[i]);return 0;
}
function compatibleOS(current,min='',max='') {
  if (min && max && compareOS(min,max)>0) fail('系统版本区间倒置');
  const above=!min || compareOS(current,min)>=0, below=!max || compareOS(current,max)<=0;
  return above && below;
}
function verifyEnvelope(raw, config, now = Date.now()) {
  if (raw.length > MAX_MANIFEST) fail('更新清单过大');
  const e=JSON.parse(raw); if(e.schema!==1) fail('不支持的更新清单协议');
  let key=config.publicKey,id=config.keyId;
  const chain=e.keyTransitions || [],seenKeys=new Set([id]);
  if(!Array.isArray(chain)||chain.length>32) fail('密钥轮换链无效');
  for(const [i,t] of chain.entries()) {
    const bytes=Buffer.from(t.payload,'base64'),p=JSON.parse(bytes);
    if(p.appId!==config.appId || p.version!==i+1 || p.fromKeyId!==id || typeof p.toKeyId!=='string' || !p.toKeyId || p.toKeyId.length>128 || seenKeys.has(p.toKeyId) || p.toPublicKey===key || !signature(key,bytes,t.oldSignature) || !signature(p.toPublicKey,bytes,t.newSignature)) fail('密钥轮换链校验失败');
    key=p.toPublicKey;id=p.toKeyId;seenKeys.add(id);
  }
  const bytes=Buffer.from(e.payload,'base64');
  if(e.keyId!==id || !signature(key,bytes,e.signature)) fail('更新清单签名校验失败');
  const p=JSON.parse(bytes), issued=Date.parse(p.issuedAt), expires=Date.parse(p.expiresAt);
  if(p.appId!==config.appId || !Number.isSafeInteger(p.manifestRevision) || p.manifestRevision<=0 || !Number.isFinite(issued) || issued>now+86400000 || !Number.isFinite(expires) || expires<=now || expires<=issued || !Array.isArray(p.releases) || !p.releases.length || p.releases.length>64) fail('更新清单身份或有效期无效');
  const targets=new Set(), identities={};
  for(const r of p.releases) {
    const target=`${r.channel}/${r.build}`;
    if(targets.has(target) || !Number.isSafeInteger(r.build) || r.build<=0 || typeof r.version!=='string' || !/^\d+(\.\d+){2,3}(-[\w.-]+)?$/.test(r.version) || Buffer.byteLength(r.notes || '')>8000 || !Number.isSafeInteger(r.minUpdaterProtocol ?? 0) || (r.minUpdaterProtocol ?? 0)<0 || !Number.isSafeInteger(r.minInstalledBuild ?? 0) || (r.minInstalledBuild ?? 0)<0) fail('更新版本资料无效');
    targets.add(target);
    const pkg=r.platforms?.[config.platform]; if(!pkg) continue;
    if(!Number.isSafeInteger(pkg.size)||pkg.size<=0||pkg.size>8*1024**3 || !/^[a-f\d]{64}$/i.test(pkg.sha256) || !Array.isArray(pkg.sources) || !pkg.sources.length || pkg.sources.length>32 || !pkg.sources.some(s=>s.enabled===true)) fail('更新安装包资料无效');
    const ids=new Set(); for(const source of pkg.sources) {
      if(typeof source.id!=='string'||!source.id||!source.name||ids.has(source.id)||typeof source.enabled!=='boolean') fail('更新源配置无效');
      ids.add(source.id); httpsURL(source.url);
    }
    compatibleOS(config.osVersion,pkg.minOS,pkg.maxOS);
    const identity=`${r.build}/${pkg.size}/${pkg.sha256.toLowerCase()}`, name=`${r.channel}/${r.version}/${config.platform}`;
    if(identities[name] && identities[name]!==identity) fail('同版本安装包冲突');
    identities[name]=identity;identities[`${target}/${config.platform}`]=`${r.version}/${identity}`;
  }
  const release=p.releases.filter(r=>r.channel===config.channel && r.platforms?.[config.platform] && !r.withdrawn && (r.minUpdaterProtocol ?? 0)<=1 && (r.minInstalledBuild ?? 0)<=config.build && compatibleOS(config.osVersion,r.platforms[config.platform].minOS,r.platforms[config.platform].maxOS)).sort((a,b)=>b.build-a.build)[0];
  if(!release) fail('没有适合当前系统和更新器的版本，请查看手动升级说明');
  return {payload:p,payloadHash:hash(bytes),keyVersion:chain.length,identities,release,package:release.platforms[config.platform]};
}
function acceptManifest(previous, next) {
  const revision=previous?.revision || 0,keyVersion=previous?.keyVersion || 0;
  if(next.payload.manifestRevision<revision || next.keyVersion<keyVersion || (next.payload.manifestRevision===revision && previous.payloadHash && previous.payloadHash!==next.payloadHash)) fail('更新信任记录回退或清单冲突');
  const identities={...previous?.identities};
  for(const [id,value] of Object.entries(next.identities)) {if(identities[id] && identities[id]!==value) fail('已发布版本的安装包身份发生变化');identities[id]=value;}
  return {revision:next.payload.manifestRevision,payloadHash:next.payloadHash,keyVersion:next.keyVersion,identities};
}
function orderSources(sources,scores={}) {
  const active=sources.filter(s=>s.enabled),best=Math.max(0,...active.map(s=>scores[s.id] || 0));
  const selected=best>0 ? active.find(s=>(scores[s.id] || 0)>=best*.9) : null;
  return selected ? [selected,...active.filter(s=>s.id!==selected.id)] : active;
}
// No ambient credentials/cookies, HTTPS redirects only, bounded idle + total duration.
function request(raw,{signal,timeout=12000,headers={}}={},redirects=0) {
  return new Promise((resolve,reject)=>{
    const url=httpsURL(raw);
    const req=https.get(url,{headers:{'User-Agent':'personal-app-updater',...headers},signal},res=>{
      if([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if(redirects>=5 || !res.headers.location) {reject(new Error('更新源重定向无效'));return;}
        try {resolve(request(new URL(res.headers.location,url).href,{signal,timeout,headers},redirects+1));} catch(error) {reject(error);}return;
      }
      if(res.statusCode!==200 && !(headers.Range && res.statusCode===206)) {res.resume();reject(new Error(`更新来源返回 HTTP ${res.statusCode}`));return;}
      resolve(res);
    });
    req.setTimeout(timeout,()=>req.destroy(new Error('更新来源超时')));
    req.on('error',reject);
  });
}
async function bounded(raw,options,limit,transport=request) {
  const stream=await transport(raw,options),chunks=[];let total=0;
  try {for await(const chunk of stream) {const remaining=limit-total;if(chunk.length>remaining) {if(!options.probe) fail('更新清单过大');chunks.push(chunk.subarray(0,remaining));total=limit;break;}chunks.push(chunk);total+=chunk.length;if(options.probe&&total===limit) break;}} finally {stream.destroy();}
  return Buffer.concat(chunks,total);
}
function combined(signal,timeout) {return signal ? AbortSignal.any([signal,AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);}
async function readState(file) {try{return JSON.parse(await fsp.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw new Error('本地更新信任记录损坏');}}
async function saveState(file,value) {await fsp.mkdir(path.dirname(file),{recursive:true,mode:0o700});const temporary=`${file}.${crypto.randomUUID()}.tmp`;try{await fsp.writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await fsp.rename(temporary,file);}finally{await fsp.rm(temporary,{force:true});}}
class UpdateClient {
  constructor(config,{transport=request}={}) {this.config=config;this.transport=transport;this.cache=new Map();this.prepared=null;this.busy=false;}
  async check({signal}={}) {
    const candidates=[],revisions=new Map();let conflict=false;
    for(const feed of this.config.feeds) {
      signal?.throwIfAborted();
      try {
        const raw=await bounded(feed,{signal:combined(signal,12000)},MAX_MANIFEST,this.transport);
        const next=verifyEnvelope(raw,this.config);
        if(revisions.has(next.payload.manifestRevision)&&revisions.get(next.payload.manifestRevision)!==next.payloadHash) conflict=true;
        revisions.set(next.payload.manifestRevision,next.payloadHash);candidates.push(next);
      } catch {signal?.throwIfAborted();}
    }
    if(conflict) fail('同修订清单内容冲突，已停止更新');
    const selected=candidates.sort((a,b)=>b.payload.manifestRevision-a.payload.manifestRevision)[0];if(!selected) fail('无法取得有效的统一更新清单，请重试');
    const previous=await readState(this.config.stateFile),accepted=acceptManifest(previous,selected);
    signal?.throwIfAborted();await saveState(this.config.stateFile,accepted);this.prepared=selected;
    return {...selected,available:selected.release.build>this.config.build};
  }
  async download({signal,onProgress=()=>{},sourceId='auto'}={}) {
    if(!this.prepared) fail('请先检查更新');if(this.busy) fail('更新下载正在进行');this.busy=true;
    const target=this.prepared,pkg=target.package;
    const sources=pkg.sources.filter(s=>s.enabled && (sourceId==='auto'||s.id===sourceId));
    if(!sources.length){this.busy=false;fail('所选更新源不可用');}
    const cacheKey=pkg.sha256+JSON.stringify(sources),cached=this.cache.get(cacheKey);
    let scores=cached && Date.now()-cached.at<600000 ? cached.scores : null;
    const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'verified-app-update-'));
    const filename=path.join(directory,'package'+path.extname(pkg.file));
    try {
      if(sourceId==='auto'&&!scores) {
        scores={};
        for(const [i,s] of sources.entries()) {
          signal?.throwIfAborted();onProgress({phase:'probing',source:s.name,message:`正在测速 ${i+1}/${sources.length} · ${s.name}`});
          const started=Date.now();
          try {const bytes=await bounded(s.url,{signal:combined(signal,3000),timeout:3000,probe:true,headers:{Range:'bytes=0-262143'}},262144,this.transport);scores[s.id]=bytes.length/Math.max((Date.now()-started)/1000,.001);} catch {signal?.throwIfAborted();scores[s.id]=0;}
        }
        if(this.cache.size>8)this.cache.clear();this.cache.set(cacheKey,{at:Date.now(),scores});
      }
      for(const s of orderSources(sources,scores || {})) {
        signal?.throwIfAborted();
        try {
          const response=await this.transport(s.url,{signal:combined(signal,30*60*1000),timeout:30000});
          const digest=crypto.createHash('sha256');let count=0;const start=Date.now();
          const validate=new Transform({transform(chunk,encoding,callback){count+=chunk.length;if(count>pkg.size){callback(new Error('安装包超过声明大小'));return;}digest.update(chunk);onProgress({phase:'downloading',source:s.name,transferred:count,total:pkg.size,percent:count/pkg.size*100,bytesPerSecond:count/Math.max((Date.now()-start)/1000,.001)});callback(null,chunk);}});
          await pipeline(response,validate,fs.createWriteStream(filename,{flags:'wx',mode:0o600}),{signal});
          if(count!==pkg.size || digest.digest('hex')!==pkg.sha256.toLowerCase()) fail('安装包大小或摘要不匹配');
          onProgress({phase:'verified',source:s.name,percent:100});
          return {file:filename,directory,release:target.release,package:pkg};
        } catch {this.cache.delete(cacheKey);await fsp.rm(filename,{force:true});signal?.throwIfAborted();}
      }
      fail('所有来源下载失败，请重试或检查下载源');
    } catch(error) {await fsp.rm(directory,{recursive:true,force:true});throw error;}
    finally {this.busy=false;}
  }
}
module.exports={VERSION,UpdateClient,verifyEnvelope,acceptManifest,orderSources,compareOS,compatibleOS,httpsURL,hash,request,bounded,rawKey};
