# AGENTS.md — Botlog

## Project Overview

Botlog is a public TypeScript package for exposing live logs from scripts, services, files, and child processes through a lightweight web UI.

Core goals:

- simple API for attaching child process stdout/stderr
- tailing one or more log files concurrently
- manual log streams for progress updates
- live browser updates via Server-Sent Events
- bounded in-memory storage
- basic redaction hooks
- no built-in auth; localhost, private networks, reverse proxies, or the embedding environment provide access control

## Repository Structure

```txt
botlog/
├── src/
│   ├── botlog.ts      # public Botlog class and stream attachment API
│   ├── server.ts      # Hono app and HTTP/SSE endpoints
│   ├── store.ts       # bounded in-memory log store and subscriptions
│   ├── redaction.ts   # redaction helpers
│   ├── ui.ts          # embedded HTML/CSS/JS page
│   └── index.ts       # public exports
├── tests/             # Vitest tests
├── dist/              # generated build output; do not edit
└── examples/          # runnable examples
```

## Development Commands

Use the package manager pinned in `package.json`.

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:dry-run
pnpm ci
```

Run `pnpm ci` before pushing or reporting work complete. Run `pnpm pack:dry-run` before changing package exports, build output, or publish configuration.

## Conventions

- Keep the package ESM-first.
- Keep TypeScript strict. Do not weaken `tsconfig.json` without a specific reason.
- Public API belongs in `src/index.ts`; avoid exposing internals accidentally.
- Import local TypeScript modules with `.js` specifiers because this repo uses NodeNext module resolution.
- Keep server startup side-effect-free: importing the package must not bind a port.
- Keep package publish configuration intentional. The npm package should include built `dist`, README, and LICENSE, and should not publish source tests or local demo output.
- Prefer SSE over WebSockets for log streaming unless bidirectional communication becomes necessary.
- File tailing should support multiple concurrent files and stay bounded; do not introduce unbounded reads.
- Keep storage bounded; do not add unbounded log accumulation.
- Do not add built-in auth by default. Document that deployments must protect access when needed.
- Keep the default UI lightweight and readable. The current theme uses dark navy/card surfaces, warm accent colors, neutral borders/text, and a sans/condensed/monospace font stack.

## Security Notes

Logs are sensitive by default. Preserve and improve redaction hooks, but do not claim they make output safe. Avoid examples that print tokens, full environment dumps, private customer data, or credentials.

## Maintainer Notes

Future maintainers should be able to understand this repo from this file and the README without relying on conversation memory. When adding a new module or changing conventions, update this file in the same PR.
