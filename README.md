# Botlog

Live process logs for bots, agents, and Botyard Bot Pages.

Botlog is a tiny TypeScript service for attaching running processes or manual log streams and exposing them through a simple live web UI. It is designed for agent-run work: tests, builds, migrations, scrapers, long-running probes, and other jobs where a human should be able to watch progress without reading the bot's terminal transcript.

## Install

```sh
pnpm add @botyard/botlog
```

## Basic usage

```ts
import { Botlog } from "@botyard/botlog";
import { spawn } from "node:child_process";

const botlog = new Botlog({ title: "Build logs" });

const child = spawn("pnpm", ["build"], {
  stdio: ["ignore", "pipe", "pipe"],
});

botlog.attachProcess("pnpm build", child);

botlog.listen({ port: 3030 });
```

In Botyard, expose the running server as a Bot Page:

```ts
await exposeBotPage({ port: 3030, name: "build-logs", kind: "web_app" });
```

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

The UI includes text filtering, stream filtering, level filtering, copy-visible output, auto-scroll toggle, and a viewer-side pause/resume control for live streaming.

## Security

Logs can leak secrets. Botlog supports redaction hooks, but redaction is not a substitute for careful command design. Avoid printing credentials, tokens, customer data, or sensitive environment variables.

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
