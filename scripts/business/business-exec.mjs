import {
 existsSync,lstatSync,readFileSync,realpathSync
} from "node:fs";
import {promises as fs} from "node:fs";
import {isAbsolute,join,resolve,sep} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {EventEmitter} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {authorizeProjectTool} from "./business-core.mjs";

const LIMITS=Object.freeze({
 running:1,sessions:32,retentionMs:15*60*1000,
 commandBytes:16384,timeoutMs:15*60*1000,
 retainedBytes:2*1024*1024,outputBytes:512*1024,
 pids:128,memory:"512m",cpus:"2",tmpBytes:64*1024*1024
});
const SESSION=/^xexec_[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{64}$/;
const OWNER=/^[a-f0-9]{24}$/;
const fail=code=>{throw Error(code);};
const fileSha=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
const uid=()=>typeof process.getuid==="function"?process.getuid():null;
const gid=()=>typeof process.getgid==="function"?process.getgid():null;

function execFile(binary,args,{timeout=10000,maxBuffer=2*1024*1024,encoding="utf8"}={}){
 const r=spawnSync(binary,args,{encoding,timeout,maxBuffer,stdio:["ignore","pipe","pipe"]});
 if(r.error||r.signal||r.status!==0){
  const e=Error("EXEC_DOCKER_FAILED");
  e.detail=encoding==="utf8"?String(r.stderr??"").slice(0,512):"";
  throw e;
 }
 return r.stdout;
}
function validateDockerBinary(path,expectedSha256){
 if(typeof path!=="string"||!isAbsolute(path)||!SHA.test(expectedSha256??""))
  fail("EXEC_CONFIG_INVALID");
 const real=realpathSync(path);
 if(real!==path)fail("EXEC_DOCKER_BINARY_UNSAFE");
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o022)!==0)fail("EXEC_DOCKER_BINARY_UNSAFE");
 if(fileSha(path)!==expectedSha256)fail("EXEC_DOCKER_BINARY_HASH_MISMATCH");
}
function imageInspection(dockerBinary,imageRef){
 const raw=execFile(dockerBinary,["image","inspect",imageRef,"--format",
  "{{.Id}}|{{.Architecture}}|{{.Os}}"],{timeout:10000}).trim();
 const [id,arch,os]=raw.split("|");
 return {id,arch,os};
}
export function verifyExecRuntimeConfig(config){
 if(!config||typeof config!=="object"||Array.isArray(config)||config.enabled!==true||
    typeof config.dockerBinary!=="string"||!SHA.test(config.dockerSha256??"")||
    typeof config.imageRef!=="string"||config.imageRef.length>256||
    !/^sha256:[a-f0-9]{64}$/.test(config.imageId??""))
  fail("EXEC_CONFIG_INVALID");
 validateDockerBinary(config.dockerBinary,config.dockerSha256);
 execFile(config.dockerBinary,["version","--format","{{.Server.Version}}"],{timeout:10000});
 const image=imageInspection(config.dockerBinary,config.imageRef);
 if(image.id!==config.imageId)fail("EXEC_IMAGE_ID_MISMATCH");
 if(image.arch!=="arm64"||image.os!=="linux")fail("EXEC_IMAGE_PLATFORM_INVALID");
 return {docker:"READY",imageId:image.id,platform:image.arch+"/"+image.os};
}

