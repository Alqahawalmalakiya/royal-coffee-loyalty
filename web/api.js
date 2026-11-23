import {CONFIG} from './config.js';

const SESSION_KEY='royal-coffee-admin-session-v2';
const CARD_KEY='royal-coffee-private-card-v2';
let session=null,refreshPromise=null;
try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch(_){}
export const config=CONFIG;
export const configured=()=>Boolean(CONFIG.SUPABASE_URL?.startsWith('https://') && CONFIG.SUPABASE_PUBLISHABLE_KEY && CONFIG.CARD_API_URL?.startsWith('https://'));
export const currentSession=()=>session;
export const currentCardToken=()=>localStorage.getItem(CARD_KEY)||'';
export const saveCardToken=(token)=>{if(token && /^[a-f0-9]{64}$/.test(token))localStorage.setItem(CARD_KEY,token);else localStorage.removeItem(CARD_KEY);};
const apiError=(body,status)=>{const error=new Error(body?.msg||body?.error_description||body?.message||body?.error||`HTTP ${status}`);error.status=status;return error;};
async function parseJson(r){const body=await r.json().catch(()=>({}));if(!r.ok)throw apiError(body,r.status);return body;}
async function authPost(path,data){return parseJson(await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:{'apikey':CONFIG.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(data)}));}
export async function loginAdmin(email,password){const r=await authPost('token?grant_type=password',{email,password});session=r;localStorage.setItem(SESSION_KEY,JSON.stringify(r));return r;}
export async function refreshSession(){if(!session?.refresh_token)throw Error('تحتاج تسجيل الدخول.');if(!refreshPromise){refreshPromise=authPost('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(r=>{session=r;localStorage.setItem(SESSION_KEY,JSON.stringify(r));return r;}).catch(err=>{session=null;localStorage.removeItem(SESSION_KEY);throw err;}).finally(()=>refreshPromise=null);}return refreshPromise;}
export async function getToken(){if(!session)throw Error('تحتاج تسجيل الدخول.');if(session.expires_at && session.expires_at<Math.floor(Date.now()/1000)+80)await refreshSession();return session.access_token;}
export async function logout(){if(session){try{await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`}});}catch(_){}}session=null;localStorage.removeItem(SESSION_KEY);}
export async function rpc(name,params={}){const run=async()=>fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${await getToken()}`,'Content-Type':'application/json'},body:JSON.stringify(params)});let r=await run();if(r.status===401){await refreshSession();r=await run();}return parseJson(r);}
export async function cardApi(action,params={}){if(!CONFIG.CARD_API_URL)throw Error('خدمة البطاقات لم يتم ربطها.');return parseJson(await fetch(`${CONFIG.CARD_API_URL}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(params)}));}
export async function fetchCard(token){return cardApi('card',{token});}
export const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||Boolean(window.navigator.standalone);
function fromBase64Url(base64){const padding='='.repeat((4-base64.length%4)%4);return Uint8Array.from(atob((base64+padding).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function subscribeCardPush(token,marketing){
 if(!CONFIG.VAPID_PUBLIC_KEY)throw Error('إشعارات Web Push لم يتم تشغيلها بعد من الإدارة.');
 if(!isStandalone() && /iphone|ipad|ipod/i.test(navigator.userAgent))throw Error('على iPhone، ثبّت البطاقة من Safari وافتحها من الشاشة الرئيسية أولًا.');
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('جهازك أو هذا المتصفح لا يدعم الإشعارات.');
 // Trigger the native permission prompt directly inside the user's click handler.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('لم يتم السماح بالإشعارات. يمكنك تغييره من إعدادات الجهاز.');
 const registration=await navigator.serviceWorker.ready;
 let subscription=await registration.pushManager.getSubscription();let isNew=false;
 if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:fromBase64Url(CONFIG.VAPID_PUBLIC_KEY)});isNew=true;}
 const {endpoint,keys}=subscription.toJSON();
 try{
  await cardApi('subscribe',{token,endpoint,p256dh:keys.p256dh,auth:keys.auth,privacyAccepted:true,marketing:Boolean(marketing)});
 }catch(error){if(isNew)await subscription.unsubscribe().catch(()=>{});throw error;}
 return true;
}
export async function optOutCardPush(token){let endpoint=null;
 if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub){endpoint=sub.endpoint;await sub.unsubscribe();}}
 return cardApi('unsubscribe',{token,endpoint});
}
