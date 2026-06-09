// ─────────────────────────────────────────────────────────
// charts.js — WattsOwed
// All canvas chart renderers
// ─────────────────────────────────────────────────────────

const C = {
  amber:'#f5a623', amberLo:'rgba(245,166,35,0.2)',
  red:'#f06060',   redLo:'rgba(240,96,96,0.2)',
  green:'#34d399', greenLo:'rgba(52,211,153,0.2)',
  blue:'#4b8cf7',  blueLo:'rgba(75,140,247,0.18)',
  neutral:'#384557', bg:'#151a27', border:'#1d2538', text:'#6e8099',
  mono:'JetBrains Mono, monospace',
};

function sizeCanvas(cv) {
  const w = cv.parentElement.clientWidth || 400;
  const h = parseInt(cv.getAttribute('height')) || 160;
  cv.width = w; cv.height = h;
  return { W: w, H: h };
}

function drawGrid(ctx, pad, cW, cH, steps, max, min=0, fmt=v=>v) {
  steps.forEach(v => {
    const y = pad.t + cH - ((v-min)/(max-min))*cH;
    ctx.strokeStyle=C.border; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
    ctx.fillStyle=C.text; ctx.font=`9px ${C.mono}`; ctx.textAlign='right';
    ctx.fillText(fmt(v), pad.l-5, y+3);
  });
}

// ── PEAK LOAD BAR CHART ───────────────────────────────────
function drawLoadChart() {
  const el = document.getElementById('loadChart');
  if (!el) return;
  const data = [
    { label:'Summer 2019',   val:19430, max:27000 },
    { label:'Summer 2022',   val:21900, max:27000 },
    { label:'Summer 2024',   val:23200, max:27000 },
    { label:'Summer 2025',   val:23905, max:27000 },
    { label:'Winter 2019–20',val:17525, max:27000 },
    { label:'Winter 2023–24',val:22100, max:27000 },
    { label:'Winter 2025–26',val:25413, max:27000 },
  ];
  el.innerHTML = data.map((d,i) => {
    const pct = (d.val/d.max*100).toFixed(1);
    const col = d.val>=23000?C.red:d.val>=20000?C.amber:C.green;
    return `<div class="bar-row">
      <div class="bar-label">${d.label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col};animation-delay:${i*0.07}s">${d.val.toLocaleString()} MW</div></div>
      <div class="bar-val" style="color:${col}">${pct}%</div>
    </div>`;
  }).join('');
}

// ── DONUT ─────────────────────────────────────────────────
function drawDonut() {
  const cv = document.getElementById('donutCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const segs = [
    { label:'Natural Gas',       pct:40, color:'#c45c3a' },
    { label:'Solar/Wind/Storage',pct:20, color:C.amber   },
    { label:'Nuclear',           pct:13, color:C.green   },
    { label:'Coal',              pct:10, color:C.neutral },
    { label:'Biomass/Hydro',     pct: 9, color:'#5a7090' },
    { label:'Market Purchases',  pct: 8, color:C.red     },
  ];
  const x=70,y=70,r=62,inner=40; let s=-Math.PI/2;
  segs.forEach(seg => {
    const a=(seg.pct/100)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(x,y);
    ctx.arc(x,y,r,s,s+a); ctx.arc(x,y,inner,s+a,s,true);
    ctx.closePath(); ctx.fillStyle=seg.color; ctx.fill();
    s+=a+0.01;
  });
  const lg=document.getElementById('donutLegend');
  if(lg) lg.innerHTML=segs.map(s=>`<div class="legend-row"><div class="legend-swatch" style="background:${s.color}"></div>${s.label}<span>${s.pct}%</span></div>`).join('');
}

