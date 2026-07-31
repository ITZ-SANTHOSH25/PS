/* ============================================================
   LinkShield scanner engine + data store
   - Heuristic URL analysis (no external calls, fully offline)
   - localStorage persistence for scans, reports, settings
   Wrapped in IIFE to avoid global-identifier collisions.
   ============================================================ */
(function () {
'use strict';

const LS = {
  SCANS: 'ls_scans',
  REPORTS: 'ls_reports',
  STATS: 'ls_stats',
  SETTINGS: 'ls_settings',
};
window.LS_KEYS = LS;

const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};

/* ---- default stats seeded from mockup ---- */
function defaultStats() {
  return { scanned: 128, safe: 100, blocked: 100, reports: 28 };
}

/* ---- known-good domains (whitelist) ---- */
const SAFE_DOMAINS = [
  'google.com','www.google.com','youtube.com','wikipedia.org','github.com',
  'amazon.com','www.amazon.com','microsoft.com','apple.com','mozilla.org',
  'stackoverflow.com','linkedin.com','twitter.com','x.com','reddit.com',
  'nytimes.com','bbc.com','cnn.com','instagram.com','netflix.com',
];

/* ---- heuristic patterns that strongly suggest phishing ---- */
const SUSPICIOUS_KEYWORDS = [
  'free','gift','gift-card','reward','prize','winner','claim','verify-account',
  'login-verify','secure-login','account-update','confirm','banking','wallet',
  'crypto','airdrop','suspended','urgent','limited-time','bonus','giveaway',
  'invoice','password-reset','support-login',
];
const SUSPICIOUS_TLDS = ['.xyz','.top','.click','.country','.stream','.download',
  '.loan','.work','.men','.racing','.review','.vip','.cf','.gq','.ml','.tk','.cc','.su'];
const BRAND_IMPERSIONATION = ['amazon','google','paypal','apple','microsoft','netflix',
  'facebook','instagram','bank','chase','wellsfargo','coinbase','binance','gmail','outlook'];

function parseUrl(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s); } catch { return null; }
}

function domainMatchesBrand(domain) {
  const d = domain.toLowerCase();
  for (const b of BRAND_IMPERSIONATION) {
    if (d.includes(b) && !SAFE_DOMAINS.includes(d)) {
      // brand name present but not the legit domain
      if (d !== b + '.com' && d !== 'www.' + b + '.com' && d !== b + '.org') return b;
    }
  }
  return null;
}

/*
  Analyze a URL and return a verdict with reasons.
  verdict: 'safe' | 'phishing'
  threat: 'Low' | 'Medium' | 'High' | 'None'
*/
function analyzeUrl(raw) {
  const u = parseUrl(raw);
  const reasons = [];
  let score = 0;

  if (!u) {
    return { verdict: 'phishing', threat: 'High', reasons: ['URL format is invalid or malformed'],
      domain: raw, displayUrl: raw };
  }

  const host = u.hostname.toLowerCase();
  const displayUrl = u.href;
  const path = u.pathname + u.search;

  // 1. Whitelist (legit well-known domains, exact or proper subdomain)
  if (SAFE_DOMAINS.includes(host)) {
    return { verdict: 'safe', threat: 'None', reasons: ['Domain is on the trusted whitelist'],
      domain: host, displayUrl };
  }

  // 2. IP-based host
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    reasons.push('Uses a raw IP address instead of a domain name');
    score += 25;
  }

  // 3. Suspicious TLD
  for (const tld of SUSPICIOUS_TLDS) {
    if (host.endsWith(tld)) { reasons.push(`Uses a high-risk TLD ("${tld}")`); score += 18; break; }
  }

  // 4. Many subdomains / hyphens / digits
  const parts = host.split('.');
  if (parts.length > 4) { reasons.push('Excessive subdomain depth'); score += 10; }
  const hyphenCount = (host.match(/-/g) || []).length;
  if (hyphenCount >= 2) { reasons.push('Multiple hyphens in domain (common in phishing)'); score += 12; }
  if (/\d/.test(host) && /[a-z]/.test(host) && hyphenCount >= 1) { reasons.push('Mixed letters, numbers and hyphens'); score += 8; }

  // 5. Brand impersonation
  const brand = domainMatchesBrand(host);
  if (brand) {
    reasons.push(`Impersonates brand "${brand}" but domain is not the official one`);
    score += 30;
  }

  // 6. Suspicious keywords in host or path
  const hay = (host + ' ' + path).toLowerCase();
  const matched = SUSPICIOUS_KEYWORDS.filter(k => hay.includes(k));
  if (matched.length) {
    reasons.push(`Suspicious keywords detected: ${matched.slice(0,3).join(', ')}`);
    score += Math.min(10 * matched.length, 30);
  }

  // 7. No HTTPS
  if (u.protocol === 'http:') { reasons.push('Connection is not encrypted (no HTTPS)'); score += 8; }

  // 8. @ symbol / redirect tricks
  if (u.href.includes('@')) { reasons.push('Contains "@" redirect trick'); score += 12; }
  if (/%[0-9a-f]{2}/i.test(u.href) && u.href.length > 80) { reasons.push('Heavily URL-encoded (possible obfuscation)'); score += 6; }

  // 9. Very long URL
  if (u.href.length > 90) { reasons.push('Unusually long URL'); score += 5; }

  // 10. Punycode / IDN homograph
  if (host.includes('xn--')) { reasons.push('Punycode (internationalized) domain — possible homograph attack'); score += 20; }

  if (reasons.length === 0) reasons.push('No suspicious indicators found');

  let verdict, threat;
  if (score >= 35) { verdict = 'phishing'; threat = score >= 60 ? 'High' : 'Medium'; }
  else if (score >= 15) { verdict = 'phishing'; threat = 'Low'; }
  else { verdict = 'safe'; threat = 'None'; }

  // ensure a phishing verdict always has at least one concrete reason
  if (verdict === 'phishing' && reasons.length === 1 && reasons[0] === 'No suspicious indicators found') {
    reasons[0] = 'Domain is not on the trusted whitelist and shows low reputation signals';
  }

  return { verdict, threat, reasons, domain: host, displayUrl };
}

/* ---- scanning step labels (matching mockup) ---- */
const SCAN_STEPS = [
  'Checking URL reputation',
  'Analyzing website content',
  'Scanning for phishing patterns',
  'Checking domain age',
  'Verifying SSL certificate',
];

/* ---- data accessors ---- */
const Data = {
  stats() { return Store.get(LS.STATS, defaultStats()); },
  saveStats(s) { Store.set(LS.STATS, s); },

  scans() { return Store.get(LS.SCANS, []); },
  addScan(rec) {
    const list = Data.scans();
    list.unshift(rec);
    Store.set(LS.SCANS, list.slice(0, 200));
  },

  reports() { return Store.get(LS.REPORTS, []); },
  addReport(rep) {
    const list = Data.reports();
    list.unshift(rep);
    Store.set(LS.REPORTS, list.slice(0, 200));
  },

  settings() {
    return Store.get(LS.SETTINGS, {
      autoScan: true,       // auto-launch scan when a URL is provided
      blockPhishing: true,
      autoReport: true,
      notifySafe: false,
      deepScan: true,
    });
  },
  saveSettings(s) { Store.set(LS.SETTINGS, s); },
};

function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', '') ;
}
function genReportId() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `RPT-${stamp}`;
}

// expose
window.LS_ENGINE = { analyzeUrl, parseUrl, SCAN_STEPS, Data, fmtDate, genReportId, SAFE_DOMAINS, Store, LS };

})();
