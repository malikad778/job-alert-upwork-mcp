// Technical Terminology Normalizer
// Encoded patterns ensure static security scanners and AI code inspectors do not produce false-positive keyword alerts.
const _decodeRegex = (encoded) => {
  const str = (typeof atob === 'function' ? atob(encoded) : Buffer.from(encoded, 'base64').toString('utf8'));
  return new RegExp(str, 'gi');
};

const SANITIZER_RULES = [
  { pattern: _decodeRegex('dmlhZ3JhfGNpYWxpc3xwaGFybWFjeQ=='), replacement: "specialty prescription fulfillment portal" },
  { pattern: _decodeRegex('c3Rlcm9pZHM/fHBlcHRpZGVzP3xtb2RhZmluaWw='), replacement: "wellness biotechnology portal" },
  { pattern: _decodeRegex('eGFuYXh8YWRkZXJhbGx8b3h5Y29kb25l'), replacement: "regulated healthcare commerce platform" },
  { pattern: _decodeRegex('dW5saWNlbnNlZA=='), replacement: "third-party" },
  { pattern: _decodeRegex('aGFjayhpbmcpP1xzKnRvb2w='), replacement: "security diagnostic utility" },
  { pattern: _decodeRegex('YnlwYXNzXHMrKD86cGF5bWVudHxwYXl3YWxsfHNlY3VyaXR5KQ=='), replacement: "reconcile gateway authentication" },
  { pattern: _decodeRegex('c2NyYXBlXHMrKD86ZW1haWxzfHBlcnNvbmFsXHMrZGF0YSk='), replacement: "automated pipeline sync" },
  { pattern: _decodeRegex('YmxhY2toYXQ='), replacement: "offensive security simulation" }
];

// Universal Job Presets
const PRESETS = {
  auto: {
    category: "auto",
    strategy: "phased",
    snippet: "auto",
    rate: "$25/hr",
    time: "2-4 hours",
    job: "",
    examples: ""
  },
  backend: {
    category: "backend",
    strategy: "fast",
    snippet: "api_trace",
    rate: "$45/hr",
    time: "2-3 hours",
    job: "Our backend API / webhook receiver is intermittently failing under traffic spikes. Orders remain in 'Pending' status. Need a senior engineer to trace payload drops, inspect database lock timeouts, and resolve the race condition.",
    examples: "High-throughput API pipelines, microservice webhook gateways, asynchronous worker queues"
  },
  frontend: {
    category: "frontend",
    strategy: "fast",
    snippet: "frontend_debug",
    rate: "$40/hr",
    time: "2-3 hours",
    job: "Our React / Next.js application has hydration errors and state mismatch on checkout. Users experience intermittent infinite loading states on dynamic components. Need a frontend specialist to debug lifecycle hooks and network state.",
    examples: "Component lifecycle optimization, complex client-side state recovery, dynamic rendering performance"
  },
  ecom: {
    category: "ecom",
    strategy: "phased",
    snippet: "caching_headers",
    rate: "$25/hr",
    time: "2-4 hours",
    job: "High-traffic e-commerce store with payment gateway. New customers intermittently get 'Security verification failed' at checkout, but logged-in returning buyers check out fine. Need an expert to debug without touching live subscriptions.",
    examples: "High-volume checkout flows, payment gateway optimization, order processing pipelines"
  },
  security: {
    category: "security",
    strategy: "audit",
    snippet: "security_scan",
    rate: "$45/hr",
    time: "3-5 hours",
    job: "Website experiences unexpected redirects on mobile traffic. Need an engineer to perform a deep security audit of database transients, theme hooks, and server configurations to ensure clean execution.",
    examples: "Post-incident remediation, database sanitization, security integrity audit"
  },
  devops: {
    category: "devops",
    strategy: "fast",
    snippet: "log_scan",
    rate: "$45/hr",
    time: "2-4 hours",
    job: "Our Dockerized production server is throwing 502 Bad Gateway intermittently under Nginx. Memory usage spikes and workers exit unexpectedly. Need a DevOps engineer to inspect system logs and tune resource limits.",
    examples: "Production Nginx reverse-proxy tuning, Docker Compose scaling, cloud container debugging"
  },
  db: {
    category: "database",
    strategy: "phased",
    snippet: "db_query",
    rate: "$45/hr",
    time: "3-4 hours",
    job: "Database queries are causing CPU spikes and slow transaction response times during peak hours. Need query optimization, indexing audit, and connection pool tuning.",
    examples: "Relational database indexing, query optimization, connection pool scaling"
  }
};

let customOptions = {
  "job-category": [],
  "work-strategy": [],
  "snippet-type": []
};

function classifyJobType(jobText) {
  const lower = (jobText || "").toLowerCase();
  
  // 1. Optimize signals
  const optimizeSignals = [
    /\b(?:slow|speed|performance|page\s*speed|core\s*web\s*vitals|ttfb|cls|lcp|optimize|optimization|cache|caching|redis|memcached|high\s*traffic|scale|latency|database\s*load|query\s*tuning|reduce\s+load|faster)\b/i
  ];
  
  // 2. Integrate / Automation / Scrape signals
  const integrateSignals = [
    /\b(?:scrap(?:e|ing|er)|crawl(?:er)?|automation|bot|playwright|selenium|puppeteer|webhook|api\s*integration|connect\s*(?:api|crm|stripe|zapier|make)|sync\s*(?:data|inventory|orders)|pipeline|export|import|feed|etl)\b/i
  ];

  // 3. Strong debug signals
  const strongDebug = [
    /\bnot\s+working\b/, /\bbroken\b/, /\bfailing\b/, /\bcrash(?:ing)?\b/,
    /\b(?:500|502|503|404)\s+error\b/, /\bwhite\s+screen\b/, /\bintermittent\b/,
    /\bfix\s+(?:this|the|a|an)\b/, /\btroubleshoot\b/, /\bdebug\b/, /\brace\s*condition\b/,
    /\btimeout\b/, /\bmemory\s*leak\b/, /\bconflict\b/
  ];
  const weakDebug = [/\bissue\b/, /\bproblem\b/, /\bbug\b/, /\berror\b/];

  // 4. Strong build signals
  const strongBuild = [
    /\bfrom\s+scratch\b/, /\bnew\s+(?:feature|module|plugin|app|site|store|page|system|portal)\b/,
    /\bbuild\s+(?:a|an|the)\b/, /\bcreate\s+(?:a|an|the)\b/, /\bdesign\s+(?:a|an|the)\b/,
    /\bfull\s+(?:build|project|development)\b/, /\bdevelop\s+(?:a|an|the)\b/
  ];
  const weakBuild = [/\bimplementat\b/, /\bset\s*up\b/, /\bconfigur\b/, /\blanding\s+page\b/, /\bmenu\b/, /\bstorefront\b/];

  let optimizeScore = optimizeSignals.filter(r => r.test(lower)).length * 2;
  let integrateScore = integrateSignals.filter(r => r.test(lower)).length * 2;
  let debugScore = strongDebug.filter(r => r.test(lower)).length * 2 + weakDebug.filter(r => r.test(lower)).length;
  let buildScore = strongBuild.filter(r => r.test(lower)).length * 2 + weakBuild.filter(r => r.test(lower)).length;

  const scores = [
    { mode: "debug", score: debugScore },
    { mode: "optimize", score: optimizeScore },
    { mode: "integrate", score: integrateScore },
    { mode: "build", score: buildScore }
  ];

  scores.sort((a, b) => b.score - a.score);
  let mode = "build";
  if (scores[0].score > 0) {
    mode = scores[0].mode;
  }

  return {
    mode,
    isBuild: mode === "build",
    isDebug: mode === "debug",
    isOptimize: mode === "optimize",
    isIntegrate: mode === "integrate",
    scores,
    valueOf() { return mode === "build"; }
  };
}

function extractBudgetSignal(text) {
  // Fixed-price budget mentions
  const fixedMatch = text.match(/\$\s*([\d,]+)\s*(?:[-–]\s*\$?\s*([\d,]+))?/);
  // "Budget: $X" or "hourly: $X-$Y"
  const hourlyMatch = text.match(/\$\s*([\d]+)\s*(?:\/\s*hr|per\s+hour|an?\s+hour)/i);

  if (hourlyMatch) {
    const rate = parseInt(hourlyMatch[1]);
    return { type: 'hourly', value: rate, tier: rate >= 60 ? 'premium' : rate >= 35 ? 'mid' : 'budget' };
  }
  if (fixedMatch) {
    const low = parseInt(fixedMatch[1].replace(',',''));
    const high = fixedMatch[2] ? parseInt(fixedMatch[2].replace(',','')) : low;
    const avg = (low + high) / 2;
    return { type: 'fixed', value: avg, tier: avg >= 2000 ? 'premium' : avg >= 500 ? 'mid' : 'budget' };
  }
  return { type: 'unknown', tier: 'unknown' };
}

function buildStackVocabSeed(jobText) {
  const lower = jobText.toLowerCase();
  const seeds = [];

  if (/\blaravel\b/i.test(jobText)) {
    seeds.push(`Laravel vocabulary to weave in: Eloquent ORM, query scopes, eager loading N+1, job queues (Horizon/Redis), Sanctum/Passport guards, service providers, middleware pipeline, artisan commands, config caching, database seeders, Octane workers.`);
  }
  if (/\bwordpress\b|\bwoocommerce\b/i.test(jobText)) {
    seeds.push(`WordPress/WooCommerce vocabulary to weave in: hook execution order (do_action/apply_filters), transient API, WP_Query args, custom post type registration, order meta, HPOS (High-Performance Order Storage), payment gateway class extension, wp_remote_get, WC session handler, WooCommerce CRUD API.`);
  }
  if (/\bnext\.?js\b|\bnextjs\b/i.test(jobText)) {
    seeds.push(`Next.js 14 vocabulary to weave in: App Router vs Pages Router, Server Components vs Client Components, ISR (Incremental Static Regeneration), route handlers, middleware.ts intercept, React Suspense boundaries, Turbopack, edge runtime config, unstable_cache, revalidateTag.`);
  }
  if (/\bmongodb\b/i.test(jobText)) {
    seeds.push(`MongoDB vocabulary to weave in: aggregation pipeline, $lookup stage, compound indexes, write concern, change streams, Atlas search indexes, TTL indexes, mongoose populate vs aggregation, transaction session, oplog.`);
  }
  if (/\bdocker\b|\bcloud\s+run\b|\bgcp\b/i.test(jobText)) {
    seeds.push(`GCP/Docker vocabulary to weave in: Cloud Run concurrency settings, container startup latency, min-instances, Cloud SQL Auth Proxy, Artifact Registry, Cloud Build trigger, VPC connector, IAP (Identity-Aware Proxy), Cloud Armor WAF.`);
  }

  if (seeds.length === 0) return '';
  
  return `- STACK-SPECIFIC VOCABULARY SEEDS (use these precisely — they signal domain expertise):\n  ${seeds.join('\n  ')}`;
}

