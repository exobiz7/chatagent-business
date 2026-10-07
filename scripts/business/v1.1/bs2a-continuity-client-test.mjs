import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';

const calls=[];
const authSession={
  async ensureSession(){return {access_token:'fixture'};},
  async rpc(name,args){calls.push({name,args});return {data:{ok:true,name,args},error:null};}
};
const store=new SupabaseBusinessContinuityStore({authSession});
const projectId=randomUUID(),taskId=randomUUID(),operationId=randomUUID();
await store.taskStart({projectId,objective:'Ship TEAM continuity foundation',operationId,tags:['bs2a','team']});
assert.equal(calls.at(-1).name,'bc_task_start');
assert.equal(calls.at(-1).args.p_project_id,projectId);
assert.deepEqual(calls.at(-1).args.p_tags,['bs2a','team']);

await store.checkpointAppend({projectId,taskId,expectedTaskRevision:0,summary:'Foundation complete',currentState:'Contract and integration are green',
  operationId:randomUUID(),nextActions:['Apply staging migration'],verification:'local PASS',decisions:['TEAM default'],facts:['six tables'],artifacts:['docs/verification']});
assert.equal(calls.at(-1).name,'bc_checkpoint_append');
assert.equal(calls.at(-1).args.p_expected_task_revision,0);
await store.taskGet({projectId,taskId});
assert.equal(calls.at(-1).name,'bc_task_get');

const count=calls.length;
assert.throws(()=>store.taskStart({projectId,objective:'password=do-not-store',operationId:randomUUID()}),/BUSINESS_CONTINUITY_SENSITIVE_TEXT/);
assert.throws(()=>store.checkpointAppend({projectId,taskId,expectedTaskRevision:0,summary:'x',currentState:'Bearer secret-token-value',operationId:randomUUID()}),/BUSINESS_CONTINUITY_SENSITIVE_TEXT/);
assert.equal(calls.length,count,'sensitive input must be rejected before RPC');

const failing=new SupabaseBusinessContinuityStore({authSession:{
  async ensureSession(){},async rpc(){return {data:null,error:{message:'BUSINESS_REVISION_CONFLICT'}};}
}});
await assert.rejects(()=>failing.checkpointAppend({projectId,taskId,expectedTaskRevision:1,summary:'x',currentState:'y',operationId:randomUUID()}),/BUSINESS_REVISION_CONFLICT/);

console.log('PASS continuity client exposes bounded task start/checkpoint/get RPCs only for B-S2A');
console.log('PASS sensitive-text guard rejects before network persistence and backend error codes remain fail-closed');
console.log('BUSINESS_S2A_CONTINUITY_CLIENT=PASS');
