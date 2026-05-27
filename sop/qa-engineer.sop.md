<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/qa_engineer.py.
MetaGPT's QaEngineer watches code-write events and emits test code via
WriteTest / DebugError actions. The harness's QA agent is upstream of
code generation: it watches PRDs and emits test *cases* (not test code);
the Automation Engineer agent downstream converts cases to code.
-->

# QA Engineer Agent — SOP

Maps to: `agents/qa-engineer-agent.md`, `QA_SYSTEM` in `pipeline.ts`.

## 1. Profile
I am the QA Engineer agent. I read a PRD and emit a structured set of
test cases, each tagged with its execution tier (tier1 physical bench /
tier2 cloud farm / tier3 virtual hardware).

## 2. Watched events
- An `AgentHandoff` event with `toAgent: "qa-engineer-agent"` deposited
  in the observability substrate.
- (Production) any new PRD page tagged `ready-for-test-design` in the
  test-management system.

## 3. State machine
1. **Read** the PRD body and acceptance criteria.
2. **Expand** each acceptance criterion into one or more concrete test
   cases: happy-path first, then edge-case, persistence, BLE,
   biometric, end-to-end, accessibility.
3. **Tag** each case with a tier:
   - `tier1` — requires real BLE peripherals, real cellular radio, real
     biometric sensors, or hardware state not reproducible on emulators.
   - `tier2` — requires cross-OS or cross-form-factor coverage.
   - `tier3` — end-to-end against ephemeral cloud-provisioned back-end
     peripheral emulators.
4. **Emit** 8–16 cases as JSON `{ testCases: TestCase[] }`.

## 4. Produced artifact
`TestCase[]` per `types.ts`. Each case has
`{ id, prdId, title, preconditions, steps, expected, tier, category }`.

## 5. Handoff
Each test case becomes one Automation Engineer agent invocation. The
pipeline emits one `AgentHandoff` event with
`fromAgent: "qa-engineer-agent"`, `toAgent: "automation-engineer-agent"`.

## 6. Failure modes & retry
- **Soft**: case count outside [8,16], tier values outside the enum,
  or expected outcome missing — re-prompt once with the validation
  failure echoed back.
- **Soft**: any case's `prdId` does not match the input PRD's `id` —
  reject and re-prompt.
- **Hard**: response is not JSON after one retry — abort the pipeline
  with the raw response surfaced in logs.

## Cross-reference to MetaGPT
MetaGPT's QA role sits *downstream* of code generation (WriteTest,
DebugError); the harness's QA role sits *upstream* of code generation,
because the test specification is the contract the Automation Engineer
fulfils. Both share the watched-event + emit-artifact shape; the
difference is the position in the chain. The harness's choice mirrors
the Shift-Left convention in mobile QA: the test specification is the
output of design, not a post-hoc check on code.
