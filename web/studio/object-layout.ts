import type { CommandRegistry } from '@/command/registry';
import type { CommandServices, EditorContext } from '@/command/types';
import { chartTargetFromSelection, matchChartRef } from '@/core/chart-data-target';
import { getObjectProps } from '@/engine/object-props';
import { commandIcon } from './command-icons';

type Input = NonNullable<ReturnType<CommandServices['getInputHandler']>>;
type Kind = 'table' | 'image' | 'chart' | 'object';
type Selection = { kind: Kind; key: string; multiple?: boolean; type?: string; nested?: boolean };
/** [command, accessible name, optional shorter visible caption] */
type Action = [id: string, label: string, caption?: string];
type Group = { label: string; actions: Action[] };
const titles: Record<Kind, string> = { table: '표 레이아웃', image: '그림 레이아웃', chart: '차트 레이아웃', object: '개체 레이아웃' };

export function resolveLayoutSelection(context: EditorContext, input: Input | null, wasm: CommandServices['wasm']): Selection | null {
  if (!context.hasDocument || !input) return null;
  // A picture inside a table takes precedence over the enclosing cell.
  if (context.inPictureObjectSelection) {
    const ref = input.getSelectedPictureRef();
    if (!ref) return null;
    const multiple = (input.getSelectedPictureRefs?.().length ?? 1) > 1;
    let kind: Kind = ref.type === 'image' ? 'image' : 'object';
    if (multiple) kind = 'object';
    else if (ref.type === 'ole') {
      try {
        const target = chartTargetFromSelection(ref);
        if (target && matchChartRef(wasm.listCharts(), target)) kind = 'chart';
      } catch { /* Unrecognized OLEs keep the generic object tools. */ }
    }
    return { kind, key: JSON.stringify([ref, multiple]), multiple, type: ref.type };
  }
  if (context.inTable || context.inCellSelectionMode || context.inTableObjectSelection) {
    const ref = context.inTableObjectSelection ? input.getSelectedTableRef() : null;
    const pos = input.getCursorPosition();
    return { kind: 'table', nested: !ref && (pos.cellPath?.length ?? 0) > 1, key: JSON.stringify(ref ?? [pos.sectionIndex, pos.parentParaIndex, pos.controlIndex,
      pos.cellPath?.map((entry, index, path) => [entry.controlIndex, index < path.length - 1 ? entry.cellIndex : null, index < path.length - 1 ? entry.cellParaIndex : null])]) };
  }
  return null;
}

const placementCommands: Record<string, boolean> = { 'table:inline': true, 'table:floating': false, 'insert:picture-inline': true, 'insert:picture-floating': false };

/** Whether the selected table/picture is placed like a character (true), floats
 * with the text (false) or cannot be read (null). Used for the pressed state. */
export function readPlacement(selection: Selection | null, input: Input | null, wasm: CommandServices['wasm']): boolean | null {
  if (!selection || !input) return null;
  try {
    if (selection.kind === 'table') {
      if (selection.nested) return null;
      const ref = input.getSelectedTableRef?.(), position = input.getCursorPosition();
      const sec = ref?.sec ?? position.sectionIndex, para = ref?.ppi ?? position.parentParaIndex, control = ref?.ci ?? position.controlIndex;
      if (para === undefined || control === undefined || typeof (wasm as any).getTableProperties !== 'function') return null;
      const value = (wasm as any).getTableProperties(sec, para, control)?.treatAsChar;
      return typeof value === 'boolean' ? value : null;
    }
    if (selection.type !== 'image' || selection.multiple) return null;
    const ref = input.getSelectedPictureRef() as any;
    if (!ref) return null;
    const cellPath = ref.cellPath ?? (ref.cellIdx !== undefined && ref.cellParaIdx !== undefined && ref.outerTableControlIdx !== undefined
      ? [{ controlIdx: ref.outerTableControlIdx, cellIdx: ref.cellIdx, cellParaIdx: ref.cellParaIdx }] : undefined);
    const value = getObjectProps(wasm, { ...ref, cellPath })?.treatAsChar;
    return typeof value === 'boolean' ? value : null;
  } catch { return null; }
}

