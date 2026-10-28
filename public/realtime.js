(() => {
  // getRandomValues also works on a trusted LAN over HTTP; randomUUID may not.
  window.baoOrderId = () => 'BD-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
  if (!window.BaoRuntime?.events) return;
  let socket, retry, heartbeat, attempt = 0, stopped = false, refreshAgain = false, refreshing = false;
  const show = text => {const el=document.querySelector('#realtime-status');if(el){el.textContent=text;el.dataset.state=text==='即时同步已连接'?'online':navigator.onLine?'connecting':'offline'}};
  async function refresh() {
    if (refreshing) {refreshAgain=true;return}
    refreshing=true;
    do {refreshAgain=false;await Promise.all([BaoCatalog.refresh(),BaoOrders.refresh()]);} while(refreshAgain);
    refreshing=false;
  }
  function connect() {
    clearTimeout(retry);clearInterval(heartbeat);
    if (stopped || !navigator.onLine || (socket && socket.readyState<2)) return;
    show('连接即时同步…');
    socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/events');
    socket.onopen=()=>{attempt=0;show('即时同步已连接');refresh();heartbeat=setInterval(()=>{if(socket.readyState===1)socket.send('ping')},25000)};
    socket.onmessage=event=>{if(event.data==='pong')return;try{const data=JSON.parse(event.data);if(['connected','orders','catalog'].includes(data.kind))refresh()}catch{}};
    socket.onclose=()=>{clearInterval(heartbeat);show(navigator.onLine?'即时连接断开，正在自动重连；备用同步继续运行':'网络已断开，请联网后重试');if(!stopped)retry=setTimeout(connect,Math.min(15000,1000*2**attempt++)+Math.random()*500)};
    socket.onerror=()=>socket.close();
  }
  window.addEventListener('DOMContentLoaded',()=>{const el=document.createElement('p');el.className='sync-status';el.id='realtime-status';el.setAttribute('role','status');(document.querySelector('[data-catalog-status]')||document.querySelector('header'))?.after(el);connect()});
  window.addEventListener('online',()=>{connect();refresh()});
  window.addEventListener('offline',()=>{show('网络已断开，请联网后重试');socket?.close()});
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(retry);clearInterval(heartbeat);socket?.close()});
  window.addEventListener('pageshow',()=>{stopped=false;connect()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){connect();refresh()}});
})();
