#!/usr/bin/env python3
"""Send built APK to Cloudflare Worker; never expose R2 credentials to build scripts."""
import json,os,pathlib,urllib.parse,urllib.request,urllib.error,sys
worker=os.environ.get('WORKER_URL','').rstrip('/')
secret=os.environ.get('CALLBACK_SECRET','')
user=os.environ.get('USER_ID','')
channel=os.environ.get('CHANNEL_ID','')
if not all([worker,secret,user,channel]):raise SystemExit('Missing WORKER_URL, CALLBACK_SECRET, USER_ID or CHANNEL_ID')
files=sorted(pathlib.Path('output').glob('*.apk'))
if not files:raise SystemExit('No APK to upload')
# Upload first APK only; multi-APK builds require variant selection.
file=files[0];data=file.read_bytes()
if len(data)>2999*1024*1024:raise SystemExit('APK >95 MiB: Worker upload requires a larger-file strategy')
url=worker+'/upload-apk?'+urllib.parse.urlencode({'user_id':user,'channel_id':channel})
req=urllib.request.Request(url,data=data,method='POST',headers={'Authorization':'Bearer '+secret,'Content-Type':'application/vnd.android.package-archive','User-Agent':'AuroraBuildUploader/1.0'})
try:
 with urllib.request.urlopen(req,timeout=180) as r:result=json.load(r)
except urllib.error.HTTPError as e:
 print('Upload failed:',e.code,e.read(500).decode('utf-8','replace'),file=sys.stderr);raise SystemExit(1)
link=result.get('download_url','')
if not link.startswith('https://'):raise SystemExit('Worker did not return a download URL')
with open(os.environ['GITHUB_ENV'],'a') as f:f.write('AURORA_APK_URL='+link+'\n')
# GITHUB_ENV only applies to the current job; persist for notify job as artifact.
pathlib.Path('apk_download_url.txt').write_text(link)
print('APK published to Aurora Worker R2 successfully')
