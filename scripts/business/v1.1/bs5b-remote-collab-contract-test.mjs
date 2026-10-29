import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const gitService=readFileSync(repo+'/scripts/business/v1.1/runtime/business-semantic-git-service.mjs','utf8');
const catalog=readFileSync(repo+'/scripts/business/v1.1/bs0-tool-catalog.mjs','utf8');
const accepted=readFileSync(repo+'/docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md','utf8');

for(const name of ['git_clone_repository','git_fetch_remote','git_pull_ff_only','git_push_branch','github_create_pull_request'])
  assert.match(catalog,new RegExp(name));
assert.match(gitService,/\['push','--porcelain',info\.name,`refs\/heads\/\$\{name\}:refs\/heads\/\$\{name\}`\]/);
assert.doesNotMatch(gitService,/--force|force-with-lease|reset','--hard|clean','-fdx/);
assert.match(gitService,/\['pull','--ff-only','--no-rebase','--no-tags','--recurse-submodules=no'/);
assert.match(gitService,/argv=\['pr','create'/);
assert.doesNotMatch(gitService,/pr','merge|api'.*branch.*protection|rulesets/);
assert.match(accepted,/GitHub branch protection\/CI\/review cannot be bypassed/);
assert.match(accepted,/B = PERSONAL_NODE/);
assert.match(accepted,/B commit\/push\/PR path succeeds under real repository policy/);

console.log('PASS B-S5B keeps clone/fetch/ff-only-pull/non-force-push/Draft-PR as focused semantic operations');
console.log('PASS semantic Git/GitHub surface contains no force-push, merge, branch-protection or ruleset bypass primitive');
console.log('PASS provider branch protection/CI/review remains external authority for live B-S5B verification');
console.log('BUSINESS_S5B_REMOTE_COLLAB_CONTRACT=PASS');
