import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qrMatrix,membershipQrSvg} from '../web/qr.js';
import {handleCardRequest} from '../edge/loyalty-card/index.ts';
const token='a'.repeat(64);
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-secret'};
const body=(data)=>new Request('https://example.supabase.co/functions/v1/loyalty-card/card',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const originalFetch=globalThis.fetch;
const reply=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
test('QR generator handles long URL and rejects overflow',()=>{
 const url='https://hospitality-loyalty-card.pages.dev/card#card='+token;
 const matrix=qrMatrix(url);assert.equal(matrix.length,41);assert.equal(matrix[0].length,41);
 assert.match(membershipQrSvg(url),/viewBox="0 0 49 49"/);
 assert.throws(()=>qrMatrix('x'.repeat(135)),/1 to 134/);
});
test('card API requires a valid private token',async()=>{
 const response=await handleCardRequest(body({token:'bad'}),env);
 assert.equal(response.status,400);
});
test('card API returns limited read-only card data and never leaked RPC secrets',async()=>{
 let inspected=false;
 globalThis.fetch=async(url,opts)=>{inspected=true;assert.ok(String(url).endsWith('service_card_by_token'));assert.equal(JSON.parse(opts.body).p_token,token);assert.equal(opts.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);return reply({name:'عميل',total_events:3,progress:3});};
 try{const response=await handleCardRequest(body({token}),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{name:'عميل',total_events:3,progress:3});assert.equal(inspected,true);}finally{globalThis.fetch=originalFetch;}
});
test('card API does not allow unauthorized modification actions',async()=>{
 const request=new Request('https://example.supabase.co/functions/v1/loyalty-card/grant-stamps',{method:'POST',body:JSON.stringify({token})});
 const response=await handleCardRequest(request,env);assert.equal(response.status,404);
});
test('push opt-in requires privacy acceptance and explicit marketing choice',async()=>{
 const request=new Request('https://example.supabase.co/functions/v1/loyalty-card/subscribe',{method:'POST',body:JSON.stringify({token,endpoint:'https://fcm.googleapis.com/fcm/send/example',p256dh:'b'.repeat(60),auth:'x'.repeat(24),privacyAccepted:false,marketing:true})});
 const response=await handleCardRequest(request,env);assert.equal(response.status,400);
});
test('migration restricts public grants and stores hashed card secrets',()=>{
 const sql=readFileSync(new URL('../db/003_direct_card_links.sql',import.meta.url),'utf8');
 for(const v of ['customer_card_links','card_notification_preferences','admin_create_customer_card','admin_rotate_card_link','require_active_card','service_card_by_token','service_card_subscribe','service_card_opt_out'])assert.ok(sql.includes(v),v);
 assert.match(sql,/digest\(secret,'sha256'\)/);
 assert.match(sql,/revoke execute on function public.require_active_card/);
 assert.match(sql,/to service_role/);
});
