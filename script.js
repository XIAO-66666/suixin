const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
let selectedDate=localStorage.getItem("todaySelectedDate")||todayKey();
function friendlyDate(key){
  const [y,m,d]=key.split("-").map(Number);
  const now=new Date();
  return y===now.getFullYear()&&m===now.getMonth()+1&&d===now.getDate()?`今天 · ${m}月${d}日`:`${m}月${d}日`;
}
function updateDateUI(){
  $("#todayDate").textContent=friendlyDate(selectedDate);
  $("#mainTitle").textContent=selectedDate===todayKey()?"今天做什么？":"那天做什么？";
  $("#backToday").style.display=selectedDate===todayKey()?"none":"block";
}
function openDatePicker(){
  const el=$("#datePicker");
  if(!el)return;
  try{ if(typeof el.showPicker==="function") el.showPicker(); else el.click(); }
  catch(e){ el.focus(); el.click(); }
}
$("#todayDate").onclick=openDatePicker;
$("#datePicker").value=selectedDate;
$("#datePicker").onchange=e=>{
  if(!e.target.value)return;
  selectedDate=e.target.value;
  localStorage.setItem("todaySelectedDate",selectedDate);
  updateDateUI();
};
$("#backToday").onclick=()=>{
  selectedDate=todayKey();
  localStorage.setItem("todaySelectedDate",selectedDate);
  updateDateUI();
};
const defaults=[
{text:"出去散步十分钟",category:"small",filter:"outside",emoji:"🌿"},
{text:"看一集喜欢的番",category:"fun",filter:"fun",emoji:"🎮"},
{text:"整理一下桌面",category:"life",filter:"useful",emoji:"🧹"},
{text:"听三首喜欢的歌",category:"selfcare",filter:"rest",emoji:"🎵"},
{text:"去买一杯喜欢的饮料",category:"selfcare",filter:"selfcare",emoji:"🧋"},
{text:"读几页喜欢的书",category:"study",filter:"useful",emoji:"📖"},
{text:"什么都不做，发会儿呆",category:"small",filter:"rest",emoji:"☁️"}
];
const catNames={want:"🌱 想做",small:"☕ 很小的事",try:"🌈 想尝试",study:"📚 学习",fun:"🎮 娱乐",life:"🏠 生活",selfcare:"💕 对自己好一点"};
let tasks=JSON.parse(localStorage.getItem("todayThings")||"[]");
let history=JSON.parse(localStorage.getItem("todayHistory")||"[]");
history=history.map((item,i)=>({...item,id:item.id||("h-"+Date.now()+"-"+i),completed:!!item.completed}));
localStorage.setItem("todayHistory",JSON.stringify(history));
let sound=localStorage.getItem("todaySound")!=="off";
let currentFilter="all",lastPick=null,currentPage="today";
let drawSource=localStorage.getItem("drawSource")||"all";

function save(){localStorage.setItem("todayThings",JSON.stringify(tasks));localStorage.setItem("todayHistory",JSON.stringify(history))}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function beep(){if(!sound)return;try{const c=new(window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.frequency.value=520;g.gain.value=.035;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.09)}catch(e){}}

function dateText(){return friendlyDate(selectedDate)}
function switchPage(name){
  currentPage=name;
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));
  $$(".tab").forEach(t=>t.classList.toggle("active",t.dataset.page===name));
  if(name==="history")renderHistory();
  if(name==="things")renderTasks();
  window.scrollTo({top:0,behavior:"smooth"});
}
$$(".tab").forEach(t=>t.onclick=()=>switchPage(t.dataset.page));

function renderTasks(){
  $("#countText").textContent=`${tasks.length} 件`;
  $("#taskList").innerHTML=tasks.length?tasks.map((t,i)=>`<div class="task-chip"><div>${escapeHtml(t.text)}<br><small>${catNames[t.category]||"🌷 小选择"}</small></div><button data-del="${i}">×</button></div>`).join(""):'<div class="empty">这里还空空的。<br>先放一两件你想做的事吧 🌱</div>';
  $$("[data-del]").forEach(b=>b.onclick=()=>{tasks.splice(+b.dataset.del,1);save();renderTasks()});
}
let editingHistoryId=null;

