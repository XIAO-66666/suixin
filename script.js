const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEYS = {
  tasks: "todayThings",
  soloPet: "soloPet",
  history: "todayHistory",
  selectedDate: "todaySelectedDate",
  sound: "todaySound",
  drawSource: "drawSource",
  petMood: "petMood",
  petAffection: "petAffection"
};

const defaults = [
  {"text": "拍下今天的一束光", "category": "small", "filter": "outside", "emoji": "📷"},
  {"text": "找一条没走过的小路，散步十分钟", "category": "try", "filter": "outside", "emoji": "🌳"},
  {"text": "去附近公园坐一会儿", "category": "selfcare", "filter": "outside", "emoji": "🍃"},
  {"text": "给自己泡一杯热茶", "category": "selfcare", "filter": "rest", "emoji": "🍵"},
  {"text": "闭上眼睛，慢慢呼吸一分钟", "category": "small", "filter": "rest", "emoji": "☁️"},
  {"text": "换上舒服的衣服伸个懒腰", "category": "selfcare", "filter": "rest", "emoji": "🛋️"},
  {"text": "画一只不需要好看的小动物", "category": "try", "filter": "fun", "emoji": "🎨"},
  {"text": "找一首没听过的歌", "category": "fun", "filter": "fun", "emoji": "🎧"},
  {"text": "给朋友发一个有趣的表情", "category": "fun", "filter": "fun", "emoji": "💬"},
  {"text": "用三张照片记录今天", "category": "try", "filter": "fun", "emoji": "📸"},
  {"text": "清理手机里十张不需要的照片", "category": "life", "filter": "useful", "emoji": "📱"},
  {"text": "写下脑海里的一个小点子", "category": "study", "filter": "useful", "emoji": "💡"},
  {"text": "学会一个新的外语单词", "category": "study", "filter": "useful", "emoji": "📚"},
  {"text": "把明天要用的东西放在一起", "category": "life", "filter": "useful", "emoji": "🎒"},
  {"text": "给许久没联系的人问声好", "category": "want", "filter": "fun", "emoji": "🌷"},
  {"text": "为自己准备一份简单的水果", "category": "selfcare", "filter": "rest", "emoji": "🍊"},
  {"text": "看看天空，找一朵喜欢的云", "category": "small", "filter": "outside", "emoji": "☁️"},
  {"text": "整理一个小抽屉，只做五分钟", "category": "life", "filter": "useful", "emoji": "🧺"},

  { text: "出去散步十分钟", category: "small", filter: "outside", emoji: "🌿" },
  { text: "看一集喜欢的番", category: "fun", filter: "fun", emoji: "🎮" },
  { text: "整理一下桌面", category: "life", filter: "useful", emoji: "🧹" },
  { text: "听三首喜欢的歌", category: "selfcare", filter: "rest", emoji: "🎵" },
  { text: "去买一杯喜欢的饮料", category: "selfcare", filter: "rest", emoji: "🧋" },
  { text: "读几页喜欢的书", category: "study", filter: "useful", emoji: "📖" },
  { text: "什么都不做，发会儿呆", category: "small", filter: "rest", emoji: "☁️" }
];

const catNames = {
  want: "🌱 想做",
  small: "☕ 很小的事",
  try: "🌈 想尝试",
  study: "📚 学习",
  fun: "🎮 娱乐",
  life: "🏠 生活",
  selfcare: "💕 对自己好一点"
};

const categoryFilters = {
  want: "rest",
  small: "rest",
  try: "fun",
  study: "useful",
  fun: "fun",
  life: "useful",
  selfcare: "rest"
};

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function storageKey(key) {
  return window.SUIXIN_USER ? `suixin.user.${window.SUIXIN_USER.id}.${key}` : key;
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(key)) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(value)); if(window.queueCloudSave)window.queueCloudSave(); return true; }
  catch (error) { toast("保存失败，请立即导出备份，并检查浏览器存储空间。"); return false; }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function normalizeTask(item, index) {
  const text = String(item && item.text ? item.text : "").trim();
  if (!text) return null;
  const category = catNames[item.category] ? item.category : "want";
  return {
    id: item.id || `t-${Date.now()}-${index}`,
    text,
    category,
    filter: item.filter || categoryFilters[category] || category,
    emoji: item.emoji || "🌷",
    source: "mine"
  };
}

