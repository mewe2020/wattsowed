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
  initNewsTicker();
  initTestimonials();
  initPolicyTab();
  renderSources();
  renderMethodology();
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

function tickCounters() {
  const elapsed = (Date.now() - STATE.pageLoadTime) / 1000;

  // VA data centers: ~792 kWh/sec
  const waterL  = VA.water_per_sec * elapsed;
  const energyK = VA.kwh_per_sec   * elapsed;
  const mwh     = energyK / 1000;

  // Live Data tab — Virginia row
  setEl('live-va-dc-kwh',   formatNum(mwh, 3));
  setEl('live-va-dc-homes', formatNum(Math.round(mwh * 1000 / 1.25), 0));
  setEl('live-va-water-l',  formatBigNum(waterL));

  // Virginia tab counters (unchanged element IDs)
  setEl('va-water',  formatBigNum(waterL));
  setEl('va-energy', formatBigNum(energyK));
  setEl('va-pools',  (waterL / 2_500_000).toFixed(4));
  setEl('va-homes',  formatNum(Math.round(energyK / 1.25), 0));

  requestAnimationFrame(tickCounters);
}

function tickDayCounters() {
  const now        = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const secsToday  = (Date.now() - startOfDay) / 1000;

  // Global AI: ~200 TWh/year = 547.9 GWh/day (resets midnight UTC)
  const globalAIGwh = (VA.globalAI_kwh_per_day / 86400 / 1_000_000) * secsToday;
  setEl('live-global-ai', formatNum(globalAIGwh, 1));

  // Global data centers: ~460 TWh/year = 1,260 GWh/day
  const globalDCGwh = (VA.globalDC_kwh_per_day / 86400 / 1_000_000) * secsToday;
  setEl('live-global-dc', formatNum(globalDCGwh, 1));

  // US AI: ~40 TWh/year = 109.6 GWh/day
  const usAIGwh = (VA.US_AI_kwh_per_day / 86400 / 1_000_000) * secsToday;
  setEl('live-us-ai', formatNum(usAIGwh, 2));
}

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
      setEl('live-va-eia', formatNum(Math.round(totalSales), 0));
      setEl('live-va-eia-update', `${latestPeriod} · EIA Open Data`);
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
      setEl('live-us-eia', formatNum(twh, 1));
      setEl('live-us-eia-update', `${latestPeriod} · EIA Open Data`);
    } else {
      setEl('live-us-eia', '—');
      setEl('live-us-eia-update', 'No data returned');
    }
  } catch(e) {
    setEl('live-us-eia', '—');
    setEl('live-us-eia-update', `Error: ${e.message}`);
  }
}

// ── News Ticker ────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  'https://www.datacenterknowledge.com/rss.xml',
  'https://www.utilitydive.com/feeds/news/',
  'https://electrek.co/feed/',
  'https://hnrss.org/frontpage?q=AI+data+center+energy',
];

const FALLBACK_HEADLINES = [
  'Virginia data centers drive record PJM capacity auction prices for third consecutive year',
  'Dominion Energy seeks additional rate increase citing grid upgrade costs tied to AI infrastructure',
  'Northern Virginia water authorities issue conservation alert as data center cooling demand rises',
  'JLARC recommends stricter grid reliability standards for large commercial data center connections',
  'AI electricity demand expected to triple by 2030 according to IEA Electricity 2025 report',
  'Lucas bill requiring data center grid studies advances in Virginia General Assembly',
  'Residential ratepayers in SERC region face projected $15–25/month increase by 2027',
  'Virginia SCC opens docket examining equitable cost allocation between data centers and homeowners',
  'PJM reserve margin falls to 18.9% as new data center load outpaces generation additions',
  'Researchers: a single large AI model training run uses as much electricity as 500 US homes in a year',
];

