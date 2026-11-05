#!/usr/bin/env node
// Isolated loopback v1.1 Gateway E2E. No tokens, identities or raw responses in output.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {loadBusinessSupabaseConfig} from './control/supabase-runtime-config.mjs';
import {MacKeychainRefreshTokenStore} from './control/keychain-refresh-token-store.mjs';
import {BusinessSupabaseAuthSession} from './control/supabase-auth-session.mjs';
import {fetchBusinessMemberProfile} from './control/business-member-profile-rpc.mjs';

const fail = code => { throw Error(code); };
const entry = fileURLToPath(new URL('./bs6g5d-readonly-external-fixture.mjs', import.meta.url));
export function safeProfileMatch(actual, expected) {
  if (!actual || !/^prf_[a-f0-9]{32}$/.test(actual.id??'') ||
      actual.id!==expected.id || actual.email!==expected.email ||
      actual.nickname!==expected.nickname) fail('B_S6G5D_PROFILE_MISMATCH');
  return true;
}
export function denied(response) {
  if (response.status!==401 || !/^Bearer\b/i.test(response.headers.get('www-authenticate')??''))
    fail('B_S6G5D_NEGATIVE_AUTH_FAILED');
  return true;
}
async function freePort() {
  const s=createServer();
  await new Promise((ok,bad)=>{s.once('error',bad);s.listen(0,'127.0.0.1',ok);});
  const p=s.address().port;
  await new Promise(ok=>s.close(ok));
  return p;
}
async function waitReady(child,base) {
  for (let i=0;i<45;i++) {
    if (child.exitCode!==null) fail('B_S6G5D_FIXTURE_EXITED');
    try {
      const r=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)});
      if(r.status===200) {
        const x=await r.json();
        if(x.fixture===true && x.noEffect===true && x.published===false &&
           x.toolCount===1 && x.toolNames?.length===1 &&
           x.toolNames[0]==='member_get_profile') return;
      }
    } catch {}
    await delay(150);
  }
  fail('B_S6G5D_FIXTURE_NOT_READY');
}
async function cleanup(child) {
  if(child.exitCode!==null || child.signalCode!==null) return;
  child.kill('SIGTERM');
  for(let i=0;i<15&&child.exitCode===null&&child.signalCode===null;i++) await delay(80);
  if(child.exitCode===null && child.signalCode===null) {
    child.kill('SIGKILL');await delay(120);
  }
  if(child.exitCode===null && child.signalCode===null) fail('B_S6G5D_PROCESS_CLEANUP_FAILED');
}
export async function run(configPath,projectRef) {
  if(!/^[a-z0-9]{20}$/.test(projectRef??'')) fail('B_S6G5D_REF_INVALID');
  const cfg=loadBusinessSupabaseConfig(configPath);
  if(cfg.projectRef!==projectRef ||
     cfg.url!=='https://'+projectRef+'.supabase.co' ||
     cfg.keychainService!=='chatagent-business.bs6g5.production.auth' ||
     cfg.expectedSchemaVersion!==1) fail('B_S6G5D_WRONG_TARGET');
  const store=new MacKeychainRefreshTokenStore({binary:cfg.keychainHelper,
    binarySha256:cfg.keychainHelperSha256,service:cfg.keychainService,account:projectRef});
  const auth=new BusinessSupabaseAuthSession({url:cfg.url,
    publishableKey:cfg.publishableKey,tokenStore:store,requestTimeoutMs:10000});
  const session=await auth.restore();
  const issuer=cfg.url+'/auth/v1';
  const {payload}=await jwtVerify(session.access_token,
    createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json')),{issuer,audience:'authenticated'});
  const user=await auth.client.auth.getUser(session.access_token);
  if(user.error || !user.data?.user?.id ||
     user.data.user.id!==payload.sub || payload.role!=='authenticated')
    fail('B_S6G5D_AUTH_IDENTITY_INVALID');
  const direct=await fetchBusinessMemberProfile({supabaseUrl:cfg.url,
    publishableKey:cfg.publishableKey,accessToken:session.access_token});
  if(direct.email!==user.data.user.email) fail('B_S6G5D_DIRECT_IDENTITY_MISMATCH');
  const port=await freePort();
  const base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,[entry],{env:{
      PATH:process.env.PATH??'/usr/bin:/bin',HOME:process.env.HOME??'',
      BS6G5D_PORT:String(port),BS6G5D_PUBLIC_ORIGIN:'https://localhost.invalid',
      BS6G5D_CONFIG_PATH:configPath,BS6G5D_PROJECT_REF:projectRef
    },stdio:['ignore','ignore','ignore']});
  let client=null,transport=null;
  try {
    await waitReady(child,base);
    const metadataResponse=await fetch(base+'/.well-known/oauth-protected-resource',{
      signal:AbortSignal.timeout(5000)});
    if(metadataResponse.status!==200) fail('B_S6G5D_RESOURCE_METADATA_MISSING');
    const metadata=await metadataResponse.json();
    if(metadata.resource!=='https://localhost.invalid/mcp' ||
       !metadata.authorization_servers?.includes(issuer) ||
       !metadata.bearer_methods_supported?.includes('header'))
      fail('B_S6G5D_RESOURCE_METADATA_INVALID');
    for(const token of [null,'invalid-test-token']){
      const r=await fetch(base+'/mcp',{method:'POST',
        headers:{'content-type':'application/json',
          ...(token?{Authorization:'Bearer '+token}:{})},
        body:'{}',signal:AbortSignal.timeout(5000)});
      denied(r);
    }
    transport=new StreamableHTTPClientTransport(new URL(base+'/mcp'),{
      requestInit:{headers:{Authorization:'Bearer '+session.access_token}}});
    client=new Client({name:'bs6g5c-readonly-canary',version:'1.0.0'},
      {capabilities:{}});
    await client.connect(transport);
    const listing=await client.listTools();
    if(listing.tools?.length!==1 ||
       listing.tools[0]?.name!=='member_get_profile' ||
       listing.tools[0]?.annotations?.readOnlyHint!==true)
       fail('B_S6G5D_TOOL_SURFACE_NOT_MINIMAL');
    let unauthorizedEffectDenied=false;
    try {
      const rejected=await client.callTool({name:'create_file',arguments:{}});
      unauthorizedEffectDenied=rejected.isError===true;
    } catch { unauthorizedEffectDenied=true; }
    if(!unauthorizedEffectDenied)fail('B_S6G5D_WRITE_TOOL_NOT_DENIED');
    const result=await client.callTool({name:'member_get_profile',arguments:{}});
    if(result.isError) fail('B_S6G5D_TOOL_RETURNED_ERROR');
    const profile=result.structuredContent ??
      JSON.parse(result.content?.find(x=>x.type==='text')?.text??'null');
    safeProfileMatch(profile,direct);
    return {jwtSignature:true,issuer:true,authGetUser:true,
      noBearerDenied:true,invalidBearerDenied:true,
      realMcpToolCall:true,directProfileMatch:true,exactlyOneReadOnlyTool:true,writeToolDenied:true,
      localLoopback:true,noEffectFixture:true,notPublished:true,
      oauthResourceMetadata:true,secretsNotPrinted:true};
  } finally {
    if(client) try{await client.close();}catch{}
    else if(transport) try{await transport.close();}catch{}
    await cleanup(child);
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  (async()=>{
    const args=process.argv.slice(2);
    if(args.length!==2||!args[0].startsWith('--config=')||
       !args[1].startsWith('--expected-project-ref='))
       fail('B_S6G5D_ARGUMENTS_INVALID');
    const data=await run(args[0].slice(9),args[1].slice(23));
    process.stdout.write(JSON.stringify({status:'PASS',...data})+'\n');
  })().catch(e=>{
    const message=String(e?.message??'');
    const code=/^B_S6G5D_[A-Z_]+$/.test(message)
      ?message:'B_S6G5D_FAILED_REDACTED';
    process.stderr.write(JSON.stringify({status:'FAIL',code})+'\n');
    process.exitCode=1;
  });
}
