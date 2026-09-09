import React, { useEffect, useState } from 'react';
import { BarList } from './lib/charts';
import { PeriodSub, PortalShell, usePortal, type Portal } from './lib/period';
import { DataTable, type Facet } from './lib/table';
import { Card, CustomerStatusPill, HistoricalEmpty, KV, KpiStrip, LifecyclePill, ModuleNarrative, Mono, NoneCard, Note, PendingCard, Recommendations, SevBadge, Tags, useUI } from './lib/ui';
import { PAGE, cap, fmt, getQuery, navigate, setQuery } from './lib/util';

const NAV = [['login-portals', 'Login portals'], ['certificates', 'Certificate risks'], ['risky-services', 'Risky ports & services'], ['malicious-ip', 'Malicious IP tags'], ['vulnerabilities', 'Vulnerabilities'], ['http-headers', 'HTTP headers']] as const;

export default function Page() {
  const portal = usePortal();
  return (
    <PortalShell portal={portal} title="Exposure risks" sub={<PeriodSub portal={portal} extra="risks the analysts assess on the discovered attack surface" />}>
      {portal.isKpiOnly ? <HistoricalEmpty label={portal.selectedId || ''} onBack={() => portal.setPeriod(null)} /> : <Body portal={portal} />}
    </PortalShell>
  );
}

const facet = (label: string, items: any[], key: string, format?: (v: string) => string): Facet => ({ key, label, options: items || [], format });

