# B-S5E — Provider Governance / Hosted-CI Readiness

Date: 2026-10-14 (resolved 2026-10-16)
Phase: B-S5E
Status: RESOLVED / PASS
Production mutation: NO
Provider mutation: YES — explicitly authorized repository visibility + branch-protection configuration
Repository visibility change: YES — canonical and canary repositories changed PRIVATE -> PUBLIC by explicit user authorization
OAuth scope escalation: NO

## 1. Objective

Resolve or precisely classify the two remaining B-S5 external-provider blockers after B-S5D closure:

1. real GitHub branch-protection / ruleset / required-review governance for private repositories;
2. GitHub-hosted macOS CI readiness for the current v1.1 branch/PR.

The work unit must not weaken provider policy, publish a private repository, increase billing/spending, change the GitHub plan, install a self-hosted runner, widen OAuth scopes, or enter B-S6 without explicit authorization.

## 2. Reproducible read-only probe

Added:

- `scripts/business/v1.1/bs5e-provider-readiness-probe.mjs`
- `scripts/business/v1.1/bs5e-provider-readiness-contract-test.mjs`

The live probe performs GitHub API GET operations only. It reads branch protection, repository rulesets, Actions permissions, check-runs, and check annotations. It does not contain provider mutation methods, `gh auth refresh`, repo visibility changes, PR close/merge actions, or service-role authority.

Contract marker:

`BUSINESS_S5E_PROVIDER_READINESS_CONTRACT=PASS`

The contract test is part of `test:ci`; the credential-dependent live probe is intentionally not run by CI.

## 3. Canonical repository provider result

Repository: `exobiz7/chatagent-business` (PRIVATE)
Branch: `main`
Probe head: `eb0f955989024c9710b68578ec6651ce1c07395c`

Read-only provider probe result:

- branch protection: `BLOCKED_GITHUB_PRIVATE_PLAN`;
- rulesets: `BLOCKED_GITHUB_PRIVATE_PLAN`;
- exact provider response: `Upgrade to GitHub Pro or make this repository public to enable this feature.`;
- repository Actions: enabled;
- allowed actions: `all`;
- default workflow permissions: `read`;
- overall: `BLOCKED_EXTERNAL_PROVIDER_ACCOUNT_OR_POLICY`.

The same branch-protection/ruleset 403 was independently reproduced with direct `gh api` calls.

## 4. Disposable canary repository provider result

Repository: `exobiz7/chatagent-business-v11-canary` (PRIVATE)
Branch: `main`

Read-only provider probe result:

- branch protection: `BLOCKED_GITHUB_PRIVATE_PLAN`;
- rulesets: `BLOCKED_GITHUB_PRIVATE_PLAN`;
- exact provider response: `Upgrade to GitHub Pro or make this repository public to enable this feature.`;
- repository Actions: enabled;
- provider-governance ready: false.

Therefore the blocker is not repository-specific configuration drift. Both private repositories are constrained by the current GitHub account/plan capability.

## 5. Hosted macOS CI root cause

Workflow: `.github/workflows/personal-macos-ci.yml`
Workflow name: `ChatAgent Business macOS hosted CI`
Runner label: `macos-latest`

Current closure head:
`eb0f955989024c9710b68578ec6651ce1c07395c`

PR run:
- run `38581119717`;
- check/job `115910957505`;
- final conclusion: `failure`;
- runner assigned: none;
- executed steps: 0.

GitHub failure annotation:

`The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings`

Push run:
- run `38581106864`;
- check/job `115910919091`;
- final conclusion: `cancelled`/workflow failure;
- runner assigned: none;
- executed steps: 0.

GitHub failure annotation:

`The job was not acquired by Runner of type hosted even after multiple attempts`

Both runs also contained GitHub notices that macOS arm64 runners may experience longer queues because of capacity constraints.

The provider-readiness probe classifies the primary hosted-CI status as:

`BLOCKED_GITHUB_BILLING_OR_SPENDING_LIMIT`

and separately records:

- hosted runner acquisition blocker: true;
- macOS ARM64 capacity notice: true.

The workflow usage endpoint returned `billable: {}` for the current cycle. No hosted runner step was observed for these failed/queued attempts.

## 6. What is *not* failing

The current evidence does not support a code/test-step failure:

- `npm run test:ci` on the authoritative Mac Studio completed successfully at B-S5D closure;
- the GitHub jobs did not acquire a runner;
- `steps=[]` and no checkout/setup/test step began;
- repository Actions are enabled and `allowed_actions=all`;
- the workflow YAML parses and is accepted by GitHub;
- no hosted test log exists because execution never reached the first step.

Changing application code or the test suite cannot repair this provider/account blocker.

## 7. Required external actions

### Preferred private-repository path

To satisfy the accepted Business v1.1 governance model without making repositories public:

1. enable a GitHub plan that supports branch protection/rulesets for private repositories (GitHub Pro or an applicable higher plan);
2. resolve the GitHub Actions Billing & plans condition reported by GitHub — failed payment and/or insufficient Actions spending limit;
3. rerun the B-S5E read-only probe;
4. configure and verify main-branch provider policy (required PR/review and required status check as accepted for this project);
5. rerun a disposable non-force branch/PR canary and prove the semantic ChatAgent surface cannot bypass the provider policy;
6. rerun GitHub/macOS hosted CI and require actual runner assignment and test-step success before B-S6.

No account or billing change was attempted in this work unit.

### Public-canary alternative

A disposable PUBLIC canary could make GitHub Free branch-protection/ruleset capability available for a bounded provider-policy non-bypass rehearsal, but creating or publishing such a repository requires explicit user authorization. It does not silently change the canonical private repository's production governance posture.

No public repository was created.

### Self-hosted runner

No self-hosted GitHub runner was installed. A self-hosted Mac could avoid GitHub-hosted runner billing, but it would change the independence/trust properties of the hosted-CI gate and therefore is not adopted as an implicit substitute for the Accepted Design's GitHub/macOS hosted-CI evidence.

## 8. Initial diagnostic gate decision — superseded 2026-10-16

This section records the original private-repository diagnosis and is superseded by the authorized resolution in section 10.


B-S5E diagnostic/readiness work: COMPLETE.

The external blockers are now evidence-backed and reproducibly classified:

- `BUSINESS_S5E_BRANCH_PROTECTION = BLOCKED_GITHUB_PRIVATE_PLAN`
- `BUSINESS_S5E_RULESETS = BLOCKED_GITHUB_PRIVATE_PLAN`
- `BUSINESS_S5E_HOSTED_CI = BLOCKED_GITHUB_BILLING_OR_SPENDING_LIMIT`
- `BUSINESS_S5E_PROVIDER_ACCOUNT_ACTION_REQUIRED = YES`

B-S5 remains `IN_PROGRESS / EXTERNAL PROVIDER GOVERNANCE BLOCKED` because the Accepted Design requires `BUSINESS_S5_REMOTE_COLLAB=PASS` before B-S5 can close.

Do not enter B-S6 production cutover until the external provider/account conditions are resolved and the resulting provider policy + hosted macOS CI are revalidated.
## 9. Regression

Authoritative Node: `v24.21.0`.

`npm run test:business:bs5e` -> PASS.

`npm run test:ci` -> `TEST_CI_EXIT=0`, 96 seconds. The full B-S1 through B-S5E regression passed with the B-S5E GET-only contract included.
## 10. Authorized public-repository resolution — 2026-10-16

The user explicitly authorized public repository conversion instead of a GitHub Pro upgrade. Before publication, the canonical repository and canary repository were scanned for high-risk tracked/history token and private-key patterns; both scans returned zero matches.

Repositories were then changed from PRIVATE to PUBLIC:

- `exobiz7/chatagent-business` — PUBLIC;
- `exobiz7/chatagent-business-v11-canary` — PUBLIC.

Immediately after the visibility change, the prior HTTP 403 plan errors disappeared. The classic branch-protection API became available and the rulesets API returned normally.

