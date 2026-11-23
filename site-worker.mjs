// This Worker adds a PRIVATE, per-card install manifest without touching the
// existing customer's link or the existing Cloudflare Worker name.
// The card token stays in the install start_url so installed iOS PWAs do not
// depend on Safari's isolated localStorage.
const TOKEN = /^[a-f0-9]{64}$/;
const MANIFEST_PATH = /^\/app-manifest\/([a-f0-9]{64})\.webmanifest$/;
const OPEN_PATH = /^\/card\/open\/([a-f0-9]{64})$/;
const headers={
  'Content-Type':'application/manifest+json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  'Pragma':'no-cache',
  'Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin',
  'X-Content-Type-Options':'nosniff'
};
export function validCardToken(token){return typeof token==='string' && TOKEN.test(token);}
export async function personalManifest(token){
  if(!validCardToken(token))throw new Error('Invalid card identifier');
  // No raw bearer token in the app ID. The card token appears only in the
  // private start URL the operating system needs to launch this customer's card.
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  const id=Array.from(hash.slice(0,20),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {
    id:`/installed-royal-card/${id}`,
    name:'بطاقة الولاء | ضيافة القهوة الملكية',
    short_name:'القهوة الملكية',
    description:'بطاقة مناسباتك وهديتك في ضيافة القهوة الملكية',
    lang:'ar',dir:'rtl',
    start_url:`/card/open/${token}`,
    scope:'/',
    display:'standalone',
    background_color:'#fbf4ea',theme_color:'#fbf4ea',
    icons:[
      {src:'/assets/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/assets/icon-maskable-192.png',sizes:'192x192',type:'image/png',purpose:'maskable'},
      {src:'/assets/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
    ]
  };
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/card/open/')){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{'Allow':'GET','Cache-Control':'no-store'}});
      const match=url.pathname.match(OPEN_PATH);
      if(!match)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
      // Preserve customer identity even on platforms which discard URL fragments
      // from the installed app's launch URL. This is a server-side same-origin redirect.
      return new Response(null,{status:302,headers:{
        'Location':new URL(`/card/#card=${match[1]}`,request.url).href,
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff'
      }});
    }
    if(url.pathname.startsWith('/app-manifest/')){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{'Allow':'GET','Cache-Control':'no-store'}});
      const match=url.pathname.match(MANIFEST_PATH);
      if(!match)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
      return new Response(JSON.stringify(await personalManifest(match[1])),{status:200,headers});
    }
    return env.ASSETS.fetch(request);
  }
};
