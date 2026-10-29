import { HwpDocument } from '@wasm/rhwp.js';
import { runReportedExport } from '@/core/export-content-loss';
import { ModalDialog } from '@/ui/dialog';
import { encryptedCopy } from './encrypted-export';
import { WasmBridge } from '@/core/wasm-bridge';
import { buildSnapshotFromWasm, compareSnapshots } from '@/compare/diff-engine';

class DocumentComparisonDialog extends ModalDialog {
  constructor(private readonly wasm: any) { super('파일과 현재 문서 비교', 700); }
  protected createBody() {
    const body = document.createElement('div'); body.className = 'jakal-document-comparison';
    const label = document.createElement('label'); label.textContent = '기준 파일 (HWP·HWPX)';
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.hwp,.hwpx'; label.append(input);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '기준 파일 → 현재 문서의 변경 내용을 표시합니다.';
    const results = document.createElement('div'); results.className = 'jakal-comparison-results';
    body.append(label, status, results);
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      if (!/\.(hwp|hwpx)$/i.test(file.name) || file.size > 20 * 1024 * 1024) { status.textContent = '20MB 이하의 HWP·HWPX 파일을 선택해 주세요.'; return; }
      input.disabled = true; results.replaceChildren(); status.textContent = '변경 내용을 비교하고 있습니다…';
      const comparison = new WasmBridge();
      try {
        // Only this isolated bridge loads the selected file. The live document,
        // selection, undo stack and host save identity remain owned by the host.
        const bytes = new Uint8Array(await file.arrayBuffer());
        await comparison.initialize(); comparison.loadDocument(bytes, file.name);
        const options = { caseSensitive: true, ignoreWhitespace: false, kinds: ['text', 'table', 'shape', 'image', 'chart', 'paragraphMeta'] as any, strategy: 'alignment' as const, performanceTuning: { maxComputeMs: 1500, hardSegmentCells: 100000 } };
        const changes = compareSnapshots(buildSnapshotFromWasm(comparison, file.name, options), buildSnapshotFromWasm(this.wasm, this.wasm.fileName, options), options).diffItems;
        status.textContent = `${file.name} → ${this.wasm.fileName}: 변경 ${changes.length}곳`;
        if (!changes.length) { results.textContent = '비교 대상의 변경 내용이 없습니다.'; return; }
        const more = document.createElement('button'); more.type = 'button'; more.textContent = '변경 내용 더 보기';
        let shown = 0;
        const showMore = () => {
          more.remove();
          for (const item of changes.slice(shown, shown + 100)) {
            const row = document.createElement('details'), summary = document.createElement('summary');
            summary.textContent = `${{ added: '+ 추가', removed: '− 삭제', modified: '~ 수정' }[item.severity]} · ${item.title}`; row.append(summary);
            const columns = document.createElement('div'); columns.className = 'jakal-comparison-columns';
            for (const [title, text, kind] of [['기준 파일', item.leftPreview, 'before'], ['현재 문서', item.rightPreview, 'after']]) {
              const cell = document.createElement('div'), heading = document.createElement('strong'), preview = document.createElement('pre');
              cell.className = kind; heading.textContent = title; preview.textContent = text || '(없음)'; cell.append(heading, preview); columns.append(cell);
            }
            row.append(columns); results.append(row);
          }
          shown += 100; if (shown < changes.length) results.append(more);
        };
        more.onclick = showMore; showMore();
      } catch (error) { status.textContent = error instanceof Error ? error.message : '비교할 파일을 열지 못했습니다.'; }
      finally { comparison.releaseDocument(); input.disabled = false; }
    };
    return body;
  }
  open() { this.show(); this.dialog.setAttribute('role', 'dialog'); this.dialog.setAttribute('aria-modal', 'true'); this.dialog.setAttribute('aria-label', '파일과 현재 문서 비교'); }
}
export function showDocumentComparison(wasm: any) { new DocumentComparisonDialog(wasm).open(); }

class EncryptedDownloadDialog extends ModalDialog {
  private password!: HTMLInputElement;
  private confirmation!: HTMLInputElement;
  private error!: HTMLParagraphElement;
  private resolve!: (value: string | null) => void;
  constructor() { super('암호를 설정해 HWPX 받기', 390); }
  protected createBody() {
    const body = document.createElement('div'); body.style.cssText = 'padding:14px 18px;line-height:1.6';
    for (const text of ['암호 (8~128자)', '암호 확인']) {
      const label = document.createElement('label'); label.textContent = text; label.style.cssText = 'display:block;margin-bottom:8px';
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.maxLength = 128;
      input.style.cssText = 'display:block;width:100%;box-sizing:border-box;height:28px'; label.append(input); body.append(label);
      if (!this.password) this.password = input; else this.confirmation = input;
      input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (this.onConfirm()) this.hide(); } };
    }
    const note = document.createElement('p'); note.textContent = '내려받는 파일에만 암호를 적용합니다. 브라우저 보관본은 암호화되지 않습니다. 암호는 보관하지 않습니다.'; body.append(note);
    this.error = document.createElement('p'); this.error.setAttribute('role', 'alert'); this.error.style.color = '#b42318'; body.append(this.error);
    return body;
  }
  protected onConfirm() {
    if (this.password.value.length < 8) { this.error.textContent = '암호를 8자 이상 입력해 주세요.'; this.password.focus(); return false; }
    if (this.password.value !== this.confirmation.value) { this.error.textContent = '두 암호가 다릅니다.'; this.confirmation.focus(); return false; }
    this.resolve(this.password.value); return true;
  }
  override hide() { if (this.password) this.password.value = ''; if (this.confirmation) this.confirmation.value = ''; this.resolve(null); super.hide(); }
  ask(): Promise<string | null> {
    return new Promise(resolve => { let done = false; this.resolve = value => { if (!done) { done = true; resolve(value); } }; this.show(); this.dialog.setAttribute('role', 'dialog'); this.dialog.setAttribute('aria-modal', 'true'); this.dialog.setAttribute('aria-label', '암호를 설정해 HWPX 받기'); requestAnimationFrame(() => this.password.focus()); });
  }
}

let exporting = false;
export async function downloadEncrypted(wasm: any) {
  if (exporting) return;
  exporting = true; let password: string | null = null;
  try {
    password = await new EncryptedDownloadDialog().ask();
    if (password === null) return;
    // Let the closed dialog paint before the explicit, CPU-bound export.
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const bytes = encryptedCopy(wasm.exportHwpx(), password, HwpDocument, runReportedExport);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/hwp+zip' }));
    const link = document.createElement('a'); link.href = url; link.download = (wasm.fileName || '새 문서').replace(/\.(hwp|hwpx)$/i, '') + '-암호.hwpx';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { window.alert(error instanceof Error ? error.message : '암호 파일을 저장하지 못했습니다.'); }
  finally { password = null; exporting = false; }
}
