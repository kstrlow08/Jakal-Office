import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { versionSiteAssets } from '../scripts/version-site-assets.mjs';

test('changing a lazy dependency invalidates the entry URL, while unchanged builds keep hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jakal-assets-'));
  try {
    const files = {
      'index.html':'<script type="module" src="/app.js"></script><link href="/app.css" rel="stylesheet">',
      'app.js':"import {documents} from './storage.js'; const ai=()=>import('./ai-editor.js'); const css='/ai-editor.css';",
      'storage.js':'export const documents = 1;', 'ai-editor.js':"import './ai-core.js';",
      'ai-core.js':'export const version = 1;', 'app.css':'body{}', 'ai-editor.css':'.ai-dialog{}',
    };
    await Promise.all(Object.entries(files).map(([name, contents])=>writeFile(join(root,name),contents)));
    const first = await versionSiteAssets(root), html = await readFile(join(root,'index.html'),'utf8');
    assert.deepEqual(await versionSiteAssets(root), first);
    assert.equal(await readFile(join(root,'index.html'),'utf8'), html);
    await writeFile(join(root,'storage.js'),'export const documents = 2;');
    const second = await versionSiteAssets(root);
    assert.notEqual(second['app.js'], first['app.js']);
    assert.equal(second['ai-editor.js'], first['ai-editor.js']);
    assert.equal(second['app.css'], first['app.css']);
    assert.match(await readFile(join(root,'app.js'),'utf8'), /storage\.js\?v=[a-f0-9]{16}/);
    assert.notEqual(await readFile(join(root,'index.html'),'utf8'), html);
  } finally { await rm(root,{recursive:true,force:true}); }
});
