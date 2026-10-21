let socialUser = window.SUIXIN_USER;
let socialState = {friends:[],requests:[]};
let activeFriend = null;
let socialView = socialUser ? 'people' : 'compose';
let authMode = 'login';
let conversation = [];
let olderAvailable = false;
let refreshingSocial = false;
let refreshingChat = false;
let outgoingCard = '';
let outgoingCardId = '';
let messageRetry = null;
let authBusy = false;
let socialExpired = false;

async function socialApi(route, body) {
  const response = await fetch('./api/' + route, {
    method:body === undefined ? 'GET' : 'POST', credentials:'same-origin', cache:'no-store',
    headers:{...(socialUser ? {'X-Suixin-Account':socialUser.id} : {}),...(body === undefined ? {} : {'Content-Type':'application/json','X-Suixin-Request':'1'})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(route==='pet-generation'?210000:10000)
  });
  const json = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  if (!response.ok || !json) {
    if (response.status === 401 && socialUser && !['login','register','recover'].includes(route)) {
      socialExpired = true;
      $('#socialStatus').textContent='登录已过期，请重新登录。';
      $('#accountBtn').textContent='重新登录';
    }
    const error = new Error(json?.error || '好友服务暂时连不上，请检查网络后再试');
    error.status = response.status; throw error;
  }
  return json;
}
function socialError(error) {
  return ['TimeoutError','AbortError','TypeError'].includes(error.name) ? '连接暂时没有成功，内容还在，请稍后重试。' : error.message;
}
function notifyOtherTabs() {
  try { localStorage.setItem('suixin.authChanged', String(Date.now()) + Math.random()); } catch { /* Session remains valid without broadcast. */ }
}
window.addEventListener('storage', event => { if(event.key === 'suixin.authChanged') location.reload(); });

function openAuth(mode='login') {
  authMode=mode;
  $('#authTitle').textContent=mode==='login' ? '欢迎回来' : '认识一下吧';
  $('#authSubmit').textContent=mode==='login' ? '登录随心' : '创建账号';
  $('#nicknameField').classList.toggle('hidden',mode==='login');
  $('#authNickname').required=mode==='register';
  $('#authPassword').autocomplete=mode==='login' ? 'current-password' : 'new-password';
  $('#authSwitch').textContent=mode==='login' ? '还没有账号？注册一个' : '已经有账号？去登录';
  $('#authError').textContent='';
  if(!$('#authDialog').open) $('#authDialog').showModal();
  $('#authUsername').focus();
}
$('#accountBtn').onclick=()=>socialUser&&!socialExpired ? (switchPage('friends'),setSocialView('people')) : openAuth();
$('#loginForFriends').onclick=()=>openAuth();
$('#closeAuth').onclick=()=>{ if(!authBusy) { $('#authPassword').value=''; $('#authDialog').close(); } };
$('#authDialog').addEventListener('cancel', event=>{ if(authBusy)event.preventDefault();else $('#authPassword').value=''; });
$('#authSwitch').onclick=()=>{ if(!authBusy)openAuth(authMode==='login' ? 'register' : 'login'); };
$('#authForm').onsubmit=async event=>{
  event.preventDefault(); if(authBusy)return;
  if(!window.SUIXIN_SERVER) { $('#authError').textContent='当前打开的是离线或静态预览，请使用支持账号的服务端地址。'; return; }
  authBusy=true; $('#authSubmit').disabled=true; $('#authError').textContent='';
  try {
    const authResult=await socialApi(authMode,{username:$('#authUsername').value.trim(),password:$('#authPassword').value,nickname:$('#authNickname').value.trim()});
    $('#authPassword').value=''; if(authResult.recoveryCode){showRecoveryCode(authResult.recoveryCode,true,authResult.user.username);return;} notifyOtherTabs(); location.reload();
  } catch(error) { $('#authError').textContent=socialError(error); }
  finally { authBusy=false; $('#authSubmit').disabled=false; }
};
$('#logoutAccount').onclick=async()=>{
  $('#logoutAccount').disabled=true;
  try { await socialApi('logout',{}); notifyOtherTabs(); location.reload(); }
  catch(error) { toast(socialError(error)); $('#logoutAccount').disabled=false; }
};
$('#copyMyCode').onclick=()=>shareContent({title:'随心好友码',text:`我的随心好友码：${socialUser.code}。在「朋友 → 好友」中输入，等我确认就能互发小卡片。`,copyOnly:true});
$('#bindGuestRecords').onclick=()=>{
  try {
    if(!socialUser)return;
    const guestTasks=JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks)||'[]');
    const guestHistory=JSON.parse(localStorage.getItem(STORAGE_KEYS.history)||'[]');
    if(!Array.isArray(guestTasks)||!Array.isArray(guestHistory))throw Error('游客记录无法读取，请使用备份导入');
    const merge=(existing,incoming,normalize)=>{const ids=new Set(existing.map(item=>String(item.id)));return existing.concat(incoming.map(normalize).filter(item=>item&&!ids.has(String(item.id))&&ids.add(String(item.id))));};
    const nextTasks=merge(tasks,guestTasks,normalizeTask),nextHistory=merge(history,guestHistory,normalizeHistory);
    if(!writeJson(STORAGE_KEYS.tasks,nextTasks))return;
    tasks=nextTasks;renderTasks();
    if(!writeJson(STORAGE_KEYS.history,nextHistory))return;
    history=nextHistory;if(window.mergeGuestCompanion)window.mergeGuestCompanion();renderHistory();renderLife();toast('已合并这台设备的游客记录，游客原记录仍保留。');
  }catch(error){toast(error.message||'暂时无法导入，请使用备份文件');}
};
function setSocialView(view) {
  socialView=view;
  $$('[data-social-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.socialView===view)));
  $('#friendCompose').classList.toggle('hidden',view!=='compose');
  $('#friendPeople').classList.toggle('hidden',view!=='people');
  $('#friendInbox').classList.toggle('hidden',view!=='inbox');
  $('#friendTogether').classList.toggle('hidden',view!=='together'||!socialUser);
  if(view==='together'&&typeof refreshTogether==='function')refreshTogether();
  $('#accountSocialPanel').classList.toggle('together-active',view==='together');
  $('#accountSocialPanel').classList.toggle('chat-active',view==='inbox'&&!!activeFriend);
  if(view==='inbox' && activeFriend)refreshChat().catch(error=>toast(socialError(error)));
  if(view!=='compose'&&socialUser)refreshSocial();
}
$$('[data-social-view]').forEach(button=>button.onclick=()=>setSocialView(button.dataset.socialView));
function renderSocial() {
  const incoming=socialState.requests.filter(item=>item.target===socialUser?.id);
  const unread=socialState.friends.reduce((sum,item)=>sum+(item.muted?0:item.unread),0);
  const badge=unread+incoming.length;
  $('#friendBadge').textContent=badge>99 ? '99+' : badge || '';
  $('#friendBadge').classList.toggle('hidden',!badge);
  $('#inboxCount').textContent=unread ? ` (${unread})` : '';
  $('#requestList').innerHTML=socialState.requests.length ? socialState.requests.map(item=>`<div class="social-person"><div class="person-avatar">🌷</div><div class="person-info"><b>${escapeHtml(item.nickname)}</b><small>${item.target===socialUser.id ? '想成为你的好友' : '已发出申请，等对方确认'}</small></div>${item.target===socialUser.id ? `<div class="request-buttons"><button data-request="${item.id}" data-accept="true">接受</button><button data-request="${item.id}" data-accept="false">忽略</button></div>` : ''}</div>`).join('') : '<p class="social-empty">还没有待处理的申请。</p>';
  $('#friendList').innerHTML=socialState.friends.length ? socialState.friends.map(item=>`<div class="social-person"><div class="person-avatar">🌷</div><div class="person-info"><b>${escapeHtml(item.nickname)}</b><small>好友码 ${escapeHtml(item.code)}${item.muted ? " · 免打扰" : ""}</small></div><button data-chat="${item.id}">发消息${item.unread ? ` · ${item.unread}` : ''}</button><button data-manage-friend="${item.id}">管理</button><button class="remove-friend" data-remove-friend="${item.id}" aria-label="移除 ${escapeHtml(item.nickname)}">×</button></div>`).join('') : '<div class="empty">把你的好友码告诉朋友。<br>对方申请、你确认，就能在这里相遇。</div>';
  const sorted=socialState.friends.slice().sort((a,b)=>(b.last?.created||0)-(a.last?.created||0));
  $('#conversationList').innerHTML=sorted.length ? sorted.map(item=>`<button class="conversation-row" data-chat="${item.id}"><span class="person-avatar">${item.unread ? '💌' : '🌷'}</span><span class="person-info"><b>${escapeHtml(item.nickname)}</b><small>${escapeHtml(item.last ? item.last.kind==='card' ? '💌 一张小卡片' : item.last.text : '说声你好，开始聊天吧')}</small></span>${item.unread ? `<span class="unread-count">${item.unread}</span>` : '<span>›</span>'}</button>`).join('') : '<div class="empty">好友消息会放在这里。<br>先添加一位朋友，再送出第一张卡片吧。</div>';
  if(activeFriend && !socialState.friends.some(item=>item.id===activeFriend)) {
    activeFriend=null;conversation=[];$('#accountSocialPanel').classList.remove('chat-active');$('#chatPanel').classList.add('hidden');$('#conversationList').classList.remove('hidden');
  }
  if(window.refreshHome)window.refreshHome();
}
async function refreshSocial() {
  if(!socialUser||refreshingSocial)return;
  refreshingSocial=true;
  try {
    const data=await socialApi('social');
    if(data.user.id!==socialUser.id){location.reload();return;}
    socialState=data;renderSocial();$('#socialStatus').textContent='好友与消息已连接 · 打开应用时自动更新';
  } catch(error) {
    $('#socialStatus').textContent=error.status===401 ? '登录已过期，请退出后重新登录。' : '暂时连不上好友服务，已加载的消息仍可查看。';
  }finally{refreshingSocial=false;}
}
$('#refreshFriends').onclick=()=>refreshSocial();
$('#addFriendForm').onsubmit=async event=>{
  event.preventDefault();const button=$('#addFriendSubmit');button.disabled=true;$('#addFriendStatus').textContent='';
  try {await socialApi('friend-requests',{code:$('#friendCodeInput').value.trim()});$('#friendCodeInput').value='';$('#addFriendStatus').textContent='申请已送出，等朋友确认就能互发消息。';await refreshSocial();}
  catch(error){$('#addFriendStatus').textContent=socialError(error);}finally{button.disabled=false;}
};
$('#requestList').onclick=async event=>{
  const button=event.target.closest('[data-request]');if(!button)return;
  button.disabled=true;
  try{await socialApi(`friend-requests/${button.dataset.request}/respond`,{accept:button.dataset.accept==='true'});await refreshSocial();}
  catch(error){toast(socialError(error));button.disabled=false;}
};
function timeLabel(seconds){return new Date(seconds*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function renderChat(scroll=false) {
  const list=$('#chatMessages');const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  const opened=new Set([...list.querySelectorAll('details[open]')].map(item=>item.dataset.message));
  list.innerHTML=conversation.map(item=>`<article class="chat-message ${item.sender===socialUser.id ? 'mine' : ''}">${item.kind==='card' ? `<details data-message="${item.id}" ${opened.has(String(item.id)) ? 'open' : ''}><summary>💌 一张小心意 · 点开看看</summary><p>${escapeHtml(item.text)}</p></details>` : `<p>${escapeHtml(item.text)}</p>`}<button class="delete-message" data-delete-message="${item.id}">删除</button>${item.activity_id ? `<button class="share-btn" data-open-activity="${item.activity_id}">回应 / 查看共同邀请 ↗</button>` : ''}<small>${timeLabel(item.created)}${item.sender===socialUser.id ? (item.read_at ? ' · 已读' : ' · 已送达') : ''}</small></article>`).join('') || '<p class="social-empty">从一句“今天怎么样”开始吧。</p>';
  $('#loadOlderMessages').classList.toggle('hidden',!olderAvailable);
  if(scroll||nearBottom)list.scrollTop=list.scrollHeight;
}
async function refreshChat(older=false) {
  if(!socialUser||!activeFriend||refreshingChat)return;
  const friend=activeFriend;
  refreshingChat=true;
  try {
    const before=older&&conversation.length ? `&before=${conversation[0].id}` : '';
    const data=await socialApi(`messages?friend=${encodeURIComponent(friend)}${before}`);
    if(activeFriend!==friend)return;
    const hidden=new Set(data.hiddenIds||[]);conversation=conversation.filter(item=>!hidden.has(item.id));
    if(older){conversation=data.messages.concat(conversation);olderAvailable=data.hasMore;}
    else {
      const fresh=new Map(conversation.map(item=>[item.id,item]));
      data.messages.forEach(item=>fresh.set(item.id,item));
      if(!conversation.length)olderAvailable=data.hasMore;
      conversation=[...fresh.values()].sort((a,b)=>a.id-b.id);
    }
    renderChat();
    if(!document.hidden && currentPage==='friends' && socialView==='inbox' && conversation.length) {
      await socialApi('messages/read',{friendId:friend,through:conversation[conversation.length-1].id});
      const contact=socialState.friends.find(item=>item.id===friend);if(contact){contact.unread=0;renderSocial();}
    }
    $('#chatStatus').textContent='';
  }catch(error){$('#chatStatus').textContent=socialError(error);}
  finally{refreshingChat=false;}
}
async function openChat(id) {
  const friend=socialState.friends.find(item=>item.id===id);if(!friend)return;
  if(activeFriend!==id){conversation=[];olderAvailable=false;messageRetry=null;$('#chatInput').value='';}
  activeFriend=id;$('#chatName').textContent=friend.nickname;
  $('#chatPanel').classList.remove('hidden');$('#conversationList').classList.add('hidden');
  socialView='inbox';setSocialView('inbox');renderChat(true);
  await refreshChat();
}
$('#friendPeople').addEventListener('click',async event=>{
  const chat=event.target.closest('[data-chat]');if(chat)return openChat(chat.dataset.chat);
  const remove=event.target.closest('[data-remove-friend]');if(!remove)return;
  if(!confirm('移除这位好友后，将不能再互发或查看消息。重新添加后可查看原对话。'))return;
  remove.disabled=true;
  try{await socialApi('friends/remove',{friendId:remove.dataset.removeFriend});await refreshSocial();}catch(error){toast(socialError(error));remove.disabled=false;}
});
$('#conversationList').onclick=event=>{const button=event.target.closest('[data-chat]');if(button)openChat(button.dataset.chat);};
$('#backConversations').onclick=()=>{activeFriend=null;conversation=[];$('#accountSocialPanel').classList.remove('chat-active');$('#chatPanel').classList.add('hidden');$('#conversationList').classList.remove('hidden');refreshSocial();};
$('#loadOlderMessages').onclick=()=>refreshChat(true);
$('#messageForm').onsubmit=async event=>{
  event.preventDefault();if(!activeFriend)return;
  const text=$('#chatInput').value.trim();if(!text)return;
  const friend=activeFriend;const button=$('#sendMessage');button.disabled=true;
  if(!messageRetry||messageRetry.text!==text||messageRetry.friend!==friend)messageRetry={text,friend,id:makeId('msg')};
  try{
    await socialApi('messages',{friendId:friend,kind:'text',text,clientId:messageRetry.id});
    if(activeFriend===friend&&$('#chatInput').value.trim()===text)$('#chatInput').value='';
    messageRetry=null;await refreshChat();await refreshSocial();
  }catch(error){$('#chatStatus').textContent=socialError(error);}finally{button.disabled=false;}
};
async function pickFriendForCard(text) {
  if(!socialUser){openAuth();return;}
  if(!text.trim()||text.trim().length>120){toast('先写一份 120 字以内的小邀请吧');return;}
  outgoingCard=text.trim();outgoingCardId=makeId('card');
  await refreshSocial();
  $('#pickFriendStatus').textContent='';$('#pickCardPreview').textContent=outgoingCard;
  $('#pickFriendList').innerHTML=socialState.friends.length ? socialState.friends.map(item=>`<button data-send-card="${item.id}" class="conversation-row"><span class="person-avatar">🌷</span><span class="person-info"><b>${escapeHtml(item.nickname)}</b><small>把卡片放进好友的收件箱</small></span><span>发送 ↗</span></button>`).join('') : '<div class="empty">还没有好友。<br>在「朋友 → 好友」中交换好友码，确认后就能发送。</div>';
  if(!$('#pickFriendDialog').open)$('#pickFriendDialog').showModal();
}
$('#sendInAppCard').onclick=()=>pickFriendForCard($('#friendMessage').value);
const inAppResult=document.createElement('button');inAppResult.id='shareResultInApp';inAppResult.className='share-btn';inAppResult.textContent='💌 发送给应用内好友';$('#shareBtn').before(inAppResult);
inAppResult.onclick=()=>pickFriendForCard(lastPick?.text||'');
$('#closePickFriend').onclick=()=>$('#pickFriendDialog').close();
let sendingCard=false;
$('#pickFriendList').onclick=async event=>{
  const button=event.target.closest('[data-send-card]');if(!button||sendingCard)return;
  sendingCard=true;$$('[data-send-card]').forEach(item=>item.disabled=true);
  try{
    await socialApi('activities',{friendId:button.dataset.sendCard,title:outgoingCard,when:'',category:'rest',mode:'direct',clientId:outgoingCardId});
    $('#pickFriendDialog').close();toast('小卡片已经送到好友的收件箱 💌');await refreshSocial();
  }catch(error){$('#pickFriendStatus').textContent=socialError(error);}
  finally{sendingCard=false;$$('[data-send-card]').forEach(item=>item.disabled=false);}
};
$('#guestSocialNotice').classList.toggle('hidden',!!socialUser);
$('#accountSocialPanel').classList.toggle('hidden',!socialUser);
if(socialUser){
  $('#accountBtn').textContent='🌷 '+socialUser.nickname;
  $('#myNickname').textContent=socialUser.nickname;$('#myFriendCode').textContent=socialUser.code;
  refreshSocial();
}else if(!window.SUIXIN_SERVER){$('#socialStatus').textContent='当前可离线使用小日子；好友和账号需要连接服务端。';}
setSocialView(socialView);
setInterval(()=>{
  if(document.hidden||!socialUser)return;
  refreshSocial();
  if(currentPage==='friends'&&socialView==='inbox'&&activeFriend)refreshChat();
},8000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&socialUser){refreshSocial();if(activeFriend&&socialView==='inbox')refreshChat();}});
