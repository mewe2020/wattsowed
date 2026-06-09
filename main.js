// ─────────────────────────────────────────────────────────
// main.js — WattsOwed / AI Impact Observatory
// Tab nav · clock · counters · feed · content builders
// ─────────────────────────────────────────────────────────

// ── TAB NAV ───────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const map = { home:0, impact:1, virginia:2, companies:3, policy:4, community:5, sources:6 };
  const btns = document.querySelectorAll('.nav-btn');
  if (btns[map[name]]) btns[map[name]].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── THEME TOGGLE ──────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  html.setAttribute('data-theme', isLight ? 'dark' : 'light');
  document.getElementById('theme-icon').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('wo-theme', isLight ? 'dark' : 'light');
}
(function initTheme() {
  const saved = localStorage.getItem('wo-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const ic = document.getElementById('theme-icon');
    if (ic) ic.textContent = '🌙';
  }
})();

// ── CLOCK ─────────────────────────────────────────────────
function tick() {
  const t = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const el = document.getElementById('nav-clock');
  const hr = document.getElementById('hero-refresh');
  if (el) el.textContent = t;
  if (hr) hr.textContent = 'Updated ' + t;
}
tick(); setInterval(tick, 1000);

// ── LIVE HERO COUNTERS ────────────────────────────────────
// Sources: IEA, Goldman Sachs, various AI research estimates (2025–26)
const RATES = {
  prompts:    1_400,        // per second globally (~121B/day estimate)
  electricity: 0.0116,     // TWh per second (~1,000 TWh/yr)
  water:       889,         // liters per second (~28B L/day)
  co2:         28.4,        // kg per second (~2.45M kg/day)
  gpu_hours:   0.0056,      // GPU-hours per second (~480K/day)
  images:      11.6,        // per second (~1M/day estimated)
  users:       0.23,        // new daily users per second
};

const t0 = Date.now();

function fmtBig(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return Math.round(n).toLocaleString();
}

function updateHeroCounters() {
  const elapsed = (Date.now() - t0) / 1000;
  const midnight = new Date(); midnight.setHours(0,0,0,0);
  const sinceDay = (Date.now() - midnight.getTime()) / 1000;

  const vals = {
    prompts:    sinceDay * RATES.prompts,
    electricity: sinceDay * RATES.electricity,
    water:       sinceDay * RATES.water,
    co2:         sinceDay * RATES.co2,
    gpu_hours:   sinceDay * RATES.gpu_hours,
    images:      sinceDay * RATES.images,
    users:       sinceDay * RATES.users,
  };

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('hc-prompts',    fmtBig(vals.prompts));
  set('hc-elec',       vals.electricity.toFixed(3) + ' TWh');
  set('hc-water',      fmtBig(vals.water) + ' L');
  set('hc-co2',        fmtBig(vals.co2) + ' kg');
  set('hc-gpu',        fmtBig(vals.gpu_hours) + ' hrs');
  set('hc-images',     fmtBig(vals.images));
  set('hc-users',      fmtBig(vals.users));

  // VA MWh counter
  const MWH_PER_SEC = 25_000_000 / (365.25 * 24 * 3600);
  const mwh = elapsed * MWH_PER_SEC;
  const el = document.getElementById('dash-counter');
  if (el) el.textContent = mwh < 1 ? mwh.toFixed(3) : mwh < 100 ? mwh.toFixed(2) : Math.round(mwh).toLocaleString();
}
setInterval(updateHeroCounters, 250);

// ── PROMPT CALCULATOR ─────────────────────────────────────
function calcPrompt() {
  const input = document.getElementById('prompt-input');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const words   = text.split(/\s+/).length;
  const tokens  = Math.round(words * 1.35);
  const complex = Math.min(1, tokens / 200);

  const elec_wh = (0.001 + complex * 0.009).toFixed(4);
  const water_ml = Math.round(10 + complex * 50);
  const co2_g  = (0.3 + complex * 2.7).toFixed(2);
  const gpu_ms = Math.round(50 + complex * 450);

  const results = [
    { icon:'⚡', val: elec_wh + ' Wh',  label:'Electricity' },
    { icon:'💧', val: water_ml + ' mL', label:'Water' },
    { icon:'🌫️', val: co2_g + ' g CO₂', label:'Carbon' },
    { icon:'🖥️', val: gpu_ms + ' ms',   label:'GPU Time' },
  ];

  const grid = document.getElementById('pt-results');
  if (!grid) return;
  grid.innerHTML = results.map((r, i) => `
    <div class="pt-result" style="transition-delay:${i * 0.07}s">
      <div class="pt-result-icon">${r.icon}</div>
      <div class="pt-result-val">${r.val}</div>
      <div class="pt-result-label">${r.label}</div>
    </div>`).join('');

  // Trigger animations
  requestAnimationFrame(() => {
    grid.querySelectorAll('.pt-result').forEach(el => el.classList.add('visible'));
  });
}

