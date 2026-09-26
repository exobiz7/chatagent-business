// Offline operator-only ownership and reconciliation for personal archive scratch.
// Not an MCP tool. Never accepts an arbitrary cleanup path, never auto-sweeps.
// Same-UID hostile modification remains outside the safety guarantee.
import {randomUUID,createHmac,createHash,timingSafeEqual} from "node:crypto";
import {join,dirname,isAbsolute} from "node:path";
import {lstatSync,existsSync,mkdirSync,writeFileSync,readFileSync,readdirSync,
 openSync,fsyncSync,closeSync,unlinkSync,rmdirSync} from "node:fs";
const PREFIX={archive:".personal-archive-working-",decrypt:".personal-decrypt-working-"};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const META=".personal-stage-ownership.json",ISSUE=".personal-stage-cleanup-issued.json";
const LIMIT=40*1024*1024;
const fail=c=>{throw Error(c);};
const sha=x=>createHash("sha256").update(x).digest("hex");
const mac=(key,body)=>createHmac("sha256",key).update(JSON.stringify(body)).digest("hex");
const safeEqual=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.length===b.length&&
 timingSafeEqual(Buffer.from(a),Buffer.from(b));
const checkedKey=k=>{
 if(!Buffer.isBuffer(k)||k.length!==32)fail("STAGE_KEY_REQUIRED");
};
const privateDir=path=>{
 const st=lstatSync(path);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
  st.uid!==process.getuid())fail("STAGE_DIRECTORY_UNSAFE");
 return st;
};
const privateFile=path=>{
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
  st.uid!==process.getuid())fail("STAGE_FILE_UNSAFE");
 return st;
};
const syncDir=path=>{
 const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
};
const deriveStagePath=(parentDir,kind,id)=>{
 if(!isAbsolute(parentDir??"")||!Object.hasOwn(PREFIX,kind)||!UUID.test(id??""))
  fail("STAGE_REFERENCE_INVALID");
 privateDir(parentDir);
 return join(parentDir,PREFIX[kind]+id);
};
export function createOwnedStage({parentDir,kind,targetPath,archiveKey}){
 checkedKey(archiveKey);
 if(!isAbsolute(targetPath??""))fail("STAGE_TARGET_INVALID");
 const id=randomUUID(),stage=deriveStagePath(parentDir,kind,id);
 mkdirSync(stage,{mode:0o700});const st=privateDir(stage);
 const receipt={version:1,kind,id,targetSha256:sha(targetPath),
  stageDev:String(st.dev),stageIno:String(st.ino),createdAt:Date.now()};
 const body=Buffer.from(JSON.stringify({...receipt,mac:mac(archiveKey,receipt)})+"\n");
 writeFileSync(join(stage,META),body,{mode:0o600,flag:"wx"});
 const fd=openSync(join(stage,META),"r");try{fsyncSync(fd);}finally{closeSync(fd);}
 syncDir(stage);syncDir(parentDir);
 return {id,stage,stageDev:receipt.stageDev,stageIno:receipt.stageIno};
}

