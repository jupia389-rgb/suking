// ==UserScript==
// @name         DCInside User Block
// @namespace    https://github.com/jupia389-rgb/suking
// @version      2.1.3
// @description  디시인사이드 사용자 차단 - 단일 파일 자동 업데이트 버전
// @match        https://gall.dcinside.com/*
// @match        https://m.dcinside.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.user.js
// @updateURL    https://raw.githubusercontent.com/jupia389-rgb/suking/main/DCInside_User_Block.meta.js
// ==/UserScript==

(()=>{'use strict';

const V='1.6.0',BH='dcub-lookup',RC='dcub_result_',MC='dcub_managed_blocks',NK='block_all';
const POST=['tr.ub-content','.gall_list tbody tr[data-no]','.gall-detail-lst>li','#view_next>li','li[data-no]'];
const CMT=['.cmt_list>li[id^="comment_"]','.reply_list>li[id^="comment_"]','.all-comment-lst>li[id^="comment_cnt_"]','.comment-lst>li[id^="comment_"]','.reply-lst>li[id^="comment_"]'];
const ALL=[...POST,...CMT],mobile=location.hostname==='m.dcinside.com';
let selecting=false,busy=false,timer=0;
const norm=v=>String(v||'').replace(/\s+/g,' ').trim(),low=v=>norm(v).toLowerCase();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(s,f)=>{try{return s?JSON.parse(s):f}catch(_){return f}};
function ck(n){const m=document.cookie.match(new RegExp(`(?:^|;\\s*)${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}=([^;]*)`));return m?decodeURIComponent(m[1]):''}
function setC(n,v,sec=31536000){document.cookie=`${n}=${encodeURIComponent(v)}; Domain=.dcinside.com; Path=/; Max-Age=${sec}; SameSite=Lax`}
function delC(n){document.cookie=`${n}=; Domain=.dcinside.com; Path=/; Max-Age=0; SameSite=Lax`}
function cfg(){const o=json(localStorage.getItem(NK),{});return{on:1,word:typeof o.word==='string'?o.word:'',id:typeof o.id==='string'?o.id:'',nick:typeof o.nick==='string'?o.nick:'',ip:typeof o.ip==='string'?o.ip:''}}
function saveCfg(o){localStorage.setItem(NK,JSON.stringify({...o,on:1}))}
const arr=v=>String(v||'').split('||').map(x=>x.trim()).filter(Boolean);
function managed(){const a=json(ck(MC),[]);return Array.isArray(a)?a.filter(x=>x&&['uid','ip','nick'].includes(x.type)&&norm(x.value)):[]}
function saveManaged(a){setC(MC,JSON.stringify(a))}
const field=t=>t==='uid'?'id':t;
function sync(){
  const c=cfg(),m=managed();
  m.forEach(x=>{const f=field(x.type),a=arr(c[f]);if(!a.some(v=>low(v)===low(x.value))){a.push(x.value);c[f]=a.join('||')}});
  saveCfg(c);
}
function add(e){
  if(!e?.type||!e.value)return false;
  const c=cfg(),f=field(e.type),a=arr(c[f]);
  if(a.some(v=>low(v)===low(e.value))){toast('이미 차단 목록에 있습니다.');return false}
  if(a.length>=10){alert('디시인사이드 차단은 종류별 최대 10개까지 등록할 수 있습니다.');return false}
  a.push(e.value);c[f]=a.join('||');saveCfg(c);
  const m=managed();
  if(!m.some(x=>x.type===e.type&&low(x.value)===low(e.value)))m.unshift({...e,createdAt:Date.now()});
  saveManaged(m);render();toast(`${e.label||e.value} 차단 완료`);return true;
}
function remove(t,v){
  const c=cfg(),f=field(t);c[f]=arr(c[f]).filter(x=>low(x)!==low(v)).join('||');saveCfg(c);
  saveManaged(managed().filter(x=>!(x.type===t&&low(x.value)===low(v))));
  render();toast(`${v} 차단 해제`);
}
function ipOf(s){const m=String(s||'').match(/(?:^|[([])((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))(?:$|[)\]])/);return m?m[1]:''}
const cleanNick=s=>norm(s).replace(/^글쓴\s+/,'').replace(/\(((?:\d{1,3}\.){1,3}(?:\d{1,3}|\*))\)\s*$/,'').trim();
function writer(root){
  if(!root)return null;
  const ss=['.gall_writer[data-uid]','.gall_writer[data-ip]','.gall_writer[data-nick]','.gall_writer','.ginfo2>li:first-child','ul.ginfo>li:nth-child(2)','.cmt_nickbox [data-uid]','.cmt_nickbox [data-ip]','.cmt_nickbox [data-nick]','.cmt_nickbox .nickname','.cmt_nickbox .nick_name','.nickname','.nick_name','[data-uid]','[data-ip]','[data-nick]'];
  for(const s of ss){const e=root.matches?.(s)?root:root.querySelector?.(s);if(e&&norm(e.textContent))return e}
  return null;
}
function user(w){
  if(!w)return null;
  const uid=norm(w.dataset?.uid||w.dataset?.userId||w.getAttribute?.('data-uid')||w.getAttribute?.('data-user-id'));
  const raw=norm(w.textContent),ip=norm(w.dataset?.ip||w.getAttribute?.('data-ip')||ipOf(raw));
  const nick=cleanNick(w.dataset?.nick||w.getAttribute?.('data-nick')||raw);
  return uid||ip||nick?{uid,ip,nick:nick||uid||ip}:null;
}
function entry(u){
  if(u?.uid)return{type:'uid',value:u.uid,label:u.nick&&u.nick!==u.uid?`${u.nick} (@${u.uid})`:`@${u.uid}`};
  if(u?.ip)return{type:'ip',value:u.ip,label:`${u.nick||'ㅇㅇ'}(${u.ip})`};
  if(u?.nick&&u.nick!=='ㅇㅇ')return{type:'nick',value:u.nick,label:u.nick};
  return null;
}
function manual(raw,t){
  let v=norm(raw);if(!v)return null;
  const ip=ipOf(v)||(/^(?:\d{1,3}\.){1,3}(?:\d{1,3}|\*)$/.test(v)?v:'');
  if(t==='ip'||(t==='auto'&&ip))return ip?{type:'ip',value:ip,label:v}:{error:'IP는 211.245 또는 ㅇㅇ(211.245)처럼 입력해 주세요.'};
  if(t==='uid'||(t==='auto'&&v.startsWith('@'))){v=v.replace(/^@/,'').trim();return v?{type:'uid',value:v,label:`@${v}`}:null}
  if(v==='ㅇㅇ')return{error:'ㅇㅇ만으로는 구별할 수 없습니다. 화면에서 글을 선택해 주세요.'};
  return{type:'nick',value:v,label:v};
}
function postNo(box){
  for(const v of [box?.getAttribute?.('data-no'),box?.dataset?.no,box?.getAttribute?.('data-post-no'),box?.dataset?.postNo])if(/^\d+$/.test(norm(v)))return norm(v);
  for(const a of box?.querySelectorAll?.('a[href]')||[]){try{const u=new URL(a.href,location.href),q=u.searchParams.get('no'),last=u.pathname.split('/').filter(Boolean).pop();if(/^\d+$/.test(q||''))return q;if(/^\d+$/.test(last||''))return last}catch(_){}}
  return'';
}
function commentNo(box){
  for(const v of [box?.getAttribute?.('data-no'),box?.getAttribute?.('data-comment-no'),box?.dataset?.no,box?.dataset?.commentNo])if(/^\d+$/.test(norm(v)))return norm(v);
  return String(box?.id||'').match(/(?:comment_cnt_|comment_)(\d+)/)?.[1]||'';
}
function canonical(){return document.querySelector('link[rel="canonical"]')?.href||document.querySelector('meta[property="og:url"]')?.content||location.href}
function context(href=location.href){
  try{
    const u=new URL(href,location.href),cu=new URL(canonical(),location.href),src=`${u.href} ${cu.href}`;
    const type=/\/mini\//i.test(src)?'mini':/\/mgallery\//i.test(src)?'mgallery':/\/person\//i.test(src)?'person':'major';
    const p=u.pathname.split('/').filter(Boolean),cp=cu.pathname.split('/').filter(Boolean),bi=p.lastIndexOf('board'),cbi=cp.lastIndexOf('board');
    const gallery=u.searchParams.get('id')||cu.searchParams.get('id')||norm(document.querySelector('#gallery_id')?.value)||norm(document.querySelector('input[name="id"]')?.value)||(bi>=0?p[bi+1]:'')||(cbi>=0?cp[cbi+1]:'');
    let no=u.searchParams.get('no')||cu.searchParams.get('no')||'';
    if(!no&&bi>=0&&/^\d+$/.test(p[bi+2]||''))no=p[bi+2];
    if(!no&&cbi>=0&&/^\d+$/.test(cp[cbi+2]||''))no=cp[cbi+2];
    return gallery?{gallery,postNo:no,type}:null;
  }catch(_){return null}
}
const prefix=t=>t==='mini'?'https://gall.dcinside.com/mini/':t==='mgallery'?'https://gall.dcinside.com/mgallery/':t==='person'?'https://gall.dcinside.com/person/':'https://gall.dcinside.com/';
const gt=t=>t==='mini'?'MI':t==='mgallery'?'M':t==='person'?'PR':'G';
function bridgeData(){const p=new URLSearchParams(location.hash.slice(1));return p.has(BH)?{token:p.get(BH)||'',mode:p.get('mode')||'post',gallery:p.get('gallery')||'',postNo:p.get('postNo')||'',commentNo:p.get('commentNo')||'',gallType:p.get('gallType')||'G'}:null}
async function bridgeComment(p){
  const html=document.documentElement.innerHTML;
  const cid=html.match(/\$\(document\)\.data\('comment_id',\s*'([^']+)'\)/)?.[1]||p.gallery;
  const cno=html.match(/\$\(document\)\.data\('comment_no',\s*'([^']+)'\)/)?.[1]||p.postNo;
  for(let page=1;page<=10;page++){
    const q=new URLSearchParams({ci_t:(document.cookie.match(/(?:^|;\s*)ci_c=([^;]*)/)||[])[1]||'',_GALLTYPE_:p.gallType,id:p.gallery,no:p.postNo,cmt_id:cid,cmt_no:cno,e_s_n_o:document.querySelector('#e_s_n_o')?.value||'',comment_page:String(page)});
    const r=await fetch('https://gall.dcinside.com/board/comment/',{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:q.toString()});
    if(!r.ok)throw new Error(`댓글 조회 실패: HTTP ${r.status}`);
    const j=await r.json(),list=j.comments||[],c=list.find(x=>norm(x.no)===norm(p.commentNo));
    if(c)return{uid:norm(c.user_id),ip:norm(c.ip),nick:norm(c.name||c.nickname)};
    if(!list.length)break;
  }
  return null;
}
async function runBridge(p){
  if(!p?.token||location.hostname!=='gall.dcinside.com')return false;
  const done=o=>{setC(`${RC}${p.token}`,JSON.stringify(o),90);document.title=o.ok?'작성자 확인 완료':'작성자 확인 실패';setTimeout(()=>{try{window.close()}catch(_){}},150)};
  const work=async()=>{try{const u=p.mode==='comment'?await bridgeComment(p):user(writer(document.querySelector('.gallview_head'))),e=entry(u);done(e?{ok:true,entry:e}:{ok:false,error:'PC 페이지에서도 식별 정보를 찾지 못했습니다.'})}catch(e){done({ok:false,error:e.message||String(e)})}};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',work,{once:true}):work();
  return true;
}
function selectedContext(box){
  const c=context();if(!c)return null;
  const isC=CMT.some(s=>box.matches(s));
  return isC?{...c,mode:'comment',commentNo:commentNo(box)}:{...c,mode:'post',postNo:postNo(box)||c.postNo};
}
function bridgeURL(c,t){
  const h=new URLSearchParams({[BH]:t,mode:c.mode,gallery:c.gallery,postNo:c.postNo,gallType:gt(c.type)});
  if(c.commentNo)h.set('commentNo',c.commentNo);
  return`${prefix(c.type)}board/view/?id=${encodeURIComponent(c.gallery)}&no=${encodeURIComponent(c.postNo)}#${h}`;
}
function waitResult(t,w){return new Promise((res,rej)=>{const n=RC+t,start=Date.now(),iv=setInterval(()=>{const r=ck(n);if(r){clearInterval(iv);delC(n);res(json(r,{ok:false,error:'응답 오류'}))}else if(Date.now()-start>20000){clearInterval(iv);try{w?.close()}catch(_){}rej(new Error('작성자 확인 시간이 초과되었습니다.'))}},250)})}
async function lookup(c){
  if(!c?.gallery||!c?.postNo)throw new Error('선택한 글 번호를 찾지 못했습니다.');
  if(c.mode==='comment'&&!c.commentNo)throw new Error('선택한 댓글 번호를 찾지 못했습니다.');
  const t=Date.now().toString(36)+Math.random().toString(36).slice(2,8),w=window.open(bridgeURL(c,t),`dcub_${t}`);
  if(!w)throw new Error('새 탭이 차단되었습니다. Safari의 팝업 차단을 잠시 해제해 주세요.');
  const r=await waitResult(t,w);if(!r?.ok||!r.entry)throw new Error(r?.error||'작성자 식별 실패');return r.entry;
}
function boxes(){
  const s=new Set();ALL.forEach(q=>document.querySelectorAll(q).forEach(e=>s.add(e)));
  const h=document.querySelector('.gallview-tit-box,.gallview_head');if(h)s.add(h);return[...s];
}
function picks(){
  document.querySelectorAll('.dcub-pickable').forEach(e=>{e.classList.remove('dcub-pickable');delete e.dataset.dcubPickLabel});
  if(!selecting)return;
  boxes().forEach(e=>{e.classList.add('dcub-pickable');e.dataset.dcubPickLabel=CMT.some(s=>e.matches(s))?'댓글 선택':'글 선택'});
}
function bar(msg='차단할 글이나 댓글 한 줄을 누르세요. 링크는 열리지 않습니다.'){
  let b=document.getElementById('dcub-selection-bar');
  if(!b){b=document.createElement('div');b.id='dcub-selection-bar';b.innerHTML='<span></span><button type="button">취소</button>';b.querySelector('button').onclick=()=>cancel();document.body.appendChild(b)}
  b.querySelector('span').textContent=msg;return b;
}
function begin(){selecting=true;busy=false;document.documentElement.classList.add('dcub-selecting');picks();bar()}
function cancel(){selecting=false;busy=false;document.documentElement.classList.remove('dcub-selecting');document.getElementById('dcub-selection-bar')?.remove();picks()}
async function selectClick(ev){
  if(!selecting||busy||ev.target.closest('#dcub-panel,#dcub-selection-bar,#dcub-footer-settings'))return;
  const box=ev.target.closest('.dcub-pickable');
  ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
  if(!box){toast('표시된 글 또는 댓글 영역을 눌러주세요.');return}
  busy=true;bar('작성자 정보를 확인하고 있습니다…');
  try{
    let e=entry(user(writer(box))),c=selectedContext(box);
    if(!e||e.type==='nick'){bar('PC 화면에서 ID를 확인 중입니다. 새 탭이 잠깐 열릴 수 있습니다…');e=await lookup(c)}
    const basis=e.type==='uid'?'식별 코드':e.type==='ip'?'유동 IP':'닉네임';
    if(confirm(`${e.label} 사용자를 차단하시겠습니까?\n\n차단 기준: ${basis}`)&&add(e))box.classList.add('dcub-hide');
    cancel();
  }catch(e){alert(`작성자를 확인하지 못했습니다.\n\n${e.message||e}\n\n새 탭이 열리지 않았다면 Safari의 팝업 차단을 잠시 해제해 주세요.`);cancel()}
}
function render(){
  const el=document.querySelector('#dcub-panel .dcub-list');if(!el)return;
  const m=managed();
  if(!m.length){el.innerHTML='<div class="dcub-empty">이 스크립트에서 추가한 차단 사용자가 없습니다.</div>';return}
  el.innerHTML=m.map((x,i)=>`<div class="dcub-item"><div><b>${esc(x.label||x.value)}</b><small>${x.type==='uid'?'식별 코드':x.type==='ip'?'유동 IP':'닉네임'}</small></div><button data-i="${i}">해제</button></div>`).join('');
  el.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const x=m[+b.dataset.i];if(x)remove(x.type,x.value)});
}
function panel(){
  if(document.getElementById('dcub-panel'))return;
  const p=document.createElement('div');p.id='dcub-panel';p.innerHTML=`<div class="dcub-box"><header><b>유저 차단 설정</b><button class="dcub-close">×</button></header><div class="dcub-pick-section"><button id="dcub-pick-user"><span class="dcub-pick-icon">◎</span><span><b>화면에서 글·댓글 선택</b><small>작성자 이름이 아니라 글 한 줄 아무 곳이나 누릅니다.</small></span></button></div><div class="dcub-entry"><div class="dcub-entry-row"><select id="dcub-type"><option value="auto">자동 판별</option><option value="ip">유동 IP</option><option value="uid">식별 코드</option><option value="nick">닉네임</option></select><input id="dcub-input" placeholder="ㅇㅇ(211.245) 또는 @아이디"><button id="dcub-add">등록</button></div><p>반고닉 ㅇㅇ은 화면 선택을 사용하면 임시 PC 탭에서 실제 식별 코드를 확인합니다.</p></div><div class="dcub-list"></div><footer><button class="dcub-native">디시 차단 설정</button><button class="dcub-clear">전체 해제</button></footer></div>`;
  document.body.appendChild(p);
  const input=p.querySelector('#dcub-input'),type=p.querySelector('#dcub-type'),submit=()=>{const e=manual(input.value,type.value);if(e?.error)return alert(e.error);if(e&&add(e))input.value=''};
  p.querySelector('.dcub-close').onclick=()=>p.classList.remove('open');
  p.onclick=e=>{if(e.target===p)p.classList.remove('open')};
  p.querySelector('#dcub-pick-user').onclick=()=>{p.classList.remove('open');begin()};
  p.querySelector('#dcub-add').onclick=submit;
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit()}};
  p.querySelector('.dcub-native').onclick=()=>{const c=context();if(c)location.href=`https://m.dcinside.com/userBlock/common/${c.type==='mini'?'mini':'board'}/${encodeURIComponent(c.gallery)}`};
  p.querySelector('.dcub-clear').onclick=()=>{const m=managed();if(!m.length||!confirm('이 스크립트에서 등록한 차단을 모두 해제하시겠습니까?'))return;const c=cfg();m.forEach(x=>{const f=field(x.type);c[f]=arr(c[f]).filter(v=>low(v)!==low(x.value)).join('||')});saveCfg(c);saveManaged([]);render();toast('모두 해제했습니다.')};
}
function footer(){
  const candidates=new Set();['#footer','.footer','.footer_wrap','.footer-area','.footer_area','.m-footer','.m_footer','.dc-footer','body>footer'].forEach(s=>document.querySelectorAll(s).forEach(e=>candidates.add(e)));
  document.querySelectorAll('body>div,body>section').forEach(e=>{const t=norm(e.textContent);if(/Copyright/i.test(t)&&/dcinside/i.test(t))candidates.add(e)});
  return[...candidates].map(e=>{if(e.closest('article,.gallview,.gallview_contents,.view_content,.view_content_wrap,.movie,.video'))return{e,s:-99};const t=low(e.textContent);let s=0;if(t.includes('copyright'))s+=8;if(t.includes('개인정보처리방침'))s+=5;if(t.includes('회사소개'))s+=3;if(t.includes('dcinside.com'))s+=3;if(t.includes('이용약관'))s+=2;if(low(e.id).includes('footer'))s+=3;if(low(e.className).includes('footer'))s+=2;return{e,s}}).filter(x=>x.s>=8).sort((a,b)=>b.s-a.s)[0]?.e||null;
}
function gear(){
  const old=document.getElementById('dcub-footer-settings'),f=footer();
  if(!f){old?.remove();return}if(old?.parentElement===f)return;old?.remove();f.classList.add('dcub-site-footer');
  const h=document.createElement('div');h.id='dcub-footer-settings';h.innerHTML='<button id="dcub-open" aria-label="유저 차단 설정">⚙</button>';h.querySelector('button').onclick=()=>{cancel();render();document.getElementById('dcub-panel')?.classList.add('open')};f.appendChild(h);
}
function scan(){document.querySelectorAll('.block-disable').forEach(e=>e.classList.add('dcub-hide'));gear();picks()}
function toast(s){document.getElementById('dcub-toast')?.remove();const e=document.createElement('div');e.id='dcub-toast';e.textContent=s;document.body.appendChild(e);setTimeout(()=>e.remove(),1800)}
function css(){
  if(document.getElementById('dcub-style'))return;
  const s=document.createElement('style');s.id='dcub-style';s.textContent=`
.dcub-hide,.block-disable{display:none!important}.dcub-site-footer{position:relative!important}#dcub-footer-settings{position:absolute!important;right:16px!important;bottom:72px!important;z-index:5!important}#dcub-open{all:unset!important;display:flex!important;align-items:center!important;justify-content:center!important;width:36px!important;height:36px!important;border-radius:8px!important;background:#ffffff14!important;color:#ffffffb8!important;font-size:19px!important;cursor:pointer!important}
#dcub-panel{display:none;position:fixed!important;inset:0!important;z-index:2147483646!important;background:#0008!important;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif!important}#dcub-panel.open{display:block!important}.dcub-box{position:absolute!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:min(92vw,430px)!important;max-height:84vh!important;overflow:hidden!important;border-radius:12px!important;background:#fff!important;color:#222!important;box-shadow:0 12px 40px #0006!important}.dcub-box header,.dcub-box footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:6px!important;padding:13px 15px!important;border-bottom:1px solid #ddd!important}.dcub-box footer{justify-content:flex-end!important;border-top:1px solid #ddd!important;border-bottom:0!important}.dcub-close{border:0!important;background:none!important;color:inherit!important;font-size:24px!important}.dcub-pick-section{padding:12px 15px!important;border-bottom:1px solid #eee!important}#dcub-pick-user{width:100%!important;display:flex!important;align-items:center!important;gap:10px!important;padding:11px 12px!important;border:1px solid #c9ccda!important;border-radius:8px!important;background:#f7f8fc!important;color:#30364f!important;text-align:left!important}.dcub-pick-icon{font-size:22px!important;color:#3b4890!important}#dcub-pick-user small{display:block!important;margin-top:3px!important;color:#7c8192!important;font-size:11px!important}.dcub-entry{padding:13px 15px 10px!important;border-bottom:1px solid #eee!important}.dcub-entry-row{display:flex!important;gap:6px!important}#dcub-type{flex:0 0 88px!important;height:38px!important}#dcub-input{flex:1!important;min-width:0!important;height:38px!important;box-sizing:border-box!important;padding:8px!important}#dcub-add{flex:0 0 52px!important;height:38px!important;border:0!important;border-radius:6px!important;background:#3b4890!important;color:#fff!important;font-weight:700!important}.dcub-entry p{margin:8px 1px 0!important;color:#858895!important;font-size:11px!important;line-height:1.45!important}.dcub-list{max-height:38vh!important;overflow:auto!important;padding:5px 15px!important}.dcub-item{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:10px 0!important;border-bottom:1px solid #eee!important;font-size:13px!important}.dcub-item small{display:block!important;margin-top:2px!important;color:#888!important;font-size:11px!important}.dcub-item button,.dcub-box footer button{padding:5px 8px!important;border:1px solid #aaa!important;border-radius:5px!important;background:#fff!important;color:#444!important;font-size:11px!important}.dcub-empty{padding:28px 0!important;color:#888!important;text-align:center!important}
#dcub-selection-bar{position:fixed!important;left:50%!important;bottom:calc(18px + env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;z-index:2147483647!important;display:flex!important;align-items:center!important;gap:10px!important;max-width:calc(100vw - 24px)!important;padding:9px 10px 9px 14px!important;border-radius:10px!important;background:#191b22f2!important;color:#fff!important;font-size:12px!important;box-shadow:0 6px 24px #0005!important}#dcub-selection-bar span{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}#dcub-selection-bar button{flex-shrink:0!important;border:0!important;border-radius:6px!important;padding:5px 8px!important;background:#ffffff29!important;color:#fff!important}
.dcub-pickable{position:relative!important;outline:2px solid #3b489059!important;outline-offset:-2px!important;cursor:pointer!important;-webkit-tap-highlight-color:transparent!important}.dcub-pickable:after{content:attr(data-dcub-pick-label)!important;position:absolute!important;right:8px!important;top:50%!important;transform:translateY(-50%)!important;z-index:2147483644!important;padding:4px 7px!important;border-radius:5px!important;background:#3b4890eb!important;color:#fff!important;font-size:10px!important;font-weight:700!important;pointer-events:none!important}
#dcub-toast{position:fixed!important;left:50%!important;bottom:calc(72px + env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;z-index:2147483647!important;padding:9px 14px!important;border-radius:8px!important;background:#141414eb!important;color:#fff!important;font-size:13px!important;white-space:nowrap!important}
@media(prefers-color-scheme:dark){.dcub-box{background:#252525!important;color:#eee!important}.dcub-box header,.dcub-box footer,.dcub-pick-section,.dcub-entry,.dcub-item{border-color:#444!important}#dcub-pick-user{background:#303138!important;color:#eee!important;border-color:#565a68!important}#dcub-type,#dcub-input{background:#303030!important;color:#eee!important;border-color:#5b5d65!important}.dcub-item button,.dcub-box footer button{background:#333!important;color:#eee!important;border-color:#666!important}}`;document.documentElement.appendChild(s);
}
async function init(){
  const b=bridgeData();if(b&&location.hostname==='gall.dcinside.com'){await runBridge(b);return}
  if(!document.body){document.addEventListener('DOMContentLoaded',init,{once:true});return}
  sync();css();panel();gear();scan();document.addEventListener('click',selectClick,true);
  new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n.nodeType===1))){clearTimeout(timer);timer=setTimeout(scan,100)}}).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(scan,mobile?2500:5000);console.info(`[DCUB] v${V}`);
}
init();
})();
