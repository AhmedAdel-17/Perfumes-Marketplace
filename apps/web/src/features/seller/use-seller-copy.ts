'use client';
import { useCallback } from 'react';
import { sellerText,sellerError } from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
export function useSellerCopy(){
 const locale=useLocale();
 const t=useCallback((value:string)=>sellerText(locale,value),[locale]);
 const errorText=useCallback((value:string)=>sellerError(locale,value),[locale]);
 return {locale,t,errorText};
}
