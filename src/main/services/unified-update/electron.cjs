/* oxlint-disable typescript/no-require-imports -- Shared CJS runtime used by both Electron module systems. */
'use strict';
const { EventEmitter } = require('node:events');
const { createServer } = require('node:http');
const { createReadStream } = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { UpdateClient } = require('./index.cjs');
function systemVersion() {
  return process.platform==='darwin' ? execFileSync('/usr/bin/sw_vers',['-productVersion'],{encoding:'utf8'}).trim() : os.release();
}
function hasMacSigningIdentity(app) {
  if(process.platform!=='darwin') return true;
  try {
    const {spawnSync}=require('node:child_process');
    const root=path.resolve(app.getPath('exe'),'../../..');
    const result=spawnSync('/usr/bin/codesign',['-dv','--verbose=4',root],{encoding:'utf8'});
    return result.status===0 && /TeamIdentifier=[A-Z0-9]{10}\b/.test(result.stderr) && /Authority=Developer ID Application:/.test(result.stderr);
  } catch {return false;}
}
async function localPackage(download,{builtin=false}={}) {
  const sum=crypto.createHash('sha512');for await(const bytes of createReadStream(download.file))sum.update(bytes);
  const sha512=sum.digest('base64'), token=crypto.randomUUID(),extension=path.extname(download.package.file);
  const server=createServer(async(req,res)=>{
    try {
      if(req.url===`/${token}/latest-mac.yml` || req.url===`/${token}/latest.yml` || req.url===`/${token}/feed.json`) {
        const url=`${base}package${extension}`;
        const data=builtin ? {url,name:download.release.version,notes:download.release.notes,pub_date:new Date().toISOString()} : {version:download.release.version,files:[{url,sha512,size:download.package.size}],path:url,sha512,releaseNotes:download.release.notes};
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
      }
      if(req.url!==`/${token}/package${extension}` || !['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
      let start=0,end=download.package.size-1,status=200;
      if(req.headers.range) {
        const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if(!match){res.writeHead(416);res.end();return;}
        start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;
        if(start>end){res.writeHead(416);res.end();return;}status=206;
      }
      const headers={'Content-Type':'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes'};
      if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${download.package.size}`;
      res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}
      const stream=createReadStream(download.file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch {res.destroy();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}/${token}/`;
  return {url:base,close:()=>server.close()};
}
class UnifiedElectronUpdater extends EventEmitter {
  constructor({app,config,nativeUpdater,shell,builtin=false,transport}) {
    super();this.app=app;this.shell=shell;this.native=nativeUpdater;this.builtin=builtin;this.autoDownload=false;this.autoInstallOnAppQuit=false;
    nativeUpdater?.on('error',()=>{});
    this.manualInstall=!nativeUpdater || !hasMacSigningIdentity(app);
    this.client=new UpdateClient({...config,osVersion:systemVersion(),stateFile:path.join(app.getPath('userData'),'updater','accepted-manifest.json')},{transport});
    this.available=null;this.downloaded=null;this.abort=null;this.local=null;
    app.on('before-quit',()=>{this.abort?.abort();this.local?.close();});
  }
  setFeedURL() { /* Discovery is fixed by the app's authenticated unified configuration. */ }
  async checkForUpdates() {
    if(this.abort) throw new Error('更新任务正在进行');this.abort=new AbortController();
    try {
      const result=await this.client.check({signal:this.abort.signal});this.available=result.available ? result : null;
      const info={version:result.release.version,releaseNotes:result.release.notes};
      this.emit(result.available?'update-available':'update-not-available',info);
      return {isUpdateAvailable:result.available,updateInfo:info};
    } catch(error) {this.emit('error',error);throw error;}finally{this.abort=null;}
  }
  cancel() {this.abort?.abort();}
  async downloadUpdate() {
    if(!this.available) throw new Error('请先检查可用更新');if(this.abort)throw new Error('更新任务正在进行');this.abort=new AbortController();
    try {
      this.downloaded=await this.client.download({sourceId:this.sourceId || 'auto',signal:this.abort.signal,onProgress:p=>this.emit('download-progress',p)});
      if(!this.manualInstall) {
        this.local?.close();this.local=await localPackage(this.downloaded,{builtin:this.builtin});
        this.native.autoDownload=false;this.native.autoInstallOnAppQuit=false;
        this.native.disableDifferentialDownload=true;
        if(this.builtin) {
          this.native.setFeedURL({url:this.local.url+'feed.json'});
          await new Promise((resolve,reject)=>{
            const clear=()=>{this.native.removeListener('error',bad);this.native.removeListener('update-downloaded',done);};
            const bad=error=>{clear();reject(error);},done=()=>{clear();resolve();};
            this.native.once('error',bad);this.native.once('update-downloaded',done);this.native.checkForUpdates();
          });
        } else {
          this.native.setFeedURL({provider:'generic',url:this.local.url,channel:'latest'});
          // Original publisher/platform validation remains enabled in the native installer.
          const checked=await this.native.checkForUpdates();
          if(checked?.updateInfo?.version!==this.available.release.version)throw new Error('原生安装器版本与统一清单不一致');
          await this.native.downloadUpdate();
        }
      }
      this.emit('update-downloaded',{version:this.available.release.version,manualInstall:this.manualInstall});
      return [this.downloaded.file];
    } catch(error) {this.emit('error',error);throw error;}finally{this.abort=null;}
  }
  quitAndInstall() {
    if(!this.downloaded)throw new Error('更新尚未下载校验完成');
    if(this.manualInstall){this.shell.showItemInFolder(this.downloaded.file);return;}
    this.native.quitAndInstall();
  }
}
module.exports={UnifiedElectronUpdater,localPackage,systemVersion,hasMacSigningIdentity};
