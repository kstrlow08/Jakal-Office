import { ribbonIcon } from './ribbon-icons.ts';
type Options = { nested?: boolean; anchor?: HTMLElement; onApply: (rows: number, cols: number) => void; onAdvanced: () => void; onClose: () => void };
const COUNT = 12;

/** Anchored preview: only click/Enter changes the document. */
export function showTablePicker(options: Options) {
  const dialog = document.createElement('dialog'); dialog.className = 'jakal-table-picker'; dialog.setAttribute('aria-label', options.nested ? '표 안에 표 넣기' : '표 삽입');
  const header = document.createElement('div'); header.className = 'jakal-picker-header';
  const title = document.createElement('span'); title.textContent = options.nested ? '표 안에 표' : '표 삽입';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소'; header.append(title, cancel);
  const grid = document.createElement('div'); grid.className = 'jakal-table-grid'; grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', '표 크기 선택'); grid.setAttribute('aria-rowcount', String(COUNT)); grid.setAttribute('aria-colcount', String(COUNT));
  const cells: HTMLButtonElement[] = [];
  for (let row = 1; row <= COUNT; row++) {
    const line = document.createElement('div'); line.setAttribute('role', 'row'); line.setAttribute('aria-rowindex', String(row));
    for (let col = 1; col <= COUNT; col++) {
      const cell = document.createElement('button'); cell.type = 'button'; cell.setAttribute('role', 'gridcell');
      cell.dataset.rows = String(row); cell.dataset.cols = String(col); cell.setAttribute('aria-label', `${row}줄 ${col}칸`); cell.setAttribute('aria-colindex', String(col));
      cell.tabIndex = row === 1 && col === 1 ? 0 : -1; cells.push(cell); line.append(cell);
    }
    grid.append(line);
  }
  const status = document.createElement('p'); status.className = 'jakal-picker-size'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const advanced = document.createElement('button'); advanced.type = 'button'; advanced.className = 'jakal-picker-advanced'; advanced.append(ribbonIcon('icon-table'));
  const text = document.createElement('span'); text.textContent = '표 만들기…'; advanced.append(text);
  const key = document.createElement('kbd'); key.textContent = '줄·칸 직접 입력'; advanced.append(key);
  const error = document.createElement('p'); error.className = 'jakal-picker-error'; error.setAttribute('role', 'alert'); error.hidden = true;
  dialog.append(header, grid, status, advanced, error);
  let rows = 0, cols = 0, closed = false;
  const win = document.defaultView!;
  function select(nextRows: number, nextCols: number, focus = false) {
    if (rows !== nextRows || cols !== nextCols) {
      rows = nextRows; cols = nextCols;
      for (const cell of cells) {
        const active = Number(cell.dataset.rows) <= rows && Number(cell.dataset.cols) <= cols;
        if (cell.getAttribute('aria-selected') !== String(active)) cell.setAttribute('aria-selected', String(active));
        cell.tabIndex = Number(cell.dataset.rows) === rows && Number(cell.dataset.cols) === cols ? 0 : -1;
      }
      status.textContent = `${rows}줄 × ${cols}칸`;
    }
    if (focus) cells[(rows - 1) * COUNT + cols - 1].focus({ preventScroll: true });
  }
  function position() {
    const rect = options.anchor?.isConnected ? options.anchor.getBoundingClientRect() : null;
    const width = dialog.offsetWidth, height = dialog.offsetHeight;
    const left = rect ? rect.left : (win.innerWidth - width) / 2;
    let top = rect ? rect.bottom + 3 : (win.innerHeight - height) / 2;
    if (rect && top + height > win.innerHeight - 8 && rect.top - height > 8) top = rect.top - height - 3;
    dialog.style.left = `${Math.max(8, Math.min(left, win.innerWidth - width - 8))}px`;
    dialog.style.top = `${Math.max(8, Math.min(top, win.innerHeight - height - 8))}px`;
  }
  function close(restoreFocus = true) {
    if (closed) return; closed = true;
    win.removeEventListener('resize', position); dialog.close(); dialog.remove();
    options.anchor?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) options.onClose();
  }
  const targetCell = (event: Event) => (event.target as HTMLElement).closest<HTMLButtonElement>('[role="gridcell"]');
  for (const event of ['pointerover', 'focusin']) grid.addEventListener(event, event => {
    const cell = targetCell(event); if (cell) select(Number(cell.dataset.rows), Number(cell.dataset.cols));
  });
  grid.addEventListener('click', event => {
    const cell = targetCell(event); if (!cell || closed) return;
    select(Number(cell.dataset.rows), Number(cell.dataset.cols));
    try { options.onApply(rows, cols); close(); }
    catch (cause) { error.textContent = cause instanceof Error ? cause.message : String(cause); error.hidden = false; }
  });
  grid.addEventListener('keydown', event => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (moves[event.key]) { event.preventDefault(); const [dr, dc] = moves[event.key]; select(Math.max(1, Math.min(COUNT, rows + dr)), Math.max(1, Math.min(COUNT, cols + dc)), true); }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); select(event.ctrlKey ? (event.key === 'Home' ? 1 : COUNT) : rows, event.key === 'Home' ? 1 : COUNT, true); }
  });
  cancel.onclick = () => close(); dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  advanced.onclick = () => { close(false); options.onAdvanced(); };
  select(1, 1); document.body.append(dialog); dialog.showModal(); position(); cells[0].focus({ preventScroll: true });
  options.anchor?.setAttribute('aria-expanded', 'true');
  win.addEventListener('resize', position);
  return dialog;
}
