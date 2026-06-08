# Botlog

Lightweight live logs for scripts, services, files, and child processes.

Botlog is a tiny TypeScript package for exposing live logs through a simple searchable web UI. Attach child process stdout/stderr, tail one or more log files, or write manual stream events for tests, builds, migrations, scrapers, probes, and other jobs where a human should be able to watch progress without reading a terminal transcript.

## Install

```sh
pnpm add botlog
```

## Basic usage

```ts
import { Botlog } from "botlog";
import { spawn } from "node:child_process";

const botlog = new Botlog({ title: "Build logs" });

const child = spawn("pnpm", ["build"], {
  stdio: ["ignore", "pipe", "pipe"],
});

botlog.attachProcess("pnpm build", child);

const server = botlog.listen({ port: 3030 });

process.on("SIGINT", () => {
  void server.close().then(() => process.exit(0));
});
```

Run the server locally, keep it on a private network, or put it behind your own authenticated proxy when sharing logs with other people.

## Manual streams

```ts
const stream = botlog.createStream("migration");

stream.info("Preparing migration");
stream.write("Applying step 1/3");
stream.error("Example error line");
stream.end("completed");
```

## Attach log files

```ts
await botlog.attachFiles(["/tmp/api.log", "/tmp/worker.log"], {
  fromBeginning: false,
  pollIntervalMs: 500,
});
```

The UI includes text filtering, stream filtering, level filtering, copy-visible output, auto-scroll toggle, and a viewer-side pause/resume control for live streaming. Live updates use Server-Sent Events with a polling fallback that activates when the SSE connection drops.

## API notes

The main supported entry point is `Botlog`. The package also exports lower-level helpers for advanced embedding:

- `createApp()` builds the Hono app around a `LogStore`.
- `LogStore` is the bounded in-memory store used by the server and UI.
- `redactLine()` applies the built-in and custom redaction rules to one line.

These exports are public in the `0.x` line, but the `Botlog` class is the preferred API for most users.

## Security

Logs can leak secrets. Botlog does not include built-in auth, CORS configuration, or a Content Security Policy; run it locally, on a private network, or behind a trusted authenticated proxy. Botlog supports redaction hooks, but redaction is best-effort and can over- or under-match structured data such as JSON. Redaction is not a substitute for careful command design. Avoid printing credentials, tokens, customer data, or sensitive environment variables.

```ts
const botlog = new Botlog({
  redact: [/Bearer\s+\S+/g, process.env.API_KEY].filter(Boolean),
});
```

## Development

```sh
corepack enable
pnpm install
pnpm ci
```

## Publishing

Botlog uses tag-based releases. The git tag is the source of truth for the published npm version; `package.json` uses `0.0.0` as the development baseline.

To publish a release, run the `release tag` GitHub Actions workflow from `main` with the target version, for example:

```txt
0.1.0
```

That workflow validates the release candidate, creates annotated tag `v0.1.0`, and pushes it. The pushed tag then triggers the `publish` workflow, which derives `0.1.0` from the tag, patches `package.json` in CI, runs the full CI command, and publishes to npm with provenance.

Required repository secrets:

- `RELEASE_TOKEN` — GitHub token allowed to push tags. This cannot be the default `GITHUB_TOKEN`, because GitHub does not trigger follow-up workflows from events created by `GITHUB_TOKEN`.
- `NPM_TOKEN` — npm automation token with publish access to the `botlog` package.

The release workflow currently accepts stable semver versions such as `0.1.0`. Prerelease tags should wait until the publish workflow has explicit npm dist-tag handling.

Before publishing locally or changing package configuration, verify the package contents:

```sh
pnpm pack:dry-run
```