async function initNewsTicker() {
  let headlines = [];
  const key = CONFIG.RSS2JSON_API_KEY;

  if (key && key !== 'YOUR_RSS2JSON_API_KEY') {
    for (const feed of RSS_FEEDS) {
      try {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&api_key=${key}&count=10`;
        const r   = await fetch(url);
        const j   = await r.json();
        if (j.status === 'ok') {
          const filtered = j.items
            .filter(item => /AI|data center|electricity|energy|grid|watt|power|Dominion|Virginia/i.test(item.title))
            .map(item => item.title);
          headlines.push(...filtered);
        }
      } catch(e) { /* skip feed */ }
    }
  }

  if (headlines.length < 4) headlines = FALLBACK_HEADLINES;

  const track = document.getElementById('ticker-content');
  track.innerHTML = headlines.map(h =>
    `<span class="ticker-item">${h}</span>`
  ).join('');
}

// ── Prompt Calculator ──────────────────────────────────────────────────────
function initCalculator() {
  const input    = document.getElementById('prompt-input');
  const button   = document.getElementById('calc-button');
  const pillsEl  = document.querySelector('.model-pills');

  input.addEventListener('input', () => {
    STATE.promptText = input.value;
    const { input: tok, words, outputReason, basis } = estimateTokens(input.value);
    setEl('token-count', tok.toLocaleString());
    setEl('word-count', words.toLocaleString());
    setEl('output-reason', outputReason || '');
    setEl('output-basis', basis || '');
    button.disabled = !input.value.trim();
  });

  pillsEl.addEventListener('click', e => {
    if (!e.target.classList.contains('model-pill')) return;
    document.querySelectorAll('.model-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    STATE.selectedModel = e.target.dataset.model;
  });

  button.addEventListener('click', runCalculation);
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
  setEl('result-water-compare',  waterCompare(impact.waterMl));
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

function formatWater(ml) {
  if (ml < 1000) return ml.toFixed(1);
  return (ml / 1000).toFixed(3);
}
function waterUnit(ml) { return ml < 1000 ? 'mL' : 'L'; }
function waterCompare(ml) {
  const glasses = ml / 250;
  if (glasses < 1)  return '< 1 drinking glass';
  if (glasses < 4)  return `approx. ${glasses.toFixed(1)} drinking glasses`;
  return `approx. ${(ml / 1000).toFixed(2)} liters`;
}

function formatCarbon(mg) {
  if (mg < 1000) return mg.toFixed(1);
  return (mg / 1000).toFixed(3);
}
function carbonUnit(mg) { return mg < 1000 ? 'mg CO2' : 'g CO2'; }
function carbonCompare(mg) {
  const m = mg / 120;
  if (m < 1)    return '< 1 meter of driving';
  if (m < 1000) return `approx. ${m.toFixed(0)} meters of driving`;
  return `approx. ${(m / 1000).toFixed(2)} km of driving`;
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
function renderComparisonTable(inputTok, outputTok) {
  const results = Object.entries(MODEL_DATA).map(([key, m]) => {
    const impact = calculateImpact(key, inputTok, outputTok);
    return { key, m, impact };
  });

  results.sort((a, b) => a.impact.energyKwh - b.impact.energyKwh);

  const maxEnergy = results[results.length - 1].impact.energyKwh;
  const tbody     = document.getElementById('comparison-tbody');
  tbody.innerHTML  = '';

  results.forEach((r, i) => {
    const isWinner   = i === 0;
    const isSelected = r.key === STATE.selectedModel;
    const effPct     = Math.round((1 - r.impact.energyKwh / maxEnergy) * 100);

    const tr = document.createElement('tr');
    if (isWinner)   tr.classList.add('winner');
    if (isSelected) tr.style.background = 'rgba(255,255,255,0.03)';

    tr.innerHTML = `
      <td>
        <div class="model-name-cell">
          ${r.m.name}
          ${isWinner ? '<span class="winner-badge">MOST EFFICIENT</span>' : ''}
          ${isSelected && !isWinner ? '<span class="winner-badge" style="background:rgba(255,255,255,0.1);color:var(--text-2)">SELECTED</span>' : ''}
        </div>
        <div class="provider-tag">${r.m.provider}</div>
      </td>
      <td class="mono">${formatEnergy(r.impact.energyKwh)} ${energyUnit(r.impact.energyKwh)}</td>
      <td class="mono">${formatWater(r.impact.waterMl)} ${waterUnit(r.impact.waterMl)}</td>
      <td class="mono">${formatCarbon(r.impact.carbonMg)} ${carbonUnit(r.impact.carbonMg)}</td>
      <td class="mono">${r.m.speed}</td>
      <td style="font-size:12px;color:var(--text-3)">${r.m.bestFor}</td>
      <td>
        <div class="efficiency-bar-wrap">
          <div class="efficiency-bar" style="width:${Math.max(4, effPct)}px"></div>
          <span class="efficiency-pct">${effPct}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
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
      <div class="method-body">Per-token energy coefficients from Luccioni et al. 2023 and Patterson et al. 2021, adjusted for A100/H100 hardware efficiency (~2× improvement over V100 hardware used in the original papers). Input tokens use <code>inputRatio × outputCoeff</code> (~5× cheaper due to KV cache reuse).</div>
    </div>
    <div class="method-item">
      <div class="method-label">Output Token Estimation</div>
      <div class="method-body">A two-pass system: (1) classify into 30 content-type categories (research paper, essay, code, poetry, FAQ, legal doc, etc.), (2) apply a detail-level multiplier — <em>high detail</em> (keywords: "super advanced", "like a professor", "in great depth") escalates output by 2–4×; <em>short</em> (keywords: "brief", "one paragraph") reduces by 50–60%. Explicit page/word counts in the prompt override the estimate entirely. Add-ons for citations, examples, and sections stack on top. A "research paper in great detail" estimates ~3,800 tokens; "a short essay" estimates ~450 — an ~8× energy spread on the same model.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Water Usage</div>
      <div class="method-body"><code>energy_kWh × 1.8 L/kWh</code>, using WUE of Northern Virginia data centers per Li et al. 2023. Reflects direct cooling water, not embedded water in power generation.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Carbon Emissions</div>
      <div class="method-body"><code>energy_kWh × 350 g CO2/kWh</code> — EPA eGRID 2022 SERC subregion grid intensity for Virginia. Reflects marginal grid emissions.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Virginia Live Counters</div>
      <div class="method-body"><code>25 TWh/year ÷ 31,557,600 sec = 792 kWh/sec</code> — based on JLARC 2024. Water: <code>792 × 1.8 = 1,425 L/sec</code>. Both tick in real time via requestAnimationFrame from page load.</div>
    </div>
    <div class="method-item">
      <div class="method-label">Global / US AI Counters</div>
      <div class="method-body">Global AI: <code>200 TWh/year ÷ 86,400 sec = 2.315 GWh/sec</code>. US AI: <code>40 TWh/year</code>. Global data centers: <code>460 TWh/year</code>. All from IEA Electricity 2025. Counters reset at midnight UTC.</div>
    </div>
    <div class="method-item">
      <div class="method-label">GPU Time</div>
      <div class="method-body"><code>(energy_Wh ÷ 400W) × 3,600,000 ms</code>, assuming NVIDIA A100 at 400W TDP. Represents compute time, not wall-clock latency.</div>
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
