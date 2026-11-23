from pathlib import Path
p=Path('/mnt/data/royal_v8_build/web/app.js')
s=p.read_text()

def replace_between(a,b,new):
 global s
 st=s.index(a); en=s.index(b,st)
 s=s[:st]+new+s[en:]

# Card design: all essential card elements on one bank-style body.
replace_between('function customerCard(name,code)', 'function loginView()', '''function customerCard(c){
 const threshold=Math.max(1,Number(c.threshold||6));
 const prog=progressState(c.progress,threshold,c.available_rewards);
 const ready=Number(c.available_rewards)>0;
 const cardLink=`${location.origin}/card#card=${state.cardToken}`;
 let qr='';try{qr=membershipQrSvg(cardLink);}catch(err){console.warn('QR is unavailable',err);}
 const cups=Array.from({length:Math.min(threshold,12)},(_,i)=>`<span class="loyalty-cup ${i<prog.progress?'stamped':''}" aria-label="المناسبة ${i+1} ${i<prog.progress?'مكتملة':'بانتظار الاعتماد'}"><svg viewBox="0 0 32 40" aria-hidden="true"><path d="M5 4h22l-3 31H8z" fill="currentColor"/><path d="M3 3h26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>`).join('');
 return `<article class="bank-loyalty-card" aria-label="بطاقة ضيافة القهوة الملكية">
   <div class="bank-card-top"><span class="bank-card-type">بطاقة الولاء <small>ROYAL COFFEE</small></span><span class="bank-membership">${num(prog.progress)} من ${num(threshold)}<small>مناسبات</small></span></div>
   <div class="bank-logo"><img src="/assets/logo-mark.png" alt="شعار القهوة الملكية"></div>
   <div class="bank-cups">${cups}</div>
   <div class="bank-reward ${ready?'claimed':''}"><div><small>${ready?'🎁 المكافأة':'الهدية القادمة'}</small><strong>${ready?'هديتك جاهزة!':escapeHtml(c.reward_description)}</strong></div><div><small>${ready?'جاهزة للاستلام':'المتبقي'}</small><strong>${ready?'مبروك':`${num(prog.remaining)} مناسبات`}</strong></div></div>
   <div class="bank-qr">${qr||'<span>رمز البطاقة</span>'}</div>
   <div class="bank-bottom"><span>${escapeHtml(c.name)}</span><small class="mono">${escapeHtml(c.member_code)}</small></div>
 </article>`;
}
''')

replace_between('function cardView()', 'function privacyView()', '''function cardView(){
 if(!state.card){root.innerHTML=`<div class="app-shell"><main class="customer-layout"><section class="panel"><h1>بطاقتك في ضيافة القهوة الملكية</h1><p>افتح الرابط الخاص الذي أرسلته لك الإدارة.</p><form id="open-link-form"><div class="field"><label>رابط بطاقتك</label><input name="link" type="text" required placeholder="الصق رابط البطاقة"></div><button type="submit" class="btn wide">فتح البطاقة</button></form></section></main></div>`;return;}
 const c=state.card;
 root.innerHTML=`<div class="app-shell"><main class="customer-layout bank-customer"><div class="customer-topline">القهوة الملكية <span>بطاقتك في ضيافتنا</span></div>${customerCard(c)}${!isStandalone()?`<section class="install-focus"><strong>ثبّت بطاقتك على جوالك</strong><p>عشان تفتحها بسهولة وتتابع نقاطك.</p><button class="btn gold wide" data-action="install-now">تثبيت البطاقة</button></section>`:''}${notificationsPrompt(c)}<div class="simple-footer"><span>إجمالي المناسبات: ${num(c.total_events)}</span><button data-action="refresh-card" class="btn ghost small">تحديث النقاط ↻</button></div></main></div>`;
 maybeInstallPrompt();maybePromptPush();
}
''')

replace_between('function notificationsView(d)', 'function settingsView(s)', '''function notificationsView(d){
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
''')

# Settings form remove duplicate scheduling controls; weekly is under notifications
replace_between('function settingsView(s)', 'function installPrompt()', '''function settingsView(s){return `<section class="panel" style="max-width:680px"><h2>إعدادات الضيافة</h2><form id="settings-form"><div class="field"><label>اسم النشاط</label><input name="name" required maxlength="100" value="${escapeHtml(s.name||'ضيافة القهوة الملكية')}"></div><div class="field"><label>عدد المناسبات للهدية</label><input name="reward_threshold" type="number" min="1" max="50" required value="${Number(s.reward_threshold||6)}"></div><div class="field"><label>تفاصيل الهدية</label><input name="reward_description" required maxlength="160" value="${escapeHtml(s.reward_description||'قهوتان مجانًا')}"></div><button class="btn" type="submit">حفظ الإعدادات</button></form><p class="hint">يوم إرسال التذكير ووقته ونصه تجدها في قسم «الإشعارات».</p></section>`;}
''')

