# B-S5E — Provider Governance / Hosted-CI Readiness

Date: 2026-10-14
Phase: B-S5E
Status: DIAGNOSED / EXTERNAL PROVIDER ACCOUNT ACTION REQUIRED
Production mutation: NO
Provider mutation: NO
Repository visibility change: NO
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

## 8. Gate decision

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
