# ChatAgent Personal — isolated macOS owner-agent candidate

**Separate product and repository**, copied selectively from accepted development evidence in exobiz7/chatagent (baseline 359b9acb9c9391f3d9f88d60bcac924f07bb6186). The original P8 and STABLE-001 repositories, apps, tunnels, secrets, containers and memory state are NOT runtime dependencies of this repository.

This is an isolated development snapshot, **not** an accepted Business rollout. Do not reuse a P8 L1 state, credential, route, container, socket, or tunnel; generate unique owner credentials and private state at deployment. All L6 feature gates default OFF.

The current optional P8-compatible read adapter is a **development-only API compatibility probe**. It must not be configured as a production dependency on P8. The personal durable memory store is a separate work item.

Install `npm ci --offline --ignore-scripts --no-audit` if the pinned dependencies are in the local cache, or use standard `npm ci` in a trusted environment. Run `npm test` for a disposable native/MCP fixture. No runtime requires parent project file paths.
