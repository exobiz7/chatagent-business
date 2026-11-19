import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDiscovery,probe} from './bs6g5e-oauth-discovery-preflight.mjs';

const projectRef='abcdefghijklmnopqrst';
const base='https://'+projectRef+'.supabase.co',issuer=base+'/auth/v1';
const valid={
  issuer,authorization_endpoint:issuer+'/oauth/authorize',
  token_endpoint:issuer+'/oauth/token',jwks_uri:issuer+'/.well-known/jwks.json',
  grant_types_supported:['authorization_code','refresh_token'],
  code_challenge_methods_supported:['S256','plain'],
  registration_endpoint:issuer+'/oauth/clients'
};
const evaluate=(oauthStatus,oauth,oidcStatus,oidc)=>validateDiscovery({
  projectRef,oauthStatus,oauth,oidcStatus,oidc
});
const good=evaluate(200,valid,200,valid);
assert.equal(good.verdict,'OAUTH_METADATA_READY_REGISTRATION_AND_CONSENT_UNVERIFIED');
assert.equal(good.registrationEndpointAdvertised,true);
assert.equal(good.browserConsentVerified,false);
assert.equal(good.chatgptBusinessOAuthVerified,false);
assert.equal(good.cutoverAuthorized,false);
assert.equal(good.externalGatewayPublished,false);
const absent=evaluate(404,null,200,valid);
assert.equal(absent.verdict,'BLOCKED_OAUTH_AUTHORIZATION_SERVER_DISCOVERY');
assert.equal(absent.oauthAuthorizationServerMetadataValid,false);
assert.equal(absent.oidcMetadataValid,true);
assert.equal(absent.authorizationCodeAndPkceS256,false);
assert.equal(absent.registrationEndpointAdvertised,false);
assert.equal(evaluate(200,valid,404,null).verdict,'BLOCKED_OIDC_DISCOVERY');
for(const malicious of [
 {...valid,issuer:'https://example.invalid/auth/v1'},
 {...valid,authorization_endpoint:'https://wrong.invalid/auth'},
 {...valid,grant_types_supported:['client_credentials']},
 {...valid,code_challenge_methods_supported:['plain']},
 {...valid,jwks_uri:'https://wrong.invalid/jwks'}
]){
 const x=evaluate(200,malicious,200,valid);
 assert.equal(x.oauthAuthorizationServerMetadataValid,false);
 assert.notEqual(x.verdict,good.verdict);
}
assert.throws(()=>validateDiscovery({projectRef:'../../abc'}),/B_S6G5E_INVALID_TARGET/);
const seen=[];
const response=(status,data)=>({
 status,headers:{get:()=>null},text:async()=>JSON.stringify(data)
});
const testFetch=async(url,opts)=>{
 seen.push({url,method:opts.method,redirect:opts.redirect});
 return url.endsWith('oauth-authorization-server/auth/v1')
   ?response(404,null):response(200,valid);
};
const r=await probe({projectRef,fetchImpl:testFetch});
assert.equal(r.verdict,'BLOCKED_OAUTH_AUTHORIZATION_SERVER_DISCOVERY');
assert.equal(seen.length,2);
assert.ok(seen.every(x=>x.method==='GET'&&x.redirect==='error'));
assert.equal(seen[0].url,base+'/.well-known/oauth-authorization-server/auth/v1');
assert.equal(seen[1].url,base+'/auth/v1/.well-known/openid-configuration');
const code=readFileSync('scripts/business/v1.1/bs6g5e-oauth-discovery-preflight.mjs','utf8');
assert.doesNotMatch(code,/(Authorization.*Bearer|signInWithPassword|approveAuthorization|registerClient|POST|service_role)/);
console.log('PASS B-S6G-5E OAuth2.1 issuer/PKCE S256/discovery separation, bounded GET-only preflight');
console.log('PASS B-S6G-5E missing OAuth metadata blocks despite working OIDC, no implied consent/registration');
console.log('BUSINESS_BS6G5E_OAUTH_READINESS_CONTRACT=PASS');
