// types.ts — public types for the Agent Harness reference implementation.
//
// This file is part of the companion code for the article
// "An Agent Harness for Mobile Test Automation: Coupling an Agent-Authored
// Framework, a Multi-Agent SDLC Pipeline, and a Three-Tier Execution Plane."

/**
 * The three execution-plane tiers.
 *  - tier1: physical device bench (real Android devices over USB)
 *  - tier2: cloud real-device farm (commercial cloud testing service)
 *  - tier3: ephemeral virtual hardware (cloud-provisioned back-end peripheral emulators)
 */
export type TierName = 'tier1' | 'tier2' | 'tier3';

/**
 * A design artifact handed to the PM agent at the start of the pipeline.
 * Intentionally minimal; production deployments would have a richer schema.
 */
export interface DesignArtifact {
  id: string;
  name: string;
  body: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * A product requirements document produced by the PM agent and consumed
 * by the QA agent.
 */
export interface PRD {
  id: string;
  designId: string;
  title: string;
  body: string;
  acceptanceCriteria: string[];
}

/**
 * A test case produced by the QA agent and consumed by the Automation
 * Engineer agent.
 */
export interface TestCase {
  id: string;
  prdId: string;
  title: string;
  preconditions: string[];
  steps: string[];
  expected: string;
  tier: TierName;
  category?: string;
}

/**
 * Automation code produced by the Automation Engineer agent. The "code"
 * field is a string in the sketch implementation; production deployments
 * would emit WebDriverIO/Appium source files or page-object classes.
 */
export interface AutomationArtifact {
  id: string;
  testCaseId: string;
  code: string;
  language: 'typescript' | 'javascript';
}

/**
 * A pull request review produced by the PR Reviewer agent. The disposition
 * is the categorical gate; `lineComments` mirror inline PR feedback.
 */
export interface PullRequestReview {
  artifactId: string;
  disposition: 'approve' | 'request-changes' | 'block';
  rationale: string;
  lineComments: Array<{ line: number; comment: string }>;
}

/**
 * A handoff between two agents. Each handoff carries the inter-agent
 * provenance described in §4.3 of the article: the upstream agent identifier,
 * the model version, the prompt used, the input artifact identifiers, and
 * a timestamp.
 */
export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  modelVersion: string;
  promptId: string;
  inputArtifactIds: string[];
  outputArtifactId: string;
  timestamp: string;
}

/**
 * One locator resolution attempt. The harness emits one HealingEvent for
 * every smart.find() call. The shape lets the audit protocol distinguish
 * cache hits from DOM-healer invocations from vision-fallback invocations.
 */
export interface HealingEvent {
  id: string;
  testCaseId: string;
  semanticName: string;
  resolvedStrategy: 'cache' | 'fallback-hint' | 'dom-healer' | 'vision-healer' | 'failed';
  success: boolean;
  latencyMs: number;
  tier: TierName;
  timestamp: string;
}

/**
 * One visual-assertion verdict. The harness emits one AssertionEvent for
 * every visual.assert() call.
 */
export interface AssertionEvent {
  id: string;
  testCaseId: string;
  expectedBehavior: string;
  verdict: 'pass' | 'fail';
  /**
   * Whether the snapshot was seeded with a defect (for the §6.1
   * precision/recall evaluation). Production runs leave this `undefined`.
   */
  seededDefect?: 'functional' | 'cosmetic' | 'none';
  /**
   * Repo-relative path to the rendered screenshot for this case. Set by the
   * harness when iterating VISUAL_CORPUS; undefined for production runs that
   * do not carry a static image artifact.
   */
  imagePath?: string;
  rationale: string;
  /**
   * How the judge produced its verdict.
   *   - 'vision'   : live vision-capable LLM read the PNG via absolute path
   *   - 'text-only': LLM judged from `expectedBehavior` + properties text only
   *   - 'stub'     : deterministic in-process stub (no LLM call)
   */
  judgeModality?: 'vision' | 'text-only' | 'stub';
  timestamp: string;
}

/**
 * The unified observability entry. Every layer writes entries of this
 * shape to the shared substrate; the substrate is what makes the harness
 * a coupling rather than three independent systems (see §2 of the article).
 */
export interface ObservabilityEntry {
  layer: 'authoring' | 'operating' | 'executing';
  kind: 'handoff' | 'healing' | 'assertion' | 'commit' | 'tier-routed' | 'pipeline-step';
  payload:
    | AgentHandoff
    | HealingEvent
    | AssertionEvent
    | { sha: string; author: 'agent' | 'human' | 'agent-revised'; promptId?: string }
    | { testCaseId: string; tier: TierName }
    | { agent: string; durationMs: number; outputArtifactId: string };
  timestamp: string;
}

/**
 * The aggregate evaluation result that gets written to results.json at the
 * end of a harness run. Reproduces the §6.1 figures.
 */
export interface EvaluationResult {
  metadata: {
    runId: string;
    provider: string;
    modelVersion: string;
    timestamp: string;
    testCount: number;
  };
  authoringVelocity: {
    medianPromptToMergeMinutes: number;
    handAuthoredControlMinutes: number;
    speedup: number;
  };
  pipelineRuntime: {
    stubDurationSeconds: number;
    perRun: number[];
  };
  healing: {
    cacheHitRate: number;
    domHealerSuccessRate: number;
    visionFallbackSuccessRate: number;
    combinedRecoveryRate: number;
    events: HealingEvent[];
  };
  visualAssertion: {
    precision: number;
    recall: number;
    pixelComparisonPrecision: number;
    pixelComparisonRecall: number;
    events: AssertionEvent[];
  };
  tierRouting: {
    correctOnFirstInvocation: number;
    totalRouted: number;
  };
  observabilityLog: ObservabilityEntry[];
}
