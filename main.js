// WattsOwed — Main application logic
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const STATE = {
  activeTab:     'home',
  selectedModel: 'claude-haiku',
  promptText:    '',
  pageLoadTime:  Date.now(),
  lastResult:    null,
  policyIndex:   0,
  supabase:      null,
};

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initTheme();
  initTabs();
  initCalculator();
  initLiveCounters();
  initTestimonials();
  initPolicyTab();
  renderSources();
  renderMethodology();
  initDCMap();
  setInterval(rotatePolicyTicker, 7000);
});

// ── Supabase ───────────────────────────────────────────────────────────────
function initSupabase() {
  try {
    if (typeof supabase !== 'undefined' &&
        CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
      STATE.supabase = supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY
      );
    }
  } catch(e) { /* Supabase not configured */ }
}

// ── Theme ──────────────────────────────────────────────────────────────────
function initTheme() {
  const btn  = document.getElementById('theme-toggle');
  const icon = btn.querySelector('.theme-icon');
  const saved = localStorage.getItem('ww-theme') || 'dark';
  applyTheme(saved, icon);
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, icon);
    localStorage.setItem('ww-theme', next);
  });
}

function applyTheme(theme, icon) {
  document.documentElement.setAttribute('data-theme', theme);
  icon.textContent = theme === 'dark' ? '☀' : '☾';
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  STATE.activeTab = tabId;

  document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-section').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabId}`);
  });
}

// ── Live Counters ──────────────────────────────────────────────────────────
function initLiveCounters() {
  requestAnimationFrame(tickCounters);
  tickDayCounters();
  setInterval(tickDayCounters, 60_000);

  // EIA data: fetch immediately on page load, then every 5 minutes
  fetchEIA();
  fetchEIA_US();
  setInterval(fetchEIA,    300_000);
  setInterval(fetchEIA_US, 300_000);
}

let _tickLastDom = 0;

function tickCounters() {
  const now     = performance.now();
  const elapsed = (Date.now() - STATE.pageLoadTime) / 1000;

  // Only write to DOM at ~10fps (every 100ms) — physics ticks every frame,
  // DOM updates throttled so rapidly-changing decimals don't flicker.
  if (now - _tickLastDom >= 100) {
    _tickLastDom = now;

    // VA data centers: ~792 kWh/sec
    const waterL  = VA.water_per_sec * elapsed;
    const energyK = VA.kwh_per_sec   * elapsed;
    const mwh     = energyK / 1000;

    // Live Data tab — Virginia row
    setEl('live-va-dc-kwh',       formatNum(mwh, 2));
    setEl('live-va-dc-homes',     formatNum(Math.round(mwh * 1000 / 1.25), 0));
    setEl('live-va-water-l',      formatBigNum(waterL));
    setEl('live-va-dc-ev',        formatNum(Math.round(energyK / 75), 0));
    setEl('live-va-water-baths',  formatNum(Math.round(waterL / 150), 0));
    setEl('live-va-water-drinks', (waterL / 730).toFixed(1));

    // Virginia tab counters
    setEl('va-water',  formatBigNum(waterL));
    setEl('va-energy', formatBigNum(energyK));
    setEl('va-pools',  (waterL / 2_500_000).toFixed(3));
    setEl('va-homes',  formatNum(Math.round(energyK / 1.25), 0));

    // Day counters
    const dayNow      = new Date();
    const startOfDay  = new Date(Date.UTC(dayNow.getUTCFullYear(), dayNow.getUTCMonth(), dayNow.getUTCDate()));
    const secsToday   = (Date.now() - startOfDay) / 1000;

    const globalAIGwh = (VA.globalAI_kwh_per_day / 86400 / 1_000_000) * secsToday;
    setEl('live-global-ai',         formatNum(globalAIGwh, 1));
    setEl('live-global-ai-flights', formatNum(Math.round(globalAIGwh / 1.6), 0));

    const globalDCGwh = (VA.globalDC_kwh_per_day / 86400 / 1_000_000) * secsToday;
    setEl('live-global-dc',    formatNum(globalDCGwh, 1));
    setEl('live-global-dc-uk', (globalDCGwh / 1000).toFixed(2));

    const usAIGwh = (VA.US_AI_kwh_per_day / 86400 / 1_000_000) * secsToday;
    setEl('live-us-ai',       formatNum(usAIGwh, 1));
    setEl('live-us-ai-homes', Math.round(usAIGwh * 1000 / 30).toLocaleString());
  }

  requestAnimationFrame(tickCounters);
}

// kept for any external calls but no longer drives the interval
function tickDayCounters() {}

// ── EIA API — Virginia ─────────────────────────────────────────────────────
async function fetchEIA() {
  if (CONFIG.EIA_API_KEY === 'YOUR_EIA_API_KEY') {
    setEl('live-va-eia', '—');
    setEl('live-va-eia-update', 'Add EIA key in config.js');
    return;
  }
  setEl('live-va-eia-update', 'Fetching…');

  try {
    // URLSearchParams encodes [] as %5B%5D which EIA rejects — use a plain string.
    const url = 'https://api.eia.gov/v2/electricity/retail-sales/data/'
      + `?api_key=${encodeURIComponent(CONFIG.EIA_API_KEY)}`
      + '&frequency=monthly'
      + '&data[0]=sales'
      + '&facets[stateid][]=VA'
      + '&sort[0][column]=period'
      + '&sort[0][direction]=desc'
      + '&length=20';

    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error);

    const rows = j?.response?.data;
    if (!rows?.length) throw new Error('No data returned');

    const latestPeriod = rows[0].period;
    const latestRows   = rows.filter(row => row.period === latestPeriod);
    const totalSales   = latestRows.reduce((sum, row) => sum + (Number(row.sales) || 0), 0);

    if (totalSales > 0) {
      countUp('live-va-eia', Math.round(totalSales), 0);
      setEl('live-va-eia-update', `${latestPeriod} · EIA Open Data`);
      countUp('live-va-eia-homes', Math.round(totalSales / 13.8), 0);
    } else {
      setEl('live-va-eia', '—');
      setEl('live-va-eia-update', 'No sales data in response');
    }
  } catch(e) {
    setEl('live-va-eia', '—');
    setEl('live-va-eia-update', `Error: ${e.message}`);
  }
}

