'use strict';

/* ============================================================
   crashcourse — App Controller
   Single-file ES module: routing, rendering, search, theming
   ============================================================ */

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICONS = {
  container: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  layers:    `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  cloud:     `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  eye:       `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  rocket:    `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
  terminal:  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  git:       `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  globe:     `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  database:  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  shield:    `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  clipboard: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>`,
  brain:     `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.98-3 2.5 2.5 0 0 1-1.32-4.24 3 3 0 0 1 .34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.1-1.98Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.98-3 2.5 2.5 0 0 0 1.32-4.24 3 3 0 0 0-.34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.1-1.98Z"/></svg>`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const $id = (id) => document.getElementById(id);

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Base URL for fetching markdown — works on GitHub Pages and locally
const MD_BASE = '../';  // Works for both local dev and GitHub Pages (entire repo deployed)

function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function hlMark(text, q) {
  if (!q) return esc(text);
  const re = new RegExp(`(${esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return esc(text).replace(re, '<mark>$1</mark>');
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function initTheme() {
  const stored = localStorage.getItem('cc-theme');
  const prefer = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(stored || prefer);
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $id('ic-sun').classList.toggle('hidden', t === 'light');
  $id('ic-moon').classList.toggle('hidden', t === 'dark');
  localStorage.setItem('cc-theme', t);
}

$id('theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  setTheme(cur === 'dark' ? 'light' : 'dark');
  initMermaid();
});

// ── Progress & Bookmarks (localStorage) ──────────────────────────────────────
const STORAGE_KEYS = {
  read:      'cc-read',       // JSON array of "catId/file" strings
  bookmarks: 'cc-bookmarks',  // JSON array of "catId/file" strings
  history:   'cc-history',    // JSON array of { key:"catId/file", ts:number }
};

function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function storageSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}
function isRead(key)       { return storageGet(STORAGE_KEYS.read).includes(key); }
function isBookmarked(key) { return storageGet(STORAGE_KEYS.bookmarks).includes(key); }

function toggleRead(key) {
  const arr = storageGet(STORAGE_KEYS.read);
  const idx = arr.indexOf(key);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(key);
  storageSet(STORAGE_KEYS.read, arr);
  return idx < 0;
}
function toggleBookmark(key) {
  const arr = storageGet(STORAGE_KEYS.bookmarks);
  const idx = arr.indexOf(key);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(key);
  storageSet(STORAGE_KEYS.bookmarks, arr);
  return idx < 0;
}
function recordHistory(key) {
  let arr = storageGet(STORAGE_KEYS.history);
  arr = arr.filter(h => h.key !== key);
  arr.unshift({ key, ts: Date.now() });
  if (arr.length > 20) arr.length = 20;
  storageSet(STORAGE_KEYS.history, arr);
}
function getReadCount() { return storageGet(STORAGE_KEYS.read).length; }
function getCategoryProgress(catId, courses) {
  const readSet = new Set(storageGet(STORAGE_KEYS.read));
  let done = 0;
  courses.forEach(c => { if (readSet.has(`${catId}/${c.file}`)) done++; });
  return done;
}
function getTotalCourseCount() {
  if (!INDEX) return 0;
  return INDEX.categories.reduce((sum, cat) => sum + cat.courses.length, 0);
}

// ── State ─────────────────────────────────────────────────────────────────────
let INDEX      = null;   // course-index.json data
let SEARCH_MAP = null;   // Map<"cat/file", { title, content }>
let INDEXING   = false;

// ── Course index ──────────────────────────────────────────────────────────────
async function loadIndex() {
  if (INDEX) return INDEX;
  try {
    const r = await fetch('./data/course-index.json');
    if (!r.ok) throw new Error(`${r.status}`);
    INDEX = await r.json();
    return INDEX;
  } catch(e) {
    console.error('Failed to load course-index.json', e);
    return null;
  }
}

// ── Routing ───────────────────────────────────────────────────────────────────
function go(path) {
  window.location.hash = path || '/';
}

function parseRoute() {
  const h = window.location.hash.replace(/^#\/?/,'');
  const p = h.split('/').filter(Boolean);
  return { cat: p[0]||null, file: p[1]||null, extra: p[2]||null };
}

window.addEventListener('hashchange', route);

async function route() {
  const { cat, file, extra } = parseRoute();
  if (!cat) { showView('hero'); syncNavTabs('courses'); return; }
  if (cat === 'labs' && !file) { showView('labs'); syncNavTabs('labs'); await renderLabsListing(); return; }
  if (cat === 'labs' && file) { showView('labDetail'); syncNavTabs('labs'); await renderLabDetail(file, extra); return; }
  if (cat === 'how-to-use') { showView('reader'); syncNavTabs('courses'); await renderHowToUse(); return; }
  if (cat && !file) { showView('list'); syncNavTabs('courses'); await renderList(cat); return; }
  if (cat && file) { showView('reader'); syncNavTabs('courses'); await renderReader(cat, file); return; }
}

// ── Views ─────────────────────────────────────────────────────────────────────
const VIEWS = { hero: 'hero-view', list: 'list-view', reader: 'reader-view', labs: 'labs-view', labDetail: 'lab-detail-view' };

function showView(name) {
  Object.entries(VIEWS).forEach(([k, id]) => {
    const el = $id(id);
    if (k === name) {
      el.classList.remove('hidden');
      el.classList.remove('view');
      void el.offsetWidth; // force reflow to replay animation
      el.classList.add('view');
      window.scrollTo(0, 0);
    } else {
      el.classList.add('hidden');
    }
  });
  // Refresh progress/bookmarks when returning to hero or list
  if (name === 'hero') {
    refreshHeroSections();
    renderCategories();
  }
}

// ── Counters ──────────────────────────────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('.stat-num[data-target]').forEach((el) => {
    const target = +el.dataset.target;
    const suffix = el.dataset.suffix || '';
    const dur = 1500;
    const t0 = performance.now();
    function easeOutExpo(t) {
      return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }
    function tick(now) {
      const prog = Math.min((now - t0) / dur, 1);
      const eased = easeOutExpo(prog);
      el.textContent = Math.round(eased * target) + suffix;
      if (prog < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ── Render: categories grid ───────────────────────────────────────────────────
async function renderCategories() {
  const data = await loadIndex();
  if (!data) return;
  const grid = $id('cat-grid');
  grid.innerHTML = '';

  data.categories.forEach((cat) => {
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${cat.label}, ${cat.courses.length} courses`);
    card.style.setProperty('--c-alpha', hexRgba(cat.color, 0.07));

    const sampleTitles = cat.courses.slice(0,3).map(c => c.title);

    const done = getCategoryProgress(cat.id, cat.courses);
    const total = cat.courses.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    card.innerHTML = `
      <div class="cat-top">
        <div class="cat-icon-wrap" style="background:${hexRgba(cat.color,0.12)};color:${cat.color}">
          ${ICONS[cat.icon] || ICONS.rocket}
        </div>
        <svg class="cat-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 17L17 7M7 7h10v10"/>
        </svg>
      </div>
      <div class="cat-body">
        <div class="cat-name">${esc(cat.label)}</div>
        <div class="cat-count">${total} course${total!==1?'s':''}</div>
      </div>
      <div class="cat-pills">
        ${sampleTitles.map(t=>`<span class="cat-pill-tag">${esc(t)}</span>`).join('')}
      </div>
      <div class="cat-progress">
        <div class="cat-progress-bar"><div class="cat-progress-fill" style="width:${pct}%"></div></div>
        ${done > 0 ? `<div class="cat-progress-text">${done}/${total} completed</div>` : ''}
      </div>
    `;

    const open = () => go(`/${cat.id}`);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' '){e.preventDefault();open();} });
    grid.appendChild(card);
  });
}

