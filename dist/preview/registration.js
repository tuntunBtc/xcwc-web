import { createPoints } from './points.js';
const birdId = new URLSearchParams(location.search).get('bird');
const notice = document.querySelector('#notice');
const sessionKey = 'yanji.cloud.session.v1';
const pointsUI = createPoints(api, notice);
let session = null;
try { session = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { session = null; }
let bird = null;
const trusted = location.protocol === 'https:' || ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function account() {
  document.querySelector('#auth-panel').hidden = !!session;
  document.querySelector('#account-panel').hidden = !session;
  document.querySelector('#account-name').textContent = session ? `你好，${session.username}` : '';
  document.querySelector('#claim-panel').hidden = !session || !bird || bird.claimed;
  document.querySelector('#mine-panel').hidden = !session;
  document.querySelector('#points-panel').hidden = !session;
}

function remember(value) {
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
  session = value;
  account();
}

async function api(path, body, method) {
  if (!trusted && (body || session)) throw new Error('此页面尚未启用 HTTPS。为了保护密码和领养码，已禁止提交，请联系工作人员。');
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`/api${path}`, {method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), cache: 'no-store'});
  if (response.status === 204) return null;
  let value;
  try { value = await response.json(); } catch { throw new Error('登记服务未启动或代理配置有误，请联系工作人员。'); }
  if (!response.ok) {
    if (response.status === 401 && session) remember(null);
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
  panel.innerHTML = `<img class="bird-image" src="${escape(bird.image)}" alt="蓝色燕叽"><h2>${escape(bird.name)}</h2><p>${escape(bird.cityName)} · ${escape(bird.typeName)} · ${escape(bird.skinName)}</p><p>批次：${escape(bird.batchNo || "未指定")}（图片暂为统一示意图）</p><p class="bird-id">编号 ${escape(bird.id)}</p><p>${bird.claimed ? '已认领。主人登录后可在下方查看自己的登记记录。' : '还在等待主人，登录并输入包装内的领养码即可认领。'}</p>`;
  account();
}

async function loadMine() {
  if (!session) return;
  const birds = await api('/me/birds');
  document.querySelector('#mine-list').innerHTML = birds.length ? birds.map(item => `<div class="owned"><strong>${escape(item.name)}</strong><p>${escape(item.cityName)} · ${escape(item.typeName)} · ${escape(item.skinName)}</p><p class="bird-id">${escape(item.id)}</p><a href="/register.html?bird=${encodeURIComponent(item.id)}">查看这只小鸟 →</a></div>`).join('') : '<p>还没有登记记录。</p>';
  await pointsUI.refresh(birds, session.username);
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
  const mode = event.submitter?.value || 'login';
  pending([...form.querySelectorAll('button')], async () => {
    const credentials = {username: form.elements.username.value.trim(), password: form.elements.password.value};
    if (new TextEncoder().encode(credentials.password).length > 72) throw new Error('密码 UTF-8 编码不能超过 72 字节，请缩短密码。');
    const value = await api(`/auth/${mode}`, credentials);
    try { remember(value); } catch { throw new Error('浏览器禁用了会话存储，请允许后重新登录。'); }
    form.elements.password.value = '';
    await loadMine();
    notice.textContent = '已登录，请妥善保存账号和密码。';
    window.xcwcReturnAfterLogin?.();
  });
});

document.querySelector('#claim-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  pending([...form.querySelectorAll('button')], async () => {
    await api(`/birds/${encodeURIComponent(birdId)}/claim`, {code: form.elements.code.value.trim().toLowerCase(), name: form.elements.name.value});
    form.elements.code.value = '';
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
if (!trusted) notice.textContent = '当前为 HTTP 测试地址，仅可查看公开形象，注册和认领需使用 HTTPS。';
try { await loadBird(); await loadMine(); }
catch (error) {
  notice.textContent = error.message;
  if (!bird) document.querySelector('#bird-panel').innerHTML = '<h2>暂时无法读取小鸟</h2><p>请确认链接有效、后端已部署，再刷新重试。不会降级为虚假的本地绑定。</p>';
}