# Customer management, append delete action next to existing controls.
s=s.replace('`<button class="btn secondary" data-action="close-modal">إغلاق</button>`);}\nfunction cardUrl', '`<button class="btn danger" data-action="delete-customer" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}">حذف العميل</button><button class="btn secondary" data-action="close-modal">إغلاق</button>`);}\nfunction cardUrl')

# Submit weekly form & update settings use existing values for previous weekly settings
needle="  if(form.id==='campaign-form'){"
insert="""  if(form.id==='weekly-reminder-form'){
   await rpc('admin_save_weekly_reminder',{p_weekday:Number(values.get('weekday')),p_time:String(values.get('time')),p_title:String(values.get('title')).trim(),p_body:String(values.get('body')).trim()});
   await loadAdmin();state.adminTab='notifications';render();toast('تم حفظ التذكير الأسبوعي.');
  }
"""
s=s.replace(needle,insert+needle)
s=s.replace("p_weekly_weekday:Number(values.get('weekly_weekday')),p_weekly_time:String(values.get('weekly_time'))", "p_weekly_weekday:Number(state.data?.settings?.weekly_weekday??4),p_weekly_time:String(state.data?.settings?.weekly_time||'17:00')")

# Per-customer deletion: second deliberate confirmation typing a keyword.
needle="  if(action==='rotate-link'){"
insert="""  if(action==='delete-customer'){
   const person=state.data?.customers?.find(c=>c.id===el.dataset.id);
   if(!person)throw Error('العميل غير موجود في قائمتك.');
   const check=prompt(`حذف بطاقة ${person.name} سيوقف الرابط وإشعارات الجوال ويزيله من قائمة العملاء. للتأكيد اكتب كلمة: حذف`);
   if(check!=='حذف')return;
   await rpc('admin_delete_customer',{p_customer_id:person.id});
   closeModal();state.currentCustomer=null;await loadAdmin();toast('تم حذف العميل وتعطيل رابط بطاقته.');return;
  }
"""
s=s.replace(needle,insert+needle)
# Remove old test actions entirely to prevent accidental unsupported function.
import re
s=re.sub(r"  if\(action==='test-mode-on'\|\|action==='test-mode-off'\)\{.*?\}\n",'',s,flags=re.S)
# Notifications copy no 5 minute test
s=s.replace('خلال الاختبار كل ٥ دقائق لمدة محدودة، وبعدها مرة كل أسبوع.', 'مرة واحدة في الأسبوع حسب اليوم والوقت الذي تحدده إدارة القهوة الملكية.')
s=s.replace('كل ٥ دقائق خلال اختبار قصير، وبعدها مرة أسبوعيًا.', 'مرة أسبوعيًا حسب جدول إدارة القهوة الملكية.')

p.write_text(s)
print('APP file written',len(s),'delete action',"action==='delete-customer'" in s,'weekly form',"id=\"weekly-reminder-form\"" in s)

# Emoji-safe WhatsApp message; WhatsApp can render basic Unicode emoji, remove keycap combos.
p=Path('/mnt/data/royal_v8_build/web/whatsapp.js')
s=p.read_text()
a=s.index('  return `السلام عليكم يا ')
b=s.index('`;',a)+2
s=s[:a]+'''  return `السلام عليكم يا ${customer} 🤎

يسعدنا انضمامك إلى *بطاقة الولاء في ضيافة القهوة الملكية* ☕

*بطاقتك جاهزة!* 🎁
رابط بطاقتك الخاصة:
${cardLink}

*طريقة فتح البطاقة:*
1. افتح الرابط؛ ستظهر البطاقة باسمك ونقاطك مباشرة.
2. عند إكمال ${threshold} مناسبات تستحق هديتك.
3. اضغط "تثبيت البطاقة" للاحتفاظ بها على هاتفك.

🔔 *لا تنسى تفعيل الإشعارات* بعد تثبيت البطاقة حتى تصلك تذكيرات ضيافتنا وكل جديد. وتقدر تتابع النقاط من بطاقتك.

*بدون تسجيل حساب أو كلمة مرور.*
نتشرف بخدمتك في مناسباتك 🤎`;'''+s[b:]
p.write_text(s)
print('WHATSAPP file written',len(s))
