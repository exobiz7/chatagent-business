import {spawn} from "node:child_process";
import {promises as fs,constants as C} from "node:fs";
import {isAbsolute,dirname} from "node:path";
import {createHash} from "node:crypto";
const digest=buf=>createHash("sha256").update(buf).digest("hex");
const validSha=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
export async function nativeReplaceCAS({binary,expectedBinarySha256,target,expectedSha256,buffer}){
 if(typeof binary!=="string"||!isAbsolute(binary)||
    typeof target!=="string"||!isAbsolute(target)||!validSha(expectedBinarySha256)||
    !validSha(expectedSha256)||!Buffer.isBuffer(buffer)||buffer.length>262144)
  throw Error("INVALID_NATIVE_CAS_CONFIG");
 const realBinary=await fs.realpath(binary);
 if(realBinary!==binary)throw Error("CAS_BINARY_SYMLINK_DENIED");
 const binaryParent=dirname(binary);
 if(await fs.realpath(binaryParent)!==binaryParent)
  throw Error("CAS_BINARY_PARENT_UNSAFE");
 const parentStat=await fs.lstat(binaryParent);
 if(!parentStat.isDirectory()||parentStat.isSymbolicLink()||
    (parentStat.mode&0o077)!==0||
    (typeof process.getuid==="function"&&parentStat.uid!==process.getuid()))
  throw Error("CAS_BINARY_PARENT_UNSAFE");
 const fd=await fs.open(binary,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
   throw Error("CAS_BINARY_UNSAFE");
  if(digest(await fd.readFile())!==expectedBinarySha256)
   throw Error("CAS_BINARY_HASH_MISMATCH");
 }finally{await fd.close();}
 const output=await new Promise((resolve,reject)=>{
  let child;
  try{child=spawn(binary,[target,expectedSha256],{
   stdio:["pipe","pipe","pipe"],shell:false,
   env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin",HOME:process.env.HOME??"",
     LANG:process.env.LANG??"en_US.UTF-8"}
  });}catch{return reject(Error("CAS_SPAWN_FAILED"));}
  let stdout="",stderr="",ended=false,limited=false,timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},10000);
  child.on("error",()=>{if(!ended){ended=true;clearTimeout(timeout);reject(Error("CAS_SPAWN_FAILED"));}});
  child.stdin.on("error",()=>{/* use bounded child exit status */});
  const capture=(channel,c)=>{
   if(limited)return;
   if(c.length>512-Buffer.byteLength(stdout+stderr)){limited=true;child.kill("SIGKILL");return;}
   if(channel==="stdout")stdout+=c.toString("utf8");else stderr+=c.toString("utf8");
  };
  child.stdout.on("data",c=>capture("stdout",c));
  child.stderr.on("data",c=>capture("stderr",c));
  child.on("close",code=>{
   if(ended)return;ended=true;clearTimeout(timeout);
   if(limited)return reject(Error("CAS_OUTPUT_LIMIT_UNCERTAIN"));
   if(timedOut)return reject(Error("CAS_TIMEOUT_UNCERTAIN"));
   if(code!==0){
    const reason=stderr.trim();
    reject(Error(/^CAS_[A-Z_]{3,64}$/.test(reason)?reason:"CAS_EFFECT_UNCERTAIN"));
   }else resolve(stdout.trim());
  });
  child.stdin.end(buffer);
 });
 const match=output.match(/^CAS_DONE bytes=(\d+)$/);
 if(!match||Number(match[1])!==buffer.length)throw Error("CAS_RESULT_UNCERTAIN");
 // Post-commit observation: failure is uncertainty, never permission to retry.
 let real;
 try{real=await fs.realpath(target);}catch{throw Error("CAS_POSTCOMMIT_UNCERTAIN");}
 if(real!==target)throw Error("CAS_POSTCOMMIT_UNCERTAIN");
 const committed=await fs.open(target,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await committed.stat();
  if(!st.isFile()||st.nlink!==1||st.size!==buffer.length||
     digest(await committed.readFile())!==digest(buffer))
   throw Error("CAS_POSTCOMMIT_UNCERTAIN");
 }finally{await committed.close();}
 return {path:target,bytes:buffer.length,sha256:digest(buffer),
   changed:true,commitMode:"DIRFD_EXPECTED_SHA_RENAME"};
}
