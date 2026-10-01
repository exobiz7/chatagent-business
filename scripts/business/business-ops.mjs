#!/usr/bin/env node
import {
 existsSync,lstatSync,readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync,
 renameSync,unlinkSync,statSync,statfsSync,realpathSync
} from "node:fs";
import {join,dirname,isAbsolute,resolve} from "node:path";
import {homedir} from "node:os";
import {spawn,spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";
import {BusinessRegistry} from "./business-core.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";
import {BusinessAuditLedger} from "./business-audit.mjs";
import {backupBusinessState,restoreBusinessState} from "./business-backup.mjs";
import {verifyExecRuntimeConfig} from "./business-exec.mjs";

const NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==="function"?process.getuid():null;
const shaFile=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
const serverPath=fileURLToPath(new URL("./business-mcp-server.mjs",import.meta.url));
const defaultConfig=join(homedir(),"ChatAgentBusiness","operator.json");

function privateDir(p,{create=false}={}){
 if(typeof p!=="string"||!isAbsolute(p)||resolve(p)==="/")fail("OPS_DIRECTORY_UNSAFE");
 if(!existsSync(p)){
  if(!create)fail("OPS_DIRECTORY_MISSING");
  privateDir(dirname(p));mkdirSync(p,{mode:0o700});
 }
 const st=lstatSync(p);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (uid()!==null&&st.uid!==uid()))fail("OPS_DIRECTORY_UNSAFE");
 return realpathSync(p);
}
function privateFile(p){
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
    (uid()!==null&&st.uid!==uid()))fail("OPS_FILE_UNSAFE");
 return st;
}
function atomicJson(p,value){
 const tmp=p+".tmp-"+randomUUID(),body=JSON.stringify(value,null,2)+"\n";
 writeFileSync(tmp,body,{flag:"wx",mode:0o600});
 const fd=openSync(tmp,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(tmp,p);const dfd=openSync(dirname(p),"r");try{fsyncSync(dfd);}finally{closeSync(dfd);}
}

function loadConfig(path=process.env.CHATAGENT_BUSINESS_OPERATOR_CONFIG||defaultConfig){
 if(typeof path!=="string"||!isAbsolute(path))fail("OPS_CONFIG_PATH_INVALID");
 privateDir(dirname(path));privateFile(path);
 let c;try{c=JSON.parse(readFileSync(path,"utf8"));}catch{fail("OPS_CONFIG_INVALID");}
 const allowed=["schemaVersion","expectedNodeVersion","nodeBinary","repoRoot","stateDir","authFile","port",
  "continuityEnabled","auditEnabled","safePilotMode","runtimeDir","logsDir","backupsDir",
  "restoreRootDir","tunnelHealthUrl","native","exec"];
 if(!c||typeof c!=="object"||Array.isArray(c)||Object.keys(c).some(k=>!allowed.includes(k))||
    c.schemaVersion!==1||typeof c.expectedNodeVersion!=="string"||
    !/^v24\.[0-9]+\.[0-9]+$/.test(c.expectedNodeVersion)||
    !Number.isInteger(c.port)||c.port<1024||c.port>65535||
    typeof c.continuityEnabled!=="boolean"||typeof c.auditEnabled!=="boolean"||
    typeof c.safePilotMode!=="boolean")fail("OPS_CONFIG_INVALID");
 for(const key of ["nodeBinary","repoRoot","stateDir","authFile","runtimeDir","logsDir","backupsDir","restoreRootDir"])
  if(typeof c[key]!=="string"||!isAbsolute(c[key]))fail("OPS_CONFIG_INVALID");
 if(c.tunnelHealthUrl!==null&&c.tunnelHealthUrl!==undefined&&
    (typeof c.tunnelHealthUrl!=="string"||!/^https?:\/\//.test(c.tunnelHealthUrl)))
  fail("OPS_CONFIG_INVALID");
 if(!c.native||typeof c.native!=="object"||Array.isArray(c.native)||
    Object.keys(c.native).sort().join(",")!=="create,mkdir,publish,replace")
  fail("OPS_CONFIG_INVALID");
 for(const k of ["create","replace","mkdir","publish"]){
  const v=c.native[k];
  if(!v||typeof v.path!=="string"||!isAbsolute(v.path)||!SHA.test(v.sha256??""))
   fail("OPS_CONFIG_INVALID");
 }
 const exec=c.exec??{enabled:false};
 if(!exec||typeof exec!=="object"||Array.isArray(exec)||
    Object.keys(exec).some(k=>!["enabled","dockerBinary","dockerSha256","imageRef","imageId"].includes(k))||
    typeof exec.enabled!=="boolean")fail("OPS_CONFIG_INVALID");
 if(exec.enabled){
  if(typeof exec.dockerBinary!=="string"||!isAbsolute(exec.dockerBinary)||
     !SHA.test(exec.dockerSha256??"")||typeof exec.imageRef!=="string"||
     exec.imageRef.length<1||exec.imageRef.length>256||
     !/^sha256:[a-f0-9]{64}$/.test(exec.imageId??""))fail("OPS_CONFIG_INVALID");
 }else if(Object.keys(exec).some(k=>k!=="enabled"))fail("OPS_CONFIG_INVALID");
 return {...c,exec,configPath:path};
}
function verifyHelper(item){
 privateDir(dirname(item.path));privateFile(item.path);
 if(realpathSync(item.path)!==item.path)fail("OPS_NATIVE_HELPER_UNSAFE");
 if(shaFile(item.path)!==item.sha256)fail("OPS_NATIVE_HELPER_HASH_MISMATCH");
}
function verifyAuth(path){
 privateFile(path);
 const token=readFileSync(path,"utf8").trim();
 if(!/^[A-Za-z0-9_-]{43,256}$/.test(token))fail("OPS_AUTH_INVALID");
 return true;
}
function nodeVersion(c){
 const r=spawnSync(c.nodeBinary,["-v"],{encoding:"utf8",timeout:5000});
 if(r.status!==0||r.stdout.trim()!==c.expectedNodeVersion)fail("OPS_NODE_VERSION_MISMATCH");
 return r.stdout.trim();
}

function runtimeRecordPath(c){return join(c.runtimeDir,"business-runtime.json");}
function logPath(c){return join(c.logsDir,"business.log");}
function readRuntimeRecord(c){
 const p=runtimeRecordPath(c);
 if(!existsSync(p))return null;
 privateFile(p);let r;try{r=JSON.parse(readFileSync(p,"utf8"));}catch{fail("OPS_RUNTIME_RECORD_INVALID");}
 if(!r||!Number.isInteger(r.pid)||r.pid<=1||typeof r.instanceId!=="string"||
    typeof r.nodeBinary!=="string"||typeof r.serverPath!=="string"||
    !Number.isSafeInteger(r.startedAt)||!Number.isInteger(r.port))
  fail("OPS_RUNTIME_RECORD_INVALID");
 return r;
}
function processCommand(pid){
 const r=spawnSync("/bin/ps",["-ww","-p",String(pid),"-o","uid=","-o","command="],{
  encoding:"utf8",timeout:5000
 });
 if(r.status!==0||!r.stdout.trim())return null;
 const line=r.stdout.trim(),match=line.match(/^(\d+)\s+(.*)$/s);
 if(!match)return null;
 return {uid:Number(match[1]),command:match[2]};
}
function processMatches(record){
 const ps=processCommand(record.pid);
 if(!ps||ps.uid!==uid())return false;
 return ps.command.includes(record.nodeBinary)&&ps.command.includes(record.serverPath)&&
  ps.command.includes("--business-instance="+record.instanceId);
}
async function health(port,timeoutMs=600){
 try{
  const r=await fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(timeoutMs)});
  if(!r.ok)return null;
  const body=await r.json();
  return body&&body.ready===true?body:null;
 }catch{return null;}
}
async function runtimeStatus(c){
 const record=readRuntimeRecord(c);
 if(!record){
  const h=await health(c.port,300);
  return h?{state:"PORT_OCCUPIED_UNTRACKED",healthy:false,phase:h.phase??null}:{state:"STOPPED",healthy:false};
 }
 if(!processMatches(record))return {state:"STALE_RECORD",healthy:false,pid:record.pid};
 const h=await health(record.port,500);
 if(!h)return {state:"RUNNING_UNHEALTHY",healthy:false,pid:record.pid};
 if(h.instanceId!==record.instanceId)return {state:"IDENTITY_MISMATCH",healthy:false,pid:record.pid};
 return {state:"RUNNING",healthy:true,pid:record.pid,phase:h.phase,
  safeFilesReady:h.safeFilesReady===true,continuityReady:h.continuityReady===true,
  auditReady:h.auditReady===true,execReady:h.execReady===true,execHealthy:h.execHealthy!==false};
}

function rotateLog(c,{maxBytes=1024*1024,maxArchives=3}={}){
 privateDir(c.logsDir,{create:true});
 const current=logPath(c);
 if(!existsSync(current)){
  const fd=openSync(current,"wx",0o600);closeSync(fd);return;
 }
 privateFile(current);
 if(statSync(current).size<=maxBytes)return;
 const oldest=current+"."+maxArchives;
 if(existsSync(oldest)){privateFile(oldest);unlinkSync(oldest);}
 for(let i=maxArchives-1;i>=1;i--){
  const from=current+"."+i,to=current+"."+(i+1);
  if(existsSync(from)){privateFile(from);renameSync(from,to);}
 }
 renameSync(current,current+".1");
 const fd=openSync(current,"wx",0o600);closeSync(fd);
 const dfd=openSync(c.logsDir,"r");try{fsyncSync(dfd);}finally{closeSync(dfd);}
}
function configEnv(c,instanceId){
 const env={
  ...process.env,
  CHATAGENT_BUSINESS_STATE_DIR:c.stateDir,
  CHATAGENT_BUSINESS_AUTH_FILE:c.authFile,
  CHATAGENT_BUSINESS_PORT:String(c.port),
  CHATAGENT_BUSINESS_CONTINUITY_ENABLED:c.continuityEnabled?"1":"0",
  CHATAGENT_BUSINESS_AUDIT_ENABLED:c.auditEnabled?"1":"0",
  CHATAGENT_BUSINESS_EXEC_ENABLED:c.exec.enabled?"1":"0",
  CHATAGENT_BUSINESS_CONTINUITY_STATE_DIR:join(c.stateDir,"continuity"),
  CHATAGENT_BUSINESS_AUDIT_DIR:join(c.stateDir,"audit"),
  CHATAGENT_BUSINESS_INSTANCE_ID:instanceId,
  CHATAGENT_BUSINESS_NATIVE_CREATE_BIN:c.native.create.path,
  CHATAGENT_BUSINESS_NATIVE_CREATE_SHA256:c.native.create.sha256,
  CHATAGENT_BUSINESS_NATIVE_REPLACE_BIN:c.native.replace.path,
  CHATAGENT_BUSINESS_NATIVE_REPLACE_SHA256:c.native.replace.sha256,
  CHATAGENT_BUSINESS_NATIVE_MKDIR_BIN:c.native.mkdir.path,
  CHATAGENT_BUSINESS_NATIVE_MKDIR_SHA256:c.native.mkdir.sha256
 };
 if(c.exec.enabled){
  env.CHATAGENT_BUSINESS_DOCKER_BIN=c.exec.dockerBinary;
  env.CHATAGENT_BUSINESS_DOCKER_SHA256=c.exec.dockerSha256;
  env.CHATAGENT_BUSINESS_EXEC_IMAGE_REF=c.exec.imageRef;
  env.CHATAGENT_BUSINESS_EXEC_IMAGE_ID=c.exec.imageId;
 }
 return env;
}
async function checkResult(name,fn,{required=true}={}){
 try{return {name,required,ok:true,...await fn()};}
 catch(e){return {name,required,ok:false,status:String(e?.message||"CHECK_FAILED")};}
}

export async function doctorBusiness(configPath){
 const c=loadConfig(configPath);
 const checks=[];
 checks.push(await checkResult("node",async()=>({status:nodeVersion(c)})));
 checks.push(await checkResult("repo",async()=>{
  const actual=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
  if(realpathSync(c.repoRoot)!==actual||realpathSync(serverPath)!==serverPath)fail("OPS_REPO_IDENTITY_MISMATCH");
  return {status:"OK"};
 }));
 checks.push(await checkResult("state",async()=>{privateDir(c.stateDir);return {status:"PRIVATE"};}));
 let registry=null;
 checks.push(await checkResult("registry",async()=>{
  registry=new BusinessRegistry(c.stateDir);
  const projects=registry.list(),unavailable=projects.filter(p=>p.enabled&&!registry.inspect(p.projectId).rootAvailable);
  if(unavailable.length)fail("OPS_PROJECT_ROOT_UNAVAILABLE");
  return {status:"OK",projects:projects.length,enabled:projects.filter(p=>p.enabled).length};
 }));
 checks.push(await checkResult("profile",async()=>{
  registry??=new BusinessRegistry(c.stateDir);
  const standard=registry.list().filter(p=>p.enabled&&p.profile==="STANDARD").length;
  if(c.safePilotMode){
   if(c.exec.enabled)fail("OPS_SAFE_PILOT_EXEC_DENIED");
   if(standard>0)fail("OPS_SAFE_PILOT_STANDARD_PROJECT_DENIED");
   return {status:"SAFE_PILOT",standardEnabled:standard};
  }
  if(!c.exec.enabled)fail("OPS_B4_SAFE_PILOT_MODE_REQUIRED");
  return {status:"STANDARD_ENABLED",standardEnabled:standard};
 }));
 checks.push(await checkResult("auth",async()=>{verifyAuth(c.authFile);return {status:"PRIVATE_VALID"};}));
 checks.push(await checkResult("native_helpers",async()=>{
  for(const item of Object.values(c.native))verifyHelper(item);
  return {status:"PINNED",count:4};
 }));
 checks.push(await checkResult("b4_features",async()=>{
  if(!c.continuityEnabled||!c.auditEnabled)fail("OPS_B4_FEATURES_REQUIRED");
  return {status:"CONTINUITY_AUDIT_ENABLED"};
 }));
 checks.push(await checkResult("continuity",async()=>{
  const dir=join(c.stateDir,"continuity");
  if(!existsSync(dir))return {status:"WILL_INITIALIZE_ON_START"};
  registry??=new BusinessRegistry(c.stateDir);
  const continuity=new BusinessContinuity(registry,{root:dir});
  continuity.close();return {status:"OK"};
 }));
 checks.push(await checkResult("audit",async()=>{
  const dir=join(c.stateDir,"audit");
  if(!existsSync(dir))return {status:"WILL_INITIALIZE_ON_START"};
  const ledger=new BusinessAuditLedger(dir);
  ledger.readRecent(10);
  return {status:"OK",...ledger.status()};
 }));

 checks.push(await checkResult("runtime_dirs",async()=>{
  for(const dir of [c.runtimeDir,c.logsDir,c.backupsDir,c.restoreRootDir]){
   if(existsSync(dir))privateDir(dir);
   else privateDir(dirname(dir));
  }
  return {status:"OK"};
 }));
 checks.push(await checkResult("runtime",async()=>{
  const s=await runtimeStatus(c);
  if(["STALE_RECORD","IDENTITY_MISMATCH","PORT_OCCUPIED_UNTRACKED"].includes(s.state))
   fail("OPS_RUNTIME_RECONCILIATION_REQUIRED");
  return {status:s.state,healthy:s.healthy===true,phase:s.phase??null};
 }));
 checks.push(await checkResult("control_plane",async()=>{
  const s=await runtimeStatus(c);
  if(s.state==="RUNNING"&&!s.healthy)fail("OPS_CONTROL_PLANE_UNHEALTHY");
  return {status:s.state==="RUNNING"?"HTTP_HEALTHY":"STOPPED",
   legacyL0L1:c.exec.enabled?"NOT_APPLICABLE_B5":"NOT_APPLICABLE_B4"};
 }));
 checks.push(await checkResult("tunnel",async()=>{
  if(!c.tunnelHealthUrl)return {status:c.exec.enabled?"NOT_CONFIGURED_B5":"NOT_CONFIGURED_B4"};
  const r=await fetch(c.tunnelHealthUrl,{signal:AbortSignal.timeout(1500)});
  if(!r.ok)fail("OPS_TUNNEL_UNHEALTHY");
  return {status:"HTTP_"+r.status};
 },{required:false}));
 checks.push(await checkResult("disk_logs",async()=>{
  const fsinfo=statfsSync(c.stateDir);
  const free=Number(fsinfo.bavail)*Number(fsinfo.bsize);
  if(!Number.isFinite(free)||free<100*1024*1024)fail("OPS_DISK_SPACE_LOW");
  let logBytes=0;
  if(existsSync(logPath(c))){privateFile(logPath(c));logBytes=statSync(logPath(c)).size;}
  if(logBytes>10*1024*1024)fail("OPS_LOG_SIZE_EXCESSIVE");
  return {status:"OK",freeMiB:Math.floor(free/1024/1024),logBytes};
 }));
 checks.push(await checkResult("exec_plane",async()=>{
  if(!c.exec.enabled)return {status:"NOT_IMPLEMENTED_B4"};
  const verified=verifyExecRuntimeConfig(c.exec);
  return {status:"READY_B5",imageId:verified.imageId,platform:verified.platform};
 },{required:!c.safePilotMode}));
 const ok=checks.filter(x=>x.required).every(x=>x.ok);
 return {product:"ChatAgent Business",phase:c.exec.enabled&&!c.safePilotMode?"B5":"B4",
  ok,safePilotMode:c.safePilotMode,checks};
}

export async function statusBusiness(configPath){
 const c=loadConfig(configPath),s=await runtimeStatus(c);
 return {product:"ChatAgent Business",phase:c.exec.enabled&&!c.safePilotMode?"B5":"B4",
  ...s,safePilotMode:c.safePilotMode,execConfigured:c.exec.enabled};
}
function removeRuntimeRecord(c){
 const p=runtimeRecordPath(c);
 if(!existsSync(p))return;
 privateFile(p);unlinkSync(p);
 const fd=openSync(c.runtimeDir,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
}
async function stopOwnedRecord(c,record){
 if(!processMatches(record))fail("OPS_RUNTIME_RECONCILIATION_REQUIRED");
 try{process.kill(record.pid,"SIGTERM");}catch(e){if(e.code!=="ESRCH")throw e;}
 for(let i=0;i<80;i++){
  if(!processCommand(record.pid))return;
  await delay(100);
 }
 if(!processMatches(record))fail("OPS_RUNTIME_RECONCILIATION_REQUIRED");
 try{process.kill(record.pid,"SIGKILL");}catch(e){if(e.code!=="ESRCH")throw e;}
 for(let i=0;i<30;i++){
  if(!processCommand(record.pid))return;
  await delay(100);
 }
 fail("OPS_STOP_TIMEOUT");
}
export async function startBusiness(configPath){
 const c=loadConfig(configPath);
 const prior=await runtimeStatus(c);
 if(prior.state==="RUNNING")return {...prior,alreadyRunning:true,safePilotMode:c.safePilotMode};
 if(prior.state!=="STOPPED")fail("OPS_RUNTIME_RECONCILIATION_REQUIRED");
 const doctor=await doctorBusiness(configPath);
 if(!doctor.ok)fail("OPS_PREFLIGHT_FAILED");
 for(const dir of [c.runtimeDir,c.logsDir,c.backupsDir,c.restoreRootDir])privateDir(dir,{create:true});
 rotateLog(c);
 const instanceId=randomUUID(),record={
  schemaVersion:1,pid:null,instanceId,startedAt:Date.now(),nodeBinary:c.nodeBinary,
  serverPath,port:c.port
 };
 const fd=openSync(logPath(c),"a",0o600);
 let child;
 try{
  child=spawn(c.nodeBinary,[serverPath,"--business-instance="+instanceId],{
   env:configEnv(c,instanceId),stdio:["ignore",fd,fd],detached:true,shell:false
  });
 }finally{closeSync(fd);}
 if(!child.pid)fail("OPS_START_FAILED");
 record.pid=child.pid;atomicJson(runtimeRecordPath(c),record);child.unref();
 const expectedPhase=c.exec.enabled&&!c.safePilotMode?"B5":"B4";
 for(let i=0;i<100;i++){
  if(!processMatches(record))break;
  const h=await health(c.port,500);
  const baseReady=h&&h.instanceId===instanceId&&h.phase===expectedPhase&&
   h.safeFilesReady===true&&h.continuityReady===true&&h.auditReady===true;
  const execReady=c.exec.enabled?h?.execReady===true&&h?.execHealthy!==false:h?.execReady!==true;
  if(baseReady&&execReady)
   return {state:"RUNNING",healthy:true,pid:record.pid,phase:expectedPhase,
    safeFilesReady:true,continuityReady:true,auditReady:true,
    execReady:c.exec.enabled,safePilotMode:c.safePilotMode};
  await delay(100);
 }
 try{if(processMatches(record))await stopOwnedRecord(c,record);}catch{}
 if(!processCommand(record.pid))removeRuntimeRecord(c);
 fail("OPS_START_FAILED");
}

export async function stopBusiness(configPath){
 const c=loadConfig(configPath),s=await runtimeStatus(c);
 if(s.state==="STOPPED")return {state:"STOPPED",alreadyStopped:true};
 if(!["RUNNING","RUNNING_UNHEALTHY"].includes(s.state))
  fail("OPS_RUNTIME_RECONCILIATION_REQUIRED");
 const record=readRuntimeRecord(c);
 await stopOwnedRecord(c,record);
 removeRuntimeRecord(c);
 const h=await health(c.port,250);
 if(h&&h.instanceId===record.instanceId)fail("OPS_STOP_UNCERTAIN");
 return {state:"STOPPED",stoppedPid:record.pid};
}
function backupName(value){
 if(value===undefined||value===null||value===""){
  const d=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  return "business-backup-"+d;
 }
 if(!NAME.test(value))fail("OPS_BACKUP_NAME_INVALID");
 return value;
}
export async function backupBusiness(configPath,name=null){
 const c=loadConfig(configPath),s=await runtimeStatus(c);
 if(s.state!=="STOPPED")fail("OPS_BACKUP_REQUIRES_STOPPED_RUNTIME");
 privateDir(c.backupsDir,{create:true});
 const safeName=backupName(name),destination=join(c.backupsDir,safeName);
 const result=await backupBusinessState({
  sourceStateDir:c.stateDir,destinationDir:destination,
  publishHelperPath:c.native.publish.path,publishHelperSha256:c.native.publish.sha256,
  nonSecretConfig:{
   schemaVersion:1,expectedNodeVersion:c.expectedNodeVersion,port:c.port,
   continuityEnabled:c.continuityEnabled,auditEnabled:c.auditEnabled,
   safePilotMode:c.safePilotMode,tunnelConfigured:Boolean(c.tunnelHealthUrl),
   execEnabled:c.exec.enabled,
   execImageRef:c.exec.enabled?c.exec.imageRef:null,
   execImageId:c.exec.enabled?c.exec.imageId:null,
   nativeSha256:Object.fromEntries(Object.entries(c.native).map(([k,v])=>[k,v.sha256]))
  }
 });
 return {backupName:safeName,organizationId:result.organizationId,verified:result.verified,
  excludesDeploymentCredential:true,containsContinuitySealKey:true};
}
export async function restoreBusiness(configPath,backupNameArg,restoreNameArg){
 const c=loadConfig(configPath),s=await runtimeStatus(c);
 if(s.state!=="STOPPED")fail("OPS_RESTORE_REQUIRES_STOPPED_RUNTIME");
 if(!NAME.test(backupNameArg??"")||!NAME.test(restoreNameArg??""))fail("OPS_RESTORE_NAME_INVALID");
 privateDir(c.backupsDir,{create:true});privateDir(c.restoreRootDir,{create:true});
 const source=join(c.backupsDir,backupNameArg),destination=join(c.restoreRootDir,restoreNameArg);
 const result=restoreBusinessState({
  backupDir:source,destinationStateDir:destination,
  publishHelperPath:c.native.publish.path,publishHelperSha256:c.native.publish.sha256
 });
 return {restoreName:restoreNameArg,organizationId:result.organizationId,
  verified:result.verified,credentialRestored:false};
}

async function cli(){
 const command=process.argv[2],args=process.argv.slice(3);
 const configPath=process.env.CHATAGENT_BUSINESS_OPERATOR_CONFIG||defaultConfig;
 let out;
 if(command==="start")out=await startBusiness(configPath);
 else if(command==="stop")out=await stopBusiness(configPath);
 else if(command==="status")out=await statusBusiness(configPath);
 else if(command==="doctor")out=await doctorBusiness(configPath);
 else if(command==="backup")out=await backupBusiness(configPath,args[0]??null);
 else if(command==="restore")out=await restoreBusiness(configPath,args[0],args[1]);
 else fail("OPS_COMMAND_INVALID");
 process.stdout.write(JSON.stringify(out,null,2)+"\n");
 if(command==="doctor"&&out.ok!==true)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 cli().catch(e=>{
  process.stderr.write(JSON.stringify({success:false,code:String(e?.message||"OPS_FAILED"),
   ...(e?.effect?{effect:e.effect}:{}),...(e?.retryable===false?{retryable:false}:{})})+"\n");
  process.exitCode=1;
 });
}
