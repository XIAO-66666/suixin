"""Run with python -m unittest test_server -v. All accounts live in a temporary DB."""
import http.cookiejar
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import closing

from server import SuixinServer


class Client:
    def __init__(self, origin):
        self.origin=origin
        self.cookies=http.cookiejar.CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def call(self, route, body=None, **headers):
        if body is not None:
            headers={'Content-Type':'application/json','X-Suixin-Request':'1','Origin':self.origin,**headers}
        request=urllib.request.Request(self.origin+route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with self.opener.open(request) as response:
                return response.status,json.loads(response.read())
        except urllib.error.HTTPError as response:
            return response.code,json.loads(response.read())

    def register(self, name):
        status,result=self.call('/api/register',{'username':name,'nickname':name+'昵称','password':'test-password-123!'})
        assert status==200,(status,result)
        return result['user']


class SocialAPI(unittest.TestCase):
    def test_public_health_check_does_not_expose_account_data(self):
        self.assertEqual(self.a.call('/api/health'),(200,{'ok':True}))

    def test_pet_studio_private_media_and_shared_approval(self):
        import base64
        a,b=self.connect_friends();c=self.c.register('carol')
        self.assertEqual(self.a.call('/api/pet-generation',{'consent':True})[0],503)
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=')
        self.app.pet_generator=lambda photo,kind:png
        photo='data:image/png;base64,'+base64.b64encode(png).decode()
        self.assertEqual(self.a.call('/api/pet-generation',{'photo':photo,'kind':'cat','consent':False})[0],400)
        status,result=self.a.call('/api/pet-generation',{'photo':photo,'kind':'glasses','consent':True})
        self.assertEqual(status,201);look=result['appearance'];path='/api/pet-images/'+look['imageId']
        self.assertEqual(self.b.call(path)[0],404)
        with self.a.opener.open(self.origin+path) as response:
            self.assertEqual(response.read(),png);self.assertEqual(response.headers['Cache-Control'],'no-store')
        self.assertEqual(self.a.call('/api/pets',{'friendId':b['id'],'name':'专属小兔'})[0],201)
        pet=self.a.call('/api/together')[1]['pets'][0]['id']
        self.assertEqual(self.b.call('/api/pets/'+pet+'/accept',{})[0],200)
        self.assertEqual(self.a.call('/api/pets/'+pet+'/appearance',{'appearance':look})[0],200)
        self.assertEqual(self.a.call('/api/pets/'+pet+'/appearance-accept',{})[0],403)
        with self.b.opener.open(self.origin+path) as response:self.assertEqual(response.read(),png)
        self.assertEqual(self.c.call(path)[0],404)
        self.assertEqual(self.b.call('/api/pets/'+pet+'/appearance-accept',{})[0],200)
        saved=self.a.call('/api/together')[1]['pets'][0]
        self.assertEqual(json.loads(saved['appearance']),look);self.assertEqual(saved['growth'],0)
        snapshot={'tasks':[],'history':[],'soloPet':{'name':'兔兔','adopted':True,'personality':'gentle','appearance':look}}
        self.assertEqual(self.b.call('/api/state',{'revision':0,'snapshot':snapshot})[0],403)
        self.assertEqual(self.a.call('/api/state',{'revision':0,'snapshot':snapshot})[0],200)
        self.assertEqual(self.a.call('/api/state')[1]['snapshot']['soloPet']['appearance'],look)
        self.assertEqual(self.a.call('/api/pets/'+pet+'/end',{})[0],200)
        self.assertEqual(self.b.call(path)[0],404)

    def setUp(self):
        self.folder=tempfile.TemporaryDirectory(prefix='suixin-test-')
        self.db=Path(self.folder.name)/'test.sqlite3'
        self.app=SuixinServer(('127.0.0.1',0),self.db)
        self.thread=threading.Thread(target=self.app.serve_forever,daemon=True)
        self.thread.start()
        self.origin=f'http://127.0.0.1:{self.app.server_port}'
        self.a,self.b,self.c=[Client(self.origin) for _ in range(3)]

    def tearDown(self):
        self.app.shutdown();self.app.server_close();self.thread.join()
        # TemporaryDirectory owns this exact path under the OS temp directory.
        resolved=Path(self.folder.name).resolve()
        self.assertTrue(resolved.name.startswith('suixin-test-'))
        self.assertEqual(resolved.parent,Path(tempfile.gettempdir()).resolve())
        self.folder.cleanup()

    def connect_friends(self):
        a=self.a.register('alice');b=self.b.register('bob')
        self.assertEqual(self.a.call('/api/friend-requests',{'code':b['code']})[0],201)
        request=self.b.call('/api/social')[1]['requests'][0]
        self.assertEqual(self.b.call('/api/friend-requests/'+request['id']+'/respond',{'accept':True})[0],200)
        return a,b

    def test_registration_session_and_logout(self):
        self.assertIsNone(self.a.call('/api/me')[1]['user'])
        user=self.a.register('alice')
        self.assertEqual(self.a.call('/api/me')[1]['user']['id'],user['id'])
        self.assertNotIn('password',user)
        cookie=next(iter(self.a.cookies))
        self.assertTrue(cookie.has_nonstandard_attr('HttpOnly'))
        self.assertEqual(cookie.get_nonstandard_attr('SameSite'),'Lax')
        with closing(sqlite3.connect(self.db)) as db:
            hashed=db.execute('SELECT password FROM users').fetchone()[0]
            token=db.execute('SELECT token FROM sessions').fetchone()[0]
        self.assertNotEqual(hashed,'test-password-123!')
        self.assertNotEqual(token,cookie.value)
        self.assertEqual(self.b.call('/api/login',{'username':'alice','password':'wrong-password'})[0],401)
        self.assertEqual(self.b.call('/api/login',{'username':'alice','password':'test-password-123!'})[0],200)
        self.assertEqual(self.a.call('/api/logout',{})[0],200)
        self.assertEqual(self.a.call('/api/social')[0],401)
        self.assertEqual(self.b.call('/api/social')[0],200)

    def test_request_requires_recipient_consent(self):
        a=self.a.register('alice');b=self.b.register('bob');self.c.register('carol')
        self.assertEqual(self.a.call('/api/friend-requests',{'code':a['code']})[0],400)
        self.assertEqual(self.a.call('/api/friend-requests',{'code':b['code']})[0],201)
        self.assertEqual(self.a.call('/api/friend-requests',{'code':b['code']})[0],409)
        self.assertEqual(self.b.call('/api/friend-requests',{'code':a['code']})[0],409)
        request=self.b.call('/api/social')[1]['requests'][0]
        route='/api/friend-requests/'+request['id']+'/respond'
        self.assertEqual(self.c.call(route,{'accept':True})[0],404)
        self.assertEqual(self.a.call(route,{'accept':True})[0],404)
        self.assertEqual(self.a.call('/api/messages',{'friendId':b['id'],'text':'hello','kind':'text','clientId':'before-consent'})[0],403)
        self.assertEqual(self.b.call(route,{'accept':False})[0],200)
        self.assertEqual(self.a.call('/api/social')[1]['friends'],[])
        self.assertEqual(self.a.call('/api/friend-requests',{'code':b['code']})[0],201)

    def test_cards_unread_read_reply_and_permissions(self):
        a,b=self.connect_friends();c=self.c.register('carol')
        body={'friendId':b['id'],'kind':'card','text':'一起散步 🌷','clientId':'test-card-1'}
        status,sent=self.a.call('/api/messages',body);self.assertEqual(status,201)
        self.assertEqual(self.a.call('/api/messages',body)[1]['id'],sent['id'])
        self.assertEqual(self.b.call('/api/social')[1]['friends'][0]['unread'],1)
        self.assertEqual(self.c.call('/api/messages?friend='+a['id'])[0],403)
        self.assertEqual(self.c.call('/api/messages/read',{'friendId':a['id'],'through':sent['id']})[0],403)
        received=self.b.call('/api/messages?friend='+a['id'])[1]['messages']
        self.assertEqual(len(received),1);self.assertEqual(received[0]['text'],body['text'])
        self.assertEqual(self.b.call('/api/messages/read',{'friendId':a['id'],'through':sent['id']})[0],200)
        self.assertEqual(self.b.call('/api/social')[1]['friends'][0]['unread'],0)
        reply={'friendId':a['id'],'kind':'text','text':'好呀，周末见','clientId':'test-reply'}
        self.assertEqual(self.b.call('/api/messages',reply)[0],201)
        self.assertEqual(self.a.call('/api/social')[1]['friends'][0]['unread'],1)
        self.assertEqual(self.a.call('/api/messages',{**body,'friendId':c['id'],'clientId':'outsider'})[0],403)
        self.assertEqual(self.a.call('/api/friends/remove',{'friendId':b['id']})[0],200)
        self.assertEqual(self.b.call('/api/messages?friend='+a['id'])[0],403)

    def test_boundaries_and_static_privacy(self):
        self.a.register('alice')
        self.assertEqual(self.a.call('/api/friend-requests',{'code':'A'*10},Origin='https://attacker.invalid')[0],403)
        self.assertEqual(self.a.call('/api/logout',{},**{'X-Suixin-Request':'0'})[0],403)
        for file in ['/server.py','/data/suixin.sqlite3','/test_server.py','/../server.py']:
            self.assertEqual(self.a.call(file)[0],404)
        self.assertEqual(self.a.call('/api/register',{'username':'bad!','nickname':'bad','password':'long-password'})[0],400)
        self.assertEqual(self.a.call('/api/register',{'username':'short','nickname':'bad','password':'short'})[0],400)

    def test_message_pagination_and_input_limits(self):
        a,b=self.connect_friends()
        # Populate a long history directly; other tests exercise the send endpoint.
        with closing(self.app.store.connect()) as db, db:
            db.executemany('INSERT INTO messages(sender,target,kind,text,client_id,created) VALUES (?,?,?,?,?,?)',[(a['id'],b['id'],'text',str(n),'page-'+str(n),n) for n in range(45)])
        page=self.b.call('/api/messages?friend='+a['id'])[1]
        self.assertTrue(page['hasMore']);self.assertEqual(len(page['messages']),40)
        older=self.b.call('/api/messages?friend='+a['id']+'&before='+str(page['messages'][0]['id']))[1]
        self.assertEqual(len(older['messages']),5);self.assertFalse(older['hasMore'])
        self.assertEqual(self.a.call('/api/messages',{'friendId':b['id'],'kind':'card','text':'x'*121,'clientId':'long-card'})[0],400)
        self.assertEqual(self.b.call('/api/messages/read',{'friendId':a['id'],'through':True})[0],400)

    def activity(self,a,b,mode='direct'):
        status,result=self.a.call('/api/activities',{'friendId':b['id'],'title':'一起散步','category':'outside','mode':mode,'when':'周六','clientId':'activity-'+str(len(self.a.call('/api/together')[1]['activities']))})
        self.assertEqual(status,201)
        return result['id']

    def test_recovery_rotation_password_and_expired_sessions(self):
        _,registered=self.a.call('/api/register',{'username':'alice','nickname':'小随','password':'test-password-123!'})
        code=registered['recoveryCode']
        self.assertEqual(self.b.call('/api/login',{'username':'alice','password':'test-password-123!'})[0],200)
        result=self.a.call('/api/password',{'password':'test-password-123!','newPassword':'new-test-password!'})
        self.assertEqual(result[0],200);self.assertEqual(self.b.call('/api/social')[0],401)
        status,result=self.c.call('/api/recover',{'username':'alice','code':code,'password':'recovered-password!'})
        self.assertEqual(status,200);self.assertNotEqual(result['recoveryCode'],code)
        self.assertEqual(self.a.call('/api/social')[0],401)
        self.assertEqual(self.a.call('/api/recover',{'username':'alice','code':code,'password':'other-password!'})[0],401)
        self.assertEqual(self.c.call('/api/me')[1]['user']['username'],'alice')

    def test_cloud_conflicts_private_scope_and_payload_validation(self):
        a=self.a.register('alice');b=self.b.register('bob')
        snapshot={'tasks':[],'history':[{'id':'one','text':'私人的小事','note':'只给自己看'}],'petMood':80,'petAffection':5}
        self.assertEqual(self.a.call('/api/state',{'revision':0,'snapshot':snapshot})[1]['revision'],1)
        self.assertEqual(self.a.call('/api/state',{'revision':0,'snapshot':snapshot})[0],409)
        self.assertEqual(self.b.call('/api/state')[1]['snapshot'],None)
        self.assertEqual(self.a.call('/api/state',**{'X-Suixin-Account':b['id']})[0],401)
        self.assertEqual(self.a.call('/api/state',{'revision':1,'snapshot':{'tasks':'wrong'}})[0],400)
        self.assertEqual(self.a.call('/api/state')[1]['snapshot']['history'][0]['note'],'只给自己看')

    def test_shared_pet_requires_consent_and_exactly_two_confirmations(self):
        a,b=self.connect_friends();self.c.register('carol')
        self.assertEqual(self.a.call('/api/pets',{'friendId':b['id'],'name':'小团子'})[0],201)
        pet=self.a.call('/api/together')[1]['pets'][0]
        self.assertEqual(self.a.call('/api/pets/'+pet['id']+'/accept',{})[0],409)
        self.assertEqual(self.c.call('/api/pets/'+pet['id']+'/accept',{})[0],404)
        self.assertEqual(self.b.call('/api/pets/'+pet['id']+'/accept',{})[0],200)
        id=self.activity(a,b)
        self.assertEqual(self.a.call('/api/activities/'+id+'/respond',{'choice':'accepted','note':''})[0],409)
        self.assertEqual(self.b.call('/api/activities/'+id+'/respond',{'choice':'accepted','note':''})[0],200)
        for _ in range(2):self.assertEqual(self.a.call('/api/activities/'+id+'/complete',{})[0],200)
        self.assertEqual(self.a.call('/api/together')[1]['pets'][0]['growth'],0)
        for _ in range(2):self.assertEqual(self.b.call('/api/activities/'+id+'/complete',{})[0],200)
        self.assertEqual(self.a.call('/api/together')[1]['pets'][0]['growth'],1)
        self.a.call('/api/activities/'+id+'/memory',{'text':'我的私密回忆','shared':False})
        self.b.call('/api/activities/'+id+'/memory',{'text':'好友的回忆','shared':True})
        bnotes=self.b.call('/api/together')[1]['activities'][0]['memories']
        self.assertEqual(len(bnotes),1);self.assertEqual(bnotes[0]['text'],'好友的回忆')
        self.assertEqual(self.a.call('/api/pets/'+pet['id']+'/end',{})[0],200)
        archive=self.b.call('/api/together')[1]['archives'][0]['payload']
        self.assertEqual(archive['growth'],1)
        self.assertNotIn('我的私密回忆',json.dumps(archive,ensure_ascii=False))
        self.assertIn('好友的回忆',json.dumps(archive,ensure_ascii=False))

    def test_joint_choices_require_two_matching_approvals(self):
        a,b=self.connect_friends();id=self.activity(a,b,'choose');route='/api/activities/'+id+'/'
        self.b.call(route+'respond',{'choice':'accepted','note':''})
        self.a.call(route+'preferences',{'mood':'tired','minutes':5})
        self.assertEqual(self.a.call(route+'select',{'choice':'song'})[0],400)
        self.b.call(route+'preferences',{'mood':'outside','minutes':30})
        options=self.a.call('/api/together')[1]['activities'][0]['suggestions']
        self.assertNotIn('walk',[option['key'] for option in options])
        self.a.call(route+'select',{'choice':'song'});self.b.call(route+'select',{'choice':'tea'})
        self.assertEqual(self.a.call(route+'complete',{})[0],409)
        self.b.call(route+'select',{'choice':'song'})
        activity=self.a.call('/api/together')[1]['activities'][0]
        self.assertEqual(activity['mode'],'direct');self.assertIn('一首歌',activity['title'])

    def test_block_mute_report_privacy_and_delete_account(self):
        a,b=self.connect_friends()
        self.assertEqual(self.a.call('/api/mute',{'friendId':b['id'],'enabled':True})[0],200)
        self.assertTrue(self.a.call('/api/social')[1]['friends'][0]['muted'])
        self.assertEqual(self.a.call('/api/report',{'friendId':b['id'],'reason':'测试问题'})[0],200)
        self.assertEqual(self.a.call('/api/reports')[0],404)
        self.assertEqual(self.a.call('/api/block',{'friendId':b['id'],'enabled':True})[0],200)
        self.assertEqual(self.b.call('/api/friend-requests',{'code':a['code']})[0],403)
        self.assertEqual(self.a.call('/api/settings')[1]['blocks'][0]['id'],b['id'])
        self.a.call('/api/block',{'friendId':b['id'],'enabled':False})
        self.a.call('/api/profile',{'nickname':'新昵称','allowRequests':False})
        self.assertEqual(self.b.call('/api/friend-requests',{'code':a['code']})[0],403)
        self.assertEqual(self.a.call('/api/account/delete',{'password':'test-password-123!','confirm':'alice'})[0],200)
        self.assertIsNone(self.a.call('/api/me')[1]['user'])

    def test_account_deletion_archives_only_surviving_partners_own_memories(self):
        a,b=self.connect_friends();self.a.call('/api/pets',{'friendId':b['id'],'name':'云朵'})
        pet=self.a.call('/api/together')[1]['pets'][0];self.b.call('/api/pets/'+pet['id']+'/accept',{})
        id=self.activity(a,b);route='/api/activities/'+id+'/'
        self.b.call(route+'respond',{'choice':'accepted','note':''});self.a.call(route+'complete',{});self.b.call(route+'complete',{})
        self.a.call(route+'memory',{'text':'删除者的私密文字','shared':False});self.b.call(route+'memory',{'text':'留下我的文字','shared':False})
        self.assertEqual(self.a.call('/api/account/delete',{'password':'test-password-123!','confirm':'alice'})[0],200)
        state=self.b.call('/api/together')[1]
        self.assertEqual(state['activities'],[]);self.assertEqual(state['pets'],[])
        self.assertIn('留下我的文字',json.dumps(state['archives'],ensure_ascii=False));self.assertNotIn('删除者的私密文字',json.dumps(state['archives'],ensure_ascii=False))

    def test_personal_companion_sync_and_legacy_client_preservation(self):
        self.a.register('alice');self.b.register('bob')
        profile={'adopted':True,'name':'棉花','personality':'curious'}
        snapshot={'tasks':[],'history':[],'petMood':70,'petAffection':1,'soloPet':profile}
        self.assertEqual(self.a.call('/api/state',{'revision':0,'snapshot':snapshot})[0],200)
        profile={**profile,'appearance':{'kind':'hoodie','imageId':''}}
        self.assertEqual(self.a.call('/api/state')[1]['snapshot']['soloPet'],profile)
        del snapshot['soloPet']
        self.assertEqual(self.a.call('/api/state',{'revision':1,'snapshot':snapshot})[0],200)
        self.assertEqual(self.a.call('/api/state')[1]['snapshot']['soloPet'],profile,'old clients must not erase pet profiles')
        self.assertIsNone(self.b.call('/api/state')[1]['snapshot'])
        snapshot['soloPet']={**profile,'name':'x'*21}
        self.assertEqual(self.a.call('/api/state',{'revision':2,'snapshot':snapshot})[0],400)

    def test_mutually_confirmed_schedule_and_opt_in_reminder(self):
        import time
        a,b=self.connect_friends();self.c.register('carol')
        start=int(time.time())+30
        status,created=self.a.call('/api/activities',{'friendId':b['id'],'title':'喝杯茶','category':'rest','mode':'direct','when':'晚一点','clientId':'scheduled','startAt':start})
        self.assertEqual(status,201);route='/api/activities/'+created['id']+'/'
        self.assertEqual(self.a.call(route+'reminder',{'enabled':True,'lead':5})[0],409)
        self.b.call(route+'respond',{'choice':'accepted','note':''})
        self.assertEqual(self.a.call(route+'reminder',{'enabled':True,'lead':5})[0],200)
        self.assertTrue(self.a.call(route+'reminder-fire',{})[1]['fired'])
        self.assertFalse(self.a.call(route+'reminder-fire',{})[1]['fired'])
        self.assertFalse(self.b.call(route+'reminder-fire',{})[1]['fired'],'the other user never opted in')
        self.assertEqual(self.c.call(route+'reminder',{'enabled':True,'lead':5})[0],404)
        self.a.call(route+'complete',{})
        self.assertEqual(self.b.call(route+'respond',{'choice':'reschedule','note':'换到明天吧'})[0],200)
        self.assertEqual(self.a.call('/api/together')[1]['activities'][0]['confirmations'],[])
        self.a.call(route+'revise',{'title':'明天喝茶','when':'明天','startAt':int(time.time())+86400})
        activity=self.a.call('/api/together')[1]['activities'][0]
        self.assertEqual(activity['status'],'pending')
        self.assertFalse(self.a.call(route+'reminder-fire',{})[1]['fired'],'revised time requires consent again')

    def test_message_deletion_is_personal_and_export_excludes_secrets(self):
        a,b=self.connect_friends();self.c.register('carol')
        _,message=self.a.call('/api/messages',{'friendId':b['id'],'kind':'text','text':'测试删除','clientId':'delete-message'})
        self.assertEqual(self.c.call('/api/messages/hide',{'messageId':message['id']})[0],404)
        self.assertEqual(self.b.call('/api/messages/hide',{'messageId':message['id']})[0],200)
        self.assertEqual(self.b.call('/api/messages?friend='+a['id'])[1]['messages'],[])
        self.assertIn(message['id'],self.b.call('/api/messages?friend='+a['id'])[1]['hiddenIds'],'other sessions can invalidate their cached message')
        self.assertEqual(self.b.call('/api/social')[1]['friends'][0]['unread'],0)
        self.assertEqual(len(self.a.call('/api/messages?friend='+b['id'])[1]['messages']),1)
        exported=self.b.call('/api/account/export')[1]
        self.assertEqual(exported['messages'],[])
        self.assertNotIn('password',exported['profile']);self.assertNotIn('recovery_hash',exported['profile'])
        self.assertEqual(exported['app'],'suixin-account-export')


if __name__=='__main__':
    unittest.main()