function normalizeHistory(item, index) {
  const text = String(item && item.text ? item.text : "").trim();
  if (!text) return null;
  return {
    id: item.id || `h-${Date.now()}-${index}`,
    text,
    date: item.date || "某一天",
    dateKey: item.dateKey || "",
    category: item.category || "",
    source: item.source || "",
    note: String(item.note || "").slice(0,280),
    memoryMood: ["舒服","开心","平静","一般般"].includes(item.memoryMood) ? item.memoryMood : "",
    filter: ["rest","outside","fun","useful","connect"].includes(item.filter) ? item.filter : "",
    mood: String(item.mood || "").slice(0,20),
    completed: Boolean(item.completed)
  };
}

const todayKey = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
};

let selectedDate = todayKey();
let drawing = false;
let returnFocus = null;
let tasks = readJson(STORAGE_KEYS.tasks, []).map(normalizeTask).filter(Boolean);
let history = readJson(STORAGE_KEYS.history, []).map(normalizeHistory).filter(Boolean);
let sound = false;
let currentFilter = "all";
let lastPick = null;
let pendingPick = null;
let currentPage = "today";
let drawSource = localStorage.getItem(storageKey(STORAGE_KEYS.drawSource)) || "all";
let editingTaskId = null;
let editingHistoryId = null;
let historySelectMode = false;
let selectedHistoryIds = new Set();

function saveTasks() {
  writeJson(STORAGE_KEYS.tasks, tasks);
}

function saveHistory() {
  const saved = writeJson(STORAGE_KEYS.history, history);
  if (saved && typeof renderLife === "function") renderLife();
  return saved;
}

function friendlyDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()) {
    return `今天 · ${month}月${day}日`;
  }
  return `${year}年${month}月${day}日`;
}

function updateDateUI() {
  $("#todayDate").textContent = friendlyDate(selectedDate);
  $("#mainTitle").textContent = selectedDate === todayKey() ? "随心" : "那天的小选择";
  $("#backToday").style.display = selectedDate === todayKey() ? "none" : "block";
}

function openDatePicker() {
  const datePicker = $("#datePicker");
  if (!datePicker) return;
  try {
    if (typeof datePicker.showPicker === "function") datePicker.showPicker();
    else datePicker.click();
  } catch (error) {
    datePicker.focus();
    datePicker.click();
  }
}

let audioContext = null;
let musicTimer = null;
let musicStep = 0;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration, volume, type = "sine", delay = 0) {
  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  } catch (error) {}
}

function beep() {
  if (!sound) return;
  playTone(620, 0.12, 0.035, "sine");
}

function playMusicStep() {
  if (!sound) return;
  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, null];
  const note = melody[musicStep % melody.length];
  if (note) {
    playTone(note, 0.58, 0.022, "sine");
    playTone(note / 2, 0.72, 0.012, "triangle", 0.02);
  }
  musicStep += 1;
}

function updateSoundButton() {
  const button = $("#soundBtn");
  if (!button) return;
  button.textContent = sound ? "🎵" : "🔕";
  button.setAttribute("aria-label", sound ? "关闭轻音乐" : "打开轻音乐");
}

function startMusic() {
  sound = true;
  localStorage.setItem(storageKey(STORAGE_KEYS.sound), "on");
  clearInterval(musicTimer);
  musicStep = 0;
  getAudioContext();
  playMusicStep();
  musicTimer = setInterval(playMusicStep, 760);
  updateSoundButton();
}

function stopMusic() {
  sound = false;
  localStorage.setItem(storageKey(STORAGE_KEYS.sound), "off");
  clearInterval(musicTimer);
  musicTimer = null;
  updateSoundButton();
}

function dateText() {
  return friendlyDate(selectedDate);
}

