const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEYS = {
  tasks: "todayThings",
  history: "todayHistory",
  selectedDate: "todaySelectedDate",
  sound: "todaySound",
  drawSource: "drawSource",
  petMood: "petMood",
  petAffection: "petAffection"
};

const defaults = [
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

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

let selectedDate = localStorage.getItem(STORAGE_KEYS.selectedDate) || todayKey();
let tasks = readJson(STORAGE_KEYS.tasks, []).map(normalizeTask).filter(Boolean);
let history = readJson(STORAGE_KEYS.history, []).map(normalizeHistory).filter(Boolean);
let sound = false;
let currentFilter = "all";
let lastPick = null;
let pendingPick = null;
let currentPage = "today";
let drawSource = localStorage.getItem(STORAGE_KEYS.drawSource) || "all";
let editingTaskId = null;
let editingHistoryId = null;
let historySelectMode = false;
let selectedHistoryIds = new Set();

writeJson(STORAGE_KEYS.tasks, tasks);
writeJson(STORAGE_KEYS.history, history);

function saveTasks() {
  writeJson(STORAGE_KEYS.tasks, tasks);
}

function saveHistory() {
  writeJson(STORAGE_KEYS.history, history);
}

function friendlyDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()) {
    return `今天 · ${month}月${day}日`;
  }
  return `${month}月${day}日`;
}

function updateDateUI() {
  $("#todayDate").textContent = friendlyDate(selectedDate);
  $("#mainTitle").textContent = selectedDate === todayKey() ? "今天做什么？" : "那天做什么？";
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
  localStorage.setItem(STORAGE_KEYS.sound, "on");
  clearInterval(musicTimer);
  musicStep = 0;
  getAudioContext();
  playMusicStep();
  musicTimer = setInterval(playMusicStep, 760);
  updateSoundButton();
}

function stopMusic() {
  sound = false;
  localStorage.setItem(STORAGE_KEYS.sound, "off");
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
  if (name === "things") renderTasks();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
          <small>${escapeHtml(item.date)}</small>
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
    if (filtered.length) return filtered;
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
    completed: false
  });
  history = history.slice(0, 50);
  pendingPick = null;
  saveHistory();
  renderHistory();
}

function draw() {
  const item = pick();
  if (!item) {
    if (drawSource === "mine") {
      alert("🌱 你的事情还没有添加哦，先去「我的事情」添加一个吧～");
    } else {
      alert("这里暂时没有可以抽的事情～");
    }
    return;
  }

  const card = $("#drawCard");
  if (card) {
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
  setTimeout(() => showResult(item), 330);
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
  localStorage.setItem(STORAGE_KEYS.selectedDate, selectedDate);
  updateDateUI();
});
$("#backToday").addEventListener("click", () => {
  selectedDate = todayKey();
  localStorage.setItem(STORAGE_KEYS.selectedDate, selectedDate);
  $("#datePicker").value = selectedDate;
  updateDateUI();
});

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchPage(tab.dataset.page));
});

$("#addBtn").addEventListener("click", addTask);
$("#taskInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTask();
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

$("#taskList").addEventListener("input", (event) => {
  if (event.target.id === "inlineTaskInput") updateEditingTask();
});

$("#taskList").addEventListener("change", (event) => {
  if (event.target.id === "inlineTaskCategory") updateEditingTask();
});

$("#taskList").addEventListener("keydown", (event) => {
  if (event.target.id !== "inlineTaskInput") return;
  if (event.key === "Enter") {
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
});
$("#doneBtn").addEventListener("click", () => {
  acceptCurrentPick();
  $("#result").classList.add("hidden");
  beep();
});

$$(".want-chip").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    draw();
  });
});

$$(".source-option").forEach((button) => {
  button.addEventListener("click", () => {
    drawSource = button.dataset.source;
    localStorage.setItem(STORAGE_KEYS.drawSource, drawSource);
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

let petMood = Number(localStorage.getItem(STORAGE_KEYS.petMood) || 70);
let petAffection = Number(localStorage.getItem(STORAGE_KEYS.petAffection) || 0);

const petLines = {
  tap: ["嘿！摸到我啦～", "被发现了！", "再摸一下嘛～", "今天也来陪我玩呀"],
  play: ["好耶！一起玩！", "抓到你啦！", "开心开心～", "再来一次！"],
  feed: ["啊呜！好好吃～", "谢谢投喂！", "吃饱啦，心情变好了"],
  idle: ["我在这里陪你～", "今天想做什么呀？", "发会儿呆也很好呀", "要不要让我替你选一个？"]
};

function petSay(type = "tap") {
  if (!petBubble) return;
  const lines = petLines[type] || petLines.tap;
  petBubble.textContent = lines[Math.floor(Math.random() * lines.length)];
  petBubble.classList.add("show");
  clearTimeout(window.petBubbleTimer);
  window.petBubbleTimer = setTimeout(() => {
    petBubble.classList.remove("show");
  }, 2800);
}

function savePet() {
  localStorage.setItem(STORAGE_KEYS.petMood, String(petMood));
  localStorage.setItem(STORAGE_KEYS.petAffection, String(petAffection));
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