// ── AUCTION LINE ──────────────────────────────────────────
function drawAuctionChart() {
  const cv=document.getElementById('auctionChart'); if(!cv) return;
  const {W,H}=sizeCanvas(cv); const ctx=cv.getContext('2d');
  const data=[{y:'2022–23',v:1.2},{y:'2023–24',v:1.6},{y:'2024–25',v:2.2},{y:'2025–26',v:14.7},{y:'2026–27',v:17.9}];
  const pad={t:20,r:24,b:30,l:46}, cW=W-pad.l-pad.r, cH=H-pad.t-pad.b, mx=22;
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,pad,cW,cH,[0,5,10,15,20],mx,0,v=>`$${v}B`);
  const toX=i=>pad.l+(i/(data.length-1))*cW;
  const toY=v=>pad.t+cH-(v/mx)*cH;
  const gr=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  gr.addColorStop(0,'rgba(240,96,96,0.25)'); gr.addColorStop(1,'rgba(240,96,96,0.01)');
  ctx.beginPath();
  data.forEach((d,i)=>i===0?ctx.moveTo(toX(i),toY(d.v)):ctx.lineTo(toX(i),toY(d.v)));
  ctx.lineTo(toX(data.length-1),pad.t+cH); ctx.lineTo(toX(0),pad.t+cH); ctx.closePath();
  ctx.fillStyle=gr; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle=C.red; ctx.lineWidth=2;
  data.forEach((d,i)=>i===0?ctx.moveTo(toX(i),toY(d.v)):ctx.lineTo(toX(i),toY(d.v)));
  ctx.stroke();
  data.forEach((d,i)=>{
    const x=toX(i),y=toY(d.v);
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle=d.v>=10?C.red:C.amber; ctx.fill();
    ctx.fillStyle=d.v>=10?C.red:C.text;
    ctx.font=`${d.v>=10?'bold ':''}9px ${C.mono}`;
    ctx.textAlign='center'; ctx.fillText(`$${d.v}B`,x,y-10);
    ctx.fillStyle=C.text; ctx.font=`8px ${C.mono}`;
    ctx.fillText(d.y,x,pad.t+cH+18);
  });
}

// ── GAUGE ─────────────────────────────────────────────────
function drawGauge() {
  const cv=document.getElementById('gaugeCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d');
  const cx=130,cy=125,r=95,inner=62;
  [{color:'#1a4a35',s:Math.PI,e:Math.PI*1.25,l:'Low'},
   {color:'#4a3a10',s:Math.PI*1.25,e:Math.PI*1.5,l:'Mod'},
   {color:'#5a2a10',s:Math.PI*1.5,e:Math.PI*1.75,l:'High'},
   {color:'#4a1010',s:Math.PI*1.75,e:Math.PI*2,l:'Crit'}
  ].forEach(seg=>{
    ctx.beginPath(); ctx.arc(cx,cy,r,seg.s,seg.e);
    ctx.arc(cx,cy,inner,seg.e,seg.s,true); ctx.closePath();
    ctx.fillStyle=seg.color; ctx.fill();
    const mid=(seg.s+seg.e)/2;
    ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.font=`bold 8px ${C.mono}`; ctx.textAlign='center';
    ctx.fillText(seg.l,cx+Math.cos(mid)*80,cy+Math.sin(mid)*80+3);
  });
  const na=Math.PI*1.64;
  ctx.save(); ctx.shadowColor='rgba(255,255,255,0.2)'; ctx.shadowBlur=4;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(na)*85,cy+Math.sin(na)*85);
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=2.5; ctx.stroke(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fill();
}

// ── FORECAST ──────────────────────────────────────────────
function drawForecastChart() {
  const cv=document.getElementById('forecastChart'); if(!cv) return;
  const {W,H}=sizeCanvas(cv); const ctx=cv.getContext('2d');
  const pts=[
    {y:'2019',v:19430,a:true},{y:'2020',v:18900,a:true},{y:'2021',v:20100,a:true},
    {y:'2022',v:21900,a:true},{y:'2023',v:22500,a:true},{y:'2024',v:23200,a:true},
    {y:'2025',v:23905,a:true},{y:'2026',v:25150,a:false},{y:'2027',v:26508,a:false},
    {y:'2028',v:27919,a:false},{y:'2029',v:29386,a:false},{y:'2030',v:30913,a:false},
  ];
  const pad={t:18,r:20,b:28,l:58}, cW=W-pad.l-pad.r, cH=H-pad.t-pad.b, mx=35000,mn=16000;
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,pad,cW,cH,[16000,20000,24000,28000,32000],mx,mn,v=>(v/1000).toFixed(0)+'k');
  const toY=v=>pad.t+cH-((v-mn)/(mx-mn))*cH;
  const toX=i=>pad.l+(i/(pts.length-1))*cW;
  ctx.fillStyle='rgba(245,166,35,0.03)';
  ctx.fillRect(toX(7),pad.t,toX(pts.length-1)-toX(7),cH);
  ctx.strokeStyle='rgba(245,166,35,0.2)'; ctx.lineWidth=1; ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(toX(7),pad.t); ctx.lineTo(toX(7),pad.t+cH); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgba(245,166,35,0.35)'; ctx.font=`7px ${C.mono}`; ctx.textAlign='center';
  ctx.fillText('PROJECTED →',toX(9.5),pad.t+11);
  const ga=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  ga.addColorStop(0,'rgba(52,211,153,0.2)'); ga.addColorStop(1,'rgba(52,211,153,0.01)');
  ctx.beginPath();
  pts.filter(p=>p.a).forEach((p,i)=>i===0?ctx.moveTo(toX(i),toY(p.v)):ctx.lineTo(toX(i),toY(p.v)));
  ctx.lineTo(toX(6),pad.t+cH); ctx.lineTo(toX(0),pad.t+cH); ctx.closePath();
  ctx.fillStyle=ga; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle=C.green; ctx.lineWidth=2;
  pts.filter(p=>p.a).forEach((p,i)=>i===0?ctx.moveTo(toX(i),toY(p.v)):ctx.lineTo(toX(i),toY(p.v)));
  ctx.stroke();
  ctx.beginPath(); ctx.strokeStyle=C.amber; ctx.lineWidth=2; ctx.setLineDash([5,4]);
  pts.slice(6).forEach((p,i)=>i===0?ctx.moveTo(toX(i+6),toY(p.v)):ctx.lineTo(toX(i+6),toY(p.v)));
  ctx.stroke(); ctx.setLineDash([]);
  pts.forEach((p,i)=>{
    ctx.beginPath(); ctx.arc(toX(i),toY(p.v),3,0,Math.PI*2);
    ctx.fillStyle=p.a?C.green:C.amber; ctx.fill();
    ctx.fillStyle=C.text; ctx.font=`8px ${C.mono}`; ctx.textAlign='center';
    ctx.fillText(p.y,toX(i),pad.t+cH+18);
  });
}