function switchPage(name) {
  currentPage = name;
  $$(".page").forEach((page) => page.classList.toggle("active", page.id === `page-${name}`));
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.page === name));
  if (name === "history") renderHistory();
  if (name === "life" && typeof renderLife === "function") renderLife();
  if (name === "things") renderTasks();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function renderTasks() {
  const taskList = $("#taskList");
  $("#countText").textContent = `${tasks.length} 件`;

  if (!tasks.length) {
    taskList.innerHTML = '<div class="empty">这里还空空的。<br>先放一两件你想做的事吧 🌱</div>';
    return;
  }

  taskList.innerHTML = tasks.map((task) => {
    const editing = String(editingTaskId) === String(task.id);
    const categoryOptions = Object.entries(catNames).map(([value, label]) => (
      `<option value="${value}" ${task.category === value ? "selected" : ""}>${label}</option>`
    )).join("");

    return `<div class="task-chip" data-task-id="${escapeHtml(task.id)}">
      <div class="task-main">
        <div class="task-text">${escapeHtml(task.text)}</div>
        <small>${catNames[task.category] || "🌷 小选择"}</small>
        ${editing ? `<div class="inline-task-editor">
          <input id="inlineTaskInput" type="text" maxlength="80" value="${escapeHtml(task.text)}" placeholder="想做什么？">
          <select id="inlineTaskCategory">${categoryOptions}</select>
          <div class="inline-task-buttons">
            <button type="button" data-task-action="close-edit">完成</button>
          </div>
        </div>` : ""}
      </div>
      <div class="task-actions">
        <button type="button" data-task-action="edit" aria-label="编辑">✎</button>
        <button type="button" data-task-action="delete" aria-label="删除">×</button>
      </div>
    </div>`;
  }).join("");
}

function findTask(id) {
  return tasks.find((task) => String(task.id) === String(id));
}

function addTask() {
  const input = $("#taskInput");
  const category = $("#category").value;
  const text = input.value.trim();
  if (!text) return;
  if (text.length > 80) { toast("给这件小事取个短一点的名字吧（80 字以内）"); return; }

  tasks.unshift({
    id: makeId("t"),
    text,
    category,
    filter: categoryFilters[category] || category,
    emoji: "🌷",
    source: "mine"
  });
  input.value = "";
  saveTasks();
  renderTasks();
}

function openTaskEditor(id) {
  if (!findTask(id)) return;
  editingTaskId = id;
  renderTasks();
  const input = $("#inlineTaskInput");
  if (input) {
    input.focus();
    input.select();
  }
}

function updateEditingTask() {
  const input = $("#inlineTaskInput");
  const select = $("#inlineTaskCategory");
  const task = findTask(editingTaskId);
  if (!input || !select || !task) return;

  const text = input.value.trim();
  if (text) task.text = text;
  task.category = select.value;
  task.filter = categoryFilters[task.category] || task.category;
  saveTasks();
}

function closeTaskEditor() {
  updateEditingTask();
  editingTaskId = null;
  renderTasks();
}

function deleteTask(id) {
  const removed = tasks.filter(task => String(task.id) === String(id));
  offerUndo(() => { tasks = removed.concat(tasks.filter(task => !removed.some(old => String(old.id) === String(task.id)))) ; saveTasks(); renderTasks(); });
  tasks = tasks.filter((task) => String(task.id) !== String(id));
  if (String(editingTaskId) === String(id)) editingTaskId = null;
  saveTasks();
  renderTasks();
}

