/**
 * AI Multi Panel — Universal Content Script Helper v2.5.0
 *
 * 修正点:
 *  - Gemini の「+」ファイル追加ボタンを誤クリックするバグを修正
 *  - contenteditable(Quill/ProseMirror)へのEnterキー送信を廃止
 *    → サービスごとに正確な送信ボタンをクリックする方式に統一
 *  - 汎用フォールバックをより保守的に変更
 */
(function () {
  'use strict';
  if (window.__AI_HUB_PRO_INITIALIZED__) return;
  window.__AI_HUB_PRO_INITIALIZED__ = true;

  // ── 入力欄セレクタ ───────────────────────────────────────────
  const INPUT_SELECTORS = [
    // Claude (ProseMirror)
    '.ProseMirror[contenteditable="true"]',
    // Gemini (Quill)
    'div.ql-editor[contenteditable="true"]',
    // 汎用 contenteditable
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
    // textarea 汎用
    'textarea:not([readonly]):not([disabled])',
  ];

  // ── サービス別送信ボタン定義 ─────────────────────────────────
  // 優先度高い順に並べる。完全一致 aria-label を最優先。
  // ★ button[type="submit"] は削除（Geminiで誤ヒットする原因）
  const SUBMIT_SELECTORS = [
    // ── Gemini ──────────────────────────────────────────────────
    // 英語 UI
    'button[aria-label="Send message"]',
    // 日本語 UI（Google翻訳 UI により変わる場合がある）
    'button[aria-label="送信"]',
    'button[aria-label="メッセージを送信"]',
    'button[aria-label="プロンプトを送信"]',
    // Gemini の送信ボタンのクラス名（2024年時点）
    'button.send-button',
    'button[mattooltip="Send message"]',
    'button[mattooltip="メッセージを送信"]',

    // ── Claude ──────────────────────────────────────────────────
    'button[aria-label="Send Message"]',
    'button[aria-label="メッセージを送信する"]',
    'button[data-testid="send-message-button"]',

    // ── Genspark / その他 ────────────────────────────────────────
    'button[data-testid="send-button"]',
    'button[data-testid="fruitjuice-send-button"]',
    'button[data-test-id="send-button"]',
    'button[class*="send"][class*="btn"]',
  ];

  // ── ブラックリスト（これにマッチするボタンは絶対に押さない）─
  const BLACKLIST_LABELS = [
    'attach', 'file', 'image', 'photo', 'upload',
    '添付', 'ファイル', '画像', 'アップロード',
    'plus', 'add', '追加', 'more', 'menu',
    'microphone', 'マイク', 'voice', '音声',
    'emoji', '絵文字', 'settings', '設定',
    'stop', '停止', 'cancel', 'キャンセル',
  ];

  function isBlacklisted(btn) {
    const label = (
      btn.getAttribute('aria-label') || btn.title || btn.textContent || ''
    ).toLowerCase();
    return BLACKLIST_LABELS.some(bl => label.includes(bl));
  }

  function isVisible(el) {
    return el.offsetParent !== null && !el.closest('[aria-hidden="true"]');
  }

  // ── 入力欄を探す ─────────────────────────────────────────────
  function findInput() {
    for (const sel of INPUT_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (isVisible(el)) return el;
      }
    }
    return null;
  }

  // ── 送信ボタンを探す ─────────────────────────────────────────
  function findSubmitButton() {
    // 1. 明示的セレクターを順番に試す
    for (const sel of SUBMIT_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (isVisible(el) && !el.disabled && !isBlacklisted(el)) {
          return el;
        }
      }
    }

    // 2. 入力欄の「兄弟要素内」から安全なボタンを探す（保守的フォールバック）
    const input = findInput();
    if (!input) return null;

    // 入力エリアの直近コンテナをさかのぼる（最大4階層）
    let parent = input.parentElement;
    for (let depth = 0; depth < 4 && parent; depth++) {
      const btns = Array.from(parent.querySelectorAll('button:not([disabled])'));
      // 可視・ブラックリスト外・入力欄自身でないボタンだけ候補に
      const candidates = btns.filter(b =>
        isVisible(b) && !isBlacklisted(b) && !b.contains(input)
      );

      // 候補が1つだけなら安全と判断
      if (candidates.length === 1) return candidates[0];

      // 複数ある場合: aria-label に "send" を含むものを優先
      const sendLike = candidates.find(b => {
        const lbl = (b.getAttribute('aria-label') || b.title || '').toLowerCase();
        return lbl.includes('send') || lbl.includes('送信') || lbl.includes('submit');
      });
      if (sendLike) return sendLike;

      // さらに上へ
      parent = parent.parentElement;
    }

    return null;
  }

  // ── テキストをセット ─────────────────────────────────────────
  function setInputText(text) {
    const el = findInput();
    if (!el) return false;
    try {
      el.focus();
      if (el.tagName.toLowerCase() === 'textarea') {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable (Quill / ProseMirror)
        el.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = text;
        el.appendChild(p);
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true, inputType: 'insertText', data: text,
        }));
      }
      return true;
    } catch (e) {
      console.error('[AI Multi Panel] 入力エラー:', e);
      return false;
    }
  }

  // ── フォーム送信 ─────────────────────────────────────────────
  // ★ contenteditable に Enter を送信しない（Gemini で新行になるバグの原因）
  // → 送信ボタンを直接クリックする方式に統一
  function submitForm() {
    const input = findInput();
    const isTextarea = input && input.tagName.toLowerCase() === 'textarea';

    if (isTextarea) {
      // textarea の場合のみ Enter キーが有効なケースがある
      input.focus();
      const ok = input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13,
        bubbles: true, cancelable: true,
      }));
      // Enter が preventDefault されていなければ送信完了と見なす
      if (!ok) return true;
      // Enter が通ったが念のため送信ボタンも試みる（150ms 後）
    }

    // contenteditable / textarea ともに送信ボタンをクリック
    setTimeout(() => {
      const btn = findSubmitButton();
      if (btn) {
        console.log('[AI Multi Panel] 送信ボタンクリック:', btn.getAttribute('aria-label') || btn.className);
        btn.click();
      } else {
        console.warn('[AI Multi Panel] 送信ボタンが見つかりませんでした');
      }
    }, isTextarea ? 150 : 50);

    return true;
  }

  // ── メッセージリスナー ───────────────────────────────────────
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'AI_HUB_SET_INPUT') {
      setTimeout(() => {
        const ok = setInputText(event.data.text);
        event.source?.postMessage({ type: 'AI_HUB_INPUT_RESULT', success: ok }, '*');
      }, 120);
    }

    if (event.data.type === 'AI_HUB_SUBMIT') {
      setTimeout(() => {
        submitForm();
        event.source?.postMessage({ type: 'AI_HUB_SUBMIT_RESULT', success: true }, '*');
      }, 100);
    }
  });

  if (window.parent !== window) {
    window.parent.postMessage({ type: 'AI_HUB_HELPER_READY', url: location.href }, '*');
  }
})();
