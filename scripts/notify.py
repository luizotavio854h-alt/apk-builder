#!/usr/bin/env python3
"""Notify the Cloudflare Worker. The Worker owns the Discord bot token."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

worker = os.environ.get('WORKER_URL', '').rstrip('/')
secret = os.environ.get('CALLBACK_SECRET', '')
user_id = os.environ.get('USER_ID', '')
channel_id = os.environ.get('CHANNEL_ID', '')
result = os.environ.get('BUILD_RESULT', 'failure').lower()
run_url = os.environ.get('RUN_URL', '')
artifact_url = os.environ.get('ARTIFACT_URL', '')
build_id = os.environ.get('BUILD_ID', '')

missing = [name for name, value in [('WORKER_URL', worker), ('CALLBACK_SECRET', secret), ('USER_ID', user_id), ('CHANNEL_ID', channel_id)] if not value]
if missing:
    raise SystemExit('Missing callback configuration: ' + ', '.join(missing) + '. Check workflow inputs and GitHub Actions secrets.')
parsed = urllib.parse.urlparse(worker)
if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/'):
    raise SystemExit('WORKER_URL must be a valid HTTPS origin')

status = 'success' if result == 'success' else 'failure'
payload = {
    'user_id': user_id,
    'channel_id': channel_id,
    'status': status,
}
if build_id:
    payload['build_id'] = build_id
if status == 'success':
    from pathlib import Path
    link_file = Path('apk_download_url.txt')
    if not link_file.exists():
        raise SystemExit('Missing APK site link from build job')
    link = link_file.read_text(encoding='utf-8').strip()
    if not link.startswith('https://'):
        raise SystemExit('Link do APK inválido; callback de sucesso cancelado.')
    payload['download_url'] = link
else:
    failure_file = __import__('pathlib').Path('build_failure.txt')
    details = failure_file.read_text(encoding='utf-8').strip() if failure_file.exists() else ''
    payload['error'] = (details or ('Compilação não concluída (' + result + '). Consulte os logs da execução.'))[:850]

request = urllib.request.Request(
    worker + '/build-callback',
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AuroraAndroidEngine/4.0 (+GitHub-Actions)',
        'Authorization': 'Bearer ' + secret,
    },
    method='POST',
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        print('Aurora Worker callback:', response.status)
except urllib.error.HTTPError as e:
    print('Aurora Worker callback failed:', e.code, file=sys.stderr)
    if e.code == 403 and ('1010' in body or 'error code: 1010' in body.lower()):
        print('Cloudflare security blocked the GitHub Actions HTTP client (1010).', file=sys.stderr)
        print('Check Cloudflare Security Events for the blocked request and configure a narrowly scoped exception for /build-callback if appropriate.', file=sys.stderr)
        print('Do not disable global security or expose CALLBACK_SECRET.', file=sys.stderr)
    raise SystemExit(1)
except (urllib.error.URLError, TimeoutError, OSError) as e:
    print('Aurora Worker callback connection failed:', type(e).__name__, file=sys.stderr)
    raise SystemExit(1)
