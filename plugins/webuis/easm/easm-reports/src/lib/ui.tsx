// UI primitives + overlay providers (toast / modal / drawer) for the EASM Portal pages.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ANALYST_STATUS_LABEL, CUSTOMER_STATUSES, cap, fmt, human, navigate } from './util';

/* ---------------------------------------------------------------- overlays */
export interface ModalSpec { title: ReactNode; body: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm?: () => void | Promise<void> }
export interface DrawerSpec { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; body: ReactNode }
interface UIApi {
  toast: (msg: ReactNode, ms?: number) => void;
  modal: (spec: ModalSpec) => void;
  closeModal: () => void;
  openDrawer: (spec: DrawerSpec) => void;
  closeDrawer: () => void;
}
const UICtx = createContext<UIApi | null>(null);
export const useUI = (): UIApi => {
  const v = useContext(UICtx);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
};

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; msg: ReactNode; fading: boolean }>>([]);
  const [modalSpec, setModalSpec] = useState<ModalSpec | null>(null);
  const [drawer, setDrawer] = useState<DrawerSpec | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const seq = useRef(0);
  const toast = useCallback((msg: ReactNode, ms = 4200) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, fading: false }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, fading: true } : x))), ms);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms + 300);
  }, []);
  const closeModal = useCallback(() => setModalSpec(null), []);
  const modal = useCallback((spec: ModalSpec) => setModalSpec(spec), []);
  const openDrawer = useCallback((spec: DrawerSpec) => { setDrawer(spec); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (modalSpec) setModalSpec(null); else setDrawerOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalSpec]);
  const api = useMemo(() => ({ toast, modal, closeModal, openDrawer, closeDrawer }), [toast, modal, closeModal, openDrawer, closeDrawer]);
  const [busy, setBusy] = useState(false);
  return (
    <UICtx.Provider value={api}>
      {children}
      <div className={'drawer' + (drawerOpen ? ' open' : '')} aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="drawer-kicker">{drawer?.kicker}</div>
            <div className="drawer-title">{drawer?.title}</div>
            {drawer?.sub ? <div className="drawer-sub">{drawer.sub}</div> : null}
          </div>
          <button className="drawer-close" onClick={closeDrawer} aria-label="Close details" title="Close (Esc)">×</button>
        </div>
        <div className="drawer-body">{drawerOpen ? drawer?.body : null}</div>
      </div>
      {modalSpec ? (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-title">{modalSpec.title}</div>
            <div className="modal-body">{modalSpec.body}</div>
            <div className="modal-actions">
              <button className="btn" onClick={closeModal} disabled={busy}>{modalSpec.cancelLabel || 'Cancel'}</button>
              <button className={'btn' + (modalSpec.danger ? ' btn-primary' : '')} disabled={busy} autoFocus onClick={async () => {
                try { setBusy(true); await modalSpec.onConfirm?.(); } finally { setBusy(false); closeModal(); }
              }}>{modalSpec.confirmLabel || 'Confirm'}</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast" style={{ transition: 'opacity .25s', opacity: t.fading ? 0 : 1 }}>{t.msg}</div>)}
      </div>
    </UICtx.Provider>
  );
}

/* ---------------------------------------------------------------- small pieces */
export const Mono = ({ v }: { v: unknown }) => (v == null || v === '' ? <span className="muted">—</span> : <span className="mono">{String(v)}</span>);
export const Dash = ({ v }: { v: unknown }) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? <span className="muted">—</span> : <>{String(v)}</>);

