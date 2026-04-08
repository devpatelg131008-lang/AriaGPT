/* ============================================================
   AriaGPT by GroqSocial — script.js
   Advanced AI Chat with Direct API Integration, Multi-Model Support,
   Message Search, Chat Branching, and Smart Features
   ============================================================ */
'use strict';

/* ── User-specific Storage Helpers ─────────────────── */
function getUserId() {
  const user = JSON.parse(localStorage.getItem('ariagpt_user') || '{}');
  return user.uid || 'anonymous';
}

function getUserKey(key) {
  return `ariagpt_${getUserId()}_${key}`;
}

// Export for use in other scripts (onboarding, etc.)
window.getUserId = getUserId;
window.getUserKey = getUserKey;

/* ── Config ─────────────────────────────────────────── */
const API_URL   = 'http://localhost:3000/api/chat';
const MAX_LEN   = 8000;

// Dynamic store key - must call function each time to get current user's key
function getStoreKey() { return getUserKey('v3'); }

/* AI Providers Configuration */
const AI_PROVIDERS = {
  aria: {
    name: 'Aria Q1.5',
    baseUrl: 'https://api.aria.ai/v1/chat/completions',
    models: [
      { id: 'aria-q1.5', name: 'Aria Q1.5', context: 128000 },
      { id: 'aria-q1.5-vire', name: 'Aria Q1.5 vire', context: 128000 },
      { id: 'aria-q1.5-vire-pro', name: 'Aria Q1.5 vire pro', context: 128000 }
    ]
  }
};

/* ── DOM ────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const D = {
  sidebar:     $('sidebar'),
  sidebarClose:$('sidebarClose'),
  sidebarOpen: $('sidebarOpen'),
  mobOverlay:  $('mobOverlay'),
  newChatBtn:  $('newChatBtn'),
  searchInput: $('searchInput'),
  searchClear: $('searchClear'),
  histNav:     $('histNav'),
  exportBtn:   $('exportBtn'),
  shortcutsBtn:$('shortcutsBtn'),
  themeBtn:    $('themeBtn'),
  icoSun:      $('icoSun'),
  icoMoon:     $('icoMoon'),
  topbarTitle: $('topbarTitle'),
  topbarClear: $('topbarClearBtn'),
  shareBtn:    $('shareBtn'),
  chatView:    $('chatView'),
  welcome:     $('welcome'),
  feed:        $('feed'),
  scrollBtn:   $('scrollBtn'),
  msgInput:    $('msgInput'),
  sendBtn:     $('sendBtn'),
  sendIco:     $('sendIco'),
  stopIco:     $('stopIco'),
  wc:          $('wc'),
  cc:          $('cc'),
  toasts:      $('toasts'),
  shortcutsModal: $('shortcutsModal'),
  renameModal:    $('renameModal'),
  renameField:    $('renameField'),
  renameOk:       $('renameOk'),
  deleteModal:    $('deleteModal'),
  deleteOk:       $('deleteOk'),
  ctxMenu:     $('ctxMenu'),
  ctxRename:   $('ctxRename'),
  ctxExport:   $('ctxExport'),
  ctxDelete:   $('ctxDelete'),
  // Advanced features
  modelSelector: null, // Will be created
  apiKeyModal: null,   // Will be created
  searchChatModal: null,
};

/* ── State ─────────────────────────────────────────── */
const S = {
  sessions:      [],
  currentId:     null,
  loading:       false,
  abort:         null,
  theme:         localStorage.getItem(getUserKey('theme')) || 'dark',
  sidebarOpen:   localStorage.getItem(getUserKey('sb')) !== '0',
  searchQ:       '',
  ctxId:         null,
  renameId:      null,
  deleteId:      null,
  feedbackMap:   {},
  statusTimer:   null,
  // Advanced state
  apiKeys:       JSON.parse(localStorage.getItem(getUserKey('apikeys')) || '{}'),
  currentModel:  localStorage.getItem(getUserKey('model')) || 'aria-q1.5',
  currentProvider: localStorage.getItem(getUserKey('provider')) || 'aria',
  pinnedMsgs:    JSON.parse(localStorage.getItem(getUserKey('pins')) || '[]'),
  chatSearchQ:   '',
  suggestTimer:  null,
  lastSuggestions: [],
  useLocalBackend: localStorage.getItem(getUserKey('localbackend')) !== 'false',
};

/* ══════════════════════════════════════════════════════
   SMART STATUS MESSAGES
   Detect intent from user message → show contextual status
══════════════════════════════════════════════════════ */
const STATUS_SETS = {
  code: [
    'Reading through the code…',
    'Tracing the logic…',
    'Writing a clean solution…',
    'Double-checking the implementation…',
  ],
  debug: [
    'Diagnosing the issue…',
    'Tracing the error path…',
    'Finding the root cause…',
    'Working on the fix…',
  ],
  explain: [
    'Thinking through this carefully…',
    'Organising the explanation…',
    'Finding the clearest way to put this…',
    'Pulling the key ideas together…',
  ],
  write: [
    'Drafting your content…',
    'Shaping the structure…',
    'Choosing the right words…',
    'Polishing the draft…',
  ],
  compare: [
    'Analysing the options…',
    'Weighing the trade-offs…',
    'Pulling together the comparison…',
    'Examining each angle…',
  ],
  math: [
    'Working through the numbers…',
    'Checking the calculation…',
    'Verifying the result…',
    'Solving step by step…',
  ],
  plan: [
    'Mapping out the plan…',
    'Structuring the steps…',
    'Building the strategy…',
    'Organising the approach…',
  ],
  research: [
    'Searching my knowledge…',
    'Gathering the details…',
    'Pulling together what I know…',
    'Compiling the information…',
  ],
  creative: [
    'Finding the right angle…',
    'Crafting something thoughtful…',
    'Shaping the narrative…',
    'Bringing the idea to life…',
  ],
  default: [
    'Working on it…',
    'Thinking this through…',
    'Almost there…',
    'Putting it together…',
  ],
};

function detectIntent(msg) {
  const m = msg.toLowerCase();
  if (/\b(bug|error|fix|crash|exception|traceback|undefined|null|syntax|debug|broken)\b/.test(m)) return 'debug';
  if (/\b(code|function|class|api|script|implement|build|create|write.*code|program)\b/.test(m)) return 'code';
  if (/\b(explain|how does|what is|what are|tell me|define|describe|help me understand|why)\b/.test(m)) return 'explain';
  if (/\b(write|draft|compose|create.*letter|email|essay|article|paragraph|blog|post|message)\b/.test(m)) return 'write';
  if (/\b(compare|vs|versus|difference|better|pros|cons|trade.?off|which one)\b/.test(m)) return 'compare';
  if (/\b(calculate|math|equation|formula|solve|compute|sum|integral|derivative|percentage)\b/.test(m)) return 'math';
  if (/\b(plan|strategy|roadmap|schedule|outline|steps|guide|checklist|process)\b/.test(m)) return 'plan';
  if (/\b(research|find|search|look up|information|facts|history|data|statistics)\b/.test(m)) return 'research';
  if (/\b(story|poem|creative|imagine|fiction|character|narrative|write.*about)\b/.test(m)) return 'creative';
  return 'default';
}

function getStatusMessages(msg) {
  return STATUS_SETS[detectIntent(msg)] || STATUS_SETS.default;
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
function init() {
  console.log('=== AriaGPT Initializing ===');
  
  // Clear old model settings to ensure Aria Q1.5 models load correctly
  localStorage.removeItem(getUserKey('model'));
  localStorage.removeItem(getUserKey('provider'));
  
  loadSessions();
  applyTheme(false);
  applySidebar(false);

  const last  = localStorage.getItem(getUserKey('last'));
  const found = S.sessions.find(s => s.id === last);
  found ? switchSession(last) : newSession();

  console.log('Binding all events...');
  bindAll();
  console.log('Events bound. msgInput element:', D.msgInput);
  refreshSend();
  D.msgInput.focus();
  console.log('=== Initialization complete ===');
}

/* ══════════════════════════════════════════════════════
   SESSION MANAGEMENT
══════════════════════════════════════════════════════ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadSessions() {
  try { S.sessions = JSON.parse(localStorage.getItem(getStoreKey()) || '[]'); }
  catch { S.sessions = []; }
}

function persist() {
  try { localStorage.setItem(getStoreKey(), JSON.stringify(S.sessions)); } catch {}
}

function getSession(id = S.currentId) {
  return S.sessions.find(s => s.id === id) || null;
}

function newSession() {
  const s = { id: uid(), title: 'New Chat', messages: [], created: Date.now(), updated: Date.now() };
  S.sessions.unshift(s);
  S.currentId = s.id;
  localStorage.setItem(getUserKey('last'), s.id);
  persist();
  renderHistory();
  renderFeed();
  refreshSend();
  D.msgInput.focus();
}

function switchSession(id) {
  if (!getSession(id)) return;
  S.currentId = id;
  localStorage.setItem(getUserKey('last'), id);
  renderHistory();
  renderFeed();
  refreshSend();
  D.msgInput.focus();
  if (window.innerWidth <= 768) closeSidebar();
}

function setTitle(text, id = S.currentId) {
  const s = getSession(id);
  if (!s || s.title !== 'New Chat') return;
  s.title   = text.length > 50 ? text.slice(0, 50) + '…' : text;
  s.updated = Date.now();
  persist();
  renderHistory();
  D.topbarTitle.textContent = s.title;
}

function renameSession(id, title) {
  const s = getSession(id);
  if (!s || !title.trim()) return;
  s.title   = title.trim().slice(0, 80);
  s.updated = Date.now();
  persist();
  renderHistory();
  if (id === S.currentId) D.topbarTitle.textContent = s.title;
}

function deleteSession(id) {
  S.sessions = S.sessions.filter(s => s.id !== id);
  persist();
  if (S.currentId === id) {
    S.sessions.length ? switchSession(S.sessions[0].id) : newSession();
  } else {
    renderHistory();
  }
}

/* ── Date grouping ── */
function groupSessions(list) {
  const now = Date.now(), DAY = 86400000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const ts = todayStart.getTime();
  const groups = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
  const buckets = {};
  groups.forEach(g => buckets[g] = []);
  list.forEach(s => {
    const age = now - s.updated;
    if (s.updated >= ts)              buckets['Today'].push(s);
    else if (s.updated >= ts - DAY)   buckets['Yesterday'].push(s);
    else if (age < 7 * DAY)           buckets['Previous 7 Days'].push(s);
    else if (age < 30 * DAY)          buckets['Previous 30 Days'].push(s);
    else                              buckets['Older'].push(s);
  });
  return { groups, buckets };
}

function relTime(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ══════════════════════════════════════════════════════
   RENDER SIDEBAR
══════════════════════════════════════════════════════ */
function renderHistory() {
  const q = S.searchQ.toLowerCase();
  let list = S.sessions;
  if (q) list = list.filter(s => s.title.toLowerCase().includes(q) || s.messages.some(m => m.content.toLowerCase().includes(q)));

  D.histNav.innerHTML = '';

  if (!S.sessions.length) {
    D.histNav.innerHTML = '<p class="hist-empty">No conversations yet</p>';
    return;
  }
  if (q && !list.length) {
    D.histNav.innerHTML = `<p class="hist-no-result">No results for "${esc(q)}"</p>`;
    return;
  }

  if (q) {
    list.forEach(s => D.histNav.appendChild(buildHistEl(s)));
  } else {
    const { groups, buckets } = groupSessions(list);
    groups.forEach(g => {
      if (!buckets[g].length) return;
      const wrap = document.createElement('div');
      wrap.className = 'hist-group';
      wrap.innerHTML = `<div class="hist-label">${g}</div>`;
      buckets[g].forEach(s => wrap.appendChild(buildHistEl(s)));
      D.histNav.appendChild(wrap);
    });
  }
}

function buildHistEl(s) {
  const el = document.createElement('div');
  el.className = 'hist-item' + (s.id === S.currentId ? ' active' : '');
  el.dataset.id = s.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.innerHTML = `
    <div class="hi-icon"><svg viewBox="0 0 16 16"><path d="M14 10a5 5 0 01-5 5H5L2 14.5V5a5 5 0 015-5h2a5 5 0 015 5v5z"/></svg></div>
    <span class="hi-label">${esc(s.title)}</span>
    <span class="hi-time">${relTime(s.updated)}</span>
    <button class="hi-menu" data-id="${s.id}" title="Options" aria-label="Options">
      <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.5" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="8" cy="12.5" r="1.1"/></svg>
    </button>`;
  el.addEventListener('click', e => { if (!e.target.closest('.hi-menu')) switchSession(s.id); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') switchSession(s.id); });
  el.addEventListener('dblclick', () => openRenameModal(s.id));
  el.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, s.id); });
  el.querySelector('.hi-menu').addEventListener('click', e => { e.stopPropagation(); showCtxMenu(e, s.id); });
  return el;
}

/* ══════════════════════════════════════════════════════
   RENDER FEED
══════════════════════════════════════════════════════ */
function renderFeed() {
  const s = getSession();
  D.feed.innerHTML = '';

  if (!s || !s.messages.length) {
    D.welcome.classList.remove('hidden');
    D.topbarTitle.textContent = 'AriaGPT';
    return;
  }

  D.welcome.classList.add('hidden');
  D.topbarTitle.textContent = s.title === 'New Chat' ? 'AriaGPT' : s.title;

  s.messages.forEach((m, i) => buildMsgEl(m.role, m.content, m.id || String(i), false, m.ts));
  scrollBottom(false);
}

/* ── Build message element ── */
function buildMsgEl(role, content, msgId, animate = true, ts = Date.now()) {
  D.welcome.classList.add('hidden');

  const row = document.createElement('div');
  row.className = `msg-row ${role === 'user' ? 'umsg' : 'amsg'}`;
  row.dataset.msgId = msgId;
  if (!animate) row.style.animation = 'none';

  const timeStr = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  /* Avatar SVG for AI (GroqSocial mark) */
  const aiAvatar = `
    <svg viewBox="0 0 36 36" fill="none">
      <g stroke="url(#av${msgId})" stroke-width="2.6" stroke-linecap="round">
        <path d="M18,7 A11,11 0 0,1 28.5,19.5"/>
        <path d="M27.5,23 A11,11 0 0,1 10.5,26"/>
        <path d="M8.5,23 A11,11 0 0,1 13.8,7.8"/>
      </g>
      <circle cx="18" cy="18" r="2.1" fill="url(#av${msgId})"/>
      <defs>
        <linearGradient id="av${msgId}" x1="7" y1="7" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#a78bfa"/>
          <stop offset="100%" stop-color="#6366f1"/>
        </linearGradient>
      </defs>
    </svg>`;

  if (role === 'user') {
    row.innerHTML = `
      <div class="msg-inner">
        <div class="m-body">
          <div class="m-sender">You <span class="m-time">${timeStr}</span></div>
          <div class="m-bubble user-bubble">${esc(content)}</div>
          <div class="m-actions">
            <button class="m-act js-copy">
              <svg viewBox="0 0 16 16"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>Copy
            </button>
            <button class="m-act js-edit">
              <svg viewBox="0 0 16 16"><path d="M11 2l3 3-8 8H3v-3L11 2z"/></svg>Edit
            </button>
          </div>
        </div>
      </div>`;
  } else {
    row.innerHTML = `
      <div class="msg-inner">
        <div class="m-avatar">${aiAvatar}</div>
        <div class="m-body">
          <div class="m-sender">AriaGPT <span class="m-time">${timeStr}</span></div>
          <div class="m-bubble ai-bubble">${md(content)}</div>
          <div class="m-actions">
            <button class="m-act js-copy"><svg viewBox="0 0 16 16"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>Copy</button>
            <button class="m-act js-thumb-up" data-id="${msgId}"><svg viewBox="0 0 16 16"><path d="M10 6V3a2 2 0 00-2-2L5 7v8h7.6a1.3 1.3 0 001.3-1.1l.9-5.9a1.3 1.3 0 00-1.3-1.5H10z"/><path d="M5 7H3a1 1 0 00-1 1v6a1 1 0 001 1h2"/></svg></button>
            <button class="m-act js-thumb-down" data-id="${msgId}"><svg viewBox="0 0 16 16"><path d="M6 10v3a2 2 0 002 2l3-6V1H3.4a1.3 1.3 0 00-1.3 1.1L1.2 8a1.3 1.3 0 001.3 1.5H6z"/><path d="M11 9h2a1 1 0 001-1V2a1 1 0 00-1-1h-2"/></svg></button>
            <button class="m-act js-regen hidden"><svg viewBox="0 0 16 16"><path d="M14 2v5h-5"/><path d="M2 11A6 6 0 0112.5 4.5L14 7"/><path d="M2 14v-5h5"/><path d="M14 5A6 6 0 013.5 11.5L2 9"/></svg>Regenerate</button>
          </div>
        </div>
      </div>`;

    // Apply saved feedback
    if (S.feedbackMap[msgId]) applyFeedbackUI(row, msgId, S.feedbackMap[msgId]);
  }

  D.feed.appendChild(row);

  // Bind actions
  row.querySelector('.js-copy')?.addEventListener('click', () => { clip(content); toast('Copied', 'ok'); });
  row.querySelector('.js-edit')?.addEventListener('click', () => startEdit(row, msgId));
  row.querySelector('.js-thumb-up')?.addEventListener('click', e => handleFeedback(e.currentTarget, msgId, 'up'));
  row.querySelector('.js-thumb-down')?.addEventListener('click', e => handleFeedback(e.currentTarget, msgId, 'down'));
  row.querySelector('.js-regen')?.addEventListener('click', () => regenerate(msgId));

  if (role === 'ai') {
    attachCodeCopy(row);
    if (typeof hljs !== 'undefined') row.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
  }

  updateRegenBtn();
  scrollBottom();
  return row;
}

function updateRegenBtn() {
  $$('.js-regen').forEach(b => b.classList.add('hidden'));
  const last = D.feed.querySelector('.amsg:last-of-type');
  if (last) last.querySelector('.js-regen')?.classList.remove('hidden');
}

/* ── Feedback ── */
function handleFeedback(btn, msgId, type) {
  if (S.feedbackMap[msgId] === type) {
    delete S.feedbackMap[msgId];
    const row = D.feed.querySelector(`[data-msg-id="${msgId}"]`);
    row?.querySelector('.js-thumb-up')?.classList.remove('liked');
    row?.querySelector('.js-thumb-down')?.classList.remove('disliked');
    return;
  }
  S.feedbackMap[msgId] = type;
  const row = D.feed.querySelector(`[data-msg-id="${msgId}"]`);
  if (row) applyFeedbackUI(row, msgId, type);
  toast(type === 'up' ? 'Marked as helpful' : 'Marked as not helpful', type === 'up' ? 'ok' : 'info');
}

function applyFeedbackUI(row, msgId, type) {
  row.querySelector('.js-thumb-up')?.classList.toggle('liked', type === 'up');
  row.querySelector('.js-thumb-down')?.classList.toggle('disliked', type === 'down');
}

/* ── Smart status indicator ── */
function showStatus(userMsg) {
  removeStatus();

  const messages = getStatusMessages(userMsg);
  let idx = 0;

  const aiAvatar = `
    <svg viewBox="0 0 36 36" fill="none">
      <g stroke="url(#stavg)" stroke-width="2.6" stroke-linecap="round">
        <path d="M18,7 A11,11 0 0,1 28.5,19.5"/>
        <path d="M27.5,23 A11,11 0 0,1 10.5,26"/>
        <path d="M8.5,23 A11,11 0 0,1 13.8,7.8"/>
      </g>
      <circle cx="18" cy="18" r="2.1" fill="url(#stavg)"/>
      <defs>
        <linearGradient id="stavg" x1="7" y1="7" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#6366f1"/>
        </linearGradient>
      </defs>
    </svg>`;

  const row = document.createElement('div');
  row.className = 'status-row';
  row.id = 'statusRow';
  row.innerHTML = `
    <div class="status-inner">
      <div class="status-avatar">${aiAvatar}</div>
      <div class="status-body">
        <div class="status-label">AriaGPT</div>
        <div class="status-content">
          <span class="status-text" id="statusText">${messages[0]}</span>
          <div class="status-dots"><div class="sd"></div><div class="sd"></div><div class="sd"></div></div>
        </div>
      </div>
    </div>`;

  D.feed.appendChild(row);
  scrollBottom();

  // Cycle through status messages every 3s
  S.statusTimer = setInterval(() => {
    idx = (idx + 1) % messages.length;
    const el = $('statusText');
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => {
        if (el) { el.textContent = messages[idx]; el.style.opacity = ''; }
      }, 300);
    }
  }, 3000);
}

