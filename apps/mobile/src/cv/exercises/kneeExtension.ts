import type { ExerciseAnalyzer, FormFlag, PoseFrame, RepCandidate } from "../repCounter";
const LM={LEFT_HIP:23,RIGHT_HIP:24,LEFT_KNEE:25,RIGHT_KNEE:26,LEFT_ANKLE:27,RIGHT_ANKLE:28} as const;
const CFG={FLEXED:100,EXTENDED:165,MIN_MS:700} as const;
type Phase='FLEXED'|'EXTENDED'|'SEEKING_EXT';
const ang=(a:any,b:any,c:any)=>{const ab={x:a.x-b.x,y:a.y-b.y},cb={x:c.x-b.x,y:c.y-b.y};const dot=ab.x*cb.x+ab.y*cb.y;const mag=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y);if(!mag)return 0;return Math.acos(Math.min(1,Math.max(-1,dot/mag)))*180/Math.PI;};
const snap=(f:PoseFrame)=>[LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_KNEE,LM.RIGHT_KNEE,LM.LEFT_ANKLE,LM.RIGHT_ANKLE].flatMap(i=>[Math.round((f[i]?.x??0)*1000)/1000,Math.round((f[i]?.y??0)*1000)/1000]);
export class KneeExtensionAnalyzer implements ExerciseAnalyzer{readonly exerciseId='knee_extension';readonly requiredLandmarks=[LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_KNEE,LM.RIGHT_KNEE,LM.LEFT_ANKLE,LM.RIGHT_ANKLE];private phase:Phase='FLEXED';private start=0;private max=0;
processFrame(frame:PoseFrame,ms:number):RepCandidate|null{const k=(ang(frame[LM.LEFT_HIP],frame[LM.LEFT_KNEE],frame[LM.LEFT_ANKLE])+ang(frame[LM.RIGHT_HIP],frame[LM.RIGHT_KNEE],frame[LM.RIGHT_ANKLE]))/2;
if(this.phase==='FLEXED'){if(k>=CFG.EXTENDED){this.phase='EXTENDED';this.start=ms;this.max=k;}else if(k>CFG.FLEXED){this.phase='SEEKING_EXT';this.start=ms;this.max=k;}return null;}
this.max=Math.max(this.max,k);if(this.phase==='SEEKING_EXT'){if(k>=CFG.EXTENDED)this.phase='EXTENDED';else if(k<=CFG.FLEXED){const d=ms-this.start;const flags:FormFlag[]=['PARTIAL_ROM'];if(d<CFG.MIN_MS)flags.push('TOO_FAST');this.reset();return{durationMs:d,formScore:Math.max(0,100-flags.length*20),flags,auditSnapshot:snap(frame)};}return null;}
if(k<=CFG.FLEXED){const d=ms-this.start;const flags:FormFlag[]=[];if(this.max<CFG.EXTENDED)flags.push('PARTIAL_ROM');if(d<CFG.MIN_MS)flags.push('TOO_FAST');this.reset();return{durationMs:d,formScore:Math.max(0,100-flags.length*20),flags,auditSnapshot:snap(frame)};}return null;}
reset(){this.phase='FLEXED';this.start=0;this.max=0;}}
