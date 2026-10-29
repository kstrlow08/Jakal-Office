/** Only a deliberate numbered prefix at an otherwise empty body paragraph. */
export function numberedPrefix(text: string) {
  const match = /^([1-9]\d?)([.)])$/.exec(text);
  return match ? { start: Number(match[1]), suffix: match[2] } : null;
}
export function installAutomaticNumbering(getInput: () => any) {
  document.addEventListener('beforeinput', event => {
    const input = getInput();
    if (!input || event.target !== input.textarea || event.isComposing || input.isComposing || event.inputType !== 'insertText' || event.data !== ' ') return;
    const c = input.cursor, p = c.getPosition();
    if (c.isInHeaderFooter() || c.isInFootnote() || p.parentParaIndex !== undefined || p.isTextBox || c.hasSelection() || input.isFormMode?.()) return;
    if (p.charOffset < 2 || p.charOffset > 3 || input.wasm.getParagraphLength(p.sectionIndex, p.paragraphIndex) !== p.charOffset) return;
    const prefix = numberedPrefix(input.getTextAt({ ...p, charOffset: 0 }, p.charOffset));
    if (!prefix || (input.getParaProperties().headType ?? 'None') !== 'None') return;
    event.preventDefault(); event.stopImmediatePropagation();
    input.executeOperation({ kind: 'snapshot', operationType: 'automaticNumbering', operation: (wasm: any) => {
      const id = prefix.suffix === '.' ? wasm.ensureDefaultNumbering() : wasm.createNumbering(JSON.stringify({ start: 1, levelFormats: Array.from({length:7},(_,i)=>`^${i+1})`), numberFormats: Array(7).fill(0) }));
      wasm.deleteText(p.sectionIndex, p.paragraphIndex, 0, p.charOffset);
      wasm.applyParaFormat(p.sectionIndex, p.paragraphIndex, JSON.stringify({headType:'Number',numberingId:id,paraLevel:0}));
      if (prefix.start !== 1) wasm.setNumberingRestart(p.sectionIndex, p.paragraphIndex, 1, prefix.start);
      return { ...p, charOffset: 0 };
    } });
    input.textarea.value = ''; input.focus();
  }, true);
  document.addEventListener('keydown', event => {
    if (!['Enter', 'Backspace'].includes(event.key) || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const input = getInput(); if (!input || event.target !== input.textarea || input.isComposing || input.isFormMode?.()) return;
    const c = input.cursor, p = c.getPosition();
    if (c.isInHeaderFooter() || c.isInFootnote() || c.hasSelection() || p.parentParaIndex !== undefined || p.isTextBox || p.charOffset !== 0) return;
    const props = input.getParaProperties();
    if (!['Number','Bullet','Outline'].includes(props.headType)) return;
    if (event.key === 'Enter' && input.wasm.getParagraphLength(p.sectionIndex,p.paragraphIndex) !== 0) return;
    event.preventDefault(); event.stopImmediatePropagation(); input.applyParaPropsAtCursor({headType:'None',numberingId:0,paraLevel:0}); input.focus();
  }, true);
}
