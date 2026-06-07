import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { Botlog } from "../src/index.js";

const demoDir = join(process.cwd(), ".demo-logs");
await mkdir(demoDir, { recursive: true });
const apiLog = join(demoDir, "api.log");
const workerLog = join(demoDir, "worker.log");
await writeFile(apiLog, "api booted\n");
await writeFile(workerLog, "worker booted\n");

const botlog = new Botlog({
  title: "Botlog dogfood demo",
  maxEntries: 1_000,
  redact: ["super-secret-demo-token"],
});

const manual = botlog.createStream("manual progress");
manual.info("Starting Botlog dogfood demo");
manual.info("This line contains super-secret-demo-token and should be redacted.");

await botlog.attachFiles([apiLog, workerLog], { fromBeginning: true, pollIntervalMs: 250 });

const child = spawn(
  process.execPath,
  [
    "-e",
    String.raw`
let i = 0;
const interval = setInterval(() => {
  i += 1;
  console.log('stdout tick ' + i);
  if (i % 3 === 0) console.error('stderr checkpoint ' + i);
}, 1000);
`,
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);

botlog.attachProcess("child process", child);

let step = 0;
setInterval(() => {
  step += 1;
  manual.info(`manual progress step ${String(step)}`);
}, 1500);

setInterval(() => {
  void appendFile(apiLog, `api request ${String(Date.now())}\n`);
}, 1200);

setInterval(() => {
  void appendFile(workerLog, `worker job ${String(Date.now())}\n`);
}, 1800);

botlog.listen({ port: 3030 });
console.log("Botlog demo listening on http://127.0.0.1:3030");
