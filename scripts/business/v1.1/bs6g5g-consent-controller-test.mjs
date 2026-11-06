import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConsentController} from './bs6g5g-consent-controller.mjs';
import {evaluateStagingTopology,protectedSiteUrlChangeRisk} from './bs6g5g-staging-topology.mjs';

const cfg={projectRef:'hjgerbyofaxyfqdckret',
 clientId:'03fa131d-bc78-4e9b-85e8-7fba9a22ca90',
 redirectUri:'https://chatgpt.example.invalid/connector/callback'};
const aid='auth_A1234567890';
const detail={authorization_id:aid,client:{id:cfg.clientId,name:'Read Only'},
 redirect_uri:cfg.redirectUri,scope:'openid email profile'};
const stats=()=>({getUser:0,login:0,rpc:0,details:0,approve:0,deny:0});
const makeClient=(m={})=>{
 const counter=stats();
 const client={
  auth:{
   getUser:async()=>{counter.getUser++;return{data:{user:{id:'fixture-id',is_anonymous:false}},error:null}},
   signInWithPassword:async()=>{counter.login++;return{error:null}},
   oauth:{
    getAuthorizationDetails:async()=>{counter.details++;return {data:detail,error:null}},
    approveAuthorization:async()=>{counter.approve++;return {data:{redirect_url:cfg.redirectUri+'?code=fixture&state=s1'},error:null}},
    denyAuthorization:async()=>{counter.deny++;return {data:{redirect_url:cfg.redirectUri+'?error=access_denied&state=s1'},error:null}}
   }
  },
  rpc:async()=>{counter.rpc++;return {data:{organizationSlug:'release-org',role:'ADMIN',organizationInitialized:true},error:null}}
 };
 if(m.role)client.rpc=async()=>{counter.rpc++;return {data:{organizationSlug:'release-org',role:m.role,organizationInitialized:true},error:null}};
 if(m.badRedirect)client.auth.oauth.getAuthorizationDetails=async()=>{counter.details++;return {data:{...detail,redirect_uri:'https://attacker.invalid/callback'},error:null}};
 return {client,counter};
};
{
 const {client,counter}=makeClient();
 const c=createConsentController({client,allowlist:cfg,authorizationId:aid});
 assert.equal(c.phase,'LOCKED');
 await assert.rejects(c.decide('approve'),/BS6G5G_NOT_REVIEWED_OR_ALREADY_USED/);
 const r=await c.inspect();
 assert.equal(r.phase,'REVIEW');
 assert.equal(r.redirectUri,cfg.redirectUri);
 assert.deepEqual(r.scopes,['openid','email','profile']);
 assert.equal(counter.details,1);
 const result=await c.decide('approve');
 assert.equal(result.phase,'REDIRECT_VALIDATED');
 assert.equal(counter.approve,1);
 assert.equal(counter.deny,0);
 await assert.rejects(c.decide('approve'),/BS6G5G_NOT_REVIEWED_OR_ALREADY_USED/);
 await assert.rejects(c.inspect(),/BS6G5G_ALREADY_DECIDED/);
 assert.equal(counter.approve,1);
}
{
 const {client,counter}=makeClient();
 const c=createConsentController({client,allowlist:cfg,authorizationId:aid});
 await c.login({email:'fixture@example.invalid',password:'not-a-real-password'});
 assert.equal(counter.login,1);
 assert.equal(c.phase,'LOGGED_IN');
 await c.inspect();
 const denied=await c.decide('deny');
 assert.match(denied.redirectUrl,/error=access_denied/);
 assert.equal(counter.deny,1);
 assert.equal(counter.approve,0);
}
{
 const {client,counter}=makeClient({role:'MEMBER'});
 const c=createConsentController({client,allowlist:cfg,authorizationId:aid});
 await assert.rejects(c.inspect(),/BS6G5F_RELEASE_ORG_ADMIN_REQUIRED/);
 assert.equal(counter.details,0);
 assert.equal(c.phase,'LOCKED');
}
{
 const {client,counter}=makeClient({badRedirect:true});
 const c=createConsentController({client,allowlist:cfg,authorizationId:aid});
 await assert.rejects(c.inspect(),/BS6G5F_CLIENT_OR_REDIRECT_MISMATCH/);
 assert.equal(counter.approve,0);
}
{
 const {client,counter}=makeClient();
 const c=createConsentController({client,allowlist:cfg,authorizationId:aid});
 await assert.rejects(c.login({email:'x',password:'short'}),/BS6G5G_CREDENTIAL_FORMAT_INVALID/);
 assert.equal(counter.login,0);
}
assert.throws(()=>createConsentController({client:makeClient().client,
 allowlist:{...cfg,clientId:null},authorizationId:aid}),/BS6G5G_CONTROLLER_CONFIG_INCOMPLETE/);
