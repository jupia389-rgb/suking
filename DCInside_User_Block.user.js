// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      1.0.1
// @description  디시인사이드 게시글·댓글 작성자 차단 및 차단 목록 관리
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

  const KEY = 'dcub_users_v1';
  const OPT_KEY = 'dcub_options_v1';
  const BLOCK_BTN = 'dcub-user-btn';
  const HIDDEN = 'dcub-hidden';

  const read = (key, fallback) => {
    try {
      const raw = typeof GM_getValue === 'function'
        ? GM_getValue(key, '')
        : localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const write = (key, value) => {
    const raw = JSON.stringify(value);
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, raw);
      else localStorage.setItem(key, raw);
    } catch (_) {}
  };

  let blocked = read(KEY, []);
  let options = Object.assign({ mode: 'hide' }, read(OPT_KEY, {}));
  let scanTimer = 0;

  const text = value => String(value || '').replace(/\s+/g, ' ').trim();
  const html = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  function getUser(author) {
    if (!author) return null;

    const d = author.dataset || {};
    const raw = text(author.textContent);
    const nick = text(d.nick || author.getAttribute('data-nick') || raw.replace(/\([\d.*:]+\)/g, ''));
    const ip = text(d.ip || author.getAttribute('data-ip') || '').replace(/[()]/g, '');
    let uid = text(d.uid || d.userId || author.getAttribute('data-uid') || author.getAttribute('data-user-id'));

    if (!uid) {
      const source = `${author.getAttribute('href') || ''} ${author.getAttribute('onclick') || ''}`;
      const match = source.match(/gallog\.dcinside\.com\/([^/?'" )]+)/i);
      if (match) uid = decodeURIComponent(match[1]);
    }

    if (!nick && !ip && !uid) return null;
    return {
      type: uid ? 'uid' : ip ? 'ip' : 'nick',
      value: uid || ip || nick,
      uid,
      ip,
      nick: nick || uid || ip
    };
  }

  function matches(item, user) {
    return item.type === 'uid' ? !!user.uid && item.value === user.uid
      : item.type === 'ip' ? !!user.ip && item.value === user.ip
      : !!user.nick && item.value === user.nick;
  }

  const findIndex = user => blocked.findIndex(item => matches(item, user));

  function save() {
    write(KEY, blocked);
  }

  function toast(message) {
    document.getElementById('dcub-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'dcub-toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  function addUser(user) {
    if (!user || findIndex(user) >= 0) return;
    blocked.unshift({
      type: user.type,
      value: user.value,
      nick: user.nick,
      time: Date.now()
    });
    save();
    scan(true);
    toast(`${user.nick} 차단 완료`);
  }

  function removeUser(index) {
    if (index < 0 || index >= blocked.length) return;
    const old = blocked.splice(index, 1)[0];
    save();
    scan(true);
    renderList();
    toast(`${old.nick || old.value} 차단 해제`);
  }

  function containers() {
    const selectors = [
      'tr.ub-content',
      '.gall_list tbody tr[data-no]',
      'li.ub-content',
      'li[id^="comment_"]',
      '.cmt_list > li',
      '.reply_list > li',
      '.gall-detail-lst > li',
      '.comment-lst > li',
      '.reply-lst > li'
    ];
    const set = new Set();
    selectors.forEach(selector => document.querySelectorAll(selector).forEach(el => set.add(el)));
    return [...set];
  }

  function authorIn(box) {
    const selectors = [
      '.gall_writer[data-nick]',
      '.gall_writer[data-uid]',
      '.gall_writer[data-ip]',
      '.cmt_nickbox .gall_writer',
      '.cmt_nickbox .nickname',
      '.cmt_nickbox .nick_name',
      '.gall_writer',
      '.nickname[data-nick]',
      '.nick_name[data-nick]',
      '.nickname',
      '.nick_name',
      '.user_info'
    ];
    for (const selector of selectors) {
      const found = box.querySelector(selector);
      if (found && (found.dataset?.nick || found.dataset?.uid || found.dataset?.ip || text(found.textContent))) return found;
    }
    return null;
  }

  function restore(box) {
    box.classList.remove(HIDDEN);
    box.removeAttribute('data-dcub-blocked');
    box.querySelector(':scope > .dcub-fold')?.remove();
    [...box.children].forEach(child => {
      if ('dcubDisplay' in child.dataset) {
        child.style.display = child.dataset.dcubDisplay;
        delete child.dataset.dcubDisplay;
      }
    });
  }

  function hide(box, user) {
    box.dataset.dcubBlocked = '1';

    if (options.mode === 'hide') {
      box.classList.add(HIDDEN);
      return;
    }

    box.classList.remove(HIDDEN);
    [...box.children].forEach(child => {
      if (child.classList.contains('dcub-fold')) return;
      if (!('dcubDisplay' in child.dataset)) child.dataset.dcubDisplay = child.style.display || '';
      child.style.display = 'none';
    });

    let fold = box.querySelector(':scope > .dcub-fold');
    if (!fold) {
      fold = document.createElement(box.tagName === 'TR' ? 'td' : 'div');
      fold.className = 'dcub-fold';
      if (box.tagName === 'TR') fold.colSpan = Math.max(box.children.length, 1);
      box.appendChild(fold);
    }

    fold.innerHTML = `<span>${html(user.nick)} 사용자의 글/댓글을 차단했습니다.</span><button type="button">이번만 보기</button>`;
    fold.querySelector('button').onclick = event => {
      event.preventDefault();
      box.dataset.dcubOnce = '1';
      restore(box);
    };
  }

  function addButton(author, user) {
    const parent = author.closest('.gall_writer, .cmt_nickbox') || author.parentElement;
    if (!parent || parent.querySelector(`:scope > .${BLOCK_BTN}`)) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BLOCK_BTN;
    button.textContent = findIndex(user) >= 0 ? '해제' : '차단';
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const current = getUser(author) || user;
      const index = findIndex(current);
      if (index >= 0) removeUser(index);
      else addUser(current);
    };
    parent.appendChild(button);
  }

  function process(box, force) {
    if (!force && box.dataset.dcubDone === '1') return;
    box.dataset.dcubDone = '1';

    const author = authorIn(box);
    const user = getUser(author);
    if (!author || !user) return;

    const index = findIndex(user);
    if (index >= 0 && box.dataset.dcubOnce !== '1') hide(box, user);
    else if (index < 0) {
      delete box.dataset.dcubOnce;
      restore(box);
    }

    const parent = author.closest('.gall_writer, .cmt_nickbox') || author.parentElement;
    parent?.querySelector(`:scope > .${BLOCK_BTN}`)?.remove();
    addButton(author, user);
  }

  function scan(force = false) {
    containers().forEach(box => process(box, force));
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(), 100);
  }

  function renderList() {
    const list = document.querySelector('#dcub-panel .dcub-list');
    if (!list) return;
    if (!blocked.length) {
      list.innerHTML = '<div class="dcub-empty">차단된 사용자가 없습니다.</div>';
      return;
    }
    list.innerHTML = blocked.map((item, index) => `
      <div class="dcub-item">
        <div><b>${html(item.nick || item.value)}</b><small>${html(item.type.toUpperCase())}: ${html(item.value)}</small></div>
        <button type="button" data-index="${index}">해제</button>
      </div>`).join('');
    list.querySelectorAll('[data-index]').forEach(button => {
      button.onclick = () => removeUser(Number(button.dataset.index));
    });
  }

  function makeUI() {
    const opener = document.createElement('button');
    opener.id = 'dcub-open';
    opener.type = 'button';
    opener.textContent = '차단';

    const panel = document.createElement('div');
    panel.id = 'dcub-panel';
    panel.innerHTML = `
      <div class="dcub-box">
        <header><b>디시 유저 차단</b><button type="button" class="dcub-close">×</button></header>
        <section class="dcub-option">
          <label><input type="radio" name="dcub-mode" value="hide"> 완전히 숨기기</label>
          <label><input type="radio" name="dcub-mode" value="fold"> 접어서 표시</label>
        </section>
        <div class="dcub-list"></div>
        <footer><button type="button" class="dcub-clear">전체 해제</button></footer>
      </div>`;

    document.body.append(opener, panel);
    opener.onclick = () => {
      renderList();
      panel.classList.add('open');
    };
    panel.querySelector('.dcub-close').onclick = () => panel.classList.remove('open');
    panel.onclick = event => {
      if (event.target === panel) panel.classList.remove('open');
    };
    panel.querySelectorAll('[name="dcub-mode"]').forEach(input => {
      input.checked = input.value === options.mode;
      input.onchange = () => {
        options.mode = input.value;
        write(OPT_KEY, options);
        scan(true);
      };
    });
    panel.querySelector('.dcub-clear').onclick = () => {
      if (!blocked.length || !confirm('차단 목록을 전부 삭제하시겠습니까?')) return;
      blocked = [];
      save();
      scan(true);
      renderList();
    };
  }

  function style() {
    const el = document.createElement('style');
    el.textContent = `
      .${HIDDEN}{display:none!important}
      .${BLOCK_BTN}{all:unset!important;display:inline-block!important;margin-left:4px!important;padding:0 4px!important;border:1px solid #aaa!important;border-radius:3px!important;background:#fff!important;color:#777!important;font-size:10px!important;line-height:16px!important;cursor:pointer!important;vertical-align:middle!important}
      .${BLOCK_BTN}:hover{border-color:#d33!important;color:#d33!important}
      .dcub-fold{padding:9px 12px!important;background:#f4f4f4!important;color:#777!important;font-size:12px!important}
      .dcub-fold button{margin-left:8px!important}
      #dcub-open{position:fixed!important;right:15px!important;bottom:18px!important;z-index:2147483645!important;width:44px!important;height:44px!important;border:0!important;border-radius:50%!important;background:#3b4890!important;color:#fff!important;font-weight:700!important;cursor:pointer!important;box-shadow:0 3px 12px #0005!important}
      #dcub-panel{display:none;position:fixed!important;inset:0!important;z-index:2147483646!important;background:#0008!important;font-family:Arial,sans-serif!important}
      #dcub-panel.open{display:block!important}
      .dcub-box{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:min(92vw,420px)!important;max-height:80vh!important;overflow:hidden!important;border-radius:10px!important;background:#fff!important;color:#222!important;box-shadow:0 12px 40px #0007!important}
      .dcub-box header,.dcub-box footer{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:13px 15px!important;border-bottom:1px solid #ddd!important}
      .dcub-box footer{justify-content:flex-end!important;border-top:1px solid #ddd!important;border-bottom:0!important}
      .dcub-close{border:0!important;background:none!important;font-size:24px!important;cursor:pointer!important}
      .dcub-option{display:flex!important;gap:12px!important;padding:12px 15px!important;border-bottom:1px solid #eee!important;font-size:13px!important}
      .dcub-list{max-height:52vh!important;overflow:auto!important;padding:5px 15px!important}
      .dcub-item{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:10px!important;padding:9px 0!important;border-bottom:1px solid #eee!important;font-size:13px!important}
      .dcub-item small{display:block!important;margin-top:2px!important;color:#888!important}
      .dcub-empty{padding:26px 0!important;text-align:center!important;color:#888!important}
      #dcub-toast{position:fixed!important;left:50%!important;bottom:72px!important;transform:translateX(-50%)!important;z-index:2147483647!important;padding:9px 14px!important;border-radius:7px!important;background:#111e!important;color:#fff!important;font-size:13px!important}
      @media(prefers-color-scheme:dark){.dcub-box{background:#252525!important;color:#eee!important}.dcub-box header,.dcub-box footer,.dcub-option,.dcub-item{border-color:#444!important}.dcub-fold{background:#292929!important;color:#aaa!important}}
    `;
    document.documentElement.appendChild(el);
  }

  function init() {
    if (!document.body) return document.addEventListener('DOMContentLoaded', init, { once: true });
    style();
    makeUI();
    scan();

    new MutationObserver(mutations => {
      if (mutations.some(m => [...m.addedNodes].some(node => node.nodeType === 1))) scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true });

    setInterval(scan, 3000);
  }

  init();
})();
