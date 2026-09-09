import React, { useCallback, useEffect, useRef, useState } from 'react';
import { contractOp, errorText, getEntity, getFindingsCsv, getFindingsStats } from './lib/api';
import { PeriodSub, PortalShell, usePortal, type Portal } from './lib/period';
import { DataTable, type Facet } from './lib/table';
import { AnalystStatusPill, Card, CustomerStatusPill, GenericKV, HistoricalEmpty, KV, LifecyclePill, Mono, SevBadge, Tile, useUI } from './lib/ui';
import { CUSTOMER_STATUSES, MODULE_LABEL, MODULE_ROUTE, PAGE, cap, downloadText, fmt, human, navigate, periodLabel } from './lib/util';

const CONTRACT = 'easm.findings.operations';
const PAGE_ID = 'easm-findings';
const ENTITY_TABLE: Record<string, string> = { login_portals: 'login_portals', certificates: 'certificate_risks', vulnerabilities: 'vulnerabilities', dark_web: 'dark_web', files: 'files', code: 'code', credentials: 'credentials' };

async function mutate(op: 'set_status' | 'set_owner' | 'set_note', id: string, fields: Record<string, any>) {
  return contractOp(PAGE_ID, CONTRACT, op, { params: { entityType: 'finding', entityId: id, ...fields }, idempotencyKey: `${op}:${id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` });
}

export default function Page() {
  const portal = usePortal();
  return (
    <PortalShell portal={portal} title="Findings tracker" sub={<PeriodSub portal={portal} extra="one line per finding across all modules · customer status is yours to set" />}>
      {portal.isKpiOnly ? <HistoricalEmpty label={portal.selectedId || ''} onBack={() => portal.setPeriod(null)} /> : <Tracker portal={portal} />}
    </PortalShell>
  );
}

function Tracker({ portal }: { portal: Portal }) {
  const ui = useUI();
  const d = portal.data!; const A = d.aggregates || {};
  const [stats, setStats] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const loadStats = useCallback(() => { getFindingsStats().then((s) => setStats(s.by_status || {})).catch(() => {}); }, []);
  useEffect(() => { loadStats(); }, [loadStats, d.period?.period_id]);
  const localEdits = useRef<Record<string, any>>({});

  const apply = async (op: 'set_status' | 'set_owner' | 'set_note', id: string, fields: Record<string, any>, quiet = false) => {
    try {
      const res = await mutate(op, id, fields);
      localEdits.current[id] = { ...(localEdits.current[id] || {}), ...fields, overlay_version: res.overlayVersion };
      if (!quiet) ui.toast(<><strong>Saved</strong><br />{human(Object.keys(fields)[0])} updated for {id}.</>, 2500);
      if ('customer_status' in fields) loadStats();
      return true;
    } catch (e: any) {
      ui.toast(<><strong>Could not save</strong><br />{errorText(e)}</>, 6000);
      return false;
    }
  };
  const exportCsv = async () => {
    try { const r = await getFindingsCsv(); downloadText(r.filename, r.csv); ui.toast(<><strong>CSV exported</strong><br />{fmt(r.rows)} findings · {r.filename}</>, 3000); }
    catch (e: any) { ui.toast(<><strong>Export failed</strong><br />{errorText(e)}</>, 5000); }
  };
  const facets: Facet[] = [
    { key: 'severity', label: 'Severity', options: A.findings?.severity || [], format: cap },
    { key: 'module', label: 'Module', options: A.findings?.module || [], format: (v) => MODULE_LABEL[v] || human(v) },
  ];
  const selects = [
    { key: 'customer_status', label: 'Customer status', options: CUSTOMER_STATUSES },
    { key: 'analyst_status', label: 'Analyst status', options: (A.findings?.analyst_status || []).map((o: any) => [o.label, `${human(o.label)} (${fmt(o.value)})`] as [string, string]) },
    { key: 'lifecycle', label: 'Lifecycle', options: (A.findings?.lifecycle || []).map((o: any) => [o.label, `${cap(o.label)} (${fmt(o.value)})`] as [string, string]) },
  ];
  const openDrawer = (f: any) => {
    const ref = f.entity_ref || {};
    const table = ENTITY_TABLE[f.module];
    ui.openDrawer({
      kicker: MODULE_LABEL[f.module] || human(f.module), title: f.title, sub: <><SevBadge sev={f.severity} /> <AnalystStatusPill s={f.analyst_status} /> <LifecyclePill row={f} /></>,
      body: <FindingDrawer f={f} table={table} entityId={ref.id} apply={apply} latest={portal.latestId} />,
    });
  };
  return (
    <>
      <div className="row-between mb-16">
        <div className="tiles" style={{ flex: 1 }}>{CUSTOMER_STATUSES.map(([k, label]) => <Tile key={k} label={label} value={stats[k] || 0} />)}</div>
        <button className="btn" onClick={exportCsv}>Export CSV</button>
      </div>
      <Card>
        <DataTable module="findings" refreshKey={refreshKey} selectable minWidth={1180} searchPlaceholder="Search findings" defaultSort={{ key: '_sev', dir: 'asc' }} facets={facets} selects={selects}
          bulk={(ids, clear) => <BulkBar ids={ids} clear={clear} busy={busy} onApply={async (status) => { setBusy(true); let ok = 0; for (const id of ids) { if (await apply('set_status', id, { customer_status: status }, true)) ok++; } setBusy(false); clear(); setRefreshKey((k) => k + 1); loadStats(); ui.toast(<><strong>{fmt(ok)} of {fmt(ids.length)} findings set to {(CUSTOMER_STATUSES.find((s) => s[0] === status) || [])[1] || status}</strong><br />Saved through the audited access contract.</>); }} />}
          columns={[
            { key: 'severity', label: 'Severity', width: '96px', render: (f) => <SevBadge sev={f.severity} />, sortKey: '_sev' },
            { key: 'module', label: 'Module', width: '150px', render: (f) => MODULE_LABEL[f.module] || human(f.module) },
            { key: 'title', label: 'Finding', cls: 'wrap' },
            { key: 'analyst_status', label: 'Analyst status', width: '120px', render: (f) => <AnalystStatusPill s={f.analyst_status} /> },
            { key: 'customer_status', label: 'Customer status', width: '150px', sortable: false, render: (f) => <StatusSelect f={f} edits={localEdits} apply={apply} /> },
            { key: 'owner', label: 'Owner', width: '150px', sortable: false, render: (f) => <OwnerInput f={f} edits={localEdits} apply={apply} /> },
            { key: 'lifecycle', label: 'Lifecycle', width: '100px', render: (f) => <LifecyclePill row={f} /> },
            { key: 'first_seen_period', label: 'First seen', width: '96px', render: (f) => f.first_seen_period ? periodLabel(f.first_seen_period) : <span className="muted">earlier</span> },
          ]}
          onRow={openDrawer} />
      </Card>
    </>
  );
}