function cleanCwd(value){
 if(value===undefined||value===null||value===""||value===".")return ".";
 if(typeof value!=="string"||value.length>4096||isAbsolute(value)||
    /[\x00-\x1f\x7f\\]/.test(value))fail("EXEC_CWD_INVALID");
 const parts=value.split("/");
 if(parts.some(p=>!p||p==="."||p===".."||p.toLowerCase()===".git"||Buffer.byteLength(p)>255))
  fail("EXEC_CWD_INVALID");
 return parts.join("/");
}
function cleanCommand(value){
 if(typeof value!=="string"||value.length<1||Buffer.byteLength(value)>LIMITS.commandBytes||
    value.includes("\0"))fail("EXEC_COMMAND_INVALID");
 return value;
}
function cleanInt(value,min,max,code){
 if(!Number.isInteger(value)||value<min||value>max)fail(code);
 return value;
}
function cleanSession(value){
 if(!SESSION.test(value??""))fail("EXEC_SESSION_INVALID");
 return value;
}
async function statStableDirectory(path){
 const before=await fs.lstat(path,{bigint:true});
 if(!before.isDirectory()||before.isSymbolicLink())fail("EXEC_PROJECT_UNSUPPORTED");
 const names=await fs.readdir(path);
 return {before,names};
}
async function ensureStableDirectory(path,before){
 const after=await fs.lstat(path,{bigint:true});
 if(!after.isDirectory()||after.isSymbolicLink()||before.dev!==after.dev||before.ino!==after.ino||
    before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)
  fail("EXEC_PROJECT_SCAN_INCOMPLETE");
}
export async function inspectExecProject(root){
 if(typeof root!=="string"||!isAbsolute(root)||realpathSync(root)!==resolve(root))
  fail("EXEC_PROJECT_UNSUPPORTED");
 const top=await fs.lstat(root,{bigint:true});
 if(!top.isDirectory()||top.isSymbolicLink())fail("EXEC_PROJECT_UNSUPPORTED");
 let files=0,directories=0,gitPresent=false;
 const git=join(root,".git");
 try{
  const gst=await fs.lstat(git,{bigint:true});
  if(!gst.isDirectory()||gst.isSymbolicLink())fail("EXEC_PROJECT_UNSUPPORTED");
  gitPresent=true;
  for(const blocked of [join(root,".gitmodules"),join(git,"commondir"),join(git,"objects/info/alternates")]){
   try{await fs.lstat(blocked);fail("EXEC_PROJECT_UNSUPPORTED");}
   catch(e){if(e?.code!=="ENOENT"&&e?.message!=="EXEC_PROJECT_UNSUPPORTED")throw e;
    if(e?.message==="EXEC_PROJECT_UNSUPPORTED")throw e;}
  }
  const scanGit=async dir=>{
   const {before,names}=await statStableDirectory(dir);
   for(const name of names){
    const item=join(dir,name),st=await fs.lstat(item,{bigint:true});
    if(st.isSymbolicLink())fail("EXEC_PROJECT_UNSUPPORTED");
    if(st.isFile()){if(st.nlink!==1n)fail("EXEC_PROJECT_HARDLINK_UNSUPPORTED");files++;}
    else if(st.isDirectory())await scanGit(item);
    else fail("EXEC_PROJECT_UNSUPPORTED");
    if(files+directories>50000)fail("EXEC_PROJECT_TOO_LARGE");
   }
   await ensureStableDirectory(dir,before);directories++;
  };
  await scanGit(git);
 }catch(e){
  if(e?.code!=="ENOENT")throw e;
 }
 const scan=async dir=>{
  const {before,names}=await statStableDirectory(dir);
  for(const name of names){
   if(dir===root&&name===".git")continue;
   const item=join(dir,name),st=await fs.lstat(item,{bigint:true});
   if(st.isSymbolicLink())continue;
   if(st.isFile()){if(st.nlink!==1n)fail("EXEC_PROJECT_HARDLINK_UNSUPPORTED");files++;}
   else if(st.isDirectory())await scan(item);
   else fail("EXEC_PROJECT_UNSUPPORTED");
   if(files+directories>50000)fail("EXEC_PROJECT_TOO_LARGE");
  }
  await ensureStableDirectory(dir,before);directories++;
 };
 await scan(root);
 return {files,directories,gitPresent};
}

