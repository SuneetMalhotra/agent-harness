// tests/mobile-schema.test.ts — script-level checks for the mobile module.
//
// Runs as:
//   npx tsx tests/mobile-schema.test.ts
//
// Exits 0 on all-pass, 1 on any failure. No external test framework
// required (the repo currently has no Jest/Vitest setup; adding one
// would balloon scope). Assertions are inline.

import { runMobileHarness } from '../mobile/mobile-harness.js';
import { MOBILE_TEST_CASES } from '../mobile/mobile-test-cases.js';
import { SAMPLE_APP_ELEMENTS } from '../mobile/sample-app.js';

const failures: string[] = [];

function check(label: string, cond: boolean, detail?: string): void {
  if (!cond) {
    failures.push(`FAIL: ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`PASS: ${label}`);
  }
}

async function main(): Promise<void> {
  // -----------------------------------------------------------------
  // Static checks on the test-case catalog
  // -----------------------------------------------------------------
  check(
    'Test case count matches sample-app element count',
    MOBILE_TEST_CASES.length === SAMPLE_APP_ELEMENTS.length,
    `cases=${MOBILE_TEST_CASES.length} elements=${SAMPLE_APP_ELEMENTS.length}`,
  );

  check(
    'Test case count is in [10, 15] band (manuscript-required)',
    MOBILE_TEST_CASES.length >= 10 && MOBILE_TEST_CASES.length <= 15,
    `count=${MOBILE_TEST_CASES.length}`,
  );

  check(
    'Every test case is targetModality=mobile',
    MOBILE_TEST_CASES.every((tc) => tc.targetModality === 'mobile'),
  );

  check(
    'Test case IDs are unique',
    new Set(MOBILE_TEST_CASES.map((tc) => tc.testCaseId)).size === MOBILE_TEST_CASES.length,
  );

  check(
    'At least one accessibilityId primary resolution exists',
    MOBILE_TEST_CASES.some((tc) => tc.expectedStrategy === 'accessibilityId'),
  );

  check(
    'At least one xpath fallback exists',
    MOBILE_TEST_CASES.some((tc) => tc.expectedStrategy === 'xpath'),
  );

  check(
    'At least one uiautomator fallback exists',
    MOBILE_TEST_CASES.some((tc) => tc.expectedStrategy === 'uiautomator'),
  );

  check(
    'At least one vision-fallback path exists',
    MOBILE_TEST_CASES.some((tc) => tc.expectedStrategy === 'visionFallback'),
  );

  check(
    'At least one unrecovered failure exists (non-swallowed)',
    MOBILE_TEST_CASES.some((tc) => tc.expectedStrategy === 'unrecovered'),
  );

  // -----------------------------------------------------------------
  // Dynamic checks via runMobileHarness()
  // -----------------------------------------------------------------
  const result = await runMobileHarness();

  check(
    'Result.testCases reconciles with test catalog length',
    result.testCases === MOBILE_TEST_CASES.length,
    `result=${result.testCases} catalog=${MOBILE_TEST_CASES.length}`,
  );

  check(
    'Result.healingEvents == Result.testCases (one event per case)',
    result.healingEvents === result.testCases,
    `events=${result.healingEvents} cases=${result.testCases}`,
  );

  check(
    'Recovered + unrecovered == testCases (counts reconcile)',
    result.recovered + result.unrecovered === result.testCases,
    `${result.recovered} + ${result.unrecovered} != ${result.testCases}`,
  );

  check(
    'sameSchemaReused flag is true',
    result.sameSchemaReused === true,
  );

  check(
    'All events have targetModality=mobile',
    result.events.every((e) => e.targetModality === 'mobile'),
  );

  check(
    'All events have valid tier (tier1/tier2/tier3)',
    result.events.every((e) => ['tier1', 'tier2', 'tier3'].includes(e.tier)),
  );

  check(
    'Comparison.web.testCases == 30 (matches §6 web run)',
    result.comparison.web.testCases === 30,
    `got ${result.comparison.web.testCases}`,
  );

  check(
    'Comparison.web.recovered == 29 (matches §6 web run)',
    result.comparison.web.recovered === 29,
    `got ${result.comparison.web.recovered}`,
  );

  check(
    'Comparison.hardware.evaluated == false',
    result.comparison.hardware.evaluated === false,
  );

  check(
    'Mode is deterministic-replay (not live-appium)',
    result.metadata.mode === 'deterministic-replay',
  );

  // -----------------------------------------------------------------
  // Web-results-preservation check
  // -----------------------------------------------------------------
  try {
    const { readFileSync } = await import('node:fs');
    const webResults = JSON.parse(readFileSync('results.json', 'utf-8'));
    check(
      'results.json still has the original web "healing" section',
      typeof webResults.healing === 'object' && webResults.healing !== null,
    );
    check(
      'results.json still has the original web "visualAssertion" section',
      typeof webResults.visualAssertion === 'object' &&
        webResults.visualAssertion !== null,
    );
    check(
      'results.json was not overwritten by mobile run',
      webResults.metadata?.provider !== undefined,
      'mobile run should write to results-mobile.json, not clobber results.json',
    );
  } catch (err) {
    check('results.json readable', false, String(err));
  }

  // -----------------------------------------------------------------
  // Final summary
  // -----------------------------------------------------------------
  // eslint-disable-next-line no-console
  console.log('');
  if (failures.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`All checks passed (${MOBILE_TEST_CASES.length} test cases, ${result.recovered}/${result.testCases} recovered)`);
    process.exit(0);
  } else {
    // eslint-disable-next-line no-console
    console.error(`${failures.length} check(s) failed:`);
    failures.forEach((f) => {
      // eslint-disable-next-line no-console
      console.error(`  ${f}`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('mobile-schema.test.ts threw:', err);
  process.exit(1);
});
