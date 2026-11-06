import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectHostingAndOAuthEvidence} from './bs6g5h-hosting-and-oauth-admission.mjs';

const given=JSON.parse(readFileSync('docs/verification/v1.1/B_S6G5H_HOSTING_OAUTH_EVIDENCE_20261106.json','utf8'));
const before=inspectHostingAndOAuthEvidence(given);
assert.equal(before.decision,'BLOCKED_PREPUBLICATION');
assert.equal(before.isolatedSiteSelected,true);
assert.equal(before.oauthRegistrationMode,null);
assert.equal(before.productionCutoverAuthorized,false);
assert.equal(before.stagingPublicationAuthorized,false);
assert.equal(before.appRegistrationAuthorized,false);
assert.ok(before.blockers.includes('HOST_ORIGIN_UNVERIFIED'));
assert.ok(before.blockers.includes('FREE_TIER_SPENDING_GUARD_UNVERIFIED'));
assert.ok(before.blockers.includes('CLIENT_REGISTRATION_MODE_UNSELECTED'));
assert.ok(before.blockers.includes('MCP_RESOURCE_AUDIENCE_AND_CLIENT_BINDING_UNVERIFIED'));
assert.ok(before.blockers.includes('RESOURCE_PARAMETER_TO_JWT_AUDIENCE_UNVERIFIED'));

const all=structuredClone(given);
Object.assign(all.host,{origin:'https://fixture-consent.netlify.app',
 verifiedSiteOwner:true,tlsAndConsentPathVerified:true,noAutomaticBillableUpgrade:true});
Object.assign(all.oauth,{siteUrlPersistedReadVerified:true,globalRedirectImpactReviewed:true,
 passwordRecoveryAndConfirmationReviewed:true,currentSiteUrlChangeRollbackReviewed:true,
 configuredSiteOrigin:'https://fixture-consent.netlify.app',
 authorizationServerDiscoveryVerified:true,pkceS256Verified:true});
Object.assign(all.client,{mode:'predefined',id:'9a8b7c6d-5e4f-4a2b-9c0d-9e8f7a6b5c4d',
 callback:'https://chatgpt.com/connector/oauth/fixtureCallback123',
 preRegisteredWithExactCallback:true,chatGptConfiguredPredefinedId:true});
Object.assign(all.gateway,{resourceOrigin:'https://fixture-gateway.example.com',
 oneReadOnlyToolVerified:true,clientIdScoped:true,resourceAudienceBound:true,
 oauthResourceParamEchoVerified:true,oauthTokenIssuanceAudienceVerified:true});
Object.assign(all.owner,{approvedExternalStagingOnly:true,
 businessAccountAppIdentityReviewed:true,actualWorkspaceConsentFlowObserved:true});
const ready=inspectHostingAndOAuthEvidence(all);
assert.equal(ready.decision,'EVIDENCE_REVIEW_REQUIRED');
assert.equal(ready.blockers.length,0);
for(const k of ['stagingPublicationAuthorized','oauthSettingsModificationAuthorized',
  'appRegistrationAuthorized','importAuthorized','productionCutoverAuthorized'])
 assert.equal(ready[k],false,k);
for(const [change,blocker] of [
  [{host:{...all.host,origin:'http://fixture-consent.netlify.app'}},'HOST_ORIGIN_UNVERIFIED'],
  [{host:{...all.host,origin:'https://fixture-consent.netlify.app/consent'}},'HOST_ORIGIN_UNVERIFIED'],
  [{client:{...all.client,callback:'https://evil.example/oauth/redirect'}},'PREDEFINED_CLIENT_NOT_CONFIGURED'],
  [{client:{...all.client,callback:'https://chatgpt.com/connector_platform_oauth_redirect'}},'PREDEFINED_CLIENT_NOT_CONFIGURED'],
  [{gateway:{...all.gateway,resourceAudienceBound:false}},'MCP_RESOURCE_AUDIENCE_AND_CLIENT_BINDING_UNVERIFIED'],
  [{gateway:{...all.gateway,oauthTokenIssuanceAudienceVerified:false}},'RESOURCE_PARAMETER_TO_JWT_AUDIENCE_UNVERIFIED'],
  [{oauth:{...all.oauth,globalRedirectImpactReviewed:false}},'GLOBAL_AUTH_SITE_URL_IMPACT_UNREVIEWED'],
  [{oauth:{...all.oauth,configuredSiteOrigin:'https://wrong.example.com'}},'GLOBAL_AUTH_SITE_URL_IMPACT_UNREVIEWED']
]){
 const y=inspectHostingAndOAuthEvidence({...all,...change});
 assert.equal(y.decision,'BLOCKED_PREPUBLICATION');
 assert.ok(y.blockers.includes(blocker),blocker);
}
const dcr=structuredClone(all);
Object.assign(dcr.client,{mode:'dcr',dcrSupportedByDiscovery:false,
 ownerSecurityApprovalForOpenRegistration:false,redirectDomainPolicyReviewed:false,
 registeredIdAndCallbackObserved:false});
assert.ok(inspectHostingAndOAuthEvidence(dcr).blockers.includes('DCR_CLIENT_OR_SECURITY_APPROVAL_MISSING'));
Object.assign(dcr.client,{dcrSupportedByDiscovery:true,ownerSecurityApprovalForOpenRegistration:true,
 redirectDomainPolicyReviewed:true,registeredIdAndCallbackObserved:true});
assert.equal(inspectHostingAndOAuthEvidence(dcr).decision,'EVIDENCE_REVIEW_REQUIRED');
const cimd=structuredClone(all);
cimd.client.mode='cimd';
assert.ok(inspectHostingAndOAuthEvidence(cimd).blockers.includes('CIMD_SUPPORT_UNVERIFIED'));
for(const change of [
 {...all,productionCutoverApproved:true},
 {...all,externalDeploymentAuthorized:true},
 {...all,oauthChangesAuthorized:true},
 {...all,host:{...all.host,reuseOtherProject:true}}
]){
 if(change.host?.reuseOtherProject)assert.ok(inspectHostingAndOAuthEvidence(change).blockers.includes('ISOLATED_ZERO_COST_SITE_REQUIRED'));
 else assert.throws(()=>inspectHostingAndOAuthEvidence(change),/B_S6G5H_GOVERNANCE_INVALID/);
}
console.log('PASS B-S6G-5H independent free-site choice and current missing-host/client/callback blocks');
console.log('PASS B-S6G-5H predefined/DCR/CIMD safeguards and scoped resource-audience binding');
console.log('PASS B-S6G-5H even hypothetical fully green state never authorizes external writes/cutover');
console.log('BUSINESS_BS6G5H_HOSTING_OAUTH_CONTRACT=PASS');
