import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';

const calls=[];
const authSession={
  async ensureSession(){},
  async rpc(name,args){calls.push({name,args});return {data:{ok:true},error:null};}
};
const store=new SupabaseBusinessContinuityStore({authSession});
const projectId='dev',taskId=randomUUID(),operationId=randomUUID();

await store.taskComplete({projectId,taskId,expectedTaskRevision:3,operationId});
assert.equal(calls.at(-1).name,'bc_task_complete');
assert.deepEqual(calls.at(-1).args,{p_project_key:projectId,p_task_id:taskId,p_expected_task_revision:3,p_operation_id:operationId});

await store.projectContext({projectId});
assert.equal(calls.at(-1).name,'bc_project_context');
assert.equal(calls.at(-1).args.p_limit,10);
await store.projectContext({projectId,limit:20});
assert.equal(calls.at(-1).args.p_limit,20);

await store.historySearch({projectId,query:'  architecture decision  ',limit:7});
assert.equal(calls.at(-1).name,'bc_history_search');
assert.deepEqual(calls.at(-1).args,{p_project_key:projectId,p_query:'architecture decision',p_limit:7});

assert.throws(()=>store.taskComplete({projectId,taskId,expectedTaskRevision:-1,operationId}),/BUSINESS_CONTINUITY_INPUT_INVALID/);
assert.throws(()=>store.projectContext({projectId,limit:21}),/BUSINESS_CONTINUITY_INPUT_INVALID/);
assert.throws(()=>store.historySearch({projectId,query:'',limit:10}),/BUSINESS_CONTINUITY_INPUT_INVALID/);
assert.throws(()=>store.historySearch({projectId,query:'x',limit:0}),/BUSINESS_CONTINUITY_INPUT_INVALID/);

const failing=new SupabaseBusinessContinuityStore({authSession:{
  async ensureSession(){},async rpc(){return {data:null,error:{message:'BUSINESS_PRIVATE_PROJECT_DENIED'}};}
}});
await assert.rejects(()=>failing.historySearch({projectId,query:'decision'}),/BUSINESS_PRIVATE_PROJECT_DENIED/);

console.log('PASS B-S2B client exposes completion, bounded project context and bounded history search RPCs');
console.log('PASS client validates revision/query/limit inputs and preserves backend authorization failures');
console.log('BUSINESS_S2B_CONTINUITY_CLIENT=PASS');
