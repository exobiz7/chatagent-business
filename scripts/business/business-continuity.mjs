import {existsSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {PersonalMemoryStore} from "../l1/personal-memory-store.mjs";
import {authorizeProjectTool} from "./business-core.mjs";

const DIGEST=/^sha256:[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE=/(?:\bsk-[A-Za-z0-9_-]{8,}|\bgh[pousr]_[A-Za-z0-9_]{8,}|\bBearer\s+\S+|\bpassword\s*[:=]|\bapi[_-]?key\s*[:=]|-----BEGIN\s+\w+\s+PRIVATE KEY)/i;
const TARGET_BYTES=8192,HARD_BYTES=24576;
const fail=code=>{throw Error(code);};
const jsonBytes=v=>Buffer.byteLength(JSON.stringify(v));
const hashHex=v=>createHash("sha256").update(v).digest("hex");

function stable(value){
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
}
const digestBasis=basis=>"sha256:"+hashHex(stable(basis));
function deterministicUuid(value){
 const h=hashHex(value).slice(0,32);
 return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
function cleanText(v,min,max){
 if(typeof v!=="string"||v.length<min||v.length>max||!v.trim()||SENSITIVE.test(v)||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))fail("BUSINESS_CONTINUITY_INVALID_OR_SENSITIVE_TEXT");
 return v.trim();
}
function cleanId(v){if(!UUID.test(v??""))fail("BUSINESS_CONTINUITY_ID_INVALID");return v;}

function mapMemoryError(e){
 const code=String(e?.message||"");
 const map={
  MEMORY_IDEMPOTENCY_CONFLICT:"BUSINESS_CONTINUITY_IDEMPOTENCY_CONFLICT",
  MEMORY_REVISION_CONFLICT:"BUSINESS_CONTINUITY_REVISION_CONFLICT",
  MEMORY_TASK_COMPLETED:"BUSINESS_CONTINUITY_TASK_COMPLETED",
  MEMORY_PROJECT_DENIED:"BUSINESS_CONTINUITY_TASK_NOT_FOUND",
  MEMORY_INVALID_OR_SENSITIVE_TEXT:"BUSINESS_CONTINUITY_INVALID_OR_SENSITIVE_TEXT",
  MEMORY_INVALID_INPUT:"BUSINESS_CONTINUITY_INVALID_INPUT",
  MEMORY_INVALID_ID:"BUSINESS_CONTINUITY_ID_INVALID",
  MEMORY_CAPACITY_REACHED:"BUSINESS_CONTINUITY_CAPACITY_REACHED",
  MEMORY_RECOVERY_REQUIRED:"BUSINESS_CONTINUITY_UNAVAILABLE",
  MEMORY_FILE_UNSAFE:"BUSINESS_CONTINUITY_UNAVAILABLE",
  MEMORY_ROOT_UNSAFE:"BUSINESS_CONTINUITY_UNAVAILABLE"
 };
 return Error(map[code]??code??"BUSINESS_CONTINUITY_FAILED");
}
function taskSnapshot(memory,projectId,taskId){
 return memory.read(view=>{
  const task=view.tasks.get(taskId);
  if(!task||task.projectId!==projectId)fail("BUSINESS_CONTINUITY_TASK_NOT_FOUND");
  const cp=task.checkpoints.at(-1)??null;
  return {
   seq:view.seq,
   task:{
    projectId:task.projectId,taskId:task.taskId,objective:task.title,status:task.status,
    revision:task.revision,startedAt:task.startedAt,completedAt:task.completedAt
   },
   checkpoint:cp?{
    checkpointId:cp.checkpointId,revision:cp.revision,summary:cp.summary,
    currentState:cp.currentState,nextActions:[...cp.nextActions],verification:cp.verification,
    decisions:[...(cp.decisions??[])],facts:[...(cp.facts??[])],
    artifacts:[...(cp.artifactRefs??[])],createdAt:cp.createdAt
   }:null
  };
 });
}

function packageBasis(organizationId,snapshot){
 const cp=snapshot.checkpoint;
 return {
  schemaVersion:1,
  organizationId,
  projectId:snapshot.task.projectId,
  taskId:snapshot.task.taskId,
  objective:snapshot.task.objective,
  taskStatus:snapshot.task.status,
  revision:snapshot.task.revision,
  lastCheckpoint:cp?{
   checkpointId:cp.checkpointId,revision:cp.revision,summary:cp.summary,
   currentState:cp.currentState,verification:cp.verification,createdAt:cp.createdAt
  }:null,
  nextActions:cp?[...cp.nextActions]:[],
  decisions:cp?[...cp.decisions]:[],
  facts:cp?[...cp.facts]:[],
  artifacts:cp?[...cp.artifacts]:[],
  contextOnly:true,
  authority:"NONE",
  freshnessBasis:"CONTINUITY_STATE_ONLY",
  truncated:false,
  omitted:{facts:0,artifacts:0,decisions:0}
 };
}
function assemblePackage(organizationId,snapshot){
 const basis=packageBasis(organizationId,snapshot);
 const render=()=>({
  ...basis,
  storeSeq:snapshot.seq,
  generatedAt:Date.now(),
  gitObservation:null,
  freshness:"FRESH",
  freshnessReason:"GENERATED_FROM_CURRENT_STATE",
  contextDigest:digestBasis(basis)
 });
 let pkg=render();
 const prune=(key)=>{
  if(basis[key].length){
   basis[key].pop();basis.omitted[key]++;basis.truncated=true;pkg=render();return true;
  }
  return false;
 };
 while(jsonBytes(pkg)>TARGET_BYTES){
  if(prune("facts")||prune("artifacts")||prune("decisions"))continue;
  break;
 }
 if(jsonBytes(pkg)>HARD_BYTES)fail("BUSINESS_CONTINUITY_CONTEXT_TOO_LARGE");
 return pkg;
}

export class BusinessContinuity{
 constructor(registry,{root}={}){
  if(typeof root!=="string"||!root)fail("BUSINESS_CONTINUITY_CONFIG_REQUIRED");
  this.registry=registry;
  const initialize=!existsSync(root);
  try{
   this.memory=new PersonalMemoryStore(root,{
    initialize,
    ownerStatus:()=>({paired:true})
   });
  }catch(e){throw mapMemoryError(e);}
 }
 close(){this.memory.close();}
 organizationId(){return this.registry.organization().organizationId;}
 scope(projectId,tool){return authorizeProjectTool(this.registry,{projectId,tool});}
 ensureProject(projectId){
  const org=this.organizationId();
  const exists=this.memory.read(view=>view.projects.has(projectId));
  if(exists)return;
  const operationId=deterministicUuid("business-continuity-project:"+org+":"+projectId);
  try{
   this.memory.projectRegister({projectId,rootLabel:"Business project "+projectId,operationId});
  }catch(e){throw mapMemoryError(e);}
 }
 startTask({projectId,objective,operationId}){
  this.scope(projectId,"continuity_start_task");
  objective=cleanText(objective,1,160);cleanId(operationId);
  this.ensureProject(projectId);
  try{
   const result=this.memory.taskStart({projectId,title:objective,operationId});
   return {organizationId:this.organizationId(),...result,objective};
  }catch(e){throw mapMemoryError(e);}
 }

 checkpoint({projectId,taskId,expectedTaskRevision,operationId,summary,currentState,
  nextActions,verification,decisions=[],facts=[],artifacts=[]}){
  this.scope(projectId,"continuity_checkpoint");
  cleanId(taskId);cleanId(operationId);
  if(!Number.isSafeInteger(expectedTaskRevision)||expectedTaskRevision<0)
   fail("BUSINESS_CONTINUITY_REVISION_INVALID");
  try{
   const result=this.memory.checkpointAppend({
    projectId,taskId,expectedTaskRevision,operationId,summary,currentState,
    nextActions,verification,decisions,facts,artifactRefs:artifacts,gitSha:null
   });
   return {organizationId:this.organizationId(),...result};
  }catch(e){throw String(e?.message||"").startsWith("MEMORY_")?mapMemoryError(e):e;}
 }
 completeTask({projectId,taskId,expectedTaskRevision,operationId}){
  this.scope(projectId,"continuity_complete_task");
  cleanId(taskId);cleanId(operationId);
  if(!Number.isSafeInteger(expectedTaskRevision)||expectedTaskRevision<0)
   fail("BUSINESS_CONTINUITY_REVISION_INVALID");
  try{
   const result=this.memory.taskComplete({projectId,taskId,expectedTaskRevision,operationId});
   return {organizationId:this.organizationId(),...result};
  }catch(e){throw String(e?.message||"").startsWith("MEMORY_")?mapMemoryError(e):e;}
 }
 prepareHandoff({projectId,taskId}){
  this.scope(projectId,"continuity_prepare_handoff");cleanId(taskId);
  try{return assemblePackage(this.organizationId(),taskSnapshot(this.memory,projectId,taskId));}
  catch(e){throw String(e?.message||"").startsWith("MEMORY_")?mapMemoryError(e):e;}
 }

 open({projectId,taskId=null,expectedContextDigest=null}){
  this.scope(projectId,"continuity_open");
  if(taskId===null){
   if(expectedContextDigest!==null)fail("BUSINESS_CONTINUITY_INVALID_INPUT");
   try{
    const tasks=this.memory.read(view=>[...view.tasks.values()]
     .filter(t=>t.projectId===projectId)
     .slice(-10)
     .map(t=>({taskId:t.taskId,objective:t.title,status:t.status,revision:t.revision,
       startedAt:t.startedAt,completedAt:t.completedAt})));
    return {organizationId:this.organizationId(),projectId,recentTasks:tasks,
     freshness:"FRESH",freshnessReason:"CURRENT_AUTHORITY_READ",contextOnly:true,
     authority:"NONE"};
   }catch(e){
    const mapped=String(e?.message||"").startsWith("MEMORY_")?mapMemoryError(e):e;
    if(mapped.message==="BUSINESS_CONTINUITY_UNAVAILABLE")
     return {organizationId:this.organizationId(),projectId,recentTasks:[],
      freshness:"UNVERIFIED",freshnessReason:"MEMORY_UNAVAILABLE",
      contextOnly:true,authority:"NONE"};
    throw mapped;
   }
  }
  cleanId(taskId);
  if(expectedContextDigest!==null&&!DIGEST.test(expectedContextDigest))
   fail("BUSINESS_CONTINUITY_DIGEST_INVALID");
  try{
   const pkg=assemblePackage(this.organizationId(),taskSnapshot(this.memory,projectId,taskId));
   if(expectedContextDigest===null)
    return {...pkg,freshness:"FRESH",freshnessReason:"CURRENT_AUTHORITY_READ"};
   if(pkg.contextDigest===expectedContextDigest)
    return {...pkg,freshness:"FRESH",freshnessReason:"CONTEXT_DIGEST_MATCH",
     suppliedContextDigest:expectedContextDigest};
   return {...pkg,freshness:"STALE",freshnessReason:"TASK_STATE_CHANGED",
    suppliedContextDigest:expectedContextDigest};
  }catch(e){
   const mapped=String(e?.message||"").startsWith("MEMORY_")?mapMemoryError(e):e;
   if(mapped.message==="BUSINESS_CONTINUITY_UNAVAILABLE")
    return {organizationId:this.organizationId(),projectId,taskId,
     freshness:"UNVERIFIED",freshnessReason:"MEMORY_UNAVAILABLE",
     contextOnly:true,authority:"NONE",contextDigest:null};
   throw mapped;
  }
 }
}
