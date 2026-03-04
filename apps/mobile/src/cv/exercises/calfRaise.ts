import type { ExerciseAnalyzer, FormFlag, PoseFrame, RepCandidate } from "../repCounter";
const LM={LEFT_HIP:23,RIGHT_HIP:24,LEFT_ANKLE:27,RIGHT_ANKLE:28,LEFT_FOOT:31,RIGHT_FOOT:32} as const;
const CFG={RAISED_DY:0.07,REST_DY:0.03,MIN_MS:650} as const;
type Phase='DOWN'|'UP';
const snap=(f:PoseFrame)=>[LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_ANKLE,LM.RIGHT_ANKLE,LM.LEFT_FOOT,LM.RIGHT_FOOT].flatMap(i=>[Math.round((f[i]?.x??0)*1000)/1000,Math.round((f[i]?.y??0)*1000)/1000]);
export class CalfRaiseAnalyzer implements ExerciseAnalyzer{readonly exerciseId: string = 'calf_raise';readonly requiredLandmarks=[LM.LEFT_ANKLE,LM.RIGHT_ANKLE,LM.LEFT_FOOT,LM.RIGHT_FOOT];private phase:Phase='DOWN';private start=0;private peak=0;
processFrame(frame:PoseFrame,ms:number):RepCandidate|null{const l=frame[LM.LEFT_ANKLE].y-frame[LM.LEFT_FOOT].y;const r=frame[LM.RIGHT_ANKLE].y-frame[LM.RIGHT_FOOT].y;const h=(l+r)/2;
if(this.phase==='DOWN'){if(h>CFG.RAISED_DY){this.phase='UP';this.start=ms;this.peak=h;}return null;}
this.peak=Math.max(this.peak,h);if(h<CFG.REST_DY){const d=ms-this.start;const flags:FormFlag[]=[];if(this.peak<CFG.RAISED_DY)flags.push('INSUFFICIENT_DEPTH');if(d<CFG.MIN_MS)flags.push('TOO_FAST');if(Math.abs(l-r)>0.03)flags.push('ASYMMETRIC_HIPS');this.reset();return{durationMs:d,formScore:Math.max(0,100-flags.length*20),flags,auditSnapshot:snap(frame)};}return null;}
reset(){this.phase='DOWN';this.start=0;this.peak=0;}}
