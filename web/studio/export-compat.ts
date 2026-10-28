import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
/** Drop stale note line caches and allocate distinct note identities for Hancom. */
export function finalizeHwpx(bytes: Uint8Array): Uint8Array {
  const entries = unzipSync(bytes), used = new Set<string>(); let changed = false, nextId = 1;
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
    if (dirty) { entries[name] = strToU8(new XMLSerializer().serializeToString(xml)); changed = true; }
  }
  if (!changed) return bytes;
  // HWPX requires the uncompressed mimetype entry first.
  const { mimetype, ...rest } = entries;
  return zipSync({ mimetype: [mimetype, { level: 0 }], ...rest }, { level: 6 });
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
/** Canonicalize notes before HWP serialization, then reopen and fence loss. */
export function exportCompatibleHwp(doc: any, Document: any, readExport: (fn:()=>any)=>any) {
  const source=readExport(()=>doc.exportHwpxWithReport());
  if (source.contentLoss.count) throw new Error('HWP 변환 중 지원하지 않는 개체가 있습니다. HWPX로 저장해 주세요.');
  const canonical=finalizeHwpx(source.bytes), expected=JSON.stringify(layoutSignature(canonical));
  const converted=new Document(canonical);
  try {
    const artifact=readExport(()=>converted.exportHwpWithReport());
    if (artifact.contentLoss.count) throw new Error('HWP 변환 중 내용 손실이 감지되었습니다. HWPX로 저장해 주세요.');
    const reopened=new Document(artifact.bytes);
    try {
      if (expected!==JSON.stringify(layoutSignature(reopened.exportHwpx()))) throw new Error('HWP 저장 후 개체 배치 또는 각주·미주가 달라져 저장을 중단했습니다. HWPX로 저장해 주세요.');
    } finally {reopened.free();}
    return artifact;
  } finally {converted.free();}
}
