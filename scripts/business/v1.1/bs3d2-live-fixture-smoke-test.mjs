import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=mkdtempSync(join(tmpdir(),'business-bs3d2-fixture-'));
const local=join(root,'local'),mapping=join(root,'mapping'),workspace=join(root,'workspace'),audit=join(root,'audit');
for(const p of [local,mapping,workspace,audit])mkdirSync(p,{mode:0o700});
const publicConfig=join(local,'public-runtime-config.json'),nodeIdentity=join(local,'node-identity.json');
writeFileSync(publicConfig,JSON.stringify({schemaVersion:1,projectRef:'a'.repeat(20),url:'https://example.supabase.co',publishableKey:'sb_publishable_'+('x'.repeat(24))})+'\n',{mode:0o600});
writeFileSync(nodeIdentity,JSON.stringify({schemaVersion:1,nodeId:randomUUID(),nodeName:'B-S3D2 test node',platform:'macos',createdAt:Date.now()})+'\n',{mode:0o600});
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
let child=null,stderr='';
try{
  child=spawn(process.execPath,[fileURLToPath(new URL('./bs3d2-live-fixture-server.mjs',import.meta.url))],{env:{...process.env,
    BS0_FIXTURE_PORT:String(port),BS0_PUBLIC_ORIGIN:'https://fixture.example.invalid',BS3A_PUBLIC_CONFIG_PATH:publicConfig,
    BS3A_NODE_IDENTITY_PATH:nodeIdentity,BS3A_MAPPING_STATE_DIR:mapping,BS3A_WORKSPACE_ROOT_ID:'fixture-root',BS3A_WORKSPACE_ROOT_PATH:workspace,
    BS3D2_AUDIT_STATE_DIR:audit,BS3D2_ENABLE_GIT_CANARY:'1',BS3D2_CANARY_PROJECT:'bs2a-team-staging',BS3D2_CLONE_DIRECTORY:'bs3d2-canary-clone',
    BS3D2_REPOSITORY_URL:'https://github.com/example/canary.git',BS3D2_BRANCH_NAME:'bs3d2-oauth-canary',BS3D2_CANARY_FILE:'oauth-canary.txt',
    BS3D2_CANARY_CONTENT:'BS3D2_OAUTH_GIT_CANARY\n',BS3D2_COMMIT_MESSAGE:'test: B-S3D-2 OAuth Git canary',BS3D2_PR_TITLE:'B-S3D-2 OAuth Git Canary',
    BS3D2_PR_BODY:'Automated staging canary; no merge requested.',BS3D2_MAP_OPERATION_ID:randomUUID(),BS3D2_UNMAP_OPERATION_ID:randomUUID(),
    BS3D2_NATIVE_CREATE_BIN:'/fixture/create',BS3D2_NATIVE_CREATE_SHA256:'a'.repeat(64),BS3D2_NATIVE_REPLACE_BIN:'/fixture/replace',BS3D2_NATIVE_REPLACE_SHA256:'b'.repeat(64),
    BS3D2_NATIVE_MKDIR_BIN:'/fixture/mkdir',BS3D2_NATIVE_MKDIR_SHA256:'c'.repeat(64),BS3D2_NATIVE_MOVE_BIN:'/fixture/move',BS3D2_NATIVE_MOVE_SHA256:'d'.repeat(64),
    BS3D2_NATIVE_DELETE_BIN:'/fixture/delete',BS3D2_NATIVE_DELETE_SHA256:'e'.repeat(64)},stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',x=>stderr+=String(x).slice(0,1000));
  let health=null;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('FIXTURE_EARLY_EXIT '+stderr);
    try{const r=await fetch(`http://127.0.0.1:${port}/healthz`);if(r.status===200){health=await r.json();break;}}catch{}
    await delay(50);
  }
  assert.ok(health,'healthz unavailable');
  assert.equal(health.status,'live');assert.equal(health.gitCanaryEnabled,true);
  assert.equal(health.gitEffectTools.length,13);assert.ok(health.gitEffectTools.includes('git_clone_repository'));assert.ok(health.gitEffectTools.includes('github_create_pull_request'));
  assert.deepEqual(health.fileEffectTools,['fs_create_file']);assert.deepEqual(health.processEffectTools,[]);assert.deepEqual(health.dbBackedMutations,['runtime_map_project','runtime_unmap_project']);
  assert.equal(health.mappingCount,0);assert.equal(health.auditRecordCount,0);
  const serialized=JSON.stringify(health);assert.doesNotMatch(serialized,/sb_publishable_|\/private\/|\/Volumes\/|\/Users\/|github\.com\/example/);
  const unauth=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource/);
  console.log('PASS B-S3D-2 fixture exposes exact semantic Git/GitHub canary effects with only one bounded file-create helper');
  console.log('PASS process effects remain disabled; health is path/secret/repository-free and unauthenticated MCP remains OAuth-challenged');
  console.log('BUSINESS_S3D2_LIVE_FIXTURE_SMOKE=PASS');
} finally {
  if(child){child.kill('SIGTERM');await delay(150);}
  rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
