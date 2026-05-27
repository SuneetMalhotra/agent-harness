// providers/stub.ts — deterministic stub provider for offline reproduction.
//
// The stub dispatches on system-prompt content. It returns the deterministic
// JSON shapes that each agent or service expects, drawn from canonical
// fixtures so that npm-installable reproduction does not require a network
// call or an OAuth session.
//

import { ModelProvider, GenerateOptions } from './types.js';

// ---------------------------------------------------------------------------
// PM agent: design → PRD
// ---------------------------------------------------------------------------

const PRD_RESPONSE = `{
  "id": "PRD-001",
  "designId": "todomvc-mobile-1",
  "title": "Mobile Task Manager v1",
  "body": "A small React Native task-management application based on the TodoMVC reference. Users can add tasks, mark tasks complete, filter by status, and clear completed tasks. All state persists across app restarts via local storage.",
  "acceptanceCriteria": [
    "Adding a task: typing text and tapping Add creates a new active task",
    "Completing a task: tapping the checkbox marks a task complete",
    "Filtering: tabs filter the list to All / Active / Completed",
    "Clearing: a Clear Completed action removes all completed tasks",
    "Persistence: tasks persist across app restart",
    "Empty state: an empty task input cannot be added",
    "BLE scenario: paired peripheral round-trip exercises Tier 1 hardware",
    "Cross-platform: rendering verified across iOS and Android via Tier 2"
  ]
}`;

// ---------------------------------------------------------------------------
// QA agent: PRD → 12 test cases (3 per tier-1, 6 per tier-2, 3 per tier-3)
// ---------------------------------------------------------------------------

const TEST_CASES_RESPONSE = `{
  "testCases": [
    { "id": "TC-01", "prdId": "PRD-001", "title": "Add a new task", "preconditions": ["app launched"], "steps": ["Tap input field", "Type 'buy milk'", "Tap Add"], "expected": "Task appears in Active list", "tier": "tier2", "category": "happy-path" },
    { "id": "TC-02", "prdId": "PRD-001", "title": "Complete a task", "preconditions": ["one active task exists"], "steps": ["Tap checkbox next to task"], "expected": "Task shown with strikethrough; moved to Completed filter", "tier": "tier2", "category": "happy-path" },
    { "id": "TC-03", "prdId": "PRD-001", "title": "Filter to Active", "preconditions": ["mix of active and completed tasks"], "steps": ["Tap Active filter tab"], "expected": "Only active tasks visible", "tier": "tier2", "category": "happy-path" },
    { "id": "TC-04", "prdId": "PRD-001", "title": "Filter to Completed", "preconditions": ["mix of active and completed tasks"], "steps": ["Tap Completed filter tab"], "expected": "Only completed tasks visible", "tier": "tier2", "category": "happy-path" },
    { "id": "TC-05", "prdId": "PRD-001", "title": "Clear completed tasks", "preconditions": ["at least one completed task"], "steps": ["Tap Clear Completed"], "expected": "All completed tasks removed", "tier": "tier2", "category": "happy-path" },
    { "id": "TC-06", "prdId": "PRD-001", "title": "Reject empty task", "preconditions": ["app launched"], "steps": ["Tap input", "Tap Add without typing"], "expected": "No task created; input remains focused", "tier": "tier2", "category": "edge-case" },
    { "id": "TC-07", "prdId": "PRD-001", "title": "Persistence across restart", "preconditions": ["3 tasks created"], "steps": ["Force quit app", "Relaunch"], "expected": "All 3 tasks present", "tier": "tier3", "category": "persistence" },
    { "id": "TC-08", "prdId": "PRD-001", "title": "Persistence under low-memory kill", "preconditions": ["3 tasks created"], "steps": ["Trigger OS low-memory kill", "Relaunch"], "expected": "All 3 tasks present", "tier": "tier3", "category": "persistence" },
    { "id": "TC-09", "prdId": "PRD-001", "title": "Cross-device sync via cloud", "preconditions": ["account signed in on two devices"], "steps": ["Create task on device A", "Wait 5s on device B"], "expected": "Task appears on device B", "tier": "tier3", "category": "end-to-end" },
    { "id": "TC-10", "prdId": "PRD-001", "title": "Paired BLE peripheral round-trip", "preconditions": ["BLE peripheral paired"], "steps": ["Trigger BLE action from app", "Read peripheral response"], "expected": "Round-trip completes within 2s", "tier": "tier1", "category": "ble" },
    { "id": "TC-11", "prdId": "PRD-001", "title": "Background BLE reconnect", "preconditions": ["BLE peripheral paired", "app in background"], "steps": ["Disconnect peripheral", "Wait 10s", "Reconnect"], "expected": "App resumes connection without restart", "tier": "tier1", "category": "ble" },
    { "id": "TC-12", "prdId": "PRD-001", "title": "Biometric unlock guards task edit", "preconditions": ["biometric enabled"], "steps": ["Tap edit on locked task", "Provide biometric"], "expected": "Edit form opens after successful biometric", "tier": "tier1", "category": "biometric" }
  ]
}`;

