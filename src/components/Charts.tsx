// 手写 SVG 图表：分数折线、错因条形

export type Series = { name: string; color: string; points: { x: number; y: number }[]; bold?: boolean };

export function LineChart({ series, xMax = 28 }: { series: Series[]; xMax?: number }) {
  const W = 340;
  const H = 200;
  const pad = { l: 30, r: 10, t: 10, b: 24 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div class="empty small">还没有分数记录</div>;
  const yMin = Math.min(5, Math.floor(Math.min(...all.map((p) => p.y))));
  const yMax = 9;
  const xMaxV = Math.max(xMax, ...all.map((p) => p.x));
  const x = (v: number) => pad.l + ((v - 1) / Math.max(1, xMaxV - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += 1) yTicks.push(v);
  const xTicks = [1, 7, 14, 21, 28].filter((v) => v <= xMaxV);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="分数随天数变化的折线图">
        {yTicks.map((v) => (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" stroke-width="1" />
            <text x={pad.l - 6} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--muted)">{v}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(7.5)} y2={y(7.5)} stroke="var(--muted)" stroke-dasharray="3 3" stroke-width="1" />
        {xTicks.map((v) => (
          <text x={x(v)} y={H - 6} text-anchor="middle" font-size="11" fill="var(--muted)">{`D${v}`}</text>
        ))}
        {series.map((s) =>
          s.points.length ? (
            <g>
              <polyline
                points={s.points.map((p) => `${x(p.x)},${y(p.y)}`).join(' ')}
                fill="none"
                stroke={s.color}
                stroke-width={s.bold ? 3 : 1.8}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              {s.points.map((p) => (
                <circle cx={x(p.x)} cy={y(p.y)} r={s.bold ? 3.5 : 2.5} fill={s.color}>
                  <title>{`${s.name} 第 ${p.x} 天：${p.y}`}</title>
                </circle>
              ))}
            </g>
          ) : null,
        )}
      </svg>
      <div class="row wrap small" style="gap:12px;justify-content:center">
        {series.map((s) => (
          <span class="row" style="gap:4px">
            <span style={{ width: '14px', height: s.bold ? '4px' : '2px', background: s.color, display: 'inline-block', borderRadius: '2px' }} />
            {s.name}
          </span>
        ))}
        <span class="row muted" style="gap:4px">
          <span style="width:14px;border-top:1px dashed var(--muted);display:inline-block" />7.5
        </span>
      </div>
    </div>
  );
}

export function BarList({ items, highlightFirst }: { items: { label: string; value: number }[]; highlightFirst?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div class="stack" style="gap:6px">
      {items.map((it, i) => {
        const hi = highlightFirst && i === 0;
        return (
          <div class="row" style="gap:8px">
            <div class="small ellipsis" style={{ width: '42%', fontWeight: hi ? 700 : 400 }}>{it.label}</div>
            <div class="grow" style="background:var(--surface-2);border-radius:4px;height:14px">
              <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', borderRadius: '4px', background: hi ? 'var(--danger)' : 'var(--primary)' }} />
            </div>
            <div class="small mono" style="width:24px;text-align:right">{it.value}</div>
          </div>
        );
      })}
    </div>
  );
}
