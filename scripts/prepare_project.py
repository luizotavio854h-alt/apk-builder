#!/usr/bin/env python3
import os,sys,re,zipfile,pathlib,urllib.request,urllib.parse,html,shutil,json
from html.parser import HTMLParser
class Links(HTMLParser):
 def __init__(self): super().__init__(); self.urls=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  for k in ('href','data-href'):
   if a.get(k): self.urls.append(html.unescape(a[k]))
def download(url,out):
 if not url.startswith('https://'): raise ValueError('Only HTTPS URLs are accepted')
 host=urllib.parse.urlparse(url).hostname or ''
 if host.lower() in ('localhost',) or host.endswith('.local'): raise ValueError('Invalid download host')
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 AuroraBuilder/3.0'})
 with urllib.request.urlopen(req,timeout=90) as r:
  if 'mediafire.com' in host and 'text/html' in r.headers.get('Content-Type',''):
   page=r.read(4_000_000).decode('utf-8','replace'); p=Links();p.feed(page)
   candidates=[u for u in p.urls if ('download' in u or 'mediafire' in u) and u.startswith('https://') and u!=url]
   if not candidates: raise ValueError('Could not resolve MediaFire download link')
   return download(candidates[0],out)
  maxsize=600*1024*1024; total=0
  with open(out,'wb') as f:
   while True:
    block=r.read(1024*1024)
    if not block: break
    total+=len(block)
    if total>maxsize: raise ValueError('ZIP exceeds 600 MiB')
    f.write(block)
 return total

def extract(zipname,dest,password):
 with zipfile.ZipFile(zipname) as z:
  members=z.infolist()
  if len(members)>40000: raise ValueError('Too many ZIP entries')
  total=sum(x.file_size for x in members)
  if total>3*1024**3: raise ValueError('Uncompressed project exceeds 3 GiB')
  root=pathlib.Path(dest).resolve(); root.mkdir(parents=True,exist_ok=True)
  for info in members:
   p=(root/info.filename).resolve()
   if not p.is_relative_to(root): raise ValueError('Unsafe ZIP path')
   if ((info.external_attr>>16)&0o170000)==0o120000: raise ValueError('Symlinks not allowed')
   if info.is_dir(): p.mkdir(parents=True,exist_ok=True); continue
   p.parent.mkdir(parents=True,exist_ok=True)
   with z.open(info,pwd=password.encode() if password else None) as src,open(p,'wb') as dst: shutil.copyfileobj(src,dst)

def main():
 url=os.environ['SOURCE_URL'];password=os.environ.get('SOURCE_PASSWORD','')
 os.makedirs('workspace',exist_ok=True)
 print('Downloading source...',flush=True);print('ZIP size:',download(url,'workspace/source.zip'))
 extract('workspace/source.zip','workspace/unpacked',password)
 roots=[]
 for p in pathlib.Path('workspace/unpacked').rglob('*'):
  if p.name in ('settings.gradle','settings.gradle.kts'): roots.append(p.parent)
 if not roots:
  for p in pathlib.Path('workspace/unpacked').rglob('*'):
   if p.name in ('build.gradle','build.gradle.kts'): roots.append(p.parent)
 if not roots: raise ValueError('No Gradle project found in ZIP')
 roots.sort(key=lambda p:(len(p.parts),str(p)))
 root=roots[0].resolve()
 print('Project root:',root)
 with open(os.environ['GITHUB_ENV'],'a') as f: f.write('PROJECT_ROOT='+str(root)+'\n')
 with open('project_root.txt','w') as f: f.write(str(root))
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR:',str(e),file=sys.stderr);sys.exit(1)
