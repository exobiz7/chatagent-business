import {spawn} from "node:child_process";
import {openSync,closeSync,fstatSync,lstatSync,constants as C} from "node:fs";
import {isAbsolute,join} from "node:path";

// macOS-only development launcher: lockf owns an OS advisory lock for the
// complete life of the broker process; do not use this against the live P8 lane.
const state=process.env.L1_STATE_DIR;
if(!state||!isAbsolute(state)||process.env.L1_DURABLE_PROCESS_ENABLED!=="1")
 throw Error("LOCKED_DURABLE_LAUNCH_REQUIRED");
const dir=lstatSync(state);
if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||
   (process.getuid&&dir.uid!==process.getuid()))throw Error("STATE_DIRECTORY_UNSAFE");
const lock=join(state,"broker.lock");
const flags=C.O_CREAT|C.O_RDWR|C.O_NOFOLLOW;
const fd=openSync(lock,flags,0o600);
try{
 const f=fstatSync(fd);
 if(!f.isFile()||(f.mode&0o077)!==0||f.nlink!==1||
   (process.getuid&&f.uid!==process.getuid()))throw Error("LOCK_FILE_UNSAFE");
}finally{closeSync(fd);}
const child=spawn("/usr/bin/lockf",["-k","-t","0",lock,process.execPath,
 new URL("./broker-server.mjs",import.meta.url).pathname],{
 stdio:"inherit",env:{...process.env,L1_LOCKED_STARTUP:"1"}
});
child.on("error",()=>{process.exitCode=1;});
child.on("exit",(code,signal)=>{process.exitCode=code??(signal?1:0);});
