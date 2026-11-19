#!/usr/bin/env node
// B-S6G-5E: read-only OAuth 2.1 metadata verification for an exact Supabase project.
// No client registration, credential read, login, consent, tunnel change or write.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const REF=/^[a-z0-9]{20}$/;
const fail=code=>{throw Error(code);};
const safeStatus=s=>Number.isInteger(s)&&s>=100&&s<=599?s:0;

export function validateDiscovery({projectRef,oauthStatus,oauth,oidcStatus,oidc}){
  if(!REF.test(projectRef))fail('B_S6G5E_INVALID_TARGET');
  const issuer='https://'+projectRef+'.supabase.co/auth/v1';
  const base='https://'+projectRef+'.supabase.co';
  const good=doc=>doc && typeof doc==='object'&&!Array.isArray(doc)&&
    doc.issuer===issuer&&doc.authorization_endpoint===issuer+'/oauth/authorize'&&
    doc.token_endpoint===issuer+'/oauth/token'&&
    typeof doc.jwks_uri==='string'&&doc.jwks_uri.startsWith(issuer+'/')&&
    Array.isArray(doc.grant_types_supported)&&
    doc.grant_types_supported.includes('authorization_code')&&
    doc.grant_types_supported.includes('refresh_token')&&
    Array.isArray(doc.code_challenge_methods_supported)&&
    doc.code_challenge_methods_supported.includes('S256');
  const oidcValid=oidcStatus===200&&!!good(oidc);
  const oauthValid=oauthStatus===200&&!!good(oauth);
  // OIDC discovery may be available even while OAuth Authorization Server metadata is 404.
  // Do not equate OIDC discovery with MCP OAuth 2.1 discovery readiness.
  let verdict='BLOCKED_OAUTH_AUTHORIZATION_SERVER_DISCOVERY';
  if(oauthValid&&oidcValid)verdict='OAUTH_METADATA_READY_REGISTRATION_AND_CONSENT_UNVERIFIED';
  else if(oauthValid)verdict='BLOCKED_OIDC_DISCOVERY';
  return Object.freeze({
    projectPinned:true,metadataReadOnly:true,oidcStatus:safeStatus(oidcStatus),
    oauthStatus:safeStatus(oauthStatus),oidcMetadataValid:oidcValid,
    oauthAuthorizationServerMetadataValid:oauthValid,
    authorizationCodeAndPkceS256:oauthValid,
    registrationEndpointAdvertised:oauthValid&&
      typeof oauth.registration_endpoint==='string'&&
      oauth.registration_endpoint.startsWith(base+'/auth/v1/'),
    browserConsentVerified:false,redirectUriRegisteredVerified:false,
    chatgptBusinessOAuthVerified:false,externalGatewayPublished:false,
    cutoverAuthorized:false,verdict
  });
}
async function readMetadata(url,fetchImpl){
  let response;
  try{response=await fetchImpl(url,{
    method:'GET',headers:{accept:'application/json'},
    signal:AbortSignal.timeout(8000),redirect:'error'
  });}
  catch{return {status:0,data:null};}
  if(!response||typeof response.status!=='number')return {status:0,data:null};
  const status=safeStatus(response.status);
  if(status!==200)return {status,data:null};
  const length=Number(response.headers?.get?.('content-length')??0);
  if(Number.isFinite(length)&&length>24000)return {status,data:null};
  try{
    const raw=await response.text();
    if(raw.length>24000)return {status,data:null};
    return {status,data:JSON.parse(raw)};
  }catch{return {status,data:null};}
}
export async function probe({projectRef,fetchImpl=globalThis.fetch}){
  if(!REF.test(projectRef)||typeof fetchImpl!=='function')
    fail('B_S6G5E_INVALID_TARGET');
  const base='https://'+projectRef+'.supabase.co';
  const oauth=await readMetadata(base+'/.well-known/oauth-authorization-server/auth/v1',fetchImpl);
  const oidc=await readMetadata(base+'/auth/v1/.well-known/openid-configuration',fetchImpl);
  return validateDiscovery({
    projectRef,oauthStatus:oauth.status,oauth:oauth.data,
    oidcStatus:oidc.status,oidc:oidc.data
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (async()=>{
    const a=process.argv.slice(2);
    if(a.length!==1||!a[0].startsWith('--expected-project-ref='))
      fail('B_S6G5E_ARGUMENTS_INVALID');
    const result=await probe({projectRef:a[0].slice('--expected-project-ref='.length)});
    process.stdout.write(JSON.stringify(result)+'\n');
  })().catch(e=>{
    const c=String(e?.message??'');
    const safe=/^B_S6G5E_[A-Z_]+$/.test(c)?c:'B_S6G5E_REDACTED_FAILURE';
    process.stderr.write(JSON.stringify({status:'FAIL',code:safe})+'\n');
    process.exitCode=1;
  });
}
