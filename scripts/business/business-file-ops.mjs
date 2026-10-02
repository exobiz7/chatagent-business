import {promises as fs,constants as C} from "node:fs";
import {createHash} from "node:crypto";
import {isAbsolute,join,sep} from "node:path";
import {authorizeProjectTool} from "./business-core.mjs";
import {nativeCreateOnly} from "../l1/native-create-only.mjs";
import {nativeReplaceCAS} from "../l1/native-replace-cas.mjs";
import {nativeMkdirOnly} from "./business-native-mkdir.mjs";

const MAX_READ=65536;
const MAX_WRITE=262144;
const MAX_LIST=250;
const shaBuffer=buf=>createHash("sha256").update(buf).digest("hex");
const validSha=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const fail=code=>{throw Error(code);};

function cleanRelative(relativePath,{allowRoot=false}={}){
 if(typeof relativePath!=="string"||relativePath.length>4096||
    relativePath.includes("\0")||/[\r\n]/.test(relativePath)||isAbsolute(relativePath))
  fail("BUSINESS_RELATIVE_PATH_INVALID");
 if(relativePath===""&&allowRoot)return [];
 if(relativePath==="")fail("BUSINESS_RELATIVE_PATH_INVALID");
 const parts=relativePath.split("/");
 if(parts.some(p=>!p||p==="."||p===".."||p===".git"))
  fail(parts.includes(".git")?"BUSINESS_GIT_PATH_DENIED":"BUSINESS_RELATIVE_PATH_INVALID");
 return parts;
}
async function checkedPath(root,relativePath,{allowRoot=false,leafMayMissing=false}={}){
 const parts=cleanRelative(relativePath,{allowRoot});
 let current=root;
 if(parts.length===0)return {absolute:root,parts};
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]);
  try{
   const st=await fs.lstat(current);
   if(st.isSymbolicLink())fail("BUSINESS_SYMLINK_DENIED");
   if(i<parts.length-1&&!st.isDirectory())fail("BUSINESS_PARENT_NOT_DIRECTORY");
  }catch(e){
   if(e?.code==="ENOENT"&&leafMayMissing&&i===parts.length-1)
    return {absolute:current,parts,missing:true};
   if(e?.code==="ENOENT")fail(i<parts.length-1?"BUSINESS_PARENT_NOT_FOUND":"BUSINESS_PATH_NOT_FOUND");
   throw e;
  }
 }
 const real=await fs.realpath(current);
 if(real!==current||!(real===root||real.startsWith(root+sep)))fail("BUSINESS_PATH_ESCAPE");
 return {absolute:current,parts,missing:false};
}

async function streamHash(path){
 const fh=await fs.open(path,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await fh.stat();if(!st.isFile())fail("BUSINESS_NOT_REGULAR_FILE");
  const hash=createHash("sha256"),buf=Buffer.alloc(1024*1024);
  for(;;){const {bytesRead}=await fh.read(buf,0,buf.length,null);if(!bytesRead)break;hash.update(buf.subarray(0,bytesRead));}
  return {bytes:st.size,sha256:hash.digest("hex")};
 }finally{await fh.close();}
}
function mutationError(e,kind){
 const code=String(e?.message||"BUSINESS_FILE_OPERATION_FAILED");
 if(["CAS_PRECONDITION_MISMATCH","CAS_TARGET_CHANGED"].includes(code))return Error("BUSINESS_WRITE_CONFLICT");
 if(code==="CAS_TARGET_MISSING")return Error("BUSINESS_TARGET_MISSING");
 if(code==="NATIVE_DESTINATION_EXISTS"||code==="BUSINESS_DESTINATION_EXISTS")return Error("BUSINESS_DESTINATION_EXISTS");
 if(code==="CAS_METADATA_UNSUPPORTED"||code==="CAS_TARGET_UNSAFE")return Error("BUSINESS_TARGET_UNSUPPORTED");
 if(/UNCERTAIN$/.test(code)||code.includes("_UNCERTAIN")||
    ["NATIVE_CLOSE_FAILED","NATIVE_PATH_CHANGED_AFTER_COMMIT"].includes(code)){
  const out=Error("BUSINESS_"+kind+"_UNCERTAIN");out.effect="UNCERTAIN";out.retryable=false;return out;
 }
 return e;
}

