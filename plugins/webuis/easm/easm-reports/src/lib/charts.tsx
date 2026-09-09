// Hand-drawn SVG charts (no chart library is available inside Flocks pages). Ported from prototype/assets/app.js.
import React, { useEffect, useRef, useState } from 'react';
import { BLUE, BLUE_RAMP, DIM, fmt, type Item, sum } from './util';

function useWidth(min = 260, fallback = 480): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setW(Math.max(el.clientWidth || fallback, min));
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [min, fallback]);
  return [ref, w];
}

const axisText = { fill: 'rgba(61,58,57,0.55)', fontSize: 11 } as const;
const valueText = { fill: '#3D3A39', fontSize: 11, fontWeight: 500 } as const;

// rounded data end only (square at baseline)
const hbarPath = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z`;
};
const vbarPath = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${x},${y + h} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
};
const rampColor = (i: number, n: number) => BLUE_RAMP[Math.min(BLUE_RAMP.length - 1, Math.floor((i * BLUE_RAMP.length) / Math.max(1, n)))];

/** Horizontal bar list: label | bar | value. */
export function BarList({ items, labelW, valueW = 56, barH = 18, gap = 8, max, ramp, aria }: { items: Item[]; labelW?: number; valueW?: number; barH?: number; gap?: number; max?: number; ramp?: boolean; aria?: string }) {
  const [ref, width] = useWidth();
  const lw = labelW || Math.min(180, Math.round(width * 0.36));
  const mx = max || Math.max(1, ...items.map((i) => i.value));
  const trackW = Math.max(40, width - lw - valueW - 8);
  const height = Math.max(items.length * (barH + gap) - gap + 2, 2);
  return (
    <div className="chart" ref={ref}>
      {items.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={aria || 'Bar chart'}>
          {items.map((it, i) => {
            const y = i * (barH + gap);
            const w = Math.max(0, Math.round((trackW * it.value) / mx));
            const color = it.color || (ramp ? rampColor(i, items.length) : BLUE);
            const label = String(it.label);
            const shown = label.length > 26 ? label.slice(0, 25) + '…' : label;
            return (
              <g key={i}>
                <text x={lw - 8} y={y + barH / 2 + 4} textAnchor="end" {...axisText}><title>{label}</title>{shown}</text>
                <rect x={lw} y={y} width={trackW} height={barH} fill="rgba(61,58,57,0.04)" />
                {w > 0 ? <path d={hbarPath(lw, y, w, barH, 4)} fill={color}><title>{`${label}: ${fmt(it.value)}${it.tip ? ' · ' + it.tip : ''}`}</title></path> : <rect x={lw} y={y} width={2} height={barH} fill={color} />}
                <text x={lw + Math.max(w, 2) + 6} y={y + barH / 2 + 4} {...valueText}>{fmt(it.value)}{it.suffix || ''}</text>
              </g>
            );
          })}
        </svg>
      ) : <div className="muted small">No data</div>}
    </div>
  );
}

/** Grouped horizontal bars (two series) with legend. rows: {label, a, b} */
export function GroupedBars({ rows, seriesA, seriesB, labelW = 130, aria }: { rows: Array<{ label: string; a: number; b: number }>; seriesA: { label: string; color: string }; seriesB: { label: string; color: string }; labelW?: number; aria?: string }) {
  const [ref, width] = useWidth(300);
  const valueW = 60, barH = 12, inner = 2, gap = 12;
  const mx = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
  const trackW = Math.max(40, width - labelW - valueW - 8);
  const rowH = barH * 2 + inner;
  const height = Math.max(rows.length * (rowH + gap) - gap + 2, 2);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={aria || 'Grouped bar chart'}>
        {rows.map((r, i) => {
          const y = i * (rowH + gap);
          return (
            <g key={i}>
              <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" {...axisText}>{r.label}</text>
              {([[r.a, seriesA, 0], [r.b, seriesB, barH + inner]] as Array<[number, { label: string; color: string }, number]>).map(([v, ser, dy], k) => {
                const w = Math.round((trackW * v) / mx);
                return (
                  <g key={k}>
                    <rect x={labelW} y={y + dy} width={trackW} height={barH} fill="rgba(61,58,57,0.04)" />
                    {w > 0 ? <path d={hbarPath(labelW, y + dy, w, barH, 4)} fill={ser.color}><title>{`${r.label} · ${ser.label}: ${fmt(v)}`}</title></path> : <rect x={labelW} y={y + dy} width={2} height={barH} fill={ser.color} />}
                    <text x={labelW + Math.max(w, 2) + 6} y={y + dy + barH / 2 + 4} {...valueText}>{fmt(v)}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><span className="sw" style={{ background: seriesA.color }} />{seriesA.label}</span><span><span className="sw" style={{ background: seriesB.color }} />{seriesB.label}</span></div>
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10;
  return n * p;
}

/** Vertical column chart with hairline gridlines; labels the maximum only. */
export function ColumnChart({ items, height = 190, ramp, labelAll, aria }: { items: Item[]; height?: number; ramp?: boolean; labelAll?: boolean; aria?: string }) {
  const [ref, width] = useWidth();
  const padL = 44, padR = 8, padT = 18, padB = 40;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const mx = Math.max(1, ...items.map((i) => i.value));
  const nice = niceMax(mx);
  const band = plotW / Math.max(1, items.length);
  const bw = Math.min(24, Math.max(6, Math.floor(band * 0.55)));
  const maxIdx = items.reduce((m, it, i) => (it.value > items[m].value ? i : m), 0);
  const ticks = 4;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={aria || 'Column chart'}>
        {Array.from({ length: ticks + 1 }, (_, t) => { const v = (nice * t) / ticks, y = padT + plotH - (plotH * v) / nice; return <g key={t}><line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgba(61,58,57,0.12)" strokeWidth={1} /><text x={padL - 6} y={y + 4} textAnchor="end" {...axisText}>{fmt(v)}</text></g>; })}
        {items.map((it, i) => {
          const h = Math.round((plotH * it.value) / nice);
          const x = padL + band * i + (band - bw) / 2;
          const y = padT + plotH - h;
          const color = it.color || (ramp ? rampColor(i, items.length) : BLUE);
          const lab = String(it.label); const shown = lab.length > 14 && items.length > 4 ? lab.slice(0, 13) + '…' : lab;
          return (
            <g key={i}>
              {h > 0 ? <path d={vbarPath(x, y, bw, h, 4)} fill={color}><title>{`${lab}: ${fmt(it.value)}`}</title></path> : <rect x={x} y={padT + plotH - 2} width={bw} height={2} fill={color} />}
              {i === maxIdx || labelAll ? <text x={x + bw / 2} y={y - 5} textAnchor="middle" {...valueText}>{fmt(it.value)}</text> : null}
              <text x={x + bw / 2} y={padT + plotH + 16} textAnchor="middle" {...axisText}><title>{lab}</title>{shown}</text>
            </g>
          );
        })}
        <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} stroke="rgba(61,58,57,0.3)" strokeWidth={1} />
      </svg>
    </div>
  );
}

/** Single stacked horizontal bar with 2px gaps and labelled segments. */
export function StackedBar({ segments, aria }: { segments: Array<Item & { text?: string }>; aria?: string }) {
  const [ref, width] = useWidth();
  const h = 24, total = Math.max(1, sum(segments.map((s) => s.value)));
  const vis = segments.filter((sg) => sg.value > 0);
  let x = 0;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${h}`} width={width} height={h} role="img" aria-label={aria || 'Stacked bar'}>
        {vis.map((sg, i) => {
          const w = Math.max(2, Math.round(((width - 2 * (vis.length - 1)) * sg.value) / total));
          const el = (
            <g key={i}>
              {i === vis.length - 1 ? <path d={hbarPath(x, 0, w, h, 4)} fill={sg.color || DIM}><title>{`${sg.label}: ${fmt(sg.value)}`}</title></path> : <rect x={x} y={0} width={w} height={h} fill={sg.color || DIM}><title>{`${sg.label}: ${fmt(sg.value)}`}</title></rect>}
              {w > 60 ? <text x={x + 8} y={h / 2 + 4} fill={sg.text || '#fff'} fontSize={11} fontWeight={600} pointerEvents="none">{sg.label.toUpperCase()} {fmt(sg.value)}</text> : null}
            </g>
          );
          x += w + 2;
          return el;
        })}
      </svg>
      <div className="legend">{segments.map((sg, i) => <span key={i}><span className="sw" style={{ background: sg.color || DIM }} />{sg.label} <strong>{fmt(sg.value)}</strong> ({Math.round((100 * sg.value) / total)}%)</span>)}</div>
    </div>
  );
}