// ── TREND TAB SWITCHER ────────────────────────────────────
function showTrend(name) {
  document.querySelectorAll('.trend-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.trend-chart').forEach(c => c.style.display = 'none');
  document.querySelector(`.trend-tab[data-trend="${name}"]`).classList.add('active');
  const el = document.getElementById('trend-' + name);
  if (el) el.style.display = 'block';
  if (typeof drawTrendChart === 'function') drawTrendChart(name);
}

// ── ACTIVITY FEED ─────────────────────────────────────────
const FEED_EVENTS = [
  { t:'<strong>Dominion Zone</strong> — Load tracking ~23,800 MW. Data center draw ~2,850 MW continuous.' },
  { t:'<strong>Loudoun County</strong> — Substations reporting sustained high commercial load.' },
  { t:'<strong>Rate Update</strong> — SCC-approved $11.24/mo residential increase now in effect.' },
  { t:'<strong>Ashburn, VA</strong> — New 240 MW data center campus breaking ground. Est. online Q2 2027.' },
  { t:'<strong>PJM Notice</strong> — Reserve margin 18.9% for 2026–27. Tightening trend continues.' },
  { t:'<strong>Lucas Bill</strong> — SB cost-allocation bill in conference. House-Senate reconciliation ongoing.' },
  { t:'<strong>Clean Economy Act</strong> — Advocates urge SCC to weigh carbon costs vs. gas plant permits.' },
  { t:'<strong>EIA Monitor</strong> — VA commercial sales up YoY. Fastest growth outside Texas.' },
  { t:'<strong>Global</strong> — AI data centers projected to use 1,000+ TWh in 2026 (IEA estimate).' },
  { t:'<strong>Microsoft</strong> — Announced $80B data center investment globally for 2025.' },
];
let feedIndex = 0;
function addFeedItem() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  const now = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const ev = FEED_EVENTS[feedIndex % FEED_EVENTS.length];
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `<div class="feed-time">${now}</div><div class="feed-text">${ev.t}</div>`;
  feed.insertBefore(item, feed.firstChild);
  if (feed.children.length > 10) feed.removeChild(feed.lastChild);
  feedIndex++;
}
addFeedItem(); setInterval(addFeedItem, 8000);

// ── POLICY TIMELINE ───────────────────────────────────────
const POLICY_EVENTS = [
  { d:'Dec 2024', c:'#f5a623', t:'JLARC Report Released',       desc:'Commission finds data centers pay fair share now but warns residential cost shift possible without action.' },
  { d:'Feb 2025', c:'#f06060', t:'Dominion Base Rate Request',   desc:'First base-rate increase request since 1992. +$8.51/mo, citing data center-driven infrastructure needs.' },
  { d:'Mar 2025', c:'#f06060', t:'Near-Miss Grid Incident',      desc:'60 data centers drop off VA grid simultaneously. PJM investigates concentrated large-load reliability risk.' },
  { d:'Jun 2025', c:'#f06060', t:'PJM Capacity Auction Spike',   desc:'2025–26 auction clears at $14.7B — up 833% from $2.2B. FERC cap prevents further escalation.' },
  { d:'Nov 2025', c:'#f5a623', t:'SCC Approves Rate Increase',   desc:'SCC approves +$11.24/mo residential (2026) and +$2.36/mo (2027). Supersedes original Dominion request.' },
  { d:'Jan 2026', c:'#34d399', t:'GS-5 Tariff Takes Effect',     desc:'New high-load rate class activates for data centers ≥25 MW. Designed to shield residential customers.' },
  { d:'Feb 2026', c:'#f5a623', t:'Sen. Lucas Bill Introduced',   desc:'2026 GA bill proposes +16% data center cost shift, saving residential customers ~$5.50/mo (~4%).' },
  { d:'Mar 2026', c:'#384557', t:'Lucas Bill in Conference',     desc:'House and Senate reconciling versions. Outcome sets template for future rate structure.' },
];

