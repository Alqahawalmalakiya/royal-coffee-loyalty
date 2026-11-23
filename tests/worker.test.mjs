import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{runScheduled} from '../worker/index.js';
const env={SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-test',VAPID_PRIVATE_JWK:'{}',VAPID_SUBJECT:'mailto:admin@example.com'};
const reply=(body)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
test('cron-only Worker rejects all HTTP modification requests',async()=>{
 for(const p of ['/api/activate','/api/recover','/api/redeem','/api/subscribe']){
  const res=await worker.fetch(new Request(`https://push.example${p}`,{method:'POST'}));assert.equal(res.status,404);
 }
 const health=await worker.fetch(new Request('https://push.example/health'));assert.equal(health.status,200);
});
test('scheduled worker queries queue and skips empty subscriptions',async()=>{
 const calls=[],original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  const name=String(url).split('/').at(-1);calls.push(name);
  if(name==='service_queue_scheduled')return reply({weekly_queued:0,test_queued:0});
  if(name==='service_claim_jobs')return reply([{id:'10000000-0000-4000-8000-000000000000',title:'x',body:'y'}]);
  if(name==='service_get_job_subscriptions')return reply([]);
  if(name==='service_skip_job')return reply(true);
  throw Error(`Unexpected request ${name}`);
 };
 try{assert.deepEqual(await runScheduled(env),{claimed:1});assert.deepEqual(calls,['service_queue_scheduled','service_claim_jobs','service_get_job_subscriptions','service_skip_job']);}
 finally{globalThis.fetch=original;}
});