// ── Render: course list ───────────────────────────────────────────────────────
async function renderList(catId) {
  const data = await loadIndex();
  if (!data) return;
  const cat = data.categories.find(c => c.id === catId);
  if (!cat) { go('/'); return; }

  const iconEl = $id('list-icon');
  iconEl.innerHTML = ICONS[cat.icon] || ICONS.rocket;
  iconEl.style.background = hexRgba(cat.color, 0.12);
  iconEl.style.color = cat.color;

  $id('list-name').textContent = cat.label;
  $id('list-meta').textContent = `${cat.courses.length} courses`;

  const wrap = $id('course-pills');
  wrap.innerHTML = '';

  cat.courses.forEach((course) => {
    const key = `${catId}/${course.file}`;
    const btn = document.createElement('button');
    btn.className = 'c-pill';
    if (isRead(key)) btn.classList.add('is-read');
    if (isBookmarked(key)) btn.classList.add('is-bookmarked');
    btn.setAttribute('aria-label', `Open ${course.title}`);
    btn.innerHTML = `
      <span class="c-dot" style="background:${cat.color}"></span>
      <svg class="c-star" width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="none" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 20.49 12 17.27 5.82 20.49 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <svg class="c-read-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      ${esc(course.title)}
      <svg class="c-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    `;
    btn.addEventListener('click', () => go(`/${catId}/${course.file}`));
    wrap.appendChild(btn);
  });
}

// ── Render: reader ────────────────────────────────────────────────────────────
async function renderReader(catId, filename) {
  const data = await loadIndex();
  const cat = data?.categories.find(c => c.id === catId);
  const course = cat?.courses.find(c => c.file === filename);

  $id('bc-cat').textContent   = cat?.label   || catId;
  $id('bc-title').textContent = course?.title || filename.replace('.md','');
  $id('bc-home').onclick = () => go('/');
  $id('bc-cat').onclick  = () => go(`/${catId}`);

  const loader = $id('r-loader');
  const out    = $id('md-out');
  loader.classList.remove('hidden');
  out.classList.add('hidden');
  out.innerHTML = '';

  try {
    const res = await fetch(`${MD_BASE}${catId}/${filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();

    // Configure marked with highlight
    marked.setOptions({
      highlight(code, lang) {
        if (lang && window.hljs?.getLanguage(lang)) {
          try { return window.hljs.highlight(code, { language: lang }).value; } catch {}
        }
        return window.hljs?.highlightAuto(code).value ?? code;
      },
      breaks: true,
      gfm: true,
    });

    loader.classList.add('hidden');
    out.classList.remove('hidden');
    out.innerHTML = marked.parse(md);

    // Add lang label to each pre block; render mermaid diagrams
    out.querySelectorAll('pre code').forEach((block) => {
      const lang = [...block.classList]
        .find(c => c.startsWith('language-'))
        ?.replace('language-','') || 'text';
      if (lang === 'mermaid' && window.mermaid) {
        const wrap = document.createElement('div');
        wrap.className = 'mermaid-wrap';
        wrap.innerHTML = `<pre class="mermaid">${block.textContent}</pre>`;
        block.parentElement.replaceWith(wrap);
        return;
      }
      if (lang === 'terminal-demo') {
        const raw = block.textContent;
        const lines = raw.split('\n');
        let title = 'terminal';
        let startIdx = 0;
        if (lines[0] && lines[0].startsWith('# ')) {
          title = lines[0].slice(2).trim();
          startIdx = 1;
        }
        const parsed = [];
        for (let i = startIdx; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim() === '') { parsed.push({ type: 'blank' }); continue; }
          if (line.startsWith('$ ')) { parsed.push({ type: 'cmd', text: line.slice(2) }); }
          else if (line.includes('success') || line.includes('created') || line.includes('configured') || line.includes('scaled') || line.includes('rolled out') || line.includes('Complete') || line.includes('complete')) { parsed.push({ type: 'success', text: line }); }
          else if (line.includes('warning') || line.includes('Warning')) { parsed.push({ type: 'warn', text: line }); }
          else { parsed.push({ type: 'output', text: line }); }
        }
        let html = `<div class="terminal-demo">`;
        html += `<div class="terminal-titlebar">`;
        html += `<span class="terminal-dot red"></span>`;
        html += `<span class="terminal-dot yellow"></span>`;
        html += `<span class="terminal-dot green"></span>`;
        html += `<span class="terminal-title">${esc(title)}</span>`;
        html += `</div><div class="terminal-body"></div></div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const termEl = wrap.firstElementChild;
        termEl._termLines = parsed;
        block.parentElement.replaceWith(termEl);
        return;
      }
      block.parentElement.setAttribute('data-lang', lang);
      if (!block.classList.contains('hljs') && window.hljs) {
        window.hljs.highlightElement(block);
      }
    });

    // Initialize mermaid diagrams if any exist
    if (window.mermaid && out.querySelector('.mermaid')) {
      try { window.mermaid.run({ nodes: out.querySelectorAll('.mermaid') }); } catch {}
    }

    // Trigger terminal typing animation when scrolled into view
    out.querySelectorAll('.terminal-demo').forEach((term) => {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            obs.disconnect();
            termTyping(term);
          }
        });
      }, { threshold: 0.15 });
      obs.observe(term);
    });

    // Load Giscus comments for this course
    loadGiscus(catId, filename);

    // Load CLI playground if available for this course
    loadCLIPlayground(catId, filename);

    // Record reading history
    const courseKey = `${catId}/${filename}`;
    recordHistory(courseKey);

    // Wire up reader action buttons
    const btnRead = $id('btn-mark-read');
    const btnBm   = $id('btn-bookmark');
    const readLabel = btnRead.querySelector('.mark-read-label');

    function syncReaderButtons() {
      const r = isRead(courseKey);
      btnRead.classList.toggle('active', r);
      if (readLabel) readLabel.textContent = r ? 'Read' : 'Mark read';
      btnBm.classList.toggle('active', isBookmarked(courseKey));
    }
    syncReaderButtons();

    // Remove old listeners by cloning
    const newBtnRead = btnRead.cloneNode(true);
    const newBtnBm   = btnBm.cloneNode(true);
    btnRead.replaceWith(newBtnRead);
    btnBm.replaceWith(newBtnBm);

    newBtnRead.addEventListener('click', () => {
      toggleRead(courseKey);
      const r2 = isRead(courseKey);
      newBtnRead.classList.toggle('active', r2);
      const lbl = newBtnRead.querySelector('.mark-read-label');
      if (lbl) lbl.textContent = r2 ? 'Read' : 'Mark read';
    });
    newBtnBm.addEventListener('click', () => {
      toggleBookmark(courseKey);
      newBtnBm.classList.toggle('active', isBookmarked(courseKey));
    });

    // Stash in search map if ready
    if (SEARCH_MAP) {
      if (!SEARCH_MAP.has(courseKey)) {
        SEARCH_MAP.set(courseKey, { catId, filename, title: course?.title || filename, content: md.slice(0,4000) });
      }
    }
  } catch(err) {
    loader.classList.add('hidden');
    out.classList.remove('hidden');
    out.innerHTML = `
      <div style="text-align:center;padding:60px 0;">
        <h3 style="font-size:18px;margin-bottom:8px;">Course not found</h3>
        <p style="color:var(--text-muted);font-size:14px;">Could not load <code>${esc(catId+'/'+filename)}</code></p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:6px;">${esc(err.message)}</p>
      </div>`;
  }
}