function removeStatus() {
  clearInterval(S.statusTimer);
  S.statusTimer = null;
  $('statusRow')?.remove();
}

/* ── Stream message ── */
function startStream() {
  removeStatus();
  const aiAvatar = `
    <svg viewBox="0 0 36 36" fill="none">
      <g stroke="url(#sav)" stroke-width="2.6" stroke-linecap="round">
        <path d="M18,7 A11,11 0 0,1 28.5,19.5"/>
        <path d="M27.5,23 A11,11 0 0,1 10.5,26"/>
        <path d="M8.5,23 A11,11 0 0,1 13.8,7.8"/>
      </g>
      <circle cx="18" cy="18" r="2.1" fill="url(#sav)"/>
      <defs>
        <linearGradient id="sav" x1="7" y1="7" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#6366f1"/>
        </linearGradient>
      </defs>
    </svg>`;
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const row = document.createElement('div');
  row.id = 'streamRow';
  row.className = 'msg-row amsg';
  row.style.animation = 'none';
  row.innerHTML = `
    <div class="msg-inner">
      <div class="m-avatar">${aiAvatar}</div>
      <div class="m-body">
        <div class="m-sender">AriaGPT <span class="m-time">${ts}</span></div>
        <div class="m-bubble ai-bubble stream-live"><span class="scursor"></span></div>
        <div class="m-actions"></div>
      </div>
    </div>`;
  D.feed.appendChild(row);
  scrollBottom();
  return row;
}

function updateStream(row, text) {
  const b = row.querySelector('.stream-live');
  if (b) { b.innerHTML = esc(text).replace(/\n/g, '<br>') + '<span class="scursor"></span>'; }
  scrollBottom();
}

function finalizeStream(row, text, msgId) {
  row.id = '';
  row.dataset.msgId = msgId;
  const b = row.querySelector('.m-bubble');
  if (!b) return;
  b.classList.remove('stream-live');
  b.innerHTML = md(text);

  const actBar = row.querySelector('.m-actions');
  if (actBar) {
    actBar.innerHTML = `
      <button class="m-act js-copy"><svg viewBox="0 0 16 16"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>Copy</button>
      <button class="m-act js-thumb-up" data-id="${msgId}"><svg viewBox="0 0 16 16"><path d="M10 6V3a2 2 0 00-2-2L5 7v8h7.6a1.3 1.3 0 001.3-1.1l.9-5.9a1.3 1.3 0 00-1.3-1.5H10z"/><path d="M5 7H3a1 1 0 00-1 1v6a1 1 0 001 1h2"/></svg></button>
      <button class="m-act js-thumb-down" data-id="${msgId}"><svg viewBox="0 0 16 16"><path d="M6 10v3a2 2 0 002 2l3-6V1H3.4a1.3 1.3 0 00-1.3 1.1L1.2 8a1.3 1.3 0 001.3 1.5H6z"/><path d="M11 9h2a1 1 0 001-1V2a1 1 0 00-1-1h-2"/></svg></button>
      <button class="m-act js-regen"><svg viewBox="0 0 16 16"><path d="M14 2v5h-5"/><path d="M2 11A6 6 0 0112.5 4.5L14 7"/><path d="M2 14v-5h5"/><path d="M14 5A6 6 0 013.5 11.5L2 9"/></svg>Regenerate</button>`;
    actBar.querySelector('.js-copy').addEventListener('click', () => { clip(text); toast('Copied', 'ok'); });
    actBar.querySelector('.js-thumb-up').addEventListener('click', e => handleFeedback(e.currentTarget, msgId, 'up'));
    actBar.querySelector('.js-thumb-down').addEventListener('click', e => handleFeedback(e.currentTarget, msgId, 'down'));
    actBar.querySelector('.js-regen').addEventListener('click', () => regenerate(msgId));
  }

  attachCodeCopy(row);
  if (typeof hljs !== 'undefined') row.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
  updateRegenBtn();
  scrollBottom();
}

function showErrMsg(text) {
  const row = document.createElement('div');
  row.className = 'msg-row amsg';
  row.style.animation = 'none';
  const aiAvatar = `<svg viewBox="0 0 36 36" fill="none"><g stroke="url(#eavg)" stroke-width="2.6" stroke-linecap="round"><path d="M18,7 A11,11 0 0,1 28.5,19.5"/><path d="M27.5,23 A11,11 0 0,1 10.5,26"/><path d="M8.5,23 A11,11 0 0,1 13.8,7.8"/></g><circle cx="18" cy="18" r="2.1" fill="url(#eavg)"/><defs><linearGradient id="eavg" x1="7" y1="7" x2="29" y2="29" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs></svg>`;
  row.innerHTML = `
    <div class="msg-inner">
      <div class="m-avatar">${aiAvatar}</div>
      <div class="m-body">
        <div class="m-sender">AriaGPT</div>
        <div class="err-bubble">
          <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><path d="M10 7v4M10 14h.01"/></svg>
          ${esc(text)}
        </div>
      </div>
    </div>`;
  D.feed.appendChild(row);
  scrollBottom();
}

