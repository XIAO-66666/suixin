let cloudBusy=false,cloudTimer=null;
let cloudRevision=window.SUIXIN_CLOUD?.revision || 0;
let cloudConflict=!!window.SUIXIN_CLOUD?.conflict;
const cloudKey=key=>storageKey('cloud.'+key);
$('#page-life .sub').insertAdjacentHTML('afterend',`<div id="cloudBar" class="cloud-bar"><span id="cloudStatus"></span><button id="syncNow">立即同步</button><button id="cloudConflictBtn" class="hidden">处理版本差异</button></div>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="cloudDialog" class="experience-dialog" aria-labelledby="cloudTitle"><button class="dialog-close" id="closeCloudDialog" aria-label="关闭">×</button><h2 id="cloudTitle">两边都有新的小日子</h2><p class="sub">先下载本机备份，再选择要继续使用的版本。不会静默覆盖你在另一台设备上的修改。</p><p id="cloudCounts" class="sub"></p><button id="backupCloudLocal" class="wide-button">下载本机备份</button><button id="useRemoteCloud" class="share-btn">已备份，使用云端版本</button><button id="useLocalCloud" class="share-btn">已备份，用本机版本更新云端</button><p id="cloudError" class="auth-error" role="status"></p></dialog>`);
let backupBeforeConflict=false;
function snapshotSignature(value){return JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);}
function cloudSnapshot(){
  return {soloPet:window.readSoloPet?window.readSoloPet():{adopted:false,name:'小团子',personality:'gentle'},tasks:readJson(STORAGE_KEYS.tasks,[]),history:readJson(STORAGE_KEYS.history,[]),petMood:Number(localStorage.getItem(storageKey(STORAGE_KEYS.petMood))||70),petAffection:Number(localStorage.getItem(storageKey(STORAGE_KEYS.petAffection))||0)};
}
function applyCloudSnapshot(snapshot){
  if(snapshot.soloPet)localStorage.setItem(storageKey(STORAGE_KEYS.soloPet),JSON.stringify(snapshot.soloPet));
  for(const key of ['tasks','history'])localStorage.setItem(storageKey(STORAGE_KEYS[key]),JSON.stringify(snapshot[key]||[]));
  for(const key of ['petMood','petAffection'])localStorage.setItem(storageKey(STORAGE_KEYS[key]),String(snapshot[key]??(key==='petMood'?70:0)));
  tasks=readJson(STORAGE_KEYS.tasks,[]).map(normalizeTask).filter(Boolean);history=readJson(STORAGE_KEYS.history,[]).map(normalizeHistory).filter(Boolean);
  petMood=Number(snapshot.petMood??70);petAffection=Number(snapshot.petAffection||0);
  renderTasks();renderHistory();renderLife();updatePetStatus();
}
function cloudStatus(message){$('#cloudStatus').textContent=message;$('#cloudConflictBtn').classList.toggle('hidden',!cloudConflict);}
window.queueCloudSave=()=>{
  if(!socialUser)return;
  localStorage.setItem(cloudKey('dirty'),'1');cloudStatus(cloudConflict?'有版本差异，等待你选择':'已保存在本机，等待同步');
  clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>syncCloud(),1000);
};
async function syncCloud(){
  if(!socialUser||cloudBusy||cloudConflict)return;
  cloudBusy=true;
  try{
    const remote=await socialApi('state');
    const dirty=localStorage.getItem(cloudKey('dirty'))==='1';
    cloudRevision=Number(localStorage.getItem(cloudKey('revision'))||cloudRevision);
    if(dirty){
      const snapshot=cloudSnapshot();
      if(remote.revision!==cloudRevision){
        if(snapshotSignature(remote.snapshot)===snapshotSignature(snapshot)){
          cloudRevision=remote.revision;localStorage.setItem(cloudKey('revision'),String(cloudRevision));localStorage.removeItem(cloudKey('dirty'));
        }else{cloudConflict=true;cloudStatus('两台设备都有更新，请选择保留版本');return;}
      }else{
        const result=await socialApi('state',{revision:cloudRevision,snapshot});
        cloudRevision=result.revision;localStorage.setItem(cloudKey('revision'),String(cloudRevision));
        if(snapshotSignature(snapshot)===snapshotSignature(cloudSnapshot()))localStorage.removeItem(cloudKey('dirty'));
      }
    }else if(remote.revision!==cloudRevision&&remote.snapshot){
      // A fresh local write during the fetch takes precedence over applying remote data.
      if(localStorage.getItem(cloudKey('dirty'))==='1'){cloudConflict=true;cloudStatus('同步时产生了新记录，请处理版本差异');return;}
      applyCloudSnapshot(remote.snapshot);cloudRevision=remote.revision;localStorage.setItem(cloudKey('revision'),String(cloudRevision));
    }
    cloudStatus(localStorage.getItem(cloudKey('dirty'))==='1'?'本机还有更新，稍后继续同步':'已同步到账号 · 私人记录仅自己可见');
  }catch(error){if(error.status===409){cloudConflict=true;cloudStatus('另一台设备有更新，请处理版本差异');}else cloudStatus('暂未同步，本机记录仍保留。联网后可重试。');}
  finally{cloudBusy=false;}
}
$('#syncNow').onclick=()=>syncCloud();
$('#cloudConflictBtn').onclick=async()=>{
  backupBeforeConflict=false;$('#cloudError').textContent='';
  try{const remote=await socialApi('state');$('#cloudCounts').textContent=`本机 ${cloudSnapshot().history.length} 条记录，云端 ${remote.snapshot?.history.length||0} 条记录。`;}catch(error){$('#cloudCounts').textContent=socialError(error);}
  $('#cloudDialog').showModal();
};
$('#closeCloudDialog').onclick=()=>$('#cloudDialog').close();
$('#backupCloudLocal').onclick=()=>{$('#exportBtn').click();backupBeforeConflict=true;$('#cloudError').textContent='已发起备份下载，请确认文件已保存，再选择版本。';};
async function resolveCloud(useLocal){
  if(!backupBeforeConflict){$('#cloudError').textContent='请先下载本机备份，以便需要时恢复。';return;}
  try{
    const remote=await socialApi('state');
    const uploading=useLocal?cloudSnapshot():null;
    if(useLocal){const result=await socialApi('state',{revision:remote.revision,snapshot:uploading});cloudRevision=result.revision;}
    else {if(!remote.snapshot)throw Error('云端还没有记录');applyCloudSnapshot(remote.snapshot);cloudRevision=remote.revision;}
    localStorage.setItem(cloudKey('revision'),String(cloudRevision));
    if(useLocal&&snapshotSignature(uploading)!==snapshotSignature(cloudSnapshot()))localStorage.setItem(cloudKey('dirty'),'1');else localStorage.removeItem(cloudKey('dirty'));
    cloudConflict=false;$('#cloudDialog').close();cloudStatus('版本已确认，账号记录已同步');
  }catch(error){$('#cloudError').textContent=socialError(error);}
}
$('#useRemoteCloud').onclick=()=>resolveCloud(false);$('#useLocalCloud').onclick=()=>resolveCloud(true);
if(!socialUser){$('#syncNow').classList.add('hidden');cloudStatus('游客记录保存在本机，登录后可同步到账号');}
else{
  cloudStatus(cloudConflict?'两边都有更新，请处理版本差异':window.SUIXIN_CLOUD?.offline?'云端暂不可用，本机记录仍保留':'账号同步已连接');
  if(window.SUIXIN_CLOUD?.needsUpload)window.queueCloudSave();else if(!cloudConflict)syncCloud();
}
setInterval(()=>{if(!document.hidden&&socialUser)syncCloud();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloud();});
