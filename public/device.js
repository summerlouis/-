document.querySelector('#device-form').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button'),message=document.querySelector('#device-message');button.disabled=true;
  try{const response=await fetch('/api/device-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:document.querySelector('#device-code').value})});const data=await response.json();if(!response.ok)throw Error(data.error);const next=new URL(location.href).searchParams.get('next');location.href=['/pos','/kitchen','/admin','/owner'].includes(next)?next:data.role==='kitchen'?'/kitchen':'/pos'}catch(error){message.textContent=error.message}finally{button.disabled=false}
};