/* ══════════════════════════════════════════════════════
   SEND + STREAM
══════════════════════════════════════════════════════ */
async function sendMessage(text) {
  text = text.trim();
  console.log('sendMessage called with:', text);
  if (!text || S.loading) {
    console.log('sendMessage aborted - empty or loading');
    return;
  }

  const s = getSession();
  if (!s) {
    console.log('sendMessage aborted - no session');
    return;
  }
  console.log('Session found:', s.id, 'Messages before:', s.messages.length);

  const msgId = uid();
  const ts    = Date.now();

  setTitle(text);
  s.messages.push({ role: 'user', content: text, id: msgId + '_u', ts });
  s.updated = Date.now();
  persist();

  console.log('Building user message element');
  buildMsgEl('user', text, msgId + '_u', true, ts);

  D.msgInput.value = '';
  D.msgInput.style.height = 'auto';
  refreshMeta();
  refreshSend();

  setLoading(true);

  // Show smart status immediately
  showStatus(text);

  S.abort = new AbortController();
  let fullText  = '';
  let streamRow = null;

  try {
    const history = s.messages.slice(0, -1).slice(-14);
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
      signal: S.abort.signal,
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Server error ${res.status}`);
    }

    // Start SSE stream reading
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { reader.cancel(); break; }
        try {
          const { text: chunk, error } = JSON.parse(raw);
          if (error) throw new Error(error);
          if (chunk) {
            if (firstChunk) {
              // First real text — replace status with stream row
              removeStatus();
              streamRow = startStream();
              firstChunk = false;
            }
            fullText += chunk;
            if (streamRow) updateStream(streamRow, fullText);
          }
        } catch (pe) {
          if (pe.message && pe.message !== 'JSON') throw pe;
        }
      }
    }

    if (!fullText) fullText = '(No response received — please try again.)';

    if (streamRow) finalizeStream(streamRow, fullText, uid() + '_a');
    else {
      removeStatus();
      const aiId = uid() + '_a';
      buildMsgEl('ai', fullText, aiId, true);
    }

    s.messages.push({ role: 'ai', content: fullText, id: uid() + '_a', ts: Date.now() });
    s.updated = Date.now();
    persist();

  } catch (err) {
    removeStatus();
    streamRow?.remove();

    if (err.name === 'AbortError') {
      // User stopped — save what we have
      if (fullText) {
        const partial = fullText + '\n\n*— Generation stopped*';
        buildMsgEl('ai', partial, uid() + '_a', true);
        s.messages.push({ role: 'ai', content: fullText, id: uid() + '_a', ts: Date.now() });
        s.updated = Date.now(); persist();
      }
      toast('Generation stopped', 'info');
    } else {
      const msg = (err.message?.includes('fetch') || err.message?.includes('Failed'))
        ? 'Cannot reach the server. Please make sure it is running on port 3000.'
        : err.message || 'Something went wrong. Please try again.';
      showErrMsg(msg);
      toast(msg, 'err');
    }
  } finally {
    S.abort = null;
    setLoading(false);
  }
}

function stopGeneration() {
  if (S.abort) S.abort.abort();
}

/* ══════════════════════════════════════════════════════
   REGENERATE
══════════════════════════════════════════════════════ */
async function regenerate(msgId) {
  const s = getSession();
  if (!s || S.loading) return;

  const idx = s.messages.findIndex(m => m.id === msgId);
  if (idx === -1) return;

  // Remove AI message and after from state
  s.messages = s.messages.slice(0, idx);
  persist();

  // Remove from DOM
  const rows  = [...D.feed.querySelectorAll('.msg-row')];
  const found = rows.findIndex(r => r.dataset.msgId === msgId);
  if (found !== -1) rows.slice(found).forEach(r => r.remove());

  const lastUser = [...s.messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return;

  let fullText = '', streamRow = null;
  setLoading(true);
  showStatus(lastUser.content);
  S.abort = new AbortController();

  try {
    const history = s.messages.slice(0, -1).slice(-14);
    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lastUser.content, history }),
      signal: S.abort.signal,
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ''; let first = true;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim(); if (raw === '[DONE]') { reader.cancel(); break; }
        try {
          const { text: ch } = JSON.parse(raw);
          if (ch) {
            if (first) { removeStatus(); streamRow = startStream(); first = false; }
            fullText += ch; if (streamRow) updateStream(streamRow, fullText);
          }
        } catch {}
      }
    }
    if (!fullText) fullText = '(No response received.)';
    const aiId = uid() + '_a';
    if (streamRow) finalizeStream(streamRow, fullText, aiId);
    else { removeStatus(); buildMsgEl('ai', fullText, aiId, true); }
    s.messages.push({ role: 'ai', content: fullText, id: aiId, ts: Date.now() });
    s.updated = Date.now(); persist();
    toast('Regenerated', 'ok');
  } catch (err) {
    removeStatus(); streamRow?.remove();
    if (err.name !== 'AbortError') showErrMsg(err.message || 'Regeneration failed.');
  } finally { S.abort = null; setLoading(false); }
}

/* ══════════════════════════════════════════════════════
   EDIT MESSAGE
══════════════════════════════════════════════════════ */
function startEdit(row, msgId) {
  const s = getSession();
  if (!s || S.loading) return;
  const msgObj = s.messages.find(m => m.id === msgId);
  if (!msgObj) return;

  const bubble  = row.querySelector('.m-bubble');
  const actions = row.querySelector('.m-actions');
  const original = msgObj.content;

  bubble.innerHTML = `
    <textarea class="edit-ta" rows="3">${esc(original)}</textarea>
    <div class="edit-bar">
      <button class="edit-cancel">Cancel</button>
      <button class="edit-save">Save &amp; Submit</button>
    </div>`;

  const ta = bubble.querySelector('.edit-ta');
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  growEl(ta); ta.addEventListener('input', () => growEl(ta));
  if (actions) actions.style.opacity = '0';

  bubble.querySelector('.edit-cancel').addEventListener('click', () => {
    bubble.innerHTML = esc(original);
    if (actions) actions.style.opacity = '';
  });

  bubble.querySelector('.edit-save').addEventListener('click', () => {
    const newText = ta.value.trim();
    if (!newText || newText === original) {
      bubble.innerHTML = esc(original);
      if (actions) actions.style.opacity = '';
      return;
    }
    const idx = s.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      s.messages[idx].content = newText;
      s.messages.splice(idx + 1);
      persist();

      const allRows = [...D.feed.querySelectorAll('.msg-row')];
      const rowIdx  = allRows.indexOf(row);
      allRows.slice(rowIdx + 1).forEach(r => r.remove());
      bubble.innerHTML = esc(newText);
      if (actions) actions.style.opacity = '';

      // Re-submit
      (async () => {
        let fullText = '', streamRow = null;
        setLoading(true); showStatus(newText); S.abort = new AbortController();
        try {
          const history = s.messages.slice(0, -1).slice(-14);
          const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: newText, history }), signal: S.abort.signal });
          if (!res.ok) throw new Error(`Server error ${res.status}`);
          const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let first = true;
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n'); buf = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim(); if (raw === '[DONE]') { reader.cancel(); break; }
              try { const { text: ch } = JSON.parse(raw); if (ch) { if (first) { removeStatus(); streamRow = startStream(); first = false; } fullText += ch; if (streamRow) updateStream(streamRow, fullText); } } catch {}
            }
          }
          if (!fullText) fullText = '(No response.)';
          const aiId = uid() + '_a';
          if (streamRow) finalizeStream(streamRow, fullText, aiId);
          else { removeStatus(); buildMsgEl('ai', fullText, aiId, true); }
          s.messages.push({ role: 'ai', content: fullText, id: aiId, ts: Date.now() });
          s.updated = Date.now(); persist(); toast('Message updated', 'ok');
        } catch (e) { removeStatus(); streamRow?.remove(); if (e.name !== 'AbortError') showErrMsg(e.message || 'Failed.'); }
        finally { S.abort = null; setLoading(false); }
      })();
    }
  });
}

/* ══════════════════════════════════════════════════════
   MARKDOWN RENDERER
══════════════════════════════════════════════════════ */
function md(raw) {
  if (!raw) return '';
  let s = raw;

  const blocks = [];
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push({ lang: lang.trim() || 'text', code: code.trimEnd() });
    return `\x00B${blocks.length - 1}\x00`;
  });

  const inlines = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { inlines.push(esc(c)); return `\x00I${inlines.length - 1}\x00`; });

  s = s.replace(/&(?![a-z#\d]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^### (.+)$/gm,  '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm,   '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm,    '<h1>$1</h1>');
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/^---+$/gm, '<hr>');

  s = s.replace(/((?:^[ \t]*[*\-+] .+\n?)+)/gm, blk => {
    const items = blk.trim().split('\n').map(l => { const m = l.match(/^[ \t]*[*\-+] (.+)/); return m ? `<li>${m[1]}</li>` : ''; }).join('');
    return `<ul>${items}</ul>`;
  });
  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, blk => {
    const items = blk.trim().split('\n').map(l => { const m = l.match(/^\d+\. (.+)/); return m ? `<li>${m[1]}</li>` : ''; }).join('');
    return `<ol>${items}</ol>`;
  });

  // Tables
  s = s.replace(/((?:^\|.+\|\n?)+)/gm, blk => {
    const rows = blk.trim().split('\n');
    const parse = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const data  = rows.filter(r => !/^\|[\s:\-|]+\|$/.test(r));
    if (data.length < 2) return blk;
    const [head, ...body] = data;
    return `<table><thead><tr>${parse(head).map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${parse(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });

  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  s = s.split(/\n{2,}/).map(b => {
    b = b.trim(); if (!b) return '';
    if (/^<(h\d|ul|ol|blockquote|hr|table)/.test(b) || b.includes('\x00B')) return b;
    return `<p>${b.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  inlines.forEach((c, i) => { s = s.replaceAll(`\x00I${i}\x00`, `<code>${c}</code>`); });

  blocks.forEach(({ lang, code }, i) => {
    s = s.replaceAll(`\x00B${i}\x00`, `
      <div class="code-blk">
        <div class="code-head">
          <span class="code-lang-lbl">${esc(lang)}</span>
          <button class="code-copy-btn" data-raw="${encodeURIComponent(code)}">
            <svg viewBox="0 0 16 16"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>Copy
          </button>
        </div>
        <pre><code class="language-${esc(lang)}">${esc(code)}</code></pre>
      </div>`);
  });

  return s;
}

function attachCodeCopy(el) {
  el.querySelectorAll('.code-copy-btn[data-raw]').forEach(btn => {
    btn.addEventListener('click', () => {
      clip(decodeURIComponent(btn.dataset.raw));
      btn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 9l4 4 6-8" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Copied';
    });
  });
}

function exportAsMarkdown(s, title, timestamp) {
  const lines = [`# ${s.title}`, `*Exported ${timestamp} — AriaGPT*`, '', '---', ''];
  s.messages.forEach(m => {
    lines.push(`### ${m.role === 'user' ? 'You' : 'AriaGPT'}`);
    lines.push(m.content, '');
  });
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown' }), `${title}.md`);
  toast('Downloaded as Markdown', 'ok');
}

function exportAsTXT(s, title, timestamp) {
  const lines = [`${s.title}`, `Exported ${timestamp} — AriaGPT`, '', '==================', ''];
  s.messages.forEach(m => {
    lines.push(`${m.role === 'user' ? 'You' : 'AriaGPT'}:`);
    lines.push(m.content);
    lines.push('');
    lines.push('------------------');
    lines.push('');
  });
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain' }), `${title}.txt`);
  toast('Downloaded as Plain Text', 'ok');
}

function exportAsJSON(s, title, timestamp) {
  const data = {
    title: s.title,
    exported: timestamp,
    app: 'AriaGPT',
    messageCount: s.messages.length,
    messages: s.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.ts ? new Date(m.ts).toISOString() : null
    }))
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${title}.json`);
  toast('Downloaded as JSON', 'ok');
}

function exportAsHTML(s, title, timestamp) {
  const messagesHtml = s.messages.map(m => {
    const isUser = m.role === 'user';
    const timeStr = m.ts ? new Date(m.ts).toLocaleString() : '';
    const content = esc(m.content).replace(/\n/g, '<br>');
    return `
      <div class="message ${isUser ? 'user' : 'ai'}">
        <div class="message-header">
          <strong>${isUser ? 'You' : 'AriaGPT'}</strong>
          <span class="time">${timeStr}</span>
        </div>
        <div class="message-content">${content}</div>
      </div>`;
  }).join('\n');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(s.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #ddd; }
    .header h1 { margin: 0; color: #333; }
    .header small { color: #666; }
    .message { background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .message.user { border-left: 4px solid #6366f1; }
    .message.ai { border-left: 4px solid #a78bfa; }
    .message-header { margin-bottom: 10px; color: #666; font-size: 0.9em; }
    .message-content { line-height: 1.6; white-space: pre-wrap; }
    .time { margin-left: 10px; color: #999; font-size: 0.85em; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(s.title)}</h1>
    <small>Exported ${esc(timestamp)} — AriaGPT</small>
  </div>
  ${messagesHtml}
</body>
</html>`;
  
  downloadBlob(new Blob([html], { type: 'text/html' }), `${title}.html`);
  toast('Downloaded as HTML', 'ok');
}

function exportAsPNG(s, title) {
  // Create a canvas to render the chat
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set dimensions
  const width = 800;
  const padding = 40;
  let y = padding;
  
  // Calculate height needed
  ctx.font = '16px sans-serif';
  let height = padding * 2 + 60; // Header space
  
  s.messages.forEach(m => {
    const lines = Math.ceil(m.content.length / 80) + 2;
    height += lines * 24 + 30;
  });
  
  canvas.width = width;
  canvas.height = Math.min(height, 4000); // Max height
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Header
  ctx.fillStyle = '#a78bfa';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(s.title, padding, y);
  y += 35;
  
  ctx.fillStyle = '#888';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Exported ${new Date().toLocaleString()}`, padding, y);
  y += 40;
  
  // Separator
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 30;
  
  // Messages
  s.messages.forEach(m => {
    const isUser = m.role === 'user';
    ctx.fillStyle = isUser ? '#6366f1' : '#a78bfa';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(isUser ? 'You' : 'AriaGPT', padding, y);
    y += 20;
    
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '14px sans-serif';
    
    // Wrap text
    const words = m.content.split(' ');
    let line = '';
    words.forEach(word => {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > width - padding * 2 && line) {
        ctx.fillText(line, padding, y);
        y += 22;
        line = word + ' ';
      } else {
        line = testLine;
      }
    });
    if (line) {
      ctx.fillText(line, padding, y);
      y += 22;
    }
    y += 20;
  });
  
  // Download
  canvas.toBlob(blob => {
    if (blob) {
      downloadBlob(blob, `${title}.png`);
      toast('Downloaded as PNG image', 'ok');
    } else {
      toast('Failed to create PNG', 'err');
    }
  });
}

function exportAsPDF(s, title, timestamp) {
  // For PDF, we'll create a simple HTML and use print-to-PDF
  const messagesHtml = s.messages.map(m => {
    const isUser = m.role === 'user';
    const timeStr = m.ts ? new Date(m.ts).toLocaleString() : '';
    const content = esc(m.content).replace(/\n/g, '<br>');
    return `
      <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid ${isUser ? '#6366f1' : '#a78bfa'}; background: #f9f9f9;">
        <div style="font-weight: bold; margin-bottom: 8px; color: ${isUser ? '#6366f1' : '#a78bfa'};">
          ${isUser ? 'You' : 'AriaGPT'} <span style="color: #999; font-weight: normal; font-size: 0.85em;">${timeStr}</span>
        </div>
        <div style="line-height: 1.6;">${content}</div>
      </div>`;
  }).join('\n');
  
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${esc(s.title)}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ddd; padding-bottom: 20px;">
    <h1 style="margin: 0; color: #333;">${esc(s.title)}</h1>
    <small style="color: #666;">Exported ${esc(timestamp)} — AriaGPT</small>
  </div>
  ${messagesHtml}
  <script>window.onload = () => { setTimeout(() => window.print(), 100); };</script>
</body>
</html>`;
  
  // Open in new window for print-to-PDF
  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  toast('PDF export opened — use Save as PDF in print dialog', 'ok');
}

function downloadBlob(blob, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Legacy export function (redirects to new system) ── */
function exportSession(id = S.currentId) {
  exportChat('markdown');
}

/* ══════════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════════ */
function setLoading(on) {
  S.loading = on;
  D.sendBtn.classList.toggle('is-stop', on);
  D.sendIco.classList.toggle('hidden', on);
  D.stopIco.classList.toggle('hidden', !on);
  D.sendBtn.disabled = !on && D.msgInput.value.trim().length === 0;
}

function refreshSend() {
  if (S.loading) return;
  D.sendBtn.disabled = D.msgInput.value.trim().length === 0;
}

function refreshMeta() {
  const text  = D.msgInput.value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  D.wc.textContent = words > 0 ? `${words}w` : '';
  D.cc.textContent = chars > 60 ? `${chars}/${MAX_LEN}` : '';
  D.cc.classList.toggle('warn', chars > MAX_LEN * .78);
  D.cc.classList.toggle('over', chars > MAX_LEN);
}

function growEl(el = D.msgInput) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 190) + 'px';
}

function scrollBottom(smooth = true) {
  D.chatView.scrollTo({ top: D.chatView.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

function checkScrollBtn() {
  const { scrollTop, scrollHeight, clientHeight } = D.chatView;
  const near = scrollHeight - scrollTop - clientHeight < 130;
  D.scrollBtn.classList.toggle('hidden', near);
}

/* ── Theme ── */
function applyTheme(save = true) {
  document.documentElement.setAttribute('data-theme', S.theme);
  D.icoSun.classList.toggle('hidden', S.theme === 'light');
  D.icoMoon.classList.toggle('hidden', S.theme === 'dark');
  if (save) localStorage.setItem(getUserKey('theme'), S.theme);
}
function toggleTheme() { S.theme = S.theme === 'dark' ? 'light' : 'dark'; applyTheme(); toast(`Switched to ${S.theme} mode`, 'ok'); }

/* ── Sidebar ── */
function applySidebar(save = true) {
  D.sidebar.classList.toggle('collapsed', !S.sidebarOpen);
  D.mobOverlay.classList.toggle('hidden', !S.sidebarOpen || window.innerWidth > 768);
  if (save) localStorage.setItem(getUserKey('sb'), S.sidebarOpen ? '1' : '0');
}
function toggleSidebar() { S.sidebarOpen = !S.sidebarOpen; applySidebar(); }
function closeSidebar()  { S.sidebarOpen = false; applySidebar(); }
function openSidebar()   { S.sidebarOpen = true;  applySidebar(); }

/* ── Context menu ── */
function showCtxMenu(e, id) {
  S.ctxId = id;
  const m = D.ctxMenu;
  m.classList.remove('hidden');
  let x = e.clientX || e.target.getBoundingClientRect().right;
  let y = e.clientY || e.target.getBoundingClientRect().top;
  if (x + 170 > window.innerWidth)  x = window.innerWidth - 174;
  if (y + 120 > window.innerHeight) y = window.innerHeight - 124;
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function hideCtxMenu() { D.ctxMenu.classList.add('hidden'); S.ctxId = null; }

/* ── Modals ── */
function openModal(id)  { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

function openRenameModal(id) {
  const s = getSession(id); if (!s) return;
  S.renameId = id; D.renameField.value = s.title;
  openModal('renameModal');
  setTimeout(() => { D.renameField.focus(); D.renameField.select(); }, 60);
}
function openDeleteModal(id) { S.deleteId = id; openModal('deleteModal'); }

/* ── Toast ── */
function toast(msg, type = 'ok') {
  const icons = {
    ok:   `<svg viewBox="0 0 16 16"><path d="M3 8l4 4 6-7" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    err:  `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11h.01" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    info: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7v5M8 5h.01" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = (icons[type] || '') + esc(msg);
  D.toasts.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 2800);
}

/* ── Clipboard ── */
async function clip(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' }); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}

/* ── Escape ── */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ══════════════════════════════════════════════════════
   BIND ALL EVENTS
══════════════════════════════════════════════════════ */
function bindAll() {

  /* Input - Enter sends message, Shift+Enter creates new line */
  D.msgInput.addEventListener('input', () => { growEl(); refreshSend(); refreshMeta(); });
  D.msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (!e.shiftKey) {
        // Enter alone = send message
        e.preventDefault();
        e.stopPropagation();
        console.log('Enter pressed - sending message');
        if (S.loading) { stopGeneration(); return; }
        if (D.msgInput.value.trim()) {
          console.log('Sending:', D.msgInput.value);
          sendMessage(D.msgInput.value);
        }
      }
      // Shift+Enter = allow default (new line)
    }
  });
  D.sendBtn.addEventListener('click', () => {
    if (S.loading) { stopGeneration(); return; }
    if (D.msgInput.value.trim()) sendMessage(D.msgInput.value);
  });

  /* Sidebar */
  D.sidebarClose.addEventListener('click', toggleSidebar);
  D.sidebarOpen.addEventListener('click', openSidebar);
  D.mobOverlay.addEventListener('click', closeSidebar);

  /* New chat */
  D.newChatBtn.addEventListener('click', () => { if (!S.loading) { newSession(); toast('New conversation started', 'ok'); } });

  /* Search */
  D.searchInput.addEventListener('input', e => {
    S.searchQ = e.target.value;
    D.searchClear.classList.toggle('hidden', !S.searchQ);
    renderHistory();
  });
  D.searchClear.addEventListener('click', () => {
    S.searchQ = ''; D.searchInput.value = '';
    D.searchClear.classList.add('hidden');
    renderHistory(); D.searchInput.focus();
  });

  /* Clear */
  D.topbarClear.addEventListener('click', () => {
    if (S.loading) return;
    const s = getSession();
    if (!s || !s.messages.length) { toast('Chat is already empty', 'info'); return; }
    s.messages = []; s.title = 'New Chat'; s.updated = Date.now();
    persist(); renderFeed(); renderHistory(); toast('Conversation cleared', 'ok');
  });

  /* Export + Share */
  D.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showExportMenu();
  });
  D.shareBtn.addEventListener('click', () => { clip(window.location.href); toast('Link copied to clipboard', 'ok'); });

  /* Theme */
  D.themeBtn.addEventListener('click', toggleTheme);

  /* Shortcuts modal */
  D.shortcutsBtn.addEventListener('click', () => openModal('shortcutsModal'));

  /* Rename */
  D.renameOk.addEventListener('click', () => {
    if (S.renameId) { renameSession(S.renameId, D.renameField.value); closeModal('renameModal'); toast('Renamed', 'ok'); }
  });
  D.renameField.addEventListener('keydown', e => { if (e.key === 'Enter') D.renameOk.click(); });

  /* Delete */
  D.deleteOk.addEventListener('click', () => {
    if (S.deleteId) { deleteSession(S.deleteId); closeModal('deleteModal'); toast('Deleted', 'ok'); }
  });

  /* Context menu */
  D.ctxRename.addEventListener('click', () => { const id = S.ctxId; hideCtxMenu(); openRenameModal(id); });
  D.ctxExport.addEventListener('click', () => { exportSession(S.ctxId); hideCtxMenu(); });
  D.ctxDelete.addEventListener('click', () => { const id = S.ctxId; hideCtxMenu(); openDeleteModal(id); });
  document.addEventListener('click', e => { if (!D.ctxMenu.contains(e.target)) hideCtxMenu(); });

  /* Modal [data-close] */
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $$('.overlay').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); }));

  /* Capability tiles → fill input */
  $$('.cap-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      D.msgInput.value = tile.dataset.fill || '';
      growEl(); refreshSend(); refreshMeta();
      D.msgInput.focus();
      D.msgInput.setSelectionRange(D.msgInput.value.length, D.msgInput.value.length);
    });
  });

  /* Starter prompts */
  $$('.starter').forEach(btn => {
    btn.addEventListener('click', () => {
      D.msgInput.value = btn.dataset.p;
      growEl(); refreshSend(); refreshMeta(); D.msgInput.focus();
    });
  });

  /* Scroll button */
  D.chatView.addEventListener('scroll', checkScrollBtn, { passive: true });
  D.scrollBtn.addEventListener('click', () => { scrollBottom(); D.scrollBtn.classList.add('hidden'); });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      if (S.loading) { stopGeneration(); return; }
      const open = document.querySelector('.overlay:not(.hidden)');
      if (open) { open.classList.add('hidden'); return; }
      hideCtxMenu();
    }

    if (mod && e.shiftKey && e.key === 'O') { e.preventDefault(); if (!S.loading) { newSession(); toast('New chat', 'ok'); } }
    if (mod && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
    if (mod && e.key === 'i') { e.preventDefault(); D.msgInput.focus(); }
    if (mod && e.key === 'k') { e.preventDefault(); openSidebar(); setTimeout(() => D.searchInput.focus(), 200); }
    if (mod && e.shiftKey && e.key === 'L') { e.preventDefault(); toggleTheme(); }
    if (mod && e.shiftKey && e.key === 'E') { e.preventDefault(); exportSession(); }
    if (e.key === '?' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault(); openModal('shortcutsModal');
    }
  });

  /* Resize */
  window.addEventListener('resize', () => { if (window.innerWidth > 768) D.mobOverlay.classList.add('hidden'); });
}

