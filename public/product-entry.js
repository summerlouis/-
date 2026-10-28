(() => {
  const form=document.querySelector('#new-product-form');if(!form)return;
  const message=document.querySelector('#new-product-message'),submit=form.querySelector('[type=submit]');
  const code=form.elements.code,category=form.elements.category;
  const imageInput=document.querySelector('#new-product-image'),imagePreview=document.querySelector('#new-product-image-preview'),imageStatus=document.querySelector('#new-product-image-status'),clearImage=document.querySelector('#clear-product-image');
  let suggested='',busy=false,preparing=false,preparedImage=null,uploadedImage=null,previewUrl='',imageVersion=0,imageInvalid=false;
  function resetImage(clearInput=true){
    imageVersion++;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';preparedImage=null;uploadedImage=null;imageInvalid=false;preparing=false;if(clearInput)imageInput.value='';imagePreview.removeAttribute('src');imagePreview.parentElement.hidden=true;imageStatus.textContent='';imageStatus.dataset.state='';submit.disabled=busy;
  }
  clearImage.onclick=()=>{if(!busy)resetImage()};
  imageInput.onchange=async()=>{
    const file=imageInput.files[0];if(!file)return;
    resetImage(false);const version=imageVersion;preparing=true;submit.disabled=true;imageStatus.textContent='正在处理图片…';
    try{
      const prepared=await BaoCatalog.prepareImage(file);if(version!==imageVersion)return;
      preparedImage=prepared;previewUrl=URL.createObjectURL(prepared);imagePreview.src=previewUrl;imagePreview.parentElement.hidden=false;
      imageStatus.textContent='已选 '+file.name+'（优化后 '+Math.ceil(prepared.size/1024)+' KB），保存新商品时上传。';imageStatus.dataset.state='success';
    }catch(error){if(version===imageVersion){imageInvalid=true;imageStatus.textContent=error.message;imageStatus.dataset.state='error';imagePreview.parentElement.hidden=false;imagePreview.hidden=true}}
    finally{if(version===imageVersion){preparing=false;submit.disabled=busy;imagePreview.hidden=!preparedImage}}
  };
  function suggest(){
    if(code.value&&code.value!==suggested)return;
    const prefix={包子:'A',饺子:'B',粥品:'C',其他:'D'}[category.value];
    let n=1;while(BaoCatalog.hasCode(prefix+n))n++;
    suggested=prefix+n;code.value=suggested;
  }
  category.addEventListener('change',suggest);window.addEventListener('bao-catalog-change',suggest);suggest();
  code.addEventListener('blur',()=>{code.value=code.value.trim().toUpperCase()});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||preparing||!form.reportValidity())return;
    if(imageInvalid){message.textContent='请重新选择有效的产品图片，或取消这张图片后再保存。';message.dataset.state='error';return}
    busy=true;submit.disabled=true;submit.textContent='正在保存…';message.textContent='';
    imageInput.disabled=true;clearImage.disabled=true;
    const product={code:code.value,category:category.value,dish:form.elements.dish.value,fr:form.elements.fr.value,price:Number(form.elements.price.value),active:form.elements.active.checked};
    const controls=Array.from(form.querySelectorAll('input,select,button'));controls.forEach(control=>control.disabled=true);
    try{
      if(preparedImage){submit.textContent='正在上传图片…';message.textContent='正在上传图片，完成后保存商品…';if(!uploadedImage)uploadedImage=await BaoCatalog.uploadImage(preparedImage);product.imageId=uploadedImage.imageId}
      submit.textContent='正在保存商品…';
      const saved=await BaoCatalog.create(product);
      if(typeof audit==='function')audit(saved.active?'新增并上架商品':'新增待上架商品',saved.code+' · '+saved.dish);
      form.reset();resetImage();code.value='';suggest();
      message.textContent=saved.code+' · '+saved.dish+(saved.active?' 已上架，POS 和自助点餐将自动显示。':' 已保存为待上架商品，可在下方列表点击“上架”。');
      message.dataset.state='success';
    }catch(error){
      message.textContent=error instanceof TypeError||error.name==='TimeoutError'?'网络异常，结果暂未确认。请核对下方商品列表；若未保存，可用相同编号重试。':error.message;
      message.dataset.state='error';
    }finally{busy=false;controls.forEach(control=>control.disabled=false);submit.textContent='保存新商品'}
  };
})();
