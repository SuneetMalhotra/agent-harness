// mobile/sample-app.ts — public Android sample-app screen catalog.
//
// The deterministic mobile feasibility replay does NOT require a running
// Android emulator or a downloaded APK. Instead, the screens of a public
// reference app are encoded as TypeScript records that the mobile harness
// can dispatch against. This keeps the replay reviewer-reproducible on any
// machine in <5 seconds without an Android toolchain.
//
// Reference app: the Sauce Labs My Demo App, a widely-used public Android
// reference application for mobile testing tutorials.
//   - Reference: https://github.com/saucelabs/sample-app-mobile
//   - License: MIT
//   - Distribution: public Android APK + iOS IPA (linked from the repo
//     README; not bundled here)
//
// The selectors and screen structure encoded below mirror the actual
// publicly-documented accessibility IDs in the Sauce Labs sample. This
// allows a future live-Appium run to be wired up against the same semantic
// locator names without changing the test case definitions.

import { MobileLocatorStrategy } from './types.js';

/**
 * One element on a screen of the public sample app, with the locator
 * strategy that the deterministic harness should report as the resolver.
 */
export interface SampleAppElement {
  semanticLocator: string;
  screen: string;
  preferredStrategy: MobileLocatorStrategy;
  /**
   * If the preferred strategy is intentionally unavailable in the replay
   * (to exercise the cascade), this field names the strategy that should
   * resolve instead. Used to simulate the realistic case where
   * accessibilityId is missing on a screen and xpath / uiautomator /
   * vision-fallback take over.
   */
  fallbackStrategy?: MobileLocatorStrategy;
}

/**
 * The public sample app's screen catalog encoded for deterministic replay.
 * No proprietary, employer-specific, or internal-tool selectors are used.
 */
export const SAMPLE_APP_ELEMENTS: SampleAppElement[] = [
  // ---------------------------------------------------------------------
  // Login screen
  // ---------------------------------------------------------------------
  { semanticLocator: 'username input', screen: 'login', preferredStrategy: 'accessibilityId' },
  { semanticLocator: 'password input', screen: 'login', preferredStrategy: 'accessibilityId' },
  {
    semanticLocator: 'login submit button',
    screen: 'login',
    preferredStrategy: 'accessibilityId',
  },

  // ---------------------------------------------------------------------
  // Products list screen
  // ---------------------------------------------------------------------
  {
    semanticLocator: 'first product card',
    screen: 'products',
    preferredStrategy: 'accessibilityId',
  },
  {
    semanticLocator: 'product sort dropdown',
    screen: 'products',
    preferredStrategy: 'accessibilityId',
  },
  // This element has no accessibilityId in the real app → xpath fallback
  {
    semanticLocator: 'product description text',
    screen: 'products',
    preferredStrategy: 'xpath',
  },

  // ---------------------------------------------------------------------
  // Product detail screen
  // ---------------------------------------------------------------------
  {
    semanticLocator: 'add to cart button',
    screen: 'product-detail',
    preferredStrategy: 'accessibilityId',
  },
  // No accessibilityId; uiautomator2 fallback
  {
    semanticLocator: 'price label',
    screen: 'product-detail',
    preferredStrategy: 'uiautomator',
  },

  // ---------------------------------------------------------------------
  // Cart screen
  // ---------------------------------------------------------------------
  {
    semanticLocator: 'cart icon badge',
    screen: 'cart',
    preferredStrategy: 'accessibilityId',
  },
  {
    semanticLocator: 'checkout button',
    screen: 'cart',
    preferredStrategy: 'accessibilityId',
  },
  // Vision-fallback: an item-removal control with no stable selector
  {
    semanticLocator: 'remove item from cart',
    screen: 'cart',
    preferredStrategy: 'visionFallback',
  },

  // ---------------------------------------------------------------------
  // Checkout screen
  // ---------------------------------------------------------------------
  {
    semanticLocator: 'shipping address input',
    screen: 'checkout',
    preferredStrategy: 'accessibilityId',
  },
  // Unrecovered: simulates a real failure mode where a control is hidden
  // by an overlay and no strategy resolves. Demonstrates that the cascade
  // reports rather than swallows.
  {
    semanticLocator: 'promo code apply button (overlay-occluded)',
    screen: 'checkout',
    preferredStrategy: 'unrecovered',
  },
];
