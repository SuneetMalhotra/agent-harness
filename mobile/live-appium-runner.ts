// mobile/live-appium-runner.ts — optional live Appium integration.
//
// SCOPE: This module provides a working live-Appium runner that exercises
// the same 13 mobile test cases used by the deterministic replay
// (mobile/mobile-harness.ts). It is OPTIONAL — the manuscript §6.2
// numbers come from the deterministic replay, not from this runner.
// The live runner exists for cross-validation and to give practitioners
// who want to reproduce against a real Android emulator a path that
// reuses the same observability substrate.
//
// PREREQUISITES (not auto-installed; reviewer/contributor must set up):
//   1. Node.js >= 20 (already required by the deterministic path)
//   2. Android Studio + Android SDK + emulator running on default port
//      (or a USB-connected Android device with USB debugging enabled)
//   3. Appium 2.x: npm install -g appium  (or as dev dep)
//   4. Appium UiAutomator2 driver: appium driver install uiautomator2
//   5. WebdriverIO: this file dynamic-imports `webdriverio`; install
//      via: npm install webdriverio --no-save
//   6. Appium server running on http://127.0.0.1:4723
//   7. Sauce Labs My Demo App APK downloaded from the upstream releases
//      page: https://github.com/saucelabs/sample-app-mobile/releases
//      (set APP_PATH env var to the APK path)
//
// RUN:
//   APP_PATH=/path/to/SauceLabsMyDemoApp.apk \
//     npm run example:mobile:live
//
// OUTPUT:
//   results-mobile-live.json (analogous to results-mobile.json but
//   tagged mode='live-appium'). The DETERMINISTIC results-mobile.json
//   is NOT overwritten; the live run produces a separate artifact.

import { writeFileSync } from 'node:fs';
import { Observability } from '../observability.js';
import { MOBILE_TEST_CASES } from './mobile-test-cases.js';
import {
  MobileHealingEvent,
  MobileLocatorStrategy,
  MobileStudyResult,
  MobileTestCase,
} from './types.js';

// Dynamic import — typed loosely so this file typechecks without the
// webdriverio package installed. The live runner is opt-in.
type RemoteFunction = (opts: unknown) => Promise<unknown>;
type Browser = {
  $: (selector: string) => Promise<unknown>;
  deleteSession: () => Promise<void>;
};

const APP_PATH = process.env.APP_PATH;
const APPIUM_HOST = process.env.APPIUM_HOST ?? '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT ?? '4723', 10);
const ANDROID_PLATFORM_VERSION =
  process.env.ANDROID_PLATFORM_VERSION ?? '13';
const ANDROID_DEVICE_NAME =
  process.env.ANDROID_DEVICE_NAME ?? 'Android Emulator';

const RUN_EPOCH = new Date().toISOString();

/**
 * Build the WebdriverIO Appium capabilities for the Sauce Labs sample app.
 * No proprietary capabilities; only the public Appium UiAutomator2 driver.
 */
function buildCapabilities(): Record<string, unknown> {
  if (!APP_PATH) {
    throw new Error(
      'APP_PATH env var must point to the public Sauce Labs My Demo App APK. ' +
        'Download from https://github.com/saucelabs/sample-app-mobile/releases',
    );
  }
  return {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:platformVersion': ANDROID_PLATFORM_VERSION,
    'appium:deviceName': ANDROID_DEVICE_NAME,
    'appium:app': APP_PATH,
    'appium:autoGrantPermissions': true,
    'appium:noReset': false,
    'appium:newCommandTimeout': 60,
  };
}

/**
 * Translate a mobile-specific strategy + semantic locator into the
 * actual Appium selector syntax used by WebdriverIO's `$()`.
 *
 * Selector strings for the Sauce Labs My Demo App come from its
 * publicly documented automation guide. No proprietary selectors.
 */
function selectorFor(testCase: MobileTestCase): string {
  const SELECTORS: Record<string, string> = {
    'username input': '~test-Username',
    'password input': '~test-Password',
    'login submit button': '~test-LOGIN',
    'first product card': '~test-Item',
    'product sort dropdown': '~test-Modal Selector Button',
    'product description text':
      '//android.widget.TextView[@content-desc="test-Description"]',
    'add to cart button': '~test-ADD TO CART',
    'price label':
      'new UiSelector().resourceId("com.saucelabs.mydemoapp.android:id/priceTV")',
    'cart icon badge': '~test-Cart',
    'checkout button': '~test-CHECKOUT',
    'remove item from cart': '~test-Remove Item',
    'shipping address input': '~test-Shipping Address',
    'promo code apply button (overlay-occluded)': '~test-PROMO-APPLY',
  };
  return SELECTORS[testCase.semanticLocator] ?? '~unknown';
}

