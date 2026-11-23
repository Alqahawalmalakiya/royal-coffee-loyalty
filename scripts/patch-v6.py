from pathlib import Path
import re
root=Path('/mnt/data/loyalty_v6_work/web')
p=root/'app.js'
s=p.read_text()
start=s.index('function customerCard(')
end=s.index('function loginView(',start)
s=s[:start]+'''function customerCard(name,code){return `<article class="loyalty-card animated-card" aria-label="بطاقة ضيافة القهوة الملكية"><div class="card-logo-block"><img src="/assets/logo-mark.png" alt="شعار القهوة الملكية"></div><span class="card-membership-title">بطاقة الولاء</span><div class="card-name"><small>بطاقة ضيافة خاصة بـ</small><strong>${escapeHtml(name)}</strong></div><div class="card-foot"><span>رقم العضوية</span><strong class="mono">${escapeHtml(code)}</strong></div></article>`;}
''' + s[end:]
start=s.index('function notificationsPrompt(')
end=s.index('function privacyView(',start)
s=s[:start]+'''function notificationsPrompt(c){
 if(!isStandalone())return '';
 if(!config.VAPID_PUBLIC_KEY)return `<section class="notify-simple"><p>🔔 تذكيرات الحجوزات قيد التجهيز.</p></section>`;
 return `<section class="notify-simple" aria-label="تفعيل تذكيرات الحجوزات"><div class="notify-simple-head">🔔 <strong>خلّنا نذكّرك بجمعتك</strong></div><p>توصلك رسالة من القهوة الملكية تذكرك بحجز ضيافة مناسباتك. خلال الاختبار كل ٥ دقائق لمدة محدودة، وبعدها مرة كل أسبوع.</p><small>بالضغط على «أوافق وأفعّل التذكيرات» أنت توافق على استقبال رسائل ترويجية للحجز وحفظ اشتراك الجهاز. <a href="#privacy" data-action="privacy">سياسة الخصوصية</a>.</small><div class="notify-actions"><button class="btn gold wide" data-action="enable-push">أوافق وأفعّل التذكيرات</button><button class="btn ghost small" data-action="disable-push">إيقاف التذكيرات</button></div></section>`;
}
function cardView(){
 if(!state.card){root.innerHTML=`<div class="app-shell"><main class="customer-layout"><section class="panel"><h1>بطاقتك في ضيافة القهوة الملكية</h1><p>افتح الرابط الخاص الذي أرسلته لك الإدارة.</p><form id="open-link-form"><div class="field"><label>رابط بطاقتك</label><input name="link" type="text" required placeholder="الصق رابط البطاقة"></div><button type="submit" class="btn wide">فتح البطاقة</button></form></section></main></div>`;return;}
 const c=state.card,threshold=Number(c.threshold||6),ps=progressState(c.progress,threshold,c.available_rewards),ready=Number(c.available_rewards)>0,progress=ps.progress;
 root.innerHTML=`<div class="app-shell"><main class="customer-layout clean-customer"><div class="customer-topline">بطاقتك في ضيافة القهوة الملكية</div>${customerCard(c.name,c.member_code)}<section class="simple-progress"><div class="simple-progress-heading"><span>نقاطك</span><strong>${num(progress)} <small>/ ${num(threshold)}</small></strong></div><div class="stamp-row">${Array.from({length:Math.min(threshold,12)},(_,i)=>`<span class="stamp ${i<progress?'filled':''}" aria-label="النقطة ${i+1} ${i<progress?'مكتملة':'غير مكتملة'}">${i<progress?'✓':'✦'}</span>`).join('')}</div><div class="simple-reward ${ready?'is-ready':''}"><span class="gift-mark">🎁</span><div><strong>${ready?'مبروك! هديتك جاهزة':`باقي ${num(ps.remaining)} مناسبات لهديتك`}</strong><small>${escapeHtml(c.reward_description)}${ready?' · تقدر تستلمها من الإدارة':''}</small></div></div></section>${!isStandalone()?`<section class="install-focus"><strong>ثبّت بطاقتك على جوالك</strong><p>عشان ما يضيع رابطها وتكون معك دائمًا.</p><button class="btn gold wide" data-action="install-now">تثبيت البطاقة</button></section>`:''}${notificationsPrompt(c)}<div class="simple-footer"><span>إجمالي المناسبات: ${num(c.total_events)}</span><button data-action="refresh-card" class="btn ghost small">تحديث ↻</button></div></main></div>`;
 maybeInstallPrompt();
}
''' + s[end:]
s=s.replace("   if(!document.querySelector('#privacy-consent')?.checked)throw Error('يرجى الموافقة على إشعار الخصوصية أولًا.');\n   const marketing=Boolean(document.querySelector('#marketing-consent')?.checked);\n   await subscribeCardPush(state.cardToken,marketing);await loadCard();toast('تم تفعيل إشعارات البطاقة على هذا الجهاز.');return;", "   await subscribeCardPush(state.cardToken,true);await loadCard();toast('تم تفعيل تذكيرات الحجوزات على جهازك.');return;")
s=s.replace("toast('تم إيقاف إشعارات هذا الجهاز والعروض.')", "toast('تم إيقاف تذكيرات الحجوزات.')")
s=s.replace("'تم تفعيل إشعارات البطاقة على هذا الجهاز.'", "'تم تفعيل تذكيرات الحجز على هذا الجهاز.'")
s=s.replace("function installHowTo(){modal('تثبيت البطاقة على الهاتف'", "function installHowTo(){modal('تثبيت البطاقة على الهاتف'")
# Existing v5 header is dark and logo does not show well, so simple customer page has no topbar.
p.write_text(s)
# public VAPID dynamically configured (already generated server-side)
conf=root/'config.js'
c=conf.read_text().replace("VAPID_PUBLIC_KEY:'', // supplied AFTER Cloudflare push Worker is configured", "VAPID_PUBLIC_KEY:'BAtaXoM_CSexYr0Guo8X7s8vm9G-OWpZH7z_9QMmCu2KscXfs1juZZqAmBqeVjuHN6-ZSm9cvk5xAsStX0yw3mE', // public only")
conf.write_text(c)
# Add simple customer design overrides, CSS no JS dependencies
css=root/'styles.css';s=css.read_text();s+='''
/* v6 customer card: gentle beige, visible official logo, no clutter */
.customer-layout.clean-customer{max-width:430px;padding:20px 16px 65px;margin:auto}
.customer-topline{text-align:center;color:#6a4331;font-size:.87rem;font-weight:700;letter-spacing:0;margin:4px auto 17px}
.clean-customer .loyalty-card{background:linear-gradient(160deg,#fffdf8 0%,#f8eddd 70%,#f5e6d1 100%);border:1px solid #d9b986;box-shadow:0 12px 33px rgba(83,48,28,.12);color:#43271a;min-height:290px;padding:20px 23px 22px;border-radius:22px}
.clean-customer .loyalty-card::before{content:"";position:absolute;inset:8px;border:1px solid rgba(177,132,66,.35);border-radius:15px;pointer-events:none}
.clean-customer .loyalty-card::after{display:none}
.card-logo-block{width:100%;height:145px;display:flex;align-items:center;justify-content:center;position:relative;z-index:1;overflow:hidden}
.card-logo-block img{width:215px;height:155px;object-fit:contain;display:block;filter:drop-shadow(0 2px 2px rgba(70,35,20,.05))}
.card-membership-title{display:block;text-align:center;color:#926635;font-size:.71rem;letter-spacing:1px;position:relative;z-index:1;margin-top:-9px}
.clean-customer .card-name{position:relative;z-index:1;margin:14px 0 0;text-align:center}
.clean-customer .card-name small{color:#80604c;font-size:.73rem}
.clean-customer .card-name strong{color:#4b2919;font-size:1.45rem;line-height:1.45}
.clean-customer .card-foot{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(162,124,72,.22);padding-top:11px;margin-top:16px;font-size:.7rem;color:#896443}
.clean-customer .card-foot strong{font-size:.72rem;color:#6c402b;letter-spacing:.2px}
.simple-progress{border:1px solid #ebddc9;background:#fffdf9;box-shadow:0 6px 18px rgba(102,67,42,.04);padding:19px 19px 14px;border-radius:20px;margin:18px 0 11px}
.simple-progress-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#643c29}
.simple-progress-heading span{font-size:1rem;font-weight:700}
.simple-progress-heading strong{font-size:1.5rem;direction:ltr}
.simple-progress-heading small{font-size:.81rem;color:#aa8b6c}
.clean-customer .stamp-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:17px 0 15px}
.clean-customer .stamp{aspect-ratio:1;border:1px solid #e3d2b9;border-radius:50%;background:#fbf5eb;color:#ccac82;font-size:1.2rem;display:flex;align-items:center;justify-content:center}
.clean-customer .stamp.filled{background:#71402b;color:#f4dcb5;border-color:#71402b;box-shadow:0 3px 8px rgba(90,45,25,.15)}
.simple-reward{display:flex;align-items:center;gap:12px;border-radius:14px;padding:13px 14px;background:#f7f0e5;border:1px solid #ead9be;color:#65402c}
.simple-reward .gift-mark{font-size:1.5rem;flex:none}
.simple-reward strong{display:block;font-size:.87rem}
.simple-reward small{display:block;font-size:.75rem;margin-top:4px;color:#91745c}
.simple-reward.is-ready{background:#f3e0bb;border-color:#d9b069}
.simple-reward.is-ready strong{color:#6b3718}
.simple-reward.is-ready .gift-mark{animation:giftPulse 1.9s ease-in-out infinite}
@keyframes giftPulse{50%{transform:scale(1.12)}}
.clean-customer .install-focus{margin:10px 0 0;display:block;text-align:center;padding:14px 18px;border-radius:16px}
.clean-customer .install-focus strong{font-size:.89rem;color:#6a422d}
.clean-customer .install-focus p{margin:6px 0 12px;color:#8b7059;font-size:.78rem}
.notify-simple{background:#fffdf9;border:1px solid #ead9c5;border-radius:18px;padding:17px 18px;margin:14px 0;color:#583a2d}
.notify-simple-head{display:flex;gap:8px;align-items:center;font-size:.98rem}
.notify-simple p{font-size:.8rem;color:#856750;line-height:1.9;margin:8px 0}
.notify-simple small{font-size:.72rem;color:#8f7560;line-height:1.7;display:block}
.notify-actions{display:flex;flex-direction:column;gap:4px;margin-top:12px}
.notify-simple a{text-decoration:underline}
.simple-footer{display:flex;align-items:center;justify-content:space-between;font-size:.76rem;color:#92735a;padding:5px 3px 0}
@media (prefers-reduced-motion:reduce){.simple-reward.is-ready .gift-mark{animation:none}}
'''
css.write_text(s)
# consistent theme and cache invalidation
p=root/'service-worker.js';s=p.read_text().replace("royal-loyalty-shell-v5","royal-loyalty-shell-v6");p.write_text(s)
p=root/'manifest.webmanifest';s=p.read_text().replace('"background_color": "#fbf4ea"','"background_color": "#fbf4ea"').replace('"theme_color": "#2d130d"','"theme_color": "#fbf4ea"');p.write_text(s)
p=root/'index.html';s=p.read_text().replace('content="#2d130d"','content="#fbf4ea"');p.write_text(s)
p=root/'card'/'index.html';s=p.read_text().replace('content="#2d130d"','content="#fbf4ea"');p.write_text(s)
print('UI v6 modified')
