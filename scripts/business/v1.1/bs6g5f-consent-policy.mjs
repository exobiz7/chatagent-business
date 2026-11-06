// B-S6G-5F: pure policy for future consent UI. No authorization or publication.
const fail=code=>{throw Error(code);};
export const PROJECT_REF='hjgerbyofaxyfqdckret';
export const SCOPES=Object.freeze(['openid','email','profile']);
const clientPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateConsentDetails(details,{clientId,redirectUri},authorizationId){
  if(!clientPattern.test(clientId??'')||typeof redirectUri!=='string')
    fail('BS6G5F_EXACT_CLIENT_UNSET');
  let expected;
  try{expected=new URL(redirectUri);}catch{fail('BS6G5F_REDIRECT_INVALID');}
  if(expected.protocol!=='https:'||expected.username||expected.password||
     expected.hash||expected.search)
    fail('BS6G5F_REDIRECT_INVALID');
  if(typeof authorizationId!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(authorizationId))
    fail('BS6G5F_AUTHORIZATION_ID_INVALID');
  if(!details||details.authorization_id!==authorizationId||
     details.client?.id!==clientId||details.redirect_uri!==redirectUri)
    fail('BS6G5F_CLIENT_OR_REDIRECT_MISMATCH');
  const scopes=String(details.scope??'').split(/\s+/).filter(Boolean);
  if(scopes.length===0||new Set(scopes).size!==scopes.length||
     !scopes.every(s=>SCOPES.includes(s))||!scopes.includes('openid'))
    fail('BS6G5F_SCOPE_NOT_ALLOWED');
  return Object.freeze({validated:true,clientId,redirectUri,scopes});
}
export function validateReturnedRedirect(url,pinnedRedirectUri){
  let target,expected;
  try{target=new URL(url);expected=new URL(pinnedRedirectUri);}
  catch{fail('BS6G5F_RESPONSE_REDIRECT_INVALID');}
  if(target.protocol!=='https:'||target.origin!==expected.origin||
     target.pathname!==expected.pathname||
     target.hash!==''||target.username||target.password)
    fail('BS6G5F_RESPONSE_REDIRECT_MISMATCH');
  if(!target.searchParams.has('code')&&!target.searchParams.has('error'))
    fail('BS6G5F_RESPONSE_MISSING_RESULT');
  return true;
}
