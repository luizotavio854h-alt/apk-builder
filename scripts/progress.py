#!/usr/bin/env python3
"""Best-effort authenticated progress callback; transient errors never stop builds."""
import json, os, sys, time, urllib.error, urllib.request

worker = os.environ.get('WORKER_URL', '').rstrip('/')
secret = os.environ.get('CALLBACK_SECRET', '')
payload = {k: os.environ.get(k, '') for k in ('BUILD_ID', 'USER_ID', 'CHANNEL_ID')}
payload.update(step=int(os.environ.get('PROGRESS_STEP', '-1')), stage=os.environ.get('PROGRESS_STAGE', ''))
if not worker or not secret or not all(payload[k] for k in ('BUILD_ID', 'USER_ID', 'CHANNEL_ID')):
    print('Progress callback skipped: configuration or build identity missing.', file=sys.stderr)
    raise SystemExit(0)
request = urllib.request.Request(worker + '/build-progress', data=json.dumps(payload).encode(), method='POST', headers={
    'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json', 'User-Agent': 'AuroraAndroidEngine/4.0'})
for attempt in range(3):
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status < 300: print('Progress updated.'); break
            raise RuntimeError('callback rejected')
    except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
        if attempt == 2:
            print('Progress callback unavailable; build continues.', type(exc).__name__, file=sys.stderr)
        else:
            time.sleep(1 + attempt)
