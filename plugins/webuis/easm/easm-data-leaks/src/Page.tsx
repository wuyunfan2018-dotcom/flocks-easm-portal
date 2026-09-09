import React, { useEffect, useRef, useState } from 'react';
import { contractOp, errorText, screenshotUrl } from './lib/api';
import { BarList } from './lib/charts';
import { PeriodSub, PortalShell, usePortal, type Portal } from './lib/period';
import { DataTable, type Facet } from './lib/table';
import { AnalystStatusPill, Card, CustomerStatusPill, Evidence, HistoricalEmpty, KV, KpiStrip, LifecyclePill, ModuleNarrative, Mono, Note, Pill, Recommendations, SevBadge, Tabs, useUI } from './lib/ui';
import { ANALYST_STATUS_LABEL, cap, fmt, getQuery, human, objToItems, setQuery } from './lib/util';

const TABS = [
  { id: 'dark-web', label: 'Dark web', n: (S: any) => S.leaks?.dark_web?.open },
  { id: 'files', label: 'Files', n: (S: any) => S.leaks?.files?.open },
  { id: 'code', label: 'Code', n: (S: any) => S.leaks?.code?.current },
  { id: 'credentials', label: 'Credentials', n: (S: any) => S.leaks?.credentials?.total },
  { id: 'emails', label: 'Emails', n: (S: any) => S.leaks?.emails?.total },
];

export default function Page() {
  const portal = usePortal();
  const [tab, setTab] = useState(getQuery().get('tab') || 'dark-web');
  useEffect(() => { const onPop = () => setTab(getQuery().get('tab') || 'dark-web'); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  const change = (id: string) => { setTab(id); setQuery({ tab: id === 'dark-web' ? null : id }); };
  const S = portal.data?.summary || {};
  return (
    <PortalShell portal={portal} title="Data leaks" sub={<PeriodSub portal={portal} extra="organisation data found outside the organisation" />}>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label, n: portal.isKpiOnly ? null : t.n(S) }))} active={tab} onChange={change} />
      {portal.isKpiOnly ? <HistoricalEmpty label={portal.selectedId || ''} onBack={() => portal.setPeriod(null)} /> : <Body portal={portal} tab={tab} />}
    </PortalShell>
  );
}

const CustStatus = ({ s }: { s: string | null | undefined }) => (s ? <CustomerStatusPill s={s} /> : <span className="muted">—</span>);
const custFacet = (label: string, items: any[], key: string, format?: (v: string) => string): Facet => ({ key, label, options: items || [], format });