// ── MW DRAW ───────────────────────────────────────────────
function drawMWDraw() {
  const cv=document.getElementById('drawChart'); if(!cv) return;
  const {W,H}=sizeCanvas(cv); const ctx=cv.getContext('2d');
  const years=[2015,2017,2019,2021,2022,2023,2024,2025,2026];
  const vals=[800,1100,1600,2100,2400,2700,2850,2900,3100];
  const pad={t:15,r:18,b:28,l:52}, cW=W-pad.l-pad.r, cH=H-pad.t-pad.b, mx=3600;
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,pad,cW,cH,[0,1000,2000,3000],mx,0,v=>v+' MW');
  const toY=v=>pad.t+cH-(v/mx)*cH;
  const toX=i=>pad.l+(i/(years.length-1))*cW;
  const gr=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  gr.addColorStop(0,'rgba(245,166,35,0.25)'); gr.addColorStop(1,'rgba(245,166,35,0.01)');
  ctx.beginPath();
  vals.forEach((v,i)=>i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)));
  ctx.lineTo(toX(vals.length-1),pad.t+cH); ctx.lineTo(toX(0),pad.t+cH); ctx.closePath();
  ctx.fillStyle=gr; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle=C.amber; ctx.lineWidth=2;
  vals.forEach((v,i)=>i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)));
  ctx.stroke();
  years.forEach((y,i)=>{ctx.fillStyle=C.text;ctx.font=`8px ${C.mono}`;ctx.textAlign='center';ctx.fillText(y,toX(i),pad.t+cH+18);});
}

// ── TREND CHART ───────────────────────────────────────────
const TREND_DATA = {
  energy: {
    labels:['2018','2019','2020','2021','2022','2023','2024','2025','2026e'],
    vals:  [200,   250,   280,   350,   450,   600,   800,   1000,  1200],
    color: C.amber, unit:'TWh', label:'Global AI Energy (TWh)'
  },
  water: {
    labels:['2018','2019','2020','2021','2022','2023','2024','2025','2026e'],
    vals:  [5,    8,    11,   16,   24,   38,   57,   80,   105],
    color: C.blue, unit:'B L', label:'Global AI Water Use (Billion Liters)'
  },
  datacenters: {
    labels:['2018','2019','2020','2021','2022','2023','2024','2025','2026e'],
    vals:  [7.5,  8.2,  9.0,  10.5, 12.1, 14.8, 18.3, 23.0, 29.0],
    color: C.green, unit:'GW', label:'Global Data Center Capacity (GW)'
  },
};

