(() => {
  const mock=window.BaoRuntime?.mode==='mock',page=document.body.dataset.page;
  if(page==='admin' && window.BaoRuntime?.imageUploads===false){
    const disableUploads=()=>{document.querySelectorAll('[data-select-image], [data-image-input], #new-product-image').forEach(el=>{el.disabled=true;el.title='当前测试环境未启用图片上传'});};
    disableUploads();new MutationObserver(disableUploads).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
    const help=document.querySelector('#new-product-image-help');if(help)help.textContent='当前测试环境暂不上传新图片，现有菜单图片正常显示。';
  }
  if (mock) {
    const banner=document.createElement('p');banner.className='mock-banner';banner.textContent='模拟测试 · 不会扣款 · 不计入真实营业收入';document.querySelector('main')?.prepend(banner);
    if(page==='self'){
      document.querySelector('.customer-intro p').textContent='选餐 → 填写桌号 → 模拟付款 → 查看制作状态';
      document.querySelector('.step').textContent='1 选产品　2 提交订单　3 模拟付款';
      document.querySelector('#confirmation-title').textContent='核对订单，稍后模拟付款';
      document.querySelector('#payment-dialog .modal > small').textContent='这是模拟测试，不会扣款。提交后点击“模拟付款”，厨房即可接单。';
    }
    if(page==='pos'){
      document.querySelector('.payment').innerHTML='<button class="button pay selected" data-payment="模拟付款">模拟付款 · 不扣款</button>';
      document.querySelector('.hint').textContent='模拟测试：选择商品、填写桌号后保存，订单自动发送至厨房，不计入真实营业收入。';
    }
  }
  if(['self','pos'].includes(page)){
    const storage='baoTable:'+String(window.BaoRuntime?.storeId||'default')+':'+page;
    const label=document.createElement('label');label.className='table-field';label.innerHTML='桌号 / Table <input id="table-number" maxlength="20" autocomplete="off" placeholder="例如 05"><small>堂食填写桌号，打包无需填写</small>';
    document.querySelector(page==='self'?'.service':'.pos-service').after(label);
    const input=label.querySelector('input'),prefill=new URL(location.href).searchParams.get('table');
    try{input.value=prefill||sessionStorage.getItem(storage)||''}catch{input.value=prefill||''}
    input.oninput=()=>{try{sessionStorage.setItem(storage,input.value)}catch{}};
    window.BaoTable={
      value(service){return service==='打包'?'':input.value.trim()},
      validate(service){if(service==='打包')return true;const value=input.value.trim();if((mock&&!value)||(value&&!/^[\p{L}\p{N} -]{1,20}$/u.test(value))){input.focus();input.setCustomValidity('请填写桌号，最多 20 位文字或数字');input.reportValidity();input.setCustomValidity('');return false}return true},
      sync(service,pending){label.hidden=service==='打包';input.disabled=Boolean(pending);if(pending)input.value=pending.tableNumber||''},
    };
    document.querySelectorAll('[data-pos-service]').forEach(button=>button.addEventListener('click',()=>{if(!BaoOrders.pending('pos'))label.hidden=button.dataset.posService==='打包'}));
  }
  window.addEventListener('DOMContentLoaded',()=>{
    if(mock)document.querySelector('.sync-tools > span')?.replaceChildren(document.createTextNode('模拟测试版'));
    if(window.BaoRuntime?.events&&window.BaoRuntime.role!=='customer'){
      const button=document.createElement('button');button.type='button';button.className='button';button.textContent='退出设备配对';button.onclick=async()=>{const response=await fetch('/api/device-session',{method:'DELETE'});if(response.ok)location.href='/';else alert('退出失败，请重试')};document.querySelector('header nav')?.append(button);
    }
    if(page!=='pos')return;
    const panel=document.createElement('section');panel.className='panel live-orders';panel.innerHTML='<h2>三端订单状态</h2><p class="note">自动显示顾客与 POS 订单，桌号、金额及制作状态同步更新。</p><div id="pos-live-orders"></div>';document.querySelector('main').append(panel);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function render(){const today=new Date().toDateString(),rows=BaoOrders.all().filter(o=>o.day===today).slice(-100).reverse();panel.querySelector('#pos-live-orders').innerHTML=rows.length?rows.map(o=>`<article class="live-order" data-live-order="${esc(o.id)}"><b>${esc(o.pickupNumber)} · ${esc(o.service)}${o.tableNumber?' · '+esc(o.tableNumber)+' 桌':''}</b><span>${esc(o.status==='pending'?'待模拟付款':o.status==='voided'?'已作废':o.status==='cancelled'?'已取消':({new:'待制作',making:'制作中',ready:'待取餐',complete:'已完成'}[o.kitchenStatus]||o.status))}</span><strong>${Number(o.total).toFixed(2)} €${o.isTest?' · 模拟':''}</strong></article>`).join(''):'<p class="empty">今日暂无订单</p>'}
    window.addEventListener('bao-orders-change',render);render();
  });
})();
