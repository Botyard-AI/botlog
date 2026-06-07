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

botlog.listen({ port: 3030 });
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

The UI includes text filtering, stream filtering, level filtering, copy-visible output, auto-scroll toggle, and a viewer-side pause/resume control for live streaming. Live updates use Server-Sent Events with a polling fallback.

## Security

Logs can leak secrets. Botlog does not include built-in auth; run it locally, on a private network, or behind a trusted authenticated proxy. Botlog supports redaction hooks, but redaction is not a substitute for careful command design. Avoid printing credentials, tokens, customer data, or sensitive environment variables.

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
