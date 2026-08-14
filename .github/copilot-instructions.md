# Repository Agent Instructions

This workspace is the `mcp1.0.0` model proxy, not the Mesh Platform or frontend repository described by some legacy agent files.

## Retrieve Context First

For work involving routing, providers, startup, ports, OpenHands, notifications, or memory:

1. Read `.github/agent-knowledge/PROXY_INDEX.json`.
2. Read only the records relevant to the task.
3. Verify controlling source before editing. Treat README and legacy frontend knowledge as potentially stale.

## Runtime Boundaries

- Keep the Express proxy a stateless protocol gateway.
- Do not start Docker, Neo4j, Graphiti, or other infrastructure from `src/index.ts`.
- Use one process owner per port. Port 2999 is managed by `com.adarsh.bedrock-proxy` on this machine.
- Preserve provider routing in `src/server.ts`: SOL/Azure aliases, OpenRouter aliases, then Bedrock/Mantle fallback.

## Memory Updates

Update `.github/agent-knowledge/proxy-runtime.json` only when a stable fact changes and executable validation proves the new fact.

Each fact must include source or command provenance. Never store API keys, tokens, passwords, personal data, full prompts, full model responses, temporary PIDs, or unverified conclusions.

Graphiti may later implement explicit `search` and `remember` operations as a separate service. Until that adapter exists, do not claim Graphiti persistence is active.
