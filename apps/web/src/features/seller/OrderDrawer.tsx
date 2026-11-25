'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {motion,useReducedMotion} from 'framer-motion';
import type {Locale} from '@diyar/i18n';
import styles from './order-drawer.module.css';
/** Native top-layer dialog retains inherited seller palette, focus isolation and scroll lock. */
export function OrderDrawer({children,locale,close,label}:{children:ReactNode;locale:Locale;close():void;label:string}){
 const ref=useRef<HTMLDialogElement>(null),reduced=useReducedMotion();
 const closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const html=document.documentElement.style.overflow,body=document.body.style.overflow;dialog.showModal();document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';return()=>{dialog.close();document.documentElement.style.overflow=html;document.body.style.overflow=body;if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
 return <dialog ref={ref} id="seller-order-detail" aria-label={label} className={styles.dialog} dir={locale==='ar'?'rtl':'ltr'} onCancel={e=>{e.preventDefault();closeRef.current()}} onKeyDown={e=>{e.stopPropagation();if(e.key!=='Tab')return;const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}>
 <motion.div className={styles.backdrop} aria-hidden="true" onClick={()=>closeRef.current()} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:0.25}}/>
 <motion.div className={styles.panel} initial={{x:reduced?0:locale==='ar'?'-100%':'100%'}} animate={{x:0}} exit={{x:reduced?0:locale==='ar'?'-100%':'100%'}} transition={{duration:reduced?0:0.45,ease:[0.16,1,0.3,1]}}>{children}</motion.div>
 </dialog>;
}
