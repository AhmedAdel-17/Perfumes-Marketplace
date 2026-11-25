'use client';
import {Suspense,useEffect,useMemo,useRef,useState,type ComponentRef} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {Bounds,Environment,Lightformer,OrbitControls,RoundedBox,useGLTF} from '@react-three/drei';
import {CanvasTexture,SRGBColorSpace} from 'three';
import {useReducedMotion} from 'framer-motion';
import {scentFamily} from '@diyar/tokens';
import {PRODUCT_EXPERIENCE} from '@diyar/i18n';
import type {InspectionProps} from './BottleInspection';
import styles from './ProductExperience.module.css';
import {Atomizer,TesterEffects} from './TesterEffects';

function Bottle({family,name,house,sprayId,reduced}:Pick<InspectionProps,'family'|'name'|'house'>&{sprayId:number;reduced:boolean}){
 const tint=scentFamily[family as keyof typeof scentFamily]??scentFamily.amber;
 const label=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');if(c){c.fillStyle='#F5F2EB';c.fillRect(0,0,512,512);c.strokeStyle='#A08247';c.lineWidth=3;c.strokeRect(18,18,476,476);c.textAlign='center';c.fillStyle='#29251F';c.font='30px serif';c.fillText(house.slice(0,25),256,110,440);c.font='38px serif';c.fillText(name.slice(0,27),256,255,440);c.font='18px sans-serif';c.fillText('DIYAR · 3D STUDY',256,420)}const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture},[name,house]);
 useEffect(()=>()=>label.dispose(),[label]);
 return <group position={[0,-0.05,0]} rotation={[0,-0.2,0]}>
 <RoundedBox args={[1.52,2.05,0.82]} radius={0.13} smoothness={5} position={[0,-0.2,0]}><meshPhysicalMaterial color="#f3e9d2" transmission={1} thickness={0.16} roughness={0.04} ior={1.5} envMapIntensity={0.7} clearcoat={1} clearcoatRoughness={0.05}/></RoundedBox>
 <RoundedBox args={[1.29,1.46,0.61]} radius={0.1} smoothness={4} position={[0,-0.38,0]}><meshPhysicalMaterial color={tint} transmission={0} thickness={0.5} attenuationColor={tint} attenuationDistance={1.4} roughness={0.12} ior={1.33}/></RoundedBox>
 <mesh position={[0,0.94,0]}><cylinderGeometry args={[0.24,0.25,0.32,48]}/><meshPhysicalMaterial transmission={0.9} roughness={0.08} thickness={0.15} ior={1.5}/></mesh>
 <mesh position={[0,1.06,0]}><cylinderGeometry args={[0.29,0.29,0.12,48]}/><meshStandardMaterial color="#B6985A" metalness={0.9} roughness={0.23}/></mesh>
 <Atomizer sprayId={sprayId} reduced={reduced}/>
 <mesh position={[0,-0.23,0.419]}><planeGeometry args={[1.02,1.02]}/><meshStandardMaterial map={label} roughness={0.7}/></mesh>
 </group>;
}
function Model({url}:{url:string}){const {scene}=useGLTF(url,false,false);const model=useMemo(()=>scene.clone(true),[scene]);return <Bounds fit clip observe margin={1.35}><primitive object={model}/></Bounds>}
function Studio(){return <><ambientLight intensity={0.35}/><spotLight position={[4,6,4]} intensity={55} angle={0.5} penumbra={1}/><Environment resolution={128} frames={1}><Lightformer form="rect" intensity={4} position={[-4,2,2]} rotation={[0,Math.PI/3,0]} scale={[2,5,1]}/><Lightformer form="rect" intensity={3} position={[4,3,-2]} rotation={[0,-Math.PI/3,0]} scale={[3,5,1]}/><Lightformer form="ring" intensity={2} position={[0,5,0]} rotation={[Math.PI/2,0,0]} scale={4}/></Environment></>}
function ContextGuard({failed}:{failed():void}){const {gl}=useThree();useEffect(()=>{const canvas=gl.domElement;const lost=(e:Event)=>{e.preventDefault();failed()};canvas.addEventListener('webglcontextlost',lost);return()=>canvas.removeEventListener('webglcontextlost',lost)},[gl,failed]);return null}
export default function BottleCanvas(props:InspectionProps){
 const c=PRODUCT_EXPERIENCE[props.locale],reduced=useReducedMotion();const [paused,setPaused]=useState(false),[failed,setFailed]=useState(false),[sprayId,setSprayId]=useState(1),[spraying,setSpraying]=useState(false);
 useEffect(()=>{if(!spraying)return;const timer=window.setTimeout(()=>setSpraying(false),900);return()=>clearTimeout(timer)},[spraying]);const controls=useRef<ComponentRef<typeof OrbitControls>>(null);
 const pinRoot=useRef<HTMLDivElement>(null);
 const [supported]=useState(()=>{try{const canvas=document.createElement('canvas');const context=canvas.getContext('webgl2');if(!context)return false;context.getExtension('WEBGL_lose_context')?.loseContext();return true}catch{return false}});
 const modelUrl=useMemo(()=>{if(!props.modelUrl)return null;const url=new URL(props.modelUrl,location.origin);if(url.origin!==location.origin||!url.pathname.toLowerCase().endsWith('.glb'))throw Error('Use an approved same-origin GLB');return url.href},[props.modelUrl]);
 if(!supported||failed)return <p role="status" className={styles.fallback}>{c.unavailable}</p>;
 return <><Canvas camera={{position:[3,1.6,5],fov:36}} dpr={[1,1.5]} frameloop={paused||reduced?'demand':'always'} gl={{antialias:true,alpha:true,powerPreference:'default'}} fallback={<p>{c.unavailable}</p>}><color attach="background" args={['#332F2C']}/><ContextGuard failed={()=>setFailed(true)}/><Suspense fallback={null}><Studio/>{modelUrl?<Model url={modelUrl}/>:<Bottle family={props.family} name={props.name} house={props.house} sprayId={sprayId} reduced={Boolean(reduced)}/>}<TesterEffects sprayId={sprayId} reduced={Boolean(reduced)} notes={props.notes} pinRoot={pinRoot}/></Suspense><OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} autoRotate={!paused&&!reduced} autoRotateSpeed={0.5} minDistance={3.2} maxDistance={8} minPolarAngle={0.3} maxPolarAngle={Math.PI-0.3}/></Canvas><div key={sprayId} ref={pinRoot} className={styles.projectedNotes} aria-live="off">{props.notes.map(note=><div key={note.text} className={styles.projectedPin}><span lang={note.lang} dir={note.lang==='ar'?'rtl':'ltr'} className={styles.spatialNote}>{note.text}</span></div>)}</div><div className={styles.testerControls}><button type="button" className={styles.sprayButton} disabled={spraying} onClick={()=>{setSprayId(id=>id+1);setSpraying(true)}}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 9h8v12H6z M8 9V5h6v4 M14 5h3 M19 3l2-1 M19 5h3 M19 7l2 1"/></svg>{c.spray}</button><button type="button" className={styles.iconControl} aria-label={paused||reduced?c.play:c.pause} title={paused||reduced?c.play:c.pause} onClick={()=>setPaused(v=>!v)} disabled={Boolean(reduced)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{paused||reduced?<path d="m9 5 10 7-10 7Z"/>:<path d="M8 5v14 M16 5v14"/>}</svg></button><button type="button" className={styles.iconControl} aria-label={c.reset} title={c.reset} onClick={()=>controls.current?.reset()}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 11a8 8 0 1 1 2 7 M4 4v7h7"/></svg></button></div></>;
}
