import {createHash} from 'node:crypto';

const DIGEST=/^sha256:[a-f0-9]{64}$/;
export const HANDOFF_TARGET_BYTES=8192;
export const HANDOFF_HARD_BYTES=24576;
const fail=code=>{throw Error(code);};
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const hash=value=>createHash('sha256').update(value).digest('hex');

function stable(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
}
const digestBasis=basis=>'sha256:'+hash(stable(basis));
const epoch=value=>{
  if(value===null||value===undefined)return null;
  if(Number.isSafeInteger(value))return value;
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))fail('BUSINESS_CONTINUITY_TIMESTAMP_INVALID');
  return parsed;
};
const cloneList=value=>Array.isArray(value)?[...value]:[];

function basisFrom({organizationId,task,checkpoint}){
  return {
    schemaVersion:1,
    organizationId,
    projectId:task.projectId,
    taskId:task.taskId,
    objective:task.objective,
    taskStatus:task.status,
    revision:task.revision,
    lastCheckpoint:checkpoint?{
      checkpointId:checkpoint.checkpointId,
      revision:checkpoint.revision,
      summary:checkpoint.summary,
      currentState:checkpoint.currentState,
      verification:checkpoint.verification??null,
      createdAt:epoch(checkpoint.createdAt)
    }:null,
    nextActions:checkpoint?cloneList(checkpoint.nextActions):[],
    decisions:checkpoint?cloneList(checkpoint.decisions):[],
    facts:checkpoint?cloneList(checkpoint.facts):[],
    artifacts:checkpoint?cloneList(checkpoint.artifacts):[],
    contextOnly:true,
    authority:'NONE',
    freshnessBasis:'CONTINUITY_STATE_ONLY',
    truncated:false,
    omitted:{facts:0,artifacts:0,decisions:0}
  };
}

export function assembleBusinessHandoff({organizationId,taskResult}){
  if(!organizationId||typeof organizationId!=='string')fail('BUSINESS_CONTINUITY_CONFIG_INVALID');
  if(!taskResult?.task)fail('BUSINESS_CONTINUITY_TASK_NOT_FOUND');
  if(taskResult.integrityVerified===false)return {
    organizationId,projectId:taskResult.task.projectId,taskId:taskResult.task.taskId,
    freshness:'UNVERIFIED',freshnessReason:'CONTINUITY_INTEGRITY_UNVERIFIED',contextOnly:true,
    authority:'NONE',contextDigest:null,storeSeq:taskResult.contextSeq??null
  };
  const checkpoints=Array.isArray(taskResult.checkpoints)?taskResult.checkpoints:[];
  const latest=checkpoints.at(-1)??null;
  const basis=basisFrom({organizationId,task:taskResult.task,checkpoint:latest});
  const render=()=>({...basis,startedAt:epoch(taskResult.task.startedAt),completedAt:epoch(taskResult.task.completedAt),
    storeSeq:taskResult.contextSeq??null,generatedAt:Date.now(),gitObservation:null,
    freshness:'FRESH',freshnessReason:'GENERATED_FROM_CURRENT_STATE',contextDigest:digestBasis(basis)});
  let pkg=render();
  const prune=key=>{
    if(!basis[key].length)return false;
    basis[key].pop();basis.omitted[key]++;basis.truncated=true;pkg=render();return true;
  };
  while(bytes(pkg)>HANDOFF_TARGET_BYTES){
    if(prune('facts')||prune('artifacts')||prune('decisions'))continue;
    break;
  }
  if(bytes(pkg)>HANDOFF_HARD_BYTES)fail('BUSINESS_CONTINUITY_CONTEXT_TOO_LARGE');
  return pkg;
}

export function applyBusinessFreshness(pkg,expectedContextDigest=null){
  if(pkg?.freshness==='UNVERIFIED')return pkg;
  if(expectedContextDigest===null||expectedContextDigest===undefined)
    return {...pkg,freshness:'FRESH',freshnessReason:'CURRENT_AUTHORITY_READ'};
  if(!DIGEST.test(expectedContextDigest))fail('BUSINESS_CONTINUITY_DIGEST_INVALID');
  if(pkg.contextDigest===expectedContextDigest)
    return {...pkg,freshness:'FRESH',freshnessReason:'CONTEXT_DIGEST_MATCH',suppliedContextDigest:expectedContextDigest};
  return {...pkg,freshness:'STALE',freshnessReason:'TASK_STATE_CHANGED',suppliedContextDigest:expectedContextDigest};
}

export function unavailableBusinessContext({organizationId=null,projectId,taskId=null}={}){
  return {organizationId,projectId,taskId,freshness:'UNVERIFIED',freshnessReason:'CONTINUITY_UNAVAILABLE',
    contextOnly:true,authority:'NONE',contextDigest:null};
}

export const isBusinessContextDigest=value=>DIGEST.test(value??'');
