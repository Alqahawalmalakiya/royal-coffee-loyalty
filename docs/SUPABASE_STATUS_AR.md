# حالة ربط Supabase — 15 نوفمبر 2026

- مشروع قاعدة البيانات المستقل: `Alqahawalmalakiya's Project`
- Project ID: `qkretlvladsfnecnqyca`
- Organization: `hospitality-loyalty.`، الخطة Free، المنطقة Singapore.
- **تم تطبيق 5 هجرات فعلية:** `loyalty_core_schema`, `loyalty_auth_and_membership`, `loyalty_atomic_event_and_rewards`, `loyalty_customer_views_and_preferences`, `loyalty_notification_processing`.
- تم التحقق من وجود 13 جدولًا مع RLS. لا توجد جداول بدون RLS، ولا منح جدولية إلى anon. وظائف service_* ليست متاحة لتنفيذ anon أو authenticated.
- تم تنفيذ اختبارات Node المحلية 9/9 بنجاح. **هذا لا يعني نجاح اختبارات قاعدة البيانات باستخدام مستخدمين حقيقيين**.
- عدد المستخدمين في Supabase Auth حاليًا صفر؛ لا يوجد حساب إداري ولا عميل.
- مفاتيح Supabase العامة أُضيفت إلى `web/config.js`. **لا تضع service_role أو مفاتيح VAPID الخاصة في web/.**
- لم يتم نشر Cloudflare، ولم تُفعّل Web Push أو جدولة Cron، ولم يتم اختبار أجهزة جوال.
- الاختبارات المطلوبة لاحقًا: إنشاء حساب الإدارة وربطه بدور admin، ثم تسجيل عميل واختبار إضافة 6 مناسبات واستبدال المكافأة، واختبارات RLS وجوال وإشعارات.

## الخطوة المطلوبة من مالك الحساب

ادخل إلى Supabase Dashboard → Authentication → Users → Add user، وأنشئ حساب الإدارة بالبريد الخاص بك وكلمة مرور قوية. لا ترسل كلمة المرور لي. بعد إنشاء المستخدم، أخبرني لكي أتحقق من حساب Auth ثم أربطه بدور admin في مشروع الولاء فقط.

## ملاحظات مهمة

- هجرات الملفات المحلية `db/001_initial.sql` و `db/002_skip_jobs.sql` هي نسخة المصدر المنطقية؛ بينما تم تطبيق نفس وحدات المشروع الأساسية في Supabase كخمس هجرات منفصلة. توجد تحسينات أمنية وفرق طفيف في ترتيب قفل إلغاء المناسبة ودالة الطوابير؛ حافظ على تاريخ هجرات Supabase الفعلي عند أي تحديث لاحق.
- تقارير Supabase Security Advisor تتضمن تحذيرًا بشأن وظائف SECURITY DEFINER المسموح بتنفيذها للمستخدمين المسجلين. هذه الوظائف تنفذ فحص صلاحيات داخلي، لكن يلزم مراجعة أعمق قبل الإطلاق العام. تنبيهات جداول RLS بلا policies للجداول الخاصة هي إغلاق مقصود.
