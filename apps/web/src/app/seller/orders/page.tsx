import type { Metadata } from 'next';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { OrderQueue } from '@/features/seller/OrderQueue';
export const metadata:Metadata={title:'الطلبات | ديار',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function SellerOrdersPage(){return <SellerWorkspace current="orders" title="الطلبات" description="راجع الطلبات، أكّد المخزون، ثم جهّز الشحنة."><OrderQueue/></SellerWorkspace>;}
