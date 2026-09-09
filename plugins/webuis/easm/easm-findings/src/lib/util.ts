// Shared helpers for the ThreatBook EASM Portal pages (synced into every page's src/lib by sync.py).

export const fmt = (n: unknown): string => (n == null || n === '' || Number.isNaN(Number(n))) ? '—' : Number(n).toLocaleString('en-US');
export const cap = (s: unknown): string => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
export const human = (s: unknown): string => cap(String(s == null ? '' : s).replace(/_/g, ' '));
export const yesno = (b: unknown): string => (b === true ? 'Yes' : b === false ? 'No' : '—');
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

export function periodLabel(id: string | null | undefined): string {
  if (!id) return '';
  const m = /^(\d{4})Q([1-4])$/.exec(id);
  return m ? `Q${m[2]} ${m[1]}` : id;
}

export const SEV_ORDER: Record<string, number> = { critical: 0, high: 0, medium: 1, low: 2, info: 3, none: 4 };

export const MODULE_LABEL: Record<string, string> = {
  login_portals: 'Exposed login portals', risky_services: 'Risky ports & services', certificates: 'Certificate risks',
  malicious_ip_tags: 'Malicious IP tags', vulnerabilities: 'Vulnerabilities', http_misconfigurations: 'HTTP security headers',
  dark_web: 'Dark web', files: 'File leaks', code: 'Code leaks', credentials: 'Leaked credentials', emails: 'Corporate emails',
  asset_discovery: 'Asset discovery', mobile_apps: 'Mobile apps', social_accounts: 'WeChat accounts',
};

// Flocks page routes. Sub-tabs travel in ?tab=, the period in ?period=.
export const PAGE = {
  overview: '/contracts/webui/easm-overview',
  surface: '/contracts/webui/easm-attack-surface',
  risks: '/contracts/webui/easm-exposure-risks',
  leaks: '/contracts/webui/easm-data-leaks',
  findings: '/contracts/webui/easm-findings',
  reports: '/contracts/webui/easm-reports',
};
export const MODULE_ROUTE: Record<string, string> = {
  login_portals: `${PAGE.risks}?tab=login-portals`, risky_services: `${PAGE.risks}?tab=risky-services`, certificates: `${PAGE.risks}?tab=certificates`,
  malicious_ip_tags: `${PAGE.risks}?tab=malicious-ip`, vulnerabilities: `${PAGE.risks}?tab=vulnerabilities`, http_misconfigurations: `${PAGE.risks}?tab=http-headers`,
  dark_web: `${PAGE.leaks}?tab=dark-web`, files: `${PAGE.leaks}?tab=files`, code: `${PAGE.leaks}?tab=code`, credentials: `${PAGE.leaks}?tab=credentials`, emails: `${PAGE.leaks}?tab=emails`,
  asset_discovery: `${PAGE.surface}?tab=domains`, mobile_apps: `${PAGE.surface}?tab=mobile-apps`, social_accounts: `${PAGE.surface}?tab=wechat`,
};

export const CUSTOMER_STATUSES: Array<[string, string]> = [
  ['open', 'Open'], ['acknowledged', 'Acknowledged'], ['in_progress', 'In progress'],
  ['resolved', 'Resolved'], ['false_positive', 'False positive'], ['risk_accepted', 'Risk accepted'],
];
export const ANALYST_STATUS_LABEL: Record<string, string> = { open: 'Open', verified: 'Verified', taken_down: 'Taken down', invalid: 'Invalid', expired: 'Expired', to_confirm: 'To confirm', confirmed: 'Confirmed' };

export const BLUE = '#2D73DC', ORANGE = '#F99819', RED = '#DB0000', GREEN = '#58AF1F', INK = '#3D3A39';
export const BLUE_RAMP = ['#8FB3EC', '#5F8FE3', '#2D73DC', '#1F5CBB'];
export const DIM = 'rgba(61,58,57,0.25)';

export interface Item { label: string; value: number; color?: string; tip?: string; suffix?: string; key?: string }
export const objToItems = (obj: Record<string, number> | null | undefined): Item[] => Object.keys(obj || {}).map((k) => ({ label: k, value: (obj as any)[k] }));

// Query-string helpers. Pages live inside the Flocks SPA; we keep our own state in the URL so links are shareable.
export function getQuery(): URLSearchParams { return new URLSearchParams(window.location.search); }
export function setQuery(patch: Record<string, string | null | undefined>, replace = true) {
  const q = getQuery();
  Object.entries(patch).forEach(([k, v]) => { if (v == null || v === '') q.delete(k); else q.set(k, v); });
  const url = `${window.location.pathname}${q.toString() ? '?' + q.toString() : ''}`;
  if (replace) window.history.replaceState(window.history.state, '', url); else window.history.pushState(window.history.state, '', url);
}
/** In-app navigation that keeps the Flocks shell alive (react-router listens to popstate). */
export function navigate(path: string, keepPeriod = true) {
  const period = getQuery().get('period');
  let target = path;
  if (keepPeriod && period && !/[?&]period=/.test(target)) target += (target.includes('?') ? '&' : '?') + 'period=' + encodeURIComponent(period);
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

export function initials(name: string): string {
  const parts = String(name || '').replace(/@.*$/, '').split(/[.\s_-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : String(name || '?').slice(0, 2)).toUpperCase();
}
