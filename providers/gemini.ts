// providers/gemini.ts — Google Gemini provider for cross-model replication
// of the §6 numbers via the Generative Language API.
//
// Stub implementation: the interface and command surface are wired up but the
// actual HTTPS call requires the operator to supply GOOGLE_API_KEY. The stub
// throws a clear error pointing at the missing configuration.

import { ModelProvider, GenerateOptions } from './types';

export interface GeminiProviderOptions {
  /** Model identifier. Recommended: 'gemini-2.5-pro', 'gemini-2.5-flash'. */
  model?: string;
  /** API key. Defaults to process.env.GOOGLE_API_KEY. */
  apiKey?: string;
  /** Subprocess timeout, milliseconds. Default 300_000. */
  timeoutMs?: number;
}

export class GeminiProvider implements ModelProvider {
  name = 'gemini';
  private readonly model: string;
  private readonly apiKey: string | undefined;

  constructor(opts: GeminiProviderOptions = {}) {
    this.model = opts.model ?? process.env.MODEL ?? 'gemini-2.5-pro';
    this.apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;
  }

  async generate(_opts: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'GOOGLE_API_KEY is not set. To enable the Gemini provider for cross-model replication: export GOOGLE_API_KEY=... then re-run: npx tsx harness.ts --provider gemini',
      );
    }
    // Production users replace this stub with a real HTTPS call:
    // POST https://generativelanguage.googleapis.com/v1/models/<model>:generateContent
    // with the system + user content. Return the candidate's text part.
    throw new Error(
      'GeminiProvider.generate is a stub. Implement the generateContent call and return the response text.',
    );
  }
}
