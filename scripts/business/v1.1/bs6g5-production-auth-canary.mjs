#!/usr/bin/env node
// B-S6G-5: only read-only Supabase RPC; authorized user login stores refresh token in macOS Keychain.
// Never log access/refresh tokens, email, password, response bodies, or private identifiers.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadBusinessSupabaseConfig} from './control/supabase-runtime-config.mjs';
import {MacKeychainRefreshTokenStore} from './control/keychain-refresh-token-store.mjs';
import {BusinessSupabaseAuthSession} from './control/supabase-auth-session.mjs';

const fail=(code)=>{throw Error(code);};
const REFERENCE=/^[a-z0-9]{20}$/;
const opaque=/^prf_[a-f0-9]{32}$/;

export function validateAuthenticatedReadback(profile,status){
  if(!profile||typeof profile!=='object'||Array.isArray(profile)||
     !opaque.test(profile.id??'')||
     typeof profile.email!=='string'||!profile.email.includes('@')||
     profile.nickname!=='ChatAgent Business')fail('B_S6G5_PROFILE_INVALID');
  if(!status||typeof status!=='object'||Array.isArray(status)||
     status.organizationSlug!=='release-org'||
     status.role!=='ADMIN'||
     status.organizationInitialized!==true||
     status.schemaVersion!==1||status.contractVersion!==1)
    fail('B_S6G5_ORGANIZATION_OR_ROLE_MISMATCH');
  return Object.freeze({signedJwtHttpsReadback:true,profileFormatValid:true,
    organization:'release-org',role:'ADMIN',schemaVersion:1,contractVersion:1,
    privateIdentityExposed:false});
}
export function assertAnonymousDenied(httpStatus){
  if(httpStatus!==401&&httpStatus!==403)
    fail('B_S6G5_ANON_DENIAL_NOT_PROVED');
  return true;
}
const readStdin=async()=>{
  let raw='',limit=2048;
  for await(const chunk of process.stdin){
    raw+=chunk.toString('utf8');
    if(raw.length>limit)fail('B_S6G5_INPUT_TOO_LARGE');
  }
  let v;
  try{v=JSON.parse(raw);}catch{fail('B_S6G5_INPUT_INVALID');}
  if(!v||Object.keys(v).sort().join(',')!=='email,password'||
     typeof v.email!=='string'||typeof v.password!=='string')
    fail('B_S6G5_INPUT_INVALID');
  return v;
};
const httpDenied=async(cfg,name)=>{
  let resp;
  try{
    resp=await fetch(cfg.url+'/rest/v1/rpc/'+name,{
      method:'POST',
      headers:{apikey:cfg.publishableKey,'content-type':'application/json'},
      body:'{}',signal:AbortSignal.timeout(8000)
    });
  }catch{fail('B_S6G5_HTTPS_UNAVAILABLE');}
  let payload;
  try{payload=await resp.json();}catch{fail('B_S6G5_ANON_RESPONSE_INVALID');}
  assertAnonymousDenied(resp.status);
  if(payload?.code!=='42501'||!/permission denied/i.test(payload?.message??''))
    fail('B_S6G5_ANON_PERMISSION_CODE_NOT_PROVED');
  return {httpStatus:resp.status,sqlstate:'42501'};
};
const rpc=async(auth,name)=>{
  const {data,error}=await auth.rpc(name,{});
  if(error||!data)fail('B_S6G5_SIGNED_READBACK_DENIED');
  return data;
};

export async function runCanary({mode,configPath,expectedProjectRef}){
  if(!['anon','login','readback','status'].includes(mode)||
     !REFERENCE.test(expectedProjectRef??''))fail('B_S6G5_ARGUMENTS_INVALID');
  const cfg=loadBusinessSupabaseConfig(configPath);
  if(cfg.projectRef!==expectedProjectRef||
     cfg.url!==('https://'+expectedProjectRef+'.supabase.co')||
     cfg.expectedSchemaVersion!==1||
     cfg.keychainService!=='chatagent-business.bs6g5.production.auth')
    fail('B_S6G5_TARGET_CONFIG_MISMATCH');
  const store=new MacKeychainRefreshTokenStore({
    binary:cfg.keychainHelper,binarySha256:cfg.keychainHelperSha256,
    service:cfg.keychainService,account:cfg.projectRef
  });
  if(mode==='status')return {targetPinned:true,publishableOnly:true,
    keychainHelperShaPinned:true,liveSignedJwtTestPerformed:false};
  if(mode==='anon'){
    const profile=await httpDenied(cfg,'bc_member_profile');
    const schema=await httpDenied(cfg,'bc_schema_status');
    return {targetPinned:true,realHttps:true,anonymousProfileDenied:profile,
      anonymousSchemaDenied:schema,liveSignedJwtTestPerformed:false};
  }
  const auth=new BusinessSupabaseAuthSession({
    url:cfg.url,publishableKey:cfg.publishableKey,tokenStore:store,requestTimeoutMs:8000
  });
  if(mode==='login'){
    const v=await readStdin();
    await auth.connectWithPassword(v);
  }else await auth.restore();
  const profile=await rpc(auth,'bc_member_profile');
  const status=await rpc(auth,'bc_schema_status');
  return {targetPinned:true,keychainRefreshTokenCustody:true,
    ...validateAuthenticatedReadback(profile,status)};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  (async()=>{
    if(args.length!==3||!['status','anon','login','readback'].includes(args[0])||
       !args[1].startsWith('--config=')||!args[2].startsWith('--expected-project-ref='))
      fail('B_S6G5_ARGUMENTS_INVALID');
    const result=await runCanary({mode:args[0],
      configPath:args[1].slice(9),expectedProjectRef:args[2].slice(23)});
    process.stdout.write(JSON.stringify({status:'PASS',mode:args[0],...result})+'\n');
  })().catch(error=>{
    const code=String(error?.message??'');
    const safe=/^(?:B_S6G5_[A-Z_]+|BUSINESS_[A-Z_]+|KEYCHAIN_[A-Z_]+)$/.test(code)
      ?code:'B_S6G5_FAILED_REDACTED';
    process.stderr.write(JSON.stringify({status:'FAIL',code:safe})+'\n');
    process.exitCode=1;
  });
}
