'use client';
import {useId} from 'react';
import {Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {useReducedMotion} from 'framer-motion';
import {formatPrice,internal as num} from '@diyar/i18n';
import {useSellerCopy} from './use-seller-copy';
import styles from './overview-dashboard.module.css';
interface Daily{day:string;grossPiastres:number;orders:number}
/** Presentation only: input is the unchanged Cairo-date cohort from overview-model. */
export function SellerAreaChart({daily}:{daily:readonly Daily[]}){
 const {locale,t}=useSellerCopy(),reduced=useReducedMotion();const gradient=useId().replace(/:/g,'');
 const date=(day:string,full=false)=>new Intl.DateTimeFormat(locale==='en'?'en-GB':'ar-EG-u-ca-gregory',{day:'numeric',month:'short',...(full?{year:'numeric' as const}:{}),timeZone:'Africa/Cairo'}).format(new Date(day+'T12:00:00Z'));
 return <div className={styles.areaCanvas} aria-label={t('Delivered merchandise by day')}>
 <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:480,height:260}}>
 <AreaChart data={[...daily]} margin={{top:20,right:12,bottom:8,left:0}} accessibilityLayer>
 <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--seller-chart-stroke)" stopOpacity={0.22}/><stop offset="100%" stopColor="var(--seller-chart-stroke)" stopOpacity={0}/></linearGradient></defs>
 <CartesianGrid vertical={false} stroke="rgb(var(--c-line))" strokeDasharray="3 5"/>
 <XAxis dataKey="day" reversed={locale==='ar'} tickFormatter={day=>date(String(day))} tick={{fill:'rgb(var(--c-ink2))',fontSize:11}} tickLine={false} axisLine={false} minTickGap={38} tickMargin={12}/>
 <YAxis domain={[0,(max:number)=>{const step=10**Math.floor(Math.log10(Math.max(max,100)));return Math.max(100,Math.ceil(max*1.15/step)*step)}]} orientation={locale==='ar'?'right':'left'} tickFormatter={value=>new Intl.NumberFormat(locale==='en'?'en-GB':'ar-EG',{notation:'compact',maximumFractionDigits:1}).format(Number(value)/100)} tick={{fill:'rgb(var(--c-ink2))',fontSize:11}} tickLine={false} axisLine={false} width={54}/>
 <Tooltip isAnimationActive={!reduced} cursor={{stroke:'var(--seller-chart-stroke)',strokeDasharray:'3 3',strokeOpacity:0.4}} content={({active,payload})=>{const point=payload?.[0]?.payload as Daily|undefined;return active&&point?<div className={styles.tooltip} role="status" aria-live="polite" dir={locale==='ar'?'rtl':'ltr'}><p>{date(point.day,true)}</p><dl><div><dt>{t('Delivered merchandise')}</dt><dd className="tnum">{formatPrice(point.grossPiastres)} EGP</dd></div><div><dt>{t('Delivered orders')}</dt><dd className="tnum">{num(point.orders)}</dd></div></dl></div>:null}}/>
 <Area type="monotone" dataKey="grossPiastres" name={t('Delivered merchandise')} stroke="var(--seller-chart-stroke)" strokeWidth={2.5} fill={`url(#${gradient})`} activeDot={{r:4,stroke:'rgb(var(--c-raised))',strokeWidth:2}} dot={false} isAnimationActive={!reduced} animationDuration={650}/>
 </AreaChart></ResponsiveContainer></div>;
}
