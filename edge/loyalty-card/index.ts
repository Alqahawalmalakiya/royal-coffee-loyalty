// Public read-only card capability API. The ONLY credential for a customer card is a
// 256-bit opaque token in their private QR link; the service-role key never leaves Deno.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
  'Access-Control-Allow-Headers': 'Content-Type,apikey,Authorization,x-client-info',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};
const asJson=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
});
const tokenOk=(t:unknown):t is string=>typeof t==='string' && /^[a-f0-9]{64}$/.test(t);
const endpointAllowed=(s:unknown):s is string=>{
 if(typeof s!=='string'||s.length>2048)return false;
 try{const u=new URL(s);return u.protocol==='https:'&&(
   u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||
   u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')
 );}catch{return false;}
};
export async function handleCardRequest(request:Request,env?:{SUPABASE_URL:string,SUPABASE_SERVICE_ROLE_KEY:string}):Promise<Response>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const path=new URL(request.url).pathname.split('/').at(-1)||'';
 if(path==='health'&&request.method==='GET')return asJson({ok:true,component:'loyalty-card'});
 if(request.method!=='POST'||!['card','subscribe','unsubscribe','marketing'].includes(path))return asJson({message:'Not found'},404);
 const vars=env??{
   SUPABASE_URL:Deno.env.get('SUPABASE_URL')||'',
   SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
 };
 if(!vars.SUPABASE_URL||!vars.SUPABASE_SERVICE_ROLE_KEY)return asJson({message:'Card service is not configured'},503);
 let payload:Record<string,unknown>;
 try{
  const raw=await request.text();if(raw.length>4500)return asJson({message:'Request too large'},413);
  payload=JSON.parse(raw);
  if(payload===null||typeof payload!=='object'||Array.isArray(payload))throw Error('Not object');
 }catch{return asJson({message:'Invalid JSON'},400);}
 if(!tokenOk(payload.token))return asJson({message:'Invalid card link'},400);
 let name='';let input:Record<string,unknown>={p_token:payload.token};
 if(path==='card')name='service_card_by_token';
 if(path==='subscribe'){
  if(!endpointAllowed(payload.endpoint)||typeof payload.p256dh!=='string'||typeof payload.auth!=='string'||
   payload.p256dh.length<40||payload.p256dh.length>200||payload.auth.length<10||payload.auth.length>100||
   payload.privacyAccepted!==true||typeof payload.marketing!=='boolean')return asJson({message:'Invalid notification subscription or consent'},400);
  name='service_card_subscribe';input={p_token:payload.token,p_endpoint:payload.endpoint,p_p256dh:payload.p256dh,p_auth:payload.auth,p_privacy_accepted:true,p_marketing:payload.marketing};
 }
 if(path==='unsubscribe'){
  if(payload.endpoint!==null && payload.endpoint!==undefined && (typeof payload.endpoint!=='string'||payload.endpoint.length>2048))return asJson({message:'Invalid subscription'},400);
  name='service_card_opt_out';input={p_token:payload.token,p_endpoint:payload.endpoint||null};
 }
 if(path==='marketing'){
  if(typeof payload.marketing!=='boolean')return asJson({message:'Invalid preference'},400);
  name='service_card_update_marketing';input={p_token:payload.token,p_marketing:payload.marketing};
 }
 try{
  const response=await fetch(`${vars.SUPABASE_URL}/rest/v1/rpc/${name}`,{
   method:'POST',headers:{'apikey':vars.SUPABASE_SERVICE_ROLE_KEY,'Authorization':`Bearer ${vars.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(input)
  });
  if(!response.ok){
   // Do not disclose SQL diagnostics, token existence or internal state to callers.
   if(response.status===400||response.status===404)return asJson({message:path==='card'?'هذه البطاقة غير متاحة. اطلب رابطًا جديدًا من الإدارة.':'تعذّر حفظ إعدادات البطاقة.'},404);
   return asJson({message:'تعذّر الاتصال بنظام البطاقات. حاول لاحقًا.'},502);
  }
  const result=await response.json().catch(()=>null);
  return asJson(path==='card'?result:{ok:true});
 }catch{return asJson({message:'خدمة البطاقات غير متاحة حاليًا.'},503);}
}
// Deno.serve is deliberately conditional so this file is importable by Node tests.
if(typeof Deno!=='undefined')Deno.serve((r:Request)=>handleCardRequest(r));