async function validateCwd(root,cwd){
 if(cwd===".")return;
 let current=root;
 for(const part of cwd.split("/")){
  current=join(current,part);
  const st=await fs.lstat(current);
  if(!st.isDirectory()||st.isSymbolicLink())fail("EXEC_CWD_INVALID");
 }
 const real=await fs.realpath(current);
 if(!(real===root||real.startsWith(root+sep)))fail("EXEC_CWD_INVALID");
}
function dockerInspect(binary,id){
 let parsed;
 try{parsed=JSON.parse(execFile(binary,["inspect",id],{timeout:10000}));}
 catch{fail("EXEC_CONTAINER_INSPECT_FAILED");}
 if(!Array.isArray(parsed)||parsed.length!==1)fail("EXEC_CONTAINER_INSPECT_FAILED");
 return parsed[0];
}
function labelValue(labels,key){return labels&&typeof labels[key]==="string"?labels[key]:null;}
function verifyIsolation({dockerBinary,imageId,containerId,ownerId,instanceId,sessionId,projectId,hostRoot,gitPresent}){
 const i=dockerInspect(dockerBinary,containerId);
 const hc=i.HostConfig??{},cfg=i.Config??{},labels=cfg.Labels??{};
 if(i.Image!==imageId||hc.ReadonlyRootfs!==true||hc.NetworkMode!=="none"||hc.Privileged===true||
    !Array.isArray(hc.CapDrop)||!hc.CapDrop.map(String).some(x=>x.toUpperCase()==="ALL")||
    Number(hc.PidsLimit)<=0||Number(hc.PidsLimit)>LIMITS.pids||
    !Array.isArray(hc.SecurityOpt)||!hc.SecurityOpt.some(x=>String(x).startsWith("no-new-privileges"))||
    cfg.User==="0"||cfg.User==="root"||cfg.User==="")
  fail("EXEC_ISOLATION_INVALID");
 if(labelValue(labels,"chatagent.business.product")!=="ChatAgentBusiness"||
    labelValue(labels,"chatagent.business.owner")!==ownerId||
    labelValue(labels,"chatagent.business.instance")!==instanceId||
    labelValue(labels,"chatagent.business.session")!==sessionId||
    labelValue(labels,"chatagent.business.project")!==projectId)
  fail("EXEC_CONTAINER_OWNERSHIP_INVALID");
 const mounts=Array.isArray(i.Mounts)?i.Mounts:[];
 const project=mounts.find(m=>m.Destination==="/project");
 if(!project||project.RW!==true||realpathSync(project.Source)!==hostRoot)
  fail("EXEC_PROJECT_MOUNT_INVALID");
 const unexpected=mounts.filter(m=>!["/project","/project/.git"].includes(m.Destination));
 if(unexpected.length||mounts.some(m=>String(m.Source??"").includes("docker.sock")))
  fail("EXEC_SECRET_MOUNT_INVALID");
 const gitMount=mounts.find(m=>m.Destination==="/project/.git");
 if(gitPresent){
  if(!gitMount||gitMount.RW!==false||realpathSync(gitMount.Source)!==join(hostRoot,".git"))
   fail("EXEC_GIT_MOUNT_INVALID");
 }else if(gitMount)fail("EXEC_GIT_MOUNT_INVALID");
 const tmpfs=hc.Tmpfs??{};
 if(typeof tmpfs!=="object"||typeof tmpfs["/tmp"]!=="string"||
    Object.keys(tmpfs).some(k=>k!=="/tmp"))
  fail("EXEC_TMPFS_INVALID");
 const env=Array.isArray(cfg.Env)?cfg.Env:[];
 if(env.some(x=>/^(?:[^=]*(?:TOKEN|CREDENTIAL|SECRET|API_KEY)[^=]*)=/i.test(String(x))))
  fail("EXEC_SECRET_ENV_INVALID");
 return i;
}
function containerIds(binary,ownerId){
 const out=execFile(binary,["ps","-aq","--filter","label=chatagent.business.product=ChatAgentBusiness",
  "--filter","label=chatagent.business.owner="+ownerId],{timeout:10000}).trim();
 return out?out.split(/\s+/).filter(Boolean):[];
}
function removeContainer(binary,id,{force=false}={}){
 const args=["rm",...(force?["-f"]:[]),id];
 const r=spawnSync(binary,args,{encoding:"utf8",timeout:10000,maxBuffer:65536,
  stdio:["ignore","pipe","pipe"]});
 if(!r.error&&!r.signal&&r.status===0)return true;
 return /No such container/i.test(String(r.stderr??""));
}

