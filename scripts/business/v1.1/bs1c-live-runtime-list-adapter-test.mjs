import assert from 'node:assert/strict';
import {fetchBusinessRuntimeList} from './control/business-runtime-list-rpc.mjs';

const access='a'.repeat(48);
const pub='sb_publishable_'+('x'.repeat(32));
const calls=[];
const fetchImpl=async(input,init={})=>{
  calls.push({input:String(input),headers:init.headers,body:init.body});
  return {ok:true,status:200,async json(){return {
    count:2,
    nodes:[
      {nodeId:'30000000-0000-4000-8000-000000000001',nodeName:'Mac Studio',nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false,lastSeenAt:'2026-10-07T00:00:00Z',leaseExpiresAt:'2026-10-07T00:05:00Z',secret:'drop'},
      {nodeId:'30000000-0000-4000-8000-000000000002',nodeName:'Shared Mac',nodeType:'SHARED_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false}
    ]
  };}};
};

const listed=await fetchBusinessRuntimeList({
  supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:pub,accessToken:access,fetchImpl,limit:1
});
assert.equal(listed.count,1);
assert.equal(listed.nodes.length,1);
assert.equal(listed.nodes[0].ownedByCaller,true);
assert.equal('secret' in listed.nodes[0],false);
assert.match(calls[0].input,/\/rest\/v1\/rpc\/bc_runtime_list$/);
assert.equal(calls[0].headers.Authorization,'Bearer '+access);
assert.equal(calls[0].headers.apikey,pub);
assert.equal(calls[0].body,'{}');
assert.ok(!JSON.stringify(calls).includes('refresh_token'));

await assert.rejects(()=>fetchBusinessRuntimeList({
  supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:pub,accessToken:access,
  fetchImpl:async()=>({ok:true,status:200,async json(){return {count:1,nodes:[{nodeId:'bad'}]};}})
}),/BUSINESS_RUNTIME_LIST_RPC_INVALID_RESPONSE/);

console.log('PASS runtime-list adapter forwards OAuth access token only to authenticated bc_runtime_list RPC');
console.log('PASS adapter bounds results, strips non-contract fields and rejects malformed node records');
console.log('BUSINESS_S1C_LIVE_RUNTIME_LIST_ADAPTER=PASS');
