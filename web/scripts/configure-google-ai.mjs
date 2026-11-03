import {readFile,writeFile}from'node:fs/promises';import{resolve,dirname}from'node:path';import{fileURLToPath}from'node:url';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(web,'../.artifacts/sites/jakal-office-online');
const {validateGoogleConfig}=await import(new URL('../../.artifacts/sites/jakal-office-online/dist/google-ai.js',import.meta.url));
if(process.argv[2]!=='--config'||!process.argv[3])throw Error('Usage: node web/scripts/configure-google-ai.mjs --config <public-config.json>');
const input=JSON.parse(await readFile(resolve(process.argv[3]),'utf8')),config=validateGoogleConfig({...input,enabled:true});
if(process.argv.includes('--check-only'))console.log('Google AI public configuration validated. No files changed; no key values printed.');
else{await writeFile(resolve(site,'dist/google-ai-config.json'),JSON.stringify({enabled:true,...config},null,2)+'\n');console.log('Google AI public configuration validated and written. Publish the Site to activate it. No key values printed.');}
