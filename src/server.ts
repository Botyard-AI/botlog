import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { LogStore, StoreEvent } from "./store.js";
import { renderUi } from "./ui.js";
import type { BotlogSnapshot, ListenOptions } from "./types.js";

export interface CreateAppOptions {
  readonly store: LogStore;
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();

  app.get("/", (c) => c.html(renderUi(options.store.snapshot().title)));
  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/api/state", (c) => c.json<BotlogSnapshot>(options.store.snapshot()));
  app.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = options.store.subscribe((event) => {
        void stream.writeSSE(toSseMessage(event));
      });

      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "{}" });

      await new Promise<void>(() => {
        // Keep the SSE stream open until the client disconnects.
      });
    })
  );

  return app;
}

export function listen(store: LogStore, options: ListenOptions): void {
  const serveOptions = {
    fetch: createApp({ store }).fetch,
    port: options.port,
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
  };

  serve(serveOptions);
}

function toSseMessage(event: StoreEvent): { event: string; data: string; id?: string } {
  if (event.type === "entry") {
    return { event: "entry", data: JSON.stringify(event.entry), id: String(event.entry.id) };
  }

  return { event: "stream", data: JSON.stringify(event.stream) };
}
