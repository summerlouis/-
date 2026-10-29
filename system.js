
function renderProductAdmin(){
 const holder=document.querySelector('#product-admin');
 if(!holder)return;
 const list=products(),available=new Set(list.map(p=>p.code));
 holder.querySelectorAll('[data-product-row]').forEach(row=>{if(!available.has(row.dataset.productRow))row.remove()});
 holder.querySelector('.empty')?.remove();
 for(const product of list){
  let row=Array.from(holder.children).find(el=>el.dataset.productRow===product.code);
  if(!row){
   row=document.createElement('div');row.className='product-admin';row.dataset.productRow=product.code;
   row.innerHTML=`<div class="product-summary"><div class="admin-product-photo" hidden><img alt="" loading="lazy"></div><div><b></b><small></small></div></div><form class="price-editor" data-price-code="${escape(product.code)}"><label for="price-${escape(product.code)}">售价 €</label><input id="price-${escape(product.code)}" type="number" min="0" max="99999.99" step="0.01" inputmode="decimal" required><button class="button primary" type="submit">保存价格</button></form><div class="product-actions"><button type="button" class="button" data-toggle="${escape(product.code)}"></button><button type="button" class="button danger" data-delete-product="${escape(product.code)}">删除商品</button><button type="button" class="button" data-select-image="${escape(product.code)}">选择图片</button><input type="file" data-image-input accept="image/jpeg,image/png,image/webp" aria-label="为 ${escape(product.code)} 选择产品图片" hidden></div><p class="photo-message" role="status" aria-live="polite"></p>`;
   const form=row.querySelector('form'),input=form.querySelector('input');
   input.addEventListener('focus',()=>{form.dataset.editing='true'});
   input.addEventListener('input',()=>{form.dataset.editing='true'});
   form.addEventListener('focusout',()=>setTimeout(()=>{
    if(!form.contains(document.activeElement)&&form.dataset.saving!=='true'){delete form.dataset.editing;renderProductAdmin()}
   },0));
   form.onsubmit=async event=>{
    event.preventDefault();if(form.dataset.saving==='true')return;
    const button=form.querySelector('button'),code=form.dataset.priceCode,old=BaoCatalog.get(code)?.price,price=Number(input.value),revision=Number(form.dataset.revision);
    form.dataset.saving='true';button.disabled=true;
    try{
     await BaoCatalog.update(code,{price},revision);audit('修改价格',code+' · '+money(old)+' → '+money(price));delete form.dataset.editing;
     document.querySelector('#price-message').textContent=code+' 价格已保存，POS 和自助点餐自动更新';
    }catch(error){
     const current=BaoCatalog.get(code);
     if(!current||Number(current.revision||0)!==revision){delete form.dataset.editing;document.querySelector('#price-message').textContent=code+' 已在另一台设备修改，已显示最新价格。请核对后重新输入并保存。'}
     else document.querySelector('#price-message').textContent=error.message;
    }finally{delete form.dataset.saving;button.disabled=false;renderProductAdmin()}
   };
   const deleteButton=row.querySelector('[data-delete-product]');
   deleteButton.onclick=async()=>{
    const code=deleteButton.dataset.deleteProduct,current=BaoCatalog.get(code);
    if(!current){renderProductAdmin();return}
    if(!confirm('确认删除 '+code+' · '+current.dish+'？\n删除后会从后台、POS、自助点餐及未付款购物车移除。历史订单和成交金额保留。\n若只是暂停售卖，请取消并选择“下架”。'))return;
    deleteButton.disabled=true;
    try{await BaoCatalog.remove(code,Number(deleteButton.dataset.revision));audit('删除商品',code+' · '+current.dish);initAdminDelete();document.querySelector('#price-message').textContent=code+' · '+current.dish+' 已删除，历史订单保持不变。'}
    catch(error){document.querySelector('#price-message').textContent=error.name==='TimeoutError'||error instanceof TypeError?'网络异常，删除结果尚未确认，请刷新商品列表后核对。':error.message}
    finally{deleteButton.disabled=false}
   };
   const toggle=row.querySelector('[data-toggle]');
   toggle.onclick=async()=>{toggle.disabled=true;try{const code=toggle.dataset.toggle,current=BaoCatalog.get(code);if(!current)return;const active=!(current.listed??current.active);await BaoCatalog.update(code,{active});audit(active?'商品上架':'商品下架',code);initAdminDelete()}catch(error){document.querySelector('#price-message').textContent=error.message}finally{toggle.disabled=false}};
   const photoButton=row.querySelector('[data-select-image]'),photoInput=row.querySelector('[data-image-input]'),photoMessage=row.querySelector('.photo-message');
   photoButton.onclick=()=>{if(row.dataset.photoBusy!=='true')photoInput.click()};
   photoInput.onchange=async()=>{
    const file=photoInput.files[0],current=BaoCatalog.get(product.code);if(!file||!current)return;
    row.dataset.photoBusy='true';row.querySelectorAll('button,input').forEach(el=>el.disabled=true);photoMessage.dataset.state='';photoMessage.textContent='正在处理图片…';photoButton.textContent='上传中…';
    try{
     const prepared=await BaoCatalog.prepareImage(file);photoMessage.textContent='正在上传并同步图片，请稍候…';
     const uploaded=await BaoCatalog.uploadImage(prepared);
     await BaoCatalog.update(current.code,{imageId:uploaded.imageId},current.revision||0);
     audit('更新商品图片',current.code+' · '+current.dish);photoMessage.textContent='图片已保存，收银 POS 和自助点餐约 2 秒内更新。';photoMessage.dataset.state='success';
    }catch(error){photoMessage.textContent=error instanceof TypeError||error.name==='TimeoutError'?'网络异常，图片保存结果暂未确认。请刷新商品列表核对；若未更新，可重新选择图片。':error.message;photoMessage.dataset.state='error'}
    finally{delete row.dataset.photoBusy;row.querySelectorAll('button,input').forEach(el=>el.disabled=false);photoInput.value='';photoButton.textContent='选择图片';renderProductAdmin()}
   };
   holder.append(row);
  }
  row.classList.toggle('blocked',!product.active);
  row.querySelector('b').textContent=product.code+' · '+product.dish;
  row.querySelector('small').textContent=product.fr+' · '+money(product.price);
  const photo=row.querySelector('.admin-product-photo'),image=photo.querySelector('img'),source=BaoCatalog.imageFor(product);
  photo.hidden=!source||image.dataset.failedSource===source;photo.classList.toggle('default-product-photo',!BaoCatalog.customImage(product));photo.dataset.category=product.category;
  if(source&&image.getAttribute('src')!==source){delete image.dataset.failedSource;image.src=source;image.alt=product.dish+' 产品图';image.onerror=()=>{image.dataset.failedSource=source;photo.hidden=true}}
  const form=row.querySelector('form');
  if(form.dataset.editing!=='true'&&form.dataset.saving!=='true'){
   form.querySelector('input').value=Number(product.price).toFixed(2);form.dataset.revision=String(product.revision||0);
  }
  let sold=row.querySelector('[data-soldout]');if(!sold){sold=document.createElement('button');sold.type='button';sold.className='button';sold.dataset.soldout=product.code;row.querySelector('.product-actions').append(sold);sold.onclick=async()=>{sold.disabled=true;try{const latest=BaoCatalog.get(sold.dataset.soldout);await BaoCatalog.update(latest.code,{soldOut:!latest.soldOut});}catch(e){document.querySelector('#price-message').textContent=e.message}finally{sold.disabled=false}}}sold.textContent=product.soldOut?'恢复销售':'标记售罄';sold.disabled=!(product.listed??product.active);row.querySelector('.product-summary b').textContent=product.code+' · '+product.dish+(product.soldOut?' · 售罄':'');
  row.querySelector('[data-toggle]').textContent=(product.listed??product.active)?'下架':'上架';
  row.querySelector('[data-delete-product]').dataset.revision=String(product.revision||0);
 }
 if(!list.length)holder.innerHTML='<p class="empty">暂无商品，可在上方录入新商品。</p>';
}
window.addEventListener('bao-catalog-change',()=>{if(document.body.dataset.page==='admin')renderProductAdmin()});
const ORDER_KEY='baoDumplingOrders',CATALOG_KEY='baoDumplingCatalog',AUDIT_KEY='baoDumplingAudit',ADJUSTMENT_KEY='baoDumplingAdjustments',ARCHIVE_KEY='baoDumplingMonthArchives',PASSWORD_KEY='baoDumplingManagerPassword';