function groupsFor(selection: Selection): Group[] {
  if (selection.kind === 'table') return [
    { label: '본문 배치', actions: [['table:inline','글자처럼 취급'],['table:floating','본문과 어울리기']] },
    { label: '속성', actions: [['table:cell-props', '표·셀 속성'], ['table:border-each', '테두리·배경']] },
    { label: '칸 선택·편집', actions: [['table:select-cells', '셀 선택 (F5)', '셀 선택'], ['table:cell-split', '칸 나누기'], ['table:cell-merge', '칸 합치기']] },
    { label: '줄·칸 추가', actions: [['table:insert-row-above', '위에 줄'], ['table:insert-row-below', '아래에 줄'], ['table:insert-col-left', '왼쪽에 칸'], ['table:insert-col-right', '오른쪽에 칸']] },
    { label: '표 안에 표', actions: [['table:create-nested', '표 안에 새 표 넣기', '표 넣기'], ['table:parent-cell', '상위 칸으로']] },
  ];
  if (selection.multiple) return [{ label: '개체 묶기', actions: [['insert:group-shapes', '개체 묶기']] }];
  const groups: Group[] = [{ label: '크기·위치·배치', actions: [['insert:picture-props', selection.kind === 'chart' ? '차트 크기·배치' : '크기·배치·여백', '속성']] }];
  if (selection.type === 'image') groups.unshift({label:'본문 배치',actions:[['insert:picture-inline','글자처럼 취급'],['insert:picture-floating','본문과 어울리기']]});
  if (selection.kind === 'chart') groups.push({ label: '차트', actions: [['insert:chart-data-edit', '차트 데이터 편집']] });
  if (selection.type === 'image' || selection.type === 'shape' || selection.type === 'line') {
    groups.push({ label: '회전·대칭', actions: [['insert:rotate-ccw', '왼쪽으로 90° 회전', '왼쪽 90°'], ['insert:rotate-cw', '오른쪽으로 90° 회전', '오른쪽 90°'], ['insert:flip-horz', '좌우 뒤집기', '좌우 대칭'], ['insert:flip-vert', '상하 뒤집기', '상하 대칭']] });
  }
  if (selection.type === 'shape') groups.push({ label: '순서', actions: [['insert:arrange-front', '맨 앞으로'], ['insert:arrange-back', '맨 뒤로']] });
  if (selection.type === 'equation') groups.push({ label: '수식', actions: [['insert:equation-edit', '수식 편집']] });
  return groups;
}

