(() => {
 if(!['pos','admin'].includes(document.body.dataset.page))return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number(n||0).toFixed(2).replace('.',',')+' €';
 function confirmPayment(order,action,method){return new Promise(resolve=>{
  const paying=action!=='void',simulated=action==='mock-pay',dialog=document.createElement('dialog');dialog.className='cleanup-dialog payment-confirm-dialog';dialog.setAttribute('aria-labelledby','payment-confirm-title');
  dialog.innerHTML='<form method="dialog"><button class="cleanup-close" value="cancel" aria-label="Fermer · 关闭">×</button><p class="cleanup-eyebrow">Confirmation · 核对订单</p><h2 id="payment-confirm-title"></h2><p class="payment-confirm-service"></p><div class="payment-confirm-items receipt-items"></div><div class="receipt-total"><span>Total de la commande<br>本单总额</span><strong></strong></div><p class="cleanup-keep"></p><div class="cleanup-actions"><button class="button" value="cancel" autofocus>Retour · 返回</button><button class="button cleanup-submit" value="confirm"></button></div></form>';
  dialog.querySelector('h2').textContent=paying?(simulated?'Simuler le paiement · 模拟付款':'Confirmer l’encaissement · 确认收款'):'Invalider la commande · 作废订单';
  dialog.querySelector('.payment-confirm-service').textContent='N° '+order.pickupNumber+' · '+(order.service==='打包'?'À emporter / 打包':'Sur place / 堂食')+(order.tableNumber?' · Table '+order.tableNumber:'');
  dialog.querySelector('.payment-confirm-items').innerHTML=order.items.map(i=>'<p>'+escape(i.fr||i.dish)+' / '+escape(i.dish)+' × '+i.qty+(i.filling?'<br>'+escape(i.fillingFr||i.filling)+' · '+escape(i.styleFr||i.style):'')+(window.BaoBundles?.html(i)||'')+'</p>').join('');
  dialog.querySelector('.receipt-total strong').textContent=money(order.total);
  dialog.querySelector('.cleanup-keep').textContent=simulated?'Aucun débit. Après confirmation, la commande sera envoyée en cuisine. / 不会扣款，确认后发送厨房。':paying?'Vérifiez le paiement reçu : '+method+' / 请确认已实际收到款项，确认后发送厨房。':'Cette commande ne sera pas envoyée en cuisine. / 作废后不会发送厨房。';
  dialog.querySelector('.cleanup-submit').textContent=paying?'Confirmer et envoyer en cuisine / 确认并发送厨房':'Invalider · 确认作废';
  dialog.addEventListener('close',()=>{const ok=dialog.returnValue==='confirm';dialog.remove();resolve(ok)},{once:true});document.body.append(dialog);dialog.showModal();
 })}
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
  holder.innerHTML=orders.length?orders.map(o=>`<article class="pending-payment-row"><div><strong>订单号 ${escape(o.pickupNumber)} · ${escape(o.service)}${o.tableNumber?' · '+escape(o.tableNumber)+' 桌':''}</strong><small>${escape(o.dateKey)} ${escape(o.time)}</small><p>${o.items.map(i=>escape(i.fr||i.dish)+(i.filling?' · '+escape(i.fillingFr||i.filling)+' / '+escape(i.styleFr||i.style):'')+' / '+escape(i.dish)+' × '+i.qty+(window.BaoBundles?.html(i)||'')).join('<br>')}</p></div><div class="pending-payment-actions"><strong>应收 ${money(o.total)}</strong><label>${mock?'付款方式':'实际收款方式'}<select data-id="${escape(o.id)}" aria-label="订单 ${escape(o.pickupNumber)} 收款方式">${mock?'<option>模拟付款</option>':'<option>现金</option><option>银行卡</option><option>二维码</option>'}</select></label><button class="button green" data-receive="${escape(o.id)}">${mock?'Confirmer le paiement simulé · 确认模拟付款':'确认已收款'}</button><button class="button danger" data-cancel-pending="${escape(o.id)}">Invalider · 作废未付款单</button></div></article>`).join(''):'<p class="empty compact">暂无待收款的自助订单</p>';
  if(window.BaoRuntime?.role==='cashier')holder.querySelectorAll('[data-cancel-pending]').forEach(el=>el.hidden=true);
  holder.querySelectorAll('select').forEach(el=>{if(selected.has(el.dataset.id))el.value=selected.get(el.dataset.id)});
  holder.querySelectorAll('[data-receive],[data-cancel-pending]').forEach(button=>button.onclick=async()=>{
   if(busy)return;
   const id=button.dataset.receive||button.dataset.cancelPending,order=BaoOrders.all().find(o=>o.id===id),action=button.dataset.receive?(mock?'mock-pay':'pay'):'void';
   if(!order)return;
   const method=holder.querySelector('select[data-id="'+id+'"]').value;
   busy=true;let accepted=false;try{accepted=await confirmPayment(order,action,method)}finally{busy=false}if(!accepted){render();return;}
   busy=true;holder.querySelectorAll('button,select').forEach(el=>el.disabled=true);
   const message=section.querySelector('#pending-payment-message');message.textContent='Enregistrement… Ne facturez pas deux fois. / 正在保存，请勿重复收款';
   try{await BaoOrders.change(id,action,undefined,{payment:method});message.textContent=['pay','mock-pay'].includes(action)?'订单 '+order.pickupNumber+' : envoyée en cuisine / 已登记并发送厨房。':'Commande invalidée / 未付款订单已作废。'}catch(error){message.textContent=window.BaoPosFrench?.error(error.message)||error.message}finally{busy=false;render()}
  });
 }
 window.addEventListener('bao-orders-change',render);render();
})();
