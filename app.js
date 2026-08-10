const SUPABASE_URL = 'https://icenlyttjymkuhudocqm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3-YQ35kD_JOBz_5g1JYTuA_r0b3_QdY';
const SUPABASE_EMAIL = 'andreev.bu@gmail.com';
const AUTH_KEY = 'wiring-auth-v3';
const LOCAL_KEY = 'wiring-local-v4';
const PENDING_KEY = 'wiring-pending-v1';

const CABLES = {
  'utp4': {
    name:'UTP 4', subtitle:'4 пары · 8 жил', colors:[
      ['white-orange','Бело-оранжевый','#f97316'], ['orange','Оранжевый','#f97316'],
      ['white-green','Бело-зелёный','#22c55e'], ['green','Зелёный','#22c55e'],
      ['white-blue','Бело-синий','#3b82f6'], ['blue','Синий','#3b82f6'],
      ['white-brown','Бело-коричневый','#92400e'], ['brown','Коричневый','#92400e']
    ]
  },
  'utp2': {
    name:'UTP2', subtitle:'Оранжевая + синяя пары · 4 жилы', colors:[
      ['white-orange','Бело-оранжевый','#f97316'], ['orange','Оранжевый','#f97316'],
      ['white-blue','Бело-синий','#3b82f6'], ['blue','Синий','#3b82f6']
    ]
  },
  'shvvp': {
    name:'ШВВП', subtitle:'2 жилы', colors:[
      ['brown','Коричневый','#92400e'], ['blue','Синий','#3b82f6']
    ]
  },
  'kspv': {
    name:'КСПВ', subtitle:'2 жилы', colors:[
      ['brown','Коричневый','#92400e'], ['white','Белый','#f8fafc']
    ]
  }
};

const app = document.getElementById('app');
let auth = read(AUTH_KEY);
let devices = read(LOCAL_KEY) || [];
let pending = read(PENDING_KEY) || [];
let currentId = null;
let syncTimer = null;

function read(key){ try { return JSON.parse(localStorage.getItem(key)); } catch(e){ return null; } }
function write(key,value){ localStorage.setItem(key, JSON.stringify(value)); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function toast(text){ const el=document.getElementById('toast'); el.textContent=text; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1800); }
function markPending(id){ if(!pending.includes(id)) pending.push(id); write(PENDING_KEY,pending); }
function clearPending(id){ pending=pending.filter(x=>x!==id); write(PENDING_KEY,pending); }
function cableOf(d){ return CABLES[d.cableId] || CABLES.utp4; }
function colorsOf(d){ return cableOf(d).colors; }
function colorById(d,id){ return colorsOf(d).find(x=>x[0]===id); }

async function api(path, options={}){
  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};
  if(auth?.access_token) headers.Authorization='Bearer '+auth.access_token;
  const res=await fetch(SUPABASE_URL+path,{...options,headers});
  let data=null; try{data=await res.json();}catch(e){}
  if(!res.ok){ const err=new Error(data?.msg||data?.message||data?.error_description||data?.error||'Ошибка соединения'); err.status=res.status; err.details=data; throw err; }
  return data;
}

async function login(password){
  auth=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:SUPABASE_EMAIL,password})});
  write(AUTH_KEY,auth);
}

async function pullCloud(){
  if(!auth?.access_token || !navigator.onLine) return false;
  const rows=await api('/rest/v1/devices?select=id,name,cable_id,contacts,created_at,updated_at&order=created_at.asc');
  devices=rows.map(d=>({id:d.id,name:d.name,cableId:d.cable_id||'utp4',contacts:Array.isArray(d.contacts)?d.contacts:[],created_at:d.created_at,updated_at:d.updated_at}));
  write(LOCAL_KEY,devices);
  return true;
}

