import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const manifest=JSON.parse(readFileSync(`${repo}/docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json`,'utf8'));
const catalog=readFileSync(`${repo}/scripts/business/v1.1/bs0-tool-catalog.mjs`,'utf8');
const mapping=readFileSync(`${repo}/scripts/business/v1.1/runtime/local-workspace-registry.mjs`,'utf8');
const mappingService=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-runtime-mapping-service.mjs`,'utf8');
const router=readFileSync(`${repo}/scripts/business/v1.1/runtime/business-runtime-router.mjs`,'utf8');
const lease=readFileSync(`${repo}/scripts/business/v1.1/control/runtime-authorization-lease.mjs`,'utf8');

assert.equal(manifest.sourceCommit,'da391bf9c38697d706049b3b5d7bd2c2ba4ba28e');
assert.equal(manifest.core['scripts/l1/durable-host-processes.mjs'],'27a872de687df1f43fd1ab0c4783ac11a181ba94');
assert.equal(manifest.core['scripts/l1/broker-server.mjs'],'5ee4d6078207031c3b84bc7e238d5c8e3b27d331');

for(const name of ['runtime_map_project','runtime_unmap_project'])assert.match(catalog,new RegExp(`def\\('${name}'`));
assert.match(catalog,/runtime_map_project'[\s\S]*runtimeNodeId,workspaceRootId,workspaceRelativePath/);
assert.match(catalog,/runtime_unmap_project'[\s\S]*expectedMappingRevision/);
assert.match(router,/BUSINESS_RUNTIME_NODE_UNAVAILABLE/);
assert.match(router,/BUSINESS_RUNTIME_NODE_REQUIRED/);

assert.match(mapping,/workspace-mappings\.json/);
assert.match(mapping,/BUSINESS_PROJECT_MAPPING_SYMLINK_DENIED/);
assert.match(mapping,/BUSINESS_MAPPING_REVISION_CONFLICT/);
assert.match(mapping,/BUSINESS_IDEMPOTENCY_CONFLICT/);
assert.match(mapping,/expectedGitRemoteUrl/);
assert.match(mapping,/mappingRevision:doc\.nextMappingRevision\+\+/);
assert.doesNotMatch(mapping,/service_role|supabase.*secret/i);
assert.match(mappingService,/authorizeProject\(projectId\)/);
assert.match(mappingService,/runtimeRegistry\.status\(runtimeNodeId\)/);
assert.match(mappingService,/assertRuntimeAuthorization/);
assert.match(mappingService,/BUSINESS_PROJECT_AUTHORIZATION_DENIED/);
assert.doesNotMatch(mappingService,/memberId|userId|owner_user_id/i,'mapping service must not accept caller-supplied identity authority');

assert.match(router,/BUSINESS_RUNTIME_NODE_UNAVAILABLE/);
assert.match(router,/BUSINESS_RUNTIME_NODE_REQUIRED/);
assert.match(router,/BUSINESS_RUNTIME_NODE_DENIED/);
assert.match(router,/assertRuntimeAuthorization/);
assert.match(router,/publicRuntimeRoute/);
assert.match(lease,/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);
assert.match(lease,/BUSINESS_SHARED_HOST_POWER_DENIED/);
assert.match(lease,/BUSINESS_AUTH_LEASE_EXPIRED/);

console.log('PASS B-S3A freezes Personal durable-host-process donor before Business HOST_USER integration');
console.log('PASS runtime mapping surface stays explicit and separate from Git clone/cloud project metadata');
console.log('PASS local mapping state is node-owned and route admission reuses B-S1 lease/ownership authority');
console.log('BUSINESS_S3A_RUNTIME_ROUTING_CONTRACT=PASS');
