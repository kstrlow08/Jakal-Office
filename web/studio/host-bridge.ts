// Appended to the pinned Studio entry at build time; uses its existing event bus.
// Only the enclosing same-origin Jakal window receives state and save requests.
import { installInputProfile } from '@jakal/input-profile';
import { insertBlock } from '@jakal/block-insertion';
import { installHostFileActions } from '@jakal/file-actions';
import { installTableTools } from '@jakal/table-tools';
import { installObjectLayout } from '@jakal/object-layout';
import { installImageTools } from '@jakal/image-tools';
import { installOfficeFonts } from '@jakal/font-catalog';
import { readAiTarget, listAiTargets } from '@jakal/ai-target';
import { installRibbon } from '@jakal/ribbon';
void initPromise.then(() => installInputProfile({ wasm, input: inputHandler, view: canvasView }));
const jakalHost = window.parent !== window;
if (jakalHost) installHostFileActions(registry, action => jakalPost('file-action', { action }));
if (jakalHost) installTableTools(registry, () => inputHandler);
installImageTools(registry);
installOfficeFonts(registry);
document.addEventListener('jakal-font-loaded', () => { canvasView?.refreshPages(); });
if (jakalHost) void initPromise.then(() => installObjectLayout(registry, dispatcher, eventBus, getContext, () => inputHandler, wasm));
if (jakalHost) registry.register({ id: 'jakal:workbench', label: '작업 도구 찾기', canExecute: context => context.hasDocument, execute: () => jakalPost('workbench') });
// After the object layout, so the contextual tab row keeps its place after 도구.
if (jakalHost) void initPromise.then(() => installRibbon(registry, dispatcher, eventBus));
if (jakalHost) registry.register({
  id: 'jakal:insert-block', label: '텍스트 블록 삽입',
  canExecute: context => {
    const cursor = (inputHandler as any)?.cursor;
    return context.hasDocument && context.isEditable && !context.isFormMode && !context.hasSelection && !context.inTable && !context.inField && !context.inPictureObjectSelection && !context.inTableObjectSelection && !!cursor && !cursor.isInHeaderFooter() && !cursor.isInFootnote() && !cursor.isInTextBox();
  },
  execute: (_services, params) => {
    if (!inputHandler || document.documentElement.classList.contains('rhwp-busy')) throw new Error('문서를 준비하고 있습니다.');
    inputHandler.focus();
    const position = inputHandler.getPosition();
    inputHandler.executeOperation({ kind: 'snapshot', operationType: 'jakalInsertBlock', operation: engine => insertBlock(engine, position, params?.text) });
  },
});
if (jakalHost) {
  document.addEventListener('compositionstart', () => jakalPost('composition', { composing: true }), true);
  document.addEventListener('compositionend', () => jakalPost('composition', { composing: false }), true);
  document.addEventListener('drop', (event: DragEvent) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.some(file => /\.(hwp|hwpx)$/i.test(file.name))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    document.getElementById('scroll-container')?.classList.remove('drag-over');
    jakalPost('file-drop', { count: files.length, ...(files.length === 1 ? { file: files[0] } : {}) });
  }, true);
}
let jakalSequence = 0;
let jakalChangeFrame = 0;
function jakalPost(type: string, extra: Record<string, unknown> = {}) {
  if (jakalHost) window.parent.postMessage({ channel: 'jakal-studio-v1', type, sequence: jakalSequence, ...extra }, location.origin);
}
eventBus.on('document-dirty-changed', () => jakalPost('dirty', { dirty: documentState.isDirty() }));
function jakalChanged() {
  jakalSequence++;
  if (!jakalChangeFrame) jakalChangeFrame = requestAnimationFrame(() => {
    jakalChangeFrame = 0;
    jakalPost('changed', { dirty: documentState.isDirty() });
  });
}
eventBus.on('document-mutated', jakalChanged);
eventBus.on('document-changed', jakalChanged);
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== 'jakal-studio-v1') return;
  if (event.data.type === 'ai-read' && typeof event.data.requestId === 'string') {
    try { jakalPost('ai-read-result', { requestId: event.data.requestId, evidence: readAiTarget(wasm, event.data.target) }); }
    catch (error) { jakalPost('ai-read-result', { requestId: event.data.requestId, error: error instanceof Error ? error.message : '문단을 읽지 못했습니다.' }); }
  }
  if (event.data.type === 'ai-list' && typeof event.data.requestId === 'string') {
    try { jakalPost('ai-list-result', {requestId:event.data.requestId, evidence:listAiTargets(wasm)}); }
    catch { jakalPost('ai-list-result', {requestId:event.data.requestId,error:'본문 목록을 읽지 못했습니다.'}); }
  }
  if (event.data.type === 'tools') {
    const mode = event.data.mode;
    if (!['essential', 'full', 'focus'].includes(mode)) return;
    document.documentElement.classList.toggle('jakal-full-tools', mode === 'full');
    setChromeVisibility({ menu: mode !== 'focus', toolbar: mode !== 'focus', statusbar: true });
  }
  if (event.data.type === 'filename' && typeof event.data.name === 'string' && event.data.name.length <= 180 && !/[\x00-\x1f\x7f/\\]/.test(event.data.name)) {
    wasm.fileName = event.data.name;
  }
});
document.addEventListener('keydown', (event) => {
  if (jakalHost && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === 'KeyK') {
    event.preventDefault(); event.stopImmediatePropagation(); jakalPost('workbench'); return;
  }
  if (jakalHost && (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyS') {
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.shiftKey) jakalPost('file-action', { action: 'copy' });
    else jakalPost('save');
  }
}, true);
// The embed profile gives file lifecycle to the host. Keep the document light
// and the runtime's native menus, selection, IME and undo stack intact.
if (jakalHost) {
  setThemeMode('light');
  document.documentElement.classList.add('jakal-embed');
}