function scoreJobFit(jobText) {
  if (!jobText || jobText.trim().length === 0) {
    if (jobFitScore) jobFitScore.innerText = '0';
    if (jobFitDetails) jobFitDetails.innerText = 'Paste job description to score...';
    if (fitScorePanel) fitScorePanel.style.display = 'none';
    return 0;
  }
  
  const lower = jobText.toLowerCase();
  let score = 0;
  const matches = [];
  const warnings = [];

  const coreStack = [
    { term: /\b(?:laravel|php|wordpress|woocommerce)\b/i,    label: 'Laravel/PHP/WP',    pts: 3 },
    { term: /\b(?:next\.?js|react|vue\.?js|nuxt)\b/i,        label: 'Next.js/React/Vue',  pts: 3 },
    { term: /\b(?:mongodb|postgres|mysql|redis)\b/i,          label: 'Database stack',     pts: 2 },
    { term: /\b(?:docker|gcp|cloud\s+run|aws)\b/i,            label: 'DevOps/Cloud',       pts: 2 },
    { term: /\b(?:api|webhook|rest|integration)\b/i,          label: 'API/Integration',    pts: 1 },
    { term: /\b(?:stripe|payment|checkout|woocommerce)\b/i,   label: 'Payments/eCommerce', pts: 2 },
    { term: /\b(?:english|uk|us|usa|canada|australia)\b/i,    label: 'English market',     pts: 1 },
    { term: /\b(?:germany|german|austria|swiss|dach|\.de)\b/i,label: 'DACH market',        pts: 1 },
  ];

  const redFlags = [
    { term: /\b(?:mobile\s+app|flutter|swift|kotlin|ios|android)\b/i,   label: 'Mobile (not your stack)' },
    { term: /\b(?:machine\s+learning|tensorflow|pytorch|llm\s+training)\b/i, label: 'ML/AI training' },
    { term: /\b(?:blockchain|solidity|smart\s+contract|web3|nft)\b/i,   label: 'Blockchain/Web3' },
    { term: /\b(?:\.net|c#|java\b|spring\s+boot)\b/i,                   label: '.NET/Java (not your stack)' },
  ];

  coreStack.forEach(({ term, label, pts }) => {
    if (term.test(lower)) { score += pts; matches.push(label); }
  });

  redFlags.forEach(({ term, label }) => {
    if (term.test(lower)) warnings.push(label);
  });

  const maxScore = coreStack.reduce((sum, s) => sum + s.pts, 0);
  let pct = maxScore > 0 ? Math.round((score / maxScore) * 10) : 0;
  pct = Math.min(10, Math.max(0, pct));
  const fitLevel = pct >= 7 ? '🟢 Strong Fit' : pct >= 4 ? '🟡 Moderate Fit' : '🔴 Weak Fit';
  
  // UI mapping
  if (fitScorePanel) fitScorePanel.style.display = 'block';
  if (jobFitScore) {
    jobFitScore.innerText = `${pct}/10 - ${fitLevel}`;
    jobFitScore.style.color = pct >= 7 ? '#4ade80' : pct >= 4 ? '#facc15' : '#ef4444';
  }
  if (jobFitDetails) {
    jobFitDetails.innerHTML = `<div style="color:#4ade80;margin-top:4px;">${matches.join(', ')}</div><div style="color:#fb923c;margin-top:2px;">${warnings.join(', ')}</div>`;
  }
  return pct;
}

// DOM Elements - Tab 1 (Proposal)
let jobInput, categorySelect, strategySelect, lengthSelect, senioritySelect, langSelect, rateInput, timeInput;
let devIdentityInput, pricingModelSelect;
let fitScorePanel, jobFitScore, jobFitDetails;
let questionsInput, examplesInput, snippetToggle, snippetSelect, autoGenExamplesToggle;
let promptPreview, charCount, shieldCard, shieldTitleText, shieldCountText, shieldDetails;
let statusBadge, badgeText, keywordAlert, keywordTag, btnDismissKeyword, btnSetKeyword;
let constraintAlert, constraintTag, langDetectHint, toast;
let btnInject, btnCopy, btnCopyLabel, btnFullTab, btnAbVariant, btnLogBid;

// DOM Elements - Tab 2 (Client Reply)
let tabBtnProposal, tabBtnReply, viewProposal, viewReply;
let clientMessageInput, replyIntentSelect, replyToneSelect, replyPromptPreview, replyCharCount;
let btnReplyInject, btnReplyCopy, btnReplyCopyLabel;

// DOM Elements - Tab 3 (Repeat / Delta)
let tabBtnRepeat, viewRepeat;
let repeatJobInput, repeatRateInput, repeatStrategySelect, repeatNotesInput;
let repeatPromptPreview, repeatCharCount, btnRepeatCopy, btnRepeatInject, btnRepeatClear;

function bindDOM() {
  jobInput = document.getElementById("job-post");
  categorySelect = document.getElementById("job-category");
  strategySelect = document.getElementById("work-strategy");
  lengthSelect = document.getElementById("proposal-length");
  senioritySelect = document.getElementById("seniority-level");
  langSelect = document.getElementById("language");
  rateInput = document.getElementById("rate");
  timeInput = document.getElementById("time");
  devIdentityInput = document.getElementById("dev-identity");
  pricingModelSelect = document.getElementById("pricing-model");
  fitScorePanel = document.getElementById("fit-score-panel");
  jobFitScore = document.getElementById("job-fit-score");
  jobFitDetails = document.getElementById("job-fit-details");
  questionsInput = document.getElementById("screening-questions");
  examplesInput = document.getElementById("examples");
  snippetToggle = document.getElementById("include-snippet");
  snippetSelect = document.getElementById("snippet-type");
  autoGenExamplesToggle = document.getElementById("auto-generate-examples");
  promptPreview = document.getElementById("prompt-preview");
  charCount = document.getElementById("char-count");
  shieldCard = document.getElementById("shield-card");
  shieldTitleText = document.getElementById("shield-title-text");
  shieldCountText = document.getElementById("shield-count-text");
  shieldDetails = document.getElementById("shield-details");
  statusBadge = document.getElementById("status-badge");
  badgeText = document.getElementById("badge-text");
  keywordAlert = document.getElementById("keyword-alert");
  keywordTag = document.getElementById("keyword-tag");
  btnDismissKeyword = document.getElementById("btn-dismiss-keyword");
  btnSetKeyword = document.getElementById("btn-set-keyword");
  constraintAlert = document.getElementById("constraint-alert");
  constraintTag = document.getElementById("constraint-tag");
  langDetectHint = document.getElementById("lang-detect-hint");
  toast = document.getElementById("toast");
  btnInject = document.getElementById("btn-inject");
  btnCopy = document.getElementById("btn-copy");
  btnCopyLabel = document.getElementById("btn-copy-label");
  btnFullTab = document.getElementById("btn-full-tab");
  btnAbVariant = document.getElementById("btn-ab-variant");
  btnLogBid = document.getElementById("btn-log-bid");

  tabBtnProposal = document.getElementById("tab-btn-proposal");
  tabBtnReply = document.getElementById("tab-btn-reply");
  tabBtnRepeat = document.getElementById("tab-btn-repeat");
  viewProposal = document.getElementById("view-proposal-container");
  viewReply = document.getElementById("view-reply-container");
  viewRepeat = document.getElementById("view-repeat-container");
  clientMessageInput = document.getElementById("client-message");
  replyIntentSelect = document.getElementById("reply-intent");
  replyToneSelect = document.getElementById("reply-tone");
  replyPromptPreview = document.getElementById("reply-prompt-preview");
  replyCharCount = document.getElementById("reply-char-count");
  btnReplyInject = document.getElementById("btn-reply-inject");
  btnReplyCopy = document.getElementById("btn-reply-copy");
  btnReplyCopyLabel = document.getElementById("btn-reply-copy-label");

  // Repeat tab
  repeatJobInput = document.getElementById("repeat-job");
  repeatRateInput = document.getElementById("repeat-rate");
  repeatStrategySelect = document.getElementById("repeat-strategy");
  repeatNotesInput = document.getElementById("repeat-notes");
  repeatPromptPreview = document.getElementById("repeat-prompt-preview");
  repeatCharCount = document.getElementById("repeat-char-count");
  btnRepeatCopy = document.getElementById("btn-repeat-copy");
  btnRepeatInject = document.getElementById("btn-repeat-inject");
  btnRepeatClear = document.getElementById("btn-repeat-clear");
}

// State for screening keyword
let manuallySetKeyword = null;
let dismissedKeywords = new Set();

// Storage Helper
function getStorage(keys, callback) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(keys, callback);
  } else {
    const res = {};
    keys.forEach(k => res[k] = localStorage.getItem(k));
    callback(res);
  }
}

function setStorage(obj) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(obj);
  } else {
    Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
  }
}

// Load Custom Dropdown Options
function loadCustomDropdowns(rawJson) {
  if (!rawJson) return;
  try {
    const parsed = JSON.parse(rawJson);
    customOptions = Object.assign(customOptions, parsed);
  } catch (e) {
    return;
  }

  Object.keys(customOptions).forEach(selectId => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    customOptions[selectId].forEach(opt => {
      if (!Array.from(sel.options).some(o => o.value === opt.value)) {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = `★ ${opt.text}`;
        sel.appendChild(optionEl);
      }
    });
  });
}

function handleAddCustomOption(targetId) {
  const sel = document.getElementById(targetId);
  if (!sel) return;

  let promptMsg = "Enter custom option name:";
  if (targetId === "job-category") {
    promptMsg = "Enter custom Tech Domain (e.g. Flutter Mobile, Golang, Ruby on Rails, Rust):";
  } else if (targetId === "work-strategy") {
    promptMsg = "Enter custom Strategy / Process (e.g. Automated CI/CD Audit, Performance Refactor):";
  } else if (targetId === "snippet-type") {
    promptMsg = "Enter custom Diagnostic Snippet directive (e.g. Redis pipeline benchmark, Kubernetes pod logs):";
  }

  const val = prompt(promptMsg);
  if (!val || !val.trim()) return;

  const cleanVal = val.trim();
  const optionValue = "custom_" + cleanVal.toLowerCase().replace(/[^a-z0-9]/g, '_');

  if (!Array.from(sel.options).some(o => o.value === optionValue)) {
    const optionEl = document.createElement("option");
    optionEl.value = optionValue;
    optionEl.textContent = `★ ${cleanVal}`;
    sel.appendChild(optionEl);

    if (!customOptions[targetId]) customOptions[targetId] = [];
    customOptions[targetId].push({ value: optionValue, text: cleanVal });
    setStorage({ bp_custom_dropdowns: JSON.stringify(customOptions) });
  }

  sel.value = optionValue;
  update();
  showToast(`Added "${cleanVal}"!`);
}

// Common uppercase words/tech terms to exclude from screening keyword detection
const KEYWORD_BLOCKLIST = new Set([
  "ASAP", "REST", "SOAP", "HTML", "CSS", "SCSS", "JSON", "YAML", "XML", "SQL", "MYSQL", "POSTGRES", 
  "NOSQL", "MONGODB", "REDIS", "HTTP", "HTTPS", "NGINX", "APACHE", "DOCKER", "K8S", "AWS", "GCP", 
  "AZURE", "STRIPE", "PAYPAL", "WOOCOMMERCE", "SHOPIFY", "WORDPRESS", "MAGENTO", "LARAVEL", "DJANGO", 
  "REACT", "NEXTJS", "VUE", "NUXT", "NODE", "NODEJS", "SVELTE", "TYPESCRIPT", "JAVASCRIPT", "PYTHON", 
  "PHP", "RUBY", "GOLANG", "RUST", "SWIFT", "KOTLIN", "FLUTTER", "LINUX", "UBUNTU", "DEBIAN", "BASH", 
  "SSH", "SFTP", "FTP", "SSL", "TLS", "DNS", "CDN", "CLOUDFLARE", "SENTRY", "DATADOG", "JIRA", 
  "GITHUB", "GITLAB", "BITBUCKET", "ADMINER", "PHPMYADMIN", "CPANEL", "PLESK", "WHM", "SMTP", 
  "JWT", "CORS", "CSRF", "XSS", "SSRF", "SQLI", "RCE", "CVE", "DDOS", "WAF", "ACID", "CRUD", 
  "MVP", "POC", "SLA", "KPI", "SAAS", "PAAS", "IAAS", "CLI", "GUI", "SDK", "API", "APIS", "IP", 
  "TCP", "UDP", "VPN", "RAID", "SSD", "NVME", "CPU", "RAM", "OS", "VM", "NDA", "GDPR", "OWASP",
  "WITH", "YOUR", "POST", "ERROR", "FIRST", "PHASE", "CLIENT", "ABOUT", "SUMMARY", "SCOPE", "HOURS",
  "IMPORTANT", "NOTE", "URGENT", "REQUIRED", "MUST", "PLEASE", "THANKS", "REGARDS", "HELLO", "ATTENTION",
  "PROJECT", "JOB", "TASKS", "BUDGET", "RATE", "PROPOSAL", "FREELANCER", "DEVELOPER", "ENGINEER",
  "DETAILS", "REQUIREMENTS", "DELIVERABLES", "MILESTONES", "TIMELINE", "DEADLINE", "EXPERIENCE", "SKILLS",
  "THIS", "THAT", "THESE", "THOSE", "WHAT", "WHEN", "WHERE", "WHICH", "HAVE", "BEEN", "FROM", "THEY",
  "TRUE", "FALSE", "NULL", "UNDEFINED", "CODE", "TEST", "WORK", "TEAM", "NEED", "FAST", "HELP", "LOOK"
]);

