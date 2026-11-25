'use client';
import {useState} from 'react';
import {motion,useReducedMotion} from 'framer-motion';
import {PRODUCT_EXPERIENCE,pick,langAttrs,type Locale} from '@diyar/i18n';
import styles from './ProductExperience.module.css';
const stages=['top','heart','base'] as const;
export function NotesOverTime({top,heart,base,english,locale}:{top:string[];heart:string[];base:string[];english:Readonly<Record<string,string>>;locale:Locale}){
 const c=PRODUCT_EXPERIENCE[locale],reduced=useReducedMotion();const [selected,setSelected]=useState(0),[hover,setHover]=useState<number|null>(null);const active=hover??selected;
 const labels=[c.opening,c.heart,c.drydown],times=[c.openingTime,c.heartTime,c.drydownTime];const notes=[top,heart,base];
 return <section aria-labelledby="notes-over-time" className={styles.notes}>
 <h2 id="notes-over-time">{c.notes}</h2>
 <div className={styles.notesLayout}>
 <svg viewBox="0 0 180 180" className={styles.ring} role="group" aria-label={c.notes}>
 {stages.map((key,i)=><motion.circle key={key} cx="90" cy="90" r="62" fill="none" pathLength="300" strokeDasharray="92 208" strokeDashoffset={-i*100} strokeWidth={active===i?17:13} className={styles[key]} style={{transformOrigin:'90px 90px'}} animate={{scale:active===i&&!reduced?1.025:1,opacity:active===i?1:0.5}} transition={{duration:reduced?0:0.3}} role="button" tabIndex={0} aria-label={labels[i]} aria-pressed={selected===i} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} onClick={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i)}}}/>)}
 <text x="90" y="86" textAnchor="middle" className={styles.ringLabel}>{labels[active]}</text><text x="90" y="107" textAnchor="middle" className={styles.ringTime}>{times[active]}</text>
 </svg>
 <div className={styles.legend}>{stages.map((key,i)=><button type="button" key={key} aria-pressed={selected===i} className={active===i?styles.active:undefined} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} onClick={()=>setSelected(i)}><span className={styles.legendHeading}><span>{labels[i]}</span><span>{times[i]}</span></span><span className={styles.noteNames}>{notes[i]?.length?notes[i]?.map((note,j)=><span key={note} {...langAttrs(locale,pick(locale,note,english[note]).lang)}>{j>0?' · ':''}{pick(locale,note,english[note]).text}</span>):c.missing}</span></button>)}</div>
 </div><p className={styles.guide}>{c.guide}</p>
 </section>;
}