const base={
 schemaVersion:1,purpose:'B-S6G-5G_CONSENT_STAGING',projectRef:cfg.projectRef,
 siteUrl:null,oauthClientId:null,redirectUri:null,
 productionV1Unchanged:true,productionCutoverApproved:false,paidServicesApproved:false
};
assert.equal(evaluateStagingTopology(base).status,'PENDING_EXACT_HTTPS_AND_CLIENT');
const submitted=JSON.parse(readFileSync(
 'docs/verification/v1.1/B_S6G5G_STAGING_ADMISSION_PLAN_20261106.json','utf8'));
assert.equal(evaluateStagingTopology(submitted).status,'PENDING_EXACT_HTTPS_AND_CLIENT');
assert.equal(submitted.supabaseOauthServerEnabled,false);
assert.equal(submitted.publicGatewayOrConsentDeployed,false);
const candidate={...base,siteUrl:'https://stage.example.com',
 oauthClientId:cfg.clientId,redirectUri:'https://callback.example.com/oauth/chatgpt',
 authorizationPath:'/oauth/consent',dynamicOAuthAppsEnabled:false,
 externalTlsVerified:false,consentUiBrowserIntegrationVerified:false,
 callbackRegisteredVerified:false,crossApplicationSiteUrlImpactReviewed:false,isolationFromV1Verified:false,
 ownerStagingApprovalRecorded:false};
assert.equal(evaluateStagingTopology(candidate).status,'PENDING_STAGING_INDEPENDENT_REVIEW');
for(const changed of [
 {...candidate,siteUrl:'http://localhost:3000'},
 {...candidate,siteUrl:'https://localhost'},
 {...candidate,siteUrl:'https://staging.example.invalid'},
 {...candidate,siteUrl:'https://stage.example.com/prefix'},
 {...candidate,redirectUri:'https://callback.example.com/oauth/chatgpt?evil=yes'}
])assert.throws(()=>evaluateStagingTopology(changed),/BS6G5G_/);
assert.throws(()=>evaluateStagingTopology({...candidate,productionCutoverApproved:true}),
 /BS6G5G_TARGET_OR_GOVERNANCE_INVALID/);
const eligible=evaluateStagingTopology({...candidate,externalTlsVerified:true,
 consentUiBrowserIntegrationVerified:true,callbackRegisteredVerified:true,
 crossApplicationSiteUrlImpactReviewed:true,isolationFromV1Verified:true,ownerStagingApprovalRecorded:true});
assert.equal(eligible.status,'ELIGIBLE_FOR_SEPARATE_OWNER_CHANGE_APPROVAL');
assert.equal(eligible.siteUrlChangeAuthorized,false);
assert.equal(eligible.oauthEnableAuthorized,false);
assert.equal(eligible.appRegistrationAuthorized,false);
assert.equal(eligible.productionCutoverAuthorized,false);
assert.equal(protectedSiteUrlChangeRisk(base).affectsDefaultAuthRedirects,true);
console.log('PASS B-S6G-5G future exact-client consent sign-in/inspect/approve/deny state machine, non-ADMIN denial');
console.log('PASS B-S6G-5G site URL/redirect topology and explicit no-authority admission gates');
console.log('BUSINESS_BS6G5G_CONSENT_CONTROLLER_CONTRACT=PASS');
