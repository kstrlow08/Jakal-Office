/** Preserve the dialog's selection, or use the editor's pending typing style. */
export function applyDialogCharacterProps<Position, Properties>(
  input: { applyCharPropsToRange: (start: Position, end: Position, properties: Properties) => void; cursor?: { isInHeaderFooter: () => boolean } },
  events: { emit: (event: string, properties: Properties) => void },
  selection: { start: Position; end: Position } | null,
  properties: Properties,
  compare: (a: Position, b: Position) => number,
) {
  if (input.cursor?.isInHeaderFooter()) { events.emit('format-char', properties); return; }
  if (selection && compare(selection.start, selection.end) !== 0) input.applyCharPropsToRange(selection.start, selection.end, properties);
  else events.emit('format-char', properties);
}
