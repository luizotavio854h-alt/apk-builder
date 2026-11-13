#!/usr/bin/env python3
"""Stream the selected APK to GoFile Guest and persist its public page URL."""
import json, os, pathlib, sys, urllib.error, urllib.request, uuid

files = sorted(p for p in pathlib.Path('output').glob('*.apk') if p.is_file() and p.stat().st_size)
if not files:
    raise SystemExit('Nenhum APK válido encontrado em output/.')
apk = files[0]  # Preserve current behavior: publish first generated variant.
boundary = '----Aurora' + uuid.uuid4().hex
size = apk.stat().st_size
prefix = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{apk.name}"\r\n'
          'Content-Type: application/vnd.android.package-archive\r\n\r\n').encode()
suffix = f'\r\n--{boundary}--\r\n'.encode()

class MultipartFile:
    """File-like body: urllib reads chunks instead of loading a large APK in RAM."""
    def __init__(self):
        self.parts = [memoryview(prefix), open(apk, 'rb'), memoryview(suffix)]
        self.length = len(prefix) + size + len(suffix)
    def read(self, n=-1):
        while self.parts:
            part = self.parts[0]
            data = part.read(n) if hasattr(part, 'read') else bytes(part[:n] if n >= 0 else part)
            if not data:
                if hasattr(part, 'close'): part.close()
                self.parts.pop(0); continue
            if not hasattr(part, 'read') and n >= 0: self.parts[0] = part[len(data):]
            return data
        return b''

body = MultipartFile()
req = urllib.request.Request('https://upload.gofile.io/uploadfile', data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}',
             'Content-Length': str(body.length), 'User-Agent': 'AuroraBuildUploader/2.0'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=900) as response:
        if response.status not in (200, 201): raise RuntimeError(f'GoFile HTTP {response.status}')
        result = json.load(response)
except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f'Falha ao publicar no GoFile: {getattr(exc, "code", "conexão/timeout")}.') from None
if result.get('status') != 'ok':
    raise SystemExit('GoFile não confirmou o upload' + (f': {str(result.get("message", "erro da API"))[:180]}' if result else '.'))
download_page = result.get('data', {}).get('downloadPage', '')
try:
    from urllib.parse import urlparse
    parsed = urlparse(download_page)
    if parsed.scheme != 'https' or not parsed.hostname: raise ValueError
except (TypeError, ValueError):
    raise SystemExit('GoFile retornou downloadPage inválido; publicação não confirmada.')
pathlib.Path('apk_download_url.txt').write_text(download_page + '\n', encoding='utf-8')
env_file = os.environ.get('GITHUB_ENV')
if env_file:
    with open(env_file, 'a', encoding='utf-8') as env: env.write('AURORA_APK_URL=' + download_page + '\n')
print(f'APK enviado e confirmado pelo GoFile Guest ({size} bytes).')
