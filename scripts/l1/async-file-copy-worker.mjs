import {spawn} from "node:child_process";
import {promises as fs,constants as C} from "node:fs";
import {createHash} from "node:crypto";
import {isAbsolute,dirname} from "node:path";

const [binary,binarySha,source,destination,expectedSha,size,dev,ino,stageId]=process.argv.slice(2);
const valid=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const fail=reason=>{process.stderr.write("ASYNC_COPY_"+reason+"\n");process.exitCode=3;};
if(!isAbsolute(binary??"")||!isAbsolute(source??"")||!isAbsolute(destination??"")||
 !valid(binarySha)||!valid(expectedSha)||![size,dev,ino].every(x=>/^\d+$/.test(x??""))||
 !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(stageId??""))
 throw Error("INVALID_COPY_JOB");
const parent=dirname(binary);
if(await fs.realpath(parent)!==parent)throw Error("COPY_HELPER_UNSAFE");
const dir=await fs.lstat(parent);
if(!dir.isDirectory()||(dir.mode&0o077)!==0||dir.uid!==process.getuid())
 throw Error("COPY_HELPER_UNSAFE");
const fd=await fs.open(binary,C.O_RDONLY|C.O_NOFOLLOW);
try{
 const st=await fd.stat();const actual=createHash("sha256").update(await fd.readFile()).digest("hex");
 if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
   (st.mode&0o077)!==0||actual!==binarySha)throw Error("COPY_HELPER_UNSAFE");
}finally{await fd.close();}
await new Promise((resolve,reject)=>{
 const child=spawn(binary,[source,destination,expectedSha,size,dev,ino,stageId],{
  stdio:["ignore","pipe","pipe"],shell:false,
  env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin",LANG:"en_US.UTF-8"}
 });
 let stderr="",done=false;
 child.stdout.on("data",b=>process.stdout.write(b));
 child.stderr.on("data",b=>{stderr=(stderr+b.toString()).slice(-256);});
 child.on("error",()=>{if(!done){done=true;reject(Error("COPY_HELPER_SPAWN_FAILED"));}});
 child.on("close",code=>{
  if(done)return;done=true;
  if(code===0)resolve();
  else reject(Error(/^[A-Z_]{5,80}$/.test(stderr.trim())?
    stderr.trim():"COPY_HELPER_FAILED"));
 });
}).catch(e=>fail(String(e.message)));
