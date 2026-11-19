import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const read=relative=>readFileSync(`${repo}/${relative}`);
const text=relative=>read(relative).toString('utf8');
const gitBlobSha1=relative=>{
  const body=read(relative);
  return createHash('sha1').update(Buffer.from(`blob ${body.length}\0`)).update(body).digest('hex');
};

const manifest=JSON.parse(text('docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json'));
assert.equal(manifest.sourceCommit,'da391bf9c38697d706049b3b5d7bd2c2ba4ba28e');
assert.equal(manifest.sourceTag,'v1.1.1');

const frozen={
  'scripts/l1/durable-host-processes.mjs':'27a872de687df1f43fd1ab0c4783ac11a181ba94',
  'scripts/l1/durable-process-runner.mjs':'7e6d6dc4a9302e7d8126cd34ff489c00d722e344',
  'scripts/l1/broker-core.mjs':'f03bb640bbe1e5f9a3f7d9d00dfbab0b21f7cf4d',
  'scripts/l1/l6-durable-worker.mjs':'478d7037f1597dc8a57c983dd5efd1b892878e56'
};
for(const [relative,expected] of Object.entries(frozen)){
  assert.equal(gitBlobSha1(relative),expected,`${relative} must remain exact frozen Personal donor bytes`);
}
assert.equal(frozen['scripts/l1/durable-host-processes.mjs'],manifest.core['scripts/l1/durable-host-processes.mjs']);

const durable=text('scripts/l1/durable-host-processes.mjs');
const runner=text('scripts/l1/durable-process-runner.mjs');
const brokerServer=text('scripts/l1/broker-server.mjs');
const catalog=text('scripts/business/v1.1/bs0-tool-catalog.mjs');

for(const token of ['reserveAction','bindAction','runnerStartToken','RECOVERY_REQUIRED','MAX_RUNNING=4','MAX_READ=16384','MAX_OUTPUT=1024*1024'])
  assert.match(durable,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(durable,/process\.kill\(a\.runnerPid,"SIGTERM"\)/,'termination must target only the verified owned supervisor');
assert.doesNotMatch(durable,/process\.kill\([^a][^,]*,"SIGTERM"\)/,'durable core must not signal caller-supplied arbitrary PIDs');
assert.match(runner,/signalGroup\("SIGTERM"\)/);
assert.match(runner,/signalGroup\("SIGKILL"\)/);

assert.match(brokerServer,/new DurableHostProcesses\(broker\)/,'legacy local HTTP seam must still dispatch to the durable donor when enabled');
assert.match(brokerServer,/L1_DURABLE_PROCESS_ENABLED/);
assert.match(brokerServer,/\["start","status","read","input","stop"\]/);

for(const name of ['process_start_host','process_get_status','process_read_output','process_terminate_job'])
  assert.match(catalog,new RegExp(`def\\('${name}'`));
assert.match(catalog,/process_start_host'[\s\S]*destructiveHint:true,openWorldHint:true/);
assert.match(catalog,/process_read_output'[\s\S]*maxBytes:z\.number\(\)\.int\(\)\.min\(1\)\.max\(524288\)/);
assert.match(catalog,/process_read_output'[\s\S]*waitMs:z\.number\(\)\.int\(\)\.min\(0\)\.max\(30000\)/);

console.log('PASS exact frozen Personal durable process core provenance is preserved in Business');
console.log('PASS durable lifecycle/idempotency/recovery/owned-termination invariants remain present');
console.log('PASS Business public process contract remains unchanged; maxBytes/waitMs adaptation stays B-S3B-2');
console.log('BUSINESS_S3B1_DURABLE_DONOR_PARITY=PASS');
