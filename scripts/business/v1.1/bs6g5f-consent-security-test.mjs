import assert from 'node:assert/strict';
import {createPreviewServer,csp} from './bs6g5f-consent-preview-server.mjs';
import {validateConsentDetails,validateReturnedRedirect} from './bs6g5f-consent-policy.mjs';
import {inspectConsent,decideConsent} from './bs6g5f-consent-flow.mjs';

const projectRef='hjgerbyofaxyfqdckret';
const config={projectRef,clientId:'03fa131d-bc78-4e9b-85e8-7fba9a22ca90',
  redirectUri:'https://chatgpt.example.invalid/connector/callback'};
const authorizationId='auth_abcdEFGH_12345';
const details={authorization_id:authorizationId,
 redirect_uri:config.redirectUri,client:{id:config.clientId,name:'ReadOnly test'},
 scope:'openid email profile'};
assert.equal(validateConsentDetails(details,config,authorizationId).validated,true);
assert.throws(()=>validateConsentDetails({...details,client:{id:'other'}},config,authorizationId),/BS6G5F_CLIENT_OR_REDIRECT_MISMATCH/);
assert.throws(()=>validateConsentDetails({...details,redirect_uri:'https://attacker.invalid'},config,authorizationId),/BS6G5F_CLIENT_OR_REDIRECT_MISMATCH/);
for(const scope of ['openid email write','email profile','openid openid']){
 assert.throws(()=>validateConsentDetails({...details,scope},config,authorizationId),/BS6G5F_SCOPE_NOT_ALLOWED/);
}
assert.throws(()=>validateConsentDetails(details,{...config,clientId:''},authorizationId),/BS6G5F_EXACT_CLIENT_UNSET/);
assert.throws(()=>validateConsentDetails(details,config,'evil'),/BS6G5F_AUTHORIZATION_ID_INVALID/);
const callback=config.redirectUri+'?code=redacted&state=redacted';
assert.equal(validateReturnedRedirect(callback,config.redirectUri),true);
for(const target of [
 'https://attacker.invalid/connector/callback?code=x',
 config.redirectUri+'/other?code=x',config.redirectUri+'?state=x',
 'http://chatgpt.example.invalid/connector/callback?code=x'
])assert.throws(()=>validateReturnedRedirect(target,config.redirectUri),
 /BS6G5F_RESPONSE_(REDIRECT_MISMATCH|MISSING_RESULT)/);

let detailsCalls=0, decisionCalls=0;
const makeClient=(overrides={})=>({
 auth:{
  getUser:async()=>({data:{user:{id:'user-1',is_anonymous:false}},error:null}),
  oauth:{
   getAuthorizationDetails:async()=>{detailsCalls++;return{data:details,error:null}},
   approveAuthorization:async()=>{decisionCalls++;return {data:{redirect_url:callback},error:null}},
   denyAuthorization:async()=>{decisionCalls++;return {data:{redirect_url:config.redirectUri+'?error=access_denied'},error:null}}
  }
 },
 rpc:async()=>({data:{organizationSlug:'release-org',role:'ADMIN',organizationInitialized:true},error:null}),
 ...overrides
});
const verified=await inspectConsent(makeClient(),authorizationId,config);
assert.equal(verified.validated,true);
assert.equal(detailsCalls,1);
assert.equal((await decideConsent(makeClient(),verified,'approve')).redirectUrl,callback);
assert.equal((await decideConsent(makeClient(),verified,'deny')).redirectUrl,config.redirectUri+'?error=access_denied');
assert.equal(decisionCalls,2);
assert.rejects(inspectConsent(makeClient(),authorizationId,{...config,clientId:''}),/BS6G5F_ALLOWLIST_ABSENT/);
let called=false;
const deniedAdmin=makeClient({rpc:async()=>({data:{organizationSlug:'release-org',role:'MEMBER'}})});
deniedAdmin.auth.oauth.getAuthorizationDetails=async()=>{called=true;return{data:details}};
await assert.rejects(inspectConsent(deniedAdmin,authorizationId,config),/BS6G5F_RELEASE_ORG_ADMIN_REQUIRED/);
assert.equal(called,false,'must deny nonadmin before OAuth details');
await assert.rejects(inspectConsent(makeClient({auth:{
 getUser:async()=>({data:{user:null},error:null}),
 oauth:{getAuthorizationDetails:async()=>{called=true}}
}}),authorizationId,config),/BS6G5F_LOGIN_REQUIRED/);
assert.rejects(decideConsent(makeClient(),null,'approve'),/BS6G5F_DECISION_NOT_AUTHORIZED/);
const server=createPreviewServer();
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
const addr='http://127.0.0.1:'+server.address().port;
try{
 const endpoints=['/oauth/consent','/assets/config.json','/assets/app.js','/assets/style.css','/assets/vendor/supabase.js','/healthz'];
 for(const path of endpoints){
  const r=await fetch(addr+path);
  assert.equal(r.status,200,path);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(r.headers.get('content-security-policy'),csp);
 }
 const page=await (await fetch(addr+'/oauth/consent')).text();
 const configResponse=await (await fetch(addr+'/assets/config.json')).json();
 assert.equal(configResponse.mode,'PREVIEW_ONLY');
 assert.equal(configResponse.authEnabled,false);
 assert.doesNotMatch(page,/id="signUp"|id="createAccount"|esm\.sh|unsafe-inline|<script[^>]+type="module"/i);
 assert.match(page,/<button id="approve" disabled>/);
 assert.match(page,/<button id="deny" disabled>/);
 assert.match(page,/<input id="password" type="password" disabled/);
 for(const path of ['/oauth/authorize','/mcp','/admin','/oauth/callback']){
  const r=await fetch(addr+path);
  assert.equal(r.status,404,path);
 }
 assert.equal((await fetch(addr+'/oauth/consent',{method:'POST'})).status,404);
}finally{await new Promise(ok=>server.close(ok))}
console.log('PASS B-S6G-5F preview-only local CSP/self-host vendor/no signup/no activation');
console.log('PASS B-S6G-5F exact client/redirect/scopes, ADMIN validation, explicit consent decision policies');
console.log('BUSINESS_BS6G5F_CONSENT_PREVIEW_CONTRACT=PASS');
