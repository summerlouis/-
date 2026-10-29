(()=>{window.addEventListener('DOMContentLoaded',()=>{
 const page=document.body.dataset.page,mock=window.BaoRuntime?.mode==='mock',main=document.querySelector('main');
 if(!main)return;
 if(mock){
  document.querySelector('.sync-tools>span')?.replaceChildren(document.createTextNode('云端模拟版 · 2026.10.29'));
  document.querySelectorAll('#history-status option').forEach(o=>{if(o.value==='cancelled')o.textContent='已取消';if(o.value==='paid')o.textContent='已模拟付款';if(o.value==='pending')o.textContent='待模拟付款'});
  document.querySelectorAll('#import-local,#import-file,label[for="import-file"]').forEach(el=>el.hidden=true);
  const backup=document.querySelector('#backup-full')?.closest('section');if(backup){backup.querySelector('h2').textContent='数据备份';backup.querySelector('.note').textContent='导出当前云端数据用于保存。模拟环境暂不导入旧营业订单。';const notes=backup.querySelectorAll('.note');if(notes[1])notes[1].textContent='完整备份含商品、价格、订单和归档记录；当前版本未启用新图片上传。请妥善保管备份文件。'}
  if(['admin','owner'].includes(page)){document.querySelector('.hint').textContent='当前为模拟测试：订单不会扣款，真实营业额保持为零。取消与作废保留记录。';document.querySelectorAll('.daily-summary').forEach(el=>el.hidden=true);}
 }
 if(page==='admin'){
  const layout=document.querySelector('.layout'),order=document.querySelector('#admin-orders').closest('.panel'),products=layout.children[1],pending=document.querySelector('.pending-payments'),backup=document.querySelector('#backup-full')?.closest('section'),audit=document.querySelector('#admin-audit')?.closest('.panel'),finance=document.querySelector('#admin-close-month')?.closest('.panel');
  const nav=document.createElement('div');nav.className='admin-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','后台功能');layout.before(nav);
  const groups=[['orders','订单处理',[pending,order]],['products','商品管理',[products]],['records','操作与归档',[audit,finance]],['backup','数据备份',[backup]]];
  const tabs=[];groups.forEach(([id,title,nodes],index)=>{const button=document.createElement('button');button.className='button';button.id='tab-'+id;button.textContent=title;button.setAttribute('role','tab');button.setAttribute('aria-controls','panel-'+id);nav.append(button);const panel=document.createElement('section');panel.id='panel-'+id;panel.className='admin-tab-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);nav.after(panel);nodes.filter(Boolean).forEach(node=>panel.append(node));tabs.push({button,panel});button.onclick=()=>select(index);button.onkeydown=e=>{let n=index;if(e.key==='ArrowRight')n=(index+1)%groups.length;else if(e.key==='ArrowLeft')n=(index+groups.length-1)%groups.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=groups.length-1;else return;e.preventDefault();select(n);tabs[n].button.focus()};});
  function select(index){tabs.forEach((t,i)=>{t.panel.hidden=i!==index;t.button.setAttribute('aria-selected',String(i===index));t.button.tabIndex=i===index?0:-1});}
  select(0);layout.hidden=true;document.querySelectorAll('main>section').forEach(el=>{if(el.children.length===0)el.hidden=true});products.querySelector('details')?.removeAttribute('open');
 }
 if(page==='pos'){
  const layout=document.querySelector('.layout'),live=document.querySelector('.live-orders');if(live)layout.before(live);
  const aside=layout.querySelector('aside');if(aside)aside.classList.add('pos-checkout');
  const pending=document.querySelector('.pending-payments');const compact=()=>{if(pending)pending.classList.toggle('no-pending',!BaoOrders.all().some(o=>o.status==='pending'&&o.source==='self'))};window.addEventListener('bao-orders-change',compact);compact();
 }
});})();
