import type { CommandRegistry } from '@/command/registry';
import type { CommandServices, EditorContext } from '@/command/types';
import { appendSvgMarkup } from '@/ui/dom-utils';
import { latexToHwp, hwpToLatex, normalizeHwpScript, stripMathDelimiters } from './latex-equation.ts';

// LaTeX-first equation input. The document keeps Hancom's equation script
// (converted on save) so 한글 opens the equation unchanged.

export type EquationValue = { script: string; fontSize: number; color: number; scriptChanged: boolean };
type Mode = 'latex' | 'hwp';
type Template = [label: string, latex: string, title?: string];
type DialogOptions = {
  title: string; submitLabel: string;
  script?: string; latex?: string; fontSize?: number; color?: number;
  render: (script: string, fontSize: number, color: number) => string;
  onSubmit: (value: EquationValue) => void; onClose: () => void;
};

const MAX_SCRIPT = 8000;
const GREEK_GLYPH: Record<string, number> = { alpha: 0x3b1, beta: 0x3b2, gamma: 0x3b3, delta: 0x3b4, epsilon: 0x3b5, theta: 0x3b8, lambda: 0x3bb,
  mu: 0x3bc, pi: 0x3c0, rho: 0x3c1, sigma: 0x3c3, tau: 0x3c4, phi: 0x3c6, omega: 0x3c9, Gamma: 0x393, Delta: 0x394, Theta: 0x398, Lambda: 0x39b,
  Sigma: 0x3a3, Phi: 0x3a6, Omega: 0x3a9 };
const TEMPLATE_GROUPS: [string, Template[]][] = [
  ['구조', [['a/b', '\\frac{}{}', '분수 (Ctrl+O)'], ['x²', '{}^{}', '위 첨자 (^)'], ['x₂', '{}_{}', '아래 첨자 (_)'], ['√', '\\sqrt{}', '제곱근 (Ctrl+R)'],
    ['ⁿ√', '\\sqrt[]{}', '거듭제곱근'], ['Σ', '\\sum_{}^{}', '합 (Ctrl+S)'], ['∫', '\\int_{}^{}', '적분 (Ctrl+I)'], ['lim', '\\lim_{}', '극한 (Ctrl+L)'],
    ['( )', '\\left( {} \\right)', '괄호 (Ctrl+9)'], ['[ ]', '\\left[ {} \\right]', '대괄호'], ['{ }', '\\left\\{ {} \\right\\}', '중괄호'], ['|x|', '\\left| {} \\right|', '절댓값'],
    ['행렬', '\\begin{pmatrix} {} & {} \\\\ {} & {} \\end{pmatrix}', '행렬 (Ctrl+M)'], ['경우', '\\begin{cases} {} & {} \\\\ {} & {} \\end{cases}', '경우 (Ctrl+0)'],
    ['ₙCᵣ', '\\binom{}{}', '조합'], ['log', '\\log_{}{}', '로그'], ['텍스트', '\\text{}', '글자 그대로']]],
  ['그리스', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Omega'].map(name => [String.fromCodePoint(GREEK_GLYPH[name]), `\\${name}`] as Template)],
  ['연산·관계', [['±', '\\pm'], ['×', '\\times'], ['÷', '\\div'], ['·', '\\cdot'], ['≠', '\\neq'], ['≤', '\\leq'], ['≥', '\\geq'], ['≈', '\\approx'],
    ['≡', '\\equiv'], ['∝', '\\propto'], ['∞', '\\infty'], ['∂', '\\partial'], ['∈', '\\in'], ['∉', '\\notin'], ['⊂', '\\subset'], ['⊆', '\\subseteq'],
    ['∪', '\\cup'], ['∩', '\\cap'], ['∀', '\\forall'], ['∃', '\\exists'], ['∴', '\\therefore'], ['∵', '\\because'], ['∠', '\\angle'], ['△', '\\triangle'],
    ['⊥', '\\perp'], ['°', '^{\\circ}'], ['′', '\''], ['…', '\\cdots']]],
  ['화살표', [['→', '\\rightarrow'], ['←', '\\leftarrow'], ['↔', '\\leftrightarrow'], ['⇒', '\\Rightarrow'], ['⇐', '\\Leftarrow'], ['⇔', '\\Leftrightarrow'],
    ['↑', '\\uparrow'], ['↓', '\\downarrow'], ['↦', '\\mapsto']]],
  ['함수', ['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det'].map(name => [name, `\\${name}`] as Template)],
  ['꾸밈', [['â', '\\hat{}'], ['ā', '\\bar{}'], ['a⃗', '\\vec{}', '벡터'], ['ȧ', '\\dot{}'], ['ã', '\\tilde{}'], ['a̅', '\\overline{}', '윗줄 (Ctrl+D)'],
    ['a̲', '\\underline{}', '밑줄'], ['ℝ', '\\mathbb{R}'], ['rm', '\\mathrm{}', '바로 선 글자'], ['𝐁', '\\mathbf{}', '굵은 글자']]],
];
/** Hancom's equation-editor shortcuts, inserting the LaTeX form. */
const KEY_TEMPLATES: Record<string, string> = { o: '\\frac{}{}', r: '\\sqrt{}', s: '\\sum_{}^{}', i: '\\int_{}^{}', l: '\\lim_{}',
  '9': '\\left( {} \\right)', '0': '\\begin{cases} {} & {} \\\\ {} & {} \\end{cases}', m: '\\begin{pmatrix} {} & {} \\\\ {} & {} \\end{pmatrix}',
  d: '\\overline{}', p: '\\begin{gathered} {} \\\\ {} \\end{gathered}' };

function hex(color: number) {
  const value = color >>> 0;
  return `#${[value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff].map(part => part.toString(16).padStart(2, '0')).join('')}`;
}
function colorRef(hexColor: string) {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hexColor.slice(at, at + 2), 16) || 0);
  return (b << 16) | (g << 8) | r;
}