export function SevBadge({ sev }: { sev: unknown }) {
  const s = String(sev || 'none').toLowerCase();
  const cls = ({ high: 'high', critical: 'high', medium: 'medium', low: 'low', info: 'info', none: 'none' } as Record<string, string>)[s] || 'neutral';
  return <span className={'badge badge-' + cls}>{s === 'none' ? 'None found' : s}</span>;
}
export const Pill = ({ text, kind }: { text: ReactNode; kind?: string }) => <span className={'status' + (kind ? ' status-' + kind : '')}>{text}</span>;
export function LifecyclePill({ row }: { row: any }) {
  const lc = row?.lifecycle || 'active';
  const label = row?.lifecycle_label || lc;
  if (lc === 'new') return <Pill text="New" kind="new" />;
  if (lc === 'updated') return <Pill text="Updated" kind="updated" />;
  if (lc === 'active') return <Pill text="Active" />;
  return <Pill text={human(label)} kind="muted" />;
}
export function AnalystStatusPill({ s }: { s: string }) {
  const label = ANALYST_STATUS_LABEL[s] || human(s);
  if (s === 'verified' || s === 'confirmed') return <Pill text={label} kind="blue" />;
  if (s === 'taken_down') return <Pill text={label} kind="green" />;
  if (s === 'to_confirm') return <Pill text={label} kind="orange" />;
  if (s === 'invalid' || s === 'expired') return <Pill text={label} kind="muted" />;
  return <Pill text={label} />;
}
export function CustomerStatusPill({ s }: { s: string }) {
  const label = (CUSTOMER_STATUSES.find((x) => x[0] === s) || [s, human(s)])[1];
  if (s === 'resolved') return <Pill text={label} kind="green" />;
  if (s === 'in_progress' || s === 'acknowledged') return <Pill text={label} kind="blue" />;
  if (s === 'false_positive' || s === 'risk_accepted') return <Pill text={label} kind="muted" />;
  return <Pill text={label} />;
}
export function CoverageChip({ c }: { c: any }) {
  if (c.status === 'findings') return <Pill text={'Findings · ' + fmt(c.count)} />;
  if (c.status === 'monitored_none') return <Pill text="Monitored — none found" kind="green" />;
  return <Pill text="Pending confirmation" kind="orange" />;
}
export function Tags({ arr, max }: { arr: any[] | null | undefined; max?: number }) {
  if (!arr || !arr.length) return <span className="muted">—</span>;
  const shown = max ? arr.slice(0, max) : arr;
  const more = arr.length - shown.length;
  return <>{shown.map((t, i) => <span key={i} className="tag">{String(t)}</span>)}{more > 0 ? <span className="tag">+{more}</span> : null}</>;
}

