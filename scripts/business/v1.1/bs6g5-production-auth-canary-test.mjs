import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateAuthenticatedReadback,assertAnonymousDenied} from './bs6g5-production-auth-canary.mjs';
const profile={id:'prf_'+('a'.repeat(32)),email:'example@example.test',nickname:'ChatAgent Business'};
const status={organizationSlug:'release-org',role:'ADMIN',organizationInitialized:true,schemaVersion:1,contractVersion:1};
const result=validateAuthenticatedReadback(profile,status);
assert.equal(result.signedJwtHttpsReadback,true);
assert.equal(result.privateIdentityExposed,false);
assert.equal(assertAnonymousDenied(401),true);
assert.equal(assertAnonymousDenied(403),true);
for(const code of [200,201,400,404,429,500])assert.throws(()=>assertAnonymousDenied(code),/B_S6G5_ANON_DENIAL_NOT_PROVED/);
for(const key of ['organizationSlug','role','organizationInitialized','schemaVersion','contractVersion']){
 const s={...status,[key]:key==='role'?'MEMBER':null};
 assert.throws(()=>validateAuthenticatedReadback(profile,s),/B_S6G5_ORGANIZATION_OR_ROLE_MISMATCH/);
}
for(const key of ['id','email','nickname']){
 const p={...profile,[key]:null};
 assert.throws(()=>validateAuthenticatedReadback(p,status),/B_S6G5_PROFILE_INVALID/);
}
const src=readFileSync('scripts/business/v1.1/bs6g5-production-auth-canary.mjs','utf8');
const py=readFileSync('scripts/business/v1.1/bs6g5-secure-local-signin.py','utf8');
assert.match(src,/auth\.restore\(\)/);
assert.match(src,/auth\.connectWithPassword\(v\)/);
assert.match(src,/MacKeychainRefreshTokenStore/);
assert.match(src,/B_S6G5_TARGET_CONFIG_MISMATCH/);
assert.match(src,/B_S6G5_ANON_PERMISSION_CODE_NOT_PROVED/);
assert.match(src,/payload\?\.code!=='42501'/);
assert.match(src,/BC_INVALID_NOT_PRESENT_DELIBERATELY|bc_member_profile/);
assert.doesNotMatch(src,/console\.log\(\s*(?:v|profile|status|cfg|auth)\s*\)/);
assert.match(py,/getpass\.getpass/);
assert.match(py,/capture_output=True/);
assert.doesNotMatch(py,/password\s*=\s*['"][^'"]+['"]/);
const noninteractive=spawnSync('python3',['scripts/business/v1.1/bs6g5-secure-local-signin.py'],
  {encoding:'utf8',input:'',timeout:3000});
assert.equal(noninteractive.status,2);
assert.match(noninteractive.stderr,/RUN_IN_LOCAL_INTERACTIVE_MAC_TERMINAL/);
assert.doesNotMatch(noninteractive.stdout,/password|token|email/i);
console.log('PASS B-S6G-5 canary strict target, signed HTTPS readback schema and anonymous-denial contracts');
console.log('PASS B-S6G-5 local TTY owner credential isolation and no secret-in-argv design');
console.log('BUSINESS_BS6G5_AUTH_CANARY_CONTRACT=PASS');
