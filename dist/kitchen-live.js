(() => {
  const orderKey = 'baoDumplingOrders';
  const passwordKey = 'baoDumplingManagerPassword';
  const auditKey = 'baoDumplingAudit';
  const refreshKitchen = () => window.location.reload();

  const record = details => {
    const log = JSON.parse(localStorage.getItem(auditKey) || '[]');
    log.push({ time: new Date().toLocaleString('fr-FR'), action: '厨房删除订单', details });
    localStorage.setItem(auditKey, JSON.stringify(log.slice(-250)));
  };
  const removeOrder = id => {
    const list = JSON.parse(localStorage.getItem(orderKey) || '[]');
    const order = list.find(item => item.id === id);
    if (!order) return;
    localStorage.setItem(orderKey, JSON.stringify(list.filter(item => item.id !== id)));
    record(`${id} · 厨房管理员删除`);
    refreshKitchen();
  };
  const openDelete = id => {
    let dialog = document.querySelector('#kitchen-delete-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'kitchen-delete-dialog';
      dialog.style.cssText = 'width:min(92vw,420px);border:0;border-radius:18px;padding:0;box-shadow:0 14px 50px #001d10aa';
      document.body.append(dialog);
    }
    const existing = localStorage.getItem(passwordKey);
    const firstUse = !existing;
    dialog.innerHTML = `<form id="kitchen-delete-form" style="padding:26px;background:#f7fbff;color:#092b5d"><h2 style="margin:0 0 8px">删除订单</h2><p style="color:#537291">${id}<br>删除后会从厨房、订单数和营业额中同步移除。</p>${firstUse ? '<label style="display:block;margin-top:12px">首次使用：创建管理员密码<input id="kitchen-password" type="password" required style="display:block;width:100%;padding:11px;margin-top:6px;border:1px solid #bcd1e8;border-radius:8px"><br>确认管理员密码<input id="kitchen-confirm" type="password" required style="display:block;width:100%;padding:11px;margin-top:6px;border:1px solid #bcd1e8;border-radius:8px"></label>' : '<label style="display:block;margin-top:12px">管理员密码<input id="kitchen-password" type="password" required autofocus style="display:block;width:100%;padding:11px;margin-top:6px;border:1px solid #bcd1e8;border-radius:8px"></label>'}<p id="kitchen-delete-error" style="min-height:20px;color:#a22b2b"></p><button type="button" id="kitchen-delete-cancel" style="padding:10px 12px;border:0;border-radius:8px">返回</button><button type="submit" style="padding:10px 12px;border:0;border-radius:8px;background:#a22b2b;color:#fff;font-weight:800">验证并删除</button></form>`;
    dialog.querySelector('#kitchen-delete-cancel').onclick = () => dialog.close();
    dialog.querySelector('#kitchen-delete-form').onsubmit = event => {
      event.preventDefault();
      const password = dialog.querySelector('#kitchen-password').value;
      const confirmPassword = dialog.querySelector('#kitchen-confirm')?.value || password;
      const error = dialog.querySelector('#kitchen-delete-error');
      if (firstUse) {
        if (password !== confirmPassword) { error.textContent = '两次密码不一致'; return; }
        localStorage.setItem(passwordKey, password);
        record('厨房首次设置管理员密码');
      } else if (password !== existing) { error.textContent = '管理员密码不正确'; return; }
      dialog.close();
      removeOrder(id);
    };
    dialog.showModal();
  };
  const addDeleteButtons = () => document.querySelectorAll('.ticket').forEach(ticket => {
    const start = ticket.querySelector('button[data-next="making"]');
    if (!start || ticket.querySelector('[data-kitchen-delete]')) return;
    start.style.marginRight = '8px';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button danger';
    remove.dataset.kitchenDelete = start.dataset.id;
    remove.textContent = '删除订单';
    remove.style.cssText = 'float:right;margin-top:0';
    remove.onclick = () => openDelete(remove.dataset.kitchenDelete);
    start.insertAdjacentElement('afterend', remove);
  });

  const addServiceLabels = () => {
    const list = JSON.parse(localStorage.getItem(orderKey) || '[]');
    document.querySelectorAll('.ticket').forEach(ticket => {
      if (ticket.querySelector('.kitchen-service')) return;
      const id = ticket.querySelector('h3')?.textContent;
      const order = list.find(item => item.id === id);
      if (!order) return;
      const label = document.createElement('strong');
      label.className = 'kitchen-service';
      label.textContent = order.service || '堂食';
      label.style.cssText = `display:inline-block;margin:7px 0 2px;padding:4px 8px;border-radius:7px;background:${label.textContent === '打包' ? '#f4dfae' : '#dceefe'};color:#083f7e;font-size:13px`;
      ticket.querySelector('small')?.insertAdjacentElement('afterend', label);
    });
  };

  new MutationObserver(() => { addDeleteButtons(); addServiceLabels(); }).observe(document.querySelector('#kitchen-board'), { childList: true, subtree: true });
  addDeleteButtons();
  addServiceLabels();
  window.addEventListener('storage', event => { if (event.key === orderKey) refreshKitchen(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshKitchen(); });
})();
