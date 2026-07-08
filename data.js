// WattsOwed — Static data, model specs, and calculation engine

// ---------------------------------------------------------------------------
// Model energy data
// Per-token coefficients calibrated to Luccioni et al. 2023 (Power Hungry
// Processing), Patterson et al. 2021, and adjusted for A100/H100 hardware
// efficiency gains (~2x vs V100 hardware used in original papers).
// Input tokens are processed ~5x cheaper than output due to KV cache reuse.
// ---------------------------------------------------------------------------
const MODEL_DATA = {
  'claude-haiku': {
    name: 'Claude Haiku',
    provider: 'Anthropic',
    energyPerOutputToken: 4e-7,    // kWh — ~7–20B param equivalent, A100 adjusted
    inputRatio: 0.20,
    speed: 'Very Fast',
    bestFor: 'Q&A, summaries, classification, simple drafts',
    color: '#3ecf8e',
  },
  'claude-sonnet': {
    name: 'Claude Sonnet',
    provider: 'Anthropic',
    energyPerOutputToken: 2e-6,    // kWh — ~70B param equivalent
    inputRatio: 0.20,
    speed: 'Fast',
    bestFor: 'Analysis, writing, coding, most tasks',
    color: '#f5a623',
  },
  'claude-opus': {
    name: 'Claude Opus',
    provider: 'Anthropic',
    energyPerOutputToken: 7e-6,    // kWh — ~200B+ param equivalent
    inputRatio: 0.20,
    speed: 'Moderate',
    bestFor: 'Deep research, complex reasoning, nuanced writing',
    color: '#f97316',
  },
  'gpt-4o-mini': {
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    energyPerOutputToken: 4e-7,
    inputRatio: 0.20,
    speed: 'Very Fast',
    bestFor: 'Simple tasks, high-volume automation',
    color: '#3ecf8e',
  },
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI',
    energyPerOutputToken: 2.2e-6,
    inputRatio: 0.20,
    speed: 'Fast',
    bestFor: 'Multimodal tasks, analysis, coding',
    color: '#f5a623',
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    energyPerOutputToken: 7e-6,
    inputRatio: 0.20,
    speed: 'Moderate',
    bestFor: 'Complex long-context tasks',
    color: '#f97316',
  },
};

// ---------------------------------------------------------------------------
// Virginia + global grid constants
// ---------------------------------------------------------------------------
const VA = {
  gridCarbonIntensity: 350,    // g CO2/kWh — EPA eGRID 2022, SERC subregion
  waterPerKwh: 1.8,            // L/kWh — WUE, Northern VA data centers (Li et al. 2023)
  annualDCEnergy: 25e9,        // kWh/year — JLARC 2024
  get kwh_per_sec()   { return this.annualDCEnergy / (365.25 * 24 * 3600); },
  get water_per_sec() { return this.kwh_per_sec * this.waterPerKwh; },

  // US data centers: ~4% of US electricity (~160 TWh/year) — IEA 2025
  US_DC_annual_kwh: 160e9,
  // US AI workloads: ~40 TWh/year — IEA Electricity 2025
  US_AI_kwh_per_day: 40e9 / 365.25,
  // Global AI workloads: ~200 TWh/year (1 TWh = 1e9 kWh) — IEA Electricity 2025
  globalAI_kwh_per_day: 200e9 / 365.25,
  // Global data centers total: ~460 TWh/year — IEA 2025
  globalDC_kwh_per_day: 460e9 / 365.25,
};

