// Contract-only staging plan. Does not create a tunnel, change Supabase, or register OAuth clients.
import {PROJECT_REF} from './bs6g5f-consent-policy.mjs';
const fail=code=>{throw Error(code);};
const normalizedUrl=(value,kind)=>{
  if(typeof value!=='string'||value.length>2048)fail('BS6G5G_'+kind+'_MISSING');
  let u;try{u=new URL(value);}catch{fail('BS6G5G_'+kind+'_INVALID');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
    u.hostname==='localhost'||u.hostname.endsWith('.localhost')||
    u.hostname.endsWith('.invalid')||/^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)||
    u.hostname==='[::1]'||u.hostname.includes('%')||
    (u.port&&u.port!=='443'))fail('BS6G5G_'+kind+'_INVALID');
  return u;
};
export function evaluateStagingTopology(plan){
  if(!plan||plan.schemaVersion!==1||plan.purpose!=='B-S6G-5G_CONSENT_STAGING'||
     plan.projectRef!==PROJECT_REF||plan.productionV1Unchanged!==true||
     plan.productionCutoverApproved!==false||plan.paidServicesApproved!==false)
    fail('BS6G5G_TARGET_OR_GOVERNANCE_INVALID');
  if(plan.siteUrl===null||plan.siteUrl===''||plan.oauthClientId===null||
     plan.oauthClientId===''||plan.redirectUri===null||plan.redirectUri===''){
    return Object.freeze({status:'PENDING_EXACT_HTTPS_AND_CLIENT',
      stagingReady:false,siteUrlChangeAuthorized:false,oauthEnableAuthorized:false,
      appRegistrationAuthorized:false,productionCutoverAuthorized:false});
  }
  const site=normalizedUrl(plan.siteUrl,'SITE_URL');
  const callback=normalizedUrl(plan.redirectUri,'CALLBACK');
  const id=plan.oauthClientId;
  if(site.pathname!=='/'||site.toString()!==plan.siteUrl+'/'&&site.toString()!==plan.siteUrl||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    fail('BS6G5G_EXACT_CLIENT_OR_SITE_URL_INVALID');
  if(plan.authorizationPath!=='/oauth/consent'||
     plan.dynamicOAuthAppsEnabled!==false ||
     plan.externalTlsVerified!==true||
     plan.consentUiBrowserIntegrationVerified!==true||
     plan.callbackRegisteredVerified!==true||
     plan.crossApplicationSiteUrlImpactReviewed!==true||
     plan.isolationFromV1Verified!==true||
     plan.ownerStagingApprovalRecorded!==true)
    return Object.freeze({status:'PENDING_STAGING_INDEPENDENT_REVIEW',
      stagingReady:false,siteUrlChangeAuthorized:false,oauthEnableAuthorized:false,
      appRegistrationAuthorized:false,productionCutoverAuthorized:false});
  return Object.freeze({status:'ELIGIBLE_FOR_SEPARATE_OWNER_CHANGE_APPROVAL',
    stagingReady:false,siteUrlChangeAuthorized:false,oauthEnableAuthorized:false,
    appRegistrationAuthorized:false,productionCutoverAuthorized:false});
}
export function protectedSiteUrlChangeRisk(plan){
 return Object.freeze({globalSiteUrlForAuthProject:true,
   affectsDefaultAuthRedirects:true,requiresRecoveryEmailRedirectAudit:true,
   requiresExistingUserResetAndMagicLinkAudit:true,
   v1RuntimeIsolationRequiresIndependentCheck:true,
   siteUrlChangeAuthorized:false,oauthEnableAuthorized:false});
}
