import assert from 'node:assert/strict';
import {BusinessSupabaseAuthSession} from './control/supabase-auth-session.mjs';

class TokenStore{
  constructor(value=null){this.value=value;this.writes=[];this.deletes=0;}
  read(){return this.value;}
  write(v){this.value=v;this.writes.push(v);}
  delete(){this.value=null;this.deletes++;}
}
const access=n=>'access-'+String(n).padEnd(30,'a');
const refresh=n=>'refresh-'+String(n).padEnd(30,'r');
const session=(n,expiresAt)=>({access_token:access(n),refresh_token:refresh(n),expires_at:expiresAt});

let nowMs=1_000_000;
let signIns=0,refreshes=0,signOuts=0;
const rpcCalls=[];
const fakeClient={
  auth:{
    async signInWithPassword({email,password}){
      signIns++;
      assert.equal(email,'member@example.test');
      assert.equal(password,'correct horse battery staple');
      return {data:{session:{access_token:access(1),refresh_token:'first-refresh-token',expires_in:1000}},error:null};
    },
    async refreshSession({refresh_token}){
      refreshes++;
      assert.equal(typeof refresh_token,'string');
      await new Promise(resolve=>setTimeout(resolve,20));
      return {data:{session:session(refreshes+1,4000+refreshes)},error:null};
    },
    async signOut({scope}){signOuts++;assert.equal(scope,'local');return {error:null};}
  },
  async rpc(name,args){
    rpcCalls.push({name,args});
    return {data:{id:'prf_test',nickname:'ChatAgent Business'},error:null};
  }
};
const clientFactory=(url,key,options)=>{
  assert.equal(url,'https://abcdefghijklmnopqrst.supabase.co');
  assert.match(key,/^sb_publishable_/);
  assert.deepEqual(options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});
  return fakeClient;
};

const store=new TokenStore();
const auth=new BusinessSupabaseAuthSession({
  url:'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey:'sb_publishable_'+('x'.repeat(32)),
  tokenStore:store,clientFactory,now:()=>nowMs
});
const connected=await auth.connectWithPassword({
  email:'member@example.test',password:'correct horse battery staple'
});
assert.equal(signIns,1);
assert.equal(store.value,'first-refresh-token');
assert.equal(connected.expires_at,2000);
assert.equal(await auth.ensureSession(),connected);
assert.equal(refreshes,0);

nowMs=1_950_000;
const concurrent=await Promise.all(Array.from({length:8},()=>auth.ensureSession()));
assert.equal(refreshes,1,'concurrent callers must share one refresh');
assert.equal(new Set(concurrent.map(x=>x.refresh_token)).size,1);
assert.equal(store.value,refresh(2));

const profile=await auth.rpc('bc_member_profile');
assert.equal(profile.data.id,'prf_test');
assert.deepEqual(rpcCalls,[{name:'bc_member_profile',args:{}}]);
await assert.rejects(()=>auth.rpc('pm_device_list'),/BUSINESS_BACKEND_CONFIG_INVALID/);

const signedOut=await auth.signOutLocal();
assert.deepEqual(signedOut,{localCleared:true,remoteSignOut:true});
assert.equal(signOuts,1);
assert.equal(store.value,null);
assert.equal(store.deletes,1);

const restoreStore=new TokenStore('restore-token');
const restoreAuth=new BusinessSupabaseAuthSession({
  url:'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey:'sb_publishable_'+('y'.repeat(32)),
  tokenStore:restoreStore,clientFactory,now:()=>0
});
const restored=await restoreAuth.restore();
assert.ok(restored.refresh_token.startsWith('refresh-'));
assert.equal(restoreStore.value,restored.refresh_token);

// Exercise the default supabase-js/direct HTTP transport without exposing refresh tokens to RPCs.
const calls=[];
const fetchImpl=async(input,init={})=>{
  calls.push({url:String(input),headers:init.headers,body:init.body});
  if(String(input).includes('/rest/v1/rpc/bc_member_profile')){
    return new Response(JSON.stringify({id:'prf_direct',nickname:'ChatAgent Business'}),{status:200,headers:{'content-type':'application/json'}});
  }
  throw Error('UNEXPECTED_URL');
};
const directStore=new TokenStore();
const direct=new BusinessSupabaseAuthSession({
  url:'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey:'sb_publishable_'+('z'.repeat(32)),
  tokenStore:directStore,fetchImpl,now:()=>0
});
direct.accept({access_token:access(9),refresh_token:'direct-refresh-token',expires_at:9999});
const directProfile=await direct.rpc('bc_member_profile');
assert.equal(directProfile.data.id,'prf_direct');
assert.equal(calls.length,1);
assert.equal(calls[0].headers.Authorization,'Bearer '+access(9));
assert.ok(!JSON.stringify(calls[0]).includes('direct-refresh-token'),'refresh token must not enter RPC request');

console.log('PASS Personal-derived Supabase auth session preserves bounded connect/restore/refresh/sign-out behavior');
console.log('PASS eight concurrent refresh callers serialize to exactly one refresh-token rotation');
console.log('PASS Business RPC namespace is bc_* only and direct RPC sends access token, never refresh token');
console.log('BUSINESS_S1B_AUTH_RUNTIME=PASS');