/** Converts LaTeX for storage; `faithful` is false when the conversion cannot render the same equation. */
export function scriptFromLatex(latex: string) { return latexToHwp(latex); }

/** LaTeX for an existing Hancom script, or null when LaTeX would draw it differently. */
export function latexForScript(script: string, render: (script: string) => string): string | null {
  if (!script.trim()) return '';
  try {
    const latex = hwpToLatex(script);
    return render(normalizeHwpScript(script)) === render(latexToHwp(latex).script) ? latex : null;
  } catch { return null; }
}

/** Inserts `template` at the selection; a selection goes into the first `{}`. */
export function insertTemplate(area: Pick<HTMLTextAreaElement, 'value' | 'selectionStart' | 'selectionEnd'>, template: string) {
  const start = area.selectionStart, end = area.selectionEnd;
  const selected = area.value.slice(start, end);
  let text = template;
  if (selected && text.includes('{}')) text = text.replace('{}', `{${selected}}`);
  const before = area.value.slice(0, start), after = area.value.slice(end);
  // `\alpha` followed by a typed letter would become an unknown `\alphab`.
  const pad = /^\\[A-Za-z]+$/.test(text) && (!after || /^[A-Za-z]/.test(after)) ? ' ' : '';
  area.value = before + text + pad + after;
  const hole = text.indexOf('{}');
  const caret = start + (hole >= 0 ? hole + 1 : text.length + pad.length);
  area.selectionStart = area.selectionEnd = caret;
}

/** Moves to the next (or previous) empty `{}` placeholder. Returns false when there is none. */
export function jumpPlaceholder(area: Pick<HTMLTextAreaElement, 'value' | 'selectionStart' | 'selectionEnd'>, backwards = false) {
  const from = area.selectionStart;
  const at = backwards ? area.value.lastIndexOf('{}', Math.max(0, from - 2)) : area.value.indexOf('{}', from);
  if (at < 0 || (backwards && at + 1 >= from)) return false;
  area.selectionStart = area.selectionEnd = at + 1;
  return true;
}

