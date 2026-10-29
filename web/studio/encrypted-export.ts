import { layoutSignature } from './export-compat.ts';

/** Verify the encrypted copy before offering it; never change the live document. */
export function encryptedCopy(source: Uint8Array, password: string, Document: any, readExport: (fn: () => any) => any): Uint8Array {
  if (password.length < 8 || password.length > 128) throw new Error('암호는 8~128자로 입력해 주세요.');
  const original = new Document(source);
  let reopened: any;
  try {
    const artifact = readExport(() => original.exportHwpxWithPasswordAndReport(password));
    if (artifact.contentLoss.count) throw new Error('암호 저장 시 보존할 수 없는 내용이 있어 다운로드를 중단했습니다.');
    reopened = Document.openWithPassword(artifact.bytes, password);
    if (original.getTextFileText() !== reopened.getTextFileText() || JSON.stringify(layoutSignature(source)) !== JSON.stringify(layoutSignature(reopened.exportHwpx()))) {
      throw new Error('암호 저장 결과의 내용·개체 배치가 달라 다운로드를 중단했습니다.');
    }
    return artifact.bytes;
  } finally { reopened?.free(); original.free(); }
}
