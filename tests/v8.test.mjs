import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const web = readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const sql = readFileSync(new URL('../db/006_weekly_reminders_and_customer_archive.sql',import.meta.url),'utf8');
const styles=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');

test('Admin can edit weekly reminder weekday, time, title and body',()=>{
 assert.match(web,/weekly-reminder-form/);
 assert.match(web,/admin_save_weekly_reminder/);
 assert.match(web,/name="weekday"/);
 assert.match(web,/name="time"/);
 assert.match(web,/name="title"/);
 assert.match(web,/name="body"/);
});
test('Five minute reminder test actions removed from admin',()=>{
 assert.doesNotMatch(web,/test-mode-on|test-mode-off/);
 assert.doesNotMatch(sql,/test:\x27\|\|b\.id/);
 assert.match(sql,/drop trigger if exists royal_first_marketing_test/);
 assert.match(sql,/test_until=null/);
});
test('Delete customer needs an explicit confirmation and secure RPC',()=>{
 assert.match(web,/action==='delete-customer'/);
 assert.match(web,/check!=='حذف'/);
 assert.match(web,/admin_delete_customer/);
 assert.match(sql,/public\.require_admin\(\)/);
 assert.match(sql,/delete from public\.customer_card_links/);
 assert.match(sql,/public\.push_subscriptions set disabled_at/);
 assert.match(sql,/deleted_at=now\(\)/);
 assert.match(sql,/grant execute on function public\.admin_delete_customer\(uuid\) to authenticated/);
});
test('Bank-style card has six visual cups and embedded member QR',()=>{
 assert.match(web,/bank-loyalty-card/);
 assert.match(web,/membershipQrSvg\(cardLink\)/);
 assert.match(web,/Array\.from\(\{length:Math\.min\(threshold,12\)\}/);
 assert.match(styles,/bank-qr/);
 assert.match(styles,/bank-cups/);
});
test('Weekly SQL protects consent and deduplicates each week',()=>{
 assert.match(sql,/p\.marketing_opt_in=true/);
 assert.match(sql,/p\.privacy_accepted_at is not null/);
 assert.match(sql,/c\.deleted_at is null/);
 assert.match(sql,/on conflict\(dedupe_key\) do nothing/);
 assert.match(sql,/IYYY-IW/);
});