const read=(key,fallback=[])=>JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const products=()=>BaoCatalog.all();
const orders=()=>BaoOrders.all();
const adjustments=()=>BaoCatalog.cloud?[]:read(ADJUSTMENT_KEY);
const month=()=>[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0')].join('-'),day=()=>new Date().toDateString();
const money=value=>`${Number(value||0).toFixed(2).replace('.',',')} €`;
const escape=value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const quantity=item=>Math.max(1,Number(item.qty)||1);
const orderTotal=order=>(order.items||[]).reduce((sum,item)=>sum+Number(item.price||0)*quantity(item),0);
const paid=order=>order.status==='paid'||order.status==='done';
const financialTotal=order=>order.isTest?0:Number(order.paidTotal??orderTotal(order))+Number((order.corrections||[]).reduce((sum,item)=>sum+Number(item.amount||0),0));
const audit=(action,details)=>{const list=read(AUDIT_KEY);list.push({time:new Date().toLocaleString('fr-FR'),action,details});write(AUDIT_KEY,list.slice(-250));};
function requireManager(){return true}
function productByCode(code){return products().find(item=>item.code.toUpperCase()===String(code).trim().toUpperCase())}
function itemFromProduct(product,qty=1){return {code:product.code,category:product.category,dish:product.dish,fr:product.fr,price:Number(product.price),qty:Number(qty)}}
function saveOrders(value){write(ORDER_KEY,value)}
function activePaid(){return orders().filter(order=>!order.isTest&&paid(order)&&!['cancelled','voided'].includes(order.status))}
function netFor(filter){const sales=activePaid().filter(filter).reduce((sum,order)=>sum+financialTotal(order),0);const manual=adjustments().filter(item=>item.kind!=='correction'&&filter(item)).reduce((sum,item)=>sum+Number(item.amount||0),0);return sales+manual}
function navRefresh(){window.addEventListener('storage',event=>{if(event.key===CATALOG_KEY||page==='pos')return;if(page==='admin')initAdminDelete();if(page==='owner')initOwner()});}
function kitchenLabel(status){return status==='making'?'制作中':status==='ready'?'待取餐':status==='complete'?'已完成':'待制作'}
async function refundOrder(id){if(!confirm("确认登记退款？此操作只更新账目，请另行完成实际退款。"))return;try{await BaoOrders.change(id,"refund");initAdminDelete()}catch(error){alert(error.message)}}
function correctOrder(id){openDeleteDialog(id)}
function initAdmin(){const list=orders(),todayOrders=list.filter(order=>order.day===day()),net=netFor(order=>order.day===day()),refunds=todayOrders.filter(order=>order.status==='cancelled'&&order.refundAmount).reduce((sum,order)=>sum+Number(order.refundAmount),0);document.querySelector('#admin-net').textContent=money(net);document.querySelector('#admin-paid').textContent=todayOrders.filter(o=>paid(o)&&!o.isTest).length;document.querySelector('#admin-refunds').textContent=money(refunds);document.querySelector('#admin-kitchen').textContent=todayOrders.filter(order=>paid(order)&&!['ready','complete'].includes(order.kitchenStatus||'new')).length;const holder=document.querySelector('#admin-orders');holder.innerHTML=todayOrders.length?[...todayOrders].reverse().map(order=>`<article class="order-row"><div class="order-top"><b>${escape(order.id)}${order.tableNumber?' · '+escape(order.tableNumber)+' 桌':''}${order.isTest?' · 模拟订单':''}</b><span class="status ${order.status}">${order.status==='voided'?'已作废':order.status==='cancelled'?(order.isTest?'已取消':'已退款取消'):order.status==='paid'?'已付款':order.status==='pending'?'待付款':'已完成'}</span></div><p>${order.items.map(item=>`${escape(item.code||'')} · ${escape(item.dish)} × ${quantity(item)}`).join('<br>')}</p><footer><strong>${money(order.status==='pending'||order.isTest?order.total:financialTotal(order))}</strong>${!['cancelled','voided'].includes(order.status)?`<span><button class="button" data-correct="${order.id}">纠错</button>${paid(order)?`<button class="button danger" data-refund="${order.id}">退款取消</button>`:''}</span>`:''}</footer></article>`).join(''):'<p class="empty">今日暂无订单</p>';holder.querySelectorAll('[data-correct]').forEach(button=>button.onclick=()=>correctOrder(button.dataset.correct));holder.querySelectorAll('[data-refund]').forEach(button=>button.onclick=()=>refundOrder(button.dataset.refund));renderProductAdmin();if(!window.BaoAudit)document.querySelector('#admin-audit').innerHTML=read(AUDIT_KEY).slice(-12).reverse().map(entry=>`<div><b>${escape(entry.action)}</b> · ${escape(entry.details)}<br><small>${escape(entry.time)}</small></div>`).join('')||'<p class="empty">暂无操作记录</p>';document.querySelector('#admin-close-month').onclick=closeMonth}
async function closeMonth(){const date=new Date();date.setMonth(date.getMonth()-1);const suggested=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');const key=prompt('输入要归档的已结束月份（YYYY-MM）',suggested);if(!key)return;if(!confirm('归档 '+key+' 后，该月订单不可再修改，是否继续？'))return;try{await BaoOrders.close(key);alert('月份已归档');initAdminDelete()}catch(error){alert(error.message)}}
function initOwner(){const monthOrders=orders().filter(order=>order.month===month()),refunds=monthOrders.filter(order=>order.status==='cancelled'&&order.refundAmount).reduce((sum,order)=>sum+Number(order.refundAmount),0);document.querySelector('#owner-today').textContent=money(netFor(order=>order.day===day()));document.querySelector('#owner-month').textContent=money(netFor(order=>order.month===month()));document.querySelector('#owner-refunds').textContent=money(refunds);document.querySelector('#owner-orders').textContent=monthOrders.filter(o=>paid(o)&&!o.isTest).length;const totals=Object.create(null);monthOrders.filter(o=>paid(o)&&!o.isTest).forEach(order=>order.items.forEach(item=>{totals[item.dish]=(totals[item.dish]||0)+quantity(item)}));const ranked=Object.entries(totals).sort((a,b)=>b[1]-a[1]),max=ranked[0]?.[1]||1;document.querySelector('#owner-products').innerHTML=ranked.length?ranked.slice(0,6).map(([name,count])=>`<div class="bar-line"><span>${escape(name)}</span><i style="width:${Math.max(8,count/max*100)}%"></i><b>${count} 份</b></div>`).join(''):'<p class="empty">本月尚无销售</p>';document.querySelector('#owner-archives').innerHTML=BaoOrders.closures().map(c=>({month:c.month,closedAt:c.closed_at,orders:orders().filter(o=>o.month===c.month).length,net:netFor(o=>o.month===c.month)})).reverse().map(item=>`<div><b>${item.month}</b> · ${money(item.net)}<br><small>${item.orders} 单 · ${escape(item.closedAt)}</small></div>`).join('')||'<p class="empty">尚无归档月份</p>'}
function initPOSAdvanced(){
 let cart=(BaoOrders.pending('pos')?.items||JSON.parse(sessionStorage.getItem('baoPosCart')||'[]')).map(item=>({...item})),payment=window.BaoRuntime?.mode==='mock'?'模拟付款':'现金',selection={},submitting=false;
 const catalog=document.querySelector('#pos-catalog'),cartBox=document.querySelector('#pos-cart'),input=document.querySelector('#code-input'),dialog=document.querySelector('#pos-choice'),step=document.querySelector('#pos-step'),title=document.querySelector('#pos-product'),subtitle=document.querySelector('#pos-subtitle'),optionBox=document.querySelector('#pos-options'),payButton=document.querySelector('#pay-pos');
 const fillings=[['韭菜鸡蛋','Poireau et œuf'],['鲜肉','Porc'],['牛肉','Bœuf']],cookings={包子:[['清蒸','Vapeur'],['煎包','Poêlé']],饺子:[['水煮','À l’eau'],['清蒸','Vapeur'],['煎饺','Poêlés']]};
 const locked=()=>submitting||Boolean(BaoOrders.pending('pos'));
 const totalFor=items=>items.reduce((sum,item)=>sum+Math.round(Number(item.price)*100)*quantity(item),0)/100;
 const cartSignature=items=>JSON.stringify(items.map(item=>[item.code,quantity(item),Number(item.price)]));
 function render(){
  const pending=BaoOrders.pending('pos');
  if(pending)cart=pending.items.map(item=>({...item}));
  else if(!submitting)cart=BaoCatalog.reprice(cart);
  sessionStorage.setItem('baoPosCart',JSON.stringify(cart));
  const query=document.querySelector('.catalog-search')?.value.trim().toLowerCase()||'';
  catalog.innerHTML=products().filter(item=>item.active||item.soldOut).map(item=>{const image=BaoCatalog.imageFor(item);return `<button class="product" ${item.soldOut?'disabled':''} data-code="${escape(item.code)}">${item.soldOut?'<span class="soldout-label">售罄</span>':''}${image?`<span class="pos-product-photo ${BaoCatalog.customImage(item)?'':'default-product-photo'}" data-category="${escape(item.category)}"><img src="${escape(image)}" alt="" loading="lazy"></span>`:''}<b>${escape(item.code)}</b><strong>${escape(item.dish)}</strong><small>${escape(item.fr)} · ${money(item.price)}</small></button>`}).join('');
  catalog.querySelectorAll('img').forEach(image=>image.onerror=()=>{image.parentElement.hidden=true});
  catalog.querySelectorAll('button').forEach(button=>{button.onclick=()=>begin(button.dataset.code);button.hidden=!button.textContent.toLowerCase().includes(query)});
  document.querySelector('#cart-count').textContent=`${cart.reduce((sum,item)=>sum+quantity(item),0)} 件`;
  cartBox.innerHTML=cart.length?cart.map((item,index)=>`<div class="cart-row"><div class="pos-item-details"><b>${escape(item.code)}</b> ${escape(item.dish)}<small>${escape(item.fr)}${item.filling?` · ${escape(item.filling)} / ${escape(item.fillingFr)} · ${escape(item.style)} / ${escape(item.styleFr)}`:''}</small><div class="quantity-control"><button type="button" class="button" data-decrease="${index}" aria-label="减少 ${escape(item.dish)} 数量" ${quantity(item)<=1||locked()?'disabled':''}>−</button><strong aria-label="数量">${quantity(item)}</strong><button type="button" class="button" data-increase="${index}" aria-label="增加 ${escape(item.dish)} 数量" ${quantity(item)>=999||locked()?'disabled':''}>＋</button></div></div><div class="pos-item-actions"><strong>${money(Math.round(Number(item.price)*100)*quantity(item)/100)}</strong><button type="button" class="button" data-remove="${index}" aria-label="移除 ${escape(item.dish)}" ${locked()?'disabled':''}>移除</button></div></div>`).join(''):'<p class="empty">请输入编码或点击商品。</p>';
  cartBox.querySelectorAll('[data-decrease],[data-increase]').forEach(button=>button.onclick=()=>{
   if(locked())return;const increasing='increase'in button.dataset,index=Number(increasing?button.dataset.increase:button.dataset.decrease),item=cart[index];
   if(item)item.qty=Math.max(1,Math.min(999,quantity(item)+(increasing?1:-1)));render();
  });
  cartBox.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{if(locked())return;cart.splice(Number(button.dataset.remove),1);render()});
  document.querySelector('#pos-total').textContent=money(totalFor(cart));
  payButton.disabled=submitting||(!cart.length&&!pending);
  payButton.textContent=!cart.length&&!pending?'请先点击商品加入订单':pending?'重试确认上次订单（勿重复收款）':window.BaoRuntime?.mode==='mock'?'模拟付款并发送厨房':'已收款，保存订单并发送厨房';
  window.BaoTable?.sync(document.querySelector('[data-pos-service].selected')?.dataset.posService||'堂食',pending);
  window.dispatchEvent(new Event('bao-pos-render'));
 }
 function addItem(){
  if(locked())return;
  selection.product=BaoCatalog.get(selection.product.code);
  if(!selection.product?.active){dialog.close();alert('商品已下架');return}
  const item={...itemFromProduct(selection.product),filling:selection.filling||'',fillingFr:selection.fillingFr||'',style:selection.style||'',styleFr:selection.styleFr||''},same=cart.find(entry=>entry.code===item.code&&entry.filling===item.filling&&entry.style===item.style);
  if(same&&quantity(same)>=999){alert('同一商品和做法最多添加 999 份');return}
  if(same)same.qty=quantity(same)+1;else cart.push(item);
  dialog.close();input.value='';render();
 }
 function choices(values,handler){optionBox.innerHTML='';values.forEach(([zh,fr])=>{const button=document.createElement('button');button.type='button';button.innerHTML=`${zh}<small style="display:block;font-weight:400">${fr}</small>`;button.onclick=()=>handler(zh,fr);optionBox.append(button)})}
 function chooseCooking(){step.textContent='步骤 2 / 2 · Choisir la cuisson';title.textContent=`${selection.product.code} · ${selection.product.dish}`;subtitle.textContent=`${selection.filling} · ${selection.fillingFr}`;choices(cookings[selection.product.category],(zh,fr)=>{selection.style=zh;selection.styleFr=fr;addItem()})}
 function begin(code){
  if(locked())return;
  const product=productByCode(code);if(!product||!product.active){alert('未找到可售商品编码 / Code indisponible');return}
  if(window.BaoVariantPicker?.open(product,items=>{if(locked())throw Error('订单正在提交，请稍后');for(const item of items){const same=cart.find(x=>x.code===item.code&&x.filling===item.filling&&x.style===item.style);if((same?quantity(same):0)+item.qty>999)throw Error('同一规格最多 999 份')}for(const item of items){const same=cart.find(x=>x.code===item.code&&x.filling===item.filling&&x.style===item.style);if(same)same.qty+=item.qty;else cart.push(item)}input.value='';render()}))return;
  selection={product};if(!cookings[product.category]){addItem();return}
  step.textContent='步骤 1 / 2 · Choisir la garniture';title.textContent=`${product.code} · ${product.dish}`;subtitle.textContent=product.fr;
  choices(({A1:[['韭菜鸡蛋','Poireau et œuf']],A2:[['猪肉白菜','Porc et chou'],['鲜肉','Porc'],['韭菜猪肉','Porc et poireau']],A3:[['红油牛肉包','Bao au bœuf pimenté'],['牛肉鲜肉包','Bao au bœuf frais']]}[product.code]||fillings),(zh,fr)=>{selection.filling=zh;selection.fillingFr=fr;chooseCooking()});dialog.showModal();
 }
 document.querySelector('#add-code').onclick=()=>begin(input.value);
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();begin(input.value)}});
 document.querySelectorAll('.pay').forEach(button=>button.onclick=()=>{if(locked())return;payment=button.dataset.payment;document.querySelectorAll('.pay').forEach(item=>item.classList.toggle('selected',item===button))});
 document.querySelector('#clear-pos').onclick=()=>{if(locked())return;if(cart.length&&!confirm('清空当前购物车？'))return;cart=[];render()};
 payButton.onclick=async()=>{
  if(payButton.disabled||submitting)return;
  if(!BaoOrders.pending('pos')&&!window.BaoTable?.validate(document.querySelector('[data-pos-service].selected')?.dataset.posService||'堂食'))return;
  const pending=BaoOrders.pending('pos'),snapshot=cart.map(item=>({...item}));
  submitting=true;payButton.disabled=true;document.querySelector('main').inert=true;
  try{
   let order;
   if(pending)order=pending;
   else{
    if(!await BaoCatalog.refresh()){alert('无法核对云端价格，请联网后重试');return}
    const updated=BaoCatalog.reprice(snapshot);cart=updated;
    if(cartSignature(snapshot)!==cartSignature(updated)){
     render();alert('商品价格或可售状态已变化，购物车已调整。请核对商品和应收金额后再次保存。本次未保存订单，请勿重复向顾客收款。');return;
    }
    if(!cart.length){alert('请先添加商品 / Ajoutez un produit');return}
    const now=new Date(),total=totalFor(cart);
    order={id:window.baoOrderId(),day:day(),month:month(),time:now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),items:cart.map(item=>({...item})),service:document.querySelector('[data-pos-service].selected')?.dataset.posService||'堂食',total,paidTotal:total,status:'paid',payment,source:'pos',kitchenStatus:'new',corrections:[]};
   }
   window.dispatchEvent(new CustomEvent('bao-pos-order',{detail:order}));
   if(!pending)order.tableNumber=window.BaoTable?.value(order.service)||'';
   const saved=await BaoOrders.submit(order);
   audit(['paid','done'].includes(saved.status)?'POS 收款':'核对旧订单',`${saved.id} · ${money(saved.paidTotal??saved.total)} · ${saved.payment}`);
   cart=[];render();alert(['voided','cancelled'].includes(saved.status)?`此订单已作废或登记退款，请核对记录，勿重复收款。\n${saved.id}`:`订单已保存并发送至厨房\n取餐号：${saved.pickupNumber}\n${saved.id}`);
  }catch(error){alert(error.message)}
  finally{submitting=false;document.querySelector('main').inert=false;render();window.dispatchEvent(new Event('bao-submit-state'))}
 };
 window.addEventListener('bao-catalog-change',render);render();input.focus();
}

