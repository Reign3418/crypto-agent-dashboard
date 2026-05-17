/**
 * Production-grade Gemini 2.5 Flash AI client wrapper.
 *
 * Drop-in replacement for the previous Kimi client.
 * Maintains the same .chat() / .chatJSON() / .getModel() interface
 * so all agents (Tank, NULL, CIPHER, Scout, Rollup, etc.) work unchanged.
 *
 * Uses: @google/genai (already installed)
 * Model: gemini-2.5-flash (cheapest, fastest Google model with full reasoning)
 * Auth: GEMINI_AI_API_KEY environment variable
 *
 * @example
 *   import createAIClient from './ai-client.js';
 *   const ai = createAIClient();
 *   const reply = await ai.chat([{ role: 'user', content: 'Hello' }]);
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL   = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT = 60_000;   // 60 seconds
const DEFAULT_RETRIES = 3;
const INITIAL_BACKOFF = 1_000;    // 1 second

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AIError extends Error {
  constructor(message, { status, code, response, cause } = {}) {
    super(message, { cause });
    this.name     = 'AIError';
    this.status   = status   ?? null;
    this.code     = code     ?? null;
    this.response = response ?? null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class AIAuthError extends AIError {
  constructor(message, meta) { super(message, meta); this.name = 'AIAuthError'; }
}

export class AIRateLimitError extends AIError {
  constructor(message, meta = {}) {
    super(message, meta);
    this.name       = 'AIRateLimitError';
    this.retryAfter = meta.retryAfter ?? null;
  }
}

export class AITimeoutError extends AIError {
  constructor(message, meta) { super(message, meta); this.name = 'AITimeoutError'; }
}

// ---------------------------------------------------------------------------
// Keep old names exported for any code that catches KimiError etc.
// ---------------------------------------------------------------------------
export { AIError as KimiError, AIAuthError as KimiAuthError, AIRateLimitError as KimiRateLimitError, AITimeoutError as KimiTimeoutError };

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attempt, initialMs = INITIAL_BACKOFF) {
  return initialMs * 2 ** attempt + Math.floor(Math.random() * 200);
}

/**
 * Extract a JSON object from free-form text.
 * Tries direct parse → json fence → generic fence → greedy match.
 */
export function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();

  try { return JSON.parse(t); } catch { /* continue */ }

  const jFence = t.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jFence) { try { return JSON.parse(jFence[1].trim()); } catch { /* continue */ } }

  const gFence = t.match(/```\s*([\s\S]*?)\s*```/);
  if (gFence) { try { return JSON.parse(gFence[1].trim()); } catch { /* continue */ } }

  const obj = t.match(/(\{[\s\S]*\})/);
  if (obj) { try { return JSON.parse(obj[1]); } catch { /* continue */ } }

  const arr = t.match(/(\[[\s\S]*\])/);
  if (arr) { try { return JSON.parse(arr[1]); } catch { /* continue */ } }

  return null;
}

