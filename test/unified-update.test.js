const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {Readable}=require('node:stream');
const {verifyEnvelope,acceptManifest,orderSources,UpdateClient,hash,compatibleOS}=require('../src/main/services/unified-update/index.cjs');
function fixture() {
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519'), rawPublic=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const sources=['a','b','c'].map(id=>({id,name:id.toUpperCase(),enabled:true,url:`https://${id}.example/pkg.zip`}));
 const pkg={file:'pkg.zip',size:7,sha256:hash(Buffer.from('package')),sources};
 const config={appId:'test.app',keyId:'root',publicKey:rawPublic,channel:'stable',platform:'macos-arm64',build:1,osVersion:'15.0',feeds:['https://feed.example/updates.json']};
 const payload={appId:config.appId,manifestRevision:1,issuedAt:new Date(Date.now()-10000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),releases:[{channel:'stable',version:'1.0.1',build:2,notes:'test',platforms:{'macos-arm64':pkg}}]};
 const sign=p=>{const bytes=Buffer.from(JSON.stringify(p));return Buffer.from(JSON.stringify({schema:1,keyId:'root',payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,privateKey).toString('base64')}));};
 return {config,payload,pkg,sign,privateKey};
}
test('signed metadata rejects tampering, expiry, old OS/future updater; keeps bridge',()=>{
 const f=fixture();assert.equal(verifyEnvelope(f.sign(f.payload),f.config).release.build,2);
 const changed=JSON.parse(f.sign(f.payload));changed.payload=Buffer.from('{}').toString('base64');assert.throws(()=>verifyEnvelope(Buffer.from(JSON.stringify(changed)),f.config));
 assert.throws(()=>verifyEnvelope(f.sign(f.payload),f.config,Date.now()+7200000));
 const newer={...f.payload.releases[0],version:'1.0.2',build:3,platforms:{'macos-arm64':{...f.pkg,minOS:'16'}}};
 f.payload.releases.push(newer,{...newer,version:'1.0.3',build:4,minUpdaterProtocol:2});
 assert.equal(verifyEnvelope(f.sign(f.payload),f.config).release.build,2);
 assert.equal(verifyEnvelope(f.sign(f.payload),{...f.config,osVersion:'16'}).release.build,3);
});
test('same revision conflict and package mutation are rejected; source edits permitted with newer revision',()=>{
 const f=fixture(),first=verifyEnvelope(f.sign(f.payload),f.config),state=acceptManifest({},first);
 f.payload.releases[0].notes='changed';assert.throws(()=>acceptManifest(state,verifyEnvelope(f.sign(f.payload),f.config)));
 f.payload.manifestRevision++;assert.doesNotThrow(()=>acceptManifest(state,verifyEnvelope(f.sign(f.payload),f.config)));
 f.pkg.sha256='a'.repeat(64);assert.throws(()=>acceptManifest(state,verifyEnvelope(f.sign(f.payload),f.config)));
});
test('sequential probes choose B; corrupt B/A fall back to C; check makes no probes',async()=>{
 const f=fixture(),calls=[],root=await fs.mkdtemp(path.join(os.tmpdir(),'update-kit-test-'));
 try {
 const client=new UpdateClient({...f.config,stateFile:path.join(root,'state.json')},{transport:async(url,options)=>{
  const host=new URL(url).hostname;if(host==='feed.example'){calls.push('manifest');return Readable.from([f.sign(f.payload)]);}
  const probe=Boolean(options.headers?.Range);calls.push(`${probe?'probe':'download'}:${host}`);
  if(probe && host!=='b.example')await new Promise(r=>setTimeout(r,30));return Readable.from([Buffer.from(probe||host==='c.example'?'package':'corrupt')]);
 }});
 assert.equal((await client.check()).available,true);assert.deepEqual(calls,['manifest']);
 const result=await client.download();assert.equal(await fs.readFile(result.file,'utf8'),'package');
 assert.deepEqual(calls.slice(1),['probe:a.example','probe:b.example','probe:c.example','download:b.example','download:a.example','download:c.example']);await fs.rm(result.directory,{recursive:true});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('rotation requires both keys; fallback preserves original order',()=>{
 const f=fixture(),next=crypto.generateKeyPairSync('ed25519'),pub=next.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const payload=Buffer.from(JSON.stringify({appId:f.config.appId,version:1,fromKeyId:'root',toKeyId:'next',toPublicKey:pub}));
 const e=JSON.parse(f.sign(f.payload));e.keyId='next';e.signature=crypto.sign(null,Buffer.from(e.payload,'base64'),next.privateKey).toString('base64');e.keyTransitions=[{payload:payload.toString('base64'),oldSignature:crypto.sign(null,payload,f.privateKey).toString('base64'),newSignature:crypto.sign(null,payload,next.privateKey).toString('base64')}];
 assert.equal(verifyEnvelope(Buffer.from(JSON.stringify(e)),f.config).keyVersion,1);e.keyTransitions[0].newSignature='';assert.throws(()=>verifyEnvelope(Buffer.from(JSON.stringify(e)),f.config));
 assert.deepEqual(orderSources(f.pkg.sources,{a:1,b:10,c:2}).map(s=>s.id),['b','a','c']);
 assert.equal(compatibleOS('15','15.0','15.0.0'),true);assert.throws(()=>compatibleOS('12','16','14'));
});
test('local installer adapter serves exact verified bytes and bounded ranges only',async()=>{
 const {localPackage}=require('../src/main/services/unified-update/electron.cjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'update-adapter-test-'));const file=path.join(dir,'package.zip');await fs.writeFile(file,'package');
 const server=await localPackage({file,release:{version:'1.0.1',notes:'test'},package:{file:'test.zip',size:7}});
 try{const metadata=await(await fetch(server.url+'latest-mac.yml')).json();assert.equal(metadata.version,'1.0.1');assert.equal(await(await fetch(metadata.path)).text(),'package');const range=await fetch(metadata.path,{headers:{Range:'bytes=1-3'}});assert.equal(range.status,206);assert.equal(await range.text(),'ack');assert.equal((await fetch(server.url+'private')).status,404);}finally{server.close();await fs.rm(dir,{recursive:true,force:true});}
});
