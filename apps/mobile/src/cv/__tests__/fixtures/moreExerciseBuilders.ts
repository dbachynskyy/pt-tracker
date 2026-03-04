import type { Landmark, PoseFrame } from '../../repCounter';

function frame(): PoseFrame {
  const arr = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 } as Landmark));
  return Object.assign(arr, { source: 'real' as const }) as PoseFrame;
}

const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;

function kneePose(angle:number,left=angle):PoseFrame{const f=frame();const m=(ang:number,s:number,kx:number)=>{const rad=ang*Math.PI/180;const ky=0.65,th=0.25;f[kx-2]={x:kx===26?0.62+Math.sin(rad)*th:0.38-Math.sin(rad)*th,y:ky+Math.cos(rad)*th,z:0,visibility:0.99};f[kx]={x:kx===26?0.62:0.38,y:ky,z:0,visibility:0.99};f[kx+2]={x:kx===26?0.62:0.38,y:ky+0.25,z:0,visibility:0.99};};m(angle,1,26);m(left,-1,25);return f;}

export function kneeCycle(reps:number,msPer:number,up=170,down=80):Array<{frame:PoseFrame;ms:number}>{const out=[] as Array<{frame:PoseFrame;ms:number}>;const dt=33;let t=0;for(let i=0;i<11;i++){out.push({frame:kneePose(up),ms:t});t+=dt;}const n=Math.max(6,Math.round(msPer/dt));for(let r=0;r<reps;r++){for(let i=0;i<n;i++){const p=i/(n-1);const a=p<0.5?lerp(up,down,p*2):lerp(down,up,(p-0.5)*2);out.push({frame:kneePose(a),ms:t});t+=dt;}}return out;}

export function bridgeCycle(reps:number,msPer:number,up=165,down=120):Array<{frame:PoseFrame;ms:number}>{const out=[] as Array<{frame:PoseFrame;ms:number}>;const dt=33;let t=0;const mk=(a:number)=>{const f=frame();const rad=a*Math.PI/180;f[11]={x:0.4,y:0.45,z:0,visibility:0.99};f[12]={x:0.6,y:0.45,z:0,visibility:0.99};f[23]={x:0.47,y:0.6-Math.sin(rad)*0.08,z:0,visibility:0.99};f[24]={x:0.53,y:0.6-Math.sin(rad)*0.08,z:0,visibility:0.99};f[25]={x:0.47,y:0.75,z:0,visibility:0.99};f[26]={x:0.53,y:0.75,z:0,visibility:0.99};return f;};
for(let i=0;i<11;i++){out.push({frame:mk(down),ms:t});t+=dt;}const n=Math.max(6,Math.round(msPer/dt));for(let r=0;r<reps;r++){for(let i=0;i<n;i++){const p=i/(n-1);const a=p<0.5?lerp(down,up,p*2):lerp(up,down,(p-0.5)*2);out.push({frame:mk(a),ms:t});t+=dt;}}return out;}

export function abductionCycle(reps:number,msPer:number,up=140,down=20):Array<{frame:PoseFrame;ms:number}>{const out=[] as Array<{frame:PoseFrame;ms:number}>;const dt=33;let t=0;const mk=(a:number)=>{const f=frame();const set=(s:number,hip:number,sh:number,el:number)=>{const rad=a*Math.PI/180;f[hip]={x:s<0?0.4:0.6,y:0.75,z:0,visibility:0.99};f[sh]={x:s<0?0.4:0.6,y:0.55,z:0,visibility:0.99};f[el]={x:(s<0?0.4:0.6)+s*Math.sin(rad)*0.2,y:0.55+Math.cos(rad)*0.2,z:0,visibility:0.99};};set(-1,23,11,13);set(1,24,12,14);return f;};
for(let i=0;i<11;i++){out.push({frame:mk(down),ms:t});t+=dt;}const n=Math.max(6,Math.round(msPer/dt));for(let r=0;r<reps;r++){for(let i=0;i<n;i++){const p=i/(n-1);const a=p<0.5?lerp(down,up,p*2):lerp(up,down,(p-0.5)*2);out.push({frame:mk(a),ms:t});t+=dt;}}return out;}

export function ankleCycle(reps:number,msPer:number,high=0.09,low=0.01):Array<{frame:PoseFrame;ms:number}>{const out=[] as Array<{frame:PoseFrame;ms:number}>;const dt=33;let t=0;const mk=(h:number)=>{const f=frame();f[27]={x:0.45,y:0.7,z:0,visibility:0.99};f[28]={x:0.55,y:0.7,z:0,visibility:0.99};f[31]={x:0.45,y:0.7-h,z:0,visibility:0.99};f[32]={x:0.55,y:0.7-h,z:0,visibility:0.99};return f;};
for(let i=0;i<11;i++){out.push({frame:mk(low),ms:t});t+=dt;}const n=Math.max(6,Math.round(msPer/dt));for(let r=0;r<reps;r++){for(let i=0;i<n;i++){const p=i/(n-1);const h=p<0.5?lerp(low,high,p*2):lerp(high,low,(p-0.5)*2);out.push({frame:mk(h),ms:t});t+=dt;}}return out;}
