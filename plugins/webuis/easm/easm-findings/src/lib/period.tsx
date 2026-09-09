// Period state + page shell (top strip with period switcher, historical / draft banners).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSummary, type Period, type Summary } from './api';
import { ensureStyles } from './styles';
import { UIProvider, PageHead, Pill } from './ui';
import { fmt, getQuery, initials, periodLabel, setQuery } from './util';

export interface PeriodOption { id: string; label: string; status: 'draft' | 'published' | 'kpi'; report_no?: number | null; report_date?: string | null; virtual?: boolean }
export interface Portal {
  loading: boolean; error: string | null; data: Summary | null;
  period: Period | null; periods: PeriodOption[]; selectedId: string | null;
  isAdmin: boolean; user: string; latestId: string | null;
  isLatest: boolean; isHistorical: boolean; isDraft: boolean; isKpiOnly: boolean;
  kpi: any | null; prevLabel: string | null;
  setPeriod: (id: string | null) => void; reload: () => void;
}

const LOGO = '/api/contracts/webui/pages/easm-overview/assets/brand/logo-tb-horizontal.png';

export function usePortal(): Portal {
  const [selectedId, setSelectedId] = useState<string | null>(() => getQuery().get('period'));
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Summary | null; fetchedFor: string | null }>({ loading: true, error: null, data: null, fetchedFor: null });
  const [tick, setTick] = useState(0);

  // A period id that is not in the DB (KPI-level backfill from previous_summary) is served from the latest period's payload.
  const virtualIds = useMemo(() => {
    const d = state.data; if (!d) return new Set<string>();
    const dbIds = new Set((d.periods || []).map((p) => p.period_id));
    const v = new Set<string>();
    const ps = d.previous_summary; if (ps?.period_id && !dbIds.has(ps.period_id)) v.add(ps.period_id);
    return v;
  }, [state.data]);

  useEffect(() => {
    let alive = true;
    const want = selectedId || '';
    const fetchFor = state.data && virtualIds.has(want) ? '' : want;
    setState((s) => ({ ...s, loading: true, error: null }));
    getSummary(fetchFor).then((data) => {
      if (!alive) return;
      // if the requested id turned out to be a KPI-only period we may have fetched the wrong period: re-fetch latest
      const dbIds = new Set((data.periods || []).map((p) => p.period_id));
      const ps = data.previous_summary;
      if (want && !dbIds.has(want) && data.period && data.period.period_id !== want && !(ps && ps.period_id === want)) {
        setState({ loading: false, error: `Period ${want} is not available to you.`, data, fetchedFor: fetchFor });
      } else setState({ loading: false, error: null, data, fetchedFor: fetchFor });
    }).catch((e) => { if (alive) setState((s) => ({ ...s, loading: false, error: String(e?.response?.data?.detail || e?.message || e) })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tick]);

  useEffect(() => {
    const onPop = () => setSelectedId(getQuery().get('period'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const d = state.data;
  const latestId = d?.latest || null;
  const periods: PeriodOption[] = useMemo(() => {
    if (!d) return [];
    const out: PeriodOption[] = (d.periods || []).map((p) => ({ id: p.period_id, label: `${p.label || periodLabel(p.period_id)}`, status: p.status, report_no: p.report_no, report_date: p.report_date }));
    const ps = d.previous_summary;
    if (ps?.period_id && !out.some((p) => p.id === ps.period_id)) out.push({ id: ps.period_id, label: `${periodLabel(ps.period_id)} · Report No.${ps.report_no ?? '?'}`, status: 'kpi', report_no: ps.report_no, report_date: ps.report_date, virtual: true });
    return out;
  }, [d]);
  const isKpiOnly = !!(selectedId && virtualIds.has(selectedId));
  const period = d?.period || null;
  const isDraft = !isKpiOnly && period?.status === 'draft';
  const isLatest = !isKpiOnly && !!period && period.period_id === latestId;
  const isHistorical = !isKpiOnly && !!period && period.status === 'published' && !isLatest;
  const setPeriod = useCallback((id: string | null) => {
    const next = id && id !== (d?.latest || '') ? id : null;
    setQuery({ period: next });
    setSelectedId(next);
  }, [d?.latest]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const ps = d?.previous_summary;
  return {
    loading: state.loading, error: state.error, data: d, period, periods, selectedId,
    isAdmin: !!d?.is_admin, user: d?.user || '', latestId, isLatest, isHistorical, isDraft, isKpiOnly,
    kpi: isKpiOnly ? ps : null, prevLabel: ps?.period_id ? periodLabel(ps.period_id) : (d?.previous_period ? periodLabel(d.previous_period.period_id) : null),
    setPeriod, reload,
  };
}

/** Sub-title line under the page title: period label, report date, status pill. */
export function PeriodSub({ portal, extra }: { portal: Portal; extra?: ReactNode }) {
  if (portal.isKpiOnly && portal.kpi) return <>{periodLabel(portal.kpi.period_id)} · Report No.{portal.kpi.report_no} · report date {portal.kpi.report_date} · <Pill text="KPI-level backfill" kind="orange" />{extra ? <> · {extra}</> : null}</>;
  const p = portal.period;
  if (!p) return <>{extra}</>;
  return <>{p.label || periodLabel(p.period_id)} · report date {p.report_date} · {p.status === 'published' ? <span className="status status-green">Published</span> : <span className="status status-orange">Draft</span>}{extra ? <> · {extra}</> : null}</>;
}

export function PortalShell({ portal, title, sub, actions, children, customer }: { portal: Portal; title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode; customer?: string }) {
  ensureStyles();
  const cust = customer || portal.period?.customer_name || portal.data?.period?.customer_name || '';
  return (
    <div className="easm">
      <UIProvider>
        <div className="easm-top">
          <div className="brand">
            <img src={LOGO} alt="ThreatBook" />
            <span className="brand-name">EASM Portal</span>
            {cust ? <><span className="brand-sep" /><span className="brand-customer">{cust}</span></> : null}
          </div>
          <div className="topbar-right">
            <label htmlFor="easm-period">Period</label>
            <select id="easm-period" className="select select-sm" value={portal.selectedId || portal.latestId || ''} onChange={(e) => portal.setPeriod(e.target.value)} aria-label="Reporting period" disabled={!portal.periods.length}>
              {portal.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}{p.id === portal.latestId ? ' · latest, published' : p.status === 'draft' ? ' · draft (admin only)' : p.status === 'kpi' ? ' · KPI-level only' : ' · published'}{p.report_date ? ' ' + p.report_date : ''}
                </option>
              ))}
            </select>
            {portal.isAdmin ? <Pill text="Admin" kind="blue" /> : null}
            <span className="user-chip"><span className="avatar">{initials(portal.user || '?')}</span>{portal.user}</span>
          </div>
        </div>
        {portal.isHistorical || portal.isKpiOnly ? (
          <div className="banner" role="status">
            <span>You are viewing a historical period ({periodLabel(portal.selectedId)}{portal.isKpiOnly ? ' · KPI-level backfill only, detail data is not available' : ''}).</span>
            <a onClick={() => portal.setPeriod(null)}>Return to latest period</a>
          </div>
        ) : null}
        {portal.isDraft ? (
          <div className="banner banner-draft" role="status">
            <span><strong>Draft period.</strong> Only administrators can see it. Review it on the Reports page and publish it to make it visible to customers.</span>
          </div>
        ) : null}
        <div className="page">
          <PageHead title={title} sub={sub} actions={actions} />
          {portal.error ? <div className="error-box">{portal.error}</div> : null}
          {portal.loading && !portal.data ? <div className="loading">Loading…</div> : null}
          {!portal.loading && portal.data && !portal.data.period && !portal.isKpiOnly ? (
            <div className="empty-state"><div className="title">No period is available yet</div>{portal.isAdmin ? 'Run the easm_ingest workflow to load a period, then review and publish it on the Reports page.' : 'No reporting period has been published yet.'}</div>
          ) : null}
          {portal.data && (portal.data.period || portal.isKpiOnly) ? children : null}
        </div>
      </UIProvider>
    </div>
  );
}

export const kpiTiles = (k: any) => [
  ['Subdomains', k?.domains_current], ['IP addresses', k?.ips_total], ['Websites', k?.websites], ['IPs with open services', k?.ips_with_open_services],
  ['Exposed login portals', k?.login_portals], ['Certificate risks', k?.certificate_risks], ['Dark web leaks (open)', k?.dark_web_open], ['File leaks (open)', k?.files_open],
  ['Code leaks', k?.code_current], ['Leaked credentials', k?.credentials], ['Corporate emails', k?.emails], ['Mobile apps', k?.mobile_apps],
] as Array<[string, number | null | undefined]>;

export const fmtCount = fmt;