function Body({ portal, tab }: { portal: Portal; tab: string }) {
  const ui = useUI();
  const d = portal.data!; const S = d.summary || {}; const A = d.aggregates || {}; const N = d.narrative || {};
  const pid = d.period!.period_id;
  const shot = (s: any) => screenshotUrl(pid, s);
  const extra = { with_status: 1 };

  if (tab === 'dark-web') {
    const s = S.leaks?.dark_web || {};
    return (
      <>
        <KpiStrip items={[['Open listings', s.open], ['Taken down or invalid', s.taken_down], ['New this period', s.new], ['With evidence screenshot', s.with_screenshot]]} />
        <ModuleNarrative narrative={N} mod="dark_web" />
        <div className="grid cols-1-2 mb-16">
          <Card><div className="chart-title">Listings by forum</div><BarList items={objToItems(s.by_forum).sort((a, b) => b.value - a.value)} /></Card>
          <Card>
            <DataTable module="dark_web" extraParams={extra} searchPlaceholder="Search title, forum or note" defaultSort={{ key: 'posted_at', dir: 'desc' }}
              facets={[custFacet('Status', A.dark_web?._status, '_status', (v) => ANALYST_STATUS_LABEL[v] || human(v)), custFacet('Forum', A.dark_web?.forum, 'forum')]}
              columns={[
                { key: 'title_clean', label: 'Listing', cls: 'wrap', render: (r) => <>{r.title_clean}{r.analyst_note ? <span className="cell-sub">{r.analyst_note}</span> : null}</> },
                { key: 'forum', label: 'Forum', width: '130px' }, { key: 'posted_at', label: 'Posted', width: '100px' },
                { key: 'confidence', label: 'Confidence', width: '100px', render: (r) => r.confidence ? cap(r.confidence) : <span className="muted">—</span> },
                { key: '_status', label: 'Analyst status', width: '120px', render: (r) => <AnalystStatusPill s={r._status} /> },
                { key: 'severity', label: 'Severity', width: '90px', render: (r) => <SevBadge sev={r.severity} /> },
              ]}
              onRow={(r) => ui.openDrawer({ kicker: 'Dark web listing', title: r.title_clean, sub: <><SevBadge sev={r.severity} /> <AnalystStatusPill s={r._status} /> <LifecyclePill row={r} /></>, body: (
                <>
                  <KV pairs={[['Forum', r.forum], ['Posted', r.posted_at], ['Link', <Mono v={r.url} />], ['Confidence', r.confidence_overall || cap(r.confidence || '')], ['Confidence dimensions', r.confidence_dimensions], ['Publisher', r.publisher_note], ['Card number format', r.card_number_format], ['Analyst note', r.analyst_note], ['Customer status', <CustStatus s={r.customer_status} />]]} />
                  {r.evaluation ? <><h4>Analyst evaluation</h4><p className="small secondary pre">{r.evaluation}</p></> : null}
                  <h4>Evidence</h4><Evidence shots={[r.screenshot, ...(r.screenshots_extra || [])]} urlFor={shot} />
                  <Recommendations narrative={N} mod="dark_web" />
                </>
              ) })} />
          </Card>
        </div>
      </>
    );
  }
  if (tab === 'files') {
    const s = S.leaks?.files || {};
    return (
      <>
        <KpiStrip items={[['Open file leaks', s.open], ['Taken down', s.taken_down], ['Historical total', s.total_rows]]} />
        <ModuleNarrative narrative={N} mod="files" />
        <Card>
          <DataTable module="files" extraParams={extra} searchPlaceholder="Search file or note" facets={[custFacet('Status', A.files?.taken_down, 'taken_down', (v) => v === 'true' ? 'Taken down' : v === 'false' ? 'Open' : v)]}
            columns={[
              { key: 'file_name', label: 'File', width: '260px', cls: 'wrap' }, { key: 'platform', label: 'Platform', width: '140px' }, { key: 'uploaded_at', label: 'Uploaded', width: '100px' },
              { key: 'taken_down', label: 'Status', width: '110px', render: (r) => r.taken_down ? <Pill text="Taken down" kind="green" /> : <Pill text="Open" kind="orange" /> },
              { key: 'analyst_note', label: 'Analyst note', cls: 'wrap' }, { key: 'severity', label: 'Severity', width: '90px', render: (r) => <SevBadge sev={r.severity} /> },
            ]}
            onRow={(r) => ui.openDrawer({ kicker: 'File leak', title: r.file_name || r.url, sub: <><SevBadge sev={r.severity} /> {r.taken_down ? <Pill text="Taken down" kind="green" /> : <Pill text="Open" kind="orange" />}</>, body: (
              <>
                <KV pairs={[['Link', <Mono v={r.url} />], ['Platform', r.platform], ['Uploaded', r.uploaded_at], ['Analyst note', r.analyst_note], ['Customer status', <CustStatus s={r.customer_status} />]]} />
                <h4>Evidence</h4><Evidence shots={[r.screenshot]} urlFor={shot} />
                <Recommendations narrative={N} mod="files" />
              </>
            ) })} />
        </Card>
      </>
    );
  }
  if (tab === 'code') {
    const s = S.leaks?.code || {};
    const sens = (r: any) => r._sens === 'confirmed' ? <Pill text="Confirmed" kind="orange" /> : r._sens === 'suspected' ? <Pill text="Suspected" kind="orange" /> : <Pill text="None found" kind="green" />;
    return (
      <>
        <KpiStrip items={[['Current repositories', s.current], ['Expired since last period', A.code?.expired], ['Sensitive data confirmed', s.sensitive_found], ['Sensitive data suspected', A.code?.suspected]]} />
        <ModuleNarrative narrative={N} mod="code" />
        <Card>
          <DataTable module="code" extraParams={extra} searchPlaceholder="Search repository, submitter or note" facets={[custFacet('Sensitive data', A.code?._sens, '_sens', cap), custFacet('Lifecycle', A.code?.lifecycle, 'lifecycle', cap)]}
            columns={[
              { key: 'repository', label: 'Repository', width: '230px', render: (r) => <Mono v={r.repository} /> }, { key: 'submitter', label: 'Submitter', width: '170px' }, { key: 'published_at', label: 'Published', width: '100px' },
              { key: '_sens', label: 'Sensitive data', width: '120px', render: sens }, { key: 'analyst_note', label: 'Analyst note', cls: 'wrap' },
              { key: 'severity', label: 'Severity', width: '90px', render: (r) => <SevBadge sev={r.severity} /> }, { key: 'lifecycle', label: 'Lifecycle', width: '100px', render: (r) => <LifecyclePill row={r} /> },
            ]}
            onRow={(r) => ui.openDrawer({ kicker: 'Code repository', title: r.repository, sub: <><SevBadge sev={r.severity} /> <LifecyclePill row={r} /></>, body: (
              <>
                <KV pairs={[['URL', <Mono v={r.url} />], ['Additional URLs', r.additional_urls?.length ? <>{r.additional_urls.map((u: string, i: number) => <div key={i}><Mono v={u} /></div>)}</> : null], ['Platform', r.platform], ['Description', r.description], ['Submitter', r.submitter], ['Published', r.published_at], ['Sensitive data', r.sensitive_data || (r.sensitive_data_suspected ? 'Suspected (see note)' : 'None found')], ['Analyst note', r.analyst_note], ['Customer status', <CustStatus s={r.customer_status} />]]} />
                <h4>Evidence</h4><Evidence shots={[r.screenshot, r.sensitive_screenshot]} urlFor={shot} />
                <Recommendations narrative={N} mod="code" />
              </>
            ) })} />
        </Card>
      </>
    );
  }
  if (tab === 'credentials') return <Credentials portal={portal} />;
  if (tab === 'emails') {
    const s = S.leaks?.emails || {};
    return (
      <>
        <KpiStrip items={[['Exposed corporate emails', s.total], ['New this period', s.new], ['Sources', Object.keys(s.by_source || {}).length]]} />
        <ModuleNarrative narrative={N} mod="emails" />
        <div className="grid cols-1-2">
          <Card><div className="chart-title">Emails by source (top 8)</div><BarList items={objToItems(s.by_source).sort((a, b) => b.value - a.value).slice(0, 8)} labelW={170} /></Card>
          <Card>
            <DataTable module="emails" searchPlaceholder="Search address or source" facets={[custFacet('Lifecycle', A.emails?.lifecycle, 'lifecycle', cap), custFacet('Source', A.emails?._src, '_src')]}
              columns={[{ key: 'email', label: 'Email address', render: (r) => <Mono v={r.email} /> }, { key: '_src', label: 'Source', width: '200px' }, { key: 'lifecycle', label: 'Lifecycle', width: '100px', render: (r) => <LifecyclePill row={r} /> }]}
              onRow={(r) => ui.openDrawer({ kicker: 'Exposed email address', title: <Mono v={r.email} />, sub: <LifecyclePill row={r} />, body: <><KV pairs={[['Source', <Mono v={r.source} />], ['Analyst note', r.analyst_note]]} /><Recommendations narrative={N} mod="emails" /></> })} />
          </Card>
        </div>
      </>
    );
  }
  return null;
}