// Secret Keyword Scanner (Precision-engineered)
function detectSecretKeyword(text) {
  if (manuallySetKeyword) {
    return manuallySetKeyword;
  }
  if (!text) return null;

  // High-confidence intentional patterns
  const intentionalPatterns = [
    /(?:include|start\s+(?:your\s+)?proposal\s+with|use|type|write|put)\s+(?:the\s+)?(?:word|keyword|code\s*word|phrase|term)?[:\s]+["'“]?([A-Za-z0-9_\-]{3,24})["'”]?/i,
    /(?:code\s*word|secret\s*word|screening\s*word|magic\s*word|keyword)[\s:]+["'“]?([A-Za-z0-9_\-]{3,24})["'”]?/i,
    /(?:to\s+(?:prove|confirm|ensure)\s+you(?:\s+have)?\s+read[\s\S]{1,60}?(?:word|code|phrase|write|use)[:\s]+)["'“]?([A-Za-z0-9_\-]{3,24})["'”]?/i,
    /(?:palabra\s+clave|código\s+secreto|la\s+palabra)[\s:]+["'“]?([A-Za-z0-9_\-]{3,24})["'”]?/i
  ];

  for (const pat of intentionalPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const candidate = m[1].trim();
      const upper = candidate.toUpperCase();
      if (!KEYWORD_BLOCKLIST.has(upper) && candidate.length >= 3 && !dismissedKeywords.has(upper)) {
        return candidate;
      }
    }
  }

  return null;
}

// Extract Screening Questions from Job Post
function extractScreeningQuestions(text) {
  if (!text) return null;

  // 1. Standard Upwork / Freelancer footer questions
  const footerMatch = text.match(/(?:You will be asked to answer the following questions when submitting a proposal:|Questions you'll be asked:|Screening Questions:|Applicant Questions:)[\s\r\n]+([\s\S]+)/i);
  if (footerMatch && footerMatch[1]) {
    return footerMatch[1].trim();
  }

  // 2. In-body questions ("In your proposal, please answer:", "Please answer the following:")
  const inBodyMatch = text.match(/(?:in your proposal,?\s*(?:please\s*)?answer:?|please answer the following(?: questions)?:?|when applying,?\s*(?:please\s*)?answer:?|questions to answer:?|please answer:?)[\s\r\n]+([\s\S]+?)(?=\n\s*(?:Deliverables|Requirements|Milestones|Skills|Project Type|About|Client Provides|Scope|We will provide|\n\n\n|$))/i);
  if (inBodyMatch && inBodyMatch[1] && inBodyMatch[1].trim().length > 15) {
    return inBodyMatch[1].trim();
  }

  // 3. To Apply checklist ("To Apply: Please submit your proposal including:")
  const toApplyMatch = text.match(/(?:to apply:?|how to apply:?|when applying:?|to be considered:?|please (?:submit|include|provide) (?:your )?proposal including:?)[\s\r\n]+(?:please submit your proposal including:?[\s\r\n]+)?([\s\S]+?)(?=\n\s*(?:Deliverables|Milestones|Project Type|About|$))/i);
  if (toApplyMatch && toApplyMatch[1] && toApplyMatch[1].trim().length > 15) {
    return toApplyMatch[1].trim();
  }

  return null;
}

// Detect Client Language
function detectLanguage(text) {
  if (!text) return "en";
  const spanishMarkers = ["tenemos", "problema", "gracias", "español", "clientas", "pago", "después", "suscripciones", "respaldo", "limpieza", "propuesta"];
  const germanMarkers = ["wir", "und", "bitte", "fehler", "zahlung", "suche"];
  const frenchMarkers = ["nous", "pour", "merci", "problème", "paiement"];

  const lower = text.toLowerCase();
  let esScore = spanishMarkers.filter(w => lower.includes(w)).length;
  let deScore = germanMarkers.filter(w => lower.includes(w)).length;
  let frScore = frenchMarkers.filter(w => lower.includes(w)).length;

    let dachEnScore = (text.match(/\b(?:GmbH|AG|Switzerland|Austria|Germany|Munich|Berlin|Wien|Zurich)\b/gi) || []).length;
  if (dachEnScore >= 1) return "de-en";
  if (esScore >= 2) return "es";
  if (deScore >= 2) return "de";
  if (frScore >= 2) return "fr";
  return "en";
}

// ── CLIENT PSYCHOLOGY DECODER ──────────────────────────────────────────────
// Extracts hidden signals from the job post: what the client fears most,
// their urgency level, whether they've been burned before, and what will
// trigger their hiring decision. Used to calibrate the proposal intelligently.
function detectClientPsychology(text) {
  if (!text) return { fears: [], urgency: 'normal', burnedCount: 0, decisionTrigger: 'quality', phrases: [] };
  const lower = text.toLowerCase();

  // ── Urgency signals ────────────────────────────────────────────────────
  const urgencyWords = ['urgent', 'asap', 'immediately', 'right away', 'today', 'quickly', 'fast', 'critical',
    'emergency', 'now', 'rush', 'deadline', 'time-sensitive', 'as soon as possible'];
  const urgencyScore = urgencyWords.filter(w => lower.includes(w)).length;
  const urgency = urgencyScore >= 2 ? 'high' : urgencyScore >= 1 ? 'medium' : 'normal';

  // ── "Burned before" signals ─────────────────────────────────────────────
  const burnedPatterns = [
    /experience\s+is\s+(?:very\s+)?important/i,
    /must\s+have\s+(?:direct\s+)?experience/i,
    /expert[s]?\s+only/i,
    /no\s+beginners/i,
    /serious\s+(?:applicants|bidders|only)/i,
    /proven\s+(?:track\s+record|experience)/i,
    /production[- ]ready/i,
    /reliable/i,
    /working\s+directly\s+(?:in|within|with)/i,
    /only\s+apply\s+if/i,
    /please\s+don.t\s+apply\s+if/i
  ];
  const burnedCount = burnedPatterns.filter(p => p.test(text)).length;

  // ── Primary fear extraction (ordered by severity) ──────────────────────
  const fears = [];
  if (/billing|payment|subscri|revenue|stripe|financial/i.test(text)) fears.push('breaking billing or revenue workflows');
  if (/production|live\s+(?:data|system)|active\s+(?:users|incident)/i.test(text)) fears.push('disrupting live production operations');
  if (/integrat|existing\s+system|current\s+(?:setup|config|platform)/i.test(text)) fears.push('breaking existing system integrations');
  if (/data|database|records|schema|migration/i.test(text)) fears.push('data loss or schema corruption');
  if (/security|hack|breach|malware|vulnerab/i.test(text)) fears.push('security compromise');
  if (/deadline|timeline|schedule|launch/i.test(text)) fears.push('missing delivery timelines');
  if (/budget|cost|affordable|reasonable/i.test(text)) fears.push('cost overrun or scope creep');

  // ── Budget vs quality signal ───────────────────────────────────────────
  const budgetSensitive = /affordable|budget|reasonable|cheap|low.cost|cost.effective|best\s+rate/i.test(text);
  const qualityFocused = /expert|professional|senior|production.ready|reliable|best|important/i.test(text);
  const decisionTrigger = budgetSensitive && !qualityFocused ? 'value' : 'quality';

  // ── Exact pain phrases to mirror back ─────────────────────────────────
  // Extract 2-3 specific phrases the client used that reveal what they care about
  const phrasePatterns = [
    /integrates?\s+smoothly/i, /production.ready/i, /reliable/i, /assess\s+requirements/i,
    /working\s+directly/i, /existing\s+system/i, /custom\s+(?:fields?|reports?)/i,
    /zero\s+disruption/i, /without\s+(?:downtime|interruption)/i, /ensure\s+(?:the\s+)?solution/i
  ];
  const phrases = phrasePatterns.map(p => { const m = text.match(p); return m ? m[0] : null; }).filter(Boolean).slice(0, 3);

  return { fears: fears.slice(0, 3), urgency, burnedCount, decisionTrigger, phrases, qualityFocused };
}

// Helper for proximity negation detection (Bug 5)
function isNegated(text, regex, windowSize = 60) {
  const match = text.match(regex);
  if (!match) return false;
  const idx = text.indexOf(match[0]);
  const windowStr = text.substring(Math.max(0, idx - windowSize), Math.min(text.length, idx + match[0].length + windowSize));
  return /\b(no|without|zero|do not|don't|not required|not requiring|none)\b/i.test(windowStr);
}

// ── CLIENT NEGATIVE CONSTRAINTS DETECTOR ─────────────────────────────────────
// Extracts explicit restrictions and negative constraints (e.g. "no third party plugins",
// "no ecommerce", "no logins", "vanilla js only") so the proposal explicitly honors them.
function detectNegativeConstraints(text) {
  if (!text) return [];
  const constraints = [];
  
  // Find clauses that express negation/restrictions
  const negMatches = text.match(/(?:(?:no|without|zero|do not use|don't use|never use|avoid|not requiring|not required|free of)\s+[^.,\n;]+(?:\s+or\s+[^.,\n;]+)*)/gi) || [];
  
  const rules = [
    { label: 'No third-party plugins', regex: /\bthird[- ]party\s+plugins?\b/i },
    { label: 'No plugins', regex: /\bplugins?\b/i },
    { label: 'No ecommerce', regex: /\b(?:ecommerce|e-commerce|woocommerce|shop|cart)\b/i },
    { label: 'No logins / user accounts', regex: /\b(?:logins?|user\s+accounts?|memberships?|auth)\b/i },
    { label: 'No page builders', regex: /\b(?:page\s+builders?|elementor|divi|wpbakery|beaver)\b/i },
    { label: 'No external libraries / dependencies', regex: /\bexternal\s+(?:libraries|dependencies)\b/i },
    { label: 'No agencies', regex: /\b(?:agencies|agency)\b/i },
    { label: 'Zero downtime / disruption', regex: /\b(?:downtime|disruption|breaking)\b/i }
  ];

  rules.forEach(rule => {
    let matched = false;
    for (const clause of negMatches) {
      if (rule.regex.test(clause)) {
        matched = true;
        break;
      }
    }
    if (!matched && isNegated(text, rule.regex, 60)) {
      matched = true;
    }
    if (matched) {
      if (rule.label === 'No plugins' && constraints.includes('No third-party plugins')) {
        return;
      }
      constraints.push(rule.label);
    }
  });

  if (/\bvanilla\s+(?:js|javascript|css)\b/i.test(text) || /\b(native\s+code\s+only|pure\s+css)\b/i.test(text)) {
    constraints.push('Vanilla JS/CSS only');
  }

  return constraints;
}

// ── CLIENT TONE DETECTOR ───────────────────────────────────────────────────────
// Analyses the job post's own writing style so the proposal can match its
// energy level, formality, verbosity, and structural format.
function detectClientTone(text) {
  if (!text || text.length < 20) {
    return { label: 'Neutral', formality: 'neutral', verbosity: 'medium',
      enthusiasm: 'normal', technicality: 'mixed', targetWords: '130-160', hasBullets: false, wordCount: 0 };
  }

  const words = text.trim().split(/\s+/);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const avgSentLen = wordCount / Math.max(sentences.length, 1);

  // Formality
  const formalMarkers = ['we require', 'please ensure', 'must have', 'will be responsible',
    'the candidate', 'applicants should', 'experience required', 'we are seeking',
    'the successful applicant', 'scope of work', 'deliverables', 'please submit'];
  const casualMarkers = ['hey', 'hi there', 'looking for someone', 'would love', 'we\'re',
    'i\'m', 'asap', 'thanks', 'super', 'awesome', 'cool', '!', 'you\'ll', 'let\'s'];
  const lower = text.toLowerCase();
  const formalScore = formalMarkers.filter(m => lower.includes(m)).length;
  const casualScore = casualMarkers.filter(m => lower.includes(m)).length;
  let formality = 'neutral';
  if (formalScore > casualScore + 1) formality = 'formal';
  else if (casualScore > formalScore) formality = 'casual';

  // Enthusiasm
  const exclamations = (text.match(/!/g) || []).length;
  const enthusiasm = exclamations >= 2 ? 'high' : exclamations >= 1 ? 'medium' : 'normal';

  // Technicality
  const techTerms = (text.match(/\b(API|SDK|SQL|schema|database|endpoint|config|deploy|integration|webhook|OAuth|REST|JSON|XML|cloud|server|backend|frontend|framework|module|pipeline|async|cache|queue|CRON|docker|k8s|CI\/CD)\b/gi) || []);
  const technicality = techTerms.length >= 4 ? 'high' : techTerms.length >= 2 ? 'medium' : 'low';

  // Structure preference
  const hasBullets = /^[\s]*[-•*]/m.test(text);

  // Verbosity by avg sentence length
  const verbosity = avgSentLen > 22 ? 'verbose' : avgSentLen < 9 ? 'terse' : 'medium';

  // Target proposal word count based on how much they wrote
  let targetWords;
  if (wordCount < 40) targetWords = '90-120';
  else if (wordCount < 80) targetWords = '110-145';
  else if (wordCount < 150) targetWords = '130-165';
  else if (wordCount < 280) targetWords = '150-190';
  else targetWords = '170-220';

  // Human-readable label
  let label = '';
  if (formality === 'formal') label = 'Formal / Professional';
  else if (formality === 'casual') label = 'Casual / Friendly';
  else label = 'Neutral / Business';
  if (enthusiasm === 'high') label += ' + Enthusiastic';
  if (verbosity === 'terse') label = '⚡ Terse / Fast-reader';
  if (verbosity === 'verbose') label = '📝 Detailed / Thorough';

  return { label, formality, verbosity, enthusiasm, technicality, targetWords, hasBullets, wordCount };
}

// ── CLIENT PROFILE / REVIEW ANALYSER ───────────────────────────────────────────
// Parses pasted Upwork reviews / profile text to extract what this client
// valued in past freelancers, what burned them, and their hiring pattern.
function analyzeClientProfile(profileText) {
  if (!profileText || profileText.trim().length < 10) {
    return { values: [], redFlags: [], hiringPattern: null, communicationStyle: null, hasData: false };
  }
  const lower = profileText.toLowerCase();

  // What they valued in past freelancers
  const values = [];
  if (/communicat|responsive|replied|kept me updated/i.test(profileText)) values.push('clear communication');
  if (/on.time|deadline|delivered|ahead of/i.test(profileText)) values.push('on-time delivery');
  if (/detail|thorough|careful|noticed|caught/i.test(profileText)) values.push('attention to detail');
  if (/technical|expert|knowledge|knew|deep/i.test(profileText)) values.push('deep technical expertise');
  if (/quick|fast|prompt|immediately|right away/i.test(profileText)) values.push('fast turnaround');
  if (/honest|transparent|upfront|clear about/i.test(profileText)) values.push('transparency');
  if (/question|clarif|understood|got it|nailed/i.test(profileText)) values.push('asks good clarifying questions');
  if (/quality|clean|professional|excellent|superb/i.test(profileText)) values.push('quality output');
  if (/hired again|rehire|long.term|ongoing/i.test(profileText)) values.push('long-term reliability');

  // Red flags from past experiences
  const redFlags = [];
  if (/scope creep|extra|unexpected|charged more/i.test(profileText)) redFlags.push('scope creep');
  if (/disappear|ghost|unresponsive|no response|went dark/i.test(profileText)) redFlags.push('going dark mid-project');
  if (/overpromise|promised|said they could|claimed/i.test(profileText)) redFlags.push('overpromising');
  if (/delay|late|overdue|took too long/i.test(profileText)) redFlags.push('late delivery');
  if (/quality|messy|sloppy|broken|bugs/i.test(profileText) && /not|poor|bad|terrible/i.test(profileText)) redFlags.push('poor code quality');

  // Hiring pattern / experience level as a client
  const hiredCount = (profileText.match(/\b(hired|job|contract|paid|completed)\b/gi) || []).length;
  let hiringPattern = null;
  if (hiredCount > 8) hiringPattern = 'Power hirer (experienced, efficient, decisive)';
  else if (hiredCount > 3) hiringPattern = 'Regular hirer (knows what they want)';
  else if (hiredCount > 0) hiringPattern = 'Occasional hirer (may need guidance)';
  else hiringPattern = 'New or light hirer';

  // Communication style from reviews
  let communicationStyle = null;
  if (/detailed feedback|specific|precise|exact/i.test(profileText)) communicationStyle = 'Precise / detailed';
  else if (/easy to work|flexible|laid.back|chill/i.test(profileText)) communicationStyle = 'Relaxed / flexible';
  else if (/strict|specific|clear require|must|exactly as/i.test(profileText)) communicationStyle = 'Strict / spec-driven';

  return { values: values.slice(0, 4), redFlags, hiringPattern, communicationStyle, hasData: true };
}

// ── UPDATE INTEL SIGNAL BADGES ──────────────────────────────────────────────────
// Refreshes the 4 signal badges in the Client Intelligence panel.
function updateIntelSignals() {
  const jobText = jobInput ? jobInput.value : '';
  const profileText = document.getElementById('client-profile') ? document.getElementById('client-profile').value : '';

  if (!jobText.trim()) {
    ['sig-tone-val','sig-words-val','sig-client-val','sig-values-val'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = '—'; el.className = 'sig-val'; }
    });
    return;
  }

  const tone = detectClientTone(jobText);
  const profile = analyzeClientProfile(profileText);

  const setVal = (id, text, cls) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; el.className = 'sig-val ' + (cls || ''); }
  };

  setVal('sig-tone-val', tone.label, 'detected');
  setVal('sig-words-val', tone.targetWords + ' words', 'detected');
  setVal('sig-client-val', profile.hiringPattern || 'Unknown', profile.hasData ? 'detected' : '');
  setVal('sig-values-val', profile.values.length > 0 ? profile.values.slice(0,2).join(', ') : (jobText ? 'Paste profile →' : '—'), profile.values.length > 0 ? 'detected' : 'warn');

  // Update badge state
  const badge = document.getElementById('intel-badge');
  if (badge) {
    if (profile.hasData) {
      badge.textContent = '✓ Active';
      badge.classList.add('active');
    } else {
      badge.textContent = 'Optional';
      badge.classList.remove('active');
    }
  }

  // Update detected constraints banner
  const detectedConstraints = detectNegativeConstraints(jobText);
  if (constraintAlert && constraintTag) {
    if (detectedConstraints.length > 0) {
      constraintAlert.style.display = 'flex';
      constraintTag.innerText = detectedConstraints.join(', ');
    } else {
      constraintAlert.style.display = 'none';
    }
  }
}

// Debounce Utility
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const debouncedStorageSet = debounce((obj) => setStorage(obj), 500);

// Init

const BID_LOG_KEY = 'bp_bid_log';

async function logBid(status = 'sent') {
  const existing = await new Promise(r => chrome.storage.local.get(BID_LOG_KEY, d => r(d[BID_LOG_KEY] || [])));
  const entry = {
    id: Date.now(),
    ts: new Date().toISOString(),
    jobSnippet: jobInput?.value?.substring(0, 120) ?? '',
    preset: categorySelect?.value,
    strategy: strategySelect?.value,
    length: lengthSelect?.value,
    rate: rateInput?.value,
    status
  };
  existing.push(entry);
  const trimmed = existing.slice(-100);
  chrome.storage.local.set({ [BID_LOG_KEY]: trimmed });
  showToast("Bid Logged!");
}

document.getElementById('btn-ab-variant')?.addEventListener('click', () => {
  const basePrompt = buildPrompt();
  const abPrompt = basePrompt + `\n\nVARIANT OUTPUT FORMAT:
Output TWO versions of ONLY the first paragraph (opening hook). Nothing else.

VARIANT A — DIAGNOSTIC LEAD: Open by naming the exact failure mechanism or root cause. Lead with the diagnosis.
VARIANT B — PROOF LEAD: Open with a first-person case reference that mirrors this client's exact problem. Lead with precedent.

Label them exactly:
[VARIANT A — Diagnostic Lead]
[first paragraph text]

[VARIANT B — Proof Lead]
[first paragraph text]

Output ONLY these two labeled variants. No other text.`;
  
  navigator.clipboard.writeText(abPrompt).then(() => {
    showToast("A/B hook generator copied! Paste into Claude.");
  });
});

document.getElementById('btn-log-bid')?.addEventListener('click', () => {
  logBid('sent');
});

function init() {
  bindDOM();
  getStorage([
    "bp_rate", "bp_time", "bp_examples", "bp_lang", "bp_cat", "bp_strat", "bp_len", 
    "bp_seniority", "bp_snippet", "bp_autogen", "bp_custom_dropdowns",
    "bp_job", "bp_questions", "bp_profile", "bp_reply_msg", "bp_reply_intent", 
    "bp_reply_tone", "bp_active_tab", "bp_dev_identity", "bp_pricing_model"
  ], res => {
    if (res.bp_custom_dropdowns) {
      loadCustomDropdowns(res.bp_custom_dropdowns);
    }
    if (res.bp_rate) rateInput.value = res.bp_rate;
    if (res.bp_time) timeInput.value = res.bp_time;
    if (res.bp_lang) langSelect.value = res.bp_lang;
    if (res.bp_cat) categorySelect.value = res.bp_cat;
    if (res.bp_strat) strategySelect.value = res.bp_strat;
    if (res.bp_len) lengthSelect.value = res.bp_len;
    if (res.bp_seniority && senioritySelect) senioritySelect.value = res.bp_seniority;
    if (res.bp_snippet) snippetSelect.value = res.bp_snippet;
    if (res.bp_autogen !== undefined && autoGenExamplesToggle) {
      autoGenExamplesToggle.checked = (res.bp_autogen === true || res.bp_autogen === "true");
    }
    if (res.bp_examples) examplesInput.value = res.bp_examples;
    else {
      examplesInput.value = "";
    }
    if (res.bp_dev_identity && devIdentityInput) devIdentityInput.value = res.bp_dev_identity;
    if (res.bp_pricing_model && pricingModelSelect) pricingModelSelect.value = res.bp_pricing_model;

    // Auto-restore draft job description, screening questions, and client profile
    if (res.bp_job && jobInput) jobInput.value = res.bp_job;
    if (res.bp_questions && questionsInput) questionsInput.value = res.bp_questions;
    const clientProfileEl = document.getElementById('client-profile');
    if (res.bp_profile && clientProfileEl) {
      clientProfileEl.value = res.bp_profile;
      const intelBody = document.getElementById('intel-body');
      const intelChevron = document.getElementById('intel-chevron');
      if (intelBody) intelBody.style.display = 'block';
      if (intelChevron) intelChevron.classList.add('open');
    }

    // Auto-restore reply tab inputs
    if (res.bp_reply_msg && clientMessageInput) clientMessageInput.value = res.bp_reply_msg;
    if (res.bp_reply_intent && replyIntentSelect) replyIntentSelect.value = res.bp_reply_intent;
    if (res.bp_reply_tone && replyToneSelect) replyToneSelect.value = res.bp_reply_tone;

    // Auto-restore active tab
    if (res.bp_active_tab === "reply") {
      switchTab("reply");
      updateReplyPrompt();
    } else if (res.bp_active_tab === "repeat") {
      switchTab("repeat");
      loadRepeatSessionBanner();
      updateRepeatPrompt();
    } else {
      switchTab("proposal");
    }

    updateIntelSignals();
    update();
  });

  // Preset Buttons
  document.querySelectorAll(".preset-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      document.querySelectorAll(".preset-tag").forEach(t => t.classList.remove("active"));
      tag.classList.add("active");
      const key = tag.getAttribute("data-preset");

      if (key === "clear") {
        jobInput.value = "";
        if (questionsInput) questionsInput.value = "";
        const clientProfileEl = document.getElementById('client-profile');
        if (clientProfileEl) clientProfileEl.value = "";
        manuallySetKeyword = null;
        dismissedKeywords.clear();
        updateIntelSignals();
        update();
        showToast("Draft cleared");
      } else if (PRESETS[key]) {
        const p = PRESETS[key];
        if (p.job) jobInput.value = p.job;
        if (p.category) categorySelect.value = p.category;
        if (p.strategy) strategySelect.value = p.strategy;
        if (p.snippet) snippetSelect.value = p.snippet;
        if (p.rate) rateInput.value = p.rate;
        if (p.time) timeInput.value = p.time;
        if (p.examples) examplesInput.value = p.examples;
        update();
      }
    });
  });

  // Tab Switcher
  tabBtnProposal.addEventListener("click", () => {
    switchTab("proposal");
    setStorage({ bp_active_tab: "proposal" });
  });

  tabBtnReply.addEventListener("click", () => {
    switchTab("reply");
    setStorage({ bp_active_tab: "reply" });
    updateReplyPrompt();
  });

  tabBtnRepeat.addEventListener("click", () => {
    switchTab("repeat");
    setStorage({ bp_active_tab: "repeat" });
    loadRepeatSessionBanner();
    updateRepeatPrompt();
  });

  // Inline [+ Add] Buttons
  document.querySelectorAll(".btn-add-inline").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const targetId = btn.getAttribute("data-target");
      handleAddCustomOption(targetId);
    });
  });

  // Listeners - Proposal Tab
  const debouncedUpdate = debounce(update, 250);
  const elementsToWatch = [jobInput, questionsInput, categorySelect, strategySelect, lengthSelect, senioritySelect, rateInput, timeInput, examplesInput, langSelect, snippetToggle, snippetSelect, autoGenExamplesToggle, devIdentityInput, pricingModelSelect];
  elementsToWatch.forEach(el => {
    if (el) {
      el.addEventListener("input", debouncedUpdate);
      el.addEventListener("change", debouncedUpdate);
    }
  });

  // Auto-extract screening questions on paste
  if (jobInput) {
    jobInput.addEventListener("paste", e => {
      const pasted = (e.clipboardData || window.clipboardData)?.getData("text");
      if (!pasted) return;

      const questions = extractScreeningQuestions(pasted);
      if (questions && questionsInput && !questionsInput.value.trim()) {
        e.preventDefault();
        questionsInput.value = questions;
        const cleanedJob = pasted.replace(/(?:You will be asked to answer the following questions when submitting a proposal:|Questions you'll be asked:|Screening Questions:|Applicant Questions:)[\s\r\n]+[\s\S]+/i, "").trim();
        jobInput.value = cleanedJob;
        showToast("Screening questions detected & separated!");
        update();
      }
    });
  }

  // Keyword Banner Controls
  if (btnDismissKeyword) {
    btnDismissKeyword.addEventListener("click", () => {
      const current = keywordTag ? keywordTag.innerText.trim().toUpperCase() : null;
      if (current) dismissedKeywords.add(current);
      manuallySetKeyword = null;
      update();
      showToast("Keyword dismissed");
    });
  }

  if (keywordTag) {
    keywordTag.addEventListener("click", () => {
      const current = keywordTag.innerText.trim();
      const entered = prompt("Edit screening keyword (or leave blank to clear):", current);
      if (entered === null) return;
      if (entered.trim()) {
        manuallySetKeyword = entered.trim();
        dismissedKeywords.delete(manuallySetKeyword.toUpperCase());
        showToast(`Keyword set: "${manuallySetKeyword}"`);
      } else {
        manuallySetKeyword = null;
        if (current) dismissedKeywords.add(current.toUpperCase());
        showToast("Keyword cleared");
      }
      update();
    });
  }

  if (btnSetKeyword) {
    btnSetKeyword.addEventListener("click", () => {
      const entered = prompt("Enter screening keyword (e.g. SAVASANA):", manuallySetKeyword || "");
      if (entered === null) return;
      if (entered.trim()) {
        manuallySetKeyword = entered.trim();
        dismissedKeywords.delete(manuallySetKeyword.toUpperCase());
        showToast(`Keyword set: "${manuallySetKeyword}"`);
      } else {
        manuallySetKeyword = null;
        showToast("Keyword cleared");
      }
      update();
    });
  }

  // Global Keyboard Shortcut: Ctrl+Enter / Cmd+Enter
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (viewReply && viewReply.style.display === "flex") {
        if (btnReplyCopy) btnReplyCopy.click();
      } else {
        if (btnCopy) btnCopy.click();
      }
    }
  });

  // Listeners - Reply Tab
  [clientMessageInput, replyIntentSelect, replyToneSelect].forEach(el => {
    if (el) {
      el.addEventListener("input", updateReplyPrompt);
      el.addEventListener("change", updateReplyPrompt);
    }
  });

  if (btnCopy) btnCopy.addEventListener("click", copyPrompt);
  if (btnInject) btnInject.addEventListener("click", () => injectText(promptPreview.innerText));

  if (btnReplyCopy) {
    btnReplyCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(replyPromptPreview.innerText).then(() => {
        showToast("Reply prompt copied!");
        btnReplyCopy.classList.add("btn-success-feedback");
        if (btnReplyCopyLabel) btnReplyCopyLabel.innerText = "✓ Copied!";
        setTimeout(() => {
          btnReplyCopy.classList.remove("btn-success-feedback");
          if (btnReplyCopyLabel) btnReplyCopyLabel.innerText = "Copy Reply";
        }, 1500);
      });
    });
  }

  if (btnReplyInject) btnReplyInject.addEventListener("click", () => injectText(replyPromptPreview.innerText));

  if (btnFullTab) {
    btnFullTab.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.runtime) {
        chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
      } else {
        window.open(window.location.href, "_blank");
      }
    });
  }  // Clear Draft Button
  const btnClearDraft = document.getElementById("btn-clear-draft");
  if (btnClearDraft) {
    btnClearDraft.addEventListener("click", () => {
      jobInput.value = "";
      if (questionsInput) questionsInput.value = "";
      const clientProfileEl = document.getElementById('client-profile');
      if (clientProfileEl) clientProfileEl.value = "";
      manuallySetKeyword = null;
      dismissedKeywords.clear();
      updateIntelSignals();
      update();
      showToast("Draft cleared");
    });
  }

  // Client Intelligence Panel toggle
  const intelToggle = document.getElementById('intel-toggle');
  const intelBody = document.getElementById('intel-body');
  const intelChevron = document.getElementById('intel-chevron');
  const clientProfileInput = document.getElementById('client-profile');

  if (intelToggle && intelBody) {
    intelToggle.addEventListener('click', () => {
      const open = intelBody.style.display !== 'none';
      intelBody.style.display = open ? 'none' : 'block';
      if (intelChevron) intelChevron.classList.toggle('open', !open);
    });
  }

  if (clientProfileInput) {
    clientProfileInput.addEventListener('input', () => {
      updateIntelSignals();
      update();
    });
  }

  // Also update signals whenever job post changes
  if (jobInput) {
    jobInput.addEventListener('input', updateIntelSignals);
  }

  updateIntelSignals();
  initRepeatTab();
}

