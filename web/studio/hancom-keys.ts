import type { CommandRegistry } from '@/command/registry';
import type { CommandServices, EditorContext } from '@/command/types';
import { InsertTextCommand } from '@/engine/command';

// 한글-compatible commands and the table/object keys that need the caret's
// context (the static shortcut map cannot tell a table cell from body text).

type Input = Record<string, any>;
type Dispatch = (id: string) => unknown;
type Enabled = (id: string) => boolean;

/** Shown by F1. Ctrl+M,□ stands for 한글's Ctrl+N,□ (browsers reserve Ctrl+N). */
export const SHORTCUT_GROUPS: [string, [string, string][]][] = [
  ['입력', [['표 만들기', 'Ctrl+M, T'], ['그림 넣기', 'Ctrl+M, I'], ['수식 넣기', 'Ctrl+M, M'], ['글상자', 'Ctrl+M, B'], ['각주 · 미주', 'Ctrl+M, N · Ctrl+M, E'],
    ['캡션 넣기', 'Ctrl+M, C'], ['머리말', 'Ctrl+M, H'], ['누름틀', 'Ctrl+K, E'], ['하이퍼링크', 'Ctrl+K, H'], ['책갈피', 'Ctrl+K, B'],
    ['날짜·시간 넣기', 'Ctrl+K, D'], ['문자표', 'Ctrl+F10'], ['한자 변환', 'F9']]],
  ['편집', [['되돌리기 · 다시 실행', 'Ctrl+Z · Ctrl+Shift+Z'], ['찾기', 'Ctrl+F · F2'], ['찾아 바꾸기', 'Ctrl+H · Ctrl+F2'], ['다시 찾기', 'Ctrl+L'],
    ['찾아가기', 'Alt+G'], ['모양 복사', 'Alt+C'], ['줄 뒤 지우기', 'Alt+Y'], ['지우기', 'Ctrl+E'], ['쪽 나누기', 'Ctrl+Enter · Ctrl+J'],
    ['단 나누기', 'Ctrl+Shift+Enter'], ['저장', 'Ctrl+S · Alt+S'], ['인쇄', 'Ctrl+P · Alt+P'], ['명령 찾기', 'Ctrl+/']]],
  ['서식', [['글자 모양 · 문단 모양', 'Alt+L · Alt+T'], ['스타일', 'F6'], ['진하게 · 기울임 · 밑줄', 'Ctrl+B · Ctrl+I · Ctrl+U'],
    ['위 첨자 · 아래 첨자', 'Alt+Shift+P · Alt+Shift+S'], ['글자 크게 · 작게', 'Ctrl+] · Ctrl+['], ['자간 넓게 · 좁게', 'Alt+Shift+W · Alt+Shift+N'],
    ['장평 넓게 · 좁게', 'Alt+Shift+K · Alt+Shift+J'], ['줄 간격 넓게 · 좁게', 'Alt+Shift+Z · Alt+Shift+A'], ['양쪽 · 왼쪽 정렬', 'Ctrl+Shift+M · Ctrl+Shift+L'],
    ['문단 번호 켜기·끄기', 'Ctrl+Shift+Insert'], ['문단 번호 모양', 'Ctrl+K, N'], ['편집 용지', 'F7']]],
  ['표', [['셀 블록', 'F5'], ['줄 추가 · 줄 지우기', 'Ctrl+Enter · Ctrl+Backspace'], ['줄·칸 추가 · 지우기', 'Alt+Insert · Alt+Delete'],
    ['표 빠져나가기', 'Shift+Esc'], ['다음 · 이전 셀', 'Tab · Shift+Tab'], ['셀 합치기 · 나누기 (셀 블록)', 'M · S'], ['높이 · 너비 같게 (셀 블록)', 'H · W'],
    ['표·셀 속성 (셀 블록)', 'P'], ['테두리·배경 (셀 블록)', 'L · C · B · F'], ['블록 합계 · 평균 · 곱', 'Ctrl+Shift+S · A · P'],
    ['표 나누기 · 붙이기', 'Ctrl+M, A · Ctrl+M, Z'], ['계산식', 'Ctrl+M, F']]],
  ['개체', [['개체 속성', 'P'], ['맨 앞으로 · 맨 뒤로', 'Shift+PageUp · Shift+PageDown'], ['개체 묶기 · 풀기', 'G · U']]],
  ['수식 창', [['분수 · 근호', 'Ctrl+O · Ctrl+R'], ['합 · 적분 · 극한', 'Ctrl+S · Ctrl+I · Ctrl+L'], ['괄호 · 경우 · 행렬', 'Ctrl+9 · Ctrl+0 · Ctrl+M'],
    ['다음 빈칸', 'Tab'], ['넣기', 'Ctrl+Enter · Shift+Esc']]],
];

