export function renderUi(title: string): string {
  const escapedTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #09090b; color: #e4e4e7; font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      header { position: sticky; top: 0; z-index: 1; padding: 16px 20px; border-bottom: 1px solid #27272a; background: rgba(9,9,11,.92); backdrop-filter: blur(10px); }
      h1 { margin: 0; font: 600 18px/1.2 system-ui, sans-serif; }
      .meta { margin-top: 4px; color: #a1a1aa; font: 13px/1.3 system-ui, sans-serif; }
      main { padding: 16px 20px 32px; }
      .entry { display: grid; grid-template-columns: 88px 110px 1fr; gap: 12px; padding: 2px 0; white-space: pre-wrap; word-break: break-word; }
      .time, .stream { color: #71717a; }
      .error .message { color: #fca5a5; }
      .empty { color: #71717a; font-family: system-ui, sans-serif; }
      button { position: fixed; right: 16px; bottom: 16px; border: 1px solid #3f3f46; background: #18181b; color: #e4e4e7; border-radius: 999px; padding: 8px 12px; cursor: pointer; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapedTitle}</h1>
      <div class="meta" id="meta">Connecting…</div>
    </header>
    <main id="log"><p class="empty">Waiting for logs…</p></main>
    <button id="scroll">Auto-scroll: on</button>
    <script>
      const log = document.querySelector('#log');
      const meta = document.querySelector('#meta');
      const button = document.querySelector('#scroll');
      let autoScroll = true;
      const streams = new Map();
      function renderEntry(entry) {
        const existingEmpty = log.querySelector('.empty');
        existingEmpty?.remove();
        const row = document.createElement('div');
        row.className = 'entry ' + entry.level;
        const time = new Date(entry.timestamp).toLocaleTimeString();
        row.innerHTML = '<span class="time"></span><span class="stream"></span><span class="message"></span>';
        row.children[0].textContent = time;
        row.children[1].textContent = streams.get(entry.streamId)?.name ?? entry.streamId;
        row.children[2].textContent = entry.text;
        log.append(row);
        if (autoScroll) window.scrollTo({ top: document.body.scrollHeight });
      }
      function updateMeta(snapshot) {
        meta.textContent = snapshot.streams.length + ' stream(s), ' + snapshot.entries.length + ' visible line(s)';
      }
      button.addEventListener('click', () => {
        autoScroll = !autoScroll;
        button.textContent = 'Auto-scroll: ' + (autoScroll ? 'on' : 'off');
      });
      fetch('/api/state').then((r) => r.json()).then((snapshot) => {
        for (const stream of snapshot.streams) streams.set(stream.id, stream);
        updateMeta(snapshot);
        for (const entry of snapshot.entries) renderEntry(entry);
      });
      const events = new EventSource('/events');
      events.addEventListener('stream', (event) => {
        const stream = JSON.parse(event.data);
        streams.set(stream.id, stream);
      });
      events.addEventListener('entry', (event) => renderEntry(JSON.parse(event.data)));
      events.addEventListener('open', () => { meta.textContent = 'Connected'; });
      events.onerror = () => { meta.textContent = 'Disconnected; retrying…'; };
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