// ── Command palette ───────────────────────────────────────────────────────────
const palOverlay = $id('pal-overlay');
const palInput   = $id('pal-input');
const palList    = $id('pal-list');
const palIdx     = $id('pal-indexing');
let palOpen = false;
let palHi   = -1;
let lastQ   = '';

function openPal() {
  palOpen = true;
  palOverlay.classList.add('open');
  palInput.value = '';
  lastQ = '';
  palHi = -1;
  renderPalDefault();
  requestAnimationFrame(() => palInput.focus());
  if (!SEARCH_MAP && !INDEXING) buildSearchMap();
}
function closePal() {
  palOpen = false;
  palOverlay.classList.remove('open');
}

palOverlay.addEventListener('click', (e) => { if (e.target === palOverlay) closePal(); });
$id('search-trigger').addEventListener('click', openPal);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey||e.ctrlKey) && e.key === 'k') { e.preventDefault(); palOpen ? closePal() : openPal(); return; }
  if (!palOpen) return;
  if (e.key === 'Escape') { closePal(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); movePal(1); return; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); movePal(-1); return; }
  if (e.key === 'Enter')     { e.preventDefault(); pickPal(); return; }
});

palInput.addEventListener('input', () => {
  const q = palInput.value.trim();
  if (q === lastQ) return;
  lastQ = q;
  palHi = -1;
  q ? renderPalSearch(q) : renderPalDefault();
});

function renderPalDefault() {
  if (!INDEX) { palList.innerHTML = '<div class="pal-empty">Loading index...</div>'; return; }
  let h = '<div class="pal-section">Categories</div>';
  INDEX.categories.forEach(cat => { h += palItemHTML(ICONS[cat.icon]||ICONS.rocket, cat.color, cat.label, `${cat.courses.length} courses`, null, null, `/${cat.id}`); });
  palList.innerHTML = h;
  bindPalItems();
}

function renderPalSearch(q) {
  if (!INDEX) { palList.innerHTML = '<div class="pal-empty">Loading...</div>'; return; }
  const ql = q.toLowerCase();
  const hits = [];
  INDEX.categories.forEach(cat => {
    cat.courses.forEach(course => {
      const inTitle   = course.title.toLowerCase().includes(ql);
      const inTag     = course.tags.some(t => t.includes(ql));
      const inCat     = cat.label.toLowerCase().includes(ql);
      const inContent = SEARCH_MAP?.get(`${cat.id}/${course.file}`)?.content.toLowerCase().includes(ql) ?? false;
      if (inTitle||inTag||inCat||inContent) {
        hits.push({ cat, course, score: inTitle?3:inTag?2:inCat?1:0 });
      }
    });
  });
  hits.sort((a,b) => b.score - a.score);
  if (!hits.length) {
    palList.innerHTML = `<div class="pal-empty">No results for <strong style="color:var(--text)">"${esc(q)}"</strong></div>`;
    return;
  }
  let h = `<div class="pal-section">${hits.length} result${hits.length!==1?'s':''}</div>`;
  hits.slice(0,24).forEach(({ cat, course }) => {
    h += palItemHTML(ICONS[cat.icon]||ICONS.rocket, cat.color, hlMark(course.title,q), hlMark(cat.label,q), cat.label, cat.color, `/${cat.id}/${course.file}`);
  });
  palList.innerHTML = h;
  bindPalItems();
}

function palItemHTML(icon, iconColor, title, sub, badge, badgeColor, action) {
  return `
    <div class="pal-item" data-action="${esc(action)}" role="option" tabindex="-1">
      <div class="pal-item-ic" style="color:${iconColor||'var(--accent-1)'};">${icon}</div>
      <div class="pal-item-text">
        <div class="pal-item-name">${title}</div>
        ${sub?`<div class="pal-item-sub">${sub}</div>`:''}
      </div>
      ${badge?`<span class="pal-badge" style="background:${hexRgba(badgeColor,0.10)};color:${badgeColor};border:1px solid ${hexRgba(badgeColor,0.22)}">${esc(badge)}</span>`:''}
    </div>`;
}

function bindPalItems() {
  palList.querySelectorAll('.pal-item').forEach((el, i) => {
    el.addEventListener('click', () => { go(el.dataset.action); closePal(); });
    el.addEventListener('mouseenter', () => setPalHi(i));
  });
}

function movePal(d) {
  const items = [...palList.querySelectorAll('.pal-item')];
  if (!items.length) return;
  palHi = Math.max(-1, Math.min(items.length - 1, palHi + d));
  items.forEach((el, i) => el.classList.toggle('hi', i === palHi));
  if (palHi >= 0) items[palHi].scrollIntoView({ block:'nearest' });
}

function setPalHi(i) {
  palHi = i;
  palList.querySelectorAll('.pal-item').forEach((el, j) => el.classList.toggle('hi', j === i));
}

