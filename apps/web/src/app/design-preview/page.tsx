import { notFound } from 'next/navigation';
import { getLocale } from '@/core/locale';
import { isArtDirectionPreview } from '@/features/art-direction/preview';
import { DesignReview } from '@/features/art-direction/DesignReview';
export const dynamic='force-dynamic';
export const metadata={title:'DIYAR — Design review',robots:{index:false,follow:false}};
export default async function Page(){if(!isArtDirectionPreview())notFound();return <DesignReview locale={await getLocale()}/>;}
