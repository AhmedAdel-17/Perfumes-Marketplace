'use client';
import {useRef} from 'react';
import {motion,useInView,useReducedMotion} from 'framer-motion';
import type {Locale} from '@diyar/i18n';
export function PerformanceMeter({steps,level,locale}:{steps:number;level:number;locale:Locale}){
 const ref=useRef<HTMLSpanElement>(null),visible=useInView(ref,{once:true}),reduced=useReducedMotion();
 return <span ref={ref} className="mt-1.5 flex gap-[3px]" aria-hidden="true">{Array.from({length:steps},(_,i)=><span key={i} className="relative h-[5px] flex-1 overflow-hidden bg-line">{i<level&&<motion.i className="absolute inset-0 bg-ink" style={{transformOrigin:locale==='ar'?'right':'left'}} initial={false} animate={{scaleX:reduced||visible?1:0}} transition={{duration:reduced?0:0.65,delay:reduced?0:i*0.08,ease:[0.16,1,0.3,1]}}/>}</span>)}</span>;
}
