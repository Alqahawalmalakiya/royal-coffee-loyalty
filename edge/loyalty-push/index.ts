// Loyalty booking-reminder push dispatch. Deployed separately from the read-only card API.
// No privileged credentials are returned to callers or compiled into public files.
import { sendWebPush } from './webpush.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (data:unknown,status=200,publicCORS=false)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(publicCORS?cors:{})}});
function vars(){return {url:Deno.env.get('SUPABASE_URL')||'',key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''};}
async function rpc(name:string,params:Record<string,unknown>={}){
 const v=vars(); if(!v.url||!v.key)throw Error('Missing Supabase function service configuration');
 const res=await fetch(`${v.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json','apikey':v.key,'Authorization':`Bearer ${v.key}`},body:JSON.stringify(params)});
 if(!res.ok){const err=(await res.text().catch(()=>''));console.error(`Push DB ${name} status=${res.status} err=${err.slice(0,200)}`);throw Error(`${name} failed (${res.status})`);}
 return res.json();
}
function b64url(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function initPublicKey(){
 let key=await rpc('service_get_push_public');if(key)return key;
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const exported=await crypto.subtle.exportKey('jwk',pair.privateKey);
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 key=await rpc('service_init_vapid',{p_public:b64url(pub),p_jwk:JSON.stringify(exported)});
 return key;
}
async function tick(cronKey:string){
 const conf=await rpc('service_get_push_config',{p_cron_key:cronKey});
 if(!conf?.vapid_private_jwk)return {error:'Forbidden',status:401};
 const env={VAPID_PRIVATE_JWK:conf.vapid_private_jwk,VAPID_SUBJECT:conf.vapid_subject};
 const queued=await rpc('service_queue_scheduled');
 let attempted=0,accepted=0,failed=0,skipped=0;
 // A maximum of 20 queue jobs per scheduled minute, with up to 5 subscribed devices per card.
 const jobs=await rpc('service_claim_jobs',{p_limit:15});
 for(const job of jobs){
  try{
   // Old point notifications are never delivered to users. Booking reminders only.
   if(job.kind!=='marketing'){await rpc('service_skip_job',{p_job_id:job.id});skipped++;continue;}
   const subs=await rpc('service_get_job_subscriptions',{p_job_id:job.id});
   if(!Array.isArray(subs)||!subs.length){await rpc('service_skip_job',{p_job_id:job.id});skipped++;continue;}
   let allOk=true;
   for(const s of subs.slice(0,5)){
    let result:{ok:boolean,status:number,error?:string|null};
    try {result=await sendWebPush(s,{title:job.title,body:job.body,url:job.path||'/card',tag:`royal-booking-${job.id}`},env);}
    catch(e){result={ok:false,status:0,error:String(e).slice(0,200)};}
    attempted++; if(result.ok)accepted++;else {failed++;allOk=false;}
    await rpc('service_record_delivery',{p_job_id:job.id,p_subscription_id:s.id,p_ok:result.ok,p_http_status:result.status||null,p_error:result.error||null});
   }
   if(subs.length>5)allOk=false;
   await rpc('service_finish_job',{p_job_id:job.id,p_ok:allOk});
  } catch(e){console.error('Push job exception',job.id,String(e).slice(0,200));try{await rpc('service_finish_job',{p_job_id:job.id,p_ok:false});}catch(_){}}
 }
 return {queued,claimed:jobs.length,attempted,accepted,failed,skipped};
}
Deno.serve(async(req:Request)=>{
 const url=new URL(req.url);const pathname=url.pathname.split('/').at(-1)||'';
 if(req.method==='OPTIONS'&&pathname==='public-key')return new Response(null,{status:204,headers:cors});
 if(req.method==='GET'&&pathname==='health')return json({ok:true,service:'royal-coffee-booking-push'});
 if(req.method==='GET'&&pathname==='public-key'){
  try{return json({publicKey:await initPublicKey()},200,true);}catch(e){console.error('Push VAPID init failure',String(e));return json({message:'Push configuration unavailable'},503,true);}
 }
 if(req.method==='POST'&&pathname==='tick'){
  const secret=req.headers.get('X-Royal-Cron-Key')||'';
  if(!/^[a-f0-9]{64}$/.test(secret))return json({message:'Unauthorized'},401);
  try{const result=await tick(secret);if('status' in result)return json({message:result.error},result.status);return json(result);}
  catch(e){console.error('Push tick error',String(e).slice(0,300));return json({message:'Dispatcher unavailable'},503);}
 }
 return json({message:'Not found'},404);
});