function buildTimeline() {
  const el = document.getElementById('policy-timeline');
  if (!el) return;
  el.innerHTML = POLICY_EVENTS.map(e => `
    <div class="tl-item">
      <div class="tl-date">${e.d}</div>
      <div class="tl-dot" style="background:${e.c}"></div>
      <div><div class="tl-title">${e.t}</div><div class="tl-desc">${e.desc}</div></div>
    </div>`).join('');
}

// ── STAKEHOLDERS ──────────────────────────────────────────
const STAKEHOLDERS = [
  { name:'Dominion Energy',        pos:'Wants flexibility to charge data centers via GS-5 while recovering grid investment costs from all ratepayers.' },
  { name:'Data Center Operators',  pos:'Oppose cost shifting. Argue they bring jobs, tax revenue, and economic growth to Virginia communities.' },
  { name:'Residential Ratepayers', pos:'Absorbing rate increases without receiving infrastructure benefits. Lucas bill offers partial relief.' },
  { name:'Virginia SCC',           pos:'Balancing ratepayer protection with utility financial health. Approved increases while encouraging reform.' },
  { name:'Environmental Groups',   pos:'Concerned gas plant buildout conflicts with Clean Economy Act. Pushing for demand-side and renewable solutions.' },
  { name:'JLARC / Legislature',    pos:'Monitoring cost allocation fairness. Legislative action underway to ensure data centers bear their true cost.' },
];

function buildStakeholders() {
  const el = document.getElementById('stakeholder-grid');
  if (!el) return;
  el.innerHTML = '<div class="stakeholder-grid">' +
    STAKEHOLDERS.map(s => `<div class="sh-card"><div class="sh-name">${s.name}</div><div class="sh-pos">${s.pos}</div></div>`).join('')
    + '</div>';
}

// ── RISK FACTORS ──────────────────────────────────────────
const RISKS = [
  { n:'Reserve Margin Erosion',      l:'HIGH', d:'At 18.9% and declining. Industry minimum ~15%. Any large demand shock reduces margin further.' },
  { n:'Concentrated Load Risk',      l:'HIGH', d:'March 2025 showed synchronized disconnects create swings PJM\'s controls weren\'t designed to handle.' },
  { n:'Gas Plant Lock-In',           l:'MOD',  d:'8 new gas plants expose VA ratepayers to long-term fossil infrastructure conflicting with the Clean Economy Act.' },
  { n:'Residential Cost Escalation', l:'MOD',  d:'If Lucas bill fails, data center costs keep flowing to households. JLARC warned this is unsustainable.' },
  { n:'AI Demand Uncertainty',       l:'MOD',  d:'PJM\'s 5.4%/yr forecast is a downward revision from 6.3%. If AI buildout accelerates, stress compounds.' },
];

function buildRiskFactors() {
  const el = document.getElementById('risk-factors');
  if (!el) return;
  el.innerHTML = RISKS.map(r => `
    <div class="risk-row">
      <div class="risk-name">${r.n}</div>
      <div class="risk-badge ${r.l === 'HIGH' ? 'risk-high' : 'risk-mod'}">${r.l}</div>
      <div class="risk-detail">${r.d}</div>
    </div>`).join('');
}

// ── COMMUNITY CARDS ───────────────────────────────────────
const IMPACT_CARDS = [
  { icon:'⚡', n:'60',       t:'Near-Miss Grid Failure',    d:'Data centers simultaneously dropped off VA grid in March 2025. Concentrated load risk is now a systemic reliability concern.' },
  { icon:'🏠', n:'$11+/mo',  t:'Household Rate Burden',     d:'SCC-approved monthly increase takes effect 2026. Low-income households absorb this cost disproportionately.' },
  { icon:'✊', n:'$64B',     t:'Community Resistance',      d:'Blocked/delayed projects nationwide. VA: 42 activist groups, 12,000+ petition signatures.' },
  { icon:'💧', n:'80%',      t:'Hidden Water Footprint',    d:'Of a data center\'s total water use comes from upstream power generation — far beyond the fence line.' },
  { icon:'🌐', n:'~70%',     t:'Internet Backbone',         d:'Of global internet traffic passes through Loudoun County. Local residents bear strain while corporations capture value.' },
  { icon:'🏭', n:'8',        t:'New Gas Plants Planned',    d:'Dominion plans 8 new gas plants to meet AI demand — conflicting with Virginia\'s Clean Economy Act (2020).' },
  { icon:'📉', n:'18.9%',    t:'Reserve Margin Erosion',    d:'PJM\'s 2026–27 reserve margin and projected to fall. The margin between normal ops and crisis narrows each year.' },
  { icon:'⚖️', n:'24%',      t:'Infrastructure Cost Shift', d:'Of typical residential bills by 2020 consisted of infrastructure clauses — before the AI surge.' },
  { icon:'💡', n:'5.4%',     t:'Annual Demand Growth',      d:'PJM projects 5.4%/yr summer peak growth in Dominion zone — largest absolute increase of any PJM zone.' },
];

