import {spawn} from "node:child_process";
import {promises as fs,constants as C} from "node:fs";
import {createHash} from "node:crypto";
import {dirname,isAbsolute} from "node:path";

const digest=buf=>createHash("sha256").update(buf).digest("hex");
const validSha=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);

async function verifyBinary(binary,expectedSha256){
 if(typeof binary!=="string"||!isAbsolute(binary)||!validSha(expectedSha256))
  throw Error("BUSINESS_NATIVE_MKDIR_CONFIG_INVALID");
 const real=await fs.realpath(binary);
 if(real!==binary)throw Error("BUSINESS_NATIVE_MKDIR_BINARY_UNSAFE");
 const parent=dirname(binary);
 if(await fs.realpath(parent)!==parent)throw Error("BUSINESS_NATIVE_MKDIR_BINARY_UNSAFE");
 const ps=await fs.lstat(parent);
 if(!ps.isDirectory()||ps.isSymbolicLink()||(ps.mode&0o077)!==0||
    (typeof process.getuid==="function"&&ps.uid!==process.getuid()))
  throw Error("BUSINESS_NATIVE_MKDIR_BINARY_UNSAFE");
 const fd=await fs.open(binary,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
    throw Error("BUSINESS_NATIVE_MKDIR_BINARY_UNSAFE");
  if(digest(await fd.readFile())!==expectedSha256)
    throw Error("BUSINESS_NATIVE_MKDIR_BINARY_HASH_MISMATCH");
 }finally{await fd.close();}
}

export async function nativeMkdirOnly({binary,expectedBinarySha256,target}){
 if(typeof target!=="string"||!isAbsolute(target))
  throw Error("BUSINESS_NATIVE_MKDIR_CONFIG_INVALID");
 await verifyBinary(binary,expectedBinarySha256);
 const result=await new Promise((resolve,reject)=>{
  let child;
  try{child=spawn(binary,[target],{stdio:["ignore","pipe","pipe"],shell:false,
   env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin",HOME:process.env.HOME??"",
    LANG:process.env.LANG??"en_US.UTF-8"}});}
  catch{return reject(Error("BUSINESS_MKDIR_SPAWN_FAILED"));}
  let stdout="",stderr="",ended=false,limited=false,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},10000);
  const capture=(which,c)=>{
   if(limited)return;
   if(Buffer.byteLength(stdout+stderr)+c.length>512){limited=true;child.kill("SIGKILL");return;}
   if(which==="out")stdout+=c.toString("utf8");else stderr+=c.toString("utf8");
  };
  child.stdout.on("data",c=>capture("out",c));child.stderr.on("data",c=>capture("err",c));
  child.on("error",()=>{if(!ended){ended=true;clearTimeout(timer);reject(Error("BUSINESS_MKDIR_SPAWN_FAILED"));}});
  child.on("close",code=>{
   if(ended)return;ended=true;clearTimeout(timer);
   if(limited||timedOut)return reject(Error("BUSINESS_MKDIR_UNCERTAIN"));
   if(code!==0){
    const reason=stderr.trim();
    if(reason==="MKDIR_DESTINATION_EXISTS")return reject(Error("BUSINESS_DESTINATION_EXISTS"));
    if(reason.endsWith("_UNCERTAIN"))return reject(Error("BUSINESS_MKDIR_UNCERTAIN"));
    return reject(Error("BUSINESS_MKDIR_DENIED"));
   }
   resolve(stdout.trim());
  });
 });

 const match=result.match(/^MKDIR_DONE dev=(\d+) ino=(\d+)$/);
 if(!match)throw Error("BUSINESS_MKDIR_UNCERTAIN");
 let real,st;
 try{
  real=await fs.realpath(target);
  if(real!==target)throw Error("BUSINESS_MKDIR_UNCERTAIN");
  st=await fs.lstat(target);
 }catch{throw Error("BUSINESS_MKDIR_UNCERTAIN");}
 if(!st.isDirectory()||st.isSymbolicLink()||String(st.dev)!==match[1]||String(st.ino)!==match[2])
  throw Error("BUSINESS_MKDIR_UNCERTAIN");
 return {changed:true,commitMode:"DIRFD_MKDIR_EXCL"};
}
