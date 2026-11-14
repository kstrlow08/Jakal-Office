import type { CommandRegistry } from '@/command/registry';
import type { CommandServices, EditorContext } from '@/command/types';
import { parentTableCell, type TablePosition, type TableOptions, type StructureOptions } from './nested-table.ts';
import { showTablePicker } from './table-picker.ts';

type Input = NonNullable<ReturnType<CommandServices['getInputHandler']>>;
type TableEngine = CommandServices['wasm'] & {
  createNestedTable(position: TablePosition, rows: number, cols: number, options?: TableOptions): TablePosition;
  editNestedTable(position: TablePosition, operation: string, options?: StructureOptions): TablePosition;
  ensureTrailingParagraph?(section: number, paragraph: number): boolean;
};
const preference = 'jakal-table-size';
function validSize(rows: number, cols: number) {
  return [rows, cols].every(n => Number.isInteger(n) && n > 0 && n <= 100) && rows * cols <= 2500;
}

/** apply(rows, cols, widthPercent?, treatAsChar?): split passes rows/cols, a nested table
 * adds its width, and a new body table adds whether it flows like a character. */
export function showTableDialog(mode: boolean | 'split', apply: (rows: number, cols: number, widthPercent?: number, treatAsChar?: boolean) => void, focus: () => void) {
  const nested = mode === true, split = mode === 'split', body = !nested && !split;
  const storage = split ? 'jakal-cell-split-size' : nested ? 'jakal-nested-table-size' : preference;
  let size = { rows: split ? 1 : 2, cols: 2, width: 75, inline: true };
  try {
    const previous = JSON.parse(localStorage.getItem(storage) || 'null');
    if (previous && validSize(previous.rows, previous.cols)) size = { ...size, rows: previous.rows, cols: previous.cols,
      width: Number.isFinite(previous.width) && previous.width >= 10 && previous.width <= 100 ? previous.width : 75,
      inline: previous.inline !== false };
  } catch { /* Preferences are optional. */ }
  const dialog = document.createElement('dialog');
  dialog.className = 'jakal-table-dialog';
  dialog.setAttribute('aria-labelledby', 'jakal-table-title');
  dialog.innerHTML = `<form>
    <h2 id="jakal-table-title"></h2>
    <div class="jakal-table-size"><label>줄 수<input name="rows" type="number" min="1" max="100" step="1" required></label>
    <label>칸 수<input name="cols" type="number" min="1" max="100" step="1" required></label></div>
    <label class="jakal-nested-width">새 표 너비<span><input name="width" type="number" min="10" max="100" step="5" required>% (바깥 칸 기준)</span></label>
    <label class="jakal-table-inline"><input name="inline" type="checkbox"> 글자처럼 취급</label>
    <p class="jakal-table-error" role="alert" hidden></p>
    <footer><button type="button" data-cancel>취소</button><button type="submit">표 만들기</button></footer>
  </form>`;
  dialog.querySelector('h2')!.textContent = split ? '칸 나누기' : nested ? '표 안에 표 넣기' : '표 만들기';
  dialog.querySelector<HTMLElement>('.jakal-nested-width')!.hidden = !nested;
  dialog.querySelector<HTMLElement>('.jakal-table-inline')!.hidden = !body;
  const width = dialog.querySelector<HTMLInputElement>('[name="width"]')!;
  width.value = String(size.width); width.disabled = !nested;
  const inline = dialog.querySelector<HTMLInputElement>('[name="inline"]')!;
  inline.checked = size.inline;
  const rows = dialog.querySelector<HTMLInputElement>('[name="rows"]')!;
  const cols = dialog.querySelector<HTMLInputElement>('[name="cols"]')!;
  rows.value = String(size.rows); cols.value = String(size.cols);
  const error = dialog.querySelector<HTMLElement>('.jakal-table-error')!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!;
  submit.textContent = split ? '나누기' : nested ? '넣기' : '만들기';
  const valid = () => validSize(rows.valueAsNumber, cols.valueAsNumber) && (!nested || (width.valueAsNumber >= 10 && width.valueAsNumber <= 100));
  const update = () => {
    const ok = valid();
    error.hidden = ok; error.textContent = ok ? '' : nested && validSize(rows.valueAsNumber, cols.valueAsNumber)
      ? '새 표 너비는 10~100%로 입력하세요.' : '줄·칸은 1~100, 전체 2,500칸 이내로 입력하세요.';
    submit.disabled = !ok;
  };
  const close = () => { dialog.close(); dialog.remove(); focus(); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector('[data-cancel]')!.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('input', update);
  dialog.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault();
    if (!valid()) return;
    try {
      if (nested) apply(rows.valueAsNumber, cols.valueAsNumber, width.valueAsNumber);
      else if (body) apply(rows.valueAsNumber, cols.valueAsNumber, undefined, inline.checked);
      else apply(rows.valueAsNumber, cols.valueAsNumber);
      try { localStorage.setItem(storage, JSON.stringify({ rows: rows.valueAsNumber, cols: cols.valueAsNumber, width: width.valueAsNumber, inline: inline.checked })); } catch { /* optional preference */ }
      close();
    } catch (cause) {
      error.hidden = false; error.textContent = cause instanceof Error ? cause.message : String(cause);
    }
  });
  update(); document.body.appendChild(dialog); dialog.showModal(); rows.focus(); rows.select();
  return dialog;
}

