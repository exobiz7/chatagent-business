import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=mkdtempSync(join(tmpdir(),'business-bs3b3-fixture-'));
const local=join(root,'local'),mapping=join(root,'mapping'),workspace=join(root,'workspace');
mkdirSync(local,{mode:0o700});mkdirSync(mapping,{mode:0o700});mkdirSync(workspace,{mode:0o700});
const publicConfig=join(local,'public-runtime-config.json'),nodeIdentity=join(local,'node-identity.json');
writeFileSync(publicConfig,JSON.stringify({schemaVersion:1,projectRef:'a'.repeat(20),url:'https://example.supabase.co',publishableKey:'sb_publishable_'+('x'.repeat(24))})+'\n',{mode:0o600});
writeFileSync(nodeIdentity,JSON.stringify({schemaVersion:1,nodeId:randomUUID(),nodeName:'B-S3B3 test node',platform:'macos',createdAt:Date.now()})+'\n',{mode:0o600});
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
let child=null,stderr='';
try{
  child=spawn(process.execPath,[fileURLToPath(new URL('./bs3b3-live-fixture-server.mjs',import.meta.url))],{env:{...process.env,
    BS0_FIXTURE_PORT:String(port),BS0_PUBLIC_ORIGIN:'https://fixture.example.invalid',BS3A_PUBLIC_CONFIG_PATH:publicConfig,
    BS3A_NODE_IDENTITY_PATH:nodeIdentity,BS3A_MAPPING_STATE_DIR:mapping,BS3A_WORKSPACE_ROOT_ID:'fixture-root',
    BS3A_WORKSPACE_ROOT_PATH:workspace,BS3B3_PROCESS_STATE_DIR:join(root,'process-state'),BS3B3_ENABLE_PROCESS_CANARY:'1',
    BS3B3_CANARY_PROJECT:'bs2a-team-staging',BS3B3_CANARY_EXECUTABLE:process.execPath,
    BS3B3_CANARY_SHORT_KEY:randomUUID(),BS3B3_CANARY_LONG_KEY:randomUUID()},stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',x=>stderr+=String(x).slice(0,1000));
  let health=null;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('FIXTURE_EARLY_EXIT '+stderr);
    try{const r=await fetch(`http://127.0.0.1:${port}/healthz`);if(r.status===200){health=await r.json();break;}}catch{}
    await delay(50);
  }
  assert.ok(health,'healthz unavailable');
  assert.equal(health.status,'live');assert.equal(health.processCanaryEnabled,true);
  assert.deepEqual(health.processEffectTools,['process_start_host','process_get_status','process_read_output','process_terminate_job']);
  assert.equal(health.mappingCount,0);assert.equal(health.processBindingCount,0);
  const serialized=JSON.stringify(health);
  assert.doesNotMatch(serialized,/sb_publishable_|\/private\/|process-state|workspace\/workspace/);
  const unauth=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource/);
  console.log('PASS B-S3B-3 fixture starts with exact temporary HOST_USER canary gate and bounded health');
  console.log('PASS unauthenticated MCP remains OAuth-challenged before any process effect');
  console.log('BUSINESS_S3B3_LIVE_FIXTURE_SMOKE=PASS');
} finally {
  if(child){child.kill('SIGTERM');await delay(150);}
  rmSync(root,{recursive:true,force:true});
}
