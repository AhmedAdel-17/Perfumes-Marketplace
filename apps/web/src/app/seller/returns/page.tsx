import type { Metadata } from 'next';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { ReturnQueue } from '@/features/seller/ReturnQueue';
export const metadata:Metadata={title:'الإرجاع | ديار',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function SellerReturnsPage(){return <SellerWorkspace current="returns" title="الإرجاع" description="راجع الأسباب، اتخذ القرار وتابع وصول المرتجعات. تسجيل رد الأموال من صلاحيات المنصّة."><ReturnQueue/></SellerWorkspace>;}
