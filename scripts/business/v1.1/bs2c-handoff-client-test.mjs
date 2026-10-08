import assert from 'node:assert/strict';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';
import {HANDOFF_TARGET_BYTES} from './continuity/business-handoff-context.mjs';

const projectId='dev';
const taskId='40000000-0000-4000-8000-000000000002';
const checkpointId='40000000-0000-4000-8000-000000000003';
let seq=7;
let revision=1;
let status='ACTIVE';
let integrity=true;
let failBackend=false;
let large=false;
const calls=[];
const taskResult=()=>({
  contextSeq:seq,integrityVerified:integrity,
  task:{taskId,projectId,objective:'Prepare shared launch',status,revision,createdByUserId:'u',assignedToUserId:null,tags:['team'],
    startedAt:'2026-10-07T00:00:00.000Z',completedAt:status==='COMPLETED'?'2026-10-07T02:00:00.000Z':null},
  checkpoints:[{checkpointId,revision:Math.min(revision,1),summary:'Launch plan',currentState:'Ready for review',
    nextActions:['Review campaign'],verification:'CI green',
    decisions:large?Array.from({length:8},(_,i)=>`${i}-`+'가'.repeat(248)):['Staged rollout'],
    facts:large?Array.from({length:8},(_,i)=>`${i}-`+'나'.repeat(248)):['Budget confirmed'],
    artifacts:large?Array.from({length:5},(_,i)=>`artifact-${i}-`+'다'.repeat(108)):['docs/launch.md'],
    createdAt:'2026-10-07T01:00:00.000Z'}]
});
const authSession={
  async ensureSession(){},
  async rpc(name,args){
    calls.push({name,args});
    if(failBackend)return {data:null,error:{message:'network unavailable'}};
    if(name==='bc_member_profile')return {data:{organizationSlug:'acme'},error:null};
    if(name==='bc_task_get')return {data:taskResult(),error:null};
    if(name==='bc_project_context')return {data:{projectId,contextSeq:seq,integrityVerified:integrity,tasks:[{taskId,status,revision}]},error:null};
    if(name==='bc_export_snapshot')return {data:{project:{projectId},logicalDigest:'sha256:'+'b'.repeat(64),integrityVerified:true},error:null};
    return {data:null,error:{message:'unexpected'}};
  }
};
const store=new SupabaseBusinessContinuityStore({authSession});

const first=await store.prepareHandoff({projectId,taskId});
assert.equal(first.freshness,'FRESH');
assert.equal(first.freshnessReason,'CURRENT_AUTHORITY_READ');
assert.equal(first.contextOnly,true);assert.equal(first.authority,'NONE');
assert.match(first.contextDigest,/^sha256:[a-f0-9]{64}$/);
assert.equal(first.startedAt,Date.parse('2026-10-07T00:00:00.000Z'));

seq++;
const unrelated=await store.getContext({projectId,taskId,expectedContextDigest:first.contextDigest});
assert.equal(unrelated.freshness,'FRESH');
assert.equal(unrelated.contextDigest,first.contextDigest,'organization contextSeq change must not stale task digest');

revision=2;
const stale=await store.getContext({projectId,taskId,expectedContextDigest:first.contextDigest});
assert.equal(stale.freshness,'STALE');
assert.equal(stale.freshnessReason,'TASK_STATE_CHANGED');
assert.notEqual(stale.contextDigest,first.contextDigest);

status='COMPLETED';revision=3;
const completed=await store.getContext({projectId,taskId,expectedContextDigest:stale.contextDigest});
assert.equal(completed.freshness,'STALE');
assert.equal(completed.taskStatus,'COMPLETED');

status='ACTIVE';revision=1;large=true;
const bounded=await store.prepareHandoff({projectId,taskId});
assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=HANDOFF_TARGET_BYTES);
assert.equal(bounded.truncated,true);
assert.ok(bounded.omitted.facts+bounded.omitted.artifacts+bounded.omitted.decisions>0);
large=false;

integrity=false;
const unverIntegrity=await store.prepareHandoff({projectId,taskId});
assert.equal(unverIntegrity.freshness,'UNVERIFIED');
assert.equal(unverIntegrity.contextDigest,null);
assert.equal(unverIntegrity.freshnessReason,'CONTINUITY_INTEGRITY_UNVERIFIED');
const projectUnver=await store.getContext({projectId});
assert.equal(projectUnver.freshness,'UNVERIFIED');

integrity=true;failBackend=true;
const unavailable=await store.getContext({projectId,taskId});
assert.equal(unavailable.freshness,'UNVERIFIED');
assert.equal(unavailable.freshnessReason,'CONTINUITY_UNAVAILABLE');
failBackend=false;

const exported=await store.exportSnapshot({projectId});
assert.match(exported.logicalDigest,/^sha256:[a-f0-9]{64}$/);
assert.equal(calls.at(-1).name,'bc_export_snapshot');
await assert.rejects(()=>store.getContext({projectId,expectedContextDigest:first.contextDigest}),/BUSINESS_CONTINUITY_INPUT_INVALID/);

console.log('PASS Business Supabase handoff keeps digest stable across unrelated contextSeq changes and marks related task changes STALE');
console.log('PASS completed task changes stale the prior digest; integrity/backend failures return explicit UNVERIFIED with no digest');
console.log('PASS handoff deterministically prunes optional fields to <=8 KiB target and export uses bounded project RPC');
console.log('BUSINESS_S2C_HANDOFF_CLIENT=PASS');
