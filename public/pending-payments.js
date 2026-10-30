(() => {
 if(!['pos','admin'].includes(document.body.dataset.page))return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number(n||0).toFixed(2).replace('.',',')+' €';
 const mock=window.BaoRuntime?.mode==='mock';
 const section=document.createElement('section');section.className='panel pending-payments';
 section.innerHTML='<h2>自助待收款 <span id="pending-payment-count" class="pill">0</span></h2><p class="note">核对订单并实际收到款项后，再点“确认已收款”。金额按顾客提交时的价格；确认后计入营业额并送厨房。</p><div id="pending-payment-list"></div><p id="pending-payment-message" role="status" aria-live="polite"></p>';
 if(mock)section.querySelector('.note').textContent='模拟测试：Confirmer le paiement simulé · 确认模拟付款后发送厨房，不会扣款，不计入真实营业收入。';
 document.querySelector('.layout').before(section);
 let busy=false;
 function render(){
  const orders=BaoOrders.all().filter(o=>o.status==='pending'&&o.source==='self');
  section.querySelector('#pending-payment-count').textContent=orders.length;
  const holder=section.querySelector('#pending-payment-list'),selected=new Map([...holder.querySelectorAll('select')].map(el=>[el.dataset.id,el.value]));
  if(busy)return;
  holder.innerHTML=orders.length?orders.map(o=>`<article class="pending-payment-row"><div><strong>订单号 ${escape(o.pickupNumber)} · ${escape(o.service)}${o.tableNumber?' · '+escape(o.tableNumber)+' 桌':''}</strong><small>${escape(o.dateKey)} ${escape(o.time)}</small><p>${o.items.map(i=>escape(i.fr||i.dish)+(i.filling?' · '+escape(i.fillingFr||i.filling)+' / '+escape(i.styleFr||i.style):'')+' / '+escape(i.dish)+' × '+i.qty).join('<br>')}</p></div><div class="pending-payment-actions"><strong>应收 ${money(o.total)}</strong><label>${mock?'付款方式':'实际收款方式'}<select data-id="${escape(o.id)}" aria-label="订单 ${escape(o.pickupNumber)} 收款方式">${mock?'<option>模拟付款</option>':'<option>现金</option><option>银行卡</option><option>二维码</option>'}</select></label><button class="button green" data-receive="${escape(o.id)}">${mock?'Confirmer le paiement simulé · 确认模拟付款':'确认已收款'}</button><button class="button danger" data-cancel-pending="${escape(o.id)}">Invalider · 作废未付款单</button></div></article>`).join(''):'<p class="empty compact">暂无待收款的自助订单</p>';
  if(window.BaoRuntime?.role==='cashier')holder.querySelectorAll('[data-cancel-pending]').forEach(el=>el.hidden=true);
  holder.querySelectorAll('select').forEach(el=>{if(selected.has(el.dataset.id))el.value=selected.get(el.dataset.id)});
  holder.querySelectorAll('[data-receive],[data-cancel-pending]').forEach(button=>button.onclick=async()=>{
   if(busy)return;
   const id=button.dataset.receive||button.dataset.cancelPending,order=BaoOrders.all().find(o=>o.id===id),action=button.dataset.receive?(mock?'mock-pay':'pay'):'void';
   if(!order)return;
   const method=holder.querySelector('select[data-id="'+id+'"]').value;
   if(!confirm(action==='mock-pay'?'Confirmer le paiement simulé · 确认模拟付款 '+money(order.total)+' ? Aucun débit. / 不会扣款。':action==='pay'?'确认订单 '+order.pickupNumber+' 已实际收到 '+money(order.total)+'（'+method+'）？':'作废未付款订单 '+order.pickupNumber+'？此订单不会送厨房。'))return;
   busy=true;holder.querySelectorAll('button,select').forEach(el=>el.disabled=true);
   const message=section.querySelector('#pending-payment-message');message.textContent='Enregistrement… Ne facturez pas deux fois. / 正在保存，请勿重复收款';
   try{await BaoOrders.change(id,action,undefined,{payment:method});message.textContent=['pay','mock-pay'].includes(action)?'订单 '+order.pickupNumber+' : envoyée en cuisine / 已登记并发送厨房。':'Commande invalidée / 未付款订单已作废。'}catch(error){message.textContent=window.BaoPosFrench?.error(error.message)||error.message}finally{busy=false;render()}
  });
 }
 window.addEventListener('bao-orders-change',render);render();
})();
