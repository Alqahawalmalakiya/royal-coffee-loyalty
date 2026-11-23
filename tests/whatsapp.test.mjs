import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWhatsAppPhone,cardWelcomeMessage,whatsappShareUrl} from '../web/whatsapp.js';

test('Saudi WhatsApp phone number is normalized from local formats',()=>{
  assert.equal(normalizeWhatsAppPhone('055 123 4567'),'966551234567');
  assert.equal(normalizeWhatsAppPhone('+966 55 123 4567'),'966551234567');
  assert.equal(normalizeWhatsAppPhone('00966 55 123 4567'),'966551234567');
  assert.equal(normalizeWhatsAppPhone('٠٥٥١٢٣٤٥٦٧'),'966551234567');
  assert.equal(normalizeWhatsAppPhone(''), '');
  assert.equal(normalizeWhatsAppPhone('0111234'), '');
});

test('Welcome text explains the direct card link and no login requirement',()=>{
  const url = 'https://example.pages.dev/card#card='+'a'.repeat(64);
  const msg=cardWelcomeMessage('أحمد',url,6);
  assert.match(msg,/أحمد/);
  assert.match(msg,/بطاقة الولاء/);
  assert.match(msg,/طريقة الدخول/);
  assert.match(msg,/تثبيت البطاقة/);
  assert.match(msg,/ولا تنسى تفعيل الإشعارات/);
  assert.match(msg,/كل نقطة تنضاف لبطاقتك/);
  assert.match(msg,/ما تحتاج تسوي حساب/);
  assert.ok(msg.includes(url));
});

test('WhatsApp link uses customer phone and URL-encoded full card invitation',()=>{
  const cardLink='https://example.pages.dev/card#card='+'f'.repeat(64);
  const share=new URL(whatsappShareUrl({name:'أحمد',cardLink,contact:'0551234567'}));
  assert.equal(share.host,'wa.me');
  assert.equal(share.pathname,'/966551234567');
  assert.ok(share.searchParams.get('text').includes(cardLink));
  assert.ok(share.searchParams.get('text').includes('أحمد'));
});

test('If no valid phone, share allows choosing the recipient in WhatsApp',()=>{
  const share=new URL(whatsappShareUrl({name:'عميل',cardLink:'https://example.pages.dev/card#card=x',contact:''}));
  assert.equal(share.pathname,'/');
  assert.ok(share.searchParams.get('text').includes('بطاقة الولاء'));
});

test('Share cannot construct a non-HTTPS card link',()=>{
  assert.throws(()=>whatsappShareUrl({name:'عميل',cardLink:'http://example.com',contact:''}),/HTTPS/);
});
