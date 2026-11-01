"""Import only the pinned, licensed SVG geometry; never execute package code."""
from pathlib import Path
import base64
import hashlib
import json
import sys
import tarfile
import xml.etree.ElementTree as ET

web = Path(__file__).resolve().parents[1]
manifest = json.loads((web / 'studio/octicons-manifest.json').read_text(encoding='utf8'))
archive = Path(sys.argv[1]).resolve()
raw = archive.read_bytes()
assert 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode() == manifest['integrity'], 'Octicons archive integrity mismatch'
selected = sorted(set(manifest['aliases'].values()) | set(manifest['shell'].values()))
catalog = {}
allowed_attributes = {'d', 'fill-rule', 'clip-rule', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'points', 'x1', 'x2', 'y1', 'y2'}
with tarfile.open(archive) as package:
    license_text = package.extractfile('package/LICENSE').read().decode('utf8')
    for name in selected:
        variants = {}
        for size in (16, 24):
            try:
                svg = ET.fromstring(package.extractfile(f'package/build/svg/{name}-{size}.svg').read())
            except KeyError:
                continue
            nodes = []
            for child in svg:
                tag = child.tag.rsplit('}', 1)[-1]
                assert tag in {'path', 'rect', 'circle', 'line', 'polyline', 'polygon'}
                assert set(child.attrib) <= allowed_attributes
                nodes.append([tag, child.attrib])
            variants[str(size)] = {'width': int(svg.get('width')), 'height': int(svg.get('height')), 'nodes': nodes}
        assert '16' in variants, name
        catalog[name] = variants
(web / 'public/licenses/octicons-MIT.txt').write_text(license_text, encoding='utf8')
module = '// Generated from @primer/octicons ' + manifest['version'] + '; MIT, see public/licenses/octicons-MIT.txt.\n'
module += 'export const octiconsData = ' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + ';\n'
(web / 'studio/octicons-data.ts').write_text(module, encoding='utf8')
shell = {key: catalog[name]['16'] for key, name in manifest['shell'].items()}
script = '''/* Jakal shell icons: @primer/octicons VERSION, MIT; licenses/octicons-MIT.txt. */
{
  const icons = ICON_DATA;
  for (const [action, asset] of Object.entries(icons)) {
    const button=document.querySelector('.editor-actions [data-action="'+action+'"]');
    if(!button||button.querySelector('.jakal-shell-icon'))continue;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 '+asset.width+' '+asset.height,width:asset.width,height:asset.height,fill:'currentColor','aria-hidden':'true',focusable:'false',class:'jakal-shell-icon'}))svg.setAttribute(key,String(value));
    for(const [tag,attributes] of asset.nodes){const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,value);svg.append(node);}
    button.classList.add('jakal-action-with-icon');button.prepend(svg);
  }
}
'''.replace('VERSION', manifest['version']).replace('ICON_DATA', json.dumps(shell, separators=(',', ':')))
(web / 'online/action-icons.mjs').write_text(script, encoding='utf8')
print(f'Imported {len(catalog)} Octicons, using native 16px / 24px geometry; license retained.')
