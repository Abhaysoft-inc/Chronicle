// Language support tiers (see IMPLEMENTATION_PLAN.md, "Language tiers").
//   Tier 1: OCR + direct LLM extraction (Mayura's 10 Indian languages).
//   Tier 2: OCR, then translate first (not built yet, so analysis is withheld).
//   Tier 3: OCR only, manual review (Sarvam's own benchmark scores ~54).
// ASSUMPTION: the sarvam-105b docs say "10 most-spoken Indian languages"
// without naming them; we assume they match this Tier 1 list. Phase 0 tests it.

export type Tier = 1 | 2 | 3;
export type ScriptName =
  | 'Devanagari' | 'Bengali' | 'Gurmukhi' | 'Gujarati' | 'Odia' | 'Tamil'
  | 'Telugu' | 'Kannada' | 'Malayalam' | 'Arabic' | 'OlChiki' | 'MeeteiMayek'
  | 'Latin';

interface LangInfo {
  name: string;
  tier: Tier;
  /** Scripts this language is normally written in. */
  scripts: ScriptName[];
}

export const LANGUAGES: Record<string, LangInfo> = {
  'hi-IN': { name: 'Hindi', tier: 1, scripts: ['Devanagari'] },
  'bn-IN': { name: 'Bengali', tier: 1, scripts: ['Bengali'] },
  'ta-IN': { name: 'Tamil', tier: 1, scripts: ['Tamil'] },
  'te-IN': { name: 'Telugu', tier: 1, scripts: ['Telugu'] },
  'gu-IN': { name: 'Gujarati', tier: 1, scripts: ['Gujarati'] },
  'kn-IN': { name: 'Kannada', tier: 1, scripts: ['Kannada'] },
  'ml-IN': { name: 'Malayalam', tier: 1, scripts: ['Malayalam'] },
  'mr-IN': { name: 'Marathi', tier: 1, scripts: ['Devanagari'] },
  'pa-IN': { name: 'Punjabi', tier: 1, scripts: ['Gurmukhi'] },
  'od-IN': { name: 'Odia', tier: 1, scripts: ['Odia'] },
  'en-IN': { name: 'English', tier: 1, scripts: ['Latin'] },

  'as-IN': { name: 'Assamese', tier: 2, scripts: ['Bengali'] },
  'ur-IN': { name: 'Urdu', tier: 2, scripts: ['Arabic'] },
  'ne-IN': { name: 'Nepali', tier: 2, scripts: ['Devanagari'] },
  'sa-IN': { name: 'Sanskrit', tier: 2, scripts: ['Devanagari'] },
  'mai-IN': { name: 'Maithili', tier: 2, scripts: ['Devanagari'] },
  'kok-IN': { name: 'Konkani', tier: 2, scripts: ['Devanagari'] },
  'doi-IN': { name: 'Dogri', tier: 2, scripts: ['Devanagari'] },
  'sd-IN': { name: 'Sindhi', tier: 2, scripts: ['Arabic', 'Devanagari'] },
  'brx-IN': { name: 'Bodo', tier: 2, scripts: ['Devanagari'] },
  'mni-IN': { name: 'Manipuri', tier: 2, scripts: ['MeeteiMayek', 'Bengali'] },

  'sat-IN': { name: 'Santhali', tier: 3, scripts: ['OlChiki', 'Devanagari'] },
  'ks-IN': { name: 'Kashmiri', tier: 3, scripts: ['Arabic', 'Devanagari'] },
};

export function isSupportedLanguage(code: string): boolean {
  return code in LANGUAGES;
}

export function tierOf(code: string | null | undefined): Tier | null {
  if (!code) return null;
  return LANGUAGES[code]?.tier ?? null;
}