function Credentials({ portal }: { portal: Portal }) {
  const ui = useUI();
  const d = portal.data!; const S = d.summary || {}; const A = d.aggregates || {}; const N = d.narrative || {};
  const s = S.leaks?.credentials || {};
  const pid = d.period!.period_id;
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, any>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);
  const reveal = (r: any) => ui.modal({
    title: 'Reveal password?', danger: true, confirmLabel: 'Reveal and log',
    body: <>You are about to reveal the leaked password for <span className="mono">{r.username}</span>.<br /><br />This action is recorded in the audit log with your user name, the time and the record identifier. The password is stored encrypted at rest; the key never enters the database.</>,
    onConfirm: async () => {
      try {
        const res = await contractOp('easm-data-leaks', 'easm.credentials.operations', 'reveal', { params: { filters: { id: [r.id], period_id: [pid] } } });
        setRevealed((m) => ({ ...m, [r.id]: res.password }));
        clearTimeout(timers.current[r.id]);
        timers.current[r.id] = setTimeout(() => setRevealed((m) => { const n = { ...m }; delete n[r.id]; return n; }), (res.expires_in || 10) * 1000);
        ui.toast(<><strong>Password revealed</strong><br />Audit event #{res.audit_id} recorded: reveal · {res.user} · {res.revealed_at} · {r.id}. Re-masked in {res.expires_in || 10} seconds.</>);
      } catch (e: any) {
        ui.toast(<><strong>Reveal failed</strong><br />{errorText(e)}</>, 6000);
      }
    },
  });
  const pw = (r: any) => revealed[r.id] ? <span className="pw-cell"><span className="pw-revealed">{revealed[r.id]}</span></span> : <span className="pw-cell"><span className="mono">{r.password_masked || '••••'}</span><button className="btn btn-sm" onClick={() => reveal(r)}>Reveal</button></span>;
  const shot = (x: any) => screenshotUrl(pid, x);
  return (
    <>
      <KpiStrip items={[['Exposed credentials', s.total], ['Verified logins', s.verified_login, 'checked by the analyst'], ['Login hosts affected', Object.keys(s.by_host || {}).length], ['Stored encrypted', s.encrypted ? 'Yes' : 'No', 'Fernet at rest · masked by default']]} />
      <ModuleNarrative narrative={N} mod="credentials" />
      <Note className="mb-16">Passwords are shown masked. <strong>Reveal</strong> asks for confirmation and writes an audit event (user, time, record); the value re-masks after 10 seconds. Verification screenshots are access-controlled and masked by the analyst before upload.</Note>
      <div className="grid cols-1-2 mb-16">
        <Card><div className="chart-title">Credentials by login host</div><BarList items={objToItems(s.by_host).sort((a, b) => b.value - a.value)} labelW={200} /></Card>
        <Card>
          <DataTable module="credentials" extraParams={{ with_status: 1 }} refreshKey={refreshKey} searchPlaceholder="Search username or host" defaultSort={{ key: 'verified_login', dir: 'desc' }}
            facets={[custFacet('Verified login', A.credentials?._verified, '_verified'), custFacet('Host', A.credentials?.host, 'host')]}
            columns={[
              { key: 'host', label: 'Login host', width: '190px', render: (r) => <Mono v={r.host} /> }, { key: 'username', label: 'Username', width: '220px', render: (r) => <Mono v={r.username} /> },
              { key: 'password_masked', label: 'Password', width: '210px', render: pw, sortable: false },
              { key: 'verified_login', label: 'Verified', width: '100px', render: (r) => r.verified_login ? <Pill text="Verified" kind="blue" /> : <span className="muted">—</span> },
              { key: 'severity', label: 'Severity', width: '90px', render: (r) => <SevBadge sev={r.severity} /> },
              { key: 'customer_status', label: 'Customer status', width: '120px', render: (r) => <CustStatus s={r.customer_status} />, sortable: false },
            ]}
            onRow={(r) => ui.openDrawer({ kicker: 'Leaked credential', title: <Mono v={r.username} />, sub: <><SevBadge sev={r.severity} /> {r.verified_login ? <Pill text="Verified login" kind="blue" /> : null}</>, body: (
              <>
                <KV pairs={[['Login URL', <Mono v={r.login_url} />], ['Host', <Mono v={r.host} />], ['Username type', cap(r.username_type)], ['Password', <><span className="mono">{r.password_masked || ''}</span> <span className="muted">({fmt(r.password_length)} characters, encrypted at rest)</span></>], ['Customer status', <CustStatus s={r.customer_status} />]]} />
                {r.verification ? <><h4>Login verification</h4><KV pairs={[['Record', r.verification.record], ['Result', <Pill text={r.verification.result || ''} kind="blue" />], ['Verified at', r.verification.verified_at], ['Login URL used', <Mono v={r.verification.login_url} />]]} /><div className="mt-12"><Evidence shots={[r.verification.screenshot]} urlFor={shot} label="View login verification screenshot" note="Restricted: shows the account after a successful login. Masked by the analyst before upload; every view is audited." /></div></> : null}
                <Recommendations narrative={N} mod="credentials" />
              </>
            ) })} />
        </Card>
      </div>
    </>
  );
}