/* ══════════════════════════════════════════════════════
   ADVANCED AI API INTEGRATION
   Direct API calls with multiple provider support
══════════════════════════════════════════════════════ */

function getApiKey(provider) {
  return S.apiKeys[provider] || '';
}

function setApiKey(provider, key) {
  S.apiKeys[provider] = key;
  localStorage.setItem(getUserKey('apikeys'), JSON.stringify(S.apiKeys));
}

function getModelInfo(modelId) {
  for (const [provider, config] of Object.entries(AI_PROVIDERS)) {
    const model = config.models.find(m => m.id === modelId);
    if (model) return { ...model, provider, providerName: config.name };
  }
  return AI_PROVIDERS.groq.models[0];
}

function setModel(modelId) {
  const info = getModelInfo(modelId);
  if (info) {
    S.currentModel = modelId;
    S.currentProvider = info.provider;
    localStorage.setItem(getUserKey('model'), modelId);
    localStorage.setItem(getUserKey('provider'), info.provider);
    updateModelSelectorUI();
    toast(`Switched to ${info.name}`, 'ok');
  }
}

function updateModelSelectorUI() {
  const selector = $('modelSelector');
  const inputSelector = $('inputModelSelector');
  const inputBadge = $('inputModelBadge');
  const inputName = $('inputModelName');
  const info = getModelInfo(S.currentModel);
  
  if (selector) {
    selector.innerHTML = `
      <span class="model-badge">${info.providerName}</span>
      <span class="model-name">${info.name}</span>
      <svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>
    `;
  }
  
  if (inputSelector && inputBadge && inputName) {
    inputBadge.textContent = info.providerName;
    inputName.textContent = info.name;
  }
}

