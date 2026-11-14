import type { CommandRegistry } from '@/command/registry';
import { getObjectProps, setObjectProps } from '@/engine/object-props';
import { tableCellPath, type CellPicture, type TablePosition } from './nested-table';
import { showToast } from '@/ui/toast';
import { showDropConfirmDialog } from '@/ui/drop-confirm-dialog';

type PictureEngine = { insertCellPicture(position: TablePosition, picture: CellPicture): TablePosition };

/** Hancom's default alternative text for an inserted picture. */
export function pictureDescription(name: string, width: number, height: number) {
  const safe = String(name || '그림').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200);
  return `그림입니다.\r\n원본 그림의 이름: ${safe}\r\n원본 그림의 크기: 가로 ${width}pixel, 세로 ${height}pixel`;
}

/** Wide inline pictures need their own paragraph so adjacent text can reflow. */
export function pictureParagraph(engine: any, position: any, path: any[], wide: boolean) {
  const at = structuredClone(position), target = structuredClone(path);
  if (!wide) return { position: at, path: target };
  const split = (offset: number) => {
    const raw = target.length
      ? engine.splitParagraphInCellByPath(at.sectionIndex, at.parentParaIndex, JSON.stringify(target), offset)
      : engine.splitParagraph(at.sectionIndex, at.paragraphIndex, offset);
    const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!result.ok) throw new Error('그림을 넣을 문단을 만들지 못했습니다.');
    return result;
  };
  if (at.charOffset > 0) {
    const next = split(at.charOffset);
    if (target.length) target.at(-1).cellParaIndex = next.cellParaIndex;
    else at.paragraphIndex = next.paraIdx;
  }
  split(0); // Keep the following text in a separate paragraph.
  at.charOffset = 0;
  if (target.length) { at.cellPath = target; at.cellParaIndex = target[0].cellParaIndex; }
  return { position: at, path: target };
}

export function fitImage(width: number, height: number, available = 42000) {
  if (![width, height, available].every(n => Number.isFinite(n) && n > 0)) throw new Error('이미지 크기를 확인할 수 없습니다.');
  const ratio = Math.min(1, available / (width * 75), 54000 / (height * 75));
  return { width: Math.max(1, Math.round(width * 75 * ratio)), height: Math.max(1, Math.round(height * 75 * ratio)) };
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|bmp|x-ms-bmp|webp)$/i, IMAGE_NAMES = /\.(png|jpe?g|gif|bmp|webp)$/i;

/** Photos stay JPEG; other formats become PNG unless they are large and opaque
 * (a 12MP photo saved as PNG easily exceeds the 20MB embedding limit). */
