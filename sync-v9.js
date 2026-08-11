/* Sync/offline layer. UI is intentionally untouched. */
const SYNC_REV='sync-v9';

async function syncPullCloud(){
  if(!auth?.access_token||!navigator.onLine)return false;
  if(pending.length||pendingDeletes.length)return false;
  const userId=auth.user?.id;
  if(!userId)throw new Error('Не найден пользователь Supabase');
  const rows=await api('/rest/v1/devices?select=id,name,cable_id,contacts,created_at,updated_at&user_id=eq.'+encodeURIComponent(userId)+'&order=created_at.asc');
  devices=rows.map(d=>normalizeDevice({id:d.id,name:d.name,cableId:d.cable_id,contacts:d.contacts,created_at:d.created_at,updated_at:d.updated_at}));
  write(LOCAL_KEY,devices);
  return true;
}

async function syncSaveCloud(d){
  if(!auth?.access_token||!navigator.onLine){markPending(d.id);return false}
  try{
    const userId=auth.user?.id;
    if(!userId)throw new Error('Не найден пользователь Supabase');
    const payload={name:d.name,cable_id:'mixed',contacts:d.contacts,user_id:userId,updated_at:new Date().toISOString()};

    if(String(d.id).startsWith('local-')){
      const rows=await api('/rest/v1/devices',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
      if(!Array.isArray(rows)||!rows[0]?.id)throw new Error('Supabase не вернул созданное устройство');
      const oldId=d.id;
      Object.assign(d,{id:rows[0].id,created_at:rows[0].created_at,updated_at:rows[0].updated_at,cableId:'mixed'});
      clearPending(oldId);
      write(LOCAL_KEY,devices);
      return true;
    }

    const rows=await api('/rest/v1/devices?id=eq.'+encodeURIComponent(d.id)+'&user_id=eq.'+encodeURIComponent(userId),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    if(!Array.isArray(rows)||!rows[0]?.id){
      throw new Error('Supabase не обновил устройство: 0 строк. Проверь RLS UPDATE policy для devices.');
    }
    Object.assign(d,{updated_at:rows[0].updated_at||payload.updated_at});
    clearPending(d.id);
    write(LOCAL_KEY,devices);
    return true;
  }catch(e){
    markPending(d.id);
    console.warn(SYNC_REV,'save',e.status,e.details||e);
    return false;
  }
}

async function syncDeleteCloud(id){
  if(String(id).startsWith('local-')){clearDelete(id);return true}
  if(!auth?.access_token||!navigator.onLine){markDelete(id);return false}
  try{
    const userId=auth.user?.id;
    if(!userId)throw new Error('Не найден пользователь Supabase');
    const rows=await api('/rest/v1/devices?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(userId),{method:'DELETE',headers:{Prefer:'return=representation'}});
    /* 0 rows is safe for a delete: the row is already absent. */
    clearDelete(id);
    return true;
  }catch(e){
    markDelete(id);
    console.warn(SYNC_REV,'delete',e.status,e.details||e);
    return false;
  }
}

async function syncPending(showToast=false){
  if(syncBusy||!navigator.onLine||!auth?.access_token)return false;
  syncBusy=true;
  let ok=true;
  try{
    for(const id of [...pendingDeletes]){
      if(!await syncDeleteCloud(id))ok=false;
    }
    for(const id of [...pending]){
      const d=devices.find(x=>x.id===id);
      if(!d){clearPending(id);continue}
      if(!await syncSaveCloud(d))ok=false;
    }
  }finally{syncBusy=false}
  if(showToast)toast(ok?'Синхронизировано':'Не удалось синхронизировать · сохранено на устройстве');
  return ok;
}

async function commitDevice(d){
  write(LOCAL_KEY,devices);
  markPending(d.id);
  if(!navigator.onLine){toast('Сохранено на устройстве · офлайн');return false}
  const ok=await syncSaveCloud(d);
  toast(ok?'Синхронизировано':'Не удалось синхронизировать · сохранено на устройстве');
  return ok;
}

async function commitDelete(d){
  clearPending(d.id);
  if(String(d.id).startsWith('local-'))return true;
  if(!navigator.onLine||!auth?.access_token){markDelete(d.id);toast('Удалено на устройстве · синхронизация позже');return false}
  const ok=await syncDeleteCloud(d.id);
  toast(ok?'Удалено и синхронизировано':'Удалено на устройстве · синхронизация позже');
  return ok;
}

/* Replace the original cloud pull with a safe pull that never overwrites pending local edits. */
pullCloud=syncPullCloud;
saveCloud=syncSaveCloud;

/* One explicit sync attempt when the new layer loads. */
if(navigator.onLine&&auth?.access_token)syncPending(false).then(()=>{if(!pending.length&&!pendingDeletes.length)pullCloud().catch(e=>console.warn(SYNC_REV,'pull',e))});
