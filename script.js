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

/* ── Sidebar Context Helper ────────────────────────────
   Gathers user's sidebar data to send to AI for context
───────────────────────────────────────────────────────── */
function getSidebarContext() {
  const ctx = {
    projects: JSON.parse(localStorage.getItem(getUserKey('projects')) || '[]'),
    tags: JSON.parse(localStorage.getItem(getUserKey('tags')) || '[]'),
    favorites: JSON.parse(localStorage.getItem(getUserKey('favorites')) || '[]'),
    assistants: JSON.parse(localStorage.getItem(getUserKey('assistants')) || '[]'),
  };
  
  // Only include non-empty arrays
  const filtered = {};
  for (const [key, val] of Object.entries(ctx)) {
    if (Array.isArray(val) && val.length > 0) {
      // Limit each category to prevent payload bloat
      filtered[key] = val.slice(0, 20).map(item => ({
        id: item.id || item.slug,
        name: item.name,
        ...(item.desc && { desc: item.desc }),
        ...(item.content && { content: item.content?.substring?.(0, 500) }),
      }));
    }
  }
  
  return filtered;
}

window.getSidebarContext = getSidebarContext;

/* ── Config ─────────────────────────────────────────── */
const API_URL   = 'http://localhost:3000/api/chat';
const MAX_LEN   = 8000;

// Dynamic store key - must call function each time to get current user's key
function getStoreKey() { return getUserKey('v3'); }

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
  fileInput:   $('fileInput'),
  attachBtn:   $('attachBtn'),
  attachedFiles: $('attachedFiles'),
  shortcutsModal: $('shortcutsModal'),
  renameModal:    $('renameModal'),
  renameField:    $('renameField'),
  renameOk:       $('renameOk'),
  deleteModal:    $('deleteModal'),
  deleteOk:       $('deleteModalOk'),
  ctxMenu:     $('ctxMenu'),
  ctxRename:   $('ctxRename'),
  ctxExport:   $('ctxExport'),
  ctxDelete:   $('ctxDelete'),
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
  apiKeys:       JSON.parse(localStorage.getItem(getUserKey('apikeys')) || '{}'),
  pinnedMsgs:    JSON.parse(localStorage.getItem(getUserKey('pins')) || '[]'),
  chatSearchQ:   '',
  suggestTimer:  null,
  lastSuggestions: [],
  useLocalBackend: true,
  attachedFiles: [],
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
   FILE ATTACHMENT
══════════════════════════════════════════════════════ */
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  // Limit to 5 files
  const remainingSlots = 5 - S.attachedFiles.length;
  if (remainingSlots <= 0) {
    toast('Maximum 5 files allowed', 'err');
    return;
  }

  const filesToAdd = files.slice(0, remainingSlots);
  const oversized = filesToAdd.filter(f => f.size > 10 * 1024 * 1024); // 10MB limit

  if (oversized.length) {
    toast('Files must be under 10MB', 'err');
  }

  const validFiles = filesToAdd.filter(f => f.size <= 10 * 1024 * 1024);

  validFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      S.attachedFiles.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data: e.target.result.split(',')[1], // base64 without prefix
        mimeType: file.type || 'application/octet-stream'
      });
      renderAttachedFiles();
    };
    reader.readAsDataURL(file);
  });

  if (validFiles.length) {
    toast(`${validFiles.length} file${validFiles.length > 1 ? 's' : ''} attached`, 'ok');
  }

  // Reset input
  D.fileInput.value = '';
}

function renderAttachedFiles() {
  if (!S.attachedFiles.length) {
    D.attachedFiles.classList.add('hidden');
    D.attachedFiles.innerHTML = '';
    return;
  }

  D.attachedFiles.classList.remove('hidden');
  D.attachedFiles.innerHTML = S.attachedFiles.map((file, idx) => `
    <span class="attached-file">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M8.5 2.5a2.5 2.5 0 0 1 2.5 2.5v4.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 2.5-2.5h3z"/>
      </svg>
      <span class="af-name">${esc(file.name)}</span>
      <button class="af-remove" onclick="removeAttachedFile(${idx})" title="Remove">×</button>
    </span>
  `).join('');
}

function removeAttachedFile(idx) {
  S.attachedFiles.splice(idx, 1);
  renderAttachedFiles();
}

