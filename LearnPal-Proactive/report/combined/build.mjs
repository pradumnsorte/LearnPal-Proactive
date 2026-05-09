// Combines all section markdown files into a single learnpal-prototype-development.md and a
// self-contained learnpal-prototype-development.html (with Mermaid CDN for rendered diagrams).
// Re-run after editing any section or diagram source: `node build.mjs`.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const read = (p) => readFileSync(resolve(root, p), 'utf8')

// Each diagram reference in the section sources looks like:
//   *See `report/diagrams/01-architecture.mmd` for the rendered diagram.*
// We replace each occurrence with an inline ```mermaid block.
const inlineDiagrams = (md) =>
  md.replace(
    /\*See `report\/diagrams\/([^`]+)` for[^*]*\*/g,
    (_, file) => '```mermaid\n' + read(`diagrams/${file}`).trimEnd() + '\n```'
  )

// Each screenshot callout in the section sources looks like:
//   > **Screenshot 2a-A:** caption text...
// We replace each with an HTML <figure> referencing the actual PNG. The path
// is relative to `report/combined/learnpal-prototype-development.html`, walking up to repo root.
const SCREENSHOT_DIR = '../../src/assets/Report-ss'
const inlineScreenshots = (md) =>
  md.replace(
    /^> \*\*Screenshot ([0-9a-zA-Z-]+):\*\* (.+?)$/gm,
    (_, id, caption) => {
      const fileMap = {
        '2a-A': '2a-A-default.png',
        '2a-B': '2a-B-snap-confirm.png',
        '2a-C': '2a-C-snap-chat.png',
        '2a-D': '2a-D-quiz-question.png',
        '2a-E': '2a-E-quiz-feedback.png',
        '2b-A': '2b-A-default-populated.png',
        '2b-B': '2b-B-glossary-controls.png',
        '2b-C': '2b-C-feed-question.png',
        '2b-D': '2b-D-region-overlay.png',
        '2b-E': '2b-E-feed-answered.png',
        '2b-F': '2b-F-chat-context.png',
        '2c-A': '2c-A-keyword-popup.png',
        '2c-B': '2c-B-region-overlay.png',
        '2c-C': '2c-C-region-card.png',
        '2c-D': '2c-D-pop-quiz.png',
        '2c-E': '2c-E-pop-quiz-feedback.png',
        '2c-F': '2c-F-keyword-log.png',
        '2c-G': '2c-G-frequency-toast.png',
      }
      const file = fileMap[id]
      if (!file) return `> **Screenshot ${id}:** ${caption}`
      return `<figure class="screenshot">
  <img src="${SCREENSHOT_DIR}/${file}" alt="Screenshot ${id}: ${caption.replace(/"/g, '&quot;')}" />
  <figcaption><strong>Screenshot ${id}.</strong> ${caption}</figcaption>
</figure>`
    }
  )

const sections = [
  'sections/01-shared-foundation.md',
  'sections/02a-intermittent.md',
  'sections/02b-continuous.md',
  'sections/02c-proactive.md',
  'sections/03-comparison.md',
  'sections/04-rationale-limitations.md',
]

// The chapter front matter. The HTML build adds a separate styled header
// above this with brand icon + title; the markdown build keeps a plain
// title for portability.
const front = `# Prototype Development

A walkthrough of three functional prototypes built to compare three different paradigms of in-video AI support: learner-initiated, continuously available, and system-initiated.

---

## Contents

1. The Shared Foundation
2. The Intermittent Prototype
3. The Continuous Prototype
4. The Proactive Prototype
5. Putting the Three Side by Side
6. Implementation Rationale, Trade-offs, and Limitations

---

