// dialogue/communicative-handoff.ts
//
// OPTIONAL alternative handoff mode for the operating-layer pipeline.
//
// SOURCE INSPIRATION: ChatDev (https://github.com/OpenBMB/ChatDev) — the
// chat-chain protocol defined in CompanyConfig/Default/PhaseConfig.json
// (chatdev1.0 branch). ChatDev pairs an assistant_role and a
// user_role for every phase and runs them through a two-turn dialogue
// per task: the user_role requests, the assistant_role responds. Each
// phase has a phase_prompt that constrains the dialogue, and many
// phases include reflection (a third "did we agree?" turn).
//
// This module wraps an AgentHandoff in a ChatDev-style two-turn (or
// optionally three-turn, with reflection) dialogue. It is an
// *alternative* to the default single-shot typed-event handoff in
// pipeline.ts — the default path remains unchanged and is still the
// canonical flow used by harness.ts. Use this module when the
// receiving agent needs to clarify before acting (e.g. the QA agent
// asks the PM agent to disambiguate an acceptance criterion that
// could be tested two different ways).
//
// The module is pure addition: nothing in the existing pipeline
// imports it. To wire it into a pipeline variant, replace a single
// provider.generate() call with runCommunicativeHandoff(...).

import { ModelProvider } from '../providers/types.js';
import { Observability } from '../observability.js';
import { AgentHandoff } from '../types.js';

/** A single turn of the two-or-three-turn handoff dialogue. */
export interface DialogueTurn {
  speaker: 'sender' | 'receiver';
  /** The system prompt the speaker was given for this turn. */
  system: string;
  /** The user-message payload the speaker received. */
  user: string;
  /** The speaker's response. */
  response: string;
}

export interface CommunicativeHandoffOptions {
  fromAgent: string;
  toAgent: string;
  /** Free-form description of the artifact being handed off. */
  artifactSummary: string;
  /** The receiver's system prompt — the same one it would normally get. */
  receiverSystem: string;
  /** The receiver's user message — the same one it would normally get. */
  receiverUser: string;
  /**
   * Whether to run a third "reflection" turn. Mirrors ChatDev's
   * phase-level reflection flag. Default false.
   */
  reflect?: boolean;
  /**
   * Soft limit on dialogue length, in turns. Default 3 (sender request,
   * receiver clarification, sender answer). Past the limit, the
   * receiver is forced to act on whatever it has.
   */
  maxTurns?: number;
}

export interface CommunicativeHandoffResult {
  /** The full dialogue transcript. */
  dialogue: DialogueTurn[];
  /** The receiver's final response — the artifact that downstream code consumes. */
  finalResponse: string;
  /** The AgentHandoff event emitted to the substrate. */
  handoffEvent: AgentHandoff;
  /**
   * Whether the receiver asked at least one clarification. Useful for
   * audit: a high clarification rate suggests the upstream prompt is
   * underspecified.
   */
  clarified: boolean;
}

const CLARIFY_DETECTOR_SYSTEM = `You are a dialogue classifier. Given an agent's response, decide whether it is a clarifying question or a substantive answer. Output JSON only: {"isClarification": boolean, "question": string | null}.`;

/**
 * Run a communicative handoff between two agents. Returns the transcript
 * and the receiver's final answer. Emits exactly one AgentHandoff event
 * to the substrate, with the dialogue transcript serialised into the
 * promptId field for audit traceability.
 */
export async function runCommunicativeHandoff(
  provider: ModelProvider,
  obs: Observability,
  opts: CommunicativeHandoffOptions,
): Promise<CommunicativeHandoffResult> {
  const maxTurns = opts.maxTurns ?? 3;
  const dialogue: DialogueTurn[] = [];

  // Turn 1: sender request (synthetic — built from the handoff metadata).
  const senderTurn: DialogueTurn = {
    speaker: 'sender',
    system: `You are ${opts.fromAgent}, handing off to ${opts.toAgent}.`,
    user: `Artifact: ${opts.artifactSummary}`,
    response: `Please process this artifact and produce your output. If anything is ambiguous, ask one clarifying question before acting.`,
  };
  dialogue.push(senderTurn);

  // Turn 2: receiver — either clarifies or acts.
  const receiverFirstResponse = await provider.generate({
    system: opts.receiverSystem,
    user: `${opts.receiverUser}\n\nSender note: ${senderTurn.response}`,
    responseFormat: 'text',
    temperature: 0,
  });
  dialogue.push({
    speaker: 'receiver',
    system: opts.receiverSystem,
    user: opts.receiverUser,
    response: receiverFirstResponse,
  });

  let clarified = false;
  let finalResponse = receiverFirstResponse;

  // Detect whether the receiver clarified. If so, give the sender one
  // chance to answer, then re-ask the receiver.
  if (dialogue.length < maxTurns) {
    const classification = await provider.generate({
      system: CLARIFY_DETECTOR_SYSTEM,
      user: receiverFirstResponse,
      responseFormat: 'json',
      temperature: 0,
    });
    const isClarification = parseIsClarification(classification);
    if (isClarification) {
      clarified = true;
      // Sender answer (synthetic — uses a generic "use the artifact as-is" stance).
      const senderAnswer = await provider.generate({
        system: `You are ${opts.fromAgent}. The receiver (${opts.toAgent}) asked a clarifying question. Answer concisely; if the artifact does not specify, say so and pick the most conservative default.`,
        user: `Original artifact: ${opts.artifactSummary}\n\nReceiver's question: ${receiverFirstResponse}`,
        responseFormat: 'text',
        temperature: 0,
      });
      dialogue.push({
        speaker: 'sender',
        system: `You are ${opts.fromAgent} answering a clarification.`,
        user: receiverFirstResponse,
        response: senderAnswer,
      });

      // Receiver final.
      finalResponse = await provider.generate({
        system: opts.receiverSystem,
        user: `${opts.receiverUser}\n\nClarification from ${opts.fromAgent}: ${senderAnswer}\n\nNow produce your output.`,
        responseFormat: 'text',
        temperature: 0,
      });
      dialogue.push({
        speaker: 'receiver',
        system: opts.receiverSystem,
        user: `${opts.receiverUser}\n\n+clarification`,
        response: finalResponse,
      });
    }
  }

  // Optional reflection turn (ChatDev style).
  if (opts.reflect && dialogue.length < maxTurns + 1) {
    const reflection = await provider.generate({
      system: `You are the receiver (${opts.toAgent}). Review the answer you just produced. If it correctly satisfies the sender's request, repeat it verbatim. Otherwise emit a revised version. Output the (possibly revised) artifact only.`,
      user: finalResponse,
      responseFormat: 'text',
      temperature: 0,
    });
    dialogue.push({
      speaker: 'receiver',
      system: 'reflection',
      user: finalResponse,
      response: reflection,
    });
    finalResponse = reflection;
  }

  const handoffEvent: AgentHandoff = {
    fromAgent: opts.fromAgent,
    toAgent: opts.toAgent,
    modelVersion: provider.name,
    promptId: `dialogue:turns=${dialogue.length}:clarified=${clarified}`,
    inputArtifactIds: [opts.artifactSummary.slice(0, 64)],
    outputArtifactId: `dlg-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  obs.append({ layer: 'operating', kind: 'handoff', payload: handoffEvent });

  return { dialogue, finalResponse, handoffEvent, clarified };
}

function parseIsClarification(raw: string): boolean {
  try {
    const trimmed = raw
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed.isClarification);
  } catch {
    return false;
  }
}