function saveHistory(){
  localStorage.setItem("todayHistory",JSON.stringify(history));
}
function findHistory(id){
  return history.find(x=>String(x.id)===String(id));
}
function escapeHistoryText(value){
  return String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function renderHistory(){
  const box=$("#historyList");
  if(!box)return;
  if(!history.length){
    box.innerHTML='<div class="empty">还没有抽过什么。<br>回到「今天」，让第一张卡牌替你选吧 🌷</div>';
    return;
  }

  box.innerHTML=history.map(item=>{
    const text=escapeHistoryText(item.text);
    const date=escapeHistoryText(item.date);
    const editing=String(editingHistoryId)===String(item.id);
    return `<div class="history-item ${item.completed?"completed":""}" data-history-id="${escapeHistoryText(item.id)}">
      <div class="history-icon">🃏</div>
      <div class="history-main">
        <div class="history-text"><b>${text}</b><small>${date}</small></div>
        <div class="history-actions">
          <button class="history-action complete" type="button" data-history-action="complete">${item.completed?"↩ 未完成":"✓ 已完成"}</button>
          <button class="history-action" type="button" data-history-action="edit">✏️ 编辑</button>
          <button class="history-action delete" type="button" data-history-action="delete">🗑 删除</button>
        </div>
        ${editing?`<div class="inline-history-editor">
          <input id="inlineHistoryInput" type="text" maxlength="80" value="${text}" placeholder="想做什么？">
          <div class="inline-history-buttons">
            <button type="button" data-history-action="cancel-edit">取消</button>
            <button type="button" class="save-inline" data-history-action="save-edit">保存</button>
          </div>
        </div>`:""}
      </div>
    </div>`;
  }).join("");
}

function openHistoryEditor(id){
  if(!findHistory(id))return;
  editingHistoryId=id;
  renderHistory();
  const input=document.getElementById("inlineHistoryInput");
  if(input){input.focus();input.select();}
}
function closeHistoryEditor(){
  editingHistoryId=null;
  renderHistory();
}
function saveHistoryEdit(id){
  const item=findHistory(id);
  const input=document.getElementById("inlineHistoryInput");
  if(!item||!input)return;
  const value=input.value.trim();
  if(!value)return;
  item.text=value;
  saveHistory();
  editingHistoryId=null;
  renderHistory();
}
function toggleHistoryComplete(id){
  const item=findHistory(id);
  if(!item)return;
  item.completed=!item.completed;
  saveHistory();
  renderHistory();
}
function deleteHistory(id){
  if(!findHistory(id))return;
  if(!confirm("确定删除这条记录吗？"))return;
  history=history.filter(x=>String(x.id)!==String(id));
  if(String(editingHistoryId)===String(id))editingHistoryId=null;
  saveHistory();
  renderHistory();
}

$("#historyList").addEventListener("click",e=>{
  const btn=e.target.closest("[data-history-action]");
  if(!btn)return;
  const row=btn.closest(".history-item");
  if(!row)return;
  const id=row.dataset.historyId;
  const action=btn.dataset.historyAction;
  if(action==="complete")toggleHistoryComplete(id);
  else if(action==="edit")openHistoryEditor(id);
  else if(action==="delete")deleteHistory(id);
  else if(action==="cancel-edit")closeHistoryEditor();
  else if(action==="save-edit")saveHistoryEdit(id);
});

$("#historyList").addEventListener("keydown",e=>{
  if(e.target.id!=="inlineHistoryInput")return;
  const row=e.target.closest(".history-item");
  if(e.key==="Enter"&&row){
    e.preventDefault();
    saveHistoryEdit(row.dataset.historyId);
  }
  if(e.key==="Escape")closeHistoryEditor();
});

function pool(filter="all"){
  const mine=tasks.map(t=>({...t,emoji:t.emoji||"🌷",source:"mine"}));
  const inspiration=defaults.map(t=>({...t,source:"inspiration"}));

  let base;
  if(drawSource==="mine") base=mine;
  else if(drawSource==="inspiration") base=inspiration;
  else base=mine.concat(inspiration);

  if(filter!=="all"){
    const filtered=base.filter(t=>t.filter===filter||t.category===filter);
    if(filtered.length) return filtered;
  }
  return base;
}
function pick(){
  let p=pool(currentFilter);
  if(p.length>1&&lastPick){
    const other=p.filter(x=>x.text!==lastPick.text);
    if(other.length)p=other;
  }
  return p.length?p[Math.floor(Math.random()*p.length)]:null;
}
function showResult(item){
  lastPick=item;beep();
  $("#resultTitle").textContent=item.text;
  $("#resultTag").textContent=catNames[item.category]||"🌷 今天的小选择";
  $("#result").classList.remove("hidden");
  history.unshift({text:item.text,date:dateText(),dateKey:selectedDate,id:"h-"+Date.now(),completed:false});
  history=history.slice(0,15);save();renderHistory();
  $("#petTip").textContent="我帮你选好啦！嘿嘿 🌷";
  $("#petArea").classList.add("tip");
}
function draw(){
  const item=pick();
  if(!item){
    if(drawSource==="mine"){
      alert("🌱 你的事情还没有添加哦，先去「我的事情」添加一个吧～");
    }else{
      alert("这里暂时没有可以抽的事情～");
    }
    return;
  }
  const card=$("#drawCard");
  if(card){
    card.animate(
      [{transform:"rotate(0)"},{transform:"rotate(-3deg) translateY(-4px)"},{transform:"rotate(3deg) translateY(-6px)"},{transform:"rotate(0)"}],
      {duration:480,easing:"ease-out"}
    );
  }
  setTimeout(()=>showResult(item),330);
}
$("#drawCard").onclick=draw;
$("#againBtn").onclick=draw;
$("#closeResult").onclick=()=>$("#result").classList.add("hidden");
$("#doneBtn").onclick=()=>{$("#result").classList.add("hidden");beep()};

$$(".want-chip").forEach(b=>b.onclick=()=>{currentFilter=b.dataset.filter;draw()});

function updateDrawSourceUI(){
  $$(".source-option").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.source===drawSource);
  });
}
$$(".source-option").forEach(btn=>{
  btn.onclick=()=>{
    drawSource=btn.dataset.source;
    localStorage.setItem("drawSource",drawSource);
    updateDrawSourceUI();
  };
});
updateDrawSourceUI();

