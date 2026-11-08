(()=>{const m=location.pathname.match(/^\/s\/(shop-[a-f0-9]{8})\//),prefix=m?'/s/'+m[1]:'';window.BaoStorePrefix=prefix;
 window.BaoRootFetch=window.fetch.bind(window);if(!prefix)return;
 const scoped=value=>{const u=new URL(value,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/api/'))u.pathname=prefix+u.pathname;return u.href};
 const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>nativeFetch(input instanceof Request?new Request(scoped(input.url),input):scoped(input),init);
 const NativeSocket=window.WebSocket;window.WebSocket=class extends NativeSocket{constructor(url,protocols){const u=new URL(url,location.href);if(u.host===location.host&&u.pathname.startsWith('/api/'))u.pathname=prefix+u.pathname;super(u.href,...(protocols===undefined?[]:[protocols]))}};
 for(const method of ['getItem','setItem','removeItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){return original.call(this,prefix+':'+key,...args)}}
})();
