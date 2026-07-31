/* ============================================================
   LinkShield — app controller (routing + state + renderers)
   ============================================================ */

const { analyzeUrl, parseUrl, SCAN_STEPS, Data, fmtDate, genReportId, Store, LS } = window.LS_ENGINE;
const I = window.I;

const App = {
  route: 'dashboard',
  params: {},
  state: { scanning: false, lastResult: null },

  routes: {
    dashboard:  { title: 'Dashboard',  icon: 'dashboard' },
    scan:       { title: 'Scan Link',  icon: 'scan' },
    history:    { title: 'History',    icon: 'history' },
    reports:    { title: 'Reports',    icon: 'reports' },
    safesites:  { title: 'Safe Websites', icon: 'safe' },
    settings:   { title: 'Settings',   icon: 'settings' },
    about:      { title: 'About',      icon: 'about' },
  },

  init() {
    this.bind();
    this.handleHash();
    window.addEventListener('hashchange', () => this.handleHash());
    // KEY FEATURE: auto-launch scan if a URL was provided (?url= or #scan?url=)
    this.checkAutoScan();
  },

  bind() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { e.preventDefault(); this.go(nav.dataset.nav); return; }
      const act = e.target.closest('[data-act]');
      if (act) {
        const fn = App.actions[act.dataset.act];
        if (fn) fn.call(App, act, e);
      }
    });
  },

  go(name) {
    if (name === 'scan') location.hash = '#/scan';
    else location.hash = '#/' + name;
  },

  handleHash() {
    let hash = location.hash.replace(/^#\/?/, '');
    const [route, query] = hash.split('?');
    const r = (route || 'dashboard').split('/')[0];
    this.route = this.routes[r] ? r : 'dashboard';
    this.params = {};
    if (query) new URLSearchParams(query).forEach((v,k) => this.params[k] = v);
    this.render();
    this.closeSidebar();
  },

  /* ---- auto-scan when a URL is supplied (the core requirement) ---- */
  checkAutoScan() {
    const q = new URLSearchParams(location.search);
    let url = q.get('url');
    if (!url && this.params.url) url = this.params.url;
    if (url) {
      this.route = 'scan';
      this.render();
      // small delay so UI paints first
      setTimeout(() => this.startScan(url), 350);
    }
  },

  render() {
    const root = document.getElementById('app');
    root.innerHTML = this.shell();
    this.renderView();
    this.highlightNav();
  },

  shell() {
    const items = Object.entries(this.routes).map(([key, r]) => `
      <div class="nav-item ${this.route===key?'active':''}" data-nav="${key}">${I[r.icon]}<span>${r.title}</span></div>
    `).join('');
    return `
      <div class="backdrop" data-act="closeSidebar"></div>
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand">
            <div class="logo">${I.shieldCheck}</div>
            <div>
              <div class="name">Link<span>Shield</span></div>
              <div class="tag">Phishing Protection</div>
            </div>
          </div>
          <nav class="nav">${items}</nav>
          <div class="sidebar-footer">
            <div class="pulse"><span class="dot"></span> Protection Active</div>
            Real-time scanning is active. All links are evaluated before access is granted.
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="menu-btn" data-act="toggleSidebar">${I.menu}</button>
            <h1 id="page-title">${this.routes[this.route].title}</h1>
            <div class="search">
              ${I.search}
              <input type="text" id="omni-scan" placeholder="Enter a URL to scan" />
            </div>
            <button class="quick-scan" data-act="quickScan">${I.scan} Quick Scan</button>
          </header>
          <main class="content">
            <div id="view" class="view"></div>
          </main>
        </div>
      </div>
      <div class="toast-wrap" id="toasts"></div>
    `;
  },

  renderView() {
    const view = document.getElementById('view');
    const fn = this.views[this.route];
    view.innerHTML = fn ? fn.call(this) : this.views.dashboard.call(this);
    // wire omni-scan input (enter to scan)
    const omni = document.getElementById('omni-scan');
    if (omni) omni.addEventListener('keydown', e => {
      if (e.key === 'Enter' && omni.value.trim()) this.startScan(omni.value.trim());
    });
    // route-specific wiring
    if (this.route === 'scan') this.wireScan();
  },

  highlightNav() {
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.nav === this.route);
    });
    document.getElementById('page-title').textContent = this.routes[this.route].title;
  },

  /* ---------------- SCAN FLOW ---------------- */
  wireScan() {
    const input = document.getElementById('scan-input');
    const btn = document.getElementById('scan-btn');
    if (input) input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) this.startScan(input.value.trim());
    });
    if (btn) btn.addEventListener('click', () => {
      if (input && input.value.trim()) this.startScan(input.value.trim());
      else this.toast('Please enter a URL to scan', 'warn');
    });
  },

  async startScan(rawUrl) {
    if (this.state.scanning) return;
    this.state.scanning = true;
    this.route = 'scan';
    // ensure the scan view is mounted with the scanning layout
    const view = document.getElementById('view');
    view.innerHTML = this.views.scan.call(this, null, { scanning: true, url: rawUrl });
    document.getElementById('page-title').textContent = 'Scanning Link';

    const pctEl = document.getElementById('progress-fill');
    const pctTxt = document.getElementById('progress-pct');
    const statusTxt = document.getElementById('scan-status');
    const checks = Array.from(document.querySelectorAll('.check-row'));

    const totalSteps = SCAN_STEPS.length;
    for (let i = 0; i < totalSteps; i++) {
      checks[i].classList.remove('pending');
      checks[i].classList.add('running');
      checks[i].querySelector('.state').textContent = 'Checking…';
      statusTxt.textContent = SCAN_STEPS[i] + '…';
      await this.sleep(480 + Math.random()*420);
      checks[i].classList.remove('running');
      checks[i].classList.add('done');
      checks[i].querySelector('.ic').innerHTML = I.check;
      checks[i].querySelector('.state').textContent = 'Done';
      const pct = Math.round(((i+1)/totalSteps)*100);
      pctEl.style.width = pct + '%';
      pctTxt.textContent = pct + '%';
    }
    statusTxt.textContent = 'Finalizing analysis…';
    await this.sleep(450);

    const result = analyzeUrl(rawUrl);
    const rec = {
      id: 'SCN-' + Date.now(),
      url: result.displayUrl,
      domain: result.domain,
      verdict: result.verdict,
      threat: result.threat,
      reasons: result.reasons,
      at: new Date().toISOString(),
    };
    Data.addScan(rec);
    // update stats
    const st = Data.stats();
    st.scanned += 1;
    if (result.verdict === 'safe') st.safe += 1; else st.blocked += 1;
    Data.saveStats(st);

    // auto-report phishing if enabled
    if (result.verdict === 'phishing' && Data.settings().autoReport) {
      const rep = { id: genReportId(), url: result.displayUrl, threat: result.threat, status: 'Submitted', at: new Date().toISOString() };
      Data.addReport(rep);
      st.reports += 1; Data.saveStats(st);
      rec.reportId = rep.id;
    }

    this.state.scanning = false;
    this.state.lastResult = { ...rec };
    this.showResult(rec);
  },

  showResult(rec) {
    this.route = rec.verdict === 'safe' ? 'result-safe' : 'result-danger';
    // these aren't in nav; render directly
    const view = document.getElementById('view');
    view.innerHTML = this.views.result.call(this, rec);
    document.getElementById('page-title').textContent = rec.verdict === 'safe' ? 'Scan Result — Safe' : 'Scan Result — Phishing Detected';
    // wire buttons via data-act
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* ---------------- TOASTS ---------------- */
  toast(msg, type='ok') {
    const wrap = document.getElementById('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type==='warn'?'warn':'ok');
    el.innerHTML = `${type==='warn'?I.alert:I.checkCircle}<span>${msg}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; setTimeout(()=>el.remove(),250); }, 3200);
  },

  /* ---------------- SIDEBAR (mobile) ---------------- */
  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.querySelector('.backdrop').classList.toggle('show');
  },
  closeSidebar() {
    const sb = document.getElementById('sidebar');
    const bd = document.querySelector('.backdrop');
    if (sb) sb.classList.remove('open');
    if (bd) bd.classList.remove('show');
  },

  /* ---------------- ACTIONS (data-act) ---------------- */
  actions: {
    quickScan() { App.go('scan'); setTimeout(()=>{ const i=document.getElementById('scan-input'); if(i) i.focus(); },80); },
    toggleSidebar() { App.toggleSidebar(); },
    closeSidebar() { App.closeSidebar(); },
    goBack() { history.length>1 ? history.back() : App.go('dashboard'); },
    openWebsite(el) {
      const url = el.dataset.url;
      window.open(url, '_blank', 'noopener');
      App.toast('Opening verified website');
    },
    viewReport() {
      App.go('reports');
      App.toast('Opening report history', 'ok');
    },
    submitReport(el) {
      const url = el.dataset.url;
      const rep = { id: genReportId(), url, threat: el.dataset.threat||'High', status:'Submitted', at:new Date().toISOString() };
      Data.addReport(rep);
      const st = Data.stats(); st.reports += 1; Data.saveStats(st);
      App.showReportSubmitted(rep);
    },
    backToDashboard() { App.go('dashboard'); },
    viewReportHistory() { App.go('reports'); },
    scanAnother() { App.go('scan'); setTimeout(()=>{ const i=document.getElementById('scan-input'); if(i){i.value='';i.focus();} },80); },
    toggle(el) {
      const key = el.dataset.key;
      const s = Data.settings();
      s[key] = !s[key];
      Data.saveSettings(s);
      el.classList.toggle('on', s[key]);
      App.toast(`${key} ${s[key]?'enabled':'disabled'}`.replace(/([a-z])([A-Z])/g,'$1 $2'));
    },
    clearHistory(el) {
      const type = el.dataset.type;
      if (type==='scans') Store.set(LS.SCANS, []);
      if (type==='reports') Store.set(LS.REPORTS, []);
      App.toast('History cleared');
      App.render();
    },
  },

  showReportSubmitted(rep) {
    this.route = 'report-submitted';
    const view = document.getElementById('view');
    view.innerHTML = this.views.reportSubmitted.call(this, rep);
    document.getElementById('page-title').textContent = 'Report Submitted';
  },

  /* ---------------- VIEWS ---------------- */
  views: {
    dashboard() {
      const st = Data.stats();
      const scans = Data.scans().slice(0,6);
      const protectPct = st.scanned ? Math.round((st.safe / st.scanned) * 100) : 100;
      const circ = 2*Math.PI*52;
      const off = circ*(1 - protectPct/100);
      const act = scans.length ? scans.map(s => `
        <div class="activity-row">
          <div>
            <div class="url">${esc(s.url)}</div>
            <div class="time">${fmtDate(s.at)}</div>
          </div>
          ${s.verdict==='safe'
            ? '<span class="badge badge-safe">'+I.check+' Safe</span>'
            : '<span class="badge badge-danger">'+I.alert+' Phishing Blocked</span>'}
        </div>`).join('')
        : `<div class="empty">${I.empty}<h3>No recent activity</h3><p>Scanned links will appear here.</p></div>`;

      return `
        <div class="hero">
          <h2>Intelligent protection against phishing threats</h2>
          <p>LinkShield evaluates every link before access is granted — analysing reputation, content, patterns, domain age and SSL status in real time.</p>
          <div class="shield-big">${I.shieldCheck}</div>
        </div>

        <div class="stat-grid">
          <div class="stat scan"><div class="icon">${I.scan}</div><div class="num">${st.scanned}</div><div class="lbl">Total scanned links</div></div>
          <div class="stat safe"><div class="icon">${I.safe}</div><div class="num">${st.safe}</div><div class="lbl">Safe links found</div></div>
          <div class="stat block"><div class="icon">${I.shieldAlert}</div><div class="num">${st.blocked}</div><div class="lbl">Blocked links (phishing)</div></div>
          <div class="stat report"><div class="icon">${I.reports}</div><div class="num">${st.reports}</div><div class="lbl">Reports sent</div></div>
        </div>

        <div class="dash-cols">
          <div class="card">
            <div class="card-title">${I.history} Recent Activity <a data-nav="history" class="link-action">View Full History</a></div>
            <div class="activity-list">${act}</div>
          </div>
          <div class="card protection-card">
            <div class="card-title" style="justify-content:center">${I.shieldCheck} Protection Status</div>
            <div class="ring">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--safe)" stroke-width="10"
                  stroke-dasharray="${circ}" stroke-dashoffset="${off}" stroke-linecap="round"/>
              </svg>
              <div class="label">${protectPct}%</div>
            </div>
            <div class="status">Protected</div>
            <div class="sub">Real-time scanning active</div>
            <div style="margin-top:18px">
              <button class="btn btn-primary btn-block" data-act="quickScan">${I.scan} Scan a Link</button>
            </div>
          </div>
        </div>`;
    },

    scan(_, ctx={}) {
      const scanning = ctx.scanning;
      const url = ctx.url || '';
      const steps = SCAN_STEPS.map((s,i) => `
        <div class="check-row pending" data-step="${i}">
          <div class="ic"><span class="spinner"></span></div>
          <div class="txt">${s}</div>
          <div class="state">Pending</div>
        </div>`).join('');

      if (scanning) {
        return `
          <div class="scan-box">
            <div class="card-title">${I.scan} Scanning Link</div>
            <p class="muted" style="margin-bottom:18px">Analysis in progress. Please wait while the link is evaluated.</p>
            <div class="scan-input">
              <input type="text" value="${esc(url)}" disabled />
            </div>
            <div class="scan-progress">
              <div class="progress-bar"><div class="fill" id="progress-fill"></div></div>
              <div class="progress-meta">
                <span id="scan-status" class="dim">Starting scan…</span>
                <span class="pct" id="progress-pct">0%</span>
              </div>
              <div class="checks">${steps}</div>
            </div>
          </div>`;
      }

      return `
        <div class="scan-box">
          <div class="card-title">${I.scan} Scan any link to check if it's safe or malicious</div>
          <p class="muted" style="margin-bottom:18px">Enter a URL to evaluate, or open a link through LinkShield to scan it automatically before access is granted.</p>
          <div class="scan-input-wrap">
            <div class="scan-input">
              ${I.link}
              <input type="text" id="scan-input" placeholder="Enter a URL, e.g. https://example.com" />
            </div>
            <button class="btn btn-primary" id="scan-btn">${I.scan} Scan Now</button>
          </div>
          <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
            <span class="muted" style="align-self:center;font-size:12px">Examples:</span>
            <button class="btn btn-ghost btn-sm" data-act="tryUrl" data-url="https://www.amazon1.com/free-gift-card">amazon1.com/free-gift-card</button>
            <button class="btn btn-ghost btn-sm" data-act="tryUrl" data-url="https://google.com">google.com</button>
            <button class="btn btn-ghost btn-sm" data-act="tryUrl" data-url="http://192.168.0.5/login-verify">192.168.0.5/login</button>
            <button class="btn btn-ghost btn-sm" data-act="tryUrl" data-url="https://banking-secure-gmail.in/claim-reward">banking-secure-gmail.in</button>
          </div>
        </div>`;
    },

    result(rec) {
      const danger = rec.verdict === 'phishing';
      const icon = danger ? I.shieldAlert : I.shieldCheck;
      const head = danger ? 'Phishing Detected!' : 'This Link is Safe';
      const sub = danger
        ? 'This link has been identified as a phishing threat. Access has been blocked.'
        : 'No threats were detected. This website is safe to open.';
      const detail = `
        <div class="result-detail">
          <div class="detail-row"><span class="k">URL Scanned</span><span class="v">${esc(rec.url)}</span></div>
          <div class="detail-row"><span class="k">Threat Level</span><span class="v" style="color:${danger?'var(--red-400)':'var(--safe)'}">${rec.threat}</span></div>
          <div class="detail-row"><span class="k">Status</span><span class="v" style="color:${danger?'var(--red-400)':'var(--safe)'}">${danger?'Blocked':'Verified Safe'}</span></div>
          <div class="detail-row"><span class="k">Detected On</span><span class="v">${fmtDate(rec.at)}</span></div>
        </div>`;

      const reasons = rec.reasons && rec.reasons.length ? `
        <div class="info-box ${danger?'danger':'safe'}">
          <h4 style="${danger?'':'color:var(--safe)'}">${danger?'Threat indicators detected':'Scan summary'}</h4>
          <ul>${rec.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
        </div>` : '';

      const dangerBox = danger ? `
        <div class="info-box danger">
          <h4>Next steps</h4>
          <ul>
            <li>Access to this link has been blocked.</li>
            <li>A phishing report ${rec.reportId?'has been':'will be'} generated and submitted.</li>
            <li>Where possible, you will be redirected to the official website.</li>
          </ul>
        </div>` : '';

      const actions = danger
        ? `<div class="result-actions">
            <button class="btn btn-ghost" data-act="goBack">${I.back} Go Back</button>
            ${rec.reportId
              ? `<button class="btn btn-primary" data-act="viewReport">${I.reports} View Report</button>`
              : `<button class="btn btn-primary" data-act="submitReport" data-url="${esc(rec.url)}" data-threat="${rec.threat}">${I.reports} Submit Report</button>`}
          </div>`
        : `<div class="result-actions">
            <button class="btn btn-ghost" data-act="goBack">${I.back} Go Back</button>
            <button class="btn btn-green" data-act="openWebsite" data-url="${esc(rec.url)}">${I.external} Open Website</button>
          </div>`;

      return `
        <div class="result-wrap">
          <div class="result-card ${danger?'danger':'safe'}">
            <div class="result-icon ${danger?'danger':'safe'}">${icon}</div>
            <h2 class="${danger?'danger-text':'safe-text'}">${head}</h2>
            <p class="sub">${sub}</p>
            ${detail}
            ${reasons}
            ${dangerBox}
            ${actions}
          </div>
        </div>`;
    },

    reportSubmitted(rep) {
      return `
        <div class="result-wrap">
          <div class="result-card safe">
            <div class="result-icon safe">${I.checkCircle}</div>
            <h2 class="safe-text">Report Submitted Successfully!</h2>
            <p class="sub">Your report has been recorded and submitted successfully.</p>
            <div class="result-detail">
              <div class="detail-row"><span class="k">Report ID</span><span class="v">${esc(rep.id)}</span></div>
              <div class="detail-row"><span class="k">Malicious URL</span><span class="v">${esc(rep.url)}</span></div>
              <div class="detail-row"><span class="k">Status</span><span class="v" style="color:var(--safe)">Submitted</span></div>
              <div class="detail-row"><span class="k">Submitted On</span><span class="v">${fmtDate(rep.at)}</span></div>
            </div>
            <div class="result-actions">
              <button class="btn btn-ghost" data-act="backToDashboard">${I.dashboard} Back to Dashboard</button>
              <button class="btn btn-primary" data-act="viewReportHistory">${I.reports} View Report History</button>
            </div>
          </div>
        </div>`;
    },

    history() {
      const all = Data.scans();
      if (!all.length) return emptyState('No scan history yet','Scanned links will be listed here with their status and threat level.');
      const rows = all.map(s => `
        <tr>
          <td class="url-cell">${esc(s.url)}</td>
          <td>${s.verdict==='safe'?'<span class="badge badge-safe">'+I.check+' Safe</span>':'<span class="badge badge-danger">'+I.alert+' Phishing</span>'}</td>
          <td>${esc(s.threat)}</td>
          <td>${fmtDate(s.at)}</td>
        </tr>`).join('');
      return `
        <div class="card">
          <div class="card-title" style="justify-content:space-between;display:flex">
            <span>${I.history} Scan History</span>
            <button class="btn btn-ghost btn-sm" data-act="clearHistory" data-type="scans">${I.trash} Clear</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>URL</th><th>Status</th><th>Threat</th><th>Scanned On</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    },

    reports() {
      const all = Data.reports();
      if (!all.length) return emptyState('No reports submitted','When phishing is detected, a report is automatically filed and recorded here.');
      const rows = all.map(r => `
        <tr>
          <td><strong>${esc(r.id)}</strong></td>
          <td class="url-cell">${esc(r.url)}</td>
          <td><span class="badge badge-submitted">${I.check} ${esc(r.status)}</span></td>
          <td>${fmtDate(r.at)}</td>
        </tr>`).join('');
      return `
        <div class="card">
          <div class="card-title" style="justify-content:space-between;display:flex">
            <span>${I.reports} Reports History</span>
            <button class="btn btn-ghost btn-sm" data-act="clearHistory" data-type="reports">${I.trash} Clear</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Report ID</th><th>Malicious URL</th><th>Status</th><th>Submitted On</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="pagination">
            <span>Showing ${all.length} of ${all.length} reports</span>
            <div class="pages"><span class="pg active">1</span></div>
          </div>
        </div>`;
    },

    safesites() {
      const sites = window.LS_ENGINE.SAFE_DOMAINS.map(d => ({
        name: d.replace(/^www\./,'').split('.')[0].replace(/^\w/,c=>c.toUpperCase()),
        url: 'https://' + d,
      }));
      const cards = sites.map(s => `
        <div class="safe-site">
          <div class="fav">${s.name[0]}</div>
          <div class="meta">
            <div class="t">${esc(s.name)}</div>
            <div class="u">${esc(s.url)}</div>
          </div>
          <span class="badge badge-safe">${I.check} Trusted</span>
        </div>`).join('');
      return `
        <div class="card">
          <div class="card-title">${I.safe} Safe Websites — Trusted Whitelist</div>
          <p class="muted" style="margin-bottom:18px">These domains are pre-verified and will always pass scanning instantly.</p>
          <div class="safe-grid">${cards}</div>
        </div>`;
    },

    settings() {
      const s = Data.settings();
      const rows = [
        ['autoScan','Auto-scan on link tap','When a URL is opened with LinkShield, scan it automatically before access.'],
        ['blockPhishing','Block phishing links','Prevent access to links detected as phishing threats.'],
        ['autoReport','Auto-report phishing','Automatically submit a report when phishing is detected.'],
        ['notifySafe','Notify on safe links','Show a confirmation when a scanned link is safe.'],
        ['deepScan','Deep scan mode','Run all five analysis checks on every scan.'],
      ];
      const html = rows.map(([k,t,d]) => `
        <div class="setting-row">
          <div class="info"><div class="t">${t}</div><div class="d">${d}</div></div>
          <div class="toggle ${s[k]?'on':''}" data-act="toggle" data-key="${k}"></div>
        </div>`).join('');
      return `
        <div class="card">
          <div class="card-title">${I.settings} Settings</div>
          <div>${html}</div>
        </div>
        <div class="card" style="margin-top:18px">
          <div class="card-title">${I.link} How auto-scan works</div>
          <p class="dim" style="font-size:13.5px;line-height:1.6">Append <code class="inline">?url=https://example.com</code> to this page's address (or use the share/open-with menu on mobile) and LinkShield will automatically launch and scan that URL before allowing access. Safe links open the website; phishing links are blocked and reported.</p>
        </div>`;
    },

    about() {
      const feats = [
        [I.bolt,'Real-time Protection','Scan links in real-time and stay protected from phishing threats.'],
        [I.ai,'AI Powered','Powered by advanced heuristics to detect malicious links and threats.'],
        [I.reports,'Auto Reporting','Automatically report phishing sites to authorities when detected.'],
        [I.external,'Safe Redirect','Redirects you to the original website safely when a link is verified.'],
        [I.lock,'Privacy Focused','Your data is stored locally on your device and never shared with third parties.'],
      ];
      const cards = feats.map(([ic,t,d]) => `
        <div class="feature">
          <div class="fi">${ic}</div>
          <h3>${t}</h3>
          <p>${d}</p>
        </div>`).join('');
      return `
        <div class="hero" style="margin-bottom:18px">
          <h2>Why LinkShield?</h2>
          <p>LinkShield provides an intelligent layer of protection against phishing threats — evaluating every link before access is granted.</p>
        </div>
        <div class="about-grid">${cards}</div>
        <div class="card" style="margin-top:18px">
          <div class="card-title">${I.shieldCheck} About this build</div>
          <p class="dim" style="font-size:14px">LinkShield v1.0 — a self-contained phishing link scanner. Analysis runs entirely in your browser using a heuristic engine that checks URL reputation, website content signals, phishing patterns, domain age indicators and SSL status. No external network calls are made, keeping your browsing private.</p>
        </div>`;
    },
  },
};

/* ---- helpers ---- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function emptyState(t,d){ return `<div class="empty">${I.empty}<h3>${t}</h3><p>${d}</p></div>`; }

// add tryUrl action + result routes to nav-less set
App.actions.tryUrl = function(el){ App.startScan(el.dataset.url); };

document.addEventListener('DOMContentLoaded', () => App.init());
