// examples/run-example.ts — minimal end-to-end demo using the stub provider.
//
// Demonstrates the harness's three layers and the shared observability
// substrate. No API key required; runs deterministically offline.
//
// Run with:
//   npx tsx examples/run-example.ts
//

import { runPipeline } from '../pipeline.js';
import { TierRouter } from '../tier-router.js';
import { Intelligence } from '../intelligence.js';
import { Observability } from '../observability.js';
import { StubProvider } from '../providers/stub.js';
import { DesignArtifact } from '../types.js';

async function main(): Promise<void> {
  const provider = new StubProvider();
  const obs = new Observability();
  const intel = new Intelligence(provider, obs);
  const router = new TierRouter(obs);

  const design: DesignArtifact = {
    id: 'todomvc-mobile-1',
    name: 'TodoMVC Mobile (demo)',
    body: {
      summary: 'A small React Native task-management app for the offline demo.',
      reference: 'https://todomvc.com/',
    },
  };

  console.log('=== Operating layer: multi-agent pipeline ===');
  const pipelineResult = await runPipeline(provider, design, obs);
  console.log(`  PRD: ${pipelineResult.prd.title}`);
  console.log(`  Test cases generated: ${pipelineResult.testCases.length}`);
  console.log(`  Automation artifacts: ${pipelineResult.automationArtifacts.length}`);
  console.log(
    `  PR reviews: ${pipelineResult.reviews.filter((r) => r.disposition === 'approve').length} approved, ` +
      `${pipelineResult.reviews.filter((r) => r.disposition === 'request-changes').length} request-changes`,
  );

  console.log('\n=== Execution layer: route + run each test (cache-warm path) ===');
  // Warm the cache so the demo exercises the fast path.
  intel.warmCache(
    pipelineResult.testCases.map((tc) => ({
      semanticName: `primary action for ${tc.id}`,
      strategy: 'accessibility-id=demo-action',
    })),
  );
  for (const tc of pipelineResult.testCases) {
    const tier = router.route(tc);
    const result = await tier.run(tc, intel);
    console.log(`  ${tc.id} → ${tc.tier}: ${result.pass ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n=== Shared observability substrate ===');
  console.log(`  Total entries: ${obs.entries().length}`);
  console.log(`  Healing events: ${obs.healingEvents().length}`);
  console.log(`  Cache hit rate (no warmup discount): ${(obs.cacheHitRateAfterWarmup(0) * 100).toFixed(0)}%`);
  console.log(`  Combined recovery rate: ${(obs.combinedRecoveryRate() * 100).toFixed(0)}%`);

  console.log('\nDemo complete. For the full §6.1 evaluation, run:');
  console.log('  npx tsx harness.ts --provider stub        # offline');
  console.log('  npx tsx harness.ts --provider anthropic   # live via Claude OAuth');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
