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
      * { box-sizing: border-box; }
      body { margin: 0; background: #09090b; color: #e4e4e7; font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      header { position: sticky; top: 0; z-index: 1; padding: 16px 20px; border-bottom: 1px solid #27272a; background: rgba(9,9,11,.94); backdrop-filter: blur(10px); }
      h1 { margin: 0; font: 600 18px/1.2 system-ui, sans-serif; }
      .meta { margin-top: 4px; color: #a1a1aa; font: 13px/1.3 system-ui, sans-serif; }
      .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; align-items: center; font-family: system-ui, sans-serif; }
      input, select, button { border: 1px solid #3f3f46; background: #18181b; color: #e4e4e7; border-radius: 8px; padding: 8px 10px; font: 13px/1.2 system-ui, sans-serif; }
      input { min-width: min(360px, 100%); flex: 1; }
      button { cursor: pointer; }
      button.active { border-color: #60a5fa; color: #bfdbfe; }
      main { padding: 16px 20px 32px; }
      .entry { display: grid; grid-template-columns: 88px 150px 1fr; gap: 12px; padding: 2px 0; white-space: pre-wrap; word-break: break-word; }
      .time, .stream { color: #71717a; }
      .error .message { color: #fca5a5; }
      .hidden { display: none; }
      .empty { color: #71717a; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapedTitle}</h1>
      <div class="meta" id="meta">Connecting…</div>
      <div class="toolbar">
        <input id="filter" type="search" placeholder="Filter logs…" />
        <select id="stream-filter"><option value="">All streams</option></select>
        <select id="level-filter"><option value="">All levels</option><option value="info">Info</option><option value="error">Error</option></select>
        <button id="pause">Streaming: on</button>
        <button id="scroll" class="active">Auto-scroll: on</button>
        <button id="copy">Copy visible</button>
      </div>
    </header>
    <main id="log"><p class="empty">Waiting for logs…</p></main>
    <script>
      const log = document.querySelector('#log');
      const meta = document.querySelector('#meta');
      const filter = document.querySelector('#filter');
      const streamFilter = document.querySelector('#stream-filter');
      const levelFilter = document.querySelector('#level-filter');
      const pauseButton = document.querySelector('#pause');
      const scrollButton = document.querySelector('#scroll');
      const copyButton = document.querySelector('#copy');
      let autoScroll = true;
      let paused = false;
      const streams = new Map();
      const entries = [];
      const queue = [];

      function ensureStreamOption(stream) {
        if (streamFilter.querySelector('option[value="' + CSS.escape(stream.id) + '"]')) return;
        const option = document.createElement('option');
        option.value = stream.id;
        option.textContent = stream.name;
        streamFilter.append(option);
      }

      function renderEntry(entry) {
        const existingEmpty = log.querySelector('.empty');
        existingEmpty?.remove();
        const row = document.createElement('div');
        row.className = 'entry ' + entry.level;
        row.dataset.streamId = entry.streamId;
        row.dataset.level = entry.level;
        row.dataset.text = entry.text.toLowerCase();
        const time = new Date(entry.timestamp).toLocaleTimeString();
        row.innerHTML = '<span class="time"></span><span class="stream"></span><span class="message"></span>';
        row.children[0].textContent = time;
        row.children[1].textContent = streams.get(entry.streamId)?.name ?? entry.streamId;
        row.children[2].textContent = entry.text;
        log.append(row);
        applyFiltersToRow(row);
        if (autoScroll) window.scrollTo({ top: document.body.scrollHeight });
      }

      function updateMeta(status = 'Connected') {
        const visible = [...log.querySelectorAll('.entry:not(.hidden)')].length;
        meta.textContent = status + ' · ' + streams.size + ' stream(s), ' + entries.length + ' buffered line(s), ' + visible + ' visible';
      }

      function applyFiltersToRow(row) {
        const query = filter.value.trim().toLowerCase();
        const selectedStream = streamFilter.value;
        const selectedLevel = levelFilter.value;
        const matchesQuery = query.length === 0 || row.dataset.text.includes(query);
        const matchesStream = selectedStream.length === 0 || row.dataset.streamId === selectedStream;
        const matchesLevel = selectedLevel.length === 0 || row.dataset.level === selectedLevel;
        row.classList.toggle('hidden', !(matchesQuery && matchesStream && matchesLevel));
      }

      function applyFilters() {
        for (const row of log.querySelectorAll('.entry')) applyFiltersToRow(row);
        updateMeta(paused ? 'Paused' : 'Connected');
      }

      function handleEntry(entry) {
        entries.push(entry);
        if (paused) {
          queue.push(entry);
          updateMeta('Paused (' + queue.length + ' queued)');
          return;
        }
        renderEntry(entry);
        updateMeta();
      }

      function flushQueue() {
        const pending = queue.splice(0, queue.length);
        for (const entry of pending) renderEntry(entry);
        updateMeta();
      }

      filter.addEventListener('input', applyFilters);
      streamFilter.addEventListener('change', applyFilters);
      levelFilter.addEventListener('change', applyFilters);
      pauseButton.addEventListener('click', () => {
        paused = !paused;
        pauseButton.textContent = 'Streaming: ' + (paused ? 'paused' : 'on');
        pauseButton.classList.toggle('active', paused);
        if (!paused) flushQueue();
        else updateMeta('Paused');
      });
      scrollButton.addEventListener('click', () => {
        autoScroll = !autoScroll;
        scrollButton.textContent = 'Auto-scroll: ' + (autoScroll ? 'on' : 'off');
        scrollButton.classList.toggle('active', autoScroll);
      });
      copyButton.addEventListener('click', async () => {
        const lines = [...log.querySelectorAll('.entry:not(.hidden)')].map((row) =>
          [...row.children].map((child) => child.textContent).join(' ')
        );
        await navigator.clipboard.writeText(lines.join('\n'));
        copyButton.textContent = 'Copied';
        setTimeout(() => { copyButton.textContent = 'Copy visible'; }, 1000);
      });

      fetch('/api/state').then((r) => r.json()).then((snapshot) => {
        for (const stream of snapshot.streams) {
          streams.set(stream.id, stream);
          ensureStreamOption(stream);
        }
        for (const entry of snapshot.entries) handleEntry(entry);
        updateMeta();
      });
      const events = new EventSource('/events');
      events.addEventListener('stream', (event) => {
        const stream = JSON.parse(event.data);
        streams.set(stream.id, stream);
        ensureStreamOption(stream);
        updateMeta(paused ? 'Paused' : 'Connected');
      });
      events.addEventListener('entry', (event) => handleEntry(JSON.parse(event.data)));
      events.addEventListener('ready', () => { updateMeta(paused ? 'Paused' : 'Connected'); });
      events.onerror = () => { updateMeta('Disconnected; retrying…'); };
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
