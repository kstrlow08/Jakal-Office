// Pinned, self-hosted editor runtime. No document is sent to the upstream site.
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationHash } from './studio-version.mjs';
import { compressAssets } from './compress-assets.mjs';
import { restoreHostFileCommands } from '../studio/file-command-policy.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(web, '..');
const source = resolve(repo, 'build/rhwp-studio-source');
const commit = '1a76570e833917d15817415a53c09ad61ab3203f'; // v0.8.7, MIT
try {
  await readFile(resolve(source, 'rhwp-studio/src/main.ts'));
} catch {
  execFileSync('git', ['clone', '--depth', '1', '--branch', 'v0.8.7', '--filter=blob:none', '--sparse', 'https://github.com/edwardkim/rhwp.git', source], { stdio: 'inherit' });
  execFileSync('git', ['sparse-checkout', 'set', 'rhwp-studio', 'rhwp-shared', 'npm/editor', 'assets/fonts'], { cwd: source, stdio: 'inherit' });
}
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw new Error('Unexpected editor source revision');
const out = resolve(web, 'public/studio');
const bridge = await readFile(resolve(web, 'studio/host-bridge.ts'), 'utf8');
const css = await readFile(resolve(web, 'studio/jakal.css'), 'utf8');
await build({
  configFile: false, root: resolve(source, 'rhwp-studio'), base: '/studio/', publicDir: false,
  // PostCSS also sees @import-ed styles; Vite's transform hook does not.
  css: { postcss: { plugins: [{
    postcssPlugin: 'jakal-local-icon-sprites',
    Declaration(declaration) {
      declaration.value = declaration.value.replaceAll('url(/images/', 'url(/studio/images/');
    },
  }] } },
  define: { __APP_VERSION__: JSON.stringify('0.8.7'), __RHWP_DISABLE_EXTERNAL_WEBFONTS__: 'true', __RHWP_HWPCTRL__: 'false' },
  resolve: { alias: {
    '@': resolve(source, 'rhwp-studio/src'), '@wasm': resolve(web, 'node_modules/@rhwp/core'),
    '@noble/hashes': resolve(web, 'node_modules/@noble/hashes'),
    'canvaskit-wasm': resolve(web, 'node_modules/canvaskit-wasm'),
    '@jakal/input-profile': resolve(web, 'studio/input-profile.ts'),
    '@jakal/font-cache': resolve(web, 'studio/font-cache.ts'),
    '@jakal/frame-task': resolve(web, 'studio/frame-task.ts'),
    '@jakal/load-progress': resolve(web, 'studio/load-progress.ts'),
    '@jakal/block-insertion': resolve(web, 'studio/block-insertion.ts'),
    '@jakal/character-dialog': resolve(web, 'studio/character-dialog.ts'),
    '@jakal/file-actions': resolve(web, 'studio/file-actions.ts'),
    '@jakal/table-tools': resolve(web, 'studio/table-tools.ts'),
    '@jakal/object-layout': resolve(web, 'studio/object-layout.ts'),
    '@jakal/nested-table': resolve(web, 'studio/nested-table.ts'),
    '@jakal/table-drag': resolve(web, 'studio/table-drag.ts'),
    '@jakal/image-tools': resolve(web, 'studio/image-tools.ts'),
    '@jakal/font-catalog': resolve(web, 'studio/font-catalog.ts'),
    '@jakal/export-compat': resolve(web, 'studio/export-compat.ts'),
    '@jakal/ai-target': resolve(web, 'studio/ai-target.ts'),
    '@jakal/ribbon': resolve(web, 'studio/ribbon.ts'),
  } },
  plugins: [{
    name: 'jakal-studio-host', enforce: 'pre',
    transform(code, id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/engine/input-handler.ts')) {
        const start = code.indexOf('private hitTestCellRowCol(');
        const target = 'const ctx = this.cursor.getCellTableContext();';
        const at = code.indexOf(target, start);
        if (start < 0 || at < 0) throw new Error('Pinned table drag context changed');
        return `import { dragTableContext } from '@jakal/table-drag';\n` + code.slice(0,at) + code.slice(at).replace(target,'const ctx = dragTableContext(this.cursor);');
      }
      if (path.endsWith('/engine/input-handler-mouse.ts')) {
        const target = 'this.cursor.setCellSelectionFocus?.(cellRC.row, cellRC.col);\n  this.updateCellSelection();';
        code = code.replaceAll('\r\n', '\n');
        if (!code.includes(target)) throw new Error('Pinned table drag update changed');
        return code.replace(target, target + "\n  this.eventBus.emit('command-state-changed');");
      }
      if (path.endsWith('/core/font-loader.ts')) {
        const target = 'const FONT_LIST: readonly FontEntry[] = FONT_RULE_WEBFONT_ENTRIES;';
        if (!code.includes(target)) throw new Error('Pinned font catalogue changed');
        return `import { OFFICE_FONT_ENTRIES } from '@jakal/font-catalog';\n` + code.replace(target,'const FONT_LIST: readonly FontEntry[] = [...FONT_RULE_WEBFONT_ENTRIES, ...OFFICE_FONT_ENTRIES];');
      }
      if (path.endsWith('/ui/toolbar.ts')) {
        const target = "const BASE_FONTS = ['함초롬바탕', '함초롬돋움', '맑은 고딕', '나눔고딕', '바탕', '돋움', '궁서'];";
        if (!code.includes(target)) throw new Error('Pinned toolbar font list changed');
        return `import { OFFICE_FONT_NAMES } from '@jakal/font-catalog';\n` + code.replace(target,target.replace("'궁서']", "'궁서', ...OFFICE_FONT_NAMES]")).replace("this.fontMenuCategory = this.fontMenuDocumentFonts.length > 0 ? 'document' : 'current';", "this.fontMenuCategory = 'all';");
      }
      if (path.endsWith('/ui/symbols-dialog.ts')) {
        const target = 'new InsertTextCommand(pos, this.selectedChar)';
        if (!code.includes(target)) throw new Error('Pinned symbol insertion changed');
        return code.replace(target,'new InsertTextCommand(pos, this.selectedChar, Date.now(), ih.getPendingCharShape())');
      }
      if (id.replaceAll('\\', '/').endsWith('/core/mutation-method-registry.ts')) {
        const methods = "'createTable', 'createTableEx',";
        if (!code.includes(methods)) throw new Error('Pinned table mutation registry changed');
        return code.replace(methods, "'createTable', 'createTableEx', 'createNestedTable', 'editNestedTable',");
      }
      if (id.replaceAll('\\', '/').endsWith('/ui/chrome-mode.ts')) return restoreHostFileCommands(code.replaceAll('\r\n', '\n'));
      if (id.replaceAll('\\', '/').endsWith('/command/commands/format.ts')) {
        code = code.replaceAll('\r\n', '\n');
        const selection = 'const savedSel = ih.getSelection();\n      if (!savedSel) return;';
        const apply = 'ih.applyCharPropsToRange(savedSel.start, savedSel.end, mods);';
        if (!code.includes(selection) || !code.includes(apply)) throw new Error('Pinned character dialog selection handling changed');
        return `import { applyDialogCharacterProps } from '@jakal/character-dialog';\nimport { CursorState } from '@/engine/cursor';\n` + code.replace(selection, 'const savedSel = ih.getSelection();').replace(apply, 'applyDialogCharacterProps(ih, services.eventBus, savedSel, mods, CursorState.comparePositions);');
      }
      if (id.replaceAll('\\', '/').endsWith('/rhwp-studio/src/main.ts')) {
        code = code.replaceAll('\r\n', '\n');
        const progress = '  await waitForNextPaint();\n}';
        const progressAt = code.indexOf('async function updateLoadProgress(');
        if (progressAt < 0 || !code.slice(progressAt).includes(progress)) throw new Error('Pinned document progress changed');
        code = code.slice(0, progressAt) + code.slice(progressAt).replace(progress, '  await jakalLoadProgress(percent, label, sbMessage());\n}');
        code = "import { createLoadProgress } from '@jakal/load-progress';\nconst jakalLoadProgress = createLoadProgress();\n" + code;
        const schedule = 'function autosaveScheduleFromUserSettings(): AutosaveScheduleSettings {';
        if (!code.includes(schedule)) throw new Error('Pinned autosave settings changed');
        code = code.replace(schedule, `${schedule}
          // The enclosing app owns version-aware HWPX recovery. Avoid a second
          // synchronous HWP export while the user is entering text.
          if (window.parent !== window && new URLSearchParams(location.search).get('chrome') === 'embed') {
            return { recoveryEnabled: false, recoveryIntervalMs: 600000, idleEnabled: false, idleDelayMs: 10000 };
          }`);
        const fontRefresh = "document.fonts.addEventListener('loadingdone', () => {\n    if (!canvasView || wasm.pageCount === 0) return;";
        if (!code.includes(fontRefresh)) throw new Error('Pinned font refresh listener changed');
        code = code.replace(fontRefresh, "document.fonts.addEventListener('loadingdone', () => {\n    if (document.documentElement.classList.contains('rhwp-busy') || !canvasView || wasm.pageCount === 0) return;");
        const loadStart = 'await withBusyCursor(document.documentElement, async () => {\n    //';
        if (!code.includes(loadStart)) throw new Error('Pinned document loading boundary changed');
        code = code.replace(loadStart, 'await withBusyCursor(document.documentElement, async () => {\n    inputHandler?.deactivate();\n    //');
        return code + '\n' + bridge;
      }
      if (id.replaceAll('\\', '/').endsWith('/core/wasm-bridge.ts')) {
        code = code.replaceAll('\r\n', '\n');
        const tableMethod = '  createTableEx(options: {';
        if (!code.includes(tableMethod)) throw new Error('Pinned table creation bridge changed');
        code = `import { insertNestedTable, editNestedTable, type TablePosition, type TableOptions, type StructureOptions } from '@jakal/nested-table';\n` + code.replace(tableMethod, `  editNestedTable(position: TablePosition, operation: string, options?: StructureOptions): TablePosition {
          if (!this.doc) throw new Error('문서가 로드되지 않았습니다');
          return editNestedTable(this.doc, position, operation, options);
        }
        createNestedTable(position: TablePosition, rows: number, cols: number, options?: TableOptions): TablePosition {
          if (!this.doc) throw new Error('문서가 로드되지 않았습니다');
          return insertNestedTable(this.doc, position, rows, cols, options);
        }
${tableMethod}`);
        // Byte-only SDK exports must also reject reported content loss.
        const fontSetter = 'scopedHostCanvasFont(String(value)) ?? substituteCssFontFamily(String(value))';
        if (!code.includes(fontSetter)) throw new Error('Pinned Canvas font setter changed');
        code = `import { resolveCachedFont } from '@jakal/font-cache';\n` + code.replace(fontSetter, `resolveCachedFont(String(value), () => ${fontSetter})`);
        const hwpReport = 'return runReportedExport(\n      () => exportFn.call(this.doc) as WasmDocumentExport,\n    );';
        const hwpStart = code.indexOf('  exportHwpWithReport(): DocumentExportArtifact {');
        const hwpAt = code.indexOf(hwpReport,hwpStart);
        if (hwpStart<0 || hwpAt<0) throw new Error('Pinned HWP export report changed');
        code=code.slice(0,hwpAt)+code.slice(hwpAt).replace(hwpReport,'return exportCompatibleHwp(this.doc, HwpDocument, runReportedExport);');
        code=code.replace('return this.doc.exportHwp();','return this.exportHwpWithReport().bytes;');
        code = `import { finalizeHwpx, exportCompatibleHwp } from '@jakal/export-compat';\n` + code;
        return code.replace('return this.doc.exportHwpx();', `const artifact = this.exportHwpxWithReport();
          if (artifact.contentLoss.count > 0) throw new Error('저장 과정에서 지원하지 않는 개체가 발견되었습니다. 원본을 유지하고 저장을 중단했습니다.');
          return finalizeHwpx(artifact.bytes);`);
      }
      if (id.replaceAll('\\', '/').endsWith('/core/host-canvas-fonts.ts')) {
        const scope = 'try { return operation(); } finally { currentSession = previous; }';
        if (!code.includes(scope)) throw new Error('Pinned Canvas font scope changed');
        return `import { withFontResolutionCache } from '@jakal/font-cache';\n` + code.replace(scope, 'try { return withFontResolutionCache(session, operation); } finally { currentSession = previous; }');
      }
      if (id.replaceAll('\\', '/').endsWith('/view/canvas-view.ts')) {
        code = code.replaceAll('\r\n', '\n');
        const start = '  private async refreshPagesForMutation(): Promise<void> {';
        const end = '\n  /** document-agent RPC';
        const a = code.indexOf(start), b = code.indexOf(end, a);
        if (a < 0 || b < 0 || !code.includes('export class CanvasView {')) throw new Error('Pinned mutation paint boundary changed');
        code = code.slice(0, a) + `  private async refreshPagesForMutation(): Promise<void> {
          const generation = this.wasm.documentGeneration;
          const selected = await this.selectMutationRevision();
          if (!selected || !this.rendererSession.isCurrent(selected.selection)) return;
          this.jakalMutationPaint.schedule(() => {
            if (this.disposed || generation !== this.wasm.documentGeneration) return;
            this.refreshPages();
            this.eventBus.emit('document-layout-refreshed', { source: 'mutation' });
          });
        }
` + code.slice(b);
        code = code.replace('export class CanvasView {', 'export class CanvasView {\n  private jakalMutationPaint = new FrameTask();');
        code = code.replace('private reset(): void {', 'private reset(): void {\n    this.jakalMutationPaint.cancel();');
        return `import { FrameTask } from '@jakal/frame-task';\n` + code;
      }
    },
    transformIndexHtml(html) {
      return html.replace('<title>rhwp-studio</title>', '<title>Jakal 문서 편집기</title>').replace('src="/theme-init.js"', 'src="/studio/theme-init.js"').replace('src="/locale-init.js"', 'src="/studio/locale-init.js"').replace('href="/favicon.ico"', 'href="/studio/favicon.ico"').replaceAll('href="/icons/', 'href="/studio/icons/').replace('</head>', '<link rel="stylesheet" href="/studio/jakal.css"></head>');
    },
  }],
  build: { outDir: out, emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
for (const name of ['theme-init.js', 'locale-init.js', 'favicon.ico', 'icons', 'images', 'print.html']) {
  await cp(resolve(source, 'rhwp-studio/public', name), resolve(out, name), { recursive: true });
}
await cp(resolve(source, 'assets/fonts'), resolve(out, 'fonts'), { recursive: true });
await cp(resolve(web, 'public/fonts/editor'), resolve(out, 'fonts/jakal'), { recursive: true });
await cp(resolve(source, 'LICENSE'), resolve(out, 'LICENSE-rhwp.txt'));
await writeFile(resolve(out, 'jakal.css'), css);
await compressAssets(out);
await mkdir(resolve(out, 'metadata'), { recursive: true });
await writeFile(resolve(out, 'metadata/version.json'), JSON.stringify({ version: '0.8.7', commit, integrationHash: await integrationHash(), source: 'https://github.com/edwardkim/rhwp', license: 'MIT' }));