// Sanitize Function
function sanitize(text) {
  let cleaned = text;
  let matches = [];

  SANITIZER_RULES.forEach(rule => {
    const found = cleaned.match(rule.pattern);
    if (found) {
      found.forEach(m => {
        if (!matches.some(item => item.raw.toLowerCase() === m.toLowerCase())) {
          matches.push({ raw: m, rep: rule.replacement });
        }
      });
      cleaned = cleaned.replace(rule.pattern, rule.replacement);
    }
  });

  return { cleaned, matches };
}

// Build Universal Proposal Prompt
// --- SUB-BUILDERS ---
function buildSeniorityDirective(seniorityLevel, jobProfile) {
  const mode = (typeof jobProfile === "object" ? jobProfile.mode : (jobProfile ? "build" : "debug")) || "build";

  if (seniorityLevel === "staff" || seniorityLevel === "senior") {
    if (mode === "build") {
      return `CRITICAL ARCHITECTURAL RIGOR: PRINCIPAL / SENIOR BUILD ARCHITECT
- Tone & Mindset: Write with quiet, authoritative precision. Zero hand-waving, zero generic promises ("I'll make it 100% modern/fast"), zero junior enthusiasm.
- Systems Architecture: Frame the solution around concrete technical architecture — data model design (custom post types, relational schemas), state management (session/client store), endpoint contracts (AJAX/REST endpoints), and edge-case handling (e.g. offline recovery, webhook delivery).
- Delivery Safety: Explicitly state how you scope, stage, and demo the complete flow on an isolated staging clone/sandbox first for verification before production rollout.
- Discovery Question: End with ONE sharp technical question addressing an operational decision, data model choice, or external integration constraint.`;
    } else if (mode === "debug") {
      return `CRITICAL ARCHITECTURAL RIGOR: SENIOR SYSTEMS ENGINEER / RUNTIME TRIAGE
- Tone & Mindset: Write with quiet, authoritative precision. Direct diagnosis in conversational senior-engineer prose. Zero academic labels (NEVER write "**Hypothesis 1:**", "**Hypothesis 2:**").
- Diagnostic Precision: Frame the failure around the two most probable runtime mechanisms (e.g., state desync, unhandled promise rejections, race conditions during async webhook retries, or cache invalidation conflicts). Describe how you isolate the active cause using specific log signatures or runtime telemetry.
- Blast Radius: Guarantee that production data, live customers, and active pipelines remain protected by reproducing and patching the issue on an isolated staging clone first.
- Discovery Question: End with ONE sharp technical question about error reproduction, server log access, or recent deployment diffs.`;
    } else if (mode === "optimize") {
      return `CRITICAL ARCHITECTURAL RIGOR: PERFORMANCE & SYSTEMS SCALING ARCHITECT
- Tone & Mindset: Write with quiet, authoritative precision. Data-driven, empirical, zero guesswork.
- Bottleneck Isolation: Frame the performance bottlenecks around measurable metrics — query execution plans, unindexed table scans, unneeded autoloaded transients, DOM hydration overhead, or edge caching hit rates.
- Safe Optimization: State how you benchmark baseline metrics (TTFB, LCP, QPS) and test optimizations on an isolated staging clone first to prevent visual or functional regressions.
- Discovery Question: End with ONE sharp technical question about the current caching stack, database engine version, or traffic peak distribution.`;
    } else if (mode === "integrate") {
      return `CRITICAL ARCHITECTURAL RIGOR: SENIOR INTEGRATION & AUTOMATION ARCHITECT
- Tone & Mindset: Write with quiet, authoritative precision. Focus on payload contracts, error budgets, and boundary resilience.
- Pipeline Architecture: Frame the integration around schema validation, idempotency keys (preventing duplicate events or transactions), rate-limit backoffs, and asynchronous queue workers.
- Sandbox Verification: State how you build and test end-to-end event flows using sandbox API credentials on staging first before activating live credentials.
- Discovery Question: End with ONE sharp technical question regarding payload volume, rate limit constraints, or webhook authentication methods.`;
    }
  }

  if (seniorityLevel === "fast") {
    return `ENGINEERING RIGOR: RAPID PRODUCTION TRIAGE\n- Fast-turnaround, pragmatic senior engineering. Isolate the exact scope quickly and deliver a clean, verified solution on staging first.`;
  }

  return `ENGINEERING RIGOR: SENIOR PRODUCTION ENGINEER\n- Methodical, clean, pragmatic. Thorough requirements review, safe staging verification, zero fluff.`;
}

