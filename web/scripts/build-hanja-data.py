"""Build a small, offline Korean-reading index from the pinned Unicode data."""
from pathlib import Path
import hashlib, io, json, urllib.request, zipfile

ROOT = Path(__file__).resolve().parents[2]
URL = 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip'
SHA = 'f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e'
archive = ROOT / 'build/editor-regressions/Unihan-17.0.0.zip'
data = archive.read_bytes() if archive.exists() else urllib.request.urlopen(URL, timeout=60).read()
if hashlib.sha256(data).hexdigest() != SHA:
    raise ValueError('Unexpected Unicode archive')
z = zipfile.ZipFile(io.BytesIO(data))
readings = {}
for line in z.read('Unihan_Readings.txt').decode('utf-8').splitlines():
    if '\tkHangul\t' not in line:
        continue
    point, _, values = line.split('\t')
    code = int(point[2:], 16)
    if code > 0xffff:
        continue
    for value in values.split():
        syllable, _, rank = value.partition(':')
        if len(syllable) != 1 or not '\uac00' <= syllable <= '\ud7a3':
            continue
        readings.setdefault(syllable, []).append((0 if '0' in rank else 1 if '1' in rank else 2, chr(code)))
out = ROOT / 'web/public/studio-data'
out.mkdir(exist_ok=True)
payload = {key: list(dict.fromkeys(char for _, char in sorted(items))) for key, items in readings.items()}
(out / 'hanja-17.0.0.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
license_text = urllib.request.urlopen('https://www.unicode.org/license.txt', timeout=30).read()
(ROOT / 'web/public/licenses/Unicode-3.0.txt').write_bytes(license_text)
(out / 'hanja-source.json').write_text(json.dumps({'source': URL, 'sha256': SHA, 'unicodeVersion': '17.0.0', 'license': 'Unicode-3.0'}, indent=2), encoding='utf-8')
print({'readings': len(payload), 'characters': sum(map(len, payload.values()))})
