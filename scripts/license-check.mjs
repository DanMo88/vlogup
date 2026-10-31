#!/usr/bin/env node
/**
 * Licence gate (CI): every dependency that ships in the app bundle must be
 * MIT, Apache-2.0, BSD, ISC or MPL-2.0. AGPL/GPL/LGPL/SSPL/unknown fail the build.
 * Dev-only tooling (never shipped) is reported but only fails on copyleft licences.
 */
import { execFileSync } from 'node:child_process';

const ALLOWED = /^(MIT|MIT-0|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|ISC|MPL-2\.0)$/;
const COPYLEFT = /(AGPL|GPL|SSPL|EUPL|CC-BY-SA|OSL)/i;

function scan(production) {
  const args = ['license-checker-rseidelsohn', '--json', '--excludePrivatePackages', production ? '--production' : '--development'];
  const out = execFileSync('npx', ['--no-install', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return Object.entries(JSON.parse(out)).map(([pkg, info]) => ({ pkg, lic: String(info.licenses ?? 'UNKNOWN') }));
}

// "(MIT OR Apache-2.0)" passes if any alternative is allowed; "A AND B" needs all.
function ok(expr) {
  const e = expr.replace(/[()*]/g, '').trim();
  if (/ OR /i.test(e)) return e.split(/ OR /i).some((x) => ok(x));
  if (/ AND /i.test(e)) return e.split(/ AND /i).every((x) => ok(x));
  return ALLOWED.test(e);
}

let failed = false;
const prod = scan(true);
console.log(`Production dependencies (${prod.length}):`);
for (const { pkg, lic } of prod) {
  const pass = ok(lic);
  console.log(`  ${pass ? '✓' : '✗'} ${pkg}  ${lic}`);
  if (!pass) failed = true;
}
const dev = scan(false);
const devBad = dev.filter(({ lic }) => COPYLEFT.test(lic) && !ok(lic));
console.log(`\nDev-only tooling: ${dev.length} packages scanned, ${devBad.length} copyleft.`);
for (const { pkg, lic } of devBad) { console.log(`  ✗ ${pkg}  ${lic}`); failed = true; }

if (failed) { console.error('\nLicence check FAILED: only MIT, Apache-2.0, BSD, ISC and MPL-2.0 are allowed.'); process.exit(1); }
console.log('\nLicence check passed.');
