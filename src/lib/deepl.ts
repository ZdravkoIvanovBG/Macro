/**
 * DeepL API Free client — used only as a last resort for the ingredient
 * scanner, when Open Food Facts has no ingredient text in either app
 * language. No SDK, no account beyond the free API key: a single POST per
 * translation.
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

/**
 * Machine-translates `texts` into `targetLang`, one DeepL request for the
 * whole batch (order preserved). Each entry resolves to `null` on failure —
 * no key configured, offline, timeout, quota exhausted, malformed response,
 * or that particular translation missing from the response — so callers can
 * fall back per-item to whatever text is already available.
 */
export async function translateTexts(
  texts: string[],
  targetLang: AppLanguage,
  signal?: AbortSignal
): Promise<Array<string | null>> {
  if (texts.length === 0) return [];
  if (!isDeeplConfigured()) return texts.map(() => null);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const body = new URLSearchParams();
    body.append('auth_key', API_KEY as string);
    body.append('target_lang', deeplTargetLang(targetLang));
    for (const text of texts) body.append('text', text);

    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
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
};