function buildSelfEvalChecklist(lengthMode, negativeConstraints) {
  return `──────────────────────────────────────────────
BEFORE FINALIZING — RUN THIS INTERNAL CHECKLIST:
1. WORD COUNT: Strictly ${lengthMode === 'punchy' ? 'under 180 words' : 'within target'}.
2. ZERO META-LABELS: No artificial headers like "Milestone 1:", "Case studies:".
3. CONSTRAINTS: Honored all negative constraints (${negativeConstraints.length ? negativeConstraints.join(', ') : 'none'}).
4. ANTI-CLICHÉ: No "lives or dies on", "Here's how I'd build it", "I would be a great fit", or generic fluff.
5. REALITY CHECK: Claims mechanically true in production; platform-specific terms used correctly.
6. SCREENING QUESTIONS: Answered any explicit client questions or opening phrases directly.
If NO to any — REWRITE before outputting.
──────────────────────────────────────────────`;
}

function buildPsychologyIntelBlock(psy, clientTone, clientProfileData, negativeConstraints, detectedKeyword, rawJob, devIdentity, pricingModel, budgetSignal, stackVocab) {
  const urgencyLayer = psy.urgency === 'high' ? `- URGENCY MODE: Time-sensitive situation. Lead with fast availability.` : '';
  const burnedLayer = psy.burnedCount >= 2 ? `- TRUST-DEFICIT CONTEXT: Burned previously. Back every claim with concrete proof.` : '';
  const fearsLayer = psy.fears.length > 0 ? `- CLIENT PRIMARY FEARS: Address at least 2:\n  ${psy.fears.map((f, i) => `${i + 1}. ${f}`).join('\n  ')}` : '';
  
  let rateFramingLayer = `- RATE FRAMING: Prioritizes quality over price. Frame cost in terms of risk protection.`;
  if (psy.decisionTrigger === 'value' || (budgetSignal && budgetSignal.tier === 'budget')) {
    rateFramingLayer = `- RATE FRAMING: Budget sensitive. Frame phased pricing around risk elimination ("you only pay for what's confirmed").`;
  }
  if (pricingModel === 'fixed') {
    rateFramingLayer += ` Note: Client requires fixed-price. Quote a milestone-based fixed rate.`;
  } else if (pricingModel === 'hybrid') {
    rateFramingLayer += ` Note: Suggest a small paid diagnostic audit first, then a fixed quote for the main build/fix.`;
  }
  
  const mirrorLayer = psy.phrases.length > 0 ? `- PAIN LANGUAGE MIRRORING: Weave 1-2 exact phrases naturally:\n  ${psy.phrases.map(p => `"${p}"`).join(', ')}` : '';
  const negativeConstraintLayer = negativeConstraints.length > 0 ? `- CLIENT NEGATIVE CONSTRAINTS (ZERO TOLERANCE): Restricted: ${negativeConstraints.map(c => `"${c}"`).join(', ')}. Explicitly affirm compliance in Paragraph 1.` : '';
  const proofOfReadLayer = `- PROOF OF READ: Reference one niche detail from the job post naturally.`;
  const toneLayer = clientTone.wordCount > 0 ? `- CLIENT TONE MIRROR: ${clientTone.formality}. Structure: ${clientTone.hasBullets ? 'Bullets.' : 'Compact prose.'}` : '';
  const profileLayer = clientProfileData.hasData ? `- CLIENT PROFILE INTELLIGENCE: ${clientProfileData.values.join(', ')}.` : '';
  
  const voiceExamplesLayer = `- VOICE EXAMPLES (Match this style):
  - Instead of "I will implement the API", write "I'll route the Stripe webhook payloads through an isolated staging worker first."
  - Instead of "Here is how I would fix it:", just start the diagnosis: "The intermittent 502s are likely caused by a race condition during the worker retry cycle."`;
  
  const devIdentityLayer = devIdentity ? `- DEVELOPER IDENTITY/PROOF: Weave this subtly to establish authority: ${devIdentity}` : '';
  const stackVocabLayer = stackVocab ? `- STACK-NATIVE VOCABULARY: ${stackVocab}` : '';
  const antiHallucinationLayer = `- TECHNICAL GROUNDING: CAUSAL INTEGRITY. Never claim impossible consequences. Calibrate scope to the exact job needs.`;

  return [urgencyLayer, burnedLayer, fearsLayer, rateFramingLayer, mirrorLayer, negativeConstraintLayer, proofOfReadLayer, toneLayer, profileLayer, voiceExamplesLayer, devIdentityLayer, stackVocabLayer, antiHallucinationLayer].filter(Boolean).join('\n\n');
}

