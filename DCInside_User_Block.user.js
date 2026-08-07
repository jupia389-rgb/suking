// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      1.4.0
// @description  디시인사이드 모바일/PC 사용자 차단 (화면에서 작성자 선택, 사이트 푸터 설정 버튼)
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

  const CONTAINER_SELECTORS = [
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

  const AUTHOR_SELECTORS = [
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

  let blockedUsers = load(STORE_KEY, []);
  let scanTimer = 0;
  let selectionMode = false;
  let selectionTimeout = 0;

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
      try {
        return decodeURIComponent(match[1]);
      } catch (_) {
        return match[1];
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
    return { uid, ip, nick: nick || uid || ip };
  }

  function blockLabel(item) {
    return normalize(item.label || item.nick || item.value);
  }

  function sameBlockValue(a, b) {
    return a.type === b.type && compareKey(a.value) === compareKey(b.value);
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

  function selectedUserEntry(user) {
    if (user.uid) {
      return {
        type: 'uid',
        value: user.uid,
        label: user.nick && user.nick !== user.uid ? `${user.nick} (@${user.uid})` : `@${user.uid}`
      };
    }

    if (user.ip) {
      return {
        type: 'ip',
        value: user.ip,
        label: `${user.nick || 'ㅇㅇ'}(${user.ip})`
      };
    }

    if (user.nick === 'ㅇㅇ') {
      return { error: '이 작성자는 화면에서 ID나 IP를 찾지 못해 다른 ㅇㅇ과 구별할 수 없습니다.' };
    }

    if (user.nick) {
      return {
        type: 'nick',
        value: user.nick,
        label: user.nick
      };
    }

    return { error: '작성자 식별 정보를 찾지 못했습니다.' };
  }

  function parseEntry(raw, selectedType) {
    let value = normalize(raw);
    if (!value) return null;

    const wrappedIP = value.match(/\(((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))\)/);
    const plainIP = value.match(/^((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))$/);

    if (selectedType === 'ip') {
      const match = wrappedIP || plainIP;
      if (!match) return { error: '유동 IP는 ㅇㅇ(211.245) 또는 211.245처럼 입력해 주세요.' };
      return { type: 'ip', value: match[1], label: value };
    }

    if (selectedType === 'uid') {
      value = value.replace(/^@/, '').trim();
      return value ? { type: 'uid', value, label: `@${value}` } : null;
    }

    if (selectedType === 'nick') {
      if (value === 'ㅇㅇ') {
        return { error: 'ㅇㅇ은 여러 유동 사용자가 함께 쓰므로 화면에서 선택하거나 유동 IP로 등록해 주세요.' };
      }
      return { type: 'nick', value, label: value };
    }

    if (wrappedIP || plainIP) {
      const ip = (wrappedIP || plainIP)[1];
      return { type: 'ip', value: ip, label: value };
    }

    if (value.startsWith('@')) {
      value = value.slice(1).trim();
      return value ? { type: 'uid', value, label: `@${value}` } : null;
    }

    if (value === 'ㅇㅇ') {
      return { error: 'ㅇㅇ만 입력하면 사용자를 구별할 수 없습니다. 화면에서 선택 기능을 사용해 주세요.' };
    }

    return { type: 'any', value, label: value };
  }

  function addEntry(entry, toastMessage = true) {
    if (!entry || entry.error) return false;
    if (blockedUsers.some(item => sameBlockValue(item, entry))) {
      if (toastMessage) toast('이미 차단 목록에 있습니다.');
      return false;
    }

    blockedUsers.unshift({ ...entry, createdAt: Date.now() });
    save();
    scan(true);
    renderPanelList();
    if (toastMessage) toast(`${entry.label || entry.value} 차단 완료`);
    return true;
  }

  function addEntries(rawText, selectedType) {
    const values = String(rawText || '')
      .split(/[\n,]+/)
      .map(value => value.trim())
      .filter(Boolean);

    let added = 0;
    const errors = [];

    for (const value of values) {
      const entry = parseEntry(value, selectedType);
      if (!entry) continue;
      if (entry.error) {
        errors.push(entry.error);
        continue;
      }
      if (blockedUsers.some(item => sameBlockValue(item, entry))) continue;
      blockedUsers.unshift({ ...entry, createdAt: Date.now() });
      added += 1;
    }

    if (added) {
      save();
      scan(true);
      renderPanelList();
      toast(`${added}개 항목을 차단 목록에 추가했습니다.`);
    }

    if (errors.length) alert([...new Set(errors)].join('\n'));
    return added > 0;
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
    const result = new Set();
    CONTAINER_SELECTORS.forEach(selector => {
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

    for (const selector of AUTHOR_SELECTORS) {
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
    mountFooterGear();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => scan(), 100);
  }

  function toast(message, duration = 1800) {
    document.getElementById('dcub-toast')?.remove();
    const element = document.createElement('div');
    element.id = 'dcub-toast';
    element.textContent = message;
    document.body.appendChild(element);
    window.setTimeout(() => element.remove(), duration);
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

  function createPanel() {
    if (document.getElementById('dcub-panel')) return;

    document.getElementById('dcub-bottom-settings')?.remove();

    const panel = document.createElement('div');
    panel.id = 'dcub-panel';
    panel.innerHTML = `
      <div class="dcub-box">
        <header>
          <b>유저 차단 설정</b>
          <button type="button" class="dcub-close" aria-label="닫기">×</button>
        </header>

        <div class="dcub-pick-section">
          <button type="button" id="dcub-pick-user">
            <span class="dcub-pick-icon">◎</span>
            <span><b>화면에서 사용자 선택</b><small>글 목록이나 댓글의 작성자 이름을 직접 누릅니다.</small></span>
          </button>
        </div>

        <div class="dcub-entry">
          <div class="dcub-entry-row">
            <select id="dcub-type" aria-label="차단 기준">
              <option value="auto">자동 판별</option>
              <option value="ip">유동 IP</option>
              <option value="uid">고닉 ID</option>
              <option value="nick">닉네임</option>
            </select>
            <input id="dcub-input" type="text" autocomplete="off" autocapitalize="none" placeholder="ㅇㅇ(211.245) 또는 @고닉ID">
            <button type="button" id="dcub-add">등록</button>
          </div>
          <p id="dcub-help"><b>모바일에서는 위의 ‘화면에서 사용자 선택’이 가장 쉽습니다.</b> 작성자를 누르면 ID 또는 IP를 자동으로 찾습니다.</p>
        </div>

        <div class="dcub-list"></div>
        <footer><button type="button" class="dcub-clear">전체 해제</button></footer>
      </div>`;

    document.body.appendChild(panel);

    const input = panel.querySelector('#dcub-input');
    const type = panel.querySelector('#dcub-type');
    const help = panel.querySelector('#dcub-help');

    const hints = {
      auto: ['ㅇㅇ(211.245) 또는 @고닉ID', '<b>모바일에서는 ‘화면에서 사용자 선택’이 가장 쉽습니다.</b> 작성자를 누르면 ID 또는 IP를 자동으로 찾습니다.'],
      ip: ['211.245 또는 ㅇㅇ(211.245)', '화면에 표시된 유동 IP를 입력합니다. 같은 표시 IP 사용자가 함께 차단될 수 있습니다.'],
      uid: ['고닉의 갤로그 ID', '직접 알기 어려우면 ‘화면에서 사용자 선택’을 사용해 주세요.'],
      nick: ['차단할 닉네임', '닉네임 차단은 같은 이름을 쓰는 다른 사용자도 함께 숨길 수 있습니다.']
    };

    type.addEventListener('change', () => {
      input.placeholder = hints[type.value][0];
      help.innerHTML = hints[type.value][1];
    });

    panel.querySelector('.dcub-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', event => {
      if (event.target === panel) panel.classList.remove('open');
    });

    panel.querySelector('#dcub-pick-user').addEventListener('click', () => {
      panel.classList.remove('open');
      beginSelectionMode();
    });

    const submit = () => {
      if (addEntries(input.value, type.value)) input.value = '';
      input.focus();
    };

    panel.querySelector('#dcub-add').addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });

    panel.querySelector('.dcub-clear').addEventListener('click', () => {
      if (!blockedUsers.length || !confirm('차단 목록을 전부 삭제하시겠습니까?')) return;
      blockedUsers = [];
      save();
      scan(true);
      renderPanelList();
    });
  }

  function footerScore(element) {
    if (!element || element.closest('#dcub-panel')) return -100;
    if (element.closest('article, .gallview, .gallview_contents, .view_content, .view_content_wrap, .movie, .video')) return -100;

    const value = normalize(element.textContent).toLocaleLowerCase();
    let score = 0;
    if (value.includes('copyright')) score += 8;
    if (value.includes('개인정보처리방침')) score += 5;
    if (value.includes('회사소개')) score += 3;
    if (value.includes('dcinside.com')) score += 3;
    if (value.includes('이용약관')) score += 2;
    if (element.id?.toLocaleLowerCase().includes('footer')) score += 3;
    if (String(element.className).toLocaleLowerCase().includes('footer')) score += 2;
    return score;
  }

  function findSiteFooter() {
    const selectors = [
      '#footer', '.footer', '.footer_wrap', '.footer-area', '.footer_area',
      '.m-footer', '.m_footer', '.dc-footer', 'body > footer'
    ];

    const candidates = new Set();
    selectors.forEach(selector => document.querySelectorAll(selector).forEach(element => candidates.add(element)));

    document.querySelectorAll('body > div, body > section').forEach(element => {
      const value = normalize(element.textContent);
      if (/Copyright/i.test(value) && /dcinside/i.test(value)) candidates.add(element);
    });

    return [...candidates]
      .map(element => ({ element, score: footerScore(element) }))
      .filter(item => item.score >= 8)
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  }

  function openPanel() {
    const panel = document.getElementById('dcub-panel');
    if (!panel) return;
    cancelSelectionMode(false);
    renderPanelList();
    panel.classList.add('open');
  }

  function mountFooterGear() {
    const existing = document.getElementById('dcub-footer-settings');
    const footer = findSiteFooter();

    if (!footer) {
      existing?.remove();
      return false;
    }

    if (existing && existing.parentElement === footer) return true;
    existing?.remove();

    footer.classList.add('dcub-site-footer');

    const holder = document.createElement('div');
    holder.id = 'dcub-footer-settings';
    holder.innerHTML = `
      <button type="button" id="dcub-open" aria-label="유저 차단 설정" title="유저 차단 설정">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">
          <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.48.48 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 13.93 2h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.73 8.47a.48.48 0 0 0 .12.61l2.03 1.58c-.04.3-.06.62-.06.94s.02.64.06.94l-2.03 1.58a.48.48 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
        </svg>
      </button>`;

    holder.querySelector('#dcub-open').addEventListener('click', openPanel);
    footer.appendChild(holder);
    return true;
  }

  function selectionBar() {
    let bar = document.getElementById('dcub-selection-bar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'dcub-selection-bar';
    bar.innerHTML = '<span>차단할 작성자 이름을 눌러주세요.</span><button type="button">취소</button>';
    bar.querySelector('button').addEventListener('click', () => cancelSelectionMode());
    document.body.appendChild(bar);
    return bar;
  }

  function beginSelectionMode() {
    selectionMode = true;
    document.documentElement.classList.add('dcub-selecting');
    selectionBar();
    clearTimeout(selectionTimeout);
    selectionTimeout = window.setTimeout(() => cancelSelectionMode(), 30000);
  }

  function cancelSelectionMode(showMessage = true) {
    if (!selectionMode && !document.getElementById('dcub-selection-bar')) return;
    selectionMode = false;
    clearTimeout(selectionTimeout);
    document.documentElement.classList.remove('dcub-selecting');
    document.getElementById('dcub-selection-bar')?.remove();
    if (showMessage) toast('사용자 선택을 취소했습니다.');
  }

  function articleAuthorFromTarget(target) {
    const articleHeader = target.closest('.gallview-tit-box, .gallview_head');
    if (!articleHeader) return null;

    const author = articleHeader.querySelector('.ginfo2 > li:first-child, .gall_writer, [data-nick], [data-uid], [data-ip]');
    return author ? { author, container: articleHeader } : null;
  }

  function selectionTarget(target) {
    const container = target.closest(CONTAINER_SELECTORS.join(','));
    if (container) {
      const author = authorIn(container);
      if (author && (author === target || author.contains(target))) return { author, container };
    }

    const article = articleAuthorFromTarget(target);
    if (article && (article.author === target || article.author.contains(target))) return article;

    for (const selector of AUTHOR_SELECTORS) {
      const author = target.closest(selector);
      if (!author) continue;
      const parentContainer = author.closest(CONTAINER_SELECTORS.join(',')) || author.closest('.gallview-tit-box, .gallview_head') || author;
      return { author, container: parentContainer };
    }

    return null;
  }

  function handleSelectionTap(event) {
    if (!selectionMode) return;
    if (event.target.closest('#dcub-selection-bar, #dcub-panel, #dcub-footer-settings')) return;

    const selected = selectionTarget(event.target);
    if (!selected) {
      toast('글 제목이 아니라 작성자 이름을 눌러주세요.');
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const user = getUser(selected.author, selected.container);
    const entry = selectedUserEntry(user || {});

    if (entry.error) {
      alert(entry.error);
      cancelSelectionMode(false);
      return;
    }

    const basis = entry.type === 'uid' ? '고닉 ID' : entry.type === 'ip' ? '유동 IP' : '닉네임';
    if (!confirm(`${entry.label} 사용자를 차단하시겠습니까?\n\n차단 기준: ${basis}`)) {
      cancelSelectionMode(false);
      return;
    }

    addEntry(entry);
    cancelSelectionMode(false);
  }

  function injectStyle() {
    if (document.getElementById('dcub-style')) return;

    const style = document.createElement('style');
    style.id = 'dcub-style';
    style.textContent = `
      .${HIDDEN_CLASS}, .block-disable { display: none !important; }

      .dcub-site-footer { position: relative !important; }
      #dcub-footer-settings {
        position: absolute !important;
        right: 16px !important;
        bottom: 72px !important;
        z-index: 5 !important;
      }
      #dcub-open {
        all: unset !important;
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 36px !important;
        height: 36px !important;
        border-radius: 8px !important;
        color: rgba(255,255,255,.72) !important;
        background: rgba(255,255,255,.08) !important;
        cursor: pointer !important;
      }
      #dcub-open:active { background: rgba(255,255,255,.18) !important; color: #fff !important; }

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
        width: min(92vw, 430px) !important;
        max-height: 84vh !important;
        overflow: hidden !important;
        border-radius: 12px !important;
        background: #fff !important;
        color: #222 !important;
        box-shadow: 0 12px 40px rgba(0,0,0,.4) !important;
      }
      #dcub-panel header, #dcub-panel footer {
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
        line-height: 1 !important;
        cursor: pointer !important;
      }

      #dcub-panel .dcub-pick-section {
        padding: 12px 15px !important;
        border-bottom: 1px solid #eee !important;
      }
      #dcub-panel #dcub-pick-user {
        width: 100% !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        box-sizing: border-box !important;
        padding: 11px 12px !important;
        border: 1px solid #c9ccda !important;
        border-radius: 8px !important;
        background: #f7f8fc !important;
        color: #30364f !important;
        text-align: left !important;
        cursor: pointer !important;
      }
      #dcub-panel .dcub-pick-icon { font-size: 22px !important; color: #3b4890 !important; }
      #dcub-panel #dcub-pick-user small {
        display: block !important;
        margin-top: 3px !important;
        color: #7c8192 !important;
        font-size: 11px !important;
        font-weight: 400 !important;
      }

      #dcub-panel .dcub-entry {
        padding: 13px 15px 10px !important;
        border-bottom: 1px solid #eee !important;
      }
      #dcub-panel .dcub-entry-row { display: flex !important; gap: 6px !important; }
      #dcub-panel #dcub-type {
        flex: 0 0 92px !important;
        height: 38px !important;
        box-sizing: border-box !important;
        border: 1px solid #cfd1da !important;
        border-radius: 6px !important;
        background: #fff !important;
        color: #333 !important;
        font-size: 12px !important;
      }
      #dcub-panel #dcub-input {
        flex: 1 !important;
        min-width: 0 !important;
        height: 38px !important;
        box-sizing: border-box !important;
        padding: 8px 10px !important;
        border: 1px solid #cfd1da !important;
        border-radius: 6px !important;
        background: #fff !important;
        color: #222 !important;
        font-size: 14px !important;
        outline: none !important;
      }
      #dcub-panel #dcub-input:focus { border-color: #3b4890 !important; }
      #dcub-panel #dcub-add {
        flex: 0 0 52px !important;
        height: 38px !important;
        border: 0 !important;
        border-radius: 6px !important;
        background: #3b4890 !important;
        color: #fff !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }
      #dcub-panel .dcub-entry p {
        margin: 8px 1px 0 !important;
        color: #858895 !important;
        font-size: 11px !important;
        line-height: 1.45 !important;
      }
      #dcub-panel .dcub-list {
        max-height: 40vh !important;
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
        font-size: 11px !important;
      }
      #dcub-panel .dcub-item button, #dcub-panel .dcub-clear {
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

      #dcub-selection-bar {
        position: fixed !important;
        left: 50% !important;
        bottom: calc(18px + env(safe-area-inset-bottom)) !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        max-width: calc(100vw - 24px) !important;
        box-sizing: border-box !important;
        padding: 9px 10px 9px 14px !important;
        border-radius: 10px !important;
        background: rgba(25,27,34,.94) !important;
        color: #fff !important;
        box-shadow: 0 6px 24px rgba(0,0,0,.28) !important;
        font-size: 12px !important;
        white-space: nowrap !important;
      }
      #dcub-selection-bar button {
        border: 0 !important;
        border-radius: 6px !important;
        padding: 5px 8px !important;
        background: rgba(255,255,255,.16) !important;
        color: #fff !important;
        cursor: pointer !important;
      }
      .dcub-selecting .gall-detail-lst > li .ginfo > li:nth-child(2),
      .dcub-selecting #view_next > li .ginfo > li:nth-child(2),
      .dcub-selecting .gall_writer,
      .dcub-selecting .nickname,
      .dcub-selecting .nick_name,
      .dcub-selecting [data-nick],
      .dcub-selecting [data-uid],
      .dcub-selecting [data-ip] {
        outline: 1px dashed rgba(59,72,144,.42) !important;
        outline-offset: 2px !important;
      }

      #dcub-toast {
        position: fixed !important;
        left: 50% !important;
        bottom: calc(72px + env(safe-area-inset-bottom)) !important;
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
        #dcub-panel .dcub-box { background: #252525 !important; color: #eee !important; }
        #dcub-panel header,
        #dcub-panel footer,
        #dcub-panel .dcub-pick-section,
        #dcub-panel .dcub-entry,
        #dcub-panel .dcub-item { border-color: #444 !important; }
        #dcub-panel #dcub-pick-user { background: #303138 !important; color: #eee !important; border-color: #565a68 !important; }
        #dcub-panel #dcub-type,
        #dcub-panel #dcub-input { background: #303030 !important; color: #eee !important; border-color: #5b5d65 !important; }
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
    createPanel();
    mountFooterGear();
    scan(true);

    document.addEventListener('click', handleSelectionTap, true);

    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1))) {
        scheduleScan();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(() => scan(), isMobile ? 1500 : 3000);

    console.info('[DCUB] v1.4.0 실행됨');
  }

  init();
})();
