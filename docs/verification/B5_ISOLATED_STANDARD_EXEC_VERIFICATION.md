# B5 Isolated STANDARD Exec — Verification Record

> Date: 2026-10-01 KST
> Baseline: B4 `100b8b8d58dddf374deeef9df099408fc5b1c1aa`
> Branch: `feat/business-b5-isolated-standard-exec`
> Result: LOCAL IMPLEMENTATION / VERIFICATION PASS

## Implemented surface

B5 adds exactly the accepted three STANDARD tools:

- `exec_command`
- `read_process`
- `terminate_process`

Configured B5 therefore exposes the fixed candidate v1 contract of 17 tools:
status 1 + read 4 + safe files 4 + continuity 5 + standard exec 3.

No package-installer, Docker-control, service-control, network-enable, arbitrary-delete,
Git commit/push, root/sudo or generic host-shell tool was added.

## Runtime identity and image pin

Actual focused testing used Docker Desktop on Apple Silicon with:

```text
Docker client/server: 29.7.2
Docker CLI canonical path:
  /Applications/Docker.app/Contents/Resources/bin/docker

Docker CLI SHA-256:
  d69813f7f735ab262a3955c4814647b7e912d23a62a3236d03d287867f4867d8

Exec image:
  node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

Image ID:
  sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

Platform:
  linux/arm64
```

The image is independent of the P8 production image/runtime.
P8 was used only as a read-only design reference.

Doctor verifies the configured canonical Docker binary SHA and exact image ID/platform
before B5 startup.

## Execution isolation

Each exec session is a disposable container with:

- only the selected registered project mounted at `/project`
- selected project mounted RW
- nested `/project/.git` mounted RO when present
- non-root numeric UID/GID
- read-only root filesystem
- network mode `none`
- all Linux capabilities dropped
- `no-new-privileges`
- PID limit 128
- memory limit 512 MiB
- CPU limit 2
- bounded 64 MiB `/tmp` tmpfs
- no Docker socket mount
- no control/deployment credential mount
- bounded explicit child environment
- offline NPM/PIP defaults

The actual container probe verified:

```text
UID != 0
Docker socket absent
secret-like environment keys absent
root filesystem write refused
pids.max = 128
outbound TCP blocked
deployment credential absent
```

The model never receives a Docker-control tool. Docker CLI access exists only inside the
trusted local Business control plane, which uses fixed lifecycle subcommands.

## Project/cwd boundary

Before execution, Business re-resolves the B1 project and requires stored profile
`STANDARD`.

The project preflight rejects:
- unsupported root identity
- Git metadata symlinks/special files
- `.gitmodules`
- `.git/commondir`
- `.git/objects/info/alternates`
- hard-linked regular files
- unsupported special files
- oversized tree beyond the bounded scan

Non-Git symlinks are skipped by preflight; because the container sees only the selected
bind mount, they cannot resolve to arbitrary host paths outside that mount.

`cwd` is relative-only and rejects absolute paths, `..`, `.git`, control characters,
backslash traversal and symlink/non-directory components.

Focused tests verified SAFE-project exec denial, cwd escape denial and strict-schema
caller environment injection denial.

## Process ownership and lifecycle

Session IDs are random bounded identifiers:
`xexec_<32 lowercase hex>`.

Session access requires both:
- current STANDARD authority for the supplied project
- session ownership by that same project ID

Verified:
- project A cannot read project B session
- SAFE project cannot read a STANDARD session
- only one session may run at once
- second concurrent start returns `EXEC_BUSY`
- explicit terminate reaches `terminated`
- timeout reaches `timed_out`
- old sessions are unknown after control-plane recreation

Business containers carry product/owner/instance/session/project labels.
Startup removes only containers with the exact deterministic Business owner label.
Runtime Stop terminates and removes its owned exec containers before the control plane exits.

No exec session is durable across control-plane recreation.

## Output contract

The manager retains at most 2 MiB per session and returns at most 512 KiB per read.
Results use base64 output plus `afterSeq / nextSeq` cursors.

A real 3 MiB stdout fixture verified:
- bounded retained window
- bounded 1 KiB requested read
- `truncated=true`
- `hasMore=true`

This test initially exposed a fast-output race when output capture used
`docker logs --follow`. B5 was corrected to start each container with
`docker start --attach`, so output capture begins with container execution.

## Timeout / terminate / cleanup race corrections

Real focused tests exposed and corrected two lifecycle races:

1. `yieldTimeMs=0` could return while Docker still reported the container as
   `created`. B5 now waits for running-or-terminal Docker state before publishing
   the session.

2. The B4 operator's graceful shutdown window could expire before B5 container cleanup.
   B5 cleanup now converges within a bounded window to owned force-removal if necessary,
   and the operator waits longer for graceful exec cleanup before any server kill.

