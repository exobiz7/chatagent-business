import {promises as fs,constants as C} from "node:fs";
import {join,isAbsolute} from "node:path";
import {createHash,randomUUID} from "node:crypto";

const MAX_BYTES=16384,MAX_RECORDS=32;
const sha=buf=>createHash("sha256").update(buf).digest("hex");
const validId=value=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validateFile=s=>s.isFile()&&s.nlink===1&&(s.mode&0o077)===0&&
 (typeof process.getuid!=="function"||s.uid===process.getuid());
async function privateDir(path){
 const s=await fs.lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
    (typeof process.getuid==="function"&&s.uid!==process.getuid()))
  throw Error("SCRATCH_DIRECTORY_UNSAFE");
}
async function readVerified(path,record){
 const file=await fs.open(path,C.O_RDONLY|C.O_NOFOLLOW);
 try{
  const st=await file.stat();
  if(!validateFile(st)||st.size!==record.bytes)throw Error("SCRATCH_IDENTITY_MISMATCH");
  if(record.dev!==undefined&&(st.dev!==record.dev||st.ino!==record.ino))
   throw Error("SCRATCH_IDENTITY_MISMATCH");
  const buf=Buffer.alloc(record.bytes),{bytesRead}=await file.read(buf,0,buf.length,0);
  if(bytesRead!==buf.length||sha(buf)!==record.sha256)
   throw Error("SCRATCH_CONTENT_MISMATCH");
  return {stat:st,content:buf};
 }finally{await file.close();}
}
export class OwnedScratch {
 constructor(broker){
  this.broker=broker;
  this.dir=join(broker.dir,"scratch");
  this.busy=new Set(); // reject overlapping cleanup requests within this Broker
 }
 async init(){
  try{await fs.mkdir(this.dir,{mode:0o700});}
  catch(e){if(e.code!=="EEXIST")throw e;}
  await privateDir(this.dir);
  return this;
 }
 authorize(){
  const d=this.broker.accessDecision("write",this.dir);
  if(!d.allowed)throw Error(d.reason);
 }
 record(handle){
  if(!validId(handle))throw Error("SCRATCH_NOT_OWNED");
  const r=(this.broker.state.scratch??[]).find(x=>x.handle===handle);
  if(!r)throw Error("SCRATCH_NOT_OWNED");
  return r;
 }
 path(handle){return join(this.dir,handle+".txt");}
 async create({content,idempotencyKey}){
  this.authorize();
  if(typeof content!=="string"||Buffer.byteLength(content)>MAX_BYTES||!validId(idempotencyKey))
   throw Error("INVALID_SCRATCH_CREATE");
  await privateDir(this.dir);
  const bytes=Buffer.from(content,"utf8"),digest=sha(bytes);
  const records=this.broker.state.scratch??=[];
  let r=records.find(x=>x.key===idempotencyKey);
  if(r){
   if(r.sha256!==digest||r.bytes!==bytes.length)throw Error("IDEMPOTENCY_KEY_CONFLICT");
   if(r.stage==="ISSUED")throw Error("ACTION_RECONCILIATION_REQUIRED");
   return {handle:r.handle,bytes:r.bytes,sha256:r.sha256,state:r.stage,changed:false};
  }
  if(records.length>=MAX_RECORDS)throw Error("SCRATCH_RECORD_LIMIT");
  r={handle:randomUUID(),key:idempotencyKey,sha256:digest,bytes:bytes.length,
     stage:"ISSUED",createdAt:Date.now()};
  records.push(r);
  this.broker.record("SCRATCH_CREATE_ISSUED",{handle:r.handle});this.broker.save();
  const p=this.path(r.handle);
  const file=await fs.open(p,C.O_CREAT|C.O_EXCL|C.O_WRONLY|C.O_NOFOLLOW,0o600);
  try{await file.writeFile(bytes);await file.sync();}
  finally{await file.close();}
  const observed=await readVerified(p,r);
  r.dev=observed.stat.dev;r.ino=observed.stat.ino;r.stage="CREATED";
  this.broker.record("SCRATCH_CREATED",{handle:r.handle});this.broker.save();
  return {handle:r.handle,bytes:r.bytes,sha256:r.sha256,state:r.stage,changed:true};
 }
 async cleanup({handle,expectedSha256}){
  if(this.busy.has(handle))throw Error("SCRATCH_BUSY");
  this.busy.add(handle);
  try{
  this.authorize();
  const r=this.record(handle);
  if(typeof expectedSha256!=="string"||expectedSha256!==r.sha256)
    throw Error("SCRATCH_PRECONDITION_MISMATCH");
  if(r.stage==="CLEANED")return {handle,state:"CLEANED",changed:false};
  if(r.stage==="CLEANUP_ISSUED")throw Error("ACTION_RECONCILIATION_REQUIRED");
  if(r.stage!=="CREATED")throw Error("ACTION_RECONCILIATION_REQUIRED");
  await privateDir(this.dir);
  const p=this.path(handle);
  const original=await readVerified(p,r);
  const now=await fs.lstat(p);
  if(!validateFile(now)||now.dev!==original.stat.dev||now.ino!==original.stat.ino)
   throw Error("SCRATCH_IDENTITY_MISMATCH");
  // Reserve cleanup before effect: failure remains fail-closed and is not replayed.
  r.stage="CLEANUP_ISSUED";
  this.broker.record("SCRATCH_CLEANUP_ISSUED",{handle});this.broker.save();
  await fs.unlink(p);
  try{await fs.lstat(p);throw Error("SCRATCH_CLEANUP_UNCERTAIN");}
  catch(e){if(e.code!=="ENOENT")throw e;}
  r.stage="CLEANED";r.cleanedAt=Date.now();
  this.broker.record("SCRATCH_CLEANED",{handle});this.broker.save();
  return {handle,state:"CLEANED",changed:true};
  }finally{this.busy.delete(handle);}
 }
}