function pickPal() {
  const items = [...palList.querySelectorAll('.pal-item')];
  const el = palHi >= 0 ? items[palHi] : items[0];
  if (!el) return;
  go(el.dataset.action);
  closePal();
}

// ── Background full-text index ────────────────────────────────────────────────
async function buildSearchMap() {
  if (!INDEX || INDEXING) return;
  INDEXING = true;
  SEARCH_MAP = new Map();
  palIdx.classList.remove('hidden');

  const all = INDEX.categories.flatMap(cat => cat.courses.map(course => ({ cat, course })));
  const BATCH = 5;

  for (let i = 0; i < all.length; i += BATCH) {
    await Promise.allSettled(
      all.slice(i, i + BATCH).map(async ({ cat, course }) => {
        const key = `${cat.id}/${course.file}`;
        if (SEARCH_MAP.has(key)) return;
        try {
          const r = await fetch(`${MD_BASE}${cat.id}/${course.file}`);
          if (!r.ok) return;
          const text = await r.text();
          SEARCH_MAP.set(key, { catId: cat.id, filename: course.file, title: course.title, content: text.slice(0,4000) });
        } catch {}
      })
    );
  }

  palIdx.classList.add('hidden');
  INDEXING = false;
  // Refresh results if palette still open with a query
  if (palOpen && lastQ) renderPalSearch(lastQ);
}

// ── Back-nav wiring ───────────────────────────────────────────────────────────
$id('back-from-list').addEventListener('click', () => go('/'));
$id('logo').addEventListener('click', () => go('/'));
$id('logo').addEventListener('keydown', (e) => { if(e.key==='Enter') go('/'); });
$id('browse-btn').addEventListener('click', () => {
  $id('categories-section').scrollIntoView({ behavior: 'smooth' });
});
$id('howto-btn').addEventListener('click', () => go('/how-to-use'));

// ── PWA ───────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

// ── Continue reading / Bookmarks / Completion ────────────────────────────────
function findCourseByKey(key) {
  if (!INDEX) return null;
  const [catId, file] = key.split('/');
  for (const cat of INDEX.categories) {
    if (cat.id === catId) {
      const course = cat.courses.find(c => c.file === file);
      if (course) return { cat, course };
    }
  }
  return null;
}

function renderContinueSection() {
  const section = $id('continue-section');
  const grid = $id('continue-grid');
  if (!INDEX || !section || !grid) return;

  const history = storageGet(STORAGE_KEYS.history).slice(0, 3);
  if (!history.length) { section.classList.add('hidden'); return; }

  grid.innerHTML = '';
  let shown = 0;

  history.forEach(({ key }) => {
    const found = findCourseByKey(key);
    if (!found) return;
    const { cat, course } = found;
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="continue-card-icon" style="background:${hexRgba(cat.color,0.12)};color:${cat.color}">
        ${ICONS[cat.icon] || ICONS.rocket}
      </div>
      <div class="continue-card-text">
        <div class="continue-card-title">${esc(course.title)}</div>
        <div class="continue-card-cat">${esc(cat.label)}</div>
      </div>
    `;
    const open = () => go(`/${cat.id}/${course.file}`);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' '){e.preventDefault();open();} });
    grid.appendChild(card);
    shown++;
  });

  section.classList.toggle('hidden', shown === 0);
}

function renderBookmarksSection() {
  const section = $id('bookmarks-section');
  const grid = $id('bookmarks-grid');
  if (!INDEX || !section || !grid) return;

  const bookmarks = storageGet(STORAGE_KEYS.bookmarks);
  if (!bookmarks.length) { section.classList.add('hidden'); return; }

  grid.innerHTML = '';
  let shown = 0;

  bookmarks.forEach((key) => {
    const found = findCourseByKey(key);
    if (!found) return;
    const { cat, course } = found;
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="continue-card-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 20.49 12 17.27 5.82 20.49 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
      <div class="continue-card-text">
        <div class="continue-card-title">${esc(course.title)}</div>
        <div class="continue-card-cat">${esc(cat.label)}</div>
      </div>
    `;
    const open = () => go(`/${cat.id}/${course.file}`);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' '){e.preventDefault();open();} });
    grid.appendChild(card);
    shown++;
  });

  section.classList.toggle('hidden', shown === 0);
}

function updateCompletionStat() {
  const el = $id('completion-stat');
  const numEl = $id('completion-num');
  if (!el || !numEl || !INDEX) return;

  const total = getTotalCourseCount();
  const done = getReadCount();
  if (done === 0) { el.style.display = 'none'; return; }

  const pct = Math.round((done / total) * 100);
  numEl.textContent = `${done}/${total}`;
  el.style.display = '';
}

function refreshHeroSections() {
  renderContinueSection();
  renderBookmarksSection();
  updateCompletionStat();
}

// ── Mermaid init ─────────────────────────────────────────────────────────────
function initMermaid() {
  if (!window.mermaid) return;
  window.mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  initTheme();
  initMermaid();
  await loadIndex();
  renderCategories();
  refreshHeroSections();
  route();
  if (!parseRoute().cat) setTimeout(animateCounters, 250);
})();



// ── Giscus comments loader ──────────────────────────────────────────────────
function loadGiscus(catId, filename) {
  const container = $id('giscus-container');
  const giscusDiv = container.querySelector('.giscus');
  if (!container || !giscusDiv) return;

  // Clear previous comments
  giscusDiv.innerHTML = '';
  container.classList.remove('hidden');

  // Build a unique term for this course page
  const term = `${catId}/${filename}`;

  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.setAttribute('data-repo', 'supersaiyane/crashcourse');
  script.setAttribute('data-repo-id', 'R_kgDOSsj29g');
  script.setAttribute('data-category', 'General');
  script.setAttribute('data-category-id', 'DIC_kwDOSsj29s4C-WbV');
  script.setAttribute('data-mapping', 'specific');
  script.setAttribute('data-term', term);
  script.setAttribute('data-strict', '0');
  script.setAttribute('data-reactions-enabled', '1');
  script.setAttribute('data-emit-metadata', '0');
  script.setAttribute('data-input-position', 'top');
  script.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark_dimmed' : 'light');
  script.setAttribute('data-lang', 'en');
  script.setAttribute('data-loading', 'lazy');
  script.setAttribute('crossorigin', 'anonymous');
  script.async = true;

  giscusDiv.appendChild(script);
}

