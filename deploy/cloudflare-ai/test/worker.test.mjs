import test from 'node:test';import assert from 'node:assert/strict';
import{generateKeyPair,SignJWT}from'jose';
import{createVerifier}from'../src/auth.mjs';
import{createHandler,MODEL,parseOutput}from'../src/worker.mjs';
import{EditLimits,LIMITS}from'../src/limits.mjs';
const vars={ALLOWED_ORIGIN:'https://office.test',FIREBASE_PROJECT_ID:'jakal-office',FIREBASE_PROJECT_NUMBER:'123',FIREBASE_APP_ID:'1:123:web:abc'};
const valid={source_paragraph:'2026년 학생 30명이 참가했습니다.',editing_request:'간결하게 다듬기'};
function memory(){const values=new Map();let tail=Promise.resolve();return{get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),transaction(run){const next=tail.then(()=>run(this));tail=next.catch(()=>{});return next;}};}
const request=(body=valid,headers={})=>new Request('https://worker.test/edit',{method:'POST',headers:{Origin:vars.ALLOWED_ORIGIN,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
function fixture(){const calls=[],object=new EditLimits({storage:memory()}),tasks=[];const env={...vars,AI:{run:async(model,input)=>{calls.push({model,input});return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({replacement:'2026년 학생 30명이 참가했다.'})}}]};}},LIMITS:{idFromName:()=>1,get:()=>({fetch:(url,init)=>object.fetch(new Request(url,init))})}};return{calls,env,ctx:{waitUntil:p=>tasks.push(p)},tasks,handler:createHandler({verify:async()=> 'test-user'})};}
test('JWT signatures, issuer, audience, Google provider and exact app identity are verified',async()=>{
 const keys=await generateKeyPair('RS256'),other=await generateKeyPair('RS256'),now=Math.floor(Date.now()/1000);
 const auth=async(overrides={},key=keys.privateKey)=>new SignJWT({auth_time:now,email_verified:true,firebase:{sign_in_provider:'google.com'},...overrides}).setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuedAt().setSubject('user').setAudience(vars.FIREBASE_PROJECT_ID).setIssuer('https://securetoken.google.com/'+vars.FIREBASE_PROJECT_ID).setExpirationTime('1h').sign(key);
 const app=async(subject=vars.FIREBASE_APP_ID)=>new SignJWT({}).setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuedAt().setSubject(subject).setAudience('projects/123').setIssuer('https://firebaseappcheck.googleapis.com/123').setExpirationTime('1h').sign(keys.privateKey);
 const verify=createVerifier({authKey:keys.publicKey,appKey:keys.publicKey});
 const r=async(a,b)=>new Request('https://worker.test/edit',{headers:{Authorization:'Bearer '+(a||await auth()),'X-Firebase-AppCheck':b||await app()}});
 assert.equal(await verify(await r(),vars),'user');
 for(const token of [await auth({},other.privateKey),await auth({firebase:{sign_in_provider:'password'}}),await auth({email_verified:false}),await auth({auth_time:now+3600})])await assert.rejects(verify(await r(token),vars));
 await assert.rejects(verify(await r(await auth(),await app('another-app')),vars));
 await assert.rejects(verify(await r(),{...vars,FIREBASE_PROJECT_ID:'another-project'}));
 await assert.rejects(verify(new Request('https://worker.test'),vars));
});
test('bad origins, authentication and oversized or unexpected inputs cannot call AI',async()=>{
 const f=fixture();
 assert.equal((await f.handler(request(valid,{Origin:'https://evil.test'}),f.env,f.ctx)).status,403);
 const denied=createHandler({verify:async()=>{throw Error('secret');}});assert.equal((await denied(request(),f.env,f.ctx)).status,401);
 for(const body of [{...valid,model:'paid-model'},{...valid,source_paragraph:'x'.repeat(4001)},{...valid,source_paragraph:'two\nparagraphs'},{...valid,editing_request:''}])assert.equal((await f.handler(request(body),f.env,f.ctx)).status,400);
 assert.equal(f.calls.length,0);
});
test('only the fixed free model receives one paragraph; the browser receives a validated draft',async()=>{
 const f=fixture(),r=await f.handler(request(),f.env,f.ctx);assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),vars.ALLOWED_ORIGIN);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(await r.json(),{replacement:'2026년 학생 30명이 참가했다.'});assert.equal(f.calls[0].model,MODEL);assert.deepEqual(JSON.parse(f.calls[0].input.messages[1].content),valid);assert.equal(f.calls[0].input.store,false);await Promise.all(f.tasks);
});
test('truncated, malformed, extra-key and multiline responses cannot become drafts',()=>{
 for(const value of [{choices:[{finish_reason:'length',message:{content:'{"replacement":"ok"}'}}]},{choices:[{finish_reason:'stop',message:{content:'<script>bad</script>'}}]},{choices:[{finish_reason:'stop',message:{content:'{"replacement":"ok","extra":true}'}}]},{choices:[{finish_reason:'stop',message:{content:'{"replacement":"a\\nb"}'}}]}])assert.throws(()=>parseOutput(value),/INVALID_RESPONSE/);
});
test('provider messages are redacted and no fallback is attempted',async()=>{
 const f=fixture();let attempts=0;f.env.AI.run=async()=>{attempts++;throw Object.assign(Error('private document and token'),{status:403});};const r=await f.handler(request(),f.env,f.ctx);assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:'FREE_CAPACITY_UNAVAILABLE'});assert.equal(attempts,1);await Promise.all(f.tasks);
});
test('durable reservations prevent concurrent and daily-limit bypass across requests',async()=>{
 const object=new EditLimits({storage:memory()}),user='a'.repeat(64);
 const call=async(action,lease,userId=user)=>{const r=await object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action,user:userId,lease})}));return r.json();};
 const leases=[crypto.randomUUID(),crypto.randomUUID()];const results=await Promise.all(leases.map(lease=>call('reserve',lease)));assert.equal(results.filter(x=>x.allowed).length,1);
 await call('release',leases[results.findIndex(x=>x.allowed)]);
 for(let i=0;i<LIMITS.globalDaily-1;i++){const lease=crypto.randomUUID(),id=(i+1).toString(16).padStart(64,'0');assert((await call('reserve',lease,id)).allowed);await call('release',lease,id);}
 const denied=await call('reserve',crypto.randomUUID(),'f'.repeat(64));assert.equal(denied.allowed,false);assert.equal(denied.code,'DAILY_LIMIT');
});
