import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {candidateToolByName} from './bs0-tool-catalog.mjs';
import {BusinessProcessService} from './runtime/business-process-service.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const isolated=candidateToolByName.get('process_start_isolated');
const status=candidateToolByName.get('process_get_status');
const read=candidateToolByName.get('process_read_output');
const stop=candidateToolByName.get('process_terminate_job');
assert.ok(isolated&&status&&read&&stop);
assert.deepEqual(isolated.annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:false});
assert.match(isolated.description,/network is off by default/i);assert.match(isolated.description,/rootfs is read-only/i);assert.match(isolated.description,/no Docker socket or Business credential/i);
const schema=JSON.stringify(isolated.inputSchema);assert.match(schema,/projectId/);assert.match(schema,/runtimeNodeId/);assert.match(schema,/command/);assert.match(schema,/cwd/);
for(const s of [JSON.stringify(status.inputSchema),JSON.stringify(read.inputSchema),JSON.stringify(stop.inputSchema)]){
  assert.match(s,/processId/);assert.doesNotMatch(s,/projectId|runtimeNodeId|memberId|ownerId|pid/i);
}

const registry=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-isolated-process-registry.mjs`,'utf8');
const service=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-isolated-process-service.mjs`,'utf8');
const dispatcher=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-process-service.mjs`,'utf8');
const exec=readFileSync(`${repo}/scripts/business/business-exec.mjs`,'utf8');
assert.match(registry,/business-isolated-process-bindings\.json/);assert.match(registry,/createHmac/);assert.match(registry,/executionMode:'ISOLATED'/);assert.match(registry,/xexec_/);
assert.doesNotMatch(registry,/command|cwd|outputBase64|content:/i,'isolated binding registry must not persist command/cwd/output');
assert.match(service,/toolName:'process_start_isolated'/);assert.match(service,/projectProfile!=='STANDARD'/);assert.match(service,/BUSINESS_PROCESS_ROUTE_STALE/);
assert.match(dispatcher,/HOST\.test/);assert.match(dispatcher,/ISOLATED\.test/);assert.match(dispatcher,/BUSINESS_PROCESS_NOT_OWNED/);
assert.match(exec,/status\(\{projectId,sessionId\}\)/);assert.match(exec,/--network","none/);assert.match(exec,/--read-only/);assert.match(exec,/--pids-limit/);assert.match(exec,/--cap-drop","ALL/);assert.match(exec,/docker\.sock/);

let host=0,iso=0;
const fake=(kind)=>({
  startHost(){host++;return kind;},startIsolated(){iso++;return kind;},
  getStatus(){kind==='host'?host++:iso++;return kind;},readOutput(){kind==='host'?host++:iso++;return kind;},terminateJob(){kind==='host'?host++:iso++;return kind;}
});
const d=new BusinessProcessService({hostService:fake('host'),isolatedService:fake('isolated')});
assert.equal(d.getStatus({processId:'11111111-1111-4111-8111-111111111111'}),'host');
assert.equal(d.getStatus({processId:'xexec_'+'a'.repeat(32)}),'isolated');
assert.throws(()=>d.getStatus({processId:'pid-123'}),/BUSINESS_PROCESS_NOT_OWNED/);
assert.equal(host,1);assert.equal(iso,1);

console.log('PASS process_start_isolated preserves destructive/local-but-not-open-world annotations and STANDARD Docker description');
console.log('PASS shared process follow-ups expose processId only and server dispatches disjoint host/isolated namespaces');
console.log('PASS isolated binding is HMAC-sealed and stores authority metadata without command/cwd/output');
console.log('PASS existing BusinessExecManager isolation flags remain the reused backend, with only a status read seam added');
console.log('BUSINESS_S3F1_ISOLATED_CONTRACT=PASS');