/** Engine errors are technical ("렌더링 오류: 경로[0] ..."); show a plain instruction instead. */
export function tableErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return !message || /^렌더링 오류|범위 초과|is not a function|undefined/.test(message)
    ? '표를 편집하지 못했습니다. 표의 칸을 다시 클릭한 뒤 시도해 주세요.' : message;
}

/** `report` shows failures; the command dispatcher otherwise only logs them. */
export function installTableTools(registry: CommandRegistry, getInput: () => Input | null, report?: (message: string) => void) {
  const attempt = (run: () => void) => {
    try { run(); }
    catch (error) { if (!report) throw error; report(tableErrorMessage(error)); }
  };
  registry.register({id:'table:select-cells',label:'셀 선택 (F5)',canExecute:context=>context.inTable,execute(){
    const input=getInput() as any;if(!input?.cursor.enterCellSelectionMode())return;
    input.cursor.clearSelection();input.caret.hide();input.selectionRenderer.clear();input.updateCellSelection();input.eventBus.emit('command-state-changed');input.focus();
  }});
  const original = registry.get('table:create');
  if (!original) throw new Error('표 만들기 명령을 찾을 수 없습니다.');
  const canCreate = (context: EditorContext) => {
    const input = getInput(), cursor = (input as any)?.cursor;
    return !!input && !!cursor && context.hasDocument && context.isEditable && !context.isFormMode
      && !context.hasSelection && !context.inField && !context.inCellSelectionMode
      && !context.inTableObjectSelection && !context.inPictureObjectSelection
      && !cursor.isInHeaderFooter() && !cursor.isInFootnote() && !cursor.isInTextBox();
  };
  const execute = (services: CommandServices, params?: Record<string, unknown>) => {
    const input = services.getInputHandler();
    if (!input) return;
    const position = structuredClone(input.getCursorPosition());
    const generation = services.wasm.documentGeneration;
    const apply = (rows: number, cols: number, widthPercent?: number, treatAsChar = true) => {
      if (generation !== services.wasm.documentGeneration) throw new Error('문서가 바뀌었습니다. 창을 닫고 입력 위치를 다시 선택하세요.');
      input.executeOperation({ kind: 'snapshot', operationType: 'createTable', operation: engine => {
        if (position.parentParaIndex !== undefined) return (engine as TableEngine).createNestedTable(position, rows, cols, { widthPercent });
        const result = engine.createTableEx({ sectionIdx: position.sectionIndex, paraIdx: position.paragraphIndex,
          charOffset: position.charOffset, rowCount: rows, colCount: cols, treatAsChar });
        if (!result.ok) throw new Error('표를 만들지 못했습니다. 입력 위치를 다시 선택하세요.');
        // Leave a paragraph below a table that ends the section so typing can continue after it.
        (engine as TableEngine).ensureTrailingParagraph?.(position.sectionIndex, result.paraIdx);
        return { sectionIndex: position.sectionIndex, paragraphIndex: 0, charOffset: 0,
          parentParaIndex: result.paraIdx, controlIndex: result.controlIdx, cellIndex: 0, cellParaIndex: 0,
          cellPath: [{ controlIndex: result.controlIdx, cellIndex: 0, cellParaIndex: 0 }] };
      } });
    };
    const nested = position.parentParaIndex !== undefined;
    const requested = params?.anchorEl as HTMLElement | undefined;
    const anchor = requested?.isConnected ? requested : document.querySelector<HTMLElement>('#jakal-ribbon [data-command="table:create"], .jakal-layout-panel [data-command="table:create-nested"]') ?? undefined;
    showTablePicker({ nested, anchor, onApply: apply, onClose: () => input.focus(),
      onAdvanced: () => showTableDialog(nested, apply, () => input.focus()) });
  };
  registry.register({ ...original, canExecute: canCreate, execute });
  for (const [id,label,treatAsChar] of [['table:inline','글자처럼 취급',true],['table:floating','본문과 어울리기',false]] as const) registry.register({id,label,
    canExecute:context=>context.hasDocument&&context.isEditable&&!context.isFormMode&&(context.inTable||context.inTableObjectSelection)&&(getInput()?.getCursorPosition().cellPath?.length??0)<=1,
    execute(services){const input=services.getInputHandler();if(!input)return;const p=input.getCursorPosition(),ref=input.getSelectedTableRef?.();
      const sec=ref?.sec??p.sectionIndex,para=ref?.ppi??p.parentParaIndex,ci=ref?.ci??p.controlIndex;if(para===undefined||ci===undefined)return;
      attempt(()=>input.executeOperation({kind:'snapshot',operationType:'tablePlacement',operation:wasm=>{const result=wasm.setTableProperties(sec,para,ci,{treatAsChar});if(!result.ok)throw new Error('표의 배치를 바꾸지 못했습니다.');return p;}}));input.focus();}
  });
  registry.register({ id: 'table:create-nested', label: '표 안에 새 표 넣기', opensDialog: true,
    canExecute: context => context.inTable && canCreate(context), execute });
  registry.register({ id: 'table:parent-cell', label: '상위 셀로 이동', canExecute: context =>
    context.hasDocument && context.inTable && (getInput()?.getCursorPosition().cellPath?.length ?? 0) > 1,
    execute: services => {
      const input = services.getInputHandler();
      if (input) { attempt(() => input.moveCursorTo(parentTableCell(input.getCursorPosition()))); input.focus(); }
    } });
  const splitCommand = registry.get('table:cell-split');
  if (splitCommand) registry.register({ ...splitCommand, label: '칸 나누기', canExecute: context =>
    context.isEditable && !context.isFormMode && context.inTable && !context.inField && !getInput()?.hasExcludedCellSelection?.(),
    execute(services) {
      const input = services.getInputHandler();
      if (!input) return;
      const position = structuredClone(input.getCursorPosition());
      const selected = input.hasMultiCellSelection() ? structuredClone(input.getSelectedCellRange()) : undefined;
      const generation = services.wasm.documentGeneration;
      showTableDialog('split', (rows, cols) => {
        if (generation !== services.wasm.documentGeneration) throw new Error('문서가 바뀌었습니다. 칸을 다시 선택하세요.');
        input.executeOperation({ kind: 'snapshot', operationType: 'splitTableCell', operation: engine => {
          if ((position.cellPath?.length ?? 0) > 1) return (engine as TableEngine).editNestedTable(position, 'splitCells', { rows, cols, range: selected ?? undefined });
          let result: { ok: boolean };
          if (selected) result = engine.splitTableCellsInRange(position.sectionIndex, position.parentParaIndex!, position.controlIndex!,
            selected.startRow, selected.startCol, selected.endRow, selected.endCol, rows, cols, false);
          else {
            const cell = engine.getCellInfo(position.sectionIndex, position.parentParaIndex!, position.controlIndex!, position.cellIndex!);
            result = engine.splitTableCellInto(position.sectionIndex, position.parentParaIndex!, position.controlIndex!, cell.row, cell.col, rows, cols, false, false);
          }
          if (!result.ok) throw new Error('선택한 칸을 나누지 못했습니다. 칸을 다시 선택하세요.');
          return position;
        } });
        input.exitCellSelectionMode?.();
      }, () => input.focus());
    } });
  const mergeCommand = registry.get('table:cell-merge');
  if (mergeCommand) registry.register({ ...mergeCommand, label: '칸 합치기', canExecute: context =>
    context.isEditable && !context.isFormMode && context.hasMultiCellSelection && !getInput()?.hasExcludedCellSelection?.(),
    execute(services, params) {
      const input = services.getInputHandler(), position = input?.getCursorPosition();
      if (!input || !position || (position.cellPath?.length ?? 0) < 2) return mergeCommand.execute(services, params);
      const range = input.getSelectedCellRange();
      if (!range) return;
      attempt(() => input.executeOperation({ kind: 'snapshot', operationType: 'mergeTableCells',
        operation: engine => (engine as TableEngine).editNestedTable(position, 'mergeCells', { range }) }));
      input.exitCellSelectionMode(); input.focus();
    } });
  for (const [id, operation] of Object.entries({
    'table:insert-row-above': 'insertRowAbove', 'table:insert-row-below': 'insertRowBelow',
    'table:insert-col-left': 'insertColLeft', 'table:insert-col-right': 'insertColRight',
    'table:delete-row': 'deleteRow', 'table:delete-col': 'deleteCol',
  })) {
    const command = registry.get(id);
    if (!command) continue;
    registry.register({ ...command, execute(services, params) {
      const input = services.getInputHandler(), position = input?.getCursorPosition();
      if (!input || !position || (position.cellPath?.length ?? 0) < 2) return command.execute(services, params);
      attempt(() => input.executeOperation({ kind: 'snapshot', operationType: operation,
        operation: engine => (engine as TableEngine).editNestedTable(position, operation) }));
      input.focus();
    } });
  }
}
/** The pinned engine keeps the caret in a table's last row on ArrowDown even
 * when a paragraph follows the table. Move to that paragraph instead, as an
 * office editor does. Only root tables in the body are handled. */
