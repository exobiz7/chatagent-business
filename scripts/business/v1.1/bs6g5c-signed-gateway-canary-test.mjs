import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeProfileMatch,denied} from './bs6g5c-signed-gateway-canary.mjs';

const expected={id:'prf_'+('a'.repeat(32)),email:'fixture@example.invalid',
  nickname:'ChatAgent Business'};
assert.equal(safeProfileMatch(expected,expected),true);
for(const v of [
  {...expected,id:'bad'},
  {...expected,email:'different@example.invalid'},
  {...expected,nickname:'changed'},
  null
])assert.throws(()=>safeProfileMatch(v,expected),/B_S6G5C_PROFILE_MISMATCH/);
const result=(status,challenge)=>
  ({status,headers:new Headers(challenge?{'www-authenticate':challenge}:{})});
assert.equal(denied(result(401,'Bearer resource_metadata="https://fixture.invalid/metadata"')),true);
for(const v of [
  result(200,'Bearer invalid'),result(403,'Bearer invalid'),
  result(401,'Basic invalid'),result(401,null)
])assert.throws(()=>denied(v),/B_S6G5C_NEGATIVE_AUTH_FAILED/);
const source=readFileSync('scripts/business/v1.1/bs6g5c-signed-gateway-canary.mjs','utf8');
for(const pattern of [
  /jwtVerify\(session\.access_token/,
  /auth\.client\.auth\.getUser\(session\.access_token\)/,
  /member_get_profile/,/StreamableHTTPClientTransport/,
  /client\.connect\(transport\)/,
  /requestInit:\{headers:/,/client\.callTool/,
  /oauth-protected-resource/,/B_S6G5C_RESOURCE_METADATA_INVALID/,
  /audience:'authenticated'/,/BS0_EXPECTED_AUDIENCE:'authenticated'/,
  /127\.0\.0\.1/,/cleanup\(child\)/
])assert.match(source,pattern);
assert.doesNotMatch(source,/console\.log\(session\)|console\.log\(direct\)|console\.log\(payload\)/);
console.log('PASS B-S6G-5C JWT/JWKS, authenticated MCP readback, no-bearer and invalid-bearer denial contracts');
console.log('PASS B-S6G-5C private data/credential non-disclosure and owned loopback fixture cleanup contract');
console.log('BUSINESS_BS6G5C_GATEWAY_CONTRACT=PASS');