export class BusinessFileOps{
 constructor(registry,{nativeCreateBinary,nativeCreateSha256,nativeReplaceBinary,nativeReplaceSha256,
  nativeMkdirBinary,nativeMkdirSha256,testHooks=null}={}){
  this.registry=registry;this.testHooks=testHooks;
  this.native={create:nativeCreateBinary,createSha:nativeCreateSha256,
   replace:nativeReplaceBinary,replaceSha:nativeReplaceSha256,
   mkdir:nativeMkdirBinary,mkdirSha:nativeMkdirSha256};
  for(const [k,v] of Object.entries(this.native))
   if(typeof v!=="string"||!v)fail("BUSINESS_NATIVE_FILE_CONFIG_REQUIRED");
 }
 scope(projectId,tool){return authorizeProjectTool(this.registry,{projectId,tool});}
 async listDirectory({projectId,relativePath="",offset=0,limit=100}){
  const {hostRoot}=this.scope(projectId,"list_directory");
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>MAX_LIST)
   fail("BUSINESS_PAGINATION_INVALID");
  const {absolute}=await checkedPath(hostRoot,relativePath,{allowRoot:true});
  const st=await fs.lstat(absolute);if(!st.isDirectory())fail("BUSINESS_NOT_DIRECTORY");
  const entries=(await fs.readdir(absolute,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  return {projectId,relativePath,total:entries.length,offset,
   entries:entries.slice(offset,offset+limit).map(e=>({name:e.name,
    type:e.isSymbolicLink()?"symlink":e.isDirectory()?"directory":e.isFile()?"file":"other"}))};
 }

 async statPath({projectId,relativePath}){
  const {hostRoot}=this.scope(projectId,"stat_path");
  const {absolute}=await checkedPath(hostRoot,relativePath);
  const st=await fs.lstat(absolute);
  return {projectId,relativePath,kind:st.isDirectory()?"directory":st.isFile()?"file":"other",
   bytes:st.size,modifiedAt:st.mtime.toISOString(),mode:(st.mode&0o777).toString(8)};
 }
 async readFile({projectId,relativePath,offset=0,maxBytes=MAX_READ}){
  const {hostRoot}=this.scope(projectId,"read_file");
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_READ)
   fail("BUSINESS_READ_BOUNDS_INVALID");
  const {absolute}=await checkedPath(hostRoot,relativePath);
  const pre=await fs.lstat(absolute);if(!pre.isFile())fail("BUSINESS_NOT_REGULAR_FILE");
  const fh=await fs.open(absolute,C.O_RDONLY|C.O_NOFOLLOW);
  try{
   const st=await fh.stat();if(!st.isFile())fail("BUSINESS_NOT_REGULAR_FILE");
   const buffer=Buffer.alloc(Math.min(maxBytes,Math.max(0,st.size-offset)));
   const {bytesRead}=await fh.read(buffer,0,buffer.length,offset);
   return {projectId,relativePath,offset,bytes:bytesRead,size:st.size,
    content:buffer.subarray(0,bytesRead).toString("utf8"),hasMore:offset+bytesRead<st.size};
  }finally{await fh.close();}
 }
 async hashFile({projectId,relativePath}){
  const {hostRoot}=this.scope(projectId,"hash_file");
  const {absolute}=await checkedPath(hostRoot,relativePath);
  const st=await fs.lstat(absolute);if(!st.isFile())fail("BUSINESS_NOT_REGULAR_FILE");
  const value=await streamHash(absolute);
  return {projectId,relativePath,...value};
 }
 async makeDirectory({projectId,relativePath}){
  const {hostRoot}=this.scope(projectId,"make_directory");
  const {absolute,missing}=await checkedPath(hostRoot,relativePath,{leafMayMissing:true});
  if(!missing)fail("BUSINESS_DESTINATION_EXISTS");
  try{
   const result=await nativeMkdirOnly({binary:this.native.mkdir,
    expectedBinarySha256:this.native.mkdirSha,target:absolute});
   const verified=await checkedPath(hostRoot,relativePath);
   const st=await fs.lstat(verified.absolute);
   if(!st.isDirectory())fail("BUSINESS_MKDIR_UNCERTAIN");
   return {projectId,relativePath,changed:true,commitMode:result.commitMode};
  }catch(e){throw mutationError(e,"MKDIR");}
 }