export function chooseImageFormat(file: { type?: string; name?: string }, pngBytes?: number, opaque?: boolean): 'jpg' | 'png' {
  if (/^image\/jpe?g$/i.test(file.type ?? '') || /\.jpe?g$/i.test(file.name ?? '')) return 'jpg';
  return pngBytes !== undefined && pngBytes > 4 * 1024 * 1024 && opaque ? 'jpg' : 'png';
}
function encodeCanvas(canvas: HTMLCanvasElement, format: 'jpg' | 'png') {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 변환 실패')),
    format === 'jpg' ? 'image/jpeg' : 'image/png', format === 'jpg' ? 0.92 : undefined));
}
/** Downscaled alpha probe; averaging keeps small transparent areas visible. */
function isOpaque(canvas: HTMLCanvasElement) {
  const scale = Math.min(1, 1024 / Math.max(canvas.width, canvas.height));
  const probe = document.createElement('canvas'); probe.width = Math.max(1, Math.round(canvas.width * scale)); probe.height = Math.max(1, Math.round(canvas.height * scale));
  const context = probe.getContext('2d', { willReadFrequently: true }); if (!context) return false;
  context.drawImage(canvas, 0, 0, probe.width, probe.height);
  const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) return false;
  return true;
}
export async function prepareImage(file: File) {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('이미지는 20MB 이내로 선택하세요.');
  if (!IMAGE_TYPES.test(file.type) && !IMAGE_NAMES.test(file.name)) throw new Error('PNG, JPG, GIF, BMP, WebP 이미지를 선택하세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error('브라우저가 이 이미지 파일을 읽지 못했습니다. 다른 형식으로 저장해 보세요.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 48_000_000) throw new Error('이미지 해상도가 너무 큽니다. 4,800만 화소 이하로 줄여 주세요.');
    // Re-encode formats Hancom cannot embed (e.g. WebP), apply EXIF orientation
    // as the browser displays it and bound the decoded size.
    const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('이미지를 처리할 수 없습니다.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let extension = chooseImageFormat(file);
    let blob = await encodeCanvas(canvas, extension);
    if (extension === 'png' && chooseImageFormat(file, blob.size, isOpaque(canvas)) === 'jpg') { extension = 'jpg'; blob = await encodeCanvas(canvas, 'jpg'); }
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('변환한 이미지가 너무 큽니다. 크기를 줄여 주세요.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, extension };
  } finally { URL.revokeObjectURL(url); }
}
type PreparedImage = Awaited<ReturnType<typeof prepareImage>>;
type ImageInput = { getCursorPosition(): any; executeOperation(descriptor: any): void; focus(): void; deleteSelection?(options?: { deferRecord?: boolean }): void };

/** Inserts a prepared image inline at `position`: inside the cell for table
 * cells (nested tables included) and sized to the cell or body column. */
export function insertImageAt(input: ImageInput, bridge: any, position: any, image: PreparedImage, fileName: string, options: { replaceSelection?: boolean } = {}) {
  const inCell = (at: any) => at.cellIndex !== undefined && at.cellIndex >= 0;
  const path = inCell(position) ? tableCellPath(position) : [];
  const page = bridge.getPageDef(position.sectionIndex);
  const columns = bridge.getColumnDef(position.sectionIndex);
  const count = Math.max(1, columns?.columnCount ?? 1);
  let available = Math.floor((page.width - page.marginLeft - page.marginRight - (page.marginGutter ?? 0) - (count - 1) * (columns?.spacing ?? 0)) / count);
  if (path.length) {
    const cell = bridge.getCellPropertiesByPath(position.sectionIndex, position.parentParaIndex!, JSON.stringify(path), path.at(-1)!.cellIndex);
    if (cell.cellProtect) throw new Error('보호된 셀에는 그림을 넣을 수 없습니다.');
    available = cell.width - cell.paddingLeft - cell.paddingRight;
  }
  const dimensions = fitImage(image.width, image.height, available);
  const wide = dimensions.width > available / 2;
  const description = pictureDescription(fileName, image.width, image.height);
  input.executeOperation({ kind: 'snapshot', operationType: 'jakalInsertImage', operation(wasm: any) {
    // A paste over a selection replaces it inside the same undo step; the
    // caret then sits where the selection started (same cell or body).
    let at = position;
    if (options.replaceSelection && input.deleteSelection) { input.deleteSelection({ deferRecord: true }); at = structuredClone(input.getCursorPosition()); }
    if (inCell(at) !== path.length > 0) throw new Error('그림을 넣을 위치를 찾지 못했습니다. 다시 시도해 주세요.');
    // The engine's own cell path creates a floating sibling of the table
    // (outside the cell). Keep cell pictures inline inside the cell.
    if (path.length) return (wasm as unknown as PictureEngine).insertCellPicture(at, { bytes: image.bytes,
      width: dimensions.width, height: dimensions.height, naturalWidth: image.width, naturalHeight: image.height,
      extension: image.extension, description, ownParagraph: wide });
    const target = pictureParagraph(wasm, at, [], wide);
    const spot = target.position;
    const result = wasm.insertPicture(spot.sectionIndex, spot.paragraphIndex,
      spot.charOffset, '', image.bytes, dimensions.width, dimensions.height, image.width, image.height, image.extension, description);
    if (!result.ok) throw new Error('그림을 넣지 못했습니다.');
    const ref = { sec: spot.sectionIndex, ppi: result.paraIdx, ci: result.controlIdx, type: 'image' };
    const applied = setObjectProps(wasm, ref, { treatAsChar: true });
    if ((applied as any)?.ok === false) throw new Error('그림 배치를 설정하지 못했습니다.');
    return { ...spot, paragraphIndex: result.paraIdx ?? spot.paragraphIndex, charOffset: spot.charOffset + 1 }; // caret after the picture
  } });
  input.focus();
}

const isImageFile = (file: File) => IMAGE_TYPES.test(file.type) || IMAGE_NAMES.test(file.name);

/** Image files dropped on the page use the same inline, cell-aware path as
 * 입력 > 그림. The pinned runtime would place a picture dropped on a table cell
 * next to the table and keep WebP data that Hancom cannot show. Text boxes and
 * header/footer editing keep the runtime's own drop handling. */
export function installImageDrop(getInput: () => any, getBridge: () => any) {
  document.addEventListener('drop', event => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    const container = document.getElementById('scroll-container');
    if (files.length !== 1 || !isImageFile(files[0]) || !container?.contains(event.target as Node)) return;
    const input = getInput(), bridge = getBridge(), cursor = input?.cursor;
    if (!input || !bridge || !bridge.pageCount || cursor?.isInHeaderFooter?.() || cursor?.isInFootnote?.()) return;
    let hit: any = null;
    try {
      const point = input.pagePointFromClientPoint?.(event.clientX, event.clientY);
      hit = point ? bridge.hitTest(point.pageIdx, point.pageX, point.pageY) : null;
    } catch { hit = null; }
    if (!hit || hit.isTextBox) return;
    event.preventDefault(); event.stopImmediatePropagation();
    container.classList.remove('drag-over');
    const file = files[0], generation = bridge.documentGeneration;
    void (async () => {
      try {
        if (!await showDropConfirmDialog(file.name)) return;
        const image = await prepareImage(file);
        if (generation !== bridge.documentGeneration) throw new Error('문서가 바뀌었습니다. 그림을 다시 끌어다 놓아 주세요.');
        insertImageAt(input, bridge, structuredClone(hit), image, file.name);
        showToast({ message: '그림을 글자처럼 넣었습니다. 선택한 뒤 그림 레이아웃에서 배치를 바꿀 수 있습니다.', durationMs: 4500 });
      } catch (error) { showToast({ message: error instanceof Error ? error.message : String(error), durationMs: 6500 }); }
    })();
  }, true);
}