export function Tile({ label, value, delta, suffix, href, children }: { label: string; value: unknown; delta?: ReactNode; suffix?: string; href?: string; children?: ReactNode }) {
  const body = (
    <>
      <div className="tile-label">{label}</div>
      <div className="tile-value num">{typeof value === 'string' ? value : fmt(value)}{suffix ? <small>{suffix}</small> : null}</div>
      {delta}
      {children}
    </>
  );
  return href ? <div className="tile link" onClick={() => navigate(href)} role="link" tabIndex={0}>{body}</div> : <div className="tile">{body}</div>;
}
export function Delta({ cur, prev, prevLabel, upIsBad = true }: { cur: number | null | undefined; prev: number | null | undefined; prevLabel?: string | null; upIsBad?: boolean }) {
  if (prev == null || cur == null) return <div className="tile-delta">{prevLabel ? `no ${prevLabel} baseline` : 'no baseline'}</div>;
  const d = cur - prev;
  if (d === 0) return <div className="tile-delta">unchanged vs {prevLabel}</div>;
  const bad = upIsBad ? d > 0 : d < 0;
  return <div className={'tile-delta ' + (bad ? 'bad' : 'good')}>{d > 0 ? 'up' : 'down'} {fmt(Math.abs(d))} vs {prevLabel}</div>;
}
export const KpiStrip = ({ items }: { items: Array<[string, unknown, ReactNode?]> }) => (
  <div className="kpi-strip">{items.map(([l, v, s], i) => <Tile key={i} label={l} value={v} delta={s ? <div className="tile-delta">{s}</div> : undefined} />)}</div>
);

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1 className="page-title">{title}</h1><div className="page-sub">{sub}</div></div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
export function Card({ title, sub, right, children, className }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={'card' + (className ? ' ' + className : '')}>
      {title || right ? <div className="card-head"><div>{title ? <div className="card-title">{title}</div> : null}{sub ? <div className="card-sub">{sub}</div> : null}</div>{right}</div> : null}
      {children}
    </div>
  );
}
export const Note = ({ warn, children, className }: { warn?: boolean; children: ReactNode; className?: string }) => <div className={'note' + (warn ? ' note-warn' : '') + (className ? ' ' + className : '')}>{children}</div>;
export function NoneCard({ title, coverage, fallbackDate }: { title: string; coverage?: any; fallbackDate?: string }) {
  return (
    <div className="none-card">
      <div className="title">{title} <Pill text="Monitored — none found" kind="green" /></div>
      <p>{coverage?.note || 'No findings this period.'} Last checked {coverage?.last_checked || fallbackDate || '—'}.</p>
    </div>
  );
}
export const PendingCard = ({ title, text }: { title: string; text: string }) => (
  <div className="pending-card"><div className="title">{title} <Pill text="Pending confirmation" kind="orange" /></div><p>{text}</p></div>
);
export function HistoricalEmpty({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="empty-state">
      <div className="title">Detail-level data was not captured for {label}</div>
      Only report-level KPIs were backfilled for this period. <a onClick={onBack}>Return to the latest period</a> to browse records.
    </div>
  );
}
export function Tabs({ tabs, active, onChange }: { tabs: Array<{ id: string; label: string; n?: number | null }>; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={'tab' + (t.id === active ? ' active' : '')} onClick={() => onChange(t.id)}>
          {t.label}{t.n != null ? <span className="n">{fmt(t.n)}</span> : null}
        </button>
      ))}
    </div>
  );
}
export function KV({ pairs }: { pairs: Array<[string, ReactNode] | null | undefined | false> }) {
  return (
    <dl className="kv">
      {pairs.filter(Boolean).map((p, i) => { const [k, v] = p as [string, ReactNode]; return <React.Fragment key={i}><dt>{k}</dt><dd>{v == null || v === '' ? <span className="muted">—</span> : v}</dd></React.Fragment>; })}
    </dl>
  );
}
/** Generic key/value dump of a record for drawers (skips internal + sensitive fields). */
export function GenericKV({ row, skip }: { row: any; skip?: string[] }) {
  const hide = new Set(['id', 'lifecycle', 'lifecycle_label', 'severity', 'headers', 'checks', 'screenshot', 'screenshots_extra', 'sensitive_screenshot', 'verification', 'password_masked', 'password_fp', 'password_length', 'period_id', 'duplicates_collapsed', ...(skip || [])]);
  const pairs: Array<[string, ReactNode]> = [];
  Object.keys(row || {}).forEach((k) => {
    if (k.startsWith('_') || hide.has(k)) return;
    const v = row[k];
    if (v == null || v === '') return;
    if (Array.isArray(v)) { if (v.length) pairs.push([human(k), <Tags arr={v} max={12} />]); return; }
    if (typeof v === 'object') return;
    const isMono = /url|host|domain|ip|email|username|hash|link|repository/.test(k) && typeof v === 'string';
    pairs.push([human(k), isMono ? <Mono v={v} /> : String(v)]);
  });
  return <KV pairs={pairs} />;
}
export function Evidence({ shots, urlFor, label, note, onView }: { shots: any[]; urlFor: (s: any) => string | null; label?: string; note?: string; onView?: () => void }) {
  const [open, setOpen] = useState(false);
  const list = (shots || []).filter(Boolean);
  if (!list.length) return <div className="evidence"><div className="evidence-head"><span>Restricted evidence</span><Pill text="Access-controlled" kind="muted" /></div><span className="muted small">No evidence screenshot was attached for this record.</span></div>;
  return (
    <div className="evidence">
      <div className="evidence-head"><span>Restricted evidence</span><Pill text="Access-controlled" kind="muted" /></div>
      <button className="btn btn-sm" onClick={() => { setOpen(!open); if (!open) onView?.(); }}>{open ? 'Hide evidence screenshot' : (label || 'View evidence screenshot')}{list.length > 1 ? ` (${list.length})` : ''}</button>
      {open ? list.map((s, i) => { const u = urlFor(s); return u ? <img key={i} src={u} alt="Evidence screenshot (masked by analyst)" loading="lazy" /> : null; }) : null}
      <p>{note || 'Evidence images are access-controlled and masked by the analyst before upload.'}</p>
    </div>
  );
}
export function ModuleNarrative({ narrative, mod }: { narrative: any; mod: string }) {
  const m = narrative?.modules?.[mod];
  if (!m) return null;
  return (
    <>
      {m.risk_statement ? <div className="note mb-12"><strong>Risk.</strong> {m.risk_statement}</div> : null}
      {m.period_notes?.length ? <div className="muted small mb-12">{m.period_notes.join(' ')}</div> : null}
    </>
  );
}
export function Recommendations({ narrative, mod }: { narrative: any; mod: string }) {
  const r = (narrative?.recommendations || []).find((x: any) => x.module === mod);
  if (!r) return null;
  return <><h4>Recommendations</h4><ol className="plain" style={{ margin: 0 }}>{r.items.map((i: string, k: number) => <li key={k}>{i}</li>)}</ol></>;
}
export const capText = cap;
