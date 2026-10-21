// Resolve the session before opening account-scoped local records.
(async () => {
  window.SUIXIN_USER = null;
  window.SUIXIN_SERVER = false;
  try {
    if (location.protocol !== 'file:') {
      const response = await fetch('./api/me', {cache:'no-store', credentials:'same-origin', signal:AbortSignal.timeout(4000)});
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        window.SUIXIN_USER = data.user || null;
        window.SUIXIN_SERVER = true;
      }
    }
  } catch { /* Offline visitors can still use local features. */ }
  window.SUIXIN_CLOUD={revision:0};
  if(window.SUIXIN_USER){
    const prefix=`suixin.user.${window.SUIXIN_USER.id}.`;
    try{
      const response=await fetch('./api/state',{cache:'no-store',credentials:'same-origin',headers:{'X-Suixin-Account':window.SUIXIN_USER.id},signal:AbortSignal.timeout(4000)});
      if(!response.ok)throw Error('Cloud unavailable');
      const remote=await response.json();
      let dirty=localStorage.getItem(prefix+'cloud.dirty')==='1';
      const localExists=['todayThings','todayHistory'].some(key=>{try{return JSON.parse(localStorage.getItem(prefix+key)||'[]').length>0;}catch{return false;}})||Number(localStorage.getItem(prefix+'petAffection')||0)>0||!!localStorage.getItem(prefix+'soloPet');
      if(remote.snapshot&&localStorage.getItem(prefix+'cloud.revision')===null&&localExists){dirty=true;localStorage.setItem(prefix+'cloud.dirty','1');}
      const revision=Number(localStorage.getItem(prefix+'cloud.revision')||0);
      window.SUIXIN_CLOUD={revision:remote.revision,conflict:dirty&&revision!==remote.revision};
      if(!dirty&&remote.snapshot){
        if(remote.snapshot.soloPet)localStorage.setItem(prefix+'soloPet',JSON.stringify(remote.snapshot.soloPet));
        for(const [field,key] of [['tasks','todayThings'],['history','todayHistory']])localStorage.setItem(prefix+key,JSON.stringify(remote.snapshot[field]||[]));
        for(const field of ['petMood','petAffection'])localStorage.setItem(prefix+field,String(remote.snapshot[field]??(field==='petMood'?70:0)));
        localStorage.setItem(prefix+'cloud.revision',String(remote.revision));
      }else if(!remote.snapshot&&(localStorage.getItem(prefix+'todayThings')||localStorage.getItem(prefix+'todayHistory'))){window.SUIXIN_CLOUD.needsUpload=true;}
    }catch{window.SUIXIN_CLOUD={revision:Number(localStorage.getItem(prefix+'cloud.revision')||0),offline:true};}
  }
  try {
    for (const file of ['script.js','share.js','companion.js','social.js','together.js','daily.js','pet-studio.js','sync.js']) {
      await new Promise((resolve,reject) => {
        const script = document.createElement('script'); script.src=file+'?v=18';
        script.onload=resolve; script.onerror=reject; document.body.append(script);
      });
    }
    document.querySelector('.app').classList.remove('hidden');
    document.querySelector('#appLoading').remove();
  } catch {
    document.querySelector('#appLoading').textContent='页面没有完整加载，请联网刷新后再试。';
  }
})();
