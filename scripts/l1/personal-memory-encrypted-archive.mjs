// OPTIONAL offline encrypted transport for personal memory backup.
// Caller supplies an independent 32-byte archive key, never serialized or logged.
// This is not a keychain, key-rotation, backup scheduler, or MCP tool.
import {randomBytes,createCipheriv,createDecipheriv,createHash,timingSafeEqual} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,lstatSync,existsSync,rmSync,
 openSync,closeSync,fsyncSync} from "node:fs";
import {join,dirname,isAbsolute} from "node:path";
import {backupPersonalMemory,restorePersonalMemory} from "./personal-memory-backup.mjs";

const MAX_BACKUP=32*1024*1024; // deliberately bounded candidate, not 32 GiB support
const names=["memory-seal.key","memory-head.json","memory.sqlite","backup-manifest.json"];
const fail=x=>{throw Error(x);};
const ownDir=p=>{
 const st=lstatSync(p);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    st.uid!==process.getuid())fail("ARCHIVE_PARENT_UNSAFE");
};
const ownerCheck=fn=>{
 if(typeof fn!=="function"||fn()?.paired!==true)fail("ARCHIVE_OWNER_REQUIRED");
};
const archiveKeyCheck=k=>{
 if(!Buffer.isBuffer(k)||k.length!==32)fail("ARCHIVE_KEY_REQUIRED");
};
const validNew=p=>{
 if(typeof p!=="string"||!isAbsolute(p)||existsSync(p))fail("ARCHIVE_NEW_PATH_REQUIRED");
 ownDir(dirname(p));
};
const fileWrite=(p,buffer)=>{
 writeFileSync(p,buffer,{flag:"wx",mode:0o600});
 const fd=openSync(p,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
};
const syncDir=p=>{const fd=openSync(p,"r");try{fsyncSync(fd);}finally{closeSync(fd);}};
const pack=p=>{
 const entries={};let total=0;
 for(const name of names){
  const data=readFileSync(join(p,name));
  total+=data.byteLength;
  if(total>MAX_BACKUP)fail("ARCHIVE_SIZE_LIMIT");
  entries[name]=data.toString("base64");
 }
 return Buffer.from(JSON.stringify({schema:1,entries}),"utf8");
};
const unpack=(contents,destination)=>{
 let obj;
 try{obj=JSON.parse(contents.toString("utf8"));}
 catch{fail("ARCHIVE_PAYLOAD_INVALID");}
 if(obj?.schema!==1||!obj.entries||
    Object.keys(obj.entries).sort().join(",")!==[...names].sort().join(","))
  fail("ARCHIVE_PAYLOAD_INVALID");
 for(const name of names){
  const encoded=obj.entries[name];
  if(typeof encoded!=="string"||encoded.length>MAX_BACKUP*2||!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded))
   fail("ARCHIVE_PAYLOAD_INVALID");
  const data=Buffer.from(encoded,"base64");
  if(data.toString("base64")!==encoded)fail("ARCHIVE_PAYLOAD_INVALID");
  fileWrite(join(destination,name),data);
 }
 syncDir(destination);
};
export async function createEncryptedMemoryArchive({sourceDir,archivePath,archiveKey,ownerStatus}){
 ownerCheck(ownerStatus);archiveKeyCheck(archiveKey);validNew(archivePath);
 const scratch=mkdtempSync(join(dirname(archivePath),".personal-archive-working-"));
 try{
  ownDir(scratch);
  const temporary=join(scratch,"snapshot");
  await backupPersonalMemory({sourceDir,destinationDir:temporary,ownerStatus});
  const memorySeal=readFileSync(join(temporary,"memory-seal.key"));
  if(timingSafeEqual(archiveKey,memorySeal))fail("ARCHIVE_KEY_REUSE_DENIED");
  const plaintext=pack(temporary);
  const nonce=randomBytes(12),aad=Buffer.from("chatagent-personal-memory-archive-v1");
  const cipher=createCipheriv("aes-256-gcm",archiveKey,nonce);
  cipher.setAAD(aad);
  const payload=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const tag=cipher.getAuthTag();
  // No unencrypted keys or journal in the archive file.
  const data=Buffer.from(JSON.stringify({version:1,algorithm:"aes-256-gcm",
   nonce:nonce.toString("base64"),tag:tag.toString("base64"),
   ciphertext:payload.toString("base64")})+"\n");
  if(data.length>MAX_BACKUP*2)fail("ARCHIVE_SIZE_LIMIT");
  fileWrite(archivePath,data);syncDir(dirname(archivePath));
  return {path:archivePath,encrypted:true,containsPlaintextSealKey:false,
   ciphertextSha256:createHash("sha256").update(data).digest("hex")};
 }finally{
  // Temporary source snapshot contains the seal key! A crash before finally
  // needs explicit operator orphan review; same-UID actors remain outside scope.
  rmSync(scratch,{recursive:true,force:true});
 }
}
export function restoreEncryptedMemoryArchive({archivePath,destinationDir,archiveKey,ownerStatus}){
 ownerCheck(ownerStatus);archiveKeyCheck(archiveKey);validNew(destinationDir);
 const st=lstatSync(archivePath);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
   st.uid!==process.getuid()||st.size>MAX_BACKUP*2)fail("ARCHIVE_FILE_UNSAFE");
 let encoded;
 try{encoded=JSON.parse(readFileSync(archivePath,"utf8"));}
 catch{fail("ARCHIVE_PAYLOAD_INVALID");}
 if(encoded?.version!==1||encoded.algorithm!=="aes-256-gcm"||
   !["nonce","tag","ciphertext"].every(k=>typeof encoded[k]==="string"))
   fail("ARCHIVE_PAYLOAD_INVALID");
 const nonce=Buffer.from(encoded.nonce,"base64"),tag=Buffer.from(encoded.tag,"base64");
 const payload=Buffer.from(encoded.ciphertext,"base64");
 if(nonce.length!==12||tag.length!==16||payload.length>MAX_BACKUP*2)
  fail("ARCHIVE_PAYLOAD_INVALID");
 const scratch=mkdtempSync(join(dirname(destinationDir),".personal-decrypt-working-"));
 try{
  ownDir(scratch);
  const decipher=createDecipheriv("aes-256-gcm",archiveKey,nonce);
  decipher.setAAD(Buffer.from("chatagent-personal-memory-archive-v1"));
  decipher.setAuthTag(tag);
  let raw;
  try{raw=Buffer.concat([decipher.update(payload),decipher.final()]);}
  catch{fail("ARCHIVE_AUTHENTICATION_FAILED");}
  if(raw.length>MAX_BACKUP*2)fail("ARCHIVE_SIZE_LIMIT");
  unpack(raw,scratch);
  const memorySeal=readFileSync(join(scratch,"memory-seal.key"));
  if(timingSafeEqual(archiveKey,memorySeal))fail("ARCHIVE_KEY_REUSE_DENIED");
  const out=restorePersonalMemory({backupDir:scratch,destinationDir,ownerStatus});
  return {...out,encryptedSource:true};
 }finally{rmSync(scratch,{recursive:true,force:true});}
}
