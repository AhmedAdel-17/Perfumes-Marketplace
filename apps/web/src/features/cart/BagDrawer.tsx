'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CART } from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
import { useCart } from './CartStore';
import { CartView } from './CartView';
import styles from './BagDrawer.module.css';

export function BagDrawer() {
 const {bagOpen,closeBag}=useCart();const locale=useLocale();const path=usePathname();
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{closeBag();},[path,closeBag]);
 return mounted ? createPortal(<AnimatePresence>{bagOpen && <Drawer key="bag" locale={locale} close={closeBag}/>}</AnimatePresence>,document.body) : null;
}
function Drawer({locale,close}:{locale:'ar'|'en';close():void}) {
 const ref=useRef<HTMLDialogElement>(null);const reduced=useReducedMotion();const copy=CART[locale];
 useEffect(()=>{
  const dialog=ref.current;if(!dialog)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const html=document.documentElement.style.overflow,body=document.body.style.overflow;
  dialog.showModal();document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';
  return()=>{dialog.close();document.documentElement.style.overflow=html;document.body.style.overflow=body;if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 const offscreen=locale==='ar'?'-100%':'100%';
 return <dialog ref={ref} dir={locale==='ar'?'rtl':'ltr'} aria-labelledby="bag-drawer-title" className={styles.dialog} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{event.stopPropagation();if(event.key!=="Tab")return;const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length>0);const first=items[0],last=items[items.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}}>
  <motion.div aria-hidden="true" className={styles.backdrop} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:0.3}} onClick={close}/>
  <motion.section className={styles.panel} initial={{x:reduced?0:offscreen}} animate={{x:0}} exit={{x:reduced?0:offscreen}} transition={{duration:reduced?0:0.5,ease:[0.16,1,0.3,1]}} onClick={event=>{const a=(event.target as HTMLElement).closest('a');if(a&&a.getAttribute('aria-disabled')!=='true'&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey)close();}}>
   <header className={styles.header}><div><p>{copy.kicker}</p><h2 id="bag-drawer-title">{copy.title}</h2></div><button type="button" autoFocus onClick={close} aria-label={copy.closeBag} className={styles.close}>×</button></header>
   <div className={styles.contents} data-lenis-prevent><CartView drawer/></div>
  </motion.section>
 </dialog>;
}
