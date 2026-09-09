import React, { useEffect, useState } from 'react';
import { BarList } from './lib/charts';
import { PeriodSub, PortalShell, usePortal, type Portal } from './lib/period';
import { DataTable, type Facet } from './lib/table';
import { Card, GenericKV, HistoricalEmpty, KV, KpiStrip, LifecyclePill, Mono, Note, PendingCard, Pill, Tabs, Tags, useUI } from './lib/ui';
import { PAGE, cap, fmt, getQuery, navigate, objToItems, setQuery } from './lib/util';

const TABS = [
  { id: 'domains', label: 'Domains', n: (S: any) => S.assets?.domains?.current }, { id: 'ips', label: 'IPs', n: (S: any) => S.assets?.ips?.total_rows },
  { id: 'websites', label: 'Websites', n: (S: any) => S.assets?.websites?.total_rows }, { id: 'services', label: 'Services & ports', n: (S: any) => S.assets?.services?.current },
  { id: 'components', label: 'Components', n: (S: any) => S.assets?.components?.total_rows }, { id: 'certificates', label: 'Certificates', n: (S: any) => S.assets?.certificates?.total_rows },
  { id: 'http-headers', label: 'HTTP headers', n: (S: any) => S.assets?.http_configs?.total_rows }, { id: 'mobile-apps', label: 'Mobile apps', n: (S: any) => S.assets?.mobile_apps?.current },
  { id: 'wechat', label: 'WeChat', n: (S: any) => (S.assets?.wechat_official_accounts?.total_rows || 0) + (S.assets?.wechat_mini_programs?.total_rows || 0) },
];

export default function Page() {
  const portal = usePortal();
  const [tab, setTab] = useState(getQuery().get('tab') || 'domains');
  useEffect(() => { const onPop = () => setTab(getQuery().get('tab') || 'domains'); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  const change = (id: string) => { setTab(id); setQuery({ tab: id === 'domains' ? null : id }); };
  const S = portal.data?.summary || {};
  return (
    <PortalShell portal={portal} title="Attack surface" sub={<PeriodSub portal={portal} extra="asset inventory discovered from the root domains in scope" />}>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label, n: portal.isKpiOnly ? null : t.n(S) }))} active={tab} onChange={change} />
      {portal.isKpiOnly ? <HistoricalEmpty label={portal.selectedId || ''} onBack={() => portal.setPeriod(null)} /> : <Body portal={portal} tab={tab} />}
    </PortalShell>
  );
}

const facet = (label: string, items: any[], key: string, format?: (v: string) => string, max?: number): Facet => ({ key, label, options: (items || []).slice(0, max || 8), format });
const lcCol = { key: 'lifecycle', label: 'Lifecycle', width: '110px', render: (r: any) => <LifecyclePill row={r} /> };
const Charts2 = ({ a, b }: { a: [string, React.ReactNode]; b: [string, React.ReactNode] }) => (
  <div className="grid cols-2 mb-16"><Card><div className="chart-title">{a[0]}</div>{a[1]}</Card><Card><div className="chart-title">{b[0]}</div>{b[1]}</Card></div>
);

