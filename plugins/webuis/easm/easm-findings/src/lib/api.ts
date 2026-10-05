// Page API + access-contract client. `api` is the Flocks host axios instance; api.page is scoped to this page.
import { api } from '@flocks/webui-contract-sdk';

export interface Period {
  period_id: string; customer_id: string; customer_name: string; report_no: number; report_date: string; label: string;
  status: 'draft' | 'published'; previous_period_id: string | null; loaded_at: string | null; published_at: string | null;
  published_by: string | null; needs_review: boolean;
}
export interface Summary {
  period: Period | null; periods: Period[]; latest: string | null; is_admin: boolean; user: string;
  previous_period?: Period | null; previous_summary?: any; kpi_periods?: any[]; summary: any; aggregates: Record<string, any>;
  exposure_index?: any; narrative?: any; coverage?: any[]; diff?: any;
}
export interface RowsResult<T = any> { rows: T[]; total: number; page: number; size: number; period_id: string | null; error?: string }

const currentPeriod = () => new URLSearchParams(window.location.search).get('period') || '';

async function get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const p: Record<string, any> = { ...(params || {}) };
  if (p.period === undefined) { const cp = currentPeriod(); if (cp) p.period = cp; }
  Object.keys(p).forEach((k) => { if (p[k] === undefined || p[k] === null || p[k] === '') delete p[k]; });
  // Serialise ourselves: the host axios writes arrays as `f.key[]=a&f.key[]=b`, which the page API rejects.
  // Multi-value filters must travel as repeated keys (`f.key=a&f.key=b`).
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, String(x))); });
  const r = await api.page.get(`${path}?${qs.toString()}`);
  return r.data as T;
}

export const getSummary = (period?: string) => get<Summary>('/summary', { period });
export const getRows = (module: string, params: Record<string, any>) => get<RowsResult>('/rows', { module, ...params });
export const getEntity = (module: string, id: string) => get<{ record: any }>('/entity', { module, id });
export const getFindingsStats = () => get<{ by_status: Record<string, number>; total: number; open: number }>('/findings/stats');
/** Whole-period CSV, assembled from offset/limit slices (the page API caps one response at 2 MB). */
export async function getFindingsCsv(): Promise<{ filename: string; csv: string; rows: number }> {
  let offset: number | null = 0; let csv = ''; let rows = 0; let filename = 'easm-findings.csv';
  while (offset !== null) {
    const part: { filename: string; csv: string; rows: number; next: number | null } = await get('/findings/export', { offset, limit: 5000 });
    csv += part.csv; rows += part.rows; filename = part.filename || filename;
    offset = part.next ?? null;
    if (part.rows === 0) break;
  }
  return { filename, csv, rows };
}
export const getReport = () => get<any>('/report');

/** Access-contract operation on another page's contract (pageId is the page the contract is registered to). */
export async function contractOp<T = any>(pageId: string, contractId: string, op: string, body: any): Promise<T> {
  const r = await (api as any).contract(pageId, contractId).operation(op, body);
  return r.data as T;
}

export const assetUrl = (pageId: string, relPath: string) => `/api/contracts/webui/pages/${encodeURIComponent(pageId)}/assets/${relPath.replace(/^\/+/, '')}`;
export const screenshotUrl = (periodId: string, shot: { path?: string } | null | undefined) => {
  if (!shot || !shot.path) return null;
  const rel = String(shot.path).replace(/^assets\//, '');
  return assetUrl('easm-data-leaks', `${rel.replace(/^screenshots\//, `screenshots/${encodeURIComponent(periodId)}/`)}`);
};

export function errorText(e: any): string {
  const d = e?.response?.data;
  if (d?.error?.userMessage) return d.error.userMessage;
  if (typeof d?.detail === 'string') return d.detail;
  if (typeof d?.error === 'string') return d.error;
  return e?.message || String(e);
}