const RHWP_CLIPBOARD_MARKER = /<!--\s*rhwp-studio-clipboard:/;
const containerKey = (p: any) => JSON.stringify([p?.sectionIndex, p?.parentParaIndex ?? null, p?.controlIndex ?? null, p?.cellIndex ?? null,
  (p?.cellPath ?? []).map((step: any) => [step.controlIndex, step.cellIndex]), !!p?.isTextBox]);

/** Inserts a pasted image once it is decoded, unless the caret moved meanwhile. */
function pasteImage(input: any, bridge: any, position: any, file: File, replaceSelection: boolean) {
  const cursor = input.cursor;
  const state = () => JSON.stringify([input.getCursorPosition(), cursor.hasSelection?.() ? cursor.getSelectionOrdered?.() : null]);
  const before = state(), generation = bridge.documentGeneration;
  void (async () => {
    try {
      const image = await prepareImage(file);
      if (generation !== bridge.documentGeneration) throw new Error('문서가 바뀌었습니다. 그림을 다시 붙여 넣어 주세요.');
      if (state() !== before) throw new Error('커서 위치가 바뀌었습니다. 원하는 위치에서 다시 붙여 넣어 주세요.');
      insertImageAt(input, bridge, position, image, file.name || '붙여넣은 그림', { replaceSelection });
      showToast({ message: '그림을 글자처럼 넣었습니다. 선택한 뒤 그림 레이아웃에서 배치를 바꿀 수 있습니다.', durationMs: 4500 });
    } catch (error) { showToast({ message: error instanceof Error ? error.message : String(error), durationMs: 6500 }); }
  })();
}

/** Pasted image files (screenshots, images copied in a browser) use the same
 * inline, cell-aware path as 입력 > 그림. The pinned runtime floats a pasted
 * picture over the body text, puts one pasted in a table cell next to the
 * table and fails silently. Copies made inside the editor keep the runtime's
 * own object paste, and text boxes/header/footer keep the runtime path. */
export function installImagePaste(getInput: () => any, getBridge: () => any, insert: typeof pasteImage = pasteImage) {
  document.addEventListener('paste', event => {
    const input = getInput(), bridge = getBridge(), data = event.clipboardData;
    if (!input?.active || !bridge || !data || event.target !== input.textarea) return;
    const item = Array.from(data.items ?? []).find(entry => entry.kind === 'file' && IMAGE_TYPES.test(entry.type));
    if (!item) return;
    const html = data.getData('text/html') || '', text = data.getData('text/plain') || '';
    if (bridge.hasInternalClipboard?.() && (RHWP_CLIPBOARD_MARKER.test(html) || (bridge.clipboardHasControl?.() && !!text && text === bridge.getClipboardText?.()))) return;
    const cursor = input.cursor;
    if (!cursor || input.isFormMode?.() || cursor.isInHeaderFooter?.() || cursor.isInFootnote?.() || cursor.isInCellSelectionMode?.()) return;
    if (cursor.isInPictureObjectSelection?.() || cursor.isInTableObjectSelection?.()) return; // keep the runtime's object handling
    if (cursor.isInTextBox?.() || input.getCursorPosition?.()?.isTextBox) return;
    const selection = cursor.hasSelection?.() ? cursor.getSelectionOrdered?.() : null;
    if (cursor.hasSelection?.() && (!selection || containerKey(selection.start) !== containerKey(selection.end))) return;
    const file = item.getAsFile(); if (!file) return;
    event.preventDefault(); event.stopImmediatePropagation();
    insert(input, bridge, structuredClone(selection ? selection.start : input.getCursorPosition()), file, !!selection);
  }, true);
}

