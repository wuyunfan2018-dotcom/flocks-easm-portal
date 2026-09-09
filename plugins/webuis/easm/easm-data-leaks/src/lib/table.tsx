// Server-paged data table: every table in the portal goes through the /rows endpoint (page/size/sort/filters/search).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getRows } from './api';
import { fmt, type Item } from './util';

export interface Column<T = any> {
  key: string; label: string; width?: string; render?: (r: T) => ReactNode; sortable?: boolean; sortKey?: string; cls?: string; title?: (r: T) => string;
}
export interface Facet { key: string; label: string; options: Item[]; format?: (v: string) => string }
export interface SelectDef { key: string; label: string; options: Array<[string, string]> }
export interface TableProps<T = any> {
  module: string;
  columns: Column<T>[];
  facets?: Facet[];
  selects?: SelectDef[];
  searchPlaceholder?: string;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  onRow?: (r: T) => void;
  selectable?: boolean;
  bulk?: (selected: string[], clear: () => void) => ReactNode;
  emptyText?: string;
  extraParams?: Record<string, any>;
  minWidth?: number;
  refreshKey?: any;
  toolbar?: ReactNode;
  rowId?: (r: T) => string;
  onLoaded?: (rows: T[], total: number) => void;
}

export function DataTable<T = any>(props: TableProps<T>) {
  const { module, columns, facets = [], selects = [], searchPlaceholder, defaultSort, onRow, selectable, bulk, emptyText, extraParams, minWidth, refreshKey, toolbar, rowId, onLoaded } = props;
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [sort, setSort] = useState<string | null>(defaultSort?.key || null);
  const [dir, setDir] = useState<'asc' | 'desc'>(defaultSort?.dir || 'asc');
  const [facetSel, setFacetSel] = useState<Record<string, string[]>>({});
  const [selectSel, setSelectSel] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);
  const idOf = useCallback((r: any) => (rowId ? rowId(r) : String(r?.id)), [rowId]);

  useEffect(() => { const t = setTimeout(() => setQ(qLive), 180); return () => clearTimeout(t); }, [qLive]);
  useEffect(() => { setPage(1); }, [q, size, facetSel, selectSel, module]);

  const extraKey = JSON.stringify(extraParams || {});
  useEffect(() => {
    const seq = ++reqSeq.current;
    setBusy(true); setError(null);
    const params: Record<string, any> = { page, size, q, sort: sort || undefined, dir, ...(extraParams || {}) };
    Object.entries(facetSel).forEach(([k, vals]) => { if (vals.length) params['f.' + k] = vals; });
    Object.entries(selectSel).forEach(([k, v]) => { if (v) params['f.' + k] = v; });
    getRows(module, params).then((res) => {
      if (seq !== reqSeq.current) return;
      if (res.error) { setError(res.error); setRows([]); setTotal(0); }
      else { setRows(res.rows as T[]); setTotal(res.total); onLoaded?.(res.rows as T[], res.total); }
      setBusy(false);
    }).catch((e) => { if (seq !== reqSeq.current) return; setError(String(e?.message || e)); setBusy(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, page, size, q, sort, dir, facetSel, selectSel, extraKey, refreshKey]);

  const pages = Math.max(1, Math.ceil(total / size));
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(page * size, total);
  const toggleFacet = (key: string, val: string) => setFacetSel((cur) => { const arr = cur[key] || []; return { ...cur, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] }; });
  const onSort = (c: Column<T>) => { if (c.sortable === false) return; const k = c.sortKey || c.key; if (sort === k) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('asc'); } };
  const pageIds = useMemo(() => rows.map(idOf), [rows, idOf]);
  const allSel = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const clearSel = () => setSelected(new Set());

  return (
    <div>
      <div className="tbl-toolbar">
        <input className="input" type="search" placeholder={searchPlaceholder || 'Search'} value={qLive} onChange={(e) => setQLive(e.target.value)} aria-label="Search" />
        {selects.length ? (
          <div className="tbl-selects">
            {selects.map((s) => (
              <select key={s.key} className="select select-sm" value={selectSel[s.key] || ''} onChange={(e) => setSelectSel((cur) => ({ ...cur, [s.key]: e.target.value }))} aria-label={s.label}>
                <option value="">{s.label}: all</option>
                {s.options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
              </select>
            ))}
          </div>
        ) : null}
        {toolbar ? <div className="row" style={{ marginLeft: 'auto' }}>{toolbar}</div> : null}
      </div>
      {facets.length ? (
        <div className="tbl-facets mb-12">
          {facets.map((f) => (
            <div key={f.key} className="tbl-facet-group">
              <span className="tbl-facet-label">{f.label}</span>
              {f.options.map((o) => { const on = (facetSel[f.key] || []).includes(o.label); return <button key={o.label} className={'chip' + (on ? ' active' : '')} onClick={() => toggleFacet(f.key, o.label)}>{f.format ? f.format(o.label) : o.label} <span className="n">{fmt(o.value)}</span></button>; })}
            </div>
          ))}
        </div>
      ) : null}
      {selectable && selected.size && bulk ? <div className="bulk-bar"><strong>{fmt(selected.size)} selected</strong>{bulk(Array.from(selected), clearSel)}<button className="btn btn-sm" onClick={clearSel}>Clear selection</button></div> : null}
      {error ? <div className="note note-warn mb-12">Could not load rows: {error}</div> : null}
      <div className={'tbl-body' + (busy ? ' busy' : '')}>
        <table className="table" style={minWidth ? { minWidth } : undefined}>
          <colgroup>
            {selectable ? <col style={{ width: 34 }} /> : null}
            {columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {selectable ? <th className="nosort"><input type="checkbox" className="checkbox" checked={allSel} onChange={() => setSelected((cur) => { const n = new Set(cur); if (allSel) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n; })} aria-label="Select page" /></th> : null}
              {columns.map((c) => { const sortable = c.sortable !== false; const k = c.sortKey || c.key; const sorted = sort === k; return <th key={c.key} className={(sortable ? '' : 'nosort') + (sorted ? ' sorted' : '')} onClick={() => onSort(c)} title={c.label}>{c.label}{sortable ? <span className="sort">{sorted ? (dir === 'asc' ? '▲' : '▼') : '▴▾'}</span> : null}</th>; })}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="tbl-empty">{busy ? 'Loading…' : (emptyText || 'No rows match the current filters.')}</td></tr> : null}
            {rows.map((r, i) => {
              const id = idOf(r);
              const sel = selectable && selected.has(id);
              return (
                <tr key={id + ':' + i} className={(onRow ? 'clickable' : '') + (sel ? ' selected' : '')} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest('input, select, button, a, textarea')) return; onRow?.(r); }}>
                  {selectable ? <td><input type="checkbox" className="checkbox" checked={!!sel} onChange={() => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })} aria-label="Select row" /></td> : null}
                  {columns.map((c) => { const v = c.render ? c.render(r) : ((r as any)[c.key] == null || (r as any)[c.key] === '' ? <span className="muted">—</span> : String((r as any)[c.key])); const t = c.title ? c.title(r) : (!c.render ? String((r as any)[c.key] ?? '') : ''); return <td key={c.key} className={c.cls || ''} title={t || undefined}>{v}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tbl-footer">
        <div>Showing {fmt(start)}–{fmt(end)} of {fmt(total)}</div>
        <div className="tbl-pager">
          <label className="muted">Rows per page</label>
          <select className="select select-sm" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {fmt(page)} of {fmt(pages)}</span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
