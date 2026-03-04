import type { ExerciseAnalyzer, FormFlag, PoseFrame, RepCandidate } from "../repCounter";
const LM={LEFT_HIP:23,RIGHT_HIP:24,LEFT_SHOULDER:11,RIGHT_SHOULDER:12,LEFT_ELBOW:13,RIGHT_ELBOW:14} as const;
const CFG={UP:120,DOWN:45,MIN_MS:700} as const;
type Phase='DOWN'|'UP';
const snap=(f:PoseFrame)=>[LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_SHOULDER,LM.RIGHT_SHOULDER,LM.LEFT_ELBOW,LM.RIGHT_ELBOW].flatMap(i=>[Math.round((f[i]?.x??0)*1000)/1000,Math.round((f[i]?.y??0)*1000)/1000]);
function abdDeg(hip:any,sh:any,el:any){const t={x:hip.x-sh.x,y:hip.y-sh.y};const a={x:el.x-sh.x,y:el.y-sh.y};const dot=t.x*a.x+t.y*a.y;const mag=Math.hypot(t.x,t.y)*Math.hypot(a.x,a.y);if(!mag)return 0;return Math.acos(Math.min(1,Math.max(-1,dot/mag)))*180/Math.PI;}
export class ShoulderAbductionAnalyzer implements ExerciseAnalyzer{readonly exerciseId='shoulder_abduction';readonly requiredLandmarks=[LM.LEFT_HIP,LM.RIGHT_HIP,LM.LEFT_SHOULDER,LM.RIGHT_SHOULDER,LM.LEFT_ELBOW,LM.RIGHT_ELBOW];private phase:Phase='DOWN';private start=0;private peak=0;
processFrame(f:PoseFrame,ms:number):RepCandidate|null{const l=abdDeg(f[LM.LEFT_HIP],f[LM.LEFT_SHOULDER],f[LM.LEFT_ELBOW]);const r=abdDeg(f[LM.RIGHT_HIP],f[LM.RIGHT_SHOULDER],f[LM.RIGHT_ELBOW]);const a=(l+r)/2;
if(this.phase==='DOWN'){if(a>CFG.UP){this.phase='UP';this.start=ms;this.peak=a;}return null;}
this.peak=Math.max(this.peak,a);if(a<CFG.DOWN){const d=ms-this.start;const flags:FormFlag[]=[];if(this.peak<CFG.UP)flags.push('PARTIAL_ROM');if(Math.abs(l-r)>20)flags.push('ASYMMETRIC_HIPS');if(d<CFG.MIN_MS)flags.push('TOO_FAST');this.reset();return{durationMs:d,formScore:Math.max(0,100-flags.length*20),flags,auditSnapshot:snap(f)};}return null;}
reset(){this.phase='DOWN';this.start=0;this.peak=0;}}