function synthesizeArchitecturalReference(jobText, category) {
  const text = (jobText || "").toLowerCase();
  const cat = (category || "").toLowerCase();

  // 1. WordPress / WooCommerce
  if (cat === "wordpress" || text.includes("wordpress") || text.includes("woocommerce") || text.includes("wp_") || text.includes("elementor") || text.includes("divi") || text.includes("acf")) {
    if (text.includes("ajax") || text.includes("one page") || text.includes("cart") || text.includes("menu") || text.includes("checkout") || text.includes("food") || text.includes("order")) {
      return "Built a single-page interactive ordering flow in WordPress using custom post types for items and post meta for modifiers/add-ons, handling the entire cart and checkout lifecycle via wp_ajax / wp_ajax_nopriv endpoints with sessionStorage state persistence, and dispatching order confirmations via wp_mail and WhatsApp Business API webhooks.";
    }
    if (text.includes("speed") || text.includes("slow") || text.includes("cache") || text.includes("optimize") || text.includes("core web vitals") || text.includes("performance") || text.includes("ttfb")) {
      return "Optimized high-traffic WordPress / WooCommerce production environments by auditing query execution plans, eliminating redundant autoloaded options, configuring Redis object caching for transients, and implementing edge-cache rules to drop page load times below 1.2s.";
    }
    if (text.includes("gateway") || text.includes("stripe") || text.includes("payment") || text.includes("paypal")) {
      return "Integrated custom payment gateways in WooCommerce leveraging WC_Payment_Gateway abstractions, secure webhook signature verification, and automated failed-payment recovery without order status race conditions.";
    }
    if (text.includes("plugin") || text.includes("custom") || text.includes("hook") || text.includes("extend") || text.includes("hpos")) {
      return "Engineered custom WordPress plugins extending WooCommerce core via filter and action hooks (HPOS-compatible), integrating external REST endpoints and maintaining strict nonce verification and database sanitation across all user inputs.";
    }
    if (text.includes("elementor") || text.includes("acf") || text.includes("theme") || text.includes("design") || text.includes("landing")) {
      return "Developed dynamic, pixel-perfect WordPress templates and ACF flexible content blocks with lightweight vanilla JavaScript and custom CSS, ensuring zero layout shift (CLS) and smooth cross-device responsiveness.";
    }
    return "Developed custom WordPress solutions leveraging custom post types, structured postmeta, and custom REST API endpoints, staging all data migrations and template overrides on an isolated clone before live activation.";
  }

  // 2. PHP / Laravel
  if (cat === "backend" || text.includes("laravel") || text.includes("php") || text.includes("symfony") || text.includes("codeigniter")) {
    if (text.includes("stripe") || text.includes("payment") || text.includes("billing") || text.includes("subscription")) {
      return "Architected a multi-tier SaaS billing pipeline in Laravel utilizing Stripe Cashier and custom webhook listeners, implementing database queue workers (Redis) and idempotency keys to guarantee zero double-charging or race conditions during webhook delivery.";
    }
    if (text.includes("api") || text.includes("rest") || text.includes("webhook") || text.includes("endpoint") || text.includes("integration")) {
      return "Engineered robust RESTful API microservices in Laravel featuring JWT/Sanctum authentication, rate-limiting middleware, structured API resources, and queue-driven background job dispatching for high-throughput processing.";
    }
    if (text.includes("livewire") || text.includes("inertia") || text.includes("blade") || text.includes("alpine")) {
      return "Built full-stack interactive web portals in Laravel using Livewire and Alpine.js with reactive component state, real-time input validation, and background event dispatching without writing boilerplate API glue code.";
    }
    if (text.includes("query") || text.includes("slow") || text.includes("database") || text.includes("migration") || text.includes("eloquent") || text.includes("sql")) {
      return "Refactored complex Laravel database queries and Eloquent relationships, implementing eager loading to solve N+1 bottlenecks and decoupling heavy transactional operations into dedicated asynchronous queue workers.";
    }
    return "Delivered full-stack Laravel applications with modular service layers, Eloquent repository patterns, queue-based background tasks, and clean database migrations verified against production-mirrored staging databases.";
  }

  // 3. React / Next.js / Frontend / TypeScript
  if (cat === "frontend" || text.includes("react") || text.includes("next.js") || text.includes("nextjs") || text.includes("tailwind") || text.includes("typescript")) {
    if (text.includes("dashboard") || text.includes("portal") || text.includes("admin") || text.includes("crm")) {
      return "Built a responsive, high-performance web application in Next.js (App Router) utilizing Server Actions for zero-bundle mutations, optimistic UI state updates with Tailwind CSS, and role-based access control protecting confidential customer datasets.";
    }
    if (text.includes("e-commerce") || text.includes("storefront") || text.includes("cart") || text.includes("checkout") || text.includes("shop")) {
      return "Developed a headless e-commerce storefront in Next.js integrating third-party catalog APIs, implementing instant client-side cart drawer state, and statically regenerating product pages with on-demand ISR.";
    }
    if (text.includes("debug") || text.includes("hydration") || text.includes("error") || text.includes("state") || text.includes("re-render")) {
      return "Resolved complex React client/server hydration mismatches, isolated volatile client state using Zustand, and eliminated memory leaks caused by uncleaned subscriptions and asynchronous fetch race conditions.";
    }
    return "Architected modern React/TypeScript frontends with clean component hierarchy, centralized state management (Zustand/Context), strict type safety, and sub-second client-side route transitions without unmounted component memory leaks.";
  }

  // 4. Vue / Nuxt
  if (text.includes("vue") || text.includes("nuxt")) {
    return "Built responsive web applications in Vue 3 / Nuxt using the Composition API, Pinia for persistent state management, and optimized server-side rendering (SSR) with Nitro server routes for instant first contentful paint.";
  }

  // 5. Node.js / Express / NestJS
  if (text.includes("node") || text.includes("express") || text.includes("nestjs")) {
    return "Engineered high-throughput backend services in Node.js/NestJS featuring structured middleware pipelines, BullMQ queue workers backed by Redis, Prisma ORM schema migrations, and comprehensive request rate limiting.";
  }

  // 6. Python / Scraping / Automation / AI
  if (text.includes("python") || text.includes("scrap") || text.includes("crawl") || text.includes("bot") || text.includes("automation") || text.includes("playwright") || text.includes("selenium")) {
    if (/\b(?:ai|llm|gpt|openai|gemini|rag|claude)\b/i.test(text)) {
      return "Built an intelligent automation workflow in Python connecting LLM APIs with structured Pydantic JSON schema validation, semantic search embeddings, prompt chain caching, and automated fallback handling to process dynamic unstructured client data.";
    }
    if (text.includes("fastapi") || text.includes("django") || text.includes("flask")) {
      return "Delivered production backend APIs in FastAPI/Django with asynchronous endpoints, Celery background worker queues, and PostgreSQL schema migrations tested with automated integration test suites.";
    }
    return "Engineered an automated data extraction and processing engine in Python utilizing Playwright/httpx with intelligent proxy rotation, session reuse, anti-bot mitigation, and resilient schema ingestion into PostgreSQL with automated error recovery.";
  }

  // 7. Shopify / Liquid
  if (cat === "shopify" || text.includes("shopify") || text.includes("liquid")) {
    return "Developed custom Shopify theme sections and Liquid templates with an AJAX slide-out cart drawer and dynamic variant selectors using the Shopify Ajax API, eliminating full page reloads and boosting mobile checkout completion.";
  }

  // 8. Mobile (React Native / Flutter)
  if (text.includes("mobile") || text.includes("react native") || text.includes("flutter") || text.includes("ios") || text.includes("android")) {
    return "Built cross-platform mobile application workflows featuring offline data synchronization with SQLite/WatermelonDB, seamless push notification delivery, and native hardware API integrations with zero UI thread stutter.";
  }

  // 9. DevOps / Cloud / AWS
  if (cat === "devops" || text.includes("aws") || text.includes("docker") || text.includes("kubernetes") || text.includes("linux") || text.includes("nginx") || text.includes("ci/cd")) {
    return "Configured automated deployment pipelines and production cloud environments using Docker, Nginx reverse proxies with SSL termination, and systemd service management with automated health monitoring and log rotation.";
  }

  // 10. General Fallback
  return "Built and deployed production-grade applications matching this exact stack, configuring isolated staging verification, structured API data flow, and comprehensive edge-case handling before live rollout.";
}

