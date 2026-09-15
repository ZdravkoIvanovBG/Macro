/**
 * DeepL API Free client — used only as a last resort for the ingredient
 * scanner, when Open Food Facts has no name or text in the app language.
 * No SDK, no account beyond the free API key: a single POST per batch.
 *
 * The key is read from `EXPO_PUBLIC_DEEPL_API_KEY`, inlined at build time
 * from a local `.env` file (see `.env.example`) that is never committed.
 * There is no backend to keep it off the client, so it ends up in the app
 * bundle like any `EXPO_PUBLIC_` variable — acceptable for a personal app
 * calling a free-tier API, not for a distributed one.
 */
import type { AppLanguage } from '../i18n/index';

const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';
const REQUEST_TIMEOUT_MS = 12_000;

const API_KEY = process.env.EXPO_PUBLIC_DEEPL_API_KEY;

const TARGET_LANG: Record<AppLanguage, string> = {
  en: 'EN-US',
  bg: 'BG',
};

export function isDeeplConfigured(): boolean {
  return typeof API_KEY === 'string' && API_KEY.trim() !== '';
}

export function deeplTargetLang(lang: AppLanguage): string {
  return TARGET_LANG[lang];
}

/**
 * DeepL's raw output for short fragments is inconsistently capitalized/
 * punctuated (it's tuned for full sentences). Applied to every string this
 * module returns, so nothing downstream has to remember to do it.
 */
export function postProcessTranslatedText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return trimmed;
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** Pulls up to `expectedCount` translated strings out of a `/v2/translate` response, in request order. */
export function extractTranslatedTexts(payload: unknown, expectedCount: number): Array<string | null> {
  const translations =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>)['translations'] : null;
  const list = Array.isArray(translations) ? translations : [];

  return Array.from({ length: expectedCount }, (_, i) => {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') return null;
    const text = (entry as Record<string, unknown>)['text'];
    if (typeof text !== 'string' || text.trim() === '') return null;
    return postProcessTranslatedText(text);
  });
}

/** Pulls the first translated string out of a `/v2/translate` response body. */
export function extractTranslatedText(payload: unknown): string | null {
  return extractTranslatedTexts(payload, 1)[0] ?? null;
}

/** DeepL accepts at most 50 `text` params per request. */
const MAX_TEXTS_PER_REQUEST = 50;

/**
 * The `/v2/translate` request for one batch. DeepL only accepts the key in
 * the `Authorization` header — an `auth_key` body field is rejected with 403.
 * `context` steers short, ambiguous fragments (e.g. a single ingredient name)
 * and isn't billed as translated characters.
 */
export function buildTranslateRequest(
  texts: string[],
  targetLang: AppLanguage,
  apiKey: string,
  context?: string
): { headers: Record<string, string>; body: string } {
  const body = new URLSearchParams();
  body.append('target_lang', deeplTargetLang(targetLang));
  if (context) body.append('context', context);
  for (const text of texts) body.append('text', text);
  return {
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  };
}

async function translateBatch(
  texts: string[],
  targetLang: AppLanguage,
  context: string | undefined,
  signal?: AbortSignal
): Promise<Array<string | null>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const request = buildTranslateRequest(texts, targetLang, API_KEY as string, context);
    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    if (!response.ok) return texts.map(() => null);

    const data = (await response.json().catch(() => null)) as unknown;
    return extractTranslatedTexts(data, texts.length);
  } catch {
    return texts.map(() => null);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Machine-translates `texts` into `targetLang` (order preserved), in as few
 * DeepL requests as its per-request limit allows. Each entry resolves to
 * `null` on failure — no key configured, offline, timeout, quota exhausted,
 * malformed response, or that particular translation missing from the
 * response — so callers can fall back per-item.
 */
export async function translateTexts(
  texts: string[],
  targetLang: AppLanguage,
  signal?: AbortSignal,
  context?: string
): Promise<Array<string | null>> {
  if (texts.length === 0) return [];
  if (!isDeeplConfigured()) return texts.map(() => null);

  const results: Array<string | null> = [];
  for (let start = 0; start < texts.length; start += MAX_TEXTS_PER_REQUEST) {
    results.push(...(await translateBatch(texts.slice(start, start + MAX_TEXTS_PER_REQUEST), targetLang, context, signal)));
  }
  return results;
}

/** Machine-translates a single string. See `translateTexts` for the batched form. */
export async function translateIngredientsText(
  text: string,
  targetLang: AppLanguage,
  signal?: AbortSignal
): Promise<string | null> {
  const [result] = await translateTexts([text], targetLang, signal);
  return result ?? null;
}

export const __testing = {
  extractTranslatedText,
  extractTranslatedTexts,
  postProcessTranslatedText,
  deeplTargetLang,
  isDeeplConfigured,
  buildTranslateRequest,
};
