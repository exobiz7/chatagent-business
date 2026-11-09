import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {BusinessRegistry} from '../../business-core.mjs';
import {assembleBusinessHandoff} from '../continuity/business-handoff-context.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const GENESIS='0'.repeat(64);
const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==='function'?process.getuid():null;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const sha=value=>createHash('sha256').update(value).digest('hex');

function stable(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
function privateDir(path){
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)==='/')fail('BUSINESS_MIGRATION_SOURCE_UNSAFE');
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))fail('BUSINESS_MIGRATION_SOURCE_UNSAFE');
  return realpathSync(path);
}
function privateFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))fail('BUSINESS_MIGRATION_SOURCE_UNSAFE');
  return st;
}
function parseJson(text,code){try{return JSON.parse(text);}catch{fail(code);}}
function handoffDigest(organizationId,task,checkpoints,contextSeq){
  const taskResult={contextSeq,integrityVerified:true,task:{
    projectId:task.projectKey,taskId:task.taskId,objective:task.objective,status:task.status,revision:task.revision,
    startedAt:task.startedAt,completedAt:task.completedAt
  },checkpoints:checkpoints.map(c=>({checkpointId:c.checkpointId,revision:c.revision,summary:c.summary,currentState:c.currentState,
    nextActions:c.nextActions,verification:c.verification,decisions:c.decisions,facts:c.facts,artifacts:c.artifacts,createdAt:c.createdAt}))};
  return assembleBusinessHandoff({organizationId,taskResult}).contextDigest;
}
function canonicalEvent(event,sourceSeq,prev,eventHash){
  const base={sourceSeq,kind:event.kind,operationId:event.operationId,inputHash:event.inputHash,at:event.at,
    projectKey:event.projectId,sourcePrevHash:prev,sourceEventHash:eventHash};
  if(event.kind==='TASK')return {...base,taskId:event.taskId,objective:event.title};
  if(event.kind==='CHECKPOINT')return {...base,taskId:event.taskId,checkpointId:event.checkpointId,
    expectedTaskRevision:event.expectedTaskRevision,resultingRevision:event.resultingRevision,summary:event.summary,
    currentState:event.currentState,nextActions:[...(event.nextActions??[])],verification:event.verification,
    decisions:[...(event.decisions??[])],facts:[...(event.facts??[])],artifacts:[...(event.artifactRefs??[])]};
  if(event.kind==='COMPLETE')return {...base,taskId:event.taskId,expectedTaskRevision:event.expectedTaskRevision,
    resultingRevision:event.resultingRevision};
  return null;
}

