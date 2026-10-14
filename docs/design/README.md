# Design reference

Exported 2026-10-14 from the Claude Design project "Crypto Quant App Redesign".
This is the visual and interaction spec the web app must match.

- `Crypto Quant.dc.html` — the full prototype: layout, sidebar, header, every page, settings popover. The `<x-dc>` template uses `{{ }}` bindings; the `<script data-dc-script>` block at the bottom holds the view state, page table and derived props.
- `cq-engine.js` — mock data model and event bus (`window.CQ`). Shows the exact shape each page expects. In the real app this is replaced by the worker cache and stream.
- `cq-charts.js` — canvas custom elements: `cq-spark`, `cq-gauge`, `cq-fan`, `cq-radar`, `cq-bubbles`, `cq-timeline`, `cq-cum`, `cq-ladder`, `cq-miniring`, `cq-pulse`.
- `cq-scenes.js` — three.js scenes: `cq-liqstream`, `cq-galaxy`, `cq-cycle`.
- `support.js` — the Claude Design runtime (template parser). Not needed in the app.
- `check.jpg`, `diag.jpg` — reference screenshots of the prototype.
