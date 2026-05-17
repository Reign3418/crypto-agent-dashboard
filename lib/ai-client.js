  /**
   * Production-grade Kimi K2.6 API client wrapper,
   *
   * Zero-dependency, native fetch only (Node 18+). ES module.
   * OpenAI-compatible chat completions with retry, timeout,
   * JSON mode, debug logging and structured error types.
   *
   * @example
   *   import createKimiClient from './ai-client.js';
   *   const kimi = createKimiClient({ apiKey: process.env.KIMI_API_KEY });
   *   const reply = await kimi.chat([{ role: 'user', content: 'Hello' }]);
   */

  // ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL    = 'kimi-k2-6';
const DEFAULT_TIMEOUT  = 60_000;      // 60 seconds
const DEFAULT_RETRIES  = 3;
const INITIAL_BACKOFF  = 1_000;       // 1 second

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Base error thrown by the Kimi client.
 */
export class KimiError extends Error {
  constructor(message, { status, code, response, cause } = {}) {
    super(message, { cause });
    this.name    = 'KimiError';
    this.status  = status  ?? null;
    this.code    = code    ?? null;
    this.response = response ?? null;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error (401 / 403).
 */
export class KimiAuthError extends KimiError {
  constructor(message, meta) {
    super(message, meta);
    this.name = 'KimiAuthError';
  }
}

/**
 * Rate-limit error (429).  Includes the `retryAfter` value
 * (in seconds) read from the `retry-after` response header.
 */
export class KimiRateLimitError extends KimiError {
  constructor(message, meta = {}) {
    super(message, meta);
    this.name       = 'KimiRateLimitError';
    this.retryAfter = meta.retryAfter ?? null;
  }
}

/**
 * Timeout / abort error.
 */
export class KimiTimeoutError extends KimiError {
  constructor(message, meta) {
    super(message, meta);
    this.name = 'KimiTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Debug logger
// ---------------------------------------------------------------------------

const isDebug = () => process.env.KIMI_DEBUG === '1';

function debug(label, data) {
  if (!isDebug()) return;
  const ts = new Date().toISOString();
  if (data !== undefined) {
    // Avoid printing huge payloads verbatim; summarise instead
    let summary;
    if (typeof data === 'string') {
      summary = data.length > 500 ? data.slice(0, 500) + ' …' : data;
    } else {
      try {
        summary = JSON.stringify(data, null, 2);
        if (summary.length > 800) summary = summary.slice(0, 800) + '\n  …';
      } catch {
        summary = String(data);
      }
    }
    // eslint-disable-next-line no-console
    console.error(`[KIMI ${ts}] [${label}] ${summary}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(`[KIMI ${ts}] [${label}]`);
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for `ms` milliseconds.  Returns a Promise.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract a JSON object from free-form text.
 *
 * Strategy:
 *   1. Try `JSON.parse(text)` directly.
 *   2. Look for a JSON code block: ```json ... ```
 *   3. Look for any code block: ``` ... ```
 *   4. Greedy match of the first top-level `{ … }` or `[ … ]`.
 *   5. Return `null` when nothing works.
 *
 * @param {string} text
 * @returns {object|null}
 */
export function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }

  // 2. Explicit ```json fence
  const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      /* continue */
    }
  }

  // 3. Generic ``` fence
  const genericBlockMatch = trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (genericBlockMatch) {
    try {
      return JSON.parse(genericBlockMatch[1].trim());
    } catch {
      /* continue */
    }
  }

  // 4. Greedy object / array match (find first `{` or `[`)
  const objMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[1]);
    } catch {
      /* continue */
    }
  }

  const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[1]);
    } catch {
      /* continue */
    }
  }

  return null;
}

/**
 * Build the exponential-backoff delay for a given retry attempt.
 * Adds a random jitter of up to 200 ms.
 */