$("#addBtn").onclick=addTask;
$("#taskInput").addEventListener("keydown",e=>{if(e.key==="Enter")addTask()});
function addTask(){const text=$("#taskInput").value.trim();if(!text)return;tasks.push({text,category:$("#category").value,filter:$("#category").value,emoji:"🌷"});$("#taskInput").value="";save();renderTasks();}

$("#soundBtn").onclick=()=>{sound=!sound;localStorage.setItem("todaySound",sound?"on":"off");$("#soundBtn").textContent=sound?"🔔":"🔕";if(sound)beep()};

const pet=$("#pet");
const petArea=$("#petArea");
const petBubble=$("#petBubble");
const petPlay=$("#petPlay");
const petFeed=$("#petFeed");

let petMood=Number(localStorage.getItem("petMood")||70);
let petAffection=Number(localStorage.getItem("petAffection")||0);

const petLines={
  tap:["嘿！摸到我啦～","被发现了！","再摸一下嘛～","今天也来陪我玩呀"],
  play:["好耶！一起玩！","抓到你啦！","开心开心～","再来一次！"],
  feed:["啊呜！好好吃～","谢谢投喂！","吃饱啦，心情变好了"],
  idle:["我在这里陪你～","今天想做什么呀？","发会儿呆也很好呀","要不要让我替你选一个？"]
};

function petSay(type="tap"){
  if(!petBubble)return;
  const list=petLines[type]||petLines.tap;
  petBubble.textContent=list[Math.floor(Math.random()*list.length)];
  petBubble.classList.add("show");
  clearTimeout(window.petBubbleTimer);
  window.petBubbleTimer=setTimeout(()=>{
    petBubble.classList.remove("show");
  },2800);
}

function savePet(){
  localStorage.setItem("petMood",String(petMood));
  localStorage.setItem("petAffection",String(petAffection));
}

function petBounce(){
  if(!pet)return;
  pet.classList.remove("pet-bounce");
  void pet.offsetWidth;
  pet.classList.add("pet-bounce");
}

if(pet){
  pet.onclick=()=>{
    petBounce();
    petSay("tap");
    petAffection+=1;
    petMood=Math.min(100,petMood+1);
    savePet();
    if(typeof beep==="function")beep();
  };
}

if(petPlay){
  petPlay.onclick=(e)=>{
    e.preventDefault();
    e.stopPropagation();
    petBounce();
    petSay("play");
    petAffection+=3;
    petMood=Math.min(100,petMood+5);
    savePet();
    if(typeof beep==="function")beep();
  };
}

if(petFeed){
  petFeed.onclick=(e)=>{
    e.preventDefault();
    e.stopPropagation();
    petBounce();
    petSay("feed");
    petAffection+=2;
    petMood=Math.min(100,petMood+8);
    savePet();
    if(typeof beep==="function")beep();
  };
}

setInterval(()=>{
  if(!document.hidden&&Math.random()<.35)petSay("idle");
},45000);

function moveEyes(clientX,clientY){
  $$(".eye").forEach(e=>{const r=e.getBoundingClientRect(),dx=clientX-(r.left+r.width/2),dy=clientY-(r.top+r.height/2),len=Math.hypot(dx,dy)||1;e.style.transform=`translate(${Math.max(-3,Math.min(3,dx/len*3))}px,${Math.max(-2,Math.min(2,dy/len*2))}px)`});
}
document.addEventListener("mousemove",e=>moveEyes(e.clientX,e.clientY));
document.addEventListener("touchmove",e=>{const t=e.touches[0];if(t)moveEyes(t.clientX,t.clientY)},{passive:true});

setInterval(()=>{if(Math.random()<.35){$$(".eye").forEach(e=>e.style.height="3px");setTimeout(()=>$$(".eye").forEach(e=>e.style.height="16px"),150)}},3000);
setInterval(()=>{if(currentPage==="today"&&Math.random()<.22){petArea.classList.add("tip");$("#petTip").textContent=["要不要让我替你选一下？","今天的运气还不错哦 ✦","不用纠结啦，交给我吧"][Math.floor(Math.random()*3)];setTimeout(()=>petArea.classList.remove("tip"),2400)}},7000);

renderTasks();renderHistory();$("#soundBtn").textContent=sound?"🔔":"🔕";

updateDateUI();