export function installObjectLayout(registry: CommandRegistry, dispatcher: { dispatch: (id: string, params?: Record<string, unknown>) => boolean },
  events: { on: (event: string, listener: () => void) => unknown }, getContext: () => EditorContext,
  getInput: () => Input | null, wasm: CommandServices['wasm']) {
  const header = document.getElementById('studio-header');
  if (!header || header.querySelector('.jakal-object-layout')) return;
  const menu = document.getElementById('menu-bar');
  const region = document.createElement('section'); region.className = 'jakal-object-layout';
  region.setAttribute('aria-label', '개체 레이아웃');
  const tabs = document.createElement('div'); tabs.className = 'jakal-layout-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '선택한 개체 도구');
  const tab = document.createElement('button'); tab.type = 'button'; tab.id = 'jakal-layout-tab'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'jakal-layout-panel');
  tab.className = 'jakal-layout-tab menu-command'; tab.dataset.cmd = 'view:object-layout';
  const toolMenu = menu?.querySelector('[data-menu="tool"]');
  if (toolMenu) toolMenu.after(tabs); else (menu ?? header).append(tabs);
  const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'jakal-layout-collapse';
  const panel = document.createElement('div'); panel.id = 'jakal-layout-panel'; panel.className = 'jakal-layout-panel'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
  tabs.append(tab); region.append(collapse, panel);
  // The contextual tools replace the usual toolbar, rather than adding a
  // second tab row below it. MenuBar dispatches this tab and closes its menus.
  if (menu) menu.after(region); else header.append(region);
  let selected: Selection | null = null, expanded = true, manual = false, rendered = '';
  let selectionCache = '', cachedSelection: Selection | null = null, placement: boolean | null = null;
  const buttons = new Map<string, HTMLButtonElement>();
  function render(selection: Selection | null) {
    panel.replaceChildren(); buttons.clear();
    if (selection) for (const group of groupsFor(selection)) {
      const area = document.createElement('div'); area.className = 'jakal-layout-group'; area.setAttribute('role', 'group'); area.setAttribute('aria-label', group.label);
      const actions = document.createElement('div');
      for (const [id, label, caption] of group.actions) {
        if (!registry.get(id)) continue;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.command = id;
        const text = document.createElement('span'); text.className = 'jakal-layout-label'; text.textContent = caption ?? label;
        button.append(commandIcon(id), text);
        button.setAttribute('aria-label', label); button.title = label;
        if (id in placementCommands) button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          dispatcher.dispatch(id, { anchorEl: button });
          if (id in placementCommands) selectionCache = ''; // Re-read the placement now.
          update();
        });
        actions.append(button); buttons.set(id, button);
      }
      if (!actions.childElementCount) continue;
      const label = document.createElement('small'); label.textContent = group.label; area.append(actions, label); panel.append(area);
    }
    const hint = document.createElement('p'); hint.className = 'jakal-layout-hint';
    hint.textContent = !selection ? '문서에서 표의 칸이나 테두리, 그림, 차트를 클릭하세요. 선택한 개체의 레이아웃 도구가 여기에 나타납니다.'
      : selection.kind === 'table' ? '다른 셀까지 드래그하면 여러 칸을 선택합니다. 같은 셀 안에서는 글자를 선택합니다. F5로 셀 선택을 시작할 수도 있습니다.'
      : selection.kind === 'chart' ? '크기·위치·본문 배치는 속성에서, 계열과 값은 데이터 편집에서 변경합니다.'
      : selection.multiple ? '여러 개체가 선택되어 있습니다. 개별 크기와 배치를 바꾸려면 하나만 선택하세요.'
      : '속성에서 크기, 위치, 본문과의 배치 및 여백을 설정하세요.';
    panel.append(hint);
  }
  function update() {
    const context = getContext(), input = getInput();
    // Chart enumeration is needed only when selection or document content changes.
    const cache = JSON.stringify([context.hasDocument, context.inPictureObjectSelection, context.inTable, context.inCellSelectionMode,
      context.inTableObjectSelection, input?.getSelectedPictureRef?.(), input?.getSelectedPictureRefs?.(), input?.getSelectedTableRef?.(), input?.getCursorPosition?.(), wasm.documentGeneration]);
    if (cache !== selectionCache) {
      cachedSelection = resolveLayoutSelection(context, input, wasm); selectionCache = cache;
      placement = readPlacement(cachedSelection, input, wasm);
    }
    const next = cachedSelection;
    if (next?.key !== selected?.key || next?.kind !== selected?.kind) {
      expanded = true;
      if (next) manual = false;
    }
    selected = next;
    const signature = JSON.stringify([next?.kind, next?.multiple, next?.type, next?.nested]);
    if (signature !== rendered) { rendered = signature; render(next); }
    const wasHidden = tabs.hidden;
    tabs.hidden = !context.hasDocument || (!next && !manual);
    // On narrow screens the menu row scrolls without a visible scrollbar; keep
    // the newly shown contextual tab in view instead of past the right edge.
    if (wasHidden && !tabs.hidden && menu && menu.scrollWidth > menu.clientWidth) {
      const overflow = tabs.getBoundingClientRect().right - menu.getBoundingClientRect().right;
      if (overflow > 0) menu.scrollLeft += overflow + 8;
    }
    region.hidden = tabs.hidden || !expanded;
    header.classList.toggle('jakal-layout-active', !region.hidden);
    panel.hidden = !expanded;
    tab.textContent = next ? titles[next.kind] : '개체 레이아웃';
    tab.setAttribute('aria-selected', String(expanded));
    tab.setAttribute('aria-expanded', String(expanded));
    tab.disabled = !context.hasDocument;
    collapse.textContent = expanded ? '기본 서식' : '레이아웃'; collapse.setAttribute('aria-label', expanded ? '글자·문단 서식 도구로 돌아가기' : '레이아웃 도구 펼치기');
    for (const [id, button] of buttons) {
      const command = registry.get(id);
      // These upstream dialogs accept only a root table address. Do not apply
      // a nested table's properties to its outer table by accident.
      const rootOnly = !!next?.nested && ['table:cell-props', 'table:border-each'].includes(id);
      button.disabled = rootOnly || !context.isEditable || context.isFormMode || !command || !!command.canExecute && !command.canExecute(context);
      button.title = rootOnly ? '이 속성 창은 바깥 표에서 사용할 수 있습니다.' : button.getAttribute('aria-label') || '';
      if (id in placementCommands) button.setAttribute('aria-pressed', String(placement !== null && placementCommands[id] === placement));
    }
  }
  const open = () => { manual = true; expanded = true; update(); region.scrollIntoView?.({ block: 'nearest' }); };
  registry.register({ id: 'view:object-layout', label: '개체 레이아웃 열기', canExecute: context => context.hasDocument, execute: open });
  if (!menu) tab.addEventListener('click', () => dispatcher.dispatch('view:object-layout'));
  collapse.addEventListener('click', () => { expanded = !expanded; update(); });
  for (const element of [region, tabs]) element.addEventListener('mousedown', event => event.preventDefault());
  const restoreStandardToolbar = (event: Event) => {
    if (expanded && (event.target as Element).closest('.menu-title')) { expanded = false; update(); }
  };
  menu?.addEventListener('mousedown', restoreStandardToolbar);
  menu?.addEventListener('click', restoreStandardToolbar);
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); expanded = false; update(); getInput()?.focus(); }
  };
  region.addEventListener('keydown', onKeydown); tabs.addEventListener('keydown', onKeydown);
  let pending=false;
  const scheduleUpdate=()=>{
    if(pending)return;pending=true;
    const run=()=>{pending=false;update();};
    if(document.defaultView?.requestAnimationFrame)document.defaultView.requestAnimationFrame(run);else run();
  };
  for (const event of ['cursor-cell-changed', 'cursor-format-changed', 'selection-changed', 'command-state-changed',
    'table-object-selection-changed', 'picture-object-selection-changed', 'document-changed', 'document-mutated', 'document-loaded']) {
    events.on(event, () => { if (event.startsWith('document-')) selectionCache = ''; scheduleUpdate(); });
  }
  update();
}
