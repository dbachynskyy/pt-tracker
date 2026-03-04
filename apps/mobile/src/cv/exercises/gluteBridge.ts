import type { ExerciseAnalyzer, FormFlag, PoseFrame, RepCandidate } from "../repCounter";
const LM={LEFT_SHOULDER:11,RIGHT_SHOULDER:12,LEFT_HIP:23,RIGHT_HIP:24,LEFT_KNEE:25,RIGHT_KNEE:26} as const;
const CFG={UP_HIP_Y:0.54,DOWN_HIP_Y:0.57,MIN_MS:800,ASYM_Y:0.05} as const;
type Phase='DOWN'|'UP';
const snap=(f:PoseFrame)=>[LM.LEFT_SHOULDER,LM.RIGHT_SHOULDER,LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_KNEE,LM.RIGHT_KNEE].flatMap(i=>[Math.round((f[i]?.x??0)*1000)/1000,Math.round((f[i]?.y??0)*1000)/1000]);

export class GluteBridgeAnalyzer implements ExerciseAnalyzer{readonly exerciseId='glute_bridge';readonly requiredLandmarks=[LM.LEFT_SHOULDER,LM.RIGHT_SHOULDER,LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_KNEE,LM.RIGHT_KNEE];private phase:Phase='DOWN';private start=0;private minHip=1;private asym=false;
processFrame(f:PoseFrame,ms:number):RepCandidate|null{const hipY=(f[LM.LEFT_HIP].y+f[LM.RIGHT_HIP].y)/2;this.minHip=Math.min(this.minHip,hipY);if(Math.abs(f[LM.LEFT_HIP].y-f[LM.RIGHT_HIP].y)>CFG.ASYM_Y)this.asym=true;
if(this.phase==='DOWN'){if(hipY<CFG.UP_HIP_Y){this.phase='UP';this.start=ms;this.minHip=hipY;}return null;}
if(hipY>CFG.DOWN_HIP_Y){const d=ms-this.start;const flags:FormFlag[]=[];if(this.minHip>CFG.UP_HIP_Y)flags.push('INSUFFICIENT_DEPTH');if(this.asym)flags.push('ASYMMETRIC_HIPS');if(d<CFG.MIN_MS)flags.push('TOO_FAST');this.reset();return{durationMs:d,formScore:Math.max(0,100-flags.length*20),flags,auditSnapshot:snap(f)};}return null;}
reset(){this.phase='DOWN';this.start=0;this.minHip=1;this.asym=false;}}