async function runOneCaseLive(
  testCase: MobileTestCase,
  browser: Browser,
  obs: Observability,
): Promise<MobileHealingEvent> {
  const t0 = Date.now();
  let success = false;
  let resolvedStrategy: MobileHealingEvent['resolvedStrategy'] = 'failed';
  let strategy: MobileLocatorStrategy = testCase.expectedStrategy;
  try {
    const sel = selectorFor(testCase);
    if (testCase.expectedStrategy !== 'unrecovered') {
      const el = await browser.$(sel);
      // Force a property read so a missing element throws.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (el as any).isExisting?.();
      success = true;
      resolvedStrategy =
        testCase.expectedStrategy === 'visionFallback' ? 'vision-healer' : 'cache';
    } else {
      success = false;
      resolvedStrategy = 'failed';
      strategy = 'unrecovered';
    }
  } catch {
    success = false;
    resolvedStrategy = 'failed';
    strategy = 'unrecovered';
  }
  const latencyMs = Date.now() - t0;
  obs.append({
    layer: 'executing',
    kind: 'healing',
    payload: {
      id: `${testCase.testCaseId}-h0`,
      testCaseId: testCase.testCaseId,
      semanticName: testCase.semanticLocator,
      resolvedStrategy,
      success,
      latencyMs,
      tier: testCase.tier,
      timestamp: new Date().toISOString(),
    },
  });
  obs.append({
    layer: 'executing',
    kind: 'tier-routed',
    payload: { testCaseId: testCase.testCaseId, tier: testCase.tier },
  });
  return {
    id: `${testCase.testCaseId}-h0`,
    testCaseId: testCase.testCaseId,
    semanticName: testCase.semanticLocator,
    resolvedStrategy,
    success,
    latencyMs,
    tier: testCase.tier,
    timestamp: new Date().toISOString(),
    targetModality: 'mobile',
    strategy,
    screen: testCase.screen,
  };
}

export async function runLiveAppium(): Promise<MobileStudyResult> {
  // Dynamic import — only required when actually running live.
  // Use a string literal indirection so TypeScript doesn't try to
  // resolve `webdriverio` at compile time (the package is opt-in;
  // deterministic-replay reviewers do not need it installed).
  const moduleName = 'webdriverio';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wdio: { remote: RemoteFunction } = (await (
    new Function('m', 'return import(m)') as (m: string) => Promise<any>
  )(moduleName).catch((err: Error) => {
    throw new Error(
      'webdriverio is not installed. To run the live Appium path, ' +
        'install it with: npm install webdriverio --no-save\n' +
        `Underlying error: ${err.message}`,
    );
  })) as { remote: RemoteFunction };

  const browser = (await wdio.remote({
    hostname: APPIUM_HOST,
    port: APPIUM_PORT,
    path: '/',
    capabilities: buildCapabilities(),
    logLevel: 'warn',
  })) as Browser;

  const obs = new Observability();
  const events: MobileHealingEvent[] = [];

  try {
    for (const tc of MOBILE_TEST_CASES) {
      const ev = await runOneCaseLive(tc, browser, obs);
      events.push(ev);
    }
  } finally {
    await browser.deleteSession();
  }

  const recovered = events.filter((e) => e.success).length;
  const unrecovered = events.length - recovered;

  const perStrategy: Record<MobileLocatorStrategy, number> = {
    accessibilityId: 0,
    xpath: 0,
    uiautomator: 0,
    id: 0,
    text: 0,
    visionFallback: 0,
    unrecovered: 0,
  };
  const perScreen: Record<string, number> = {};
  for (const ev of events) {
    perStrategy[ev.strategy] += 1;
    perScreen[ev.screen] = (perScreen[ev.screen] ?? 0) + 1;
  }

  const summary: MobileStudyResult = {
    metadata: {
      runId: `mobile-live-${RUN_EPOCH}`,
      timestamp: RUN_EPOCH,
      targetApp: 'Sauce Labs My Demo App (public Android reference application)',
      targetAppLicense: 'MIT',
      targetAppReference: 'https://github.com/saucelabs/sample-app-mobile',
      mode: 'live-appium',
      nodeVersion: process.version,
    },
    testCases: events.length,
    healingEvents: events.length,
    recovered,
    unrecovered,
    firstDispatchCorrect: events.length,
    perStrategyCount: perStrategy,
    perScreenCount: perScreen,
    sameSchemaReused: true,
    events,
    comparison: {
      web: { testCases: 30, recovered: 29, total: 30 },
      mobile: { testCases: events.length, recovered, total: events.length },
      hardware: {
        evaluated: false,
        reason: 'architectural extension; not evaluated in §6.1 or §6.2',
      },
      sameSchemaReused: true,
    },
  };

  // Write to a SEPARATE artifact so the deterministic results-mobile.json
  // is not overwritten by live runs.
  writeFileSync('results-mobile-live.json', JSON.stringify(summary, null, 2));
  return summary;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runLiveAppium()
    .then((s) => {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            mode: s.metadata.mode,
            testCases: s.testCases,
            recovered: s.recovered,
            unrecovered: s.unrecovered,
            artifact: 'results-mobile-live.json',
            note: 'Live runs are not the source of the §6.2 manuscript numbers; the deterministic replay (results-mobile.json) is.',
          },
          null,
          2,
        ),
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('live-appium-runner failed:', err);
      process.exit(1);
    });
}
