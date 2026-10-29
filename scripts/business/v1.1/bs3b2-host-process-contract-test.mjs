import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {candidateToolByName} from './bs0-tool-catalog.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const blob=path=>execFileSync('/usr/bin/git',['hash-object',`${repo}/${path}`],{encoding:'utf8'}).trim();
const manifest=JSON.parse(readFileSync(`${repo}/docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json`,'utf8'));
const service=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-host-process-service.mjs`,'utf8');
const registry=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-process-registry.mjs`,'utf8');
const broker=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-durable-process-broker.mjs`,'utf8');

assert.equal(blob('scripts/l1/durable-host-processes.mjs'),manifest.core['scripts/l1/durable-host-processes.mjs']);
assert.equal(blob('scripts/l1/durable-process-runner.mjs'),'7e6d6dc4a9302e7d8126cd34ff489c00d722e344');
assert.equal(blob('scripts/l1/broker-core.mjs'),'f03bb640bbe1e5f9a3f7d9d00dfbab0b21f7cf4d');

const start=candidateToolByName.get('process_start_host');
const status=candidateToolByName.get('process_get_status');
const read=candidateToolByName.get('process_read_output');
const stop=candidateToolByName.get('process_terminate_job');
for(const tool of [start,status,read,stop])assert.ok(tool,'all four B-S3B public tools must remain published');
assert.deepEqual(start.annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:true});
assert.deepEqual(status.annotations,{readOnlyHint:true,destructiveHint:false,openWorldHint:false});
assert.deepEqual(read.annotations,{readOnlyHint:true,destructiveHint:false,openWorldHint:false});
assert.deepEqual(stop.annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:false});

const startJson=JSON.stringify(start.inputSchema),statusJson=JSON.stringify(status.inputSchema),readJson=JSON.stringify(read.inputSchema),stopJson=JSON.stringify(stop.inputSchema);
for(const text of [startJson,statusJson,readJson,stopJson])assert.doesNotMatch(text,/memberId|userId|ownerId|pid/i);
assert.match(statusJson,/processId/);assert.match(readJson,/processId/);assert.match(stopJson,/processId/);
assert.match(readFileSync(`${repo}/scripts/business/v1.1/bs0-tool-catalog.mjs`,'utf8'),/maxBytes:z\.number\(\)\.int\(\)\.min\(1\)\.max\(524288\)/);
assert.match(readFileSync(`${repo}/scripts/business/v1.1/bs0-tool-catalog.mjs`,'utf8'),/waitMs:z\.number\(\)\.int\(\)\.min\(0\)\.max\(30000\)/);
assert.match(readFileSync(`${repo}/scripts/business/v1.1/bs0-tool-catalog.mjs`,'utf8'),/Project-relative working directory inside the mapped project/);

assert.match(service,/authorizeProject/);assert.match(service,/resolveBusinessRuntimeRoute/);
assert.match(service,/toolName:'process_start_host'/,'all generic host-process operations must retain host-power authority');
assert.match(service,/BUSINESS_PROCESS_CWD_MUST_BE_PROJECT_RELATIVE/);
assert.match(service,/DONOR_MAX_READ=16384/);assert.match(service,/PUBLIC_MAX_READ=524288/);assert.match(service,/PUBLIC_MAX_WAIT=30000/);
assert.match(service,/registry\.lookupForActor/);assert.match(service,/BUSINESS_PROCESS_ROUTE_STALE/);
assert.doesNotMatch(service,/service_role|FULL_HOST|pair\(|approve\(/i,'Business process service must not reuse Personal pairing/grant authority');

assert.match(registry,/business-process-bindings\.json/);assert.match(registry,/business-process-bindings\.key/);assert.match(registry,/createHmac/);assert.match(registry,/timingSafeEqual/);assert.match(registry,/actorDigest/);assert.match(registry,/mappingRevision/);
assert.match(registry,/executionMode:'HOST_USER'/);assert.match(registry,/BUSINESS_PROCESS_NOT_OWNED/);
assert.doesNotMatch(registry,/executable|argv|command output|content:/i,'registry must not persist command material or output');
assert.match(broker,/BUSINESS_HOST_PROCESS_AUTH_REQUIRED/);assert.match(broker,/MACOS_EFFECTIVE_USER/);
assert.doesNotMatch(broker,/setMode|FULL_HOST|pair\(|approve\(/i,'Business durable broker adapter must not establish Personal authority');

console.log('PASS frozen Personal durable core remains exact while Business authority is isolated in thin adapters');
console.log('PASS public process tools expose no member/PID authority and preserve truthful risk annotations');
console.log('PASS processId binding, relative cwd privacy, 512KiB composed reads, 30s wait bounds, and route revalidation are frozen');
console.log('BUSINESS_S3B2_HOST_PROCESS_CONTRACT=PASS');