 async createFile({projectId,relativePath,content}){
  const {hostRoot}=this.scope(projectId,"create_file");
  if(typeof content!=="string"||Buffer.byteLength(content)>MAX_WRITE)fail("BUSINESS_WRITE_INVALID");
  const {absolute,missing}=await checkedPath(hostRoot,relativePath,{leafMayMissing:true});
  if(!missing)fail("BUSINESS_DESTINATION_EXISTS");
  const buffer=Buffer.from(content,"utf8");
  try{
   const result=await nativeCreateOnly({binary:this.native.create,
    expectedBinarySha256:this.native.createSha,target:absolute,buffer});
   const verified=await checkedPath(hostRoot,relativePath);
   const digest=await streamHash(verified.absolute);
   if(digest.sha256!==result.sha256||digest.bytes!==buffer.length){
    const e=Error("BUSINESS_CREATE_UNCERTAIN");e.effect="UNCERTAIN";e.retryable=false;throw e;
   }
   return {projectId,relativePath,bytes:buffer.length,sha256:result.sha256,
    changed:true,commitMode:result.commitMode};
  }catch(e){throw mutationError(e,"CREATE");}
 }
 async replaceFile({projectId,relativePath,content,expectedSha256}){
  const {hostRoot}=this.scope(projectId,"replace_file");
  if(typeof content!=="string"||Buffer.byteLength(content)>MAX_WRITE||!validSha(expectedSha256))
   fail("BUSINESS_WRITE_INVALID");
  const resolved=await checkedPath(hostRoot,relativePath,{leafMayMissing:true});
  if(resolved.missing)fail("BUSINESS_TARGET_MISSING");
  const absolute=resolved.absolute;
  const st=await fs.lstat(absolute);if(!st.isFile())fail("BUSINESS_TARGET_UNSUPPORTED");
  const buffer=Buffer.from(content,"utf8");
  try{
   const result=await nativeReplaceCAS({binary:this.native.replace,
    expectedBinarySha256:this.native.replaceSha,target:absolute,expectedSha256,buffer,
    testHooks:this.testHooks});
   const verified=await checkedPath(hostRoot,relativePath);
   const digest=await streamHash(verified.absolute);
   if(digest.sha256!==result.sha256||digest.bytes!==buffer.length){
    const e=Error("BUSINESS_REPLACE_UNCERTAIN");e.effect="UNCERTAIN";e.retryable=false;throw e;
   }
   return {projectId,relativePath,bytes:buffer.length,sha256:result.sha256,
    changed:true,commitMode:result.commitMode};
  }catch(e){throw mutationError(e,"REPLACE");}
 }

 async applyPatch({projectId,relativePath,expectedSha256,oldText,newText,expectedOccurrences=1}){
  const {hostRoot}=this.scope(projectId,"apply_patch");
  if(!validSha(expectedSha256)||typeof oldText!=="string"||oldText.length===0||
     typeof newText!=="string"||Buffer.byteLength(oldText)>131072||
     Buffer.byteLength(newText)>131072||!Number.isInteger(expectedOccurrences)||
     expectedOccurrences<1||expectedOccurrences>32)fail("BUSINESS_PATCH_INVALID");
  const {absolute}=await checkedPath(hostRoot,relativePath);
  const st=await fs.lstat(absolute);
  if(!st.isFile()||st.size>MAX_WRITE)fail("BUSINESS_PATCH_OVERFLOW");
  const fh=await fs.open(absolute,C.O_RDONLY|C.O_NOFOLLOW);
  let buffer;try{
   const now=await fh.stat();if(!now.isFile()||now.size>MAX_WRITE)fail("BUSINESS_PATCH_OVERFLOW");
   buffer=await fh.readFile();
  }finally{await fh.close();}
  if(shaBuffer(buffer)!==expectedSha256)fail("BUSINESS_WRITE_CONFLICT");
  let source;try{source=new TextDecoder("utf-8",{fatal:true}).decode(buffer);}
  catch{fail("BUSINESS_PATCH_TEXT_INVALID");}
  const occurrences=source.split(oldText).length-1;
  if(occurrences!==expectedOccurrences)fail("BUSINESS_PATCH_CONTEXT_MISMATCH");
  const patched=source.split(oldText).join(newText);
  if(Buffer.byteLength(patched)>MAX_WRITE)fail("BUSINESS_PATCH_OVERFLOW");
  const result=await this.replaceFile({projectId,relativePath,content:patched,expectedSha256});
  return {...result,patch:{expectedOccurrences,appliedOccurrences:occurrences}};
 }
}
