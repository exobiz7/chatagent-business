import { promises as fs, constants as C, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { nativeCreateOnly } from "./native-create-only.mjs";
import { nativeReplaceCAS } from "./native-replace-cas.mjs";

const MAX_READ=65536;
const MAX_WRITE=262144;
const MAX_COPY=32*1024*1024*1024;
const sha = value => createHash("sha256").update(value).digest("hex");
const ensureScope=(broker,op,path)=>{
  const decision=broker.accessDecision(op,path);
  if(!decision.allowed)throw Error(decision.reason);
  if(path.length>4096||path.includes("\0")||/[\r\n]/.test(path))throw Error("INVALID_SCOPE");
  return normalize(path);
};
const protectedPath=(path,privateRoot)=>{
 const normalized=normalize(path);
 return normalized===privateRoot||normalized.startsWith(privateRoot+sep);
};
async function nearestReal(path) {
 let candidate=path,missing=[];
 for(;;){
  try {
   const real=await fs.realpath(candidate);
   return join(real,...missing.reverse());
  } catch(e) {
   if(e.code!=="ENOENT")throw e;
   if(candidate===dirname(candidate))throw Error("HOST_PATH_DENIED");
   missing.push(basename(candidate));candidate=dirname(candidate);
  }
 }
}
function checkSha(value){
 if(value!==null&&(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value)))throw Error("INVALID_PRECONDITION");
}
async function streamSha(path){
 const fh=await fs.open(path,"r");
 try{
  const hash=createHash("sha256");
  const buf=Buffer.alloc(1024*1024);
  for(;;){const {bytesRead}=await fh.read(buf,0,buf.length,null);if(!bytesRead)break;hash.update(buf.subarray(0,bytesRead));}
  return hash.digest("hex");
 }finally{await fh.close();}
}
export class HostFileOps {
 constructor(broker,{privateRoot,protectedRoots=[],testHooks=null,strictMutations=false,
   nativeCreateBinary=null,nativeCreateSha256=null,
   nativeReplaceBinary=null,nativeReplaceSha256=null}={}){
  this.broker=broker;
  // Fault injection is in-process test-only; no HTTP/MCP path can provide it.
  this.testHooks=testHooks;
  this.strictMutations=strictMutations;
  this.nativeCreateBinary=nativeCreateBinary;
  this.nativeCreateSha256=nativeCreateSha256;
  this.nativeReplaceBinary=nativeReplaceBinary;
  this.nativeReplaceSha256=nativeReplaceSha256;
  if(this.nativeReplaceBinary&&(!this.strictMutations||!this.nativeReplaceSha256))
    throw Error("NATIVE_REPLACE_REQUIRES_STRICT_AND_HASH");
  if(this.nativeCreateBinary&&(!this.strictMutations||!this.nativeCreateSha256))
    throw Error("NATIVE_CREATE_REQUIRES_STRICT_AND_HASH");
  this.privateRoots=[privateRoot,...protectedRoots].filter(Boolean).map(normalize);
  this.privateRootsReal=this.privateRoots.map(p=>realpathSync(p));
 }
 async allowed(op,path,{resolveLeaf=false}={}){
  const lexical=ensureScope(this.broker,op,path);
  const real=await nearestReal(lexical);
  if(this.privateRoots.some((root,i)=>protectedPath(lexical,root)||protectedPath(real,this.privateRootsReal[i])))
   throw Error("OWNER_CONTROL_PATH_DENIED");
  return resolveLeaf?real:lexical;
 }
 async list({path,offset=0,limit=100}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>250)
   throw Error("INVALID_PAGINATION");
  const target=await this.allowed("read",path);
  const entries=(await fs.readdir(target,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  return {path:target,total:entries.length,offset,entries:entries.slice(offset,offset+limit)
   .map(e=>({name:e.name,type:e.isSymbolicLink()?"symlink":e.isDirectory()?"directory":e.isFile()?"file":"other"}))};
 }
 async stat({path}){
  const target=await this.allowed("read",path);
  const s=await fs.lstat(target);
  return {path:target,kind:s.isSymbolicLink()?"symlink":s.isDirectory()?"directory":s.isFile()?"file":"other",
   bytes:s.size,modifiedAt:s.mtime.toISOString(),mode:(s.mode&0o777).toString(8)};
 }
 async read({path,offset=0,maxBytes=MAX_READ}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_READ)
   throw Error("INVALID_READ_BOUNDS");
  const target=await this.allowed("read",path,{resolveLeaf:true});
  const file=await fs.open(target,C.O_RDONLY|C.O_NOFOLLOW);
  try{
   const s=await file.stat();if(!s.isFile())throw Error("NOT_REGULAR_FILE");
   const buffer=Buffer.alloc(Math.min(maxBytes,Math.max(0,s.size-offset)));
   const {bytesRead}=await file.read(buffer,0,buffer.length,offset);
   return {path:target,offset,bytes:bytesRead,size:s.size,content:buffer.subarray(0,bytesRead).toString("utf8"),
    hasMore:offset+bytesRead<s.size};
  }finally{await file.close();}
 }
 async hash({path}){
  const target=await this.allowed("read",path,{resolveLeaf:true});
  const s=await fs.lstat(target);if(!s.isFile())throw Error("NOT_REGULAR_FILE");
  return {path:target,bytes:s.size,sha256:await streamSha(target)};
 }
 // Distinct semantic contracts: create can never overwrite; replace requires an exact digest.
 async create({path,content}){return this.write({path,content,mode:"create",expectedSha256:null});}
 async replace({path,content,expectedSha256}){return this.write({path,content,mode:"replace",expectedSha256});}
 async write({path,content,mode="create",expectedSha256=null}){
  if(typeof content!=="string"||Buffer.byteLength(content)>MAX_WRITE||!["create","replace"].includes(mode))
   throw Error("INVALID_WRITE");
  checkSha(expectedSha256);
  if(mode==="create"&&expectedSha256!==null || mode==="replace"&&expectedSha256===null)
   throw Error("PRECONDITION_REQUIRED");
  const target=await this.allowed("write",path,{resolveLeaf:!!this.nativeCreateBinary&&mode==="create"});
  const buffer=Buffer.from(content,"utf8");
  if(mode==="create"&&this.nativeCreateBinary){
   await this.testHooks?.beforeNativeCreateCommit?.({target});
   return nativeCreateOnly({binary:this.nativeCreateBinary,
     expectedBinarySha256:this.nativeCreateSha256,target,buffer});
  }
  if(mode==="replace"&&this.nativeReplaceBinary){
   // This hook runs before the native hash check: races at this boundary refuse.
   await this.testHooks?.beforeNativeReplaceCommit?.({target});
   return nativeReplaceCAS({binary:this.nativeReplaceBinary,
     expectedBinarySha256:this.nativeReplaceSha256,target,expectedSha256,buffer,
     testHooks:this.testHooks});
  }
  if(mode==="create"){
   const file=await fs.open(target,C.O_CREAT|C.O_EXCL|C.O_WRONLY|C.O_NOFOLLOW,0o600);
   try{await file.writeFile(buffer);await file.sync();}
   finally{await file.close();}
  }else{
   // No macOS Node path-based atomic compare-and-replace primitive is available.
   // In strict mode refuse a misleading SHA precondition rather than risking
   // replacement of a concurrently substituted destination.
   if(this.strictMutations)throw Error("ATOMIC_REPLACE_UNAVAILABLE");
   const s=await fs.lstat(target);
   if(!s.isFile()||s.nlink!==1)throw Error("UNSAFE_REPLACE_TARGET");
   if(await streamSha(target)!==expectedSha256)throw Error("PRECONDITION_MISMATCH");
   const temp=join(dirname(target),".chatagent-"+randomUUID()+".tmp");
   const file=await fs.open(temp,C.O_CREAT|C.O_EXCL|C.O_WRONLY,0o600);
   try {
    await file.writeFile(buffer);await file.sync();await file.close();
    const current=await fs.lstat(target);
    if(current.ino!==s.ino||current.dev!==s.dev||await streamSha(target)!==expectedSha256)
     throw Error("PRECONDITION_MISMATCH");
    await fs.rename(temp,target);
   }catch(e){try{await file.close();}catch{}try{await fs.unlink(temp);}catch{}throw e;}
  }
  return {path:target,bytes:buffer.length,sha256:sha(buffer),changed:true};
 }
 async copy({source,destination,expectedSourceSha256,expectedDestinationSha256=null}){
  // The descriptor-anchored native helper currently implements create-only,
  // not source-bound copy. Strict native profiles must refuse the weaker JS path.
  if(this.nativeCreateBinary)throw Error("NATIVE_COPY_UNAVAILABLE");
  checkSha(expectedSourceSha256);checkSha(expectedDestinationSha256);
  if(!expectedSourceSha256)throw Error("PRECONDITION_REQUIRED");
  const from=await this.allowed("read",source,{resolveLeaf:true});
  const to=await this.allowed("write",destination,{resolveLeaf:true});
  const stat=await fs.lstat(from);
  if(!stat.isFile()||stat.size>MAX_COPY)throw Error("INVALID_COPY_SOURCE");
  if(await streamSha(from)!==expectedSourceSha256)throw Error("PRECONDITION_MISMATCH");
  if(expectedDestinationSha256===null){
   try{await fs.lstat(to);throw Error("DESTINATION_EXISTS");}catch(e){if(e.code!=="ENOENT")throw e;}
  }else{
   if(this.strictMutations)throw Error("ATOMIC_REPLACE_UNAVAILABLE");
   const dest=await fs.lstat(to);
   if(!dest.isFile()||dest.nlink!==1||await streamSha(to)!==expectedDestinationSha256)
    throw Error("PRECONDITION_MISMATCH");
  }
  const staged=join(dirname(to),".chatagent-"+randomUUID()+".copy");
  try{
   await fs.copyFile(from,staged,C.COPYFILE_EXCL);
   const actual=await streamSha(staged);
   if(actual!==expectedSourceSha256)throw Error("SOURCE_CHANGED_DURING_COPY");
   if(expectedDestinationSha256!==null) {
    if(await streamSha(to)!==expectedDestinationSha256)throw Error("PRECONDITION_MISMATCH");
   } else {
    try{await fs.lstat(to);throw Error("DESTINATION_EXISTS");}catch(e){if(e.code!=="ENOENT")throw e;}
   }
   // Commit: hard-linking a staged file fails with EEXIST if another process
   // created the destination after its earlier absent check. Never rename over
   // an unexpected new file. Existing-target replace is still a separate CAS gap.
   if(expectedDestinationSha256===null){
     await this.testHooks?.beforeCopyCreateCommit?.({destination:to});
     // Re-check real scope immediately before commit; a hostile concurrent parent
     // path swap during this syscall still needs descriptor-bound protection.
     await this.allowed("write",to);
     await fs.link(staged,to);
     await fs.unlink(staged);
   }else{
     await fs.rename(staged,to);
   }
   return {source:from,destination:to,bytes:stat.size,sha256:actual,changed:true};
  }catch(e){try{await fs.unlink(staged);}catch{}throw e;}
 }
}
