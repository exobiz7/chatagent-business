# B-S6G-3 — v1.0 Manual Production Recovery After Restart

Date: 2026-11-04 KST
Decision: RECOVERY PASS; AUTOMATIC BOOT PERSISTENCE NOT PROVEN.
Scope excludes v1.1 cutover or final source migration.

Preflight found existing v1.0 PID 38634 absent, port 31850 free, Status STALE_RECORD, tunnel healthz=200/readyz=503. Canonical and installed v1.0 operator SHA matched; private directories, Docker runtime and ownership preconditions checked.

A single stale runtime record was verified, copied with SHA-256 into a private incident directory, atomically renamed to private quarantine (no deletion), with fsync and byte-for-byte preservation. Original v1.0 source data was not reset or restored.

The official installed v1.0 operator then returned STOPPED, pre-Start Doctor passed, and a one-time prestart official backup returned verified=true and excludesDeploymentCredential=true. The official Start ran once and returned RUNNING/healthy=true with new PID 13607. Doctor post-start: 15/15 required checks PASS; app /health HTTP 200, B5 and execHealthy true.

After app recovery, tunnel /readyz remained 503. A single scoped launchctl kickstart for com.chatagent.business.tunnel changed tunnel PID 771 -> 14203; existing plist SHA unchanged, app PID 13607 remained stable, and /healthz plus /readyz both returned 200.

No arbitrary process termination, SQLite restore/export, live data import, PR merge or v1.1 publication was performed. Host reboot persistence remains a P0 release gate because stale-record handling still needed supervised manual reconciliation. Private incident and backup details remain outside public Git.