function BulkBar({ ids, clear, busy, onApply }: { ids: string[]; clear: () => void; busy: boolean; onApply: (status: string) => void }) {
  const [status, setStatus] = useState('acknowledged');
  return <><label className="muted">Set customer status</label><select className="select select-sm" value={status} onChange={(e) => setStatus(e.target.value)}>{CUSTOMER_STATUSES.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onApply(status)}>{busy ? 'Saving…' : 'Apply to selected'}</button></>;
}
function StatusSelect({ f, edits, apply }: { f: any; edits: React.MutableRefObject<Record<string, any>>; apply: (op: any, id: string, fields: any) => Promise<boolean> }) {
  const [v, setV] = useState<string>(edits.current[f.id]?.customer_status || f.customer_status || 'open');
  useEffect(() => { setV(edits.current[f.id]?.customer_status || f.customer_status || 'open'); }, [f.id, f.customer_status]);
  return <select className="select select-sm" value={v} aria-label="Customer status" onChange={async (e) => { const nv = e.target.value; const old = v; setV(nv); if (!(await apply('set_status', f.id, { customer_status: nv }))) setV(old); }}>{CUSTOMER_STATUSES.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select>;
}
function OwnerInput({ f, edits, apply }: { f: any; edits: React.MutableRefObject<Record<string, any>>; apply: (op: any, id: string, fields: any) => Promise<boolean> }) {
  const [v, setV] = useState<string>(edits.current[f.id]?.owner ?? f.owner ?? '');
  useEffect(() => { setV(edits.current[f.id]?.owner ?? f.owner ?? ''); }, [f.id, f.owner]);
  const save = () => { const cur = edits.current[f.id]?.owner ?? f.owner ?? ''; if (v !== cur) apply('set_owner', f.id, { owner: v }); };
  return <input className="input input-sm" style={{ width: '100%' }} value={v} placeholder="Assign owner" aria-label="Owner" onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
function FindingDrawer({ f, table, entityId, apply, latest }: { f: any; table?: string; entityId?: string; apply: (op: any, id: string, fields: any) => Promise<boolean>; latest: string | null }) {
  const [entity, setEntity] = useState<any>(null);
  const [note, setNote] = useState(f.customer_note || '');
  const [status, setStatus] = useState(f.customer_status || 'open');
  useEffect(() => { if (table && entityId) getEntity(table, entityId).then((r) => setEntity(r.record)).catch(() => setEntity(null)); }, [table, entityId]);
  return (
    <>
      <KV pairs={[['Finding ID', <Mono v={f.id} />], ['Customer status', <CustomerStatusPill s={status} />], ['Owner', f.owner], ['First seen', f.first_seen_period ? periodLabel(f.first_seen_period) : 'Before ' + periodLabel(latest)], f.updated_by ? ['Last edited', `${f.updated_by} · ${f.updated_at}`] : null]} />
      <h4>Customer status</h4>
      <select className="select select-sm" value={status} onChange={async (e) => { const nv = e.target.value; const old = status; setStatus(nv); if (!(await apply('set_status', f.id, { customer_status: nv }))) setStatus(old); }}>{CUSTOMER_STATUSES.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select>
      <h4>Customer note</h4>
      <textarea className="input" value={note} placeholder="Add context for your team" onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== (f.customer_note || '')) apply('set_note', f.id, { customer_note: note }); }} />
      {entity ? <><h4>Entity</h4><GenericKV row={entity} /></> : f.entity_ref?.type === 'email_set' ? <><h4>Entity</h4><p className="small secondary">Aggregated finding: {fmt(f.aggregate_count)} corporate email addresses are listed under <a onClick={() => navigate(`${PAGE.leaks}?tab=emails`)}>Data Leaks · Emails</a>.</p></> : null}
      {MODULE_ROUTE[f.module] ? <div className="mt-16"><a onClick={() => navigate(MODULE_ROUTE[f.module])}>Open module page</a></div> : null}
    </>
  );
}