// ── EIA API — United States ────────────────────────────────────────────────
async function fetchEIA_US() {
  if (CONFIG.EIA_API_KEY === 'YOUR_EIA_API_KEY') return;
  setEl('live-us-eia-update', 'Fetching…');

  try {
    const url = 'https://api.eia.gov/v2/electricity/retail-sales/data/'
      + `?api_key=${encodeURIComponent(CONFIG.EIA_API_KEY)}`
      + '&frequency=monthly'
      + '&data[0]=sales'
      + '&facets[stateid][]=US'
      + '&sort[0][column]=period'
      + '&sort[0][direction]=desc'
      + '&length=20';

    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error);

    const rows = j?.response?.data;
    if (!rows?.length) throw new Error('No data returned');

    const latestPeriod = rows[0].period;
    const latestRows   = rows.filter(row => row.period === latestPeriod);
    const totalSales   = latestRows.reduce((sum, row) => sum + (Number(row.sales) || 0), 0);

    if (totalSales > 0) {
      // totalSales in MWh → display in TWh
      const twh = totalSales / 1_000_000;
      countUp('live-us-eia', twh, 1);
      setEl('live-us-eia-update', `${latestPeriod} · EIA Open Data`);
      countUp('live-us-eia-days', Math.round(twh / 11), 0);
    } else {
      setEl('live-us-eia', '—');
      setEl('live-us-eia-update', 'No data returned');
    }
  } catch(e) {
    setEl('live-us-eia', '—');
    setEl('live-us-eia-update', `Error: ${e.message}`);
  }
}

// ── Impact Stats Ticker ────────────────────────────────────────────────────
// Mix of static policy/grid facts and live-computed values.
// Live slots are marked with an id so tickerRefresh() can update them every 5s.

const TICKER_STATS = [
  // Static facts — policy / grid / scale
  { label: 'VA DC energy/yr',      val: '25 TWh',          cls: '' },
  { label: 'VA grid carbon',        val: '350 g CO₂/kWh',   cls: 'warn' },
  { label: 'PJM capacity cost',     val: '+833% since 2024', cls: 'warn' },
  { label: 'Dominion rate hike',    val: '+$11.24/mo',       cls: 'warn' },
  { label: 'US AI workloads/yr',    val: '40 TWh',           cls: '' },
  { label: 'Global DC total/yr',    val: '460 TWh',          cls: '' },
  { label: 'VA DC water/yr',        val: '~12 B gal',        cls: '' },   // 25e9 kWh × 2.3 L/kWh ÷ 3785
  { label: 'VA homes equivalent',   val: '20 M homes',       cls: '' },   // 25 TWh / 1.25 MWh
  { label: 'PJM reserve margin',    val: '18.9% — falling',  cls: 'warn' },
  { label: 'VA data center PUE',    val: '1.45 avg',         cls: '' },
  { label: 'Data center water use', val: '1.8 L / kWh',      cls: '' },
  // Live — values are filled by tickerRefresh()
  { label: 'VA electricity/sec',    val: '—',  id: 'tk-va-kwh',    cls: 'up' },
  { label: 'VA water/sec',          val: '—',  id: 'tk-va-water',  cls: '' },
  { label: 'Global AI today',       val: '—',  id: 'tk-global-ai', cls: '' },
  { label: 'US AI today',           val: '—',  id: 'tk-us-ai',     cls: '' },
];

function buildTickerHTML() {
  // Render stats twice so the seamless loop works at any viewport width
  const once = TICKER_STATS.map(s => {
    const valId = s.id ? `id="${s.id}"` : '';
    return `<span class="t-stat"><span class="t-label">${s.label}</span><span class="t-val ${s.cls}" ${valId}>${s.val}</span></span><span class="t-divider">·</span>`;
  }).join('');
  return once + once;
}

function tickerRefresh() {
  const elapsed   = (Date.now() - STATE.pageLoadTime) / 1000;
  const waterL    = VA.water_per_sec * elapsed;
  const energyK   = VA.kwh_per_sec   * elapsed;

  const now        = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const secsToday  = (Date.now() - startOfDay) / 1000;
  const globalAIGwh = (VA.globalAI_kwh_per_day / 86400 / 1_000_000) * secsToday;
  const usAIGwh     = (VA.US_AI_kwh_per_day    / 86400 / 1_000_000) * secsToday;

  // Update all instances (two copies rendered for seamless loop)
  document.querySelectorAll('#tk-va-kwh').forEach(el =>
    el.textContent = `${(energyK).toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh`);
  document.querySelectorAll('#tk-va-water').forEach(el =>
    el.textContent = `${(waterL / 3785.41).toFixed(1)} gal`);
  document.querySelectorAll('#tk-global-ai').forEach(el =>
    el.textContent = `${globalAIGwh.toFixed(1)} GWh`);
  document.querySelectorAll('#tk-us-ai').forEach(el =>
    el.textContent = `${usAIGwh.toFixed(2)} GWh`);
}

function initNewsTicker() {
  const track = document.getElementById('ticker-content');
  if (!track) return;
  track.innerHTML = buildTickerHTML();
  tickerRefresh();
  setInterval(tickerRefresh, 5000);
}

// ── Prompt Calculator ──────────────────────────────────────────────────────
function initCalculator() {
  const input  = document.getElementById('prompt-input');
  const button = document.getElementById('calc-button');

  // auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 260) + 'px';

    STATE.promptText = input.value;
    const { input: tok, words, outputReason, basis } = estimateTokens(input.value);
    setEl('token-count', tok.toLocaleString());
    setEl('word-count', words.toLocaleString());
    setEl('output-reason', outputReason || '');
    setEl('output-basis', basis || '');
    button.disabled = !input.value.trim();
  });

  // model dropdown
  const wrap     = document.getElementById('chat-model-wrap');
  const modelBtn = document.getElementById('chat-model-btn');
  const dropdown = document.getElementById('chat-model-dropdown');
  const dotEl    = document.getElementById('chat-model-dot');
  const nameEl   = document.getElementById('chat-model-name');

  const MODEL_DOTS = {
    'claude-haiku':  '#4ade80',
    'claude-sonnet': '#f5a623',
    'claude-opus':   '#a78bfa',
    'gpt-4o-mini':   '#4ade80',
    'gpt-4o':        '#f5a623',
    'gpt-4-turbo':   '#a78bfa',
  };
  const MODEL_LABELS = {
    'claude-haiku':  'Claude Haiku',
    'claude-sonnet': 'Claude Sonnet',
    'claude-opus':   'Claude Opus',
    'gpt-4o-mini':   'GPT-4o mini',
    'gpt-4o':        'GPT-4o',
    'gpt-4-turbo':   'GPT-4 Turbo',
  };

  modelBtn.addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });

  document.addEventListener('click', () => wrap.classList.remove('open'));

  dropdown.addEventListener('click', e => {
    const item = e.target.closest('.cmd-item');
    if (!item) return;
    e.stopPropagation();
    const model = item.dataset.model;
    STATE.selectedModel = model;
    nameEl.textContent  = MODEL_LABELS[model];
    dotEl.style.background = MODEL_DOTS[model];
    dropdown.querySelectorAll('.cmd-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    wrap.classList.remove('open');
  });

  button.addEventListener('click', runCalculation);
  initFloatingIcons();
}