function renderHistory() {
  const historyList = $("#historyList");
  if (!historyList) return;
  renderHistoryBatchBar();

  if (!history.length) {
    selectedHistoryIds.clear();
    historySelectMode = false;
    renderHistoryBatchBar();
    historyList.innerHTML = '<div class="empty">还没有抽过什么。<br>回到「今天」，让第一张卡牌替你选吧 🌷</div>';
    return;
  }

  historyList.innerHTML = history.map((item) => {
    const editing = String(editingHistoryId) === String(item.id);
    const selected = selectedHistoryIds.has(String(item.id));
    return `<div class="history-item ${item.completed ? "completed" : ""} ${selected ? "selected" : ""}" data-history-id="${escapeHtml(item.id)}">
      ${historySelectMode ? `<label class="history-check" aria-label="选择记录">
        <input type="checkbox" data-history-select ${selected ? "checked" : ""}>
        <span></span>
      </label>` : ""}
      <div class="history-icon">🃏</div>
      <div class="history-main">
        <div class="history-text">
          <b>${escapeHtml(item.text)}</b>
          <small>${escapeHtml(item.dateKey ? friendlyDate(item.dateKey) : item.date)}</small>
        </div>
        <div class="history-actions ${historySelectMode ? "hidden" : ""}">
          <button class="history-action complete" type="button" data-history-action="complete">${item.completed ? "↩ 取消完成" : "✓ 已完成"}</button>
          <button class="history-action" type="button" data-history-action="edit">✎ 编辑</button>
          <button class="history-action delete" type="button" data-history-action="delete">× 删除</button>
        </div>
        ${editing ? `<div class="inline-history-editor">
          <input id="inlineHistoryInput" type="text" maxlength="80" value="${escapeHtml(item.text)}" placeholder="想做什么？">
          <div class="inline-history-buttons">
            <button type="button" data-history-action="cancel-edit">取消</button>
            <button type="button" class="save-inline" data-history-action="save-edit">保存</button>
          </div>
        </div>` : ""}
      </div>
    </div>`;
  }).join("");
}

function renderHistoryBatchBar() {
  const batchBar = $("#historyBatchBar");
  const selectButton = $("#historySelectBtn");
  const count = $("#historySelectedCount");
  if (!batchBar || !selectButton || !count) return;

  const selectedCount = selectedHistoryIds.size;
  selectButton.textContent = historySelectMode ? "取消" : "多选";
  selectButton.disabled = !history.length;
  batchBar.classList.toggle("hidden", !historySelectMode || !history.length);
  count.textContent = `已选 ${selectedCount} 条`;

  const allButton = batchBar.querySelector('[data-batch-action="all"]');
  const doneButton = batchBar.querySelector('[data-batch-action="done"]');
  const deleteButton = batchBar.querySelector('[data-batch-action="delete"]');
  if (allButton) allButton.textContent = selectedCount === history.length ? "取消全选" : "全选";
  if (doneButton) doneButton.disabled = selectedCount === 0;
  if (deleteButton) deleteButton.disabled = selectedCount === 0;
}

function findHistory(id) {
  return history.find((item) => String(item.id) === String(id));
}

function openHistoryEditor(id) {
  if (!findHistory(id)) return;
  editingHistoryId = id;
  renderHistory();
  const input = $("#inlineHistoryInput");
  if (input) {
    input.focus();
    input.select();
  }
}

function closeHistoryEditor() {
  editingHistoryId = null;
  renderHistory();
}

function saveHistoryEdit(id) {
  const item = findHistory(id);
  const input = $("#inlineHistoryInput");
  if (!item || !input) return;
  const value = input.value.trim();
  if (!value) return;
  item.text = value;
  saveHistory();
  editingHistoryId = null;
  renderHistory();
}

function toggleHistoryComplete(id) {
  const item = findHistory(id);
  if (!item) return;
  item.completed = !item.completed;
  saveHistory();
  renderHistory();
}

function deleteHistory(id) {
  const removed = history.filter(item => String(item.id) === String(id));
  offerUndo(() => { history = history.concat(removed).sort((a,b) => (b.dateKey || "").localeCompare(a.dateKey || "")); saveHistory(); renderHistory(); });
  history = history.filter((item) => String(item.id) !== String(id));
  if (String(editingHistoryId) === String(id)) editingHistoryId = null;
  selectedHistoryIds.delete(String(id));
  saveHistory();
  renderHistory();
}

function toggleHistorySelectMode() {
  historySelectMode = !historySelectMode;
  selectedHistoryIds.clear();
  editingHistoryId = null;
  renderHistory();
}

function toggleHistorySelection(id) {
  const key = String(id);
  if (selectedHistoryIds.has(key)) selectedHistoryIds.delete(key);
  else selectedHistoryIds.add(key);
  renderHistory();
}

