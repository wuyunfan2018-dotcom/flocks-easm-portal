import React, { useEffect, useState } from 'react';
import { getFindingsStats } from './lib/api';
import { BarList, GroupedBars } from './lib/charts';
import { PeriodSub, PortalShell, kpiTiles, usePortal, type Portal } from './lib/period';
import { Card, CoverageChip, Delta, KV, Note, SevBadge, Tile, useUI } from './lib/ui';
import { BLUE, DIM, MODULE_ROUTE, PAGE, SEV_ORDER, cap, clamp, fmt, navigate } from './lib/util';

export default function Page() {
  const portal = usePortal();
  const [stats, setStats] = useState<{ total: number; open: number } | null>(null);
  const pid = portal.data?.period?.period_id;
  useEffect(() => {
    if (!pid || portal.isKpiOnly) { setStats(null); return; }
    getFindingsStats().then((s) => setStats({ total: s.total, open: s.open })).catch(() => setStats(null));
  }, [pid, portal.isKpiOnly]);
  const cov = portal.data?.coverage || [];
  const extra = portal.isKpiOnly || !portal.data?.period ? null : <>{fmt(cov.length)} monitoring lines{stats ? <> · {fmt(stats.total)} findings, {fmt(stats.open)} open</> : null}</>;
  return (
    <PortalShell portal={portal} title="Security posture" sub={<PeriodSub portal={portal} extra={extra} />}>
      <Overview portal={portal} />
    </PortalShell>
  );
}

