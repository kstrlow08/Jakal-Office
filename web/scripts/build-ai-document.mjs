import {build} from 'esbuild';import {resolve,dirname} from 'node:path';import{fileURLToPath}from'node:url';import{copyFile,writeFile,readFile}from'node:fs/promises';import{createHash}from'node:crypto';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dist=resolve(web,'../.artifacts/sites/jakal-office-online/dist');
const result=await build({entryPoints:[resolve(web,'online/ai-document-worker.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,write:false,legalComments:'eof'});
const bytes=result.outputFiles[0].contents,hash=createHash('sha256').update(bytes).digest('hex').slice(0,16),file=`ai-document-worker-${hash}.js`;
await writeFile(resolve(dist,file),bytes);await writeFile(resolve(dist,'ai-document-worker.js'),`import './${file}';\n`);await copyFile(resolve(web,'online/ai-diff.mjs'),resolve(dist,'ai-diff.js'));
const template=await readFile(resolve(web,'online/ai-panel-template.txt'),'utf8'),ui=await readFile(resolve(web,'online/ai-editor.mjs'),'utf8');await writeFile(resolve(dist,'ai-editor.js'),ui.replace('__PANEL_TEMPLATE__',JSON.stringify(template)));
console.log(JSON.stringify({file,bytes:bytes.length}));
