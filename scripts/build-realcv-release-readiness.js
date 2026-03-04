#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJsonSafe(p) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}

function buildV1(atlas, helios, orion) {
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
    required,
    atlas: atlasSet.size,
    helios: heliosSet.size,
    pass: atlasSet.size>=required && heliosSet.size>=required,
  };

  const goNoGo = blockers.length===0 ? 'GO' : 'NO_GO';

  return {
    version: 'v1',
    generated_at: new Date().toISOString(),
    exercise_coverage_10of10: coverage,
    lane_statuses: laneStatuses,
    blocker_catalog: blockers,
    go_no_go: goNoGo,
  };
}

function buildV2(atlas, helios, orion, atlasAtt, heliosStability) {
  const out = buildV1(atlas, helios, orion);
  out.version = 'v2';
  const add = (code, source, detail, severity='blocker') => out.blocker_catalog.push({ code, source, detail, severity });

  // Atlas provenance attestation blocker
  if (!atlasAtt.ok) {
    add('ATLAS_ATTESTATION_FAIL', 'atlas', `unparseable atlas attestation: ${atlasAtt.error}`);
  } else {
    const verified = atlasAtt.data?.attestation_status === 'verified' || atlasAtt.data?.provenance?.verified === true;
    if (!verified) add('ATLAS_ATTESTATION_FAIL', 'atlas', 'atlas attestation not verified');
  }

  // Helios severe instability blocker
  if (!heliosStability.ok) {
    add('HELIOS_SEVERE_INSTABILITY', 'helios', `unparseable helios stability summary: ${heliosStability.error}`);
  } else {
    const d = heliosStability.data || {};
    const severe = d.severe_incident === true || d.severity === 'severe' || (Array.isArray(d.incidents) && d.incidents.some(i => i?.severity === 'severe'));
    if (severe) add('HELIOS_SEVERE_INSTABILITY', 'helios', 'severe instability incident present');
  }

  if (out.blocker_catalog.some(b => b.source === 'atlas')) out.lane_statuses.atlas = 'BLOCKED';
  if (out.blocker_catalog.some(b => b.source === 'helios')) out.lane_statuses.helios = 'BLOCKED';
  if (out.blocker_catalog.some(b => b.source === 'orion')) out.lane_statuses.orion = 'BLOCKED';

  out.go_no_go = out.blocker_catalog.length===0 ? 'GO' : 'NO_GO';
  return out;
}

function main(){
  const args = process.argv.slice(2);
  const has = (k) => args.includes(k);
  const val = (k, d=null) => { const i=args.indexOf(k); return i>=0?args[i+1]:d; };

  const version = val('--version', 'v1');
  const atlasPath = val('--atlas');
  const heliosPath = val('--helios');
  const orionPath = val('--orion');
  const outPath = val('--out', `artifacts/realcv-release-readiness.${version}.json`);
  const atlasAttPath = val('--atlas-attestation');
  const heliosStabilityPath = val('--helios-stability');

  // backward-compatible positional interface
  if (!atlasPath && args.length >= 3 && !has('--atlas')) {
    const [a,h,o,out='artifacts/realcv-release-readiness.v1.json'] = args;
    const outObj = buildV1(readJsonSafe(a), readJsonSafe(h), readJsonSafe(o));
    fs.writeFileSync(out, JSON.stringify(outObj,null,2));
    const blocked = outObj.blocker_catalog.length;
    console.log(`REALCV_RELEASE_READINESS[v1] go_no_go=${outObj.go_no_go} blockers=${blocked} lanes=${JSON.stringify(outObj.lane_statuses)}`);
    process.exit(blocked?1:0);
  }

  if(!atlasPath||!heliosPath||!orionPath){
    console.error('Usage: node scripts/build-realcv-release-readiness.js --version v1|v2 --atlas <atlas.json> --helios <helios.json> --orion <orion.json> [--atlas-attestation <file>] [--helios-stability <file>] [--out <out.json>]');
    process.exit(2);
  }

  const atlas = readJsonSafe(atlasPath);
  const helios = readJsonSafe(heliosPath);
  const orion = readJsonSafe(orionPath);

  const outObj = version === 'v2'
    ? buildV2(atlas, helios, orion, readJsonSafe(atlasAttPath || ''), readJsonSafe(heliosStabilityPath || ''))
    : buildV1(atlas, helios, orion);

  fs.writeFileSync(outPath, JSON.stringify(outObj,null,2));
  const blocked = outObj.blocker_catalog.length;
  console.log(`REALCV_RELEASE_READINESS[${version}] go_no_go=${outObj.go_no_go} blockers=${blocked} lanes=${JSON.stringify(outObj.lane_statuses)}`);
  process.exit(blocked?1:0);
}

if(require.main===module) main();
module.exports={buildV1,buildV2,readJsonSafe};