function buildCommunityGrid() {
  const el = document.getElementById('impact-grid');
  if (!el) return;
  el.innerHTML = IMPACT_CARDS.map(c => `
    <div class="impact-card">
      <span class="impact-icon">${c.icon}</span>
      <div class="impact-num">${c.n}</div>
      <div class="impact-title">${c.t}</div>
      <div class="impact-desc">${c.d}</div>
    </div>`).join('');
}

// ── THRESHOLDS ────────────────────────────────────────────
function buildThresholds() {
  const el = document.getElementById('threshold-bars');
  if (!el) return;
  const items = [
    { label:'Peak Load vs Capacity',      cur:'25,413 MW', pct:79, color:'#f06060' },
    { label:'Reserve Margin (min ~15%)',  cur:'18.9%',     pct:54, color:'#f5a623' },
    { label:'Data Ctr Share of Grid',     cur:'~25%',      pct:25, color:'#f06060' },
    { label:'Auction Cost vs FERC Cap',   cur:'$329/MW-day',pct:82, color:'#f5a623' },
  ];
  el.innerHTML = items.map(t => `
    <div class="threshold-item">
      <div class="threshold-header"><span>${t.label}</span><span>${t.cur}</span></div>
      <div class="threshold-track">
        <div class="threshold-fill" style="width:${t.pct}%;background:${t.color};opacity:0.75;"></div>
      </div>
    </div>`).join('');
}

// ── COMPANY CARDS ─────────────────────────────────────────
const COMPANIES = [
  { name:'OpenAI',     logo:'🤖', energy:'~1.3 TWh/yr',   water:'~3.8B L/yr',    queries:'~200M/day',  carbon:'~650K t CO₂', compute:'~30K A100s', intensity:'Med-High' },
  { name:'Google',     logo:'🔍', energy:'~25 TWh/yr',    water:'~18B L/yr',     queries:'~8.5B/day',  carbon:'~2.4M t CO₂', compute:'~700K TPUs', intensity:'Med (RE)' },
  { name:'Microsoft',  logo:'🪟', energy:'~18 TWh/yr',    water:'~12B L/yr',     queries:'~4B/day',    carbon:'~1.8M t CO₂', compute:'~500K A100s',intensity:'Med (RE)' },
  { name:'Meta',       logo:'👤', energy:'~12 TWh/yr',    water:'~8B L/yr',      queries:'~3B/day',    carbon:'~1.1M t CO₂', compute:'~300K H100s',intensity:'Low (RE)' },
  { name:'Amazon',     logo:'📦', energy:'~30 TWh/yr',    water:'~22B L/yr',     queries:'~10B/day',   carbon:'~3.1M t CO₂', compute:'~800K various',intensity:'Med' },
  { name:'Anthropic',  logo:'✦',  energy:'~0.4 TWh/yr',   water:'~1.1B L/yr',    queries:'~40M/day',   carbon:'~190K t CO₂', compute:'~8K A100s',  intensity:'Med' },
];

function buildCompanyCards() {
  const el = document.getElementById('company-grid');
  if (!el) return;
  el.innerHTML = COMPANIES.map(c => `
    <div class="company-card">
      <div class="company-name"><span class="company-logo">${c.logo}</span>${c.name}</div>
      <div class="company-stats">
        <div class="cstat"><span class="cstat-label">Energy/yr</span><span class="cstat-val">${c.energy}</span></div>
        <div class="cstat"><span class="cstat-label">Water/yr</span><span class="cstat-val">${c.water}</span></div>
        <div class="cstat"><span class="cstat-label">Daily Queries</span><span class="cstat-val">${c.queries}</span></div>
        <div class="cstat"><span class="cstat-label">CO₂/yr</span><span class="cstat-val">${c.carbon}</span></div>
        <div class="cstat"><span class="cstat-label">Compute</span><span class="cstat-val">${c.compute}</span></div>
        <div class="cstat"><span class="cstat-label">Carbon Intensity</span><span class="cstat-val">${c.intensity}</span></div>
      </div>
    </div>`).join('');
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildTimeline();
  buildStakeholders();
  buildRiskFactors();
  buildCommunityGrid();
  buildThresholds();
  buildCompanyCards();
});
