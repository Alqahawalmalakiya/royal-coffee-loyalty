// Dedicated cron-only Web Push delivery Worker. Customer read-only API is a separate
// Supabase Edge Function; no public POST endpoint uses the service-role key here.
import {sendWebPush} from './webpush.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function rpc(env,name,body={}){
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`,{
  method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(`${name} failed (${response.status})`);
 return data;
}
export async function runScheduled(env){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.VAPID_PRIVATE_JWK||!env.VAPID_SUBJECT)throw Error('Missing notification Worker configuration');
 await rpc(env,'service_queue_scheduled',{});
 const jobs=await rpc(env,'service_claim_jobs',{p_limit:3});
 for(const job of jobs){
  let allSent=true,processed=0;
  try{
   const subscriptions=await rpc(env,'service_get_job_subscriptions',{p_job_id:job.id});
   if(!subscriptions.length){await rpc(env,'service_skip_job',{p_job_id:job.id});continue;}
   for(const subscription of subscriptions.slice(0,3)){
    processed++;
    let ok=false,status=0,err=null;
    try{const result=await sendWebPush(subscription,{title:job.title,body:job.body,url:job.path||'/card',tag:`royal-loyalty-${job.id}`},env);ok=result.ok;status=result.status;err=result.error;}
    catch(error){err=String(error.message).slice(0,180);}
    allSent&&=ok;
    await rpc(env,'service_record_delivery',{p_job_id:job.id,p_subscription_id:subscription.id,p_ok:ok,p_http_status:status||null,p_error:err});
   }
   if(subscriptions.length>3)allSent=false;
  }catch(error){console.error('Web Push job failed',job.id,error.message);allSent=false;}
  try{await rpc(env,'service_finish_job',{p_job_id:job.id,p_ok:allSent&&processed>0});}
  catch(error){console.error('Could not finish job',job.id,error.message);}
 }
 return {claimed:jobs.length};
}
export default {
 async fetch(request){
  const pathname=new URL(request.url).pathname;
  if(pathname==='/health'&&request.method==='GET')return json({ok:true,component:'royal-coffee-push-worker'});
  return json({message:'Not found'},404);
 },
 async scheduled(event,env,ctx){ctx.waitUntil(runScheduled(env).catch(e=>console.error('Push cron failed:',e.message)));}
};