// ── How to Use page ─────────────────────────────────────────────────────────
async function renderHowToUse() {
  // Fix breadcrumb for How to Use page
  $id('bc-cat').textContent = 'How to Use';
  $id('bc-title').textContent = '';
  $id('bc-home').onclick = () => go('/');
  $id('bc-cat').onclick = () => go('/how-to-use');

  const loader = $id('r-loader');
  const out    = $id('md-out');
  loader.classList.remove('hidden');
  out.classList.add('hidden');
  out.innerHTML = '';

  // Hide action buttons for this page
  const actionBar = document.querySelector('.reader-actions');
  if (actionBar) actionBar.style.display = 'none';

  // Hide giscus for this page
  const giscus = $id('giscus-container');
  if (giscus) giscus.classList.add('hidden');

  try {
    const res = await fetch('./how-to-use.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();

    marked.setOptions({
      highlight: function(code, lang) {
        if (window.hljs && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return code;
      },
      breaks: true,
      gfm: true,
    });

    loader.classList.add('hidden');
    out.classList.remove('hidden');
    out.innerHTML = marked.parse(md);
  } catch (err) {
    loader.classList.add('hidden');
    out.classList.remove('hidden');
    out.innerHTML = `<h2>Page not found</h2><p>Could not load how-to-use.md</p>`;
  }
}

// ── CLI Playground loader ───────────────────────────────────────────────────
let activePlayground = null;

function loadCLIPlayground(catId, filename) {
  const section = $id('cli-playground-section');
  const termDiv = $id('cli-terminal');
  if (!section || !termDiv) return;

  // Destroy previous playground
  if (activePlayground) {
    activePlayground.destroy();
    activePlayground = null;
    termDiv.innerHTML = '';
  }

  // Map course filenames to their CLI playground JSON files
  const cliMap = {
    'Kubernetes.md': 'containers', 'Docker.md': 'docker',
    'Terraform.md': 'terraform', 'Git.md': 'git',
    'Linux.md': 'linux', 'Bash.md': 'bash',
    'Helm.md': 'helm', 'Ansible.md': 'ansible',
    'Prometheus.md': 'prometheus', 'PostgreSQL.md': 'postgresql',
    'Redis.md': 'redis', 'AWS.md': 'aws',
    'Vault.md': 'vault', 'ArgoCD.md': 'argocd',
    'tmux.md': 'tmux', 'jq-yq.md': 'jq-yq',
    'DNS-curl-dig.md': 'dns-curl-dig', 'Kafka.md': 'kafka',
    'Vim.md': 'vim', 'systemd.md': 'systemd',
    'Trivy.md': 'trivy', 'Kustomize.md': 'kustomize',
    'Tekton.md': 'tekton', 'GitLab-CI.md': 'gitlab-ci',
    'Podman.md': 'podman', 'containerd-nerdctl.md': 'containerd-nerdctl',
    'Pulumi.md': 'pulumi', 'Flux.md': 'flux',
    'OPA.md': 'opa', 'k6.md': 'k6',
    'jq.md': 'jq-yq', 'yq.md': 'jq-yq',
    'sed.md': 'sed-awk', 'awk.md': 'sed-awk',
    'Grafana.md': 'grafana', 'Loki.md': 'loki',
    'etcd.md': 'etcd', 'cert-manager.md': 'cert-manager',
    'SSH.md': 'ssh', 'GitHub-Actions.md': 'github-actions',
    'Jenkins.md': 'jenkins', 'Alertmanager.md': 'alertmanager',
    'Nginx.md': 'nginx', 'Makefile.md': 'makefile',
    'GCP.md': 'gcp', 'Azure.md': 'azure'
  };
  const cliId = cliMap[filename] || catId;
  const cliFile = `./data/cli-${cliId}.json`;
  fetch(cliFile).then(res => {
    if (!res.ok) {
      section.classList.add('hidden');
      return;
    }
    return res.json();
  }).then(data => {
    if (!data) return;
    section.classList.remove('hidden');

    // Small delay to ensure container is visible before xterm measures
    setTimeout(() => {
      if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
        section.classList.add('hidden');
        return;
      }
      activePlayground = new CLIPlayground(termDiv, data);

      // Populate reference panel
      const refBody = $id('cli-ref-body');
      if (refBody && data.reference) {
        refBody.innerHTML = '';
        data.reference.forEach(group => {
          const groupEl = document.createElement('div');
          groupEl.className = 'cli-ref-group';
          groupEl.innerHTML = `<div class="cli-ref-group-title">${group.group}</div>`;
          group.commands.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'cli-ref-cmd';
            btn.title = c.cmd;
            btn.innerHTML = c.cmd.length > 38 
              ? c.cmd.substring(0, 38) + '...' 
              : c.cmd;
            if (c.desc) {
              btn.innerHTML += ` <span class="cli-ref-desc">${c.desc}</span>`;
            }
            btn.addEventListener('click', () => {
              if (activePlayground) {
                // Clear current line and type the command
                activePlayground.replaceLine(c.cmd);
                activePlayground.term.focus();
              }
            });
            groupEl.appendChild(btn);
          });
          refBody.appendChild(groupEl);
        });
      }

      // Wire up buttons
      const scenarioBtn = $id('cli-scenario-btn');
      const clearBtn = $id('cli-clear-btn');
      if (scenarioBtn) {
        const newBtn = scenarioBtn.cloneNode(true);
        scenarioBtn.replaceWith(newBtn);
        newBtn.addEventListener('click', () => {
          if (activePlayground) activePlayground.showScenarios();
        });
      }
      if (clearBtn) {
        const newBtn = clearBtn.cloneNode(true);
        clearBtn.replaceWith(newBtn);
        newBtn.addEventListener('click', () => {
          if (activePlayground) {
            activePlayground.term.clear();
            activePlayground.writePrompt();
          }
        });
      }
    }, 200);
  }).catch(() => {
    section.classList.add('hidden');
  });
}

// ── Nav tabs ─────────────────────────────────────────────────────────────────
function syncNavTabs(active) {
  const coursesBtn = $id('nav-courses');
  const labsBtn = $id('nav-labs');
  if (coursesBtn) coursesBtn.classList.toggle('active', active === 'courses');
  if (labsBtn) labsBtn.classList.toggle('active', active === 'labs');
}

$id('nav-courses').addEventListener('click', () => go('/'));
$id('nav-labs').addEventListener('click', () => go('/labs'));
$id('back-from-labs')?.addEventListener('click', () => go('/'));

// ── Labs: localStorage progress ─────────────────────────────────────────────
const LABS_PROGRESS_KEY = 'cc-labs-progress';

