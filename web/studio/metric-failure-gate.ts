/** InvalidStyle is deterministic for a document/font generation. Keep its portable
 * fallback until a real font/document invalidation, rather than rescanning per key. */
export class MetricFailureGate {
  private failed: { doc:object; document:number; fonts:number } | null = null;
  matches(doc:object,generation:{document:number;fonts:number}) {
    return this.failed?.doc===doc && this.failed.document===generation.document && this.failed.fonts===generation.fonts;
  }
  record(doc:object,generation:{document:number;fonts:number},error:unknown) {
    if(/\bInvalidStyle\b/.test(String(error)))this.failed={doc,...generation};
  }
  clear(){this.failed=null;}
}