window.removeAttachedFile = removeAttachedFile;

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
function init() {
  console.log('=== AriaGPT Initializing ===');
  
  loadSessions();
  applyTheme(false);
  applySidebar(false);

  // Check for shared chat ID in URL
  const urlParams = new URLSearchParams(window.location.search);
  const sharedChatId = urlParams.get('chat');
  
  if (sharedChatId && S.sessions.find(s => s.id === sharedChatId)) {
    // Load shared chat
    switchSession(sharedChatId);
    toast('Shared chat loaded', 'ok');
    // Clean up URL without reloading
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    // Load last session or create new
    const last = localStorage.getItem(getUserKey('last'));
    const found = S.sessions.find(s => s.id === last);
    found ? switchSession(last) : newSession();
  }

  console.log('Binding all events...');
  bindAll();
  console.log('Events bound. msgInput element:', D.msgInput);
  refreshSend();
  D.msgInput.focus();

  // Auto-focus input when user starts typing (unless in another input/textarea)
  document.addEventListener('keydown', (e) => {
    // Skip if already focused on an input, textarea, or contenteditable
    const target = e.target;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    // Skip special keys (shortcuts, navigation, etc.)
    const isSpecialKey = e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1;
    // Skip if modal is open
    const isModalOpen = document.querySelector('.overlay:not(.hidden)') !== null;

    if (!isInput && !isSpecialKey && !isModalOpen && D.msgInput) {
      D.msgInput.focus();
    }
  });

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

// Expose persist, renderHistory, S, and newSession globally for PanelManager
window.persist = persist;
window.renderHistory = renderHistory;
window.newSession = newSession;
window.S = S;

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
  
  // Look up chat name from project
  let displayTitle = s.title || 'New Chat';
  let isProjectChat = false;
  let projectName = '';
  const projects = JSON.parse(localStorage.getItem(getUserKey('projects')) || '[]');
  
  for (const project of projects) {
    if (project.chatIds && Array.isArray(project.chatIds)) {
      const chat = project.chatIds.find(c => c.id === s.id);
      if (chat) {
        // Show "chatName / projectName" format
        projectName = project.name;
        displayTitle = `${chat.name || s.title || 'New Chat'} / ${project.name}`;
        isProjectChat = true;
        break;
      }
    }
  }
  
  // Check if chat is favorited
  const favorites = JSON.parse(localStorage.getItem(getUserKey('favorites')) || '[]');
  const isFavorited = favorites.some(f => f.id === s.id);
  
  el.innerHTML = `
    <div class="hi-icon"><svg viewBox="0 0 16 16"><path d="M14 10a5 5 0 01-5 5H5L2 14.5V5a5 5 0 015-5h2a5 5 0 015 5v5z"/></svg></div>
    <span class="hi-label">${esc(displayTitle)}</span>
    <span class="hi-time">${relTime(s.updated)}</span>
    <button class="hi-star${isFavorited ? ' active' : ''}" data-id="${s.id}" title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
      <svg viewBox="0 0 16 16" fill="${isFavorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.2">
        <path d="M8 1l2 5h5l-4 3 1.5 5L8 10l-4.5 4 1.5-5-4-3h5z"/>
      </svg>
    </button>
    <button class="hi-menu" data-id="${s.id}" title="Options" aria-label="Options">
      <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.5" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="8" cy="12.5" r="1.1"/></svg>
    </button>`;
  el.addEventListener('click', e => { 
    if (!e.target.closest('.hi-menu') && !e.target.closest('.hi-star')) switchSession(s.id); 
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') switchSession(s.id); });
  el.addEventListener('dblclick', () => openRenameModal(s.id));
  el.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, s.id); });
  el.querySelector('.hi-menu').addEventListener('click', e => { e.stopPropagation(); showCtxMenu(e, s.id); });
  
  // Star button click handler
  const starBtn = el.querySelector('.hi-star');
  starBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavoriteChat(s);
  });
  
  return el;
}

function toggleFavoriteChat(s) {
  const userKey = getUserKey('favorites');
  let favorites = JSON.parse(localStorage.getItem(userKey) || '[]');
  const index = favorites.findIndex(f => f.id === s.id);
  
  if (index >= 0) {
    // Remove from favorites
    favorites.splice(index, 1);
    toast('Removed from favorites', 'info');
  } else {
    // Add to favorites
    favorites.push({
      id: s.id,
      title: s.title || 'New Chat',
      saved: Date.now(),
      updated: s.updated,
      messages: s.messages?.length || 0
    });
    toast('Added to favorites', 'ok');
  }
  
  localStorage.setItem(userKey, JSON.stringify(favorites));
  
  // Update UI
  renderHistory();
  
  // Update favorites panel if PanelManager exists
  if (window.PanelManager && typeof PanelManager.renderFavorites === 'function') {
    PanelManager.renderFavorites();
  }
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
/**
 * Send a message to the server and display the response.
 * @param {string} text - The message to send.
 */
async function sendMessage(text) {
  text = text.trim();
  console.log('sendMessage called with:', text);
  if ((!text && !S.attachedFiles.length) || S.loading) {
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
    const sidebarContext = getSidebarContext();
    const files = S.attachedFiles.splice(0); // Get and clear attached files
    renderAttachedFiles(); // Update UI
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history, sidebarContext, files }),
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
    const sidebarContext = getSidebarContext();
    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lastUser.content, history, sidebarContext }),
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
          const sidebarContext = getSidebarContext();
          const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: newText, history, sidebarContext }), signal: S.abort.signal });
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
    if (D.msgInput.value.trim() || S.attachedFiles.length) {
      sendMessage(D.msgInput.value);
    }
  });

  /* File attachment */
  D.attachBtn.addEventListener('click', () => D.fileInput.click());
  D.fileInput.addEventListener('change', handleFileSelect);

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
  D.shareBtn.addEventListener('click', async () => {
    // Build shareable URL with chat ID
    const url = new URL(window.location.href);
    url.searchParams.set('chat', S.currentId);
    const shareUrl = url.toString();
    
    // Try Web Share API first (native sharing)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AriaGPT Chat',
          text: 'Check out this conversation on AriaGPT',
          url: shareUrl
        });
        toast('Shared successfully', 'ok');
        return;
      } catch (err) {
        // User cancelled or share failed - fall through to clipboard
      }
    }
    
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied to clipboard', 'ok');
    } catch {
      toast('Failed to copy link', 'err');
    }
  });

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

async function callAIAPI(message, history, onChunk, onError) {
  // Always use local backend (Gemini)
  return callLocalBackend(message, history, onChunk, onError);
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
    if (mod && shift && e.key === 'K') { e.preventDefault(); openApiKeyModal(); }
    if (mod && shift && e.key === 'A') { e.preventDefault(); exportAllChats(); }
  });
}

/* ── Boot ── */
window.initChatApp = () => {
  init();
  setupEnhancedShortcuts();
};