export function installTableExit(getInput: () => any, getBridge: () => any, schedule: (run: () => void) => void = run => { setTimeout(run, 0); }) {
  const key = (p: any) => JSON.stringify([p.sectionIndex, p.paragraphIndex, p.charOffset, p.parentParaIndex, p.controlIndex, p.cellIndex, p.cellParaIndex]);
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const input = getInput(), bridge = getBridge();
    if (!input || !bridge || event.target !== input.textarea || input.isComposing) return;
    const before = input.getCursorPosition?.();
    if (!before || before.parentParaIndex === undefined || before.isTextBox || (before.cellPath?.length ?? 1) !== 1) return;
    if (input.cursor?.isInHeaderFooter?.() || input.cursor?.isInFootnote?.()) return;
    const start = key(before);
    schedule(() => {
      const after = input.getCursorPosition?.();
      if (!after || key(after) !== start) return; // The engine moved the caret itself.
      try {
        const cell = bridge.getCellInfo(before.sectionIndex, before.parentParaIndex, before.controlIndex, before.cellIndex);
        const table = bridge.getTableDimensions(before.sectionIndex, before.parentParaIndex, before.controlIndex);
        if (cell.row + Math.max(1, cell.rowSpan ?? 1) < table.rowCount) return;
        const next = before.parentParaIndex + 1;
        if (next >= bridge.getParagraphCount(before.sectionIndex)) return;
        input.moveCursorTo({ sectionIndex: before.sectionIndex, paragraphIndex: next, charOffset: 0 });
      } catch { /* Keep the caret where the engine left it. */ }
    });
  }, true);
}
