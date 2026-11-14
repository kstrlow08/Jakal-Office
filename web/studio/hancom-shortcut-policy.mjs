// Build-time patches that add 한글 (Hancom) shortcuts the pinned editor lacks.
// Browsers reserve Ctrl+N, so Hancom's Ctrl+N,□ chords stay on the runtime's
// Ctrl+M,□ prefix. Every anchor is checked so an editor update fails loudly.

const lf = code => code.replaceAll('\r\n', '\n');
function replaceOnce(code, target, replacement, name) {
  if (!code.includes(target)) throw new Error(`Pinned ${name} changed`);
  return code.replace(target, replacement);
}

/** Ctrl+M,□ = 한글 Ctrl+N,□ ; Ctrl+K,□ = 한글 Ctrl+K,□. Hangul jamo cover the Korean keyboard layout. */
export const CHORD_M = {
  t: 'table:create', ㅅ: 'table:create',
  i: 'insert:image', ㅑ: 'insert:image',
  b: 'insert:textbox', ㅠ: 'insert:textbox',
  e: 'insert:endnote', ㄷ: 'insert:endnote',
  c: 'jakal:caption', ㅊ: 'jakal:caption',
  h: 'page:header-create', ㅗ: 'page:header-create',
  g: 'page:section-settings', ㅎ: 'page:section-settings',
  f: 'table:formula', ㄹ: 'table:formula',
};
export const CHORD_K = {
  e: 'insert:field', ㄷ: 'insert:field',
  d: 'jakal:insert-date', ㅇ: 'jakal:insert-date',
};
const CHORD_CODES = { KeyT: 't', KeyI: 'i', KeyB: 'b', KeyE: 'e', KeyC: 'c', KeyH: 'h', KeyG: 'g', KeyD: 'd' };

/** [ShortcutDef, command] pairs appended to the runtime's default map. */
export const EXTRA_SHORTCUTS = [
  [{ key: 'f10', ctrl: true }, 'insert:symbols'],
  [{ key: 'f2' }, 'edit:find'],
  [{ key: 'h', code: 'KeyH', ctrl: true }, 'edit:find-replace'],
  [{ key: 'ㅗ', ctrl: true }, 'edit:find-replace'],
  [{ key: 'j', code: 'KeyJ', ctrl: true }, 'page:break'],
  [{ key: 'insert', alt: true }, 'table:insert-row-col'],
  [{ key: 'insert', ctrl: true, shift: true }, 'format:toggle-numbering'],
  [{ key: 'u', code: 'KeyU', alt: true, shift: true }, 'format:underline'],
  [{ key: 'b', code: 'KeyB', alt: true, shift: true }, 'format:bold'],
  [{ key: 'i', code: 'KeyI', alt: true, shift: true }, 'format:italic'],
  [{ key: 'p', code: 'KeyP', alt: true, shift: true }, 'format:superscript'],
  [{ key: 's', code: 'KeyS', alt: true, shift: true }, 'format:subscript'],
  [{ key: 'y', code: 'KeyY', alt: true }, 'jakal:delete-line-end'],
  [{ key: 'p', code: 'KeyP', alt: true }, 'file:print'],
  [{ key: 'f1' }, 'jakal:shortcuts'],
];

/** F5 셀 블록의 한 글자 명령 (물리 키 기준이라 한글 입력 상태에서도 동작). */
export const CELL_BLOCK_KEYS = {
  keyh: 'table:cell-height-equal', keyw: 'table:cell-width-equal', keyp: 'table:cell-props',
  keyl: 'table:border-each', keyc: 'table:border-each', keyb: 'table:border-one', keyf: 'table:border-one',
};

export function addHancomShortcutMap(code) {
  const end = "  [{ key: 'p', ctrl: true, shift: true }, 'table:block-product'],\n];";
  const entries = EXTRA_SHORTCUTS.map(([def, id]) => `  [${JSON.stringify(def)}, ${JSON.stringify(id)}],`).join('\n');
  return replaceOnce(lf(code), end, `  [{ key: 'p', ctrl: true, shift: true }, 'table:block-product'],\n  // 한글 호환 (Jakal)\n${entries}\n];`, 'shortcut map');
}

export function addHancomChords(code) {
  code = lf(code);
  const object = map => Object.entries(map).map(([key, id]) => `  ${key}: '${id}',`).join('\n');
  code = replaceOnce(code, "  m: 'insert:equation',\n  ㅡ: 'insert:equation', // 한글 IME\n};",
    `  m: 'insert:equation',\n  ㅡ: 'insert:equation', // 한글 IME\n${object(CHORD_M)}\n};`, 'Ctrl+M chord map');
  code = replaceOnce(code, "  n: 'format:para-num-shape',\n  ㅜ: 'format:para-num-shape', // 한글 IME 상태\n};",
    `  n: 'format:para-num-shape',\n  ㅜ: 'format:para-num-shape', // 한글 IME 상태\n${object(CHORD_K)}\n};`, 'Ctrl+K chord map');
  const codes = Object.entries(CHORD_CODES).map(([key, value]) => `${key}: '${value}'`).join(', ');
  code = replaceOnce(code, "        KeyA: 'a', KeyZ: 'z', // 표 나누기/붙이기 (Ctrl+M,A / Ctrl+M,Z)\n",
    `        KeyA: 'a', KeyZ: 'z', // 표 나누기/붙이기 (Ctrl+M,A / Ctrl+M,Z)\n        ${codes},\n`, 'Ctrl+M IME keys');
  // Ctrl+K's second key may arrive while the Korean IME composes; resolve it by physical key like Ctrl+M.
  code = replaceOnce(code, '  if (this._pendingChordK) {\n    this._pendingChordK = false;',
    '  if (this._pendingChordK && !(e.isComposing || e.keyCode === 229)) {\n    this._pendingChordK = false;', 'Ctrl+K chord gate');
  code = replaceOnce(code, '    // chord 2번째 키 — _pendingChordM 활성화 시',
    `    if (this._pendingChordK) {
      this._pendingChordK = false;
      const key = ({ KeyH: 'h', KeyB: 'b', KeyN: 'n', KeyE: 'e', KeyD: 'd' } as Record<string, string>)[e.code];
      const cmdId = key ? chordMapK[key] : undefined;
      if (cmdId && this.dispatcher) { e.preventDefault(); this.dispatcher.dispatch(cmdId); return; }
    }
    // chord 2번째 키 — _pendingChordM 활성화 시`, 'IME chord branch');
  return code;
}

export function addCellBlockLetters(code) {
  const target = "  if (key === 'm' || event.key === 'ㅡ' || code === 'keym') {\n    return { kind: 'dispatch', commandId: 'table:cell-merge' };\n  }\n  return null;";
  return replaceOnce(lf(code), target, target.replace('  return null;',
    `  const hancom: Record<string, string> = ${JSON.stringify(CELL_BLOCK_KEYS)};\n  if (hancom[code]) return { kind: 'dispatch', commandId: hancom[code] as 'table:cell-split' };\n  return null;`), 'cell block letters');
}
