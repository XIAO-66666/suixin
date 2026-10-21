"""Private photo-to-pet generation. Original photographs are never persisted."""
import base64
import json
import os
import re
import secrets
import time
import urllib.request
from features import fail

KINDS = ('hoodie', 'glasses', 'cat', 'dog', 'rabbit', 'redpanda')

def install(db):
    db.execute('CREATE TABLE IF NOT EXISTS pet_images(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id) ON DELETE CASCADE,data BLOB NOT NULL,created INTEGER NOT NULL)')
    columns={r['name'] for r in db.execute('PRAGMA table_info(pets)')}
    for name,default in [('appearance','{}'),('pending_appearance',''),('appearance_proposer','')]:
        if name not in columns:
            db.execute(f"ALTER TABLE pets ADD COLUMN {name} TEXT NOT NULL DEFAULT '{default}'")

def appearance(value):
    if not isinstance(value,dict): fail(400,'小动物形象格式不正确')
    kind=value.get('kind','hoodie')
    image=value.get('imageId','')
    if kind not in (*KINDS,'custom') or not isinstance(image,str) or (image and not re.fullmatch('[a-f0-9]{32}',image)) or (kind=='custom' and not image):
        fail(400,'请选择有效的小动物形象')
    return {'kind':kind,'imageId':image if kind=='custom' else ''}

def owned(db,uid,look):
    if look['kind']=='custom' and not db.execute('SELECT 1 FROM pet_images WHERE id=? AND owner=?',(look['imageId'],uid)).fetchone():
        fail(403,'请使用自己生成的形象')

def configured():
    return bool(os.environ.get('OPENAI_API_KEY','').strip())

def generate(photo,kind):
    prompt='Transform the person in the reference photo into one full-body HUMAN chibi character, exactly three heads tall: oversized head and small human body. Preserve recognizable hairstyle, hair color, glasses if present, visible facial characteristics, complexion, expression, clothing colors, outfit and accessories. Warm refined soft 3D storybook illustration with matte collectible-figure texture, friendly expressive face, natural human hands, human shoes. Retain the outfit visible in the reference; where not visible use simple matching clothing. One fully clothed person only, entire hair and shoes visible, standing relaxed, centered with generous margin, genuine transparent background, no text, watermark, animal ears, tails or animal features. Do not infer sensitive traits or identity.'
    payload={'model':os.environ.get('SUIXIN_IMAGE_MODEL','gpt-image-2'),'images':[{'image_url':photo}],'prompt':prompt,'n':1,'size':'1024x1024','quality':'medium','background':'transparent','output_format':'png'}
    request=urllib.request.Request('https://api.openai.com/v1/images/edits',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+os.environ['OPENAI_API_KEY'],'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=180) as response:
        raw=response.read(12_000_001)
    if len(raw)>12_000_000: raise ValueError('Oversized result')
    return base64.b64decode(json.loads(raw)['data'][0]['b64_json'],validate=True)

def handle(h,db,post,data):
    """Runs outside the main write transaction so generation never locks the DB."""
    route=h.route
    if route=='/api/pet-generation/config' and not post:
        h.reply(200,{'configured':configured()});return
    me=h.user(db);uid=me['id']
    if route.startswith('/api/pet-images/') and not post:
        image=route.rsplit('/',1)[-1]
        row=db.execute('SELECT * FROM pet_images WHERE id=?',(image,)).fetchone()
        allowed=row and row['owner']==uid
        if row and not allowed:
            for pet in db.execute('SELECT appearance,pending_appearance FROM pets WHERE a=? OR b=?',(uid,uid)):
                if any(json.loads(pet[k] or '{}').get('imageId')==image for k in ('appearance','pending_appearance')): allowed=True
        if not allowed: fail(404,'形象不存在或无权查看')
        h.send_response(200);h.send_header('Content-Type','image/png');h.send_header('Content-Length',str(len(row['data'])));h.send_header('Cache-Control','no-store');h.send_header('X-Content-Type-Options','nosniff');h.end_headers();h.wfile.write(row['data']);return
    if route!='/api/pet-generation' or not post: fail(404,'没有找到这个入口')
    if not configured() and not getattr(h.server,'pet_generator',None): fail(503,'运营方尚未配置图像服务，请先选择示例小人物')
    if data.get('consent') is not True: fail(400,'请先同意将照片用于这一次转绘')
    kind=data.get('kind');photo=data.get('photo')
    if kind not in KINDS or not isinstance(photo,str) or not photo.startswith(('data:image/jpeg;base64,','data:image/png;base64,')): fail(400,'请上传 JPG 或 PNG 照片')
    try:
        raw=base64.b64decode(photo.split(',',1)[1],validate=True)
        if len(raw)>1_500_000 or not (raw.startswith(b'\xff\xd8\xff') or raw.startswith(b'\x89PNG\r\n\x1a\n')): raise ValueError()
    except ValueError: fail(400,'照片无效或过大，请重新选择')
    h.server.throttle(('pet-generation',uid),3,3600)
    if not h.server.pet_slots.acquire(blocking=False): fail(429,'正在为其他朋友制作，请稍后再试')
    try:
        try: result=(getattr(h.server,'pet_generator',None) or generate)(photo,kind)
        except Exception: fail(502,'这次转绘没有完成，请稍后重试；原来的形象已保留')
        if not isinstance(result,bytes) or not result.startswith(b'\x89PNG\r\n\x1a\n') or len(result)>6_000_000: fail(502,'生成结果无效，请稍后重试')
        image=secrets.token_hex(16)
        with db:
            # Account may have been deleted while the upstream service was working.
            if not db.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone(): fail(401,'请重新登录')
            db.execute('INSERT INTO pet_images VALUES (?,?,?,?)',(image,uid,result,int(time.time())))
        h.reply(201,{'appearance':{'kind':'custom','imageId':image}})
    finally: h.server.pet_slots.release()

def change(h,db,me,data):
    parts=h.route.split('/')
    if len(parts)!=5 or parts[2]!='pets' or parts[4] not in ('appearance','appearance-accept','appearance-decline'): return False
    uid=me['id'];pet=db.execute('SELECT * FROM pets WHERE id=? AND (a=? OR b=?)',(parts[3],uid,uid)).fetchone()
    if not pet or pet['status']!='active': fail(404,'请先完成共同领养')
    action=parts[4]
    if action=='appearance':
        look=appearance(data.get('appearance'));owned(db,uid,look)
        db.execute('UPDATE pets SET pending_appearance=?,appearance_proposer=? WHERE id=?',(json.dumps(look),uid,pet['id']))
    else:
        if not pet['pending_appearance']: fail(409,'这份换装邀请已处理')
        if action=='appearance-accept':
            if pet['appearance_proposer']==uid: fail(403,'需要另一位好友确认')
            db.execute('UPDATE pets SET appearance=pending_appearance WHERE id=?',(pet['id'],))
        db.execute("UPDATE pets SET pending_appearance='',appearance_proposer='' WHERE id=?",(pet['id'],))
    h.reply(200,{'ok':True});return True
