// Future-only Business Staging OAuth consent orchestration; NOT connected to preview UI.
// Requires independently approved exact client ID and callback URI before any SDK call.
import {validateConsentDetails,validateReturnedRedirect} from './bs6g5f-consent-policy.mjs';
const fail=c=>{throw Error(c);};
const REF='hjgerbyofaxyfqdckret';
export async function inspectConsent(client,authorizationId,config){
  if(!client?.auth?.oauth?.getAuthorizationDetails||
     !client?.auth?.getUser||!client?.rpc||config?.projectRef!==REF)
    fail('BS6G5F_CLIENT_NOT_READY');
  // These credentials must be pre-registered, reviewed and supplied from an
  // owner-private deployment config. Never infer client ID from untrusted metadata.
  if(!config.clientId||!config.redirectUri)fail('BS6G5F_ALLOWLIST_ABSENT');
  const {data:authUser,error:userError}=await client.auth.getUser();
  if(userError||!authUser?.user?.id||authUser.user.is_anonymous===true)
    fail('BS6G5F_LOGIN_REQUIRED');
  const {data:status,error:roleError}=await client.rpc('bc_schema_status',{});
  if(roleError||status?.organizationSlug!=='release-org'||
     status?.role!=='ADMIN'||status?.organizationInitialized!==true)
    fail('BS6G5F_RELEASE_ORG_ADMIN_REQUIRED');
  const {data,error}=await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error||!data||!('authorization_id' in data))
    // A preapproved OAuth redirect lacks the exact client context. Reject it.
    fail('BS6G5F_CONSENT_DETAILS_REQUIRED');
  const safe=validateConsentDetails(data,config,authorizationId);
  return Object.freeze({validated:true,authorizationId,
    clientId:safe.clientId,redirectUri:safe.redirectUri,
    scopes:safe.scopes,clientLabel:String(data.client?.name??'').slice(0,90)});
}
export async function decideConsent(client,checked,action){
  if(!checked?.validated||!['approve','deny'].includes(action))
    fail('BS6G5F_DECISION_NOT_AUTHORIZED');
  // The UI must explicitly require the user's click on the reviewed consent.
  const f=action==='approve'?
    client.auth.oauth.approveAuthorization:
    client.auth.oauth.denyAuthorization;
  if(typeof f!=='function')fail('BS6G5F_CONSENT_API_MISSING');
  const {data,error}=await f.call(client.auth.oauth,checked.authorizationId,
    {skipBrowserRedirect:true});
  if(error||!data?.redirect_url)fail('BS6G5F_CONSENT_RESPONSE_FAILED');
  validateReturnedRedirect(data.redirect_url,checked.redirectUri);
  return Object.freeze({redirectUrl:data.redirect_url});
}
