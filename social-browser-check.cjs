const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');

exports.runSocialChecks=async browser=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'suixin-social-browser-'));
  const child=spawn(process.env.SUIXIN_PYTHON||'python',['-u','server.py','--port','8083','--db',path.join(temp,'test.sqlite3')],{cwd:__dirname,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,SUIXIN_PUBLIC_ORIGIN:''}});
  let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  const contexts=[];const errors=[];const recoveryCodes=new Map();
  const origin='http://127.0.0.1:8083';
  try{
    for(let i=0;i<80;i++){
      if(child.exitCode!==null)throw Error('Test server failed: '+log);
      try{const response=await fetch(origin+'/api/me');if(response.ok)break;}catch{}
      if(i===79)throw Error('Test server not ready: '+log);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    async function newPage(){const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.locator('#accountBtn').waitFor({state:'visible'});return page;}
    async function auth(page,name,nickname,register=true){
      await page.locator('[data-page=today]').click();
      await page.locator('#accountBtn').click();
      if(register)await page.locator('#authSwitch').click();
      await page.locator('#authUsername').fill(name);await page.locator('#authPassword').fill('browser-test-password!');
      if(register)await page.locator('#authNickname').fill(nickname);
      if(register){await page.locator('#authSubmit').click();await page.locator('#recoveryOnce[open]').waitFor();const code=await page.locator('#recoveryValue').inputValue();assert.equal(code.length,32);recoveryCodes.set(name,code);await Promise.all([page.waitForNavigation(),page.locator('#continueRecovery').click()]);}
      else await Promise.all([page.waitForNavigation(),page.locator('#authSubmit').click()]);
      await page.locator('#accountBtn').filter({hasText:nickname}).waitFor({state:'visible'});
      return page.evaluate(()=>window.SUIXIN_USER);
    }
    const alice=await newPage(),bob=await newPage();
    await alice.locator('[data-page=life]').click();await alice.locator('#writeMoment').click();await alice.locator('#momentNote').fill('游客的花园记录');await alice.locator('#momentForm button[type=submit]').click();
    const a=await auth(alice,'alice_browser','小随');
    assert.equal(await alice.evaluate(()=>history.length),0,'guest records must not silently bind');
    const b=await auth(bob,'bob_browser','小心');
    await alice.locator('[data-page=friends]').click();await alice.locator('#bindGuestRecords').click();assert.equal(await alice.evaluate(()=>history.length),1);
    await alice.evaluate(()=>syncCloud());
    const secondDevice=await newPage();await auth(secondDevice,'alice_browser','小随',false);assert.equal(await secondDevice.evaluate(()=>history.length),1,'cloud restores on a fresh device');
    await secondDevice.locator('[data-page=life]').click();await secondDevice.locator('#writeMoment').click();await secondDevice.locator('#momentNote').fill('来自另一台设备的小日子');await secondDevice.locator('#momentForm button[type=submit]').click();await secondDevice.evaluate(()=>syncCloud());await alice.evaluate(()=>syncCloud());assert.equal(await alice.evaluate(()=>history.length),2,'cloud pulls new records from another device');
    await alice.evaluate(async()=>{
      const remote=await socialApi('state');remote.snapshot.history.push({id:'remote-note',text:'云端新增的一刻',note:'另一台设备的更新',completed:true});await socialApi('state',{revision:remote.revision,snapshot:remote.snapshot});
      history.push({id:'local-note',text:'本机未同步的一刻',note:'保留在备份里',completed:true});saveHistory();clearTimeout(cloudTimer);await syncCloud();
    });
    await alice.locator('[data-page=life]').click();await alice.locator('#cloudConflictBtn').click();await alice.locator('#cloudDialog[open]').waitFor();await alice.locator('#backupCloudLocal').click();await alice.locator('#useRemoteCloud').click();await alice.locator('#cloudDialog').waitFor({state:'hidden'});assert.equal(await alice.evaluate(()=>history.length),3);assert.equal(await alice.evaluate(()=>history.some(item=>item.id==='remote-note')),true);await alice.locator('[data-page=friends]').click();
    await alice.locator('#friendCodeInput').fill(b.code);await alice.locator('#addFriendSubmit').click();await alice.locator('#addFriendStatus').filter({hasText:'申请已送出'}).waitFor();
    await bob.locator('[data-page=friends]').click();await bob.locator('#refreshFriends').click();await bob.locator('[data-accept=true]').click();await bob.locator('#friendList [data-chat]').waitFor();
    await alice.locator('#refreshFriends').click();await alice.locator('#friendList [data-chat]').waitFor();
    await alice.locator('[data-social-view=compose]').click();await alice.locator('#friendMessage').fill('周末一起去公园，看看秋天吧 🍃');await alice.locator('#sendInAppCard').click();await alice.locator('[data-send-card]').click();await alice.locator('#pickFriendDialog').waitFor({state:'hidden'});
    await bob.evaluate(()=>refreshSocial());await bob.locator('#friendBadge').waitFor({state:'visible'});
    await bob.locator('[data-social-view=inbox]').click();await bob.locator('#conversationList [data-chat]').click();await bob.locator('#chatMessages details summary').click();assert.match(await bob.locator('#chatMessages').innerText(),/周末一起去公园/);
    await bob.locator('#chatInput').fill('好呀，我们周末见！');await bob.locator('#sendMessage').click();await bob.waitForFunction(()=>!document.querySelector('#chatInput').value);
    await alice.locator('[data-social-view=inbox]').click();await alice.evaluate(()=>refreshSocial());await alice.locator('#conversationList [data-chat]').click();await alice.locator('#chatMessages').filter({hasText:'好呀，我们周末见'}).waitFor();
    await alice.waitForFunction(()=>socialState.friends[0].unread===0);
    await alice.locator('#toast').waitFor({state:'hidden'});
    await alice.screenshot({path:'release/friends-preview.png',fullPage:true});
    await alice.locator('[data-social-view=together]').click();await alice.locator('#jointFriend').selectOption(b.id);await alice.locator('#jointPetName').fill('云朵');await alice.locator('#inviteJointPet').click();await alice.locator('#jointPets').filter({hasText:'等朋友接受'}).waitFor();
    await bob.locator('[data-social-view=together]').click();await bob.locator('[data-pet-action=accept]').click();await bob.locator('.joint-pet-scene').waitFor();await alice.locator('#refreshTogetherBtn').click();await alice.locator('.joint-pet-scene').waitFor();
    await alice.locator('[data-pet-look]').click();await alice.locator('[data-kind=hoodie]').click();await alice.locator('#applyPetLook').click();await alice.locator('.pending-look').waitFor();await bob.locator('#refreshTogetherBtn').click();await bob.locator('[data-pet-action=appearance-accept]').click();await bob.locator('.pending-look').waitFor({state:'hidden'});await alice.locator('#refreshTogetherBtn').click();await alice.waitForFunction(()=>document.querySelector('.joint-pet-scene img')?.src.includes('hoodie.webp'));assert.match(await alice.locator('.joint-pet-scene img').getAttribute('src'),/hoodie.webp/);assert.match(await bob.locator('.joint-pet-scene img').getAttribute('src'),/hoodie.webp/);
    await alice.locator('#jointTitle').fill('一起看一朵云');await alice.locator('#jointCategory').selectOption('outside');await alice.locator('#createJointInvite').click();await alice.locator('.joint-activity').filter({hasText:'一起看一朵云'}).waitFor();
    await bob.locator('#refreshTogetherBtn').click();const bActivity=bob.locator('.joint-activity').filter({hasText:'一起看一朵云'});await bActivity.locator('[data-choice=accepted]').click();await bActivity.locator('[data-activity-action=complete]').waitFor();
    await alice.locator('#refreshTogetherBtn').click();const aActivity=alice.locator('.joint-activity').filter({hasText:'一起看一朵云'});await aActivity.locator('[data-activity-action=complete]').click();await aActivity.filter({hasText:'我已确认'}).waitFor();assert.match(await alice.locator('.joint-pet-caption').innerText(),/0 件/);
    await bActivity.locator('[data-activity-action=complete]').click();await bob.locator('.joint-pet-caption').filter({hasText:'1 件'}).waitFor();await alice.locator('#refreshTogetherBtn').click();await aActivity.locator('[data-activity-action=memory]').click();await alice.locator('#jointMemoryText').fill('今天的云很像我们的小团子。');assert.equal(await alice.locator('#jointMemoryShared').isChecked(),false);await alice.locator('#jointMemoryShared').check();await alice.locator('#jointMemoryForm button[type=submit],#jointMemoryForm button:not([type])').first().click();await alice.locator('#jointMemoryDialog').waitFor({state:'hidden'});
    await bob.locator('#refreshTogetherBtn').click();await bActivity.filter({hasText:'今天的云很像'}).waitFor();await alice.locator('.joint-pet-card').screenshot({path:'release/shared-pet-preview.png'});
    await alice.locator('#chooseTogether').click();const chooseA=alice.locator('.joint-activity').filter({hasText:'一起选一件都愿意做的小事'});await chooseA.waitFor();await bob.locator('#refreshTogetherBtn').click();const chooseB=bob.locator('.joint-activity').filter({hasText:'一起选一件都愿意做的小事'});await chooseB.locator('[data-choice=accepted]').click();await bob.locator('#refreshTogetherBtn').click();await chooseB.locator('[data-activity-action=preferences]').click();await bob.locator('#jointMood').selectOption('outside');await bob.locator('#jointMinutes').selectOption('15');await bob.locator('#preferencesForm button').click();await bob.locator('#preferencesDialog').waitFor({state:'hidden'});
    await alice.locator('#refreshTogetherBtn').click();await chooseA.locator('[data-activity-action=preferences]').click();await alice.locator('#jointMood').selectOption('tired');await alice.locator('#jointMinutes').selectOption('5');await alice.locator('#preferencesForm button').click();await alice.locator('#preferencesDialog').waitFor({state:'hidden'});await chooseA.locator('[data-activity-action=select][data-choice=song]').click();await bob.locator('#refreshTogetherBtn').click();await chooseB.locator('[data-activity-action=select][data-choice=song]').click();await bob.locator('.joint-activity').filter({hasText:'一起听一首歌'}).waitFor();
    await alice.locator('#jointTitle').fill('一起喝茶的提醒测试');await alice.evaluate(()=>window.setDateTimeValue('#jointStartAt',Math.floor(Date.now()/1000)+120));await alice.locator('#createJointInvite').click();const scheduleA=alice.locator('.joint-activity').filter({hasText:'一起喝茶的提醒测试'});await scheduleA.waitFor();await bob.locator('#refreshTogetherBtn').click();const scheduleB=bob.locator('.joint-activity').filter({hasText:'一起喝茶的提醒测试'});await scheduleB.locator('[data-choice=accepted]').click();await scheduleB.locator('[data-reminder-settings]').waitFor();
    await alice.locator('#refreshTogetherBtn').click();await scheduleA.locator('[data-reminder-settings]').click();assert.equal(await alice.locator('#reminderEnabled').isChecked(),false);await alice.locator('#reminderEnabled').check();await alice.locator('#reminderLead').selectOption('5');await alice.locator('#reminderForm button').click();await alice.locator('#appointmentReminder').waitFor({state:'visible'});assert.match(await alice.locator('#appointmentText').innerText(),/提醒测试/);assert.equal(await bob.locator('#appointmentReminder').isVisible(),false);await alice.locator('#dismissReminder').click();
    bob.once('dialog',dialog=>dialog.accept('明天再一起喝茶吧'));await scheduleB.locator('[data-choice=reschedule]').click();await scheduleB.filter({hasText:'想换个时间'}).waitFor();await alice.locator('#refreshTogetherBtn').click();await scheduleA.locator('[data-activity-action=revise]').click();await alice.evaluate(()=>window.setDateTimeValue('#reviseStartAt',Math.floor(Date.now()/1000)+86400));await alice.locator('#reviseForm button').click();await alice.locator('#reviseActivityDialog').waitFor({state:'hidden'});await bob.locator('#refreshTogetherBtn').click();await bob.locator('[data-page=today]').click();await bob.waitForFunction(()=>homeAction.kind==='activity');assert.match(await bob.locator('#drawCard strong').innerText(),/回应/);await bob.locator('#drawCard').click();await bob.locator('#friendTogether').waitFor({state:'visible'});
    const bobOtherDevice=await newPage();await auth(bobOtherDevice,'bob_browser','小心',false);await bobOtherDevice.locator('[data-page=friends]').click();await bobOtherDevice.locator('[data-social-view=inbox]').click();await bobOtherDevice.locator('#conversationList [data-chat]').click();await bobOtherDevice.locator('#chatMessages').filter({hasText:'好呀，我们周末见！'}).waitFor();
    await bob.locator('[data-social-view=inbox]').click();const ownReply=bob.locator('.chat-message').filter({hasText:'好呀，我们周末见！'});await ownReply.waitFor();bob.once('dialog',dialog=>dialog.accept());await ownReply.locator('[data-delete-message]').click();await ownReply.waitFor({state:'hidden'});await bobOtherDevice.evaluate(()=>refreshChat());await bobOtherDevice.locator('.chat-message').filter({hasText:'好呀，我们周末见！'}).waitFor({state:'hidden'});await alice.locator('[data-social-view=inbox]').click();await alice.locator('#chatMessages').filter({hasText:'好呀，我们周末见！'}).waitFor();
    await bob.reload();await bob.locator('#accountBtn').filter({hasText:'小心'}).waitFor({state:'visible'});assert.equal(await bob.evaluate(()=>history.length),0,'another account must not inherit private memories');
    await alice.locator('[data-social-view=people]').click();await Promise.all([alice.waitForNavigation(),alice.locator('#logoutAccount').click()]);await alice.locator('#accountBtn').filter({hasText:'登录'}).waitFor({state:'visible'});
    await auth(alice,'bob_browser','小心',false);assert.equal(await alice.evaluate(()=>history.length),0,'same browser switch must isolate account records');
    await alice.locator('[data-page=friends]').click();await Promise.all([alice.waitForNavigation(),alice.locator('#logoutAccount').click()]);await alice.locator('#accountBtn').filter({hasText:'登录'}).waitFor({state:'visible'});
    await auth(alice,'alice_browser','小随',false);assert.equal(await alice.evaluate(()=>history.length),3,'original account records must survive logout');
    assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await alice.setViewportSize({width:320,height:700});assert.equal(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'account layout fits small screens');
    await alice.route('**/api/social',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'请重新登录'})}));
    await alice.evaluate(()=>refreshSocial());await alice.locator('#accountBtn').click();await alice.locator('#authDialog[open]').waitFor();await alice.locator('#closeAuth').click();await alice.unroute('**/api/social');
    await alice.locator('[data-page=friends]').click();await alice.locator('[data-social-view=people]').click();await alice.locator('#accountSettings').click();await alice.locator('#allowFriendRequests').uncheck();await alice.locator('#profileForm button').click();await alice.locator('#settingsStatus').filter({hasText:'资料已保存'}).waitFor();const downloadPromise=alice.waitForEvent('download');await alice.locator('#exportAccountData').click();const download=await downloadPromise;const accountExport=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(accountExport.profile.id,a.id);assert.equal(accountExport.profile.password,undefined);assert.ok(Array.isArray(accountExport.messages));await alice.locator('#closeSettings').click();
    await Promise.all([alice.waitForNavigation(),alice.locator('#logoutAccount').click()]);await alice.locator('#accountBtn').filter({hasText:'登录'}).waitFor({state:'visible'});await alice.locator('#accountBtn').click();await alice.locator('#forgotPassword').click();await alice.locator('#resetUsername').fill('alice_browser');await alice.locator('#resetCode').fill(recoveryCodes.get('alice_browser'));await alice.locator('#resetPassword').fill('recovered-browser-password!');await alice.locator('#resetSubmit').click();await alice.locator('#recoveryOnce[open]').waitFor();await Promise.all([alice.waitForNavigation(),alice.locator('#continueRecovery').click()]);await alice.locator('#accountBtn').filter({hasText:'小随'}).waitFor({state:'visible'});assert.equal(await alice.evaluate(()=>history.length),3);
    assert.deepEqual(errors,[]);
    console.log('PASS: recovery-code onboarding; cloud sync across devices; private account isolation; friendship/card/chat regression; mutual pet adoption; two-person completion gives exactly one growth; opt-in shared memories; session recovery; no page errors.');
  }finally{
    for(const context of contexts)await context.close();
    if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    // Temporary test DB remains in OS temp; never mixed into the real data directory.
  }
};
