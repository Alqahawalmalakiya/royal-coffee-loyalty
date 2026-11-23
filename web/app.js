import {config,configured,currentSession,currentCardToken,saveCardToken,loginAdmin,logout,rpc,fetchCard,cardApi,subscribeCardPush,optOutCardPush,isStandalone} from './api.js';
import {membershipQrSvg} from './qr.js';
import {whatsappShareUrl,cardWelcomeMessage} from './whatsapp.js';
const root=document.querySelector('#app'),toastNode=document.querySelector('#toast');
const state={screen:'admin-login',role:null,data:null,card:null,cardToken:'',busy:false,adminTab:'customers',search:'',currentCustomer:null,installPrompt:null,previous:'admin-login'};
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>new Intl.NumberFormat('ar-SA').format(Number(x||0));
const date=x=>x?new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',year:'numeric',month:'short',day:'numeric'}).format(new Date(x)):'—';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const progressState=(progress,threshold,availableRewards=0)=>{const p=Number(progress||0),t=Math.max(1,Number(threshold||6)),a=Number(availableRewards||0);const ready=a>0 && p===0;return {progress:ready?t:p,remaining:ready?0:Math.max(t-p,0),ready};};
const brand=()=>`<div class="identity"><img class="brand-logo" src="/assets/logo-mark.png" alt="${escapeHtml(state.card?.business_name||state.data?.settings?.name||config.BUSINESS_NAME)}"><div><strong>${escapeHtml(state.card?.business_name||state.data?.settings?.name||config.BUSINESS_NAME)}</strong><small>بطاقة مناسباتك وهدية ضيافتك</small></div></div>`;
const header=(admin=false)=>`<header class="topbar"><div class="container top-inner">${brand()}${admin?'<button class="btn secondary small" data-action="logout">خروج</button>':''}</div></header>`;
const note=(msg)=>`<div class="info-box">${escapeHtml(msg)}</div>`;
const empty=(msg)=>`<p class="empty">${escapeHtml(msg)}</p>`;
function toast(message,error=false){toastNode.textContent=String(message);toastNode.className=`toast${error?' error':''}`;toastNode.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastNode.hidden=true,4600);}
function showError(error){console.error(error);toast(error?.message||'حصل خطأ، حاول مرة أخرى.',true);}
function render(){
 if(state.screen==='admin-login')return loginView();
 if(state.screen==='admin')return adminView();
 if(state.screen==='card')return cardView();
 if(state.screen==='privacy')return privacyView();
}
function customerCard(c){
 const threshold=Math.max(1,Number(c.threshold||6));
 const prog=progressState(c.progress,threshold,c.available_rewards);
 const ready=Number(c.available_rewards)>0;
 const cardLink=`${location.origin}/card#card=${state.cardToken}`;
 let qr='';try{qr=membershipQrSvg(cardLink);}catch(err){console.warn('QR is unavailable',err);}
 // Original silhouette shaped after an actual traditional Arabian dallah: finial, domed lid, left handle, long upturned right spout.
 const dallahSvg=`<svg viewBox="0 0 110 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" class="dallah-icon">
  <path d="M42 54C32 43 18 43 14 54C10 66 20 83 39 89" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M67 58C75 42 88 32 106 34C91 38 87 45 82 55C78 62 75 67 73 73L67 58Z" fill="currentColor"/>
  <path d="M44 48H68C68 57 71 62 75 71C80 83 76 94 66 97C58 100 45 99 39 95C30 90 30 80 35 70C39 62 44 57 44 48Z" fill="currentColor"/>
  <path d="M55 4C52 9 51 13 54 17L53 20H58L57 17C61 13 59 9 55 4Z" fill="currentColor"/>
  <path d="M53 20H58L59 28H52L53 20Z" fill="currentColor"/>
  <path d="M52 27C51 33 46 37 42 40C39 43 38 46 38 49H74C74 45 72 42 68 39C62 35 60 32 59 27H52Z" fill="currentColor"/>
  <path d="M37 49H75V52H37Z" fill="currentColor"/>
  <path d="M39 48C35 43 34 40 33 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M42 58C48 56 61 56 68 58M40 85C47 91 62 92 69 86" fill="none" stroke="var(--dallah-detail, #f4dec1)" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>
</svg>`;
 const dallahs=Array.from({length:Math.min(threshold,12)},(_,i)=>`<span class="loyalty-dallah ${i<prog.progress?'stamped':''}" role="img" aria-label="المناسبة ${i+1} ${i<prog.progress?'مكتملة':'بانتظار الاعتماد'}">${dallahSvg}</span>`).join('');
 return `<article class="bank-loyalty-card" aria-label="بطاقة ضيافة القهوة الملكية">
   <div class="bank-card-top"><span class="bank-card-type">بطاقة الولاء <small>ROYAL COFFEE</small></span><span class="bank-membership">${num(prog.progress)} من ${num(threshold)}<small>مناسبات</small></span></div>
   <div class="bank-logo"><img src="/assets/logo-mark.png" alt="شعار القهوة الملكية"></div>
   <div class="bank-dallahs">${dallahs}</div>
   <div class="bank-reward ${ready?'claimed':''}"><div><small>${ready?'🎁 المكافأة':'الهدية القادمة'}</small><strong>${ready?'هديتك جاهزة!':escapeHtml(c.reward_description)}</strong></div><div><small>${ready?'جاهزة للاستلام':'المتبقي'}</small><strong>${ready?'مبروك':`${num(prog.remaining)} مناسبات`}</strong></div></div>
   <div class="bank-qr">${qr||'<span>رمز البطاقة</span>'}</div>
   <div class="bank-bottom"><span>${escapeHtml(c.name)}</span><small class="mono">${escapeHtml(c.member_code)}</small></div>
 </article>`;
}
function loginView(){root.innerHTML=`<div class="app-shell">${header()}<main class="auth-wrap"><section class="auth-card"><span class="pill">إدارة خاصة</span><h1>إدارة بطاقات الضيافة</h1><p>من هنا تضيف العملاء والمناسبات والنقاط وترسل بطاقاتهم. العميل يدخل على بطاقته مباشرة من رمز QR الخاص به.</p><form id="admin-login-form"><div class="field"><label for="admin-email">البريد الإلكتروني</label><input id="admin-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="admin-password">كلمة المرور</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required></div><button class="btn wide" type="submit">دخول الإدارة</button></form><p class="fineprint">هذه الصفحة للإدارة فقط. روابط بطاقات العملاء خاصة ولا تحتاج تسجيل دخول.</p></section></main></div>`;}
function adminView(){const d=state.data||{},stats=d.stats||{};root.innerHTML=`<div class="app-shell">${header(true)}<main class="container"><section class="section-head"><div><span class="pill">لوحة الإدارة من جوالك</span><h1>مرحبًا بك في إدارة الضيافة</h1><p>أضف عميلًا، سجّل مناسبته، وأرسل له بطاقته برابط أو QR.</p></div><button class="btn secondary small" data-action="refresh">تحديث ↻</button></section><div class="stats"><div class="stat"><span>العملاء</span><strong>${num(stats.customers)}</strong></div><div class="stat"><span>المناسبات</span><strong>${num(stats.events)}</strong></div><div class="stat"><span>هدايا جاهزة</span><strong>${num(stats.available)}</strong></div><div class="stat"><span>هدايا مستبدلة</span><strong>${num(stats.redeemed)}</strong></div></div><nav class="admin-nav" aria-label="أقسام الإدارة"><button data-action="admin-tab" data-tab="customers" class="${state.adminTab==='customers'?'active':''}">العملاء والمناسبات</button><button data-action="admin-tab" data-tab="rewards" class="${state.adminTab==='rewards'?'active':''}">الهدايا</button><button data-action="admin-tab" data-tab="notifications" class="${state.adminTab==='notifications'?'active':''}">الإشعارات</button><button data-action="admin-tab" data-tab="settings" class="${state.adminTab==='settings'?'active':''}">الإعدادات</button></nav>${state.adminTab==='customers'?customersView(d):state.adminTab==='rewards'?rewardsView(d):state.adminTab==='notifications'?notificationsView(d):settingsView(d.settings||{})}</main></div>`;}
function customersView(d){const customers=(d.customers||[]).filter(c=>String(c.name).toLowerCase().includes(state.search.toLowerCase())||String(c.member_code).toLowerCase().includes(state.search.toLowerCase())||String(c.contact||'').includes(state.search));
 return `<section class="panel"><div class="section-head" style="margin:0 0 16px"><div><h2>عملاؤك</h2><p>كل عميل له بطاقة مستقلة. النقاط لا يمكنه تعديلها.</p></div><button class="btn" data-action="new-customer">+ عميل جديد</button></div><input type="search" id="customer-search" placeholder="بحث بالاسم أو الجوال أو العضوية" value="${escapeHtml(state.search)}" aria-label="البحث عن عميل"><div class="customer-cards">${customers.map(c=>`<article class="customer-row"><div><strong>${escapeHtml(c.name)}</strong><small class="muted">${escapeHtml(c.contact||'بدون رقم جوال')}</small><small class="mono">${escapeHtml(c.member_code)}</small></div><div class="mini-progress"><strong>${num(progressState(c.progress,d.settings?.reward_threshold||6,c.available_rewards).progress)} / ${num(d.settings?.reward_threshold||6)}</strong><small>المناسبات: ${num(c.total_events)} · الهدايا: ${num(c.available_rewards)}</small></div><button class="btn small secondary" data-action="open-customer" data-id="${escapeHtml(c.id)}">إدارة البطاقة</button></article>`).join('')||empty('ما عندك عملاء بعد. اضغط «عميل جديد» لإنشاء أول بطاقة.')}</div></section>`;}
