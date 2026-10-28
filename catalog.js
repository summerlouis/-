(() => {
  const key='baoDumplingCatalog'+(window.BaoRuntime?.storeId?':'+BaoRuntime.storeId:'');
  const defaults=[{"code":"A1","category":"包子","dish":"素包子","fr":"Bao végétarien","price":1,"active":true},{"code":"A2","category":"包子","dish":"猪肉包","fr":"Bao porc","price":1.25,"active":true},{"code":"A3","category":"包子","dish":"牛肉包","fr":"Bao bœuf","price":1.5,"active":true},{"code":"A4","category":"包子","dish":"香煎包","fr":"Bao poêlé","price":1.75,"active":true},{"code":"B1","category":"饺子","dish":"白面水饺","fr":"Raviolis nature","price":4,"active":true},{"code":"B2","category":"饺子","dish":"菠菜水饺","fr":"Raviolis aux épinards","price":5,"active":true},{"code":"B3","category":"饺子","dish":"胡萝卜水饺","fr":"Raviolis aux carottes","price":5,"active":true},{"code":"B4","category":"饺子","dish":"三色水饺","fr":"Assortiment trois couleurs","price":5,"active":true},{"code":"C1","category":"粥品","dish":"红豆粥","fr":"Congee aux haricots rouges","price":3.5,"active":true},{"code":"C2","category":"粥品","dish":"绿豆粥","fr":"Congee aux haricots mungo","price":3.5,"active":true},{"code":"C3","category":"粥品","dish":"小米粥","fr":"Congee au millet","price":3.5,"active":true},{"code":"C4","category":"粥品","dish":"八宝粥","fr":"Congee huit trésors","price":3.8,"active":true},{"code":"C5","category":"粥品","dish":"皮蛋瘦肉粥","fr":"Congee au porc et œuf de cent ans","price":3.8,"active":true}];

  const cloud=location.hostname.endsWith('.chatgpt.site') || window.BAO_CLOUD === true;
  let catalog=defaults.map(p=>({...p,revision:0})), inflight=null, saving=null, loaded=!cloud;
  function validList(list){return Array.isArray(list)&&new Set(list.map(p=>p?.code)).size===list.length&&list.every(p=>p&&typeof p.code==='string'&&/^[A-Z][A-Z0-9_-]{0,19}$/.test(p.code)&&typeof p.dish==='string'&&typeof p.fr==='string'&&['包子','饺子','粥品','其他'].includes(p.category)&&Number.isFinite(p.price)&&p.price>=0&&typeof p.active==='boolean')}
  function cached(){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
  const saved=cached();if(validList(saved))catalog=saved;
  function status(message,failed=false){document.querySelectorAll('[data-catalog-status]').forEach(el=>{el.textContent=message;el.classList.toggle('sync-error',failed)})}
  function apply(next){
    if(!validList(next))throw Error('商品数据不完整，请刷新后重试');
    const changed=!loaded||JSON.stringify(catalog)!==JSON.stringify(next);catalog=next;loaded=true;
    try{localStorage.setItem(key,JSON.stringify(catalog))}catch{}
    if(changed)window.dispatchEvent(new Event('bao-catalog-change'));
  }
  async function refresh(){
    if(!cloud)return true;
    if(saving){try{await saving}catch{}return refresh()}
    if(inflight)return inflight;
    inflight=(async()=>{try{
      const res=await fetch('/api/catalog',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!res.ok){const error=Error();error.status=res.status;throw error}const data=await res.json();apply(data.products);
      status('云端商品已同步 · 各设备约 2 秒内更新');return true;
    }catch(error){status(error.status===401?'登录已失效，请重新登录当前账号后同步商品。':'商品同步失败，请联网后重试；暂不可保存商品或结算',true);return false}finally{inflight=null}})();return inflight;
  }
  async function mutate(method,body){
    if(inflight)await inflight;
    if(saving)throw Error('正在保存商品，请稍候');
    saving=(async()=>{
      const res=await fetch('/api/catalog',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      const data=await res.json();
      if(!res.ok){const error=Error(data.error||'云端保存失败，请重试');error.status=res.status;throw error}
      apply(data.products);status('云端商品已同步 · 各设备约 2 秒内更新');return data.product;
    })();
    try{return await saving}finally{saving=null}
  }
  function checkPrice(price){if(!Number.isFinite(price)||price<0||price>99999.99||Math.abs(price*100-Math.round(price*100))>0.000001)throw Error('请输入 0 至 99999.99 的价格，最多两位小数')}
  async function update(code,patch,expectedRevision){
    const product=catalog.find(p=>p.code===code);if(!product)throw Error('商品不存在');
    if('price' in patch)checkPrice(patch.price);
    if(cloud){try{await mutate('PATCH',{code,...patch,revision:expectedRevision??product.revision??0})}catch(error){if(error.status===409){await refresh();throw Error('imageId' in patch?'该商品已在另一台设备修改，图片尚未保存。请核对后重新选择图片。':'该商品已在另一台设备修改，请核对最新价格后重试')}throw error}}
    else apply(catalog.map(p=>p.code===code?{...p,...patch,revision:(p.revision||0)+1}:p));
  }
  async function create(input){
    const product={code:String(input.code||'').trim().toUpperCase(),category:input.category,dish:String(input.dish||'').trim(),fr:String(input.fr||'').trim(),price:input.price,active:input.active!==false,revision:0,...(input.imageId?{imageId:input.imageId}:{})};
    if(!/^[A-Z][A-Z0-9_-]{0,19}$/.test(product.code))throw Error('编号以字母开头，最多 20 位，可含数字、横线或下划线');
    if(!product.dish||product.dish.length>80)throw Error('请输入商品名称，最多 80 字');
    if(product.fr.length>160||!['包子','饺子','粥品','其他'].includes(product.category))throw Error('请检查分类和法文名称');
    checkPrice(product.price);
    if(cloud)return mutate('POST',product);
    if(catalog.some(p=>p.code===product.code))throw Error('商品编号已存在，请使用新编号');
    apply([...catalog,product]);return product;
  }
  function reprice(items){
    if(cloud&&!loaded)return items;
    return items.filter(item=>catalog.some(p=>p.code===item.code&&p.active)).map(item=>({...item,price:Number(catalog.find(p=>p.code===item.code).price)}));
  }
  async function remove(code,revision){
    if(cloud){try{await mutate('DELETE',{code,revision})}catch(error){if(error.status===409||error.status===404)await refresh();throw error}}
    else apply(catalog.map(p=>p.code===code?{...p,active:false,deleted:true,revision:(p.revision||0)+1}:p));
  }
  const defaultImages={A1:'bao-vegetable.png',A2:'bao-pork.png',A3:'bao-beef.png',A4:'bao-pan-fried.png',B1:'dumpling-white.png',B2:'dumpling-green.png',B3:'dumpling-orange.png',B4:'dumpling-tricolor.png',C1:'porridge-red-bean.png',C2:'porridge-mung-bean.png',C3:'porridge-millet.png',C4:'porridge-eight-treasure.png',C5:'porridge-century-egg.png'};
  function customImage(product){return typeof product?.imageUrl==='string'&&/^\/api\/product-images\/[a-zA-Z0-9_-]+$/.test(product.imageUrl)?product.imageUrl:''}
  function imageFor(product){return customImage(product)||defaultImages[product?.code]||''}
  async function prepareImage(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片；手机 HEIC 图片请先转为 JPG。');
    if(file.size>15*1024*1024)throw Error('原图不能超过 15MB，请选择较小的照片。');
    const source=URL.createObjectURL(file),img=new Image();
    try{
      img.src=source;try{await img.decode()}catch{throw Error('无法读取这张图片，请换一张 JPG、PNG 或 WebP 图片。')}
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>64000000)throw Error('图片尺寸过大，请先缩小后再上传。');
      const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器无法处理图片，请换用最新版浏览器。');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      let blob;for(const quality of [.9,.8,.68,.55]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=1024*1024)break}
      if(!blob||blob.size>2*1024*1024)throw Error('图片压缩后仍过大，请换一张较小的照片。');
      return new File([blob],'product-photo.jpg',{type:'image/jpeg'});
    }finally{URL.revokeObjectURL(source)}
  }
  async function uploadImage(file){
    if(!cloud)throw Error('请在云端管理后台上传图片，才能同步到其他设备。');
    const body=new FormData();body.append('file',file);
    const res=await fetch('/api/product-images',{method:'POST',body,signal:AbortSignal.timeout(45000)});
    let data;try{data=await res.json()}catch{throw Error('图片上传未确认，请检查网络后重试。')}
    if(!res.ok)throw Error(data.error||'图片上传失败，请稍后重试。');
    if(typeof data.imageId!=='string'||!customImage(data))throw Error('图片上传返回异常，请重试。');
    return data;
  }
  window.BaoCatalog={all:()=>catalog.filter(p=>!p.deleted).map(p=>({...p})),get:code=>catalog.find(p=>!p.deleted&&p.code===String(code).trim().toUpperCase()),hasCode:code=>catalog.some(p=>p.code===String(code).trim().toUpperCase()),create,update,remove,refresh,reprice,cloud,prepareImage,uploadImage,imageFor,customImage};
  window.addEventListener('storage',event=>{if(!cloud&&(event.key===key||event.key===null)){const saved=cached();if(validList(saved))apply(saved)}});
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);window.addEventListener('offline',()=>status('网络已断开，当前商品可能不是最新价格。',true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.addEventListener('DOMContentLoaded',()=>{status(cloud?'正在连接云端商品库…':'本地商品模式 · 仅同一浏览器联动');refresh()});
  if(cloud)setInterval(refresh,2000);
})();
