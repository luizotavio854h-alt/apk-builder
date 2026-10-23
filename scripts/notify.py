#!/usr/bin/env python3
import os,json,urllib.request,urllib.error,urllib.parse
TOKEN=os.environ.get('DISCORD_BOT_TOKEN',''); CHANNEL=os.environ.get('CHANNEL_ID','')
def request(url,payload,method='POST',auth=None):
 data=json.dumps(payload,ensure_ascii=False).encode()
 headers={'Content-Type':'application/json'}
 if auth: headers['Authorization']=auth
 req=urllib.request.Request(url,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=25) as res: return res.read().decode()
 except Exception as e:print('Notification error:',str(e));return ''
status=os.environ.get('BUILD_RESULT','failure');run=os.environ.get('RUN_URL',''); link=os.environ.get('ARTIFACT_URL','')
if TOKEN and CHANNEL.isdigit():
 if status=='success':
  title='✅ APK compilado com sucesso';desc=f'📦 **APK (artefato GitHub):** {link}\n\n⚠️ O download exige acesso ao repositório GitHub.\n🔎 [Logs do build]({run})'
 else:
  title='❌ Falha na compilação';desc=f'Consulte os logs e o artefato de diagnóstico:\n[GitHub Actions]({run})'
 payload={'embeds':[{'title':title,'description':desc[:4000],'color':3066993 if status=='success' else 15158332}]}
 request('https://discord.com/api/v10/channels/'+CHANNEL+'/messages',payload,auth='Bot '+TOKEN)
callback=os.environ.get('WORKER_URL','').rstrip('/')
secret=os.environ.get('CALLBACK_SECRET','')
user=os.environ.get('USER_ID','')
if callback and secret and user:
 parsed=urllib.parse.urlparse(callback)
 if parsed.scheme!='https': print('Skipping non-HTTPS callback')
 else:
  request(callback+'/build-callback',{'user_id':user,'status':status,'artifact_url':link,'run_url':run},auth='Bearer '+secret)
