/* A welcoming first session, a personal companion, and everyday utilities. */
let homeAction={kind:'draw'},guideStep=-1,reminderBusy=false,reminderActivity=null;
let activeReminder=null;const reminderQueue=[];
const personalities={gentle:'温柔慢热',curious:'好奇探险',sunny:'元气满满'};
function normalizeSoloPet(value){
  if(!value||typeof value!=='object')return {adopted:false,name:'小团子',personality:'gentle'};
  return {adopted:value.adopted===true,name:String(value.name||'小团子').trim().slice(0,20)||'小团子',personality:personalities[value.personality]?value.personality:'gentle',appearance:value.appearance||{kind:'hoodie',imageId:''}};
}
window.readSoloPet=()=>{try{return normalizeSoloPet(JSON.parse(localStorage.getItem(storageKey(STORAGE_KEYS.soloPet))||'null'));}catch{return normalizeSoloPet(null);}};
window.restoreSoloPet=value=>{const profile=normalizeSoloPet(value);localStorage.setItem(storageKey(STORAGE_KEYS.soloPet),JSON.stringify(profile));if(window.queueCloudSave)window.queueCloudSave();window.renderSolo?.();};
window.mergeGuestCompanion=()=>{if(window.readSoloPet().adopted)return;try{const guest=JSON.parse(localStorage.getItem(STORAGE_KEYS.soloPet)||'null');if(guest?.adopted)window.restoreSoloPet(guest);}catch{}};

$('#page-today').classList.add('home-polished');
$('#page-today .page-head').insertAdjacentHTML('afterend',`<div class="home-intro"><span class="eyebrow" id="homeGreeting"></span><h2 id="homeHeading">给普通的今天，一点小惊喜</h2><p id="homeReason">不用安排满满，找一件你愿意的小事就好。</p></div><div id="guideCard" class="guide-card"><div><b id="guideTitle">第一次来？用一分钟认识随心</b><p id="guideDescription">选个心情，留个瞬间，看小房间慢慢变化。</p></div><div class="guide-actions"><button id="guideNext">开始体验</button><button id="guideSkip">先随便逛逛</button></div></div>`);
$('#petStatus').insertAdjacentHTML('afterend',`<div class="home-shortcuts"><button id="openSoloPet">🐾 单人养宠</button><button id="replayGuide">重新体验引导</button></div>`);
$('#drawCard').insertAdjacentHTML('afterend',`<button id="homeDrawInstead" class="home-draw-instead hidden">我想先找一点自己的灵感 ↗</button>`);
$('#page-life .sub').insertAdjacentHTML('afterend',`<div id="soloCompanion" class="solo-companion"><div class="solo-avatar">🐾</div><div><b id="soloName">单人养宠 · 一个人也有陪伴</b><p id="soloDescription">不用等好友，先认识属于你的小动物。</p></div><button id="adoptSoloPet">领养</button></div><div class="life-search"><label for="lifeSearch" class="sr-only">搜索生活记录</label><input id="lifeSearch" type="search" placeholder="找一个瞬间、心情或日期…"><button id="clearLifeSearch">清空</button><p id="lifeSearchCount" role="status"></p></div>`);
$('#jointWhen').previousElementSibling.insertAdjacentHTML('beforebegin',`<label class="field-label" for="jointStartAt">约一个具体时间（选填）</label><input id="jointStartAt" type="datetime-local">`);
$('#jointWhen').previousElementSibling.textContent='时间补充（选填）';
$('#reviseActivityWhen').previousElementSibling.insertAdjacentHTML('beforebegin',`<label class="field-label" for="reviseStartAt">新的具体时间（选填）</label><input id="reviseStartAt" type="datetime-local">`);
$('#settingsDialog .danger-zone').insertAdjacentHTML('beforebegin',`<h3 class="social-heading">带走我的账号数据</h3><p class="sub">包含账号云端记录、可见的消息、自己写的共同回忆与存档。下载后请妥善保管。</p><button id="exportAccountData" class="share-btn">导出账号数据存档</button><p id="accountExportStatus" class="social-status" role="status"></p>`);
document.body.insertAdjacentHTML('beforeend',`
<dialog id="soloPetDialog" class="experience-dialog" aria-labelledby="soloPetTitle"><button id="closeSoloPet" class="dialog-close" aria-label="关闭">×</button><div class="eyebrow">A LITTLE FRIEND, JUST FOR YOU</div><h2 id="soloPetTitle">认识你的专属小动物</h2><p class="sub">它会跟着你的小日子慢慢成长。游客也可以领养，之后可以合并到自己的账号。</p><form id="soloPetForm"><label class="field-label" for="soloPetName">给它取个名字</label><input id="soloPetName" required maxlength="20" value="小团子"><label class="field-label" for="soloPersonality">它是什么性格？</label><select id="soloPersonality"><option value="gentle">☁️ 温柔慢热 · 喜欢安静陪伴</option><option value="curious">🌿 好奇探险 · 爱发现小惊喜</option><option value="sunny">☀️ 元气满满 · 为每个小收获开心</option></select><button class="wide-button" type="submit">就和你一起过小日子</button></form><p id="soloPetStatus" class="social-status" role="status"></p></dialog>
<dialog id="reminderDialog" class="experience-dialog" aria-labelledby="reminderTitle"><button id="closeReminder" class="dialog-close" aria-label="关闭">×</button><h2 id="reminderTitle">给这次约定留个提醒</h2><p id="reminderContext" class="sub"></p><form id="reminderForm"><label class="check-label"><input id="reminderEnabled" type="checkbox">提醒我这次约定</label><label class="field-label" for="reminderLead">什么时候提醒</label><select id="reminderLead"><option value="0">约定时间到了</option><option value="5">提前 5 分钟</option><option value="15">提前 15 分钟</option><option value="60">提前 1 小时</option></select><button class="wide-button" type="submit">保存我的提醒</button></form><p class="sub">应用打开且联网时会检查提醒；关闭应用后暂不推送。提醒只对自己生效，好友可以单独设置。</p><button id="allowSystemReminder" class="share-btn">允许浏览器系统通知（选填）</button><p id="reminderStatus" class="social-status" role="status"></p></dialog>
<div id="appointmentReminder" class="appointment-reminder hidden" role="status" aria-live="polite"><span id="appointmentText"></span><button id="openReminderActivity">看看约定</button><button id="dismissReminder" aria-label="关闭提醒">×</button></div>`);

