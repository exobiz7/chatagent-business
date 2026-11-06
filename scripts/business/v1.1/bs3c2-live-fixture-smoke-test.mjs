import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const source=readFileSync(new URL('./bs3c2-live-fixture-server.mjs',import.meta.url),'utf8');
for(const needle of ['BusinessSemanticFileService','BusinessLocalEffectAudit','BS3C2_MAPPING_CANARY_SCOPE_DENIED','BS3C2_FS_CANARY_SCOPE_DENIED','canaryWorkspaceRelative'])assert.ok(source.includes(needle),`missing ${needle}`);
assert.ok(source.includes('const processEffectTools=[]'));
assert.match(source,/fs_create_file/);assert.match(source,/fs_replace_file/);assert.match(source,/fs_patch_file/);assert.match(source,/fs_move_path/);assert.match(source,/fs_delete_path/);
assert.doesNotMatch(source,/processService\.startHost|process_start_host.*return result/,'B-S3C-2 fixture must never activate host process effect');

const root=mkdtempSync(join(tmpdir(),'business-bs3c2-fixture-'));
const local=join(root,'local'),mapping=join(root,'mapping'),workspace=join(root,'workspace'),audit=join(root,'audit');
mkdirSync(local,{mode:0o700});mkdirSync(mapping,{mode:0o700});mkdirSync(workspace,{mode:0o700});mkdirSync(audit,{mode:0o700});
mkdirSync(join(workspace,'canary'),{mode:0o700});
const publicConfig=join(local,'public-runtime-config.json'),nodeIdentity=join(local,'node-identity.json');
writeFileSync(publicConfig,JSON.stringify({schemaVersion:1,projectRef:'a'.repeat(20),url:'https://example.supabase.co',publishableKey:'sb_publishable_'+('x'.repeat(24))})+'\n',{mode:0o600});
const nodeId=randomUUID();
writeFileSync(nodeIdentity,JSON.stringify({schemaVersion:1,nodeId,nodeName:'B-S3C2 test node',platform:'macos',createdAt:Date.now()})+'\n',{mode:0o600});
const dummy=join(local,'dummy-native');writeFileSync(dummy,'dummy',{mode:0o700});
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
let child=null,stderr='';
try{
  child=spawn(process.execPath,[fileURLToPath(new URL('./bs3c2-live-fixture-server.mjs',import.meta.url))],{env:{...process.env,
    BS0_FIXTURE_PORT:String(port),BS0_PUBLIC_ORIGIN:'https://fixture.example.invalid',BS3A_PUBLIC_CONFIG_PATH:publicConfig,
    BS3A_NODE_IDENTITY_PATH:nodeIdentity,BS3A_MAPPING_STATE_DIR:mapping,BS3A_WORKSPACE_ROOT_ID:'fixture-root',BS3A_WORKSPACE_ROOT_PATH:workspace,
    BS3C2_AUDIT_STATE_DIR:audit,BS3C2_ENABLE_FS_CANARY:'1',BS3C2_CANARY_PROJECT:'bs2a-team-staging',BS3C2_CANARY_WORKSPACE_RELATIVE:'canary',
    BS3C2_MAP_OPERATION_ID:randomUUID(),BS3C2_UNMAP_OPERATION_ID:randomUUID(),
    BS3C2_NATIVE_CREATE_BIN:dummy,BS3C2_NATIVE_CREATE_SHA256:'a'.repeat(64),BS3C2_NATIVE_REPLACE_BIN:dummy,BS3C2_NATIVE_REPLACE_SHA256:'a'.repeat(64),
    BS3C2_NATIVE_MKDIR_BIN:dummy,BS3C2_NATIVE_MKDIR_SHA256:'a'.repeat(64),BS3C2_NATIVE_MOVE_BIN:dummy,BS3C2_NATIVE_MOVE_SHA256:'a'.repeat(64),
    BS3C2_NATIVE_DELETE_BIN:dummy,BS3C2_NATIVE_DELETE_SHA256:'a'.repeat(64)},stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',x=>stderr+=String(x).slice(0,2000));
  let health=null;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('FIXTURE_EARLY_EXIT '+stderr);
    try{const r=await fetch(`http://127.0.0.1:${port}/healthz`);if(r.status===200){health=await r.json();break;}}catch{}
    await delay(50);
  }
  assert.ok(health,'healthz unavailable');assert.equal(health.status,'live');assert.equal(health.fileCanaryEnabled,true);
  assert.deepEqual(health.fileEffectTools,['fs_list_directory','fs_get_path_info','fs_read_file','fs_get_file_hash','fs_create_directory','fs_create_file','fs_replace_file','fs_patch_file','fs_move_path','fs_delete_path']);
  assert.deepEqual(health.processEffectTools,[]);assert.equal(health.mappingCount,0);assert.equal(health.auditRecordCount,0);
  const serialized=JSON.stringify(health);assert.doesNotMatch(serialized,/sb_publishable_|\/private\/|audit-state|workspace\/workspace|dummy-native/);
  const unauth=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource/);
  console.log('PASS B-S3C-2 fixture exposes only bounded semantic filesystem effects while process/Git effects remain probes');
  console.log('PASS health is path/secret-free and unauthenticated MCP remains OAuth-challenged');
  console.log('BUSINESS_S3C2_LIVE_FIXTURE_SMOKE=PASS');
} finally {
  if(child){child.kill('SIGTERM');await delay(150);}
  rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
