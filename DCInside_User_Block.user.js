// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      1.2.0
// @description  디시인사이드 모바일/PC 사용자 수동 차단 (페이지 하단 설정 버튼, 차단 항목 완전 숨김)
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
      return Array.isArray(parsed) ? parsed : fallback;
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
  const compareKey = value => normalize(value).toLocaleLowerCase();

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function firstAttribute(root, names) {
    if (!root) return '';
    const nodes = [root];
    if (root.querySelectorAll) {
      const selector = names.map(name => `[${name}]`).join(',');
      if (selector) root.querySelectorAll(selector).forEach(node => nodes.push(node));
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
      if (!match) continue;
      try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
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
    return { uid, ip, nick: nick || uid || ip };
  }

  function blockLabel(item) {
    return normalize(item.label || item.nick || item.value);
  }

  function sameBlockValue(a, b) {
    return compareKey(blockLabel(a)) === compareKey(blockLabel(b));
  }

  function matchesBlock(item, user) {
    if (!item || !user) return false;
    const savedValue = compareKey(item.value || item.label || item.nick);
    if (!savedValue) return false;
    if (item.type === 'uid') return Boolean(user.uid) && savedValue === compareKey(user.uid);
    if (item.type === 'ip') return Boolean(user.ip) && savedValue === compareKey(user.ip);
    if (item.type === 'nick') return Boolean(user.nick) && savedValue === compareKey(user.nick);
    return [user.uid, user.ip, user.nick].some(value => value && savedValue === compareKey(value));
  }

  const isBlocked = user => blockedUsers.some(item => matchesBlock(item, user));

  function parseEntry(raw) {
    let value = normalize(raw);
    if (!value) return null;
    const wrappedIP = value.match(/\(((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))\)/);
    const plainIP = value.match(/^((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))$/);
    if (wrappedIP || plainIP) {
      const ip = (wrappedIP || plainIP)[1];
      return { type: 'ip', value: ip, label: value };
    }
    value = value.replace(/^@/, '').trim();
    return { type: 'any', value, label: value };
  }

  function addEntries(rawText) {
    const values = String(rawText || '')
      .split(/[\n,]+/)
      .map(value => value.trim())
      .filter(Boolean);
    let added = 0;
    for (const value of values) {
      const entry = parseEntry(value);
      if (!entry || blockedUsers.some(item => sameBlockValue(item, entry))) continue;
      blockedUsers.unshift({ ...entry, createdAt: Date.now() });
      added += 1;
    }
    if (!added) return false;
    save();
    scan(true);
    renderPanelList();
    toast(`${added}개 항목을 차단 목록에 추가했습니다.`);
    return true;
  }

  function removeBlockedUser(index) {
    if (!Number.isInteger(index) || index < 0 || index >= blockedUsers.length) return;
    const removed = blockedUsers.splice(index, 1)[0];
    save();
    scan(true);
    renderPanelList();
    toast(`${blockLabel(removed)} 차단 해제`);
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
    selectors.forEach(selector => document.querySelectorAll(selector).forEach(element => result.add(element)));
    return [...result];
  }

  function mobileListAuthor(container) {
    if (!container.matches('.gall-detail-lst > li, #view_next > li')) return null;
    return container.querySelector(':scope > ul.ginfo > li:nth-child(2)')
      || container.querySelector('ul.ginfo > li:nth-child(2)');
  }

  function commentTextAuthor(container) {
    if (!container.matches('.all-comment-lst > li[id^="comment_cnt_"]')) return null;
    const lines = String(container.innerText || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
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
      '.gall_writer[data-nick]', '.gall_writer[data-uid]', '.gall_writer[data-ip]',
      '.cmt_nickbox .gall_writer', '.cmt_nickbox .nickname', '.cmt_nickbox .nick_name',
      '[data-nick]', '[data-uid]', '[data-ip]', '.gall_writer', '.nickname', '.nick_name',
      '.comment-nick', '.user-nick', '.user_info'
    ];
    for (const selector of selectors) {
      const found = container.querySelector(selector);
      if (found && normalize(found.textContent)) return found;
    }
    return commentTextAuthor(container);
  }

  function processContainer(container, force = false) {
    if (!force && container.getAttribute(DONE_ATTRIBUTE) === '1') return;
    container.setAttribute(DONE_ATTRIBUTE, '1');
    const author = authorIn(container);
    const user = getUser(author, container);
    if (!author || !user) return;
    container.classList.toggle(HIDDEN_CLASS, isBlocked(user));
  }

  function scan(force = false) {
    contentContainers().forEach(container => processContainer(container, force));
    document.querySelectorAll('.block-disable').forEach(element => element.classList.add(HIDDEN_CLASS));
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => scan(), 100);
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
          <b>${escapeHTML(blockLabel(item))}</b>
          <small>${item.type === 'ip' ? '유동 IP' : item.type === 'uid' ? '고닉 ID' : item.type === 'nick' ? '닉네임' : 'ID · 닉네임 자동 판별'}</small>
        </div>
        <button type="button" data-index="${index}">해제</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-index]').forEach(button => {
      button.addEventListener('click', () => removeBlockedUser(Number(button.dataset.index)));
    });
  }

  function createUI() {
    if (document.getElementById('dcub-bottom-settings')) return;
    const bottom = document.createElement('div');
    bottom.id = 'dcub-bottom-settings';
    bottom.innerHTML = `
      <button type="button" id="dcub-open" aria-label="유저 차단 설정" title="유저 차단 설정">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.48.48 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 13.93 2h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.73 8.47a.48.48 0 0 0 .12.61l2.03 1.58c-.04.3-.06.62-.06.94s.02.64.06.94l-2.03 1.58a.48.48 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
        </svg>
      </button>`;

    const panel = document.createElement('div');
    panel.id = 'dcub-panel';
    panel.innerHTML = `
      <div class="dcub-box">
        <header><b>유저 차단 설정</b><button type="button" class="dcub-close" aria-label="닫기">×</button></header>
        <div class="dcub-entry">
          <div class="dcub-entry-row">
            <input id="dcub-input" type="text" autocomplete="off" autocapitalize="none" placeholder="고닉 ID, 닉네임 또는 IP 입력">
            <button type="button" id="dcub-add">등록</button>
          </div>
          <p>여러 개는 쉼표 또는 줄바꿈으로 입력할 수 있습니다. 예: <b>example_id</b>, <b>ㅇㅇ(211.245)</b></p>
        </div>
        <div class="dcub-list"></div>
        <footer><button type="button" class="dcub-clear">전체 해제</button></footer>
      </div>`;

    document.body.append(bottom, panel);
    const input = panel.querySelector('#dcub-input');
    bottom.querySelector('#dcub-open').addEventListener('click', () => {
      renderPanelList();
      panel.classList.add('open');
      window.setTimeout(() => input.focus(), 50);
    });
    panel.querySelector('.dcub-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', event => { if (event.target === panel) panel.classList.remove('open'); });

    const submit = () => {
      if (addEntries(input.value)) input.value = '';
      input.focus();
    };
    panel.querySelector('#dcub-add').addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
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
      #dcub-bottom-settings { position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;width:100%!important;min-height:44px!important;margin:18px 0 8px!important;padding:4px 0!important;clear:both!important;z-index:1!important; }
      #dcub-open { all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:34px!important;height:34px!important;border-radius:50%!important;color:#8b8f9f!important;background:transparent!important;cursor:pointer!important;opacity:.72!important; }
      #dcub-open:active { background:rgba(59,72,144,.1)!important;opacity:1!important; }
      #dcub-panel { display:none;position:fixed!important;inset:0!important;z-index:2147483646!important;background:rgba(0,0,0,.52)!important;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif!important; }
      #dcub-panel.open { display:block!important; }
      #dcub-panel .dcub-box { position:absolute!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:min(92vw,420px)!important;max-height:82vh!important;overflow:hidden!important;border-radius:12px!important;background:#fff!important;color:#222!important;box-shadow:0 12px 40px rgba(0,0,0,.4)!important; }
      #dcub-panel header,#dcub-panel footer { display:flex!important;align-items:center!important;justify-content:space-between!important;padding:13px 15px!important;border-bottom:1px solid #ddd!important; }
      #dcub-panel footer { justify-content:flex-end!important;border-top:1px solid #ddd!important;border-bottom:0!important; }
      #dcub-panel .dcub-close { border:0!important;background:transparent!important;color:inherit!important;font-size:24px!important;line-height:1!important;cursor:pointer!important; }
      #dcub-panel .dcub-entry { padding:13px 15px 10px!important;border-bottom:1px solid #eee!important; }
      #dcub-panel .dcub-entry-row { display:flex!important;gap:6px!important; }
      #dcub-panel #dcub-input { flex:1!important;min-width:0!important;height:38px!important;box-sizing:border-box!important;padding:8px 10px!important;border:1px solid #cfd1da!important;border-radius:6px!important;background:#fff!important;color:#222!important;font-size:14px!important;outline:none!important; }
      #dcub-panel #dcub-input:focus { border-color:#3b4890!important; }
      #dcub-panel #dcub-add { flex:0 0 56px!important;height:38px!important;border:0!important;border-radius:6px!important;background:#3b4890!important;color:#fff!important;font-size:13px!important;font-weight:700!important;cursor:pointer!important; }
      #dcub-panel .dcub-entry p { margin:8px 1px 0!important;color:#858895!important;font-size:11px!important;line-height:1.45!important; }
      #dcub-panel .dcub-list { max-height:48vh!important;overflow-y:auto!important;padding:5px 15px!important; }
      #dcub-panel .dcub-item { display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:10px 0!important;border-bottom:1px solid #eee!important;font-size:13px!important; }
      #dcub-panel .dcub-item small { display:block!important;margin-top:2px!important;color:#888!important;font-size:11px!important; }
      #dcub-panel .dcub-item button,#dcub-panel .dcub-clear { padding:5px 8px!important;border:1px solid #aaa!important;border-radius:5px!important;background:#fff!important;color:#444!important;cursor:pointer!important; }
      #dcub-panel .dcub-empty { padding:28px 0!important;color:#888!important;text-align:center!important; }
      #dcub-toast { position:fixed!important;left:50%!important;bottom:28px!important;transform:translateX(-50%)!important;z-index:2147483647!important;padding:9px 14px!important;border-radius:8px!important;background:rgba(20,20,20,.92)!important;color:#fff!important;font-size:13px!important;white-space:nowrap!important;pointer-events:none!important; }
      @media(prefers-color-scheme:dark){#dcub-open{color:#aaaeba!important}#dcub-panel .dcub-box{background:#252525!important;color:#eee!important}#dcub-panel header,#dcub-panel footer,#dcub-panel .dcub-entry,#dcub-panel .dcub-item{border-color:#444!important}#dcub-panel #dcub-input{background:#303030!important;color:#eee!important;border-color:#5b5d65!important}#dcub-panel .dcub-item button,#dcub-panel .dcub-clear{background:#333!important;color:#eee!important;border-color:#666!important}}
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
      if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1))) scheduleScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(() => scan(), isMobile ? 1500 : 3000);
    console.info('[DCUB] v1.2.0 실행됨');
  }

  init();
})();