// ---------------------------------------------------------------------------
// Automation Engineer: test case → automation code
// ---------------------------------------------------------------------------

function automationCodeFor(testCaseId: string, title: string): string {
  return `{
  "id": "AUT-${testCaseId}",
  "testCaseId": "${testCaseId}",
  "language": "typescript",
  "code": "import { smart, visual } from '../intelligence';\\n\\ndescribe('${title.replace(/'/g, "\\'")}', () => {\\n  it('runs ${testCaseId}', async () => {\\n    const btn = await smart.find('primary action button on main screen');\\n    await btn.tap();\\n    await visual.assert('result screen shows confirmation', ['primary CTA visible', 'no error banner']);\\n  });\\n});"
}`;
}

// ---------------------------------------------------------------------------
// PR Reviewer: artifact → review
// ---------------------------------------------------------------------------

function reviewFor(artifactId: string): string {
  // Deterministic policy: TC-06 (edge case) gets request-changes;
  // everything else is approved.
  const isEdgeCase = artifactId.includes('TC-06');
  if (isEdgeCase) {
    return `{
  "artifactId": "${artifactId}",
  "disposition": "request-changes",
  "rationale": "The edge-case test lacks an explicit assertion that the input field retains focus after the rejected Add.",
  "lineComments": [
    { "line": 5, "comment": "Add an explicit await on input focus state before completing." }
  ]
}`;
  }
  return `{
  "artifactId": "${artifactId}",
  "disposition": "approve",
  "rationale": "Test case is well-scoped, preconditions are concrete, and the expected outcome is observable.",
  "lineComments": []
}`;
}

// ---------------------------------------------------------------------------
// Intelligence layer: locator-healing JSON responses
// ---------------------------------------------------------------------------

const DOM_HEALER_RESPONSE = `{
  "candidates": [
    { "strategy": "accessibility-id=primary-action", "confidence": 0.92, "justification": "Most stable selector observed in the DOM" },
    { "strategy": "xpath=//Button[@role='primary']", "confidence": 0.78, "justification": "Role-based fallback" }
  ]
}`;

const VISION_HEALER_RESPONSE = `{
  "candidates": [
    { "strategy": "accessibility-id=primary-action", "confidence": 0.81, "justification": "Visual position matches the screenshot region" }
  ]
}`;

// ---------------------------------------------------------------------------
// Visual assertion service
// ---------------------------------------------------------------------------

