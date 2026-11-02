import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { patchZipEntries } from './zip-patch.ts';
const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
/** Drop stale note line caches and allocate distinct note identities for Hancom. */
export function finalizeHwpx(bytes: Uint8Array, sourceDocument?: any): Uint8Array {
  const entries = unzipSync(bytes,{filter:entry=>/^Contents\/(section\d+|masterpage\d+)\.xml$/.test(entry.name)}), used = new Set<string>(); let changed = false, nextId = 1;
  const replacements:Record<string,Uint8Array>={};
  const documents: [string, XMLDocument][] = [];
  for (const [name, value] of Object.entries(entries)) {
    if (!/^Contents\/(section\d+|masterpage\d+)\.xml$/.test(name)) continue;
    const xml = new DOMParser().parseFromString(strFromU8(value), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('저장할 문서의 XML이 올바르지 않습니다.');
    documents.push([name, xml]);
    for (const kind of ['footNote', 'endNote']) for (const note of Array.from(xml.getElementsByTagNameNS(HP, kind))) {
      const id = note.getAttribute('instId'); if (id && id !== '0') used.add(id);
    }
  }
  const seen = new Set<string>();
  for (const [name, xml] of documents) {
    let dirty = false;
    const section = /^Contents\/section(\d+)\.xml$/.exec(name);
    if (section && sourceDocument?.getControlTextPositions && sourceDocument?.getTableProperties) {
      const paragraphs=Array.from(xml.documentElement.children).filter(node=>node.localName==='p');
      paragraphs.forEach((paragraph,index)=>{
        const tables=Array.from(paragraph.getElementsByTagNameNS(HP,'tbl')).filter(table=>{let parent=table.parentElement;while(parent&&!(parent.localName==='p'&&parent.namespaceURI===HP))parent=parent.parentElement;return parent===paragraph;});
        if(!tables.length)return;
        const properties:any[]=[];
        const positions=JSON.parse(sourceDocument.getControlTextPositions(Number(section[1]),index));
        for(let ci=0;ci<positions.length;ci++)try{const props=JSON.parse(sourceDocument.getTableProperties(Number(section[1]),index,ci));if(typeof props.repeatHeader==='boolean'&&props.tableWidth!==undefined)properties.push(props);}catch{/* A different control in the same paragraph. */}
        if(properties.length!==tables.length)return;
        tables.forEach((table,i)=>{const value=properties[i].repeatHeader?'1':'0';if(table.getAttribute('repeatHeader')!==value){table.setAttribute('repeatHeader',value);dirty=true;}});
      });
    }
    for (const kind of ['footNote', 'endNote']) for (const note of Array.from(xml.getElementsByTagNameNS(HP, kind))) {
      const id = note.getAttribute('instId'); const key = id || '';
      if (!id || id === '0' || seen.has(key)) {
        let fresh: string; do { fresh = String(nextId++); } while (used.has(fresh));
        note.setAttribute('instId', fresh); used.add(fresh); dirty = true;
      } else seen.add(key);
      // Cached text positions depend on fonts and note width, and cannot be
      // trusted across editors. Hancom lays these paragraphs out again.
      for (const cache of Array.from(note.getElementsByTagNameNS(HP, 'linesegarray'))) { cache.remove(); dirty = true; }
      for (const marker of Array.from(note.getElementsByTagNameNS(HP, 'autoNum'))) {
        const expected = kind === 'footNote' ? 'FOOTNOTE' : 'ENDNOTE';
        if (marker.getAttribute('numType') !== expected && ['FOOTNOTE', 'ENDNOTE'].includes(marker.getAttribute('numType') || '')) { marker.setAttribute('numType', expected); dirty = true; }
      }
    }
    if (dirty) { replacements[name] = strToU8(new XMLSerializer().serializeToString(xml)); changed = true; }
  }
  if (!changed) return bytes;
  // HWPX requires the uncompressed mimetype entry first.
  try{return patchZipEntries(bytes,replacements);}
  catch{
    // Keep compatibility for uncommon directory formats; never silently lose entries.
    const {mimetype,...rest}=unzipSync(bytes);
    return zipSync({mimetype:[mimetype,{level:0}],...rest,...replacements},{level:6});
  }
}

export function layoutSignature(bytes: Uint8Array) {
  const parts = unzipSync(bytes), result: unknown[] = [];
  for (const name of Object.keys(parts).filter(n => /^Contents\/section\d+\.xml$/.test(n)).sort()) {
    const xml = new DOMParser().parseFromString(strFromU8(parts[name]), 'application/xml');
    for (const node of Array.from(xml.getElementsByTagName('*'))) {
      if (['footNote','endNote'].includes(node.localName)) {
        result.push([name,node.localName,node.getAttribute('number'),Array.from(node.getElementsByTagNameNS(HP,'t')).map(t=>t.textContent).join('')]);
      }
      if (!['pic','rect','ellipse','tbl','ole','line','equation'].includes(node.localName) || node.namespaceURI !== HP) continue;
      const pos=Array.from(node.children).find(n=>n.localName==='pos');
      const size=Array.from(node.children).find(n=>n.localName==='sz');
      result.push([name,node.localName,...['treatAsChar','vertRelTo','horzRelTo','vertAlign','horzAlign','vertOffset','horzOffset'].map(key=>pos?.getAttribute(key)),size?.getAttribute('width'),size?.getAttribute('height')]);
    }
  }
  return result;
}
/** Resolve table style references so export checks compare appearance, not IDs. */
export function tableFormatSignature(bytes: Uint8Array) {
  const parts = unzipSync(bytes), parser = new DOMParser();
  const header = parser.parseFromString(strFromU8(parts['Contents/header.xml']), 'application/xml');
  const attrs = (node: Element | undefined, omit: string[] = []) => node ? Array.from(node.attributes).filter(a => !omit.includes(a.name)).map(a => [a.name, a.value]).sort((a,b)=>a[0].localeCompare(b[0])) : [];
  const tree = (node: Element): unknown => [node.localName, attrs(node,['id']), Array.from(node.children).map(tree)];
  const borders = new Map(Array.from(header.getElementsByTagNameNS('*','borderFill')).map(node => [node.getAttribute('id'),tree(node)]));
  const child = (node: Element, name: string) => Array.from(node.children).find(n => n.localName === name);
  const result: unknown[] = [];
  for (const name of Object.keys(parts).filter(n=>/^Contents\/(section\d+|masterpage\d+)\.xml$/.test(n)).sort()) {
    const xml = parser.parseFromString(strFromU8(parts[name]),'application/xml');
    for (const table of Array.from(xml.getElementsByTagNameNS(HP,'tbl'))) {
      // noAdjust controls later automatic resizing, not the current cell geometry.
      // The HWP adapter combines it with raw record flags; compare actual sizes below.
      result.push([name,attrs(table,['id','zOrder','numberingType','borderFillIDRef','noAdjust']),borders.get(table.getAttribute('borderFillIDRef')),
        ...['sz','pos','outMargin','inMargin'].map(key=>attrs(child(table,key))),
        Array.from(table.getElementsByTagNameNS(HP,'tc')).map(cell=>[
          attrs(cell,['name','borderFillIDRef']),borders.get(cell.getAttribute('borderFillIDRef')),
          ...['cellAddr','cellSpan','cellSz','cellMargin'].map(key=>attrs(child(cell,key))),
          attrs(child(cell,'subList'),['id','textWidth','textHeight','linkListIDRef','linkListNextIDRef']),
        ]),
      ]);
    }
  }
  return result;
}
/** Canonicalize notes before HWP serialization, then reopen and fence loss. */
export function exportCompatibleHwp(doc: any, Document: any, readExport: (fn:()=>any)=>any) {
  const source=readExport(()=>doc.exportHwpxWithReport());
  if (source.contentLoss.count) throw new Error('HWP 변환 중 지원하지 않는 개체가 있습니다. HWPX로 저장해 주세요.');
  const canonical=finalizeHwpx(source.bytes,doc), expected=JSON.stringify(layoutSignature(canonical)), expectedTables=JSON.stringify(tableFormatSignature(canonical));
  const converted=new Document(canonical);
  try {
    const artifact=readExport(()=>converted.exportHwpWithReport());
    if (artifact.contentLoss.count) throw new Error('HWP 변환 중 내용 손실이 감지되었습니다. HWPX로 저장해 주세요.');
    const reopened=new Document(artifact.bytes);
    try {
      const verified = finalizeHwpx(reopened.exportHwpx(),reopened);
      if (expected!==JSON.stringify(layoutSignature(verified))) throw new Error('HWP 저장 후 개체 배치 또는 각주·미주가 달라져 저장을 중단했습니다. HWPX로 저장해 주세요.');
      if (expectedTables!==JSON.stringify(tableFormatSignature(verified))) throw new Error('HWP 저장 시 표의 테두리·여백·셀 크기가 달라져 저장을 중단했습니다. HWPX로 저장해 주세요.');
    } finally {reopened.free();}
    return artifact;
  } finally {converted.free();}
}