export function showEquationDialog(options: DialogOptions) {
  const dialog = document.createElement('dialog');
  dialog.className = 'jakal-eq-dialog';
  dialog.setAttribute('aria-labelledby', 'jakal-eq-title');
  dialog.innerHTML = `<form method="dialog">
    <header><h2 id="jakal-eq-title"></h2>
      <div class="jakal-eq-mode" role="radiogroup" aria-label="입력 방식">
        <button type="button" role="radio" data-mode="latex">LaTeX</button><button type="button" role="radio" data-mode="hwp">한글 수식</button>
      </div></header>
    <div class="jakal-eq-tabs" role="tablist" aria-label="수식 도구"></div>
    <div class="jakal-eq-palette" role="toolbar" aria-label="넣을 기호"></div>
    <div class="jakal-eq-preview" aria-live="polite"></div>
    <label class="jakal-eq-label"><span></span><textarea spellcheck="false" autocomplete="off" rows="4"></textarea></label>
    <p class="jakal-eq-note" role="status"></p>
    <div class="jakal-eq-props">
      <label>글자 크기 <input name="size" type="number" min="1" max="127" step="1"> pt</label>
      <label>색 <input name="color" type="color"></label>
      <span class="jakal-eq-keys">Tab 다음 빈칸 · Ctrl+Enter 넣기</span>
    </div>
    <footer><button type="button" data-cancel>취소</button><button type="submit" data-submit></button></footer>
  </form>`;
  dialog.querySelector('h2')!.textContent = options.title;
  const area = dialog.querySelector('textarea')!;
  const label = dialog.querySelector('.jakal-eq-label > span')!;
  const preview = dialog.querySelector<HTMLElement>('.jakal-eq-preview')!;
  const note = dialog.querySelector<HTMLElement>('.jakal-eq-note')!;
  const size = dialog.querySelector<HTMLInputElement>('[name="size"]')!;
  const color = dialog.querySelector<HTMLInputElement>('[name="color"]')!;
  const submit = dialog.querySelector<HTMLButtonElement>('[data-submit]')!;
  const tabs = dialog.querySelector<HTMLElement>('.jakal-eq-tabs')!;
  const palette = dialog.querySelector<HTMLElement>('.jakal-eq-palette')!;
  submit.textContent = options.submitLabel;
  area.maxLength = MAX_SCRIPT;
  size.value = String(Math.round((options.fontSize ?? 1000) / 100));
  color.value = hex(options.color ?? 0);
  const render = (script: string) => options.render(script, Math.max(1, size.valueAsNumber || 10) * 100, colorRef(color.value));

  let mode: Mode = 'latex', initialText = '', initialMode: Mode = 'latex', fallbackNote = '';
  if (options.latex !== undefined) { area.value = stripMathDelimiters(options.latex); }
  else if (options.script) {
    const latex = latexForScript(options.script, render);
    if (latex === null) { mode = 'hwp'; area.value = options.script; fallbackNote = '이 수식은 LaTeX로 옮기면 모양이 달라질 수 있어 한글 수식으로 열었습니다.'; }
    else area.value = latex;
  }
  initialText = area.value; initialMode = mode;

  const currentScript = () => mode === 'latex' ? latexToHwp(area.value) : { script: area.value.trim(), unsupported: [] as string[] };
  let timer = 0;
  const update = () => {
    timer = 0;
    const { script, unsupported } = currentScript();
    const tooLong = script.length > MAX_SCRIPT;
    submit.disabled = !script || tooLong;
    if (!script) preview.replaceChildren(Object.assign(document.createElement('span'), { className: 'jakal-eq-empty', textContent: mode === 'latex' ? '예: \\frac{1}{2}, x^2, \\sqrt{x}' : '예: {1} over {2}, x^2, sqrt x' }));
    else {
      try {
        const svg = render(script); preview.replaceChildren(); appendSvgMarkup(preview, svg);
        // Draw the 10pt preview larger; the viewBox keeps it sharp.
        const node = preview.querySelector('svg');
        for (const name of ['width', 'height']) { const value = Number.parseFloat(node?.getAttribute(name) ?? ''); if (node && value > 0) node.setAttribute(name, String(Math.round(value * 1.8))); }
      }
      catch { preview.replaceChildren(Object.assign(document.createElement('span'), { className: 'jakal-eq-error', textContent: '수식을 그릴 수 없습니다. 괄호 짝을 확인하세요.' })); }
    }
    const messages = [];
    if (fallbackNote && mode === 'hwp') messages.push(fallbackNote);
    if (unsupported.length) messages.push(`한글 수식에 없는 명령은 글자로 넣습니다: ${unsupported.slice(0, 4).join(' ')}`);
    if (tooLong) messages.push('수식이 너무 깁니다. 나누어 입력하세요.');
    if (mode === 'latex' && script && !messages.length) messages.push(`한글 수식으로 저장: ${script.length > 90 ? `${script.slice(0, 90)}…` : script}`);
    note.textContent = messages.join(' ');
    note.classList.toggle('jakal-eq-warning', unsupported.length > 0 || tooLong || (!!fallbackNote && mode === 'hwp'));
  };
  const schedule = () => { if (timer) clearTimeout(timer); timer = window.setTimeout(update, 120); };

  const setMode = (next: Mode, convert = true) => {
    if (convert && next !== mode) {
      if (next === 'hwp') area.value = latexToHwp(area.value).script;
      else { const latex = latexForScript(area.value, render); area.value = latex ?? hwpToLatex(area.value); if (latex === null && area.value) fallbackNote = ''; }
    }
    mode = next;
    label.textContent = mode === 'latex' ? 'LaTeX' : '한글 수식 스크립트';
    area.placeholder = mode === 'latex' ? '\\frac{a}{b} + \\sqrt{x}' : '{a} over {b} + sqrt x';
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.setAttribute('aria-checked', String(button.dataset.mode === mode));
    update();
  };
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.addEventListener('click', () => { setMode(button.dataset.mode as Mode); area.focus(); });

  const insert = (latex: string) => {
    insertTemplate(area, mode === 'latex' ? latex : latexToHwp(latex).script);
    area.focus(); schedule();
  };
  let activeGroup = 0;
  const showGroup = (index: number) => {
    activeGroup = index;
    for (const [i, tab] of [...tabs.children].entries()) tab.setAttribute('aria-selected', String(i === index));
    palette.replaceChildren(...TEMPLATE_GROUPS[index][1].map(([text, latex, title]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.title = title ? `${title} · ${latex}` : latex; button.addEventListener('click', () => insert(latex));
      return button;
    }));
  };
  TEMPLATE_GROUPS.forEach(([name], index) => {
    const tab = document.createElement('button'); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.textContent = name;
    tab.addEventListener('click', () => showGroup(index)); tabs.append(tab);
  });
  showGroup(activeGroup);

  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    window.removeEventListener('keydown', keys, true);
    if (timer) clearTimeout(timer);
    dialog.close(); dialog.remove(); options.onClose();
  };
  const accept = () => {
    const { script } = currentScript();
    if (!script || script.length > MAX_SCRIPT) return;
    const scriptChanged = !(mode === initialMode && area.value === initialText && options.script !== undefined);
    try {
      options.onSubmit({ script: scriptChanged ? script : options.script!, fontSize: Math.min(127, Math.max(1, size.valueAsNumber || 10)) * 100, color: colorRef(color.value), scriptChanged });
      close();
    } catch (error) {
      note.textContent = error instanceof Error ? error.message : String(error); note.classList.add('jakal-eq-warning');
    }
  };
  // Window capture runs before the editor's and the host's document shortcuts (Ctrl+S, F9…).
  function keys(event: KeyboardEvent) {
    if (!dialog.contains(event.target as Node)) return;
    event.stopPropagation();
    const ctrl = event.ctrlKey || event.metaKey;
    if ((ctrl && event.key === 'Enter') || (event.shiftKey && event.key === 'Escape')) { event.preventDefault(); accept(); return; }
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.target !== area) return;
    const key = event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : event.code.startsWith('Digit') ? event.code.slice(5) : '';
    if (ctrl && !event.altKey && !event.shiftKey && KEY_TEMPLATES[key]) { event.preventDefault(); insert(KEY_TEMPLATES[key]); return; }
    if (event.key === 'Tab' && !ctrl && !event.altKey && jumpPlaceholder(area, event.shiftKey)) event.preventDefault();
  }
  window.addEventListener('keydown', keys, true);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector('[data-cancel]')!.addEventListener('click', close);
  dialog.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); accept(); });
  area.addEventListener('input', schedule);
  size.addEventListener('input', schedule); color.addEventListener('input', schedule);
  area.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain');
    if (mode !== 'latex' || !text) return;
    // Formulas copied from documents or chats often keep their $…$ / \[…\] delimiters.
    const stripped = stripMathDelimiters(text);
    if (stripped === text.trim()) return;
    event.preventDefault();
    area.setRangeText(stripped, area.selectionStart, area.selectionEnd, 'end');
    schedule();
  });

  document.body.append(dialog);
  dialog.showModal();
  setMode(mode, false);
  area.focus(); area.selectionStart = area.selectionEnd = area.value.length;
  return dialog;
}

