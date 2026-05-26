// pipeline.ts — the multi-agent SDLC pipeline runner.
//
// Orchestrates the five-agent pipeline described in §4. Each agent step is a
// call to the model provider with that agent's system prompt; the output of
// one step is the input to the next. Inter-agent provenance is emitted to
// the observability substrate at every handoff.
//
// In a production deployment each agent's tool calls would flow through MCP
// servers (Confluence MCP, Jira MCP, TestRail MCP, GitHub MCP). The reference
// implementation stubs the MCP layer and treats the agents as text-in/text-out
// functions. The pipeline contract is the same in either case.
//

import { ModelProvider } from './providers/types.js';
import { Observability } from './observability.js';
import {
  AutomationArtifact,
  DesignArtifact,
  PRD,
  PullRequestReview,
  TestCase,
} from './types.js';

// ---------------------------------------------------------------------------
// Agent system prompts (terse versions; the full prompts live in agents/*.md)
// ---------------------------------------------------------------------------

const PM_SYSTEM = `You are the Product Manager agent. Read a design artifact and emit a Product Requirements Document as JSON with fields { id, designId, title, body, acceptanceCriteria }. Output JSON only.`;
const QA_SYSTEM = `You are the QA Engineer agent. Read a PRD and emit a JSON object { testCases: TestCase[] } with each TestCase having fields { id, prdId, title, preconditions, steps, expected, tier, category }. Tag each test case with a tier in {tier1, tier2, tier3} based on hardware needs. Output JSON only.`;
const AUTOMATION_SYSTEM = `You are the Automation Engineer agent. Read a single TestCase and emit a JSON AutomationArtifact { id, testCaseId, language, code }. Output JSON only.`;
const PR_REVIEWER_SYSTEM = `You are the Pull Request Reviewer agent. Read an automation artifact and emit a JSON review { artifactId, disposition, rationale, lineComments }. Disposition is one of approve, request-changes, block. Output JSON only.`;

export interface PipelineResult {
  designArtifact: DesignArtifact;
  prd: PRD;
  testCases: TestCase[];
  automationArtifacts: AutomationArtifact[];
  reviews: PullRequestReview[];
  durationMs: number;
}

export async function runPipeline(
  provider: ModelProvider,
  design: DesignArtifact,
  obs: Observability,
): Promise<PipelineResult> {
  const t0 = Date.now();

  // Step 1: PM agent
  const prdRaw = await provider.generate({
    system: PM_SYSTEM,
    user: `Design artifact:\n${JSON.stringify(design, null, 2)}`,
    responseFormat: 'json',
    temperature: 0,
  });
  const prd = parsePRD(prdRaw);
  obs.append({
    layer: 'operating',
    kind: 'handoff',
    payload: {
      fromAgent: 'product-manager-agent',
      toAgent: 'qa-engineer-agent',
      modelVersion: provider.name,
      promptId: 'pm-v1',
      inputArtifactIds: [design.id],
      outputArtifactId: prd.id,
      timestamp: new Date().toISOString(),
    },
  });

  // Step 2: QA agent
  const tcRaw = await provider.generate({
    system: QA_SYSTEM,
    user: `PRD:\n${JSON.stringify(prd, null, 2)}`,
    responseFormat: 'json',
    temperature: 0,
  });
  const testCases = parseTestCases(tcRaw);
  obs.append({
    layer: 'operating',
    kind: 'handoff',
    payload: {
      fromAgent: 'qa-engineer-agent',
      toAgent: 'automation-engineer-agent',
      modelVersion: provider.name,
      promptId: 'qa-v1',
      inputArtifactIds: [prd.id],
      outputArtifactId: `testcases-${prd.id}`,
      timestamp: new Date().toISOString(),
    },
  });

  // Step 3: Automation Engineer agent — one call per test case
  const automationArtifacts: AutomationArtifact[] = [];
  const reviews: PullRequestReview[] = [];
  for (const tc of testCases) {
    const autRaw = await provider.generate({
      system: AUTOMATION_SYSTEM,
      user: `TestCase:\n${JSON.stringify(tc, null, 2)}\n\ntitle: "${tc.title}"`,
      responseFormat: 'json',
      temperature: 0,
    });
    const automation = parseAutomation(autRaw);
    automationArtifacts.push(automation);
    obs.append({
      layer: 'operating',
      kind: 'handoff',
      payload: {
        fromAgent: 'automation-engineer-agent',
        toAgent: 'pull-request-reviewer-agent',
        modelVersion: provider.name,
        promptId: 'aut-v1',
        inputArtifactIds: [tc.id],
        outputArtifactId: automation.id,
        timestamp: new Date().toISOString(),
      },
    });

    // Step 4: PR Reviewer agent
    const reviewRaw = await provider.generate({
      system: PR_REVIEWER_SYSTEM,
      user: `Automation artifact:\n${JSON.stringify(automation, null, 2)}`,
      responseFormat: 'json',
      temperature: 0,
    });
    const review = parseReview(reviewRaw);
    reviews.push(review);
    obs.append({
      layer: 'operating',
      kind: 'pipeline-step',
      payload: {
        agent: 'pull-request-reviewer-agent',
        durationMs: 0,
        outputArtifactId: review.artifactId,
      },
    });
  }

  return {
    designArtifact: design,
    prd,
    testCases,
    automationArtifacts,
    reviews,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Defensive parsers
// ---------------------------------------------------------------------------

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
}

function parsePRD(raw: string): PRD {
  const parsed = JSON.parse(stripFences(raw));
  return {
    id: String(parsed.id),
    designId: String(parsed.designId),
    title: String(parsed.title),
    body: String(parsed.body),
    acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
      ? parsed.acceptanceCriteria.map(String)
      : [],
  };
}

function parseTestCases(raw: string): TestCase[] {
  const parsed = JSON.parse(stripFences(raw));
  if (!parsed.testCases || !Array.isArray(parsed.testCases)) {
    throw new Error('QA agent response missing testCases[]');
  }
  return parsed.testCases.map((tc: any) => ({
    id: String(tc.id),
    prdId: String(tc.prdId),
    title: String(tc.title),
    preconditions: Array.isArray(tc.preconditions) ? tc.preconditions.map(String) : [],
    steps: Array.isArray(tc.steps) ? tc.steps.map(String) : [],
    expected: String(tc.expected),
    tier: (tc.tier === 'tier1' || tc.tier === 'tier3') ? tc.tier : 'tier2',
    category: tc.category ? String(tc.category) : undefined,
  }));
}

function parseAutomation(raw: string): AutomationArtifact {
  const parsed = JSON.parse(stripFences(raw));
  return {
    id: String(parsed.id),
    testCaseId: String(parsed.testCaseId),
    code: String(parsed.code),
    language: parsed.language === 'javascript' ? 'javascript' : 'typescript',
  };
}

function parseReview(raw: string): PullRequestReview {
  const parsed = JSON.parse(stripFences(raw));
  return {
    artifactId: String(parsed.artifactId),
    disposition:
      parsed.disposition === 'request-changes' || parsed.disposition === 'block'
        ? parsed.disposition
        : 'approve',
    rationale: String(parsed.rationale ?? ''),
    lineComments: Array.isArray(parsed.lineComments)
      ? parsed.lineComments.map((c: any) => ({
          line: Number(c.line ?? 0),
          comment: String(c.comment ?? ''),
        }))
      : [],
  };
}