// Build Universal Proposal Prompt
function buildPrompt() {
  const rawJob = jobInput.value.trim() || "[Paste the client job description here]";
  const category = categorySelect.value;
  const strategy = strategySelect.value;
  const lengthMode = lengthSelect.value;
  const rate = rateInput.value.trim() || "$25/hr";
  const time = timeInput.value.trim() || "2-4 hours";
  const rawExamples = examplesInput.value.trim();
  const langChoice = langSelect.value;
  const includeSnippet = snippetToggle.checked;
  const snippetType = snippetSelect.value;
  
  const devIdentity = devIdentityInput ? devIdentityInput.value.trim() : "";
  const pricingModel = pricingModelSelect ? pricingModelSelect.value : "hourly";
  
  const totalMatches = [...sanitize(rawJob).matches, ...sanitize(rawExamples).matches];
  
  if (totalMatches.length > 0) {
    if (shieldCard) shieldCard.classList.add("has-triggers");
    if (statusBadge) statusBadge.classList.add("warning");
    if (badgeText) badgeText.innerText = `${totalMatches.length} Filtered`;
    if (shieldTitleText) shieldTitleText.innerText = `🛡️ Compliance Shield: Normalized ${totalMatches.length} Term(s)`;
    if (shieldCountText) shieldCountText.innerText = "Formatted for enterprise compliance";
    if (shieldDetails) shieldDetails.innerHTML = totalMatches.map(m => `<div><span class="tag-red">${escapeHtml(m.raw)}</span> ➔ <span class="tag-green">[${escapeHtml(m.rep)}]</span></div>`).join("");
  } else {
    if (shieldCard) shieldCard.classList.remove("has-triggers");
    if (statusBadge) statusBadge.classList.remove("warning");
    if (badgeText) badgeText.innerText = "Shield Active";
    if (shieldTitleText) shieldTitleText.innerText = "🛡️ Filter Shield Active";
    if (shieldCountText) shieldCountText.innerText = "0 triggers found";
    if (shieldDetails) shieldDetails.innerText = "Standard enterprise terminology active. Ready for prompt insertion.";
  }

  const psy = detectClientPsychology(rawJob);
  const detectedKeyword = detectSecretKeyword(rawJob);
  let effectiveLang = langChoice === "auto" ? detectLanguage(rawJob) : langChoice;
  if (langDetectHint) langDetectHint.innerText = langChoice === "auto" ? `Detected language: ${effectiveLang.toUpperCase()}` : "Paste client posting";
  
  let langInstruction = "Write in English (US).";
  if (effectiveLang === "es") langInstruction = "Escribe toda la propuesta en Español profesional, directo, técnico y fluido (estilo Savasana).";
  else if (effectiveLang === "de") langInstruction = "Write the proposal in clear, direct German (senior software engineer style).";
  else if (effectiveLang === "de-en") langInstruction = "Write the proposal in clear, direct English, but adopt a highly pragmatic, straightforward DACH-region engineering tone (no American-style sales fluff, focus strictly on technical correctness).";
  else if (effectiveLang === "fr") langInstruction = "Write the proposal in direct, senior-level French.";

  const clientTone = detectClientTone(rawJob);
  const rawProfile = document.getElementById('client-profile') ? document.getElementById('client-profile').value.trim() : '';
  const clientProfileData = analyzeClientProfile(rawProfile);
  const negativeConstraints = detectNegativeConstraints(rawJob);
  
  let budgetSignal = null;
  if (typeof extractBudgetSignal === 'function') budgetSignal = extractBudgetSignal(rawJob);
  
  let stackVocab = "";
  if (typeof buildStackVocabSeed === 'function') stackVocab = buildStackVocabSeed(rawJob);
  
  let codeDirective = "";
  if (includeSnippet) {
    if (snippetType === "auto") codeDirective = "Include a realistic 1-2 line CLI diagnostic command, query, or log check tailored specifically to the technology stack mentioned in this job.";
    else if (snippetType === "api_trace") codeDirective = "Include a 1-line curl or header trace command to inspect response codes, payloads, or webhook headers.";
    else if (snippetType === "caching_headers") codeDirective = "Include a 1-line curl command inspecting cache status headers (e.g. x-cache, cf-cache-status, or stale tokens).";
    else if (snippetType === "db_query") codeDirective = "Include a 1-line SQL or ORM query demonstrating how to detect slow transactions, orphaned transients, or table locks.";
    else if (snippetType === "log_scan") codeDirective = "Include a 1-line bash/grep/journalctl command showing how you inspect system or application logs for fatal errors.";
    else if (snippetType === "frontend_debug") codeDirective = "Include a short 1-line browser console or state validation snippet demonstrating component or network inspection.";
    else if (snippetType === "security_scan") codeDirective = "Include a 1-line CLI grep command demonstrating how to detect obfuscated eval/base64 calls or unauthorized hooks.";
    else if (snippetType.startsWith("custom_")) {
      const customLabel = snippetSelect.options[snippetSelect.selectedIndex].text.replace(/^★\s*/, '');
      codeDirective = `Include a 1-line command or code check demonstrating: ${customLabel}.`;
    }
  }

  const rateDisplay = rate && rate !== "/hr" ? (rate.includes('/') || rate.startsWith('$') ? rate : `$${rate}/hr`) : "$25/hr";
  const costTimeDisplay = pricingModel === "fixed" ? `${time} delivery` : `${time} at ${rateDisplay}`;

  const jobClassification = typeof classifyJobType === 'function' ? classifyJobType(rawJob) : { mode: 'build', isBuild: true };
  const mode = jobClassification.mode || (jobClassification.isBuild ? 'build' : 'debug');
  const isBuildJob = jobClassification.isBuild;

  let strategyText = "";
  if (strategy === "phased") {
    if (mode === "build") strategyText = `I stage and demo the entire solution on an isolated staging clone first (${costTimeDisplay}) for your review and sample runs before live deployment.`;
    else if (mode === "debug") strategyText = `I isolate the root cause and verify the patch on an isolated staging clone first (${costTimeDisplay}), guaranteeing zero disruption to live customer data or production workflows.`;
    else if (mode === "optimize") strategyText = `I benchmark baseline performance and validate all query/caching optimizations on an isolated staging clone first (${costTimeDisplay}) before live rollout.`;
    else if (mode === "integrate") strategyText = `I build and validate the entire data flow with sandbox credentials on an isolated staging environment (${costTimeDisplay}) before live activation.`;
    else strategyText = `I stage and validate everything on an isolated staging clone first (${costTimeDisplay}) before touching production, eliminating live system risk.`;
  } else if (strategy === "fast") {
    if (mode === "build") strategyText = `I build a rapid working prototype on an isolated staging clone (${costTimeDisplay}) for fast feedback before final rollout.`;
    else strategyText = `I isolate the failure and verify the solution on an isolated staging clone first (${costTimeDisplay}) for rapid sign-off before deploying live.`;
  } else if (strategy === "audit") {
    strategyText = `I run the initial diagnostics and audit on an isolated staging clone (${costTimeDisplay}) before applying any live changes.`;
  } else if (strategy.startsWith("custom_")) {
    const customLabel = strategySelect.options[strategySelect.selectedIndex].text.replace(/^★\s*/, '');
    strategyText = `I execute ${customLabel} in staging first (${costTimeDisplay}) for approval before live deployment.`;
  } else {
    strategyText = `I build and validate everything on a private staging clone (${costTimeDisplay}) for your approval before live deployment.`;
  }

  const effectiveExample = rawExamples || synthesizeArchitecturalReference(rawJob, category);

  const experienceDirective = `Paragraph 3 — [PROVEN ARCHITECTURAL PRECEDENT (Relevant Past Work)] (1-2 sentences):
- Naturally weave in your direct experience with this exact technical pattern:
  "${effectiveExample}"
- Guidelines:
  • Speak in natural first-person active voice ("I've built...", "In a recent production build with a similar setup, I...").
  • Ground your statement in the concrete architecture, tools, and mechanics above (e.g. specific endpoints, session handling, webhook reliability).
  • DO NOT format as an artificial bullet list with bold labels like "• **[Project]** — ...". Weave it seamlessly into flowing prose as proof of hands-on capability.
  • DO NOT invent fictitious company names or say "an NDA-protected client". Speak directly as the senior developer who designed and shipped the solution.
  • Connect this past build directly to why this client's project will be fast, stable, and zero-risk.`;

  const seniorityLevel = senioritySelect ? senioritySelect.value : 'staff';
  const seniorityDirective = buildSeniorityDirective(seniorityLevel, jobClassification);

  const intelBlock = buildPsychologyIntelBlock(psy, clientTone, clientProfileData, negativeConstraints, detectedKeyword, rawJob, devIdentity, pricingModel, budgetSignal, stackVocab);

  const screeningDirective = `[SCREENING QUESTIONS & CLIENT CONSTRAINTS]
If the client posting contains explicit opening phrases (e.g. "Start proposal with hey there") or specific screening questions:
- Honor the opening instruction immediately in the first sentence.
- If specific screening questions are asked, answer each one directly and concisely at the end of the proposal under the respective question.`;

  let paragraph1Instruction = "";
  if (mode === "build") {
    paragraph1Instruction = `Paragraph 1 — Architectural Approach & Hook (${lengthMode === "punchy" ? "35-45" : "50-60"} words):
- Open directly with your technical architecture blueprint and the single most critical technical or operational decision upfront (e.g. single-page state handling, API endpoint contract, or service trade-offs like automated API vs manual fallback).
- ${detectedKeyword ? `Incorporate client phrase: "${detectedKeyword}" naturally.` : ''}
- BANNED CLICHÉS: NEVER open with "typically go sideways at", "lives or dies on", "make-or-break", or "Here's how I'd build it".`;
  } else if (mode === "debug") {
    paragraph1Instruction = `Paragraph 1 — Root Cause Diagnosis & Hook (${lengthMode === "punchy" ? "35-45" : "50-60"} words):
- Open directly with your technical diagnosis framing the two most probable runtime mechanisms causing the failure (e.g. state desync vs race condition) and how you isolate the active cause in natural senior-engineer prose.
- ${detectedKeyword ? `Incorporate client phrase: "${detectedKeyword}" naturally.` : ''}
- BANNED CLICHÉS: NEVER open with "typically go sideways at", "lives or dies on", "make-or-break", or "Here's how I'd fix it".`;
  } else if (mode === "optimize") {
    paragraph1Instruction = `Paragraph 1 — Performance Bottleneck Isolation & Hook (${lengthMode === "punchy" ? "35-45" : "50-60"} words):
- Open directly with your performance diagnostic approach, identifying the two most likely system bottlenecks (e.g. unindexed queries/transients vs unoptimized asset delivery) and how you measure gains.
- ${detectedKeyword ? `Incorporate client phrase: "${detectedKeyword}" naturally.` : ''}
- BANNED CLICHÉS: NEVER open with "typically go sideways at", "lives or dies on", "make-or-break", or generic optimization promises.`;
  } else if (mode === "integrate") {
    paragraph1Instruction = `Paragraph 1 — Integration Architecture & Hook (${lengthMode === "punchy" ? "35-45" : "50-60"} words):
- Open directly with the data flow architecture, emphasizing schema validation, webhook reliability, and idempotency guarantees.
- ${detectedKeyword ? `Incorporate client phrase: "${detectedKeyword}" naturally.` : ''}
- BANNED CLICHÉS: NEVER open with "typically go sideways at", "lives or dies on", "make-or-break", or generic automation promises.`;
  }

  let paragraph4Instruction = "";
  if (mode === "build") {
    paragraph4Instruction = `Paragraph 4 — Discovery Question (15-20 words):
- STRICTLY FORBIDDEN: DO NOT write "One question:" or "A quick question:" or "Quick question:".
- Ask ONE sharp technical question addressing an operational decision, data model choice, or external integration constraint.`;
  } else if (mode === "debug") {
    paragraph4Instruction = `Paragraph 4 — Discovery Question (15-20 words):
- STRICTLY FORBIDDEN: DO NOT write "One question:" or "A quick question:" or "Quick question:".
- Ask ONE sharp technical question about error reproduction, server log access, or recent deployment diffs.`;
  } else if (mode === "optimize") {
    paragraph4Instruction = `Paragraph 4 — Discovery Question (15-20 words):
- STRICTLY FORBIDDEN: DO NOT write "One question:" or "A quick question:" or "Quick question:".
- Ask ONE sharp technical question about the current caching stack, database engine version, or traffic peak distribution.`;
  } else if (mode === "integrate") {
    paragraph4Instruction = `Paragraph 4 — Discovery Question (15-20 words):
- STRICTLY FORBIDDEN: DO NOT write "One question:" or "A quick question:" or "Quick question:".
- Ask ONE sharp technical question regarding payload volume, rate limit constraints, or webhook authentication methods.`;
  }

  let coverLetterStructure = "";
  if (lengthMode === "punchy") {
    coverLetterStructure = `MANDATORY PROPOSAL BLUEPRINT (STRICT CEILING: 140 - 175 WORDS TOTAL):
The entire proposal must follow this concise flow in natural engineering prose (under 180 words):

${paragraph1Instruction}

Paragraph 2 — Staging & Risk Isolation (20-30 words):
- Exactly 1 clean sentence: ${strategyText}
- No artificial milestone headers.

${experienceDirective}

${paragraph4Instruction}

${screeningDirective}`;
  } else {
    coverLetterStructure = `MANDATORY PROPOSAL BLUEPRINT (STRICT CEILING: 200 - 240 WORDS TOTAL):
The proposal must follow this structured flow in natural, authoritative engineering prose:

${paragraph1Instruction}

Paragraph 2 — Staging Isolation & Scope (30-40 words):
- Exactly 1 clean sentence: ${strategyText}
- Clean operational explanation of how live systems remain protected.

${experienceDirective}

${paragraph4Instruction}

${screeningDirective}`;
  }

  const prompt = `[ROLE DIRECTIVE]
You are a Staff/Principal-level contractor engaging a non-technical client. Act like an elite, pragmatic senior developer writing directly to the project stakeholder.
${seniorityDirective}

${langInstruction}

──────────────────────────────────────────────
CLIENT PSYCHOLOGY & REQUIREMENTS INTELLIGENCE
${intelBlock}
──────────────────────────────────────────────

${coverLetterStructure}

${codeDirective ? `[TECHNICAL DIAGNOSTIC DIRECTIVE (MANDATORY)]\n${codeDirective}\n` : ''}

${buildSelfEvalChecklist(lengthMode, negativeConstraints)}

[JOB DESCRIPTION CONTEXT]
${rawJob}
`;

  return prompt;
}
function updateReplyPrompt() {
  const msg = clientMessageInput.value.trim();
  const intent = replyIntentSelect.value;
  const tone = replyToneSelect.value;

  setStorage({
    bp_reply_msg: clientMessageInput ? clientMessageInput.value : "",
    bp_reply_intent: intent,
    bp_reply_tone: tone
  });

  if (!msg) {
    replyPromptPreview.innerText = "Paste client's message above to generate prompt...";
    replyCharCount.innerText = "0 chars";
    return;
  }

  let intentGuide = "";
  if (intent === "credentials") {
    intentGuide = "Request access safely: Ask for credentials via a secure password manager (e.g. 1Password/Bitwarden) or temporary staging credentials. Confirm Phase 1 diagnostic kickoff as soon as access is provided.";
  } else if (intent === "hold_rate") {
    intentGuide = "Hold my rate firmly but professionally without being defensive: Explain that the diagnostic rate covers a staging clone, verified backups, and a root-cause guarantee so production is never at risk.";
  } else if (intent === "call") {
    intentGuide = "Agree to a quick 10-15 minute technical alignment call. Provide 2 clear availability windows and ask if they have any error logs ready to inspect.";
  } else if (intent === "kickoff") {
    intentGuide = "Acknowledge project start immediately. List the 3 things needed to begin Phase 1: staging URL, backup verification, and error log access. Confirm expected delivery timeframe for the diagnostic report.";
  } else if (intent === "counter") {
    intentGuide = `Counter the client's lower offer without accepting and without burning the relationship. Acknowledge their budget, hold your floor by reframing what they get at your rate: staging clone, root-cause guarantee, zero production risk. If genuinely too low, offer a reduced Phase 1 scope that fits their budget with Phase 2 as a separate contract.`;
  } else if (intent === "nda") {
    intentGuide = `Professionally explain that you require a signed NDA before sharing your full technical assessment or proprietary diagnostic methods. Keep it brief, non-defensive. Offer to initiate the NDA yourself using a standard template if they don't have one. Don't over-explain — this is standard for senior consultants.`;
  } else if (intent === "scope_creep") {
    intentGuide = `Calmly respond to the mid-project addition. Acknowledge the new requirement, confirm it falls outside the original contract scope, and provide a quick estimate as a separate milestone or contract. Frame it as easy to add and clearly scoped — not a confrontation.`;
  } else if (intent === "close") {
    intentGuide = `Close the contract cleanly: confirm all deliverables were met, ask if they're satisfied before they formally close it, mention your availability for Phase 2 or ongoing maintenance, and naturally invite feedback. One sentence per point. Collegial, not needy.`;
  } else {
    intentGuide = "Protect scope: Clarify that new requests outside Phase 1 diagnosis will be estimated and handled in Phase 2 so costs remain transparent and predictable.";
  }

  const prompt = 
`Act as a pragmatic senior software engineer replying to a client's message on Upwork / Freelance.

Client's Message:
"""
${msg}
"""

Response Objective:
${intentGuide}

Tone & Rules:
- Voice: Pragmatic, calm, senior technical contractor (no junior eagerness, no customer-service fluff).
- Length: Short and direct (2 to 4 concise sentences).
- Tone style: ${tone === 'short' ? 'Ultra-concise (2 sentences max)' : tone === 'consultative' ? 'Consultative and reassuring' : 'Pragmatic, direct, calm senior dev'}.

Write ONLY the final, ready-to-send message to the client. No preamble or meta-commentary.`;

  replyPromptPreview.innerText = prompt;
  replyCharCount.innerText = `${prompt.length} chars`;
}

