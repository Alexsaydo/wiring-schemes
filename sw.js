const CACHE='wiring-v20';
const ASSETS=['./','./index.html','./app-v8.js','./manifest.webmanifest','./icons/icon.svg'];

const fixIndex=async response=>{
  if(!response||!response.ok)return response;
  const text=await response.text();
  const fixed=text
    .replace('top:calc(50% - 15px);transform:none;','top:50%;transform:translateY(-50%);')
    .replace('top:calc(50% - 14.5px);transform:none;','top:50%;transform:translateY(-50%);');
  return new Response(fixed,{status:response.status,statusText:response.statusText,headers:response.headers});
};

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(async cache=>{
      for(const asset of ASSETS){
        const response=await fetch(asset,{cache:'no-store'});
        cache.put(asset,asset==='./index.html'?await fixIndex(response):response);
      }
    }).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached)return cached;
      return fetch(event.request).then(async response=>{
        if(!response||!response.ok)return response;
        const isNavigation=event.request.mode==='navigate';
        const out=isNavigation?await fixIndex(response):response;
        const copy=out.clone();
        if(new URL(event.request.url).origin===self.location.origin){
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return out;
      }).catch(()=>{
        if(event.request.mode==='navigate')return caches.match('./index.html');
        return new Response('',{status:503,statusText:'Offline'});
      });
    })
  );
});