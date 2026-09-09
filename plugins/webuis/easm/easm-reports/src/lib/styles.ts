// ThreatBook EASM Portal stylesheet, ported from prototype/assets/app.css.
// Everything is nested under `.easm` (native CSS nesting) so nothing leaks into the Flocks host document.
const FONTS = '/api/contracts/webui/pages/easm-overview/assets/fonts';
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

export const CSS = `
@font-face { font-family: 'Oswald'; font-style: normal; font-weight: 300 700; font-display: swap; src: url('${FONTS}/Oswald.woff2') format('woff2'); unicode-range: ${LATIN}; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('${FONTS}/Inter.woff2') format('woff2'); unicode-range: ${LATIN}; }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 100 800; font-display: swap; src: url('${FONTS}/JetBrainsMono.woff2') format('woff2'); unicode-range: ${LATIN}; }

.easm {
  --red: #DB0000; --ink: #3D3A39; --ink-70: rgba(61,58,57,.7); --ink-55: rgba(61,58,57,.55); --ink-40: rgba(61,58,57,.4); --ink-25: rgba(61,58,57,.25);
  --line: rgba(61,58,57,.12); --line-strong: rgba(61,58,57,.24); --surface: rgba(61,58,57,.04); --hover: rgba(61,58,57,.03); --canvas: #fff;
  --blue: #2D73DC; --blue-tint: rgba(45,115,220,.08); --green: #58AF1F; --green-tint: rgba(88,175,31,.1); --orange: #F99819; --orange-tint: rgba(249,152,25,.12);
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-display: 'Oswald', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace;
  --drawer-w: 420px; --shadow: 0 2px 4px rgba(61,58,57,.06);
  font-family: var(--font-ui); font-size: 13px; line-height: 1.45; color: var(--ink); background: var(--canvas); -webkit-font-smoothing: antialiased;
  height: 100%; overflow-y: auto; overflow-x: hidden; position: relative;
  * { box-sizing: border-box; }
  a { color: var(--blue); text-decoration: none; cursor: pointer; }
  a:hover { text-decoration: underline; }
  h1, h2, h3, h4 { margin: 0; font-weight: 600; }
  p { margin: 0; }
  button { font-family: inherit; }
  .hidden { display: none !important; }
  .mono { font-family: var(--font-mono); font-size: 12px; }
  .muted { color: var(--ink-55); }
  .secondary { color: var(--ink-70); }
  .small { font-size: 12px; }
  .nowrap { white-space: nowrap; }
  .pre { white-space: pre-line; }
  .right { text-align: right; }
  .num { font-variant-numeric: proportional-nums; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mt-8 { margin-top: 8px; } .mt-12 { margin-top: 12px; } .mt-16 { margin-top: 16px; } .mt-24 { margin-top: 24px; }
  .mb-8 { margin-bottom: 8px; } .mb-12 { margin-bottom: 12px; } .mb-16 { margin-bottom: 16px; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .stack { display: flex; flex-direction: column; gap: 8px; }

  /* shell: top strip + banner (the Flocks host provides the side navigation) */
  .easm-top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 12px; padding: 0 24px; height: 52px; background: #fff; border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { height: 22px; width: auto; display: block; }
  .brand-name { font-weight: 600; font-size: 14px; white-space: nowrap; }
  .brand-sep { width: 1px; height: 20px; background: var(--line-strong); }
  .brand-customer { color: var(--ink-70); font-size: 13px; white-space: nowrap; }
  .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .easm-top label { font-size: 12px; color: var(--ink-55); margin-right: 4px; }
  .banner { display: flex; align-items: center; gap: 12px; padding: 0 24px; height: 40px; background: var(--orange); color: var(--ink); font-size: 12.5px; font-weight: 500; }
  .banner a { color: var(--ink); text-decoration: underline; font-weight: 600; }
  .banner-draft { background: var(--blue-tint); border-bottom: 1px solid var(--line); color: var(--ink-70); }
  .page { padding: 20px 24px 48px; max-width: 1600px; }
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  .page-title { font-family: var(--font-display); font-weight: 600; font-size: 24px; letter-spacing: .01em; line-height: 1.15; }
  .page-sub { color: var(--ink-55); font-size: 12.5px; margin-top: 4px; }
  .page-actions { display: flex; gap: 8px; align-items: center; }
  .loading { padding: 40px 24px; color: var(--ink-55); font-size: 12.5px; }
  .error-box { margin: 20px 24px; padding: 12px 14px; border: 1px solid var(--red); border-radius: 4px; color: var(--ink); background: #fff; font-size: 12.5px; }

  /* cards & grids */
  .card { border: 1px solid var(--line); border-radius: 4px; background: #fff; padding: 16px; min-width: 0; }
  .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .card-title { font-size: 14px; font-weight: 600; }
  .card-sub { color: var(--ink-55); font-size: 12px; margin-top: 2px; }
  .grid { display: grid; gap: 16px; }
  .cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .cols-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  .cols-1-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
  .span-2 { grid-column: span 2; }
  @media (max-width: 1200px) { .cols-3, .cols-4, .cols-2-1, .cols-1-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 900px) { .cols-2, .cols-3, .cols-4, .cols-2-1, .cols-1-2 { grid-template-columns: minmax(0, 1fr); } .span-2 { grid-column: auto; } }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .section-sub { color: var(--ink-55); font-size: 12.5px; margin-bottom: 12px; }
  .group-label { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-40); margin: 4px 0 8px; }

  /* tiles */
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 12px; }
  .tile { border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; min-width: 0; background: #fff; }
  .tile.link { cursor: pointer; }
  .tile.link:hover { border-color: var(--blue); }
  .tile-label { font-size: 12px; color: var(--ink-70); font-weight: 500; }
  .tile-value { font-size: 24px; font-weight: 600; font-variant-numeric: proportional-nums; line-height: 1.2; margin-top: 4px; }
  .tile-value small { font-size: 12px; font-weight: 400; color: var(--ink-55); margin-left: 4px; }
  .tile-delta { font-size: 12px; margin-top: 4px; color: var(--ink-55); }
  .tile-delta.bad { color: var(--orange); font-weight: 600; }
  .tile-delta.good { color: var(--ink-70); }
  .kpi-strip { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .kpi-strip .tile { flex: 1 1 150px; }
  .hero { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
  .hero-figure { font-family: var(--font-display); font-weight: 600; font-size: 56px; line-height: 1; letter-spacing: .01em; }
  .hero-figure small { font-size: 20px; color: var(--ink-40); font-weight: 500; margin-left: 4px; }
  .meter { height: 8px; background: var(--line); border-radius: 2px; overflow: hidden; margin-top: 12px; }
  .meter > span { display: block; height: 100%; background: var(--blue); }
  .meter-scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-40); margin-top: 4px; }

  /* badges, pills, chips */
  .badge { display: inline-block; border-radius: 2px; padding: 3px 8px; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; line-height: 1; white-space: nowrap; vertical-align: middle; }
  .badge-high { background: var(--red); color: #fff; }
  .badge-medium, .badge-low { background: var(--orange); color: var(--ink); }
  .badge-info { background: var(--blue); color: #fff; }
  .badge-none { background: var(--green); color: var(--ink); }
  .badge-neutral { background: var(--surface); color: var(--ink-70); border: 1px solid var(--line); }
  .status { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 500; line-height: 1.5; white-space: nowrap; border: 1px solid var(--line-strong); color: var(--ink-70); background: #fff; vertical-align: middle; }
  .status-new { border-color: var(--blue); color: var(--blue); }
  .status-updated { border-color: var(--blue); background: var(--blue); color: #fff; }
  .status-muted { border-color: var(--line); color: var(--ink-40); background: var(--surface); }
  .status-green { border-color: var(--green); background: var(--green); color: var(--ink); }
  .status-orange { border-color: var(--orange); background: var(--orange); color: var(--ink); }
  .status-blue { border-color: var(--blue); background: var(--blue); color: #fff; }
  .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line-strong); border-radius: 2px; padding: 3px 8px; font-size: 12px; background: #fff; cursor: pointer; color: var(--ink-70); line-height: 1.4; white-space: nowrap; }
  .chip:hover { border-color: var(--ink-40); }
  .chip.active { border-color: var(--blue); color: var(--blue); background: var(--blue-tint); }
  .chip .n { color: var(--ink-40); font-size: 11px; }
  .tag { display: inline-block; border: 1px solid var(--line); border-radius: 2px; padding: 1px 6px; font-size: 11px; color: var(--ink-70); margin: 1px 2px 1px 0; background: #fff; }

  /* buttons and inputs */
  .btn { display: inline-flex; align-items: center; gap: 6px; font: 500 12px/1 var(--font-ui); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--line-strong); background: #fff; color: var(--ink); cursor: pointer; white-space: nowrap; }
  .btn:hover { border-color: var(--ink-40); background: var(--hover); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .btn:disabled:hover { border-color: var(--line-strong); background: #fff; }
  .btn-primary { background: var(--red); border-color: var(--red); color: #fff; }
  .btn-primary:hover { background: var(--red); border-color: var(--red); opacity: .92; }
  .btn-sm { padding: 5px 8px; font-size: 11px; }
  .btn-link { border: 0; background: none; color: var(--blue); padding: 0; font-size: 12.5px; font-weight: 500; cursor: pointer; }
  .btn-link:hover { text-decoration: underline; background: none; }
  .input, .select, textarea.input { font: 400 12.5px var(--font-ui); color: var(--ink); border: 1px solid var(--line-strong); border-radius: 4px; padding: 6px 8px; background: #fff; height: 30px; min-width: 0; }
  textarea.input { height: auto; min-height: 72px; resize: vertical; line-height: 1.45; width: 100%; }
  .select { padding-right: 24px; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%233D3A39' stroke-opacity='0.55' stroke-width='1.5'/></svg>"); background-repeat: no-repeat; background-position: right 8px center; }
  .select-sm, .input-sm { height: 26px; padding: 3px 6px; font-size: 12px; }
  .select-sm { padding-right: 22px; }
  .input:focus, .select:focus, textarea.input:focus, .btn:focus-visible, .chip:focus-visible, .tab:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .user-chip { display: inline-flex; align-items: center; gap: 8px; padding: 3px 10px 3px 3px; border: 1px solid var(--line); border-radius: 4px; font-size: 12px; }
  .user-chip .avatar { width: 22px; height: 22px; border-radius: 4px; background: var(--ink); color: #fff; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; letter-spacing: .04em; }
  .checkbox { width: 14px; height: 14px; margin: 0; accent-color: var(--blue); vertical-align: middle; cursor: pointer; }

  /* tabs */
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 16px; overflow-x: auto; }
  .tab { padding: 10px 12px; font-size: 13px; font-weight: 500; color: var(--ink-70); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; background: none; border-top: 0; border-left: 0; border-right: 0; cursor: pointer; }
  .tab:hover { color: var(--ink); text-decoration: none; }
  .tab.active { color: var(--blue); border-bottom-color: var(--blue); }
  .tab .n { color: var(--ink-40); font-weight: 400; margin-left: 4px; font-size: 12px; }
  .section-nav { position: sticky; top: 52px; z-index: 6; background: #fff; display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin: 0 -24px 16px; padding: 0 24px; overflow-x: auto; }
  .section-nav .tab { padding: 9px 12px; }

  /* tables */
  .tbl-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .tbl-toolbar .input { width: 240px; }
  .tbl-facets { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .tbl-facet-label { font-size: 11px; color: var(--ink-40); margin-right: 2px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  .tbl-facet-group { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-right: 8px; }
  .tbl-selects { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12.5px; min-width: 860px; }
  .table th { position: sticky; top: 0; z-index: 2; background: #fff; text-align: left; font-weight: 500; font-size: 12px; color: var(--ink-70); padding: 8px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; user-select: none; }
  .table th.nosort { cursor: default; }
  .table th .sort { color: var(--ink-40); font-size: 10px; margin-left: 4px; }
  .table th.sorted { color: var(--blue); }
  .table td { padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .table td.wrap { white-space: normal; overflow-wrap: anywhere; }
  .table tbody tr:hover { background: var(--hover); }
  .table tbody tr.clickable { cursor: pointer; }
  .table tbody tr.selected { background: var(--blue-tint); }
  .table .cell-sub { display: block; font-size: 11.5px; color: var(--ink-55); white-space: normal; }
  .tbl-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 10px; flex-wrap: wrap; font-size: 12px; color: var(--ink-55); }
  .tbl-pager { display: flex; align-items: center; gap: 6px; }
  .tbl-body { overflow-x: auto; min-height: 60px; }
  .tbl-body.busy { opacity: .55; }
  .tbl-empty { padding: 24px; text-align: center; color: var(--ink-55); font-size: 12.5px; }
  .bulk-bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--blue); background: var(--blue-tint); border-radius: 4px; margin-bottom: 10px; font-size: 12.5px; flex-wrap: wrap; }
  .simple-table { min-width: 0; }
  .simple-table td, .simple-table th { padding: 6px 8px; }

  /* charts */
  .chart { position: relative; min-width: 0; }
  .chart svg { display: block; width: 100%; height: auto; overflow: visible; }
  .chart text { font-family: var(--font-ui); }
  .chart-title { font-size: 12.5px; font-weight: 500; color: var(--ink-70); margin-bottom: 8px; }
  .legend { display: flex; gap: 16px; font-size: 12px; color: var(--ink-70); margin-top: 8px; flex-wrap: wrap; }
  .legend .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }

  /* notes and empty states */
  .note { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; font-size: 12.5px; color: var(--ink-70); }
  .note-warn { background: var(--orange-tint); }
  .none-card { border: 1px solid var(--line); border-radius: 4px; background: var(--green-tint); padding: 16px; }
  .pending-card { border: 1px solid var(--line); border-radius: 4px; background: var(--orange-tint); padding: 16px; }
  .none-card .title, .pending-card .title { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .none-card p, .pending-card p { margin-top: 6px; color: var(--ink-70); font-size: 12.5px; }
  .empty-state { border: 1px solid var(--line); border-radius: 4px; padding: 40px 24px; text-align: center; color: var(--ink-55); }
  .empty-state .title { font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { padding: 8px 0; border-bottom: 1px solid var(--line); display: flex; gap: 10px; align-items: flex-start; }
  .list li:last-child { border-bottom: 0; }
  .list .badge { flex: 0 0 auto; margin-top: 1px; }
  .coverage-row { display: grid; grid-template-columns: minmax(0, 2fr) 200px 110px minmax(0, 2fr); gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; }
  .coverage-row:last-child { border-bottom: 0; }
  .coverage-head { font-size: 11px; color: var(--ink-40); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  @media (max-width: 1000px) { .coverage-row { grid-template-columns: 1fr 1fr; } }
  ol.plain { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.5; }
  ul.plain { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.5; }

  /* drawer */
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: var(--drawer-w); max-width: 100%; background: #fff; border-left: 1px solid var(--line); box-shadow: var(--shadow); z-index: 60; transform: translateX(100%); transition: transform .18s ease; display: flex; flex-direction: column; font-family: var(--font-ui); font-size: 13px; color: var(--ink); }
  .drawer.open { transform: none; }
  .drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  .drawer-kicker { font-size: 11px; color: var(--ink-40); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  .drawer-title { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; margin-top: 2px; }
  .drawer-sub { font-size: 12px; color: var(--ink-55); margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .drawer-close { border: 1px solid transparent; background: none; font-size: 18px; line-height: 1; padding: 4px 8px; cursor: pointer; color: var(--ink-55); border-radius: 4px; }
  .drawer-close:hover { border-color: var(--line-strong); color: var(--ink); }
  .drawer-body { padding: 16px; overflow: auto; flex: 1; }
  .kv { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 7px 12px; font-size: 12.5px; margin: 0; }
  .kv dt { color: var(--ink-55); }
  .kv dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
  .drawer h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-40); margin: 18px 0 8px; font-weight: 600; }
  .evidence { border: 1px solid var(--line); border-radius: 4px; padding: 12px; background: var(--surface); }
  .evidence-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-weight: 600; font-size: 12.5px; }
  .evidence img { max-width: 100%; display: block; border: 1px solid var(--line); border-radius: 2px; background: #fff; margin-top: 8px; }
  .evidence p { font-size: 11.5px; color: var(--ink-55); margin-top: 8px; }
  .pw-cell { display: inline-flex; align-items: center; gap: 8px; }
  .pw-revealed { font-family: var(--font-mono); font-size: 12px; color: var(--ink); background: var(--orange-tint); padding: 1px 6px; border-radius: 2px; }

  /* toasts, modal */
  .toasts { position: fixed; right: 16px; bottom: 16px; z-index: 130; display: flex; flex-direction: column; gap: 8px; }
  .toast { background: var(--ink); color: #fff; padding: 10px 14px; border-radius: 4px; font-size: 12.5px; max-width: 380px; box-shadow: var(--shadow); line-height: 1.4; font-family: var(--font-ui); }
  .toast strong { font-weight: 600; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(61,58,57,.32); z-index: 110; display: flex; align-items: center; justify-content: center; }
  .modal { background: #fff; border-radius: 4px; width: 460px; max-width: calc(100% - 32px); padding: 20px; border: 1px solid var(--line); box-shadow: var(--shadow); font-family: var(--font-ui); font-size: 13px; color: var(--ink); }
  .modal-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .modal-body { font-size: 12.5px; color: var(--ink-70); }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

  /* reports */
  .period-row { cursor: pointer; }
  .source-list li { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 8px; }
  .step { display: inline-flex; align-items: center; gap: 8px; }
  .step-dot { width: 10px; height: 10px; border-radius: 2px; background: var(--line-strong); display: inline-block; }
  .step-dot.done { background: var(--blue); }
  .step-line { width: 40px; height: 1px; background: var(--line-strong); display: inline-block; }
}
`;

let injected = false;
export function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  if (!document.getElementById('easm-portal-style')) {
    const el = document.createElement('style');
    el.id = 'easm-portal-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }
  injected = true;
}