window.readJointStart=selector=>{const value=$(selector)?.value;if(!value)return null;const time=Math.floor(new Date(value).getTime()/1000);if(!Number.isFinite(time))throw Error('请选择有效的约定时间');return time;};
window.setDateTimeValue=(selector,seconds)=>{if(!seconds){$(selector).value='';return;}const date=new Date(seconds*1000);const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);$(selector).value=local.toISOString().slice(0,16);};

function openSoloPet(){if(guideStep===3){localStorage.setItem(guideStorage(),'1');guideStep=-1;renderGuide();}const profile=window.readSoloPet();$('#soloPetName').value=profile.name;$('#soloPersonality').value=profile.personality;$('#soloPetTitle').textContent=profile.adopted?'和小伙伴再认识一下':'认识你的专属小动物';$('#soloPetStatus').textContent='';$('#soloPetDialog').showModal();}
$('#openSoloPet').onclick=openSoloPet;$('#adoptSoloPet').onclick=openSoloPet;$('#closeSoloPet').onclick=()=>$('#soloPetDialog').close();
$('#soloPetForm').onsubmit=event=>{event.preventDefault();try{window.restoreSoloPet({adopted:true,name:$('#soloPetName').value,personality:$('#soloPersonality').value,appearance:window.soloPetAppearanceDraft?.()||window.readSoloPet().appearance||{kind:'hoodie',imageId:''}});$('#soloPetDialog').close();petBounce();petSay('tap');window.refreshHome();toast('小伙伴有名字啦，以后一起慢慢来 🌷');}catch{$('#soloPetStatus').textContent='暂时保存不了，请检查浏览器存储空间。';}};
window.renderSolo=()=>{
  const profile=window.readSoloPet();const count=history.filter(item=>item.completed||item.note||item.memoryMood).length;
  if(profile.adopted){
    const stage=count>=7?'默契的老朋友':count>=3?'熟悉的小伙伴':count>=1?'慢慢认识你':'初见的陪伴';
    $('#soloName').textContent='单人养宠 · '+profile.name;
    $('#soloDescription').textContent=`${personalities[profile.personality]} · ${stage} · ${count} 个生活瞬间`;
    $('#adoptSoloPet').textContent='打开小窝';$('#petStatus').textContent=`${profile.name} · ${stage}`;
    $('#pet').setAttribute('aria-label',profile.name+'，点我互动');
    $('#page-life .room-pet>span').textContent=profile.name+'的小窝';
    $('#openSoloPet').textContent='🐾 单人养宠 · '+profile.name;
  }else{$('#soloName').textContent='单人养宠 · 一个人也有陪伴';$('#soloDescription').textContent='不用等好友，先认识属于你的小动物。';$('#adoptSoloPet').textContent='领养';}
  $('#soloCompanion').dataset.personality=profile.personality;$('#pet').dataset.personality=profile.personality;
};
window.soloPetLine=type=>{
  const profile=window.readSoloPet();if(!profile.adopted)return null;
  const latest=history.find(item=>item.note||item.completed||item.memoryMood);
  if(type==='tap'&&latest?.note)return `你说「${latest.note.slice(0,18)}${latest.note.length>18?'…':''}」，我有好好收着。`;
  if(type==='tap'&&latest?.filter==='outside')return '你上次带回的那阵风，我还记得。窗边的叶子也在呢。';
  const lines={gentle:{tap:'我在。今天不急，靠近一点也很好。',play:'慢慢玩一会儿，我最喜欢你在的时候。',feed:'谢谢你，也记得照顾自己呀。',idle:'休息的时候，我也会安静陪着你。'},curious:{tap:'今天发现了什么小惊喜？我想听！',play:'探险队集合！先看看桌边有什么新发现。',feed:'这是什么味道？下一次也想和你尝尝。',idle:'如果你愿意，我们可以去找一件没试过的小事。'},sunny:{tap:'你来啦！今天又可以一起收集一点开心。',play:'准备好了吗？我先跳一下为你加油！',feed:'啊呜，谢谢！这点暖意我收好啦。',idle:'普通的一天也可以亮一点点，我陪你！'}};
  return lines[profile.personality][type]||lines[profile.personality].tap;
};

