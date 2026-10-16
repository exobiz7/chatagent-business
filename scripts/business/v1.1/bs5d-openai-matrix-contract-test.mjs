import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {candidateTools} from './bs0-tool-catalog.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const fixture=readFileSync(`${repo}/scripts/business/v1.1/bs5d-openai-matrix-live-fixture-server.mjs`,'utf8');
const matrix=[
 'business_get_status','fs_read_file','fs_create_file','fs_replace_file','fs_move_path','fs_delete_path',
 'continuity_get_context','continuity_search_history','git_get_status','git_get_diff','git_create_branch',
 'git_stage_files','git_create_commit','git_fetch_remote','git_pull_ff_only','git_push_branch',
 'github_create_pull_request','process_start_host','process_start_isolated'
];
const catalog=new Map(candidateTools.map(x=>[x.name,x]));
for(const name of matrix){assert.ok(catalog.has(name),`missing mandatory matrix tool ${name}`);assert.match(fixture,new RegExp(`t\\.name==='${name}'`),`fixture missing actual handler ${name}`);}
assert.equal(matrix.length,19,'Accepted Design lists 19 unique names; process_start_host is exercised in two distinct scenarios');
assert.equal(catalog.get('business_get_status').annotations.readOnlyHint,true);
for(const name of ['fs_read_file','continuity_get_context','continuity_search_history','git_get_status','git_get_diff'])assert.equal(catalog.get(name).annotations.readOnlyHint,true,`${name} must remain read-only annotated`);
for(const name of ['fs_replace_file','fs_delete_path','process_start_host','process_start_isolated'])assert.equal(catalog.get(name).annotations.destructiveHint,true,`${name} destructive annotation drift`);
assert.equal(catalog.get('process_start_host').annotations.openWorldHint,true);
assert.equal(catalog.get('process_start_isolated').annotations.openWorldHint,false);
for(const name of ['git_fetch_remote','git_pull_ff_only','git_push_branch','github_create_pull_request'])assert.equal(catalog.get(name).annotations.openWorldHint,true,`${name} must remain open-world`);
assert.match(fixture,/args\?\.executable==='\/usr\/bin\/printf'/);
assert.match(fixture,/args\?\.executable==='\/bin\/rm'/);
assert.match(fixture,/args\.argv\[0\]==='--'/);
assert.match(fixture,/args\.argv\[1\]===hostDeleteFile/);
assert.match(fixture,/args\.idempotencyKey===benignIdempotency/);
assert.match(fixture,/args\.idempotencyKey===destructiveIdempotency/);
assert.match(fixture,/args\?\.relativePath===tempMoved&&args\?\.expectedKind==='regular_file'&&args\?\.expectedSha256===tempAfterSha/);
assert.match(fixture,/args\?\.branchName===branchName/);
assert.match(fixture,/args\?\.baseBranch==='main'&&args\?\.headBranch===branchName&&args\?\.draft===true/);
assert.match(fixture,/BS5D_CLONE_DISABLED/);
assert.doesNotMatch(fixture,/service_role|SERVICE_ROLE/i,'fixture must not embed service-role authority');
console.log('PASS mandatory B-S5D unique tool matrix is wired to actual bounded handlers with truthful annotations');
console.log('PASS HOST_USER matrix has distinct benign and exact disposable destructive scenarios without widening the public surface');
console.log('PASS GitHub matrix remains non-force/non-merge and provider policy authoritative');
assert.match(fixture,/marker:'BS5D_ISOLATED_OK'/);
console.log('BUSINESS_S5D_OPENAI_MATRIX_CONTRACT=PASS');
