import {
 existsSync,mkdirSync,lstatSync,openSync,closeSync,writeSync,fsyncSync,
 statSync,renameSync,unlinkSync,readFileSync,readdirSync
} from "node:fs";
import {join,isAbsolute,resolve} from "node:path";
import {randomUUID} from "node:crypto";

const PROFILES=new Set(["READ_ONLY","SAFE","STANDARD","UNKNOWN"]);
const EFFECTS=new Set(["CREATE","REPLACE","PATCH","CONTINUITY_WRITE","EXEC_START","EXEC_TERMINATE"]);
const CODE=/^[A-Z][A-Z0-9_]{1,63}$/;
const SHA=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==="function"?process.getuid():null;

function privateDir(dir){
 if(typeof dir!=="string"||!isAbsolute(dir)||resolve(dir)==="/")fail("BUSINESS_AUDIT_ROOT_UNSAFE");
 if(!existsSync(dir))mkdirSync(dir,{mode:0o700,recursive:false});
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (uid()!==null&&st.uid!==uid()))fail("BUSINESS_AUDIT_ROOT_UNSAFE");
}
function privateFile(path){
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
    (uid()!==null&&st.uid!==uid()))fail("BUSINESS_AUDIT_FILE_UNSAFE");
 return st;
}
function boundedPath(value){
 if(value===null||value===undefined)return null;
 if(typeof value!=="string"||value.length>4096||/[\x00-\x1f\x7f]/.test(value))
  fail("BUSINESS_AUDIT_EVENT_INVALID");
 return value;
}

export class BusinessAuditLedger{
 constructor(dir,{maxBytes=1024*1024,maxArchives=4}={}){
  if(!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>16*1024*1024||
     !Number.isInteger(maxArchives)||maxArchives<1||maxArchives>8)
   fail("BUSINESS_AUDIT_CONFIG_INVALID");
  privateDir(dir);this.dir=dir;this.file=join(dir,"audit.jsonl");
  this.maxBytes=maxBytes;this.maxArchives=maxArchives;
  if(!existsSync(this.file)){
   const fd=openSync(this.file,"wx",0o600);try{fsyncSync(fd);}finally{closeSync(fd);}
  }
  privateFile(this.file);
 }
 rotateIfNeeded(incoming){
  const current=privateFile(this.file);
  if(current.size+incoming<=this.maxBytes)return;
  const oldest=join(this.dir,"audit."+this.maxArchives+".jsonl");
  if(existsSync(oldest)){privateFile(oldest);unlinkSync(oldest);}
  for(let i=this.maxArchives-1;i>=1;i--){
   const from=join(this.dir,"audit."+i+".jsonl"),to=join(this.dir,"audit."+(i+1)+".jsonl");
   if(existsSync(from)){privateFile(from);renameSync(from,to);}
  }
  renameSync(this.file,join(this.dir,"audit.1.jsonl"));
  const fd=openSync(this.file,"wx",0o600);try{fsyncSync(fd);}finally{closeSync(fd);}
  const dfd=openSync(this.dir,"r");try{fsyncSync(dfd);}finally{closeSync(dfd);}
 }
 append(event){
  if(!event||typeof event!=="object"||Array.isArray(event))fail("BUSINESS_AUDIT_EVENT_INVALID");
  const normalized={
   requestId:typeof event.requestId==="string"&&event.requestId.length<=80?event.requestId:randomUUID(),
   timestamp:Number.isSafeInteger(event.timestamp)?event.timestamp:Date.now(),
   organizationId:typeof event.organizationId==="string"&&event.organizationId.length<=64?event.organizationId:fail("BUSINESS_AUDIT_EVENT_INVALID"),
   projectId:typeof event.projectId==="string"&&event.projectId.length<=64?event.projectId:fail("BUSINESS_AUDIT_EVENT_INVALID"),
   profile:PROFILES.has(event.profile)?event.profile:fail("BUSINESS_AUDIT_EVENT_INVALID"),
   tool:typeof event.tool==="string"&&event.tool.length<=64?event.tool:fail("BUSINESS_AUDIT_EVENT_INVALID"),
   effectClass:EFFECTS.has(event.effectClass)?event.effectClass:fail("BUSINESS_AUDIT_EVENT_INVALID"),
   targetRelativePath:boundedPath(event.targetRelativePath),
   preconditionDigest:event.preconditionDigest===null||event.preconditionDigest===undefined?null:
    SHA.test(event.preconditionDigest)?event.preconditionDigest:fail("BUSINESS_AUDIT_EVENT_INVALID"),
   resultCode:CODE.test(event.resultCode??"")?event.resultCode:fail("BUSINESS_AUDIT_EVENT_INVALID")
  };
  const line=Buffer.from(JSON.stringify(normalized)+"\n");
  if(line.length>8192)fail("BUSINESS_AUDIT_EVENT_TOO_LARGE");
  this.rotateIfNeeded(line.length);
  privateFile(this.file);
  const fd=openSync(this.file,"a",0o600);
  try{
   let off=0;while(off<line.length){const n=writeSync(fd,line,off,line.length-off);if(n<=0)fail("BUSINESS_AUDIT_WRITE_UNCERTAIN");off+=n;}
   fsyncSync(fd);
  }finally{closeSync(fd);}
  return normalized;
 }

 readRecent(limit=50){
  if(!Number.isInteger(limit)||limit<1||limit>200)fail("BUSINESS_AUDIT_LIMIT_INVALID");
  const lines=readFileSync(this.file,"utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map(line=>{
   try{return JSON.parse(line);}catch{fail("BUSINESS_AUDIT_CORRUPT");}
  });
 }
 status(){
  const archives=readdirSync(this.dir).filter(n=>/^audit\.\d+\.jsonl$/.test(n)).sort();
  return {bytes:statSync(this.file).size,archives:archives.length,maxBytes:this.maxBytes};
 }
}
