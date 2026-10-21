"""Small daily-use improvements layered on the existing server."""
import json
import time

from features import fail, participant


def install(db):
    columns={row['name'] for row in db.execute('PRAGMA table_info(activities)')}
    if 'starts_at' not in columns:
        db.execute('ALTER TABLE activities ADD COLUMN starts_at INTEGER')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS reminders(owner TEXT REFERENCES users(id) ON DELETE CASCADE,activity TEXT REFERENCES activities(id) ON DELETE CASCADE,enabled INTEGER NOT NULL,lead INTEGER NOT NULL DEFAULT 0,fired_at INTEGER,PRIMARY KEY(owner,activity));
      CREATE TABLE IF NOT EXISTS message_hides(owner TEXT REFERENCES users(id) ON DELETE CASCADE,message INTEGER REFERENCES messages(id) ON DELETE CASCADE,PRIMARY KEY(owner,message));
    ''')


def start_time(value):
    if value is None or value=='':
        return None
    now=int(time.time())
    if not isinstance(value,int) or isinstance(value,bool) or not now-60<=value<=now+366*86400:
        fail(400,'请选择未来一年内的有效时间')
    return value


def solo_profile(value):
    if not isinstance(value,dict):
        fail(400,'个人小动物资料不正确')
    name=value.get('name','小团子')
    adopted=value.get('adopted',False)
    personality=value.get('personality','gentle')
    if not isinstance(name,str) or not 1<=len(name.strip())<=20 or not isinstance(adopted,bool) or personality not in ('gentle','curious','sunny'):
        fail(400,'请检查小动物名字与性格')
    from pet_studio import appearance
    return {'name':name.strip(),'adopted':adopted,'personality':personality,'appearance':appearance(value.get('appearance',{}))}


def get(h,db,me):
    if h.route!='/api/account/export':
        return False
    uid=me['id']
    state=db.execute('SELECT payload FROM cloud_state WHERE user_id=?',(uid,)).fetchone()
    friends=[dict(row) for row in db.execute('SELECT u.nickname,u.code FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=?',(uid,uid,uid))]
    messages=[dict(row) for row in db.execute('''SELECT id,sender,target,kind,text,created,read_at,activity_id FROM messages m
      WHERE (sender=? OR target=?) AND NOT EXISTS(SELECT 1 FROM message_hides h WHERE h.owner=? AND h.message=m.id) ORDER BY id''',(uid,uid,uid))]
    notes=[dict(row) for row in db.execute('SELECT a.title,a.when_text,a.starts_at,m.text,m.shared FROM memories m JOIN activities a ON a.id=m.activity WHERE m.owner=?',(uid,))]
    archives=[json.loads(row['payload']) for row in db.execute('SELECT payload FROM pet_archives WHERE owner=?',(uid,))]
    h.reply(200,{'app':'suixin-account-export','version':1,'exportedAt':int(time.time()),'profile':{key:me[key] for key in ('id','username','nickname','code')},'privateRecords':json.loads(state['payload']) if state else None,'friends':friends,'messages':messages,'mySharedMemories':notes,'myArchives':archives})
    return True


def post(h,db,me,data):
    uid=me['id']
    if h.route=='/api/messages/hide':
        id=data.get('messageId')
        if not isinstance(id,int) or isinstance(id,bool):
            fail(400,'消息编号不正确')
        row=db.execute('SELECT id FROM messages WHERE id=? AND (sender=? OR target=?)',(id,uid,uid)).fetchone()
        if not row:
            fail(404,'消息不存在')
        db.execute('INSERT OR IGNORE INTO message_hides VALUES (?,?)',(uid,id))
        h.reply(200,{'ok':True})
        return True
    if not h.route.startswith('/api/activities/'):
        return False
    parts=h.route.split('/')
    if len(parts)!=5 or parts[4] not in ('reminder','reminder-fire'):
        return False
    id=parts[3];row,other=participant(h,db,uid,id)
    if parts[4]=='reminder':
        enabled=data.get('enabled');lead=data.get('lead',0)
        if not isinstance(enabled,bool) or not isinstance(lead,int) or isinstance(lead,bool) or lead not in (0,5,15,60):
            fail(400,'提醒设置不正确')
        if enabled and (row['status']!='accepted' or not row['starts_at']):
            fail(409,'双方确认了具体时间后，才能开启提醒')
        db.execute('INSERT INTO reminders(owner,activity,enabled,lead) VALUES (?,?,?,?) ON CONFLICT(owner,activity) DO UPDATE SET enabled=excluded.enabled,lead=excluded.lead,fired_at=NULL',(uid,id,int(enabled),lead))
        h.reply(200,{'ok':True})
    else:
        reminder=db.execute('SELECT * FROM reminders WHERE owner=? AND activity=?',(uid,id)).fetchone()
        now=int(time.time());fired=False
        if reminder and reminder['enabled'] and reminder['fired_at'] is None and row['status']=='accepted' and row['starts_at'] and row['starts_at']-reminder['lead']*60<=now<=row['starts_at']+1800:
            fired=db.execute('UPDATE reminders SET fired_at=? WHERE owner=? AND activity=? AND fired_at IS NULL',(now,uid,id)).rowcount==1
        h.reply(200,{'fired':fired})
    return True