async function callAIAPI(message, history, onChunk, onError) {
  const provider = S.currentProvider;
  const model = S.currentModel;
  const apiKey = getApiKey(provider);
  
  // If no API key set, fallback to local backend
  if (!apiKey && S.useLocalBackend) {
    return callLocalBackend(message, history, onChunk, onError);
  }
  
  const config = AI_PROVIDERS[provider];
  if (!config) {
    onError(new Error('Unknown provider'));
    return;
  }
  
  try {
    let body, headers = { 'Content-Type': 'application/json' };
    
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      const messages = [];
      history.forEach(h => {
        if (h.role === 'user') messages.push({ role: 'user', content: h.content });
        else if (h.role === 'ai' || h.role === 'assistant') messages.push({ role: 'assistant', content: h.content });
      });
      messages.push({ role: 'user', content: message });
      body = { model, messages, max_tokens: 4096, stream: true };
    } else {
      // OpenAI-compatible (Groq, OpenAI)
      headers['Authorization'] = `Bearer ${apiKey}`;
      const messages = [];
      history.forEach(h => {
        if (h.role === 'user') messages.push({ role: 'user', content: h.content });
        else if (h.role === 'ai' || h.role === 'assistant') messages.push({ role: 'assistant', content: h.content });
      });
      messages.push({ role: 'user', content: message });
      body = { model, messages, max_tokens: 4096, stream: true, temperature: 0.7 };
    }
    
    const res = await fetch(config.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error ${res.status}`);
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          
          try {
            const json = JSON.parse(data);
            let chunk = '';
            
            if (provider === 'anthropic') {
              chunk = json.delta?.text || '';
            } else {
              chunk = json.choices?.[0]?.delta?.content || '';
            }
            
            if (chunk) onChunk(chunk);
          } catch {}
        }
      }
    }
  } catch (err) {
    onError(err);
  }
}

async function callLocalBackend(message, history, onChunk, onError) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history.slice(-14) })
    });
    
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          
          try {
            const json = JSON.parse(data);
            if (json.text) onChunk(json.text);
          } catch {}
        }
      }
    }
  } catch (err) {
    onError(err);
  }
}

/* ══════════════════════════════════════════════════════
   MESSAGE SEARCH WITHIN CHAT
══════════════════════════════════════════════════════ */
function openChatSearch() {
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.id = 'chatSearchModal';
  modal.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-hd">
        <h2 class="modal-title">Search in Chat</h2>
        <button class="icon-btn" onclick="closeChatSearch()"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
      <div class="modal-bd">
        <div class="search-box">
          <input type="text" id="chatSearchInput" placeholder="Search messages..." class="modal-field" />
          <div class="search-stats" id="searchStats"></div>
        </div>
        <div class="search-results" id="searchResults"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => {
    modal.classList.remove('hidden');
    $('chatSearchInput').focus();
    $('chatSearchInput').addEventListener('input', debounceSearchChat);
    $('chatSearchInput').addEventListener('keydown', handleSearchNav);
  }, 10);
}

function closeChatSearch() {
  const modal = $('chatSearchModal');
  if (modal) {
    modal.classList.add('hidden');
    setTimeout(() => modal.remove(), 300);
  }
  S.chatSearchQ = '';
  clearSearchHighlights();
}

function debounceSearchChat() {
  clearTimeout(S.suggestTimer);
  S.suggestTimer = setTimeout(() => searchInChat($('chatSearchInput').value), 150);
}

function searchInChat(query) {
  clearSearchHighlights();
  if (!query.trim()) {
    $('searchStats').textContent = '';
    $('searchResults').innerHTML = '';
    return;
  }
  
  const s = getSession();
  if (!s) return;
  
  const matches = [];
  const q = query.toLowerCase();
  
  s.messages.forEach((m, idx) => {
    if (m.content.toLowerCase().includes(q)) {
      matches.push({ msg: m, idx, preview: getMatchPreview(m.content, q) });
    }
  });
  
  $('searchStats').textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;
  
  const resultsHtml = matches.map((match, i) => `
    <div class="search-result" onclick="jumpToMessage(${match.idx}, '${query}')">
      <div class="search-result-role">${match.msg.role === 'user' ? 'You' : 'AI'}</div>
      <div class="search-result-preview">${esc(match.preview)}</div>
    </div>
  `).join('');
  
  $('searchResults').innerHTML = resultsHtml || '<div class="search-no-results">No matches found</div>';
}

function getMatchPreview(content, query) {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + query.length + 40);
  let preview = content.slice(start, end);
  if (start > 0) preview = '...' + preview;
  if (end < content.length) preview = preview + '...';
  return preview;
}

function jumpToMessage(idx, query) {
  closeChatSearch();
  const rows = [...D.feed.querySelectorAll('.msg-row')];
  if (rows[idx]) {
    rows[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightMatch(rows[idx], query);
  }
}

function highlightMatch(row, query) {
  const bubble = row.querySelector('.m-bubble');
  if (!bubble) return;
  
  const text = bubble.textContent;
  const regex = new RegExp(`(${escRegex(query)})`, 'gi');
  const html = esc(text).replace(regex, '<mark class="search-highlight">$1</mark>');
  bubble.innerHTML = html;
  
  setTimeout(() => {
    bubble.innerHTML = esc(text);
  }, 3000);
}

function clearSearchHighlights() {
  D.feed.querySelectorAll('.search-highlight').forEach(el => {
    const parent = el.parentElement;
    if (parent) parent.textContent = parent.textContent;
  });
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function handleSearchNav(e) {
  if (e.key === 'Escape') closeChatSearch();
  if (e.key === 'Enter') {
    const firstResult = document.querySelector('.search-result');
    if (firstResult) firstResult.click();
  }
}

/* ══════════════════════════════════════════════════════
   CHAT BRANCHING / FORKING
══════════════════════════════════════════════════════ */
function forkChatFromMessage(msgId) {
  const s = getSession();
  if (!s) return;
  
  const msgIdx = s.messages.findIndex(m => m.id === msgId);
  if (msgIdx === -1) return;
  
  // Create new chat with messages up to this point
  const forked = {
    id: uid(),
    title: s.title + ' (fork)',
    messages: s.messages.slice(0, msgIdx + 1).map(m => ({ ...m, id: uid() })),
    created: Date.now(),
    updated: Date.now(),
    forkedFrom: s.id,
    forkedAt: msgIdx
  };
  
  S.sessions.unshift(forked);
  S.currentId = forked.id;
  persist();
  renderHistory();
  renderFeed();
  toast('Chat forked', 'ok');
}

/* ══════════════════════════════════════════════════════
   MESSAGE PINNING
══════════════════════════════════════════════════════ */
function togglePinMessage(msgId) {
  const idx = S.pinnedMsgs.findIndex(p => p.msgId === msgId && p.chatId === S.currentId);
  if (idx > -1) {
    S.pinnedMsgs.splice(idx, 1);
    toast('Message unpinned', 'info');
  } else {
    const s = getSession();
    const msg = s?.messages.find(m => m.id === msgId);
    if (msg) {
      S.pinnedMsgs.push({ msgId, chatId: S.currentId, content: msg.content.slice(0, 200), ts: Date.now() });
      toast('Message pinned', 'ok');
    }
  }
  localStorage.setItem(getUserKey('pins'), JSON.stringify(S.pinnedMsgs));
  updatePinIndicators();
}

function updatePinIndicators() {
  D.feed.querySelectorAll('.msg-row').forEach(row => {
    const msgId = row.dataset.msgId;
    const isPinned = S.pinnedMsgs.some(p => p.msgId === msgId && p.chatId === S.currentId);
    row.classList.toggle('pinned', isPinned);
  });
}

function showPinnedMessages() {
  const pins = S.pinnedMsgs.filter(p => p.chatId === S.currentId);
  if (!pins.length) { toast('No pinned messages in this chat', 'info'); return; }
  
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-hd"><h2 class="modal-title">Pinned Messages (${pins.length})</h2><button class="icon-btn" onclick="this.closest('.overlay').remove()"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg></button></div>
      <div class="modal-bd"><div class="pinned-list">${pins.map(p => `<div class="pinned-item" onclick="jumpToPinned('${p.msgId}')">${esc(p.content)}...</div>`).join('')}</div></div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.remove('hidden'), 10);
}

function jumpToPinned(msgId) {
  document.querySelector('.overlay')?.remove();
  const row = D.feed.querySelector(`[data-msg-id="${msgId}"]`);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.style.animation = 'pulse 1s';
    setTimeout(() => row.style.animation = '', 1000);
  }
}

/* ══════════════════════════════════════════════════════
   SMART SUGGESTIONS
══════════════════════════════════════════════════════ */
const SUGGESTIONS = [
  'Explain this like I\'m 5',
  'Give me code examples',
  'Show me the pros and cons',
  'Continue from here',
  'Summarize in bullet points',
  'Make it shorter',
  'Expand on this',
  'What are the alternatives?',
  'How would an expert approach this?',
  'Can you provide sources?',
  'Fix any errors in this',
  'Optimize this code',
  'Add error handling',
  'Write tests for this',
  'Document this code',
];

function showSuggestions() {
  const container = document.createElement('div');
  container.className = 'suggestions-popup';
  container.id = 'suggestionsPopup';
  
  const suggestions = SUGGESTIONS.slice(0, 6);
  container.innerHTML = suggestions.map(s => `<button class="suggestion-chip" onclick="applySuggestion('${s}')">${esc(s)}</button>`).join('');
  
  const inputRect = D.msgInput.getBoundingClientRect();
  container.style.left = inputRect.left + 'px';
  container.style.bottom = (window.innerHeight - inputRect.top + 10) + 'px';
  
  document.body.appendChild(container);
  
  const closeOnClickOutside = (e) => {
    if (!container.contains(e.target) && e.target !== D.msgInput) {
      container.remove();
      document.removeEventListener('click', closeOnClickOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnClickOutside), 10);
}

function applySuggestion(text) {
  $('suggestionsPopup')?.remove();
  D.msgInput.value = text;
  D.msgInput.focus();
  growEl();
  refreshSend();
}

/* ══════════════════════════════════════════════════════
   ADVANCED EXPORT
══════════════════════════════════════════════════════ */
function exportChat(format = 'markdown') {
  const s = getSession();
  if (!s || !s.messages.length) { toast('Nothing to export', 'info'); return; }
  
  switch(format) {
    case 'json':
      exportAsJSON(s);
      break;
    case 'markdown':
      exportSession();
      break;
    case 'txt':
      exportAsTXT(s);
      break;
  }
}

function exportAsJSON(s) {
  const data = {
    title: s.title,
    exportedAt: new Date().toISOString(),
    messageCount: s.messages.length,
    messages: s.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.ts
    }))
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${s.title.replace(/[^\w\s-]/g, '').trim() || 'chat'}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported as JSON', 'ok');
}

function exportAsTXT(s) {
  const lines = [`Chat: ${s.title}`, `Exported: ${new Date().toLocaleString()}`, ''];
  s.messages.forEach(m => {
    lines.push(`${m.role === 'user' ? 'You' : 'AriaGPT'} (${new Date(m.ts).toLocaleTimeString()}):`);
    lines.push(m.content, '');
  });
  
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${s.title.replace(/[^\w\s-]/g, '').trim() || 'chat'}.txt`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported as TXT', 'ok');
}

function exportAllChats() {
  const data = {
    exportedAt: new Date().toISOString(),
    chatCount: S.sessions.length,
    chats: S.sessions
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `ariagpt_backup_${new Date().toISOString().slice(0,10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exported ${S.sessions.length} chats`, 'ok');
}

/* ══════════════════════════════════════════════════════
   API KEY MANAGEMENT UI
══════════════════════════════════════════════════════ */
function openApiKeyModal() {
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.id = 'apiKeyModal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-hd">
        <h2 class="modal-title">API Keys</h2>
        <button class="icon-btn" onclick="closeApiKeyModal()"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
      <div class="modal-bd">
        <div class="api-key-section">
          <label class="api-key-label">Groq API Key <a href="https://console.groq.com" target="_blank">Get key →</a></label>
          <input type="password" id="groqApiKey" class="modal-field" placeholder="gsk_..." value="${getApiKey('groq')}" />
        </div>
        <div class="api-key-section">
          <label class="api-key-label">OpenAI API Key <a href="https://platform.openai.com" target="_blank">Get key →</a></label>
          <input type="password" id="openaiApiKey" class="modal-field" placeholder="sk-..." value="${getApiKey('openai')}" />
        </div>
        <div class="api-key-section">
          <label class="api-key-label">Anthropic API Key <a href="https://console.anthropic.com" target="_blank">Get key →</a></label>
          <input type="password" id="anthropicApiKey" class="modal-field" placeholder="sk-ant-..." value="${getApiKey('anthropic')}" />
        </div>
        <div class="api-key-toggle">
          <label class="toggle">
            <input type="checkbox" id="useLocalBackend" ${S.useLocalBackend ? 'checked' : ''} onchange="toggleLocalBackend(this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span>Use local backend when no API key</span>
        </div>
      </div>
      <div class="modal-ft">
        <button class="btn-ghost" onclick="closeApiKeyModal()">Cancel</button>
        <button class="btn-primary" onclick="saveApiKeys()">Save Keys</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.remove('hidden'), 10);
}

function closeApiKeyModal() {
  const modal = $('apiKeyModal');
  if (modal) {
    modal.classList.add('hidden');
    setTimeout(() => modal.remove(), 300);
  }
}

function saveApiKeys() {
  const groq = $('groqApiKey')?.value.trim() || '';
  const openai = $('openaiApiKey')?.value.trim() || '';
  const anthropic = $('anthropicApiKey')?.value.trim() || '';
  
  if (groq) setApiKey('groq', groq);
  if (openai) setApiKey('openai', openai);
  if (anthropic) setApiKey('anthropic', anthropic);
  
  closeApiKeyModal();
  toast('API keys saved', 'ok');
}

function toggleLocalBackend(checked) {
  S.useLocalBackend = checked;
  localStorage.setItem(getUserKey('localbackend'), checked);
}

/* ══════════════════════════════════════════════════════
   MODEL SELECTOR
══════════════════════════════════════════════════════ */
function openModelSelector() {
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.id = 'modelSelectorModal';
  
  let modelList = '';
  for (const [key, provider] of Object.entries(AI_PROVIDERS)) {
    modelList += `
      <div class="model-provider">
        <div class="provider-header">${provider.name}</div>
        <div class="model-grid">
          ${provider.models.map(m => `
            <button class="model-option ${S.currentModel === m.id ? 'active' : ''}" onclick="selectModel('${m.id}')">
              <div class="model-option-name">${m.name}</div>
              <div class="model-option-context">${formatContext(m.context)} context</div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-hd">
        <h2 class="modal-title">Select AI Model</h2>
        <button class="icon-btn" onclick="closeModelSelector()"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>
      </div>
      <div class="modal-bd">${modelList}</div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.remove('hidden'), 10);
}

function closeModelSelector() {
  const modal = $('modelSelectorModal');
  if (modal) {
    modal.classList.add('hidden');
    setTimeout(() => modal.remove(), 300);
  }
}

function selectModel(modelId) {
  setModel(modelId);
  closeModelSelector();
}

function formatContext(n) {
  if (n >= 1000) return (n / 1000) + 'K';
  return n;
}

/* ══════════════════════════════════════════════════════
   EXPORT MENU
══════════════════════════════════════════════════════ */
function showExportMenu() {
  // Remove existing menu if open
  const existing = document.querySelector('.export-menu');
  if (existing) { existing.remove(); return; }
  
  const menu = document.createElement('div');
  menu.className = 'export-menu';
  menu.innerHTML = `
    <div class="export-menu-item" onclick="exportChat('markdown'); hideExportMenu();">
      <svg viewBox="0 0 16 16"><path d="M3 3h10v10H3V3z" stroke="currentColor" stroke-width="1.2"/><path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>Export as Markdown</span>
    </div>
    <div class="export-menu-item" onclick="exportChat('json'); hideExportMenu();">
      <svg viewBox="0 0 16 16"><path d="M3 3h10v10H3V3z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h2v4H5zM9 5h2v6H9z" fill="currentColor"/></svg>
      <span>Export as JSON</span>
    </div>
    <div class="export-menu-item" onclick="exportChat('txt'); hideExportMenu();">
      <svg viewBox="0 0 16 16"><path d="M3 3h10v10H3V3z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6h6M5 9h6M5 12h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>Export as Text</span>
    </div>
    <div class="export-menu-item" onclick="exportAllChats(); hideExportMenu();">
      <svg viewBox="0 0 16 16"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>Export All Chats</span>
    </div>
  `;
  
  const wrap = document.querySelector('.export-menu-wrap');
  if (wrap) {
    wrap.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', hideExportMenuOnClickOutside, { once: true });
    }, 10);
  }
}

function hideExportMenu() {
  const menu = document.querySelector('.export-menu');
  if (menu) menu.remove();
}

function hideExportMenuOnClickOutside(e) {
  const menu = document.querySelector('.export-menu');
  if (menu && !menu.contains(e.target) && !e.target.closest('.export-menu-wrap')) {
    menu.remove();
  }
}

/* ══════════════════════════════════════════════════════
   MESSAGE ACTION BUTTONS - Extended with Pin & Fork
══════════════════════════════════════════════════════ */
function addExtendedMessageActions(row, msgId, isUser) {
  const actions = row.querySelector('.m-actions');
  if (!actions) return;
  
  // Add pin button for all messages
  const pinBtn = document.createElement('button');
  pinBtn.className = 'm-act js-pin';
  pinBtn.title = 'Pin message (Ctrl+P)';
  pinBtn.innerHTML = `<svg viewBox="0 0 16 16"><path d="M10 6V2H6v4M4 6l1 5 3 3 3-3 1-5H4z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  pinBtn.onclick = () => togglePinMessage(msgId);
  actions.appendChild(pinBtn);
  
  // Add fork button for user messages
  if (isUser) {
    const forkBtn = document.createElement('button');
    forkBtn.className = 'm-act js-fork';
    forkBtn.title = 'Fork chat from here';
    forkBtn.innerHTML = `<svg viewBox="0 0 16 16"><path d="M4 4v8M12 4v3M12 9v3M4 8h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    forkBtn.onclick = () => forkChatFromMessage(msgId);
    actions.appendChild(forkBtn);
  }
}

/* ══════════════════════════════════════════════════════
   PROFESSION-BASED SHORTCUTS
══════════════════════════════════════════════════════ */

