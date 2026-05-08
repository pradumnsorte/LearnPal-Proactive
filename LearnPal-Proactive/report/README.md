# LearnPal — Prototypes Chapter (Report Assets)

This directory contains the draft material for the "Prototype design" chapter of the thesis report, plus all supporting diagrams and a screenshot checklist.

## Layout

```
report/
├── README.md                   <- you are here
├── sections/
│   ├── 01-shared-foundation.md         <- common architecture, schema, instrumentation
│   ├── 02a-intermittent.md             <- per-prototype: Intermittent
│   ├── 02b-continuous.md               <- per-prototype: Continuous
│   ├── 02c-proactive.md                <- per-prototype: Proactive
│   ├── 03-comparison.md                <- side-by-side, ICAP mapping, AI-acceptance
│   └── 04-rationale-limitations.md     <- why three prototypes; what we left out
├── diagrams/
│   ├── 01-architecture.mmd             <- system architecture (Mermaid)
│   ├── 02-database-er.mmd              <- shared SQLite schema
│   ├── 03-intermittent-flow.mmd        <- learner-initiated flow
│   ├── 04-continuous-flow.mmd          <- background analyse + 4 streams
│   ├── 05-proactive-flow.mmd           <- 3 intervention pipelines
│   └── 06-icap-mapping.mmd             <- ICAP rungs per prototype
└── screenshots/
    └── CHECKLIST.md                    <- exactly which screenshots to capture
```

## Reading order

The drafts are written so that someone can read them top-to-bottom in this order:

1. `01-shared-foundation.md` — establishes everything common before the per-prototype detail
2. `02a-intermittent.md`, `02b-continuous.md`, `02c-proactive.md` — same structural template, easy to compare
3. `03-comparison.md` — pulls the three together
4. `04-rationale-limitations.md` — closes the chapter with explicit trade-offs

## Diagrams

All diagrams are Mermaid source. They render directly in:

- GitHub (any `.mmd` block in markdown)
- Notion, Obsidian (with Mermaid support)
- VS Code (with the Markdown Preview Mermaid Support extension)
- mermaid.live (paste the file contents)

To convert to PNG/SVG for a Word/LaTeX submission:

```bash
npx @mermaid-js/mermaid-cli -i diagrams/01-architecture.mmd -o diagrams/01-architecture.png
```

(This requires Chromium; the Mermaid CLI will pull it on first run.)

## Screenshots

See `screenshots/CHECKLIST.md` for the exact list. Capture these manually because the most informative states (populated feeds, transient popups, region overlays) require real video playback and live AI responses, which are brittle to script.

## What's still open

- **Citations.** No references included; the user requested an informal mention of ICAP rather than a formal cite. Citations can be added when the chapter is integrated into the full thesis.
- **Page-budget trimming.** Each section is intentionally over-rich; cut the side-tables that don't belong in the final document.
- **Final screenshot integration.** The drafts contain `> Suggested screenshot: …` callouts; replace each with a figure reference once the PNGs are captured.
