import {describe,it,expect} from 'vitest';
import {NextRequest} from 'next/server';
import {LOCALE_COOKIE} from '@diyar/i18n';
import {middleware} from './middleware';
describe('seller language routing',()=>{
 it('rewrites English seller URLs with the trusted English locale',()=>{
  const response=middleware(new NextRequest('http://localhost:3100/en/seller/orders?status=confirmed'));
  expect(response.headers.get('x-middleware-rewrite')).toBe('http://localhost:3100/seller/orders?status=confirmed');
  expect(response.headers.get('x-middleware-request-x-locale')).toBe('en');
 });
 it('switches explicitly to Arabic despite an English preference and preserves filters',()=>{
  const response=middleware(new NextRequest('http://localhost:3100/en/seller/orders?status=confirmed&lang=ar',{headers:{cookie:LOCALE_COOKIE+'=en'}}));
  expect(response.headers.get('location')).toBe('http://localhost:3100/seller/orders?status=confirmed');
  expect(response.cookies.get(LOCALE_COOKIE)?.value).toBe('ar');
 });
 it('keeps remembered English on seller navigation',()=>{
  const response=middleware(new NextRequest('http://localhost:3100/seller/settings',{headers:{cookie:LOCALE_COOKIE+'=en'}}));
  expect(response.headers.get('location')).toBe('http://localhost:3100/en/seller/settings');
 });
 it('leaves operations outside the translated seller scope',()=>{
  const response=middleware(new NextRequest('http://localhost:3100/en/ops'));
  expect(response.headers.get('location')).toBe('http://localhost:3100/ops');
 });
});
