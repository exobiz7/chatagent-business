import {createHash} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_BYTES=64*1024*1024;
const FORMAT='chatagent-business-continuity-logical-v1';
const fail=code=>{throw Error(code);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);

function stable(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
function timestamp(value){
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  return value;
}
function uuid(value,{nullable=false}={}){
  if(nullable&&value===null)return null;
  if(!UUID.test(value??''))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  return value;
}
function text(value,min,max){
  if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
    fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  return value;
}
function textList(value,maxItems=64,maxLength=4096){
  if(!Array.isArray(value)||value.length>maxItems||value.some(v=>typeof v!=='string'||v.length>maxLength))
    fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  return [...value];
}
function integer(value,{min=0}={}){
  if(!Number.isSafeInteger(value)||value<min)fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  return value;
}
function assertExactKeys(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))
    fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
}
function sortBy(list,fn){return [...list].sort((a,b)=>fn(a).localeCompare(fn(b)));}

export function normalizeBusinessContinuityLogicalSnapshot(input){
  const source=clone(input);
  assertExactKeys(source,['format','schemaVersion','contractVersion','organizationSlug','contextSeq','headSha256','projects','privateProjectMembers','tasks','checkpoints','operations','events','counts']);
  if(source.format!==FORMAT||source.schemaVersion!==1||source.contractVersion!==1||!SLUG.test(source.organizationSlug??'')||
     !SHA.test(source.headSha256??'')||!Array.isArray(source.projects)||!Array.isArray(source.privateProjectMembers)||
     !Array.isArray(source.tasks)||!Array.isArray(source.checkpoints)||!Array.isArray(source.operations)||!Array.isArray(source.events))
    fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  source.contextSeq=integer(source.contextSeq);
  assertExactKeys(source.counts,['projects','privateProjectMembers','tasks','checkpoints','operations','events']);

  const projectIds=new Set(),projectKeys=new Set();
  for(const p of source.projects){
    assertExactKeys(p,['projectId','projectKey','displayName','collaborationMode','projectProfile','policyRevision','createdByUserId','createdAt','updatedAt']);
    uuid(p.projectId);uuid(p.createdByUserId);timestamp(p.createdAt);timestamp(p.updatedAt);integer(p.policyRevision,{min:1});
    if(projectIds.has(p.projectId)||projectKeys.has(p.projectKey)||!SLUG.test(p.projectKey??'')||
       !['TEAM','PRIVATE'].includes(p.collaborationMode)||!['READ_ONLY','SAFE','STANDARD'].includes(p.projectProfile))
      fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    text(p.displayName,1,128);projectIds.add(p.projectId);projectKeys.add(p.projectKey);
  }
  const privatePairs=new Set();
  for(const m of source.privateProjectMembers){
    assertExactKeys(m,['projectId','userId','grantedByUserId','grantedAt']);
    uuid(m.projectId);uuid(m.userId);uuid(m.grantedByUserId);timestamp(m.grantedAt);
    if(!projectIds.has(m.projectId)||privatePairs.has(m.projectId+'\0'+m.userId))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    privatePairs.add(m.projectId+'\0'+m.userId);
  }
  const taskIds=new Set();
  for(const t of source.tasks){
    assertExactKeys(t,['taskId','projectId','objective','status','revision','createdByUserId','assignedToUserId','tags','startedAt','completedAt','completedByUserId']);
    uuid(t.taskId);uuid(t.projectId);uuid(t.createdByUserId);uuid(t.assignedToUserId,{nullable:true});uuid(t.completedByUserId,{nullable:true});
    timestamp(t.startedAt);integer(t.revision);text(t.objective,1,4096);textList(t.tags,32,64);
    if(taskIds.has(t.taskId)||!projectIds.has(t.projectId)||!['ACTIVE','COMPLETED'].includes(t.status))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    if(t.status==='ACTIVE'&&(t.completedAt!==null||t.completedByUserId!==null))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    if(t.status==='COMPLETED'){timestamp(t.completedAt);uuid(t.completedByUserId);}
    taskIds.add(t.taskId);
  }
  const checkpointIds=new Set(),taskCheckpointRevisions=new Set();
  for(const c of source.checkpoints){
    assertExactKeys(c,['checkpointId','projectId','taskId','revision','summary','currentState','nextActions','verification','decisions','facts','artifacts','sourceUserId','sourceRuntimeNodeId','createdAt']);
    uuid(c.checkpointId);uuid(c.projectId);uuid(c.taskId);uuid(c.sourceUserId);uuid(c.sourceRuntimeNodeId,{nullable:true});timestamp(c.createdAt);integer(c.revision,{min:1});
    text(c.summary,1,4096);text(c.currentState,1,8192);textList(c.nextActions);textList(c.decisions);textList(c.facts);textList(c.artifacts);
    if(c.verification!==null)text(c.verification,1,4096);
    const revKey=c.taskId+'\0'+c.revision;
    if(checkpointIds.has(c.checkpointId)||taskCheckpointRevisions.has(revKey)||!taskIds.has(c.taskId)||!projectIds.has(c.projectId))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    checkpointIds.add(c.checkpointId);taskCheckpointRevisions.add(revKey);
  }
  const operationIds=new Set();
  for(const o of source.operations){
    assertExactKeys(o,['operationId','operationKind','inputSha256','receipt','createdAt']);
    uuid(o.operationId);timestamp(o.createdAt);
    if(operationIds.has(o.operationId)||typeof o.operationKind!=='string'||!/^[a-z][a-z0-9_]{2,80}$/.test(o.operationKind)||
       !SHA.test(o.inputSha256??'')||!o.receipt||typeof o.receipt!=='object'||Array.isArray(o.receipt))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    operationIds.add(o.operationId);
  }
  let expectedSeq=1,previous='0'.repeat(64);
  for(const e of [...source.events].sort((a,b)=>a.seq-b.seq)){
    assertExactKeys(e,['seq','eventKind','projectId','taskId','checkpointId','actorUserId','payloadSha256','previousSha256','eventSha256','createdAt']);
    integer(e.seq,{min:1});uuid(e.projectId);uuid(e.taskId,{nullable:true});uuid(e.checkpointId,{nullable:true});uuid(e.actorUserId);timestamp(e.createdAt);
    if(e.seq!==expectedSeq++||!projectIds.has(e.projectId)||!SHA.test(e.payloadSha256??'')||!SHA.test(e.previousSha256??'')||!SHA.test(e.eventSha256??'')||
       e.previousSha256!==previous||!/^[A-Z][A-Z0-9_]{2,80}$/.test(e.eventKind??''))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    if(e.taskId!==null&&!taskIds.has(e.taskId))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    if(e.checkpointId!==null&&!checkpointIds.has(e.checkpointId))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
    previous=e.eventSha256;
  }
  if(source.events.length!==source.contextSeq||source.headSha256!==(source.events.length?previous:'0'.repeat(64)))fail('BUSINESS_BACKUP_SNAPSHOT_INVALID');
  if(source.counts.projects!==source.projects.length||source.counts.privateProjectMembers!==source.privateProjectMembers.length||
     source.counts.tasks!==source.tasks.length||source.counts.checkpoints!==source.checkpoints.length||
     source.counts.operations!==source.operations.length||source.counts.events!==source.events.length)fail('BUSINESS_BACKUP_COUNT_MISMATCH');

  source.projects=sortBy(source.projects,p=>p.projectKey+'\0'+p.projectId);
  source.privateProjectMembers=sortBy(source.privateProjectMembers,m=>m.projectId+'\0'+m.userId);
  source.tasks=sortBy(source.tasks,t=>t.startedAt+'\0'+t.taskId);
  source.checkpoints=sortBy(source.checkpoints,c=>c.createdAt+'\0'+c.checkpointId);
  source.operations=sortBy(source.operations,o=>o.createdAt+'\0'+o.operationId);
  source.events=[...source.events].sort((a,b)=>a.seq-b.seq);
  if(Buffer.byteLength(stable(source))>MAX_BYTES)fail('BUSINESS_BACKUP_SNAPSHOT_TOO_LARGE');
  return source;
}

export function businessContinuityLogicalDigest(snapshot){
  const normalized=normalizeBusinessContinuityLogicalSnapshot(snapshot);
  return 'sha256:'+sha(stable(normalized));
}

export function canonicalBusinessContinuityLogicalSnapshot(snapshot){
  const normalized=normalizeBusinessContinuityLogicalSnapshot(snapshot);
  return stable(normalized);
}

export const BUSINESS_CONTINUITY_LOGICAL_FORMAT=FORMAT;
export const BUSINESS_CONTINUITY_LOGICAL_MAX_BYTES=MAX_BYTES;
