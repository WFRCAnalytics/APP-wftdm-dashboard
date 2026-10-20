/* tt.js: one tooltip for every chart. A single floating element, one anatomy (title with swatch, label/value rows, optional delta, optional footer),
   and three ways to feed it: show() for D3 handlers, arm() for Observable Plot marks, cross() for a shared crosshair on time axes. */
(function () {
  const WF = window.WF; let el = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const node = () => { if (!el) { el = document.createElement('div'); el.className = 'wf-tip'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); } return el; };
  const TT = {
    html(o) {
      return (o.title ? `<div class="tt-h">${o.swatch ? `<i style="background:${o.swatch}"></i>` : ''}<span>${esc(o.title)}</span>${o.sub ? `<em>${esc(o.sub)}</em>` : ''}</div>` : '') +
        (o.rows || []).map((r) => `<div class="tt-r${r.b ? ' b' : ''}">${r.c ? `<i style="background:${r.c}"></i>` : '<i class="n"></i>'}<span class="tt-k">${esc(r.k || '')}</span><b class="tt-v">${esc(r.v)}</b>${r.d ? `<em class="tt-d" style="color:${r.dc || 'var(--mute)'}">${esc(r.d)}</em>` : ''}</div>`).join('') +
        (o.foot ? `<div class="tt-f">${esc(o.foot)}</div>` : '');
    },
    show(spec, e) {
      if (e && e.target && e.target.closest && e.target.closest('.wf-multi')) return;
      const t = node(); t.innerHTML = typeof spec === 'string' ? spec : TT.html(spec); t.style.opacity = 1;
      const pad = 16, r = t.getBoundingClientRect(); let x = e.clientX + pad, y = e.clientY + pad;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
      t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
    },
    hide() { if (el) el.style.opacity = 0; },
    /* Observable Plot: give each mark `title: (d, i) => 'wfa:' + i`, then arm() swaps those native titles for our tooltip */
    arm(plot, store, fn, click) {
      plot.querySelectorAll('title').forEach((t) => { const p = t.parentNode; p.setAttribute('data-wf', t.textContent); t.remove(); });
      plot.addEventListener('mousemove', (e) => {
        const n = e.target.closest && e.target.closest('[data-wf]'); if (!n) { TT.hide(); return; }
        const [k, i] = n.getAttribute('data-wf').slice(2).split(':'), rows = store[k], d = rows && rows[+i];
        const spec = d && fn(d, k); if (!spec) { TT.hide(); return; } TT.show(spec, e);
      });
      plot.addEventListener('mouseleave', TT.hide);
      if (click) plot.addEventListener('click', (e) => { const n = e.target.closest && e.target.closest('[data-wf]'); if (!n) return; const [k, i] = n.getAttribute('data-wf').slice(2).split(':'), d = store[k] && store[k][+i]; if (d) click(d, k, e); });
    },
    /* shared crosshair for a continuous x axis: snaps to the nearest integer, draws a guide and one dot per series */
    cross(plot, o) {
      const g = d3.select(plot).append('g').style('pointer-events', 'none').style('display', 'none'), line = g.append('line').attr('y1', o.mt).attr('y2', o.h - o.mb).attr('stroke', 'currentColor').attr('stroke-opacity', .4).attr('stroke-dasharray', '3 3'), dots = g.append('g');
      const X = (v) => o.ml + (v - o.x0) / (o.x1 - o.x0) * (o.w - o.ml - o.mr);
      plot.addEventListener('mousemove', (e) => {
        const r = plot.getBoundingClientRect(), px = e.clientX - r.left;
        if (px < o.ml - 4 || px > o.w - o.mr + 4) { g.style('display', 'none'); TT.hide(); return; }
        const raw = o.x0 + (px - o.ml) / (o.w - o.ml - o.mr) * (o.x1 - o.x0), v = o.snap ? o.snap(raw) : Math.max(o.x0, Math.min(o.x1, Math.round(raw))), spec = o.spec(v);
        g.style('display', null); line.attr('x1', X(v)).attr('x2', X(v));
        let ys = []; try { ys = o.ys ? o.ys(v) : []; } catch (err) { ys = []; }
        dots.selectAll('circle').data(ys).join('circle').attr('cx', X(v)).attr('cy', (d) => d.y).attr('r', 4.5).attr('fill', (d) => d.c).attr('stroke', o.bg).attr('stroke-width', 2);
        TT.show(spec, e);
      });
      plot.addEventListener('mouseleave', () => { g.style('display', 'none'); TT.hide(); });
      if (o.click) { plot.style.cursor = 'pointer'; plot.addEventListener('click', (e) => { const r = plot.getBoundingClientRect(), px = e.clientX - r.left; if (px < o.ml - 4 || px > o.w - o.mr + 4) return; const raw = o.x0 + (px - o.ml) / (o.w - o.ml - o.mr) * (o.x1 - o.x0); o.click(o.snap ? o.snap(raw) : Math.max(o.x0, Math.min(o.x1, Math.round(raw))), e); }); }
    },
  };
  WF.TT = TT;
})();
