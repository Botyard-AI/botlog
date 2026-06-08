import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { LogStore, StoreEvent } from "./store.js";
import { renderUi } from "./ui.js";
import type { BotlogInfo, BotlogServer, BotlogSnapshot, ListenOptions } from "./types.js";

export interface CreateAppOptions {
  readonly store: LogStore;
  readonly info?: BotlogInfo;
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();

  app.get("/", (c) => c.html(renderUi(options.store.snapshot().title)));
  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/api/info", (c) =>
    c.json<BotlogInfo>(
      options.info ?? {
        name: "botlog",
        title: options.store.snapshot().title,
        startedAt: new Date(0).toISOString(),
      }
    )
  );
  app.get("/api/state", (c) => c.json<BotlogSnapshot>(options.store.snapshot()));
  app.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      let writePending = false;
      let closed = false;

      const writeIfReady = async (write: () => Promise<unknown>): Promise<void> => {
        if (closed || writePending) {
          return;
        }
        writePending = true;
        try {
          await write();
        } catch {
          stream.abort();
        } finally {
          writePending = false;
        }
      };

      const unsubscribe = options.store.subscribe((event) => {
        void writeIfReady(() => stream.writeSSE(toSseMessage(event)));
      });
      const keepAlive = setInterval(() => {
        void writeIfReady(() => stream.write(": ping\n\n"));
      }, 20_000);

      await stream.writeSSE({ event: "ready", data: "{}" });

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          closed = true;
          unsubscribe();
          clearInterval(keepAlive);
          resolve();
        });
      });
    })
  );

  return app;
}

export function listen(store: LogStore, info: BotlogInfo, options: ListenOptions): BotlogServer {
  const serveOptions = {
    fetch: createApp({ store, info }).fetch,
    port: options.port,
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
  };

  const server = serve(serveOptions);

  return {
    get port() {
      const address = server.address();
      return typeof address === "object" && address !== null ? address.port : options.port;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function toSseMessage(event: StoreEvent): { event: string; data: string; id?: string } {
  if (event.type === "entry") {
    return { event: "entry", data: JSON.stringify(event.entry), id: String(event.entry.id) };
  }

  return { event: "stream", data: JSON.stringify(event.stream) };
}
