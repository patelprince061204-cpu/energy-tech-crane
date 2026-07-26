// src/components/Charts.jsx
// Lightweight, dependency-free SVG charts. This project has no charting
// library available (zero npm dependencies beyond pdf-lib/docx, no network
// access to install one), so these render plain SVG directly - styled to
// match the rest of the ERP rather than looking like a generic chart library.

import React, { useState } from 'react';

// Palette pulled directly from the rest of the app (StatusBadge's color
// map, Button's accent/primary colors) so charts feel native rather than
// using an unrelated chart-library default palette.
const PALETTE = ['#F59E0B', '#1C2530', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B'];
const STATUS_HEX = {
  New: '#94A3B8', 'Under Discussion': '#F59E0B', 'Quotation Sent': '#F59E0B', Won: '#10B981', Lost: '#EF4444',
  Draft: '#94A3B8', Sent: '#F59E0B', Accepted: '#10B981', Rejected: '#EF4444',
  Pending: '#F59E0B', Completed: '#10B981', Ready: '#94A3B8', Dispatched: '#F59E0B', Delivered: '#10B981',
  Paid: '#10B981', Partial: '#F59E0B', Overdue: '#EF4444',
};

function colorFor(label, index) {
  return STATUS_HEX[label] || PALETTE[index % PALETTE.length];
}

// Shared tooltip-on-hover wrapper - keeps every chart's hover affordance
// identical without repeating the positioning logic three times.
function ChartTooltip({ x, y, children }) {
  return (
    <div
      className="absolute z-10 px-2.5 py-1.5 bg-[#1C2530] text-white text-xs rounded-md shadow-lg pointer-events-none whitespace-nowrap -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  );
}

// ============================== Donut / Pie ==============================
// data: [{ label, count }]. onSliceClick(label) is optional - when given,
// slices and legend rows become clickable shortcuts.
export function DonutChart({ data, onSliceClick, size = 160, valueKey = 'count', labelKey = 'label' }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0);
  const radius = size / 2;
  const innerRadius = radius * 0.62;
  const cx = radius, cy = radius;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-xs text-slate-400 text-center">No data yet</p>
      </div>
    );
  }

  let cumulative = 0;
  const slices = data.filter((d) => Number(d[valueKey]) > 0).map((d, i) => {
    const value = Number(d[valueKey]) || 0;
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle), y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle), y2 = cy + radius * Math.sin(endAngle);
    const ix1 = cx + innerRadius * Math.cos(startAngle), iy1 = cy + innerRadius * Math.sin(startAngle);
    const ix2 = cx + innerRadius * Math.cos(endAngle), iy2 = cy + innerRadius * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const path = [
      `M ${x1} ${y1}`, `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`, `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`, 'Z',
    ].join(' ');
    return { ...d, value, path, color: colorFor(d[labelKey], i), pct: Math.round((value / total) * 100) };
  });

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill={s.color}
              opacity={hover === null || hover === i ? 1 : 0.35}
              className={onSliceClick ? 'cursor-pointer transition-opacity' : 'transition-opacity'}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSliceClick && onSliceClick(s[labelKey])}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{total}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Total</span>
        </div>
      </div>
      <div className="space-y-1.5 min-w-0">
        {slices.map((s, i) => (
          <div
            key={i}
            onClick={() => onSliceClick && onSliceClick(s[labelKey])}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 text-xs ${onSliceClick ? 'cursor-pointer hover:opacity-70' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-slate-600 dark:text-slate-300 truncate">{s[labelKey]}</span>
            <span className="text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">{s.value} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================== Bar Chart ==============================
// data: [{ label, value }]. Renders vertically with value labels on top.
export function BarChart({ data, onBarClick, height = 180, valueKey = 'count', labelKey = 'label', formatValue }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  const fmt = formatValue || ((v) => v);

  if (data.length === 0 || data.every((d) => !Number(d[valueKey]))) {
    return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>No data yet</div>;
  }

  return (
    <div className="flex items-end gap-2.5 sm:gap-3" style={{ height: height + 36 }}>
      {data.map((d, i) => {
        const value = Number(d[valueKey]) || 0;
        // Non-zero values always get at least a visible sliver (6px) even
        // when dwarfed by the max - a real 13-unit category shouldn't
        // disappear to nothing next to a 6500-unit one.
        const barHeight = value === 0 ? 0 : Math.max(6, (value / max) * height);
        return (
          <div
            key={i}
            className={`flex-1 flex flex-col items-center justify-end ${onBarClick ? 'cursor-pointer' : ''}`}
            style={{ height: height + 36 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onBarClick && onBarClick(d[labelKey])}
          >
            <span className={`text-[11px] font-semibold tabular-nums mb-1 transition-colors ${hover === i ? 'text-amber-600' : 'text-slate-500 dark:text-slate-400'}`}>
              {value > 0 ? fmt(value) : ''}
            </span>
            <div className="w-full flex items-end" style={{ height }}>
              <div
                className="w-full rounded-t-md transition-colors"
                style={{
                  height: barHeight,
                  backgroundColor: hover === i ? '#F59E0B' : '#334155',
                }}
              />
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 text-center leading-tight">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================== Line Chart ==============================
// series: [{ label, color, data: [{ label, value }] }] - supports multiple
// lines sharing the same x-axis labels (e.g. enquiries vs quotations/month).
export function LineChart({ series, height = 160, width = 520, formatValue }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const fmt = formatValue || ((v) => v);
  const points = series[0]?.data || [];
  if (points.length === 0) {
    return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>No data yet</div>;
  }

  const allValues = series.flatMap((s) => s.data.map((d) => Number(d.value) || 0));
  const max = Math.max(1, ...allValues);
  const padding = { top: 16, bottom: 28, left: 24, right: 24 };
  const innerHeight = height - padding.top - padding.bottom;
  const stepX = (width - padding.left - padding.right) / Math.max(1, points.length - 1);

  const xFor = (i) => padding.left + i * stepX;
  const yFor = (v) => padding.top + innerHeight - (v / max) * innerHeight;

  return (
    <div className="relative" style={{ width: '100%', maxWidth: width }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet">
        {/* horizontal gridlines */}
        {[0, 0.5, 1].map((f, i) => (
          <line key={i} x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight * (1 - f)} y2={padding.top + innerHeight * (1 - f)} stroke="currentColor" className="text-slate-100 dark:text-slate-700" strokeWidth="1" />
        ))}
        {series.map((s, si) => {
          const d = s.data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(Number(p.value) || 0)}`).join(' ');
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.data.map((p, i) => (
                <circle key={i} cx={xFor(i)} cy={yFor(Number(p.value) || 0)} r={hoverIdx === i ? 5 : 3} fill={s.color} stroke="white" strokeWidth="1.5" />
              ))}
            </g>
          );
        })}
        {/* invisible hover targets spanning full height per x-position */}
        {points.map((p, i) => (
          <rect key={i} x={xFor(i) - stepX / 2} y={0} width={stepX} height={height} fill="transparent"
            onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
        ))}
        {points.map((p, i) => (
          <text key={i} x={xFor(i)} y={height - 8} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize="10">{p.label}</text>
        ))}
      </svg>
      {hoverIdx !== null && (
        <ChartTooltip x={(xFor(hoverIdx) / width) * 100 + '%'} y={yFor(Number(series[0].data[hoverIdx]?.value) || 0)}>
          <div className="space-y-0.5">
            {series.map((s, si) => (
              <div key={si} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.label}: {fmt(Number(s.data[hoverIdx]?.value) || 0)}</span>
              </div>
            ))}
          </div>
        </ChartTooltip>
      )}
      <div className="flex gap-4 mt-2 justify-center">
        {series.map((s, si) => (
          <div key={si} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