Both `main` branches now enforce:

- strict required status checks;
- one approving review;
- stale-review dismissal;
- administrator enforcement;
- required conversation resolution;
- linear history;
- force push disabled;
- branch deletion disabled.

Required checks:

- canonical `main`: `standalone`;
- canary `main`: `provider-guard`.

Canary governance workflow baseline commit: `aa952db02e8d8890238bdbeba454b1898a7b595e`.

### Protected-PR non-bypass proof

Disposable canary PR #5 used head `161520f62ff056aaa7322dcc7b6e7ccabdb7e960`. Its required `provider-guard` check completed `SUCCESS`, but GitHub still reported:

- `reviewDecision=REVIEW_REQUIRED`;
- `mergeStateStatus=BLOCKED`.

The PR was closed unmerged and its feature branch was deleted. This proves the required CI check does not silently satisfy or bypass the independent review requirement.

### Remote-collaboration revalidation under protection

B-S5B live remote collaboration was rerun against the protected public canary repository. It passed semantic clone/map/fetch/ff-only-pull, semantic edit/stage/commit, non-force feature push, Draft PR creation, TEAM checkpoint readback/search and local audit privacy while protected `main` remained unchanged.

Latest live evidence:

- PR #6: closed unmerged;
- feature branch: `bs5b-remote-collab-20261012-7ed41a`, deleted after verification;
- feature commit: `b2c0850fda3aad1ff2345d00c68059f4b2e5a4fa`;
- governed canary `main`: `aa952db02e8d8890238bdbeba454b1898a7b595e`;
- Docker residual: 0;
- marker: `BUSINESS_S5B_REMOTE_COLLAB_LIVE=PASS`.

### Hosted macOS CI resolution

Public conversion removed the earlier billing/spending-limit runner blocker: GitHub-hosted macOS runners were assigned and real steps executed. The initial full `test:ci` rerun then exposed the expected environment split: GitHub `macos-latest` has no production Docker Desktop daemon, while the full release-host suite intentionally contains real Docker/PostgreSQL effect tests.

A hosted-only runner was added that derives from canonical `test:ci` and replaces only Docker/PostgreSQL effect tests with contract/syntax coverage. The authoritative release-host `npm run test:ci` remains unchanged and continues to execute all real Docker/PostgreSQL gates.

Local validation on Mac Studio:

- `npm run test:ci:hosted` -> PASS, 75 seconds;
- `npm run test:ci` -> PASS, 100 seconds.

Implementation head: `6e5c5bf40202194dc0bd2a45a634752276aed2fc`.

GitHub-hosted macOS results for that head:

- push run `38909036153` -> SUCCESS;
- PR run `38909043430` -> SUCCESS;
- both executed checkout, setup-node, npm ci, hosted macOS tests and release-host-gate documentation steps.

The strengthened read-only B-S5E probe reports `overall=READY` for both canonical and canary repositories. No OAuth scope escalation, self-hosted runner installation, production mutation or B-S6 cutover occurred.

Non-blocking provider notices remain:

- GitHub warns that `actions/checkout@v4` / `actions/setup-node@v4` target the deprecated Node.js 20 action runtime and are currently forced to Node.js 24;
- GitHub may report macOS ARM64 capacity queue notices.

These are maintenance observations, not B-S5 gate failures.

## 11. Final B-S5E gate decision

```text
BUSINESS_S5E_PROVIDER_READINESS_CONTRACT=PASS
BUSINESS_S5E_HOSTED_CI_CONTRACT=PASS
BUSINESS_S5E_CANONICAL_BRANCH_PROTECTION=PASS
BUSINESS_S5E_CANARY_BRANCH_PROTECTION=PASS
BUSINESS_S5E_PROTECTED_PR_NON_BYPASS=PASS
BUSINESS_S5E_HOSTED_CI=PASS
BUSINESS_S5E_PROVIDER_ACCOUNT_ACTION_REQUIRED=NO
```

B-S5E is **ACCEPTED / CLOSED**.
