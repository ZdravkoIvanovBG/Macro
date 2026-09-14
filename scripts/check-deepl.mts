// Checks the pure parsing/mapping logic in src/lib/deepl.ts. No network
// calls — the live API is free-tier and rate-limited, so it's never worth
// spending it just to confirm response parsing.
// Run with: npm run check:deepl
import { __testing } from '../src/lib/deepl.ts';

const { extractTranslatedText, extractTranslatedTexts, postProcessTranslatedText, deeplTargetLang, isDeeplConfigured } =
  __testing;

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// --- post-processing ---------------------------------------------------------
check('capitalizes the first letter', postProcessTranslatedText('skimmed milk') === 'Skimmed milk.');
check('adds a period when missing', postProcessTranslatedText('Palm oil') === 'Palm oil.');
check('leaves existing terminal punctuation alone', postProcessTranslatedText('Is this milk?') === 'Is this milk?');
check('does not double up punctuation', postProcessTranslatedText('Skimmed milk.') === 'Skimmed milk.');
check('trims surrounding whitespace', postProcessTranslatedText('  milk  ') === 'Milk.');
check('blank input stays blank', postProcessTranslatedText('   ') === '');

// --- response parsing ---------------------------------------------------------
check(
  'translated text extracted and post-processed',
  extractTranslatedText({ translations: [{ detected_source_language: 'DE', text: 'Skimmed milk' }] }) ===
    'Skimmed milk.'
);
check(
  'only the first translation is used',
  extractTranslatedText({ translations: [{ text: 'A' }, { text: 'B' }] }) === 'A.'
);
check('empty translations array yields null', extractTranslatedText({ translations: [] }) === null);
check('missing translations field yields null', extractTranslatedText({}) === null);
check('non-object payload yields null', extractTranslatedText('oops') === null);
check('null payload yields null', extractTranslatedText(null) === null);
check('blank translated text yields null', extractTranslatedText({ translations: [{ text: '   ' }] }) === null);
check(
  'non-string text field yields null',
  extractTranslatedText({ translations: [{ text: 42 }] }) === null
);

// --- batch parsing --------------------------------------------------------------
const batch = extractTranslatedTexts(
  { translations: [{ text: 'sugar' }, { text: 'palm oil' }, { text: 42 }] },
  3
);
check('batch preserves order', batch[0] === 'Sugar.' && batch[1] === 'Palm oil.');
check('batch entry with bad data becomes null without breaking the rest', batch[2] === null);
check(
  'batch pads with null when the response has fewer entries than requested',
  extractTranslatedTexts({ translations: [{ text: 'sugar' }] }, 3).length === 3 &&
    extractTranslatedTexts({ translations: [{ text: 'sugar' }] }, 3)[1] === null
);

// --- language mapping ---------------------------------------------------------
check('bg maps to DeepL BG', deeplTargetLang('bg') === 'BG');
check('en maps to a DeepL English variant', deeplTargetLang('en') === 'EN-US');

// --- configuration --------------------------------------------------------------
check(
  'isDeeplConfigured reflects whether the env var is set (unset in this offline run)',
  isDeeplConfigured() === Boolean(process.env.EXPO_PUBLIC_DEEPL_API_KEY?.trim())
);

console.log(failures === 0 ? '\nALL DEEPL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
