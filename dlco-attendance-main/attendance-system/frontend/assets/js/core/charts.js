/* ─────────────────────────────────────────────
   Chart.js wrappers styled to the design system.
   Pages register charts here so the router can
   destroy them when navigating away.
   ───────────────────────────────────────────── */
const live = new Set(); // { chart, canvas, build }
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function destroyCharts() {
  live.forEach((e) => e.chart.destroy());
  live.clear();
}

function create(canvas, config) {
  const Chart = window.Chart;
  Chart.defaults.font.family = css('--font');
  Chart.defaults.color = css('--muted');
  return new Chart(canvas, config);
}

/** `build` returns a fresh config, read from the current CSS colours, so charts can be rebuilt on theme change. */
function make(canvas, build) {
  if (!window.Chart || !canvas) return null;
  const entry = { canvas, build, chart: create(canvas, build()) };
  live.add(entry);
  return entry.chart;
}

// Charts bake their colours in when drawn — redraw them all when the theme flips.
window.addEventListener('themechange', () => {
  live.forEach((e) => {
    e.chart.destroy();
    const config = e.build();
    config.options = { ...config.options, animation: false };
    e.chart = create(e.canvas, config);
  });
});

/** Draws value labels above bars (e.g. "87%"). */
const topLabels = {
  id: 'topLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = `500 11px ${css('--font')}`;
    ctx.fillStyle = opts.color || css('--muted');
    ctx.textAlign = 'center';
    meta.data.forEach((bar, i) => {
      const v = chart.data.datasets[0].data[i];
      if (v === null || v === undefined) return;
      ctx.fillText(opts.format ? opts.format(v, i) : v, bar.x, bar.y - 8);
    });
    ctx.restore();
  },
};

const tooltip = {
  backgroundColor: '#1A1A1A', padding: 10, cornerRadius: 10, displayColors: false,
  titleFont: { weight: '600' }, bodyFont: { weight: '500' },
};

/** 7-day bars: light lavender, the highlighted (today) bar solid purple, % labels on top. */
export function weekBars(canvas, { labels, values, highlight = values.length - 1, format = (v) => `${Math.round(v)}%`, tooltipLabel = (v) => `${v}% present` }) {
  return make(canvas, () => {
    const primary = css('--primary');
    const soft = css('--chart-soft');
    const softHover = css('--chart-soft-hover');
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: values.map((_, i) => (i === highlight ? primary : soft)),
          hoverBackgroundColor: values.map((_, i) => (i === highlight ? primary : softHover)),
          borderRadius: 8, borderSkipped: false, maxBarThickness: 34, categoryPercentage: 0.82, barPercentage: 0.92,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } },
        animation: { duration: 700, easing: 'easeOutQuart' },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: (c) => (c.index === highlight ? primary : css('--muted')) } },
          y: { display: false, min: Math.max(0, Math.min(...values.filter((v) => v !== null)) - 25), max: 100 },
        },
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltip, callbacks: { label: (c) => tooltipLabel(c.raw, c.dataIndex) } },
          topLabels: { format },
        },
      },
      plugins: [topLabels],
    };
  });
}

/** Doughnut ring. */
export function ring(canvas, { labels, values, colors, cutout = '74%' }) {
  return make(canvas, () => ({
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, borderRadius: 6, spacing: 3, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout,
      animation: { animateRotate: true, duration: 800 },
      plugins: { legend: { display: false }, tooltip: { ...tooltip, displayColors: true } },
    },
  }));
}

/** Vertical or horizontal bars with a 75% reference line. */
export function bars(canvas, { labels, values, colors, horizontal = false, threshold = 75, suffix = '%' }) {
  const thresholdLine = {
    id: 'threshold',
    afterDatasetsDraw(chart) {
      const scale = horizontal ? chart.scales.x : chart.scales.y;
      if (!scale) return;
      const p = scale.getPixelForValue(threshold);
      const { ctx, chartArea: a } = chart;
      ctx.save();
      ctx.strokeStyle = '#E11D48'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); } else { ctx.moveTo(a.left, p); ctx.lineTo(a.right, p); }
      ctx.stroke();
      ctx.restore();
    },
  };
  const valueAxis = { min: 0, max: 100, grid: { color: () => css('--chart-grid') }, border: { display: false }, ticks: { callback: (v) => v + suffix, font: { size: 11 } } };
  const catAxis = { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, autoSkip: false } };
  return make(canvas, () => ({
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors || values.map((v) => (v < threshold ? '#FDA4AF' : '#C4B5FD')), borderRadius: 6, borderSkipped: false, maxBarThickness: 26 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
      plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => `${Math.round(c.raw * 10) / 10}${suffix}` } } },
    },
    plugins: [thresholdLine],
  }));
}

/** Lazy-load a script once (used for jsPDF). */
const loaded = {};
export function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  }));
}