function toggleAllHistorySelection() {
  if (selectedHistoryIds.size === history.length) {
    selectedHistoryIds.clear();
  } else {
    selectedHistoryIds = new Set(history.map((item) => String(item.id)));
  }
  renderHistory();
}

function completeSelectedHistory() {
  if (!selectedHistoryIds.size) return;
  history = history.map((item) => (
    selectedHistoryIds.has(String(item.id)) ? { ...item, completed: true } : item
  ));
  selectedHistoryIds.clear();
  historySelectMode = false;
  saveHistory();
  renderHistory();
}

function deleteSelectedHistory() {
  if (!selectedHistoryIds.size) return;
  const removed = history.filter(item => selectedHistoryIds.has(String(item.id)));
  offerUndo(() => { history = history.concat(removed).sort((a,b) => (b.dateKey || "").localeCompare(a.dateKey || "")); saveHistory(); renderHistory(); });
  history = history.filter((item) => !selectedHistoryIds.has(String(item.id)));
  selectedHistoryIds.clear();
  editingHistoryId = null;
  historySelectMode = false;
  saveHistory();
  renderHistory();
}

function pool(filter = "all") {
  const mine = tasks.map((task) => ({ ...task, emoji: task.emoji || "🌷", source: "mine" }));
  const inspiration = defaults.map((item) => ({ ...item, source: "inspiration" }));

  let base = [];
  if (drawSource === "mine") base = mine;
  else if (drawSource === "inspiration") base = inspiration;
  else base = mine.concat(inspiration);

  if (filter !== "all") {
    const filtered = base.filter((item) => item.filter === filter || item.category === filter);
    return filtered;
  }
  return base;
}

function pick() {
  let items = pool(currentFilter);
  if (items.length > 1 && lastPick) {
    const otherItems = items.filter((item) => item.text !== lastPick.text);
    if (otherItems.length) items = otherItems;
  }
  return items.length ? items[Math.floor(Math.random() * items.length)] : null;
}

function showResult(item) {
  lastPick = item;
  pendingPick = item;
  beep();
  $("#resultTitle").textContent = item.text;
  $("#resultTag").textContent = catNames[item.category] || "🌷 今天的小选择";
  if (typeof prepareResultMemory === "function") prepareResultMemory();
  $("#result").classList.remove("hidden");

  $("#petTip").textContent = "我帮你选好啦！嘿嘿 🌷";
  $("#petArea").classList.add("tip");
}

function acceptCurrentPick() {
  if (!pendingPick) return;
  history.unshift({
    id: makeId("h"),
    text: pendingPick.text,
    date: dateText(),
    dateKey: selectedDate,
    category: pendingPick.category || "",
    source: pendingPick.source || "",
    filter: pendingPick.filter || "",
    mood: typeof selectedMood !== "undefined" ? selectedMood : "",
    note: "", memoryMood: "",
    completed: false
  });
  toast("已收好这个小选择，慢慢来就好 🌷");
  pendingPick = null;
  saveHistory();
  renderHistory();
}

function draw() {
  if (drawing) return;
  const item = pick();
  if (!item) {
    if (drawSource === "mine") {
      toast(tasks.length ? "这个心情下还没有匹配的事情，试试其他心情吧。" : "先去「我的事情」放入一两件想做的事吧 🌱");
    } else {
      toast("暂时没有匹配的事情，试试其他心情吧。");
    }
    return;
  }

  drawing = true;
  returnFocus = document.activeElement;
  $("#drawCard").disabled = true;
  $("#againBtn").disabled = true;
  const card = $("#drawCard");
  if (card && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    card.animate(
      [
        { transform: "rotate(0)" },
        { transform: "rotate(-3deg) translateY(-4px)" },
        { transform: "rotate(3deg) translateY(-6px)" },
        { transform: "rotate(0)" }
      ],
      { duration: 480, easing: "ease-out" }
    );
  }
  setTimeout(() => {
    drawing = false;
    $("#drawCard").disabled = false;
    $("#againBtn").disabled = false;
    showResult(item);
    $("#doneBtn").focus();
  }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 330);
}