function getLabsProgress() {
  try { return JSON.parse(localStorage.getItem(LABS_PROGRESS_KEY)) || {}; } catch { return {}; }
}
function setLabsProgress(data) {
  localStorage.setItem(LABS_PROGRESS_KEY, JSON.stringify(data));
}
function isStageComplete(labId, stageId) {
  const p = getLabsProgress();
  return p[labId]?.stages?.includes(stageId) || false;
}
function toggleStageComplete(labId, stageId) {
  const p = getLabsProgress();
  if (!p[labId]) p[labId] = { stages: [], exercises: {} };
  const idx = p[labId].stages.indexOf(stageId);
  if (idx >= 0) p[labId].stages.splice(idx, 1);
  else p[labId].stages.push(stageId);
  setLabsProgress(p);
  return idx < 0;
}
function getExerciseState(labId, stageId, count) {
  const p = getLabsProgress();
  return p[labId]?.exercises?.[stageId] || new Array(count).fill(false);
}
function setExerciseState(labId, stageId, arr) {
  const p = getLabsProgress();
  if (!p[labId]) p[labId] = { stages: [], exercises: {} };
  if (!p[labId].exercises) p[labId].exercises = {};
  p[labId].exercises[stageId] = arr;
  setLabsProgress(p);
}
function getLabStagesDone(labId, totalStages) {
  const p = getLabsProgress();
  return p[labId]?.stages?.length || 0;
}

// ── Labs: data loading ──────────────────────────────────────────────────────
const LAB_INDEX = ['container-lifecycle', 'iac-pipeline', 'observability-stack', 'gitops-multi-env', 'cicd-shootout', 'security-pipeline', 'multi-cloud-app'];
const labCache = {};

async function loadLabData(labId) {
  if (labCache[labId]) return labCache[labId];
  try {
    const r = await fetch(`./data/labs/${labId}.json`);
    if (!r.ok) return null;
    const data = await r.json();
    labCache[labId] = data;
    return data;
  } catch { return null; }
}

async function loadAllLabs() {
  return Promise.all(LAB_INDEX.map(id => loadLabData(id)));
}

// ── Labs: listing page ──────────────────────────────────────────────────────
async function renderLabsListing() {
  const labs = (await loadAllLabs()).filter(Boolean);
  const grid = $id('labs-grid');
  if (!grid) return;

  // Continue section
  renderLabsContinue(labs);

  // Filter buttons
  const filterBtns = document.querySelectorAll('.lab-filter-btn');
  let activeTier = 'all';

  function renderCards(tier) {
    grid.innerHTML = '';
    const filtered = tier === 'all' ? labs : labs.filter(l => l.tier === tier);

    filtered.forEach(lab => {
      const done = getLabStagesDone(lab.id, lab.stages.length);
      const total = lab.stages.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'lab-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <span class="lab-card-tier" data-tier="${esc(lab.tier)}">${esc(lab.tier)}</span>
        <div class="lab-card-title">${esc(lab.title)}</div>
        <div class="lab-card-app">${esc(lab.app)}</div>
        <div class="lab-card-desc">${esc(lab.description)}</div>
        <div class="lab-card-tools">
          ${lab.tools.map(t => `<span class="lab-tool-pill">${esc(t)}</span>`).join('')}
        </div>
        <div class="lab-card-footer">
          <span class="lab-card-duration">${esc(lab.duration)}</span>
          <div class="lab-card-progress">
            <div class="lab-card-progress-bar"><div class="lab-card-progress-fill" style="width:${pct}%"></div></div>
            ${done > 0 ? `<div class="lab-card-progress-text">${done}/${total} stages</div>` : ''}
          </div>
        </div>
      `;
      const open = () => go(`/labs/${lab.id}`);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' '){e.preventDefault();open();} });
      grid.appendChild(card);
    });

    if (!filtered.length) {
      grid.innerHTML = '<p style="color:var(--text-2);text-align:center;padding:40px 0;">No labs in this tier yet.</p>';
    }
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTier = btn.dataset.tier;
      renderCards(activeTier);
    });
  });

  renderCards(activeTier);
}

function renderLabsContinue(labs) {
  const section = $id('labs-continue-section');
  const grid = $id('labs-continue-grid');
  if (!section || !grid) return;

  const progress = getLabsProgress();
  const inProgress = labs.filter(lab => {
    const done = progress[lab.id]?.stages?.length || 0;
    return done > 0 && done < lab.stages.length;
  });

  if (!inProgress.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  grid.innerHTML = '';

  inProgress.forEach(lab => {
    const done = progress[lab.id].stages.length;
    const nextStage = lab.stages.find(s => !progress[lab.id].stages.includes(s.id));
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="continue-card-icon" style="background:rgba(99,102,241,0.12);color:var(--accent-1)">
        ${ICONS.rocket}
      </div>
      <div class="continue-card-text">
        <div class="continue-card-title">${esc(lab.title)}</div>
        <div class="continue-card-cat">${done}/${lab.stages.length} stages${nextStage ? ' — next: ' + esc(nextStage.title) : ''}</div>
      </div>
    `;
    const stageId = nextStage ? nextStage.id : lab.stages[0].id;
    const open = () => go(`/labs/${lab.id}/${stageId}`);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' '){e.preventDefault();open();} });
    grid.appendChild(card);
  });
}