const patterns={
 archive:new Set([META,"snapshot/memory-seal.key","snapshot/memory-head.json",
 "snapshot/memory.sqlite","snapshot/memory.sqlite-wal","snapshot/memory.sqlite-shm",
 "snapshot/backup-manifest.json"]),
 decrypt:new Set([META,"memory-seal.key","memory-head.json","memory.sqlite","memory.sqlite-wal",
 "memory.sqlite-shm","backup-manifest.json"])
};
export function inspectOwnedStage({parentDir,kind,id,targetPath,archiveKey}){
 checkedKey(archiveKey);
 const path=deriveStagePath(parentDir,kind,id),parent=privateDir(parentDir),st=privateDir(path);
 if(existsSync(join(path,ISSUE)))fail("STAGE_CLEANUP_UNCERTAIN");
 privateFile(join(path,META));
 let receipt;
 try{receipt=JSON.parse(readFileSync(join(path,META),"utf8"));}
 catch{fail("STAGE_RECEIPT_INVALID");}
 const {mac:signature,...body}=receipt??{};
 if(body.version!==1||body.kind!==kind||body.id!==id||
    body.targetSha256!==sha(targetPath??"")||body.stageDev!==String(st.dev)||
    body.stageIno!==String(st.ino)||!safeEqual(signature,mac(archiveKey,body)))
  fail("STAGE_NOT_OWNED");
 if(existsSync(join(path,ISSUE)))fail("STAGE_CLEANUP_UNCERTAIN");
 const actual=[],roots=readdirSync(path).sort();
 for(const name of roots){
  if(name===ISSUE)fail("STAGE_CLEANUP_UNCERTAIN");
  if(name==="snapshot"&&kind==="archive"){
   privateDir(join(path,name));
   for(const sub of readdirSync(join(path,name)).sort()){
    const rel=name+"/"+sub;
    if(!patterns[kind].has(rel))fail("STAGE_UNEXPECTED_ENTRY");
    actual.push(rel);
   }
  }else{
   if(!patterns[kind].has(name))fail("STAGE_UNEXPECTED_ENTRY");
   actual.push(name);
  }
 }
 const snapshot=kind==="archive"&&roots.includes("snapshot")?privateDir(join(path,"snapshot")):null;
 const entries=[];let total=0;
 for(const rel of actual.sort()){
  const file=join(path,rel),fs=privateFile(file);
  total+=fs.size;
  if(total>LIMIT)fail("STAGE_SIZE_LIMIT");
  entries.push({name:rel,bytes:fs.size,dev:String(fs.dev),ino:String(fs.ino),
   sha256:sha(readFileSync(file))});
 }
 return {id,kind,stageDev:String(st.dev),stageIno:String(st.ino),
  parentDev:String(parent.dev),parentIno:String(parent.ino),
  snapshotDev:snapshot?String(snapshot.dev):null,snapshotIno:snapshot?String(snapshot.ino):null,
  files:entries.map(({name,bytes,dev,ino})=>({name,bytes,dev,ino})),
  fileCount:entries.length,bytes:total,
  fingerprint:sha(JSON.stringify(entries)),state:"VERIFIED_OWNED_STAGE"};
}
export function cleanupOwnedStage({parentDir,kind,id,targetPath,archiveKey,
 expectedFingerprint,expectedDev,expectedIno,confirmation,testHooks=null}){
 if(confirmation!=="DELETE_VERIFIED_PERSONAL_STAGE")
  fail("STAGE_CONFIRMATION_REQUIRED");
 const verified=inspectOwnedStage({parentDir,kind,id,targetPath,archiveKey});
 if(verified.fingerprint!==expectedFingerprint||
    verified.stageDev!==expectedDev||verified.stageIno!==expectedIno)
  fail("STAGE_PRECONDITION_MISMATCH");
 testHooks?.beforeFinalCheck?.();
 const final=inspectOwnedStage({parentDir,kind,id,targetPath,archiveKey});
 if(final.fingerprint!==verified.fingerprint||final.stageDev!==expectedDev||
    final.stageIno!==expectedIno||final.parentDev!==verified.parentDev||
    final.parentIno!==verified.parentIno||final.snapshotDev!==verified.snapshotDev||
    final.snapshotIno!==verified.snapshotIno)fail("STAGE_CHANGED");
 const stage=deriveStagePath(parentDir,kind,id);
 const checkStage=()=>{
  const parent=privateDir(parentDir),now=privateDir(stage);
  if(String(parent.dev)!==final.parentDev||String(parent.ino)!==final.parentIno||
     String(now.dev)!==expectedDev||String(now.ino)!==expectedIno)
   fail("STAGE_CHANGED");
 };
 const checkFile=file=>{
  checkStage();
  const st=privateFile(join(stage,file.name));
  if(String(st.dev)!==file.dev||String(st.ino)!==file.ino||st.size!==file.bytes)
   fail("STAGE_CHANGED");
 };
 // Durable intent first: after any interrupted removal, operator review is required.
 const body={version:1,id,kind,fingerprint:final.fingerprint,issuedAt:Date.now()};
 const marker=Buffer.from(JSON.stringify({...body,mac:mac(archiveKey,body)})+"\n");
 checkStage();
 writeFileSync(join(stage,ISSUE),marker,{mode:0o600,flag:"wx"});
 const fd=openSync(join(stage,ISSUE),"r");try{fsyncSync(fd);}finally{closeSync(fd);}
 syncDir(stage);
 testHooks?.afterCleanupIntent?.({id,kind});
 // Delete only the verified, fixed allowlist. Do not recursively follow a new
 // subdirectory or an unexpected entry. Same-UID concurrent races remain OPEN.
 for(const file of final.files.filter(f=>f.name!==META)){
  testHooks?.beforeDeleteEntry?.(file.name);
  checkFile(file);
  unlinkSync(join(stage,file.name));
 }
 if(kind==="archive"&&final.snapshotIno!==null){
  checkStage();
  const sub=privateDir(join(stage,"snapshot"));
  if(String(sub.dev)!==final.snapshotDev||String(sub.ino)!==final.snapshotIno)
   fail("STAGE_CHANGED");
  rmdirSync(join(stage,"snapshot"));
 }
 const receipt=final.files.find(f=>f.name===META);
 if(!receipt)fail("STAGE_RECEIPT_INVALID");
 checkFile(receipt);
 unlinkSync(join(stage,META));
 syncDir(stage);
 checkStage();
 if(readdirSync(stage).sort().join(",")!==ISSUE)fail("STAGE_CLEANUP_UNCERTAIN");
 privateFile(join(stage,ISSUE));
 unlinkSync(join(stage,ISSUE));
 rmdirSync(stage);
 syncDir(parentDir);
 return {id,changed:true,state:"CLEANED"};
}
