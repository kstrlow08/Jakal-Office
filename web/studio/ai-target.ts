import { collectTargetEvidence } from '@/document-agent/controller';

// Read-only bridge. Writes keep using the editor's fenced, undoable command API.
export function readAiTarget(wasm: any, target: any) {
  if (!target || target.kind !== 'body_paragraph' || target.charOffset !== 0 ||
      !Number.isSafeInteger(target.length) || target.length < 1 || target.length > 4000) {
    throw new Error('본문에서 수정할 문단 안을 클릭하세요. 한 번에 4,000자까지 편집할 수 있습니다.');
  }
  return collectTargetEvidence(wasm, target);
}

export function listAiTargets(wasm: any) {
  const result = [];
  for (let section=0; section<wasm.getSectionCount() && result.length<200; section++) {
    for (let paragraph=0; paragraph<wasm.getParagraphCount(section) && result.length<200; paragraph++) {
      const length=wasm.getParagraphLength(section,paragraph);
      if (!length || length>4000 || wasm.getControlTextPositions(section,paragraph).length) continue;
      const text=wasm.getTextRange(section,paragraph,0,length);
      if(text.trim()) result.push({target:{kind:'body_paragraph',section,paragraph,charOffset:0,length},preview:text.slice(0,70)});
    }
  }
  return result;
}
