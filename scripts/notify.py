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
if status == 'success':
    # This is an artifact PAGE, not a direct APK download.
    # Existing Worker expects download_url; label should be adjusted accordingly.
    if artifact_url:
        payload['download_url'] = artifact_url
else:
    payload['error'] = 'Compilação não concluída (' + result + '). Consulte os logs da execução.'

request = urllib.request.Request(
    worker + '/build-callback',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret},
    method='POST',
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        print('Aurora Worker callback:', response.status)
except urllib.error.HTTPError as e:
    print('Aurora Worker callback failed:', e.code, e.read(500).decode('utf-8', 'replace'), file=sys.stderr)
    raise
