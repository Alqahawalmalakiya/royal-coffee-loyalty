import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto,generateKeyPairSync} from 'node:crypto';
import {membershipQrSvg} from '../web/qr.js';
import {encryptPayload,vapidHeaders,b64url,unb64url,concat} from '../worker/webpush.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const encode=s=>new TextEncoder().encode(s);
async function extract(salt,ikm){const k=await crypto.subtle.importKey('raw',salt,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,ikm));}
async function expand(prk,info,n){const k=await crypto.subtle.importKey('raw',prk,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,concat(info,Uint8Array.of(1)))).slice(0,n);}
const b64=key=>b64url(new Uint8Array(key));

test('membership QR is valid, deterministic and has the member identifier',()=>{
 const svg=membershipQrSvg('LC-AABBCCDDEEFF');
 assert.match(svg,/viewBox="0 0 49 49"/);
 assert.match(svg,/<path d="M/);
 assert.equal(svg,membershipQrSvg('LC-AABBCCDDEEFF'));
 assert.throws(()=>membershipQrSvg('X'.repeat(135)),/supports/);
});

test('Web Push payload round-trips through RFC 8291 AES128GCM',async()=>{
 const ua=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const uaPublic=new Uint8Array(await crypto.subtle.exportKey('raw',ua.publicKey));
 const auth=crypto.getRandomValues(new Uint8Array(16));
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:b64(uaPublic),auth:b64(auth)};
 const message={title:'هدية',body:'قهوتان',url:'/'};
 const body=await encryptPayload(sub,message);
 const salt=body.slice(0,16),idLen=body[20],serverPublic=body.slice(21,21+idLen),ciphertext=body.slice(21+idLen);
 assert.equal(idLen,65);assert.equal(body[16],0);assert.equal(body[17],0);assert.equal(body[18],16);assert.equal(body[19],0);
 const serverKey=await crypto.subtle.importKey('raw',serverPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:serverKey},ua.privateKey,256));
 const prk=await extract(auth,secret),ikm=await expand(prk,concat(encode('WebPush: info\0'),uaPublic,serverPublic),32);
 const keyPrk=await extract(salt,ikm),cek=await expand(keyPrk,encode('Content-Encoding: aes128gcm\0'),16),nonce=await expand(keyPrk,encode('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']);
 const decrypted=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},aes,ciphertext));
 assert.equal(decrypted.at(-1),2);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(decrypted.slice(0,-1))),message);
});

test('VAPID JWT signature verifies with the public EC key',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=privateKey.export({format:'jwk'});
 const head=await vapidHeaders('https://fcm.googleapis.com/fcm/send/test',JSON.stringify(jwk),'mailto:admin@example.com');
 const m=head.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
 assert.ok(m);
 const [payload,signature]=m[1].split(/\.(?=[^.]*$)/);
 const pub=await crypto.subtle.importKey('jwk',publicKey.export({format:'jwk'}),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,unb64url(signature),encode(payload)),true);
 const claim=JSON.parse(new TextDecoder().decode(unb64url(payload.split('.')[1])));
 assert.equal(claim.aud,'https://fcm.googleapis.com');
});

test('SQL migrations include role guards, RLS, atomic redemption and idempotency protections',()=>{
 const sql=fs.readFileSync(new URL('../db/001_initial.sql',import.meta.url),'utf8');
 const skip=fs.readFileSync(new URL('../db/002_skip_jobs.sql',import.meta.url),'utf8');
 const tables=['customers','hospitality_events','rewards','reward_redemptions','invitation_tokens','push_subscriptions','notification_preferences','notification_outbox','audit_logs'];
 for(const t of tables){assert.match(sql,new RegExp(`create table public\\.${t} \\(`));assert.ok(sql.includes(`'${t}'`));}
 assert.match(sql,/unique\(request_id,request_index\)/);
 assert.match(sql,/reward_id uuid not null unique/);
 assert.match(sql,/if r.status<>'available' then raise exception/);
 assert.match(sql,/for update skip locked/);
 assert.match(sql,/grant execute on function public.service_invitation_lookup\(text\).*to service_role/);
 assert.match(sql,/public\.admin_grant_stamps\(uuid,integer,text,date,uuid\).*to authenticated/);
 assert.match(skip,/to service_role/);
});

test('frontend has consent UI, iPhone install instructions and service worker',()=>{
 const app=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 const sw=fs.readFileSync(new URL('../web/service-worker.js',import.meta.url),'utf8');
 const config=fs.readFileSync(new URL('../web/config.js',import.meta.url),'utf8');
 assert.match(app,/أوافق وأفعّل التذكيرات/);
 assert.match(app,/إضافة إلى الشاشة الرئيسية/);
 assert.match(sw,/showNotification/);
 assert.ok(!config.includes('eyJhbGciOi'));
});