function rewardsView(d){return `<section class="panel"><h2>المكافآت</h2>${(d.rewards||[]).map(r=>`<div class="history-item"><div><strong>${escapeHtml(r.customer_name)} — ${escapeHtml(r.description)}</strong><small>${date(r.created_at)} · ${r.status==='available'?'جاهزة للاستلام':r.status==='redeemed'?'تم الاستبدال':'ملغاة'}</small></div>${r.status==='available'?`<button class="btn small" data-action="redeem" data-id="${escapeHtml(r.id)}">تسجيل الاستلام</button>`:''}</div>`).join('')||empty('لا توجد هدايا مستحقة بعد.')}</section>`;}
function notificationsView(d){
 const s=d.settings||{},st=d.notification_stats||{};
 const days=[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']];
 const selected=Number(s.weekly_weekday??4);
 return `<section class="two-col"><div class="panel"><h2>التذكير الأسبوعي للعملاء</h2>
 <p class="hint">حدد اليوم والوقت وغيّر نص الرسالة وقت ما تحب. تصل كتذكير بالحجز للعملاء الذين وافقوا على الإشعارات.</p>
 <form id="weekly-reminder-form">
 <div class="form-grid"><div class="field"><label>يوم الإرسال</label><select name="weekday" required>${days.map(([v,l])=>`<option value="${v}" ${Number(v)===selected?'selected':''}>${l}</option>`).join('')}</select></div>
 <div class="field"><label>وقت الإرسال (توقيت السعودية)</label><input name="time" type="time" required value="${escapeHtml(s.weekly_time||'17:00')}"></div></div>
 <div class="field"><label>عنوان التذكير</label><input name="title" maxlength="90" required value="${escapeHtml(s.reminder_title||'☕ عندكم جمعة أو مناسبة؟')}"></div>
 <div class="field"><label>رسالة التذكير</label><textarea name="body" rows="4" maxlength="240" required>${escapeHtml(s.reminder_body||'جهزوا جمعتكم على كيفكم، وضيافتها علينا. احجزوا مع القهوة الملكية!')}</textarea></div>
 <button class="btn wide" type="submit">حفظ التذكير الأسبوعي</button></form>
 <p class="fineprint">يرسل النظام مرة واحدة أسبوعيًا لكل عميل مشترك، وليس كل خمس دقائق. التوقيت حسب آسيا/الرياض وقد يتأخر التسليم بحسب الهاتف والشبكة.</p></div>
 <div class="panel"><h2>حالة الإشعارات</h2><p>إشعارات الحجوزات فقط، مع موافقة العميل.</p><div class="status-line"><span>بالانتظار</span><strong>${num(st.queued)}</strong></div><div class="status-line"><span>قبلتها خدمة الإشعارات</span><strong>${num(st.provider_accepted)}</strong></div><div class="status-line"><span>فشلت</span><strong>${num(st.provider_failed)}</strong></div><p class="fineprint">تغيير إعدادات الأسبوع لا يرسل أي رسالة فورًا.</p></div></section>`;
}
function settingsView(s){return `<section class="panel" style="max-width:680px"><h2>إعدادات الضيافة</h2><form id="settings-form"><div class="field"><label>اسم النشاط</label><input name="name" required maxlength="100" value="${escapeHtml(s.name||'ضيافة القهوة الملكية')}"></div><div class="field"><label>عدد المناسبات للهدية</label><input name="reward_threshold" type="number" min="1" max="50" required value="${Number(s.reward_threshold||6)}"></div><div class="field"><label>تفاصيل الهدية</label><input name="reward_description" required maxlength="160" value="${escapeHtml(s.reward_description||'قهوتان مجانًا')}"></div><button class="btn" type="submit">حفظ الإعدادات</button></form><p class="hint">يوم إرسال التذكير ووقته ونصه تجدها في قسم «الإشعارات».</p></section>`;}
function installPrompt(){if(isStandalone())return '';
 return `<section class="install-focus" aria-label="تثبيت بطاقة الضيافة"><span class="install-icon">📲</span><div><strong>ثبّت بطاقتك على هاتفك</strong><p>عشان ما تضيع بطاقتك وتقدر تتابع نقاطك وهديتك بسرعة.</p><button class="btn gold" data-action="install-now">${state.installPrompt?'تثبيت البطاقة':'تثبيت البطاقة'}</button></div></section>`;
}
function notificationsPrompt(c){
 if(!isStandalone())return '';
 if(!config.VAPID_PUBLIC_KEY)return `<section class="notify-simple"><p>🔔 تذكيرات الحجوزات قيد التجهيز.</p></section>`;
 return `<section class="notify-simple" aria-label="تفعيل تذكيرات الحجوزات"><div class="notify-simple-head">🔔 <strong>خلّنا نذكّرك بجمعتك</strong></div><p>توصلك رسالة من القهوة الملكية تذكرك بحجز ضيافة مناسباتك. مرة واحدة في الأسبوع حسب اليوم والوقت الذي تحدده إدارة القهوة الملكية.</p><small>بالضغط على «أوافق وأفعّل التذكيرات» أنت توافق على استقبال رسائل ترويجية للحجز وحفظ اشتراك الجهاز. <a href="#privacy" data-action="privacy">سياسة الخصوصية</a>.</small><div class="notify-actions"><button class="btn gold wide" data-action="enable-push">أوافق وأفعّل التذكيرات</button><button class="btn ghost small" data-action="disable-push">إيقاف التذكيرات</button></div></section>`;
}
function cardView(){
 if(!state.card){root.innerHTML=`<div class="app-shell"><main class="customer-layout"><section class="panel"><h1>بطاقتك في ضيافة القهوة الملكية</h1><p>افتح رابط بطاقتك مباشرة من رسالة واتساب التي وصلتك. لا تحتاج نسخ الرابط أو تسجيل دخول.</p><p class="fineprint">إذا لم تُفتح البطاقة، اطلب من إدارة القهوة الملكية إرسال رابطك الخاص مجددًا.</p></section></main></div>`;return;}
 const c=state.card;
 root.innerHTML=`<div class="app-shell"><main class="customer-layout bank-customer"><div class="customer-topline">القهوة الملكية <span>بطاقتك في ضيافتنا</span></div>${customerCard(c)}${!isStandalone()?`<section class="install-focus"><strong>ثبّت بطاقتك على جوالك</strong><p>عشان تفتحها بسهولة وتتابع نقاطك.</p><button class="btn gold wide" data-action="install-now">تثبيت البطاقة</button></section>`:''}${notificationsPrompt(c)}<div class="simple-footer"><span>إجمالي المناسبات: ${num(c.total_events)}</span><button data-action="refresh-card" class="btn ghost small">تحديث النقاط ↻</button></div></main></div>`;
 maybeInstallPrompt();maybePromptPush();
}
function privacyView(){root.innerHTML=`<div class="app-shell">${header()}<main class="container"><div class="panel privacy-page"><h1>سياسة خصوصية ضيافة القهوة الملكية (مسودة للمراجعة)</h1><p>نستخدم اسم العميل ورقم الجوال إذا قدمته الإدارة وسجل المناسبات والمكافآت لإدارة برنامج الولاء. يظهر رابط البطاقة الخاص الاسم والنقاط فقط، ولا يظهر رقم الهاتف. من يحصل على الرابط يستطيع رؤية البطاقة لذلك لا تشاركه علنًا.</p><h3>الإشعارات</h3><p>نطلب إذن إشعارات الجهاز بعد التثبيت وبناءً على ضغطك على زر التفعيل. التذكيرات والعروض تحتاج موافقة تسويقية منفصلة، ويمكن إيقافها في أي وقت. مجرد قبول خادم Push لا يعني ضمان وصول الإشعار إلى الهاتف.</p><h3>الحقوق وحماية البيانات</h3><p>يمكن طلب تصحيح أو إلغاء بيانات البطاقة من إدارة النشاط. يجب استكمال جهة التواصل، مدة الاحتفاظ، ومراجعة نقل البيانات خارج السعودية قبل الإطلاق التجاري النهائي وفق نظام حماية البيانات الشخصية.</p><button class="btn secondary" data-action="back">رجوع</button></div></main></div>`;}
function modal(title,body,actions=''){document.querySelector('#modal-overlay')?.remove();const el=document.createElement('div');el.className='modal-backdrop';el.id='modal-overlay';el.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2>${body}${actions?`<div class="modal-actions">${actions}</div>`:''}</div>`;document.body.appendChild(el);}
function closeModal(){document.querySelector('#modal-overlay')?.remove();}
function createCustomerModal(){modal('إنشاء بطاقة عميل جديد',`<form id="create-customer-form"><div class="field"><label>اسم العميل</label><input name="name" placeholder="اسم العميل" required minlength="2" maxlength="120"></div><div class="field"><label>رقم الجوال (اختياري، للإدارة فقط)</label><input name="contact" type="tel" dir="ltr" maxlength="140" placeholder="05xxxxxxxx"></div><div class="field"><label>عدد المناسبات السابقة</label><select name="initial_count">${Array.from({length:7},(_,i)=>`<option value="${i}">${num(i)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>تاريخ المناسبة (إذا أضفت نقاطًا)</label><input name="occurred_on" type="date" value="${today()}"></div><div class="field"><label>وصف المناسبة</label><input name="title" maxlength="150" value="مناسبة ضيافة"></div></div><div class="info-box">بعد الحفظ يظهر QR ورابط خاص ترسله للعميل. العميل يفتح بطاقته مباشرة بدون حساب أو كلمة مرور.</div><button class="btn wide" type="submit">إنشاء البطاقة والـ QR</button></form>`,`<button class="btn secondary" data-action="close-modal">إغلاق</button>`);}
function customerManageModal(c){state.currentCustomer=c;const d=state.data||{},events=(d.events||[]).filter(e=>e.customer_id===c.id),rewards=(d.rewards||[]).filter(r=>r.customer_id===c.id);
 modal(`بطاقة ${c.name}`,`<div class="status-line"><span class="mono">${escapeHtml(c.member_code)}</span><strong>${num(progressState(c.progress,d.settings?.reward_threshold||6,c.available_rewards).progress)} / ${num(d.settings?.reward_threshold||6)}</strong></div><p>إجمالي مناسباته: ${num(c.total_events)} · هداياه المتاحة: ${num(c.available_rewards)}</p><form id="add-stamp-form"><div class="form-grid"><div class="field"><label>كم مناسبة تضيف؟</label><select name="count">${[1,2,3,4,5,6].map(i=>`<option value="${i}">${num(i)}</option>`).join('')}</select></div><div class="field"><label>تاريخ المناسبة</label><input name="occurred_on" type="date" value="${today()}" required></div></div><div class="field"><label>اسم المناسبة</label><input name="title" value="مناسبة ضيافة" required maxlength="150"></div><button class="btn wide" type="submit">اعتماد النقاط</button></form><hr><p class="fineprint">لإعادة إرسال QR نحتاج إصدار رابط جديد؛ هذا يُبطل الرابط القديم على جهاز العميل.</p><button class="btn secondary wide" data-action="rotate-link" data-id="${escapeHtml(c.id)}">إصدار QR جديد</button><h3>آخر المناسبات</h3>${events.slice(0,12).map(e=>`<div class="history-item"><div><strong>${escapeHtml(e.title)}</strong><small>${date(e.occurred_on)} · ${e.status==='approved'?'معتمدة':'ملغاة'}</small></div>${e.status==='approved'?`<button class="btn danger small" data-action="reverse-event" data-id="${escapeHtml(e.id)}">إلغاء</button>`:''}</div>`).join('')||empty('لم تُسجل مناسبات بعد')}${rewards.filter(r=>r.status==='available').map(r=>`<div class="reward-banner"><strong>🎁 ${escapeHtml(r.description)}</strong><button class="btn small" data-action="redeem" data-id="${escapeHtml(r.id)}">استبدال</button></div>`).join('')}`,`<button class="btn danger" data-action="delete-customer" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}">حذف العميل</button><button class="btn secondary" data-action="close-modal">إغلاق</button>`);}
function cardUrl(token){return `${location.origin}/card#card=${token}`;}
function linkModal(token,customer){const url=cardUrl(token);let qr='';try{qr=membershipQrSvg(url);}catch(e){qr=`<p class="fineprint">تعذر عرض QR. يمكنك مشاركة رابط البطاقة مباشرة.</p>`;}
 const threshold=state.data?.settings?.reward_threshold||6;
 const message=cardWelcomeMessage(customer.name,url,threshold);
 const waLink=whatsappShareUrl({name:customer.name,cardLink:url,contact:customer.contact,rewardThreshold:threshold});
 modal(`بطاقة ${customer.name} جاهزة`,`<p>أرسل بطاقة الولاء مباشرة عبر واتساب. الرابط في الرسالة قابل للضغط ويفتح بطاقة العميل دون تسجيل دخول.</p><details class="wa-preview"><summary>عرض نص رسالة واتساب قبل الإرسال</summary><pre dir="auto">${escapeHtml(message)}</pre></details><div class="qr-display">${qr}<span>بطاقة خاصة باسم ${escapeHtml(customer.name)}</span></div><code class="secret-link">${escapeHtml(url)}</code><p class="fineprint">${customer.contact?'يفتح زر واتساب محادثة الرقم المسجل إن كان صالحًا.':'يمكنك اختيار العميل داخل واتساب.'} رابط البطاقة خاص، فلا تشاركه علنًا.</p>`,`<a class="btn whatsapp wide" href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer">مشاركة عبر واتساب</a><button class="btn secondary" data-action="copy-link" data-link="${escapeHtml(url)}">نسخ الرابط</button><button class="btn secondary" data-action="download-qr" data-link="${escapeHtml(url)}">حفظ QR</button><button class="btn secondary" data-action="close-modal">إغلاق</button>`);}
function installHowTo(){modal('تثبيت البطاقة على الهاتف',`<p>${isIOS()?'على iPhone: افتح Safari واضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».':'على Android: اضغط «تثبيت البطاقة» وسيظهر لك طلب التثبيت مباشرة إذا كان المتصفح يدعمه.'}</p>`,`<button class="btn" data-action="close-modal">تمام</button>`);}
function maybeInstallPrompt(){if(isStandalone()||!state.card)return;const key=`royal-card-install-nudge:${state.cardToken||state.card?.member_code||''}`;if(sessionStorage.getItem(key)||document.querySelector('#modal-overlay'))return;sessionStorage.setItem(key,'1');modal('ثبّت بطاقتك على هاتفك',`<p>عشان ما تضيع بطاقتك وتقدر تتابع نقاطك وهديتك في أي وقت.</p>`,`<button class="btn gold" data-action="install-now">تثبيت البطاقة</button>`);}
function maybePromptPush(){
 if(!isStandalone()||!state.card||!config.VAPID_PUBLIC_KEY||!('Notification' in window))return;
 if(state.card.marketing_opt_in && Notification.permission==='granted')return;
 const key=`royal-card-push-consent-v6:${state.cardToken||state.card?.member_code||''}`;
 if(sessionStorage.getItem(key)||document.querySelector('#modal-overlay'))return;
 sessionStorage.setItem(key,'1');
 modal('🔔 خلّنا نذكّرك بجمعتك',`<p>توصلك رسائل تذكير بحجز ضيافتك؛ مرة أسبوعيًا حسب جدول إدارة القهوة الملكية.</p><p class="fineprint">بالضغط على السماح توافق على تذكيرات الحجز وحفظ اشتراك الإشعارات. تقدر توقفها متى ما تبغى.</p>`,`<button class="btn gold" data-action="enable-push">أوافق وأسمح بالتذكيرات</button>`);
}
async function loadAdmin(){state.role='admin';state.data=await rpc('admin_dashboard');state.screen='admin';render();}
async function loadCard(){if(!state.cardToken){state.card=null;state.screen='card';render();return;}try{state.card=await fetchCard(state.cardToken);}catch(error){state.card=null;showError(error);}state.screen='card';render();}
async function boot(){
 if(!configured()){root.innerHTML=`<div class="app-shell">${header()}<section class="setup"><h1>بطاقة الضيافة</h1><p>الربط بالخدمة لم يكتمل. راجع إعدادات ملف config.js.</p></section></div>`;return;}
 const hashToken=new URLSearchParams(location.hash.slice(1)).get('card');
 if(location.pathname.startsWith('/card') || (hashToken&&/^[a-f0-9]{64}$/.test(hashToken))){
  const fromLink=hashToken;
  if(fromLink&&/^[a-f0-9]{64}$/.test(fromLink)){state.cardToken=fromLink;saveCardToken(fromLink);}
  else state.cardToken=currentCardToken();
  await loadCard();return;
 }
 if(currentSession()){try{await loadAdmin();return;}catch(error){console.warn('Could not restore admin session',error);await logout();}}
 state.screen='admin-login';render();
}
async function onSubmit(event){const form=event.target;if(!form?.id)return;event.preventDefault();if(state.busy)return;state.busy=true;const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
 try{
  const values=new FormData(form);
  if(form.id==='admin-login-form'){await loginAdmin(String(values.get('email')).trim(),String(values.get('password')));await loadAdmin();toast('أهلًا بك في لوحة الإدارة.');}
  if(form.id==='create-customer-form'){
   const count=Number(values.get('initial_count'));
   const data=await rpc('admin_create_customer_card',{p_name:String(values.get('name')).trim(),p_contact:String(values.get('contact')).trim()||null,p_initial_count:count,p_occurred_on:count?String(values.get('occurred_on')):null,p_event_title:String(values.get('title')).trim()||'مناسبة ضيافة'});
   closeModal();await loadAdmin();linkModal(data.token,{...data.customer,contact:String(values.get('contact')||'').trim()});
  }
  if(form.id==='add-stamp-form'){
   const count=Number(values.get('count'));
   // Each button press has a fresh idempotency key. Requests are locked server-side.
   const result=await rpc('admin_grant_stamps',{p_customer_id:state.currentCustomer.id,p_count:count,p_title:String(values.get('title')).trim(),p_occurred_on:String(values.get('occurred_on')),p_request_id:crypto.randomUUID()});
   closeModal();await loadAdmin();toast(`تم اعتماد ${num(result.added)} نقطة.`);
  }
  if(form.id==='weekly-reminder-form'){
   await rpc('admin_save_weekly_reminder',{p_weekday:Number(values.get('weekday')),p_time:String(values.get('time')),p_title:String(values.get('title')).trim(),p_body:String(values.get('body')).trim()});
   await loadAdmin();state.adminTab='notifications';render();toast('تم حفظ التذكير الأسبوعي.');
  }
  if(form.id==='campaign-form'){
   const r=await rpc('admin_create_campaign',{p_title:String(values.get('title')).trim(),p_body:String(values.get('body')).trim()});await loadAdmin();toast(`تمت جدولة ${num(r.scheduled)} تذكير.`);
  }
  if(form.id==='settings-form'){
   await rpc('admin_update_settings',{p_name:String(values.get('name')).trim(),p_reward_threshold:Number(values.get('reward_threshold')),p_reward_description:String(values.get('reward_description')).trim(),p_weekly_weekday:Number(state.data?.settings?.weekly_weekday??4),p_weekly_time:String(state.data?.settings?.weekly_time||'17:00')});await loadAdmin();toast('تم حفظ الإعدادات.');
  }
 }catch(error){showError(error);}finally{state.busy=false;if(button?.isConnected)button.disabled=false;}
}
async function onClick(event){const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(el.tagName==='A')event.preventDefault();
 try{
  if(action==='logout'){await logout();state.screen='admin-login';state.data=null;render();return;}
  if(action==='admin-tab'){state.adminTab=el.dataset.tab;render();return;}
  if(action==='refresh'){await loadAdmin();toast('تم تحديث البيانات.');return;}
  if(action==='new-customer'){createCustomerModal();return;}
  if(action==='open-customer'){const c=state.data?.customers?.find(x=>x.id===el.dataset.id);if(c)customerManageModal(c);return;}
  if(action==='close-modal'){closeModal();return;}
  if(action==='delete-customer'){
   const person=state.data?.customers?.find(c=>c.id===el.dataset.id);
   if(!person)throw Error('العميل غير موجود في قائمتك.');
   const check=prompt(`حذف بطاقة ${person.name} سيوقف الرابط وإشعارات الجوال ويزيله من قائمة العملاء. للتأكيد اكتب كلمة: حذف`);
   if(check!=='حذف')return;
   await rpc('admin_delete_customer',{p_customer_id:person.id});
   closeModal();state.currentCustomer=null;await loadAdmin();toast('تم حذف العميل وتعطيل رابط بطاقته.');return;
  }
  if(action==='rotate-link'){if(!confirm('إصدار رابط جديد سيعطّل الرابط القديم ويوقف إشعارات الأجهزة السابقة. تتابع؟'))return;const r=await rpc('admin_rotate_card_link',{p_customer_id:el.dataset.id});closeModal();linkModal(r.token,{...r.customer,contact:state.data?.customers?.find(c=>c.id===r.customer.id)?.contact||state.currentCustomer?.contact||''});return;}
  if(action==='copy-link'){await navigator.clipboard.writeText(el.dataset.link);toast('تم نسخ رابط البطاقة.');return;}
  if(action==='download-qr'){const svg=membershipQrSvg(el.dataset.link),blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='royal-coffee-card-qr.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);return;}
  if(action==='reverse-event'){if(!confirm('هل تريد إلغاء نقطة هذه المناسبة؟'))return;await rpc('admin_reverse_event',{p_event_id:el.dataset.id});closeModal();await loadAdmin();toast('تم إلغاء النقطة وتحديث البطاقة.');return;}
  if(action==='redeem'){if(!confirm('هل استلم العميل هديته بالفعل؟ لا يمكن استبدالها مرتين.'))return;await rpc('admin_redeem_reward',{p_reward_id:el.dataset.id});closeModal();await loadAdmin();toast('تم استبدال الهدية.');return;}
  if(action==='refresh-card'){await loadCard();toast('تم تحديث البطاقة.');return;}
  if(action==='forget-card'){if(!confirm('هل تريد حذف رابط البطاقة المحفوظ على هذا الجهاز؟'))return;saveCardToken(null);state.cardToken='';state.card=null;history.replaceState({},'', '/card');render();return;}
  if(action==='privacy'){state.previous=state.screen;state.screen='privacy';render();return;}
  if(action==='back'){state.screen=state.previous||'card';render();return;}
  if(action==='install-now'){
   if(!state.installPrompt){closeModal();installHowTo();return;}
   const p=state.installPrompt;state.installPrompt=null;closeModal();p.prompt();await p.userChoice;render();return;
  }
  if(action==='enable-push'){
   await subscribeCardPush(state.cardToken,true);closeModal();await loadCard();toast('تم تفعيل تذكيرات الحجوزات على جهازك.');return;
  }
  if(action==='disable-push'){if(!confirm('إيقاف إشعارات البطاقة لهذا الجهاز؟'))return;await optOutCardPush(state.cardToken);await loadCard();toast('تم إيقاف تذكيرات الحجوزات.');return;}
 }catch(error){if(error?.name!=='AbortError')showError(error);}
}
document.addEventListener('submit',onSubmit);
document.addEventListener('click',onClick);
document.addEventListener('input',e=>{if(e.target.id==='customer-search'){state.search=e.target.value;const index=e.target.selectionStart;render();const next=document.querySelector('#customer-search');next?.focus();next?.setSelectionRange(index,index);}});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;if(state.screen==='card')render();});
window.addEventListener('appinstalled',()=>{state.installPrompt=null;if(state.screen==='card')render();});
window.addEventListener('focus',()=>{if(state.screen==='card'&&state.cardToken)loadCard().catch(console.warn);if(state.screen==='admin')loadAdmin().catch(console.warn);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.screen==='card'&&state.cardToken)loadCard().catch(console.warn);});
setInterval(()=>{if(document.visibilityState==='visible'&&state.screen==='card'&&state.cardToken)loadCard().catch(console.warn);},15000);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(console.warn));
boot().catch(showError);
