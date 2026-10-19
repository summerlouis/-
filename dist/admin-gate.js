(() => {
  const passwordKey = 'baoDumplingManagerPassword';
  const auditKey = 'baoDumplingAudit';
  const page = document.body.dataset.page;
  if (!['admin', 'owner'].includes(page)) return;
  const app = document.querySelector('main.app');
  if (!app) return;
  app.style.visibility = 'hidden';
  app.setAttribute('aria-hidden', 'true');
  const stored = localStorage.getItem(passwordKey);
  const firstUse = !stored;
  const gate = document.createElement('section');
  gate.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:linear-gradient(135deg,#062b68,#0b5ca8);font-family:Microsoft YaHei,system-ui,sans-serif';
  gate.innerHTML = `<form id="admin-login-form" style="width:min(92vw,390px);padding:28px;border-radius:18px;background:#f7fbff;color:#092b5d;box-shadow:0 18px 60px #001a40aa"><p style="margin:0;color:#587797;font-size:12px;font-weight:800;letter-spacing:.1em">BAO.DUMPLING · ADMIN</p><h2 style="margin:8px 0">${page === 'admin' ? '管理后台登录' : '历史数据登录'}</h2><p style="color:#5c7591">${firstUse ? '首次使用，请创建管理员密码。' : '请输入管理员密码后继续。'}</p><label style="display:block;font-weight:700">${firstUse ? '创建管理员密码' : '管理员密码'}<input id="admin-gate-password" type="password" required autofocus style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid #bcd1e8;border-radius:9px;font-size:16px"></label>${firstUse ? '<label style="display:block;margin-top:12px;font-weight:700">确认管理员密码<input id="admin-gate-confirm" type="password" required style="display:block;width:100%;margin-top:7px;padding:12px;border:1px solid #bcd1e8;border-radius:9px;font-size:16px"></label>' : ''}<p id="admin-gate-error" style="min-height:20px;margin:14px 0 6px;color:#a22b2b"></p><button type="submit" style="width:100%;padding:13px;border:0;border-radius:9px;background:#f1bc54;color:#072b5c;font-size:16px;font-weight:900;cursor:pointer">登录 · Connexion</button></form>`;
  document.body.append(gate);
  gate.querySelector('#admin-login-form').onsubmit = event => {
    event.preventDefault();
    const password = gate.querySelector('#admin-gate-password').value;
    const confirmPassword = gate.querySelector('#admin-gate-confirm')?.value || password;
    const error = gate.querySelector('#admin-gate-error');
    if (firstUse) {
      if (password !== confirmPassword) { error.textContent = '两次密码不一致'; return; }
      localStorage.setItem(passwordKey, password);
      const log = JSON.parse(localStorage.getItem(auditKey) || '[]');
      log.push({ time: new Date().toLocaleString('fr-FR'), action: '设置管理员密码', details: '管理后台首次登录时设置' });
      localStorage.setItem(auditKey, JSON.stringify(log.slice(-250)));
    } else if (password !== stored) { error.textContent = '管理员密码不正确'; return; }
    gate.remove();
    app.style.visibility = '';
    app.removeAttribute('aria-hidden');
  };
})();
