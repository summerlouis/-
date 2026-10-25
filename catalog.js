(() => {
  const key='baoDumplingCatalog';
  const defaults=[{"code":"A1","category":"包子","dish":"素包子","fr":"Bao végétarien","price":1,"active":true},{"code":"A2","category":"包子","dish":"猪肉包","fr":"Bao porc","price":1.25,"active":true},{"code":"A3","category":"包子","dish":"牛肉包","fr":"Bao bœuf","price":1.5,"active":true},{"code":"A4","category":"包子","dish":"香煎包","fr":"Bao poêlé","price":1.75,"active":true},{"code":"B1","category":"饺子","dish":"白面水饺","fr":"Raviolis nature","price":4,"active":true},{"code":"B2","category":"饺子","dish":"菠菜水饺","fr":"Raviolis aux épinards","price":5,"active":true},{"code":"B3","category":"饺子","dish":"胡萝卜水饺","fr":"Raviolis aux carottes","price":5,"active":true},{"code":"B4","category":"饺子","dish":"三色水饺","fr":"Assortiment trois couleurs","price":5,"active":true},{"code":"C1","category":"粥品","dish":"红豆粥","fr":"Congee aux haricots rouges","price":3.5,"active":true},{"code":"C2","category":"粥品","dish":"绿豆粥","fr":"Congee aux haricots mungo","price":3.5,"active":true},{"code":"C3","category":"粥品","dish":"小米粥","fr":"Congee au millet","price":3.5,"active":true},{"code":"C4","category":"粥品","dish":"八宝粥","fr":"Congee huit trésors","price":3.8,"active":true},{"code":"C5","category":"粥品","dish":"皮蛋瘦肉粥","fr":"Congee au porc et œuf de cent ans","price":3.8,"active":true}];
  const cloud=location.hostname.endsWith('.chatgpt.site') || window.BAO_CLOUD === true;
  let catalog=defaults.map(p=>({...p,revision:0})), inflight=null, online=!cloud;
  function cached(){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
  if(!cloud){const saved=cached();if(Array.isArray(saved))catalog=defaults.map(p=>({...p,...saved.find(x=>x.code===p.code)}));}
  function status(message){document.querySelectorAll('[data-catalog-status]').forEach(el=>el.textContent=message)}
  function apply(next){const changed=JSON.stringify(catalog)!==JSON.stringify(next);catalog=next;localStorage.setItem(key,JSON.stringify(catalog));if(changed)window.dispatchEvent(new Event('bao-catalog-change'));}
  async function refresh(){
    if(!cloud)return true;
    if(inflight)return inflight;
    inflight=(async()=>{try{const res=await fetch('/api/catalog',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!res.ok)throw Error();const data=await res.json();if(!Array.isArray(data.products)||data.products.length!==defaults.length)throw Error();apply(data.products);online=true;status('云端价格已同步 · 各设备约 2 秒内更新');return true}catch{online=false;status('价格同步失败，请联网后重试；暂不可改价或结算');return false}finally{inflight=null}})();return inflight;
  }
  async function update(code,patch){
    const product=catalog.find(p=>p.code===code);if(!product)throw Error('商品不存在');
    if('price' in patch && (!Number.isFinite(patch.price)||patch.price<0||patch.price>99999.99||Math.abs(patch.price*100-Math.round(patch.price*100))>0.000001))throw Error('请输入 0 至 99999.99 的价格，最多两位小数');
    if(cloud){
      const res=await fetch('/api/catalog',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,...patch,revision:product.revision||0}),signal:AbortSignal.timeout(8000)});
      if(res.status===409){await refresh();throw Error('该商品已在另一台设备修改，请核对最新价格后重试');}
      if(!res.ok)throw Error('云端保存失败，请检查网络后重试');
      const data=await res.json();apply(data.products);online=true;
    }else apply(catalog.map(p=>p.code===code?{...p,...patch}:p));
  }
  function reprice(items){return items.filter(item=>catalog.some(p=>p.code===item.code&&p.active)).map(item=>({...item,price:Number(catalog.find(p=>p.code===item.code).price)}));}
  window.BaoCatalog={all:()=>catalog.map(p=>({...p})),get:code=>catalog.find(p=>p.code===String(code).trim().toUpperCase()),update,refresh,reprice,cloud};
  window.addEventListener('storage',event=>{if(!cloud&&(event.key===key||event.key===null)){const saved=cached();apply(Array.isArray(saved)?saved:defaults)}});
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.addEventListener('DOMContentLoaded',()=>{status(cloud?'正在连接云端价格…':'本地价格模式 · 仅同一浏览器联动');refresh()});
  if(cloud)setInterval(refresh,2000);
})();
