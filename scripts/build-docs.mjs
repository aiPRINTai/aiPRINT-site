#!/usr/bin/env node
// Build styled, print-ready HTML from every Markdown doc at repo root.
//
// Run:
//   node scripts/build-docs.mjs
//
// Output:
//   docs-rendered/index.html            - landing page linking to each doc
//   docs-rendered/SITE-MANUAL.html      - each doc as standalone styled HTML
//   docs-rendered/OPERATIONS.html
//   docs-rendered/ARCHITECTURE.html
//   ...etc.
//
// Open in a browser, print to PDF, or drag into Google Docs / Word —
// they all import HTML natively with styling preserved.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = join(REPO_ROOT, 'docs-rendered');

// Lazy-load marked: prefer a local install, else fall back to dynamic npx.
// We call marked programmatically via dynamic import so we get real HTML
// output instead of shelling out per file.
let marked;
try {
  const require = createRequire(import.meta.url);
  // marked ships as ESM in recent versions; use require.resolve to find it
  // inside npm's npx cache if it's been fetched before.
  marked = (await import('marked')).marked;
} catch {
  console.error('marked not found — install locally with: npm i -D marked');
  console.error('Or run once: npx --yes marked@12 --version  (fills npx cache)');
  process.exit(1);
}

// ── Which files to render ─────────────────────────────────────────────────
// Every top-level .md that isn't a generated artifact.
const SKIP = new Set(['node_modules', 'docs-rendered']);
const docs = readdirSync(REPO_ROOT)
  .filter(f => f.endsWith('.md'))
  .filter(f => !SKIP.has(f))
  .map(f => ({
    src: join(REPO_ROOT, f),
    name: basename(f, '.md'),
    file: f
  }));

// ── Extract H1 + one-line summary for the index ───────────────────────────
function summarize(md) {
  const lines = md.split(/\r?\n/);
  let title = null;
  let summary = null;
  for (const line of lines) {
    if (!title) {
      const m = line.match(/^#\s+(.+)$/);
      if (m) { title = m[1].trim(); continue; }
    } else if (!summary && line.trim().startsWith('>')) {
      summary = line.replace(/^>\s*\*?\*?/, '').replace(/\*\*/g, '').trim();
    } else if (!summary && line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
      // first non-heading paragraph
      summary = line.trim().slice(0, 180);
    }
    if (title && summary) break;
  }
  return { title: title || basename, summary: summary || '' };
}

// ── HTML template ─────────────────────────────────────────────────────────
// Single-file output: inlined CSS so you can email the file, drop it into
// Drive, or print it without breaking anything.
function renderPage({ title, bodyHtml, nav, currentFile }) {
  const navItems = nav
    .map(n => {
      const isCurrent = n.file === currentFile;
      const href = n.file === 'index' ? 'index.html' : `${n.name}.html`;
      return `<li${isCurrent ? ' class="current"' : ''}><a href="${href}">${n.title}</a></li>`;
    })
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} · aiPRINT.ai</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root {
    --bg: #fafafa;
    --panel: #ffffff;
    --ink: #0a0f1d;
    --muted: #64748b;
    --line: #e2e8f0;
    --accent: #4f46e5;
    --code-bg: #f1f5f9;
    --code-ink: #334155;
    --shadow: 0 1px 3px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.06);
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background: var(--bg);
  }
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    min-height: 100vh;
  }
  nav.side {
    background: var(--panel);
    border-right: 1px solid var(--line);
    padding: 28px 20px;
    position: sticky;
    top: 0;
    align-self: start;
    height: 100vh;
    overflow-y: auto;
  }
  nav.side .brand {
    font-weight: 800;
    letter-spacing: -.02em;
    font-size: 18px;
    margin-bottom: 4px;
  }
  nav.side .brand-sub {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 22px;
  }
  nav.side ul { list-style: none; padding: 0; margin: 0; }
  nav.side li { margin-bottom: 2px; }
  nav.side a {
    display: block;
    padding: 8px 12px;
    color: var(--ink);
    text-decoration: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
  }
  nav.side a:hover { background: var(--code-bg); }
  nav.side li.current a {
    background: var(--ink);
    color: #fff;
  }
  main {
    padding: 48px 64px;
    max-width: 920px;
  }
  .doc-meta {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 28px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
  }
  h1, h2, h3, h4, h5, h6 {
    font-weight: 800;
    letter-spacing: -.015em;
    line-height: 1.25;
    margin: 40px 0 16px;
  }
  h1 { font-size: 34px; margin-top: 0; }
  h2 { font-size: 26px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  h3 { font-size: 20px; }
  h4 { font-size: 16px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  p, ul, ol { margin: 0 0 16px; }
  ul, ol { padding-left: 28px; }
  li { margin-bottom: 6px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { font-weight: 700; color: var(--ink); }
  em { font-style: italic; }
  hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 40px 0;
  }
  blockquote {
    margin: 0 0 20px;
    padding: 14px 20px;
    background: var(--panel);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    color: var(--code-ink);
    box-shadow: var(--shadow);
  }
  blockquote p:last-child { margin-bottom: 0; }
  code {
    font: 13px/1.5 "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    background: var(--code-bg);
    color: var(--code-ink);
    padding: 2px 6px;
    border-radius: 4px;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 18px 20px;
    border-radius: 8px;
    overflow-x: auto;
    font: 13px/1.55 "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    margin: 0 0 20px;
    box-shadow: var(--shadow);
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 24px;
    font-size: 14px;
    background: var(--panel);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: var(--shadow);
  }
  th, td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f8fafc;
    font-weight: 600;
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafbfc; }
  img { max-width: 100%; height: auto; border-radius: 6px; }

  /* Print: drop the side nav, widen the content, clean colors for paper. */
  @media print {
    body { background: #fff; }
    nav.side { display: none; }
    .layout { display: block; }
    main { padding: 0; max-width: none; }
    pre { box-shadow: none; border: 1px solid var(--line); }
    table { box-shadow: none; border: 1px solid var(--line); }
    blockquote { box-shadow: none; }
    a { color: var(--ink); text-decoration: underline; }
    h2 { page-break-after: avoid; }
    pre, table, blockquote { page-break-inside: avoid; }
  }

  /* Narrow viewports: stack */
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
    nav.side { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--line); }
    main { padding: 32px 24px; }
  }
