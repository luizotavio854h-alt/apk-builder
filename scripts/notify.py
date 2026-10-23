#!/usr/bin/env python3
"""Report build result to Cloudflare Worker; Worker owns Discord token."""
import json
import os
import urllib.parse
import urllib.request

worker = os.environ.get('WORKER_URL', '').rstrip('/')
secret = os.environ.get('CALLBACK_SECRET', '')
user_id = os.environ.get('USER_ID', '')
channel_id = os.environ.get('CHANNEL_ID', '')
status = os.environ.get('BUILD_RESULT', 'failure')
run_url = os.environ.get('RUN_URL', '')
artifact_url = os.environ.get('ARTIFACT_URL', '') if status == 'success' else ''

if not (worker and secret and user_id):
    raise SystemExit('Missing WORKER_URL, CALLBACK_SECRET or USER_ID; cannot notify Worker')
parsed = urllib.parse.urlparse(worker)
if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
    raise SystemExit('WORKER_URL must be a valid HTTPS origin')

payload = {
    'user_id': user_id,
    'channel_id': channel_id,
    'status': status,
    'artifact_url': artifact_url,
    'run_url': run_url,
}
req = urllib.request.Request(
    worker + '/build-callback',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret},
    method='POST',
)
with urllib.request.urlopen(req, timeout=30) as response:
    print('Cloudflare callback status:', response.status)