function Body({ portal, tab }: { portal: Portal; tab: string }) {
  const ui = useUI();
  const d = portal.data!; const S = d.summary || {}; const A = d.aggregates || {};
  const drawer = (kicker: string, titleOf: (r: any) => React.ReactNode) => (r: any) => ui.openDrawer({ kicker, title: titleOf(r), sub: <LifecyclePill row={r} />, body: <GenericKV row={r} /> });
  const lifeFacet = (agg: any[]) => facet('Lifecycle', agg, 'lifecycle', cap);

  if (tab === 'domains') {
    const s = S.assets?.domains || {};
    const lc = [{ label: 'New', value: s.by_lifecycle?.new || 0 }, { label: 'Active', value: s.by_lifecycle?.active || 0 }, { label: 'Closed', value: s.by_lifecycle?.closed || 0 }];
    return (
      <>
        <KpiStrip items={[['Current subdomains', s.current], ['New this period', s.by_lifecycle?.new], ['Became inactive', s.by_lifecycle?.closed], ['Root domains in scope', s.root_domains]]} />
        <Charts2 a={['Subdomains by root domain (top 8)', <BarList items={(A.domains?.root_domain || []).slice(0, 8)} />]} b={['Lifecycle this period', <BarList items={lc} ramp />]} />
        <Card>
          <DataTable module="domains" searchPlaceholder="Search domain or IP" facets={[lifeFacet(A.domains?.lifecycle)]} selects={[{ key: 'root_domain', label: 'Root domain', options: (A.domains?.root_domain || []).map((o: any) => [o.label, `${o.label} (${fmt(o.value)})`] as [string, string]) }]}
            columns={[{ key: 'domain', label: 'Subdomain', render: (r) => <Mono v={r.domain} /> }, { key: 'root_domain', label: 'Root domain', width: '150px' }, { key: '_ipn', label: 'Resolved IPs', width: '200px', render: (r) => r._ipn ? <><span className="mono">{r.ips[0]}</span>{r._ipn > 1 ? <span className="muted"> +{r._ipn - 1}</span> : null}</> : <span className="muted">—</span> }, lcCol, { key: 'analyst_note', label: 'Analyst note', width: '240px', cls: 'wrap' }]}
            onRow={drawer('Subdomain', (r) => r.domain)} />
        </Card>
      </>
    );
  }
  if (tab === 'ips') {
    const s = S.assets?.ips || {};
    return (
      <>
        <KpiStrip items={[['IP addresses attributed', s.total_rows], ['Recently active', s.current], ['New this period', s.by_lifecycle?.new], ['Unreachable', s.by_lifecycle?.closed], ['With open ports', s.with_open_ports]]} />
        <Charts2 a={['IPs by country', <BarList items={objToItems(s.by_country)} />]} b={['Asset attributes (top 8)', <BarList items={A.ips?.attributes || []} />]} />
        <Card>
          <DataTable module="ips" searchPlaceholder="Search IP, operator or port" facets={[lifeFacet(A.ips?.lifecycle), facet('Country', A.ips?.country, 'country', undefined, 6)]}
            columns={[{ key: 'ip', label: 'IP address', width: '150px', render: (r) => <Mono v={r.ip} /> }, { key: 'country', label: 'Country', width: '120px' }, { key: 'operator', label: 'Operator' }, { key: '_attrs', label: 'Attributes', width: '200px', render: (r) => <Tags arr={r.attributes} max={3} /> }, { key: 'open_port_count', label: 'Open ports', width: '110px', render: (r) => r.open_port_count ? <span title={r._ports}>{fmt(r.open_port_count)}</span> : <span className="muted">0</span> }, lcCol]}
            onRow={drawer('IP address', (r) => r.ip)} />
        </Card>
      </>
    );
  }
  if (tab === 'websites') {
    const s = S.assets?.websites || {};
    const sch = (k: string) => (A.websites?.scheme || []).find((x: any) => x.label === k)?.value || 0;
    return (
      <>
        <KpiStrip items={[['Websites', s.total_rows], ['HTTPS', sch('https')], ['Plain HTTP', sch('http')], ['With fingerprinted technology', A.websites?.with_tech]]} />
        <Card className="mb-16"><div className="chart-title">Technologies detected (top 10)</div><BarList items={A.websites?.technologies || []} /></Card>
        <Card>
          <DataTable module="websites" searchPlaceholder="Search URL, title or technology" facets={[facet('Scheme', A.websites?.scheme, 'scheme')]}
            columns={[{ key: 'url', label: 'Website', render: (r) => <Mono v={r.url} /> }, { key: 'title', label: 'Title', width: '220px' }, { key: '_tech', label: 'Technologies', width: '240px', render: (r) => <Tags arr={r.technologies} max={3} /> }, { key: 'server_header', label: 'Server header', width: '140px' }]}
            onRow={drawer('Website', (r) => r.url)} />
        </Card>
      </>
    );
  }
  if (tab === 'services') {
    const s = S.assets?.services || {};
    return (
      <>
        <KpiStrip items={[['Current open services', s.current], ['IPs with current services', s.ips_with_current_services], ['New this period', s.by_lifecycle?.new], ['Closed since last period', s.by_lifecycle?.closed]]} />
        <Note className="mb-16">Risky ports and services are assessed by the analyst each period; none were flagged this period (see <a onClick={() => navigate(`${PAGE.risks}?tab=risky-services`)}>Exposure Risks</a>). This tab is the full open-port inventory.</Note>
        <Charts2 a={['Current services by port', <BarList items={objToItems(s.top_ports).map((x) => ({ label: 'Port ' + x.label, value: x.value }))} />]} b={['Service names (top 8)', <BarList items={A.services?.service || []} />]} />
        <Card>
          <DataTable module="services" searchPlaceholder="Search IP, port or service" facets={[lifeFacet(A.services?.lifecycle), facet('Service', A.services?.service, 'service', undefined, 6)]}
            columns={[{ key: 'ip', label: 'IP address', width: '160px', render: (r) => <Mono v={r.ip} /> }, { key: 'port', label: 'Port', width: '90px' }, { key: 'service', label: 'Service' }, lcCol]}
            onRow={drawer('Service', (r) => `${r.ip}:${r.port}`)} />
        </Card>
      </>
    );
  }
  if (tab === 'components') {
    const s = S.assets?.components || {};
    return (
      <>
        <KpiStrip items={[['Components observed', s.total_rows], ['Admin panels exposed', s.admin_panels], ['CDN components', s.by_type?.['Content Distribution Network'] || 0], ['Closed since last period', s.by_lifecycle?.closed]]} />
        <Charts2 a={['By component type', <BarList items={objToItems(s.by_type).map((x) => ({ label: x.label === 'other' ? 'Other' : x.label, value: x.value }))} />]} b={['Most common components', <BarList items={A.components?.component || []} />]} />
        <Card>
          <DataTable module="components" searchPlaceholder="Search host or component" facets={[facet('Type', A.components?.component_type, 'component_type'), lifeFacet(A.components?.lifecycle)]}
            columns={[{ key: 'host', label: 'Host', width: '180px', render: (r) => <Mono v={r.host} /> }, { key: 'component', label: 'Component' }, { key: 'component_type', label: 'Type', width: '200px' }, { key: 'first_seen', label: 'First seen', width: '150px' }, { key: 'last_seen', label: 'Last seen', width: '150px' }, lcCol]}
            onRow={drawer('Component', (r) => `${r.component} on ${r.host}`)} />
        </Card>
      </>
    );
  }
  if (tab === 'certificates') {
    const H = S.assets?.certificates?.hygiene || {};
    const buckets = [{ label: 'Expired', value: H.expired || 0 }, { label: 'Expires < 30 days', value: H.lt_30d || 0 }, { label: 'Expires < 90 days', value: H.lt_90d || 0 }, { label: 'Valid ≥ 90 days', value: H.ge_90d || 0 }];
    const bucketLabel = (v: string) => ({ expired: 'Expired', lt_30d: '< 30 days', lt_90d: '< 90 days', ge_90d: '≥ 90 days' } as Record<string, string>)[v] || v;
    return (
      <>
        <KpiStrip items={[['TLS endpoints scanned', S.assets?.certificates?.total_rows], ['Expired certificates', H.expired], ['Expiring within 30 days', H.lt_30d], ['Legacy TLS 1.0 / 1.1', H.legacy_protocol]]} />
        <Note className="mb-16">Certificate hygiene is derived from scan data and informational: expired entries may belong to hosts that are no longer active, and the "weak suite" field also lists standard TLS 1.3 suites. Endpoints still accepting legacy TLS are tracked as risks under <a onClick={() => navigate(`${PAGE.risks}?tab=certificates`)}>Exposure Risks</a>.</Note>
        <Charts2 a={['Certificate expiry', <BarList items={buckets} ramp />]} b={['Protocol versions observed', <BarList items={(A.certificates?.protocol || []).slice().sort((a: any, b: any) => String(a.label).localeCompare(String(b.label)))} />]} />
        <Card>
          <DataTable module="certificates" searchPlaceholder="Search host" defaultSort={{ key: 'days_to_expiry', dir: 'asc' }} facets={[facet('Expiry', A.certificates?.expiry_bucket, 'expiry_bucket', bucketLabel), facet('Protocol', A.certificates?.protocol, 'protocol')]}
            columns={[{ key: 'host', label: 'Host', render: (r) => <Mono v={r.host} /> }, { key: 'port', label: 'Port', width: '70px' }, { key: 'protocol', label: 'Protocol', width: '100px' }, { key: 'valid_until', label: 'Valid until', width: '120px' }, { key: 'days_to_expiry', label: 'Days to expiry', width: '120px', render: (r) => r.days_to_expiry == null ? <span className="muted">—</span> : r.days_to_expiry < 0 ? <span className="tile-delta bad" style={{ margin: 0 }}>{fmt(r.days_to_expiry)}</span> : fmt(r.days_to_expiry) }, { key: 'low_version', label: 'Legacy', width: '80px', render: (r) => r.low_version ? <Pill text="Yes" kind="orange" /> : <span className="muted">No</span> }, { key: '_weak', label: 'Suites listed as weak', width: '150px' }]}
            onRow={drawer('TLS endpoint', (r) => `${r.host}:${r.port}`)} />
        </Card>
      </>
    );
  }
  if (tab === 'http-headers') {
    const total = S.assets?.http_configs?.total_rows || 0;
    const hv = (k: string) => (A.http_configs?.header_true || []).find((x: any) => x.label === k)?.value;
    const missing = (k: string) => (hv(k) == null ? '—' : total - hv(k));
    return (
      <>
        <PendingCard title="HTTP security header checks" text="Header checks were collected for every website this period, but four columns (CRLF Injection, Access-Control-Allow-Origin, X-AspNet-Version, X-Forwarded-For) are set for all sites and their meaning is pending confirmation with the delivery team. This module is not shown to customers in production until confirmed." />
        <div className="mt-16" />
        <KpiStrip items={[['Websites checked', total], ['Missing Strict-Transport-Security', missing('Strict-Transport-Security')], ['Missing Content-Security-Policy', missing('Content-Security-Policy')]]} />
        <Card className="mb-16"><div className="chart-title">Sites where the check is set (raw values, top 10)</div><BarList items={(A.http_configs?.header_true || []).slice(0, 10)} labelW={220} /></Card>
        <Card>
          <DataTable module="http_configs" searchPlaceholder="Search website"
            columns={[{ key: 'url', label: 'Website', render: (r) => <Mono v={r.url} /> }, { key: 'detected_at', label: 'Checked', width: '160px' }, { key: '_flags', label: 'Checks set', width: '110px' }, { key: 'server', label: 'Server header', width: '160px', render: (r) => r.checks?.Server || <span className="muted">—</span>, sortable: false }]}
            onRow={(r) => ui.openDrawer({ kicker: 'HTTP header check', title: r.url, sub: <>Checked {r.detected_at || ''}</>, body: <KV pairs={Object.keys(r.checks || {}).map((k) => [k, r.checks[k] === true ? <Pill text="set" kind="orange" /> : r.checks[k] === false ? <span className="muted">not set</span> : String(r.checks[k])] as [string, React.ReactNode])} /> })} />
        </Card>
      </>
    );
  }
  if (tab === 'mobile-apps') {
    const s = S.assets?.mobile_apps || {};
    return (
      <>
        <KpiStrip items={[['Apps tracked', s.current], ['Official stores', s.official_store], ['Third-party stores', (s.total_rows || 0) - (s.official_store || 0)], ['Removed since last period', s.by_lifecycle?.closed]]} />
        <Charts2 a={['By store', <BarList items={A.mobile_apps?.store || []} />]} b={['Official vs third-party', <BarList items={A.mobile_apps?.official || []} ramp />]} />
        <Card>
          <DataTable module="mobile_apps" searchPlaceholder="Search app, developer or store" facets={[facet('Store', A.mobile_apps?.store, 'store'), lifeFacet(A.mobile_apps?.lifecycle)]}
            columns={[{ key: 'name', label: 'App', width: '220px' }, { key: 'version', label: 'Version', width: '90px' }, { key: 'developer', label: 'Developer' }, { key: 'store', label: 'Store', width: '120px' }, { key: 'official_store', label: 'Channel', width: '120px', render: (r) => r.official_store ? <Pill text="Official" kind="green" /> : <Pill text="Third-party" kind="orange" /> }, { key: 'app_updated_at', label: 'App updated', width: '120px' }, lcCol]}
            onRow={drawer('Mobile app', (r) => `${r.name} · ${r.store || ''}`)} />
        </Card>
      </>
    );
  }
  if (tab === 'wechat') {
    return (
      <div className="grid cols-2">
        <Card title="WeChat official accounts" right={<span className="muted">{fmt(S.assets?.wechat_official_accounts?.total_rows)}</span>}>
          <DataTable module="wechat_accounts" searchPlaceholder="Search account" columns={[{ key: 'name', label: 'Account' }, { key: 'owner', label: 'Owner' }, { key: 'wechat_id', label: 'WeChat ID', width: '150px', render: (r) => <Mono v={r.wechat_id} /> }]} onRow={drawer('WeChat official account', (r) => r.name)} />
        </Card>
        <Card title="WeChat mini programs" right={<span className="muted">{fmt(S.assets?.wechat_mini_programs?.total_rows)}</span>}>
          <DataTable module="wechat_mini_programs" searchPlaceholder="Search mini program" columns={[{ key: 'name', label: 'Mini program' }, { key: 'owner', label: 'Owner' }, { key: 'app_id', label: 'AppID', width: '190px', render: (r) => <Mono v={r.app_id} /> }]} onRow={drawer('WeChat mini program', (r) => r.name)} />
        </Card>
      </div>
    );
  }
  return null;
}