window.refreshHome=()=>{
  const hour=new Date().getHours();const profile=window.readSoloPet();
  $('#homeGreeting').textContent=(hour<11?'早上好':hour<18?'下午好':'晚上好')+(socialUser?'，'+socialUser.nickname:'，随心的朋友');
  const request=socialState.requests.find(item=>item.target===socialUser?.id);
  const activity=togetherState.activities.find(item=>item.target===socialUser?.id&&item.status==='pending');
  const adoption=togetherState.pets.find(item=>item.proposer!==socialUser?.id&&item.status==='pending');
  const unread=socialState.friends.filter(item=>!item.muted).reduce((sum,item)=>sum+item.unread,0);
  let title='给普通的今天，一点小惊喜',reason=profile.adopted?`${profile.name}在等你。不用完成很多，留下一刻也很好。`:'一个人也可以开始，先找一件你愿意的小事。',button='给今天一点小灵感',sub='跟着此刻的心情，轻轻开始';homeAction={kind:'draw'};
  if(activity){title='有一份小邀请，想听听你的想法';reason=activity.otherName+' 想和你「'+activity.title+'」';button='回应这份小邀请';sub='接受、商量时间，或者这次先不了都可以';homeAction={kind:'activity',id:activity.id};}
  else if(adoption){title='有人想和你一起养一只小动物';reason=adoption.otherName+' 邀请你领养「'+adoption.name+'」';button='看看共同领养邀请';sub='两个人都愿意，小窝才会开始';homeAction={kind:'together'};}
  else if(request){title='一位朋友，想靠近你的小日子';reason=request.nickname+' 发来了好友申请';button='看看好友申请';sub='由你决定是否成为好友';homeAction={kind:'people'};}
  else if(unread){title='朋友给你留了点小心意';reason=`有 ${unread} 条还没看的消息，随时去看看。`;button='打开好友收件箱';sub='不用立刻回复，按自己的节奏来';homeAction={kind:'inbox'};}
  else {
    const planned=togetherState.activities.find(item=>item.status==='accepted');
    if(planned){title='你们约好了一件小事';reason=planned.title;button='看看我们的小约定';sub=planned.starts_at?new Date(planned.starts_at*1000).toLocaleString('zh-CN'):'等你们都做过，再一起确认';homeAction={kind:'activity',id:planned.id};}
  }
  $('#homeHeading').textContent=title;$('#homeReason').textContent=reason;$('#drawCard strong').textContent=button;$('#drawCard small').textContent=sub;
  $('#homeDrawInstead').classList.toggle('hidden',homeAction.kind==='draw');
};
$('#drawCard').addEventListener('click',async event=>{
  if(drawing)return;
  if(homeAction.kind==='draw')return;
  event.preventDefault();event.stopImmediatePropagation();switchPage('friends');
  setSocialView(homeAction.kind==='activity'||homeAction.kind==='together'?'together':homeAction.kind);
  if(homeAction.kind==='activity'){await refreshTogether();document.getElementById('activity-'+homeAction.id)?.scrollIntoView({block:'center'});}
},true);
$('#homeDrawInstead').onclick=draw;

