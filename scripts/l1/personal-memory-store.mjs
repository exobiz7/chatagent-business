// Standalone ChatAgent Personal structured memory. No imports from P8/enterprise.
// Built-in Node 24 SQLite: each immutable event and its projection are one
// BEGIN IMMEDIATE transaction. A separately HMAC-sealed head detects truncation.
import {DatabaseSync} from "node:sqlite";
import {
  existsSync,mkdirSync,lstatSync,readFileSync,openSync,writeSync,fsyncSync,
  closeSync,renameSync,unlinkSync,chmodSync
} from "node:fs";
import {join,isAbsolute,dirname,resolve} from "node:path";
import {
  randomBytes,randomUUID,createHash,createHmac,timingSafeEqual
} from "node:crypto";

const SLUG=/^[a-z0-9][a-z0-9._-]{0,127}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE=/(?:\bsk-[A-Za-z0-9_-]{8,}|\bgh[pousr]_[A-Za-z0-9_]{8,}|\bBearer\s+\S+|\bpassword\s*[:=]|\bapi[_-]?key\s*[:=]|-----BEGIN\s+\w+\s+PRIVATE KEY)/i;
const MAX_EVENTS=4096,MAX_PROJECTS=32,MAX_TASKS=512;
const GENESIS="0".repeat(64);
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==="function"?process.getuid():null;
const noExtra=(value,keys)=>{
 if(!value||typeof value!=="object"||Array.isArray(value)||
    Object.keys(value).some(k=>!keys.includes(k)))
   fail("MEMORY_INVALID_INPUT");
};
const text=(v,min,max)=>{
 if(typeof v!=="string"||v.length<min||v.length>max||!v.trim()||SENSITIVE.test(v)||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))fail("MEMORY_INVALID_OR_SENSITIVE_TEXT");
 return v.trim();
};
const uuid=v=>UUID.test(v??"")?v:fail("MEMORY_INVALID_ID");
const slug=v=>SLUG.test(v??"")?v:fail("MEMORY_INVALID_PROJECT");
const revision=v=>Number.isSafeInteger(v)&&v>=0?v:fail("MEMORY_INVALID_REVISION");
const privateDir=dir=>{
 if(!isAbsolute(dir)||dir===resolve("/"))fail("MEMORY_ROOT_UNSAFE");
 // Never silently traverse an existing symbolic-link parent.
 const parent=dirname(dir);
 if(!existsSync(parent))fail("MEMORY_PARENT_NOT_INITIALIZED");
 if(lstatSync(parent).isSymbolicLink())fail("MEMORY_PARENT_UNSAFE");
 if(!existsSync(dir))mkdirSync(dir,{mode:0o700});
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (owner()!==null&&st.uid!==owner()))fail("MEMORY_ROOT_UNSAFE");
};
const privateFile=file=>{
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    (st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))
   fail("MEMORY_FILE_UNSAFE");
 return st;
};
function writeAtomic(file,body){
 const temporary=file+".tmp-"+randomUUID();
 const fd=openSync(temporary,"wx",0o600);
 try{
  const buf=Buffer.isBuffer(body)?body:Buffer.from(body);
  let offset=0;
  while(offset<buf.length){
   const n=writeSync(fd,buf,offset,buf.length-offset);
   if(n<=0)fail("MEMORY_WRITE_UNCERTAIN");
   offset+=n;
  }
  fsyncSync(fd);
 }finally{closeSync(fd);}
 renameSync(temporary,file);
 const parent=openSync(dirname(file),"r");
 try{fsyncSync(parent);}finally{closeSync(parent);}
}
const seal=(key,seq,eventHash)=>({
 seq,eventHash,mac:createHmac("sha256",key).update(seq+":"+eventHash).digest("hex")
});
const same=(a,b)=>typeof a==="string"&&typeof b==="string"&&
 a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export class PersonalMemoryStore {
 constructor(dir,{initialize=false,ownerStatus=null,testHooks=null}={}){
  if(typeof dir!=="string"||!isAbsolute(dir))fail("MEMORY_ROOT_UNSAFE");
  if(/(?:^|\/)(?:chatagent|chatagent-memory|stable-001)(?:\/|$)/i.test(dir))
   fail("MEMORY_CROSS_PRODUCT_ROOT_DENIED");
  if(typeof ownerStatus!=="function")fail("MEMORY_OWNER_STATUS_REQUIRED");
  this.ownerStatus=ownerStatus;this.testHooks=testHooks;
  privateDir(dir);this.dir=dir;
  this.keyPath=join(dir,"memory-seal.key");
  this.headPath=join(dir,"memory-head.json");
  this.dbPath=join(dir,"memory.sqlite");
  if(initialize){
   if([this.keyPath,this.headPath,this.dbPath].some(existsSync))
    fail("MEMORY_ALREADY_INITIALIZED");
   writeAtomic(this.keyPath,randomBytes(32));
   writeAtomic(this.headPath,JSON.stringify(seal(readFileSync(this.keyPath),0,GENESIS))+"\n");
   const fd=openSync(this.dbPath,"wx",0o600);closeSync(fd);
  }
  if(![this.keyPath,this.headPath,this.dbPath].every(existsSync))
   fail("MEMORY_RECOVERY_REQUIRED");
  for(const file of [this.keyPath,this.headPath,this.dbPath])privateFile(file);
  this.key=readFileSync(this.keyPath);
  if(this.key.length!==32)fail("MEMORY_RECOVERY_REQUIRED");
  this.db=new DatabaseSync(this.dbPath,{timeout:2000});
  this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF;");
  this.db.exec("CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, event_hash TEXT NOT NULL)");
  if(this.db.prepare("PRAGMA integrity_check").get()?.integrity_check!=="ok")
   fail("MEMORY_RECOVERY_REQUIRED");
  // Fail closed when an existing store was upgraded/rewritten externally.
  const initialized=this.db.prepare("PRAGMA user_version").get()?.user_version;
  if(initialized!==0&&initialized!==1)fail("MEMORY_UNSUPPORTED_SCHEMA");
  this.db.exec("PRAGMA user_version = 1;");
  this.transaction(()=>this.replay());
 }
 close(){this.db.close();}
 authorize(){
  const state=this.ownerStatus();
  if(!state?.paired)fail("MEMORY_OWNER_REQUIRED");
  // Memory has NO dependency on FULL_HOST. It never grants host access.
 }
 head(){
  privateFile(this.headPath);
  let h;
  try{h=JSON.parse(readFileSync(this.headPath,"utf8"));}
  catch{fail("MEMORY_RECOVERY_REQUIRED");}
  if(!Number.isSafeInteger(h?.seq)||h.seq<0||
     !/^[a-f0-9]{64}$/.test(h.eventHash??"")||
     !same(h.mac,seal(this.key,h.seq,h.eventHash).mac))
   fail("MEMORY_RECOVERY_REQUIRED");
  return h;
 }
 transaction(callback){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const output=callback();
   this.db.exec("COMMIT");
   return output;
  }catch(e){
   try{this.db.exec("ROLLBACK");}catch{}
   throw e;
  }
 }
 replay(){
  const head=this.head(),rows=this.db.prepare("SELECT seq,payload,prev_hash,event_hash FROM events ORDER BY seq").all();
  if(rows.length>MAX_EVENTS)fail("MEMORY_CAPACITY_REACHED");
  const projects=new Map(),tasks=new Map(),ops=new Map(),checkpoints=[];
  let previous=GENESIS,seq=0,anchorMatched=head.seq===0&&head.eventHash===GENESIS;
  for(const row of rows){
   if(row.seq!==++seq||row.prev_hash!==previous)fail("MEMORY_RECOVERY_REQUIRED");
   const expected=createHmac("sha256",this.key)
    .update(row.seq+":"+row.prev_hash+":"+row.payload).digest("hex");
   if(!same(row.event_hash,expected))fail("MEMORY_RECOVERY_REQUIRED");
   previous=expected;
   if(row.seq===head.seq)anchorMatched=row.event_hash===head.eventHash;
   let event;
   try{event=JSON.parse(row.payload);}catch{fail("MEMORY_RECOVERY_REQUIRED");}
   if(!event||!["PROJECT","TASK","CHECKPOINT","COMPLETE"].includes(event.kind)||
      !UUID.test(event.operationId??"")||ops.has(event.operationId))
    fail("MEMORY_RECOVERY_REQUIRED");
   if(event.kind==="PROJECT"){
    if(projects.has(event.projectId)||projects.size>=MAX_PROJECTS||!SLUG.test(event.projectId??""))
     fail("MEMORY_RECOVERY_REQUIRED");
    projects.set(event.projectId,{projectId:event.projectId,projectUuid:event.projectUuid,
      rootLabel:event.rootLabel,createdAt:event.at});
   }else if(event.kind==="TASK"){
    if(tasks.has(event.taskId)||tasks.size>=MAX_TASKS||!projects.has(event.projectId))
     fail("MEMORY_RECOVERY_REQUIRED");
    tasks.set(event.taskId,{projectId:event.projectId,taskId:event.taskId,
      title:event.title,status:"ACTIVE",revision:0,startedAt:event.at,completedAt:null,
      checkpoints:[]});
   }else{
    const task=tasks.get(event.taskId);
    if(!task||task.projectId!==event.projectId||task.status!=="ACTIVE"||
       task.revision!==event.expectedTaskRevision||
       event.resultingRevision!==task.revision+1)fail("MEMORY_RECOVERY_REQUIRED");
    task.revision=event.resultingRevision;
    if(event.kind==="CHECKPOINT"){
     const cp={checkpointId:event.checkpointId,projectId:event.projectId,taskId:event.taskId,
      revision:task.revision,summary:event.summary,currentState:event.currentState,
      nextActions:event.nextActions,verification:event.verification,
      decisions:event.decisions??[],facts:event.facts??[],
      artifactRefs:event.artifactRefs,gitSha:event.gitSha,createdAt:event.at};
     task.checkpoints.push(cp);checkpoints.push(cp);
    }else{
     task.status="COMPLETED";task.completedAt=event.at;
    }
   }
   ops.set(event.operationId,{inputHash:event.inputHash,kind:event.kind,receipt:event.receipt});
  }
  if(head.seq>seq||!anchorMatched||
     head.seq===seq&&head.eventHash!==previous)fail("MEMORY_RECOVERY_REQUIRED");
  // DB commit may have succeeded before signed head fsync: verify the full
  // valid append-only suffix before advancing. Never truncate/replay effects.
  if(head.seq<seq){
   writeAtomic(this.headPath,JSON.stringify(seal(this.key,seq,previous))+"\n");
  }
  return {projects,tasks,checkpoints,ops,seq,lastHash:previous};
 }
 append(event,view){
  if(view.seq>=MAX_EVENTS)fail("MEMORY_CAPACITY_REACHED");
  const payload=JSON.stringify(event),next=view.seq+1;
  const eventHash=createHmac("sha256",this.key)
   .update(next+":"+view.lastHash+":"+payload).digest("hex");
  this.db.prepare("INSERT INTO events(seq,payload,prev_hash,event_hash) VALUES (?,?,?,?)")
   .run(next,payload,view.lastHash,eventHash);
  return {seq:next,eventHash};
 }
 write(kind,operationId,input,builder){
  this.authorize();
  uuid(operationId);
  this.db.exec("BEGIN IMMEDIATE");
  let committed=false;
  try{
   const view=this.replay(),inputHash=hash({kind,input}),prior=view.ops.get(operationId);
   if(prior){
    if(prior.kind!==kind||prior.inputHash!==inputHash)
     fail("MEMORY_IDEMPOTENCY_CONFLICT");
    this.db.exec("COMMIT");committed=true;
    return {...prior.receipt,duplicate:true};
   }
   const event=builder(view);
   event.kind=kind;event.operationId=operationId;event.inputHash=inputHash;
   event.at=Date.now();
   event.receipt={...event.receipt,duplicate:false};
   const result=this.append(event,view);
   // Commit before updating the signed head, so an interrupted promotion can
   // be safely reconciled from the verified SQLite append-only event chain.
   this.db.exec("COMMIT");committed=true;
   try{
    this.testHooks?.beforeHeadPromotion?.();
    writeAtomic(this.headPath,JSON.stringify(seal(this.key,result.seq,result.eventHash))+"\n");
   }catch{fail("MEMORY_RECOVERY_REQUIRED");}
   return event.receipt;
  }catch(e){
   if(!committed)try{this.db.exec("ROLLBACK");}catch{}
   throw e;
  }
 }
 projectRegister(input){
  noExtra(input,["projectId","rootLabel","operationId"]);
  const projectId=slug(input.projectId),rootLabel=text(input.rootLabel,1,128);
  return this.write("PROJECT",input.operationId,{projectId,rootLabel},view=>{
   if(view.projects.has(projectId))fail("MEMORY_PROJECT_EXISTS");
   if(view.projects.size>=MAX_PROJECTS)fail("MEMORY_CAPACITY_REACHED");
   const projectUuid=randomUUID();
   return {projectId,rootLabel,projectUuid,
    receipt:{projectId,projectUuid}};
  });
 }
 taskStart(input){
  noExtra(input,["projectId","title","operationId"]);
  const projectId=slug(input.projectId),title=text(input.title,1,160);
  return this.write("TASK",input.operationId,{projectId,title},view=>{
   if(!view.projects.has(projectId))fail("MEMORY_PROJECT_DENIED");
   if(view.tasks.size>=MAX_TASKS)fail("MEMORY_CAPACITY_REACHED");
   const taskId=randomUUID();
   return {projectId,taskId,title,receipt:{projectId,taskId,revision:0,status:"ACTIVE"}};
  });
 }
 checkpointAppend(input){
  noExtra(input,["projectId","taskId","expectedTaskRevision","operationId",
   "summary","currentState","nextActions","verification","decisions","facts",
   "artifactRefs","gitSha"]);
  const projectId=slug(input.projectId),taskId=uuid(input.taskId);
  const expectedTaskRevision=revision(input.expectedTaskRevision);
  const summary=text(input.summary,1,512);
  const currentState=text(input.currentState,1,512);
  const verification=text(input.verification,1,512);
  if(!Array.isArray(input.nextActions)||input.nextActions.length>5||
    input.nextActions.some(x=>typeof x!=="string"))fail("MEMORY_INVALID_INPUT");
  const nextActions=input.nextActions.map(x=>text(x,1,256));
  if(!Array.isArray(input.decisions??[])||input.decisions?.length>8||
     !Array.isArray(input.facts??[])||input.facts?.length>8)
   fail("MEMORY_INVALID_INPUT");
  const decisions=(input.decisions??[]).map(x=>text(x,1,256));
  const facts=(input.facts??[]).map(x=>text(x,1,256));
  if(!Array.isArray(input.artifactRefs??[])||input.artifactRefs?.length>5)
   fail("MEMORY_INVALID_INPUT");
  const artifactRefs=(input.artifactRefs??[]).map(x=>text(x,1,128));
  const gitSha=input.gitSha??null;
  if(gitSha!==null&&!/^[a-f0-9]{40}$/.test(gitSha))fail("MEMORY_INVALID_INPUT");
  const sanitized={projectId,taskId,expectedTaskRevision,summary,currentState,
   nextActions,verification,decisions,facts,artifactRefs,gitSha};
  return this.write("CHECKPOINT",input.operationId,sanitized,view=>{
   const task=view.tasks.get(taskId);
   if(!task||task.projectId!==projectId)fail("MEMORY_PROJECT_DENIED");
   if(task.status!=="ACTIVE")fail("MEMORY_TASK_COMPLETED");
   if(task.revision!==expectedTaskRevision)fail("MEMORY_REVISION_CONFLICT");
   const checkpointId=randomUUID(),resultingRevision=expectedTaskRevision+1;
   return {...sanitized,resultingRevision,checkpointId,
    receipt:{projectId,taskId,checkpointId,revision:resultingRevision}};
  });
 }
 taskComplete(input){
  noExtra(input,["projectId","taskId","expectedTaskRevision","operationId"]);
  const projectId=slug(input.projectId),taskId=uuid(input.taskId);
  const expectedTaskRevision=revision(input.expectedTaskRevision);
  return this.write("COMPLETE",input.operationId,{projectId,taskId,expectedTaskRevision},view=>{
   const task=view.tasks.get(taskId);
   if(!task||task.projectId!==projectId)fail("MEMORY_PROJECT_DENIED");
   if(task.status!=="ACTIVE")fail("MEMORY_TASK_COMPLETED");
   if(task.revision!==expectedTaskRevision)fail("MEMORY_REVISION_CONFLICT");
   return {projectId,taskId,expectedTaskRevision,resultingRevision:expectedTaskRevision+1,
    receipt:{projectId,taskId,status:"COMPLETED",revision:expectedTaskRevision+1}};
  });
 }
 read(fn){
  this.authorize();
  return this.transaction(()=>fn(this.replay()));
 }
 taskGet(input={}){
  noExtra(input,["projectId","taskId"]);
  const {projectId,taskId}=input;
  slug(projectId);uuid(taskId);
  return this.read(view=>{
   const task=view.tasks.get(taskId);
   if(!task||task.projectId!==projectId)fail("MEMORY_PROJECT_DENIED");
   return {task:{...task,checkpoints:task.checkpoints.slice(-5)}};
  });
 }
 projectContext(input={}){
  noExtra(input,["projectId","limit"]);
  const {projectId,limit=10}=input;
  slug(projectId);
  if(!Number.isInteger(limit)||limit<1||limit>20)fail("MEMORY_INVALID_INPUT");
  return this.read(view=>{
   const project=view.projects.get(projectId);
   if(!project)fail("MEMORY_PROJECT_DENIED");
   const tasks=[...view.tasks.values()].filter(t=>t.projectId===projectId);
   return {project,tasks:tasks.slice(-limit).map(t=>({
    projectId,taskId:t.taskId,title:t.title,status:t.status,revision:t.revision
   })),contextSeq:view.seq};
  });
 }
 search(input={}){
  noExtra(input,["projectId","query","limit"]);
  const {projectId,query,limit=10}=input;
  slug(projectId);
  const term=text(query,1,128).toLowerCase();
  if(!Number.isInteger(limit)||limit<1||limit>20)fail("MEMORY_INVALID_INPUT");
  return this.read(view=>{
   if(!view.projects.has(projectId))fail("MEMORY_PROJECT_DENIED");
   return {matches:view.checkpoints.filter(c=>c.projectId===projectId&&
     [c.summary,c.currentState,c.verification,...c.nextActions].some(t=>t.toLowerCase().includes(term)))
     .slice(-limit).map(c=>({projectId,taskId:c.taskId,checkpointId:c.checkpointId,
       revision:c.revision,summary:c.summary,createdAt:c.createdAt})),
    contextSeq:view.seq};
  });
 }
}