async function readClipboard() {
  const data = new DataTransfer(), clipboard = navigator.clipboard as any;
  if (clipboard?.read) {
    // Keep the editor's own clipboard marker; Chrome sanitizes HTML otherwise.
    const items = await clipboard.read({ unsanitized: ['text/html'] }).catch(() => clipboard.read());
    for (const item of items) for (const type of item.types as string[]) {
      const blob = await item.getType(type);
      if (IMAGE_TYPES.test(type)) data.items.add(new File([blob], `image.${type.split('/')[1].replace('jpeg', 'jpg')}`, { type }));
      else if (/^text\/(plain|html|rtf)$/.test(type)) data.setData(type, await blob.text());
    }
    return data;
  }
  if (clipboard?.readText) { data.setData('text/plain', await clipboard.readText()); return data; }
  throw new Error('clipboard unavailable');
}

/** 편집 > 붙이기 and the context menu call document.execCommand('paste'),
 * which browsers refuse for web pages, so the command did nothing. Read the
 * clipboard with the async Clipboard API and replay it as a paste event so the
 * keyboard paste path (formatting, tables and pictures) runs unchanged. */
export function installMenuPaste(registry: CommandRegistry, read: () => Promise<DataTransfer> = readClipboard) {
  const original = registry.get('edit:paste'); if (!original) return;
  registry.register({ ...original, execute(services) {
    const input = services.getInputHandler() as any; if (!input) return;
    if (typeof input.performPaste !== 'function') { original.execute(services); return; }
    if (input.performPaste() !== false) return; // a browser that allows it already pasted
    void (async () => {
      try {
        const clipboardData = await read();
        if (!clipboardData.types.length && !clipboardData.files.length) { showToast({ message: '클립보드가 비어 있습니다.', durationMs: 3500 }); return; }
        input.focus?.();
        input.textarea?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
      } catch {
        showToast({ message: '브라우저가 클립보드 읽기를 막았습니다. Ctrl+V(맥은 ⌘+V)로 붙여 넣어 주세요.', durationMs: 6500 });
      }
    })();
  } });
}

export function installImageTools(registry: CommandRegistry) {
  const original = registry.get('insert:image'); if (!original) return;
  registry.register({ ...original, execute(services) {
    const input = services.getInputHandler(); if (!input) return;
    const position = structuredClone(input.getCursorPosition());
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/gif,image/bmp,image/webp,.png,.jpg,.jpeg,.gif,.bmp,.webp';
    picker.onchange = async () => {
      const file = picker.files?.[0]; if (!file) return;
      try {
        const image = await prepareImage(file);
        const cursor = (input as any).cursor;
        if (JSON.stringify(input.getCursorPosition()) !== JSON.stringify(position)) throw new Error('커서 위치가 바뀌었습니다. 원하는 위치에서 다시 그림을 넣어 주세요.');
        if (cursor.isInHeaderFooter() || cursor.isInFootnote() || cursor.isInTextBox()) throw new Error('현재 위치에는 그림을 넣을 수 없습니다. 본문이나 표의 칸을 선택하세요.');
        insertImageAt(input, services.wasm, position, image, file.name);
        showToast({ message: '그림을 글자처럼 넣었습니다. 선택한 뒤 그림 레이아웃에서 배치를 바꿀 수 있습니다.', durationMs: 4500 });
      } catch (error) { showToast({ message: error instanceof Error ? error.message : String(error), durationMs: 6500 }); }
    };
    picker.click();
  } });
  for (const [id, inline, label] of [['insert:picture-inline', true, '글자처럼 취급'], ['insert:picture-floating', false, '본문과 어울리기']] as const) {
    registry.register({ id, label, canExecute: ctx => ctx.inPictureObjectSelection, execute(services) {
      const input = services.getInputHandler(), selected = input?.getSelectedPictureRef(); if (!input || selected?.type !== 'image') return;
      const ref = { ...selected, cellPath: selected.cellPath ?? (selected.cellIdx !== undefined && selected.cellParaIdx !== undefined && (selected as any).outerTableControlIdx !== undefined ? [{ controlIdx: (selected as any).outerTableControlIdx, cellIdx: selected.cellIdx, cellParaIdx: selected.cellParaIdx }] : undefined) };
      try {
        input.executeOperation({ kind: 'snapshot', operationType: 'jakalPicturePlacement', operation(wasm) {
          getObjectProps(wasm, ref); // Resolve the exact body/cell/header target first.
          const result = setObjectProps(wasm, ref, inline ? { treatAsChar: true } : { treatAsChar: false, textWrap: 'Square' });
          if ((result as any)?.ok === false) throw new Error('그림 배치를 변경하지 못했습니다.');
          return input.getCursorPosition();
        } });
      } catch {
        // The dispatcher only logs failures; tell the user the placement stayed as it was.
        showToast({ message: '그림 배치를 바꾸지 못했습니다. 그림을 다시 선택한 뒤 시도해 주세요.', durationMs: 6500 });
      }
      input.focus();
    } });
  }
}
