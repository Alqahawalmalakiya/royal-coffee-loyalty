// RFC 8291 aes128gcm Web Push payload encryption + RFC 8292 VAPID using Web Crypto only.
// No Node APIs or third-party dependencies; compatible with Cloudflare Workers.
const encoder=new TextEncoder();
const encode=(s)=>encoder.encode(s);
export function concat(...parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
export function b64url(bytes){let str='';for(const b of bytes)str+=String.fromCharCode(b);return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unb64url(s){const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function extract(salt,ikm){const key=await crypto.subtle.importKey('raw',salt,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,ikm));}
async function expand(prk,info,n){const key=await crypto.subtle.importKey('raw',prk,{name:'HMAC',hash:'SHA-256'},false,['sign']);let result=new Uint8Array(0),previous=new Uint8Array(0),counter=1;while(result.length<n){previous=new Uint8Array(await crypto.subtle.sign('HMAC',key,concat(previous,info,Uint8Array.of(counter++))));result=concat(result,previous);}return result.slice(0,n);}
export async function encryptPayload(subscription,json){
 const uaPublic=unb64url(subscription.p256dh),auth=unb64url(subscription.auth);
 if(uaPublic.length!==65||uaPublic[0]!==4||auth.length!==16)throw Error('Invalid subscription encryption keys');
 const uaKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const server=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',server.publicKey));
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},server.privateKey,256));
 const prk=await extract(auth,secret);
 const ikm=await expand(prk,concat(encode('WebPush: info\0'),uaPublic,serverPublic),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const keyPrk=await extract(salt,ikm);
 const cek=await expand(keyPrk,encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await expand(keyPrk,encode('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const payload=concat(encode(JSON.stringify(json)),Uint8Array.of(2));
 if(payload.length>3900)throw Error('Push payload too large');
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,payload));
 return concat(salt,Uint8Array.of(0,0,16,0,serverPublic.length),serverPublic,ciphertext);
}
export async function vapidHeaders(endpoint,privateJwk,subject){
 const jwk=JSON.parse(privateJwk);
 const pub=concat(Uint8Array.of(4),unb64url(jwk.x),unb64url(jwk.y));
 const aud=new URL(endpoint).origin;
 const header=b64url(encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const claims=b64url(encode(JSON.stringify({aud,exp:Math.floor(Date.now()/1000)+11*3600,sub:subject})));
 const unsigned=`${header}.${claims}`;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encode(unsigned)));
 return {Authorization:`vapid t=${unsigned}.${b64url(sig)}, k=${b64url(pub)}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400'};
}
const allowedHost=(host)=>host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||(host==='web.push.apple.com'||host.endsWith('.push.apple.com'))||host==='android.googleapis.com'||host.endsWith('.notify.windows.com');
export async function sendWebPush(subscription,message,env){
 const endpoint=new URL(subscription.endpoint);
 if(endpoint.protocol!=='https:'||!allowedHost(endpoint.hostname))throw Error('Push endpoint host not allowed');
 const body=await encryptPayload(subscription,message);
 const headers=await vapidHeaders(subscription.endpoint,env.VAPID_PRIVATE_JWK,env.VAPID_SUBJECT);
 const res=await fetch(subscription.endpoint,{method:'POST',headers,body});
 // Provider acceptance (2xx) is not proof of device delivery.
 return {ok:res.ok,status:res.status,error:res.ok?null:(await res.text().catch(()=>'')).slice(0,200)};
}
