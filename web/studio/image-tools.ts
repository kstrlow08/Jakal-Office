import type { CommandRegistry } from '@/command/registry';
import { getObjectProps, setObjectProps } from '@/engine/object-props';
import { tableCellPath } from './nested-table';
import { showToast } from '@/ui/toast';

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
export async function prepareImage(file: File) {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('이미지는 20MB 이내로 선택하세요.');
  if (!/\.(png|jpe?g|gif|bmp|webp)$/i.test(file.name)) throw new Error('PNG, JPG, GIF, BMP, WebP 이미지를 선택하세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 48_000_000) throw new Error('이미지 해상도가 너무 큽니다. 4,800만 화소 이하로 줄여 주세요.');
    // Convert formats Hancom cannot embed (e.g. WebP) and bound decoded size.
    const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('이미지를 처리할 수 없습니다.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('이미지 변환 실패')), 'image/png'));
    if (blob.size > 20 * 1024 * 1024) throw new Error('변환한 이미지가 너무 큽니다. 크기를 줄여 주세요.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
export function installImageTools(registry: CommandRegistry) {
  const original = registry.get('insert:image'); if (!original) return;
  registry.register({ ...original, execute(services) {
    const input = services.getInputHandler(); if (!input) return;
    const position = structuredClone(input.getCursorPosition());
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/gif,image/bmp,image/webp';
    picker.onchange = async () => {
      const file = picker.files?.[0]; if (!file) return;
      try {
        const image = await prepareImage(file);
        const cursor = (input as any).cursor;
        if (JSON.stringify(input.getCursorPosition()) !== JSON.stringify(position)) throw new Error('커서 위치가 바뀌었습니다. 원하는 위치에서 다시 그림을 넣어 주세요.');
        if (cursor.isInHeaderFooter() || cursor.isInFootnote() || cursor.isInTextBox()) throw new Error('현재 위치에는 그림을 넣을 수 없습니다. 본문이나 표의 칸을 선택하세요.');
        const path = position.cellIndex !== undefined && position.cellIndex >= 0 ? tableCellPath(position) : [];
        const page = services.wasm.getPageDef(position.sectionIndex);
        const columns = services.wasm.getColumnDef(position.sectionIndex);
        const count = Math.max(1, columns.columnCount);
        let available = Math.floor((page.width - page.marginLeft - page.marginRight - page.marginGutter - (count - 1) * columns.spacing) / count);
        if (path.length) {
          const cell = services.wasm.getCellPropertiesByPath(position.sectionIndex, position.parentParaIndex!, JSON.stringify(path), path.at(-1)!.cellIndex);
          if (cell.cellProtect) throw new Error('보호된 셀에는 그림을 넣을 수 없습니다.');
          available = cell.width - cell.paddingLeft - cell.paddingRight;
        }
        const dimensions = fitImage(image.width, image.height, available);
        input.executeOperation({ kind: 'snapshot', operationType: 'jakalInsertImage', operation(wasm) {
          const target = pictureParagraph(wasm, position, path, dimensions.width > available / 2);
          const at = target.position;
          const result = wasm.insertPicture(at.sectionIndex, target.path.length ? at.parentParaIndex! : at.paragraphIndex,
            at.charOffset, JSON.stringify(target.path), image.bytes, dimensions.width, dimensions.height, image.width, image.height, 'png', file.name);
          if (!result.ok) throw new Error('그림을 넣지 못했습니다.');
          const ref = { sec: at.sectionIndex, ppi: result.paraIdx, ci: result.controlIdx, type: 'image', ...(target.path.length ? { cellPath: target.path } : {}) };
          const applied = setObjectProps(wasm, ref, { treatAsChar: true });
          if ((applied as any)?.ok === false) throw new Error('그림 배치를 설정하지 못했습니다.');
          return at;
        } });
        input.focus(); showToast({ message: '그림을 글자처럼 넣었습니다. 선택한 뒤 그림 레이아웃에서 배치를 바꿀 수 있습니다.', durationMs: 4500 });
      } catch (error) { showToast({ message: error instanceof Error ? error.message : String(error), durationMs: 6500 }); }
    };
    picker.click();
  } });
  for (const [id, inline, label] of [['insert:picture-inline', true, '글자처럼 취급'], ['insert:picture-floating', false, '본문과 어울리기']] as const) {
    registry.register({ id, label, canExecute: ctx => ctx.inPictureObjectSelection, execute(services) {
      const input = services.getInputHandler(), selected = input?.getSelectedPictureRef(); if (!input || selected?.type !== 'image') return;
      const ref = { ...selected, cellPath: selected.cellPath ?? (selected.cellIdx !== undefined && selected.cellParaIdx !== undefined && (selected as any).outerTableControlIdx !== undefined ? [{ controlIdx: (selected as any).outerTableControlIdx, cellIdx: selected.cellIdx, cellParaIdx: selected.cellParaIdx }] : undefined) };
      input.executeOperation({ kind: 'snapshot', operationType: 'jakalPicturePlacement', operation(wasm) {
        getObjectProps(wasm, ref); // Resolve the exact body/cell/header target first.
        const result = setObjectProps(wasm, ref, inline ? { treatAsChar: true } : { treatAsChar: false, textWrap: 'Square' });
        if ((result as any)?.ok === false) throw new Error('그림 배치를 변경하지 못했습니다.');
        return input.getCursorPosition();
      } }); input.focus();
    } });
  }
}