// Profession to shortcut category mapping
const professionShortcuts = {
  // Education
  student: {
    category: 'Education',
    tiles: [
      { icon: 'brain', label: 'Study & Learn', desc: 'Understand any subject', fill: 'Help me understand this topic for my studies: ' },
      { icon: 'code', label: 'Code Help', desc: 'Programming assignments', fill: 'Help me with this coding assignment: ' },
      { icon: 'write', label: 'Write Essays', desc: 'Essays & papers', fill: 'Help me write an essay about: ' },
      { icon: 'math', label: 'Math & Science', desc: 'Solve problems', fill: 'Explain how to solve this step by step: ' }
    ],
    starters: [
      { p: 'Explain photosynthesis like I\'m 10 years old', icon: 'violet' },
      { p: 'Help me solve this calculus optimization problem', icon: 'indigo' },
      { p: 'Write a research paper outline on climate change', icon: 'purple' },
      { p: 'Quiz me on World War 2 key events', icon: 'blue' },
      { p: 'Explain quantum mechanics basics simply', icon: 'violet' },
      { p: 'Help me prepare for my biology exam', icon: 'indigo' }
    ]
  },
  teacher: {
    category: 'Education',
    tiles: [
      { icon: 'brain', label: 'Create Lessons', desc: 'Lesson plans & materials', fill: 'Create a lesson plan about: ' },
      { icon: 'write', label: 'Write Content', desc: 'Materials & handouts', fill: 'Help me create educational content about: ' },
      { icon: 'analyze', label: 'Assess & Grade', desc: 'Rubric & feedback', fill: 'Create a grading rubric for: ' },
      { icon: 'code', label: 'Tech Tools', desc: 'Digital teaching aids', fill: 'Help me create an interactive quiz about: ' }
    ],
    starters: [
      { p: 'Create a 5th grade science lesson plan on ecosystems', icon: 'violet' },
      { p: 'Write engaging discussion questions for history class', icon: 'indigo' },
      { p: 'Generate practice problems for algebra', icon: 'purple' },
      { p: 'Create a project rubric for student presentations', icon: 'blue' },
      { p: 'Explain differentiation strategies for mixed-ability classes', icon: 'violet' },
      { p: 'Write feedback comments for student essays', icon: 'indigo' }
    ]
  },
  researcher: {
    category: 'Education',
    tiles: [
      { icon: 'analyze', label: 'Research & Analysis', desc: 'Literature reviews', fill: 'Analyze this research topic: ' },
      { icon: 'write', label: 'Write Papers', desc: 'Academic writing', fill: 'Help me write about: ' },
      { icon: 'brain', label: 'Synthesize Ideas', desc: 'Connect concepts', fill: 'Synthesize these research findings: ' },
      { icon: 'code', label: 'Data & Stats', desc: 'Statistical analysis', fill: 'Explain this statistical method: ' }
    ],
    starters: [
      { p: 'Summarize the key findings in this research area', icon: 'violet' },
      { p: 'Help me write a literature review section', icon: 'indigo' },
      { p: 'Explain this statistical analysis method simply', icon: 'purple' },
      { p: 'Identify gaps in current research on this topic', icon: 'blue' },
      { p: 'Help me structure my research paper', icon: 'violet' },
      { p: 'Create interview questions for qualitative research', icon: 'indigo' }
    ]
  },

  // Technology
  developer: {
    category: 'Technology',
    tiles: [
      { icon: 'code', label: 'Write Code', desc: 'Build & debug', fill: 'Write code for: ' },
      { icon: 'brain', label: 'Learn & Explain', desc: 'Tech concepts', fill: 'Explain how this technology works: ' },
      { icon: 'analyze', label: 'Review & Optimize', desc: 'Code review', fill: 'Review and optimize this code: ' },
      { icon: 'write', label: 'Documentation', desc: 'Docs & comments', fill: 'Write documentation for: ' }
    ],
    starters: [
      { p: 'Write a REST API with authentication in Python', icon: 'violet' },
      { p: 'Explain how React hooks work internally', icon: 'indigo' },
      { p: 'Debug this JavaScript memory leak issue', icon: 'purple' },
      { p: 'Compare SQL vs NoSQL for this use case', icon: 'blue' },
      { p: 'Create a Docker setup for a Node.js app', icon: 'violet' },
      { p: 'Review this code for security vulnerabilities', icon: 'indigo' }
    ]
  },
  engineer: {
    category: 'Technology',
    tiles: [
      { icon: 'code', label: 'System Design', desc: 'Architecture', fill: 'Design a system for: ' },
      { icon: 'analyze', label: 'Analyze', desc: 'Technical analysis', fill: 'Analyze this engineering problem: ' },
      { icon: 'brain', label: 'Best Practices', desc: 'Patterns & standards', fill: 'Explain best practices for: ' },
      { icon: 'write', label: 'Documentation', desc: 'Specs & docs', fill: 'Write technical specifications for: ' }
    ],
    starters: [
      { p: 'Design a scalable microservices architecture', icon: 'violet' },
      { p: 'Explain load balancing strategies', icon: 'indigo' },
      { p: 'Write a system design for a chat application', icon: 'purple' },
      { p: 'Compare different database sharding approaches', icon: 'blue' },
      { p: 'Explain CAP theorem with real examples', icon: 'violet' },
      { p: 'Design a caching strategy for high traffic', icon: 'indigo' }
    ]
  },
  data_scientist: {
    category: 'Technology',
    tiles: [
      { icon: 'analyze', label: 'Analyze Data', desc: 'Insights & patterns', fill: 'Analyze this dataset: ' },
      { icon: 'code', label: 'Build Models', desc: 'ML & predictions', fill: 'Build a model to predict: ' },
      { icon: 'brain', label: 'Explain', desc: 'Data concepts', fill: 'Explain this statistical concept: ' },
      { icon: 'write', label: 'Visualize', desc: 'Charts & reports', fill: 'Create a data visualization plan for: ' }
    ],
    starters: [
      { p: 'Build a customer churn prediction model', icon: 'violet' },
      { p: 'Explain gradient descent optimization', icon: 'indigo' },
      { p: 'Analyze this sales dataset for trends', icon: 'purple' },
      { p: 'Create a data pipeline architecture', icon: 'blue' },
      { p: 'Explain when to use different ML algorithms', icon: 'violet' },
      { p: 'Write Python code for data cleaning', icon: 'indigo' }
    ]
  },
  product_manager: {
    category: 'Technology',
    tiles: [
      { icon: 'brain', label: 'Strategy', desc: 'Product planning', fill: 'Help me create a product strategy for: ' },
      { icon: 'write', label: 'Documentation', desc: 'PRDs & specs', fill: 'Write a product requirement doc for: ' },
      { icon: 'analyze', label: 'Analyze', desc: 'Metrics & data', fill: 'Analyze these product metrics: ' },
      { icon: 'code', label: 'User Stories', desc: 'Requirements', fill: 'Write user stories for: ' }
    ],
    starters: [
      { p: 'Create a product roadmap for a SaaS feature', icon: 'violet' },
      { p: 'Write user stories for an e-commerce checkout', icon: 'indigo' },
      { p: 'Analyze competitor features for our product', icon: 'purple' },
      { p: 'Define KPIs for a new mobile app launch', icon: 'blue' },
      { p: 'Create a go-to-market strategy outline', icon: 'violet' },
      { p: 'Explain agile vs waterfall for product teams', icon: 'indigo' }
    ]
  },
  designer: {
    category: 'Technology',
    tiles: [
      { icon: 'brain', label: 'Design Systems', desc: 'UI/UX patterns', fill: 'Help me design: ' },
      { icon: 'write', label: 'Copywriting', desc: 'UX writing', fill: 'Write UX copy for: ' },
      { icon: 'analyze', label: 'Research', desc: 'User insights', fill: 'Analyze this user research: ' },
      { icon: 'code', label: 'Prototyping', desc: 'Design to code', fill: 'Convert this design to code: ' }
    ],
    starters: [
      { p: 'Create a color palette for a fintech app', icon: 'violet' },
      { p: 'Explain accessibility best practices for forms', icon: 'indigo' },
      { p: 'Write UX copy for an onboarding flow', icon: 'purple' },
      { p: 'Analyze this design for usability issues', icon: 'blue' },
      { p: 'Create a mood board concept description', icon: 'violet' },
      { p: 'Help me write an art exhibition proposal', icon: 'indigo' }
    ]
  },

  // Business
  business_owner: {
    category: 'Business',
    tiles: [
      { icon: 'brain', label: 'Strategy', desc: 'Business planning', fill: 'Help me develop a strategy for: ' },
      { icon: 'analyze', label: 'Analytics', desc: 'Business metrics', fill: 'Analyze my business data: ' },
      { icon: 'write', label: 'Marketing', desc: 'Content & copy', fill: 'Create marketing content for: ' },
      { icon: 'code', label: 'Automation', desc: 'Process improvement', fill: 'Help me automate: ' }
    ],
    starters: [
      { p: 'Create a business plan outline for a startup', icon: 'violet' },
      { p: 'Analyze these sales metrics and suggest improvements', icon: 'indigo' },
      { p: 'Write a pitch deck for investors', icon: 'purple' },
      { p: 'Create a social media marketing calendar', icon: 'blue' },
      { p: 'Explain cash flow management best practices', icon: 'violet' },
      { p: 'Help me automate my email marketing', icon: 'indigo' }
    ]
  },
  executive: {
    category: 'Business',
    tiles: [
      { icon: 'brain', label: 'Leadership', desc: 'Team management', fill: 'Help me with leadership strategy for: ' },
      { icon: 'analyze', label: 'Strategy', desc: 'Executive decisions', fill: 'Analyze this business scenario: ' },
      { icon: 'write', label: 'Communication', desc: 'Emails & memos', fill: 'Draft a communication about: ' },
      { icon: 'code', label: 'Operations', desc: 'Process optimization', fill: 'Optimize this process: ' }
    ],
    starters: [
      { p: 'Draft a company-wide announcement about changes', icon: 'violet' },
      { p: 'Analyze market trends in our industry', icon: 'indigo' },
      { p: 'Create an executive summary for stakeholders', icon: 'purple' },
      { p: 'Help me structure a difficult conversation with an employee', icon: 'blue' },
      { p: 'Explain OKR implementation strategies', icon: 'violet' },
      { p: 'Draft board meeting agenda and talking points', icon: 'indigo' }
    ]
  },
  manager: {
    category: 'Business',
    tiles: [
      { icon: 'brain', label: 'Team Mgmt', desc: 'Lead & develop', fill: 'Help me manage my team regarding: ' },
      { icon: 'write', label: 'Feedback', desc: 'Reviews & 1:1s', fill: 'Write performance feedback about: ' },
      { icon: 'analyze', label: 'Planning', desc: 'Projects & goals', fill: 'Help me plan: ' },
      { icon: 'code', label: 'Processes', desc: 'Workflows', fill: 'Improve this process: ' }
    ],
    starters: [
      { p: 'How to handle a difficult team member situation', icon: 'violet' },
      { p: 'Create a project timeline with milestones', icon: 'indigo' },
      { p: 'Write constructive feedback for an employee review', icon: 'purple' },
      { p: 'Explain how to delegate tasks effectively', icon: 'blue' },
      { p: 'Create team meeting agenda templates', icon: 'violet' },
      { p: 'Help me set SMART goals for my team', icon: 'indigo' }
    ]
  },
  marketing: {
    category: 'Business',
    tiles: [
      { icon: 'write', label: 'Content', desc: 'Copy & campaigns', fill: 'Write marketing copy for: ' },
      { icon: 'analyze', label: 'Analytics', desc: 'Campaign metrics', fill: 'Analyze these marketing metrics: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Planning & ideas', fill: 'Create a marketing strategy for: ' },
      { icon: 'code', label: 'SEO & Web', desc: 'Digital marketing', fill: 'Optimize this for SEO: ' }
    ],
    starters: [
      { p: 'Create a 30-day content calendar for LinkedIn', icon: 'violet' },
      { p: 'Write email subject lines that convert', icon: 'indigo' },
      { p: 'Analyze this campaign performance data', icon: 'purple' },
      { p: 'Create buyer personas for our target market', icon: 'blue' },
      { p: 'Write a compelling product launch announcement', icon: 'violet' },
      { p: 'Explain A/B testing best practices', icon: 'indigo' }
    ]
  },
  sales: {
    category: 'Business',
    tiles: [
      { icon: 'write', label: 'Messaging', desc: 'Pitch & follow-up', fill: 'Write sales copy for: ' },
      { icon: 'analyze', label: 'CRM & Data', desc: 'Pipeline analysis', fill: 'Analyze my sales pipeline: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Sales techniques', fill: 'Help me with sales strategy for: ' },
      { icon: 'code', label: 'Proposals', desc: 'Quotes & contracts', fill: 'Draft a proposal for: ' }
    ],
    starters: [
      { p: 'Write a cold email that gets responses', icon: 'violet' },
      { p: 'Create a sales pitch deck outline', icon: 'indigo' },
      { p: 'How to handle price objections effectively', icon: 'purple' },
      { p: 'Analyze why deals are stalling in my pipeline', icon: 'blue' },
      { p: 'Write follow-up emails for different scenarios', icon: 'violet' },
      { p: 'Explain consultative selling techniques', icon: 'indigo' }
    ]
  },
  consultant: {
    category: 'Business',
    tiles: [
      { icon: 'analyze', label: 'Analysis', desc: 'Problem solving', fill: 'Analyze this business problem: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Recommendations', fill: 'Develop recommendations for: ' },
      { icon: 'write', label: 'Deliverables', desc: 'Reports & decks', fill: 'Create a deliverable about: ' },
      { icon: 'code', label: 'Solutions', desc: 'Implementation', fill: 'Design a solution for: ' }
    ],
    starters: [
      { p: 'Structure a consulting engagement proposal', icon: 'violet' },
      { p: 'Analyze operational inefficiencies in a process', icon: 'indigo' },
      { p: 'Create an executive presentation template', icon: 'purple' },
      { p: 'Explain change management frameworks', icon: 'blue' },
      { p: 'Write a root cause analysis report', icon: 'violet' },
      { p: 'Develop KPIs for measuring consulting impact', icon: 'indigo' }
    ]
  },

  // Creative
  writer: {
    category: 'Creative',
    tiles: [
      { icon: 'write', label: 'Write', desc: 'Draft & edit', fill: 'Help me write: ' },
      { icon: 'brain', label: 'Ideas', desc: 'Brainstorm & plot', fill: 'Generate ideas for: ' },
      { icon: 'analyze', label: 'Research', desc: 'Fact-check & verify', fill: 'Research this topic: ' },
      { icon: 'code', label: 'Format', desc: 'Structure & style', fill: 'Help me format: ' }
    ],
    starters: [
      { p: 'Help me brainstorm plot ideas for my novel', icon: 'violet' },
      { p: 'Write a compelling opening paragraph', icon: 'indigo' },
      { p: 'Edit this text to make it more engaging', icon: 'purple' },
      { p: 'Create character profiles for my story', icon: 'blue' },
      { p: 'Explain show don\'t tell in creative writing', icon: 'violet' },
      { p: 'Help me write dialogue that feels natural', icon: 'indigo' }
    ]
  },
  artist: {
    category: 'Creative',
    tiles: [
      { icon: 'brain', label: 'Inspiration', desc: 'Ideas & concepts', fill: 'Give me creative ideas for: ' },
      { icon: 'write', label: 'Portfolio', desc: 'Artist statements', fill: 'Help me write about my art: ' },
      { icon: 'analyze', label: 'Critique', desc: 'Art analysis', fill: 'Analyze this artwork: ' },
      { icon: 'code', label: 'Tools', desc: 'Digital workflows', fill: 'Help me with digital tools for: ' }
    ],
    starters: [
      { p: 'Generate conceptual art project ideas', icon: 'violet' },
      { p: 'Write an artist statement for my portfolio', icon: 'indigo' },
      { p: 'Explain color theory for digital artists', icon: 'purple' },
      { p: 'Critique this artwork composition', icon: 'blue' },
      { p: 'Create a mood board concept description', icon: 'violet' },
      { p: 'Help me write an art exhibition proposal', icon: 'indigo' }
    ]
  },
  journalist: {
    category: 'Creative',
    tiles: [
      { icon: 'write', label: 'Reporting', desc: 'Articles & stories', fill: 'Help me write an article about: ' },
      { icon: 'analyze', label: 'Research', desc: 'Investigation', fill: 'Research this topic: ' },
      { icon: 'brain', label: 'Interview', desc: 'Questions & prep', fill: 'Create interview questions for: ' },
      { icon: 'code', label: 'Multimedia', desc: 'Digital storytelling', fill: 'Help with multimedia story about: ' }
    ],
    starters: [
      { p: 'Write a compelling news lede for this story', icon: 'violet' },
      { p: 'Create questions for an investigative interview', icon: 'indigo' },
      { p: 'Check this article for bias and objectivity', icon: 'purple' },
      { p: 'Explain libel laws for journalists', icon: 'blue' },
      { p: 'Structure a feature article outline', icon: 'violet' },
      { p: 'Help me verify these facts and sources', icon: 'indigo' }
    ]
  },
  content_creator: {
    category: 'Creative',
    tiles: [
      { icon: 'write', label: 'Scripts', desc: 'Video & audio', fill: 'Write a script about: ' },
      { icon: 'brain', label: 'Ideas', desc: 'Content concepts', fill: 'Generate content ideas for: ' },
      { icon: 'analyze', label: 'Analytics', desc: 'Performance data', fill: 'Analyze my content metrics: ' },
      { icon: 'code', label: 'SEO', desc: 'Optimization', fill: 'Optimize this for YouTube/SEO: ' }
    ],
    starters: [
      { p: 'Write a YouTube script intro that hooks viewers', icon: 'violet' },
      { p: 'Generate viral content ideas for my niche', icon: 'indigo' },
      { p: 'Create a content calendar for TikTok growth', icon: 'purple' },
      { p: 'Explain how to write click-worthy thumbnails', icon: 'blue' },
      { p: 'Analyze why my video retention is dropping', icon: 'violet' },
      { p: 'Write an engaging community post', icon: 'indigo' }
    ]
  },

  // Healthcare & Science
  medical: {
    category: 'Healthcare',
    tiles: [
      { icon: 'brain', label: 'Explain', desc: 'Medical concepts', fill: 'Explain this medical topic: ' },
      { icon: 'write', label: 'Documentation', desc: 'Notes & reports', fill: 'Help me document: ' },
      { icon: 'analyze', label: 'Research', desc: 'Literature review', fill: 'Summarize research on: ' },
      { icon: 'code', label: 'Data', desc: 'Patient data analysis', fill: 'Analyze this medical data: ' }
    ],
    starters: [
      { p: 'Explain this medical procedure to a patient', icon: 'violet' },
      { p: 'Summarize recent research on this condition', icon: 'indigo' },
      { p: 'Write a discharge summary template', icon: 'purple' },
      { p: 'Analyze these symptoms differentially', icon: 'blue' },
      { p: 'Explain drug interactions in simple terms', icon: 'violet' },
      { p: 'Create patient education materials', icon: 'indigo' }
    ]
  },
  scientist: {
    category: 'Science',
    tiles: [
      { icon: 'analyze', label: 'Analysis', desc: 'Data & results', fill: 'Analyze this data: ' },
      { icon: 'write', label: 'Papers', desc: 'Publications', fill: 'Help me write about: ' },
      { icon: 'brain', label: 'Hypotheses', desc: 'Research design', fill: 'Design an experiment for: ' },
      { icon: 'code', label: 'Methods', desc: 'Protocols & code', fill: 'Create a protocol for: ' }
    ],
    starters: [
      { p: 'Analyze these experimental results statistically', icon: 'violet' },
      { p: 'Write an abstract for my research paper', icon: 'indigo' },
      { p: 'Explain this methodology in simple terms', icon: 'purple' },
      { p: 'Design an experiment to test this hypothesis', icon: 'blue' },
      { p: 'Compare these statistical tests for my data', icon: 'violet' },
      { p: 'Write Python code to process this dataset', icon: 'indigo' }
    ]
  },
  academic: {
    category: 'Education',
    tiles: [
      { icon: 'write', label: 'Publishing', desc: 'Papers & grants', fill: 'Help me write: ' },
      { icon: 'analyze', label: 'Research', desc: 'Literature review', fill: 'Research this topic: ' },
      { icon: 'brain', label: 'Teach', desc: 'Curriculum & courses', fill: 'Create course material for: ' },
      { icon: 'code', label: 'Analyze', desc: 'Data & statistics', fill: 'Analyze this academic data: ' }
    ],
    starters: [
      { p: 'Write a compelling grant proposal abstract', icon: 'violet' },
      { p: 'Summarize the state of research in this field', icon: 'indigo' },
      { p: 'Create a course syllabus with learning outcomes', icon: 'purple' },
      { p: 'Explain peer review best practices', icon: 'blue' },
      { p: 'Analyze citation patterns in this research area', icon: 'violet' },
      { p: 'Write a rebuttal letter for paper revisions', icon: 'indigo' }
    ]
  },

  // Other
  legal: {
    category: 'Legal',
    tiles: [
      { icon: 'write', label: 'Draft', desc: 'Documents & contracts', fill: 'Draft a document about: ' },
      { icon: 'analyze', label: 'Research', desc: 'Case law & statutes', fill: 'Research this legal issue: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Legal arguments', fill: 'Develop arguments for: ' },
      { icon: 'code', label: 'Review', desc: 'Document analysis', fill: 'Review this document: ' }
    ],
    starters: [
      { p: 'Draft a contract clause for liability limitation', icon: 'violet' },
      { p: 'Research case law on this specific issue', icon: 'indigo' },
      { p: 'Explain this regulation\'s compliance requirements', icon: 'purple' },
      { p: 'Write a legal memorandum structure', icon: 'blue' },
      { p: 'Analyze the risks in this contract', icon: 'violet' },
      { p: 'Draft discovery requests for litigation', icon: 'indigo' }
    ]
  },
  finance: {
    category: 'Finance',
    tiles: [
      { icon: 'analyze', label: 'Analysis', desc: 'Financial models', fill: 'Analyze these finances: ' },
      { icon: 'write', label: 'Reports', desc: 'Statements & docs', fill: 'Write a financial report about: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Investments & planning', fill: 'Develop a financial strategy for: ' },
      { icon: 'code', label: 'Modeling', desc: 'Spreadsheets & code', fill: 'Build a financial model for: ' }
    ],
    starters: [
      { p: 'Build a DCF valuation model structure', icon: 'violet' },
      { p: 'Analyze these financial statements for trends', icon: 'indigo' },
      { p: 'Explain complex derivatives simply', icon: 'purple' },
      { p: 'Create a budget variance analysis', icon: 'blue' },
      { p: 'Write investment thesis talking points', icon: 'violet' },
      { p: 'Explain hedging strategies with examples', icon: 'indigo' }
    ]
  },
  government: {
    category: 'Government',
    tiles: [
      { icon: 'write', label: 'Policy', desc: 'Briefs & memos', fill: 'Write a policy brief about: ' },
      { icon: 'analyze', label: 'Analysis', desc: 'Public data', fill: 'Analyze this public policy: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Public affairs', fill: 'Develop a strategy for: ' },
      { icon: 'code', label: 'Programs', desc: 'Implementation', fill: 'Design a program for: ' }
    ],
    starters: [
      { p: 'Write a policy memo for decision makers', icon: 'violet' },
      { p: 'Analyze the impact of this regulation', icon: 'indigo' },
      { p: 'Create a stakeholder engagement plan', icon: 'purple' },
      { p: 'Explain RFP requirements clearly', icon: 'blue' },
      { p: 'Draft talking points for a public meeting', icon: 'violet' },
      { p: 'Analyze budget allocation effectiveness', icon: 'indigo' }
    ]
  },
  nonprofit: {
    category: 'Nonprofit',
    tiles: [
      { icon: 'write', label: 'Grants', desc: 'Proposals & reports', fill: 'Write a grant proposal for: ' },
      { icon: 'brain', label: 'Strategy', desc: 'Mission & programs', fill: 'Develop program strategy for: ' },
      { icon: 'analyze', label: 'Impact', desc: 'Metrics & evaluation', fill: 'Measure impact of: ' },
      { icon: 'code', label: 'Outreach', desc: 'Communications', fill: 'Create outreach content for: ' }
    ],
    starters: [
      { p: 'Write a compelling grant proposal narrative', icon: 'violet' },
      { p: 'Create a theory of change model', icon: 'indigo' },
      { p: 'Develop impact metrics for a program', icon: 'purple' },
      { p: 'Write a donor thank you letter', icon: 'blue' },
      { p: 'Explain program evaluation frameworks', icon: 'violet' },
      { p: 'Create a volunteer recruitment strategy', icon: 'indigo' }
    ]
  },
  freelancer: {
    category: 'Freelance',
    tiles: [
      { icon: 'write', label: 'Proposals', desc: 'Pitch & contracts', fill: 'Write a proposal for: ' },
      { icon: 'brain', label: 'Ideas', desc: 'Project concepts', fill: 'Generate ideas for: ' },
      { icon: 'code', label: 'Deliver', desc: 'Client work', fill: 'Help me deliver: ' },
      { icon: 'analyze', label: 'Business', desc: 'Rates & growth', fill: 'Analyze my freelance business: ' }
    ],
    starters: [
      { p: 'Write a project proposal that wins clients', icon: 'violet' },
      { p: 'How to negotiate higher freelance rates', icon: 'indigo' },
      { p: 'Create a freelance contract template', icon: 'purple' },
      { p: 'Explain how to find high-value clients', icon: 'blue' },
      { p: 'Write effective cold pitch emails', icon: 'violet' },
      { p: 'Create a portfolio that converts visitors', icon: 'indigo' }
    ]
  },
  homemaker: {
    category: 'Home',
    tiles: [
      { icon: 'brain', label: 'Plan', desc: 'Meals & schedules', fill: 'Help me plan: ' },
      { icon: 'write', label: 'Budget', desc: 'Finance & shopping', fill: 'Create a budget for: ' },
      { icon: 'code', label: 'Organize', desc: 'Systems & routines', fill: 'Help me organize: ' },
      { icon: 'analyze', label: 'Research', desc: 'Products & reviews', fill: 'Research options for: ' }
    ],
    starters: [
      { p: 'Create a weekly meal plan with grocery list', icon: 'violet' },
      { p: 'Help me organize a family cleaning schedule', icon: 'indigo' },
      { p: 'Research best educational toys by age', icon: 'purple' },
      { p: 'Create a family budget tracker template', icon: 'blue' },
      { p: 'Plan a home renovation project timeline', icon: 'violet' },
      { p: 'Compare different school options objectively', icon: 'indigo' }
    ]
  },
  retired: {
    category: 'Lifestyle',
    tiles: [
      { icon: 'brain', label: 'Learn', desc: 'New hobbies & skills', fill: 'Teach me about: ' },
      { icon: 'write', label: 'Write', desc: 'Memoirs & letters', fill: 'Help me write: ' },
      { icon: 'analyze', label: 'Plan', desc: 'Travel & activities', fill: 'Help me plan: ' },
      { icon: 'code', label: 'Tech', desc: 'Digital skills', fill: 'Help me with technology: ' }
    ],
    starters: [
      { p: 'Explain how to use video calling apps', icon: 'violet' },
      { p: 'Help me write a letter to my grandchildren', icon: 'indigo' },
      { p: 'Plan a travel itinerary for senior travelers', icon: 'purple' },
      { p: 'Teach me about genealogy research', icon: 'blue' },
      { p: 'Explain investing basics for retirees', icon: 'violet' },
      { p: 'Create a daily routine for active aging', icon: 'indigo' }
    ]
  },

  // Default fallback
  other: {
    category: 'General',
    tiles: [
      { icon: 'brain', label: 'Explain & Learn', desc: 'Understand topics', fill: 'Help me understand a complex topic in clear, simple terms. I\'d like to learn about: ' },
      { icon: 'code', label: 'Write Code', desc: 'Build & debug', fill: 'Write code for me: ' },
      { icon: 'write', label: 'Draft & Write', desc: 'Content creation', fill: 'Help me write: ' },
      { icon: 'analyze', label: 'Analyze & Compare', desc: 'Data & decisions', fill: 'Analyze and compare these options for me: ' }
    ],
    starters: [
      { p: 'Explain how transformer neural networks work, step by step, in plain language', icon: 'violet' },
      { p: 'Write a production-ready Python REST API using FastAPI with JWT authentication', icon: 'indigo' },
      { p: 'Write a professional, warm resignation letter maintaining positive relationships', icon: 'purple' },
      { p: 'Compare PostgreSQL, MongoDB, and Redis — architecture and use cases', icon: 'blue' },
      { p: 'Build a 30-day content strategy for social media', icon: 'violet' },
      { p: 'Explain common causes of memory leaks in JavaScript', icon: 'indigo' }
    ]
  }
};

