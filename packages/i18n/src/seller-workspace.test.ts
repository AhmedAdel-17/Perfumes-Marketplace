import {describe,it,expect} from 'vitest';
import {sellerText,sellerError} from './seller-workspace';
describe('seller workspace copy',()=>{
 it('supports both original Arabic message keys and English UI keys',()=>{
  expect(sellerText('en','رقم موبايل مصري غير صحيح')).toBe('Enter a valid Egyptian mobile number.');
  expect(sellerText('ar','Products & stock')).toBe('المنتجات والمخزون');
  expect(sellerText('en','On hold')).toBe('On hold');
  expect(sellerText('ar','On hold')).toBe('معلّق');
 });
 it('preserves user content and spacing while providing readable unknown-error recovery',()=>{
  expect(sellerText('en','NOUR-SKU-10')).toBe('NOUR-SKU-10');
  expect(sellerText('en','  الفترة ')).toBe('  Period ');
  expect(sellerError('en','رسالة غير معروفة')).not.toMatch(/[\u0600-\u06ff]/);
  expect(sellerError('ar','رسالة غير معروفة')).toBe('رسالة غير معروفة');
 });
});