// ---------------------------------------------------------------------------
// Convert OpenAI-style messages to Gemini contents format
// ---------------------------------------------------------------------------
function toGeminiContents(messages) {
  // Filter out system messages — we'll prepend them to the first user message
  const systemParts = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  const nonSystem = messages.filter(m => m.role !== 'system');

  return nonSystem.map((m, idx) => {
    let text = m.content;
    // Prepend system prompt to the first user message
    if (idx === 0 && systemParts && m.role === 'user') {
      text = `${systemParts}\n\n${text}`;
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    };
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Gemini AI client.
 *
 * @param {object}  [options]
 * @param {string}  [options.apiKey]     – Falls back to GEMINI_AI_API_KEY env var
 * @param {string}  [options.model]      – Falls back to GEMINI_MODEL env var, default gemini-2.5-flash
 * @param {number}  [options.timeout]    – Per-request timeout in ms (default 60 000)
 * @param {number}  [options.maxRetries] – Max retries for transient errors (default 3)
 *
 * @returns {object} Client with .chat(), .chatJSON() and .getModel()
 */
export default function createAIClient(options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_AI_API_KEY;
  if (!apiKey) {
    throw new AIAuthError(
      'Missing Gemini API key. Provide it via options.apiKey or the GEMINI_AI_API_KEY environment variable.',
      { code: 'MISSING_API_KEY' }
    );
  }

  const model      = options.model      ?? process.env.GEMINI_MODEL      ?? DEFAULT_MODEL;
  const timeout    = options.timeout    ?? (Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT);
  const maxRetries = options.maxRetries ?? (Number(process.env.GEMINI_MAX_RETRIES) || DEFAULT_RETRIES);

  // Lazy-import @google/genai so this module stays pure ESM without top-level await issues
  async function getSDK() {
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({ apiKey });
  }

  // ---------------------------------------------------------------------------
  // Core request with retry + timeout
  // ---------------------------------------------------------------------------
  async function request(messages, extraConfig = {}) {
    const contents = toGeminiContents(messages);
    if (contents.length === 0) throw new AIError('No messages provided', { code: 'INVALID_ARGUMENTS' });

    const sdk = await getSDK();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await sdk.models.generateContent({
          model,
          contents,
          config: {
            temperature: extraConfig.temperature ?? 0.3,
            ...extraConfig,
            // Never pass abortSignal into config — SDK doesn't support it; we rely on the timer
          },
        });
        clearTimeout(timer);

        const text = response.text;
        if (typeof text !== 'string') {
          throw new AIError('Unexpected response shape: missing text', { code: 'UNEXPECTED_RESPONSE', response });
        }
        return text.trim();

      } catch (err) {
        clearTimeout(timer);

        const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
        if (isAbort) {
          throw new AITimeoutError(`Request timed out after ${timeout}ms (attempt ${attempt + 1}/${maxRetries + 1})`, { cause: err });
        }

        // Auth errors — never retry
        if (err.status === 401 || err.status === 403 || err.message?.includes('API_KEY')) {
          throw new AIAuthError(`Gemini auth error (${err.status ?? 'N/A'}): ${err.message}`, { status: err.status, cause: err });
        }

        // Rate limit (429)
        if (err.status === 429) {
          if (attempt >= maxRetries) throw new AIRateLimitError(`Gemini rate limit: ${err.message}`, { status: 429, cause: err });
          await delay(backoffDelay(attempt) * 2); // extra backoff for rate limits
          continue;
        }

        // 5xx / transient — retry with backoff
        if (attempt >= maxRetries) {
          throw new AIError(`Max retries (${maxRetries}) exceeded. Last error: ${err.message}`, { cause: err });
        }
        await delay(backoffDelay(attempt));
      }
    }

    throw new AIError('Unexpected end of retry loop');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    /**
     * Send a chat completion and return the assistant's text.
     *
     * @param {Array<{role:string, content:string}>} messages
     * @param {object} [opts]
     * @param {number} [opts.temperature]
     * @returns {Promise<string>}
     */
    async chat(messages, opts = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new AIError('chat() requires a non-empty array of messages', { code: 'INVALID_ARGUMENTS' });
      }
      return request(messages, { temperature: opts.temperature });
    },

    /**
     * Send a chat completion and return the parsed JSON object.
     *
     * @param {Array<{role:string, content:string}>} messages
     * @param {object} [opts]
     * @param {number} [opts.temperature]
     * @returns {Promise<object>}
     */
    async chatJSON(messages, opts = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new AIError('chatJSON() requires a non-empty array of messages', { code: 'INVALID_ARGUMENTS' });
      }

      const rawText = await request(messages, {
        temperature: opts.temperature ?? 0.2,
        responseMimeType: 'application/json',
      });

      let parsed = null;
      try { parsed = JSON.parse(rawText); } catch { parsed = null; }
      if (parsed === null) parsed = extractJSON(rawText);

      if (parsed === null) {
        throw new AIError(
          `Failed to parse JSON response. Raw text:\n${rawText.slice(0, 2_000)}`,
          { code: 'JSON_PARSE_ERROR' }
        );
      }
      return parsed;
    },

    /**
     * Return the model name currently in use.
     * @returns {string}
     */
    getModel() {
      return model;
    },
  };
}

// ---------------------------------------------------------------------------
// Backward-compat alias — all files import createKimiClient from './ai-client.js'
// ---------------------------------------------------------------------------
export { createAIClient as createKimiClient };
