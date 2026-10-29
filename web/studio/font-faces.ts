export type FaceMetadata = { family: string; weight: string; style: 'normal' | 'italic' };
/** Read SFNT names and face weight without uploading or executing font data. */
export function fontFaceMetadata(bytes: ArrayBuffer, fileName = ''): FaceMetadata {
  const fallback = fileName.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_](regular|bold|italic|medium|light).*$/i, '') || '내 글꼴';
  const result: FaceMetadata = { family: fallback, weight: /bold/i.test(fileName) ? '700' : '400', style: /italic|oblique/i.test(fileName) ? 'italic' : 'normal' };
  const view = new DataView(bytes), table = new Map<string, [number, number]>();
  const fits = (at: number, size: number) => at >= 0 && at + size <= view.byteLength;
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (!fits(0, 12)) return result;
  const start = tag(0) === 'ttcf' && fits(12, 4) ? view.getUint32(12) : 0;
  if (!fits(start, 12)) return result;
  if (tag(start) !== 'OTTO' && view.getUint32(start) !== 0x10000) return result;
  const count = view.getUint16(start + 4);
  if (!fits(start + 12, count * 16)) return result;
  for (let i = 0; i < count; i++) {
    const at = start + 12 + i * 16, offset = view.getUint32(at + 8), length = view.getUint32(at + 12);
    if (fits(offset, length)) table.set(tag(at), [offset, length]);
  }
  const name = table.get('name');
  if (name && name[1] >= 6) {
    const [at, size] = name, n = view.getUint16(at + 2), strings = view.getUint16(at + 4), candidates: [number, string][] = [];
    for (let i = 0; i < n && 6 + (i + 1) * 12 <= size; i++) {
      const row = at + 6 + i * 12, platform = view.getUint16(row), lang = view.getUint16(row + 4), id = view.getUint16(row + 6);
      const length = view.getUint16(row + 8), offset = strings + view.getUint16(row + 10);
      if (![1, 16].includes(id) || offset + length > size) continue;
      const decoder = new TextDecoder(platform === 0 || platform === 3 ? 'utf-16be' : 'utf-8');
      const value = decoder.decode(new Uint8Array(bytes, at + offset, length)).replace(/\0/g, '').trim();
      if (value && !/[\x00-\x1f]/.test(value)) candidates.push([(id === 16 ? 10 : 0) + (lang === 0x412 ? 5 : lang === 0x409 ? 3 : 0), value]);
    }
    candidates.sort((a, b) => b[0] - a[0]); if (candidates.length) result.family = candidates[0][1];
  }
  const os = table.get('OS/2');
  if (os && os[1] >= 6) result.weight = String(Math.max(1, Math.min(1000, view.getUint16(os[0] + 4))));
  if (os && os[1] >= 64 && (view.getUint16(os[0] + 62) & 1)) result.style = 'italic';
  const variable = table.get('fvar');
  if (variable && variable[1] >= 16) {
    const [base, length] = variable, axes = view.getUint16(base + 4), axisCount = view.getUint16(base + 8), axisSize = view.getUint16(base + 10);
    for (let i = 0; axisSize >= 20 && i < axisCount; i++) {
      const at = axes + i * axisSize; if (at + 20 > length) break;
      if (tag(base + at) === 'wght') result.weight = `${view.getInt32(base + at + 4) / 65536} ${view.getInt32(base + at + 12) / 65536}`;
    }
  }
  return result;
}
