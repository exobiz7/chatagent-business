import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateStagingAdmission} from './bs6g5e-external-admission-verifier.mjs';
const baseline=JSON.parse(readFileSync(
  'docs/verification/v1.1/B_S6G5E_EXTERNAL_OAUTH_ADMISSION_EVIDENCE_20261105.json','utf8'));
const x=validateStagingAdmission(baseline);
assert.equal(x.verdict,'BLOCKED_OAUTH_DISCOVERY');
assert.equal(x.externalStagingAcceptanceComplete,false);
assert.equal(x.productionCutoverAuthorized,false);
assert.equal(x.appRepublishAuthorized,false);
assert.equal(x.importAuthorized,false);
assert.equal(x.explicitOwnerStagingApprovalPresent,false);
const all=structuredClone(baseline);
Object.assign(all.oauth,{
 authorizationServerStatus:200,metadataValidated:true,oidcStatus:200,
 oidcValidated:true,pkceS256:true
});
Object.assign(all.staging,{
 httpsOriginVerified:true,tlsVerified:true,oneReadOnlyToolOnly:true,
 unauthorizedBearerDenied:true,actualConsentUiVerified:true,
 isolationFromV1Verified:true
});
Object.assign(all.businessAccount,{
 newAppIdentityVerified:true,exactWorkspaceVerified:true,
 oauthAuthorizationCodeFlowVerified:true,pluginToolCallVerified:true
});
assert.equal(validateStagingAdmission(all).verdict,
  'PENDING_EXPLICIT_OWNER_STAGING_APPROVAL');
all.owner.explicitStagingPublishApproval=true;
const simulated=validateStagingAdmission(all);
assert.equal(simulated.verdict,'STAGING_EVIDENCE_REQUIRES_INDEPENDENT_REVIEW');
assert.equal(simulated.externalStagingAcceptanceComplete,true);
assert.equal(simulated.productionCutoverAuthorized,false);
assert.equal(simulated.importAuthorized,false);
assert.equal(simulated.appRepublishAuthorized,false);
for(const path of ['productionV1Unchanged','productionCutoverStarted','productionImportPerformed']){
 const forged=structuredClone(all);
 forged[path]=path==='productionV1Unchanged'?false:true;
 assert.throws(()=>validateStagingAdmission(forged),/B_S6G5E_EVIDENCE_INVALID/);
}
assert.throws(()=>validateStagingAdmission({
 ...baseline,projectRef:'different-project'
}),/B_S6G5E_EVIDENCE_INVALID/);
assert.throws(()=>validateStagingAdmission({
 ...baseline,businessAccount:undefined
}),/B_S6G5E_EVIDENCE_INCOMPLETE/);
const code=readFileSync('scripts/business/v1.1/bs6g5e-external-admission-verifier.mjs','utf8');
assert.doesNotMatch(code,/(spawn\(|exec\(|POST|put\(|delete\(|createProject|setAuthConfig|deploy)/);
console.log('PASS B-S6G-5E exact target and independent staging approval evidence validator');
console.log('PASS B-S6G-5E forged source/cutover never unlocks import, app republish or cutover');
console.log('BUSINESS_BS6G5E_ADMISSION_CONTRACT=PASS');
