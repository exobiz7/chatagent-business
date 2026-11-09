#!/usr/bin/env node
// B-S6G-5E supporting pre-publication decision validator; NEVER grants authority.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=code=>{throw Error(code);};
export function validateStagingAdmission(e){
  if(!e||e.schemaVersion!==1||
    e.purpose!=='EXTERNAL_STAGING_ADMISSION_ONLY'||
    e.projectRef!=='hjgerbyofaxyfqdckret'||
    e.environment!=='ISOLATED_STAGING_NOT_V1_PRODUCTION' ||
    e.productionV1Unchanged!==true ||
    e.productionCutoverStarted!==false ||
    e.productionImportPerformed!==false)
    fail('B_S6G5E_EVIDENCE_INVALID');
  if(!e.oauth||!e.staging||!e.businessAccount||!e.owner)
    fail('B_S6G5E_EVIDENCE_INCOMPLETE');
  const discovery=e.oauth.authorizationServerStatus===200 &&
    e.oauth.metadataValidated===true &&e.oauth.oidcStatus===200 &&
    e.oauth.oidcValidated===true && e.oauth.pkceS256===true;
  const external=e.staging.httpsOriginVerified===true &&
    e.staging.tlsVerified===true &&e.staging.oneReadOnlyToolOnly===true &&
    e.staging.unauthorizedBearerDenied===true &&
    e.staging.actualConsentUiVerified===true &&
    e.staging.isolationFromV1Verified===true;
  const app=e.businessAccount.newAppIdentityVerified===true &&
    e.businessAccount.exactWorkspaceVerified===true &&
    e.businessAccount.oauthAuthorizationCodeFlowVerified===true &&
    e.businessAccount.pluginToolCallVerified===true;
  const approval=e.owner.explicitStagingPublishApproval===true;
  // A technical pass still NEVER authorizes import, merge or cutover.
  const eligible=discovery&&external&&app&&approval;
  return Object.freeze({
    oauthMetadataEligible:discovery,
    stagingHttpsAndConsentEligible:external,
    businessWorkspacePluginEligible:app,
    explicitOwnerStagingApprovalPresent:approval,
    externalStagingAcceptanceComplete:eligible,
    productionCutoverAuthorized:false,
    importAuthorized:false,
    appRepublishAuthorized:false,
    verdict:eligible?'STAGING_EVIDENCE_REQUIRES_INDEPENDENT_REVIEW':
      !discovery?'BLOCKED_OAUTH_DISCOVERY':
      !approval?'PENDING_EXPLICIT_OWNER_STAGING_APPROVAL':
      !external?'PENDING_EXTERNAL_HTTPS_AND_CONSENT':
      'PENDING_BUSINESS_WORKSPACE_E2E'
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (async()=>{
    const args=process.argv.slice(2);
    if(args.length!==1||!args[0].startsWith('--evidence='))
      fail('B_S6G5E_ARGUMENTS_INVALID');
    const data=JSON.parse(readFileSync(args[0].slice(11),'utf8'));
    process.stdout.write(JSON.stringify(validateStagingAdmission(data))+'\n');
  })().catch(e=>{
    const code=String(e?.message??'');
    process.stderr.write(JSON.stringify({status:'FAIL',code:
      /^B_S6G5E_[A-Z_]+$/.test(code)?code:'B_S6G5E_REDACTED_ERROR'})+'\n');
    process.exitCode=1;
  });
}
