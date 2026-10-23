#!/usr/bin/env python3
"""Download a direct ZIP or resolve a public MediaFire file page safely."""
import html
import ipaddress
import os
import pathlib
import re
import shutil
import socket
import stat
import sys
import urllib.parse
import urllib.request
import zipfile
from html.parser import HTMLParser

MAX_ZIP = 600 * 1024 * 1024
MAX_HTML = 4 * 1024 * 1024
MAX_UNPACKED = 3 * 1024 ** 3

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ('href', 'data-href'):
            if a.get(key):
                self.links.append(html.unescape(a[key]))

def check_url(url):
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or '').lower()
    if parsed.scheme != 'https' or not host or parsed.username or parsed.password:
        raise ValueError('Source URL must be HTTPS with a valid host')
    if host == 'localhost' or host.endswith(('.local', '.internal')):
        raise ValueError('Local addresses are forbidden')
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise ValueError(f'Cannot resolve source host: {host}') from e
    for addr in addresses:
        ip = ipaddress.ip_address(addr[4][0])
        if not ip.is_global:
            raise ValueError('Private or non-public source address is forbidden')
    return host

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER = urllib.request.build_opener(SafeRedirect)

def resolve_mediafire(page, base):
    parser = Links()
    parser.feed(page)
    # MediaFire public download pages generally contain an anchor with id=downloadButton.
    match = re.search(r'<a\b[^>]*\bid=["\']downloadButton["\'][^>]*>', page, re.I)
    candidates = []
    if match:
        anchor = match.group(0)
        href = re.search(r'\bhref=["\']([^"\']+)', anchor, re.I)
        if href:
            candidates.append(html.unescape(href.group(1)))
    candidates.extend(parser.links)
    for candidate in candidates:
        link = urllib.parse.urljoin(base, candidate)
        parsed = urllib.parse.urlparse(link)
        host = (parsed.hostname or '').lower()
        # Direct MediaFire download hosts generally have 'download' in the path.
        if (link != base and parsed.scheme == 'https' and
            (host == 'mediafire.com' or host.endswith('.mediafire.com')) and
            ('/download/' in parsed.path or 'download' in host)):
            return link
    raise ValueError('MediaFire page did not contain a direct public ZIP link; provide a direct ZIP URL')

def download(url, out):
    for attempt in range(4):
        host = check_url(url)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 AuroraBuild/4.0', 'Accept': '*/*'})
        with OPENER.open(req, timeout=90) as response:
            final_url = response.geturl()
            check_url(final_url)
            content_type = response.headers.get('Content-Type', '').lower()
            head = response.read(512)
            is_zip = head.startswith((b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'))
            if not is_zip:
                if 'mediafire.com' in host or 'mediafire.com' in (urllib.parse.urlparse(final_url).hostname or ''):
                    if 'text/html' in content_type or head.lstrip().lower().startswith((b'<!doctype', b'<html')):
                        page = (head + response.read(MAX_HTML)).decode('utf-8', 'replace')
                        url = resolve_mediafire(page, final_url)
                        print('Resolved MediaFire download link.', flush=True)
                        continue
                pathlib.Path('workspace/download-debug.txt').write_text(
                    'Final host: ' + str(urllib.parse.urlparse(final_url).hostname) + '\n' +
                    'Content-Type: ' + content_type + '\n' +
                    'First bytes: ' + repr(head[:100]) + '\n', encoding='utf-8'
                )
                raise ValueError('Downloaded content is not a ZIP. Check the source URL or download-debug.txt artifact.')
            total = len(head)
            with open(out, 'wb') as file:
                file.write(head)
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > MAX_ZIP:
                        raise ValueError('ZIP exceeds 600 MiB')
                    file.write(block)
            if not zipfile.is_zipfile(out):
                raise ValueError('ZIP signature exists but archive is corrupt or incomplete')
            return total
    raise ValueError('Too many MediaFire redirects')

def extract(zipname, dest, password):
    root = pathlib.Path(dest).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zipname) as z:
        members = z.infolist()
        if len(members) > 40000:
            raise ValueError('Too many ZIP entries')
        if sum(info.file_size for info in members) > MAX_UNPACKED:
            raise ValueError('Uncompressed project exceeds 3 GiB')
        for info in members:
            path = (root / info.filename).resolve()
            if not path.is_relative_to(root):
                raise ValueError('Unsafe ZIP path')
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError('ZIP symlinks are not allowed')
            if info.is_dir():
                path.mkdir(parents=True, exist_ok=True)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info, pwd=password.encode() if password else None) as src, open(path, 'wb') as dst:
                shutil.copyfileobj(src, dst)

def main():
    url = os.environ['SOURCE_URL']
    password = os.environ.get('SOURCE_PASSWORD', '')
    os.makedirs('workspace', exist_ok=True)
    print('Downloading source...', flush=True)
    print('ZIP size:', download(url, 'workspace/source.zip'), flush=True)
    extract('workspace/source.zip', 'workspace/unpacked', password)
    base = pathlib.Path('workspace/unpacked')
    roots = [p.parent for p in base.rglob('*') if p.name in ('settings.gradle', 'settings.gradle.kts')]
    if not roots:
        roots = [p.parent for p in base.rglob('*') if p.name in ('build.gradle', 'build.gradle.kts')]
    if not roots:
        raise ValueError('No Gradle project found in ZIP')
    roots.sort(key=lambda p: (len(p.parts), str(p)))
    root = roots[0].resolve()
    print('Project root:', root)
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as f:
        f.write('PROJECT_ROOT=' + str(root) + '\n')
    pathlib.Path('project_root.txt').write_text(str(root), encoding='utf-8')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('ERROR:', str(e), file=sys.stderr)
        sys.exit(1)