// ── Floating icons mouse repulsion ─────────────────────────────────────────
function initFloatingIcons() {
  const icons = document.querySelectorAll('.fi');
  if (!icons.length) return;

  let mouseX = -9999, mouseY = -9999;
  const section = document.getElementById('tab-home');
  if (!section) return;

  section.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  section.addEventListener('mouseleave', () => {
    mouseX = -9999;
    mouseY = -9999;
  });

  function tick() {
    icons.forEach(icon => {
      const rect   = icon.getBoundingClientRect();
      const cx     = rect.left + rect.width  / 2;
      const cy     = rect.top  + rect.height / 2;
      const dx     = cx - mouseX;
      const dy     = cy - mouseY;
      const dist   = Math.sqrt(dx * dx + dy * dy);
      const radius = 130;

      if (dist < radius && dist > 0) {
        const force = (1 - dist / radius) * 55;
        const angle = Math.atan2(dy, dx);
        icon.style.transform = `translate(${Math.cos(angle) * force}px, ${Math.sin(angle) * force}px)`;
      } else {
        icon.style.transform = '';
      }
    });
    requestAnimationFrame(tick);
  }
  tick();
}

function runCalculation() {
  const { input: inputTok, estimatedOutput } = estimateTokens(STATE.promptText);
  if (!inputTok) return;

  const impact = calculateImpact(STATE.selectedModel, inputTok, estimatedOutput);
  STATE.lastResult = { inputTok, estimatedOutput, impact };

  const container = document.getElementById('results-container');
  container.style.display = 'flex';
  container.style.opacity  = '0';
  setTimeout(() => {
    container.style.transition = 'opacity 0.4s ease';
    container.style.opacity    = '1';
  }, 10);

  animateValue('result-energy', impact.energyKwh, formatEnergy, 'result-energy-unit', energyUnit(impact.energyKwh));
  animateValue('result-water',  impact.waterMl,   formatWater,  'result-water-unit',  waterUnit(impact.waterMl));
  animateValue('result-carbon', impact.carbonMg,  formatCarbon, 'result-carbon-unit', carbonUnit(impact.carbonMg));
  animateValue('result-gpu',    impact.gpuMs,     v => v.toFixed(0), null, null);

  setEl('result-energy-compare', energyCompare(impact.energyKwh));
  setEl('result-water-compare',  waterCompare(impact.waterMl, impact.waterMlOnsite, impact.waterMlUpstream));
  setEl('result-carbon-compare', carbonCompare(impact.carbonMg));
  setEl('result-gpu-compare', `${MODEL_DATA[STATE.selectedModel].speed} response`);

  const rec = getRecommendation(STATE.promptText, inputTok);
  renderRecommendation(rec, inputTok, estimatedOutput);
  renderComparisonTable(inputTok, estimatedOutput);

  setTimeout(() => {
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ── Formatting helpers ─────────────────────────────────────────────────────
function formatEnergy(kwh) {
  if (kwh < 0.001) return (kwh * 1e6).toFixed(2);
  if (kwh < 1)     return (kwh * 1000).toFixed(3);
  return kwh.toFixed(4);
}
function energyUnit(kwh) {
  if (kwh < 0.001) return 'µWh';
  if (kwh < 1)     return 'Wh';
  return 'kWh';
}
function energyCompare(kwh) {
  const s = kwh / 0.0003;
  if (s < 1) return '< 1 Google search';
  return `approx. ${s.toFixed(1)} Google searches`;
}

// Water — US customary: fl oz / gallons (1 fl oz = 29.574 mL, 1 gal = 3785.41 mL)
function formatWater(ml) {
  const flOz = ml / 29.574;
  if (flOz < 128) return flOz.toFixed(flOz < 1 ? 2 : 1);
  return (ml / 3785.41).toFixed(3);
}
function waterUnit(ml) { return ml < 3785.41 ? 'fl oz' : 'gal'; }
function waterCompare(ml, waterMlOnsite, waterMlUpstream) {
  const flOz = ml / 29.574;
  let amount;
  if (flOz < 1)   amount = `< 1 fl oz`;
  else if (flOz < 8)   amount = `≈ ${flOz.toFixed(1)} fl oz`;
  else if (flOz < 128) amount = `≈ ${(flOz / 8).toFixed(1)} cups`;
  else                  amount = `≈ ${(ml / 3785.41).toFixed(2)} gal`;
  if (waterMlOnsite !== undefined && waterMlUpstream !== undefined) {
    const onFlOz = (waterMlOnsite / 29.574).toFixed(1);
    const upFlOz = (waterMlUpstream / 29.574).toFixed(1);
    return `${amount} — ${onFlOz} fl oz data center cooling · ${upFlOz} fl oz to generate power`;
  }
  return amount;
}

// Carbon — US: oz CO₂ / lbs CO₂ (1 oz = 28,350 mg, 1 lb = 453,592 mg)
function formatCarbon(mg) {
  const oz = mg / 28350;
  if (oz < 16) return oz.toFixed(oz < 0.01 ? 5 : oz < 0.1 ? 4 : 3);
  return (mg / 453592).toFixed(4);
}
function carbonUnit(mg) {
  return mg < 453592 ? 'oz CO₂' : 'lbs CO₂';
}
function carbonCompare(mg) {
  // US EPA average car: ~404 g CO₂/mile = 76.52 mg/ft
  const feet = mg / 76.52;
  if (feet < 1)    return '< 1 ft of driving';
  if (feet < 5280) return `≈ ${feet.toFixed(0)} ft of driving`;
  return `≈ ${(feet / 5280).toFixed(2)} miles of driving`;
}

// ── Recommendation render ──────────────────────────────────────────────────
function renderRecommendation(rec, inputTok, outputTok) {
  const recModel   = MODEL_DATA[rec.recommended];
  const recImpact  = calculateImpact(rec.recommended, inputTok, outputTok);
  const thisImpact = calculateImpact(STATE.selectedModel, inputTok, outputTok);

  let titleText, bodyText;

  if (rec.recommended === STATE.selectedModel) {
    titleText = `${recModel.name} is well-matched for this task`;
    bodyText  = rec.why;
  } else {
    const pctSavings = Math.round((1 - recImpact.energyKwh / thisImpact.energyKwh) * 100);
    if (pctSavings > 0) {
      titleText = `${recModel.name} would use ${pctSavings}% less electricity for this task`;
      bodyText  = `${rec.why} Switching would save approximately ${formatWater(thisImpact.waterMl - recImpact.waterMl)} ${waterUnit(thisImpact.waterMl - recImpact.waterMl)} of water and reduce carbon by ${pctSavings}% per prompt.`;
    } else {
      titleText = `${recModel.name} is recommended for this task`;
      bodyText  = rec.why;
    }
  }

  setEl('rec-title', titleText);
  setEl('rec-body',  bodyText);
}

// ── Comparison table ───────────────────────────────────────────────────────
const CMP_ICONS = {
  search: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="5" cy="5" r="3.2"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/></svg>`,
  drop:   `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5C6 1.5 2 5.5 2 7.5a4 4 0 0 0 8 0C10 5.5 6 1.5 6 1.5z"/></svg>`,
  leaf:   `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c3-1 7-4 8-8-4 1-7 4-8 8z"/><line x1="2" y1="10" x2="6" y2="6"/></svg>`,
};

function cmpEquiv(impact) {
  // electricity: 1 Google search ≈ 0.3 Wh
  const wh = impact.energyKwh * 1000;
  const searches = Math.round(wh / 0.3);
  const searchStr = searches >= 1
    ? `≈ ${searches.toLocaleString()} search${searches !== 1 ? 'es' : ''}`
    : `< 1 search`;

  // water: US customary (1 fl oz = 29.574 mL, 1 cup = 8 fl oz)
  const flOz = impact.waterMl / 29.574;
  let waterStr;
  if (flOz < 1)        waterStr = `≈ ${flOz.toFixed(2)} fl oz`;
  else if (flOz < 8)   waterStr = `≈ ${flOz.toFixed(1)} fl oz`;
  else if (flOz < 128) waterStr = `≈ ${(flOz / 8).toFixed(1)} cups`;
  else                  waterStr = `≈ ${(impact.waterMl / 3785.41).toFixed(2)} gal`;

  // carbon: US EPA avg car ≈ 404 g CO₂/mile → 76.52 mg/ft
  const feet = impact.carbonMg / 76.52;
  let carbonStr;
  if (feet < 1)        carbonStr = `< 1 ft drive`;
  else if (feet < 5280) carbonStr = `≈ ${feet.toFixed(0)} ft drive`;
  else                  carbonStr = `≈ ${(feet / 5280).toFixed(2)} mi drive`;

  return { searchStr, waterStr, carbonStr };
}

function renderComparisonTable(inputTok, outputTok) {
  const results = Object.entries(MODEL_DATA).map(([key, m]) => {
    const impact = calculateImpact(key, inputTok, outputTok);
    return { key, m, impact };
  });

  results.sort((a, b) => a.impact.energyKwh - b.impact.energyKwh);

  const maxEnergy = results[results.length - 1].impact.energyKwh;
  const tbody = document.getElementById('comparison-tbody');

  // Replace table with card container
  const section = tbody.closest('.comparison-table-wrapper') || tbody.closest('.comparison-section');
  let cardsEl = document.getElementById('cmp-cards');
  if (!cardsEl) {
    cardsEl = document.createElement('div');
    cardsEl.id = 'cmp-cards';
    cardsEl.className = 'cmp-cards';
    tbody.closest('table').parentElement.appendChild(cardsEl);
    tbody.closest('table').style.display = 'none';
  }
  cardsEl.innerHTML = '';

  results.forEach((r, i) => {
    const isWinner   = i === 0;
    const isSelected = r.key === STATE.selectedModel;
    const effPct     = Math.round((1 - r.impact.energyKwh / maxEnergy) * 100);
    const eq         = cmpEquiv(r.impact);

    const card = document.createElement('div');
    card.className = 'cmp-card' + (isWinner ? ' winner' : '') + (isSelected && !isWinner ? ' selected-model' : '');

    card.innerHTML = `
      <div class="cmp-card-left">
        <div class="cmp-model-name">
          ${r.m.name}
          ${isWinner ? '<span class="winner-badge">EFFICIENT</span>' : ''}
          ${isSelected && !isWinner ? '<span class="winner-badge" style="background:rgba(255,255,255,0.1);color:var(--text-2)">SELECTED</span>' : ''}
        </div>
        <div class="cmp-provider">${r.m.provider} · ${r.m.speed}</div>
        <div class="cmp-best-for">${r.m.bestFor}</div>
      </div>
      <div class="cmp-metrics">
        <div class="cmp-metric-block">
          <div class="cmp-metric-label">Electricity</div>
          <div class="cmp-metric-value">${formatEnergy(r.impact.energyKwh)} ${energyUnit(r.impact.energyKwh)}</div>
          <div class="cmp-metric-equiv">${CMP_ICONS.search}<span>${eq.searchStr}</span></div>
        </div>
        <div class="cmp-metric-block">
          <div class="cmp-metric-label">Water</div>
          <div class="cmp-metric-value">${formatWater(r.impact.waterMl)} ${waterUnit(r.impact.waterMl)}</div>
          <div class="cmp-metric-equiv">${CMP_ICONS.drop}<span>${eq.waterStr}</span></div>
        </div>
        <div class="cmp-metric-block">
          <div class="cmp-metric-label">Carbon</div>
          <div class="cmp-metric-value">${formatCarbon(r.impact.carbonMg)} ${carbonUnit(r.impact.carbonMg)}</div>
          <div class="cmp-metric-equiv">${CMP_ICONS.leaf}<span>${eq.carbonStr}</span></div>
        </div>
      </div>
      <div class="cmp-eff">
        <div class="cmp-eff-track">
          <div class="cmp-eff-fill" style="height:${Math.max(4, effPct)}%"></div>
        </div>
        <div class="cmp-eff-pct">${effPct}%</div>
        <div class="cmp-speed-tag">efficiency</div>
      </div>
    `;
    cardsEl.appendChild(card);
  });
}

// ── AI Analysis ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('ai-generate-btn');
  if (btn) btn.addEventListener('click', generateAIAnalysis);
});

async function generateAIAnalysis() {
  if (!STATE.lastResult) return;
  const btn  = document.getElementById('ai-generate-btn');
  const body = document.getElementById('ai-analysis-body');

  if (CONFIG.ANTHROPIC_API_KEY === 'YOUR_ANTHROPIC_API_KEY') {
    body.innerHTML = `<p style="color:var(--text-2)">Add your Anthropic API key in config.js to enable AI-powered analysis.</p>`;
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Generating...';
  body.innerHTML  = '<span class="spinner"></span>';

  const { inputTok, estimatedOutput, impact } = STATE.lastResult;
  const model = MODEL_DATA[STATE.selectedModel];

  const prompt = `You are providing a brief, balanced, factual analysis for WattsOwed, a Virginia AI infrastructure awareness project.

The user just ran this prompt (${STATE.promptText.length} chars, ~${inputTok} tokens) on ${model.name}.
Estimated impact: ${formatEnergy(impact.energyKwh)} ${energyUnit(impact.energyKwh)} electricity, ${formatWater(impact.waterMl)} ${waterUnit(impact.waterMl)} water, ${formatCarbon(impact.carbonMg)} ${carbonUnit(impact.carbonMg)} CO2.

Write 2-3 sentences that: (1) put this specific number in context (is it big or small?), (2) mention how it scales to millions of daily users, and (3) suggest one concrete way to do the same task with less footprint.

Tone: curious, factual, not preachy. Do NOT criticize AI or the user. Plain paragraph only.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data?.content?.[0]?.text || 'Analysis unavailable.';
    body.innerHTML = `<p>${text}</p>`;
  } catch(e) {
    body.innerHTML = `<p style="color:var(--text-3)">Analysis unavailable — check your API key and network connection.</p>`;
  }

  btn.disabled    = false;
  btn.textContent = 'Regenerate';
}

// ── Testimonials ───────────────────────────────────────────────────────────
async function initTestimonials() {
  const grid       = document.getElementById('testimonials-grid');
  const submitCard = document.getElementById('submit-card');

  if (!grid) return;

  document.getElementById('open-submit')?.addEventListener('click', e => {
    e.preventDefault();
    submitCard.style.display = submitCard.style.display === 'none' ? 'flex' : 'none';
  });

  document.getElementById('submit-testimonial')?.addEventListener('click', submitTestimonial);

  let testimonials = [];

  if (STATE.supabase) {
    const { data } = await STATE.supabase
      .from('testimonials')
      .select('*')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(9);
    if (data?.length) testimonials = data;

    if (STATE.supabase) {
      STATE.supabase
        .channel('testimonials')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'testimonials' }, payload => {
          if (payload.new.approved) {
            grid.prepend(createTestimonialCard(payload.new));
            if (grid.children.length > 9) grid.lastChild.remove();
          }
        })
        .subscribe();
    }
  }

  if (!testimonials.length) testimonials = FALLBACK_TESTIMONIALS;

  grid.innerHTML = '';
  testimonials.forEach(t => grid.appendChild(createTestimonialCard(t)));
}

function createTestimonialCard(t) {
  const el = document.createElement('div');
  el.className = 'testimonial-card fade-in';
  el.innerHTML = `
    <div class="testimonial-quote">${escHtml(t.content)}</div>
    <div class="testimonial-meta">
      <span class="testimonial-author">${escHtml(t.author || 'Anonymous')}</span>
      ${t.location ? `<span class="testimonial-location">· ${escHtml(t.location)}</span>` : ''}
      <span class="testimonial-source">${t.source || 'community'}</span>
    </div>
  `;
  return el;
}

async function submitTestimonial() {
  const content  = document.getElementById('testimonial-input')?.value?.trim();
  const author   = document.getElementById('testimonial-author')?.value?.trim() || 'Anonymous';
  const location = document.getElementById('testimonial-location')?.value?.trim();
  const btn      = document.getElementById('submit-testimonial');

  if (!content || content.length < 20) {
    alert('Please write at least 20 characters before submitting.');
    return;
  }

  btn.textContent = 'Submitting...';
  btn.disabled    = true;

  if (STATE.supabase) {
    const { error } = await STATE.supabase.from('testimonials').insert({ content, author, location, source: 'direct' });
    if (error) {
      btn.textContent = 'Error — try again';
      btn.disabled    = false;
    } else {
      btn.textContent = 'Submitted — under review.';
      document.getElementById('testimonial-input').value   = '';
      document.getElementById('testimonial-author').value  = '';
      document.getElementById('testimonial-location').value = '';
    }
  } else {
    setTimeout(() => {
      btn.textContent = 'Submitted (demo mode — add Supabase to save)';
      btn.disabled    = false;
    }, 800);
  }
}

// ── Policy tab ─────────────────────────────────────────────────────────────

// Media / journalism feeds
const POLICY_RSS_FEEDS = [
  'https://virginiamercury.com/feed/',
  'https://www.utilitydive.com/feeds/news/',
  'https://www.datacenterknowledge.com/rss.xml',
  'https://hnrss.org/frontpage?q=Virginia+data+center+electricity+policy',
];

// Official government / agency feeds
const OFFICIAL_RSS_FEEDS = [
  'https://www.eia.gov/rss/todayinenergy.xml',
  'https://www.energy.gov/rss/news-releases.xml',
  'https://www.epa.gov/rss/epa-news.xml',
];

const POLICY_KEYWORDS  = /Virginia|data.?center|SCC|Dominion|PJM|electricity.rate|grid.reliability|JLARC|ratepayer|Lucas.bill|HB.?1842|energy.policy|AI.infrastructure|power.grid|capacity.auction/i;
const OFFICIAL_KEYWORDS = /data.?center|electricity|energy|grid|power|emissions|carbon|renewable|nuclear|load|infrastructure|AI|artificial intelligence/i;

const POLICY_CACHE_KEY = 'ww_policy_v2';

function getPolicyCache() {
  try {
    const c = JSON.parse(localStorage.getItem(POLICY_CACHE_KEY));
    if (c && Date.now() - c.timestamp < CONFIG.POLICY_REFRESH_MS) return c;
  } catch(e) {}
  return null;
}

function setPolicyCache(news, officialNews, bills) {
  localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), news, officialNews, bills }));
}

function initPolicyTab() {
  renderPolicyTimeline();
  renderStakeholders();
  renderRisks();
  initPolicyTicker();
  loadLivePolicyData();

  document.getElementById('policy-refresh-btn')?.addEventListener('click', () => {
    localStorage.removeItem(POLICY_CACHE_KEY);
    loadLivePolicyData();
  });

  setInterval(loadLivePolicyData, CONFIG.POLICY_REFRESH_MS);
}

async function loadLivePolicyData() {
  setPolicyLoadingState(true);

  const cached = getPolicyCache();
  if (cached) {
    renderPolicyNews(cached.news, 'policy-news-grid');
    renderPolicyNews(cached.officialNews, 'policy-official-grid');
    renderBills(cached.bills);
    setPolicyMeta(cached.timestamp, true);
    setPolicyLoadingState(false);
    return;
  }

  const [news, officialNews, bills] = await Promise.all([
    fetchPolicyNews(),
    fetchOfficialPolicyNews(),
    fetchLegislation(),
  ]);

  setPolicyCache(news, officialNews, bills);
  renderPolicyNews(news, 'policy-news-grid');
  renderPolicyNews(officialNews, 'policy-official-grid');
  renderBills(bills);
  setPolicyMeta(Date.now(), false);
  setPolicyLoadingState(false);
}

async function fetchPolicyNews() {
  const articles = [];
  const key = CONFIG.RSS2JSON_API_KEY;
  if (!key || key === 'YOUR_RSS2JSON_API_KEY') return [];

  for (const feed of POLICY_RSS_FEEDS) {
    try {
      const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&api_key=${key}&count=15`;
      const r   = await fetch(url);
      const j   = await r.json();
      if (j.status !== 'ok') continue;

      j.items
        .filter(item => POLICY_KEYWORDS.test(item.title + ' ' + (item.description || '')))
        .slice(0, 4)
        .forEach(item => {
          articles.push({
            title:   item.title,
            link:    item.link,
            pubDate: item.pubDate,
            source:  j.feed?.title || new URL(feed).hostname,
          });
        });
    } catch(e) { /* skip */ }
  }

  const seen = new Set();
  return articles
    .filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; })
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 12);
}

