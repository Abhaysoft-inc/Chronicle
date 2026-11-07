// Language codes the backend accepts. Tier 1 is read AND analysed. Tier 2 is read but withheld
// from analysis for now (needs translate-first). Tier 3 is read only, for manual review.

export interface Language {
  code: string;
  name: string;
  tier: 1 | 2 | 3;
}

export const LANGUAGES: Language[] = [
  { code: 'hi-IN', name: 'Hindi', tier: 1 },
  { code: 'ta-IN', name: 'Tamil', tier: 1 },
  { code: 'te-IN', name: 'Telugu', tier: 1 },
  { code: 'bn-IN', name: 'Bengali', tier: 1 },
  { code: 'mr-IN', name: 'Marathi', tier: 1 },
  { code: 'gu-IN', name: 'Gujarati', tier: 1 },
  { code: 'kn-IN', name: 'Kannada', tier: 1 },
  { code: 'ml-IN', name: 'Malayalam', tier: 1 },
  { code: 'pa-IN', name: 'Punjabi', tier: 1 },
  { code: 'od-IN', name: 'Odia', tier: 1 },
  { code: 'en-IN', name: 'English', tier: 1 },
  { code: 'ur-IN', name: 'Urdu', tier: 2 },
  { code: 'as-IN', name: 'Assamese', tier: 2 },
  { code: 'ne-IN', name: 'Nepali', tier: 2 },
  { code: 'sa-IN', name: 'Sanskrit', tier: 2 },
  { code: 'sat-IN', name: 'Santhali', tier: 3 },
  { code: 'ks-IN', name: 'Kashmiri', tier: 3 },
];

export const languageName = (code: string | null | undefined): string =>
  !code ? 'Auto-detect' : (LANGUAGES.find((l) => l.code === code)?.name ?? code);