The focused suite was run successfully in consecutive complete passes after these fixes.

## Safe Replace → Docker Desktop propagation

On macOS Docker Desktop, the Personal-derived Darwin rename-swap Safe Replace can produce
a very short bind-mount propagation window: the macOS host already contains the new inode
while a newly created Linux container can momentarily see the replaced path as absent.

This was reproduced as an immediate `ENOENT` during the accepted edit→test loop.

B5 absorbs the transport quirk internally:
B6 release E2E reproduced one remaining 0.5-second visibility miss. The wrapper was
therefore hardened to wait 1.5 seconds after the container bind mount starts before
executing the actual user command. A repeated immediate Safe Replace → exec stress fixture
then passed without caller-side delay. The user command is supplied as a separate shell
positional argument, not concatenated into a host shell command.

With no caller-side delay, the focused test verified:

```text
read value 41
→ npm test fails as expected
→ hash
→ Safe Replace to value 42
→ immediate exec_command npm test
→ TEST_PASS_42
```

## Audit

B5 extends the B4 effect taxonomy with:
- `EXEC_START`
- `EXEC_TERMINATE`

Audit continues to store bounded metadata/result codes only.

A real command marker, `npm test` command text, process output marker and deployment
credential were verified absent from the JSONL audit file.

`read_process` is read-only and is not effect-audited.

If an `exec_command` starts successfully but the audit receipt itself becomes uncertain,
the existing B4 fail-closed contract applies and can return the known session ID so an
operator/caller can reconcile without blindly starting another process.

## Operator / Doctor

B4 SAFE mode remains backward compatible:
- no exec config required
- `safePilotMode=true`
- 14-tool surface
- STANDARD projects still denied by SAFE-pilot startup
- B4 focused suite remains PASS

B5 mode requires:
- `safePilotMode=false`
- `exec.enabled=true`
- valid pinned Docker binary/SHA
- valid pinned image reference/ID
- existing B1–B4 prerequisites

Verified negative Doctor cases:
- incorrect exec image ID → `EXEC_IMAGE_ID_MISMATCH`
- SAFE-pilot mode combined with enabled exec → `OPS_SAFE_PILOT_EXEC_DENIED`

## Backup boundary

B5 operational backup continues to exclude deployment credentials and runtime absolute
paths.

When exec is enabled, the non-secret policy records:
- `execEnabled=true`
- pinned exec image reference
- pinned image ID

It does not store:
- Docker executable absolute path
- deployment credential path/content

## Actual focused acceptance workflow

The B5 focused E2E performed:

```text
Doctor pinned Docker/image
→ Start B5 runtime
→ tools/list = exact 17
→ SAFE exec denial
→ cwd/env-injection denial
→ real isolation probe
→ .git write refusal
→ start long session
→ wrong-project read denial
→ second-process busy denial
→ terminate
→ timeout
→ 3 MiB bounded output test
→ read source
→ failing npm test
→ Safe Replace repair
→ immediate isolated npm test PASS
→ audit verification
→ start long session
→ operator Stop
→ no owned container remains
→ Start
→ old session unknown
→ Stop
→ operational backup
→ bad-image Doctor negative
→ SAFE-pilot+exec negative
```

Result:

`BUSINESS_B5_ISOLATED_STANDARD_EXEC=PASS`

The complete focused suite passed after the final concurrency and cleanup corrections,
and the same exact implementation then passed the full B0–B5 regression suite.

## Full regression

Final exact-worktree full suite after B5 implementation and audit:

- inherited Personal standalone suite: `34/34 PASS`
- B1 Organization + Project Boundary: PASS
- B2 Safe Files: PASS
- B3 Shared Continuity: PASS
- B4 Audit + Ops + SAFE Pilot Gate: PASS
- B5 Isolated STANDARD Exec: PASS
- process exit: 0

B4 was also rerun separately after B5 shared operator changes and remained PASS.

## Threat-model boundary

B5 materially reduces the attack surface of model-triggered project commands by running
them in a networkless, non-root, capability-dropped container with a minimal mount set.

It does not claim protection against a malicious process already running with the same
macOS host user's authority or against compromise of Docker Desktop/the local operator
machine itself. Those remain outside the accepted v1 local-host trust boundary.

## Deferred to B6

B5 is a local implementation/verification milestone, not a release declaration.

B6 still owns:
- final Business E2E matrix
- release-candidate hardening
- Draft/private Business app canary
- release manifest/version/tag
- backup/rollback rehearsal at release boundary
- publication and minimal production smoke
- P0/P1 closure

## Rollback

Return to B4 commit `100b8b8d58dddf374deeef9df099408fc5b1c1aa`
to remove the complete STANDARD exec unit without modifying Personal or P8.
