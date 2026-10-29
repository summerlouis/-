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
      document.querySelector('.payment').innerHTML='<p class="note">付款方式：模拟付款（不扣款）<br>添加商品后，点击下方按钮提交订单。</p>';
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
    if(page==='kitchen'&&mock)document.querySelector('.hint').textContent='模拟付款后进入厨房 · 按顺序操作：开始制作 → 待取餐 → 完成出餐';
    if(page==='admin'&&mock){
      const controls=document.createElement('div');controls.className='order-filters';controls.innerHTML='<button type="button" class="button danger" id="cleanup-orders">清理已结束的订单</button><span id="cleanup-message" role="status"></span>';document.querySelector('#admin-orders').before(controls);
      const button=controls.querySelector('button'),message=controls.querySelector('span');
      const call=async body=>{const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'清理失败');return data};
      button.onclick=async()=>{button.disabled=true;try{const preview=await call({action:'cleanup-preview'});if(!preview.count){message.textContent='暂无可清理的已结束模拟订单';return}if(!confirm('将清理 '+preview.count+' 笔已完成、已取消或已作废的模拟订单（包含往日记录）。待付款及厨房进行中的订单会保留。确认清理？'))return;const result=await call({action:'cleanup',ids:preview.ids});await BaoOrders.refresh();message.textContent='已清理 '+result.count+' 笔模拟订单';}catch(error){message.textContent=error.message}finally{button.disabled=false}};
    }
    if(page!=='pos')return;
    const panel=document.createElement('section');panel.className='panel live-orders';panel.innerHTML='<h2>三端订单状态</h2><p class="note">自动显示顾客与 POS 订单，桌号、金额及制作状态同步更新。</p><div class="order-filters" role="group" aria-label="订单范围"><button class="button" data-order-filter="active" aria-pressed="true">进行中</button><button class="button" data-order-filter="all" aria-pressed="false">今日全部</button><span id="live-order-count" role="status"></span></div><div id="pos-live-orders"></div>';document.querySelector('main').append(panel);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    panel.addEventListener('click',async event=>{const button=event.target.closest('[data-cancel-order]');if(!button||button.disabled)return;const order=BaoOrders.all().find(o=>o.id===button.dataset.cancelOrder);if(!order)return;if(!confirm('取消 '+order.pickupNumber+' 号订单'+(order.tableNumber?'（'+order.tableNumber+' 桌）':'')+'？厨房将同步移除，取消记录会保留。'))return;button.disabled=true;try{await BaoOrders.change(order.id,'cancel');}catch(error){alert(error.message)}finally{button.disabled=false}});
    let filter='active';
    panel.querySelectorAll('[data-order-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.orderFilter;panel.querySelectorAll('[data-order-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));render()});
    function render(){const today=new Date().toDateString(),all=BaoOrders.all().filter(o=>o.day===today),active=all.filter(o=>!['voided','cancelled','done'].includes(o.status)&&o.kitchenStatus!=='complete'),rows=(filter==='active'?active:all).slice(-100).reverse();panel.querySelector('#live-order-count').textContent='进行中 '+active.length+' 单 · 今日 '+all.length+' 单';panel.querySelector('#pos-live-orders').innerHTML=rows.length?rows.map(o=>`<article class="live-order" data-live-order="${esc(o.id)}" data-order-state="${esc(o.status==='pending'?'pending':o.kitchenStatus||'new')}"><b>${esc(o.pickupNumber)} · ${esc(o.service)}${o.tableNumber?' · '+esc(o.tableNumber)+' 桌':''}</b><span>${esc(o.status==='pending'?'待模拟付款':o.status==='voided'?'已作废':o.status==='cancelled'?'已取消':({new:'待制作',making:'制作中',ready:'待取餐',complete:'已完成'}[o.kitchenStatus]||o.status))}</span><strong>${Number(o.total).toFixed(2)} €${o.isTest?' · 模拟':''}</strong>${mock&&o.isTest&&['pending','paid'].includes(o.status)&&o.kitchenStatus!=='complete'?`<button type="button" class="button danger" data-cancel-order="${esc(o.id)}">取消本次订单</button>`:''}</article>`).join(''):'<p class="empty">'+(filter==='active'?'暂无进行中的订单，新的点单会自动出现在这里。':'今日暂无订单')+'</p>'}
    window.addEventListener('bao-orders-change',render);render();
  });
})();
