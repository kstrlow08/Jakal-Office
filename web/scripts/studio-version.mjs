import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export async function integrationHash() {
  const hash = createHash('sha256');
  for (const name of ['nested-table.ts', 'table-tools.ts', 'object-layout.ts', 'table-drag.ts', 'image-tools.ts', 'font-catalog.ts', 'export-compat.ts']) hash.update(await readFile(new URL('../studio/' + name, import.meta.url)));
  hash.update(await readFile(new URL('../studio/ai-target.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/load-progress.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/ribbon-icons.ts', import.meta.url)));
  for(const name of ['octicons.ts','octicons-data.ts','octicons-manifest.json'])hash.update(await readFile(new URL('../studio/'+name,import.meta.url)));
  hash.update(await readFile(new URL('../studio/format-bar.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/office-icons.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/command-icons.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/surface-icons.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/responsive-fit.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/table-picker.ts', import.meta.url)));
  for (const file of ['font-faces.ts','header-format.ts','compatibility-policy.mjs','automatic-numbering.ts','hanja.ts']) hash.update(await readFile(new URL('../studio/'+file,import.meta.url)));
  hash.update(await readFile(new URL('../public/studio-data/hanja-17.0.0.json',import.meta.url)));
  hash.update(await readFile(new URL('../studio/document-tools.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/encrypted-export.ts', import.meta.url)));
  hash.update(await readFile(new URL('../studio/line-caret-policy.mjs', import.meta.url)));
  hash.update(await readFile(new URL('../public/fonts/editor/sources.json', import.meta.url)));
  hash.update(await readFile(new URL('../studio/file-command-policy.mjs', import.meta.url)));
  for (const name of ['build-studio.mjs', '../studio/host-bridge.ts', '../studio/jakal.css', '../studio/input-profile.ts', '../studio/font-cache.ts', '../studio/frame-task.ts', '../studio/block-insertion.ts', '../studio/character-dialog.ts', '../studio/file-actions.ts', '../studio/ribbon.ts']) hash.update(await readFile(new URL(name, import.meta.url)));
  return hash.digest('hex');
}