async function saveCloud(device, silent=false){
  if(!auth?.access_token || !navigator.onLine) return false;
  const pendingId=device.id;
  try{
    const userId=auth.user?.id;
    if(!userId) throw new Error('Не найден пользователь Supabase');
    const payload={name:device.name,cable_id:device.cableId||'utp4',contacts:device.contacts,user_id:userId,updated_at:new Date().toISOString()};
    if(String(device.id).startsWith('local-')){
      const rows=await api('/rest/v1/devices',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
      if(rows?.[0]){
        const oldId=device.id;
        Object.assign(device,{id:rows[0].id,created_at:rows[0].created_at,updated_at:rows[0].updated_at,cableId:rows[0].cable_id||device.cableId||'utp4'});
        clearPending(oldId);
        markPending(device.id);
      }
    }else{
      await api('/rest/v1/devices?id=eq.'+encodeURIComponent(device.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    }
    write(LOCAL_KEY,devices);
    clearPending(device.id);
    if(!silent) toast('Синхронизировано');
    return true;
  }catch(e){
    markPending(pendingId);
    if(!silent) toast('Ошибка синхронизации');
    console.warn('sync',e.status,e.details||e);
    return false;
  }
}

async function syncPending(){
  if(!auth?.access_token || !navigator.onLine || !pending.length) return;
  const ids=[...pending];
  for(const id of ids){
    const device=devices.find(d=>d.id===id);
    if(device) await saveCloud(device,true);
    else clearPending(id);
  }
}

function saveLocal(device){
  write(LOCAL_KEY,devices);
  markPending(device.id);
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>saveCloud(device),450);
  if(!navigator.onLine) toast('Сохранено на устройстве');
}

function loginScreen(message=''){
  app.innerHTML=`<div class="card login"><div class="plug">🔌</div><h1>Схемы расключения</h1><p class="muted">Введите пароль для доступа к общей базе схем.</p><label>Пароль</label><input id="password" type="password" placeholder="Пароль" autocomplete="current-password"><button class="primary" id="loginButton">Войти</button><div id="loginError" class="muted error">${esc(message)}</div></div>`;
  const password=document.getElementById('password');
  const button=document.getElementById('loginButton');
  const error=document.getElementById('loginError');
  async function go(){
    if(!password.value.trim()){error.textContent='Введите пароль.';return;}
    button.disabled=true; button.textContent='Входим…'; error.textContent='';
    try{ await login(password.value); await syncPending(); await pullCloud(); render(); }
    catch(e){ button.disabled=false; button.textContent='Войти'; error.textContent=navigator.onLine?'Неверный пароль.':'Нет интернета для первого входа.'; }
  }
  button.onclick=go; password.onkeydown=e=>{if(e.key==='Enter')go()}; password.focus();
}

function homeScreen(){
  app.innerHTML=`<div class="header"><h1>Схемы расключения</h1><span class="cloud">☁</span></div>`+
    (devices.length ? devices.map(d=>{const c=cableOf(d);return `<button class="device" data-id="${esc(d.id)}"><span class="icon">⌁</span><span class="deviceMain"><span class="name">${esc(d.name)}</span><span class="deviceCable">${esc(c.name)}</span></span><span class="count">${d.contacts.length} контактов</span><span class="chev">›</span></button>`}).join('') : `<div class="card empty"><div class="plug">🔌</div><h2>Пока ничего нет</h2><p class="muted">Добавьте первое устройство и выберите тип кабеля.</p></div>`)+
    `<button class="primary addDevice" id="addDevice">＋ Новое устройство</button>`;
  document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{currentId=el.dataset.id;render()});
  document.getElementById('addDevice').onclick=()=>startNewDevice();
}

function cableChooser(name){
  app.innerHTML=`<div class="header"><button class="back" id="back">‹</button><h1>Выберите кабель</h1></div><p class="muted cableIntro">Для «${esc(name)}» выберите тип кабеля. Набор доступных жил подставится автоматически.</p><div class="cableList">${Object.entries(CABLES).map(([id,c])=>`<button class="cableCard" data-cable="${id}"><span class="cableIcon ${id}">${id==='utp4'?'8':id==='utp2'?'4':'2'}</span><span class="cableInfo"><b>${esc(c.name)}</b><small>${esc(c.subtitle)}</small></span><span class="chev">›</span></button>`).join('')}</div>`;
  document.getElementById('back').onclick=()=>homeScreen();
  document.querySelectorAll('[data-cable]').forEach(el=>el.onclick=()=>{
    const d={id:'local-'+uid(),name,cableId:el.dataset.cable,contacts:[]};
    devices.push(d); saveLocal(d); currentId=d.id; render();
  });
}

function startNewDevice(){
  const name=prompt('Введите название устройства:');
  if(name?.trim()) cableChooser(name.trim());
}

function colorOptions(d,selected=''){
  return `<option value="">Выберите цвет</option>`+colorsOf(d).map(c=>`<option value="${c[0]}" ${c[0]===selected?'selected':''}>${c[1]}</option>`).join('');
}

function swatchClass(id){ return id==='white'?'white':id; }
function contactRow(d,r,i){
  const c=colorById(d,r.colorId);
  const shown=c?`<span class="swatch ${swatchClass(c[0])}" style="background:${c[2]}"></span><span class="colorText">${esc(c[1])}</span>`:'Не выбран';
  return `<div class="row"><div class="contactField"><label>Контакт</label><input class="contact" data-i="${i}" value="${esc(r.contact)}" placeholder="Например: GND"></div><div class="colorField"><label>Цвет жилы</label>${c?`<div class="colorview" data-color="${i}">${shown}</div><select class="colorSelect hidden" data-i="${i}">${colorOptions(d,r.colorId)}</select>`:`<select class="colorSelect" data-i="${i}">${colorOptions(d)}</select>`}</div><div class="rowButtons">${c?`<button class="edit" data-i="${i}">ред.</button>`:''}<button class="del" data-i="${i}">×</button></div></div>`;
}

function editorScreen(){
  const d=devices.find(x=>x.id===currentId); if(!d){currentId=null;return render();}
  const cable=cableOf(d);
  if(!d.cableId)d.cableId='utp4';
  d.contacts=d.contacts.map(r=>colorById(d,r.colorId)?r:{...r,colorId:''});
  app.innerHTML=`<div class="header"><button class="back" id="back">‹</button><div class="titleBlock"><h1>${esc(d.name)}</h1><span class="titleCable">${esc(cable.name)}</span></div></div><div class="actions"><button class="secondary" id="rename">✎ Переименовать</button><button class="danger" id="remove">Удалить</button></div><div class="card"><div class="sectionHead"><div><b>Расключение</b><div class="muted subtitle">Контакт → цвет жилы</div></div><button class="cableMini" id="changeCable">${esc(cable.name)} <span>⌄</span></button></div>${d.contacts.length?d.contacts.map((r,i)=>contactRow(d,r,i)).join(''):`<div class="empty small"><span class="muted">Контактов пока нет.</span></div>`}<button class="secondary add" id="addContact">＋ Добавить контакт</button></div>`;
  document.getElementById('back').onclick=()=>{currentId=null;render()};
  document.getElementById('rename').onclick=()=>{const n=prompt('Новое название:',d.name);if(n?.trim()){d.name=n.trim();saveLocal(d);render();}};
  document.getElementById('changeCable').onclick=()=>changeCableScreen(d);
  document.getElementById('remove').onclick=async()=>{if(!confirm('Удалить устройство и его схему?'))return;try{if(!String(d.id).startsWith('local-'))await api('/rest/v1/devices?id=eq.'+encodeURIComponent(d.id),{method:'DELETE'});}catch(e){}clearPending(d.id);devices=devices.filter(x=>x!==d);write(LOCAL_KEY,devices);currentId=null;render();};
  document.getElementById('addContact').onclick=()=>{d.contacts.push({contact:'',colorId:''});saveLocal(d);render();};
  document.querySelectorAll('.contact').forEach(el=>el.oninput=()=>{d.contacts[+el.dataset.i].contact=el.value;saveLocal(d);});
  document.querySelectorAll('.edit').forEach(el=>el.onclick=()=>{const i=+el.dataset.i;const select=document.querySelector(`.colorSelect[data-i="${i}"]`);select.classList.remove('hidden');document.querySelector(`.colorview[data-color="${i}"]`)?.classList.add('hidden');select.focus();});
  document.querySelectorAll('.colorSelect').forEach(el=>el.onchange=()=>{d.contacts[+el.dataset.i].colorId=el.value;saveLocal(d);render();});
  document.querySelectorAll('.del').forEach(el=>el.onclick=()=>{d.contacts.splice(+el.dataset.i,1);saveLocal(d);render();});
}

function changeCableScreen(d){
  const current=d.cableId||'utp4';
  app.innerHTML=`<div class="header"><button class="back" id="back">‹</button><h1>Выберите кабель</h1></div><p class="muted cableIntro">Смена кабеля изменит список доступных жил. Существующие контакты с неподходящим цветом станут «не выбран».</p><div class="cableList">${Object.entries(CABLES).map(([id,c])=>`<button class="cableCard ${id===current?'selected':''}" data-cable="${id}"><span class="cableIcon ${id}">${id==='utp4'?'8':id==='utp2'?'4':'2'}</span><span class="cableInfo"><b>${esc(c.name)}</b><small>${esc(c.subtitle)}</small></span>${id===current?'<span class="check">✓</span>':'<span class="chev">›</span>'}</button>`).join('')}</div>`;
  document.getElementById('back').onclick=()=>render();
  document.querySelectorAll('[data-cable]').forEach(el=>el.onclick=()=>{d.cableId=el.dataset.cable;d.contacts=d.contacts.map(r=>colorById(d,r.colorId)?r:{...r,colorId:''});saveLocal(d);render();});
}

function render(){ auth?.access_token ? (currentId ? editorScreen() : homeScreen()) : loginScreen(); }

async function boot(){
  if(auth?.access_token && navigator.onLine){ try{await syncPending(); await pullCloud();}catch(e){auth=null;localStorage.removeItem(AUTH_KEY);} }
  render();
}

window.addEventListener('online',async()=>{if(auth?.access_token){try{await syncPending();await pullCloud();render();}catch(e){}}});
boot();