export class BusinessExecManager{
 constructor(registry,{dockerBinary,dockerSha256,imageRef,imageId,ownerId,instanceId}={}){
  if(!OWNER.test(ownerId??"")||typeof instanceId!=="string"||!/^[0-9a-f-]{36}$/i.test(instanceId??""))
   fail("EXEC_CONFIG_INVALID");
  this.registry=registry;this.dockerBinary=dockerBinary;this.dockerSha256=dockerSha256;
  this.imageRef=imageRef;this.imageId=imageId;this.ownerId=ownerId;this.instanceId=instanceId;
  this.sessions=new Map();this.starting=false;this.failed=false;this.closed=false;
 }
 initialize(){
  verifyExecRuntimeConfig({enabled:true,dockerBinary:this.dockerBinary,dockerSha256:this.dockerSha256,
   imageRef:this.imageRef,imageId:this.imageId});
  for(const id of containerIds(this.dockerBinary,this.ownerId)){
   const i=dockerInspect(this.dockerBinary,id),labels=i.Config?.Labels??{};
   if(labelValue(labels,"chatagent.business.product")!=="ChatAgentBusiness"||
      labelValue(labels,"chatagent.business.owner")!==this.ownerId)
    fail("EXEC_CONTAINER_OWNERSHIP_INVALID");
   if(!removeContainer(this.dockerBinary,id,{force:true}))fail("EXEC_CLEANUP_FAILED");
  }
  return {ready:true,cleaned:true};
 }
 healthy(){return !this.failed&&!this.closed;}
 accounting(){
  this.prune();
  return {healthy:this.healthy(),starting:this.starting,
   running:[...this.sessions.values()].filter(s=>!s.finishedAt).length,
   sessions:this.sessions.size};
 }
 prune(){
  const now=Date.now();
  for(const [id,s] of this.sessions){
   if(s.finishedAt&&now-s.finishedAt>=LIMITS.retentionMs){
    try{s.logs?.kill("SIGKILL");}catch{}
    try{s.waiter?.kill("SIGKILL");}catch{}
    this.sessions.delete(id);
   }
  }
 }
 scope(projectId,tool){return authorizeProjectTool(this.registry,{projectId,tool});}
 get(projectId,sessionId,tool){
  this.scope(projectId,tool);cleanSession(sessionId);this.prune();
  const s=this.sessions.get(sessionId);
  if(!s||s.projectId!==projectId)fail("EXEC_SESSION_UNKNOWN");
  return s;
 }
 failPlane(session=null){
  this.failed=true;
  if(session&&!session.finishedAt){
   try{removeContainer(this.dockerBinary,session.containerId,{force:true});}catch{}
   try{session.logs?.kill("SIGKILL");}catch{}
   session.state="cleanup_failed";session.finishedAt=Date.now();clearTimeout(session.timer);
   session.changed.emit("change");
  }
 }
 collect(session,data){
  if(!Buffer.isBuffer(data))data=Buffer.from(data);
  session.end+=data.length;
  session.bytes=Buffer.concat([session.bytes,data]).subarray(-LIMITS.retainedBytes);
  session.changed.emit("change");
 }
 maybeFinalize(session){
  if(session.finishedAt||!session.containerExited||!session.logsClosed)return;
  clearTimeout(session.timer);
  session.state=session.pendingOutcome??"completed";
  session.finishedAt=Date.now();
  session.changed.emit("change");
  if(!removeContainer(this.dockerBinary,session.containerId,{force:false})){
   session.state="cleanup_failed";this.failed=true;session.changed.emit("change");
  }
 }
 async awaitStarted(session){
  for(let i=0;i<40;i++){
   if(session.finishedAt){
    if(session.state==="cleanup_failed")fail("EXEC_CLEANUP_FAILED");
    return;
   }
   let inspected;
   try{inspected=dockerInspect(this.dockerBinary,session.containerId);}
   catch{await delay(50);continue;}
   const status=String(inspected.State?.Status??"");
   if(inspected.State?.Running===true||["exited","dead"].includes(status))return;
   if(status!=="created")fail("EXEC_START_FAILED");
   await delay(50);
  }
  fail("EXEC_START_FAILED");
 }
 startAttached(session){
  const attached=spawn(this.dockerBinary,["start","--attach",session.containerId],{
   stdio:["ignore","pipe","pipe"],shell:false,env:{PATH:process.env.PATH??"/usr/bin:/bin"}});
  session.logs=attached;
  attached.stdout.on("data",d=>this.collect(session,d));
  attached.stderr.on("data",d=>this.collect(session,d));
  attached.once("error",()=>this.failPlane(session));
  attached.once("close",()=>{
   if(session.finishedAt||session.forcingCleanup)return;
   session.logsClosed=true;
   let i;
   try{i=dockerInspect(this.dockerBinary,session.containerId);}
   catch{this.failPlane(session);return;}
   if(i.State?.Running===true||!["exited","dead"].includes(String(i.State?.Status??""))){
    this.failPlane(session);return;
   }
   const exit=Number(i.State?.ExitCode);
   if(!Number.isInteger(exit)){this.failPlane(session);return;}
   session.exitCode=exit;session.containerExited=true;this.maybeFinalize(session);
  });
 }

