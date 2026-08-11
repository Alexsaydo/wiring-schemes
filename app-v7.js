const SUPABASE_URL = 'https://icenlyttjymkuhudocqm.supabase.co';
const SUPABASE_KEY = ['sb_publishable_3-YQ35','kD_JOBz_5g1JYTuA_r0b3_QdY'].join('');
const SUPABASE_EMAIL = 'andreev.bu@gmail.com';

const AUTH_KEY = 'wiring-auth-v3';
const LOCAL_KEY = 'wiring-local-v6';
const PENDING_KEY = 'wiring-pending-v3';
const DELETE_KEY = 'wiring-deletes-v1';

const CABLES = {
  utp4:{name:'UTP 4',subtitle:'4 пары · 8 жил',colors:[['white-orange','Бело-оранжевый','#f97316'],['orange','Оранжевый','#f97316'],['white-green','Бело-зелёный','#22c55e'],['green','Зелёный','#22c55e'],['white-blue','Бело-синий','#3b82f6'],['blue','Синий','#3b82f6'],['white-brown','Бело-коричневый','#92400e'],['brown','Коричневый','#92400e']]},
  utp2:{name:'UTP2',subtitle:'Оранжевая + синяя пары · 4 жилы',colors:[['white-orange','Бело-оранжевый','#f97316'],['orange','Оранжевый','#f97316'],['white-blue','Бело-синий','#3b82f6'],['blue','Синий','#3b82f6']]},
  shvvp:{name:'ШВВП',subtitle:'2 жилы',colors:[['brown','Коричневый','#92400e'],['blue','Синий','#3b82f6']]},
  kspv:{name:'КСПВ',subtitle:'2 жилы',colors:[['brown','Коричневый','#92400e'],['white','Белый','#f8fafc']]}
};

