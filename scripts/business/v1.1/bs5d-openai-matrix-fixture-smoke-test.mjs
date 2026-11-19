import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadOrCreateRuntimeNodeIdentity} from './control/runtime-node-identity.mjs';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const root=mkdtempSync(join(tmpdir(),'business-bs5d-smoke-'));chmodSync(root,0o700);
const cfgDir=join(root,'cfg'),mapDir=join(root,'map'),workspace=join(root,'workspace'),state=join(root,'state');
for(const p of [cfgDir,mapDir,workspace,state])mkdirSync(p,{mode:0o700});for(const p of ['audit','host','isolated'])mkdirSync(join(state,p),{mode:0o700});
const publicCfg=join(cfgDir,'public.json'),nodeFile=join(cfgDir,'node.json');
writeFileSync(publicCfg,JSON.stringify({projectRef:'abcdefghijklmnopqrst',publishableKey:'sb_publishable_abcdefghijklmnop',schemaVersion:1,url:'https://abcdefghijklmnopqrst.supabase.co'})+'\n',{mode:0o600});
const node=loadOrCreateRuntimeNodeIdentity(nodeFile,{nodeName:'B-S5D Smoke'});
new LocalWorkspaceRegistry({stateDir:mapDir,nodeId:node.nodeId,workspaceRoots:[{workspaceRootId:'smoke',path:workspace,label:'smoke'}],initialize:true});
const port=32100+(process.pid%500),serverScript=join(repo,'scripts/business/v1.1/bs5d-openai-matrix-live-fixture-server.mjs');
const env={...process.env,BS0_FIXTURE_PORT:String(port),BS0_PUBLIC_ORIGIN:'https://bs5d.example.invalid',BS3A_PUBLIC_CONFIG_PATH:publicCfg,BS3A_NODE_IDENTITY_PATH:nodeFile,BS3A_MAPPING_STATE_DIR:mapDir,BS3A_WORKSPACE_ROOT_ID:'smoke',BS3A_WORKSPACE_ROOT_PATH:workspace,BS5D_STATE_DIR:state,BS5D_ENABLE_CANARY:'0',BS5D_NATIVE_CREATE_BIN:'unused',BS5D_NATIVE_CREATE_SHA256:'unused',BS5D_NATIVE_REPLACE_BIN:'unused',BS5D_NATIVE_REPLACE_SHA256:'unused',BS5D_NATIVE_MKDIR_BIN:'unused',BS5D_NATIVE_MKDIR_SHA256:'unused',BS5D_NATIVE_MOVE_BIN:'unused',BS5D_NATIVE_MOVE_SHA256:'unused',BS5D_NATIVE_DELETE_BIN:'unused',BS5D_NATIVE_DELETE_SHA256:'unused'};
const child=spawn(process.execPath,[serverScript],{cwd:repo,env,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);
try{
 let health=null;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${port}/healthz`);if(r.ok){health=await r.json();break;}}catch{}await delay(25);}assert.ok(health,stderr||'fixture did not start');
 assert.equal(health.status,'live');assert.equal(health.matrixCanaryEnabled,false);assert.equal(health.mappingCount,0);assert.equal(health.auditRecordCount,0);assert.equal(health.hostBindingCount,0);assert.equal(health.isolatedBindingCount,0);assert.deepEqual(health.arrivalSequence,[]);
 const unauthorized=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});assert.equal(unauthorized.status,401);assert.match(unauthorized.headers.get('www-authenticate')??'',/oauth-protected-resource/);
 console.log('PASS B-S5D fixture starts no-effect with path/secret-free health and zero mapping/audit/process bindings');
 console.log('PASS unauthenticated MCP remains OAuth-challenged before any matrix effect');
 console.log('BUSINESS_S5D_OPENAI_MATRIX_FIXTURE_SMOKE=PASS');
} finally {child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1500)]);if(child.exitCode===null)child.kill('SIGKILL');rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');}