// Function to get user's profession from onboarding
function getUserProfession() {
  const user = JSON.parse(localStorage.getItem('ariagpt_user') || '{}');
  const profileKey = user.uid ? `aria_${user.uid}_onboarding_profile` : 'onboarding_profile';
  const profile = JSON.parse(localStorage.getItem(profileKey) || '{}');
  return profile.profession || 'other';
}

// Function to render profession-specific shortcuts
function renderProfessionShortcuts() {
  const profession = getUserProfession();
  const config = professionShortcuts[profession] || professionShortcuts.other;

  // Update welcome heading
  const heading = document.getElementById('welcomeHeading');
  if (heading) {
    const categoryGreetings = {
      'Education': 'Ready to learn something new?',
      'Technology': 'What will you build today?',
      'Business': 'What business challenge can I help with?',
      'Creative': 'What will you create today?',
      'Healthcare': 'How can I assist with your work?',
      'Science': 'What research question do you have?',
      'Legal': 'What legal matter can I help with?',
      'Finance': 'What financial analysis do you need?',
      'Government': 'What policy matter can I assist with?',
      'Nonprofit': 'How can I support your mission?',
      'Freelance': 'What project are you working on?',
      'Home': 'How can I help with home planning?',
      'Lifestyle': 'What would you like to explore today?',
      'General': 'What can I help you with?'
    };
    heading.textContent = categoryGreetings[config.category] || 'What can I help you with?';
  }

  // Render capability tiles
  const tilesContainer = document.querySelector('.cap-tiles');
  if (tilesContainer && config.tiles) {
    tilesContainer.innerHTML = config.tiles.map((tile, i) => `
      <button class="cap-tile" data-fill="${tile.fill.replace(/"/g, '&quot;')}">
        <div class="tile-icon">${getTileIcon(tile.icon, i + 1)}</div>
        <span class="tile-label">${tile.label}</span>
        <span class="tile-desc">${tile.desc}</span>
      </button>
    `).join('');

    // Re-attach click handlers
    tilesContainer.querySelectorAll('.cap-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        D.msgInput.value = tile.dataset.fill || '';
        growEl(); refreshSend(); refreshMeta();
        D.msgInput.focus();
        D.msgInput.setSelectionRange(D.msgInput.value.length, D.msgInput.value.length);
      });
    });
  }

  // Render starter prompts
  const startersContainer = document.getElementById('starters');
  if (startersContainer && config.starters) {
    startersContainer.innerHTML = config.starters.map((starter, i) => `
      <button class="starter" data-p="${starter.p.replace(/"/g, '&quot;')}">
        <div class="starter-icon si-${starter.icon}">${getStarterIcon(starter.icon, i)}</div>
        ${starter.p.substring(0, 40)}${starter.p.length > 40 ? '...' : ''}
      </button>
    `).join('');

    // Re-attach click handlers
    startersContainer.querySelectorAll('.starter').forEach(starter => {
      starter.addEventListener('click', () => {
        const p = starter.dataset.p;
        if (p) receiveUserMessage(p);
      });
    });
  }
}

