/* Personal moments are private; account sync and explicit friend sharing are separate. */
let selectedMood = '';
let memoryId = null;
let memoryMood = '';
const moodOptions = {
  tired: {filter:'rest', reply:'累了就把步子放慢。今天的小事，可以很轻很轻。'},
  bored: {filter:'fun', reply:'给平常的一天，留一个意料之外的小入口。'},
  outside: {filter:'outside', reply:'不必走远，看看附近的光和风就很好。'},
  connect: {filter:'connect', reply:'有些小事，两个人分享会更暖一点。'}
};
defaults.push(
  {text:'给一个想念的人发一句：今天怎么样？',category:'want',filter:'connect',emoji:'💬'},
  {text:'约朋友这周一起喝杯喜欢的饮料',category:'selfcare',filter:'connect',emoji:'🧋'},
  {text:'把最近听到的一首好歌分享给朋友',category:'fun',filter:'connect',emoji:'🎧'},
  {text:'给愿意听你说话的人留一条语音',category:'want',filter:'connect',emoji:'🌷'}
);
$$('[data-mood]').forEach(button => button.addEventListener('click', () => {
  selectedMood = selectedMood === button.dataset.mood ? '' : button.dataset.mood;
  currentFilter = selectedMood ? moodOptions[selectedMood].filter : 'all';
  $$('[data-mood]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.mood === selectedMood)));
  $$('.want-chip').forEach(item => { const active = item.dataset.filter === currentFilter; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  $('#moodReply').textContent = selectedMood ? moodOptions[selectedMood].reply : '不用想好要做什么，先在这里坐一会儿。';
  $('#filterHint').textContent = selectedMood ? '小提议会跟着你的心情变化' : '所有心情都可以，选一个小小的开始';
  $('#petBubble').textContent = selectedMood ? moodOptions[selectedMood].reply : '你来这里，我就很开心。';
  $('#petBubble').classList.add('show');
  clearTimeout(window.petBubbleTimer); window.petBubbleTimer = setTimeout(() => $('#petBubble').classList.remove('show'), 4000);
}));
// Manual activity filters replace the broader mood selection.
$$('.want-chip').forEach(button => button.addEventListener('click', () => {
  selectedMood = ''; $$('[data-mood]').forEach(item => item.setAttribute('aria-pressed','false'));
  $('#moodReply').textContent = '跟着此刻的想法选就好。';
}));
$('#justStay').onclick = () => {
  $('#moodReply').textContent = '那就一起待一会儿。放松肩膀，慢慢呼吸，不需要完成任何事。';
  petSay('idle'); petBounce();
};

const roomObjects = [
  {key:'outside',emoji:'🌿',name:'窗边的叶子',hint:'留住一次散步或出门的瞬间'},
  {key:'rest',emoji:'🫖',name:'温热的小茶壶',hint:'留住一次休息或照顾自己的瞬间'},
  {key:'fun',emoji:'📻',name:'快乐收音机',hint:'留住一次让你开心的瞬间'},
  {key:'useful',emoji:'📚',name:'灵感书架',hint:'留住一次整理或学习的瞬间'},
  {key:'connect',emoji:'💌',name:'朋友的来信',hint:'留住一次和朋友连接的瞬间'}
];
function memoryFilter(item) { return item.filter || categoryFilters[item.category] || 'rest'; }
function renderLife() {
  const kept = history.filter(item => item.note || item.memoryMood || item.completed);
  const unlocked = new Set(kept.map(memoryFilter));
  $('#roomItems').innerHTML = roomObjects.filter(item => unlocked.has(item.key)).map(item => `<div class="room-object" title="${item.name}"><span>${item.emoji}</span><small>${item.name}</small></div>`).join('');
  $('#roomCaption').textContent = unlocked.size ? `你的小经历，为房间添了 ${roomObjects.filter(item => unlocked.has(item.key)).length} 件温暖的小物。` : '房间还很安静。留下第一个瞬间，就会添一件小物。';
  $('#roomCollection').innerHTML = roomObjects.map(item => `<div class="collection-item ${unlocked.has(item.key) ? 'unlocked' : ''}"><span>${unlocked.has(item.key) ? item.emoji : '○'}</span><div><b>${item.name}</b><small>${unlocked.has(item.key) ? '已放进房间 · 谢谢你带回这段经历' : item.hint}</small></div></div>`).join('');
  $('#momentCount').textContent = `${kept.length} 个瞬间`;
  const query=String(window.lifeQuery||'').trim().toLowerCase();
  const matched=history.filter(item=>[item.text,item.note,item.date,item.dateKey,item.memoryMood].join(' ').toLowerCase().includes(query));
  if($('#lifeSearchCount'))$('#lifeSearchCount').textContent=query ? `找到 ${matched.length} 条记录` : '';
  $('#momentList').innerHTML = (query ? matched.length : history.length) ? matched.map(item => `<article class="moment-card"><div class="moment-meta">${escapeHtml(item.dateKey ? friendlyDate(item.dateKey) : item.date)}<span>${escapeHtml(item.memoryMood || (item.completed ? '已体验' : '想尝试'))}</span></div><h3>${escapeHtml(item.text)}</h3>${item.note ? `<p>${escapeHtml(item.note)}</p>` : '<p class="moment-placeholder">还没留下感想，什么时候想写都可以。</p>'}<button data-moment-id="${escapeHtml(item.id)}">${item.note || item.memoryMood ? '编辑这个瞬间' : '留个瞬间'} ↗</button></article>`).join('') : '<div class="empty">你的小日子，从一句话开始。<br>没有抽卡，也可以直接记录今天。</div>';
  if(query&&!matched.length)$('#momentList').innerHTML='<div class="empty">没有找到这个瞬间，试试其他词吧。</div>';
  if(window.renderSolo)window.renderSolo();
  if(window.refreshHome)window.refreshHome();
}
function openMoment(id = null) {
  const item = id ? findHistory(id) : null;
  if (id && !item) return;
  memoryId = item ? item.id : null; memoryMood = item?.memoryMood || '';
  $('#momentNote').value = item?.note || '';
  $('#momentContext').textContent = item ? `关于「${item.text}」` : '不需要特别的事，普通的一刻也值得留下。';
  $$('[data-memory-mood]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.memoryMood === memoryMood)));
  $('#momentDialog').showModal(); $('#momentNote').focus();
}
$('#writeMoment').onclick = () => openMoment();
$('#momentList').addEventListener('click', event => {
  const button = event.target.closest('[data-moment-id]'); if(button) openMoment(button.dataset.momentId);
});
$$('[data-memory-mood]').forEach(button => button.onclick = () => {
  memoryMood = memoryMood === button.dataset.memoryMood ? '' : button.dataset.memoryMood;
  $$('[data-memory-mood]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.memoryMood === memoryMood)));
});
$('#closeMoment').onclick = () => $('#momentDialog').close();
$('#momentForm').onsubmit = event => {
  event.preventDefault();
  const note = $('#momentNote').value.trim().slice(0,280);
  if (!note && !memoryMood) { toast('留下一句话，或者选一个此刻的心情吧'); return; }
  const before = history.slice();
  if(memoryId) {
    if(!findHistory(memoryId)) { toast('这条记录已经不在了，请重新打开'); return; }
    history = history.map(item => String(item.id) === String(memoryId) ? {...item,note,memoryMood,completed:true} : item);
  } else history.unshift({id:makeId('moment'),text:'今天的小小瞬间',date:friendlyDate(todayKey()),dateKey:todayKey(),category:'selfcare',source:'moment',filter:selectedMood ? moodOptions[selectedMood].filter : 'rest',mood:selectedMood,note,memoryMood,completed:true});
  if(!saveHistory()) { history = before; renderLife(); return; }
  renderHistory(); $('#momentDialog').close(); renderLife(); switchPage('life');
  toast('瞬间收好了，小房间也记住了这段经历 🌷');
};
function prepareResultMemory() {
  $('#resultMemoryBtn').textContent = '已经体验过？留个瞬间';
}
const resultMemoryBtn = document.createElement('button');
resultMemoryBtn.id = 'resultMemoryBtn'; resultMemoryBtn.className = 'share-btn'; resultMemoryBtn.textContent = '已经体验过？留个瞬间';
$('#shareBtn').before(resultMemoryBtn);
resultMemoryBtn.onclick = () => {
  if(drawing || !pendingPick) return;
  acceptCurrentPick(); $('#result').classList.add('hidden'); openMoment(history[0].id);
};

function createFriendLink(message, name, href) {
  const text = message.trim();
  if(!text || text.length > 120 || name.length > 20) throw Error('请写下 120 字以内的小邀请');
  const url = new URL(href); url.hash = 'gift=' + encodeURIComponent(JSON.stringify({v:1,text,from:name.trim()}));
  return url.href;
}
function parseFriendCard(hash) {
  if(!hash.startsWith('#gift=')) return null;
  if(hash.length > 6000) throw Error('卡片链接太长了');
  const card = JSON.parse(decodeURIComponent(hash.slice(6)));
  if(!card || card.v !== 1 || typeof card.text !== 'string' || !card.text.trim() || card.text.length > 120 || typeof card.from !== 'string' || card.from.length > 20) throw Error('卡片内容不完整');
  return card;
}
$('#makeFriendCard').onclick = () => {
  try {
    const url = createFriendLink($('#friendMessage').value,$('#friendName').value,location.href);
    $('#friendLink').value = url; $('#friendOutput').classList.remove('hidden');
    const publicUrl = publicShareUrl(url);
    $('#friendShareHint').textContent = publicUrl ? '朋友收到链接后，就能拆开你的卡片。' : '这是本机或内网预览链接，仅供自己试拆。发给朋友时会改为分享邀请文字。';
    $('#sendFriendCard').textContent = publicUrl ? '分享这份小邀请 ↗' : '分享邀请文字 ↗';
    toast('小卡片准备好了，可以先自己拆开看看');
  } catch(error) { toast(error.message); }
};
function shareFriendCard(copyOnly = false) {
  try {
    const url = $('#friendLink').value; if(!url) return;
    const card = parseFriendCard(new URL(url).hash); if(!card) return;
    const text = publicShareUrl(url) ? '给你折了一张小卡片，打开看看吧 💌' : `${card.from ? card.from + ' 想邀请你：' : '有件小事，想和你一起：'}${card.text}`;
    return shareContent({title:'有件小事，想和你一起',text,url,copyOnly});
  } catch { toast('请重新生成这张卡片'); }
}
$('#sendFriendCard').onclick = () => shareFriendCard();
$('#copyFriendCard').onclick = () => shareFriendCard(true);
$('#previewFriendCard').onclick = () => {
  const hash = new URL($('#friendLink').value).hash;
  if(location.hash === hash) receiveFriendCard(); else location.hash = hash;
};
['#friendMessage','#friendName'].forEach(selector => $(selector).addEventListener('input', () => {
  $('#friendOutput').classList.add('hidden'); $('#friendLink').value = '';
}));
function receiveFriendCard() {
  try {
    const card = parseFriendCard(location.hash); if(!card) return;
    $('#receivedFrom').textContent = card.from ? `来自 ${card.from} 的小心意` : '来自一个惦记你的朋友';
    $('#receivedText').textContent = card.text; $('#receivedText').classList.add('hidden');
    $('#replyCard').classList.add('hidden'); $('#revealCard').classList.remove('hidden');
    if(!$('#receivedCard').open) $('#receivedCard').showModal();
  } catch(error) { toast('这张卡片没有完整送到，请让朋友重新分享链接'); }
}
$('#revealCard').onclick = () => { $('#receivedText').classList.remove('hidden'); $('#replyCard').classList.remove('hidden'); $('#revealCard').classList.add('hidden'); };
$('#closeReceived').onclick = () => $('#receivedCard').close();
$('#replyCard').onclick = () => { $('#receivedCard').close(); switchPage('friends'); $('#friendMessage').focus(); };
window.addEventListener('hashchange', receiveFriendCard);
renderLife(); receiveFriendCard();