`

const combined = front + sections.map((p) => inlineScreenshots(inlineDiagrams(read(p)))).join('\n\n---\n\n')

writeFileSync(resolve(here, 'learnpal-prototype-development.md'), combined)

// --- HTML build: render markdown + mermaid in a single self-contained file. ---
const BRAND_ICON = '../../src/assets/brand-icon.svg'

const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<title>Prototype Development — LearnPal</title>
<link rel="icon" href="../../src/assets/LearnPal-Favicon.svg" type="image/svg+xml">
<style>
  :root {
    --fg: #1a1a1a;
    --muted: #555;
    --bg: #fafaf7;
    --panel: #ffffff;
    --border: #e5e5e0;
    --accent: #c8a420;
    --code-bg: #f4f3ee;
  }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    line-height: 1.65;
    font-size: 16px;
  }
  main {
    max-width: 880px;
    margin: 0 auto;
    padding: 56px 36px 120px;
  }
  /* Cover-style chapter header. */
  .chapter-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 18px;
    margin-bottom: 28px;
    border-bottom: 2px solid var(--accent);
  }
  .chapter-header img.brand {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
  }
  .chapter-header .titles { line-height: 1.25; }
  .chapter-header .titles .h1 {
    font-size: 1.9rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--fg);
  }
  .chapter-header .titles .sub {
    font-size: 1rem;
    color: var(--muted);
    margin-top: 4px;
    font-style: italic;
  }
  /* Hide the markdown's own H1, since we render the styled header above. */
  main #content > h1:first-of-type { display: none; }
  main #content > p:first-of-type em:only-child {
    /* The italic subtitle line directly under H1 in markdown. */
    color: var(--muted);
    font-size: 1rem;
  }
  h1, h2, h3, h4 {
    line-height: 1.25;
    margin-top: 2em;
    margin-bottom: 0.6em;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  h1 { font-size: 2rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.3em; }
  h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.25em; }
  h3 { font-size: 1.18rem; color: #333; }
  h4 { font-size: 1rem; color: #444; }
  p { margin: 0.8em 0; }
  a { color: #8a6d10; }
  hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 3em 0;
  }
  ul, ol { padding-left: 1.4em; }
  li { margin: 0.25em 0; }
  blockquote {
    border-left: 3px solid var(--accent);
    background: #fff8e1;
    padding: 0.6em 1em;
    margin: 1em 0;
    color: #5a4500;
    border-radius: 4px;
  }
  blockquote p { margin: 0.3em 0; }
  code {
    background: var(--code-bg);
    padding: 0.12em 0.4em;
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.9em;
  }
  pre {
    background: var(--code-bg);
    padding: 14px 16px;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid var(--border);
    font-size: 0.85rem;
    line-height: 1.5;
  }
  pre code { background: transparent; padding: 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 0.92rem;
    background: var(--panel);
    box-shadow: 0 1px 0 rgba(0,0,0,0.04);
  }
  th, td {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f1efe6;
    font-weight: 600;
  }
  tr:nth-child(even) td { background: #fbfaf6; }
  .mermaid {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 18px;
    margin: 1.5em 0;
    overflow-x: auto;
    text-align: center;
  }
  figure.screenshot {
    margin: 1.8em 0;
    padding: 0;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  figure.screenshot img {
    display: block;
    width: 100%;
    height: auto;
    background: #000;
  }
  figure.screenshot figcaption {
    padding: 10px 14px;
    font-size: 0.88rem;
    color: var(--muted);
    background: #f9f8f3;
    border-top: 1px solid var(--border);
    line-height: 1.5;
  }
  figure.screenshot figcaption strong { color: var(--fg); }
  /* Sticky table-of-contents on wide screens. */
  nav.toc {
    position: fixed;
    top: 24px;
    left: 24px;
    width: 220px;
    font-size: 0.85rem;
    padding: 14px 16px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    line-height: 1.5;
    max-height: 80vh;
    overflow-y: auto;
  }
  nav.toc ol { padding-left: 1.2em; margin: 0.4em 0; }
  nav.toc a { color: var(--muted); text-decoration: none; }
  nav.toc a:hover { color: var(--fg); }
  nav.toc strong { color: var(--fg); display: block; margin-bottom: 0.4em; font-size: 0.9rem; }
  @media (max-width: 1280px) {
    nav.toc { display: none; }
  }
  /* Print styles for PDF export. */
  @media print {
    nav.toc { display: none; }
    main { max-width: none; padding: 0; }
    body { background: white; font-size: 11pt; }
    h1, h2 { page-break-after: avoid; }
    table, .mermaid, pre, figure.screenshot { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<nav class="toc">
  <strong>Contents</strong>
  <ol>
    <li><a href="#section-1">Shared Foundation</a></li>
    <li><a href="#section-2a">Intermittent</a></li>
    <li><a href="#section-2b">Continuous</a></li>
    <li><a href="#section-2c">Proactive</a></li>
    <li><a href="#section-3">Comparison</a></li>
    <li><a href="#section-4">Rationale &amp; Limits</a></li>
  </ol>
</nav>
<main>
  <header class="chapter-header">
    <img class="brand" src="${BRAND_ICON}" alt="LearnPal" />
    <div class="titles">
      <div class="h1">Prototype Development</div>
      <div class="sub">Intermittent, Continuous, and Proactive Support in LearnPal</div>
    </div>
  </header>
  <div id="content"><em>Loading…</em></div>
</main>

<script type="module">
  import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js'
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'

  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

  const renderer = new marked.Renderer()
  const origCode = renderer.code.bind(renderer)
  renderer.code = (code, lang) => {
    if (lang === 'mermaid') return \`<div class="mermaid">\${code}</div>\`
    return origCode(code, lang)
  }
  marked.use({ renderer })

  const md = ${JSON.stringify(combined)}
  let html = marked.parse(md)
  // Add anchor IDs to the section headings so the TOC links work.
  const anchors = [
    ['Section 1: The Shared Foundation', 'section-1'],
    ['Section 2a: The Intermittent Prototype', 'section-2a'],
    ['Section 2b: The Continuous Prototype', 'section-2b'],
    ['Section 2c: The Proactive Prototype', 'section-2c'],
    ['Section 3: Putting the Three Side by Side', 'section-3'],
    ['Section 4: Implementation Rationale, Trade-offs, and Limitations', 'section-4'],
  ]
  for (const [title, id] of anchors) {
    html = html.replace(new RegExp(\`<h1>\${title.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}</h1>\`), \`<h1 id="\${id}">\${title}</h1>\`)
  }
  document.getElementById('content').innerHTML = html
  await mermaid.run({ querySelector: '.mermaid' })
</script>
</body>
</html>
`

writeFileSync(resolve(here, 'learnpal-prototype-development.html'), html)

console.log('Wrote learnpal-prototype-development.md and learnpal-prototype-development.html')
console.log('Open learnpal-prototype-development.html in any browser to view with rendered diagrams.')

// --- Also emit a Vercel-deployable copy alongside the LearnPal-Demos repo
// (when present), with rewritten asset paths so it works as a static page
// next to the existing index.html on the public landing site.
import { existsSync } from 'node:fs'
const vercelDir = resolve(here, '../../../LearnPal-Demos')
if (existsSync(vercelDir)) {
  const vercelHtml = html
    .replaceAll('../../src/assets/Report-ss/', 'screenshots/')
    .replaceAll('../../src/assets/brand-icon.svg', 'brand-icon.svg')
    .replaceAll('../../src/assets/LearnPal-Favicon.svg', 'favicon.svg')
  writeFileSync(resolve(vercelDir, 'prototype-development.html'), vercelHtml)
  console.log(`Also wrote ${vercelDir}/prototype-development.html`)
}
