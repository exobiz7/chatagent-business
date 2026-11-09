import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeProfileMatch,denied} from './bs6g5d-readonly-external-canary.mjs';

const expected={id:'prf_'+('a'.repeat(32)),email:'fixture@example.invalid',
  nickname:'ChatAgent Business'};
assert.equal(safeProfileMatch(expected,expected),true);
for(const wrong of [null,{...expected,id:'invalid'},
  {...expected,email:'wrong@example.invalid'}, {...expected,nickname:'wrong'}])
  assert.throws(()=>safeProfileMatch(wrong,expected),/B_S6G5D_PROFILE_MISMATCH/);

const deniedResponse=(status,challenge)=>({
  status,headers:new Headers(challenge?{'www-authenticate':challenge}:{})
});
assert.equal(denied(deniedResponse(401,'Bearer resource_metadata="https://fixture.invalid"')),true);
for(const x of [deniedResponse(200,'Bearer data'),deniedResponse(403,'Bearer data'),
  deniedResponse(401,'Basic data'),deniedResponse(401,null)])
  assert.throws(()=>denied(x),/B_S6G5D_NEGATIVE_AUTH_FAILED/);

const gateway=readFileSync('scripts/business/v1.1/bs6g5d-readonly-external-fixture.mjs','utf8');
const canary=readFileSync('scripts/business/v1.1/bs6g5d-readonly-external-canary.mjs','utf8');
assert.match(gateway,/allowed=candidateTools\.filter\(t=>t\.name==='member_get_profile'\)/);
assert.match(gateway,/allowed\.length!==1/);
assert.match(gateway,/annotations\?\.readOnlyHint!==true/);
assert.match(gateway,/server\.listen\(port,'127\.0\.0\.1'/);
assert.match(gateway,/jwtVerify\(token,jwks,\{issuer,audience:'authenticated'\}\)/);
assert.match(gateway,/payload\.is_anonymous===true/);
assert.match(gateway,/fetchBusinessMemberProfile/);
assert.match(gateway,/sessionIdGenerator:undefined,enableJsonResponse:true/);
assert.match(gateway,/toolCount:1,toolNames:\['member_get_profile'\],published:false/);
assert.doesNotMatch(gateway,/registerTool\('(?:create_file|process_start_host|exec_command|replace_file)'/);
assert.match(canary,/client\.listTools\(\)/);
assert.match(canary,/listing\.tools\?\.length!==1/);
assert.match(canary,/client\.callTool\(\{name:'create_file'/);
assert.match(canary,/B_S6G5D_WRITE_TOOL_NOT_DENIED/);
assert.match(canary,/client\.callTool\(\{name:'member_get_profile'/);
assert.match(canary,/BS6G5D_CONFIG_PATH:configPath/);
assert.match(canary,/await cleanup\(child\)/);
assert.match(canary,/notPublished:true/);
assert.doesNotMatch(canary,/console\.log\((?:session|direct|payload|user)\)/);
console.log('PASS B-S6G-5D single read-only discovery, direct profile and denied effect contract');
console.log('PASS B-S6G-5D signed JWT audience/issuer, loopback/no-publish and safe cleanup');
console.log('BUSINESS_BS6G5D_EXTERNAL_FIXTURE_CONTRACT=PASS');
