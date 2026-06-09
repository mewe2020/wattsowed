// ─────────────────────────────────────────────────────────
// data.js — WattsOwed
// EIA Open Data API fetch + Claude AI insight panel
// ─────────────────────────────────────────────────────────

// ── CONFIG ────────────────────────────────────────────────
// To enable live EIA data, register free at eia.gov/opendata
// and replace YOUR_EIA_API_KEY below (never commit real keys to public repos)
const EIA_API_KEY = 'YOUR_EIA_API_KEY';
const EIA_ENDPOINT = 'https://api.eia.gov/v2/electricity/retail-sales/data/';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── EIA FETCH ─────────────────────────────────────────────
async function fetchEIA() {
  const panel  = document.getElementById('eia-panel');
  if (!panel) return;

  const params = new URLSearchParams({
    frequency: 'monthly',
    'data[0]': 'sales',
    'facets[stateid][]': 'VA',
    'facets[sectorid][]': 'COM',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: 24,
  });

  // Only append key if it's been set
  if (EIA_API_KEY && EIA_API_KEY !== 'YOUR_EIA_API_KEY') {
    params.append('api_key', EIA_API_KEY);
  }

  try {
    const res  = await fetch(`${EIA_ENDPOINT}?${params}`);
    const json = await res.json();
    const data = json?.response?.data;

    if (!data || data.length === 0) throw new Error('empty response');

    const latest = data[0];
    const prev   = data[12] || data[0];
    const lv     = parseFloat(latest.sales);
    const pv     = parseFloat(prev.sales);
    const yoy    = ((lv - pv) / pv * 100).toFixed(1);
    const total  = data.reduce((s, d) => s + parseFloat(d.sales || 0), 0);

    panel.innerHTML = `<div class="eia-grid">
      <div class="eia-stat">
        <div class="eia-val">${(lv / 1000).toFixed(1)}<span style="font-size:0.75rem;color:var(--text-3)"> TWh</span></div>
        <div class="eia-lbl">VA Commercial · ${latest.period}</div>
      </div>
      <div class="eia-stat">
        <div class="eia-val" style="color:${parseFloat(yoy) > 0 ? 'var(--up)' : 'var(--down)'}">
          ${parseFloat(yoy) > 0 ? '+' : ''}${yoy}%
        </div>
        <div class="eia-lbl">Year-over-year change</div>
      </div>
      <div class="eia-stat">
        <div class="eia-val">${(total / 1e6).toFixed(3)}<span style="font-size:0.75rem;color:var(--text-3)"> TWh×10³</span></div>
        <div class="eia-lbl">24-month rolling total</div>
      </div>
      <div class="eia-stat">
        <div class="eia-val">${data.length}</div>
        <div class="eia-lbl">Monthly data points loaded</div>
      </div>
    </div>`;

    // Redraw EIA line chart with live data
    if (typeof drawEIAChart === 'function') {
      drawEIAChart(data.slice(0, 18).reverse());
    }

  } catch (err) {
    console.warn('EIA fetch failed:', err.message);
    panel.innerHTML = `<div class="loading-state" style="color:var(--amber);">
      ⚠ Live data requires a free EIA API key.<br>
      Register at <a href="https://www.eia.gov/opendata/" target="_blank" style="color:var(--amber)">eia.gov/opendata</a>,
      then add your key to <code style="color:var(--amber)">js/data.js</code>.
      <br><br>Reference chart shown below.
    </div>`;
    // Fallback static chart
    if (typeof drawEIAFallback === 'function') drawEIAFallback();
  }
}

// ── AI INSIGHT ────────────────────────────────────────────
const AI_PROMPT = `You are a researcher analyzing Virginia's AI data center energy crisis. Write 3–4 sharp, direct analytical sentences on the current situation based on these facts:
- Virginia data centers consume 25–30 TWh/yr (~25% of state electricity)
- PJM capacity auction costs surged 833% ($2.2B → $14.7B) in 2025–26
- Residential rates up $11.24/mo starting 2026 (first increase since 1992)
- Winter peak load up 45% since 2019 (25,413 MW in 2025–26 season)
- 60 data centers caused a near-miss grid failure in March 2025
- Reserve margin has fallen to 18.9% and is projected to decline further
- 8 new gas plants planned to meet AI demand, conflicting with Virginia Clean Economy Act
- Sen. Lucas bill in conference: would shift 16% of costs to data centers, saving residents ~$5.50/mo

Focus on the equity dimension — who bears costs vs. who captures value — and what the single most important inflection point is. Be direct and analytical, not descriptive.`;

const AI_FALLBACK = "Virginia's AI infrastructure boom has produced a sharp asymmetry: the companies operating data centers capture enormous economic value, while the costs — rate increases, reliability risk, gas plant lock-in — are distributed broadly across ratepayers who had no vote in the matter. The Sen. Lucas bill is the critical inflection: if it passes, it sets the precedent that large industrial loads must internalize their infrastructure costs; if it fails, the pattern of socialized costs continues indefinitely. The deeper risk isn't any single rate increase but the trajectory — reserve margins are tightening, fossil fuel lock-in is accelerating, and PJM's planning model was built for a fundamentally different load profile than concentrated AI infrastructure demands.";

async function loadAIInsight() {
  const el = document.getElementById('ai-text');
  if (!el) return;
  el.className = 'insight-text loading';
  el.innerHTML = '<span class="spin"></span> Generating analysis...';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: AI_PROMPT }],
      }),
    });
    const json = await res.json();
    const text = json.content?.find(b => b.type === 'text')?.text;
    if (!text) throw new Error('no text in response');
    el.className = 'insight-text';
    el.textContent = text;
  } catch (err) {
    console.warn('AI insight failed:', err.message);
    el.className = 'insight-text';
    el.textContent = AI_FALLBACK;
  }
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchEIA();
  loadAIInsight();
  setInterval(fetchEIA, REFRESH_INTERVAL_MS);
});