// InputHandler keeps cursor/deleteSelection private; the studio calls them at runtime.
type Input = Record<string, any>;
type EquationEngine = CommandServices['wasm'] & Record<string, any>;
const containerKey = (p: any) => JSON.stringify([p?.sectionIndex, p?.paragraphIndex, p?.parentParaIndex ?? null, p?.controlIndex ?? null, p?.cellIndex ?? null,
  (p?.cellPath ?? []).map((step: any) => [step.controlIndex, step.cellIndex, step.cellParaIndex]), p?.cellParaIndex ?? null]);

/** Text of a selection inside one paragraph or cell paragraph, else ''. */
function selectedText(input: Input, wasm: EquationEngine) {
  const cursor = input.cursor;
  if (!cursor?.hasSelection?.()) return '';
  const range = cursor.getSelectionOrdered?.();
  if (!range || containerKey(range.start) !== containerKey(range.end)) return '';
  const { start, end } = range, count = end.charOffset - start.charOffset;
  if (count <= 0 || count > 4000) return '';
  try {
    if (start.parentParaIndex === undefined) return wasm.getTextRange(start.sectionIndex, start.paragraphIndex, start.charOffset, count);
    const path = start.cellPath?.length ? start.cellPath : [{ controlIndex: start.controlIndex, cellIndex: start.cellIndex, cellParaIndex: start.cellParaIndex }];
    return wasm.getTextInCellByPath(start.sectionIndex, start.parentParaIndex, JSON.stringify(path), start.charOffset, count);
  } catch { return ''; }
}

