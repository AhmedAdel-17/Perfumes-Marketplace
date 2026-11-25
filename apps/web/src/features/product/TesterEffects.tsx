'use client';
import {useEffect,useMemo,useRef,type RefObject} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {CanvasTexture,Vector3,type Group,type Sprite,type SpriteMaterial} from 'three';
import type {InspectionProps} from './BottleInspection';

/** A finite spray simulation: GPU sprites, no React updates per frame or external textures. */
export function TesterEffects({sprayId,reduced,notes,pinRoot}:{sprayId:number;reduced:boolean;pinRoot:RefObject<HTMLDivElement|null>;notes:InspectionProps['notes']}){
 const cloud=useRef<Group>(null),started=useRef(-1),last=useRef(-1);
 const {invalidate}=useThree();
 const projected=useMemo(()=>new Vector3(),[]);
 const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');if(ctx){const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,248,230,.7)');gradient.addColorStop(.3,'rgba(255,248,230,.3)');gradient.addColorStop(1,'rgba(255,248,230,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64)}return new CanvasTexture(canvas)},[]);
 const particles=useMemo(()=>Array.from({length:56},(_,i)=>({angle:i*2.39996,spread:.1+(i%9)/15,speed:.6+(i%7)*.08,delay:(i%8)*.025})),[]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 useEffect(()=>{invalidate()},[sprayId,invalidate]);
 useFrame(({clock,camera,size})=>{
  if(last.current!==sprayId){last.current=sprayId;started.current=clock.elapsedTime}
  const elapsed=clock.elapsedTime-started.current;
  if(cloud.current){cloud.current.visible=!reduced&&elapsed<4.5;cloud.current.children.forEach((child,i)=>{const sprite=child as Sprite;const p=particles[i];if(!p)return;const t=elapsed-.12-p.delay;const age=Math.max(0,t);sprite.position.set(Math.cos(p.angle)*p.spread*age*.48,1.26+age*p.speed,.27+age*.48+Math.sin(p.angle)*p.spread*age*.4);sprite.scale.setScalar(.08+age*.32);(sprite.material as SpriteMaterial).opacity=t<0?0:Math.max(0,Math.sin(Math.min(age/3.8,1)*Math.PI))*.3;});}
  notes.forEach((_,i)=>{const element=pinRoot.current?.children[i] as HTMLElement|undefined;if(!element)return;const angle=i/Math.max(notes.length,1)*Math.PI*2;projected.set(Math.cos(angle)*1.65,.35+Math.sin(angle)*1.25,Math.sin(angle)*.5).project(camera);element.style.transform=`translate3d(${(projected.x+1)*size.width/2}px,${(1-projected.y)*size.height/2}px,0) translate(-50%,-50%)`;element.style.visibility=projected.z<1?'visible':'hidden';});
  if(!reduced&&elapsed<4.5)invalidate();
 });
 return <><group ref={cloud}>{particles.map((_,i)=><sprite key={i}><spriteMaterial map={texture} transparent opacity={0} depthWrite={false} toneMapped={false}/></sprite>)}</group></>;
}

export function Atomizer({sprayId,reduced}:{sprayId:number;reduced:boolean}){
 const nozzle=useRef<Group>(null),start=useRef(-1),last=useRef(-1);const {invalidate}=useThree();
 useEffect(()=>{invalidate()},[sprayId,invalidate]);
 useFrame(({clock})=>{if(last.current!==sprayId){last.current=sprayId;start.current=clock.elapsedTime}const age=clock.elapsedTime-start.current;if(nozzle.current)nozzle.current.position.y=1.24-(reduced?0:Math.sin(Math.min(age/.42,1)*Math.PI)*.085);if(age<.45&&!reduced)invalidate()});
 return <group ref={nozzle} position={[0,1.24,0]}><mesh><cylinderGeometry args={[.23,.23,.22,48]}/><meshStandardMaterial color="#B6985A" metalness={.9} roughness={.2}/></mesh><mesh position={[0,0,.226]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.035,.035,.012,24]}/><meshStandardMaterial color="#201E1C" roughness={.3}/></mesh></group>;
}
