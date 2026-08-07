// ==UserScript==
// @name         DCInside User Block Loader
// @namespace    https://github.com/jupia389-rgb/suking
// @version      1.0.0
// @description  유니콘 PRO 업데이트 오류를 우회하여 GitHub 최신 본체를 자동 로드합니다.
// @match        https://gall.dcinside.com/*
// @match        https://m.dcinside.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      gall.dcinside.com
// ==/UserScript==

(() => {
  'use strict';

  const CACHE_CODE_KEY = 'dcub_loader_cached_code_v1';
  const CACHE_TIME_KEY = 'dcub_loader_cached_time_v1';
  const CHECK_INTERVAL = 5 * 60 * 1000;

  const RAW_URL = 'https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js';
  const API_URL = 'https://api.github.com/repos/jupia389-rgb/suking/contents/DCInside_User_Block.user.js?ref=main';

  function read(key, fallback) {
    try {
      return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, value);
    } catch (_) {}
  }

  function request(url, headers = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers,
        timeout: 15000,
        anonymous: false,
        onload: response => {
          if (response.status >= 200 && response.status < 400) {
            resolve(response.responseText);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error('네트워크 요청 실패')),
        ontimeout: () => reject(new Error('요청 시간 초과'))
      });
    });
  }

  function decodeApiResponse(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed.startsWith('{')) return text;

    const parsed = JSON.parse(trimmed);
    if (typeof parsed.content !== 'string') throw new Error('GitHub 응답에 코드가 없습니다.');

    const binary = atob(parsed.content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function stripMetadata(code) {
    return String(code || '').replace(
      /^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m,
      ''
    );
  }

  function execute(code) {
    const body = stripMetadata(code);
    if (!body.trim()) throw new Error('실행할 코드가 비어 있습니다.');

    const run = new Function(
      'GM_getValue',
      'GM_setValue',
      'GM_xmlhttpRequest',
      body
    );

    run(GM_getValue, GM_setValue, GM_xmlhttpRequest);
  }

  async function fetchLatest() {
    const cacheBust = Math.floor(Date.now() / CHECK_INTERVAL);

    try {
      return await request(`${RAW_URL}?t=${cacheBust}`, {
        'Cache-Control': 'no-cache'
      });
    } catch (_) {
      const response = await request(`${API_URL}&t=${cacheBust}`, {
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache'
      });
      return decodeApiResponse(response);
    }
  }

  async function start() {
    const cachedCode = read(CACHE_CODE_KEY, '');
    const cachedTime = Number(read(CACHE_TIME_KEY, 0)) || 0;
    const cacheFresh = cachedCode && Date.now() - cachedTime < CHECK_INTERVAL;

    if (cacheFresh) {
      execute(cachedCode);
      return;
    }

    try {
      const latestCode = await fetchLatest();
      write(CACHE_CODE_KEY, latestCode);
      write(CACHE_TIME_KEY, Date.now());
      execute(latestCode);
    } catch (error) {
      console.error('[DCUB Loader] 최신 코드 로드 실패:', error);

      if (cachedCode) {
        execute(cachedCode);
        return;
      }

      alert(
        'DCInside User Block 최신 코드를 불러오지 못했습니다.\n' +
        '유니콘 PRO에서 raw.githubusercontent.com 및 api.github.com 접근 권한을 허용해 주세요.'
      );
    }
  }

  start();
})();
