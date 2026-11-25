'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { motion, stagger, useAnimate, useMotionValue, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ART_DIRECTION, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import styles from './ArtComposition.module.css';

export function EditorialHero({locale}:{locale:Locale}) {
 const c=ART_DIRECTION[locale];
 const hero=useRef<HTMLElement>(null);
 const [copy,animate]=useAnimate<HTMLHeadingElement>();
 const reduced=useReducedMotion();
 const {scrollYProgress}=useScroll({target:hero,offset:['start start','end start']});
 const parallax=useTransform(scrollYProgress,[0,1],[0,48]);
 const x=useMotionValue(0),y=useMotionValue(0);
 useEffect(()=>{
  if(reduced) return;
  const controls=animate('[data-hero-line]',{y:['105%','0%'],opacity:[0,1]},{duration:0.7,delay:stagger(0.1),ease:[0.16,1,0.3,1]});
  return()=>controls.stop();
 },[reduced,animate]);
 return <section ref={hero} className={styles.hero}>
  <figure className={styles.heroArt}>
   <motion.div className={styles.heroImage} style={{y:reduced?0:parallax}}><Image src="/art-direction/atelier.webp" alt="" fill priority sizes="(min-width:768px) 78vw,100vw"/></motion.div>
   <figcaption>{c.illustration}</figcaption>
  </figure>
  <div className={styles.heroInner}><div className={styles.heroCopy}>
   <p className={styles.eyebrow}>{c.kicker}</p>
   <h1 ref={copy}><span className={styles.headlineMask}><span data-hero-line>{c.titleLead}</span></span><span className={styles.headlineMask}><span data-hero-line>{c.titleEnd}</span></span></h1>
   <p>{c.intro}</p>
   <div className={styles.heroActions}>
    <div onPointerMove={event=>{if(reduced||event.pointerType!=='mouse')return;const rect=event.currentTarget.getBoundingClientRect();x.set((event.clientX-rect.left-rect.width/2)*0.045);y.set((event.clientY-rect.top-rect.height/2)*0.08);}} onPointerLeave={()=>{x.set(0);y.set(0);}}>
     <motion.div style={{x,y}}><Link href={localeHref(locale,'/search')} className={styles.primary}>{c.shop}<span aria-hidden="true">↗</span></Link></motion.div>
    </div>
    <Link href={localeHref(locale,'/houses')} className={styles.secondary}>{c.houses}<span aria-hidden="true">↗</span></Link>
   </div>
  </div></div>
 </section>;
}
