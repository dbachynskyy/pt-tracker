#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJsonSafe(p) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}

function build(atlas, helios, orion) {
  const blockers = [];
  const add = (code, source, detail, severity='blocker') => blockers.push({ code, source, detail, severity });

  if (!atlas.ok) add('ATLAS_PROVENANCE_FAIL','atlas',`unparseable atlas v2: ${atlas.error}`);
  if (!helios.ok) add('HELIOS_SUMMARY_FAIL','helios',`unparseable helios summary: ${helios.error}`);
  if (!orion.ok) add('ORION_LANE_ARTIFACT_FAIL','orion',`unparseable orion lane artifact: ${orion.error}`);

  const required=10;
  const atlasExercises = atlas.ok ? (Array.isArray(atlas.data.exercises)?atlas.data.exercises:[]) : [];
  const heliosExercises = helios.ok ? (Array.isArray(helios.data.readiness_matrix)?helios.data.readiness_matrix:[]) : [];
  const orionLane = orion.ok ? (orion.data.lane_status||{}) : {};

  const atlasSet = new Set(atlasExercises.map(e=>norm(e.exerciseId||e.id)).filter(Boolean));
  const heliosSet = new Set(heliosExercises.map(e=>norm(e.exerciseId||e.id)).filter(Boolean));

  if (atlas.ok && atlasSet.size < required) add('ATLAS_PROVENANCE_FAIL','atlas',`coverage ${atlasSet.size}/${required}`);

  if (helios.ok) {
    const degraded = (helios.data.failFast?.categories||[]).some(c => /DEGRADE|INCIDENT|AUTH_BLOCKER|CREDITS_BLOCKER|CAMERA_BLOCKER/.test(c.code||''));
    if (degraded || ['FAIL','BLOCKED','FAIL_FAST'].includes(helios.data.strictGateStatus)) {
      add('HELIOS_GATED_DEGRADE_INCIDENT','helios',`strictGateStatus=${helios.data.strictGateStatus||'unknown'}`);
    }
  }

  if (orion.ok) {
    const anyBlocked = Object.values(orionLane).includes('BLOCKED');
    if (anyBlocked || orion.data.tests_passed===false) add('ORION_LANE_BLOCKED','orion',`lane_status=${JSON.stringify(orionLane)}`);
  }

  const laneStatuses = {
    atlas: atlas.ok && atlasSet.size>=required ? 'PASS' : 'BLOCKED',
    helios: helios.ok && !blockers.some(b=>b.source==='helios') ? 'PASS' : 'BLOCKED',
    orion: orion.ok && !blockers.some(b=>b.source==='orion') ? 'PASS' : 'BLOCKED',
  };

  const coverage = {
    required: required,
    atlas: atlasSet.size,
    helios: heliosSet.size,
    pass: atlasSet.size>=required && heliosSet.size>=required,
  };

  const goNoGo = blockers.length===0 ? 'GO' : 'NO_GO';

  return {
    generated_at: new Date().toISOString(),
    exercise_coverage_10of10: coverage,
    lane_statuses: laneStatuses,
    blocker_catalog: blockers,
    go_no_go: goNoGo,
  };
}

function main(){
  const [atlasPath, heliosPath, orionPath, outPath='artifacts/realcv-release-readiness.v1.json'] = process.argv.slice(2);
  if(!atlasPath||!heliosPath||!orionPath){
    console.error('Usage: node scripts/build-realcv-release-readiness.js <atlas-v2.json> <helios-summary.json> <orion-lanes.json> [out.json]');
    process.exit(2);
  }
  const out = build(readJsonSafe(atlasPath), readJsonSafe(heliosPath), readJsonSafe(orionPath));
  fs.writeFileSync(outPath, JSON.stringify(out,null,2));
  const blocked = out.blocker_catalog.length;
  console.log(`REALCV_RELEASE_READINESS go_no_go=${out.go_no_go} blockers=${blocked} lanes=${JSON.stringify(out.lane_statuses)}`);
  process.exit(blocked?1:0);
}

if(require.main===module) main();
module.exports={build,readJsonSafe};
