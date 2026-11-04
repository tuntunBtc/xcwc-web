import './session-store.js';
import { createPoints } from './points.js';
const birdId = new URLSearchParams(location.search).get('bird');
const notice = document.querySelector('#notice');
const pointsUI = createPoints(api, notice);
let session = null;
session = window.xcwcSession.read();
let bird = null;
const trusted = location.protocol === 'https:' || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const authForm=document.querySelector('#auth-form'),authError=document.querySelector('#auth-error');
let authBusy=false;
function setAuthMode(mode){
  if(authBusy)return;const register=mode==='register';authForm.dataset.mode=register?'register':'login';
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.authMode===authForm.dataset.mode)));
  authForm.elements.password.autocomplete=register?'new-password':'current-password';
  document.querySelector('#confirm-password-field').hidden=!register;authForm.elements.confirmPassword.required=register;authForm.elements.confirmPassword.value='';
  const submit=document.querySelector('#auth-submit');submit.value=authForm.dataset.mode;submit.textContent=register?'注册并登录':'登录';authError.textContent='';
}
document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>setAuthMode(button.dataset.authMode)));
document.querySelector('#toggle-password').addEventListener('click',event=>{
  const show=authForm.elements.password.type==='password';for(const input of [authForm.elements.password,authForm.elements.confirmPassword])input.type=show?'text':'password';
  event.currentTarget.textContent=show?'隐藏密码':'显示密码';event.currentTarget.setAttribute('aria-pressed',String(show));
});

function account() {
  document.querySelector('#auth-panel').hidden = !!session;
  document.querySelector('#account-panel').hidden = !session;
  document.querySelector('#account-name').textContent = session ? `你好，${session.username}` : '';
  document.querySelector('#claim-panel').hidden = !session || !bird || bird.claimed;
  document.querySelector('#mine-panel').hidden = !session;
  document.querySelector('#points-panel').hidden = !session;
}

function remember(value) {
  if (value) window.xcwcSession.write(value);
  else window.xcwcSession.clear();
  session = value;
  account();
}

async function api(path, body, method) {
  if (!trusted && (body || session)) throw new Error('此页面尚未启用 HTTPS。为了保护密码和领养码，已禁止提交，请联系工作人员。');
  const requestToken=session?.token;
  const publicAuth=/^\/auth\/(login|register)$/.test(path);
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session && !publicAuth) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`/api${path}`, {method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), cache: 'no-store'});
  if (window.xcwcSession.read()?.token !== requestToken) throw new Error('账号已切换，请重新加载页面');
  if (response.status === 204) return null;
  let value;
  try { value = await response.json(); } catch { throw new Error('登记服务未启动或代理配置有误，请联系工作人员。'); }
  if (!response.ok) {
    if (response.status === 401 && session && !publicAuth) remember(null);
    const error = new Error(value.message || '服务暂时不可用');
    error.status = response.status; error.code = value.code;
    throw error;
  }
  return value;
}

async function loadBird() {
  const panel = document.querySelector('#bird-panel');
  if (!birdId) { panel.innerHTML = '<h2>实体小鸟登记</h2><p>请扫描每只小鸟专属的二维码，或碰触 NFC 标签。已有账号可登录查看登记记录。</p>'; return; }
  if (!/^[a-f0-9]{32}$/.test(birdId)) throw new Error('链接中的小鸟编号格式不正确。');
  bird = await api(`/birds/${encodeURIComponent(birdId)}`);
  panel.innerHTML = `<img class="bird-image" src="${escape('/assets/birds/huangying/happy-avatar-192.c7b53126aec7.webp')}" width="192" height="192" decoding="async" alt="小黄莺"><h2>${escape(bird.name)}</h2><p>${escape(bird.cityName)} · ${escape(bird.typeName)} · ${escape(bird.skinName)}</p><p>批次：${escape(bird.batchNo || "未指定")}（角色示意图）</p><p class="bird-id">编号 ${escape(bird.id)}</p><p>登录后确认云端登记，可免费立即孵化；是否已登记以本人账号记录为准。</p>`;
  account();
}

