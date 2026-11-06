#!/usr/bin/env node
// B-S6G-5H evidence validator only. NEVER performs remote writes, registration or publication.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const PROJECT_REF='hjgerbyofaxyfqdckret';
const fail=c=>{throw Error(c)};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function httpsOrigin(value){
  if(typeof value!=='string')return false;
  let u;try{u=new URL(value)}catch{return false}
  return u.protocol==='https:'&&u.origin===value&&u.username===''&&
    u.password===''&&!u.search&&!u.hash&&!u.pathname.slice(1)&&
    !['localhost','127.0.0.1'].includes(u.hostname)&&
    !u.hostname.endsWith('.invalid')&&!u.hostname.endsWith('.localhost');
}
function exactChatGptCallback(value){
  if(typeof value!=='string')return false;
  let u;try{u=new URL(value)}catch{return false}
  return u.protocol==='https:'&&u.hostname==='chatgpt.com'&&
    u.port===''&&u.username===''&&u.password===''&&
    !u.search&&!u.hash&&/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname);
}
const need=(b,s,arr)=>{if(!b)arr.push(s);};
export function inspectHostingAndOAuthEvidence(plan){
  if(!plan||plan.schemaVersion!==1||plan.purpose!=='B-S6G-5H_HOSTING_OAUTH_ADMISSION'||
     plan.projectRef!==PROJECT_REF||plan.productionV1Unchanged!==true||
     plan.productionCutoverApproved!==false||plan.migrationAuthorized!==false||
     plan.externalDeploymentAuthorized!==false||plan.oauthChangesAuthorized!==false)
    fail('B_S6G5H_GOVERNANCE_INVALID');
  if(!plan.host||!plan.oauth||!plan.client||!plan.gateway||!plan.owner)
    fail('B_S6G5H_EVIDENCE_INCOMPLETE');
  const blockers=[];
  need(plan.host.provider==='netlify'&&plan.host.plan==='free'&&
    plan.host.separateDedicatedSite===true&&plan.host.reuseOtherProject===false,
    'ISOLATED_ZERO_COST_SITE_REQUIRED',blockers);
  need(httpsOrigin(plan.host.origin)&&plan.host.verifiedSiteOwner===true&&
    plan.host.tlsAndConsentPathVerified===true,'HOST_ORIGIN_UNVERIFIED',blockers);
  need(plan.host.noAutomaticBillableUpgrade===true,
    'FREE_TIER_SPENDING_GUARD_UNVERIFIED',blockers);
  need(plan.oauth.siteUrlPersistedReadVerified===true&&
    plan.oauth.configuredSiteOrigin===plan.host.origin&&
    plan.oauth.globalRedirectImpactReviewed===true&&
    plan.oauth.passwordRecoveryAndConfirmationReviewed===true&&
    plan.oauth.currentSiteUrlChangeRollbackReviewed===true,
    'GLOBAL_AUTH_SITE_URL_IMPACT_UNREVIEWED',blockers);
  need(plan.oauth.authorizationPath==='/oauth/consent'&&
    plan.oauth.authorizationServerDiscoveryVerified===true&&
    plan.oauth.pkceS256Verified===true&&plan.oauth.exactIssuerVerified===true,
    'OAUTH_DISCOVERY_AND_PKCE_UNPROVEN',blockers);
  // The OpenAI client may use CIMD, DCR, or a predefined client; do not
  // assert that Supabase supports CIMD or DCR until its real discovery proves it.
  const mode=plan.client.mode;
  need(['predefined','dcr','cimd'].includes(mode),
    'CLIENT_REGISTRATION_MODE_UNSELECTED',blockers);
  if(mode==='predefined'){
    need(uuid.test(plan.client.id??'')&&exactChatGptCallback(plan.client.callback)&&
      plan.client.preRegisteredWithExactCallback===true&&
      plan.client.chatGptConfiguredPredefinedId===true,
      'PREDEFINED_CLIENT_NOT_CONFIGURED',blockers);
  }else if(mode==='dcr'){
    need(plan.client.dcrSupportedByDiscovery===true&&
      plan.client.ownerSecurityApprovalForOpenRegistration===true&&
      plan.client.redirectDomainPolicyReviewed===true&&
      uuid.test(plan.client.id??'')&&exactChatGptCallback(plan.client.callback)&&
      plan.client.registeredIdAndCallbackObserved===true,
      'DCR_CLIENT_OR_SECURITY_APPROVAL_MISSING',blockers);
  }else if(mode==='cimd'){
    need(plan.client.cimdSupportedByDiscovery===true&&
      plan.client.ownerCimdApproval===true&&
      plan.client.consentPolicySupportsUrlClientId===true&&
      exactChatGptCallback(plan.client.callback),
      'CIMD_SUPPORT_UNVERIFIED',blockers);
  }
  need(httpsOrigin(plan.gateway.resourceOrigin)&&plan.gateway.oneReadOnlyToolVerified===true&&
    plan.gateway.independentFromV1===true&&plan.gateway.clientIdScoped===true&&
    plan.gateway.resourceAudienceBound===true,
    'MCP_RESOURCE_AUDIENCE_AND_CLIENT_BINDING_UNVERIFIED',blockers);
  // Supabase OAuth access token aud defaults to "authenticated"; client_id
  // alone does not establish RFC 8707 resource audience binding.
  need(plan.gateway.oauthResourceParamEchoVerified===true&&
    plan.gateway.oauthTokenIssuanceAudienceVerified===true,
    'RESOURCE_PARAMETER_TO_JWT_AUDIENCE_UNVERIFIED',blockers);
  need(plan.owner.approvedExternalStagingOnly===true&&
    plan.owner.businessAccountAppIdentityReviewed===true&&
    plan.owner.actualWorkspaceConsentFlowObserved===true,
    'OWNER_AND_BUSINESS_WORKSPACE_E2E_PENDING',blockers);
  return Object.freeze({
    decision:blockers.length?'BLOCKED_PREPUBLICATION':'EVIDENCE_REVIEW_REQUIRED',
    blockers,isolatedSiteSelected:plan.host.provider==='netlify',
    oauthRegistrationMode:mode??null,
    stagingPublicationAuthorized:false,oauthSettingsModificationAuthorized:false,
    appRegistrationAuthorized:false,importAuthorized:false,
    productionCutoverAuthorized:false
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!args[0].startsWith('--evidence='))
      fail('B_S6G5H_ARGS_INVALID');
    const result=inspectHostingAndOAuthEvidence(
      JSON.parse(readFileSync(args[0].slice('--evidence='.length),'utf8')));
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(e){
    const code=/^B_S6G5H_[A-Z_]+$/.test(String(e.message))?e.message:'B_S6G5H_SAFE_FAILURE';
    process.stderr.write(JSON.stringify({code,status:'FAIL'})+'\n');
    process.exitCode=1;
  }
}
