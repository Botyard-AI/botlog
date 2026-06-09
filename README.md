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

## CLI usage

Botlog also ships a CLI for scripts, bots, and local tools that need a log UI without writing a wrapper program.

Wrap a command:

```sh
botlog -- pnpm ci
```

Print a machine-readable readiness event and bind a random local port:

```sh
botlog --json --port 0 --title "CI logs" -- pnpm ci
```

Example ready event:

```json
{
  "event": "ready",
  "url": "http://127.0.0.1:38417",
  "host": "127.0.0.1",
  "port": 38417,
  "title": "CI logs",
  "reused": false
}
```

Tail existing files instead of launching a command:

```sh
botlog --json --port 0 --file ./logs/api.log --file ./logs/worker.log --from-beginning
```

For agent-friendly reuse and recovery, provide a run directory:

```sh
botlog --json --port 0 --run-dir .botlog/runs/ci -- pnpm ci
```

The run directory stores:

```txt
.botlog/runs/ci/
├── botlog.json
├── stdout.log
└── stderr.log
```

With `--json`, the ready event includes those paths directly so automation can archive or attach logs without reading the manifest first. Botlog resolves `--run-dir` before emission, so these fields are absolute paths in actual output:

```json
{
  "event": "ready",
  "url": "http://127.0.0.1:38417",
  "host": "127.0.0.1",
  "port": 38417,
  "title": "pnpm ci",
  "runId": "ci",
  "runDir": "/path/to/.botlog/runs/ci",
  "manifestPath": "/path/to/.botlog/runs/ci/botlog.json",
  "stdoutPath": "/path/to/.botlog/runs/ci/stdout.log",
  "stderrPath": "/path/to/.botlog/runs/ci/stderr.log",
  "reused": false
}
```

If `botlog.json` points to a healthy existing Botlog server for the same run, the CLI prints a reused ready event instead of starting a duplicate server. If the server is gone, the same run directory can be served again by tailing its stored stdout/stderr logs:

```sh
botlog --json --port 0 --run-dir .botlog/runs/ci --from-beginning
```

Useful options:

- `--host <host>` — bind host, default `127.0.0.1`
- `--port <port>` — bind port, default `3030`; use `0` for a random port
- `--file <path>` — attach a log file, repeatable
- `--run-dir <dir>` / `--log-dir <dir>` — persist/reuse a run manifest plus stdout/stderr logs
- `--keep-open` — keep serving after the wrapped command exits
- `--redact <regex>` — redact matching text, repeatable

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

To publish a release, run the `release tag` GitHub Actions workflow from `main`. Leave the explicit version blank to auto-bump from the latest published npm version, or provide an explicit stable semver version when needed.

Auto-bump options:

- `patch` — default when the version is blank, for example `0.1.0` → `0.1.1`
- `minor` — for example `0.1.0` → `0.2.0`
- `major` — for example `0.1.0` → `1.0.0`

For the first public release, use a blank version with `minor` selected to produce `0.1.0` from the development baseline `0.0.0`.

The workflow validates the release candidate, creates the annotated tag for the resolved version, patches `package.json` in CI, and publishes to npm with provenance in the same workflow run. Publishing in the same run avoids relying on workflow-created tag pushes to trigger a second workflow.

Required repository secret:

- `NPM_TOKEN` — npm automation token with publish access to the `botlog` package.

There is also a tag-triggered `publish` workflow for trusted maintainers who push a release tag manually. The normal release path is the `release tag` workflow.

The release workflow currently accepts stable semver versions such as `0.1.0`. Prerelease tags should wait until the publish workflow has explicit npm dist-tag handling.

Before publishing locally or changing package configuration, verify the package contents:

```sh
pnpm pack:dry-run
```