 async start({projectId,command,cwd=".",timeoutMs=300000,yieldTimeMs=10000,maxOutputBytes=262144}){
  const scope=this.scope(projectId,"exec_command");
  command=cleanCommand(command);cwd=cleanCwd(cwd);
  cleanInt(timeoutMs,1000,LIMITS.timeoutMs,"EXEC_TIMEOUT_INVALID");
  cleanInt(yieldTimeMs,0,30000,"EXEC_YIELD_INVALID");
  cleanInt(maxOutputBytes,1,LIMITS.outputBytes,"EXEC_OUTPUT_LIMIT_INVALID");
  if(this.failed||this.closed)fail("EXEC_CLEANUP_FAILED");
  this.prune();
  if(this.starting||[...this.sessions.values()].some(s=>!s.finishedAt)||
     this.sessions.size>=LIMITS.sessions)fail("EXEC_BUSY");
  if(/[\r\n,]/.test(scope.hostRoot))fail("EXEC_PROJECT_PATH_UNSUPPORTED");
  this.starting=true;
  let containerId=null,session=null;
  try{
   const project=await inspectExecProject(scope.hostRoot);
   await validateCwd(scope.hostRoot,cwd);
   if(this.failed||this.closed)fail("EXEC_CLEANUP_FAILED");
   const sessionId="xexec_"+randomBytes(16).toString("hex");
   const name="chatagent-business-"+this.ownerId.slice(0,8)+"-"+sessionId.slice(-12);
   const containerCwd=cwd==="."?"/project":"/project/"+cwd;
   const args=[
    "create","--name",name,"--init",
    "--label","chatagent.business.product=ChatAgentBusiness",
    "--label","chatagent.business.owner="+this.ownerId,
    "--label","chatagent.business.instance="+this.instanceId,
    "--label","chatagent.business.session="+sessionId,
    "--label","chatagent.business.project="+projectId,
    "--network","none","--read-only",
    "--pids-limit",String(LIMITS.pids),"--memory",LIMITS.memory,"--cpus",LIMITS.cpus,
    "--security-opt","no-new-privileges=true","--cap-drop","ALL",
    "--user",String(uid())+":"+String(gid()),"--workdir",containerCwd,
    "--tmpfs","/tmp:rw,nosuid,nodev,size="+LIMITS.tmpBytes+",mode=1777",
    "--log-driver","json-file","--log-opt","max-size=2m","--log-opt","max-file=1",
    "--mount","type=bind,src="+scope.hostRoot+",dst=/project",
   ];
   if(project.gitPresent)args.push("--mount","type=bind,src="+join(scope.hostRoot,".git")+",dst=/project/.git,readonly");
   for(const env of [
    "PATH=/usr/local/bin:/usr/bin:/bin","HOME=/tmp","SHELL=/bin/sh","LANG=C.UTF-8","LC_ALL=C.UTF-8","CI=1",
    "GIT_CONFIG_NOSYSTEM=1","GIT_CONFIG_GLOBAL=/dev/null","GIT_OPTIONAL_LOCKS=0","GIT_TERMINAL_PROMPT=0",
    "NPM_CONFIG_OFFLINE=true","NPM_CONFIG_AUDIT=false","NPM_CONFIG_FUND=false",
    "PIP_NO_INDEX=1","PIP_DISABLE_PIP_VERSION_CHECK=1"
   ])args.push("--env",env);
   args.push("--entrypoint","/bin/sh",this.imageRef,
    "-lc",'sleep 1.5; exec /bin/sh -lc "$1"',"chatagent-exec",command);
   try{containerId=String(execFile(this.dockerBinary,args,{timeout:15000})).trim();}
   catch{fail("EXEC_START_FAILED");}
   if(!/^[a-f0-9]{12,64}$/.test(containerId))fail("EXEC_START_FAILED");
   try{
    verifyIsolation({dockerBinary:this.dockerBinary,imageId:this.imageId,containerId,
     ownerId:this.ownerId,instanceId:this.instanceId,sessionId,projectId,
     hostRoot:scope.hostRoot,gitPresent:project.gitPresent});
   }catch(e){
    removeContainer(this.dockerBinary,containerId,{force:true});containerId=null;throw e;
   }
   session={
    id:sessionId,projectId,containerId,name,state:"running",pendingOutcome:null,
    bytes:Buffer.alloc(0),end:0,exitCode:null,startedAt:Date.now(),finishedAt:null,
    containerExited:false,logsClosed:false,forcingCleanup:false,
    changed:new EventEmitter(),timer:null,logs:null
   };
   this.sessions.set(sessionId,session);this.startAttached(session);
   await this.awaitStarted(session);
   session.timer=setTimeout(()=>{void this.stopSession(session,"timed_out").catch(()=>this.failPlane(session));},timeoutMs);
   session.timer.unref();
   await this.wait(session,yieldTimeMs);
   return this.result(session,0,maxOutputBytes);
  }catch(e){
   if(containerId&&!session)removeContainer(this.dockerBinary,containerId,{force:true});
   throw e;
  }finally{this.starting=false;}
 }
 async wait(session,ms){
  if(!ms||session.finishedAt||session.state==="cleanup_failed")return;
  await new Promise(resolve=>{
   const done=()=>{clearTimeout(timer);session.changed.off("change",done);resolve();};
   const timer=setTimeout(done,ms);session.changed.once("change",done);
  });
 }
 result(session,after,max){
  if(session.state==="cleanup_failed")fail("EXEC_CLEANUP_FAILED");
  if(!Number.isSafeInteger(after)||after<0||after>session.end)fail("EXEC_CURSOR_INVALID");
  const first=session.end-session.bytes.length,start=Math.max(first,after);
  const end=Math.min(session.end,start+max);
  return {
   sessionId:session.id,projectId:session.projectId,state:session.state,exitCode:session.exitCode,
   outputBase64:session.bytes.subarray(start-first,end-first).toString("base64"),
   afterSeq:start,nextSeq:end,truncated:after<first,hasMore:end<session.end,
   startedAt:session.startedAt,finishedAt:session.finishedAt
  };
 }

