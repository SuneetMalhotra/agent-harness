// examples/run-mobile-example.ts — deterministic mobile feasibility demo.
//
// Reviewer / reader reproduction command:
//   npm run example:mobile
//
// No Appium server, no Android emulator, no LLM API key required. The
// script encodes the public Sauce Labs My Demo App's screen catalog as
// TypeScript data and exercises the shared observability substrate
// against it. The output is byte-stable across runs.
//
// What gets produced:
//   - results-mobile.json (top-level)
//   - one MobileHealingEvent per test case (13 cases total)
//   - reconciled per-strategy and per-screen counts
//
// What this is NOT:
//   - a production-scale mobile evaluation
//   - a claim about mobile testing performance
//   - a substitute for a live Appium run against a real device
//
// What this IS:
//   - a demonstration that the same coupling pattern, schema, and
//     observability substrate that §6 uses on the web modality also
//     work for the mobile modality, on a public reference app.

import { runMobileHarness } from '../mobile/mobile-harness.js';

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Running deterministic mobile feasibility replay...');
  const result = await runMobileHarness();
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Mobile feasibility summary:');
  // eslint-disable-next-line no-console
  console.log(`  Mode:                  ${result.metadata.mode}`);
  // eslint-disable-next-line no-console
  console.log(`  Target app:            ${result.metadata.targetApp}`);
  // eslint-disable-next-line no-console
  console.log(`  License:               ${result.metadata.targetAppLicense}`);
  // eslint-disable-next-line no-console
  console.log(`  Test cases:            ${result.testCases}`);
  // eslint-disable-next-line no-console
  console.log(`  Healing events:        ${result.healingEvents}`);
  // eslint-disable-next-line no-console
  console.log(`  Recovered:             ${result.recovered}/${result.testCases}`);
  // eslint-disable-next-line no-console
  console.log(`  Unrecovered (logged):  ${result.unrecovered}`);
  // eslint-disable-next-line no-console
  console.log(`  First-dispatch correct:${result.firstDispatchCorrect}/${result.testCases}`);
  // eslint-disable-next-line no-console
  console.log(`  Same schema reused:    ${result.sameSchemaReused}`);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Artifact written: results-mobile.json');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('run-mobile-example failed:', err);
  process.exit(1);
});
