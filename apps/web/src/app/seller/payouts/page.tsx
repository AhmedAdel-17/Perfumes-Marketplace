import type { Metadata } from 'next';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { SellerPayouts } from '@/features/seller/Payouts';
export const metadata:Metadata={title:'المستحقات والكشوف | ديار',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function SellerPayoutsPage(){return <SellerWorkspace current="payouts" title="المستحقات والكشوف" description="اعرف ما يتضمنه كل كشف، وحالة صرفه. صافي الكشف ليس تأكيدًا للتحويل."><SellerPayouts/></SellerWorkspace>;}
