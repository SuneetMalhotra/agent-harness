<!--
SOURCE INSPIRATION: ChatDev, CompanyConfig/Default/PhaseConfig.json
(CodeReviewComment + CodeReviewModification phases) and the chatdev1.0
Code Reviewer role in RoleConfig.json. ChatDev pairs a Reviewer with a
Programmer for 3 cycles of comment/modification; the harness simplifies
this to a one-shot categorical disposition (approve / request-changes /
block) with line comments. The cyclic refinement is left as an explicit
escalation path in §6.
-->

# Pull Request Reviewer Agent — SOP

Maps to: `agents/pr-reviewer-agent.md`, `PR_REVIEWER_SYSTEM` in
`pipeline.ts`.

## 1. Profile
I am the Pull Request Reviewer agent. I evaluate an automation artifact
against a four-item rubric and emit a categorical disposition.

## 2. Watched events
- An `AgentHandoff` event with
  `toAgent: "pull-request-reviewer-agent"` in the substrate.
- (Production) a new GitHub PR with the `automation` label.

## 3. State machine
For each of the four rubric items, decide pass/fail:
1. **Locator routing**: code uses `smart.find` rather than literal
   XPath or accessibility-id strings.
2. **Behavioural coverage**: code exercises the behaviour described in
   the TestCase's `expected`.
3. **Observable assertion**: code has an awaited `visual.assert` (or
   equivalent) whose verdict will flip if the behaviour breaks.
4. **Code hygiene**: no uncaught promises, no unbounded loops, no
   missing awaits.

Then:
- **all four pass** → `approve`
- **1–2 fail** → `request-changes` with line-level comments naming
  each failed item.
- **security or framework-misuse issue** → `block`.

## 4. Produced artifact
`PullRequestReview` `{ artifactId, disposition, rationale, lineComments }`.

## 5. Handoff
The review is the terminal artifact of the operating layer. In
production:
- `approve` → auto-merge.
- `request-changes` → loop back to the Automation Engineer agent
  (modelled on ChatDev's CodeReviewComment ↔ CodeReviewModification
  cycle; bounded to 3 iterations by default).
- `block` → escalate to a human reviewer.

The disposition is appended to the substrate as a `pipeline-step`
entry.

## 6. Failure modes & retry & cyclic refinement
- **Soft**: disposition value outside `{approve, request-changes, block}`
  — coerce to `approve` (default) and log a warning.
- **Cyclic refinement (ChatDev-style)**: on `request-changes`,
  re-invoke the Automation Engineer agent with the line comments as
  additional context. Cap at 3 cycles; on cycle 4, force `block`.
- **Hard**: rationale empty after retry — fail the run; do not silently
  approve.

## Cross-reference to ChatDev
ChatDev's `CodeReview` phase (PhaseConfig.json on the chatdev1.0
branch) runs 3 cycles of `CodeReviewComment` + `CodeReviewModification`.
The harness's default is one cycle (one review per artifact), with the
cyclic mode available as the escalation path in §6 above. The
single-cycle default matches the harness's empirical observation that
the marginal value of cycles 2 and 3 is low when the rubric is small
(4 items) and the artifact is small (one test case).