export function installEquationTools(registry: CommandRegistry, getInput: () => Input | null, report?: (message: string) => void) {
  const original = registry.get('insert:equation');
  const originalEdit = registry.get('insert:equation-edit');
  const insertable = (context: EditorContext) => {
    const cursor = getInput()?.cursor;
    return !!cursor && context.hasDocument && context.isEditable && !context.isFormMode && !context.inCellSelectionMode
      && !context.inPictureObjectSelection && !context.inTableObjectSelection
      && !cursor.isInHeaderFooter?.() && !cursor.isInFootnote?.() && !cursor.isInTextBox?.();
  };
  registry.register({
    ...(original ?? {}), id: 'insert:equation', label: '수식', shortcutLabel: 'Ctrl+M,M', opensDialog: true, canExecute: insertable,
    execute(services: CommandServices) {
      const input = services.getInputHandler() as Input | null; if (!input) return;
      const wasm = services.wasm as EquationEngine;
      const generation = wasm.documentGeneration;
      const text = selectedText(input, wasm);
      const replace = !!text;
      const anchor = structuredClone(replace ? input.cursor.getSelectionOrdered().start : input.getCursorPosition());
      showEquationDialog({
        title: replace ? '선택한 글을 수식으로' : '수식 넣기', submitLabel: '넣기', latex: text,
        render: (script, size, color) => wasm.renderEquationPreview(script, size, color),
        onClose: () => input.focus(),
        onSubmit: ({ script, fontSize, color }) => {
          if (generation !== wasm.documentGeneration) throw new Error('문서가 바뀌었습니다. 수식을 넣을 위치를 다시 선택하세요.');
          input.executeOperation({ kind: 'snapshot', operationType: 'jakalInsertEquation', operation: (engine: any) => {
            let at = anchor;
            if (replace) { input.deleteSelection?.({ deferRecord: true }); at = structuredClone(input.getCursorPosition()); }
            if (at.parentParaIndex !== undefined && at.cellIndex !== undefined && at.cellIndex >= 0 && !at.isTextBox) {
              return engine.insertCellEquation(at, { script, fontSize, color });
            }
            const result = engine.insertEquation(at.sectionIndex, at.paragraphIndex, at.charOffset, script, fontSize, color);
            if (!result?.ok) throw new Error('수식을 넣지 못했습니다. 입력 위치를 다시 선택하세요.');
            return { sectionIndex: at.sectionIndex, paragraphIndex: result.paraIdx ?? at.paragraphIndex, charOffset: at.charOffset + 1 };
          } });
        },
      });
    },
  } as any);
  if (!originalEdit) return;
  registry.register({
    ...originalEdit, label: '수식 고치기',
    execute(services: CommandServices) {
      const input = services.getInputHandler() as Input | null;
      const ref = input?.getSelectedPictureRef?.();
      // Footnote, header/footer, nested-cell and legacy OLE equations keep the runtime editor.
      if (!input || !ref || ref.type !== 'equation' || ref.noteRef || ref.headerFooter || (ref.cellPath?.length ?? 0) > 1) { originalEdit.execute(services); return; }
      const wasm = services.wasm as EquationEngine;
      let props: { script: string; fontSize: number; color: number };
      try { props = wasm.getEquationProperties(ref.sec, ref.ppi, ref.ci, ref.cellIdx, ref.cellParaIdx); }
      catch { originalEdit.execute(services); return; }
      const generation = wasm.documentGeneration;
      showEquationDialog({
        title: '수식 고치기', submitLabel: '고치기', script: props.script, fontSize: props.fontSize, color: props.color,
        render: (script, size, color) => wasm.renderEquationPreview(script, size, color),
        onClose: () => input.focus(),
        onSubmit: ({ script, fontSize, color, scriptChanged }) => {
          if (generation !== wasm.documentGeneration) throw new Error('문서가 바뀌었습니다. 수식을 다시 선택하세요.');
          const updated: Record<string, unknown> = {};
          if (scriptChanged && script !== props.script) updated.script = script;
          if (fontSize !== props.fontSize) updated.fontSize = fontSize;
          if (color !== props.color) updated.color = color;
          if (!Object.keys(updated).length) return;
          try {
            input.executeOperation({ kind: 'snapshot', operationType: 'equationEdit', operation: (engine: any) => {
              const result = engine.setEquationProperties(ref.sec, ref.ppi, ref.ci, ref.cellIdx, ref.cellParaIdx, updated);
              if (result && result.ok === false) throw new Error('수식을 고치지 못했습니다.');
              return input.getCursorPosition();
            } });
          } catch (error) { report?.(error instanceof Error ? error.message : String(error)); throw error; }
        },
      });
    },
  } as any);
}
