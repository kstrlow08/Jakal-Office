import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export async function integrationHash() {
  const hash = createHash('sha256');
  for (const name of ['nested-table.ts', 'table-tools.ts', 'object-layout.ts', 'table-drag.ts', 'image-tools.ts', 'font-catalog.ts', 'export-compat.ts']) hash.update(await readFile(new URL('../studio/' + name, import.meta.url)));
  hash.update(await readFile(new URL('../studio/ai-target.ts', import.meta.url)));
  hash.update(await readFile(new URL('../public/fonts/editor/sources.json', import.meta.url)));
  hash.update(await readFile(new URL('../studio/file-command-policy.mjs', import.meta.url)));
  for (const name of ['build-studio.mjs', '../studio/host-bridge.ts', '../studio/jakal.css', '../studio/input-profile.ts', '../studio/font-cache.ts', '../studio/frame-task.ts', '../studio/block-insertion.ts', '../studio/character-dialog.ts', '../studio/file-actions.ts', '../studio/ribbon.ts']) hash.update(await readFile(new URL(name, import.meta.url)));
  return hash.digest('hex');
}