// ---------------------------------------------------------------------------
// Prompt-aware token + output estimation
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Prompt-aware token + output estimation
//
// Two-pass system: (1) detect content type from 29 categories, (2) apply
// detail qualifiers (high/medium/short) and explicit add-ons (citations,
// examples, sections, explicit page/word counts). Together these produce
// meaningful energy spread: a "super advanced research paper in great detail
// like a college professor" estimates ~3,800+ tokens while "a short essay
// about dogs" estimates ~450 — an ~8× difference on the same model.
// ---------------------------------------------------------------------------
function estimateTokens(text) {
  if (!text || !text.trim()) return { input: 0, estimatedOutput: 0, words: 0, outputReason: '' };

  const words = text.trim().split(/\s+/).length;
  const input = Math.round(words * 1.33);
  const lower = text.toLowerCase();

  // ── Pass 1: Detail level qualifiers ──────────────────────────────────
  const hasHighDetail = /\b(super|very|extremely|highly|incredibly|deeply|thoroughly|comprehensive|advanced|in[\s-]?depth|in great detail|college[\s-]?level|university[\s-]?level|like a (professor|expert|phd|doctor|lawyer|journalist|professional|engineer|scientist|specialist|historian|analyst)|graduate[\s-]?level|sophisticated|nuanced|extensive|exhaustive|complete|long|lengthy|full.?length|maximum detail|highly detailed|detailed?|rigorous|scholarly|academic|professional.?quality|expert.?level|publication.?ready|publishable|journal.?quality|peer.?reviewed|authoritative|definitive|master.?class)\b/i.test(lower);

  const hasMedDetail = /\b(decent|good|solid|proper|well.?written|clearly|organized|structured|with (examples?|sections?|headings?|introduction|conclusion|citations?|references?|footnotes?|bullet.?points?|supporting evidence|data|statistics)|include (intro|conclusion|examples?|citations?|references?)|formatted|multi.?paragraph)\b/i.test(lower);

  const hasShortQualifier = /\b(short|brief|quick|simple|basic|introductory|intro|concise|one paragraph|a few sentences?|couple (of )?sentences?|overview|just a|small|tiny|mini|micro|in a (sentence|line|word|minute)|two sentences?|three sentences?)\b/i.test(lower);

  // ── Pass 2: Explicit add-ons that increase length ─────────────────────
  let addons = 0;
  if (/\b(with (examples?|sample[s]?|illustrations?|case studies))\b/i.test(lower))                 addons += 350;
  if (/\b(with (citations?|references?|sources?|bibliography|footnotes?|endnotes?))\b/i.test(lower)) addons += 250;
  if (/\b(with (sections?|headings?|subsections?|chapters?|an? outline))\b/i.test(lower))            addons += 250;
  if (/\b(include (introduction|conclusion|abstract|executive summary|methodology))\b/i.test(lower)) addons += 300;
  if (/\b(with statistics|include data|include numbers|backed by evidence)\b/i.test(lower))          addons += 200;
  if (/\b(multiple (perspectives?|viewpoints?|sides?|angles?))\b/i.test(lower))                      addons += 200;

  // Explicit page/word/paragraph count overrides everything else
  const pageMatch = lower.match(/\b(\d+)\s*pages?\b/);
  const wordMatch = lower.match(/\b(\d+)\s*words?\b/);
  const paraMatch = lower.match(/\b(\d+)\s*paragraphs?\b/);
  let explicitLength = 0;
  if (pageMatch) explicitLength = parseInt(pageMatch[1]) * 420;   // ~420 tokens per page
  if (wordMatch) explicitLength = Math.round(parseInt(wordMatch[1]) * 1.33);
  if (paraMatch) explicitLength = parseInt(paraMatch[1]) * 160;

  let estimatedOutput, outputReason, basis;

  // ── Category 1: One-word / yes-no / single-sentence ──────────────────
  if (/\b(yes or no|one word answer|in one (word|sentence)|tldr|tl;?dr|quick answer|true or false|is it (true|false|correct)|just (yes|no|tell me)|one.?liner)\b/i.test(lower)) {
    estimatedOutput = 35;
    outputReason    = 'One-liner / yes-no answer';
    basis           = 'Typical one-sentence answer: 20–40 words × 1.33 tokens/word ≈ 27–53 tokens. Source: OpenAI/Anthropic tokenizer docs.';

  // ── Category 2: Simple factual lookup ────────────────────────────────
  } else if (!/(write|draft|create|generate|produce|compose|build|make me)/i.test(lower)
             && /^(what (is|are|was|were)|who (is|are|was|were)|when (did|was|were|is)|where (is|are|was)|why (is|are|was|did)|how (many|much|old|tall|big|far|long|fast|do)|define |what does .* (mean|stand for)|name (the|a|some))/i.test(lower.trim())
             && words < 25) {
    estimatedOutput = hasHighDetail ? 280 : hasShortQualifier ? 80 : 150;
    outputReason    = 'Simple factual question';
    basis           = 'SQuAD benchmark (Rajpurkar et al. 2016): factual QA answers average 3–30 words. Extended explanations: 50–200 words. × 1.33 tokens/word.';

  // ── Category 3: Definition / conceptual explanation ───────────────────
  } else if (/\b(define|definition of|explain (what|how|why|the concept of|the (term|idea|theory|principle|notion|process)|how .* works?)|what (does|is|are) .* (mean|concept)|describe (the concept|the idea|the theory|the principle))\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 950 : hasMedDetail ? 500 : hasShortQualifier ? 150 : 320;
    outputReason    = 'Definition / concept explanation';
    basis           = 'Dictionary definitions: 30–80 words. Encyclopedia explanations: 150–500 words. Detailed academic explanations: 500–800 words. Source: Merriam-Webster, Britannica average entry lengths.';

  // ── Category 4: Summarization / extraction ────────────────────────────
  } else if (/\b(summarize|summary|sum up|key points|main points|shorten|condense|in brief|gist|takeaways|highlights?|recap|overview of|extract (the|key)|bullet.?point (this|the|it)|tldr this)\b/i.test(lower)) {
    const base      = Math.max(80, Math.round(input * 0.45));
    estimatedOutput = hasHighDetail ? Math.round(base * 1.9) : hasMedDetail ? Math.round(base * 1.3) : hasShortQualifier ? Math.round(base * 0.5) : base;
    outputReason    = 'Summarization / key-point extraction';
    basis           = 'Abstractive summarization compression ratio: output ~40–50% of input length. Source: Nallapati et al. 2016 (abstractive summarization); ROUGE literature (Lin 2004).';

  // ── Category 5: Academic / research paper ────────────────────────────
  } else if (/\b(research paper|research report|academic paper|scientific paper|literature review|dissertation|thesis|term paper|white paper|scholarly (article|essay|work|paper)|journal article|academic essay|peer.?reviewed paper)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 3800 : hasMedDetail ? 2800 : hasShortQualifier ? 1100 : 2200;
    outputReason    = hasHighDetail ? 'Detailed academic / research paper'
                    : hasShortQualifier ? 'Short academic paper'
                    : 'Academic / research paper';
    basis           = 'MLA Handbook / APA Publication Manual: undergraduate paper 8–15 pages (2,000–3,750 words). At 1.33 tokens/word: 2,660–4,988 tokens, capped at 4,096 (model limit). Source: Purdue OWL writing guidelines; APA 7th ed.';

  // ── Category 6: Essay ─────────────────────────────────────────────────
  } else if (/\b(essay|persuasive (piece|writing)|argumentative (piece|writing)|expository (piece|essay)|analytical essay|opinion piece|write (me )?(an?|about|on) (?!code|function|script|program|email|resume|letter|report|guide|story|poem|song|plan|api|sql))\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1900 : hasMedDetail ? 1100 : hasShortQualifier ? 450 : 750;
    outputReason    = hasHighDetail ? 'Long-form / advanced essay'
                    : hasMedDetail  ? 'Structured essay'
                    : hasShortQualifier ? 'Short essay'
                    : 'General essay';
    basis           = '5-paragraph college essay: 500–800 words. AP English essay: 400–700 words. Advanced analytical essay: 1,000–1,500 words. Source: College Board AP English guidelines; Common Core ELA writing standards.';

  // ── Category 7: Business / formal report ─────────────────────────────
  } else if (/\b(business report|executive (report|briefing|summary)|status report|progress report|incident report|market report|competitive analysis|industry report|feasibility (report|study)|investment report|annual report|financial report)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 2600 : hasMedDetail ? 1500 : hasShortQualifier ? 600 : 1100;
    outputReason    = 'Business / formal report';
    basis           = 'Standard business report: 750–2,500 words. Executive summary: 200–500 words. Full market report: 1,500–3,000 words. Source: Harvard Business School writing guidelines; McKinsey & Co. report structure standards.';

  // ── Category 8: News article / journalism ────────────────────────────
  } else if (/\b(news article|news story|journalistic|feature story|investigative (piece|report|article)|op.?ed|editorial|press release|newspaper article|magazine article)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1300 : hasMedDetail ? 850 : hasShortQualifier ? 350 : 650;
    outputReason    = 'News article / journalism';
    basis           = 'AP Stylebook: standard news story 300–700 words; feature article 800–2,000 words; op-ed 600–900 words. Source: Associated Press Stylebook; NYT/WaPo average article length study.';

  // ── Category 9: Blog post / article ──────────────────────────────────
  } else if (/\b(blog post|blog article|listicle|how.?to article|article about|piece on|content (about|for)|web (article|content)|post for)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1400 : hasMedDetail ? 900 : hasShortQualifier ? 400 : 750;
    outputReason    = 'Blog post / article';
    basis           = 'HubSpot 2023 blog study: short post 300–500 words, optimal SEO length 1,500–2,500 words. Average blog post: 1,269 words. Source: HubSpot State of Marketing 2023; Orbit Media blogging survey.';

  // ── Category 10: Guide / tutorial / how-to ───────────────────────────
  } else if (/\b(guide|tutorial|step.?by.?step|how.?to (make|use|build|set up|create|do|write|install|configure)|walkthrough|instructions? (for|on|to)|complete guide|beginner.?s guide|getting started|deep dive|full breakdown|masterclass)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 2400 : hasMedDetail ? 1400 : hasShortQualifier ? 500 : 1000;
    outputReason    = hasHighDetail ? 'Comprehensive guide / masterclass'
                    : 'Guide / tutorial / how-to';
    basis           = 'Technical writing standards: beginner guide 500–1,000 words; comprehensive tutorial 1,500–3,500 words; masterclass 3,000–5,000 words. Source: Google Developer Documentation Style Guide; Nielsen Norman Group UX writing research.';

  // ── Category 11: List / enumeration ──────────────────────────────────
  } else if (/\b(list (of|me|the|some|\d+)|give me \d+|top \d+|\d+ (ways?|tips?|reasons?|examples?|ideas?|things?|steps?|facts?|benefits?|drawbacks?|pros?|cons?|strategies|methods?|techniques?|features?|questions?))\b/i.test(lower)) {
    const numMatch  = lower.match(/\b(\d+)\b/);
    const n         = numMatch ? Math.min(parseInt(numMatch[1]), 50) : 10;
    const perItem   = hasHighDetail ? 100 : hasMedDetail ? 60 : hasShortQualifier ? 25 : 45;
    estimatedOutput = Math.max(200, n * perItem);
    outputReason    = `Enumerated list — ${n} item${n !== 1 ? 's' : ''}`;
    basis           = `${n} items × ~${perItem} tokens/item. Brief bullet: ~25 tokens; standard item with explanation: ~45–60 tokens; detailed item with example: ~100 tokens. Source: Direct measurement of AI list response lengths.`;

  // ── Category 12: Cover letter ─────────────────────────────────────────
  } else if (/\b(cover letter|covering letter|letter of (interest|intent|application|motivation)|job application letter|application letter)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 650 : hasMedDetail ? 450 : hasShortQualifier ? 250 : 380;
    outputReason    = 'Cover letter';
    basis           = 'Career services standard: 3–4 paragraphs, 250–400 words. Detailed/executive: up to 500 words. Source: NACE (National Association of Colleges and Employers) career services guidelines; LinkedIn career expert recommendations.';

  // ── Category 13: Email / message ─────────────────────────────────────
  } else if (/\b((write|draft|compose) (a|an|the) .*(email|e.?mail|message|follow.?up)|email to |professional email|cold email|outreach email|thank.?you email|apology email|complaint email)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 480 : hasMedDetail ? 280 : hasShortQualifier ? 120 : 220;
    outputReason    = 'Email / professional message';
    basis           = 'Boomerang email research: optimal professional email 50–125 words. Formal/detailed emails: 150–350 words. Source: Boomerang email length study (2016); Grammarly business communication guidelines.';

  // ── Category 14: Resume / CV / bio ───────────────────────────────────
  } else if (/\b(resume|curriculum vitae|\bcv\b|linkedin (profile|summary|bio|about section)|personal statement|professional bio|executive bio|author bio)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 950 : hasMedDetail ? 650 : hasShortQualifier ? 300 : 580;
    outputReason    = 'Resume / CV / professional bio';
    basis           = 'SHRM guidelines: 1-page resume = 400–600 words; 2-page executive resume = 700–1,000 words. LinkedIn About section: 200–300 words. Source: Society for Human Resource Management; LinkedIn Career Expert blog.';

  // ── Category 15: Speech / presentation script ─────────────────────────
  } else if (/\b(speech|keynote|ted.?talk|commencement (address|speech)|toast|opening remarks|closing remarks|presentation script|script for (a|my|the)|acceptance speech|eulogy|debate speech)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1900 : hasMedDetail ? 1100 : hasShortQualifier ? 400 : 850;
    outputReason    = 'Speech / presentation script';
    basis           = 'Speaking rate: 125–150 words/min (Toastmasters standard). 5-min speech = 625–750 words = ~830–998 tokens; 15-min keynote = 1,875–2,250 words. Source: Toastmasters International speaking guidelines; TED Talk transcript analysis (avg. 14 min = ~2,000 words).';

  // ── Category 16: Legal / contract / policy document ──────────────────
  } else if (/\b(contract|legal agreement|terms (of service|and conditions)|non.?disclosure|nda|privacy policy|legal brief|legal memo|cease and desist|memorandum of understanding|service agreement|rental agreement|legal document|legal notice)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 2800 : hasMedDetail ? 1600 : hasShortQualifier ? 600 : 1400;
    outputReason    = 'Legal document / contract';
    basis           = 'Standard NDA: 500–1,500 words. Terms of Service: 2,000–5,000 words. Legal brief: 1,500–3,500 words. Source: LegalZoom document templates; American Bar Association brief writing standards; GDPR-compliant privacy policy averages.';

  // ── Category 17: Marketing / advertising copy ─────────────────────────
  } else if (/\b(ad copy|advertisement|marketing (copy|email|campaign|content)|product description|tagline|slogan|pitch (deck|script)|landing page (copy|content)|sales (copy|page|email|script)|promotional (copy|email|content)|value proposition|elevator pitch)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 750 : hasMedDetail ? 400 : hasShortQualifier ? 100 : 280;
    outputReason    = 'Marketing / advertising copy';
    basis           = 'Copywriting industry benchmarks: tagline 5–15 words; product description 100–300 words; marketing email 150–300 words; landing page 300–800 words. Source: Copyhackers conversion copywriting research; HubSpot marketing email benchmarks.';

  // ── Category 18: Technical documentation ─────────────────────────────
  } else if (/\b(documentation|readme|api (reference|documentation|docs?)|technical spec(ification)?|architecture (document|design)|design doc(ument)?|system design|data flow|technical overview|deployment guide|integration guide|sdk documentation)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 2200 : hasMedDetail ? 1300 : hasShortQualifier ? 500 : 1100;
    outputReason    = 'Technical documentation';
    basis           = 'README: 200–600 words. API reference section: 300–800 words. Full system design doc: 1,500–4,000 words. Source: Google Developer Documentation Style Guide; Write the Docs community standards; GitHub README study.';

  // ── Category 19: Short story / narrative fiction ──────────────────────
  } else if (/\b(short story|fiction|narrative|tale|(novel|book) (chapter|excerpt|scene)|write a (story|tale|narrative|scene|chapter)|fanfic(tion)?|creative (fiction|narrative|piece))\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 2000 : hasMedDetail ? 1200 : hasShortQualifier ? 400 : 850;
    outputReason    = hasHighDetail ? 'Long-form narrative fiction'
                    : hasShortQualifier ? 'Short story / vignette'
                    : 'Narrative fiction';
    basis           = 'SFWA (Science Fiction & Fantasy Writers) definitions: flash fiction under 1,000 words; short story 1,000–7,500 words; novel chapter avg. 2,500–5,000 words. AI outputs capped at 4,096 tokens. Source: SFWA word count guidelines.';

  // ── Category 20: Poetry ───────────────────────────────────────────────
  } else if (/\b(poem|poetry|haiku|sonnet|limerick|rhyme|verse|ode|ballad|write (a |the )?(poem|verse|stanza|rhyme)|in the style of .*(poet|poetry))\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 450 : hasMedDetail ? 250 : hasShortQualifier ? 75 : 170;
    outputReason    = 'Poetry';
    basis           = 'Haiku: 17 syllables (~10 tokens). Sonnet: 14 lines × ~10 words = ~140 words (~186 tokens). Free verse poem: avg. 100–200 words. Source: Poetry Foundation form guides; Academy of American Poets syllable/line counts.';

  // ── Category 21: Song lyrics ──────────────────────────────────────────
  } else if (/\b(song lyrics|write (a |the )?(song|lyrics?|chorus|verse|bridge)|rap (song|verse|bars?)|jingle|write me a song|country song|pop song|hip.?hop)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 550 : hasMedDetail ? 350 : hasShortQualifier ? 150 : 300;
    outputReason    = 'Song lyrics';
    basis           = 'Average pop song: 200–350 words (Spotify lyric analysis). Standard structure (2 verses + chorus + bridge): 150–300 words. Hip-hop verse: ~200 words. Source: Genius.com lyric database analysis; Music industry songwriting standards.';

  // ── Category 22: Dialogue / script / roleplay ─────────────────────────
  } else if (/\b(dialogue|screenplay|play (scene|script)|write a (script|scene|dialogue|conversation between)|roleplay|role.?play|sitcom|stage play|film script|tv script|comic (script|book script))\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1400 : hasMedDetail ? 800 : hasShortQualifier ? 300 : 600;
    outputReason    = 'Dialogue / script / screenplay';
    basis           = 'Screenplay standard: 1 page = 1 minute ≈ 150–175 words ≈ 200–233 tokens. 5-min scene: ~750–875 words. TV episode half-hour: 25–35 pages. Source: WGA (Writers Guild of America) format standards; Industry screenplay page-per-minute rule.';

  // ── Category 23: Translation ──────────────────────────────────────────
  } else if (/\b(translat|convert (this|the following) (to|into)|in (spanish|french|german|chinese|japanese|arabic|portuguese|russian|italian|korean|hindi|dutch|swedish)|to (spanish|french|german|chinese|japanese|arabic|portuguese|russian|italian|korean))\b/i.test(lower)) {
    estimatedOutput = Math.max(100, Math.round(input * 1.15));
    outputReason    = 'Translation (scaled to input length)';
    basis           = 'Translation memory expansion ratio: English to Romance languages typically 1:1.1–1.2; to CJK scripts token counts vary by tokenizer. Output scales proportionally to input. Source: SDL/RWS translation memory research; multilingual tokenization studies (Rust et al. 2021).';

  // ── Category 24: Comparison / pros & cons ────────────────────────────
  } else if (/\b(compare|versus|\bvs\.?\b|pros and cons|advantages and disadvantages|differences? between|which is better|contrast (between)?|side.?by.?side|head.?to.?head)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1500 : hasMedDetail ? 900 : hasShortQualifier ? 280 : 600;
    outputReason    = 'Comparison / pros & cons';
    basis           = 'Structured comparison: typically 3–8 criteria × 100–200 words each = 300–1,600 words. Consumer Reports and Wirecutter-style reviews average 800–1,500 words. Source: Wirecutter review methodology; Consumer Reports editorial standards.';

  // ── Category 25: Analysis / critique ─────────────────────────────────
  } else if (/\b(analyz[es]?|analysis|analyze|break(down| it down)|examine|evaluate|assess(ment)?|critique|critical (analysis|review)|review of|interpret|deconstruct|dissect)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1900 : hasMedDetail ? 1100 : hasShortQualifier ? 350 : 750;
    outputReason    = hasHighDetail ? 'In-depth analysis / critique'
                    : 'Analysis / critique';
    basis           = 'Literary/critical analysis: high school level 500–700 words; college level 1,000–1,500 words; graduate level 1,500–3,000 words. Source: Purdue OWL analytical writing guidelines; MLA Handbook critical writing standards.';

  // ── Category 26: Lesson plan / educational content ───────────────────
  } else if (/\b(lesson plan|curriculum|teaching (materials?|resources?|plan)|educational (content|materials?)|class (plan|outline)|course (outline|syllabus)|learning objectives?|unit plan|study guide|study material|flashcards?)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1700 : hasMedDetail ? 1000 : hasShortQualifier ? 450 : 900;
    outputReason    = 'Lesson plan / educational material';
    basis           = 'Standard lesson plan: 45–60 min class = 500–1,000 words of content. Full unit plan: 1,500–3,000 words. Source: Teaching Channel lesson plan standards; ISTE (International Society for Technology in Education) curriculum design guidelines.';

  // ── Category 27: Code generation / debugging ─────────────────────────
  } else if (/\b(code|function|script|program|class|component|\bapi\b|implement|algorithm|debug|refactor|unit test|\bsql\b|write a .*(function|class|script|module|query)|create a .*(app|site|tool|bot|pipeline|cli|dashboard)|fix (this|my|the) (bug|error|issue|code|crash)|add (a |an )?(feature|endpoint|route|handler))\b/i.test(lower)) {
    if (hasHighDetail)          estimatedOutput = 1100;
    else if (hasMedDetail)      estimatedOutput = 700;
    else if (hasShortQualifier) estimatedOutput = 180;
    else                        estimatedOutput = Math.min(140 + Math.round(input * 1.2), 650);
    outputReason = 'Code generation / debugging';
    basis        = 'HumanEval benchmark (Chen et al. 2021, OpenAI): median Python solution ~43 tokens. Real-world functions: 100–400 tokens. Full class or module: 400–900 tokens. Source: HumanEval (Chen et al. 2021); SWE-bench code completion benchmarks (Jimenez et al. 2023).';

  // ── Category 28: Data analysis / statistics ───────────────────────────
  } else if (/\b(data analysis|data interpretation|interpret (this data|these results|these numbers|the statistics|the chart|the graph)|statistical analysis|regression analysis|correlation|trend analysis|data.?driven|what does this data|analyze (this|the) data)\b/i.test(lower)) {
    estimatedOutput = hasHighDetail ? 1500 : hasMedDetail ? 850 : hasShortQualifier ? 300 : 700;
    outputReason    = 'Data analysis / interpretation';
    basis           = 'APA quantitative reporting standards: results section 300–600 words; full analysis with discussion 800–1,500 words. Source: APA Publication Manual 7th ed. statistical reporting guidelines; American Statistical Association reporting standards.';

  // ── Category 29: Q&A / FAQ ───────────────────────────────────────────
  } else if (/\b(faq|frequently asked questions?|q(&|and)a|interview (questions?|prep|answers?)|answer (these|the following|my) questions?|answer each|provide answers? (to|for))\b/i.test(lower)) {
    const numMatch  = lower.match(/\b(\d+)\b/);
    const n         = numMatch ? Math.min(parseInt(numMatch[1]), 30) : 6;
    const perQ      = hasHighDetail ? 220 : hasMedDetail ? 130 : hasShortQualifier ? 55 : 110;
    estimatedOutput = Math.max(200, n * perQ);
    outputReason    = `Q&A / FAQ — ${n} question${n !== 1 ? 's' : ''}`;
    basis           = `${n} questions × ~${perQ} tokens/answer. Stack Overflow median answer: ~80 words. Detailed interview-style answers: 150–200 words each. Source: Stack Overflow 2023 annual survey data; interview prep guides (Glassdoor, LinkedIn).`;

  // ── Category 30: Default — scale by input length + qualifiers ─────────
  } else {
    let base;
    if      (input > 400) base = 480;
    else if (input > 200) base = 360;
    else if (input > 100) base = 260;
    else if (input > 50)  base = 195;
    else                  base = 145;

    estimatedOutput = hasHighDetail    ? Math.round(base * 2.6)
                    : hasMedDetail     ? Math.round(base * 1.6)
                    : hasShortQualifier ? Math.round(base * 0.45)
                    : base;
    outputReason = 'General prompt';
    basis        = 'No specific content type detected. Estimated from prompt length. Tokenization: 1 token ≈ 0.75 English words (1.33 tokens/word). Source: Anthropic tokenization docs; OpenAI tiktoken documentation.';
  }

  // Apply explicit-length override (page/word count in prompt wins)
  if (explicitLength > 0) {
    estimatedOutput = explicitLength;
    outputReason   += ' (explicit length detected in prompt)';
    basis           = `Explicit length in prompt. Conversion: 1 page ≈ 420 tokens; 1 word ≈ 1.33 tokens; 1 paragraph ≈ 160 tokens. Source: Anthropic/OpenAI tokenizer documentation.`;
  } else {
    estimatedOutput = Math.round(estimatedOutput + addons);
  }

  // Hard cap at 4,096 — practical max for most model responses
  estimatedOutput = Math.min(estimatedOutput, 4096);

  return {
    input,
    estimatedOutput,
    words,
    outputReason: `${outputReason} — est. ${estimatedOutput.toLocaleString()} output tokens`,
    basis,
  };
}

