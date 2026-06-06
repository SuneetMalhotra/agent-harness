// mobile/mobile-test-cases.ts — 13 deterministic mobile test cases.
//
// Each test case corresponds 1:1 with a SampleAppElement from
// sample-app.ts. The mobile harness iterates this list, dispatches each
// case to its tagged tier, and emits one MobileHealingEvent per case.
//
// The mix is deliberately calibrated to exercise the full mobile cascade:
//   - 9 accessibilityId primary resolutions (most common in the real app)
//   - 1 xpath fallback (no accessibilityId on the element)
//   - 1 uiautomator fallback (Android-specific selector)
//   - 1 vision-fallback (no stable selector at all)
//   - 1 unrecovered failure (overlay-occluded; demonstrates non-swallowed
//     failure reporting per §6.1 of the manuscript)
//
// Total: 13 cases, 12 recovered, 1 unrecovered. Counts must reconcile
// with the manuscript and ARTIFACTS.md.

import { MobileTestCase } from './types.js';
import { SAMPLE_APP_ELEMENTS } from './sample-app.js';

/**
 * Tier assignment policy for the mobile feasibility study:
 *   - login / products / product-detail → tier1 (local emulator + ADB,
 *     mirrors the §5.1 Tier 1 physical bench description)
 *   - cart → tier2 (cloud real-device farm)
 *   - checkout → tier3 (ephemeral virtual back-end peripherals; e.g.,
 *     a mock payment gateway)
 *
 * The replay does not actually invoke any Tier — the deterministic harness
 * records the assigned tier for the firstDispatchCorrect count and emits a
 * tier-routed observability entry for each case.
 */
const TIER_FOR_SCREEN: Record<string, 'tier1' | 'tier2' | 'tier3'> = {
  login: 'tier1',
  products: 'tier1',
  'product-detail': 'tier1',
  cart: 'tier2',
  checkout: 'tier3',
};

export const MOBILE_TEST_CASES: MobileTestCase[] = SAMPLE_APP_ELEMENTS.map(
  (el, idx) => ({
    testCaseId: `MTC-${String(idx + 1).padStart(3, '0')}`,
    targetModality: 'mobile' as const,
    tier: TIER_FOR_SCREEN[el.screen] ?? 'tier1',
    semanticLocator: el.semanticLocator,
    expectedBehavior: `Resolve the "${el.semanticLocator}" element on the ${el.screen} screen using ${el.preferredStrategy}, dispatch to ${TIER_FOR_SCREEN[el.screen] ?? 'tier1'}.`,
    screen: el.screen,
    expectedStrategy: el.preferredStrategy,
  }),
);
