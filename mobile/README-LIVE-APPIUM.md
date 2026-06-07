# Optional live-Appium mode for the mobile feasibility study

The deterministic replay (`npm run example:mobile`) is the source of the
§6.2 mobile feasibility numbers reported in the manuscript. The replay is
byte-stable, reviewer-reproducible, and requires no Appium server, Android
emulator, or LLM API key.

This document describes how a future contributor could wire the same 13
test cases up against a live Appium session for cross-validation. The live
path is **not** required to reproduce the manuscript numbers.

## Public target

The 13 test cases reference semantic locators that map 1:1 to elements in
the **Sauce Labs My Demo App** public Android reference application:

- Source: https://github.com/saucelabs/sample-app-mobile
- License: MIT
- Distribution: official public Android APK + iOS IPA linked from the
  upstream README.

No proprietary, employer-internal, or NDA-bound mobile applications are
used or referenced in this study.

## Prerequisites for live mode (TODO)

A future PR could implement a `LiveAppiumRunner` in `mobile/live-runner.ts`
that swaps the deterministic dispatch in `mobile/mobile-harness.ts` for
real Appium calls. Prerequisites would be:

- Android Studio + Android SDK + emulator OR a USB-connected Android
  device with USB debugging enabled
- Node.js >= 20 (already required by the deterministic path)
- `appium` (>=2.x) installed globally or as a dev dependency
- Appium UiAutomator2 driver: `appium driver install uiautomator2`
- Sauce Labs My Demo App APK downloaded from the upstream releases page
- An Appium server running on `localhost:4723`
- WebdriverIO `@wdio/cli` and Appium service installed

## Why deterministic mode is the source of the manuscript numbers

Live Appium runs vary by ~10-30% in latency depending on emulator warm-up
state, Android API level, and device load. The deterministic replay
eliminates that variance and lets the §6.2 numbers be cited as exact
counts (13 test cases, 12 recovered, 1 unrecovered) rather than as
distributional summaries.

Live mode would add cross-validation evidence (real Appium successfully
exercises the same semantic locators) but would not strengthen the
substrate-reuse claim, which is the actual §6.2 contribution.

## Scope discipline

The mobile feasibility study reports:
- Schema and substrate reuse on a public mobile target
- Deterministic dispatch and event capture
- The cascade reports unrecovered failures rather than swallowing them

The mobile feasibility study does NOT report:
- Production-scale mobile testing accuracy
- LLM-as-judge κ on mobile screens (not measured at the §6.2 scale)
- Hardware-in-the-loop evaluation (architectural extension only)
