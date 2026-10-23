#!/usr/bin/env python3
import os,re,pathlib,json
root=pathlib.Path(os.environ['PROJECT_ROOT'])
files=[]
for pat in ('**/*.gradle','**/*.gradle.kts','**/gradle.properties','**/gradle-wrapper.properties','**/libs.versions.toml'):
 files.extend(root.glob(pat))
content='\n'.join(p.read_text(errors='ignore') for p in files[:200] if p.is_file() and p.stat().st_size<2_000_000)
def match(pattern,default):
 m=re.search(pattern,content,re.I);return m.group(1) if m else default
sdk=match(r'(?:compileSdk(?:Version)?\s*[=( ]\s*|compileSdkVersion\s+)["\']?(\d+)', '35')
ndk=match(r'ndkVersion\s*[=( ]\s*["\']([\d.]+)', '')
cmake=match(r'cmake\s*\{[^}]*version\s*[=( ]\s*["\']([\d.]+)', '')
java='21' if re.search(r'(?:JavaVersion\.VERSION_21|jvmTarget\s*[= ]\s*["\']21|JavaLanguageVersion\.of\(21\))',content) else '17'
# AGP 8.7+ commonly requires JDK 17; Gradle 9 requires JDK 17+. Prefer JDK 21 for Gradle 9.
wrapper=root/'gradle/wrapper/gradle-wrapper.properties'
if wrapper.exists() and re.search(r'gradle-9\.',wrapper.read_text(errors='ignore')): java='21'
with open(os.environ['GITHUB_ENV'],'a') as f:
 for k,v in [('COMPILE_SDK',sdk),('NDK_VERSION',ndk),('CMAKE_VERSION',cmake),('JAVA_VERSION',java)]:f.write(f'{k}={v}\n')
print(json.dumps({'compileSdk':sdk,'ndkVersion':ndk,'cmakeVersion':cmake,'java':java},indent=2))
