/** Keep the pinned IME text/undo path; replace only its visual block caret. */
export function useLineCaretDuringComposition(source) {
  source = source.replaceAll('\r\n', '\n');
  const method = source.indexOf('  private updateCaret(skipScroll: boolean = false): void {');
  const start = source.indexOf('      // IME 조합 중:', method);
  const end = source.indexOf('      if (!skipScroll) {', start);
  const block = source.slice(start, end);
  if (method < 0 || start < method || end < start || (block.match(/this\.caret\.showComposition\(/g) || []).length !== 1
      || !block.includes('this.caret.update(caretRect, zoom);')) throw new Error('Pinned composition caret path changed');
  return source.slice(0, start) + `      // Composition text is already painted by the document renderer.
      // Blink only the thin caret at the actual cursor, including wrapped/cell text.
      this.caret.hideComposition();
      this.caret.update(caretRect, zoom);
` + source.slice(end);
}