function updateDrawSourceUI() {
  $$(".source-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === drawSource);
  });
}

$("#todayDate").addEventListener("click", openDatePicker);
$("#datePicker").value = selectedDate;
$("#datePicker").addEventListener("change", (event) => {
  if (!event.target.value) return;
  selectedDate = event.target.value;
  localStorage.setItem(storageKey(STORAGE_KEYS.selectedDate), selectedDate);
  updateDateUI();
});
$("#backToday").addEventListener("click", () => {
  selectedDate = todayKey();
  localStorage.setItem(storageKey(STORAGE_KEYS.selectedDate), selectedDate);
  $("#datePicker").value = selectedDate;
  updateDateUI();
});

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchPage(tab.dataset.page));
});

$("#addBtn").addEventListener("click", addTask);
$("#taskInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) addTask();
});

$("#taskList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-action]");
  if (!button) return;
  const row = button.closest(".task-chip");
  if (!row) return;
  const id = row.dataset.taskId;

  if (button.dataset.taskAction === "edit") openTaskEditor(id);
  if (button.dataset.taskAction === "delete") deleteTask(id);
  if (button.dataset.taskAction === "close-edit") closeTaskEditor();
});





$("#taskList").addEventListener("keydown", (event) => {
  if (event.target.id !== "inlineTaskInput") return;
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    closeTaskEditor();
  }
  if (event.key === "Escape") {
    editingTaskId = null;
    renderTasks();
  }
});

$("#historyList").addEventListener("click", (event) => {
  const rowForSelection = event.target.closest(".history-item");
  if (historySelectMode && rowForSelection) {
    const interactive = event.target.closest("button, input, select, textarea, .history-check, .inline-history-editor");
    if (!interactive) {
      toggleHistorySelection(rowForSelection.dataset.historyId);
    }
    return;
  }

  const button = event.target.closest("[data-history-action]");
  if (!button) return;
  const row = button.closest(".history-item");
  if (!row) return;
  const id = row.dataset.historyId;
  const action = button.dataset.historyAction;

  if (action === "complete") toggleHistoryComplete(id);
  if (action === "edit") openHistoryEditor(id);
  if (action === "delete") deleteHistory(id);
  if (action === "cancel-edit") closeHistoryEditor();
  if (action === "save-edit") saveHistoryEdit(id);
});

$("#historyList").addEventListener("change", (event) => {
  if (!event.target.matches("[data-history-select]")) return;
  const row = event.target.closest(".history-item");
  if (!row) return;
  toggleHistorySelection(row.dataset.historyId);
});

$("#historyList").addEventListener("keydown", (event) => {
  if (event.target.id !== "inlineHistoryInput") return;
  const row = event.target.closest(".history-item");
  if (event.key === "Enter" && row) {
    event.preventDefault();
    saveHistoryEdit(row.dataset.historyId);
  }
  if (event.key === "Escape") closeHistoryEditor();
});

$("#historySelectBtn").addEventListener("click", toggleHistorySelectMode);

$("#historyBatchBar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-batch-action]");
  if (!button) return;
  const action = button.dataset.batchAction;
  if (action === "all") toggleAllHistorySelection();
  if (action === "done") completeSelectedHistory();
  if (action === "delete") deleteSelectedHistory();
});

$("#drawCard").addEventListener("click", draw);
$("#againBtn").addEventListener("click", draw);
$("#closeResult").addEventListener("click", () => {
  pendingPick = null;
  $("#result").classList.add("hidden");
  returnFocus?.focus();
});
$("#doneBtn").addEventListener("click", () => {
  acceptCurrentPick();
  $("#result").classList.add("hidden");
  returnFocus?.focus();
  beep();
});

$$(".want-chip").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = currentFilter === button.dataset.filter ? "all" : button.dataset.filter;
    $$(".want-chip").forEach(chip => { const active = chip.dataset.filter === currentFilter; chip.classList.toggle("active", active); chip.setAttribute("aria-pressed", String(active)); });
    $("#filterHint").textContent = currentFilter === "all" ? "所有心情都可以，选一个小小的开始" : `正在挑选：${button.textContent.trim()}`;
  });
});

