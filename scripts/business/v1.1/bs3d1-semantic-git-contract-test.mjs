import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateTools} from './bs0-tool-catalog.mjs';

const service=readFileSync(new URL('./runtime/business-semantic-git-service.mjs',import.meta.url),'utf8');
const audit=readFileSync(new URL('./runtime/business-local-effect-audit.mjs',import.meta.url),'utf8');
const names=['git_get_status','git_get_diff','git_get_history','git_list_branches','git_create_branch','git_switch_branch','git_stage_files',
  'git_create_commit','git_clone_repository','git_fetch_remote','git_pull_ff_only','git_push_branch','github_create_pull_request'];
const tools=new Map(candidateTools.filter(x=>names.includes(x.name)).map(x=>[x.name,x]));
assert.equal(tools.size,names.length,'canonical 13-tool Git/GitHub surface must remain complete');
for(const name of names){assert.equal(tools.get(name).localEffect,true,`${name} must remain routed local effect`);assert.equal(tools.get(name).powerTool,false,`${name} must not become host power tool`);}
for(const name of ['git_get_status','git_get_diff','git_get_history','git_list_branches']){
  const a=tools.get(name).annotations;assert.deepEqual([a.readOnlyHint,a.destructiveHint,a.openWorldHint],[true,false,false]);
}
for(const name of ['git_create_branch','git_switch_branch','git_stage_files','git_create_commit']){
  const a=tools.get(name).annotations;assert.deepEqual([a.readOnlyHint,a.destructiveHint,a.openWorldHint],[false,false,false]);
}
for(const name of ['git_clone_repository','git_fetch_remote','git_pull_ff_only','git_push_branch','github_create_pull_request']){
  const a=tools.get(name).annotations;assert.deepEqual([a.readOnlyHint,a.destructiveHint,a.openWorldHint],[false,false,true]);
}
assert.match(tools.get('git_create_commit').description,/expectedStagedDiffSha256/);
assert.match(tools.get('git_pull_ff_only').description,/fast-forward/i);
assert.match(tools.get('git_push_branch').description,/without force/i);
assert.match(tools.get('github_create_pull_request').description,/Does not merge/i);
assert.match(tools.get('git_clone_repository').description,/does not create or map/i);
assert.match(candidateTools.find(x=>x.name==='process_start_host').description,/Prefer focused filesystem\/Git tools/i);

assert.match(service,/resolveBusinessRuntimeRoute/);
assert.match(service,/assertRuntimeAuthorization/,'clone must still use runtime-node authorization');
assert.match(service,/projectProfile!=='STANDARD'/,'semantic Git must be STANDARD-project only');
assert.match(service,/GIT_LITERAL_PATHSPECS:'1'/,'stage/history pathspecs must be literal');
assert.match(service,/core\.hooksPath=\/dev\/null/,'semantic Git must not execute repository hooks');
assert.match(service,/protocol\.ext\.allow=never/,'Git ext transport must remain disabled');
assert.match(service,/BUSINESS_GIT_EXTERNAL_FILTER_DENIED/,'arbitrary configured filters must fail closed');
assert.match(service,/BUSINESS_GIT_REMOTE_CONFIG_DENIED/,'arbitrary sshCommand/url rewrite must fail closed');
assert.match(service,/diff','--cached','--binary','--full-index'/,'staged digest must derive from exact binary/full-index diff');
assert.match(service,/BUSINESS_GIT_STAGED_DIFF_CONFLICT/);
assert.match(service,/pull','--ff-only','--no-rebase'/,'pull path must be ff-only');
assert.match(service,/refs\/heads\/\$\{name\}:refs\/heads\/\$\{name\}/,'push must target one same-name branch ref only');
assert.match(service,/gh|github/i);
assert.match(service,/'pr','create'/);
assert.match(service,/'--head',head/,'PR create must use explicit head to avoid implicit push/fork behavior');
assert.doesNotMatch(service,/reset\s+--hard|clean\s+-fdx|push[^\n]{0,80}--force|push[^\n]{0,80}-f(?:\W|$)|delete-remote-branch/i);
assert.doesNotMatch(service,/shell\s*:\s*true/,'Git/GitHub commands must not use a shell');

assert.match(audit,/\(\?:fs\|git\|github\)_/,'common local audit must accept focused Git/GitHub tool names');
assert.match(audit,/BRANCH_CREATE/);assert.match(audit,/CLONE/);assert.match(audit,/PR_CREATE/);
assert.match(audit,/workspaceScope/,'clone audit must support workspace-scoped effects without inventing a project mapping');
assert.doesNotMatch(audit,/argv|oldText|newText/i,'local effect audit must not persist command arguments or file patch text');

console.log('PASS canonical 13-tool Git/GitHub surface and OpenAI risk annotations remain truthful');
console.log('PASS semantic Git is STANDARD-only, mapped-route bound, shell-free, hook/filter/pathspec constrained');
console.log('PASS commit uses exact staged-diff SHA, pull is ff-only, push is one non-force branch ref, clone never maps implicitly');
console.log('PASS common local HMAC audit supports project Git and workspace clone effects without command payloads');
console.log('BUSINESS_S3D1_SEMANTIC_GIT_CONTRACT=PASS');
