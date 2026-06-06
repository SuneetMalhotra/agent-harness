// mobile/types.ts — type extensions for the mobile feasibility study.
//
// Adds mobile modality support while keeping the core types.ts schema
// backward-compatible. Existing web HealingEvent / AssertionEvent shapes
// are unchanged; mobile events are a strict superset (added fields are
// optional).

import { HealingEvent } from '../types.js';

/**
 * Target modality of a test execution. Web/mobile have been exercised
 * empirically; hardware-in-the-loop is an architectural extension that
 * has not been evaluated.
 */
export type TargetModality = 'web' | 'mobile' | 'hardware';

/**
 * Mobile locator strategies used by the §6.x mobile feasibility study.
 * These mirror the Appium WebDriverIO locator vocabulary.
 *
 *   - accessibilityId : preferred Appium primary strategy; matches
 *                       content-desc on Android, accessibilityLabel on iOS.
 *   - xpath           : secondary strategy when accessibilityId is missing.
 *   - uiautomator     : Android-specific UiAutomator2 expression.
 *   - id              : resource-id on Android, id on iOS.
 *   - text            : visible text match.
 *   - visionFallback  : the vision-LLM fallback (mirrors the web cascade tier).
 *   - unrecovered     : no strategy resolved; failure reported, not swallowed.
 */
export type MobileLocatorStrategy =
  | 'accessibilityId'
  | 'xpath'
  | 'uiautomator'
  | 'id'
  | 'text'
  | 'visionFallback'
  | 'unrecovered';

/**
 * A mobile test case definition. Carries the same testCaseId convention
 * as web cases so the observability substrate can reason about both
 * modalities through a single schema.
 */
export interface MobileTestCase {
  testCaseId: string;
  targetModality: 'mobile';
  /** Tier tag mirrors the existing TierName enum. */
  tier: 'tier1' | 'tier2' | 'tier3';
  /** Semantic description of the element the test interacts with. */
  semanticLocator: string;
  /** What the test expects to happen. */
  expectedBehavior: string;
  /** Which screen of the public sample app this case exercises. */
  screen: string;
  /**
   * The locator strategy that should resolve (or not) under the deterministic
   * replay. Mirrors the per-test outcome the manuscript will report.
   */
  expectedStrategy: MobileLocatorStrategy;
}

/**
 * A mobile-specific healing event. Extends HealingEvent by tagging modality
 * and locator strategy explicitly. Existing HealingEvent consumers continue
 * to work — modality defaults to 'web' for web-emitted events.
 */
export interface MobileHealingEvent extends HealingEvent {
  targetModality: 'mobile';
  strategy: MobileLocatorStrategy;
  /** The screen this event came from (e.g., 'login', 'products', 'cart'). */
  screen: string;
}

/**
 * Aggregate result of one mobile feasibility run. Written to
 * results-mobile.json AND merged into results.json.mobileStudy by the
 * mobile harness.
 *
 * Naming follows the constraint in the master prompt:
 * "feasibility," "dispatch," "event capture," "recovery on this corpus"
 * — NOT "production mobile accuracy."
 */
export interface MobileStudyResult {
  metadata: {
    runId: string;
    timestamp: string;
    targetApp: string;
    targetAppLicense: string;
    targetAppReference: string;
    mode: 'deterministic-replay' | 'live-appium';
    nodeVersion: string;
  };
  testCases: number;
  healingEvents: number;
  recovered: number;
  unrecovered: number;
  firstDispatchCorrect: number;
  perStrategyCount: Record<MobileLocatorStrategy, number>;
  perScreenCount: Record<string, number>;
  sameSchemaReused: true;
  events: MobileHealingEvent[];
  comparison: {
    web: { testCases: number; recovered: number; total: number };
    mobile: { testCases: number; recovered: number; total: number };
    hardware: { evaluated: false; reason: 'architectural extension; not evaluated in §6 or §6.x' };
    sameSchemaReused: true;
  };
}
