// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      2.0.0
// @description  디시인사이드 사용자 차단 - 권한 없는 자동 업데이트 로더
// @match        https://gall.dcinside.com/*
// @match        https://m.dcinside.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js
// @updateURL    https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js
// ==/UserScript==

(() => {
  'use strict';

  const CORE_URLS = [
    'https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.core.js',
    'https://cdn.jsdelivr.net/gh/jupia389-rgb/suking@main/DCInside_User_Block.core.js'
  ];

  const CACHE_KEY = 'dcub_auto_core_cache_v1';
  const CACHE_TIME_KEY = 'dcub_auto_core_cache_time_v1';
  const FIVE_MINUTES = 5 * 60 * 1000;

  function validCore(code) {
    return typeof code === 'string'
      && code.length > 1000
      && code.includes('DCInside User Block')
      && code.includes('dcub-lookup');
  }

  function execute(code, sourceURL) {
    const wrapped = `${code}\n//# sourceURL=${sourceURL || 'DCInside_User_Block.core.js'}`;
    (0, eval)(wrapped);
  }

  async function downloadCore() {
    const bucket = Math.floor(Date.now() / FIVE_MINUTES);
    let lastError = null;

    for (const baseURL of CORE_URLS) {
      const separator = baseURL.includes('?') ? '&' : '?';
      const url = `${baseURL}${separator}dcub=${bucket}`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'follow'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const code = await response.text();
        if (!validCore(code)) {
          throw new Error('받아온 코드 형식이 올바르지 않습니다.');
        }

        localStorage.setItem(CACHE_KEY, code);
        localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
        return { code, url };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('최신 코드를 불러오지 못했습니다.');
  }

  async function start() {
    if (window.__DCUB_AUTO_LOADER_RUNNING__) return;
    window.__DCUB_AUTO_LOADER_RUNNING__ = true;

    try {
      const latest = await downloadCore();
      execute(latest.code, latest.url);
      return;
    } catch (error) {
      console.warn('[DCUB Loader] 최신본 확인 실패. 저장된 버전을 사용합니다.', error);
    }

    const cached = localStorage.getItem(CACHE_KEY);
    if (validCore(cached)) {
      try {
        execute(cached, 'DCInside_User_Block.cached.core.js');
        return;
      } catch (error) {
        console.error('[DCUB Loader] 저장된 버전 실행 실패:', error);
      }
    }

    console.error(
      '[DCUB Loader] 최초 실행에 필요한 본체를 내려받지 못했습니다. ' +
      '네트워크 연결 후 디시인사이드 페이지를 다시 열어주세요.'
    );
  }

  start();
})();