function modal(className: string, title: string, body: HTMLElement, focusBack: () => void) {
  const dialog = document.createElement('dialog');
  dialog.className = `jakal-mini-dialog ${className}`;
  const heading = document.createElement('h2'); heading.textContent = title;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'jakal-mini-close'; close.textContent = '닫기';
  const header = document.createElement('header'); header.append(heading, close);
  dialog.append(header, body);
  const done = () => { dialog.close(); dialog.remove(); focusBack(); };
  close.addEventListener('click', done);
  dialog.addEventListener('cancel', event => { event.preventDefault(); done(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) done(); });
  document.body.append(dialog); dialog.showModal();
  return { dialog, done };
}

export function showShortcuts(focusBack: () => void) {
  const body = document.createElement('div'); body.className = 'jakal-shortcut-groups';
  const note = document.createElement('p'); note.className = 'jakal-shortcut-note';
  note.textContent = '한글의 Ctrl+N, □ 단축키는 브라우저가 새 창으로 가로채므로 Ctrl+M, □로 누릅니다. 셀 블록(F5)과 개체 선택 중에는 글자 키만 누릅니다.';
  body.append(note);
  for (const [group, items] of SHORTCUT_GROUPS) {
    const section = document.createElement('section');
    const heading = document.createElement('h3'); heading.textContent = group;
    const list = document.createElement('dl');
    for (const [label, keys] of items) {
      const term = document.createElement('dt'); term.textContent = label;
      const value = document.createElement('dd');
      for (const [index, part] of keys.split(' · ').entries()) {
        if (index) value.append(' · ');
        const kbd = document.createElement('kbd'); kbd.textContent = part; value.append(kbd);
      }
      list.append(term, value);
    }
    section.append(heading, list); body.append(section);
  }
  return modal('jakal-shortcut-dialog', '단축키', body, focusBack).dialog;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** The formats 한글's 날짜/시간 문자열 offers most often. */
export function dateFormats(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate(), w = WEEKDAYS[now.getDay()];
  const h = now.getHours(), min = String(now.getMinutes()).padStart(2, '0');
  const pad = (value: number) => String(value).padStart(2, '0');
  return [`${y}년 ${m}월 ${d}일`, `${y}년 ${m}월 ${d}일 ${w}요일`, `${y}. ${m}. ${d}.`, `${y}-${pad(m)}-${pad(d)}`,
    `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${min}`, `${y}년 ${m}월 ${d}일 ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시 ${now.getMinutes()}분`];
}

export function showDatePicker(insert: (text: string) => void, focusBack: () => void) {
  const body = document.createElement('div'); body.className = 'jakal-date-list'; body.setAttribute('role', 'listbox');
  const { dialog, done } = modal('jakal-date-dialog', '날짜·시간 넣기', body, focusBack);
  const buttons = dateFormats().map(text => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option'); button.textContent = text;
    button.addEventListener('click', () => { done(); insert(text); });
    return button;
  });
  body.append(...buttons);
  body.addEventListener('keydown', event => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(at + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
    }
  });
  buttons[0].focus();
  return dialog;
}

const inBodyCell = (input: Input) => !!input.cursor?.isInCell?.() && !input.cursor?.isInTextBox?.() && !input.getCursorPosition?.()?.isTextBox;

