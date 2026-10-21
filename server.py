"""Suixin local/pilot server. Deploy behind HTTPS; see SERVER.md."""
import argparse
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from contextlib import closing
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
import features
import experience
import pet_studio

ROOT = Path(__file__).resolve().parent
PUBLIC_FILES = {'assets/pets/hoodie.webp','assets/pets/glasses.webp'} | {'assets/pets/cat.webp', 'assets/pets/rabbit.webp', 'pet-studio.js', 'assets/pets/redpanda.webp', 'assets/pets/dog.webp'} | {'index.html', 'style.css', 'script.js', 'share.js', 'companion.js',
                'social.js', 'bootstrap.js', 'manifest.json', 'sw.js', 'icon.svg',
                'privacy.html', 'together.js', 'sync.js', 'daily.js', 'open-pet.html', 'icons/icon-192.png', 'icons/icon-512.png'}
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
         '.css': 'text/css; charset=utf-8', '.json': 'application/json',
         '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml'}


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class Store:
    def __init__(self, filename):
        self.filename = str(filename)
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db, db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                  nickname TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL,
                  code TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  expires INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS requests (
                  id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id),
                  target TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending',
                  created INTEGER NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS pending_request ON requests(sender,target) WHERE status='pending';
                CREATE TABLE IF NOT EXISTS friends (
                  a TEXT NOT NULL REFERENCES users(id), b TEXT NOT NULL REFERENCES users(id),
                  created INTEGER NOT NULL, PRIMARY KEY(a,b), CHECK(a<b));
                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL REFERENCES users(id),
                  target TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
                  text TEXT NOT NULL, client_id TEXT NOT NULL, created INTEGER NOT NULL,
                  read_at INTEGER, UNIQUE(sender,client_id));
                CREATE INDEX IF NOT EXISTS conversation ON messages(sender,target,id);
                CREATE INDEX IF NOT EXISTS inbox ON messages(target,read_at,id);
            ''')

            features.install(db)
            experience.install(db)
            pet_studio.install(db)

    def connect(self):
        db = sqlite3.connect(self.filename, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def public_user(row):
    return {**{key: row[key] for key in ('id', 'username', 'nickname', 'code')}, 'recoveryReady':bool(row['recovery_hash']), 'allowRequests':bool(row['allow_requests'])}


class SuixinServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, dbfile, public_origin=''):
        super().__init__(address, Handler)
        self.store = Store(dbfile)
        self.public_origin = public_origin.rstrip('/')
        self.secure = self.public_origin.startswith('https://')
        self.attempts = defaultdict(deque)
        self.attempt_lock = threading.Lock()
        self.pet_slots = threading.BoundedSemaphore(2)

    def throttle(self, key, limit, seconds=600):
        now = time.monotonic()
        with self.attempt_lock:
            hits = self.attempts[key]
            while hits and hits[0] < now - seconds:
                hits.popleft()
            if len(hits) >= limit:
                raise APIError(429, '操作有点频繁，请稍后再试')
            hits.append(now)
            # Discard expired buckets so arbitrary usernames cannot accumulate forever.
            if len(self.attempts) > 2000:
                stale = [k for k,v in self.attempts.items() if not v or v[-1] < now - 900]
                for k in stale:
                    self.attempts.pop(k, None)


class Handler(BaseHTTPRequestHandler):
    server_version = 'Suixin'

    def log_message(self, fmt, *args):
        # Do not log request bodies, credentials, cookies, friend codes or query strings.
        logging.info('%s %s', self.command, getattr(self, 'route', '').split('?')[0])

    def origin(self):
        return self.server.public_origin or f'http://{self.headers.get("Host", "")}'

    def validate_host(self):
        host = self.headers.get('Host', '')
        if self.server.public_origin:
            allowed = {urlsplit(self.server.public_origin).netloc}
        else:
            port = self.server.server_port
            allowed = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if host not in allowed:
            raise APIError(403, '访问地址不匹配，请使用配置的网站地址')

    def reply(self, status, data, cookie=None):
        if getattr(self, 'defer_response', False):
            self.pending_response = (status, data, cookie)
            return
        content = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(content)

    def body(self):
        if self.headers.get('X-Suixin-Request') != '1' or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise APIError(403, '请求来源不正确')
        if self.headers.get('Origin') and self.headers['Origin'] != self.origin():
            raise APIError(403, '请求来源不正确')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            raise APIError(403, '请求来源不正确')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= (2100000 if self.route=='/api/pet-generation' else 524288 if self.route=='/api/state' else 8192):
                raise ValueError()
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, UnicodeError):
            raise APIError(400, '提交的内容不正确或过长')

    def text(self, data, key, maximum, minimum=1):
        value = data.get(key)
        if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
            raise APIError(400, '请检查填写内容的长度')
        return value.strip()

    def token(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            raw = cookie.get('suixin_session')
            return hashlib.sha256(raw.value.encode()).hexdigest() if raw else ''
        except Exception:
            return ''

    def user(self, db, required=True):
        row = db.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?',
                         (self.token(), int(time.time()))).fetchone()
        if row and self.headers.get('X-Suixin-Account') and self.headers['X-Suixin-Account']!=row['id']:
            raise APIError(401, '账号已在其他窗口切换，请刷新后继续')
        if not row and required:
            raise APIError(401, '请先登录，或重新登录后继续')
        return row

    def session(self, db, user):
        raw = secrets.token_urlsafe(32)
        now = int(time.time())
        db.execute('DELETE FROM sessions WHERE expires<=?', (now,))
        db.execute('DELETE FROM sessions WHERE token=?', (self.token(),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(raw.encode()).hexdigest(), user['id'], now + 7*86400))
        return f'suixin_session={raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' + ('; Secure' if self.server.secure else '')

    def require_friend(self, db, me, other):
        if features.blocked(db,me,other):
            raise APIError(403, "当前不能与这位用户互动")
        a,b = sorted((me,other))
        if not db.execute('SELECT 1 FROM friends WHERE a=? AND b=?', (a,b)).fetchone():
            raise APIError(403, '成为好友后才能发送或查看消息')

    def do_GET(self):
        self.handle_request(False)

    def do_POST(self):
        self.handle_request(True)

    def handle_request(self, post):
        self.route = urlsplit(self.path).path
        try:
            self.validate_host()
            if self.route.startswith('/api/'):
                db = self.server.store.connect()
                try:
                    parsed_body=self.body() if post else None
                    if self.route.startswith(('/api/pet-generation','/api/pet-images/')):
                        pet_studio.handle(self,db,post,parsed_body)
                        return
                    self.defer_response = True
                    with db:
                        if post: db.execute('BEGIN IMMEDIATE')
                        if post:
                            self.api_post(db, parsed_body)
                        else:
                            self.api_get(db)
                    self.defer_response = False
                    self.reply(*self.pending_response)
                finally:
                    self.defer_response = False
                    db.close()
            elif not post:
                self.static()
            else:
                raise APIError(404, '没有找到这个入口')
        except (APIError,features.FeatureError) as error:
            self.reply(error.status, {'error':error.message})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            logging.exception('Server operation failed')
            self.reply(500, {'error':'服务暂时有点忙，请稍后再试'})

    def api_get(self, db):
        if self.route == '/api/me':
            me = self.user(db, False)
            return self.reply(200, {'user':public_user(me) if me else None})
        me = self.user(db)
        uid = me['id']
        if experience.get(self,db,me): return
        if features.get(self,db,me): return
        if self.route == '/api/social':
            friends = db.execute('''SELECT u.id,u.nickname,u.code FROM friends f JOIN users u
                ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=? ORDER BY u.nickname''', (uid,uid,uid)).fetchall()
            result=[]
            for friend in friends:
                entry=dict(friend)
                entry['muted']=bool(db.execute('SELECT 1 FROM mutes WHERE owner=? AND target=?',(uid,friend['id'])).fetchone())
                entry['unread']=db.execute('SELECT count(*) FROM messages m WHERE sender=? AND target=? AND read_at IS NULL AND NOT EXISTS(SELECT 1 FROM message_hides h WHERE h.owner=? AND h.message=m.id)',(friend['id'],uid,uid)).fetchone()[0]
                last=db.execute('SELECT kind,text,created FROM messages m WHERE ((sender=? AND target=?) OR (sender=? AND target=?)) AND NOT EXISTS(SELECT 1 FROM message_hides h WHERE h.owner=? AND h.message=m.id) ORDER BY id DESC LIMIT 1',(uid,friend['id'],friend['id'],uid,uid)).fetchone()
                entry['last']=dict(last) if last else None
                result.append(entry)
            requests=db.execute('''SELECT r.id,r.sender,r.target,r.created,u.nickname,u.code FROM requests r JOIN users u
                ON u.id=CASE WHEN r.sender=? THEN r.target ELSE r.sender END
                WHERE (r.sender=? OR r.target=?) AND r.status='pending' ORDER BY r.created DESC''',(uid,uid,uid)).fetchall()
            return self.reply(200, {'user':public_user(me),'friends':result,'requests':[dict(row) for row in requests]})
        if self.route == '/api/messages':
            query=parse_qs(urlsplit(self.path).query)
            other=query.get('friend',[''])[0]
            self.require_friend(db,uid,other)
            try:
                before=int(query.get('before',['9223372036854775807'])[0])
            except ValueError:
                raise APIError(400,'消息页码不正确')
            rows=db.execute('''SELECT id,sender,target,kind,text,created,read_at,activity_id FROM messages m
                WHERE ((sender=? AND target=?) OR (sender=? AND target=?)) AND id<? AND NOT EXISTS(SELECT 1 FROM message_hides h WHERE h.owner=? AND h.message=m.id) ORDER BY id DESC LIMIT 41''',(uid,other,other,uid,before,uid)).fetchall()
            hidden=[row['message'] for row in db.execute('''SELECT h.message FROM message_hides h JOIN messages m ON m.id=h.message
                WHERE h.owner=? AND ((m.sender=? AND m.target=?) OR (m.sender=? AND m.target=?))''',(uid,uid,other,other,uid))]
            return self.reply(200, {'messages':[dict(row) for row in reversed(rows[:40])], 'hasMore':len(rows)>40,'hiddenIds':hidden})
        raise APIError(404,'没有找到这个入口')

    def api_post(self, db, data):
        now=int(time.time())
        ip=self.client_address[0]
        if self.route.startswith('/api/pets/') and pet_studio.change(self,db,self.user(db),data): return
        if features.public_post(self,db,data): return
        if self.route in ('/api/register','/api/login'):
            self.server.throttle(('auth-ip',ip),40,900)
            username=self.text(data,'username',24,3).lower()
            if not re.fullmatch(r'[a-z0-9_]{3,24}',username):
                raise APIError(400,'用户名请用 3–24 位英文字母、数字或下划线')
            password=data.get('password')
            if not isinstance(password,str) or not 10 <= len(password) <= 128:
                raise APIError(400,'密码请使用 10–128 位字符')
            self.server.throttle(('auth-name',username),15,900)
            if self.route == '/api/register':
                self.server.throttle(('register',ip),10,3600)
                nickname=self.text(data,'nickname',20)
                salt=secrets.token_hex(16)
                try:
                    db.execute('INSERT INTO users(id,username,nickname,salt,password,code,created) VALUES (?,?,?,?,?,?,?)', (secrets.token_hex(16),username,nickname,salt,password_hash(password,salt),secrets.token_hex(5).upper(),now))
                except sqlite3.IntegrityError:
                    raise APIError(409,'这个用户名已被使用，换一个试试')
                row=db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
            else:
                row=db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
                salt=row['salt'] if row else '00'*16
                candidate=password_hash(password,salt)
                if not row or not hmac.compare_digest(candidate,row['password']):
                    raise APIError(401,'用户名或密码不正确')
            recovery=features.new_recovery(db,row['id']) if self.route=='/api/register' else None
            return self.reply(200,{'user':public_user(db.execute('SELECT * FROM users WHERE id=?',(row['id'],)).fetchone()),**({'recoveryCode':recovery} if recovery else {})},self.session(db,row))
        if self.route == '/api/logout':
            db.execute('DELETE FROM sessions WHERE token=?',(self.token(),))
            return self.reply(200,{'ok':True},'suixin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + ('; Secure' if self.server.secure else ''))
        me=self.user(db)
        uid=me['id']
        if experience.post(self,db,me,data): return
        if features.post(self,db,me,data): return
        if self.route == '/api/friend-requests':
            self.server.throttle(('friend',uid),15,3600)
            code=self.text(data,'code',10,10).upper()
            target=db.execute('SELECT id FROM users WHERE code=?',(code,)).fetchone()
            if not target:
                raise APIError(404,'没有找到这个好友码，请核对后重试')
            other=target['id']
            if features.blocked(db,uid,other) or not db.execute('SELECT allow_requests FROM users WHERE id=?',(other,)).fetchone()[0]:
                raise APIError(403,'对方暂时不接受好友申请')
            if other == uid:
                raise APIError(400,'这个好友码是你自己的哦')
            a,b=sorted((uid,other))
            if db.execute('SELECT 1 FROM friends WHERE a=? AND b=?',(a,b)).fetchone():
                raise APIError(409,'你们已经是好友了')
            if db.execute("SELECT 1 FROM requests WHERE sender=? AND target=? AND status='pending'",(other,uid)).fetchone():
                raise APIError(409,'对方已经向你发出申请，在好友申请中接受即可')
            try:
                db.execute('INSERT INTO requests(id,sender,target,created) VALUES (?,?,?,?)',(secrets.token_hex(16),uid,other,now))
            except sqlite3.IntegrityError:
                raise APIError(409,'好友申请已发送，等对方确认吧')
            return self.reply(201,{'ok':True})
        match=re.fullmatch(r'/api/friend-requests/([a-f0-9]{32})/respond',self.route)
        if match:
            if not isinstance(data.get('accept'),bool):
                raise APIError(400,'请选择接受或忽略')
            request=db.execute("SELECT * FROM requests WHERE id=? AND target=? AND status='pending'",(match[1],uid)).fetchone()
            if not request:
                raise APIError(404,'这条好友申请已处理或不存在')
            if data['accept']:
                if features.blocked(db,uid,request['sender']): raise APIError(403,'当前不能与这位用户互动')
                a,b=sorted((uid,request['sender']))
                db.execute('INSERT OR IGNORE INTO friends VALUES (?,?,?)',(a,b,now))
            db.execute('UPDATE requests SET status=? WHERE id=?',('accepted' if data['accept'] else 'declined',match[1]))
            return self.reply(200,{'ok':True})
        if self.route == '/api/friends/remove':
            other=self.text(data,'friendId',32,32)
            a,b=sorted((uid,other))
            features.archive_pair(db,uid,other)
            db.execute('DELETE FROM friends WHERE a=? AND b=?',(a,b))
            return self.reply(200,{'ok':True})
        if self.route == '/api/messages':
            other=self.text(data,'friendId',32,32)
            self.require_friend(db,uid,other)
            kind=data.get('kind')
            if kind not in ('text','card'):
                raise APIError(400,'消息类型不正确')
            text=self.text(data,'text',120 if kind=='card' else 500)
            client_id=self.text(data,'clientId',100)
            old=db.execute('SELECT id,target,kind,text FROM messages WHERE sender=? AND client_id=?',(uid,client_id)).fetchone()
            if old:
                if old['target']!=other or old['kind']!=kind or old['text']!=text:
                    raise APIError(409,'这条消息已发送，请刷新后重试')
                return self.reply(200,{'id':old['id']})
            self.server.throttle(('send',uid),40,60)
            cursor=db.execute('INSERT INTO messages(sender,target,kind,text,client_id,created) VALUES (?,?,?,?,?,?)',(uid,other,kind,text,client_id,now))
            return self.reply(201,{'id':cursor.lastrowid})
        if self.route == '/api/messages/read':
            other=self.text(data,'friendId',32,32)
            self.require_friend(db,uid,other)
            through=data.get('through')
            if not isinstance(through,int) or isinstance(through,bool) or through<0:
                raise APIError(400,'消息序号不正确')
            db.execute('UPDATE messages SET read_at=? WHERE sender=? AND target=? AND id<=? AND read_at IS NULL',(now,other,uid,through))
            return self.reply(200,{'ok':True})
        raise APIError(404,'没有找到这个入口')

    def static(self):
        name='index.html' if self.route=='/' else self.route.lstrip('/')
        if name not in PUBLIC_FILES or not (ROOT/name).is_file():
            raise APIError(404,'页面不存在')
        content=(ROOT/name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',TYPES.get(Path(name).suffix,'application/octet-stream'))
        self.send_header('Content-Length',str(len(content)))
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('X-Frame-Options','DENY')
        self.end_headers()
        self.wfile.write(content)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8082)
    parser.add_argument('--db',default=str(ROOT/'data'/'suixin.sqlite3'))
    parser.add_argument('--reports',action='store_true',help='Review pending reports on the operator console')
    parser.add_argument('--resolve-report',default='',help='Mark one report resolved after review')
    args=parser.parse_args()
    if args.reports or args.resolve_report:
        store=Store(args.db)
        with closing(store.connect()) as db, db:
            if args.resolve_report:
                db.execute("UPDATE reports SET status='resolved' WHERE id=?",(args.resolve_report,))
            else:
                for row in db.execute("SELECT * FROM reports WHERE status='pending' ORDER BY created"):
                    print(json.dumps(dict(row),ensure_ascii=False))
        raise SystemExit(0)
    origin=os.environ.get('SUIXIN_PUBLIC_ORIGIN','').rstrip('/')
    if origin and (urlsplit(origin).scheme not in ('http','https') or not urlsplit(origin).netloc or urlsplit(origin).path):
        parser.error('SUIXIN_PUBLIC_ORIGIN must be an origin such as https://example.com')
    if args.host not in ('127.0.0.1','localhost') and not origin.startswith('https://'):
        parser.error('Network access requires SUIXIN_PUBLIC_ORIGIN=https://your-domain and an HTTPS reverse proxy')
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    app=SuixinServer((args.host,args.port),args.db,origin)
    print(f'Suixin: http://{args.host}:{app.server_port}',flush=True)
    try:
        app.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.server_close()
