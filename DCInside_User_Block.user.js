// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      1.1.0
// @description  디시인사이드 모바일/PC 게시글·댓글 작성자 차단 (차단 항목 완전 숨김)
// @match        https://gall.dcinside.com/*
// @match        https://m.dcinside.com/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL  https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js
// @updateURL    https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js
// ==/UserScript==

(() => {
  'use strict';

  const STORE_KEY = 'dcub_users_v1';
  const BLOCK_BUTTON_CLASS = 'dcub-user-btn';
  const HIDDEN_CLASS = 'dcub-hidden';
  const DONE_ATTRIBUTE = 'data-dcub-done';
  const isMobile = location.hostname === 'm.dcinside.com';

  let blockedUsers = load(STORE_KEY, []);
  let scanTimer = 0;

  function load(key, fallback) {
    try {
      const raw = typeof GM_getValue === 'function'
        ? GM_getValue(key, '')
        : localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed ?? fallback;
    } catch (error) {
      console.warn('[DCUB] 저장 데이터 읽기 실패:', error);
      return fallback;
    }
  }

  function save() {
    const raw = JSON.stringify(blockedUsers);
    try {
      if (typeof GM_setValue === 'function') GM_setValue(STORE_KEY, raw);
      else localStorage.setItem(STORE_KEY, raw);
    } catch (error) {
      console.warn('[DCUB] 저장 실패:', error);
    }
  }

  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  function firstAttribute(root, names) {
    if (!root) return '';

    const nodes = [root];
    if (root.querySelectorAll) {
      root.querySelectorAll(names.map(name => `[${name}]`).join(',')).forEach(node => nodes.push(node));
    }

    for (const node of nodes) {
      for (const name of names) {
        const value = normalize(node.getAttribute?.(name));
        if (value) return value;
      }
    }
    return '';
  }

  function extractGallogId(root) {
    if (!root) return '';

    const nodes = [root];
    root.querySelectorAll?.('a[href], [onclick]').forEach(node => nodes.push(node));

    for (const node of nodes) {
      const source = `${node.getAttribute?.('href') || ''} ${node.getAttribute?.('onclick') || ''}`;
      const match = source.match(/gallog\.dcinside\.com\/([^/?#'" )]+)/i);
      if (match) {
        try {
          return decodeURIComponent(match[1]);
        } catch (_) {
          return match[1];
        }
      }
    }
    return '';
  }

  function extractIP(raw, root) {
    const stored = firstAttribute(root, ['data-ip', 'data-user-ip', 'ip']);
    if (stored) return stored.replace(/[()[\]\s]/g, '');

    const match = String(raw || '').match(/\(((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))\)/);
    return match ? match[1] : '';
  }

  function cleanNickname(raw) {
    return normalize(raw)
      .replace(/^글쓴\s+/, '')
      .replace(/\(((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))\)\s*$/, '')
      .replace(/\s*(차단|해제)\s*$/, '')
      .trim();
  }

  function getUser(author, container) {
    if (!author) return null;

    const context = container || author;
    const raw = normalize(author.textContent);
    const nickFromData = firstAttribute(author, ['data-nick', 'data-name', 'data-user-name']);
    const uid = firstAttribute(context, ['data-uid', 'data-user-id', 'data-userid']) || extractGallogId(context);
    const ip = extractIP(raw, context);
    const nick = cleanNickname(nickFromData || raw);

    if (!uid && !ip && !nick) return null;

    return {
      type: uid ? 'uid' : ip ? 'ip' : 'nick',
      value: uid || ip || nick,
      uid,
      ip,
      nick: nick || uid || ip
    };
  }

  function sameUser(saved, current) {
    if (!saved || !current) return false;
    if (saved.type === 'uid') return Boolean(current.uid) && saved.value === current.uid;
    if (saved.type === 'ip') return Boolean(current.ip) && saved.value === current.ip;
    return Boolean(current.nick) && saved.value === current.nick;
  }

  const blockedIndex = user => blockedUsers.findIndex(saved => sameUser(saved, user));

  function addBlockedUser(user) {
    if (!user || blockedIndex(user) >= 0) return;

    blockedUsers.unshift({
      type: user.type,
      value: user.value,
      nick: user.nick,
      createdAt: Date.now()
    });

    save();
    scan(true);
    renderPanelList();
    toast(`${user.nick} 차단 완료`);
  }

  function removeBlockedUser(index) {
    if (!Number.isInteger(index) || index < 0 || index >= blockedUsers.length) return;

    const removed = blockedUsers.splice(index, 1)[0];
    save();
    scan(true);
    renderPanelList();
    toast(`${removed.nick || removed.value} 차단 해제`);
  }

  function contentContainers() {
    const selectors = [
      'tr.ub-content',
      '.gall_list tbody tr[data-no]',
      'li.ub-content',
      '.cmt_list > li[id^="comment_"]',
      '.reply_list > li[id^="comment_"]',
      '.gall-detail-lst > li',
      '#view_next > li',
      '.all-comment-lst > li[id^="comment_cnt_"]',
      '.comment-lst > li[id^="comment_"]',
      '.reply-lst > li[id^="comment_"]'
    ];

    const result = new Set();
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => result.add(element));
    });
    return [...result];
  }

  function mobileListAuthor(container) {
    if (!container.matches('.gall-detail-lst > li, #view_next > li')) return null;
    return container.querySelector(':scope > ul.ginfo > li:nth-child(2)')
      || container.querySelector('ul.ginfo > li:nth-child(2)');
  }

  function commentTextAuthor(container) {
    if (!container.matches('.all-comment-lst > li[id^="comment_cnt_"]')) return null;

    const lines = String(container.innerText || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);

    const firstLine = lines[0] || '';
    if (!/\(((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))\)/.test(firstLine)) return null;

    let marker = container.querySelector(':scope > .dcub-text-author');
    if (!marker) {
      marker = document.createElement('span');
      marker.className = 'dcub-text-author';
      marker.textContent = firstLine;
      marker.style.display = 'none';
      container.prepend(marker);
    }
    return marker;
  }

  function authorIn(container) {
    const mobileAuthor = mobileListAuthor(container);
    if (mobileAuthor) return mobileAuthor;

    const selectors = [
      '.gall_writer[data-nick]',
      '.gall_writer[data-uid]',
      '.gall_writer[data-ip]',
      '.cmt_nickbox .gall_writer',
      '.cmt_nickbox .nickname',
      '.cmt_nickbox .nick_name',
      '[data-nick]',
      '[data-uid]',
      '[data-ip]',
      '.gall_writer',
      '.nickname',
      '.nick_name',
      '.comment-nick',
      '.user-nick',
      '.user_info'
    ];

    for (const selector of selectors) {
      const found = container.querySelector(selector);
      if (found && normalize(found.textContent)) return found;
    }

    return commentTextAuthor(container);
  }

  function buttonHost(author, container) {
    if (container.matches('.gall-detail-lst > li, #view_next > li')) return author;
    if (container.matches('.all-comment-lst > li[id^="comment_cnt_"]')) {
      return container.querySelector('.comment-info, .comment_user, .user-info, .nick-box') || container;
    }
    return author.closest('.gall_writer, .cmt_nickbox') || author.parentElement || author;
  }

  function addBlockButton(author, container, user) {
    const host = buttonHost(author, container);
    if (!host || host.querySelector(`:scope > .${BLOCK_BUTTON_CLASS}`)) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BLOCK_BUTTON_CLASS;
    button.textContent = blockedIndex(user) >= 0 ? '해제' : '차단';
    button.setAttribute('aria-label', `${user.nick} ${button.textContent}`);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const currentUser = getUser(author, container) || user;
      const index = blockedIndex(currentUser);
      if (index >= 0) removeBlockedUser(index);
      else addBlockedUser(currentUser);
    }, true);

    host.appendChild(button);
  }

  function processContainer(container, force = false) {
    if (!force && container.getAttribute(DONE_ATTRIBUTE) === '1') return;
    container.setAttribute(DONE_ATTRIBUTE, '1');

    const author = authorIn(container);
    const user = getUser(author, container);
    if (!author || !user) return;

    const isBlocked = blockedIndex(user) >= 0;
    container.classList.toggle(HIDDEN_CLASS, isBlocked);

    const host = buttonHost(author, container);
    host?.querySelector(`:scope > .${BLOCK_BUTTON_CLASS}`)?.remove();

    if (!isBlocked) addBlockButton(author, container, user);
  }

  function articleTargets() {
    const targets = [];

    document.querySelectorAll('.gallview-tit-box').forEach(container => {
      const author = container.querySelector('.ginfo2 > li:first-child');
      if (author) targets.push({ container, author });
    });

    document.querySelectorAll('.gallview_head').forEach(container => {
      const author = container.querySelector('.gall_writer');
      if (author) targets.push({ container, author });
    });

    return targets;
  }

  function processArticleTargets() {
    articleTargets().forEach(({ container, author }) => {
      const user = getUser(author, container);
      if (!user) return;

      const host = author;
      host.querySelector(`:scope > .${BLOCK_BUTTON_CLASS}`)?.remove();
      addBlockButton(author, container, user);
    });
  }

  function scan(force = false) {
    contentContainers().forEach(container => processContainer(container, force));
    processArticleTargets();

    document.querySelectorAll('.block-disable').forEach(element => {
      element.classList.add(HIDDEN_CLASS);
    });
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => scan(), 80);
  }

  function toast(message) {
    document.getElementById('dcub-toast')?.remove();
    const element = document.createElement('div');
    element.id = 'dcub-toast';
    element.textContent = message;
    document.body.appendChild(element);
    window.setTimeout(() => element.remove(), 1700);
  }

  function renderPanelList() {
    const list = document.querySelector('#dcub-panel .dcub-list');
    if (!list) return;

    if (!blockedUsers.length) {
      list.innerHTML = '<div class="dcub-empty">차단된 사용자가 없습니다.</div>';
      return;
    }

    list.innerHTML = blockedUsers.map((item, index) => `
      <div class="dcub-item">
        <div>
          <b>${escapeHTML(item.nick || item.value)}</b>
          <small>${escapeHTML(item.type.toUpperCase())}: ${escapeHTML(item.value)}</small>
        </div>
        <button type="button" data-index="${index}">해제</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-index]').forEach(button => {
      button.addEventListener('click', () => removeBlockedUser(Number(button.dataset.index)));
    });
  }

  function createUI() {
    if (document.getElementById('dcub-open')) return;

    const opener = document.createElement('button');
    opener.id = 'dcub-open';
    opener.type = 'button';
    opener.textContent = '차단';
    opener.title = '차단 목록 관리';

    const panel = document.createElement('div');
    panel.id = 'dcub-panel';
    panel.innerHTML = `
      <div class="dcub-box">
        <header>
          <b>디시 유저 차단</b>
          <button type="button" class="dcub-close" aria-label="닫기">×</button>
        </header>
        <div class="dcub-note">차단한 사용자의 게시글과 댓글은 흔적 없이 완전히 숨겨집니다.</div>
        <div class="dcub-list"></div>
        <footer><button type="button" class="dcub-clear">전체 해제</button></footer>
      </div>
    `;

    document.body.append(opener, panel);

    opener.addEventListener('click', () => {
      renderPanelList();
      panel.classList.add('open');
    });

    panel.querySelector('.dcub-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', event => {
      if (event.target === panel) panel.classList.remove('open');
    });

    panel.querySelector('.dcub-clear').addEventListener('click', () => {
      if (!blockedUsers.length || !confirm('차단 목록을 전부 삭제하시겠습니까?')) return;
      blockedUsers = [];
      save();
      scan(true);
      renderPanelList();
    });
  }

  function injectStyle() {
    if (document.getElementById('dcub-style')) return;

    const style = document.createElement('style');
    style.id = 'dcub-style';
    style.textContent = `
      .${HIDDEN_CLASS}, .block-disable { display: none !important; }

      .${BLOCK_BUTTON_CLASS} {
        all: unset !important;
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-left: 5px !important;
        padding: 0 5px !important;
        min-width: 30px !important;
        height: 18px !important;
        border: 1px solid #9ca1b2 !important;
        border-radius: 4px !important;
        background: #fff !important;
        color: #586080 !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        line-height: 18px !important;
        vertical-align: middle !important;
        cursor: pointer !important;
        white-space: nowrap !important;
        position: relative !important;
        z-index: 5 !important;
      }

      .gall-detail-lst > li .ginfo > li:nth-child(2),
      #view_next > li .ginfo > li:nth-child(2),
      .gallview-tit-box .ginfo2 > li:first-child {
        overflow: visible !important;
        white-space: nowrap !important;
      }

      .all-comment-lst > li[id^="comment_cnt_"] > .${BLOCK_BUTTON_CLASS} {
        float: right !important;
        margin: 0 0 4px 6px !important;
      }

      #dcub-open {
        position: fixed !important;
        right: 14px !important;
        bottom: 72px !important;
        z-index: 2147483645 !important;
        width: 44px !important;
        height: 44px !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: #3b4890 !important;
        color: #fff !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        box-shadow: 0 3px 12px rgba(0,0,0,.3) !important;
        cursor: pointer !important;
      }

      #dcub-panel {
        display: none;
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483646 !important;
        background: rgba(0,0,0,.52) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif !important;
      }

      #dcub-panel.open { display: block !important; }

      #dcub-panel .dcub-box {
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: min(92vw, 420px) !important;
        max-height: 82vh !important;
        overflow: hidden !important;
        border-radius: 12px !important;
        background: #fff !important;
        color: #222 !important;
        box-shadow: 0 12px 40px rgba(0,0,0,.4) !important;
      }

      #dcub-panel header,
      #dcub-panel footer {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 13px 15px !important;
        border-bottom: 1px solid #ddd !important;
      }

      #dcub-panel footer {
        justify-content: flex-end !important;
        border-top: 1px solid #ddd !important;
        border-bottom: 0 !important;
      }

      #dcub-panel .dcub-close {
        border: 0 !important;
        background: transparent !important;
        color: inherit !important;
        font-size: 24px !important;
        cursor: pointer !important;
      }

      #dcub-panel .dcub-note {
        padding: 10px 15px !important;
        border-bottom: 1px solid #eee !important;
        color: #777 !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
      }

      #dcub-panel .dcub-list {
        max-height: 52vh !important;
        overflow-y: auto !important;
        padding: 5px 15px !important;
      }

      #dcub-panel .dcub-item {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
        padding: 10px 0 !important;
        border-bottom: 1px solid #eee !important;
        font-size: 13px !important;
      }

      #dcub-panel .dcub-item small {
        display: block !important;
        margin-top: 2px !important;
        color: #888 !important;
      }

      #dcub-panel .dcub-item button,
      #dcub-panel .dcub-clear {
        padding: 5px 8px !important;
        border: 1px solid #aaa !important;
        border-radius: 5px !important;
        background: #fff !important;
        color: #444 !important;
        cursor: pointer !important;
      }

      #dcub-panel .dcub-empty {
        padding: 28px 0 !important;
        color: #888 !important;
        text-align: center !important;
      }

      #dcub-toast {
        position: fixed !important;
        left: 50% !important;
        bottom: 126px !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        padding: 9px 14px !important;
        border-radius: 8px !important;
        background: rgba(20,20,20,.92) !important;
        color: #fff !important;
        font-size: 13px !important;
        white-space: nowrap !important;
        pointer-events: none !important;
      }

      @media (prefers-color-scheme: dark) {
        .${BLOCK_BUTTON_CLASS} {
          background: #303238 !important;
          color: #d8d8df !important;
          border-color: #686b76 !important;
        }
        #dcub-panel .dcub-box { background: #252525 !important; color: #eee !important; }
        #dcub-panel header,
        #dcub-panel footer,
        #dcub-panel .dcub-note,
        #dcub-panel .dcub-item { border-color: #444 !important; }
        #dcub-panel .dcub-item button,
        #dcub-panel .dcub-clear { background: #333 !important; color: #eee !important; border-color: #666 !important; }
      }
    `;

    document.documentElement.appendChild(style);
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }

    injectStyle();
    createUI();
    scan(true);

    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1))) {
        scheduleScan();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(() => scan(), isMobile ? 1500 : 3000);

    console.info('[DCUB] v1.1.0 실행됨');
  }

  init();
})();