function drawTrendChart(name='energy') {
  const cv=document.getElementById('trend-canvas'); if(!cv) return;
  const {W,H}=sizeCanvas(cv); const ctx=cv.getContext('2d');
  const d=TREND_DATA[name];
  if(!d) return;
  const pad={t:20,r:30,b:35,l:58}, cW=W-pad.l-pad.r, cH=H-pad.t-pad.b;
  const mx=Math.max(...d.vals)*1.1, mn=0;
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  const steps=4;
  for(let i=0;i<=steps;i++){
    const v=mn+(mx-mn)*(i/steps);
    const y=pad.t+cH-((v-mn)/(mx-mn))*cH;
    ctx.strokeStyle=C.border; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
    ctx.fillStyle=C.text; ctx.font=`8px ${C.mono}`; ctx.textAlign='right';
    const lab=v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(0);
    ctx.fillText(lab,pad.l-5,y+3);
  }
  const toX=i=>pad.l+(i/(d.labels.length-1))*cW;
  const toY=v=>pad.t+cH-((v-mn)/(mx-mn))*cH;
  const gr=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  gr.addColorStop(0,d.color.replace(')',',0.25)').replace('rgb','rgba'));
  gr.addColorStop(1,d.color.replace(')',',0.01)').replace('rgb','rgba'));
  // fallback gradient approach
  const hexToRgba=(h,a)=>{const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;};
  const gr2=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  gr2.addColorStop(0,hexToRgba(d.color,0.25)); gr2.addColorStop(1,hexToRgba(d.color,0.01));
  ctx.beginPath();
  d.vals.forEach((v,i)=>i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)));
  ctx.lineTo(toX(d.vals.length-1),pad.t+cH); ctx.lineTo(toX(0),pad.t+cH); ctx.closePath();
  ctx.fillStyle=gr2; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle=d.color; ctx.lineWidth=2.5;
  d.vals.forEach((v,i)=>i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)));
  ctx.stroke();
  d.vals.forEach((v,i)=>{
    ctx.beginPath(); ctx.arc(toX(i),toY(v),4,0,Math.PI*2);
    ctx.fillStyle=d.color; ctx.fill();
    ctx.fillStyle=C.text; ctx.font=`8px ${C.mono}`; ctx.textAlign='center';
    ctx.fillText(d.labels[i],toX(i),pad.t+cH+22);
  });
}

// ── EIA LINE CHART ────────────────────────────────────────
function drawEIAChart(data) {
  const cv=document.getElementById('eiaLineChart'); if(!cv) return;
  const {W,H}=sizeCanvas(cv); const ctx=cv.getContext('2d');
  const vals=data.map(d=>parseFloat(d.sales));
  const pad={t:12,r:16,b:28,l:56}, cW=W-pad.l-pad.r, cH=H-pad.t-pad.b;
  const mx=Math.max(...vals)*1.05, mn=Math.min(...vals)*0.95;
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  [0,0.33,0.66,1].forEach(t=>{
    const v=mn+(mx-mn)*t, y=pad.t+cH-((v-mn)/(mx-mn))*cH;
    ctx.strokeStyle=C.border; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
    ctx.fillStyle=C.text; ctx.font=`7px ${C.mono}`; ctx.textAlign='right';
    ctx.fillText((v/1000).toFixed(0)+'k',pad.l-4,y+3);
  });
  const toY=v=>pad.t+cH-((v-mn)/(mx-mn))*cH;
  const toX=i=>pad.l+(i/(data.length-1))*cW;
  const gr=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  gr.addColorStop(0,'rgba(245,166,35,0.22)'); gr.addColorStop(1,'rgba(245,166,35,0.01)');
  ctx.beginPath();
  data.forEach((d,i)=>i===0?ctx.moveTo(toX(i),toY(vals[i])):ctx.lineTo(toX(i),toY(vals[i])));
  ctx.lineTo(toX(data.length-1),pad.t+cH); ctx.lineTo(toX(0),pad.t+cH); ctx.closePath();
  ctx.fillStyle=gr; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle=C.amber; ctx.lineWidth=1.5;
  data.forEach((d,i)=>i===0?ctx.moveTo(toX(i),toY(vals[i])):ctx.lineTo(toX(i),toY(vals[i])));
  ctx.stroke();
  data.forEach((d,i)=>{
    if(i%3===0){ctx.fillStyle=C.text;ctx.font=`7px ${C.mono}`;ctx.textAlign='center';ctx.fillText(d.period?.slice(0,7)||'',toX(i),pad.t+cH+18);}
  });
}

function drawEIAFallback() {
  const fake=Array.from({length:18},(_,i)=>({sales:12000000+i*220000+Math.sin(i*0.7)*700000,period:new Date(2024,i+1,1).toISOString().slice(0,7)}));
  drawEIAChart(fake);
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  drawLoadChart();
  drawDonut();
  drawAuctionChart();
  drawGauge();
  drawForecastChart();
  drawMWDraw();
  drawEIAFallback();
  drawTrendChart('energy');
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawAuctionChart(); drawForecastChart(); drawMWDraw(); drawTrendChart(window._activeTrend||'energy');
  }, 150);
});
