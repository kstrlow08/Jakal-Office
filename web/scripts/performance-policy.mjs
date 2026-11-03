function replace(code,from,to,label){if(!code.includes(from))throw Error('Pinned performance boundary changed: '+label);return code.replace(from,to);}
export function applyPerformancePolicy(code,id){
  id=id.replaceAll('\\','/');
  if(!/\/(?:canvas-metric-session|input-handler|canvas-view|page-renderer|render-surface-budget|command|main|table)\.ts$/.test(id))return code;
  code=code.replaceAll('\r\n','\n');
  if(id.endsWith('/src/main.ts')){
    code="import { exportInBackground } from '@jakal/background-export';\n"+code;
    code=replace(code,"async exportHwpx() {\n      await initPromise;\n      return wasm.exportHwpx();","async exportHwpx() {\n      await initPromise;\n      return exportInBackground(wasm,'hwpx');",'background HWPX host export');
    code=replace(code,"async exportHwp() {\n      await initPromise;\n      return wasm.exportHwp();","async exportHwp() {\n      await initPromise;\n      return exportInBackground(wasm,'hwp');",'background HWP host export');
  }
  if(id.endsWith('/command/commands/table.ts')){
    const start=code.indexOf('function applyTableInsertRowColumn('),end=code.indexOf('\n/**',start);
    if(start<0||end<0)throw Error('Pinned bulk table command changed');
    let block=code.slice(start,end);
    block=replace(block,'operation: (wasm) => {','operation: (wasm) => wasm.runInBatch(() => {','bulk table batch');
    block=replace(block,'return pos;\n    },','return pos;\n    }),','bulk table commit');
    code=code.slice(0,start)+block+code.slice(end);
  }
  if(id.endsWith('/core/canvas-metric-session.ts')){
    code="import { MetricFailureGate } from '@jakal/metric-failure-gate';\n"+code;
    code=replace(code,'private epoch = 0;','private epoch = 0;\n  private jakalMetricFailure = new MetricFailureGate();','metric gate');
    code=replace(code,'invalidate(): void { this.epoch += 1;','invalidate(): void { this.jakalMetricFailure.clear(); this.epoch += 1;','metric invalidation');
    code=replace(code,"if (backend !== 'canvas2d') return doc.selectCanvasMetrics(false);","if (backend !== 'canvas2d') return doc.selectCanvasMetrics(false);\n    if(this.jakalMetricFailure.matches(doc,generation))return false;",'metric retry');
    code=replace(code,'this.lastError = String(error);','this.lastError = String(error);\n      this.jakalMetricFailure.record(doc,generation,error);','metric failure');
  }
  if(id.endsWith('/engine/input-handler.ts')){
    code="import { QuietTask } from '@jakal/quiet-task';\n"+code;
    code=replace(code,'private deferredPaginationPending = false;','private deferredPaginationPending = false;\n  private jakalPaginationFallback = new QuietTask();','fallback task');
    code=replace(code,"this.flushDeferredPaginationIfNeeded('resumable-fallback');","if(this.wasm.pageCount>30){\n      this.jakalPaginationFallback.schedule(()=>{if(this.deferredPaginationPending)this.flushDeferredPaginationIfNeeded('resumable-fallback');});\n    }else this.flushDeferredPaginationIfNeeded('resumable-fallback');",'fallback admission');
    code=replace(code,"flushDeferredPaginationIfNeeded(reason = 'manual', emitChange = true): boolean {","flushDeferredPaginationIfNeeded(reason = 'manual', emitChange = true): boolean {\n    this.jakalPaginationFallback.cancel();",'exact barrier');
  }
  if(id.endsWith('/view/canvas-view.ts')){
    code="import { collectPageGeometry } from '@jakal/page-geometry';\n"+code;
    const loop=`    this.pages = [];
    for (let i = 0; i < pageCount; i++) {
      try {
        this.pages.push(this.wasm.getPageInfo(i));
      } catch (e) {
        console.error(\`[CanvasView] 페이지 \${i} 정보 조회 실패:\`, e);
      }
    }`;
    code=replace(code,loop,`    const geometry=await collectPageGeometry(pageCount,i=>this.wasm.getPageInfo(i),()=>!this.disposed&&epoch===this.rendererSelectionEpoch);
    if(!geometry)return;this.pages=geometry;`,'initial geometry');
    code=replace(code,'refreshPages(): void {','refreshPages(preparedPages?: PageInfo[]): void {','prepared refresh');
    code=replace(code,loop,'    if(preparedPages)this.pages=preparedPages;else {\n'+loop+'\n    }','prepared geometry');
    code=replace(code,'private async selectMutationRevision(): Promise<','private async selectMutationRevision(preserveSummary = false): Promise<','local revision');
    code=replace(code,'if (!pinned) return this.selectNextDocumentRevision();','if (!pinned) return this.selectNextDocumentRevision(true,preserveSummary);','local revision fallback');
    code=replace(code,'this.applyRendererSelection(pinned) || selected.backendChanged','this.applyRendererSelection(pinned,preserveSummary) || selected.backendChanged','local selection');
    code=replace(code,'private async selectNextDocumentRevision(resetResources = true): Promise<','private async selectNextDocumentRevision(resetResources = true,preserveSummary = false): Promise<','revision selection');
    code=replace(code,'backendChanged: this.applyRendererSelection(selection) || metricsChanged','backendChanged: this.applyRendererSelection(selection,preserveSummary) || metricsChanged','revision application');
    code=replace(code,'private applyRendererSelection(selection: RendererSessionSelection): boolean {','private applyRendererSelection(selection: RendererSessionSelection,preserveSummary = false): boolean {','selection summary');
    code=replace(code,'this.pageRenderer.invalidateDocumentRevision();','this.pageRenderer.invalidateDocumentRevision(preserveSummary);','summary invalidation');
    code=replace(code,'private async refreshInvalidatedPageForMutation(payload: unknown): Promise<void> {\n    const selected = await this.selectMutationRevision();',`private async refreshInvalidatedPageForMutation(payload: unknown): Promise<void> {
    const local=!!payload&&typeof payload==='object'&&(payload as any).reason==='text-edit';
    const selected = await this.selectMutationRevision(local);`,'page local summary');
  }
  if(id.endsWith('/view/page-renderer.ts')){
    code=replace(code,'invalidateDocumentRevision(): void {','invalidateDocumentRevision(preserveSummary = false): void {','renderer revision');
    const start=code.indexOf('invalidateDocumentRevision(preserveSummary');
    code=code.slice(0,start)+replace(code.slice(start),'this.layerSummaryCache.clear();','if(!preserveSummary)this.layerSummaryCache.clear();','renderer summary');
    code=replace(code,`&& this.renderFocusedPagePatch(pageIdx, canvas, renderScale, displayScale, context)
    ) {
      return { needsTextEditStaticLayerVerification: false };`,`&& this.renderFocusedPagePatch(pageIdx, canvas, renderScale, displayScale, context)
    ) {
      return { needsTextEditStaticLayerVerification: true };`,'settled patch verification');
  }
  if(id.endsWith('/engine/command.ts')){
    code="import { capturePlainLine, plainLinePatch } from '@jakal/plain-line-patch';\n"+code;
    code=replace(code,'  const result = wasm.replaceBodyTextLocal(','  const beforeLine=capturePlainLine(wasm,pos.sectionIndex,pos.paragraphIndex);\n  const result = wasm.replaceBodyTextLocal(','plain line probe');
    code=replace(code,'const focusedPagePatch = !result.flowChanged ? result.focusedPagePatch : undefined;',`const focusedPagePatch = !result.flowChanged ? result.focusedPagePatch ??
    (result.documentPaginationPending ? plainLinePatch(beforeLine,capturePlainLine(wasm,pos.sectionIndex,pos.paragraphIndex)) : undefined) : undefined;`,'plain line patch');
  }
  if(id.endsWith('/view/render-surface-budget.ts')){
    code=replace(code,'DEFAULT_VISIBLE_SURFACE_PIXEL_BUDGET = 32_000_000','DEFAULT_VISIBLE_SURFACE_PIXEL_BUDGET = 20_000_000','visible budget');
    code=replace(code,'DEFAULT_RETAINED_SURFACE_PIXEL_BUDGET = 40_000_000','DEFAULT_RETAINED_SURFACE_PIXEL_BUDGET = 24_000_000','retained budget');
  }
  return code;
}
