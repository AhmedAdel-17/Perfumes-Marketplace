import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '@/core/api';
import { activeSellerSession } from '@/features/seller/actions';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import { ListingList } from '@/features/seller/ListingList';
export const metadata:Metadata={title:'المنتجات والمخزون | ديار',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function SellerListingsPage(){const session=await activeSellerSession();if(!session)redirect('/seller');const caller=api({role:'seller',id:session.staffAuthUserId},session.sellerId);const[listings,brand]=await Promise.all([caller.listings.mine(),caller.listings.myBrand()]);return <SellerWorkspace current="listings" title="المنتجات والمخزون" description="منتجات دارك، حالة نشرها والمخزون المسجّل."><ListingList listings={listings} brandId={brand?.id??null}/></SellerWorkspace>;}