export function installHancomKeys(registry: CommandRegistry, getInput: () => Input | null, dispatch: Dispatch, enabled: Enabled = () => true, report?: (message: string) => void) {
  const editable = (context: EditorContext) => context.hasDocument && context.isEditable && !context.isFormMode;
  registry.register({ id: 'jakal:shortcuts', label: '단축키', shortcutLabel: 'F1', opensDialog: true, canExecute: (context: EditorContext) => context.hasDocument,
    execute: () => { showShortcuts(() => getInput()?.focus?.()); } } as any);
  registry.register({ id: 'jakal:caption', label: '캡션 넣기·빼기', shortcutLabel: 'Ctrl+M,C',
    canExecute: (context: EditorContext) => editable(context) && (context.inPictureObjectSelection || context.inTable || context.inTableObjectSelection),
    execute: (services: CommandServices) => {
      const input = services.getInputHandler() as Input | null;
      dispatch(input?.cursor?.isInPictureObjectSelection?.() ? 'insert:caption-toggle' : 'table:caption-toggle');
    } } as any);
  registry.register({ id: 'jakal:insert-date', label: '날짜·시간 넣기', shortcutLabel: 'Ctrl+K,D', opensDialog: true,
    canExecute: (context: EditorContext) => editable(context) && !context.inCellSelectionMode && !context.inPictureObjectSelection && !context.inTableObjectSelection,
    execute: (services: CommandServices) => {
      const input = services.getInputHandler() as Input | null; if (!input) return;
      showDatePicker(text => {
        try {
          if (input.cursor?.hasSelection?.()) input.deleteSelection?.();
          input.executeOperation({ kind: 'command', command: new InsertTextCommand(input.getCursorPosition(), text, Date.now(), input.getPendingCharShape?.()) });
        } catch (error) { report?.('날짜를 넣지 못했습니다. 입력 위치를 다시 클릭하세요.'); console.warn(error); }
        input.focus?.();
      }, () => input.focus?.());
    } } as any);
  registry.register({ id: 'jakal:delete-line-end', label: '줄 뒤 지우기', shortcutLabel: 'Alt+Y',
    canExecute: (context: EditorContext) => editable(context) && !context.inCellSelectionMode && !context.inPictureObjectSelection && !context.inTableObjectSelection,
    execute: (services: CommandServices) => {
      const input = services.getInputHandler() as Input | null; const cursor = input?.cursor; if (!input || !cursor) return;
      if (!cursor.hasSelection()) { cursor.setAnchor(); cursor.moveToLineEnd(); }
      if (cursor.hasSelection()) input.deleteSelection();
      else { cursor.clearSelection?.(); input.updateCaret?.(); }
      input.focus?.();
    } } as any);
  registry.register({ id: 'jakal:exit-table', label: '표 빠져나가기', shortcutLabel: 'Shift+Esc',
    canExecute: (context: EditorContext) => context.hasDocument && context.inTable,
    execute: (services: CommandServices) => {
      const input = services.getInputHandler() as Input | null; if (!input || !inBodyCell(input)) return;
      const position = input.getCursorPosition(), wasm = services.wasm as any;
      const section = position.sectionIndex, paragraph = position.parentParaIndex;
      if (paragraph === undefined) return;
      try {
        if (paragraph + 1 >= wasm.getParagraphCount(section)) {
          input.executeOperation({ kind: 'snapshot', operationType: 'jakalExitTable', operation: (engine: any) => {
            engine.ensureTrailingParagraph?.(section, paragraph);
            return { sectionIndex: section, paragraphIndex: paragraph + 1, charOffset: 0 };
          } });
        } else input.moveCursorTo({ sectionIndex: section, paragraphIndex: paragraph + 1, charOffset: 0 });
      } catch (error) { report?.('표 밖으로 나가지 못했습니다.'); console.warn(error); }
      input.focus?.();
    } } as any);

  // Keys that mean something else outside a table/object; decided here before the editor sees them.
  document.addEventListener('keydown', event => {
    const input = getInput();
    if (!input || event.target !== input.textarea || event.isComposing || event.keyCode === 229 || input.isComposing) return;
    const cursor = input.cursor; if (!cursor) return;
    const ctrl = event.ctrlKey || event.metaKey;
    // Only an executable command consumes the key; otherwise the editor handles it as before.
    const run = (id: string) => { if (!enabled(id)) return; event.preventDefault(); event.stopImmediatePropagation(); dispatch(id); };
    if (cursor.isInPictureObjectSelection?.() && !ctrl && !event.altKey) {
      if (event.shiftKey && event.key === 'PageUp') return run('insert:arrange-front');
      if (event.shiftKey && event.key === 'PageDown') return run('insert:arrange-back');
      if (!event.shiftKey && event.code === 'KeyG') return run('insert:group-shapes');
      if (!event.shiftKey && event.code === 'KeyU') return run('insert:ungroup-shapes');
    }
    if (!inBodyCell(input) && !cursor.isInCellSelectionMode?.()) return;
    if (ctrl && !event.shiftKey && !event.altKey && event.key === 'Enter') return run('table:insert-row-below');
    if (ctrl && !event.shiftKey && !event.altKey && event.key === 'Backspace' && !cursor.hasSelection?.()) return run('table:delete-row');
    if (event.shiftKey && !ctrl && !event.altKey && event.key === 'Escape') return run('jakal:exit-table');
  }, true);
}
