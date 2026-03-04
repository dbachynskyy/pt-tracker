#!/usr/bin/env node
'use strict';

const fs = require('fs');

const EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction',
];

function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}
function readJsonSafe(p){try{return{ok:true,data:JSON.parse(fs.readFileSync(p,'utf8'))};}catch(e){return{ok:false,error:e.message};}}

function mapReadiness(doc){
  const m={};
  const arr=Array.isArray(doc?.exercises)?doc.exercises:[];
  for(const e of arr){m[norm(e.exerciseId||e.id)]={ready:e.ready!==false,reason:e.reason||null};}
  return m;
}

function mapHelios(summary){
  const m={};
  const arr=Array.isArray(summary?.readiness_matrix)?summary.readiness_matrix:[];
  for(const r of arr){
    const id=norm(r.exerciseId);
    m[id]={pass:Boolean(r.analyzerRouting&&r.minimumTestCoverageSignal),reason:(r.failureCodes||[]).join(',')||null};
  }
  return m;
}

function mapOrion(lanes){
  const m={};
  const arr=Array.isArray(lanes?.readiness_matrix)?lanes.readiness_matrix:[];
  for(const r of arr){
    const id=norm(r.exerciseId);
    m[id]={pass:r.status==='PASS',reason:(r.failureCodes||[]).join(',')||null};
  }
  return m;
}

function build(atlas,helios,orion){
  if(!atlas.ok||!helios.ok||!orion.ok) throw new Error('source parse failure');
  const am=mapReadiness(atlas.data);
  const hm=mapHelios(helios.data);
  const om=mapOrion(orion.data);

  const rows=[];
  for(const ex of EXERCISES){
    const reasons=[];
    const atlas_attested = am[ex]?.ready===true;
    const helios_gate_pass = hm[ex]?.pass===true;
    const orion_regression_pass = om[ex]?.pass===true;
    if(!atlas_attested) reasons.push(am[ex]?.reason||'atlas_not_attested');
    if(!helios_gate_pass) reasons.push(hm[ex]?.reason||'helios_gate_fail');
    if(!orion_regression_pass) reasons.push(om[ex]?.reason||'orion_regression_fail');
    rows.push({
      exercise_id: ex,
      atlas_attested,
      helios_gate_pass,
      orion_regression_pass,
      overall_pass: atlas_attested && helios_gate_pass && orion_regression_pass,
      reasons,
    });
  }

  return { version:'v1', generated_at:new Date().toISOString(), exercises: rows };
}

function main(){
  const [atlasPath, heliosSummaryPath, orionSummaryPath, outPath='artifacts/realcv-10ex-status.v1.json'] = process.argv.slice(2);
  if(!atlasPath||!heliosSummaryPath||!orionSummaryPath){
    console.error('Usage: node scripts/build-realcv-10ex-status.js <atlas-readiness.json> <helios-summary.json> <orion-summary.json> [out.json]');
    process.exit(2);
  }
  const out=build(readJsonSafe(atlasPath), readJsonSafe(heliosSummaryPath), readJsonSafe(orionSummaryPath));
  fs.writeFileSync(outPath, JSON.stringify(out,null,2));
  const passed=out.exercises.filter(e=>e.overall_pass).length;
  console.log(`REALCV_10EX_STATUS[v1] pass=${passed}/10`);
  process.exit(passed===10?0:1);
}

if(require.main===module) main();
module.exports={build,EXERCISES};