function kitchenItemText(item){return `${escape(item.code||'')} · ${escape(item.dish)}${item.filling?` · 馅料：${escape(item.filling)} · 做法：${escape(item.style)}`:''} × ${quantity(item)}`}
function initKitchenDetailed(){const board=document.querySelector('#kitchen-board'),columns=[['new','待制作 · À préparer','making','开始制作'],['making','制作中 · En cours','ready','待取餐'],['ready','待取餐 · Prêt','complete','完成出餐']];function render(){const list=orders().filter(order=>paid(order)&&!['cancelled','voided'].includes(order.status)&&(order.kitchenStatus||'new')!=='complete');board.innerHTML=columns.map(([status,title,next,label])=>`<section class="kitchen-column"><p class="eyebrow">${title} <span class="pill">${list.filter(order=>(order.kitchenStatus||'new')===status).length} 单</span></p>${list.filter(order=>(order.kitchenStatus||'new')===status).map(order=>`<article class="ticket"><h3>取餐号 ${escape(order.pickupNumber||order.id)}</h3><small>${escape(order.time)} · ${order.source==='pos'?'POS':'自助'} · ${escape(order.service||'堂食')}${order.tableNumber?' · '+escape(order.tableNumber)+' 桌':''} · ${money(order.total)}${order.isTest?' · 模拟':''}</small><p>${order.items.map(kitchenItemText).join('<br>')}</p><button class="button ${status==='ready'?'green':''}" data-id="${order.id}" data-next="${next}">${label}</button></article>`).join('')||'<p class="empty">暂无订单</p>'}</section>`).join('');board.querySelectorAll('button').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await BaoOrders.change(button.dataset.id,'kitchen',button.dataset.next);render()}catch(error){alert(error.message)}finally{button.disabled=false}})}window.addEventListener('bao-orders-change',render);render()}
async function deleteOrderNow(id){try{await BaoOrders.change(id,"void");initAdminDelete()}catch(error){alert(error.message)}}
function openDeleteDialog(id){if(confirm('确认作废订单 '+id+'？将从营业额和厨房中移除，保留历史记录。'))deleteOrderNow(id)}
function initAdminDelete(){initAdmin();document.querySelector('.hint').textContent='订单跨设备同步；作废和退款保留记录，已归档月份不可修改。';document.querySelectorAll('[data-correct]').forEach(button=>button.textContent='作废订单')}
const page=document.body.dataset.page;if(page==='pos')initPOSAdvanced();if(page==='kitchen')initKitchenDetailed();if(page==='admin')initAdminDelete();if(page==='owner')initOwner();navRefresh();

window.addEventListener('bao-orders-change',()=>{if(page==='admin')initAdminDelete();if(page==='owner')initOwner()});
