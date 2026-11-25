'use client';
import dynamic from 'next/dynamic';
import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {PRODUCT_EXPERIENCE,type Locale} from '@diyar/i18n';
import styles from './ProductExperience.module.css';
import {useLocale} from '@/features/shell/LocaleProvider';
function SceneLoading(){const locale=useLocale();return <p role="status" className={styles.fallback}>{PRODUCT_EXPERIENCE[locale].loading}</p>}
const BottleCanvas=dynamic(()=>import('./BottleCanvas'),{ssr:false,loading:SceneLoading});
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{override state={failed:false};static getDerivedStateFromError(){return{failed:true}}override render(){return this.state.failed?this.props.fallback:this.props.children}}
export interface InspectionProps{family:string;name:string;house:string;locale:Locale;notes:readonly {text:string;lang:Locale}[];modelUrl?:string}
export function BottleInspection(props:InspectionProps){
 const [open,setOpen]=useState(false);const c=PRODUCT_EXPERIENCE[props.locale];
 return <><button type="button" className={styles.inspect} aria-haspopup="dialog" onClick={event=>{event.stopPropagation();setOpen(true)}}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z M3 7l9 5 9-5 M12 12v10"/></svg>{c.inspect}</button>{typeof document!=='undefined'&&createPortal(<AnimatePresence>{open&&<InspectionModal {...props} close={()=>setOpen(false)}/>}</AnimatePresence>,document.body)}</>;
}
function InspectionModal({close,...props}:InspectionProps&{close():void}){
 const ref=useRef<HTMLDialogElement>(null);const reduced=useReducedMotion(),c=PRODUCT_EXPERIENCE[props.locale];const [ready,setReady]=useState(false);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const html=document.documentElement.style.overflow,body=document.body.style.overflow;dialog.showModal();document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';setReady(true);return()=>{dialog.close();document.documentElement.style.overflow=html;document.body.style.overflow=body;if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
 return <dialog ref={ref} className={styles.dialog} dir={props.locale==='ar'?'rtl':'ltr'} aria-labelledby="bottle-inspection-title" onCancel={e=>{e.preventDefault();close()}} onKeyDown={e=>{e.stopPropagation();if(e.key!=='Tab')return;const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}>
 <motion.div className={styles.overlay} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:0.3}} onClick={close}/>
 <motion.section className={styles.inspectionPanel} data-lenis-prevent initial={{opacity:0,y:reduced?0:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:12}} transition={{duration:reduced?0:0.4}}>
 <header><div><h2 id="bottle-inspection-title">{props.name}</h2><p>{props.modelUrl?c.realModel:c.study}</p></div><button autoFocus type="button" onClick={close} aria-label={c.close}>×</button></header>
 <div className={styles.canvasArea}>{ready?<SceneBoundary fallback={<p role="status" className={styles.fallback}>{c.unavailable}</p>}><BottleCanvas {...props}/></SceneBoundary>:<p role="status">{c.loading}</p>}</div>
 <p className={styles.hint}>{c.hint}</p>
 </motion.section></dialog>;
}
