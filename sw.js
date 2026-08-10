const CACHE='wiring-v11';
const ASSETS=['./','./index.html','./app.js','./manifest.webmanifest','./icons/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.pathname.endsWith('/app.js')){
    e.respondWith(fetch(e.request).then(async r=>{
      const source=await r.text();
      const oldLogin=`try{ await login(password); await syncPending(); await pullCloud(); render(); }\n    catch(e){ button.disabled=false; button.textContent='Войти'; error.textContent=navigator.onLine?'Неверный пароль.':'Нет интернета для первого входа.'; }`;
      const newLogin=`try{\n      await login(password);\n      try{ await syncPending(); await pullCloud(); }\n      catch(e){ console.warn('cloud after login',e.status,e.details||e); }\n      render();\n    }catch(e){\n      button.disabled=false;\n      button.textContent='Войти';\n      if(!navigator.onLine) error.textContent='Нет интернета для первого входа.';\n      else if(e.status===400 || e.status===401) error.textContent='Неверный пароль.';\n      else error.textContent='Ошибка входа: '+(e.message||'неизвестная ошибка');\n    }`;
      const oldBoot=`if(auth?.access_token && navigator.onLine){ try{await syncPending(); await pullCloud();}catch(e){auth=null;localStorage.removeItem(AUTH_KEY);} }`;
      const newBoot=`if(auth?.access_token && navigator.onLine){ try{await syncPending(); await pullCloud();}catch(e){console.warn('boot cloud load',e.status,e.details||e);} }`;
      let patched=source;
      if(patched.includes(oldLogin)) patched=patched.replace(oldLogin,newLogin);
      if(patched.includes(oldBoot)) patched=patched.replace(oldBoot,newBoot);
      return new Response(patched,{status:r.status,statusText:r.statusText,headers:r.headers});
    }).catch(()=>caches.match(e.request)));
    return;
  }
  if(url.pathname.endsWith('/index.html')||url.pathname.endsWith('/sw.js')){
    e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match('./index.html'))));
});