function Overview({ portal }: { portal: Portal }) {
  const ui = useUI();
  const d = portal.data!;
  if (portal.isKpiOnly) {
    const k = portal.kpi?.kpis || {};
    return (
      <>
        <Note warn className="mb-16">{portal.kpi?.source}</Note>
        <div className="tiles">{kpiTiles(k).map(([l, v]) => <Tile key={l} label={l} value={v} />)}</div>
      </>
    );
  }
  const S = d.summary || {}; const A = d.aggregates || {}; const X = d.exposure_index || {}; const N = d.narrative || {}; const PS = d.previous_summary?.kpis || {};
  const LC = S.lifecycle_counts || {};
  const prevLabel = portal.prevLabel;
  const kf = (N.key_findings || []).slice().sort((a: any, b: any) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  const sev: Record<string, number> = {}; (A.findings?.severity || []).forEach((i: any) => { sev[i.label] = i.value; });
  const totalFindings = Object.values(sev).reduce((a, b) => a + b, 0);
  const explain = () => ui.openDrawer({
    kicker: 'Exposure index', title: `${fmt(X.score)} of ${fmt(X.max_score)} · ${cap(X.band)} · Grade ${X.grade}`, sub: <>Method {X.method} · {X.direction}</>,
    body: (
      <>
        <h4>Contribution by module (points / max)</h4>
        <BarList items={(X.modules || []).map((m: any) => ({ label: m.label, value: m.points, tip: `max ${m.max_points}` }))} max={25} labelW={150} aria="Exposure index contribution by module" />
        <h4>How the rules work</h4><ul className="plain">{(X.notes || []).map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
        <h4>Weights</h4><KV pairs={(X.modules || []).map((m: any) => [m.label, `${fmt(m.points)} / ${fmt(m.max_points)} pts · ${fmt(m.units)} units, saturates at ${fmt(m.saturation_threshold)}`])} />
      </>
    ),
  });
  const T = (label: string, value: any, prev: any, href: string) => <Tile label={label} value={value} href={href} delta={<Delta cur={value} prev={prev} prevLabel={prevLabel} />} />;
  return (
    <>
      <div className="grid cols-1-2 section">
        <Card title="Exposure index" sub={<>Rules-based estimate ({X.method}) · higher means more exposure</>} right={<SevBadge sev={X.band} />}>
          <div className="hero"><div><div className="hero-figure">{fmt(X.score)}<small>/ {fmt(X.max_score)}</small></div><div className="muted small mt-8">Exposure band: <strong>{cap(X.band)}</strong> · Grade <strong>{X.grade}</strong></div></div></div>
          <div className="meter"><span style={{ width: `${clamp(Number(X.score) || 0, 0, 100)}%` }} /></div>
          <div className="meter-scale"><span>0 · Low</span><span>30 · Medium</span><span>50 · High</span><span>70 · Critical</span><span>100</span></div>
          <div className="mt-12"><button className="btn-link" onClick={explain}>How is this calculated?</button></div>
        </Card>
        <Card title="Key findings" sub={<>Analyst summary for {d.period?.label}</>} right={<a onClick={() => navigate(PAGE.reports)}>Full report</a>}>
          <ul className="list">{kf.map((k: any, i: number) => <li key={i}><SevBadge sev={k.severity} /><span>{k.text}{k.module && MODULE_ROUTE[k.module] ? <> <a className="small" onClick={() => navigate(MODULE_ROUTE[k.module])}>View</a></> : null}</span></li>)}</ul>
        </Card>
      </div>
      <div className="section">
        <div className="group-label">Attack surface and exposure · vs {prevLabel || 'previous period'}</div>
        <div className="tiles">
          {T('Subdomains', S.assets?.domains?.current, PS.domains_current, `${PAGE.surface}?tab=domains`)}
          {T('IP addresses', S.assets?.ips?.total_rows, PS.ips_total, `${PAGE.surface}?tab=ips`)}
          {T('Websites', S.assets?.websites?.total_rows, PS.websites, `${PAGE.surface}?tab=websites`)}
          {T('IPs with open services', S.assets?.services?.ips_with_current_services, PS.ips_with_open_services, `${PAGE.surface}?tab=services`)}
          {T('Exposed login portals', S.risks?.login_portals?.current, PS.login_portals, `${PAGE.risks}?tab=login-portals`)}
          {T('Certificate risks', S.risks?.certificates?.current, PS.certificate_risks, `${PAGE.risks}?tab=certificates`)}
          {T('Mobile apps', S.assets?.mobile_apps?.current, PS.mobile_apps, `${PAGE.surface}?tab=mobile-apps`)}
        </div>
        <div className="group-label mt-16">Data leaks</div>
        <div className="tiles">
          {T('Dark web leaks (open)', S.leaks?.dark_web?.open, PS.dark_web_open, `${PAGE.leaks}?tab=dark-web`)}
          {T('File leaks (open)', S.leaks?.files?.open, PS.files_open, `${PAGE.leaks}?tab=files`)}
          {T('Code leaks', S.leaks?.code?.current, PS.code_current, `${PAGE.leaks}?tab=code`)}
          {T('Leaked credentials', S.leaks?.credentials?.total, PS.credentials, `${PAGE.leaks}?tab=credentials`)}
          {T('Verified logins', S.leaks?.credentials?.verified_login, PS.credentials_verified, `${PAGE.leaks}?tab=credentials`)}
          {T('Corporate emails exposed', S.leaks?.emails?.total, PS.emails, `${PAGE.leaks}?tab=emails`)}
        </div>
      </div>
      <div className="grid cols-2 section">
        <Card title="What changed this period" sub="Newly discovered vs closed or removed, by module">
          <GroupedBars rows={[
            { label: 'Domains', a: S.assets?.domains?.by_lifecycle?.new || 0, b: S.assets?.domains?.by_lifecycle?.closed || 0 },
            { label: 'IPs', a: S.assets?.ips?.by_lifecycle?.new || 0, b: S.assets?.ips?.by_lifecycle?.closed || 0 },
            { label: 'Services', a: S.assets?.services?.by_lifecycle?.new || 0, b: S.assets?.services?.by_lifecycle?.closed || 0 },
            { label: 'Login portals', a: S.risks?.login_portals?.new || 0, b: S.risks?.login_portals?.closed || 0 },
            { label: 'Mobile apps', a: (S.assets?.mobile_apps?.by_lifecycle?.new || 0) + (S.assets?.mobile_apps?.by_lifecycle?.updated || 0), b: S.assets?.mobile_apps?.by_lifecycle?.closed || 0 },
            { label: 'Dark web', a: S.leaks?.dark_web?.new || 0, b: LC.dark_web?.closed || 0 },
            { label: 'Emails', a: S.leaks?.emails?.new || 0, b: LC.emails?.closed || 0 },
          ]} seriesA={{ label: 'New this period', color: BLUE }} seriesB={{ label: 'Closed / removed', color: DIM }} aria="New versus closed items per module" />
        </Card>
        <Card title="Findings by severity" sub={<>{fmt(totalFindings)} tracked findings · rules-v1 severity</>} right={<a onClick={() => navigate(PAGE.findings)}>Open tracker</a>}>
          <BarList items={[{ label: 'High', value: sev.high || 0 }, { label: 'Medium', value: sev.medium || 0 }, { label: 'Low', value: sev.low || 0 }]} barH={20} gap={10} aria="Findings by severity" />
          <Note className="mt-12 small">Emails are tracked as one aggregated finding per period; individual addresses are listed under Data Leaks.</Note>
        </Card>
      </div>
      <Card className="section" title="Monitoring coverage" sub="Every capability line is checked each period, including the ones with nothing to report">
        <div className="coverage-row coverage-head"><span>Capability</span><span>Status</span><span>Last checked</span><span>Note</span></div>
        {(d.coverage || []).map((c: any) => (
          <div key={c.module} className="coverage-row">
            <span>{MODULE_ROUTE[c.module] ? <a onClick={() => navigate(MODULE_ROUTE[c.module])}>{c.label}</a> : c.label}</span>
            <span><CoverageChip c={c} /></span><span className="muted">{c.last_checked}</span><span className="muted">{c.note || ''}</span>
          </div>
        ))}
      </Card>
      <div className="section">
        <div className="section-title">Recommended actions</div>
        <div className="section-sub">Analyst recommendations for this period · <a onClick={() => navigate(PAGE.reports)}>view all</a></div>
        <div className="grid cols-2">
          {(N.recommendations || []).map((r: any, i: number) => (
            <Card key={i}><div className="card-title">{r.title}</div><p className="secondary mt-8 small">{r.items?.[0] || ''}</p>{r.items?.length > 1 ? <p className="muted small mt-8">{fmt(r.items.length - 1)} more in the report</p> : null}</Card>
          ))}
        </div>
      </div>
    </>
  );
}