// Per-snapshot deterministic verdicts against the real seeded corpus.
//
// The corpus has 12 functional defects (vis-func-1..12) and 12 cosmetic
// variations (vis-cosm-1..12); each entry carries a distinct expected text
// and a distinct property checklist (see visual-corpus/seedings.ts).
//
// The stub LLM-judge operates on text + properties (not pixels). Its
// deterministic verdict policy reproduces a plausible LLM failure profile:
//
//  - It correctly FAILs 11 of 12 functional cases. It MISSes vis-func-12
//    (focus indicator removed); a text-only judge cannot directly observe
//    whether a focus ring is rendered, so it defaults to PASS.
//  - It correctly PASSes 11 of 12 cosmetic cases. It FALSELY FAILs vis-cosm-1
//    (font family swap to serif); a text-only judge over-reads "typography"
//    as a layout-affecting change.
//
// Resulting confusion matrix:
//   TP = 11, FN = 1, FP = 1, TN = 11
//   precision = 11 / 12 ≈ 0.9167
//   recall    = 11 / 12 ≈ 0.9167
//
// The numbers above are computed by Observability.visualAssertionMetrics()
// from these verdicts and the seeded labels on each AssertionEvent; the
// stub does not assert the metric values directly. A live `--provider`
// run produces real numbers from the cascade.
function assertionResponseFor(
  seededDefect: 'functional' | 'cosmetic' | 'none',
  testCaseId: string,
): string {
  // Deterministic miss: vis-func-12 (focus indicator removed; not text-observable).
  if (seededDefect === 'functional' && testCaseId === 'vis-func-12') {
    return `{ "verdict": "pass", "rationale": "Properties listed concern focus visibility, which cannot be determined from the text description alone; defaulting to pass." }`;
  }
  // Deterministic false-positive: vis-cosm-1 (font swap; over-read as layout change).
  if (seededDefect === 'cosmetic' && testCaseId === 'vis-cosm-1') {
    return `{ "verdict": "fail", "rationale": "Typography change implied; flagging as potentially layout-affecting under the cautious-defaults policy." }`;
  }
  if (seededDefect === 'functional') {
    return `{ "verdict": "fail", "rationale": "Listed property describes a concrete functional violation (visibility, contrast, occlusion, or interaction); flagged as a failure." }`;
  }
  if (seededDefect === 'cosmetic') {
    return `{ "verdict": "pass", "rationale": "Variation is consistent with cosmetic surface treatment; no functional property is violated by the description." }`;
  }
  return `{ "verdict": "pass", "rationale": "Screen matches expected behavior; no functional defects detected." }`;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export class StubProvider implements ModelProvider {
  name = 'stub';

  async generate(opts: GenerateOptions): Promise<string> {
    const sys = (opts.system ?? '').toLowerCase();
    const user = opts.user ?? '';

    // PM agent
    if (sys.includes('product manager agent')) {
      return PRD_RESPONSE;
    }

    // QA agent
    if (sys.includes('qa engineer agent')) {
      return TEST_CASES_RESPONSE;
    }

    // Automation Engineer agent
    if (sys.includes('automation engineer agent')) {
      const m = user.match(/TC-\d{2}/);
      const id = m ? m[0] : 'TC-XX';
      const titleMatch = user.match(/title:\s*"([^"]+)"/);
      const title = titleMatch ? titleMatch[1] : 'Generated test';
      return automationCodeFor(id, title);
    }

    // PR Reviewer agent
    if (sys.includes('pull request reviewer agent') || sys.includes('pr reviewer')) {
      const m = user.match(/AUT-TC-\d{2}/);
      const id = m ? m[0] : 'AUT-TC-XX';
      return reviewFor(id);
    }

    // Intelligence: DOM healer
    if (sys.includes('dom healer')) {
      return DOM_HEALER_RESPONSE;
    }

    // Intelligence: vision healer
    if (sys.includes('vision healer')) {
      return VISION_HEALER_RESPONSE;
    }

    // Intelligence: visual assertion
    if (sys.includes('visual assertion service')) {
      // The user prompt encodes the seeded defect type and the snapshot id.
      let seeded: 'functional' | 'cosmetic' | 'none' = 'none';
      if (user.includes('SEEDED:functional')) seeded = 'functional';
      else if (user.includes('SEEDED:cosmetic')) seeded = 'cosmetic';
      // The snapshot ID appears in the expected-behavior text; extract it.
      const idMatch = user.match(/vis-(?:func|cosm)-\d+/);
      const tcId = idMatch ? idMatch[0] : '';
      return assertionResponseFor(seeded, tcId);
    }

    // Fallback
    return `{ "ok": true, "note": "stub: no specific dispatch matched" }`;
  }
}