</style>
</head>
<body>
<div class="layout">
  <nav class="side">
    <div class="brand">aiPRINT.ai</div>
    <div class="brand-sub">Operator docs</div>
    <ul>
      ${navItems}
    </ul>
  </nav>
  <main>
    <div class="doc-meta">Rendered ${new Date().toISOString().slice(0,10)} · source: <code>${currentFile === 'index' ? '(index)' : currentFile + '.md'}</code></div>
    ${bodyHtml}
  </main>
</div>
</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Build ─────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

// Collect metadata for nav
const pages = docs.map(d => {
  const md = readFileSync(d.src, 'utf-8');
  const { title, summary } = summarize(md);
  return { ...d, md, title, summary };
});

// Sort: put SITE-MANUAL first, then README, then the rest alphabetically
const ORDER = ['SITE-MANUAL', 'README', 'OPERATIONS', 'ARCHITECTURE', 'PROJECT-CHEATSHEET', 'DEPLOYMENT_CHECKLIST', 'LAUNCH-CHECKLIST', 'CREDITS_SETUP'];
pages.sort((a, b) => {
  const ai = ORDER.indexOf(a.name);
  const bi = ORDER.indexOf(b.name);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.name.localeCompare(b.name);
});

const nav = [
  { name: 'index', file: 'index', title: 'Overview' },
  ...pages.map(p => ({ name: p.name, file: p.name, title: p.title || p.name }))
];

// Per-doc pages
for (const p of pages) {
  const bodyHtml = marked.parse(p.md, { gfm: true, breaks: false });
  const html = renderPage({
    title: p.title || p.name,
    bodyHtml,
    nav,
    currentFile: p.name
  });
  const outFile = join(OUT_DIR, `${p.name}.html`);
  writeFileSync(outFile, html);
  console.log(`  ✓ ${p.name}.html   (${(html.length / 1024).toFixed(1)} KB)`);
}

// Index page: grid of cards linking to each doc
const cards = pages.map(p => `
    <a class="card" href="${p.name}.html">
      <div class="card-title">${escapeHtml(p.title || p.name)}</div>
      <div class="card-file"><code>${p.file}</code></div>
      <div class="card-summary">${escapeHtml(p.summary)}</div>
    </a>`).join('');

const indexBody = `
<h1>aiPRINT.ai — Operator docs</h1>
<p>Rendered copies of every Markdown doc in the repo. The <code>.md</code> file
is the source of truth; this folder is a styled read-only mirror.</p>
<p>To refresh: <code>node scripts/build-docs.mjs</code></p>
<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin: 28px 0; }
  .card { display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 20px; text-decoration: none; color: var(--ink); transition: all .15s; box-shadow: var(--shadow); }
  .card:hover { transform: translateY(-2px); border-color: var(--accent); text-decoration: none; }
  .card-title { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
  .card-file { font-size: 11px; color: var(--muted); margin-bottom: 10px; }
  .card-summary { font-size: 13px; color: var(--code-ink); line-height: 1.5; }
</style>
<div class="grid">${cards}
</div>

<h2>How to share these</h2>
<ul>
  <li><strong>Print / Save as PDF:</strong> open any page → File → Print → "Save as PDF". The sidebar auto-hides in print.</li>
  <li><strong>Import into Google Docs:</strong> upload the <code>.html</code> file to Drive → right-click → Open with → Google Docs. Tables and formatting carry over.</li>
  <li><strong>Import into Word:</strong> File → Open → pick the <code>.html</code>. Word handles headings, tables, and code blocks natively.</li>
  <li><strong>Share a link:</strong> host the <code>docs-rendered/</code> folder anywhere static (Vercel, S3, even Dropbox public) and link directly.</li>
</ul>

<h2>Why keep the Markdown originals?</h2>
<p>The <code>.md</code> files live in git next to the code they describe. When
the code changes, the docs change in the same commit, so they never go stale
silently. The HTML you're reading is generated from those files — edit the
<code>.md</code>, re-run <code>node scripts/build-docs.mjs</code>, and this
view updates.</p>
`;

const indexHtml = renderPage({
  title: 'Operator docs — index',
  bodyHtml: indexBody,
  nav,
  currentFile: 'index'
});

writeFileSync(join(OUT_DIR, 'index.html'), indexHtml);
console.log(`  ✓ index.html`);

console.log(`\n✅ Rendered ${pages.length + 1} pages to ${OUT_DIR}`);
console.log(`   Open: file://${join(OUT_DIR, 'index.html')}`);