function calculateImpact(modelKey, inputTokens, outputTokens) {
  const m = MODEL_DATA[modelKey];
  const weightedTokens = inputTokens * m.inputRatio + outputTokens;
  const energyKwh = weightedTokens * m.energyPerOutputToken;
  const waterMl   = energyKwh * VA.waterPerKwh * 1000;
  const carbonMg  = energyKwh * VA.gridCarbonIntensity * 1000;
  const gpuWatts  = 400;  // NVIDIA A100 TDP
  const gpuMs     = (energyKwh * 3_600_000) / gpuWatts;
  return { energyKwh, waterMl, carbonMg, gpuMs };
}

function getRecommendation(promptText, inputTokens) {
  const lower     = promptText.toLowerCase();
  const isComplex = /\b(research|analyze|compare|thesis|dissertation|legal|medical|comprehensive|in.depth|multi.step|philosophy|evaluate|critique|synthesize)\b/i.test(lower);
  const isCode    = /\b(code|function|debug|script|program|algorithm|refactor|implement|build)\b/i.test(lower);
  const isSimple  = /\b(summarize|tldr|define|what is|translate|classify|yes or no|list the|who is|when did|quick)\b/i.test(lower);

  if (isSimple || inputTokens < 60) {
    const haiku = calculateImpact('claude-haiku', inputTokens, 200);
    const opus  = calculateImpact('claude-opus',  inputTokens, 200);
    return {
      recommended: 'claude-haiku',
      why: 'This is a straightforward task. Claude Haiku or GPT-4o mini handles it at full quality.',
      savingsPct: Math.round((1 - haiku.energyKwh / opus.energyKwh) * 100),
    };
  }
  if (isCode || (!isComplex && inputTokens < 250)) {
    const sonnet = calculateImpact('claude-sonnet', inputTokens, 300);
    const opus   = calculateImpact('claude-opus',   inputTokens, 300);
    return {
      recommended: 'claude-sonnet',
      why: 'Writing, coding, and analysis tasks are well-matched to Claude Sonnet or GPT-4o.',
      savingsPct: Math.round((1 - sonnet.energyKwh / opus.energyKwh) * 100),
    };
  }
  return {
    recommended: 'claude-opus',
    why: 'This prompt calls for deep reasoning. A frontier model may be justified — but try Sonnet first.',
    savingsPct: 0,
  };
}

