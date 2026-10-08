import assert from 'node:assert/strict';
import {createBusinessContinuityRpcSession} from './continuity/business-continuity-rpc-session.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';

const projectId='dev';
const taskId='40000000-0000-4000-8000-000000000002';
const calls=[];
const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  const name=url.split('/').at(-1);
  const args=JSON.parse(options.body);
  let data;
  if(name==='bc_member_profile')data={organizationSlug:'acme'};
  else if(name==='bc_task_get')data={contextSeq:3,integrityVerified:true,task:{taskId,projectId,objective:'Live continuity',status:'ACTIVE',revision:1,startedAt:'2026-10-07T00:00:00Z',completedAt:null},checkpoints:[]};
  else if(name==='bc_project_context')data={projectId,contextSeq:3,integrityVerified:true,tasks:[]};
  else if(name==='bc_history_search')data={projectId,query:args.p_query,contextSeq:3,matches:[]};
  else throw Error('UNEXPECTED_RPC');
  return {ok:true,status:200,async text(){return JSON.stringify(data);}};
};
const authSession=createBusinessContinuityRpcSession({supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture_value_1234567890',accessToken:'oauth-access-fixture',fetchImpl});
const store=new SupabaseBusinessContinuityStore({authSession});
const context=await store.getContext({projectId});
assert.equal(context.freshness,'FRESH');
const handoff=await store.prepareHandoff({projectId,taskId});
assert.equal(handoff.freshness,'FRESH');assert.match(handoff.contextDigest,/^sha256:[a-f0-9]{64}$/);
await store.historySearch({projectId,query:'history',limit:5});
for(const c of calls){
  assert.equal(c.options.headers.apikey,'sb_publishable_fixture_value_1234567890');
  assert.equal(c.options.headers.authorization,'Bearer oauth-access-fixture');
  assert.equal(String(c.options.body).includes('refresh'),false);
  assert.match(c.url,/\/rest\/v1\/rpc\/bc_/);
}
const history=calls.find(c=>c.url.endsWith('/bc_history_search'));
assert.deepEqual(JSON.parse(history.options.body),{p_project_key:'dev',p_query:'history',p_limit:5});
console.log('PASS live continuity adapter forwards only OAuth access token + publishable key to bounded bc_* RPCs');
console.log('PASS public project key is preserved through context/handoff/history without caller UUID authority');
console.log('BUSINESS_S2C_LIVE_CONTINUITY_ADAPTER=PASS');