function Body({ portal }: { portal: Portal }) {
  const ui = useUI();
  const d = portal.data!; const S = d.summary || {}; const A = d.aggregates || {}; const N = d.narrative || {}; const cov = d.coverage || [];
  const lp = S.risks?.login_portals || {};
  const H = S.assets?.certificates?.hygiene || {};
  const [active, setActive] = useState(getQuery().get('tab') || 'login-portals');
  useEffect(() => { const el = document.getElementById('sec-' + active); if (el && getQuery().get('tab')) el.scrollIntoView({ block: 'start' }); }, [active]);
  const go = (id: string) => { setActive(id); setQuery({ tab: id === 'login-portals' ? null : id }); document.getElementById('sec-' + id)?.scrollIntoView({ block: 'start' }); };
  const covOf = (m: string) => cov.find((c: any) => c.module === m);
  const counts: Record<string, number | null> = { 'login-portals': lp.current, certificates: S.risks?.certificates?.current, 'risky-services': 0, 'malicious-ip': 0, vulnerabilities: 0, 'http-headers': null };
  const certBuckets = [{ label: 'Expired', value: H.expired || 0 }, { label: 'Expires < 30 days', value: H.lt_30d || 0 }, { label: 'Expires < 90 days', value: H.lt_90d || 0 }, { label: 'Valid ≥ 90 days', value: H.ge_90d || 0 }];
  return (
    <>
      <div className="section-nav">{NAV.map(([id, label]) => <button key={id} className={'tab' + (active === id ? ' active' : '')} onClick={() => go(id)}>{label}{counts[id] != null ? <span className="n">{fmt(counts[id])}</span> : null}</button>)}</div>

      <div className="section" id="sec-login-portals">
        <div className="section-title">Exposed login portals</div><div className="section-sub">Login pages reachable from the internet without network restrictions</div>
        <KpiStrip items={[['Current portals', lp.current], ['New this period', lp.new], ['Closed since last period', lp.closed], ['Served over plain HTTP', lp.plain_http], ['MFA observed', lp.mfa?.yes || 0, `of ${fmt(lp.current)} checked`]]} />
        <ModuleNarrative narrative={N} mod="login_portals" />
        <div className="grid cols-1-2">
          <Card><div className="chart-title">Portals by scheme</div><BarList items={A.login_portals?.scheme_current || []} ramp /><Note className="mt-12 small">Plain-HTTP login pages are rated Medium; HTTPS pages Low (rules-v1).</Note></Card>
          <Card>
            <DataTable module="login_portals" extraParams={{ with_status: 1 }} searchPlaceholder="Search title or URL"
              facets={[facet('Lifecycle', A.login_portals?.lifecycle, 'lifecycle', cap), facet('Scheme', A.login_portals?.scheme, 'scheme'), facet('Severity', A.login_portals?.severity, 'severity', cap)]}
              columns={[
                { key: 'title', label: 'Title', width: '170px' }, { key: 'url', label: 'URL', render: (r) => <Mono v={r.url} /> },
                { key: 'severity', label: 'Severity', width: '100px', render: (r) => <SevBadge sev={r.severity} />, sortKey: '_sev' },
                { key: 'mfa', label: 'MFA', width: '80px', render: (r) => cap(r.mfa) }, { key: 'lifecycle', label: 'Lifecycle', width: '110px', render: (r) => <LifecyclePill row={r} /> }, { key: 'last_checked', label: 'Last checked', width: '110px' },
              ]}
              onRow={(r) => ui.openDrawer({ kicker: 'Exposed login portal', title: r.title || r.host, sub: <><SevBadge sev={r.severity} /> <LifecyclePill row={r} /></>, body: (
                <>
                  <KV pairs={[['URL', <Mono v={r.url} />], ['Host', <Mono v={r.host} />], ['Scheme', (r.scheme || '').toUpperCase()], ['CAPTCHA observed', cap(r.captcha)], ['MFA observed', cap(r.mfa)], ['Last checked', r.last_checked], r.alt_titles?.length ? ['Other titles seen', <Tags arr={r.alt_titles} />] : null, ['Customer status', r.customer_status ? <CustomerStatusPill s={r.customer_status} /> : null]]} />
                  <h4>Why it matters</h4><p className="small secondary">{N.modules?.login_portals?.risk_statement || ''}</p>
                  <Recommendations narrative={N} mod="login_portals" />
                </>
              ) })} />
          </Card>
        </div>
      </div>

      <div className="section" id="sec-certificates">
        <div className="section-title">Certificate risks</div><div className="section-sub">Endpoints still accepting legacy TLS protocol versions</div>
        <ModuleNarrative narrative={N} mod="certificates" />
        <div className="grid cols-2-1">
          <Card>
            <DataTable module="certificate_risks" extraParams={{ with_status: 1 }} searchPlaceholder="Search host" emptyText="No certificate risks this period."
              columns={[{ key: 'host', label: 'Host', render: (r) => <Mono v={r.host} /> }, { key: 'port', label: 'Port', width: '70px' }, { key: '_protocols', label: 'Legacy protocols accepted', width: '190px' }, { key: 'valid_until', label: 'Valid until', width: '110px' }, { key: 'severity', label: 'Severity', width: '100px', render: (r) => <SevBadge sev={r.severity} /> }]}
              onRow={(r) => ui.openDrawer({ kicker: 'Certificate risk', title: `${r.host}:${r.port}`, sub: <SevBadge sev={r.severity} />, body: <><KV pairs={[['Host', <Mono v={r.host} />], ['Port', String(r.port)], ['Legacy protocols', <Tags arr={r.protocols} />], ['Reason', r.reason], ['Valid until', r.valid_until], ['Days to expiry', fmt(r.days_to_expiry)], ['Customer status', r.customer_status ? <CustomerStatusPill s={r.customer_status} /> : null]]} /><Recommendations narrative={N} mod="certificates" /></> })} />
          </Card>
          <Card title="Certificate hygiene (derived)" sub={<>Informational · from {fmt(S.assets?.certificates?.total_rows)} scanned endpoints</>}>
            <BarList items={certBuckets} ramp />
            <div className="mt-12"><a onClick={() => navigate(`${PAGE.surface}?tab=certificates`)}>Open certificate inventory</a></div>
          </Card>
        </div>
      </div>

      <div className="section" id="sec-risky-services">
        <div className="section-title">Risky ports and services</div><div className="section-sub">Services exposed to the internet that are commonly abused</div>
        <ModuleNarrative narrative={N} mod="risky_services" />
        <NoneCard title="Risky ports & services" coverage={covOf('risky_services')} fallbackDate={d.period?.report_date} />
        <div className="mt-8 small"><a onClick={() => navigate(`${PAGE.surface}?tab=services`)}>View the open-port inventory ({fmt(S.assets?.services?.current)} current services)</a></div>
      </div>

      <div className="section" id="sec-malicious-ip">
        <div className="section-title">Malicious IP reputation tags</div><div className="section-sub">Attributed IP addresses carrying malicious reputation in ThreatBook intelligence</div>
        <NoneCard title="Malicious IP tags" coverage={covOf('malicious_ip_tags')} fallbackDate={d.period?.report_date} />
      </div>

      <div className="section" id="sec-vulnerabilities">
        <div className="section-title">Vulnerabilities</div><div className="section-sub">Exploitable vulnerabilities on internet-facing assets</div>
        <NoneCard title="Vulnerabilities" coverage={covOf('vulnerabilities')} fallbackDate={d.period?.report_date} />
        <Note className="mt-8 small">Scanned continuously. When findings appear they carry: vulnerability, threat level, affected URL, verification result and remediation.</Note>
      </div>

      <div className="section" id="sec-http-headers">
        <div className="section-title">HTTP security headers</div><div className="section-sub">Header configuration checks on {fmt(S.assets?.http_configs?.total_rows)} websites</div>
        <PendingCard title="HTTP security header checks" text="Collected for every site; field semantics pending confirmation with the delivery team before customer display." />
        <div className="mt-8 small"><a onClick={() => navigate(`${PAGE.surface}?tab=http-headers`)}>Preview the raw header checks</a></div>
      </div>
    </>
  );
}
