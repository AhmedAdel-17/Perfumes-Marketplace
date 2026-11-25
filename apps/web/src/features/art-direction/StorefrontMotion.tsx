'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import { stagger, useAnimate, useInView, useReducedMotion } from 'framer-motion';

/** Native scrolling remains in interactive maps, consoles and reduced-motion mode. */
export function StorefrontSmoothScroll() {
 const path=usePathname();
 useEffect(()=>{
  if (/(?:^|\/)(?:scent-map|seller|ops)(?:\/|$)/.test(path)) return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let lenis:Lenis|undefined;
  const sync=()=>{lenis?.destroy();lenis=undefined;if(!preference.matches) lenis=new Lenis({autoRaf:true,smoothWheel:true,syncTouch:false,allowNestedScroll:true,lerp:0.1,prevent:node=>Boolean(node.closest('[role="dialog"], [data-lenis-prevent]'))});};
  const lock=()=>{if(document.documentElement.style.overflow==='hidden'||document.body.style.overflow==='hidden')lenis?.stop();else lenis?.start();};
  sync();lock();
  const observer=new MutationObserver(lock);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
  observer.observe(document.body,{attributes:true,attributeFilter:['style']});
  preference.addEventListener('change',sync);
  return()=>{observer.disconnect();preference.removeEventListener('change',sync);lenis?.destroy();};
 },[path]);
 return null;
}

/** Server-rendered children stay visible when JavaScript or animation is unavailable. */
export function StaggerGrid({children,className}:{children:ReactNode;className:string}) {
 const [scope,animate]=useAnimate<HTMLUListElement>();
 const visible=useInView(scope,{once:true,margin:'0px 0px 100px 0px'});
 const reduced=useReducedMotion();
 useEffect(()=>{
  if(!visible||reduced) return;
  const children=Array.from(scope.current?.children??[]);
  const controls=animate(children,{opacity:[0,1],y:[18,0]},{duration:0.65,delay:stagger(0.07),ease:[0.16,1,0.3,1]});
  return()=>controls.stop();
 },[visible,reduced,animate,scope]);
 return <ul ref={scope} className={className}>{children}</ul>;
}
