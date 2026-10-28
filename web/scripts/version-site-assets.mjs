// Keep cached modules usable between visits and prevent mixed deployment files.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function versionSiteAssets(directory) {
  const root = resolve(directory), versions = new Map();
  const hash = source => createHash('sha256').update(source).digest('hex').slice(0, 16);
  async function version(file) {
    if (versions.has(file)) return versions.get(file);
    let source = (await readFile(file, 'utf8')).replace(/\?v=[a-f0-9]{16}/g, '');
    if (file.endsWith('.js')) {
      const references = [...source.matchAll(/(['"])(\.\.?\/[^'"?\s]+\.js)\1/g)];
      for (const [literal, quote, path] of references) {
        // The pinned SDK has its own release lifecycle; its relative imports stay intact.
        if (path.includes('/vendor/')) continue;
        const child = resolve(dirname(file), path);
        if (!child.startsWith(root + '/')) {
          if (!child.startsWith(root + '\\')) throw new Error('Asset outside Site');
        }
        source = source.replaceAll(literal, `${quote}${path}?v=${await version(child)}${quote}`);
      }
      if (file === resolve(root, 'app.js')) {
        source = source.replaceAll("'/ai-editor.css'", `'/ai-editor.css?v=${await version(resolve(root, 'ai-editor.css'))}'`);
      }
    }
    if (source !== await readFile(file, 'utf8')) await writeFile(file, source);
    const value = hash(source); versions.set(file, value); return value;
  }
  const index = resolve(root, 'index.html');
  let html = (await readFile(index, 'utf8')).replace(/\?v=[a-f0-9]{16}/g, '');
  for (const name of ['app.js', 'app.css']) {
    const value = await version(resolve(root, name));
    html = html.replaceAll(`"/${name}"`, `"/${name}?v=${value}"`);
  }
  await writeFile(index, html);
  return Object.fromEntries([...versions].map(([file, value]) => [file.slice(root.length + 1), value]));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await versionSiteAssets(process.argv[2] || 'dist'));
}
