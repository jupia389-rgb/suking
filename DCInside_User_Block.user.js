// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      3.0.0
// @description  디시인사이드 모바일용 최소 사용자 차단 (화면에 보이는 ID·IP·닉네임)
// @match        https://m.dcinside.com/*
// @run-at       document-end
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js
// @updateURL    https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.meta.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '3.0.0';
  const STORE = 'dcub_mobile_lite_blocks_v3';
  const HIDDEN = 'dcub-lite-hidden';
  const POSTS = ['.gall-detail-lst>li', '#view_next>li', 'li.ub-content'];
  const COMMENTS = [
    '.all-comment-lst>li[id^="comment_cnt_"]',
    '.comment-lst>li[id^="comment_"]',
    '.reply-lst>li[id^="comment_"]',
    '.cmt_list>li[id^="comment_"]',
    '.reply_list>li[id^="comment_"]'
  ];
  const ALL = [...POSTS, ...COMMENTS];
  const AUTHORS = [
    '.gall_writer', '[data-nick]', '[data-uid]', '[data-ip]',
    '.nickname', '.nick_name', '.comment-nick', '.user-nick', '.user_info', '.cmt_nickbox'
  ];

  let blocks = load();
  let picking = false;
  let timer = 0;

  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const lower = value => norm(value).toLocaleLowerCase();
  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORE, JSON.stringify(blocks));
  }

  function containers() {
    const result = new Set();
    ALL.forEach(selector => document.querySelectorAll(selector).forEach(node => result.add(node)));
    return [...result];
  }

  function attr(root, names) {
    if (!root) return '';
    const selector = names.map(name => `[${name}]`).join(',');
    const nodes = [root, ...(selector ? root.querySelectorAll(selector) : [])];
    for (const node of nodes) {
      for (const name of names) {
        const value = norm(node.getAttribute?.(name));
        if (value) return value;
      }
    }
    return '';
  }

  function gallogId(root) {
    if (!root) return '';
    const nodes = [root, ...root.querySelectorAll('a[href],[onclick]')];
    for (const node of nodes) {
      const source = `${node.getAttribute?.('href') || ''} ${node.getAttribute?.('onclick') || ''}`;
      const match = source.match(/gallog\.dcinside\.com\/([^/?#'" )]+)/i);
      if (match) {
        try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
      }
    }
    return '';
  }

  function extractIP(text, root) {
    const stored = attr(root, ['data-ip', 'data-user-ip', 'ip']);
    if (stored) return stored.replace(/[()[\]\s]/g, '');
    const match = String(text || '').match(/\(((?:(?:\d{1,3}|\*)\.){1,3}(?:\d{1,3}|\*))\)/);
    return match ? match[1] : '';
  }

  function author(container) {
    if (container.matches('.gall-detail-lst>li,#view_next>li')) {
      const node = container.querySelector(':scope>ul.ginfo>li:nth-child(2),ul.ginfo>li:nth-child(2)');
      if (node) return node;
    }
    for (const selector of AUTHORS) {
      const node = container.querySelector(selector);
      if (node && norm(node.textContent)) return node;
    }
    return null;
  }

  function userOf(container) {
    const node = author(container);
    if (!node) return null;

    const raw = norm(node.textContent);
    const uid = attr(container, ['data-uid', 'data-user-id', 'data-userid']) || gallogId(container);
    const ip = extractIP(raw, container);
    const nick = norm(attr(node, ['data-nick', 'data-name', 'data-user-name']) || raw)
      .replace(/^글쓴\s+/, '')
      .replace(/\(((?:(?:\d{1,3}|\*)\.){1,3}(?:\d{1,3}|\*))\)\s*$/, '')
      .replace(/\s*(차단|해제|글 선택|댓글 선택)\s*$/, '')
      .trim();

    return uid || ip || nick ? { uid, ip, nick } : null;
  }

  function matches(entry, user) {
    if (!entry || !user) return false;
    const value = lower(entry.value);
    if (entry.type === 'uid') return Boolean(user.uid) && value === lower(user.uid);
    if (entry.type === 'ip') return Boolean(user.ip) && value === lower(user.ip);
    return Boolean(user.nick) && value === lower(user.nick);
  }

  function scan() {
    for (const container of containers()) {
      const user = userOf(container);
      container.classList.toggle(HIDDEN, Boolean(user && blocks.some(entry => matches(entry, user))));
      picking ? addPick(container) : removePick(container);
    }
    document.querySelectorAll('.block-disable').forEach(node => node.classList.add(HIDDEN));
    mountGear();
  }

  function scheduleScan() {
    clearTimeout(timer);
    timer = setTimeout(scan, 100);
  }

  function entryFromUser(user) {
    if (!user) return { error: '작성자 정보를 찾지 못했습니다.' };
    if (user.uid) return {
      type: 'uid', value: user.uid,
      label: user.nick && user.nick !== user.uid ? `${user.nick} (@${user.uid})` : `@${user.uid}`
    };
    if (user.ip) return { type: 'ip', value: user.ip, label: `${user.nick || 'ㅇㅇ'}(${user.ip})` };
    if (user.nick === 'ㅇㅇ') return { error: '이 ㅇㅇ 사용자는 모바일 화면에 ID나 IP가 없어 정확히 구별할 수 없습니다.' };
    if (user.nick) return { type: 'nick', value: user.nick, label: user.nick };
    return { error: '차단할 수 있는 식별 정보를 찾지 못했습니다.' };
  }

  function parseInput(raw) {
    let value = norm(raw);
    if (!value) return null;
    const wrapped = value.match(/\(((?:(?:\d{1,3}|\*)\.){1,3}(?:\d{1,3}|\*))\)/);
    const plain = value.match(/^((?:(?:\d{1,3}|\*)\.){1,3}(?:\d{1,3}|\*))$/);
    if (wrapped || plain) {
      const ip = (wrapped || plain)[1];
      return { type: 'ip', value: ip, label: value };
    }
    if (value.startsWith('@')) {
      value = value.slice(1).trim();
      return value ? { type: 'uid', value, label: `@${value}` } : null;
    }
    if (value === 'ㅇㅇ') return { error: 'ㅇㅇ만으로는 여러 사용자를 구별할 수 없습니다. IP를 함께 입력해 주세요.' };
    return { type: 'nick', value, label: value };
  }

  function addBlock(entry) {
    if (!entry || entry.error) return false;
    if (blocks.some(item => item.type === entry.type && lower(item.value) === lower(entry.value))) {
      toast('이미 차단 목록에 있습니다.');
      return false;
    }
    blocks.unshift({ ...entry, createdAt: Date.now() });
    save();
    renderList();
    scan();
    toast(`${entry.label} 차단 완료`);
    return true;
  }

  function removeBlock(index) {
    if (!Number.isInteger(index) || index < 0 || index >= blocks.length) return;
    const removed = blocks.splice(index, 1)[0];
    save();
    renderList();
    scan();
    toast(`${removed.label || removed.value} 차단 해제`);
  }

  function addPick(container) {
    if (container.querySelector(':scope>.dcub-lite-pick')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dcub-lite-pick';
    button.textContent = container.matches(COMMENTS.join(',')) ? '댓글 선택' : '글 선택';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const entry = entryFromUser(userOf(container));
      if (entry.error) return alert(entry.error);
      const basis = entry.type === 'uid' ? 'ID' : entry.type === 'ip' ? 'IP' : '닉네임';
      if (!confirm(`${entry.label} 사용자를 차단하시겠습니까?\n\n차단 기준: ${basis}`)) return;
      addBlock(entry);
      setPicking(false);
    }, true);
    container.classList.add('dcub-lite-pick-host');
    container.appendChild(button);
  }

  function removePick(container) {
    container.querySelector(':scope>.dcub-lite-pick')?.remove();
    container.classList.remove('dcub-lite-pick-host');
  }

  function setPicking(value) {
    picking = Boolean(value);
    let bar = document.getElementById('dcub-lite-pick-bar');
    if (picking && !bar) {
      bar = document.createElement('div');
      bar.id = 'dcub-lite-pick-bar';
      bar.innerHTML = '<span>차단할 항목의 선택 버튼을 누르세요.</span><button type="button">취소</button>';
      bar.querySelector('button').addEventListener('click', () => setPicking(false));
      document.body.appendChild(bar);
    } else if (!picking) {
      bar?.remove();
    }
    scan();
  }

  function findFooter() {
    const direct = document.querySelector('footer,#footer,.footer,.footer_wrap,.footer-area,.footer_area,.m-footer,.m_footer');
    if (direct) return direct;
    for (const node of document.querySelectorAll('body>div,body>section')) {
      const text = lower(node.textContent);
      if (text.includes('copyright') && text.includes('dcinside')) return node;
    }
    return null;
  }

  function mountGear() {
    if (!document.body) return;
    let holder = document.getElementById('dcub-lite-settings');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'dcub-lite-settings';
      holder.innerHTML = '<button type="button" id="dcub-lite-open" aria-label="사용자 차단 설정" title="사용자 차단 설정">⚙</button>';
      holder.querySelector('button').addEventListener('click', openPanel);
    }
    const footer = findFooter();
    if (footer) {
      footer.classList.add('dcub-lite-footer-host');
      holder.classList.add('in-footer');
      if (holder.parentElement !== footer) footer.appendChild(holder);
    } else {
      holder.classList.remove('in-footer');
      if (holder.parentElement !== document.body) document.body.appendChild(holder);
    }
  }

  function createPanel() {
    if (document.getElementById('dcub-lite-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'dcub-lite-panel';
    panel.innerHTML = `
      <div class="dcub-lite-box">
        <header><div><b>모바일 사용자 차단</b><small>v${VERSION}</small></div><button class="dcub-lite-close" type="button">×</button></header>
        <section><button id="dcub-lite-start-pick" type="button"><b>화면에서 글·댓글 선택</b><small>작성자 이름 대신 별도의 선택 버튼을 누릅니다.</small></button></section>
        <section>
          <div class="dcub-lite-input-row"><input id="dcub-lite-input" type="text" placeholder="ㅇㅇ(211.245), 211.245, @아이디, 닉네임"><button id="dcub-lite-add" type="button">등록</button></div>
          <p>모바일 화면에 ID나 IP가 없는 반고닉 ㅇㅇ은 정확히 구별할 수 없습니다.</p>
        </section>
        <div class="dcub-lite-list"></div>
        <footer><button class="dcub-lite-clear" type="button">전체 해제</button></footer>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('.dcub-lite-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', event => { if (event.target === panel) panel.classList.remove('open'); });
    panel.querySelector('#dcub-lite-start-pick').addEventListener('click', () => {
      panel.classList.remove('open');
      setPicking(true);
    });

    const input = panel.querySelector('#dcub-lite-input');
    const submit = () => {
      const entry = parseInput(input.value);
      if (!entry) return;
      if (entry.error) return alert(entry.error);
      if (addBlock(entry)) input.value = '';
    };
    panel.querySelector('#dcub-lite-add').addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    panel.querySelector('.dcub-lite-clear').addEventListener('click', () => {
      if (!blocks.length || !confirm('차단 목록을 전부 삭제하시겠습니까?')) return;
      blocks = [];
      save();
      renderList();
      scan();
    });
  }

  function renderList() {
    const list = document.querySelector('#dcub-lite-panel .dcub-lite-list');
    if (!list) return;
    if (!blocks.length) {
      list.innerHTML = '<div class="dcub-lite-empty">차단된 사용자가 없습니다.</div>';
      return;
    }
    list.innerHTML = blocks.map((entry, index) => `
      <div class="dcub-lite-item"><div><b>${esc(entry.label || entry.value)}</b><small>${entry.type === 'uid' ? 'ID' : entry.type === 'ip' ? 'IP' : '닉네임'}</small></div><button type="button" data-index="${index}">해제</button></div>`).join('');
    list.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', () => removeBlock(Number(button.dataset.index))));
  }

  function openPanel() {
    setPicking(false);
    renderList();
    document.getElementById('dcub-lite-panel')?.classList.add('open');
  }

  function toast(message) {
    document.getElementById('dcub-lite-toast')?.remove();
    const node = document.createElement('div');
    node.id = 'dcub-lite-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1800);
  }

  function injectStyle() {
    if (document.getElementById('dcub-lite-style')) return;
    const style = document.createElement('style');
    style.id = 'dcub-lite-style';
    style.textContent = `
      .${HIDDEN},.block-disable{display:none!important}.dcub-lite-footer-host{position:relative!important}
      #dcub-lite-settings{position:fixed!important;right:14px!important;bottom:calc(18px + env(safe-area-inset-bottom))!important;z-index:2147483644!important}
      #dcub-lite-settings.in-footer{position:absolute!important;right:14px!important;bottom:14px!important}
      #dcub-lite-open{all:unset!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;width:38px!important;height:38px!important;border-radius:9px!important;background:#3b4890!important;color:#fff!important;box-shadow:0 3px 12px #0005!important;font-size:21px!important}
      #dcub-lite-panel{display:none!important;position:fixed!important;inset:0!important;z-index:2147483646!important;background:#0008!important;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif!important}
      #dcub-lite-panel.open{display:block!important}.dcub-lite-box{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:min(92vw,430px)!important;max-height:84vh!important;overflow:hidden!important;border-radius:12px!important;background:#fff!important;color:#222!important;box-shadow:0 12px 40px #0006!important}
      .dcub-lite-box header,.dcub-lite-box footer{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:13px 15px!important;border-bottom:1px solid #ddd!important}.dcub-lite-box footer{justify-content:flex-end!important;border-top:1px solid #ddd!important;border-bottom:0!important}.dcub-lite-box header small,.dcub-lite-item small,#dcub-lite-start-pick small{display:block!important;margin-top:3px!important;color:#888!important;font-size:11px!important;font-weight:400!important}.dcub-lite-close{border:0!important;background:transparent!important;color:inherit!important;font-size:25px!important}
      .dcub-lite-box section{padding:12px 15px!important;border-bottom:1px solid #eee!important}#dcub-lite-start-pick{width:100%!important;padding:11px 12px!important;border:1px solid #ccd!important;border-radius:8px!important;background:#f7f8fc!important;color:#30364f!important;text-align:left!important}.dcub-lite-input-row{display:flex!important;gap:6px!important}#dcub-lite-input{flex:1!important;min-width:0!important;height:39px!important;box-sizing:border-box!important;padding:8px 10px!important;border:1px solid #ccd!important;border-radius:6px!important;font-size:13px!important}#dcub-lite-add{width:54px!important;border:0!important;border-radius:6px!important;background:#3b4890!important;color:#fff!important;font-weight:700!important}.dcub-lite-box section p{margin:8px 1px 0!important;color:#858895!important;font-size:11px!important;line-height:1.45!important}
      .dcub-lite-list{max-height:38vh!important;overflow-y:auto!important;padding:5px 15px!important}.dcub-lite-item{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:10px 0!important;border-bottom:1px solid #eee!important;font-size:13px!important}.dcub-lite-item button,.dcub-lite-clear{padding:6px 9px!important;border:1px solid #aaa!important;border-radius:5px!important;background:#fff!important;color:#444!important}.dcub-lite-empty{padding:28px 0!important;color:#888!important;text-align:center!important}
      .dcub-lite-pick-host{position:relative!important}.dcub-lite-pick{position:absolute!important;top:50%!important;right:8px!important;transform:translateY(-50%)!important;z-index:2147483643!important;padding:7px 8px!important;border:0!important;border-radius:7px!important;background:#3b4890!important;color:#fff!important;font-size:11px!important;font-weight:700!important;box-shadow:0 2px 8px #0004!important}
      #dcub-lite-pick-bar{position:fixed!important;left:12px!important;right:12px!important;bottom:calc(16px + env(safe-area-inset-bottom))!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:10px 12px!important;border-radius:10px!important;background:#181a22f2!important;color:#fff!important;font-size:12px!important}#dcub-lite-pick-bar button{border:0!important;border-radius:6px!important;padding:6px 9px!important;background:#ffffff29!important;color:#fff!important}
      #dcub-lite-toast{position:fixed!important;left:50%!important;bottom:calc(72px + env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;z-index:2147483647!important;padding:9px 14px!important;border-radius:8px!important;background:#141414eb!important;color:#fff!important;font-size:13px!important;white-space:nowrap!important;pointer-events:none!important}
      @media(prefers-color-scheme:dark){.dcub-lite-box{background:#252525!important;color:#eee!important}.dcub-lite-box header,.dcub-lite-box footer,.dcub-lite-box section,.dcub-lite-item{border-color:#444!important}#dcub-lite-start-pick,#dcub-lite-input{background:#303138!important;color:#eee!important;border-color:#565a68!important}.dcub-lite-item button,.dcub-lite-clear{background:#333!important;color:#eee!important;border-color:#666!important}}
    `;
    document.documentElement.appendChild(style);
  }

  function init() {
    if (!document.body) return document.addEventListener('DOMContentLoaded', init, { once: true });
    injectStyle();
    createPanel();
    mountGear();
    scan();
    new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1))) scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(scan, 3000);
    console.info(`[DCUB Mobile Lite] v${VERSION} 실행됨`);
  }

  init();
})();
