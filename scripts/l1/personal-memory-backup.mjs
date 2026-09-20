// Offline-only, standalone personal memory backup and new-root restore.
// Never touches P8 or an existing destination. Backup CONTAINS the seal key:
// the operator must keep the directory inside encrypted, owner-controlled storage.
import {DatabaseSync,backup as sqliteBackup} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {
 existsSync,mkdirSync,lstatSync,readFileSync,writeFileSync,realpathSync,
 copyFileSync,chmodSync,rmSync,renameSync,openSync,fsyncSync,closeSync,unlinkSync
} from "node:fs";
import {join,dirname,resolve,isAbsolute,sep} from "node:path";
import {randomUUID,createHash,createHmac,timingSafeEqual} from "node:crypto";

const sha=b=>createHash("sha256").update(b).digest("hex");
const error=code=>{throw Error(code);};
const ownedDir=p=>{
 const st=lstatSync(p);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    st.uid!==process.getuid())error("BACKUP_DIRECTORY_UNSAFE");
};
const ownedFile=p=>{
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
   (st.mode&0o077)!==0||st.uid!==process.getuid())error("BACKUP_FILE_UNSAFE");
};
const legacyRoot=p=>/(?:^|\/)(?:chatagent|chatagent-memory|stable-001)(?:\/|$)/i.test(p);
const newRoot=p=>{
 if(typeof p!=="string"||!isAbsolute(p)||p===resolve("/")||legacyRoot(p))
  error("BACKUP_PATH_UNSAFE");
 const parent=dirname(p);ownedDir(parent);
 // existing symlinks are also existing entries, including dangling links.
 try{lstatSync(p);error("BACKUP_DESTINATION_EXISTS");}
 catch(e){if(e.code!=="ENOENT")throw e;}
 return p;
};
const syncDirectory=p=>{const fd=openSync(p,"r");try{fsyncSync(fd);}finally{closeSync(fd);}};
const discardOwnedSqliteSidecars=dir=>{
 // Read-only SQLite verification can create transient WAL/SHM in this uniquely
 // created staging directory. No sidecar is part of the verified snapshot.
 for(const name of ["memory.sqlite-wal","memory.sqlite-shm"]){
  const p=join(dir,name);
  try{const st=lstatSync(p);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
      st.uid!==process.getuid()||(st.mode&0o077)!==0)
    error("BACKUP_SIDECAR_UNSAFE");
   unlinkSync(p);
  }catch(e){if(e.code!=="ENOENT")throw e;}
 }
 syncDirectory(dir);
};
const writeExclusive=(path,body)=>{
 writeFileSync(path,body,{flag:"wx",mode:0o600});
 const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
};
const equal=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.length===b.length&&
 timingSafeEqual(Buffer.from(a),Buffer.from(b));
