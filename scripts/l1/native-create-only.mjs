import {spawn} from "node:child_process";
import {promises as fs,constants as C} from "node:fs";
import {isAbsolute,dirname} from "node:path";
import {createHash} from "node:crypto";

const MAX_OUTPUT=512;
const sha=buf=>createHash("sha256").update(buf).digest("hex");
const validSha=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
export async function nativeCreateOnly({binary,expectedBinarySha256,target,buffer}){
 if(typeof binary!=="string"||!isAbsolute(binary)||
    typeof target!=="string"||!isAbsolute(target)||
    !validSha(expectedBinarySha256)||!Buffer.isBuffer(buffer)||buffer.length>262144)
   throw Error("INVALID_NATIVE_CREATE_CONFIG");
 const realBinary=await fs.realpath(binary);
 if(realBinary!==binary)throw Error("NATIVE_BINARY_SYMLINK_DENIED");
 // A public or symlinked immediate parent would allow an accidental binary
 // path swap even if the pinned bytes were verified using a separate fd.
 const binaryParent=dirname(binary);
 if(await fs.realpath(binaryParent)!==binaryParent)
  throw Error("NATIVE_BINARY_PARENT_UNSAFE");
 const parentStat=await fs.lstat(binaryParent);
 if(!parentStat.isDirectory()||parentStat.isSymbolicLink()||
    (parentStat.mode&0o077)!==0||
    (typeof process.getuid==="function"&&parentStat.uid!==process.getuid()))
  throw Error("NATIVE_BINARY_PARENT_UNSAFE");
 const fd=await fs.open(binary,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
    throw Error("NATIVE_BINARY_UNSAFE");
  if(sha(await fd.readFile())!==expectedBinarySha256)
    throw Error("NATIVE_BINARY_HASH_MISMATCH");
 }finally{await fd.close();}
 const result=await new Promise((resolve,reject)=>{
  let child;
  try{child=spawn(binary,[target],{
    stdio:["pipe","pipe","pipe"],shell:false,
    env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin",HOME:process.env.HOME??"",
      LANG:process.env.LANG??"en_US.UTF-8"}
  });}catch{return reject(Error("NATIVE_SPAWN_FAILED"));}
  let stdout="",stderr="",ended=false,outputLimited=false,timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},10000);
  child.on("error",()=>{if(!ended){ended=true;clearTimeout(timeout);reject(Error("NATIVE_SPAWN_FAILED"));}});
  child.stdin.on("error",()=>{/* fail-closed; close status is authoritative */});
  const capture=(channel,c)=>{
   if(outputLimited)return;
   const room=MAX_OUTPUT-(stdout.length+stderr.length);
   if(c.length>room){outputLimited=true;child.kill("SIGKILL");return;}
   if(channel==="stdout")stdout+=c.toString("utf8");else stderr+=c.toString("utf8");
  };
  child.stdout.on("data",c=>capture("stdout",c));
  child.stderr.on("data",c=>capture("stderr",c));
  child.on("close",code=>{
   if(ended)return;ended=true;clearTimeout(timeout);
   if(outputLimited)return reject(Error("NATIVE_OUTPUT_LIMIT"));
   if(timedOut)return reject(Error("NATIVE_CREATE_TIMEOUT_UNCERTAIN"));
   if(code!==0){
    const reason=stderr.trim();
    reject(Error(/^[A-Z_]{5,64}$/.test(reason)?reason:"NATIVE_CREATE_FAILED"));
   }else resolve(stdout.trim());
  });
  child.stdin.end(buffer);
 });
 const match=result.match(/^OK dev=(\d+) ino=(\d+) bytes=(\d+)$/);
 if(!match||Number(match[3])!==buffer.length)throw Error("NATIVE_RESULT_UNCERTAIN");
 const real=await fs.realpath(target);
 if(real!==target)throw Error("NATIVE_PATH_CHANGED_AFTER_COMMIT");
 const created=await fs.open(target,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await created.stat();
  if(!st.isFile()||st.nlink!==1||String(st.dev)!==match[1]||
     String(st.ino)!==match[2]||st.size!==buffer.length)
    throw Error("NATIVE_IDENTITY_UNCERTAIN");
  if(sha(await created.readFile())!==sha(buffer))
    throw Error("NATIVE_CONTENT_UNCERTAIN");
 }finally{await created.close();}
 return {path:target,bytes:buffer.length,sha256:sha(buffer),
   changed:true,commitMode:"DIRFD_O_EXCL"};
}
