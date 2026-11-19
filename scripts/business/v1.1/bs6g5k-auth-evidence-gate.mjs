// B-S6G-5K: Authorization admission evidence-only model.
// No network, no Auth writes, no OAuth activation; defaults to blocked.
// Do not substitute OIDC identity scopes for actual MCP tool authorization.
const required=['issuerDiscovery','siteUrlActualReadback','siteUrlRedirectImpact',
  'exactBusinessAppCallback','businessClientRegistrationMode','asymmetricSigningVerified',
  'signedOAuthTokenObserved','resourceIndicatorRequested','resourceAudienceBound',
  'exactClientClaimVerified','realTokenAudienceValidated',
  'sessionAndOrgMembershipVerified','readOnlyToolAccessPolicyVerified',
  'independentGatewayIsolated','noV1SideEffects','businessWorkspaceE2E'];
export function evaluateB5K(e){
 if(!e||e.schemaVersion!==1||e.workUnit!=='B-S6G-5K'||
   e.projectRef!=='hjgerbyofaxyfqdckret'||
   e.externalSettingsChanged!==false||e.productionCutoverAuthorized!==false)
   throw Error('BS6G5K_INVALID_GOVERNANCE');
 const missing=required.filter(k=>e.verified?.[k]!==true);
 if(e.oauthDiscoveryHttpStatus!==200)missing.push('oauthDiscoveryHttp200');
 if(e.clientRegistrationMethod!==null&&!['predefined','dcr'].includes(e.clientRegistrationMethod))
   missing.push('unsupportedClientRegistrationMethod');
 // A synthetic guard cannot authorize issuance or real E2E.
 return Object.freeze({
   result:missing.length?'BLOCKED_REAL_OAUTH_DEPENDENCIES':'EVIDENCE_REQUIRES_INDEPENDENT_OWNER_REVIEW',
   missing,scopeIsOidcIdentityNotResourceAccess:true,
   requireSignedResourceBoundToken:true,
   productionCutoverAuthorized:false,
   settingsChangeAuthorized:false,
   clientRegistrationAuthorized:false,
   externalDeployAuthorized:false
 });
}
