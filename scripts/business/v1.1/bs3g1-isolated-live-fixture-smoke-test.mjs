import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';

const root=mkdtempSync(join(tmpdir(),'business-bs3g1-fixture-'));
const local=join(root,'local'),mapping=join(root,'mapping'),workspace=join(root,'workspace'),state=join(root,'state');
const audit=join(state,'audit'),bindings=join(state,'bindings');
for(const p of [local,mapping,workspace,state,audit,bindings])mkdirSync(p,{mode:0o700});
const nodeId=randomUUID(),publicConfig=join(local,'public-runtime-config.json'),nodeIdentity=join(local,'node-identity.json');
writeFileSync(publicConfig,JSON.stringify({schemaVersion:1,projectRef:'a'.repeat(20),url:'https://example.supabase.co',publishableKey:'sb_publishable_'+('x'.repeat(24))})+'\n',{mode:0o600});
writeFileSync(nodeIdentity,JSON.stringify({schemaVersion:1,nodeId,nodeName:'B-S3G1 test node',platform:'macos',createdAt:Date.now()})+'\n',{mode:0o600});
new LocalWorkspaceRegistry({stateDir:mapping,nodeId,initialize:true,workspaceRoots:[{workspaceRootId:'fixture-root',path:workspace,label:'fixture-root'}]});
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
let child=null,stderr='';
try{
 child=spawn(process.execPath,[fileURLToPath(new URL('./bs3g1-isolated-live-fixture-server.mjs',import.meta.url))],{env:{...process.env,
  BS0_FIXTURE_PORT:String(port),BS0_PUBLIC_ORIGIN:'https://fixture.example.invalid',BS3A_PUBLIC_CONFIG_PATH:publicConfig,
  BS3A_NODE_IDENTITY_PATH:nodeIdentity,BS3A_MAPPING_STATE_DIR:mapping,BS3A_WORKSPACE_ROOT_ID:'fixture-root',BS3A_WORKSPACE_ROOT_PATH:workspace,
  BS3G1_STATE_DIR:state,BS3G1_ENABLE_CANARY:'0',BS3G1_CANARY_PROJECT:'bs2a-team-staging'},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',x=>stderr+=String(x).slice(0,2000));
 let health=null;
 for(let i=0;i<60;i++){
  if(child.exitCode!==null)throw Error('FIXTURE_EARLY_EXIT '+stderr);
  try{const r=await fetch(`http://127.0.0.1:${port}/healthz`);if(r.status===200){health=await r.json();break;}}catch{}
  await delay(50);
 }
 assert.ok(health,'healthz unavailable');
 assert.equal(health.status,'live');assert.equal(health.safetyCanaryEnabled,false);
 assert.deepEqual(health.processEffectTools,[]);assert.equal(health.mappingCount,0);assert.equal(health.auditRecordCount,0);assert.equal(health.isolatedBindingCount,0);assert.deepEqual(health.arrivalSequence,[]);
 const serialized=JSON.stringify(health);assert.doesNotMatch(serialized,/sb_publishable_|\/Volumes\/|\/Users\//);
 const unauth=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource/);
 console.log('PASS B-S3G-1 isolated fixture starts no-effect by default with path/secret-free health and empty arrival baseline');
 console.log('PASS unauthenticated MCP remains OAuth-challenged before isolated effect');
 console.log('BUSINESS_S3G1_ISOLATED_FIXTURE_SMOKE=PASS');
} finally {
 if(child){child.kill('SIGTERM');await delay(150);}
 rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');
}
