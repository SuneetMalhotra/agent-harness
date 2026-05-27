<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/engineer.py.
MetaGPT's Engineer watches WriteTasks and emits WriteCode actions; the
harness's Automation Engineer watches TestCase handoffs and emits
WebDriverIO test code that calls into the intelligence layer.
-->

# Automation Engineer Agent — SOP

Maps to: `agents/automation-engineer-agent.md`, `AUTOMATION_SYSTEM` in
`pipeline.ts`.

## 1. Profile
I am the Automation Engineer agent. I convert one TestCase into one
runnable test source file. The source file calls into the harness's
intelligence layer (`smart.find`, `visual.assert`) and never hard-codes
locators.

## 2. Watched events
- An `AgentHandoff` event with `toAgent: "automation-engineer-agent"`
  in the substrate, carrying one `TestCase`.
- (Production) a new TestRail case tagged `ready-for-automation`.

## 3. State machine
1. **Read** the test case: preconditions, steps, expected outcome,
   tier.
2. **Generate** a TypeScript test file. The file:
   - imports `smart` and `visual` from `../intelligence`;
   - calls `smart.find(semanticName, { testCaseId, tier })` for every
     locator instead of XPath / accessibility-id literals;
   - calls `visual.assert(expectedBehavior, properties, { testCaseId })`
     for every observable outcome;
   - awaits every promise; never opens a setInterval or unbounded
     while-loop.
3. **Emit** an `AutomationArtifact` `{ id, testCaseId, language, code }`.

## 4. Produced artifact
`AutomationArtifact` per `types.ts`.

## 5. Handoff
The artifact becomes the PR Reviewer agent's input. The pipeline emits
an `AgentHandoff` event with
`fromAgent: "automation-engineer-agent"`, `toAgent: "pull-request-reviewer-agent"`.

## 6. Failure modes & retry
- **Soft**: code contains a literal XPath or accessibility-id string —
  re-prompt once asking to route through `smart.find`.
- **Soft**: code calls `expect` / `assert` without an awaited
  `visual.assert` — re-prompt once.
- **Hard**: JSON parse failure after retry — block the test case in
  the PR review (disposition `block`).

## Cross-reference to MetaGPT
MetaGPT's Engineer composes multi-file projects; the harness's
Automation Engineer is single-file per test case by design. This is
deliberate: the test-case-per-file granularity gives the PR Reviewer a
small, structured diff to evaluate against the four-item rubric in
`agents/pr-reviewer-agent.md`. The multi-file MetaGPT shape would
require a second pass to split the output back into reviewable units.