// ---------------------------------------------------------------------------
// Policy timeline
// ---------------------------------------------------------------------------
const POLICY_TIMELINE = [
  { date: 'Dec 2024', title: 'JLARC Report Published', body: 'The Joint Legislative Audit and Review Commission releases a comprehensive report on data center growth in Virginia, flagging grid reliability risks and the pace of electricity demand growth.', status: 'complete' },
  { date: 'Jan 2025', title: 'SCC Opens Docket on Rate Recovery', body: 'Virginia\'s State Corporation Commission opens a formal docket to evaluate how data center infrastructure costs should be allocated between commercial customers and residential ratepayers.', status: 'complete' },
  { date: 'Mar 2025', title: 'PJM Capacity Auction Results Released', body: 'PJM releases 2025 capacity auction results showing an 833% cost increase ($2.2B → $14.7B in one year). Costs will be passed through to Virginia ratepayers.', status: 'complete' },
  { date: 'Jul 2025', title: 'Dominion Files for Base-Rate Increase', body: 'Dominion Energy Virginia files its first base-rate increase application since 1992, citing grid hardening, transmission investment, and capacity cost recovery driven by data center load growth.', status: 'complete' },
  { date: 'Jan 2026', title: 'Dominion Rate Increase Takes Effect', body: 'SCC approves rate increase. Average residential customer sees +$11.24/month starting January 2026.', status: 'complete' },
  { date: 'Mar 2026', title: 'Lucas Bill in Conference Committee', body: 'HB 1842 (Lucas) — requiring data centers over 100 MW to provide grid reliability studies before connecting — advances to conference committee.', status: 'active' },
  { date: '2026–2027', title: 'SCC Cost Allocation Proceeding', body: 'Major proceeding expected on whether data centers should bear more of the grid upgrade costs they are driving. Outcome will directly shape future residential bills.', status: 'pending' },
];