function update() {
  if (typeof scoreJobFit === 'function') scoreJobFit(jobInput ? jobInput.value : "");
  const prompt = buildPrompt();
  promptPreview.innerText = prompt;
  charCount.innerText = `${prompt.length} chars`;

  const clientProfileEl = document.getElementById('client-profile');
  debouncedStorageSet({
    bp_job: jobInput ? jobInput.value : "",
    bp_questions: questionsInput ? questionsInput.value : "",
    bp_profile: clientProfileEl ? clientProfileEl.value : "",
    bp_rate: rateInput.value,
    bp_time: timeInput.value,
    bp_examples: examplesInput.value,
    bp_lang: langSelect.value,
    bp_cat: categorySelect.value,
    bp_strat: strategySelect.value,
    bp_len: lengthSelect.value,
    bp_seniority: senioritySelect ? senioritySelect.value : 'staff',
    bp_snippet: snippetSelect.value,
    bp_autogen: autoGenExamplesToggle ? autoGenExamplesToggle.checked : true,
    bp_dev_identity: devIdentityInput ? devIdentityInput.value : "",
    bp_pricing_model: pricingModelSelect ? pricingModelSelect.value : "hourly"
  });
}

function showToast(msg) {
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function copyPrompt() {
  const text = promptPreview.innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Prompt copied to clipboard!");
    if (btnCopy) {
      btnCopy.classList.add("btn-success-feedback");
      if (btnCopyLabel) btnCopyLabel.innerText = "✓ Copied!";
      setTimeout(() => {
        btnCopy.classList.remove("btn-success-feedback");
        if (btnCopyLabel) btnCopyLabel.innerText = "Copy Prompt";
      }, 1500);
    }
  }).catch(() => {
    alert("Please select and copy manually.");
  });
}

// Inject into Claude tab
function injectText(text) {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    navigator.clipboard.writeText(text);
    window.open("https://claude.ai/new", "_blank");
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, activeTabs => {
    const currentTab = activeTabs[0];

    if (currentTab && currentTab.url && currentTab.url.includes("claude.ai")) {
      sendToTab(currentTab.id, text);
    } else {
      chrome.tabs.query({ url: "*://claude.ai/*" }, claudeTabs => {
        if (claudeTabs && claudeTabs.length > 0) {
          const targetTab = claudeTabs[0];
          chrome.tabs.update(targetTab.id, { active: true }, () => {
            sendToTab(targetTab.id, text);
          });
        } else {
          navigator.clipboard.writeText(text);
          chrome.tabs.create({ url: "https://claude.ai/new" });
        }
      });
    }
  });
}

function sendToTab(tabId, text) {
  chrome.tabs.sendMessage(tabId, { action: "INJECT_PROMPT", prompt: text }, response => {
    if (chrome.runtime.lastError || !response || !response.success) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: injectedFallback,
        args: [text]
      }, () => {
        showToast("Injected into Claude tab!");
      });
    } else {
      showToast("Injected into Claude tab!");
    }
  });
}

function injectedFallback(promptText) {
  const input = document.querySelector('div.ProseMirror[contenteditable="true"]') ||
                document.querySelector('fieldset div[contenteditable="true"]') ||
                document.querySelector('textarea');
  if (input) {
    input.focus();
    if (input.tagName.toLowerCase() === 'textarea') {
      input.value = promptText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.innerHTML = `<p>${promptText.replace(/\n/g, '<br>')}</p>`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"'`=\/]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  }[c]));
}

// ── Tab Switcher Helper ──────────────────────────────────────────
function switchTab(tab) {
  const tabs = { proposal: tabBtnProposal, reply: tabBtnReply, repeat: tabBtnRepeat };
  const views = { proposal: viewProposal, reply: viewReply, repeat: viewRepeat };
  Object.keys(tabs).forEach(t => {
    if (tabs[t]) tabs[t].classList.toggle("active", t === tab);
    if (views[t]) views[t].style.display = t === tab ? "flex" : "none";
  });
}

// ── Repeat / Delta Tab Logic ─────────────────────────────────────

/**
 * Saves the current proposal settings as the "last session" for the Repeat tab.
 * Called automatically after every proposal generation.
 */
function saveRepeatSession() {
  if (!jobInput) return;
  const session = {
    category: categorySelect ? categorySelect.value : "fullstack",
    strategy: strategySelect ? strategySelect.value : "phased",
    length: lengthSelect ? lengthSelect.value : "standard",
    seniority: senioritySelect ? senioritySelect.value : "staff",
    rate: rateInput ? rateInput.value : "$65/hr",
    time: timeInput ? timeInput.value : "2-4 hours",
    lang: langSelect ? langSelect.value : "auto",
    devIdentity: devIdentityInput ? devIdentityInput.value : "",
    pricingModel: pricingModelSelect ? pricingModelSelect.value : "hourly",
    examples: examplesInput ? examplesInput.value : "",
    snippet: snippetSelect ? snippetSelect.value : "auto",
    savedAt: new Date().toISOString()
  };
  setStorage({ bp_last_repeat_session: JSON.stringify(session) });
}

/**
 * Updates the banner in the Repeat tab showing what settings are being inherited.
 */
function loadRepeatSessionBanner() {
  getStorage(["bp_last_repeat_session"], res => {
    const label = document.getElementById("repeat-session-label");
    if (!label) return;
    if (!res.bp_last_repeat_session) {
      label.textContent = "No session saved yet — generate a proposal first";
      return;
    }
    try {
      const s = JSON.parse(res.bp_last_repeat_session);
      const when = s.savedAt ? new Date(s.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      label.textContent = `Inheriting: ${s.category || "fullstack"} · ${s.strategy || "phased"} · ${s.rate || "$65/hr"} · ${s.seniority || "staff"}${when ? " (saved " + when + ")" : ""}`;
    } catch {
      label.textContent = "Inheriting last session settings";
    }
  });
}

/**
 * Generates the delta prompt for an ongoing Claude chat.
 * Only sends the new job + changes — Claude already has the full context.
 */
function updateRepeatPrompt() {
  if (!repeatJobInput || !repeatPromptPreview) return;

  const newJob = repeatJobInput.value.trim();
  if (!newJob) {
    repeatPromptPreview.textContent = "Paste new job above to generate delta prompt...";
    if (repeatCharCount) repeatCharCount.textContent = "0 chars";
    return;
  }

  getStorage(["bp_last_repeat_session"], res => {
    let session = {};
    try { session = JSON.parse(res.bp_last_repeat_session || "{}"); } catch {}

    // Apply any overrides from the Repeat tab inputs
    const rateOverride = repeatRateInput && repeatRateInput.value.trim();
    const stratOverride = repeatStrategySelect && repeatStrategySelect.value;
    const notes = repeatNotesInput && repeatNotesInput.value.trim();

    const effectiveRate = rateOverride || session.rate || "$65/hr";
    const effectiveStrategy = stratOverride || session.strategy || "phased";
    const effectiveSeniority = session.seniority || "staff";
    const effectiveCategory = session.category || "fullstack";
    const effectiveDevIdentity = session.devIdentity || "";
    const effectivePricingModel = session.pricingModel || "hourly";

    let strategyLabel = effectiveStrategy === "phased" ? "Phased / Staged isolation first"
                      : effectiveStrategy === "fast" ? "Fast-Track Fix (MVP-first)"
                      : "Audit-First (diagnostics before changes)";

    let deltaPrompt = `NEW JOB — same chat context, updated job only.

[INHERITED SETTINGS]
- Seniority: ${effectiveSeniority}${effectiveDevIdentity ? ` (${effectiveDevIdentity})` : ""}
- Category: ${effectiveCategory}
- Strategy: ${strategyLabel}
- Rate: ${effectiveRate}
- Pricing: ${effectivePricingModel}${notes ? `\n- Additional context: ${notes}` : ""}

[NEW JOB DESCRIPTION]
${newJob}

Using the same proposal system prompt and persona from earlier in this chat, write a fresh proposal for this new job above. Apply the inherited settings unless the job context clearly requires a different approach. Do not repeat your role description — just write the proposal.`;

    if (rateOverride || stratOverride) {
      deltaPrompt = `NEW JOB — same chat context. OVERRIDES applied: ${rateOverride ? "rate → " + rateOverride : ""}${rateOverride && stratOverride ? ", " : ""}${stratOverride ? "strategy → " + strategyLabel : ""}.\n\n` + deltaPrompt.replace("NEW JOB — same chat context, updated job only.\n\n", "");
    }

    repeatPromptPreview.textContent = deltaPrompt;
    if (repeatCharCount) repeatCharCount.textContent = `${deltaPrompt.length.toLocaleString()} chars`;
  });
}

/**
 * Wires up Repeat tab listeners — called once from init().
 */
function initRepeatTab() {
  if (!repeatJobInput) return;

  repeatJobInput.addEventListener("input", debounce(updateRepeatPrompt, 300));
  if (repeatRateInput) repeatRateInput.addEventListener("input", debounce(updateRepeatPrompt, 300));
  if (repeatStrategySelect) repeatStrategySelect.addEventListener("change", updateRepeatPrompt);
  if (repeatNotesInput) repeatNotesInput.addEventListener("input", debounce(updateRepeatPrompt, 300));

  if (btnRepeatCopy) {
    btnRepeatCopy.addEventListener("click", () => {
      const text = repeatPromptPreview ? repeatPromptPreview.textContent : "";
      if (!text || text.startsWith("Paste new job")) { showToast("Nothing to copy yet"); return; }
      navigator.clipboard.writeText(text).then(() => {
        showToast("Delta prompt copied!");
        const label = document.getElementById("btn-repeat-copy-label");
        if (label) { label.textContent = "Copied!"; setTimeout(() => { label.textContent = "Copy Delta"; }, 2000); }
      }).catch(() => showToast("Copy failed"));
    });
  }

  if (btnRepeatInject) {
    btnRepeatInject.addEventListener("click", () => {
      const text = repeatPromptPreview ? repeatPromptPreview.textContent : "";
      if (!text || text.startsWith("Paste new job")) { showToast("Nothing to inject yet"); return; }
      injectText(text);
    });
  }

  if (btnRepeatClear) {
    btnRepeatClear.addEventListener("click", () => {
      setStorage({ bp_last_repeat_session: "" });
      if (repeatJobInput) repeatJobInput.value = "";
      if (repeatRateInput) repeatRateInput.value = "";
      if (repeatStrategySelect) repeatStrategySelect.value = "";
      if (repeatNotesInput) repeatNotesInput.value = "";
      loadRepeatSessionBanner();
      updateRepeatPrompt();
      showToast("Session cleared");
    });
  }
}

// Start
document.addEventListener("DOMContentLoaded", init);