const app=document.getElementById('app');
let auth=read(AUTH_KEY),devices=read(LOCAL_KEY)||[],pending=read(PENDING_KEY)||[],pendingDeletes=read(DELETE_KEY)||[],currentId=null,editing=false,syncBusy=false;
function read(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function toast(t){const e=document.getElementById('toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),1800)}
function markPending(id){if(!pending.includes(id))pending.push(id);write(PENDING_KEY,pending)}
function clearPending(id){pending=pending.filter(x=>x!==id);write(PENDING_KEY,pending)}
function markDelete(id){if(!pendingDeletes.includes(id))pendingDeletes.push(id);write(DELETE_KEY,pendingDeletes)}
function clearDelete(id){pendingDeletes=pendingDeletes.filter(x=>x!==id);write(DELETE_KEY,pendingDeletes)}
function cable(id){return CABLES[id]||null}
function colorFor(row){return cable(row.cableId)?.colors.find(x=>x[0]===row.colorId)}
function normalizeDevice(d){const legacy=d.cableId&&CABLES[d.cableId]?d.cableId:null;d.contacts=(Array.isArray(d.contacts)?d.contacts:[]).map(r=>({contact:r.contact||'',cableId:r.cableId||(legacy||''),colorId:r.colorId||''}));d.cableId='mixed';return d}
function normalizeAll(){devices=devices.map(normalizeDevice);write(LOCAL_KEY,devices)}
normalizeAll();

async function refreshSession(){
  if(!auth?.refresh_token)throw new Error('Сессия отсутствует');
  const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token})});
  const d=await r.json();if(!r.ok)throw new Error(d?.msg||d?.message||'Сессия истекла');auth=d;write(AUTH_KEY,auth);return d;
}
async function api(path,options={},retry=true){
  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};if(auth?.access_token)headers.Authorization='Bearer '+auth.access_token;
  const res=await fetch(SUPABASE_URL+path,{...options,headers});let data=null;try{data=await res.json()}catch(e){}
  if(!res.ok){if(res.status===401&&retry&&auth?.refresh_token&&navigator.onLine){try{await refreshSession();return api(path,options,false)}catch(e){}}const err=new Error(data?.msg||data?.message||data?.error_description||data?.error||'Ошибка соединения');err.status=res.status;err.details=data;throw err}return data;
}
async function login(password){auth=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:SUPABASE_EMAIL,password})},false);write(AUTH_KEY,auth)}
async function pullCloud(){if(!auth?.access_token||!navigator.onLine)return false;const rows=await api('/rest/v1/devices?select=id,name,cable_id,contacts,created_at,updated_at&order=created_at.asc');devices=rows.map(d=>normalizeDevice({id:d.id,name:d.name,cableId:d.cable_id,contacts:d.contacts,created_at:d.created_at,updated_at:d.updated_at}));write(LOCAL_KEY,devices);return true}
async function saveCloud(d){
  if(!auth?.access_token||!navigator.onLine){markPending(d.id);return false}
  try{const userId=auth.user?.id;if(!userId)throw new Error('Не найден пользователь Supabase');const payload={name:d.name,cable_id:'mixed',contacts:d.contacts,user_id:userId,updated_at:new Date().toISOString()};
    if(String(d.id).startsWith('local-')){const rows=await api('/rest/v1/devices',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});if(rows?.[0]){const old=d.id;Object.assign(d,{id:rows[0].id,created_at:rows[0].created_at,updated_at:rows[0].updated_at,cableId:'mixed'});clearPending(old);markPending(d.id);write(LOCAL_KEY,devices)}}
    else await api('/rest/v1/devices?id=eq.'+encodeURIComponent(d.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    clearPending(d.id);write(LOCAL_KEY,devices);return true;
  }catch(e){markPending(d.id);console.warn('sync',e.status,e.details||e);return false}
}
async function syncPending(showToast=false){
  if(syncBusy||!navigator.onLine||!auth?.access_token)return;syncBusy=true;let ok=true;
  try{for(const id of [...pendingDeletes]){try{await api('/rest/v1/devices?id=eq.'+encodeURIComponent(id),{method:'DELETE'});clearDelete(id)}catch(e){ok=false}}
    for(const id of [...pending]){const d=devices.find(x=>x.id===id);if(d){if(!await saveCloud(d))ok=false}else clearPending(id)}}finally{syncBusy=false}
  if(showToast)toast(ok?'Синхронизировано':'Синхронизация отложена');
}
async function commitDevice(d){write(LOCAL_KEY,devices);markPending(d.id);if(!navigator.onLine){toast('Сохранено на устройстве');return false}const ok=await saveCloud(d);toast(ok?'Синхронизировано':'Сохранено на устройстве · синхронизация позже');return ok}
async function commitDelete(d){clearPending(d.id);if(String(d.id).startsWith('local-'))return true;if(!navigator.onLine||!auth?.access_token){markDelete(d.id);return false}try{await api('/rest/v1/devices?id=eq.'+encodeURIComponent(d.id),{method:'DELETE'});clearDelete(d.id);return true}catch(e){markDelete(d.id);console.warn('delete sync',e);return false}}

function loginScreen(message=''){app.innerHTML=`<div class="card login"><div class="plug">🔌</div><h1>Схемы расключения</h1><p class="muted">Введите пароль для доступа к общей базе схем.</p><label>Пароль</label><input id="password" type="password" placeholder="Пароль" autocomplete="current-password"><button class="primary" id="loginButton">Войти</button><div id="loginError" class="muted error">${esc(message)}</div></div>`;const p=document.getElementById('password'),b=document.getElementById('loginButton'),e=document.getElementById('loginError');async function go(){if(!p.value.trim()){e.textContent='Введите пароль.';return}b.disabled=true;b.textContent='Входим…';e.textContent='';try{await login(p.value);try{await syncPending(false)}catch(x){}try{await pullCloud()}catch(x){console.warn('cloud load',x);toast('Вход выполнен · база недоступна, работаем локально')}render()}catch(x){b.disabled=false;b.textContent='Войти';e.textContent=!navigator.onLine?'Нет интернета для первого входа.':(x?.message||'Не удалось войти.')}}b.onclick=go;p.onkeydown=x=>{if(x.key==='Enter')go()};p.focus()}
function deviceCableLabel(d){const ids=[...new Set(d.contacts.map(r=>r.cableId).filter(Boolean))];if(ids.length===1&&CABLES[ids[0]])return CABLES[ids[0]].name;if(ids.length>1)return 'Смешанное подключение';return 'Кабель не выбран'}
function homeScreen(){app.innerHTML=`<div class="header"><h1>Схемы расключения</h1><span class="cloud">☁</span></div>`+(devices.length?devices.map(d=>`<button class="device" data-id="${esc(d.id)}"><span class="icon">⌁</span><span class="deviceMain"><span class="name">${esc(d.name)}</span><span class="deviceCable">${esc(deviceCableLabel(d))}</span></span><span class="count">${d.contacts.length} контактов</span><span class="chev">›</span></button>`).join(''):`<div class="card empty"><div class="plug">🔌</div><h2>Пока ничего нет</h2><p class="muted">Добавьте устройство и для каждого контакта выберите свой кабель и жилу.</p></div>`)+`<button class="primary addDevice" id="addDevice">＋ Новое устройство</button>`;document.querySelectorAll('[data-id]').forEach(e=>e.onclick=()=>{currentId=e.dataset.id;editing=false;render()});document.getElementById('addDevice').onclick=()=>{const name=prompt('Введите название устройства:');if(name?.trim()){const d={id:'local-'+uid(),name:name.trim(),cableId:'mixed',contacts:[]};devices.push(d);write(LOCAL_KEY,devices);markPending(d.id);currentId=d.id;editing=true;render()}}}
function cableOptions(selected=''){return `<option value="">Выберите кабель</option>`+Object.entries(CABLES).map(([id,c])=>`<option value="${id}" ${id===selected?'selected':''}>${esc(c.name)}</option>`).join('')}
function colorOptions(row){const c=cable(row.cableId);return `<option value="">Выберите жилу</option>`+(c?c.colors.map(x=>`<option value="${x[0]}" ${x[0]===row.colorId?'selected':''}>${esc(x[1])}</option>`).join(''):'')}
function wireSwatch(row){const c=colorFor(row);if(!c)return `<span class="wireSwatch empty"></span>`;return `<span class="wireSwatch ${esc(c[0])}"></span>`}
function contactViewRow(r){const c=colorFor(r),cableName=cable(r.cableId)?.name||'Кабель не выбран',colorName=c?.[1]||'Жила не выбрана';return `<div class="viewRow"><div class="viewContact">${esc(r.contact||'Без названия')}</div><div class="viewWire"><div class="viewCable">${esc(cableName)}</div><div class="viewColor">${wireSwatch(r)}<span>${esc(colorName)}</span></div></div></div>`}
function contactRow(r,i){return `<div class="row"><div class="contactField"><label>Контакт</label><input class="contact" data-i="${i}" value="${esc(r.contact)}" placeholder="Например: GND"></div><div class="wireFields"><div><label>Кабель</label><select class="cableSelect" data-i="${i}">${cableOptions(r.cableId)}</select></div><div><label>Цвет жилы</label><span class="editorWireSwatch ${esc(r.colorId||'empty')}"></span><select class="colorSelect" data-i="${i}" ${r.cableId?'':'disabled'}>${colorOptions(r)}</select></div></div><div class="rowButtons"><button class="del" data-i="${i}">×</button></div></div>`}
function wirePaint(){document.querySelectorAll('.editorWireSwatch').forEach(w=>{w.className='editorWireSwatch '+(w.parentElement.querySelector('.colorSelect')?.value||'empty')})}
function bindEditor(d){document.querySelectorAll('.contact').forEach(e=>e.oninput=()=>{d.contacts[+e.dataset.i].contact=e.value;write(LOCAL_KEY,devices);markPending(d.id)});document.querySelectorAll('.cableSelect').forEach(e=>e.onchange=()=>{const r=d.contacts[+e.dataset.i];r.cableId=e.value;r.colorId='';write(LOCAL_KEY,devices);markPending(d.id);render()});document.querySelectorAll('.colorSelect').forEach(e=>e.onchange=()=>{d.contacts[+e.dataset.i].colorId=e.value;write(LOCAL_KEY,devices);markPending(d.id);wirePaint()});document.querySelectorAll('.del').forEach(e=>e.onclick=()=>{d.contacts.splice(+e.dataset.i,1);write(LOCAL_KEY,devices);markPending(d.id);render()});document.getElementById('addContact').onclick=()=>{d.contacts.push({contact:'',cableId:'',colorId:''});write(LOCAL_KEY,devices);markPending(d.id);render()};wirePaint()}
function removeDevice(d){if(!confirm('Удалить устройство и его схему?'))return;devices=devices.filter(x=>x!==d);write(LOCAL_KEY,devices);currentId=null;editing=false;commitDelete(d).finally(render)}
function editorScreen(){const d=devices.find(x=>x.id===currentId);if(!d){currentId=null;return render()}normalizeDevice(d);if(!editing){app.innerHTML=`<div class="header"><button class="back" id="back">‹</button><div class="titleBlock"><h1>${esc(d.name)}</h1></div></div><div class="actions"><button class="secondary" id="rename">✎ Переименовать</button><button class="danger" id="remove">Удалить</button></div><div class="card"><div class="sectionHead"><b>Расключение</b></div>${d.contacts.length?d.contacts.map(contactViewRow).join(''):`<div class="empty small"><span class="muted">Контактов пока нет.</span></div>`}</div><button class="primary" id="edit" style="display:block;width:100%;max-width:980px;margin:16px auto 0;font-size:20px">✎ Редактировать</button>`;document.getElementById('back').onclick=()=>{currentId=null;render()};document.getElementById('edit').onclick=()=>{editing=true;render()};document.getElementById('rename').onclick=async()=>{const n=prompt('Новое название:',d.name);if(n?.trim()){d.name=n.trim();await commitDevice(d);render()}};document.getElementById('remove').onclick=()=>removeDevice(d);return}app.innerHTML=`<div class="header"><button class="back" id="back">‹</button><div class="titleBlock"><h1>${esc(d.name)}</h1><span class="titleCable">Редактирование</span></div></div><div class="actions"><button class="secondary" id="rename">✎ Переименовать</button><button class="danger" id="remove">Удалить</button></div><div class="card"><div class="sectionHead"><div><b>Расключение</b><div class="muted subtitle">Для каждого контакта — свой кабель и цвет жилы</div></div></div>${d.contacts.length?d.contacts.map(contactRow).join(''):`<div class="empty small"><span class="muted">Контактов пока нет.</span></div>`}<button class="secondary add" id="addContact">＋ Добавить контакт</button></div><button class="primary" id="done" style="display:block;width:100%;max-width:980px;margin:16px auto 0;font-size:20px">✓ Готово</button>`;document.getElementById('back').onclick=()=>{currentId=null;render()};document.getElementById('done').onclick=async()=>{await commitDevice(d);editing=false;render()};document.getElementById('rename').onclick=async()=>{const n=prompt('Новое название:',d.name);if(n?.trim()){d.name=n.trim();write(LOCAL_KEY,devices);markPending(d.id);render()}};document.getElementById('remove').onclick=()=>removeDevice(d);bindEditor(d)}
function render(){if(!auth?.access_token&&!devices.length){loginScreen();return}if(currentId)editorScreen();else homeScreen()}
window.addEventListener('online',async()=>{if(auth?.access_token){await syncPending(false);try{await pullCloud()}catch(e){console.warn('online pull',e)}if(!currentId)render()}});
window.addEventListener('offline',()=>toast('Офлайн · работаем с сохранёнными данными'));
render();if(navigator.onLine&&auth?.access_token)syncPending(false);