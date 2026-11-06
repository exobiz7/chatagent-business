import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const projectRef='hjgerbyofaxyfqdckret';
const aid='auth_A1234567890',clientId='03fa131d-bc78-4e9b-85e8-7fba9a22ca90';
const redirectUri='https://chatgpt.example.invalid/connector/callback';
const prev={document:globalThis.document,location:globalThis.location,
 fetch:globalThis.fetch,supabase:globalThis.supabase};
const fields=['login','approve','deny','message','client','redirect','scopes','email','password'];
function mockDom(){
 const els=Object.fromEntries(fields.map(k=>[k,{disabled:true,value:'',textContent:'',
  handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}}]));
 globalThis.document={getElementById:id=>els[id]};
 return els;
}
const makeClient=()=>{
 let invoked=0;
 const client={
  auth:{
   getUser:async()=>({data:{user:{id:'synthetic',is_anonymous:false}},error:null}),
   signInWithPassword:async()=>{invoked++;return{data:{},error:null}},
   oauth:{
    getAuthorizationDetails:async()=>({data:{
      authorization_id:aid,redirect_uri:redirectUri,scope:'openid profile',
      client:{id:clientId,name:'Fixture Only'}},error:null}),
    approveAuthorization:async()=>({data:{redirect_url:redirectUri+'?code=synthetic&state=mock'},error:null}),
    denyAuthorization:async()=>({data:{redirect_url:redirectUri+'?error=access_denied&state=mock'},error:null})
   }
  },
  rpc:async()=>({data:{organizationSlug:'release-org',role:'ADMIN',organizationInitialized:true},error:null})
 };
 return {client,getCalls:()=>invoked};
};
try{
 let els=mockDom();
 globalThis.location={origin:'https://stage.example.com',
  href:'https://stage.example.com/oauth/consent?authorization_id='+aid,
  assign:()=>{throw Error('UNEXPECTED_REDIRECT');}};
 globalThis.supabase={createClient:()=>{throw Error('MUST_NOT_INSTANTIATE');}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({mode:'PREVIEW_ONLY'})});
 await import('./bs6g5g-consent-browser-candidate.mjs?case=blocked');
 await new Promise(ok=>setImmediate(ok));
 assert.equal(els.login.disabled,true);
 assert.equal(els.approve.disabled,true);
 assert.equal(els.deny.disabled,true);
 assert.match(els.message.textContent,/not enabled/i);

 els=mockDom();
 let redirected='',clientCount=0;
 const {client,getCalls}=makeClient();
 globalThis.location={origin:'https://stage.example.com',
  href:'https://stage.example.com/oauth/consent?authorization_id='+aid,
  assign:value=>{redirected=value;}};
 globalThis.supabase={createClient:(url,key,settings)=>{
   clientCount++;assert.equal(url,'https://'+projectRef+'.supabase.co');
   assert.equal(settings.auth.persistSession,false);
   assert.equal(settings.auth.autoRefreshToken,false);
   assert.equal(settings.auth.detectSessionInUrl,false);
   return client;
 }};
 globalThis.fetch=async()=>({ok:true,json:async()=>({
   mode:'OWNER_APPROVED_STAGING',externalOAuthReady:true,projectRef,
   siteUrl:'https://stage.example.com',authorizationPath:'/oauth/consent',
   clientId,redirectUri,publishableKey:'sb_pub_test_only'
 })});
 await import('./bs6g5g-consent-browser-candidate.mjs?case=accepted');
 await new Promise(ok=>setImmediate(ok));
 assert.equal(clientCount,1);
 assert.equal(getCalls(),0);
 assert.equal(els.approve.disabled,false);
 assert.equal(els.deny.disabled,false);
 assert.equal(els.login.disabled,true);
 assert.equal(redirected,'');
 assert.equal(els.client.textContent,'Fixture Only');
 await els.approve.handlers.click();
 assert.equal(redirected,redirectUri+'?code=synthetic&state=mock');
 assert.equal(els.approve.disabled,true);

 // No actual browser OAuth redirect or token exchanged: all mocks above.
 const code=readFileSync('scripts/business/v1.1/bs6g5g-consent-browser-candidate.mjs','utf8');
 const preview=readFileSync('scripts/business/v1.1/bs6g5f-consent-preview-server.mjs','utf8');
 assert.match(code,/persistSession:false/);
 assert.match(code,/detectSessionInUrl:false/);
 assert.match(code,/cfg\.mode!=='OWNER_APPROVED_STAGING'/);
 assert.doesNotMatch(code,/signUp\(|localStorage\.|console\.log\(/);
 assert.doesNotMatch(preview,/bs6g5g-consent-browser-candidate/);
 console.log('PASS B-S6G-5G unarmed browser controls deny instantiation and consent');
 console.log('PASS B-S6G-5G approved synthetic callback, no persistent auth session or automatic grant');
 console.log('BUSINESS_BS6G5G_BROWSER_CONSENT_CONTRACT=PASS');
}finally{
 for(const [k,v] of Object.entries(prev)){
  if(v===undefined)delete globalThis[k];else globalThis[k]=v;
 }
}
