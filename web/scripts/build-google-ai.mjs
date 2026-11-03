import {build} from 'esbuild';import {readFile,writeFile,mkdir,copyFile}from'node:fs/promises';import {resolve,dirname}from'node:path';import {fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(web,'../.artifacts/sites/jakal-office-online'),dist=resolve(site,'dist');
const result=await build({entryPoints:[resolve(web,'online/google-ai-sdk.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,legalComments:'eof'});
const bytes=result.outputFiles[0].contents,hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
await mkdir(resolve(dist,'vendor/google'),{recursive:true});const name=`firebase-${hash}.js`;
await writeFile(resolve(dist,'vendor/google',name),bytes);
await writeFile(resolve(dist,'google-ai-sdk.js'),`// Firebase 12.19.0, Apache-2.0. Loaded only for configured AI use.\nexport * from './vendor/google/${name}';\n`);
await copyFile(resolve(web,'public/licenses/firebase-Apache-2.0.txt'),resolve(dist,'licenses/firebase-Apache-2.0.txt'));
console.log(JSON.stringify({sdk:'firebase@12.19.0',bytes:bytes.length,file:name}));