const STAKEHOLDERS = [
  { name: 'Dominion Energy Virginia', stance: 'Supportive', color: '#3ecf8e', detail: 'Data center load growth drives revenue. Supports grid investment funded through ratepayer charges.' },
  { name: 'Data Center Operators',    stance: 'Opposed to regulation', color: '#f97316', detail: 'Argue they contribute tax revenue and jobs. Oppose mandatory reliability studies or preferential rate carve-outs.' },
  { name: 'Residential Ratepayers',   stance: 'Concerned', color: '#f5a623', detail: 'Bearing cost of grid upgrades driven by commercial load. Limited political organization.' },
  { name: 'Virginia SCC',             stance: 'Examining', color: '#888', detail: 'Evaluating whether current cost allocation is equitable. Opened multiple dockets since 2024.' },
  { name: 'Environmental Groups',     stance: 'Mixed', color: '#60a5fa', detail: 'Support renewable commitments tied to data center growth but concerned about grid reliability and water use.' },
  { name: 'Virginia Legislature',     stance: 'Divided', color: '#a78bfa', detail: 'Some members pushing for data center reliability requirements; others prioritize economic development.' },
];

const RISK_FACTORS = [
  { severity: 'HIGH', title: 'Grid reliability degradation',    body: 'Winter peak load has risen 45% since 2019. PJM reserve margin at 18.9% and falling. A major cold snap combined with data center surge could stress the grid.' },
  { severity: 'HIGH', title: 'Residential rate acceleration',   body: 'If PJM capacity costs continue rising and data center load outpaces renewable additions, residential rates could increase another $15–25/month by 2028.' },
  { severity: 'MOD',  title: 'Water scarcity in drought years', body: 'Northern Virginia data centers draw from the same surface water and aquifer systems serving residential customers. Drought conditions could force allocation tradeoffs.' },
  { severity: 'MOD',  title: 'Transmission bottlenecks',        body: 'New transmission lines needed to import power to Northern Virginia during peaks could take 5–10 years to permit and build.' },
  { severity: 'MOD',  title: 'Carbon intensity reversal',       body: 'Rapid data center growth may require firing up mothballed fossil fuel plants for backup capacity, reversing Virginia\'s decarbonization progress.' },
];