async function fetchOfficialPolicyNews() {
  const articles = [];
  const key = CONFIG.RSS2JSON_API_KEY;
  if (!key || key === 'YOUR_RSS2JSON_API_KEY') return [];

  for (const feed of OFFICIAL_RSS_FEEDS) {
    try {
      const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&api_key=${key}&count=15`;
      const r   = await fetch(url);
      const j   = await r.json();
      if (j.status !== 'ok') continue;

      j.items
        .filter(item => OFFICIAL_KEYWORDS.test(item.title + ' ' + (item.description || '')))
        .slice(0, 5)
        .forEach(item => {
          articles.push({
            title:   item.title,
            link:    item.link,
            pubDate: item.pubDate,
            source:  j.feed?.title || new URL(feed).hostname,
          });
        });
    } catch(e) { /* skip */ }
  }

  const seen = new Set();
  return articles
    .filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; })
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 9);
}

async function fetchLegislation() {
  const key = CONFIG.LEGISCAN_API_KEY;
  if (!key || key === 'YOUR_LEGISCAN_API_KEY') return [];

  const proxy   = 'https://corsproxy.io/?';
  const queries = ['data center electricity', 'AI infrastructure grid', 'Dominion rate'];
  const bills   = [];
  const seen    = new Set();

  for (const q of queries) {
    try {
      const url  = `${proxy}${encodeURIComponent(`https://api.legiscan.com/?key=${key}&op=getSearch&state=VA&query=${encodeURIComponent(q)}&year=2`)}`;
      const r    = await fetch(url);
      const j    = await r.json();
      const results = j?.searchresult;
      if (!results) continue;

      Object.values(results)
        .filter(b => b && b.bill_id && !seen.has(b.bill_id))
        .slice(0, 3)
        .forEach(b => {
          seen.add(b.bill_id);
          bills.push({
            id:         b.bill_id,
            number:     b.bill_number,
            title:      b.title,
            status:     b.status_desc,
            lastAction: b.last_action,
            lastDate:   b.last_action_date,
            url:        b.url,
          });
        });
    } catch(e) { /* skip */ }
  }

  return bills.slice(0, 8);
}

function renderPolicyNews(articles, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!articles || !articles.length) {
    container.innerHTML = `<p class="policy-empty">No articles found. RSS feeds may be temporarily unavailable — try refreshing.</p>`;
    return;
  }

  container.innerHTML = articles.map(a => {
    const ago = timeAgo(new Date(a.pubDate));
    return `
      <a class="policy-news-card" href="${escHtml(a.link)}" target="_blank" rel="noopener">
        <div class="pnc-source">${escHtml(a.source)} · ${ago}</div>
        <div class="pnc-title">${escHtml(a.title)}</div>
        <div class="pnc-arrow">↗</div>
      </a>
    `;
  }).join('');
}

function renderBills(bills) {
  const container = document.getElementById('policy-bills-grid');
  if (!container) return;

  if (!bills || !bills.length) {
    container.innerHTML = `
      <div class="bills-placeholder">
        <p>Add a <strong>LegiScan API key</strong> to <code>config.js</code> (free at legiscan.com) to see real-time Virginia bill tracking here.</p>
        <p style="margin-top:8px;font-size:12px;color:var(--text-3)">Until then, see the Regulatory Timeline below for manually curated updates.</p>
      </div>
    `;
    return;
  }

  const statusColor = s => {
    if (/pass|sign|enact/i.test(s)) return 'var(--green)';
    if (/fail|veto|dead/i.test(s))  return 'var(--red)';
    if (/committee|review|study/i.test(s)) return 'var(--text-3)';
    return 'var(--amber)';
  };

  container.innerHTML = bills.map(b => `
    <a class="bill-card" href="${escHtml(b.url || '#')}" target="_blank" rel="noopener">
      <div class="bill-number">${escHtml(b.number)}</div>
      <div class="bill-title">${escHtml(b.title)}</div>
      <div class="bill-footer">
        <span class="bill-status" style="color:${statusColor(b.status)}">${escHtml(b.status)}</span>
        <span class="bill-date">${escHtml(b.lastDate || '')}</span>
      </div>
      <div class="bill-action">Last: ${escHtml(b.lastAction || '—')}</div>
    </a>
  `).join('');
}

function setPolicyLoadingState(loading) {
  const btn     = document.getElementById('policy-refresh-btn');
  const spinner = document.getElementById('policy-loading');
  if (btn)     btn.disabled              = loading;
  if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
}

function setPolicyMeta(timestamp, fromCache) {
  const el = document.getElementById('policy-last-updated');
  if (!el) return;
  el.textContent = `Last updated ${timeAgo(new Date(timestamp))}${fromCache ? ' (cached)' : ''}`;
}

function timeAgo(date) {
  const diff  = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function initPolicyTicker() {
  const ticker = document.getElementById('policy-ticker');
  if (!ticker) return;
  ticker.innerHTML = `
    <span class="policy-ticker-label">LATEST</span>
    <span class="policy-ticker-text" id="policy-ticker-text">${POLICY_TIMELINE[POLICY_TIMELINE.length - 1].title} — ${POLICY_TIMELINE[POLICY_TIMELINE.length - 1].date}</span>
  `;
}

function rotatePolicyTicker() {
  STATE.policyIndex = (STATE.policyIndex + 1) % POLICY_TIMELINE.length;
  const item = POLICY_TIMELINE[STATE.policyIndex];
  const el   = document.getElementById('policy-ticker-text');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent   = `${item.title} — ${item.date}`;
    el.style.opacity = '1';
  }, 500);
}

function renderPolicyTimeline() {
  const container = document.getElementById('policy-timeline');
  if (!container) return;
  container.innerHTML = POLICY_TIMELINE.map(item => `
    <div class="timeline-item ${item.status}">
      <div class="timeline-dot">
        ${item.status === 'complete' ? '✓' : item.status === 'active' ? '●' : '○'}
      </div>
      <div class="timeline-content">
        <div class="timeline-date">
          ${item.date}
          <span class="timeline-status status-${item.status}">${item.status}</span>
        </div>
        <div class="timeline-title">${item.title}</div>
        <div class="timeline-body">${item.body}</div>
      </div>
    </div>
  `).join('');
}

function renderStakeholders() {
  const container = document.getElementById('stakeholder-grid');
  if (!container) return;
  container.innerHTML = STAKEHOLDERS.map(s => `
    <div class="stakeholder-card">
      <div class="stakeholder-name">${s.name}</div>
      <span class="stakeholder-stance" style="background:${s.color}22;color:${s.color}">${s.stance}</span>
      <div class="stakeholder-detail">${s.detail}</div>
    </div>
  `).join('');
}

function renderRisks() {
  const container = document.getElementById('risk-grid');
  if (!container) return;
  container.innerHTML = RISK_FACTORS.map(r => `
    <div class="risk-item">
      <span class="risk-severity severity-${r.severity}">${r.severity}</span>
      <div>
        <div class="risk-title">${r.title}</div>
        <div class="risk-body">${r.body}</div>
      </div>
    </div>
  `).join('');
}

// ── Methodology ────────────────────────────────────────────────────────────
function renderSources() {
  const list = document.getElementById('sources-list');
  if (!list) return;
  list.innerHTML = SOURCES.map(s => `
    <div class="source-item">
      <span class="source-num">[${s.num}]</span>
      <span class="source-type-tag type-${s.type}">${s.type}</span>
      <div class="source-content">
        <div class="source-title"><a href="${s.url}" target="_blank" rel="noopener">${s.title} ↗</a></div>
        <div class="source-meta">${s.pub} · ${s.date}</div>
      </div>
    </div>
  `).join('');
}

function renderMethodology() {
  const container = document.getElementById('methodology-content');
  if (!container) return;
  container.innerHTML = `
    <div class="method-item">
      <div class="method-label">Energy Estimates</div>
      <div class="method-body">Per-token inference energy coefficients calibrated to Luccioni et al. 2023 and Patterson et al. 2021, adjusted for A100/H100 hardware efficiency (~2× over V100 hardware in original papers). Input tokens use <code>inputRatio × outputCoeff</code> (~5× cheaper due to KV cache reuse). Each estimate is then multiplied by a <strong>PUE factor of 1.45</strong> (Power Usage Effectiveness) — the JLARC 2024 average for Northern Virginia data centers — to account for real-world data center overhead: cooling, power conversion losses, and auxiliary systems. Without PUE, energy figures would understate true facility consumption by ~31%.</div>
    </div>
    <div class="method-item">
      <div class="method-label">System Prompt Overhead</div>
      <div class="method-body">Every inference includes hidden system prompt tokens users never see — Anthropic models carry ~2,000 token overhead; OpenAI models ~1,500 tokens. These are added to the user's input before applying the input energy coefficient. This reflects real-world inference cost more accurately than counting only visible tokens.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Output Token Estimation</div>
      <div class="method-body">A two-pass system: (1) classify the prompt into one of 30 content-type categories (research paper, essay, code, poetry, FAQ, legal doc, etc.), (2) apply a detail-level multiplier — <em>high detail</em> (keywords: "super advanced", "like a professor", "in great depth") escalates by 2–4×; <em>short</em> ("brief", "one paragraph") reduces by 50–60%. <strong>Chain-of-thought</strong> prompts ("think step by step", "show your reasoning") add a 1.5× multiplier for the reasoning trace before the answer. <strong>Table formatting</strong> ("in a table", "tabular form") adds ~220 tokens for Markdown pipe syntax. Explicit page/word counts override everything. A "detailed research paper" with citations estimates ~3,800 tokens; "a short essay" ~450 — an ~8× spread on the same model.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Water Usage</div>
      <div class="method-body">Two components, both expressed in US fl oz / gallons: (1) <strong>On-site evaporative cooling</strong>: <code>energyKwh × 1.8 L/kWh</code> (WUE of Northern VA data centers, Li et al. 2023) — water evaporated by cooling towers and chillers at the data center. (2) <strong>Upstream grid water</strong>: <code>energyKwh × 0.5 L/kWh</code> (VA grid mix weighted average, EPRI 2011 / NREL 2020) — water consumed by thermoelectric generators (gas, nuclear) that supply the grid. Total water intensity: <strong>2.3 L/kWh</strong>. The results card shows both components in the subtitle.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Carbon Emissions</div>
      <div class="method-body"><code>energyKwh × 350 g CO₂/kWh</code> — EPA eGRID 2022 SERC subregion marginal grid intensity for Virginia. Displayed in <strong>US units (oz / lbs CO₂)</strong>. Driving comparison uses US EPA average of 404 g CO₂/mile (76.52 mg/ft) for a passenger vehicle, per EPA 2023 model year fuel economy data.</div>
    </div>
    <div class="method-item">
      <div class="method-label">GPU Time</div>
      <div class="method-body">Computed at chip level (inference energy only, before PUE): <code>(inferenceKwh × 3,600,000 ms) ÷ GPU_TDP</code>. GPU TDP varies by model tier: smaller models (Haiku, GPT-4o mini) → NVIDIA A100 SXM4 at 400W; larger models (Sonnet, Opus, GPT-4o, GPT-4 Turbo) → NVIDIA H100 SXM5 at 700W. Represents compute time, not wall-clock response latency.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Virginia Live Counters</div>
      <div class="method-body"><code>25 TWh/year ÷ 31,557,600 sec = 792 kWh/sec</code> (JLARC 2024). Water: <code>792 kWh/sec × 2.3 L/kWh = 1,822 L/sec</code> (on-site 1,426 + upstream 397). Both tick in real time via requestAnimationFrame from page load.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Global / US AI Counters</div>
      <div class="method-body">Global AI: <code>200 TWh/year ÷ 86,400 sec = 2.315 GWh/sec</code>. US AI: <code>40 TWh/year</code>. Global data centers: <code>460 TWh/year</code>. All from IEA Electricity 2025. Counters reset at midnight UTC.</div>
    </div>
    <div class="method-item">
      <div class="method-label">EIA Electricity Data</div>
      <div class="method-body">Virginia and US electricity sales pulled live from the EIA Open Data API v2 (<code>electricity/retail-sales</code> endpoint). All sectors summed for the most recent available month. Refreshed every 5 minutes.</div>
    </div>
  `;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Smoothly animate a numeric element from its current displayed value to target
function countUp(id, target, decimals = 0, duration = 900) {
  const el = document.getElementById(id);
  if (!el) return;
  const start    = parseFloat(el.textContent.replace(/,/g, '')) || 0;
  const diff     = target - start;
  if (Math.abs(diff) < 0.001) return;
  const t0       = performance.now();
  function step(now) {
    const p  = Math.min((now - t0) / duration, 1);
    const e  = 1 - Math.pow(1 - p, 3); // ease-out cubic
    const v  = start + diff * e;
    el.textContent = decimals > 0
      ? v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(v).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function formatNum(n, decimals) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatBigNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M';
  if (n >= 1_000)     return (n / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function animateValue(id, target, formatter, unitId, unitText) {
  const el = document.getElementById(id);
  if (!el) return;
  const start    = Date.now();
  const duration = 800;
  function step() {
    const progress = Math.min((Date.now() - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(target * eased);
    if (unitId) setEl(unitId, unitText);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = formatter(target);
  }
  requestAnimationFrame(step);
}

// ── Virginia Data Center Map ───────────────────────────────────────────────

const VA_BORDER = [
  [-83.68,36.60],[-81.97,36.57],[-80.26,36.54],[-79.00,36.54],
  [-77.72,36.54],[-77.00,36.54],[-76.91,36.55],[-76.34,36.55],
  [-76.01,36.55],[-75.97,36.84],[-75.80,37.14],
  // cross Chesapeake Bay mouth (simplified)
  [-76.03,37.01],[-76.55,37.09],[-76.72,37.17],
  [-76.60,37.41],[-77.04,37.42],[-76.78,37.72],
  [-76.35,38.01],[-76.63,38.28],[-77.04,38.34],
  [-77.12,38.38],[-77.25,38.60],[-77.51,39.12],
  [-77.73,39.32],[-78.44,39.46],[-78.70,39.33],
  [-79.47,39.21],[-80.02,39.07],[-80.52,38.97],
  [-81.23,38.27],[-81.97,37.53],[-82.56,37.20],
  [-82.65,36.88],[-83.68,36.60],
];

// Eastern Shore peninsula (across Chesapeake Bay)
const VA_EASTERN_SHORE = [
  [-76.03,36.98],[-75.94,37.12],[-75.80,37.42],
  [-75.60,37.78],[-75.43,38.03],[-75.67,38.23],
  [-76.04,38.00],[-76.25,37.89],[-75.97,37.55],
  [-76.03,36.98],
];

const DC_CLUSTERS = [
  { name:'Northern Virginia', sub:'Ashburn · Sterling · Herndon · Chantilly', lat:38.95, lon:-77.44, mw:3400, count:'200+', tier:3 },
  { name:'Manassas',          sub:'Prince William County',                     lat:38.74, lon:-77.47, mw:450,  count:'22',   tier:2 },
  { name:'Culpeper',          sub:'Google hyperscale campus',                  lat:38.47, lon:-77.99, mw:200,  count:'4',    tier:2 },
  { name:'Richmond',          sub:'Henrico County',                            lat:37.59, lon:-77.37, mw:120,  count:'8',    tier:1 },
  { name:'Hampton Roads',     sub:'Suffolk · Norfolk · Chesapeake',            lat:36.84, lon:-76.40, mw:90,   count:'6',    tier:1 },
];

function initDCMap() {
  const canvas = document.getElementById('va-dc-map');
  if (!canvas || !canvas.getContext) return;

  function draw() {
    if (!canvas.offsetWidth) return; // tab not visible yet
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    drawDCMap(canvas, dark);
  }

  // Redraw when Virginia tab becomes visible (tab switch stamps class on section)
  const section = document.getElementById('tab-virginia');
  if (section) {
    new MutationObserver(() => { if (section.classList.contains('active')) draw(); })
      .observe(section, { attributes: true, attributeFilter: ['class'] });
  }

  draw();
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', draw);
}

function drawDCMap(canvas, dark) {
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || canvas.width;
  const H = Math.round(W * (400 / 800));
  canvas.width  = W * (window.devicePixelRatio || 1);
  canvas.height = H * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  const PAD  = { t: 52, r: 28, b: 36, l: 28 };
  const LON0 = -83.9, LON1 = -74.8;
  const LAT0 = 36.30, LAT1 = 39.70;

  function xy(lon, lat) {
    return [
      PAD.l + (lon - LON0) / (LON1 - LON0) * (W - PAD.l - PAD.r),
      PAD.t + (LAT1 - lat) / (LAT1 - LAT0) * (H - PAD.t - PAD.b),
    ];
  }

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = dark ? '#080a10' : '#f0f2f8';
  ctx.fillRect(0, 0, W, H);

  // Subtle graticule
  ctx.lineWidth = 0.5;
  for (let lon = -83; lon <= -75; lon++) {
    const [x] = xy(lon, 38);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let lat = 37; lat <= 40; lat++) {
    const [, y] = xy(-79, lat);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── State outline helper ─────────────────────────────────────────────────
  function drawPoly(pts, fill, stroke, lw) {
    ctx.beginPath();
    pts.forEach(([lon, lat], i) => {
      const [x, y] = xy(lon, lat);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    if (fill)   { ctx.fillStyle   = fill;   ctx.fill();   }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  }

  const stateFill   = dark ? 'rgba(122,162,247,0.07)' : 'rgba(100,130,210,0.11)';
  const stateStroke = dark ? 'rgba(122,162,247,0.32)' : 'rgba(80,110,185,0.55)';
  drawPoly(VA_BORDER,         stateFill, stateStroke, 1.5);
  drawPoly(VA_EASTERN_SHORE,  stateFill, stateStroke, 1.2);

  // ── Chesapeake Bay label ─────────────────────────────────────────────────
  const [bx, by] = xy(-76.12, 37.58);
  ctx.font = `italic 10px sans-serif`;
  ctx.fillStyle = dark ? 'rgba(122,162,247,0.28)' : 'rgba(80,110,185,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText('Chesapeake Bay', bx, by);

  // ── Data center clusters ─────────────────────────────────────────────────
  const MAX_R = 42;
  const maxMW = DC_CLUSTERS[0].mw;

  DC_CLUSTERS.forEach(dc => {
    const [cx, cy] = xy(dc.lon, dc.lat);
    const r = Math.max(5, Math.sqrt(dc.mw / maxMW) * MAX_R);

    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
    glow.addColorStop(0, 'rgba(249,115,22,0.28)');
    glow.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(249,115,22,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(249,115,22,1)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner highlight
    const hi = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, 0, cx, cy, r);
    hi.addColorStop(0, 'rgba(255,200,100,0.35)');
    hi.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hi;
    ctx.fill();

    // Labels above dot
    const textColor = dark ? 'rgba(242,243,250,0.9)' : 'rgba(20,25,50,0.9)';
    const dimColor  = dark ? 'rgba(180,185,210,0.55)' : 'rgba(60,70,110,0.55)';
    const labelY    = cy - r - 7;

    if (dc.tier === 3) {
      ctx.font      = 'bold 11px monospace';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(dc.name, cx, labelY);
      ctx.font      = '9px monospace';
      ctx.fillStyle = dimColor;
      ctx.fillText(dc.sub, cx, labelY - 13);
      ctx.font      = 'bold 9px monospace';
      ctx.fillStyle = 'rgba(249,115,22,0.8)';
      ctx.fillText(`${dc.count} facilities · ${(dc.mw/1000).toFixed(1)} GW`, cx, labelY - 24);
    } else {
      ctx.font      = dc.tier === 2 ? '10px monospace' : '9px monospace';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(dc.name, cx, labelY);
      if (dc.tier === 2) {
        ctx.font      = '9px monospace';
        ctx.fillStyle = dimColor;
        ctx.fillText(`${dc.count} fac · ${dc.mw} MW`, cx, labelY - 12);
      }
    }
  });

  // ── City reference dots (non-DC, for orientation) ─────────────────────
  const CITIES = [
    { name:'Richmond', lat:37.54, lon:-77.44 },
    { name:'Roanoke',  lat:37.27, lon:-79.94 },
    { name:'Norfolk',  lat:36.85, lon:-76.29 },
  ];
  CITIES.forEach(c => {
    const [cx, cy] = xy(c.lon, c.lat);
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = dark ? 'rgba(180,185,210,0.35)' : 'rgba(60,70,110,0.35)';
    ctx.fill();
    ctx.font = '9px sans-serif';
    ctx.fillStyle = dark ? 'rgba(180,185,210,0.35)' : 'rgba(60,70,110,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, cx, cy + 12);
  });

  // ── Scale indicator ──────────────────────────────────────────────────────
  ctx.font = '9px monospace';
  ctx.fillStyle = dark ? 'rgba(122,162,247,0.35)' : 'rgba(80,110,185,0.45)';
  ctx.textAlign = 'left';
  ctx.fillText('VA', PAD.l + 4, H - 10);
}

