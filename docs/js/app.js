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
const MD_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? '../'
  : 'https://raw.githubusercontent.com/supersaiyane/crashcourse/main/';

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
  return { cat: p[0]||null, file: p[1]||null };
}

window.addEventListener('hashchange', route);

async function route() {
  const { cat, file } = parseRoute();
  if (!cat) { showView('hero'); return; }
  if (cat && !file) { showView('list'); await renderList(cat); return; }
  if (cat && file) { showView('reader'); await renderReader(cat, file); return; }
}

// ── Views ─────────────────────────────────────────────────────────────────────
const VIEWS = { hero: 'hero-view', list: 'list-view', reader: 'reader-view' };

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