const guideStorage=()=>storageKey('onboardingDone');
const guideSteps=[['先选一个此刻的心情','累了、无聊、想出去，哪一个更像现在的你？','去选心情'],['让小伙伴提议一件小事','不喜欢可以换一张，选择不是承诺。','找一点灵感'],['给这一刻留下一句话','体验过就写一句感想，或者只选一个心情。','留下瞬间'],['你的房间，已经有了第一段故事','看看这次经历添上的小物，再给自己的小动物取个名字。','看看我的小房间']];
function renderGuide(){
  const done=localStorage.getItem(guideStorage())==='1';$('#guideCard').classList.toggle('hidden',done&&guideStep<0);
  if(guideStep<0)return;
  const step=guideSteps[guideStep];$('#guideTitle').textContent=`${guideStep+1} / 4 · ${step[0]}`;$('#guideDescription').textContent=step[1];$('#guideNext').textContent=step[2];
}
function startGuide(){localStorage.removeItem(guideStorage());guideStep=0;renderGuide();switchPage('today');$('#guideCard').scrollIntoView({block:'center'});}
$('#replayGuide').onclick=startGuide;
$('#guideSkip').onclick=()=>{localStorage.setItem(guideStorage(),'1');guideStep=-1;renderGuide();};
$('#guideNext').onclick=()=>{
  if(guideStep<0){startGuide();return;}
  if(guideStep===0){$('#page-today .mood-grid').scrollIntoView({block:'center'});$('#page-today [data-mood]').focus();}
  if(guideStep===1)draw();
  if(guideStep===2){if(history.length)openMoment(history[0].id);else{draw();toast('先挑一件小事，或者去「小日子」直接记录。');}}
  if(guideStep===3){localStorage.setItem(guideStorage(),'1');guideStep=-1;renderGuide();switchPage('life');$('#soloCompanion').scrollIntoView({block:'center'});}
};
$$('[data-mood]').forEach(button=>button.addEventListener('click',()=>{if(guideStep===0){guideStep=1;renderGuide();}}));
$('#doneBtn').addEventListener('click',()=>{if(guideStep===1){guideStep=2;renderGuide();}});
$('#resultMemoryBtn').addEventListener('click',()=>{if(guideStep===1){guideStep=2;renderGuide();}});
$('#momentForm').addEventListener('submit',()=>{if(guideStep>=1&&!$('#momentDialog').open&&history.some(item=>item.note||item.memoryMood)){guideStep=3;renderGuide();toast('第一个瞬间收好啦，房间有了自己的故事。');}});
$('#lifeSearch').addEventListener('input',()=>{window.lifeQuery=$('#lifeSearch').value;renderLife();});
$('#clearLifeSearch').onclick=()=>{$('#lifeSearch').value='';window.lifeQuery='';renderLife();$('#lifeSearch').focus();};

$('#chatMessages').addEventListener('click',async event=>{
  const button=event.target.closest('[data-delete-message]');if(!button)return;
  if(!confirm('只从你自己的对话中删除这条消息？对方仍可查看，关联的共同邀请会保留。'))return;
  button.disabled=true;
  try{await socialApi('messages/hide',{messageId:Number(button.dataset.deleteMessage)});conversation=conversation.filter(item=>item.id!==Number(button.dataset.deleteMessage));renderChat();await refreshSocial();}
  catch(error){toast(socialError(error));button.disabled=false;}
});
$('#exportAccountData').onclick=async()=>{
  $('#exportAccountData').disabled=true;$('#accountExportStatus').textContent='正在准备账号存档…';
  try{
    const data=await socialApi('account/export');
    data.thisDeviceRecords=cloudSnapshot();
    downloadText(`随心账号存档-${todayKey()}.json`,JSON.stringify(data,null,2));
    $('#accountExportStatus').textContent='已发起下载。账号存档用于留存查看；恢复小日子请使用「记录」中的备份导入。';
  }catch(error){$('#accountExportStatus').textContent=socialError(error);}finally{$('#exportAccountData').disabled=false;}
};

