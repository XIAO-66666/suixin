const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function el(key) {
  if (!elements.has(key)) elements.set(key, {value:'', textContent:'', innerHTML:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return true}},setAttribute(){},addEventListener(){},querySelector(){return el('child')},querySelectorAll(){return []},focus(){},select(){},animate(){}});
  return elements.get(key);
}
const saved = new Map();
const context = vm.createContext({console,document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},hidden:false},window:{scrollTo(){},addEventListener(){}},navigator:{},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},matchMedia:()=>({matches:false}),location:{protocol:'http:'},Blob,URL,Set,Date,Math});
vm.runInContext(fs.readFileSync('script.js','utf8'), context);
function run(code){return vm.runInContext(code,context)}
run(`tasks=[{id:'one',text:'读书',category:'study',filter:'useful'}]; drawSource='mine';`);
assert.equal(run(`pool('outside').length`),0,'unmatched filter must not fall back');
assert.equal(run(`pool('useful').length`),1);
run(`history=[]; for(let i=0;i<60;i++){pendingPick={text:'选择'+i};acceptCurrentPick()}`);
assert.equal(run('history.length'),60,'history must survive past 50 records');
run(`pendingPick=null;acceptCurrentPick()`);assert.equal(run('history.length'),60);
run(`tasks=[{id:'one',text:'原内容',category:'study'}]; editingTaskId='one';`);
el('#inlineTaskInput').value='新内容';el('#inlineTaskCategory').value='fun';
run('closeTaskEditor()');assert.equal(run('tasks[0].text'),'新内容');
assert.ok(run(`friendlyDate('2020-01-01').includes('2020')`));
run(`tasks=[{id:'old',text:'旧事情',category:'want'}];deleteTask('old');tasks.push({id:'new',text:'新事情',category:'want'})`);
el('#undoBtn').onclick();assert.equal(run('tasks.length'),2,'undo preserves newer additions');
const html=fs.readFileSync('index.html','utf8');
for(const id of ['toast','undoBar','undoBtn','shareBtn','installBtn','exportBtn','importBtn','importFile','petStatus','filterHint']) assert.ok(html.includes(`id="${id}"`),id);
for(const file of ['privacy.html','icons/icon-192.png','icons/icon-512.png'])assert.ok(fs.existsSync(file));
console.log('Passed: startup, strict filters, 60-record retention, acceptance, edit saving, dates, UI bindings and install assets. Browser/device checks remain manual.');