export function validateBusinessV1MigrationBundle(bundle){
  if(!bundle||typeof bundle!=='object'||Array.isArray(bundle)||bundle.schemaVersion!==1||bundle.contractVersion!==1||
     bundle.sourceProduct!=='ChatAgent Business'||bundle.sourceVersion!=='1.0.0'||typeof bundle.exportedAt!=='number'||
     !bundle.payload||typeof bundle.payload!=='object'||Array.isArray(bundle.payload)||typeof bundle.canonicalPayload!=='string'||
     !/^sha256:[a-f0-9]{64}$/.test(bundle.logicalDigest??''))fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
  if(Buffer.byteLength(bundle.canonicalPayload)>32*1024*1024)fail('BUSINESS_MIGRATION_BUNDLE_TOO_LARGE');
  let parsed;try{parsed=JSON.parse(bundle.canonicalPayload);}catch{fail('BUSINESS_MIGRATION_BUNDLE_INVALID');}
  if(stable(parsed)!==bundle.canonicalPayload||stable(bundle.payload)!==bundle.canonicalPayload||
     bundle.logicalDigest!=='sha256:'+sha(bundle.canonicalPayload))fail('BUSINESS_MIGRATION_DIGEST_MISMATCH');
  const p=bundle.payload;
  if(!PROJECT.test(p.organizationId??'')||!Number.isSafeInteger(p.registryRevision)||p.registryRevision<0||
     !p.sourceContinuity||p.sourceContinuity.schemaVersion!==1||!Number.isSafeInteger(p.sourceContinuity.seq)||p.sourceContinuity.seq<0||
     !SHA.test(p.sourceContinuity.headSha256??'')||!Array.isArray(p.projects)||!Array.isArray(p.sourceEvents)||!p.counts)
    fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
  const projectKeys=new Set(),tasks=new Set(),checkpoints=new Set(),operations=new Set();
  let taskCount=0,checkpointCount=0;
  for(const project of p.projects){
    if(!PROJECT.test(project?.projectKey??'')||projectKeys.has(project.projectKey)||typeof project.displayName!=='string'||
       !['READ_ONLY','SAFE','STANDARD'].includes(project.projectProfile)||project.collaborationMode!=='TEAM'||project.sourceEnabled!==true||
       !Array.isArray(project.tasks)||!Array.isArray(project.checkpoints)||!Array.isArray(project.handoffDigests))
      fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
    projectKeys.add(project.projectKey);taskCount+=project.tasks.length;checkpointCount+=project.checkpoints.length;
    for(const task of project.tasks){if(!UUID.test(task?.taskId??'')||tasks.has(task.taskId)||task.projectKey!==project.projectKey)fail('BUSINESS_MIGRATION_BUNDLE_INVALID');tasks.add(task.taskId);}
    for(const cp of project.checkpoints){if(!UUID.test(cp?.checkpointId??'')||checkpoints.has(cp.checkpointId)||!tasks.has(cp.taskId))fail('BUSINESS_MIGRATION_BUNDLE_INVALID');checkpoints.add(cp.checkpointId);}
    for(const h of project.handoffDigests)if(!tasks.has(h?.taskId)||!/^sha256:[a-f0-9]{64}$/.test(h?.contextDigest??''))fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
  }
  for(const event of p.sourceEvents){
    if(!['TASK','CHECKPOINT','COMPLETE'].includes(event?.kind)||!UUID.test(event.operationId??'')||operations.has(event.operationId)||
       !SHA.test(event.inputHash??'')||!Number.isSafeInteger(event.sourceSeq)||event.sourceSeq<1||!projectKeys.has(event.projectKey)||!tasks.has(event.taskId))
      fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
    operations.add(event.operationId);
    if(event.kind==='CHECKPOINT'&&!checkpoints.has(event.checkpointId))fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
  }
  if(p.counts.projects!==p.projects.length||p.counts.tasks!==taskCount||p.counts.checkpoints!==checkpointCount||
     p.counts.operations!==p.sourceEvents.length||p.counts.events!==p.sourceEvents.length||p.counts.sourceRawEvents!==p.sourceContinuity.seq)
    fail('BUSINESS_MIGRATION_COUNT_MISMATCH');
  if(bundle.canonicalPayload.includes('hostRoot')||bundle.canonicalPayload.includes('memory-seal.key'))fail('BUSINESS_MIGRATION_BUNDLE_INVALID');
  return bundle;
}