$$(".source-option").forEach((button) => {
  button.addEventListener("click", () => {
    drawSource = button.dataset.source;
    localStorage.setItem(storageKey(STORAGE_KEYS.drawSource), drawSource);
    updateDrawSourceUI();
  });
});

$("#soundBtn").addEventListener("click", () => {
  if (sound) stopMusic();
  else startMusic();
});

const pet = $("#pet");
const petArea = $("#petArea");
const petBubble = $("#petBubble");
const petPlay = $("#petPlay");
const petFeed = $("#petFeed");

let petMood = Number(localStorage.getItem(storageKey(STORAGE_KEYS.petMood)) || 70);
let petAffection = Number(localStorage.getItem(storageKey(STORAGE_KEYS.petAffection)) || 0);

const petLines = {
  tap: ["嘿！摸到我啦～", "被发现了！", "再摸一下嘛～", "今天也来陪我玩呀"],
  play: ["好耶！一起玩！", "抓到你啦！", "开心开心～", "再来一次！"],
  feed: ["啊呜！好好吃～", "谢谢投喂！", "吃饱啦，心情变好了"],
  idle: ["我在这里陪你～", "今天想做什么呀？", "发会儿呆也很好呀", "要不要让我替你选一个？"]
};

function petSay(type = "tap") {
  if (!petBubble) return;
  const special = window.soloPetLine ? window.soloPetLine(type) : null;
  const lines = special ? [special] : petLines[type] || petLines.tap;
  petBubble.textContent = lines[Math.floor(Math.random() * lines.length)];
  petBubble.classList.add("show");
  clearTimeout(window.petBubbleTimer);
  window.petBubbleTimer = setTimeout(() => {
    petBubble.classList.remove("show");
  }, 2800);
}

function savePet() {
  localStorage.setItem(storageKey(STORAGE_KEYS.petMood), String(petMood));
  localStorage.setItem(storageKey(STORAGE_KEYS.petAffection), String(petAffection));
  updatePetStatus();
  if(window.queueCloudSave)window.queueCloudSave();
}

function petBounce() {
  if (!pet) return;
  pet.classList.remove("pet-bounce");
  void pet.offsetWidth;
  pet.classList.add("pet-bounce");
}

if (pet) {
  pet.addEventListener("click", () => {
    petBounce();
    petSay("tap");
    updatePetStatus();
    petAffection += 1;
    petMood = Math.min(100, petMood + 1);
    savePet();
    beep();
  });
}

if (petPlay) {
  petPlay.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    petBounce();
    petSay("play");
    petAffection += 3;
    petMood = Math.min(100, petMood + 5);
    savePet();
    beep();
  });
}

if (petFeed) {
  petFeed.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    petBounce();
    petSay("feed");
    petAffection += 2;
    petMood = Math.min(100, petMood + 8);
    savePet();
    beep();
  });
}

function moveEyes(clientX, clientY) {
  $$(".eye").forEach((eye) => {
    const rect = eye.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    eye.style.transform = `translate(${Math.max(-3, Math.min(3, (dx / len) * 3))}px,${Math.max(-2, Math.min(2, (dy / len) * 2))}px)`;
  });
}

document.addEventListener("mousemove", (event) => moveEyes(event.clientX, event.clientY));
document.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (touch) moveEyes(touch.clientX, touch.clientY);
}, { passive: true });

setInterval(() => {
  if (!document.hidden && Math.random() < 0.35) petSay("idle");
}, 45000);

setInterval(() => {
  if (Math.random() < 0.35) {
    $$(".eye").forEach((eye) => {
      eye.style.height = "3px";
    });
    setTimeout(() => {
      $$(".eye").forEach((eye) => {
        eye.style.height = "16px";
      });
    }, 150);
  }
}, 3000);

