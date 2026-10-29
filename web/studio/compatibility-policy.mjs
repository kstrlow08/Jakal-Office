function replace(source, before, after, label) {
  if (!source.includes(before)) throw new Error('Pinned editor compatibility boundary changed: ' + label);
  return source.replace(before, after);
}
export function repairHeaderInput(source) {
  source = source.replaceAll('\r\n', '\n');
  source = replace(source, 'this.applyCharFormatInHeaderFooterSelection(props);\n      return;', `if (!this.applyCharFormatInHeaderFooterSelection(props)) stageHeaderTypingProps(this, props);
      else clearHeaderTypingProps(this);
      return;`, 'HF character format');
  source = replace(source, 'if (this.cursor.isInHeaderFooter() || this.cursor.isInFootnote()) return undefined;', `if (this.cursor.isInHeaderFooter()) return headerTypingProps(this);
    if (this.cursor.isInFootnote()) return undefined;`, 'HF pending properties');
  source = replace(source, '    const cmd = new ApplyCharFormatCommand(start, end, props);', `    if (this.cursor.isInHeaderFooter()) { this.applyCharFormat(props); return; }
    const cmd = new ApplyCharFormatCommand(start, end, props);`, 'HF range routing');
  source = replace(source, '    const targets = this.getParaFormatTargetsForRange(start, end);', `    if (this.cursor.isInHeaderFooter() || this.cursor.isInFootnote()) { this.applyParaFormat(props as Record<string, unknown>); return; }
      const targets = this.getParaFormatTargetsForRange(start, end);`, 'HF paragraph dialog');
  source = replace(source, '  applyStyle(styleId: number): void {\n    try {', '  applyStyle(styleId: number): void {\n    try {\n      if (this.cursor.isInHeaderFooter()) { applyHeaderStyle(this, styleId); return; }', 'HF style routing');
  source = replace(source, `return this.wasm.getCharPropertiesInHeaderFooter(
        this.cursor.hfSectionIdx,
        this.cursor.headerFooterMode === 'header',
        this.cursor.hfApplyTo,
        paraIdx,
        charOffset,
      );`, `return { ...this.wasm.getCharPropertiesInHeaderFooter(
        this.cursor.hfSectionIdx, this.cursor.headerFooterMode === 'header', this.cursor.hfApplyTo, paraIdx, charOffset,
      ), ...(!selection ? headerTypingProps(this) : {}) };`, 'HF pending toggle state');
  return `import { headerTypingProps, stageHeaderTypingProps, clearHeaderTypingProps, applyHeaderStyle } from '@jakal/header-format';\n` + source;
}
export function repairHeaderText(source) {
  source = source.replaceAll('\r\n', '\n');
  const composing = 'const headerFooterSelectionComposition = this.headerFooterSelectionComposition === true;';
  source = replace(source, composing, composing + '\n  const pendingHeaderTyping = anchor && this.cursor.isInHeaderFooter() ? headerTypingProps(this, anchor.charOffset) : undefined;', 'HF composition final style capture');
  source = replace(source, 'this.wasm.insertTextInHeaderFooter(target.sectionIdx, isHeader, target.applyTo, paraIdx, charOffset, text);', `const typingProps = headerTypingProps(this, charOffset);
      this.wasm.insertTextInHeaderFooter(target.sectionIdx, isHeader, target.applyTo, paraIdx, charOffset, text);
      if (typingProps) this.wasm.applyCharFormatInHeaderFooter(target.sectionIdx, isHeader, target.applyTo, paraIdx, charOffset, paraIdx, charOffset + text.length, JSON.stringify(typingProps));`, 'HF plain insertion');
  source = replace(source, 'new InsertTextInHeaderFooterCommand(target, paraIdx, charOffset, text)', 'new InsertTextInHeaderFooterCommand(target, paraIdx, charOffset, text, typingProps)', 'HF styled undo record');
  source = replace(source, 'this.cursor.setHfCursorPosition(paraIdx, charOffset + text.length);', 'this.cursor.setHfCursorPosition(paraIdx, charOffset + text.length);\n      if (typingProps) stageHeaderTypingProps(this, typingProps);\n      advanceHeaderTypingProps(this, charOffset + text.length);', 'HF caret advance');
  source = replace(source, "this.executeOperation({ kind: 'record', command: new InsertTextInHeaderFooterCommand(target, this.cursor.hfParaIdx, anchor.charOffset, composed) });", `const typingProps = pendingHeaderTyping;
        if (typingProps) this.wasm.applyCharFormatInHeaderFooter(target.sectionIdx, target.isHeader, target.applyTo, this.cursor.hfParaIdx, anchor.charOffset, this.cursor.hfParaIdx, anchor.charOffset + composed.length, JSON.stringify(typingProps));
        this.executeOperation({ kind: 'record', command: new InsertTextInHeaderFooterCommand(target, this.cursor.hfParaIdx, anchor.charOffset, composed, typingProps) });
        if (typingProps) stageHeaderTypingProps(this, typingProps);
        advanceHeaderTypingProps(this, anchor.charOffset + composed.length);`, 'HF composed insertion');
  return `import { headerTypingProps, stageHeaderTypingProps, advanceHeaderTypingProps } from '@jakal/header-format';\n` + source;
}
export function repairHeaderCommand(source) {
  const start = source.indexOf('export class InsertTextInHeaderFooterCommand'), end = source.indexOf('\n/**', start);
  if (start < 0 || end < 0) throw new Error('Pinned header command changed');
  let command = source.slice(start, end);
  command = replace(command, 'private text: string,', 'private text: string,\n    private charProps?: Record<string, unknown>,', 'HF redo properties');
  const insert = 'wasm.insertTextInHeaderFooter(this.target.sectionIdx, this.target.isHeader, this.target.applyTo, this.paraIdx, this.charOffset, this.text);';
  command = replace(command, insert, insert + '\n    if (this.charProps) wasm.applyCharFormatInHeaderFooter(this.target.sectionIdx, this.target.isHeader, this.target.applyTo, this.paraIdx, this.charOffset, this.paraIdx, this.charOffset + this.text.length, JSON.stringify(this.charProps));', 'HF redo formatting');
  return source.slice(0, start) + command + source.slice(end);
}
