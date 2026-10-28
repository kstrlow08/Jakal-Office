/** A normal text caret has no F5 cell-selection context yet. */
export function dragTableContext(cursor: any) {
  const selected = cursor.getCellTableContext();
  if (selected) return selected;
  const p = cursor.getPosition();
  if (p.cellIndex === undefined || p.cellIndex < 0 || p.parentParaIndex === undefined || p.controlIndex === undefined) return null;
  return { sec: p.sectionIndex, ppi: p.parentParaIndex, ci: p.controlIndex, cellPath: p.cellPath };
}
