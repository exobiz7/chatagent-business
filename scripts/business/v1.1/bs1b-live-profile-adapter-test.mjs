import assert from 'node:assert/strict';
import {fetchBusinessMemberProfile} from './control/business-member-profile-rpc.mjs';

const token='access-'+('a'.repeat(48));
const key='sb_publishable_'+('p'.repeat(32));
const calls=[];
const profile=await fetchBusinessMemberProfile({
  supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey:key,accessToken:token,
  fetchImpl:async(input,init)=>{
    calls.push({input:String(input),init});
    return new Response(JSON.stringify({
      id:'prf_'+'f'.repeat(32),
      email:'member@example.test',
      nickname:'ChatAgent Business',
      ignoredAuthorityField:'must-not-forward'
    }),{status:200,headers:{'content-type':'application/json'}});
  }
});
assert.deepEqual(profile,{
  id:'prf_'+'f'.repeat(32),email:'member@example.test',nickname:'ChatAgent Business'
});
assert.equal(calls.length,1);
assert.match(calls[0].input,/\/rest\/v1\/rpc\/bc_member_profile$/);
assert.equal(calls[0].init.headers.apikey,key);
assert.equal(calls[0].init.headers.Authorization,'Bearer '+token);
assert.equal(calls[0].init.body,'{}');
assert.ok(!JSON.stringify(profile).includes(token));

await assert.rejects(()=>fetchBusinessMemberProfile({
  supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:key,accessToken:token,
  fetchImpl:async()=>new Response('{}',{status:401})
}),/BUSINESS_PROFILE_RPC_UNAUTHORIZED/);
await assert.rejects(()=>fetchBusinessMemberProfile({
  supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_secret_forbidden',accessToken:token
}),/BUSINESS_PROFILE_RPC_CONFIG_INVALID/);

console.log('PASS member profile adapter forwards OAuth access token only to authenticated bc_member_profile RPC');
console.log('PASS adapter accepts publishable key only, strips non-profile response fields and fails closed');
console.log('BUSINESS_S1B_LIVE_PROFILE_ADAPTER=PASS');