async function loadMine() {
  if (!session) return;
  const birds = await api('/me/birds');
  document.querySelector('#mine-list').innerHTML = birds.length ? birds.map(item => `<div class="owned"><strong>${escape(item.name)}</strong><p>${escape(item.cityName)} · ${escape(item.typeName)} · ${escape(item.skinName)}</p><p class="bird-id">${escape(item.id)}</p><a href="/account.html?bird=${encodeURIComponent(item.id)}">查看云端登记 →</a></div>`).join('') : '<p>还没有云端登记记录。</p>';
  await pointsUI.refresh(birds, session.username);
  document.querySelector('#claim-panel').hidden = birds.some(item=>item.id===birdId) || !bird;
}

async function pending(buttons, task) {
  notice.textContent = '';
  buttons.forEach(button => { button.disabled = true; });
  try { await task(); } catch (error) { notice.textContent = error.name === 'TimeoutError' ? '连接超时，请稍后重试；重复提交不会重复认领。' : error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}

document.querySelector('#auth-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if(authBusy)return;const mode = form.dataset.mode==='register'?'register':'login';authError.textContent='';
  if(mode==='register'&&form.elements.password.value!==form.elements.confirmPassword.value){authError.textContent='两次输入的密码不一致，请重新确认。';form.elements.confirmPassword.focus();return}
  if(new TextEncoder().encode(form.elements.password.value).length>72){authError.textContent='密码超过 72 个 UTF-8 字节，请缩短后重试。';form.elements.password.focus();return}
  authBusy=true;pending([...form.querySelectorAll('button'),...document.querySelectorAll('[data-auth-mode]')], async () => {
    const credentials = {username: form.elements.username.value.trim(), password: form.elements.password.value};
    if (new TextEncoder().encode(credentials.password).length > 72) throw new Error('密码 UTF-8 编码不能超过 72 字节，请缩短密码。');
    const value = await api(`/auth/${mode}`, credentials);
    try { remember(value); } catch { throw new Error('浏览器禁用了会话存储，请允许后重新登录。'); }
    form.elements.password.value = '';
    form.elements.confirmPassword.value='';
    await loadMine();
    notice.textContent = '已登录，请妥善保存账号和密码。';
    window.xcwcReturnAfterLogin?.();
  }).finally(()=>{authBusy=false});
});

document.querySelector('#claim-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  pending([...form.querySelectorAll('button')], async () => {
    const name=form.elements.name.value.trim();if([...name].length<1||[...name].length>6||/[\u0000-\u001f\u007f]/.test(name))throw new Error('名字须为 1～6 个字，请重新填写。');
    if(!bird||!session)throw new Error('请先登录并读取这只小鸟的资料。');
    await api(`/birds/${encodeURIComponent(birdId)}/claim`, {name});
    await loadBird();
    await loadMine();
    notice.textContent = '登记成功！领养关系已保存在服务器，可凭账号密码重新登录查看。';
  });
});

document.querySelector('#logout').addEventListener('click', event => pending([event.currentTarget], async () => {
  await api('/auth/logout', null, 'POST');
  remember(null);
  document.querySelector('#mine-list').innerHTML = '';
  notice.textContent = '已退出登录。';
}));

account();
document.querySelector('#retry-cloud').addEventListener('click',event=>pending([event.currentTarget],async()=>{await loadBird();await loadMine();event.currentTarget.hidden=true;notice.textContent='云端资料已更新。'}));
if (!trusted) notice.textContent = '当前为 HTTP 测试地址，仅可查看公开形象，注册和认领需使用 HTTPS。';
try { await loadBird(); await loadMine(); }
catch (error) {
  notice.textContent = error.message;
  document.querySelector('#retry-cloud').hidden=false;
  if (!bird) document.querySelector('#bird-panel').innerHTML = '<h2>暂时无法读取小鸟</h2><p>请确认链接有效、后端已部署，再刷新重试。不会降级为虚假的本地绑定。</p>';
}