setInterval(() => {
  if (currentPage === "today" && Math.random() < 0.22) {
    petArea.classList.add("tip");
    $("#petTip").textContent = ["要不要让我替你选一下？", "今天的运气还不错哦 ✦", "不用纠结啦，交给我吧"][Math.floor(Math.random() * 3)];
    setTimeout(() => petArea.classList.remove("tip"), 2400);
  }
}, 7000);

updateDrawSourceUI();
renderTasks();
renderHistory();
updateSoundButton();
updateDateUI();


function updatePetStatus() {
  const level = petAffection >= 100 ? '默契搭子' : petAffection >= 30 ? '熟悉的朋友' : '初见的小伙伴';
  $('#petStatus').textContent = `${level} · 一起积攒了 ${petAffection} 份暖意`;
  if(window.renderSolo)window.renderSolo();
}
let toastTimer;
function toast(message) {
  const box = $('#toast');
  if (!box) return;
  box.textContent = message; box.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.add('hidden'), 5000);
}
let undoTimer;
function offerUndo(action) {
  clearTimeout(undoTimer);
  $('#undoBar').classList.remove('hidden');
  $('#undoBtn').onclick = () => { action(); clearTimeout(undoTimer); $('#undoBar').classList.add('hidden'); toast('已经恢复啦'); };
  undoTimer = setTimeout(() => $('#undoBar').classList.add('hidden'), 7000);
}
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({app:'suixin',version:2,exportedAt:new Date().toISOString(),tasks,history,petAffection,petMood,soloPet:window.readSoloPet?window.readSoloPet():null},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `随心备份-${todayKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw Error('备份文件过大，请选择 5MB 以内的文件');
    const data = JSON.parse(await file.text());
    if (data.app !== 'suixin' || !Array.isArray(data.tasks) || !Array.isArray(data.history)) throw Error('这不是随心的备份文件');
    const valid = item => item && typeof item.text === 'string' && item.text.trim() && item.text.length <= 80;
    if (!data.tasks.every(valid) || !data.history.every(valid)) throw Error('备份内容不完整，未导入');
    const merge = (existing, incoming, normalize) => {
      const ids = new Set(existing.map(item => String(item.id)));
      return existing.concat(incoming.map(normalize).filter(item => item && !ids.has(String(item.id)) && ids.add(String(item.id))));
    };
    const nextTasks = merge(tasks, data.tasks, normalizeTask), nextHistory = merge(history, data.history, normalizeHistory);
    if (!writeJson(STORAGE_KEYS.tasks, nextTasks)) return;
    tasks = nextTasks;
    if (!writeJson(STORAGE_KEYS.history, nextHistory)) { renderTasks(); return; }
    history = nextHistory; if(data.soloPet&&window.restoreSoloPet)window.restoreSoloPet(data.soloPet); renderTasks(); renderHistory(); if(typeof renderLife === "function") renderLife(); toast('备份已合并，你原有的记录也保留着 🌷');
  } catch(error) { toast(error.message || '导入失败，请检查备份文件'); }
  finally { event.target.value = ''; }
};
$('#shareBtn').onclick = () => shareContent({
  title:'随心 · 今天做什么？',
  text:`今天我想：${lastPick ? lastPick.text : '让一点点运气，帮自己做个小决定'}。来「随心」，找一件想做的小事 🌷`,
  url:location.href.split('#')[0]
});
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#installBtn').textContent = '安装随心'; });
$('#installBtn').onclick = async () => {
  if (installPrompt) { await installPrompt.prompt(); installPrompt = null; }
  else toast('在手机浏览器菜单中选择“添加到主屏幕”。iPhone 请用 Safari 的分享菜单。');
};
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || $('#result').classList.contains('hidden')) return;
  if(event.key === 'Escape') { $('#closeResult').click(); returnFocus?.focus(); }
  if(event.key === 'Tab') {
    const buttons = [...$('#result').querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length-1];
    if(event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
$('#pet').tabIndex = 0;
$('#pet').addEventListener('keydown', event => { if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#pet').click(); } });
document.addEventListener('visibilitychange', () => {
  if(document.hidden && audioContext) audioContext.suspend();
  else if(!document.hidden && sound && audioContext) audioContext.resume();
});
updatePetStatus();
