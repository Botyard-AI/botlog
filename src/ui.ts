export function renderUi(title: string): string {
  const escapedTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      :root {
        color-scheme: dark;
        --radius: 0.625rem;
        --background: #0d1b2a;
        --card: #0a131e;
        --foreground: #e8eaed;
        --primary: #d4622b;
        --primary-foreground: #e8eaed;
        --secondary: #4a5c6a;
        --secondary-foreground: #e8eaed;
        --muted: #2b3a42;
        --muted-foreground: #8a9ba8;
        --accent: #e8952a;
        --accent-foreground: #0d1b2a;
        --border: #4a5c6a;
        --border-muted: rgba(74, 92, 106, 0.4);
        --success: #34d399;
        --danger: #dc2626;
        --font-sans: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --font-heading: Oswald, "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        --font-mono: "IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 8% 0%, rgba(212, 98, 43, 0.14), transparent 28rem),
          radial-gradient(circle at 92% 12%, rgba(232, 149, 42, 0.10), transparent 24rem),
          var(--background);
        color: var(--foreground);
        font: 14px/1.45 var(--font-mono);
      }
      header {
        position: sticky;
        top: 0;
        z-index: 1;
        border-bottom: 1px solid var(--border-muted);
        background: rgba(13, 27, 42, 0.92);
        backdrop-filter: blur(14px);
      }
      .shell { max-width: 1280px; margin: 0 auto; padding: 18px 20px; }
      .title-row { display: flex; align-items: center; gap: 12px; }
      .mark {
        display: inline-flex;
        width: 28px;
        height: 28px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        color: var(--accent-foreground);
        font: 800 14px/1 var(--font-heading);
        letter-spacing: 0.04em;
        box-shadow: 0 10px 30px rgba(212, 98, 43, 0.22);
      }
      h1 {
        margin: 0;
        font: 700 22px/1.05 var(--font-heading);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .meta { margin-top: 6px; color: var(--muted-foreground); font: 13px/1.3 var(--font-sans); }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
        align-items: center;
        font-family: var(--font-sans);
      }
      input, select, button {
        border: 1px solid var(--border-muted);
        background: rgba(10, 19, 30, 0.86);
        color: var(--foreground);
        border-radius: calc(var(--radius) - 2px);
        padding: 9px 11px;
        font: 13px/1.2 var(--font-sans);
        outline: none;
      }
      input:focus, select:focus, button:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(232, 149, 42, 0.16); }
      input { min-width: min(380px, 100%); flex: 1; }
      button { cursor: pointer; transition: border-color .12s ease, color .12s ease, background .12s ease; }
      button:hover { border-color: var(--secondary); background: rgba(43, 58, 66, 0.72); }
      button.active { border-color: var(--primary); color: var(--primary-foreground); background: rgba(212, 98, 43, 0.16); }
      main { max-width: 1280px; margin: 0 auto; padding: 18px 20px 40px; }
      .log-card {
        overflow: hidden;
        border: 1px solid var(--border-muted);
        border-radius: var(--radius);
        background: rgba(10, 19, 30, 0.72);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.24);
      }
      .log-card::before { content: ""; display: block; height: 3px; background: linear-gradient(90deg, var(--primary), var(--accent)); }
      #log { padding: 12px 14px 18px; }
      .entry {
        display: grid;
        grid-template-columns: 92px 160px 1fr;
        gap: 12px;
        padding: 4px 6px;
        border-radius: 6px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .entry:hover { background: rgba(43, 58, 66, 0.32); }
      .time { color: var(--muted-foreground); }
      .stream { color: var(--accent); }
      .message { color: var(--foreground); }
      .error .stream { color: #fca5a5; }
      .error .message { color: #fca5a5; }
      .hidden { display: none; }
      .empty { margin: 12px 6px; color: var(--muted-foreground); font-family: var(--font-sans); }
      @media (max-width: 760px) {
        .entry { grid-template-columns: 78px 1fr; }
        .message { grid-column: 1 / -1; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="shell">
        <div class="title-row"><span class="mark">BL</span><h1>${escapedTitle}</h1></div>
        <div class="meta" id="meta">Connecting…</div>
        <div class="toolbar">
          <input id="filter" type="search" placeholder="Filter logs…" />
          <select id="stream-filter"><option value="">All streams</option></select>
          <select id="level-filter"><option value="">All levels</option><option value="info">Info</option><option value="error">Error</option></select>
          <button id="pause">Streaming: on</button>
          <button id="scroll" class="active">Auto-scroll: on</button>
          <button id="copy">Copy visible</button>
        </div>
      </div>
    </header>
    <main><section class="log-card"><div id="log"><p class="empty">Waiting for logs…</p></div></section></main>
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
