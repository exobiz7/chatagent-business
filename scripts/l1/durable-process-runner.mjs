import {spawn,spawnSync} from "node:child_process";
import {existsSync,lstatSync,readFileSync,openSync,writeSync,fsyncSync,closeSync,renameSync,constants as C} from "node:fs";
import {join,isAbsolute} from "node:path";
import {createHash,randomUUID} from "node:crypto";

const dir=process.argv[2];
if(!dir||!isAbsolute(dir))throw Error("INVALID_JOB_DIR");
const st=lstatSync(dir);
if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
 (process.getuid&&st.uid!==process.getuid()))throw Error("UNSAFE_JOB_DIR");

const input=JSON.parse(readFileSync(join(dir,"config.json"),"utf8"));
const log=join(dir,"output.log");
const manifest=join(dir,"manifest.json");
const limit=1024*1024;
const startToken=()=>{
 const r=spawnSync("/bin/ps",["-p",String(process.pid),"-o","lstart="],{encoding:"utf8",timeout:1500});
 if(r.status!==0||!r.stdout.trim())throw Error("RUNNER_IDENTITY_UNAVAILABLE");
 return r.stdout.trim();
};
const atomic=value=>{
 const tmp=manifest+".tmp-"+randomUUID();
 const fd=openSync(tmp,"wx",0o600);
 try{writeSync(fd,JSON.stringify(value)+"\n");fsyncSync(fd);}
 finally{closeSync(fd);}
 renameSync(tmp,manifest);
 const fdDir=openSync(dir,"r");
 try{fsyncSync(fdDir);}finally{closeSync(fdDir);}
};
const logfd=openSync(log,C.O_CREAT|C.O_EXCL|C.O_WRONLY,0o600);
let outputBytes=0;
let truncated=false;
const append=(label,data)=>{
 const chunk=Buffer.concat([Buffer.from(label),Buffer.from(data)]);
 if(outputBytes>=limit){truncated=true;return;}
 const slice=chunk.subarray(0,limit-outputBytes);
 if(slice.length){writeSync(logfd,slice);fsyncSync(logfd);outputBytes+=slice.length;}
 if(slice.length!==chunk.length)truncated=true;
};
let record={version:1,processId:input.processId,nonce:input.nonce,runnerPid:process.pid,
 runnerStartToken:startToken(),childPid:null,state:"STARTING",startedAt:Date.now(),
 endedAt:null,exitCode:null,signal:null,bytesCaptured:0,truncated:false};
atomic(record);
let child=null,timeout=null,escalate=null,terminating=false,finished=false;
const signalGroup=signal=>{
 try{process.kill(-process.pid,signal);}catch(e){if(e.code!=="ESRCH")throw e;}
};
const update=(fields={})=>{record={...record,...fields,bytesCaptured:outputBytes,truncated};atomic(record);};
const terminate=()=>{
 if(finished||terminating)return;
 terminating=true;
 update({state:"TERMINATION_PENDING"});
 // The supervisor leads a private POSIX session. Its child and descendants
 // inherit that group unless they explicitly detach. Never target outside it.
 signalGroup("SIGTERM");
 escalate=setTimeout(()=>{
  if(!finished){
   update({state:"RECOVERY_REQUIRED",endedAt:Date.now()});
   signalGroup("SIGKILL");
  }
 },2000);
};
process.on("SIGTERM",terminate);
process.on("SIGINT",terminate);
const finish=(state,code=null,signal=null)=>{
 if(finished)return;
 finished=true;
 if(timeout)clearTimeout(timeout);
 if(escalate)clearTimeout(escalate);
 update({state,endedAt:Date.now(),exitCode:code,signal});
 fsyncSync(logfd);closeSync(logfd);
 // A direct child can exit while descendants remain; terminate only our group.
 signalGroup("SIGTERM");
 setTimeout(()=>signalGroup("SIGKILL"),500).unref?.();
 process.exitCode=0;
};
try{
 child=spawn(input.executable,input.argv,{cwd:input.cwd,
  env:{PATH:process.env.PATH??"/usr/bin:/bin:/usr/sbin:/sbin",HOME:process.env.HOME??"",
   TMPDIR:process.env.TMPDIR??"/tmp",LANG:process.env.LANG??"en_US.UTF-8"},
  stdio:["ignore","pipe","pipe"],shell:false,detached:false});
 child.stdout.on("data",c=>append("[stdout] ",c));
 child.stderr.on("data",c=>append("[stderr] ",c));
 child.on("error",e=>{
  append("[spawn-error] ",Buffer.from(e.code??"SPAWN_ERROR"));
  finish("FAILED");
 });
 child.on("close",(code,signal)=>{
  finish(terminating||signal?"TERMINATED":code===0?"EXITED":"FAILED",code,signal);
 });
 update({state:"RUNNING",childPid:child.pid??null});
 if(terminating)terminate();
 timeout=setTimeout(terminate,input.timeoutMs);
}catch(e){
 append("[spawn-error] ",Buffer.from(typeof e.code==="string"?e.code:"SPAWN_ERROR"));
 finish("FAILED");
}