function backoffDelay(attempt, initialMs = INITIAL_BACKOFF) {
  const jitter = Math.floor(Math.random() * 200);
  return initialMs * 2 ** attempt + jitter;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Kimi API client.
 *
 * @param {object}   [options]
 * @param {string}   [options.apiKey]     – Bearer token (falls back to KIMI_API_KEY env var)
 * @param {string}   [options.model]      – Model identifier (falls back to KIMI_MODEL, default kimi-k2-6)
 * @param {string}   [options.baseURL]    – API root (falls back to KIMI_BASE_URL)
 * @param {number}   [options.timeout]    – Per-request timeout in ms (falls back to KIMI_TIMEOUT_MS, default 60_000)
 * @param {number}   [options.maxRetries] – Max retries for transient errors (falls back to KIMI_MAX_RETRIES, default 3)
 *
 * @returns {object} Client with `.chat()`, `.chatJSON()` and `.getModel()`.
 */
export default function createKimiClient(options = {}) {
  // -- Resolve configuration ------------------------------------------------

  const apiKey = options.apiKey ?? process.env.KIMI_API_KEY;
  if (!apiKey) {
    throw new KimiAuthError(
      'Missing Kimi API key. Provide it via options.apiKey or the KIMI_API_KEY environment variable.',
      { code: 'MISSING_API_KEY' }
    );
  }

  const model      = options.model      ?? process.env.KIMI_MODEL      ?? DEFAULT_MODEL;
  const baseURL    = options.baseURL    ?? process.env.KIMI_BASE_URL   ?? DEFAULT_BASE_URL;
  const timeout    = options.timeout    ?? (Number(process.env.KIMI_TIMEOUT_MS) || DEFAULT_TIMEOUT);
  const maxRetries = options.maxRetries ?? (Number(process.env.KIMI_MAX_RETRIES) || DEFAULT_RETRIES);

  debug('init', {
    model, baseURL, timeout, maxRetries,
    apiKeyPrefix: apiKey.slice(0, 8) + '…',
  });

  // -- Shared helpers --------------------------------------------------------

  /**
   * Execute a single fetch request with AbortController timeout.
   *
   * @param {string} url
   * @param {object} body   – JSON-serialisable request body
   * @param {number} ms     – Abort timeout in ms
   */
  async function fetchWithTimeout(url, body, ms) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), ms);

    try {
      const response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse an HTTP error response body and throw the appropriate KimiError.
   */
  async function throwForStatus(response) {
    const status  = response.status;
    let   payload = null;
    let   text    = '';

    try {
      text    = await response.text();
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    const message = payload?.error?.message
      ?? payload?.error?.code
      ?? payload?.message
      ?? text?.slice(0, 300)
      ?? `HTTP ${status}`;

    const meta = {
      status,
      code: payload?.error?.code ?? null,
      response: payload ?? text,
    };

    if (status === 401 || status === 403) {
      throw new KimiAuthError(`Kimi auth error (${status}): ${message}`, meta);
    }

    if (status === 429) {
      const retryAfterRaw = response.headers.get('retry-after');
      const retryAfter    = retryAfterRaw ? parseInt(retryAfterRaw, 10) : null;
      throw new KimiRateLimitError(
        `Kimi rate limit (429): ${message}`,
        { ...meta, retryAfter }
      );
    }

    throw new KimiError(`Kimi API error (${status}): ${message}`, meta);
  }

  /**
   * Core request helper — handles retries, timeout and error classification.
   *
   * @param {string}   endpoint   – e.g. '/chat/completions'
   * @param {object}   body
   * @param {number}   [reqTimeout]  – Optional per-request override
   */
  async function request(endpoint, body, reqTimeout) {
    const url        = `${baseURL.replace(/\/+$/, '')}${endpoint}`;
    const effectiveTimeout = reqTimeout ?? timeout;

    debug('request', { url, body });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, body, effectiveTimeout);

        if (!response.ok) {
          await throwForStatus(response);
        }

        const data = await response.json();
        debug('response', data);
        return data;
      } catch (err) {
        const isAbort = err.name === 'AbortError'
          || (typeof err.message === 'string' && err.message.includes('aborted'));

        if (isAbort) {
          throw new KimiTimeoutError(
            `Request timed out after ${effectiveTimeout}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
            { cause: err }
          );
        }

        // Non-retryable errors — propagate immediately
        if (err instanceof KimiAuthError) throw err;

        // Rate-limit: retry if we have attempts left (with backoff or header delay)
        if (err instanceof KimiRateLimitError) {
          if (attempt >= maxRetries) throw err;
          const waitMs = err.retryAfter
            ? err.retryAfter * 1_000
            : backoffDelay(attempt);
          debug('retry', `Rate-limited, waiting ${waitMs}ms before attempt ${attempt + 2}`);
          await delay(waitMs);
          continue;
        }

        // 5xx / network errors — retry with exponential backoff
        const isRetryable = err instanceof KimiError && err.status >= 500;
        if (!isRetryable && attempt === 0 && !(err instanceof KimiError)) {
          // Non-KimiError on first attempt (likely network/DNS) — treat as retryable
          if (attempt >= maxRetries) throw err;
        } else if (!isRetryable) {
          throw err;
        }

        if (attempt >= maxRetries) {
          throw new KimiError(
            `Max retries (${maxRetries}) exceeded. Last error: ${err.message}`,
            { status: err.status ?? null, cause: err }
          );
        }

        const waitMs = backoffDelay(attempt);
        debug('retry', `Transient error (${err.status ?? 'N/A'}), waiting ${waitMs}ms before attempt ${attempt + 2}`);
        await delay(waitMs);
      }
    }

    // Unreachable — kept for safety
    throw new KimiError('Unexpected end of retry loop');
  }

  // -- Public API ------------------------------------------------------------

  return {
    /**
     * Send a chat completion request and return the assistant's text.
     *
     * @param {Array<{role:string,content:string}>} messages
     * @param {object} [options]
     * @param {number} [options.temperature] – 0–2
     * @param {number} [options.maxTokens]   – Max completion tokens
     * @param {number} [options.timeout]     – Per-request timeout override (ms)
     * @returns {Promise<string>} Assistant reply
     */
    async chat(messages, options = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new KimiError('chat() requires a non-empty array of messages', { code: 'INVALID_ARGUMENTS' });
      }

      const body = {
        model,
        messages,
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.maxTokens   !== undefined && { max_tokens:   options.maxTokens }),
      };

      const data = await request('/chat/completions', body, options.timeout);

      const choice  = data.choices?.[0];
      const content = choice?.message?.content;

      if (typeof content !== 'string') {
        throw new KimiError(
          'Unexpected response shape: missing choices[0].message.content',
          { response: data, code: 'UNEXPECTED_RESPONSE' }
        );
      }

      return content;
    },

    /**
     * Send a chat completion request with JSON mode and return the parsed object.
     *
     * @param {Array<{role:string,content:string}>} messages
     * @param {object} [options]
     * @param {number} [options.temperature]
     * @param {number} [options.maxTokens]
     * @param {number} [options.timeout]
     * @returns {Promise<object>} Parsed JSON object
     */
    async chatJSON(messages, options = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new KimiError('chatJSON() requires a non-empty array of messages', { code: 'INVALID_ARGUMENTS' });
      }

      const body = {
        model,
        messages,
        response_format: { type: 'json_object' },
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.maxTokens   !== undefined && { max_tokens:   options.maxTokens }),
      };

      const data    = await request('/chat/completions', body, options.timeout);
      const choice  = data.choices?.[0];
      const rawText = choice?.message?.content;

      if (typeof rawText !== 'string') {
        throw new KimiError(
          'Unexpected response shape in JSON mode',
          { response: data, code: 'UNEXPECTED_RESPONSE' }
        );
      }

      debug('chatJSON raw', rawText);

      // Primary parse
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }

      // Fallback extraction via regex / fence extraction
      if (parsed === null) {
        parsed = extractJSON(rawText);
      }

      if (parsed === null) {
        throw new KimiError(
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
