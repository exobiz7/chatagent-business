import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyExactMcpAccessToken} from './bs6g5j-oauth-token-admission.mjs';

const {privateKey,publicKey}=await generateKeyPair('RS256');
const cfg={issuer:'https://fixture.supabase.co/auth/v1',
 resource:'https://mcp.example.invalid/mcp',
 clientId:'03fa131d-bc78-4e9b-85e8-7fba9a22ca90',
 scopes:['openid','email']};
const base={sub:'fixture-user-1',role:'authenticated',is_anonymous:false,
 aud:cfg.resource,resource:cfg.resource,client_id:cfg.clientId,scope:'openid email profile'};
async function make(payload=base,{issuer=cfg.issuer,expOffset=180,signingKey=privateKey}={}){
 return new SignJWT(payload).setProtectedHeader({alg:'RS256'}).setIssuer(issuer)
 .setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+expOffset).sign(signingKey)
}
const good=await make();
const accepted=await verifyExactMcpAccessToken(good,publicKey,cfg);
assert.equal(accepted.verified,true);
assert.equal(accepted.resource,cfg.resource);
const variants=[
 [{aud:'authenticated'},/RESOURCE_AUDIENCE_INVALID/],
 [{resource:'https://another.example.invalid/mcp'},/RESOURCE_CLAIM_MISMATCH/],
 [{client_id:'00000000-0000-4000-8000-000000000000'},/CLIENT_ID_MISMATCH/],
 [{scope:'openid'},/SCOPE_NOT_AUTHORIZED/],
 [{role:'anon'},/IDENTITY_INVALID/],
 [{is_anonymous:true},/IDENTITY_INVALID/]
];
for(const [change,expected] of variants)
 await assert.rejects(verifyExactMcpAccessToken(await make({...base,...change}),publicKey,cfg),expected);
await assert.rejects(verifyExactMcpAccessToken(await make(base,{issuer:'https://other.invalid/auth/v1'}),publicKey,cfg),/CRYPTO_ISSUER_EXPIRY_OR_RESOURCE_AUDIENCE_INVALID/);
await assert.rejects(verifyExactMcpAccessToken(await make(base,{expOffset:-20}),publicKey,cfg),/CRYPTO_ISSUER_EXPIRY_OR_RESOURCE_AUDIENCE_INVALID/);
const wrong=await generateKeyPair('RS256');
await assert.rejects(verifyExactMcpAccessToken(await make(base,{signingKey:wrong.privateKey}),publicKey,cfg),/CRYPTO_ISSUER_EXPIRY_OR_RESOURCE_AUDIENCE_INVALID/);
await assert.rejects(verifyExactMcpAccessToken(good,publicKey,{...cfg,clientId:null}),/CONFIG_UNVERIFIED/);
console.log('PASS B-S6G-5J offline signature issuer expiry resource audience resource claim exact client scope user authorization');
console.log('PASS B-S6G-5J rejects legacy aud=authenticated and cross-resource/cross-client tokens');
console.log('BUSINESS_BS6G5J_MCP_TOKEN_ADMISSION_CONTRACT=PASS');