 async stopSession(session,outcome){
  if(session.finishedAt)return;
  if(session.pendingOutcome===null)session.pendingOutcome=outcome;
  const forceTerminal=(exitCode=137)=>{
   session.forcingCleanup=true;
   if(!removeContainer(this.dockerBinary,session.containerId,{force:true})){
    this.failPlane(session);fail("EXEC_CLEANUP_FAILED");
   }
   try{session.logs?.kill("SIGKILL");}catch{}
   session.containerExited=true;session.logsClosed=true;session.exitCode=session.exitCode??exitCode;
   this.maybeFinalize(session);
  };
  const r=spawnSync(this.dockerBinary,["stop","--time","1",session.containerId],{
   encoding:"utf8",timeout:5000,maxBuffer:65536,stdio:["ignore","pipe","pipe"]});
  if(r.error||r.signal||r.status!==0){
   forceTerminal(137);
   if(session.state==="cleanup_failed")fail("EXEC_CLEANUP_FAILED");
   return;
  }
  for(let i=0;i<20&&!session.finishedAt;i++)await this.wait(session,100);
  if(!session.finishedAt){
   let exitCode=137;
   try{
    const inspected=dockerInspect(this.dockerBinary,session.containerId);
    if(Number.isInteger(Number(inspected.State?.ExitCode)))exitCode=Number(inspected.State.ExitCode);
   }catch{}
   forceTerminal(exitCode);
  }
  if(session.state==="cleanup_failed")fail("EXEC_CLEANUP_FAILED");
 }
 async read({projectId,sessionId,afterSeq=0,waitMs=1000,maxOutputBytes=262144}){
  cleanInt(afterSeq,0,Number.MAX_SAFE_INTEGER,"EXEC_CURSOR_INVALID");
  cleanInt(waitMs,0,30000,"EXEC_WAIT_INVALID");
  cleanInt(maxOutputBytes,1,LIMITS.outputBytes,"EXEC_OUTPUT_LIMIT_INVALID");
  const s=this.get(projectId,sessionId,"read_process");
  if(afterSeq>s.end)fail("EXEC_CURSOR_INVALID");
  if(afterSeq===s.end&&!s.finishedAt)await this.wait(s,waitMs);
  return this.result(s,afterSeq,maxOutputBytes);
 }
 async terminate({projectId,sessionId}){
  const s=this.get(projectId,sessionId,"terminate_process");
  if(!s.finishedAt)await this.stopSession(s,"terminated");
  return {sessionId:s.id,projectId:s.projectId,state:s.state,exitCode:s.exitCode};
 }
 async close(){
  if(this.closed)return;this.closed=true;
  for(const s of this.sessions.values()){
   if(!s.finishedAt){
    try{await this.stopSession(s,"terminated");}catch{this.failPlane(s);}
   }
  }
  for(const id of containerIds(this.dockerBinary,this.ownerId)){
   if(!removeContainer(this.dockerBinary,id,{force:true}))this.failed=true;
  }
 }
}
