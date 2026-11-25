// Tiny single-series SVG line chart with a tap/hover readout.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dfmt = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function lineChart(points, { unit = '', label = '' } = {}) {
  if (points.length < 2) return `<div class="empty small">Two or more data points and a trend shows up here.</div>`;
  const W = 340, H = 150, L = 34, R = 12, T = 12, B = 22;
  const xs = points.map(p => p.t), ys = points.map(p => p.v);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1;
  const X = t => L + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = points.map(p => ({ x: +X(p.t).toFixed(1), y: +Y(p.v).toFixed(1), v: p.v, d: dfmt(p.t) }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  const grid = [0, 0.5, 1].map(f => { const v = lo + (hi - lo) * (pad / (hi - lo) + f * (1 - 2 * pad / (hi - lo))); return { v, y: Y(v) }; });
  const last = pts[pts.length - 1];
  return `<div class="chart" data-pts="${esc(JSON.stringify(pts))}" data-unit="${esc(unit)}">
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}: ${points.length} points, latest ${last.v} ${esc(unit)}">
    ${grid.map(g => `<line class="grid" x1="${L}" x2="${W - R}" y1="${g.y.toFixed(1)}" y2="${g.y.toFixed(1)}"/><text class="ax" x="${L - 6}" y="${(g.y + 3.5).toFixed(1)}" text-anchor="end">${Math.round(g.v)}</text>`).join('')}
    <text class="ax" x="${L}" y="${H - 5}">${pts[0].d}</text><text class="ax" x="${W - R}" y="${H - 5}" text-anchor="end">${last.d}</text>
    <path class="line" d="${path}"/>
    ${pts.length <= 40 ? pts.map(p => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="2.5"/>`).join('') : ''}
    <line class="cross" y1="${T}" y2="${H - B}" x1="-9" x2="-9"/><circle class="hot" r="5" cx="-9" cy="-9"/>
  </svg><div class="tip" hidden></div></div>`;
}

export function initCharts() {
  const move = e => {
    const c = e.target.closest?.('.chart'); if (!c) return;
    const svg = c.querySelector('svg'), r = svg.getBoundingClientRect();
    const pts = c._pts || (c._pts = JSON.parse(c.dataset.pts));
    const x = (e.clientX - r.left) / r.width * 340;
    let best = pts[0]; for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    const cross = c.querySelector('.cross'), hot = c.querySelector('.hot'), tip = c.querySelector('.tip');
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x);
    hot.setAttribute('cx', best.x); hot.setAttribute('cy', best.y);
    tip.hidden = false; tip.innerHTML = `<b>${best.v} ${esc(c.dataset.unit)}</b> ${best.d}`;
    tip.style.left = Math.max(8, Math.min(r.width - 120, best.x / 340 * r.width - 50)) + 'px';
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerdown', move);
}