// Helper function to get tile icons
function getTileIcon(type, index) {
  const icons = {
    brain: `<svg viewBox="0 0 28 28" fill="none"><path d="M10 6C7.5 6 5.5 8 5.5 10.5c0 1.2.4 2.3 1.2 3.1C5.7 14.4 5 15.6 5 17c0 2.5 2 4.5 4.5 4.5H14" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M15 6c2.5 0 4.5 2 4.5 4.5 0 1.2-.4 2.3-1.2 3.1.9.8 1.7 2 1.7 3.4 0 2.5-2 4.5-4.5 4.5H14" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 6v16" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    code: `<svg viewBox="0 0 28 28" fill="none"><rect x="4" y="5" width="20" height="18" rx="2.5" stroke="url(#ic${index})" stroke-width="1.6"/><path d="M8 10l4 4-4 4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 18h6" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="9" r=".8" fill="#a78bfa" opacity=".5"/><circle cx="11" cy="9" r=".8" fill="#6366f1" opacity=".5"/><circle cx="14" cy="9" r=".8" fill="#818cf8" opacity=".5"/><defs><linearGradient id="ic${index}" x1="4" y1="5" x2="24" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    write: `<svg viewBox="0 0 28 28" fill="none"><path d="M8 20l1.5-5L20 4.5l3.5 3.5L12 19l-4 1z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 7l3 3" stroke="url(#ic${index})" stroke-width="1.3" stroke-linecap="round"/><path d="M5 23h18" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    analyze: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 22V16" stroke="url(#ic${index})" stroke-width="2" stroke-linecap="round"/><path d="M10 22V10" stroke="url(#ic${index})" stroke-width="2" stroke-linecap="round"/><path d="M15 22V13" stroke="url(#ic${index})" stroke-width="2" stroke-linecap="round"/><path d="M20 22V7" stroke="url(#ic${index})" stroke-width="2" stroke-linecap="round"/><path d="M3 22h22" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="3" y1="7" x2="25" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    math: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 21l14-14M7 7h14v14" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="10" r="1.5" fill="url(#ic${index})"/><circle cx="20" cy="18" r="1.5" fill="url(#ic${index})"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    strategy: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="8" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10v4l3 3" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y22="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    plan: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="6" width="18" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M9 12h10M9 16h7" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="18" cy="5" r="1.5" fill="url(#ic${index})"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    budget: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 8v6l4 2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    organize: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><rect x="15" y="5" width="8" height="8" rx="1.5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><rect x="5" y="15" width="8" height="8" rx="1.5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><rect x="15" y="15" width="8" height="8" rx="1.5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    inspiration: `<svg viewBox="0 0 28 28" fill="none"><path d="M14 4c-4 4-4 10 0 14M14 4c4 4 4 10 0 14" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="22" r="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    portfolio: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="7" width="18" height="14" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="11" cy="14" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><path d="M17 12l4 4M17 16l4-4" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="7" x2="23" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    interview: `<svg viewBox="0 0 28 28" fill="none"><path d="M8 21V8c0-1.1.9-2 2-2h12" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="14" r="4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M8 13h6M8 17h4" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    scripts: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="6" width="18" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M9 11l3 3-3 3M13 19h6" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    messaging: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 21c3-1 5-1 8 0 3 1 5 1 8 0V8c-3 1-5 1-8 0-3-1-5-1-8 0v13z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8l9 6 9-6" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="7" x2="23" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    draft: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 14h18M5 10h18M5 18h12" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="20" cy="19" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    policy: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="8" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10v4l2 2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    grants: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 14c0-3.9 3.1-7 7-7s7 3.1 7 7-3.1 7-7 7" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 7l3 3" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    proposals: `<svg viewBox="0 0 28 28" fill="none"><rect x="6" y="6" width="16" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M10 14l3 3 5-6" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y22="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    learn: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 10l9-4 9 4-9 4-9-4z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14l9 5 9-5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19l9 5 9-5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    documentation: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 7h14v14H7z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 11h14M10 7v14" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    feedback: `<svg viewBox="0 0 28 28" fill="none"><path d="M8 20l2-5 8-8 3 3-8 8-5 2z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 7l3 3" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="14" cy="14" r="8" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".3"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    deliver: `<svg viewBox="0 0 28 28" fill="none"><path d="M14 4v20M7 11l7-7 7 7" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="6" y="15" width="16" height="8" rx="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    ideas: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="14" r="4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M5 14h5M18 14h5M14 5v5M14 18v5" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    reporting: `<svg viewBox="0 0 28 28" fill="none"><rect x="6" y="6" width="16" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M6 12h16M10 6v16" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="19" r="1.5" fill="url(#ic${index})"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'team-mgmt': `<svg viewBox="0 0 28 28" fill="none"><circle cx="10" cy="10" r="4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="10" r="4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" opacity=".6"/><path d="M7 22c0-3 3-5 7-5s7 2 7 5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    content: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="7" width="18" height="14" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M9 11h10M9 15h6" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="20" cy="5" r="1.5" fill="url(#ic${index})"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    seo: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="8" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10v4l3 3" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 8l2-2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    crm: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 8h18v12c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V8z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 8l9 7 9-7" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    impact: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 8v6l4 4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    outreach: `<svg viewBox="0 0 28 28" fill="none"><path d="M14 4c5.5 0 10 4.5 10 10s-4.5 10-10 10S4 19.5 4 14" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 9v10M9 14h10" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="4" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    critique: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 8l7 6 6 1-4.5 4.5 1 6-5.5-3-5.5 3 1-6L5 11l6-1z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    tools: `<svg viewBox="0 0 28 28" fill="none"><rect x="6" y="6" width="16" height="12" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M10 18v4M14 18v5M18 18v4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="12" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    multimedia: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="8" width="18" height="12" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="14" r="3" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><path d="M17 14l4-2v4l-4-2z" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    hypotheses: `<svg viewBox="0 0 28 28" fill="none"><path d="M8 21c0-5 2.5-8 6-10-3.5-2-6-5-6-10" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 21c0-5-2.5-8-6-10 3.5-2 6-5 6-10" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14h8" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    methods: `<svg viewBox="0 0 28 28" fill="none"><rect x="6" y="6" width="16" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M6 10h16M10 6v16" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><path d="M10 14l3 3 5-6" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    publishing: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 6h18v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10h18" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="9" cy="16" r="1.5" fill="url(#ic${index})"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    teach: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 9l9-4 9 4-9 4-9-4z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14l9 5 9-5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19l9 5 9-5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    leadership: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="9" r="4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M6 24c0-4 3.6-7 8-7s8 3 8 7" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M22 7l3-3" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    communication: `<svg viewBox="0 0 28 28" fill="none"><path d="M6 10c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V10z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10l9 6 9-6" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    operations: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 8v6l4 2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    review: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 14h14M7 10h14M7 18h10" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="20" cy="19" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    modeling: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 20V8c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12h18" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><path d="M9 16h6" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    programs: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="6" width="18" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M5 10h18M9 6v16" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="13" cy="14" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    business: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 22V10c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v12" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 22h18" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><path d="M10 14h2M10 18h2M16 14h2M16 18h2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    projects: `<svg viewBox="0 0 28 28" fill="none"><path d="M6 7h16v14c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V7z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11h16" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><path d="M10 7V5a1 1 0 011-1h6a1 1 0 011 1v2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><circle cx="11" cy="15" r="1" fill="url(#ic${index})"/><circle cx="11" cy="19" r="1" fill="url(#ic${index})" opacity=".6"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'user-stories': `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="10" r="5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M6 24c0-4 3.6-7 8-7s8 3 8 7" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'system-design': `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="5" width="18" height="18" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M5 10h18M5 18h18M10 5v18M18 5v18" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".4"/><circle cx="14" cy="14" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'best-practices': `<svg viewBox="0 0 28 28" fill="none"><path d="M14 4l2.5 5.5L22 11l-4 3.5L19.5 20 14 17l-5.5 3L10 14.5 6 11l5.5-1.5L14 4z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="4" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    visualization: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 20V14M10 20V8M15 20v-6M20 20V5" stroke="url(#ic${index})" stroke-width="2" stroke-linecap="round"/><path d="M3 20h22" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="3" y1="5" x2="25" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'data-stats': `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M14 8v6l4 2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    synthesize: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 8l7 6 7-6" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><path d="M7 14l7 6 7-6" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="7" x2="23" y22="21" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'tech-tools': `<svg viewBox="0 0 28 28" fill="none"><rect x="6" y="6" width="16" height="12" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M10 18v4M14 18v5M18 18v4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="12" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="6" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'assess-grade': `<svg viewBox="0 0 28 28" fill="none"><path d="M6 14h16" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M6 10h16M6 18h12" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><circle cx="20" cy="19" r="2" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="8" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'create-lessons': `<svg viewBox="0 0 28 28" fill="none"><path d="M5 9l9-4 9 4-9 4-9-4z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14l9 5 9-5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19l9 5 9-5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'study-learn': `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="11" r="5" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M6 23c0-4 3.6-7 8-7s8 3 8 7" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M16 9l2 2 3-4" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'code-help': `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="6" width="18" height="16" rx="2" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round"/><path d="M9 12l4 4 4-4" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="8" r="1.5" fill="url(#ic${index})"/><defs><linearGradient id="ic${index}" x1="5" y1="6" x2="23" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`,
    'write-essays': `<svg viewBox="0 0 28 28" fill="none"><path d="M7 21l2-6L19 5l4 4-10 10-6 2z" stroke="url(#ic${index})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7l4 4" stroke="url(#ic${index})" stroke-width="1.4" stroke-linecap="round"/><defs><linearGradient id="ic${index}" x1="5" y1="5" x2="23" y2="23" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs></svg>`
  };
  return icons[type] || icons.brain;
}

// Helper function to get starter icons
function getStarterIcon(color, index) {
  const icons = {
    violet: `<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3" stroke="#a78bfa" stroke-width="1.4"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4 4l1.4 1.4M12.6 12.6l1.4 1.4M12.6 4l-1.4 1.4M4 12.6l1.4 1.4" stroke="#a78bfa" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    indigo: `<svg viewBox="0 0 18 18" fill="none"><polyline points="11 13 15 9 11 5" stroke="#6366f1" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 5 3 9 7 13" stroke="#818cf8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    purple: `<svg viewBox="0 0 18 18" fill="none"><path d="M4 14l1-4L13 3l2 2-8 7-3 2z" stroke="#a78bfa" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 5l2 2" stroke="#a78bfa" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    blue: `<svg viewBox="0 0 18 18" fill="none"><ellipse cx="9" cy="5" rx="6" ry="2" stroke="#818cf8" stroke-width="1.3"/><path d="M3 5v4c0 1.1 2.7 2 6 2s6-.9 6-2V5" stroke="#818cf8" stroke-width="1.3"/><path d="M3 9v4c0 1.1 2.7 2 6 2s6-.9 6-2V9" stroke="#6366f1" stroke-width="1.3"/></svg>`
  };
  return icons[color] || icons.violet;
}

/* ══════════════════════════════════════════════════════
   ENHANCED KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════ */
function setupEnhancedShortcuts() {
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    
    // Search in chat
    if (mod && e.key === 'f') {
      e.preventDefault();
      openChatSearch();
    }
    
    // Pin message (when message focused)
    if (mod && e.key === 'p' && document.activeElement?.closest('.msg-row')) {
      e.preventDefault();
      const msgId = document.activeElement.closest('.msg-row').dataset.msgId;
      togglePinMessage(msgId);
    }
    
    // Show suggestions
    if (e.key === '/' && document.activeElement === D.msgInput && !D.msgInput.value) {
      e.preventDefault();
      showSuggestions();
    }
    
    // New features shortcuts
    if (mod && shift && e.key === 'P') { e.preventDefault(); showPinnedMessages(); }
    if (mod && shift && e.key === 'M') { e.preventDefault(); openModelSelector(); }
    if (mod && shift && e.key === 'K') { e.preventDefault(); openApiKeyModal(); }
    if (mod && shift && e.key === 'A') { e.preventDefault(); exportAllChats(); }
  });
}

/* ── Boot ── */
// Expose init for auth callback - will be called after Firebase confirms user
window.initChatApp = () => {
  init();
  renderProfessionShortcuts();
  setupEnhancedShortcuts();
};