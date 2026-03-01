/**
 * AI Multi Panel — main.js v2.5.0
 * 修正内容:
 *  1. Perplexity / DeepSeek / Mistral / Poe を削除（6サービスに絞り込み）
 *  2. ドロップダウンのサービス切り替えバグ修正
 *     （innerHTML += がイベントリスナーを破壊していた問題を解消）
 *  3. iFrame内サービスも含め、起動後に別サービスへ切り替え可能
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// 1. サービス定義（6種類に絞り込み）
// ═══════════════════════════════════════════════════════════════════
const SERVICES = [
  { id: 'gemini',    name: 'Gemini',   url: 'https://gemini.google.com/',                color: '#4285F4', iframeOk: true  },
  { id: 'claude',    name: 'Claude',   url: 'https://claude.ai/new',                     color: '#CC785C', iframeOk: true  },
  { id: 'genspark',  name: 'Genspark', url: 'https://www.genspark.ai/agents?type=ai_chat', color: '#FF6B35', iframeOk: true },
  { id: 'chatgpt',   name: 'ChatGPT',  url: 'https://chatgpt.com/',                      color: '#10A37F', iframeOk: false },
  { id: 'copilot',   name: 'Copilot',  url: 'https://copilot.microsoft.com/',            color: '#0078D4', iframeOk: false },
  { id: 'manus',     name: 'Manus',    url: 'https://manus.im/',                         color: '#7C3AED', iframeOk: false },
];
const SERVICE_MAP = Object.fromEntries(SERVICES.map(s => [s.id, s]));

// ═══════════════════════════════════════════════════════════════════
// 2. レイアウト定義
// ═══════════════════════════════════════════════════════════════════
const LAYOUTS = {
  1: [{ id: '1-full',   icon: '⬛',    title: '1パネル' }],
  2: [{ id: '2-row',    icon: '⬛⬛',   title: '左右に並べる' },
      { id: '2-col',    icon: '🟫',    title: '上下に並べる' }],
  3: [{ id: '3-row',    icon: '⬛⬛⬛', title: '横3列' },
      { id: '3-col',    icon: '≡',     title: '縦3列' },
      { id: '3-main-r', icon: '◫',    title: 'メイン+右2' }],
  4: [{ id: '4-grid',   icon: '⊞',    title: '2×2グリッド' },
      { id: '4-row',    icon: '☰',    title: '横4列' },
      { id: '4-col',    icon: '≡',    title: '縦4列' },
      { id: '4-main',   icon: '◧',    title: 'メイン+3サブ' }],
};

// ═══════════════════════════════════════════════════════════════════
// 3. 状態管理
// ═══════════════════════════════════════════════════════════════════
const STORAGE_KEY = 'ai-multi-panel-v25';

function uid() { return 'p' + Math.random().toString(36).slice(2, 8); }

const defaultState = () => ({
  panels: [
    { id: uid(), serviceId: 'gemini', zoom: 100 },
    { id: uid(), serviceId: 'claude', zoom: 100 },
  ],
  layoutMode: '2-row',
  inputHeight: 52,
  inputCollapsed: false,
  gridRatios: { col: 0.5, row: 0.5 },
});

let state;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  state = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
} catch (_) { state = defaultState(); }

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════
// 4. DOM 参照
// ═══════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const panelsContainer  = $('panels-container');
const layoutControl    = $('layout-control');
const panelCountLabel  = $('panel-count-label');
const inputArea        = $('input-area');
const sharedInput      = $('shared-input');
const sendStatus       = $('send-status');
const toast            = $('toast');
const settingsModal    = $('settings-modal');

// ═══════════════════════════════════════════════════════════════════
// 5. グリッドレイアウト
// ═══════════════════════════════════════════════════════════════════

function applyGridLayout() {
  const pc   = panelsContainer;
  const mode = state.layoutMode;
  const cr   = state.gridRatios.col;
  const rr   = state.gridRatios.row;

  // 既存リサイズハンドルを削除
  pc.querySelectorAll('.resize-divider').forEach(el => el.remove());

  pc.style.display = 'grid';
  pc.style.gridTemplateColumns = '';
  pc.style.gridTemplateRows    = '';

  if (state.panels.length === 1) {
    pc.style.gridTemplateColumns = '1fr';
    pc.style.gridTemplateRows    = '1fr';
    return;
  }

  if (state.panels.length === 2) {
    if (mode === '2-row') {
      pc.style.gridTemplateColumns = `${cr}fr 4px ${1-cr}fr`;
      pc.style.gridTemplateRows    = '1fr';
      addDivider('vertical', cr, 'col');
    } else {
      pc.style.gridTemplateColumns = '1fr';
      pc.style.gridTemplateRows    = `${rr}fr 4px ${1-rr}fr`;
      addDivider('horizontal', rr, 'row');
    }
    return;
  }

  if (state.panels.length === 3) {
    if (mode === '3-row') {
      pc.style.gridTemplateColumns = '1fr 4px 1fr 4px 1fr';
      pc.style.gridTemplateRows    = '1fr';
      addSimpleDivider('vertical', 2);
      addSimpleDivider('vertical', 4);
    } else if (mode === '3-col') {
      pc.style.gridTemplateColumns = '1fr';
      pc.style.gridTemplateRows    = '1fr 4px 1fr 4px 1fr';
      addSimpleDivider('horizontal', 2);
      addSimpleDivider('horizontal', 4);
    } else {
      pc.style.gridTemplateColumns = `${cr}fr 4px ${1-cr}fr`;
      pc.style.gridTemplateRows    = `${rr}fr 4px ${1-rr}fr`;
      addDivider('vertical', cr, 'col');
      addSimpleDivider('horizontal', 2);
    }
    return;
  }

  // 4パネル
  if (mode === '4-grid') {
    pc.style.gridTemplateColumns = `${cr}fr 4px ${1-cr}fr`;
    pc.style.gridTemplateRows    = `${rr}fr 4px ${1-rr}fr`;
    addDivider('vertical',   cr, 'col');
    addDivider('horizontal', rr, 'row');
  } else if (mode === '4-row') {
    pc.style.gridTemplateColumns = '1fr 4px 1fr 4px 1fr 4px 1fr';
    pc.style.gridTemplateRows    = '1fr';
    addSimpleDivider('vertical', 2);
    addSimpleDivider('vertical', 4);
    addSimpleDivider('vertical', 6);
  } else if (mode === '4-col') {
    pc.style.gridTemplateColumns = '1fr';
    pc.style.gridTemplateRows    = '1fr 4px 1fr 4px 1fr 4px 1fr';
    addSimpleDivider('horizontal', 2);
    addSimpleDivider('horizontal', 4);
    addSimpleDivider('horizontal', 6);
  } else if (mode === '4-main') {
    pc.style.gridTemplateColumns = `${cr}fr 4px ${1-cr}fr`;
    pc.style.gridTemplateRows    = '1fr 4px 1fr 4px 1fr';
    addDivider('vertical', cr, 'col');
    addSimpleDivider('horizontal', 2);
    addSimpleDivider('horizontal', 4);
  }
}

function addDivider(type, initRatio, ratioKey) {
  const div = document.createElement('div');
  div.className = `resize-divider ${type}`;
  panelsContainer.appendChild(div);
  setupDividerDrag(div, type, ratioKey);
}

function addSimpleDivider(type, gridLine) {
  const div = document.createElement('div');
  div.className = `resize-divider ${type}`;
  if (type === 'vertical') {
    div.style.gridColumn = `${gridLine} / ${gridLine+1}`;
    div.style.gridRow    = '1 / -1';
  } else {
    div.style.gridRow    = `${gridLine} / ${gridLine+1}`;
    div.style.gridColumn = '1 / -1';
  }
  panelsContainer.appendChild(div);
}

// ═══════════════════════════════════════════════════════════════════
// 6. パネルDOM管理
//
//  ★ 修正: 既存パネルはDOMを移動せず CSS grid 座標のみ更新する
//  　 appendChild によるDOM移動がiframeのリロードを引き起こしていた
// ═══════════════════════════════════════════════════════════════════

// パネルID → DOM要素 の永続マップ（リロードしない核心）
const panelElementMap = new Map();

function renderAllPanels() {
  applyGridLayout();

  const count = state.panels.length;
  const mode  = state.layoutMode;

  // 現在state.panelsに含まれているIDセット
  const activeIds = new Set(state.panels.map(p => p.id));

  // state.panels にないパネルをDOMから削除
  for (const [id, el] of panelElementMap) {
    if (!activeIds.has(id)) {
      el.remove();
      panelElementMap.delete(id);
    }
  }

  // 各パネルを更新または新規作成（DOM移動は一切しない）
  state.panels.forEach((panelData, index) => {
    let el = panelElementMap.get(panelData.id);

    if (!el) {
      // 新規パネル: 作成してコンテナに追加
      el = createPanelElement(panelData);
      panelElementMap.set(panelData.id, el);
      panelsContainer.appendChild(el);
    } else {
      // 既存パネル: ヘッダーのみ同期（iframeは触らない）
      syncPanelHeader(el, panelData);
    }

    // CSS grid 位置だけ更新（DOM位置は変えない）
    setGridPosition(el, index, count, mode);
  });

  // リサイズハンドルをDOM末尾に移動（パネル要素は動かさない）
  panelsContainer.querySelectorAll('.resize-divider').forEach(el => {
    panelsContainer.appendChild(el);
  });
}

function setGridPosition(el, index, count, mode) {
  el.style.gridColumn = '';
  el.style.gridRow    = '';

  if (count <= 1) return;

  if (count === 2) {
    if (mode === '2-row') {
      el.style.gridColumn = index === 0 ? '1' : '3';
    } else {
      el.style.gridRow = index === 0 ? '1' : '3';
    }
    return;
  }

  if (count === 3) {
    if (mode === '3-row') {
      el.style.gridColumn = ['1','3','5'][index];
    } else if (mode === '3-col') {
      el.style.gridRow = ['1','3','5'][index];
    } else { // 3-main-r
      if (index === 0) { el.style.gridRow = '1 / -1'; }
      else { el.style.gridColumn = '3'; el.style.gridRow = index === 1 ? '1' : '3'; }
    }
    return;
  }

  if (count === 4) {
    if (mode === '4-grid') {
      el.style.gridColumn = ['1','3','1','3'][index];
      el.style.gridRow    = ['1','1','3','3'][index];
    } else if (mode === '4-row') {
      el.style.gridColumn = ['1','3','5','7'][index];
    } else if (mode === '4-col') {
      el.style.gridRow = ['1','3','5','7'][index];
    } else if (mode === '4-main') {
      if (index === 0) { el.style.gridColumn = '1'; el.style.gridRow = '1 / -1'; }
      else { el.style.gridColumn = '3'; el.style.gridRow = ['1','3','5'][index-1]; }
    }
  }
}

function createPanelElement(panelData) {
  const service = SERVICE_MAP[panelData.serviceId] || SERVICES[0];
  const el = document.createElement('div');
  el.className = 'ai-panel';
  el.dataset.panelId   = panelData.id;
  el.dataset.serviceId = service.id;
  el.style.setProperty('--service-color', service.color);

  // パネルヘッダー
  const header = buildPanelHeader(panelData, service);
  el.appendChild(header);

  // パネルボディ
  const body = document.createElement('div');
  body.className = 'panel-body';
  el.appendChild(body);

  attachPanelEvents(el, panelData);
  loadPanelContent(body, panelData, service);

  return el;
}

function buildPanelHeader(panelData, service) {
  const header = document.createElement('div');
  header.className = 'panel-header';

  // サービスセレクタ
  const selectorBtn = document.createElement('button');
  selectorBtn.className = 'service-selector-btn';
  selectorBtn.dataset.action = 'open-dropdown';

  const dot = document.createElement('span');
  dot.className = 'service-color-dot';
  dot.style.background = service.color;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'service-name-label';
  nameSpan.textContent = service.name;

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '▾';

  selectorBtn.appendChild(dot);
  selectorBtn.appendChild(nameSpan);
  selectorBtn.appendChild(arrow);
  header.appendChild(selectorBtn);

  // コントロール群
  const controls = document.createElement('div');
  controls.className = 'panel-controls';

  const zoomOut = makeBtn('panel-btn', '−', 'zoom-out', '縮小');
  const zoomInd = document.createElement('span');
  zoomInd.className = 'zoom-indicator';
  zoomInd.textContent = `${panelData.zoom || 100}%`;
  const zoomIn = makeBtn('panel-btn', '＋', 'zoom-in', '拡大');
  const refresh = makeBtn('panel-btn', '↺', 'refresh', 'リロード');
  const newTab  = makeBtn('panel-btn', '↗', 'new-tab', '新しいタブで開く');
  const maxBtn  = makeBtn('panel-btn', '⛶', 'maximize', '最大化');

  controls.append(zoomOut, zoomInd, zoomIn, refresh, newTab, maxBtn);

  if (state.panels.length > 1) {
    controls.appendChild(makeBtn('panel-btn close-btn', '✕', 'close', 'パネルを閉じる'));
  }

  header.appendChild(controls);
  return header;
}

function makeBtn(className, text, action, title) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = text;
  btn.dataset.action = action;
  btn.title = title;
  return btn;
}

// ヘッダーだけ同期（iframeは触らない）
function syncPanelHeader(el, panelData) {
  const service = SERVICE_MAP[panelData.serviceId] || SERVICES[0];
  el.dataset.serviceId = service.id;
  el.style.setProperty('--service-color', service.color);

  const dot  = el.querySelector('.service-color-dot');
  const name = el.querySelector('.service-name-label');
  const zi   = el.querySelector('.zoom-indicator');
  if (dot)  dot.style.background  = service.color;
  if (name) name.textContent = service.name;
  if (zi)   zi.textContent   = `${panelData.zoom || 100}%`;

  // Closeボタンの有無を更新
  const controls = el.querySelector('.panel-controls');
  const existing = controls.querySelector('.close-btn');
  if (state.panels.length > 1 && !existing) {
    controls.appendChild(makeBtn('panel-btn close-btn', '✕', 'close', 'パネルを閉じる'));
  } else if (state.panels.length <= 1 && existing) {
    existing.remove();
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. パネルコンテンツ読み込み
// ═══════════════════════════════════════════════════════════════════

function loadPanelContent(body, panelData, service) {
  body.innerHTML = '';

  if (service.iframeOk) {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = '<div class="spinner-ring"></div><span>読み込み中...</span>';
    body.appendChild(spinner);

    const iframe = document.createElement('iframe');
    iframe.id = `iframe-${panelData.id}`;
    iframe.src = service.url;

    // ★ sandbox 属性を使用しない理由：
    //   1. HTML仕様上、sandbox付きiframe内で生成された子iframeは
    //      親のsandbox制約を「必ず継承」する（ネスト伝播）
    //   2. Gemini Canvas / Claude Artifacts はいずれも srcdoc の
    //      ネストiframeでプレビューをレンダリングするため、
    //      親sandbox制約がプレビュー描画を阻害する
    //   3. 「allow-scripts + allow-same-origin」の同時指定は
    //      HTML仕様上sandbox無効と等価（ページが自分で解除可能）
    //      → セキュリティ上の意味がなく制限だけが残る状態
    //   → sandbox完全削除が最も正確かつ安全な解決策

    // allow属性: iframe内ページとその子フレームに機能を明示的に委譲
    iframe.setAttribute('allow', [
      'clipboard-read',
      'clipboard-write',
      'microphone',
      'camera',
      'fullscreen',            // スライド全画面表示
      'display-capture',       // 画面共有プレビュー
      'autoplay',              // 動画・アニメーション自動再生
      'picture-in-picture',    // PiP表示
      'presentation',          // Presentation API（スライド発表モード）
      'accelerometer',         // センサー系（Gensparkなど向け）
      'gyroscope',
      'web-share',             // Web Share API
    ].join('; '));

    iframe.addEventListener('load', () => {
      spinner.remove();
      applyZoomToIframe(iframe, panelData.zoom || 100);
    });

    body.appendChild(iframe);
  } else {
    renderFallback(body, panelData, service);
  }
}

function renderFallback(body, panelData, service) {
  const div = document.createElement('div');
  div.className = 'panel-fallback';

  const icon = document.createElement('div');
  icon.className = 'fallback-icon';
  icon.style.cssText = `background:${service.color}22; border:1px solid ${service.color}44; color:${service.color}`;
  icon.textContent = service.name.charAt(0);

  const title = document.createElement('div');
  title.className = 'fallback-title';
  title.style.color = service.color;
  title.textContent = service.name;

  const desc = document.createElement('div');
  desc.className = 'fallback-desc';
  desc.innerHTML = `${service.name} は iframe 埋め込みに対応していません。<br>
    「全パネルに送信」を押すと、テキストが<strong>自動でクリップボードにコピー</strong>されます。<br>
    下のボタンで新しいタブを開き、<kbd style="background:#22263a;border:1px solid #3d4268;border-radius:3px;padding:0 4px;font-family:monospace;font-size:10px;">Ctrl+V</kbd> で貼り付けてください。`;

  const notice = document.createElement('div');
  notice.className = 'fallback-copied-notice';
  notice.id = `copied-notice-${panelData.id}`;
  notice.textContent = '✓ クリップボードにコピーしました';

  const openBtn = document.createElement('button');
  openBtn.className = 'fallback-open-btn';
  openBtn.textContent = `${service.name} を新しいタブで開く →`;
  openBtn.addEventListener('click', () => window.open(service.url, '_blank'));

  const hint = document.createElement('div');
  hint.className = 'fallback-hint';
  hint.textContent = 'このパネルに送信されたテキストは自動でコピーされます';

  div.append(icon, title, desc, notice, openBtn, hint);
  body.appendChild(div);
}

function applyZoomToIframe(iframe, zoom) {
  const scale = zoom / 100;
  iframe.style.width           = `${100 / scale}%`;
  iframe.style.height          = `${100 / scale}%`;
  iframe.style.transform       = `scale(${scale})`;
  iframe.style.transformOrigin = '0 0';
}

// ═══════════════════════════════════════════════════════════════════
// 8. パネルイベント（委譲）
// ═══════════════════════════════════════════════════════════════════

function attachPanelEvents(el, panelData) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    switch (btn.dataset.action) {
      case 'open-dropdown': openServiceDropdown(el, panelData); break;
      case 'zoom-in':  changeZoom(el, panelData, +10); break;
      case 'zoom-out': changeZoom(el, panelData, -10); break;
      case 'refresh':  reloadPanel(el, panelData); break;
      case 'new-tab':  window.open((SERVICE_MAP[panelData.serviceId] || SERVICES[0]).url, '_blank'); break;
      case 'maximize': toggleMaximize(el, btn); break;
      case 'close':    removePanel(panelData.id); break;
    }
  });
}

function changeZoom(el, panelData, delta) {
  panelData.zoom = Math.max(40, Math.min(160, (panelData.zoom || 100) + delta));
  const zi = el.querySelector('.zoom-indicator');
  if (zi) zi.textContent = `${panelData.zoom}%`;
  const iframe = el.querySelector('iframe');
  if (iframe) applyZoomToIframe(iframe, panelData.zoom);
  saveState();
}

function reloadPanel(el, panelData) {
  const service = SERVICE_MAP[panelData.serviceId];
  if (!service || !service.iframeOk) return;
  const body = el.querySelector('.panel-body');
  loadPanelContent(body, panelData, service);
}

function toggleMaximize(el, btn) {
  const isMax = el.classList.contains('maximized');
  panelsContainer.querySelectorAll('.ai-panel.maximized').forEach(p => {
    p.classList.remove('maximized');
    const b = p.querySelector('[data-action="maximize"]');
    if (b) { b.textContent = '⛶'; b.title = '最大化'; }
  });
  if (!isMax) {
    el.classList.add('maximized');
    btn.textContent = '⊡'; btn.title = '元に戻す';
  }
}

// ═══════════════════════════════════════════════════════════════════
// 9. サービスドロップダウン（バグ修正版）
//    ★ innerHTML += を使わず createElement のみで構築
// ═══════════════════════════════════════════════════════════════════

let activeDropdown = null;

function openServiceDropdown(panelEl, panelData) {
  closeDropdown();

  const dropdown = document.createElement('div');
  dropdown.className = 'service-dropdown';

  // ── iFrame対応サービス ──────────────────
  const titleOk = document.createElement('div');
  titleOk.className = 'dropdown-section-title';
  titleOk.textContent = 'iFrame 対応';
  dropdown.appendChild(titleOk);

  SERVICES.filter(s => s.iframeOk).forEach(service => {
    dropdown.appendChild(makeDropdownItem(service, panelData, panelEl));
  });

  // ── セパレータ ──────────────────────────
  const divider = document.createElement('div');
  divider.className = 'dropdown-divider';
  dropdown.appendChild(divider);

  // ── クリップボード連携サービス ──────────
  const titleFb = document.createElement('div');
  titleFb.className = 'dropdown-section-title';
  titleFb.textContent = 'クリップボード連携';
  dropdown.appendChild(titleFb);

  SERVICES.filter(s => !s.iframeOk).forEach(service => {
    dropdown.appendChild(makeDropdownItem(service, panelData, panelEl));
  });

  // 位置決め
  const btnRect = panelEl.querySelector('.service-selector-btn').getBoundingClientRect();
  dropdown.style.top  = (btnRect.bottom + 4) + 'px';
  dropdown.style.left = btnRect.left + 'px';

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  // 画面外補正
  requestAnimationFrame(() => {
    const r = dropdown.getBoundingClientRect();
    if (r.right > window.innerWidth) {
      dropdown.style.left = Math.max(4, window.innerWidth - r.width - 8) + 'px';
    }
    if (r.bottom > window.innerHeight) {
      dropdown.style.top = Math.max(4, btnRect.top - r.height - 4) + 'px';
    }
  });
}

function makeDropdownItem(service, panelData, panelEl) {
  const li = document.createElement('div');
  li.className = 'dropdown-item' + (service.id === panelData.serviceId ? ' active' : '');

  const dot = document.createElement('span');
  dot.className = 'item-dot';
  dot.style.background = service.color;

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = service.name;

  const badge = document.createElement('span');
  badge.className = `item-badge ${service.iframeOk ? 'ok' : 'fallback'}`;
  badge.textContent = service.iframeOk ? '✓ iframe' : '⧉ 外部';

  const check = document.createElement('span');
  check.className = 'item-check';
  check.textContent = '✓';

  li.append(dot, name, badge, check);

  // ★ ここが修正の核心：クリックで changeService を呼ぶ
  li.addEventListener('click', () => {
    changeService(panelEl, panelData, service.id);
    closeDropdown();
  });

  return li;
}

function closeDropdown() {
  if (activeDropdown) { activeDropdown.remove(); activeDropdown = null; }
}

document.addEventListener('click', (e) => {
  if (activeDropdown &&
      !activeDropdown.contains(e.target) &&
      !e.target.closest('.service-selector-btn')) {
    closeDropdown();
  }
});

// ★ サービス切り替え（iframeも完全に再生成する）
function changeService(panelEl, panelData, newServiceId) {
  if (panelData.serviceId === newServiceId) return;

  panelData.serviceId = newServiceId;
  const service = SERVICE_MAP[newServiceId];

  // ヘッダーを更新
  panelEl.dataset.serviceId = newServiceId;
  panelEl.style.setProperty('--service-color', service.color);
  const dot  = panelEl.querySelector('.service-color-dot');
  const name = panelEl.querySelector('.service-name-label');
  if (dot)  dot.style.background  = service.color;
  if (name) name.textContent = service.name;

  // ズームを100にリセット
  panelData.zoom = 100;
  const zi = panelEl.querySelector('.zoom-indicator');
  if (zi) zi.textContent = '100%';

  // ★ コンテンツを完全に再生成
  const body = panelEl.querySelector('.panel-body');
  loadPanelContent(body, panelData, service);

  saveState();
}

// ═══════════════════════════════════════════════════════════════════
// 10. パネル追加・削除
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_CYCLE = ['gemini', 'claude', 'genspark', 'chatgpt'];

function addPanel() {
  if (state.panels.length >= 4) { showToast('パネルは最大 4 つまでです'); return; }

  const used = state.panels.map(p => p.serviceId);
  const nextId = DEFAULT_CYCLE.find(s => !used.includes(s))
    || SERVICES[state.panels.length % SERVICES.length].id;

  state.panels.push({ id: uid(), serviceId: nextId, zoom: 100 });

  const n = state.panels.length;
  if (n === 2) state.layoutMode = '2-row';
  if (n === 3) state.layoutMode = '3-row';
  if (n === 4) state.layoutMode = '4-grid';

  refresh();
  saveState();
}

function removePanel(panelId) {
  if (state.panels.length <= 1) { showToast('最低 1 つのパネルが必要です'); return; }
  state.panels = state.panels.filter(p => p.id !== panelId);

  // 削除後の数で判定
  const n = state.panels.length;
  if (n === 1) state.layoutMode = '1-full';
  else if (n === 2) state.layoutMode = '2-row';
  else if (n === 3) state.layoutMode = '3-row';

  refresh();
  saveState();
}

// ═══════════════════════════════════════════════════════════════════
// 11. 全体リフレッシュ
// ═══════════════════════════════════════════════════════════════════

function refresh() {
  const count = state.panels.length;
  panelCountLabel.textContent = `${count} パネル`;
  $('btn-remove-panel').disabled = count <= 1;
  $('btn-add-panel').disabled    = count >= 4;

  renderLayoutButtons();
  renderAllPanels();
  updateInputHeight();
}

function renderLayoutButtons() {
  const count   = state.panels.length;
  const options = LAYOUTS[count] || [];
  layoutControl.innerHTML = '';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'layout-btn' + (state.layoutMode === opt.id ? ' active' : '');
    btn.dataset.layoutId = opt.id;
    btn.title = opt.title;
    btn.textContent = opt.icon;

    btn.addEventListener('click', () => {
      state.layoutMode = opt.id;
      saveState();
      renderLayoutButtons();
      applyGridLayout();
      panelsContainer.querySelectorAll('.ai-panel').forEach((el, i) => {
        setGridPosition(el, i, state.panels.length, state.layoutMode);
      });
      panelsContainer.querySelectorAll('.resize-divider').forEach(el => {
        panelsContainer.appendChild(el);
      });
    });

    layoutControl.appendChild(btn);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 12. リサイズハンドルドラッグ
// ═══════════════════════════════════════════════════════════════════

function setupDividerDrag(div, type, ratioKey) {
  let dragging = false, startPos = 0;

  div.addEventListener('mousedown', (e) => {
    dragging = true;
    startPos = type === 'vertical' ? e.clientX : e.clientY;
    div.classList.add('dragging');
    document.body.classList.add('resizing');
    if (type === 'horizontal') document.body.classList.add('row-resize');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect  = panelsContainer.getBoundingClientRect();
    const pos   = type === 'vertical' ? e.clientX : e.clientY;
    const size  = type === 'vertical' ? rect.width  : rect.height;
    const start = type === 'vertical' ? rect.left   : rect.top;
    const ratio = Math.max(0.12, Math.min(0.88, (pos - start) / size));

    if (ratioKey === 'col') state.gridRatios.col = ratio;
    if (ratioKey === 'row') state.gridRatios.row = ratio;

    reapplyRatios();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    div.classList.remove('dragging');
    document.body.classList.remove('resizing', 'row-resize');
    saveState();
  });
}

function reapplyRatios() {
  const pc   = panelsContainer;
  const cr   = state.gridRatios.col;
  const rr   = state.gridRatios.row;
  const mode = state.layoutMode;

  if (mode === '2-row') {
    pc.style.gridTemplateColumns = `${cr}fr 4px ${1-cr}fr`;
  } else if (mode === '2-col') {
    pc.style.gridTemplateRows = `${rr}fr 4px ${1-rr}fr`;
  } else if (mode === '3-main-r' || mode === '4-grid' || mode === '4-main') {
    pc.style.gridTemplateColumns = `${cr}fr 4px ${1-cr}fr`;
    pc.style.gridTemplateRows    = `${rr}fr 4px ${1-rr}fr`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 13. 全パネル一括送信
// ═══════════════════════════════════════════════════════════════════

async function sendToAll() {
  const text = sharedInput.value.trim();
  if (!text) { showToast('テキストを入力してください', 'error'); return; }

  const sendBtn = $('btn-send-all');
  sendBtn.disabled = true;
  sendBtn.textContent = '送信中...';
  sendStatus.innerHTML = '';
  sendStatus.classList.remove('hidden');

  let clipboardDone = false;

  for (const panelData of state.panels) {
    const service = SERVICE_MAP[panelData.serviceId];
    if (!service) continue;

    const chip = document.createElement('span');
    chip.className = 'status-chip pending';
    chip.textContent = `… ${service.name}`;
    sendStatus.appendChild(chip);

    if (!service.iframeOk) {
      if (!clipboardDone) {
        try { await navigator.clipboard.writeText(text); clipboardDone = true; } catch (_) {}
      }
      chip.className = 'status-chip copied';
      chip.textContent = `📋 ${service.name}`;

      const notice = $(`copied-notice-${panelData.id}`);
      if (notice) { notice.classList.add('show'); setTimeout(() => notice.classList.remove('show'), 4000); }
    } else {
      const iframe = $(`iframe-${panelData.id}`);
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'AI_HUB_SET_INPUT', text }, '*');
          chip.className = 'status-chip success';
          chip.textContent = `✓ ${service.name}`;
        } catch (_) {
          chip.className = 'status-chip error';
          chip.textContent = `✕ ${service.name}`;
        }
      } else {
        chip.className = 'status-chip error';
        chip.textContent = `✕ ${service.name}`;
      }
    }
  }

  sendBtn.disabled = false;
  sendBtn.textContent = '▶ 全パネルに送信';
  showToast(clipboardDone ? '送信完了（一部クリップボードにコピー）' : '全パネルに送信しました');
}

// ═══════════════════════════════════════════════════════════════════
// 13b. 全パネル一括実行（送信ボタンをクリック）
// ═══════════════════════════════════════════════════════════════════

async function executeAll() {
  const execBtn = $('btn-execute-all');
  execBtn.disabled = true;
  execBtn.textContent = '⚡ 実行中...';

  sendStatus.innerHTML = '';
  sendStatus.classList.remove('hidden');

  let anyOk = false;

  for (const panelData of state.panels) {
    const service = SERVICE_MAP[panelData.serviceId];
    if (!service) continue;

    const chip = document.createElement('span');
    chip.className = 'status-chip pending';
    chip.textContent = `… ${service.name}`;
    sendStatus.appendChild(chip);

    if (!service.iframeOk) {
      // クリップボード連携サービスは実行不可
      chip.className = 'status-chip error';
      chip.textContent = `⊘ ${service.name}（外部タブで実行）`;
      continue;
    }

    const iframe = $(`iframe-${panelData.id}`);
    if (!iframe || !iframe.contentWindow) {
      chip.className = 'status-chip error';
      chip.textContent = `✕ ${service.name}`;
      continue;
    }

    // postMessage でサブミットを指示
    try {
      iframe.contentWindow.postMessage({ type: 'AI_HUB_SUBMIT' }, '*');
      chip.className = 'status-chip success';
      chip.textContent = `⚡ ${service.name}`;
      anyOk = true;
    } catch (_) {
      chip.className = 'status-chip error';
      chip.textContent = `✕ ${service.name}`;
    }
  }

  execBtn.disabled = false;
  execBtn.textContent = '⚡ 全パネル実行';
  showToast(anyOk ? '全パネルで実行しました' : 'iFrame対応パネルがありません');
}

// ═══════════════════════════════════════════════════════════════════
// 14. 入力エリア管理
// ═══════════════════════════════════════════════════════════════════

function updateInputHeight() {
  if (state.inputCollapsed) {
    inputArea.classList.add('collapsed');
    document.documentElement.style.setProperty('--input-h', '0px');
  } else {
    inputArea.classList.remove('collapsed');
    // 次フレームで高さを測る
    requestAnimationFrame(() => {
      const h = inputArea.offsetHeight;
      document.documentElement.style.setProperty('--input-h', h + 'px');
    });
  }
}

// 入力欄リサイズ
(function() {
  const handle = $('input-resize-handle');
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', (e) => {
    dragging = true; startY = e.clientY; startH = sharedInput.offsetHeight;
    document.body.classList.add('resizing', 'row-resize'); e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newH = Math.max(30, Math.min(160, startH + e.clientY - startY));
    sharedInput.style.height = newH + 'px';
    state.inputHeight = newH;
    updateInputHeight();
  });
  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.classList.remove('resizing', 'row-resize');
      saveState();
    }
  });
})();

// ═══════════════════════════════════════════════════════════════════
// 15. トースト
// ═══════════════════════════════════════════════════════════════════

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.getBoundingClientRect();
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 220);
  }, 2800);
}

// ═══════════════════════════════════════════════════════════════════
// 16. キーボード & イベントリスナー
// ═══════════════════════════════════════════════════════════════════

function initEvents() {
  $('btn-add-panel').addEventListener('click', addPanel);
  $('btn-remove-panel').addEventListener('click', () => {
    const last = state.panels[state.panels.length - 1];
    if (last) removePanel(last.id);
  });

  $('btn-toggle-input').addEventListener('click', () => {
    state.inputCollapsed = !state.inputCollapsed;
    $('btn-toggle-input').innerHTML = state.inputCollapsed ? '✏️ 入力 ▾' : '✏️ 入力';
    updateInputHeight();
    saveState();
  });

  $('btn-send-all').addEventListener('click', sendToAll);
  $('btn-execute-all').addEventListener('click', executeAll);
  sharedInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendToAll(); }
    // Ctrl+Shift+Enter で全パネル実行
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') { e.preventDefault(); executeAll(); }
  });

  $('btn-clear').addEventListener('click', () => {
    sharedInput.value = '';
    sendStatus.innerHTML = '';
    sendStatus.classList.add('hidden');
    updateInputHeight();
  });

  $('btn-settings').addEventListener('click', () => settingsModal.classList.remove('hidden'));
  $('btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  const helpModal = $('help-modal');
  $('btn-help').addEventListener('click', () => helpModal.classList.remove('hidden'));
  $('btn-close-help').addEventListener('click', () => helpModal.classList.add('hidden'));
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      panelsContainer.querySelectorAll('.ai-panel.maximized').forEach(el => {
        el.classList.remove('maximized');
        const b = el.querySelector('[data-action="maximize"]');
        if (b) { b.textContent = '⛶'; b.title = '最大化'; }
      });
      settingsModal.classList.add('hidden');
      $('help-modal').classList.add('hidden');
      closeDropdown();
    }
  });

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    // AI_HUB_INPUT_RESULT などの受信（将来の拡張用）
  });
}

// ═══════════════════════════════════════════════════════════════════
// 16b. 現在時刻時計
// ═══════════════════════════════════════════════════════════════════

function initClock() {
  const display = $('timer-display');
  const widget  = $('timer-widget');
  if (!display) return;

  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    display.textContent = `${h}:${m}`;
  }

  tick(); // 即時表示
  setInterval(tick, 1000);
}


document.addEventListener('DOMContentLoaded', () => {
  // 保存された入力欄の高さを復元
  if (state.inputHeight) sharedInput.style.height = state.inputHeight + 'px';
  if (state.inputCollapsed) $('btn-toggle-input').innerHTML = '✏️ 入力 ▾';

  initEvents();
  initClock();
  refresh();
  console.log('[AI Multi Panel v2.5.0] 起動完了 — パネル数:', state.panels.length);
});