$('#jointActivities').addEventListener('click',event=>{const button=event.target.closest('[data-reminder-settings]');if(!button)return;reminderActivity=togetherState.activities.find(item=>item.id===button.dataset.reminderSettings);if(!reminderActivity)return;$('#reminderContext').textContent=reminderActivity.title+' · '+new Date(reminderActivity.starts_at*1000).toLocaleString('zh-CN');$('#reminderEnabled').checked=!!reminderActivity.reminder?.enabled;$('#reminderLead').value=String(reminderActivity.reminder?.lead||0);$('#reminderStatus').textContent='';$('#reminderDialog').showModal();});
$('#closeReminder').onclick=()=>$('#reminderDialog').close();
$('#reminderForm').onsubmit=async event=>{event.preventDefault();try{await socialApi(`activities/${reminderActivity.id}/reminder`,{enabled:$('#reminderEnabled').checked,lead:Number($('#reminderLead').value)});$('#reminderDialog').close();await refreshTogether();toast('你的提醒设置已保存');}catch(error){$('#reminderStatus').textContent=socialError(error);}};
$('#allowSystemReminder').onclick=async()=>{
  if(!('Notification' in window)||!window.isSecureContext){$('#reminderStatus').textContent='当前浏览器不支持系统通知，仍可使用应用内提醒。';return;}
  try{const permission=await Notification.requestPermission();$('#reminderStatus').textContent=permission==='granted'?'系统通知已允许，应用打开时可显示提醒。':'未允许系统通知，仍会在应用内显示提醒。';}catch{$('#reminderStatus').textContent='系统通知暂不可用，仍可使用应用内提醒。';}
};
window.checkReminders=async()=>{
  if(!socialUser||document.hidden||reminderBusy)return;reminderBusy=true;
  try{
    const now=Math.floor(Date.now()/1000);
    for(const item of togetherState.activities){
      if(item.status!=='accepted'||!item.starts_at||!item.reminder?.enabled||item.reminder.fired_at||now<item.starts_at-item.reminder.lead*60||now>item.starts_at+1800)continue;
      const result=await socialApi(`activities/${item.id}/reminder-fire`,{});if(!result.fired)continue;
      item.reminder.fired_at=now;reminderQueue.push(item);showNextReminder();
      if('Notification' in window&&Notification.permission==='granted'){try{new Notification('随心 · 小约定提醒',{body:item.title,tag:'suixin-'+item.id});}catch{}}
    }
  }catch{ /* Retry on the next refresh without repeated error toasts. */ }finally{reminderBusy=false;}
};
function showNextReminder(){if(activeReminder||!reminderQueue.length)return;activeReminder=reminderQueue.shift();$('#appointmentText').textContent='你和 '+activeReminder.otherName+' 的约定：'+activeReminder.title;$('#appointmentReminder').classList.remove('hidden');}
function dismissActiveReminder(){activeReminder=null;$('#appointmentReminder').classList.add('hidden');showNextReminder();}
$('#openReminderActivity').onclick=()=>{const id=activeReminder?.id;dismissActiveReminder();switchPage('friends');setSocialView('together');setTimeout(()=>document.getElementById('activity-'+id)?.scrollIntoView({block:'center'}),100);};
$('#dismissReminder').onclick=dismissActiveReminder;
setInterval(async()=>{if(socialUser&&!document.hidden){if(!togetherBusy)await refreshTogether();await window.checkReminders();}},30000);
$('#petPlay').addEventListener('click',()=>{if(window.readSoloPet().adopted&&history.filter(item=>item.completed||item.note||item.memoryMood).length>=3){$('#pet').classList.remove('solo-spin');void $('#pet').offsetWidth;$('#pet').classList.add('solo-spin');}});
window.renderSolo();window.refreshHome();renderGuide();renderLife();
if(socialUser)refreshTogether();
if(new URL(location.href).searchParams.get('view')==='solo'){
  switchPage('life');openSoloPet();
}

$('#soloPetDialog').addEventListener('close',()=>{const url=new URL(location.href);if(url.searchParams.get('view')==='solo'){url.searchParams.delete('view');window.history.replaceState(null,'',url.href);}});
