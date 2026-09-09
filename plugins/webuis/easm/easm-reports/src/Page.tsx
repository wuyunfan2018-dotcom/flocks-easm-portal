import React, { useEffect, useRef, useState } from 'react';
import { api } from '@flocks/webui-contract-sdk';
import { contractOp, errorText, getReport } from './lib/api';
import { PeriodSub, PortalShell, kpiTiles, usePortal, type Portal } from './lib/period';
import { Card, KV, Note, Pill, SevBadge, Tags, Tile, useUI } from './lib/ui';
import { fmt, periodLabel } from './lib/util';

const CONTRACT = 'easm.periods.operations';
const PAGE_ID = 'easm-reports';

export default function Page() {
  const portal = usePortal();
  const n = portal.periods.length;
  return (
    <PortalShell portal={portal} title="Reports and periods" sub={<PeriodSub portal={portal} extra={<>{fmt(n)} period{n === 1 ? '' : 's'} visible · customers only see published periods</>} />}>
      <Reports portal={portal} />
    </PortalShell>
  );
}

function Reports({ portal }: { portal: Portal }) {
  const ui = useUI();
  const d = portal.data!;
  const [rep, setRep] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const pid = d.period?.period_id;
  useEffect(() => { if (!pid || portal.isKpiOnly) { setRep(null); return; } getReport().then(setRep).catch((e) => setErr(errorText(e))); }, [pid, portal.isKpiOnly, portal.data]);
  const sel = portal.selectedId || portal.latestId;
  return (
    <>
      <Card className="section">
        <table className="table simple-table">
          <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 120 }} /><col style={{ width: 180 }} /><col style={{ width: 160 }} /></colgroup>
          <thead><tr><th className="nosort">Period</th><th className="nosort">Report</th><th className="nosort">Report date</th><th className="nosort">Status</th><th className="nosort">Contents</th><th className="nosort">Loaded / published</th></tr></thead>
          <tbody>
            {portal.periods.map((p) => {
              const dbp = (d.periods || []).find((x) => x.period_id === p.id);
              return (
                <tr key={p.id} className={'period-row' + (p.id === sel ? ' selected' : '')} onClick={() => portal.setPeriod(p.id)}>
                  <td>{p.label}</td><td>No.{p.report_no ?? '—'}</td><td>{p.report_date}</td>
                  <td>{p.status === 'published' ? <Pill text="Published" kind="green" /> : p.status === 'draft' ? <Pill text="Draft" kind="orange" /> : <Pill text="Published" kind="green" />}</td>
                  <td>{p.status === 'kpi' ? 'KPI-level backfill' : 'Full data pack'}{dbp?.needs_review ? <> · <Pill text="Needs review" kind="orange" /></> : null}</td>
                  <td className="muted">{dbp ? (dbp.published_at ? `${dbp.published_at} by ${dbp.published_by || '—'}` : `loaded ${dbp.loaded_at || ''}`) : 'from report text'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {portal.isKpiOnly ? (
        <>
          <Note warn className="mb-16">{portal.kpi?.source}</Note>
          <div className="tiles">{kpiTiles(portal.kpi?.kpis || {}).map(([l, v]) => <Tile key={l} label={l} value={v} />)}</div>
        </>
      ) : err ? <div className="error-box">{err}</div> : rep ? <ReportBody portal={portal} rep={rep} /> : <div className="loading">Loading…</div>}
    </>
  );
}

function ReportBody({ portal, rep }: { portal: Portal; rep: any }) {
  const ui = useUI();
  const kf = rep.narrative?.key_findings || [];
  const recs = rep.narrative?.recommendations || [];
  const p = rep.period;
  return (
    <>
      <div className="grid cols-2 section">
        <Card title="Scope" right={<span className="muted">{fmt(rep.scope?.root_domains?.length || 0)} root domains</span>}>
          <ul className="list">{(rep.scope?.scope_text || []).filter((t: string) => !/:\s*$/.test(t)).map((t: string, i: number) => <li key={i}><span className="small secondary">{t}</span></li>)}</ul>
          <div className="mt-12"><Tags arr={rep.scope?.root_domains || []} max={12} /></div>
        </Card>
        <Card title="Source files" right={<span className="muted">SHA-256 recorded at ingest</span>}>
          <ul className="list source-list">{(rep.sources || []).map((s: any, i: number) => <li key={i}><span className="muted">{s.kind ? s.kind.charAt(0).toUpperCase() + s.kind.slice(1) : ''}</span><span><span className="small">{s.file}</span><span className="cell-sub mono">{String(s.sha256 || '').slice(0, 24)}…</span></span></li>)}</ul>
          <p className="muted small mt-12">Original deliverables are distributed by the ThreatBook team; the portal keeps their hashes for traceability.</p>
        </Card>
      </div>
      <Card className="section" title="Key findings" right={<span className="muted">{fmt(kf.length)} items</span>}>
        <ul className="list">{kf.map((k: any, i: number) => <li key={i}><SevBadge sev={k.severity} /><span>{k.text}</span></li>)}</ul>
      </Card>
      <div className="section">
        <div className="section-title">Recommendations</div>
        <div className="grid cols-2">{recs.map((r: any, i: number) => <Card key={i}><div className="card-title">{r.title}</div><ol className="plain">{(r.items || []).map((it: string, k: number) => <li key={k}>{it}</li>)}</ol></Card>)}</div>
      </div>
      {rep.is_admin ? <AdminPanel portal={portal} rep={rep} /> : null}
    </>
  );
}

function AdminPanel({ portal, rep }: { portal: Portal; rep: any }) {
  const ui = useUI();
  const p = rep.period;
  const published = p.status === 'published';
  const [busy, setBusy] = useState(false);
  const change = (op: 'publish' | 'unpublish') => ui.modal({
    title: op === 'publish' ? `Publish ${p.label || p.period_id}?` : `Unpublish ${p.label || p.period_id}?`, danger: op === 'publish', confirmLabel: op === 'publish' ? 'Publish period' : 'Unpublish',
    body: op === 'publish' ? <>Customers will see this period immediately and it becomes the default period.{p.needs_review ? <><br /><br /><strong>This period is flagged needs review</strong> (cross-check mismatches or warnings below). Publishing confirms that you reviewed them.</> : null}</> : <>The period goes back to draft and disappears for customers.</>,
    onConfirm: async () => {
      setBusy(true);
      try {
        await contractOp(PAGE_ID, CONTRACT, op, { params: { entityType: 'period', entityId: p.period_id, acknowledge_review: !!p.needs_review }, idempotencyKey: `${op}:${p.period_id}:${Date.now()}` });
        ui.toast(<><strong>{op === 'publish' ? 'Period published' : 'Period unpublished'}</strong><br />{p.period_id} · {op === 'publish' ? 'visible to customers now' : 'hidden from customers'}</>);
        portal.reload();
      } catch (e: any) { ui.toast(<><strong>{op === 'publish' ? 'Publish' : 'Unpublish'} failed</strong><br />{errorText(e)}</>, 6000); }
      finally { setBusy(false); }
    },
  });
  const diffMods = rep.diff?.modules || {};
  return (
    <Card className="section" title="Period lifecycle (admin)" sub="Customers only see published periods">
      <div className="row mb-12">
        <span className="step"><span className="step-dot done" />Ingested</span><span className="step-line" />
        <span className="step"><span className={'step-dot' + (published || !p.needs_review ? ' done' : '')} />Reviewed</span><span className="step-line" />
        <span className="step"><span className={'step-dot' + (published ? ' done' : '')} />Published</span>
      </div>
      <div className="row mb-16">
        {published ? <><button className="btn" disabled={busy} onClick={() => change('unpublish')}>Unpublish period</button><span className="muted small">Published {p.published_at} by {p.published_by || '—'}.</span></>
          : <><button className="btn btn-primary" disabled={busy} onClick={() => change('publish')}>Publish period</button><span className="muted small">Draft loaded {p.loaded_at}. {p.needs_review ? 'Flagged needs review: check the cross-checks and warnings below first.' : 'Cross-checks passed.'}</span></>}
      </div>
      <h4 className="group-label">Ingest cross-checks</h4>
      <table className="table simple-table mb-12">
        <thead><tr><th className="nosort">Item</th><th className="nosort" style={{ width: 120 }}>Data pack</th><th className="nosort" style={{ width: 120 }}>Report</th><th className="nosort" style={{ width: 100 }}>Match</th><th className="nosort">Note</th></tr></thead>
        <tbody>{(rep.cross_checks || []).map((c: any, i: number) => <tr key={i}><td>{c.item}</td><td>{fmt(c.datapack)}</td><td>{fmt(c.report)}</td><td>{c.match ? <Pill text="OK" kind="green" /> : <Pill text="Check" kind="orange" />}</td><td className="muted wrap">{c.note || ''}</td></tr>)}</tbody>
      </table>
      {rep.warnings?.length ? <Note warn className="mb-12 small">{rep.warnings.map((w: string, i: number) => <div key={i}>{w}</div>)}</Note> : null}
      <div className="grid cols-3 mb-12">
        <div><h4 className="group-label">Row counts</h4><KV pairs={Object.entries(rep.counts || {}).map(([k, v]) => [k, fmt(v as number)] as [string, React.ReactNode])} /></div>
        <div><h4 className="group-label">Period diff ({rep.diff?.mode || 'none'})</h4><KV pairs={Object.entries(diffMods).slice(0, 12).map(([k, v]: any) => [k, v.mode === 'detail' ? `+${fmt(v.new)} / −${fmt(v.gone)} / kept ${fmt(v.kept)}` : v.mode] as [string, React.ReactNode])} /></div>
        <div><h4 className="group-label">Housekeeping</h4><KV pairs={[['Duplicates collapsed', rep.duplicates_collapsed ? Object.entries(rep.duplicates_collapsed).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'], ['Password reveals (audited)', fmt(rep.audit_reveal_count)], ['Generator', rep.generator ? `${rep.generator.name} ${rep.generator.version}` : '—']]} /></div>
      </div>
      <RunIngest portal={portal} />
    </Card>
  );
}

function RunIngest({ portal }: { portal: Portal }) {
  const ui = useUI();
  const [form, setForm] = useState({ period_id: '', report_no: '', report_date: '', previous_period_id: portal.latestId || '', datapack_path: '' });
  const [run, setRun] = useState<{ id: string; status: string; msg?: string } | null>(null);
  const timer = useRef<any>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const poll = async (id: string) => {
    try {
      const r = await (api as any).get(`/api/workflow/easm_ingest/history/${id}`);
      const j = r.data; const out = j.outputResults || {};
      if (j.status === 'running' || j.status === 'pending') { setRun({ id, status: j.status, msg: `node ${j.currentNodeId || ''}` }); timer.current = setTimeout(() => poll(id), 4000); }
      else { setRun({ id, status: j.status, msg: j.status === 'success' ? `loaded ${out.period_id} as draft · needs_review ${out.needs_review ? 'yes' : 'no'} · diff ${out.diff_mode}` : (j.errorMessage || '').slice(0, 300) }); if (j.status === 'success') portal.reload(); }
    } catch (e: any) { setRun({ id, status: 'error', msg: errorText(e) }); }
  };
  const start = async () => {
    if (!form.period_id || !form.report_no || !form.report_date) { ui.toast('period id, report no and report date are required', 3000); return; }
    try {
      const inputs: any = { period_id: form.period_id, report_no: Number(form.report_no), report_date: form.report_date, previous_period_id: form.previous_period_id || '', datapack_path: form.datapack_path || '' };
      const r = await (api as any).post('/api/workflow/easm_ingest/run', { inputs, timeoutS: 1800 });
      setRun({ id: r.data.id, status: r.data.status || 'running' }); timer.current = setTimeout(() => poll(r.data.id), 4000);
    } catch (e: any) { ui.toast(<><strong>Could not start ingest</strong><br />{errorText(e)}</>, 6000); }
  };
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <>
      <h4 className="group-label">Run ingest (easm_ingest workflow)</h4>
      <p className="muted small mb-8">Upload the deliverables to <span className="mono">workspace/easm/inbox/&lt;period&gt;/</span> first (or point to a ready datapack.json). The period is loaded as a draft; publish it above after review.</p>
      <div className="row mb-8">
        <input className="input input-sm" placeholder="Period id (e.g. 2026Q3)" style={{ width: 150 }} {...f('period_id')} />
        <input className="input input-sm" placeholder="Report no." style={{ width: 100 }} {...f('report_no')} />
        <input className="input input-sm" placeholder="Report date YYYY-MM-DD" style={{ width: 170 }} {...f('report_date')} />
        <input className="input input-sm" placeholder="Previous period id" style={{ width: 150 }} {...f('previous_period_id')} />
        <input className="input input-sm" placeholder="datapack.json path (optional)" style={{ width: 260 }} {...f('datapack_path')} />
        <button className="btn btn-sm" onClick={start} disabled={!!run && (run.status === 'running' || run.status === 'pending')}>Run ingest</button>
      </div>
      {run ? <Note className="small">Run {run.id.slice(0, 8)} · <strong>{run.status}</strong> {run.msg ? `· ${run.msg}` : ''}</Note> : null}
    </>
  );
}
