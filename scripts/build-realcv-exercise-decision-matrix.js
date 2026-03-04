#!/usr/bin/env node
'use strict';

const fs = require('fs');

const EXERCISES = ['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'];

function readJsonSafe(path){try{return{ok:true,data:JSON.parse(fs.readFileSync(path,'utf8')),path};}catch(e){return{ok:false,error:e.message,path};}}
function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}

function idx(arr, keys=['exercise_id','exerciseId','id']){
  const m={};
  for(const r of (arr||[])){
    let id=null; for(const k of keys){ if(r&&r[k]){id=norm(r[k]);break;} }
    if(id) m[id]=r;
  }
  return m;
}

function build(atlasN, atlasC, atlasP, heliosE, heliosF, matrix10, freshnessHours=48){
  const blockers=[]; const add=(code,detail,source='matrix')=>blockers.push({code,detail,source});
  const requiredArtifacts = {
    atlas_normalized: atlasN,
    atlas_coverage: atlasC,
    atlas_pack: atlasP,
    helios_evidence: heliosE,
    helios_fallback: heliosF,
    ex10_matrix: matrix10,
  };
  for(const [k,v] of Object.entries(requiredArtifacts)) if(!v.ok) add('MISSING_REQUIRED_ARTIFACT',`${k} missing/malformed: ${v.path}`,k);

  const now = Date.now();
  const freshMs = freshnessHours*3600*1000;

  const atlasMap = idx(atlasN.ok ? (atlasN.data.exercises||atlasN.data.readiness_matrix||[]) : []);
  const covMap = idx(atlasC.ok ? (atlasC.data.exercises||atlasC.data.readiness_matrix||[]) : []);
  const packMap = idx(atlasP.ok ? (atlasP.data.exercises||atlasP.data.readiness_matrix||[]) : []);
  const helMap = idx(heliosE.ok ? (heliosE.data.exercises||heliosE.data.readiness_matrix||[]) : []);
  const matrixMap = idx(matrix10.ok ? (matrix10.data.exercises||[]) : []);

  // malformed blocker class propagation from helios
  const heliosMalformed = heliosE.ok && Array.isArray(heliosE.data.blockers) && heliosE.data.blockers.some(b => String(b.code||'').includes('MALFORMED'));
  if (heliosMalformed) add('HELIOS_MALFORMED_BLOCKER_PROPAGATED','helios evidence includes malformed blocker class','helios');

  const rows=[];
  for(const ex of EXERCISES){
    const reasons=[];
    const an=atlasMap[ex]||{}; const ac=covMap[ex]||{}; const ap=packMap[ex]||{}; const he=helMap[ex]||{}; const m=matrixMap[ex]||{};

    const atlas_ok = Boolean(an.normalized ?? an.pass ?? true) && Boolean(ac.coverage_pass ?? ac.pass ?? ac.status==='PASS') && Boolean(ap.pack_ready ?? ap.pass ?? true);
    const helios_ok = Boolean(he.real_camera_evidence ?? he.helios_gate_pass ?? he.pass ?? he.status==='PASS');
    const provenance_ok = Boolean(m.atlas_attested ?? m.provenance_ok ?? true);

    let freshness_ok = true;
    const ts = he.captured_at || he.timestamp || he.evidence_ts;
    if (ts){
      const t = new Date(ts).getTime();
      if (!Number.isNaN(t)) freshness_ok = (now - t) <= freshMs;
    }

    if (!atlas_ok) reasons.push('atlas_artifacts_fail');
    if (!helios_ok) reasons.push('helios_evidence_fail');
    if (!provenance_ok) reasons.push('provenance_fail');
    if (!freshness_ok) reasons.push('stale_evidence');
    if (!m.exercise_id && !m.exerciseId) reasons.push('exercise_missing_in_10ex_matrix');

    const overall_pass = atlas_ok && helios_ok && provenance_ok && freshness_ok && reasons.length===0;
    rows.push({ exercise_id: ex, atlas_ok, helios_ok, provenance_ok, freshness_ok, overall_pass, reasons });
  }

  const pass = rows.filter(r=>r.overall_pass).length;
  for(const r of rows) if(!r.overall_pass) add('EXERCISE_DECISION_FAIL',`${r.exercise_id}: ${r.reasons.join(',')}`,'exercise');

  return {
    version:'v1', generated_at:new Date().toISOString(), pass_count:pass, total:10,
    release:''+(pass===10 && blockers.length===0 ? 'PASS':'FAIL'),
    exercises:rows, blockers,
    diagnostics:{artifact_paths:Object.fromEntries(Object.entries(requiredArtifacts).map(([k,v])=>[k,v.path]))}
  };
}

function renderMd(o){
  const lines=['# RealCV Exercise Decision Matrix','','- pass: '+o.pass_count+'/'+o.total,'- release: '+o.release,'','| Exercise | Atlas | Helios | Provenance | Freshness | Overall | Reasons |','|---|---:|---:|---:|---:|---:|---|'];
  const icon=v=>v?'✅':'❌';
  for(const r of o.exercises) lines.push(`| ${r.exercise_id} | ${icon(r.atlas_ok)} | ${icon(r.helios_ok)} | ${icon(r.provenance_ok)} | ${icon(r.freshness_ok)} | ${icon(r.overall_pass)} | ${r.reasons.join(', ')||'—'} |`);
  return lines.join('\n');
}

function main(){
  const args=process.argv.slice(2);
  const val=(k,d=null)=>{const i=args.indexOf(k);return i>=0?args[i+1]:d;};
  const outJson=val('--out','artifacts/realcv-exercise-decision-matrix.v1.json');
  const outMd=val('--md','artifacts/realcv-exercise-decision-matrix.md');
  const freshness=Number(val('--freshness-hours','48'));

  const o=build(
    readJsonSafe(val('--atlas-normalized','artifacts/atlas-normalized.v1.json')),
    readJsonSafe(val('--atlas-coverage','artifacts/atlas-coverage-gate.v1.json')),
    readJsonSafe(val('--atlas-pack','artifacts/atlas-pack-output.v1.json')),
    readJsonSafe(val('--helios-evidence','artifacts/helios-exercise-readiness-evidence.v1.json')),
    readJsonSafe(val('--helios-fallback','artifacts/helios-fallback-plan.v1.json')),
    readJsonSafe(val('--matrix-10ex','artifacts/realcv-10ex-status.v1.json')),
    freshness
  );

  fs.writeFileSync(outJson,JSON.stringify(o,null,2));
  fs.writeFileSync(outMd,renderMd(o));
  console.log(`REALCV_EX_DECISION[v1] pass=${o.pass_count}/10 release=${o.release}`);
  process.exit(o.release==='PASS'?0:1);
}

if(require.main===module) main();
module.exports={build};
