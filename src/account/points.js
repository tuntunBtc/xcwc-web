const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function createPoints(api, notice) {
  let birds = [];
  const panel = document.querySelector('#points-panel');
  const mine = document.querySelector('#mine-list');
  let owner = '';
  function pendingKey(action, target) { return `xcwc.points.request:${owner}:${action}:${target}`; }
  async function mutate(action, target, path) {
    const storageKey = pendingKey(action, target);
    let requestId = sessionStorage.getItem(storageKey);
    if (!requestId) {
      requestId = crypto.randomUUID();
      // Save before sending; retry after a lost response uses the same request ID.
      sessionStorage.setItem(storageKey, requestId);
    }
    try {
      const result = await api(path, {requestId});
      sessionStorage.removeItem(storageKey);
      return result;
    } catch (error) {
      if (error.status >= 400 && error.status < 500) sessionStorage.removeItem(storageKey);
      throw error;
    }
  }
  async function refresh(items, username) {
    birds = items; owner = username;
    const [wallet, skins, outfits, history] = await Promise.all([
      api('/me/points'), api('/skins'), api('/me/outfits'), api('/me/points/ledger')
    ]);
    document.querySelector('#points-balance').textContent = `${wallet.balance} 叽分`;
    document.querySelector('#points-rules').textContent = `今日抚摸奖励 ${wallet.earnedToday}/${wallet.dailyLimit}。每次 +1，间隔 30 秒，账号内多鸟共享每日额度，按北京时间刷新。`;
    document.querySelector('#skin-shop').innerHTML = skins.map(skin => `<div class="owned"><strong>${escape(skin.name)}</strong><p>全角色通用装饰光晕 · 永久解锁 · ${skin.price} 叽分</p><button type="button" data-points-action="redeem" data-id="${escape(skin.id)}" ${skin.owned || wallet.balance < skin.price ? 'disabled' : ''}>${skin.owned ? '已解锁' : wallet.balance < skin.price ? '叽分不足' : '兑换皮肤'}</button></div>`).join('');
    document.querySelector('#points-history').innerHTML = history.length ? history.map(entry => `<p>${escape(new Date(entry.createdAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}))} · ${({PET:'抚摸奖励',CHECKIN_REWARD:'合照奖励',REDEEM:'皮肤兑换'})[entry.operation] || '叽分变动'} <strong>${entry.delta > 0 ? '+' : ''}${entry.delta}</strong> · 余额 ${entry.balanceAfter}</p>`).join('') : '<p>还没有叽分记录，先和自己的小鸟打个招呼吧。</p>';
    mine.innerHTML = birds.length ? birds.map(bird => {
      const outfit = outfits.find(item => item.birdId === bird.id);
      const visual = ['lake','sunset'].includes(outfit?.visualKey) ? outfit.visualKey : 'default';
      return `<div class="owned"><div class="bird-aura aura-${visual}"><img class="bird-image" src="${escape(bird.image)}" alt="${escape(bird.name)}"></div><strong>${escape(bird.name)}</strong><p>${escape(bird.cityName)} · ${escape(bird.typeName)} · 出厂皮肤：${escape(bird.skinName)}</p><p class="bird-id">${escape(bird.id)}</p><button type="button" data-points-action="pet" data-id="${escape(bird.id)}">摸摸小鸟</button><label>当前装饰皮肤<select data-points-action="equip" data-id="${escape(bird.id)}"><option value="">原始外观</option>${skins.filter(s=>s.owned).map(s=>`<option value="${escape(s.id)}" ${outfit?.skinId === s.id ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select></label><a href="/register.html?bird=${encodeURIComponent(bird.id)}">查看登记 →</a></div>`;
    }).join('') : '<p>先认领一只小鸟，再开始互动。</p>';
  }
  let busy = false;
  async function handle(element) {
    if (busy) return;
    busy = true;
    const action = element.dataset.pointsAction, id = element.dataset.id;
    const controls = [...panel.querySelectorAll('button'), ...mine.querySelectorAll('button,select')];
    controls.forEach(control => { control.disabled = true; });
    notice.textContent = '';
    let message;
    try {
      if (action === 'pet') {
        notice.textContent = '啾！小鸟蹭了蹭你的手。';
        const result = await mutate('pet', id, `/birds/${encodeURIComponent(id)}/pet`);
        message = result.replayed ? '已确认上次抚摸奖励，未重复加分。' : '小鸟很开心，叽分 +1！';
      } else if (action === 'redeem') {
        const result = await mutate('redeem', id, `/skins/${encodeURIComponent(id)}/redeem`);
        message = result.replayed ? '已确认上次兑换，未重复扣分。' : `兑换成功，消耗 ${-result.entry.delta} 叽分，可在小鸟下方穿戴。`;
      } else {
        await api(`/birds/${encodeURIComponent(id)}/skin`, {skinId: element.value || null}, 'PUT');
        message = '外观已保存到服务器。';
      }
    } catch (error) {
      message = ['REWARD_COOLDOWN','DAILY_LIMIT'].includes(error.code) ? `小鸟收到你的抚摸啦。${error.message}` : error.message;
    } finally {
      controls.forEach(control => { control.disabled = false; });
      try { await refresh(birds, owner); }
      catch { message += ' 数据刷新失败，请刷新页面核对；未确认的叽分请求重试不会重复结算。'; }
      notice.textContent = message;
      busy = false;
    }
  }
  panel.addEventListener('click', event => { const button = event.target.closest('button[data-points-action]'); if (button) handle(button); });
  mine.addEventListener('click', event => { const button = event.target.closest('button[data-points-action]'); if (button) handle(button); });
  mine.addEventListener('change', event => { if (event.target.matches('select[data-points-action]')) handle(event.target); });
  return {refresh};
}