const files=["memory-seal.key","memory-head.json","memory.sqlite"];
const validateRoot=(p)=>{
 ownedDir(p);for(const file of files)ownedFile(join(p,file));
 const key=readFileSync(join(p,files[0]));
 if(key.length!==32)error("BACKUP_INVALID_SEAL_KEY");
 const head=readFileSync(join(p,files[1]));
 if(head.length>4096)error("BACKUP_INVALID_HEAD");
 return {key,head};
};
const verifyOfflineRoot=(p,ownerStatus)=>{
 if(ownerStatus()?.paired!==true)error("BACKUP_OWNER_REQUIRED");
 const {key,head}=validateRoot(p);
 let signed;
 try{signed=JSON.parse(head.toString("utf8"));}
 catch{error("BACKUP_INVALID_HEAD");}
 if(!Number.isSafeInteger(signed?.seq)||signed.seq<0||
    !/^[a-f0-9]{64}$/.test(signed.eventHash??""))error("BACKUP_INVALID_HEAD");
 const mac=createHmac("sha256",key).update(signed.seq+":"+signed.eventHash).digest("hex");
 if(!equal(signed.mac,mac))error("BACKUP_HEAD_TAMPERED");
 const db=new DatabaseSync(join(p,"memory.sqlite"),{readOnly:true});
 try{
  if(db.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok"||
     db.prepare("PRAGMA user_version").get()?.user_version!==1)
   error("BACKUP_INVALID_SQLITE");
  const rows=db.prepare("SELECT seq,payload,prev_hash,event_hash FROM events ORDER BY seq").all();
  if(rows.length>4096)error("BACKUP_INVALID_SQLITE");
  let previous="0".repeat(64),sequence=0;
  for(const row of rows){
   if(row.seq!==++sequence||row.prev_hash!==previous)error("BACKUP_EVENT_CHAIN_INVALID");
   const expected=createHmac("sha256",key)
    .update(row.seq+":"+row.prev_hash+":"+row.payload).digest("hex");
   if(!equal(row.event_hash,expected))error("BACKUP_EVENT_CHAIN_INVALID");
   try{if(!JSON.parse(row.payload)?.kind)error("BACKUP_EVENT_CHAIN_INVALID");}
   catch{error("BACKUP_EVENT_CHAIN_INVALID");}
   previous=expected;
  }
  // An offline snapshot requires the signed head to match the entire journal;
  // recovery of an uncertain live transaction belongs to the owning product.
  if(signed.seq!==sequence||signed.eventHash!==previous)error("BACKUP_HEAD_JOURNAL_MISMATCH");
  return {seq:sequence,lastHash:previous};
 }finally{db.close();}
};
function checkBundle(p,ownerStatus){
 const {key}=validateRoot(p);
 const metadata=join(p,"backup-manifest.json");ownedFile(metadata);
 let manifest;
 try{manifest=JSON.parse(readFileSync(metadata,"utf8"));}
 catch{error("BACKUP_MANIFEST_INVALID");}
 if(manifest?.version!==1||manifest?.schemaVersion!==1||
    !Number.isSafeInteger(manifest.seq)||manifest.seq<0||
    !/^[a-f0-9]{64}$/.test(manifest.eventHash??"")||
    !manifest.files||Object.keys(manifest.files).sort().join(",")!==[...files].sort().join(","))
  error("BACKUP_MANIFEST_INVALID");
 const {mac,...payload}=manifest;
 const expected=createHmac("sha256",key).update(JSON.stringify(payload)).digest("hex");
 if(!equal(mac,expected))error("BACKUP_MANIFEST_TAMPERED");
 for(const name of files){
  if(sha(readFileSync(join(p,name)))!==manifest.files[name])
   error("BACKUP_FILE_HASH_MISMATCH");
 }
 const v=verifyOfflineRoot(p,ownerStatus);
 if(v.seq!==manifest.seq||v.lastHash!==manifest.eventHash)
   error("BACKUP_SNAPSHOT_MISMATCH");
 return manifest;
}
export async function backupPersonalMemory({sourceDir,destinationDir,ownerStatus,testHooks=null}){
 if(typeof ownerStatus!=="function"||ownerStatus()?.paired!==true)
  error("BACKUP_OWNER_REQUIRED");
 if(!isAbsolute(sourceDir??"")||legacyRoot(sourceDir))error("BACKUP_PATH_UNSAFE");
 newRoot(destinationDir);
 const {key,head}=validateRoot(sourceDir);
 const source=verifyOfflineRoot(sourceDir,ownerStatus);
 let folderCreated=false,db;
 try{
  mkdirSync(destinationDir,{mode:0o700});folderCreated=true;
  ownedDir(destinationDir);
  testHooks?.beforeSnapshot?.();
  db=new DatabaseSync(join(sourceDir,"memory.sqlite"),{readOnly:true});
  await sqliteBackup(db,join(destinationDir,"memory.sqlite"));
  db.close();db=null;
  chmodSync(join(destinationDir,"memory.sqlite"),0o600);
  writeExclusive(join(destinationDir,"memory-seal.key"),key);
  writeExclusive(join(destinationDir,"memory-head.json"),head);
  const after=verifyOfflineRoot(sourceDir,ownerStatus);
  if(after.seq!==source.seq||after.lastHash!==source.lastHash||
     !readFileSync(join(sourceDir,"memory-head.json")).equals(head)||
     !readFileSync(join(sourceDir,"memory-seal.key")).equals(key))
   error("BACKUP_SOURCE_CHANGED");
  // Fail closed when the SQLite snapshot is not the same high-watermark.
  const snapshot=verifyOfflineRoot(destinationDir,ownerStatus);
  if(snapshot.seq!==source.seq||snapshot.lastHash!==source.lastHash)
   error("BACKUP_SNAPSHOT_MISMATCH");
  const payload={version:1,schemaVersion:1,seq:source.seq,eventHash:source.lastHash,
   files:Object.fromEntries(files.map(name=>[name,sha(readFileSync(join(destinationDir,name)))]))};
  const mac=createHmac("sha256",key).update(JSON.stringify(payload)).digest("hex");
  writeExclusive(join(destinationDir,"backup-manifest.json"),
   JSON.stringify({...payload,mac})+"\n");
  syncDirectory(destinationDir);
  const verified=checkBundle(destinationDir,ownerStatus);
  syncDirectory(dirname(destinationDir));
  return {seq:verified.seq,eventHash:verified.eventHash,
   destination:destinationDir,containsSealKey:true,verified:true};
 }catch(e){
  if(folderCreated)rmSync(destinationDir,{recursive:true,force:true});
  throw e;
 }finally{db?.close();}
}
const validatePublishHelper=(helperPath,helperSha256)=>{
 if(typeof helperPath!=="string"||!isAbsolute(helperPath)||
    !/^[a-f0-9]{64}$/.test(helperSha256??""))
  error("BACKUP_NATIVE_PUBLISH_REQUIRED");
 ownedDir(dirname(helperPath));ownedFile(helperPath);
 const real=realpathSync(helperPath);
 if(real!==helperPath)error("BACKUP_HELPER_UNSAFE");
 const actual=sha(readFileSync(helperPath));
 if(actual!==helperSha256)error("BACKUP_HELPER_HASH_MISMATCH");
};
export function restorePersonalMemory({backupDir,destinationDir,ownerStatus,
 publishHelperPath,publishHelperSha256,testHooks=null}){
 if(typeof ownerStatus!=="function"||ownerStatus()?.paired!==true)
  error("BACKUP_OWNER_REQUIRED");
 newRoot(destinationDir);
 validatePublishHelper(publishHelperPath,publishHelperSha256);
 if(!isAbsolute(backupDir??"")||legacyRoot(backupDir))error("BACKUP_PATH_UNSAFE");
 const manifest=checkBundle(backupDir,ownerStatus);
 const staging=join(dirname(destinationDir),".personal-restore-"+randomUUID());
 let created=false,uncertain=false;
 try{
  mkdirSync(staging,{mode:0o700});created=true;
  for(const name of files){
   copyFileSync(join(backupDir,name),join(staging,name));
   chmodSync(join(staging,name),0o600);
   ownedFile(join(staging,name));
  }
  const verified=verifyOfflineRoot(staging,ownerStatus);
  if(verified.seq!==manifest.seq||verified.lastHash!==manifest.eventHash)
   error("BACKUP_RESTORE_MISMATCH");
  discardOwnedSqliteSidecars(staging);
  syncDirectory(staging);
  // Test hook can create an existing destination *after* all prechecks.
  testHooks?.beforePublish?.({destinationDir,staging});
  const stageStat=lstatSync(staging);
  const result=spawnSync(publishHelperPath,[staging,destinationDir,
    String(stageStat.dev),String(stageStat.ino)],{
      timeout:10000,encoding:"utf8",maxBuffer:2048,
      env:{PATH:"/usr/bin:/bin",LANG:"C"},stdio:["ignore","pipe","pipe"]
    });
  if(result.error||result.signal){uncertain=true;error("BACKUP_PUBLISH_UNCERTAIN");}
  if(result.status!==0){
   const reason=(result.stderr??"").trim();
   if(reason==="PUBLISH_DESTINATION_EXISTS")error("BACKUP_DESTINATION_EXISTS");
   uncertain=true;error("BACKUP_PUBLISH_UNCERTAIN");
  }
  if(result.stdout.trim()!=="PUBLISH_DONE"){
   uncertain=true;error("BACKUP_PUBLISH_UNCERTAIN");
  }
  created=false;
  return {seq:verified.seq,eventHash:verified.lastHash,
   destination:destinationDir,verified:true,containsSealKey:true};
 }finally{
  // Uncertain native effect must be reconciled, never blindly deleted.
  if(created&&!uncertain)rmSync(staging,{recursive:true,force:true});
 }
}
