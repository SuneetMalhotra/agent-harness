// tier-router.ts — routes test cases to one of three execution-tier stubs
// based on the `@tier` tag in the test specification.
//
// In a production deployment each Tier would be a real adapter (ADB-backed
// physical bench, an Appium-compatible cloud-farm client, a CDK-provisioned
// virtual hardware stack). The reference implementation stubs all three.
// The router's contract is the same in either case.
//
// MIT License.

import { Observability } from './observability.js';
import { Intelligence } from './intelligence.js';
import { TestCase, TierName } from './types.js';

interface TierRunner {
  name: TierName;
  run(test: TestCase, intel: Intelligence): Promise<{ pass: boolean; reason?: string }>;
}

class Tier1PhysicalBench implements TierRunner {
  name: TierName = 'tier1';
  async run(test: TestCase, intel: Intelligence): Promise<{ pass: boolean; reason?: string }> {
    // In production: ADB-driven WebDriverIO session against a real Android device.
    // Sketch: exercise the intelligence layer once and record a pass.
    const r = await intel.find(`primary action for ${test.id}`, {
      testCaseId: test.id,
      tier: 'tier1',
    });
    return { pass: r.success, reason: r.success ? undefined : 'locator unrecoverable' };
  }
}

class Tier2CloudFarm implements TierRunner {
  name: TierName = 'tier2';
  async run(test: TestCase, intel: Intelligence): Promise<{ pass: boolean; reason?: string }> {
    // In production: an Appium-compatible session against the commercial cloud farm.
    const r = await intel.find(`primary action for ${test.id}`, {
      testCaseId: test.id,
      tier: 'tier2',
    });
    return { pass: r.success, reason: r.success ? undefined : 'locator unrecoverable' };
  }
}

class Tier3VirtualHardware implements TierRunner {
  name: TierName = 'tier3';
  async run(test: TestCase, intel: Intelligence): Promise<{ pass: boolean; reason?: string }> {
    // In production: cloud-provisioned ephemeral peripheral emulator + a
    // session against the mobile device tier (tier1 or tier2).
    const r = await intel.find(`primary action for ${test.id}`, {
      testCaseId: test.id,
      tier: 'tier3',
    });
    return { pass: r.success, reason: r.success ? undefined : 'locator unrecoverable' };
  }
}

export class TierRouter {
  private readonly runners: Record<TierName, TierRunner> = {
    tier1: new Tier1PhysicalBench(),
    tier2: new Tier2CloudFarm(),
    tier3: new Tier3VirtualHardware(),
  };

  constructor(private obs: Observability) {}

  /**
   * Dispatch a test to its tagged tier. Returns the runner so the caller can
   * `await runner.run(test, intel)`. Emits a tier-routed observability entry.
   */
  route(test: TestCase): TierRunner {
    const runner = this.runners[test.tier];
    this.obs.append({
      layer: 'executing',
      kind: 'tier-routed',
      payload: { testCaseId: test.id, tier: test.tier },
    });
    return runner;
  }
}