export function exportBusinessV1Continuity({sourceStateDir}={}){
  sourceStateDir=privateDir(sourceStateDir);
  const registry=new BusinessRegistry(sourceStateDir),registryDoc=registry.read(),organization=registry.organization();
  const continuityDir=privateDir(join(sourceStateDir,'continuity'));
  const keyPath=join(continuityDir,'memory-seal.key'),headPath=join(continuityDir,'memory-head.json'),dbPath=join(continuityDir,'memory.sqlite');
  privateFile(keyPath);privateFile(headPath);privateFile(dbPath);
  const key=readFileSync(keyPath);if(key.length!==32)fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  const head=parseJson(readFileSync(headPath,'utf8'),'BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  if(!Number.isSafeInteger(head?.seq)||head.seq<0||!SHA.test(head?.eventHash??'')||!SHA.test(head?.mac??''))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  const expectedHeadMac=createHmac('sha256',key).update(head.seq+':'+head.eventHash).digest('hex');
  if(!same(head.mac,expectedHeadMac))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  const db=new DatabaseSync(dbPath,{readOnly:true});let rows,userVersion,integrity;
  try{integrity=db.prepare('PRAGMA integrity_check').get()?.integrity_check;userVersion=db.prepare('PRAGMA user_version').get()?.user_version;
    rows=db.prepare('SELECT seq,payload,prev_hash,event_hash FROM events ORDER BY seq').all();}
  finally{db.close();}
  if(integrity!=='ok'||userVersion!==1||rows.length!==head.seq)fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  const registryProjects=new Map(registry.list().map(p=>[p.projectId,p]));
  const memoryProjects=new Map(),tasks=new Map(),checkpoints=[],sourceEvents=[],operationIds=new Set();
  let previous=GENESIS,seq=0;
  for(const row of rows){
    if(Number(row.seq)!==++seq||row.prev_hash!==previous||!SHA.test(row.event_hash??''))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
    const expected=createHmac('sha256',key).update(row.seq+':'+row.prev_hash+':'+row.payload).digest('hex');
    if(!same(row.event_hash,expected))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
    previous=expected;const e=parseJson(row.payload,'BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
    if(!['PROJECT','TASK','CHECKPOINT','COMPLETE'].includes(e?.kind)||!UUID.test(e.operationId??'')||operationIds.has(e.operationId)||
       !SHA.test(e.inputHash??'')||!Number.isSafeInteger(e.at)||e.at<0||!PROJECT.test(e.projectId??'')||!registryProjects.has(e.projectId))
      fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
    operationIds.add(e.operationId);
    if(e.kind==='PROJECT'){
      if(memoryProjects.has(e.projectId)||!UUID.test(e.projectUuid??''))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
      memoryProjects.set(e.projectId,{sourceProjectUuid:e.projectUuid,createdAt:e.at});continue;
    }
    if(e.kind==='TASK'){
      if(!memoryProjects.has(e.projectId)||!UUID.test(e.taskId??'')||tasks.has(e.taskId)||typeof e.title!=='string')fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
      tasks.set(e.taskId,{projectKey:e.projectId,taskId:e.taskId,objective:e.title,status:'ACTIVE',revision:0,startedAt:e.at,completedAt:null});
    }else{
      const task=tasks.get(e.taskId);if(!task||task.projectKey!==e.projectId||task.status!=='ACTIVE'||e.expectedTaskRevision!==task.revision||e.resultingRevision!==task.revision+1)fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
      task.revision=e.resultingRevision;
      if(e.kind==='CHECKPOINT'){
        if(!UUID.test(e.checkpointId??''))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
        const cp={projectKey:e.projectId,taskId:e.taskId,checkpointId:e.checkpointId,revision:e.resultingRevision,summary:e.summary,currentState:e.currentState,
          nextActions:[...(e.nextActions??[])],verification:e.verification,decisions:[...(e.decisions??[])],facts:[...(e.facts??[])],artifacts:[...(e.artifactRefs??[])],createdAt:e.at};
        checkpoints.push(cp);
      }else{task.status='COMPLETED';task.completedAt=e.at;}
    }
    sourceEvents.push(canonicalEvent(e,Number(row.seq),row.prev_hash,row.event_hash));
  }
  if(previous!==head.eventHash)fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  const projects=[];
  for(const rp of [...registryProjects.values()].sort((a,b)=>a.projectId.localeCompare(b.projectId))){
    if(rp.enabled!==true)fail('BUSINESS_MIGRATION_DISABLED_PROJECT_UNSUPPORTED');
    const projectTasks=[...tasks.values()].filter(t=>t.projectKey===rp.projectId).sort((a,b)=>a.startedAt-b.startedAt||a.taskId.localeCompare(b.taskId));
    const projectCheckpoints=checkpoints.filter(c=>c.projectKey===rp.projectId).sort((a,b)=>a.createdAt-b.createdAt||a.checkpointId.localeCompare(b.checkpointId));
    const handoffDigests=projectTasks.map(task=>({taskId:task.taskId,contextDigest:handoffDigest(organization.organizationId,task,projectCheckpoints.filter(c=>c.taskId===task.taskId),head.seq)}));
    projects.push({projectKey:rp.projectId,displayName:rp.displayName,projectProfile:rp.profile,collaborationMode:'TEAM',sourceEnabled:true,
      sourceProjectUuid:memoryProjects.get(rp.projectId)?.sourceProjectUuid??null,tasks:projectTasks,checkpoints:projectCheckpoints,handoffDigests});
  }
  if([...memoryProjects.keys()].some(k=>!registryProjects.has(k)))fail('BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED');
  const payload={organizationId:organization.organizationId,registryRevision:registryDoc.revision,
    sourceContinuity:{schemaVersion:1,seq:head.seq,headSha256:head.eventHash},projects,sourceEvents,
    counts:{projects:projects.length,tasks:tasks.size,checkpoints:checkpoints.length,operations:sourceEvents.length,events:sourceEvents.length,sourceRawEvents:rows.length}};
  const canonicalPayload=stable(payload),bundle={schemaVersion:1,contractVersion:1,sourceProduct:'ChatAgent Business',sourceVersion:'1.0.0',
    exportedAt:Date.now(),payload,canonicalPayload,logicalDigest:'sha256:'+sha(canonicalPayload)};
  return validateBusinessV1MigrationBundle(bundle);
}