// ── Labs: detail page ───────────────────────────────────────────────────────
async function renderLabDetail(labId, stageId) {
  const lab = await loadLabData(labId);
  if (!lab) { go('/labs'); return; }

  // Default to first stage
  if (!stageId) stageId = lab.stages[0].id;
  const stageIdx = lab.stages.findIndex(s => s.id === stageId);
  if (stageIdx < 0) { go(`/labs/${labId}`); return; }
  const stage = lab.stages[stageIdx];

  // Breadcrumb
  $id('bc-lab-home').onclick = () => go('/');
  $id('bc-labs').onclick = () => go('/labs');
  $id('bc-lab-title').textContent = `${lab.title} — ${stage.title}`;

  // Header
  $id('lab-header').innerHTML = `
    <div class="lab-header-top">
      <span class="lab-card-tier" data-tier="${esc(lab.tier)}">${esc(lab.tier)}</span>
      <span class="lab-header-app">${esc(lab.app)}</span>
    </div>
    <div class="lab-header-title">${esc(lab.title)}</div>
    <div class="lab-header-desc">${esc(lab.description)}</div>
  `;

  // Stage progress bar
  renderStagesBar(lab, stageIdx);

  // Load stage README
  const loader = $id('lab-loader');
  const out = $id('lab-md-out');
  loader.classList.remove('hidden');
  out.classList.add('hidden');
  out.innerHTML = '';

  try {
    const res = await fetch(`${MD_BASE}${stage.readme}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();

    marked.setOptions({
      highlight(code, lang) {
        if (lang && window.hljs?.getLanguage(lang)) {
          try { return window.hljs.highlight(code, { language: lang }).value; } catch {}
        }
        return window.hljs?.highlightAuto(code).value ?? code;
      },
      breaks: true, gfm: true,
    });

    loader.classList.add('hidden');
    out.classList.remove('hidden');
    out.innerHTML = marked.parse(md);

    // Highlight code blocks
    out.querySelectorAll('pre code').forEach(block => {
      const lang = [...block.classList].find(c => c.startsWith('language-'))?.replace('language-','') || 'text';
      if (lang === 'mermaid' && window.mermaid) {
        const wrap = document.createElement('div');
        wrap.className = 'mermaid-wrap';
        wrap.innerHTML = `<pre class="mermaid">${block.textContent}</pre>`;
        block.parentElement.replaceWith(wrap);
        return;
      }
      block.parentElement.setAttribute('data-lang', lang);
      if (!block.classList.contains('hljs') && window.hljs) window.hljs.highlightElement(block);
    });
    if (window.mermaid && out.querySelector('.mermaid')) {
      try { window.mermaid.run({ nodes: out.querySelectorAll('.mermaid') }); } catch {}
    }

    // Intercept relative .md links inside lab content — load via file viewer instead of navigating away
    const stageDir = stage.readme.replace(/\/[^/]+$/, '');  // e.g. "projects/05-.../stages/01-the-app"
    out.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.endsWith('.md') && !href.startsWith('http') && !href.startsWith('#')) {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          // Resolve relative path from the stage directory
          const parts = stageDir.split('/');
          const hrefParts = href.split('/');
          const resolved = [...parts];
          hrefParts.forEach(p => {
            if (p === '..') resolved.pop();
            else resolved.push(p);
          });
          const filePath = resolved.join('/');
          loader.classList.remove('hidden');
          out.classList.add('hidden');
          try {
            const res2 = await fetch(`${MD_BASE}${filePath}`);
            if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
            const content = await res2.text();
            loader.classList.add('hidden');
            out.classList.remove('hidden');
            out.innerHTML = `<div style="margin-bottom:12px;">
              <span style="font-size:0.78rem;color:var(--text-2);font-family:var(--font-mono);">${esc(filePath)}</span>
              <button class="lab-nav-btn" style="float:right;padding:4px 12px;font-size:0.75rem;" onclick="window.labRestoreStageReadme()">Back to README</button>
            </div>` + marked.parse(content);
            out.querySelectorAll('pre code').forEach(b => {
              if (!b.classList.contains('hljs') && window.hljs) window.hljs.highlightElement(b);
            });
            window.scrollTo(0, 0);
          } catch (err2) {
            loader.classList.add('hidden');
            out.classList.remove('hidden');
            out.innerHTML = `<p style="color:var(--text-muted);">Could not load <code>${esc(filePath)}</code>: ${esc(err2.message)}</p>`;
          }
        });
      }
    });
  } catch (err) {
    loader.classList.add('hidden');
    out.classList.remove('hidden');
    out.innerHTML = `<div style="text-align:center;padding:60px 0;"><h3>Stage not found</h3><p style="color:var(--text-muted);">Could not load <code>${esc(stage.readme)}</code></p><p style="color:var(--text-muted);font-size:12px;margin-top:6px;">${esc(err.message)}</p></div>`;
  }

  // Sidebar
  renderLabSidebar(lab, stage, stageIdx);

  // Prev/Next buttons
  renderLabNav(lab, stageIdx);
}

function renderStagesBar(lab, activeIdx) {
  const bar = $id('lab-stages-bar');
  if (!bar) return;
  bar.innerHTML = '';

  lab.stages.forEach((stage, i) => {
    const done = isStageComplete(lab.id, stage.id);
    const isCurrent = i === activeIdx;
    const cls = done ? 'done' : isCurrent ? 'current' : 'pending';

    if (i > 0) {
      const conn = document.createElement('div');
      conn.className = `lab-stage-connector${isStageComplete(lab.id, lab.stages[i-1].id) ? ' done' : ''}`;
      bar.appendChild(conn);
    }

    const dot = document.createElement('div');
    dot.className = `lab-stage-dot ${cls}`;
    dot.innerHTML = `
      <div class="lab-stage-circle">${done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : (i + 1)}</div>
      <div class="lab-stage-label">${esc(stage.title)}</div>
    `;
    dot.addEventListener('click', () => go(`/labs/${lab.id}/${stage.id}`));
    bar.appendChild(dot);
  });
}

function renderLabSidebar(lab, stage, stageIdx) {
  const sidebar = $id('lab-sidebar');
  if (!sidebar) return;

  let html = '';

  // Exercise files
  if (stage.files && stage.files.length > 0) {
    html += `<div class="lab-sidebar-section">
      <div class="lab-sidebar-title">Exercises</div>`;
    stage.files.forEach(f => {
      const isMd = f.path.endsWith('.md');
      const icon = isMd
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
      html += `<a class="lab-sidebar-link lab-file-link" data-file="${esc(f.path)}" title="${esc(f.path)}">${icon} ${esc(f.label)}</a>`;
    });
    html += '</div>';
  }

  // App source code — download link via download-directory.github.io
  if (lab.appDir) {
    const dlUrl = `https://download-directory.github.io/?url=https://github.com/supersaiyane/crashcourse/tree/main/${lab.appDir}`;
    html += `<div class="lab-sidebar-section">
      <div class="lab-sidebar-title">${esc(lab.app)} Source Code</div>
      <a class="lab-sidebar-link lab-download-link" href="${dlUrl}" target="_blank" rel="noopener noreferrer" style="font-weight:500;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download ${esc(lab.app)} Source
      </a>
    </div>`;
  }

  // Exercise progress checklist
  if (stage.exercises > 0) {
    const exerciseState = getExerciseState(lab.id, stage.id, stage.exercises);
    html += `<div class="lab-sidebar-section">
      <div class="lab-sidebar-title">Progress</div>`;
    for (let i = 0; i < stage.exercises; i++) {
      html += `<div class="lab-exercise-item">
        <input type="checkbox" data-lab="${esc(lab.id)}" data-stage="${esc(stage.id)}" data-idx="${i}" ${exerciseState[i] ? 'checked' : ''} />
        <span>Exercise ${i + 1}</span>
      </div>`;
    }
    html += '</div>';
  }

  // Course reference link
  if (stage.course) {
    html += `<div class="lab-sidebar-section">
      <div class="lab-sidebar-title">Quick Reference</div>
      <a class="lab-sidebar-link" data-course="${esc(stage.course)}">Open crash course</a>
    </div>`;
  }

  // Mark stage complete
  const done = isStageComplete(lab.id, stage.id);
  html += `<div class="lab-sidebar-section">
    <button class="lab-nav-btn" id="lab-mark-stage" style="width:100%;justify-content:center;${done ? 'background:var(--accent-1);color:#fff;border-color:var(--accent-1);' : ''}">
      ${done ? 'Stage completed' : 'Mark stage complete'}
    </button>
  </div>`;

  sidebar.innerHTML = html;

  // Wire file links — open file content in the main reader area
  sidebar.querySelectorAll('.lab-file-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const filePath = link.dataset.file;
      const out = $id('lab-md-out');
      const loader = $id('lab-loader');
      if (!out || !loader) return;

      loader.classList.remove('hidden');
      out.classList.add('hidden');

      try {
        const res = await fetch(`${MD_BASE}${filePath}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const content = await res.text();
        loader.classList.add('hidden');
        out.classList.remove('hidden');

        if (filePath.endsWith('.md')) {
          out.innerHTML = marked.parse(content);
          out.querySelectorAll('pre code').forEach(block => {
            if (!block.classList.contains('hljs') && window.hljs) window.hljs.highlightElement(block);
          });
        } else {
          const ext = filePath.split('.').pop();
          const langMap = { tf:'hcl', hcl:'hcl', py:'python', yml:'yaml', yaml:'yaml', json:'json', rego:'rego', j2:'django', ini:'ini', txt:'text' };
          const lang = langMap[ext] || ext;
          const highlighted = (window.hljs?.getLanguage(lang))
            ? window.hljs.highlight(content, { language: lang }).value
            : esc(content);
          out.innerHTML = `<div style="margin-bottom:12px;">
            <span style="font-size:0.78rem;color:var(--text-2);font-family:var(--font-mono);">${esc(filePath)}</span>
            <button class="lab-nav-btn" style="float:right;padding:4px 12px;font-size:0.75rem;" onclick="window.labRestoreStageReadme()">Back to README</button>
          </div>
          <pre data-lang="${esc(lang)}"><code class="hljs language-${esc(lang)}">${highlighted}</code></pre>`;
        }
        window.scrollTo(0, 0);
      } catch (err) {
        loader.classList.add('hidden');
        out.classList.remove('hidden');
        out.innerHTML = `<p style="color:var(--text-muted);">Could not load <code>${esc(filePath)}</code>: ${esc(err.message)}</p>`;
      }
    });
  });

  // Store restore function for "Back to README" button
  window.labRestoreStageReadme = () => renderLabDetail(lab.id, stage.id);

  // Wire exercise checkboxes
  sidebar.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const labId = cb.dataset.lab;
      const stageId = cb.dataset.stage;
      const idx = parseInt(cb.dataset.idx);
      const state = getExerciseState(labId, stageId, stage.exercises);
      state[idx] = cb.checked;
      setExerciseState(labId, stageId, state);
    });
  });

  // Wire course link
  sidebar.querySelectorAll('[data-course]').forEach(link => {
    link.addEventListener('click', () => {
      const coursePath = link.dataset.course;
      const parts = coursePath.replace('.md', '').split('/');
      go(`/${parts[0]}/${parts[1]}.md`);
    });
  });

  // Wire mark-complete button
  const markBtn = $id('lab-mark-stage');
  if (markBtn) {
    markBtn.addEventListener('click', () => {
      const nowDone = toggleStageComplete(lab.id, stage.id);
      markBtn.textContent = nowDone ? 'Stage completed' : 'Mark stage complete';
      markBtn.style.background = nowDone ? 'var(--accent-1)' : '';
      markBtn.style.color = nowDone ? '#fff' : '';
      markBtn.style.borderColor = nowDone ? 'var(--accent-1)' : '';
      renderStagesBar(lab, stageIdx);
    });
  }
}

function renderLabNav(lab, stageIdx) {
  const nav = $id('lab-nav-btns');
  if (!nav) return;

  const prev = stageIdx > 0 ? lab.stages[stageIdx - 1] : null;
  const next = stageIdx < lab.stages.length - 1 ? lab.stages[stageIdx + 1] : null;

  nav.innerHTML = `
    <button class="lab-nav-btn" id="lab-prev" ${!prev ? 'disabled' : ''}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      ${prev ? esc(prev.title) : 'Previous'}
    </button>
    <button class="lab-nav-btn" id="lab-next" ${!next ? 'disabled' : ''}>
      ${next ? esc(next.title) : 'Next'}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>
  `;

  if (prev) $id('lab-prev').addEventListener('click', () => go(`/labs/${lab.id}/${prev.id}`));
  if (next) $id('lab-next').addEventListener('click', () => go(`/labs/${lab.id}/${next.id}`));
}

// ── Terminal typing engine ──────────────────────────────────────────────────
function termTyping(termEl) {
  const body = termEl.querySelector('.terminal-body');
  const lines = termEl._termLines || [];
  if (!lines.length) return;

  let lineIdx = 0;

  function classFor(type) {
    if (type === 'cmd') return 'term-cmd';
    if (type === 'success') return 'term-success';
    if (type === 'warn') return 'term-warn';
    return 'term-output';
  }

  function typeChars(el, text, speed, cb) {
    let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) {
        el.textContent += text[i];
        i++;
      } else {
        clearInterval(iv);
        if (cb) cb();
      }
    }, speed);
  }

  function showNext() {
    if (lineIdx >= lines.length) {
      // Final blinking cursor
      const cur = document.createElement('div');
      cur.className = 'term-line';
      cur.style.opacity = '1';
      cur.innerHTML = '<span class="term-prompt">$  </span><span class="term-cursor"></span>';
      body.appendChild(cur);
      termEl.classList.add('term-animate');
      return;
    }

    const item = lines[lineIdx];
    lineIdx++;

    if (item.type === 'blank') {
      const div = document.createElement('div');
      div.className = 'term-line';
      div.style.opacity = '1';
      div.innerHTML = '&nbsp;';
      body.appendChild(div);
      setTimeout(showNext, 60);
      return;
    }

    if (item.type === 'cmd') {
      const div = document.createElement('div');
      div.className = 'term-line';
      div.style.opacity = '1';
      div.innerHTML = '<span class="term-prompt">$  </span><span class="term-cmd"></span>';
      body.appendChild(div);
      const cmdSpan = div.querySelector('.term-cmd');
      // Type command characters one by one
      typeChars(cmdSpan, item.text, 28, () => {
        setTimeout(showNext, 250);
      });
      // Auto-scroll terminal body
      body.scrollTop = body.scrollHeight;
      return;
    }

    // Output / success / warn — appear instantly (like real terminal output)
    const div = document.createElement('div');
    div.className = 'term-line';
    div.style.opacity = '0';
    const cls = classFor(item.type);
    div.innerHTML = `<span class="${cls}">    ${esc(item.text)}</span>`;
    body.appendChild(div);
    // Fade in
    requestAnimationFrame(() => {
      div.style.transition = 'opacity 0.2s ease';
      div.style.opacity = '1';
    });
    body.scrollTop = body.scrollHeight;
    setTimeout(showNext, item.type === 'success' ? 120 : 60);
  }

  showNext();
}