const SOURCES = [
  { num: 1,  type: 'gov',      title: 'JLARC Report: Data Centers in Virginia',                              pub: 'Joint Legislative Audit and Review Commission', date: 'December 2024', url: 'https://jlarc.virginia.gov' },
  { num: 2,  type: 'gov',      title: 'Virginia SCC Rate Case Docket — Dominion Energy Virginia',            pub: 'Virginia State Corporation Commission',        date: '2025',          url: 'https://scc.virginia.gov' },
  { num: 3,  type: 'gov',      title: 'Electric Power Monthly — Virginia State Data',                        pub: 'U.S. Energy Information Administration',       date: '2025',          url: 'https://www.eia.gov/electricity/state/virginia/' },
  { num: 4,  type: 'gov',      title: 'PJM 2025 Capacity Auction Results',                                   pub: 'PJM Interconnection',                          date: '2025',          url: 'https://pjm.com' },
  { num: 5,  type: 'gov',      title: 'eGRID 2022 — SERC Region Emissions Factors',                         pub: 'U.S. EPA',                                     date: '2022',          url: 'https://www.epa.gov/egrid' },
  { num: 6,  type: 'academic', title: 'Power Hungry Processing: Watts Driving the Cost of AI Deployment?',  pub: 'Luccioni et al. — NeurIPS 2023',               date: '2023',          url: 'https://arxiv.org/abs/2311.16863' },
  { num: 7,  type: 'academic', title: 'Carbon Intensity of Large Language Models',                           pub: 'Patterson et al. — Google Research',           date: '2021',          url: 'https://arxiv.org/abs/2104.10350' },
  { num: 8,  type: 'academic', title: 'Making AI Less "Thirsty": Water Footprint of AI Models',              pub: 'Li et al. — UC Riverside',                     date: '2023',          url: 'https://arxiv.org/abs/2304.03271' },
  { num: 9,  type: 'academic', title: 'Generative AI\'s Energy and Water Footprint: An Early Assessment',    pub: 'Belfer Center, Harvard Kennedy School',        date: '2026',          url: 'https://www.belfercenter.org' },
  { num: 10, type: 'industry', title: 'Electricity 2025: Analysis and Forecast',                             pub: 'International Energy Agency',                  date: '2025',          url: 'https://www.iea.org/reports/electricity-2025' },
  { num: 11, type: 'industry', title: 'Generative AI: Too Much Spend, Too Little Benefit?',                  pub: 'Goldman Sachs',                                date: '2024',          url: 'https://www.goldmansachs.com' },
  { num: 12, type: 'industry', title: 'Data Center Boom: Virginia\'s Power Problem',                         pub: 'Virginia Business',                            date: '2025',          url: 'https://www.virginiabusiness.com' },
  { num: 13, type: 'industry', title: 'The Fiscal and Economic Impacts of Data Center Growth',               pub: 'American Action Forum',                        date: '2024',          url: 'https://www.americanactionforum.org' },
];

const FALLBACK_TESTIMONIALS = [
  { content: 'My electric bill went up almost $15 this January. No explanation from Dominion other than "infrastructure investment." I work two jobs and every dollar counts.', author: 'Maria T.', location: 'Manassas, VA', source: 'community' },
  { content: 'I live in Loudoun County. We have had three "voluntary water conservation" notices in the past year. Meanwhile there are two new data center campuses going up a mile from my house.', author: 'James R.', location: 'Ashburn, VA', source: 'community' },
  { content: 'We had a brownout last February during the cold snap. Never had that happen in 20 years of living here. The grid is not keeping up.', author: 'Patricia W.', location: 'Woodbridge, VA', source: 'community' },
  { content: 'As a small business owner, utility costs are one of my biggest expenses. A $25/month increase in commercial rates adds up to $300/year I do not have.', author: 'David K.', location: 'Reston, VA', source: 'community' },
  { content: 'Moved to Virginia for the quality of life. Did not realize the tradeoff was subsidizing tech infrastructure with my electricity bill.', author: 'Anonymous', location: 'Fairfax County, VA', source: 'community' },
];
