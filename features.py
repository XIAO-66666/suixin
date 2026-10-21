"""Account safety, versioned private sync, shared activities and companion pets."""
import hashlib
import hmac
import json
import secrets
import time


class FeatureError(Exception):
    def __init__(self,status,message):
        self.status,self.message=status,message


def fail(status,message):
    raise FeatureError(status,message)


def install(db):
    columns={row['name'] for row in db.execute('PRAGMA table_info(users)')}
    for name,definition in [('recovery_hash',"TEXT NOT NULL DEFAULT ''"),('allow_requests','INTEGER NOT NULL DEFAULT 1')]:
        if name not in columns:
            db.execute(f'ALTER TABLE users ADD COLUMN {name} {definition}')
    if 'activity_id' not in {row['name'] for row in db.execute('PRAGMA table_info(messages)')}:
        db.execute('ALTER TABLE messages ADD COLUMN activity_id TEXT')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS cloud_state(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks(owner TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(owner,target));
      CREATE TABLE IF NOT EXISTS mutes(owner TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(owner,target));
      CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,reporter TEXT,target TEXT,reason TEXT NOT NULL,message_id INTEGER,created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
      CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY,sender TEXT REFERENCES users(id),target TEXT REFERENCES users(id),title TEXT NOT NULL,category TEXT NOT NULL,when_text TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',note TEXT NOT NULL DEFAULT '',client_id TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(sender,client_id));
      CREATE TABLE IF NOT EXISTS confirmations(activity TEXT REFERENCES activities(id) ON DELETE CASCADE,owner TEXT REFERENCES users(id),PRIMARY KEY(activity,owner));
      CREATE TABLE IF NOT EXISTS preferences(activity TEXT REFERENCES activities(id) ON DELETE CASCADE,owner TEXT REFERENCES users(id),mood TEXT NOT NULL,minutes INTEGER NOT NULL,choice TEXT NOT NULL DEFAULT '',PRIMARY KEY(activity,owner));
      CREATE TABLE IF NOT EXISTS memories(activity TEXT REFERENCES activities(id) ON DELETE CASCADE,owner TEXT REFERENCES users(id),text TEXT NOT NULL,shared INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(activity,owner));
      CREATE TABLE IF NOT EXISTS pets(id TEXT PRIMARY KEY,a TEXT REFERENCES users(id),b TEXT REFERENCES users(id),proposer TEXT REFERENCES users(id),name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,UNIQUE(a,b));
      CREATE TABLE IF NOT EXISTS pet_events(pet TEXT REFERENCES pets(id) ON DELETE CASCADE,activity TEXT UNIQUE REFERENCES activities(id) ON DELETE CASCADE,created INTEGER NOT NULL,PRIMARY KEY(pet,activity));
      CREATE TABLE IF NOT EXISTS pet_archives(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,created INTEGER NOT NULL);
    ''')


def new_recovery(db,uid):
    code=secrets.token_hex(16).upper()
    db.execute('UPDATE users SET recovery_hash=? WHERE id=?',(hashlib.sha256(code.encode()).hexdigest(),uid))
    return code


def password_valid(user,password):
    if not isinstance(password,str) or not 10<=len(password)<=128:
        return False
    actual=hashlib.scrypt(password.encode(),salt=bytes.fromhex(user['salt']),n=16384,r=8,p=1).hex()
    return hmac.compare_digest(actual,user['password'])


def update_password(db,uid,password):
    if not isinstance(password,str) or not 10<=len(password)<=128:
        fail(400,'新密码请使用 10–128 位字符')
    salt=secrets.token_hex(16)
    hashed=hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
    db.execute('UPDATE users SET salt=?,password=? WHERE id=?',(salt,hashed,uid))
    db.execute('DELETE FROM sessions WHERE user_id=?',(uid,))


def public_post(h,db,data):
    if h.route!='/api/recover':
        return False
    h.server.throttle(('recover-ip',h.client_address[0]),10,900)
    username=h.text(data,'username',24,3).lower()
    h.server.throttle(('recover-name',username),6,900)
    code=h.text(data,'code',40,32).replace('-','').upper()
    row=db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
    hashed=hashlib.sha256(code.encode()).hexdigest()
    if not row or not row['recovery_hash'] or not hmac.compare_digest(hashed,row['recovery_hash']):
        fail(401,'用户名或恢复码不正确')
    update_password(db,row['id'],data.get('password'))
    newcode=new_recovery(db,row['id'])
    h.reply(200,{'ok':True,'recoveryCode':newcode},h.session(db,row))
    return True


def blocked(db,a,b):
    return bool(db.execute('SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)',(a,b,b,a)).fetchone())


def notify(db,sender,target,text,activity=None):
    db.execute('INSERT INTO messages(sender,target,kind,text,client_id,created,activity_id) VALUES (?,?,?,?,?,?,?)',
               (sender,target,'text',text,secrets.token_hex(16),int(time.time()),activity))


def participant(h,db,me,id):
    row=db.execute('SELECT * FROM activities WHERE id=? AND (sender=? OR target=?)',(id,me,me)).fetchone()
    if not row:
        fail(404,'这份共同邀请不存在')
    other=row['target'] if row['sender']==me else row['sender']
    h.require_friend(db,me,other)
    return row,other


def archive_pair(db,a,b):
    a,b=sorted((a,b))
    pet=db.execute('SELECT * FROM pets WHERE a=? AND b=?',(a,b)).fetchone()
    for owner in (a,b):
        notes=db.execute('''SELECT m.text,a.title FROM memories m JOIN activities a ON a.id=m.activity
          WHERE m.owner=? AND ((a.sender=? AND a.target=?) OR (a.sender=? AND a.target=?))''',(owner,a,b,b,a)).fetchall()
        if pet or notes:
            count=db.execute('SELECT count(*) FROM pet_events WHERE pet=?',(pet['id'],)).fetchone()[0] if pet else 0
            payload={'name':pet['name'] if pet else '我们的小回忆','growth':count,'notes':[dict(note) for note in notes]}
            db.execute('INSERT INTO pet_archives VALUES (?,?,?,?)',(secrets.token_hex(16),owner,json.dumps(payload,ensure_ascii=False),int(time.time())))
    if pet:
        db.execute('DELETE FROM pets WHERE id=?',(pet['id'],))


def suggestions(db,activity):
    prefs=db.execute('SELECT * FROM preferences WHERE activity=? ORDER BY owner',(activity,)).fetchall()
    if len(prefs)!=2:
        return []
    minutes=min(item['minutes'] for item in prefs)
    moods={item['mood'] for item in prefs}
    options=[{'key':'song','title':'一起听一首歌，说说喜欢的那一句','category':'fun'},
             {'key':'tea','title':'各自泡一杯茶，聊聊今天的小事','category':'rest'}]
    if minutes>=15:
        options.append({'key':'walk','title':'一起散步十五分钟，找一片喜欢的叶子','category':'outside'})
    if minutes>=30 and 'tired' not in moods:
        options.append({'key':'learn','title':'一起专心半小时，再交换一个小收获','category':'useful'})
    return options


def get(h,db,me):
    uid=me['id']
    if h.route=='/api/state':
        row=db.execute('SELECT * FROM cloud_state WHERE user_id=?',(uid,)).fetchone()
        h.reply(200,{'userId':uid,'revision':row['revision'] if row else 0,'snapshot':json.loads(row['payload']) if row else None})
    elif h.route=='/api/settings':
        blocklist=db.execute('SELECT u.id,u.nickname FROM blocks b JOIN users u ON u.id=b.target WHERE b.owner=?',(uid,)).fetchall()
        h.reply(200,{'allowRequests':bool(me['allow_requests']),'recoveryReady':bool(me['recovery_hash']),'blocks':[dict(row) for row in blocklist]})
    elif h.route=='/api/together':
        rows=db.execute('SELECT * FROM activities WHERE sender=? OR target=? ORDER BY created DESC,id DESC',(uid,uid)).fetchall()
        activities=[]
        for row in rows:
            other=row['target'] if row['sender']==uid else row['sender']
            a,b=sorted((uid,other))
            if blocked(db,uid,other) or not db.execute('SELECT 1 FROM friends WHERE a=? AND b=?',(a,b)).fetchone():
                continue
            item=dict(row)
            item['otherName']=db.execute('SELECT nickname FROM users WHERE id=?',(other,)).fetchone()[0]
            item['confirmations']=[r['owner'] for r in db.execute('SELECT owner FROM confirmations WHERE activity=?',(row['id'],))]
            item['preferences']=[dict(r) for r in db.execute('SELECT owner,mood,minutes,choice FROM preferences WHERE activity=?',(row['id'],))]
            item['suggestions']=suggestions(db,row['id'])
            reminder=db.execute('SELECT enabled,lead,fired_at FROM reminders WHERE owner=? AND activity=?',(uid,row['id'])).fetchone()
            item['reminder']=dict(reminder) if reminder else None
            item['memories']=[dict(r) for r in db.execute('SELECT owner,text,shared FROM memories WHERE activity=? AND (owner=? OR shared=1)',(row['id'],uid))]
            activities.append(item)
        pets=[]
        for row in db.execute('SELECT * FROM pets WHERE a=? OR b=? ORDER BY created DESC',(uid,uid)):
            item=dict(row);other=row['b'] if row['a']==uid else row['a']
            item['otherName']=db.execute('SELECT nickname FROM users WHERE id=?',(other,)).fetchone()[0]
            item['growth']=db.execute('SELECT count(*) FROM pet_events WHERE pet=?',(row['id'],)).fetchone()[0]
            pets.append(item)
        archives=[{**dict(row),'payload':json.loads(row['payload'])} for row in db.execute('SELECT id,payload,created FROM pet_archives WHERE owner=? ORDER BY created DESC',(uid,))]
        h.reply(200,{'activities':activities,'pets':pets,'archives':archives})
    else:
        return False
    return True


def valid_snapshot(snapshot):
    if not isinstance(snapshot,dict):
        fail(400,'备份结构不正确')
    clean={}
    for key in ('tasks','history'):
        items=snapshot.get(key,[])
        if not isinstance(items,list) or len(items)>10000:
            fail(400,'记录格式不正确或数量过多')
        clean[key]=[]
        for item in items:
            if not isinstance(item,dict) or not isinstance(item.get('id'),str) or not 1<=len(item['id'])<=100 or not isinstance(item.get('text'),str) or not 1<=len(item['text'])<=80:
                fail(400,'记录内容不完整')
            allowed={'id','text','category','filter','emoji','source'} if key=='tasks' else {'id','text','category','filter','source','date','dateKey','completed','note','memoryMood','mood'}
            value={k:v for k,v in item.items() if k in allowed}
            if any(not isinstance(v,(str,bool)) or (isinstance(v,str) and len(v)>(280 if k=='note' else 100)) for k,v in value.items()):
                fail(400,'记录内容过长或格式不正确')
            clean[key].append(value)
    for key,maximum in [('petMood',100),('petAffection',1000000000)]:
        value=snapshot.get(key,70 if key=='petMood' else 0)
        if not isinstance(value,int) or isinstance(value,bool) or not 0<=value<=maximum:
            fail(400,'宠物数据不正确')
        clean[key]=value
    from experience import solo_profile
    clean['soloPet']=solo_profile(snapshot.get('soloPet',{}))
    return clean


def post(h,db,me,data):
    uid=me['id'];now=int(time.time());route=h.route
    if route=='/api/state':
        raw=data.get('snapshot')
        if isinstance(raw,dict) and 'soloPet' not in raw:
            previous=db.execute('SELECT payload FROM cloud_state WHERE user_id=?',(uid,)).fetchone()
            if previous:raw={**raw,'soloPet':json.loads(previous['payload']).get('soloPet',{})}
        snapshot=valid_snapshot(raw);revision=data.get('revision')
        if isinstance(raw,dict) and isinstance(raw.get('soloPet'),dict) and 'appearance' not in raw['soloPet']:
            previous=db.execute('SELECT payload FROM cloud_state WHERE user_id=?',(uid,)).fetchone()
            if previous:
                snapshot['soloPet']['appearance']=json.loads(previous['payload']).get('soloPet',{}).get('appearance',{'kind':'hoodie','imageId':''})
        import pet_studio
        look=snapshot['soloPet']['appearance']
        pet_studio.owned(db,uid,look)
        if not isinstance(revision,int) or isinstance(revision,bool) or revision<0:
            fail(400,'同步版本不正确')
        row=db.execute('SELECT revision FROM cloud_state WHERE user_id=?',(uid,)).fetchone()
        if (row['revision'] if row else 0)!=revision:
            fail(409,'另一台设备有更新，请先选择要保留的版本')
        payload=json.dumps(snapshot,ensure_ascii=False,separators=(',',':'))
        db.execute('INSERT INTO cloud_state VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload',(uid,revision+1,payload))
        h.reply(200,{'userId':uid,'revision':revision+1})
    elif route=='/api/profile':
        name=h.text(data,'nickname',20);allow=data.get('allowRequests')
        if not isinstance(allow,bool):fail(400,'请选择好友申请设置')
        db.execute('UPDATE users SET nickname=?,allow_requests=? WHERE id=?',(name,int(allow),uid));h.reply(200,{'ok':True})
    elif route in ('/api/password','/api/recovery-code','/api/account/delete'):
        h.server.throttle(('security',uid),8,900)
        if not password_valid(me,data.get('password')):fail(403,'当前密码不正确')
        if route=='/api/password':
            update_password(db,uid,data.get('newPassword'))
            h.reply(200,{'ok':True},h.session(db,me))
        elif route=='/api/recovery-code':
            h.reply(200,{'recoveryCode':new_recovery(db,uid)})
        else:
            if data.get('confirm')!=me['username']:fail(400,'请输入自己的用户名以确认注销')
            pairs=db.execute('SELECT a,b FROM friends WHERE a=? OR b=?',(uid,uid)).fetchall()
            for pair in pairs:archive_pair(db,pair['a'],pair['b'])
            # Each remaining participant keeps only their own written memories.
            ids=[r['id'] for r in db.execute('SELECT id FROM activities WHERE sender=? OR target=?',(uid,uid))]
            for id in ids:db.execute('DELETE FROM activities WHERE id=?',(id,))
            for table in ('messages','requests'):
                db.execute(f'DELETE FROM {table} WHERE sender=? OR target=?',(uid,uid))
            db.execute('DELETE FROM friends WHERE a=? OR b=?',(uid,uid))
            db.execute('DELETE FROM pets WHERE a=? OR b=?',(uid,uid))
            db.execute('DELETE FROM users WHERE id=?',(uid,))
            db.execute('UPDATE reports SET reporter=NULL WHERE reporter=?',(uid,));db.execute('UPDATE reports SET target=NULL WHERE target=?',(uid,))
            h.reply(200,{'ok':True},'suixin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
    elif route in ('/api/block','/api/mute','/api/report'):
        other=h.text(data,'friendId',32,32)
        if other==uid or not db.execute('SELECT 1 FROM users WHERE id=?',(other,)).fetchone():fail(404,'没有找到这个用户')
        if route=='/api/report':
            h.server.throttle(('report',uid),5,3600)
            reason=h.text(data,'reason',500)
            message_id=data.get('messageId')
            if message_id is not None and not db.execute('SELECT 1 FROM messages WHERE id=? AND ((sender=? AND target=?) OR (sender=? AND target=?))',(message_id,uid,other,other,uid)).fetchone():fail(404,'消息不存在')
            db.execute('INSERT INTO reports(id,reporter,target,reason,message_id,created) VALUES (?,?,?,?,?,?)',(secrets.token_hex(16),uid,other,reason,message_id,now))
        else:
            enabled=data.get('enabled')
            if not isinstance(enabled,bool):fail(400,'设置不正确')
            table='blocks' if route=='/api/block' else 'mutes'
            if enabled:
                if route=='/api/block':
                    archive_pair(db,uid,other);a,b=sorted((uid,other))
                    db.execute('DELETE FROM friends WHERE a=? AND b=?',(a,b))
                    db.execute('DELETE FROM requests WHERE (sender=? AND target=?) OR (sender=? AND target=?)',(uid,other,other,uid))
                db.execute(f'INSERT OR IGNORE INTO {table} VALUES (?,?)',(uid,other))
            else:db.execute(f'DELETE FROM {table} WHERE owner=? AND target=?',(uid,other))
        h.reply(200,{'ok':True})
    elif route=='/api/activities':
        other=h.text(data,'friendId',32,32);h.require_friend(db,uid,other)
        client=h.text(data,'clientId',100)
        old=db.execute('SELECT id,target,title FROM activities WHERE sender=? AND client_id=?',(uid,client)).fetchone()
        if old:
            if old['target']!=other or old['title']!=data.get('title'):fail(409,'这份邀请已经发送，请重新生成')
            h.reply(200,{'id':old['id']});return True
        h.server.throttle(('activities',uid),20,3600)
        title=h.text(data,'title',120);when=h.text(data,'when',80,0)
        mode=data.get('mode','direct');category=data.get('category','rest')
        if mode not in ('direct','choose') or category not in ('rest','fun','outside','useful','connect'):fail(400,'邀请类型不正确')
        from experience import start_time
        starts=start_time(data.get('startAt'))
        id=secrets.token_hex(16)
        db.execute('INSERT INTO activities(id,sender,target,title,category,when_text,mode,client_id,created) VALUES (?,?,?,?,?,?,?,?,?)',(id,uid,other,title,category,when,mode,client,now))
        db.execute('UPDATE activities SET starts_at=? WHERE id=?',(starts,id))
        db.execute('INSERT INTO messages(sender,target,kind,text,client_id,created,activity_id) VALUES (?,?,?,?,?,?,?)',(uid,other,'card',title,'act-'+id,now,id))
        h.reply(201,{'id':id})
    elif route.startswith('/api/activities/'):
        parts=route.split('/');id=parts[3];action=parts[4] if len(parts)==5 else ''
        row,other=participant(h,db,uid,id)
        if action=='respond':
            choice=data.get('choice')
            if uid!=row['target'] or (row['status']!='pending' and not (row['status']=='accepted' and choice in ('reschedule','change'))):fail(409,'这份邀请当前不能回应')
            if choice not in ('accepted','declined','reschedule','change'):fail(400,'请选择一种回应')
            note=h.text(data,'note',120,0)
            db.execute('UPDATE activities SET status=?,note=? WHERE id=?',(choice,note,id))
            if choice in ('reschedule','change'): db.execute('DELETE FROM confirmations WHERE activity=?',(id,))
            notify(db,uid,other,'回应了你的小邀请：'+{'accepted':'好呀','declined':'这次先不了','reschedule':'想换个时间','change':'想换个提议'}[choice],id)
        elif action=='revise':
            if uid!=row['sender'] or row['status'] not in ('pending','accepted','reschedule','change'):fail(409,'当前不能修改这份邀请')
            title=h.text(data,'title',120);when=h.text(data,'when',80,0)
            from experience import start_time
            starts=start_time(data.get('startAt'))
            db.execute('UPDATE activities SET starts_at=? WHERE id=?',(starts,id))
            db.execute('DELETE FROM confirmations WHERE activity=?',(id,))
            db.execute('UPDATE reminders SET fired_at=NULL WHERE activity=?',(id,))
            db.execute("UPDATE activities SET title=?,when_text=?,status='pending',note='' WHERE id=?",(title,when,id))
            notify(db,uid,other,'更新了一份小邀请：'+title,id)
        elif action=='cancel':
            if uid!=row['sender'] or row['status']=='completed':fail(409,'当前不能撤回邀请')
            db.execute("UPDATE activities SET status='cancelled' WHERE id=?",(id,))
        elif action=='preferences':
            if row['mode']!='choose' or row['status']!='accepted':fail(409,'接受共同选择邀请后再填写偏好')
            mood=data.get('mood');minutes=data.get('minutes')
            if mood not in ('tired','bored','outside','connect') or minutes not in (5,15,30,60) or isinstance(minutes,bool):fail(400,'请选择心情和空闲时间')
            db.execute("INSERT INTO preferences(activity,owner,mood,minutes) VALUES (?,?,?,?) ON CONFLICT(activity,owner) DO UPDATE SET mood=excluded.mood,minutes=excluded.minutes,choice=''",(id,uid,mood,minutes))
            # Any changed preference invalidates both previous approvals.
            db.execute("UPDATE preferences SET choice='' WHERE activity=?",(id,))
        elif action=='select':
            if row['mode']!='choose' or row['status']!='accepted':fail(409,'这份邀请当前不需要共同选择')
            options=suggestions(db,id);choice=data.get('choice');selected=next((o for o in options if o['key']==choice),None)
            if not selected:fail(400,'等待两人填写偏好后，再选择一个共同提议')
            db.execute('UPDATE preferences SET choice=? WHERE activity=? AND owner=?',(choice,id,uid))
            choices=db.execute('SELECT choice FROM preferences WHERE activity=?',(id,)).fetchall()
            if len(choices)==2 and all(c['choice']==choice for c in choices):
                db.execute("UPDATE activities SET title=?,category=?,mode='direct' WHERE id=?",(selected['title'],selected['category'],id))
                notify(db,uid,other,'你们选中了同一件小事：'+selected['title'],id)
        elif action=='complete':
            if row['status']=='completed':h.reply(200,{'ok':True});return True
            if row['status']!='accepted' or row['mode']=='choose':fail(409,'先接受邀请，并共同选好要做的事')
            db.execute('INSERT OR IGNORE INTO confirmations VALUES (?,?)',(id,uid))
            if db.execute('SELECT count(*) FROM confirmations WHERE activity=?',(id,)).fetchone()[0]==2:
                db.execute("UPDATE activities SET status='completed' WHERE id=?",(id,))
                a,b=sorted((uid,other));pet=db.execute("SELECT id FROM pets WHERE a=? AND b=? AND status='active'",(a,b)).fetchone()
                if pet:db.execute('INSERT OR IGNORE INTO pet_events VALUES (?,?,?)',(pet['id'],id,now))
                notify(db,uid,other,'你们都确认完成啦，小经历已经收好。',id)
        elif action=='memory':
            if row['status']!='completed':fail(409,'共同确认完成后，再写下这次回忆')
            text=h.text(data,'text',280);shared=data.get('shared',False)
            if not isinstance(shared,bool):fail(400,'请选择回忆可见范围')
            db.execute('INSERT INTO memories VALUES (?,?,?,?) ON CONFLICT(activity,owner) DO UPDATE SET text=excluded.text,shared=excluded.shared',(id,uid,text,int(shared)))
        elif action=='delete-memory':db.execute('DELETE FROM memories WHERE activity=? AND owner=?',(id,uid))
        else:fail(404,'没有找到这个操作')
        h.reply(200,{'ok':True})
    elif route=='/api/pets':
        other=h.text(data,'friendId',32,32);h.require_friend(db,uid,other);a,b=sorted((uid,other))
        name=h.text(data,'name',20)
        if db.execute('SELECT 1 FROM pets WHERE a=? AND b=?',(a,b)).fetchone():fail(409,'你们已经有小动物或待确认的领养邀请')
        db.execute('INSERT INTO pets(id,a,b,proposer,name,status,created) VALUES (?,?,?,?,?,?,?)',(secrets.token_hex(16),a,b,uid,name,'pending',now))
        notify(db,uid,other,'邀请你一起领养「'+name+'」，去「一起」看看吧。')
        h.reply(201,{'ok':True})
    elif route.startswith('/api/pets/'):
        parts=route.split('/');id=parts[3];action=parts[4] if len(parts)==5 else ''
        pet=db.execute('SELECT * FROM pets WHERE id=? AND (a=? OR b=?)',(id,uid,uid)).fetchone()
        if not pet:fail(404,'这个小窝不存在')
        other=pet['b'] if pet['a']==uid else pet['a'];h.require_friend(db,uid,other)
        if action=='accept':
            if pet['proposer']==uid or pet['status']!='pending':fail(409,'等待对方确认这份领养邀请')
            db.execute("UPDATE pets SET status='active' WHERE id=?",(id,));notify(db,uid,other,'接受了共同领养，小动物在等你们啦。')
        elif action=='rename':
            if pet['status']!='active':fail(409,'领养成功后才能改名字')
            db.execute('UPDATE pets SET name=? WHERE id=?',(h.text(data,'name',20),id))
        elif action=='end':archive_pair(db,uid,other)
        else:fail(404,'没有找到这个操作')
        h.reply(200,{'ok':True})
    else:
        return False
    return True
