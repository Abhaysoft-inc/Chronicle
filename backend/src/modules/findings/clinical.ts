import { normalizeIndic, toAsciiDigits } from '../../shared/indic/text.ts';

// Small, explicit clinical vocabularies for the rules. Deliberately conservative: a rule that
// does not understand an entry stays silent rather than guessing.
// THRESHOLDS ARE PLACEHOLDERS FOR A CLINICIAN TO CONFIRM (see IMPLEMENTATION_PLAN.md).

// ---------- drugs: brands and scripts to one generic name ----------

const DRUG_ALIASES: Record<string, string[]> = {
  ceftriaxone: ['ceftriaxone', 'सेफ्ट्रिएक्सोन', 'सेफ्ट्रियाक्सोन', 'monocef', 'मोनोसेफ', 'intacef', 'oframax'],
  'amoxicillin-clavulanate': ['augmentin', 'ऑगमेंटिन', 'amoxiclav', 'clavam', 'moxclav', 'amoxicillin clavulanate', 'co-amoxiclav'],
  amoxicillin: ['amoxicillin', 'amoxycillin', 'अमोक्सिसिलिन', 'mox', 'novamox'],
  ampicillin: ['ampicillin', 'एम्पीसिलिन'],
  'piperacillin-tazobactam': ['piperacillin', 'piptaz', 'pip-taz', 'tazact', 'zosyn'],
  penicillin: ['penicillin', 'पेनिसिलिन', 'benzathine', 'penidure'],
  cefixime: ['cefixime', 'taxim-o', 'zifi'],
  cefotaxime: ['cefotaxime', 'taxim'],
  cefuroxime: ['cefuroxime', 'ceftum'],
  metronidazole: ['metronidazole', 'मेट्रोनिडाज़ोल', 'metrogyl', 'flagyl'],
  paracetamol: ['paracetamol', 'पैरासिटामोल', 'पेरासिटामोल', 'pcm', 'dolo', 'crocin', 'calpol', 'acetaminophen'],
  diclofenac: ['diclofenac', 'डाइक्लोफेनाक', 'voveran', 'dynapar'],
  ibuprofen: ['ibuprofen', 'brufen', 'combiflam'],
  aspirin: ['aspirin', 'ecosprin', 'disprin'],
  tramadol: ['tramadol', 'ट्रामाडोल', 'ultracet', 'contramal'],
  pantoprazole: ['pantoprazole', 'pantop', 'pan 40', 'pan-40', 'pan d'],
  ondansetron: ['ondansetron', 'emeset', 'zofran', 'ondem'],
  cotrimoxazole: ['cotrimoxazole', 'co-trimoxazole', 'bactrim', 'septran'],
  heparin: ['heparin', 'हेपरिन'],
  insulin: ['insulin', 'इंसुलिन', 'actrapid', 'human mixtard'],
  'normal saline': ['normal saline', 'ns ', '0.9% nacl', 'sodium chloride'],
  'ringer lactate': ['ringer lactate', 'ringer\'s lactate', 'rl '],
};

/** Allergy classes and the generic drugs in each. */
export const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'amoxicillin-clavulanate', 'ampicillin', 'piperacillin-tazobactam'],
  // Cephalosporins carry a small cross-reaction risk with penicillin allergy; listed as their own class.
  cephalosporin: ['ceftriaxone', 'cefixime', 'cefotaxime', 'cefuroxime'],
  nsaid: ['diclofenac', 'ibuprofen', 'aspirin'],
  sulfa: ['cotrimoxazole'],
};
const CLASS_WORDS: Record<string, string[]> = {
  penicillin: ['penicillin', 'पेनिसिलिन'],
  cephalosporin: ['cephalosporin', 'सेफालोस्पोरिन'],
  nsaid: ['nsaid', 'painkiller allergy'],
  sulfa: ['sulfa', 'sulpha', 'sulphonamide', 'sulfonamide'],
};

const norm = (s: string) => normalizeIndic(toAsciiDigits(s));

/** The generic name a drug mention refers to, or null if it is not one we know. */
export function canonicalDrug(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = ` ${norm(text)} `;
  let best: { name: string; len: number } | null = null;
  for (const [generic, aliases] of Object.entries(DRUG_ALIASES)) {
    for (const a of aliases) {
      if (t.includes(norm(a)) && (!best || a.length > best.len)) best = { name: generic, len: a.length };
    }
  }
  return best?.name ?? null;
}

/** Allergy classes named in a text ("allergic to penicillin", "पेनिसिलिन से एलर्जी"), unless negated. */
export function allergiesIn(text: string): string[] {
  const t = norm(text);
  if (!/allerg|एलर्जी|hypersensitiv/.test(t)) return [];
  if (/\bnkda\b|no known (drug )?allerg|nil known|no allerg|कोई (ज्ञात )?एलर्जी नहीं/.test(t)) return [];
  const out = new Set<string>();
  for (const [cls, words] of Object.entries(CLASS_WORDS)) if (words.some((w) => t.includes(norm(w)))) out.add(cls);
  // "allergic to Augmentin" names a drug, not a class: map it to its class.
  const drug = canonicalDrug(t);
  if (drug) for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) if (members.includes(drug)) out.add(cls);
  return [...out];
}

/** A dose in milligrams ("1 g", "1000 mg", "५०० मि.ग्रा.") or null. Also returns ml/IU as-is with the unit. */
export function parseDose(text: string | null | undefined): { value: number; unit: 'mg' | 'ml' | 'iu' } | null {
  if (!text) return null;
  const t = norm(text).replace(/मि\.?\s*ग्रा\.?|मिलीग्राम/g, 'mg').replace(/ग्राम/g, 'g').replace(/मि\.?\s*ली\.?/g, 'ml');
  const m = /(\d+(?:\.\d+)?)\s*(mcg|µg|mg|gm|g|ml|iu|units?)\b/.exec(t);
  if (!m) return null;
  const v = Number(m[1]);
  switch (m[2]) {
    case 'g': case 'gm': return { value: v * 1000, unit: 'mg' };
    case 'mcg': case 'µg': return { value: v / 1000, unit: 'mg' };
    case 'mg': return { value: v, unit: 'mg' };
    case 'ml': return { value: v, unit: 'ml' };
    default: return { value: v, unit: 'iu' };
  }
}

// ---------- vital signs ----------

export interface Vitals { hr?: number; sbp?: number; dbp?: number; spo2?: number; tempC?: number; rr?: number }

/** Read vital signs from an event's details and text ("HR 128", "BP 86/50", "SpO2 89%", "Temp 101 F"). */
export function readVitals(text: string, details: Record<string, unknown> = {}): Vitals {
  const t = toAsciiDigits(`${text} ${Object.entries(details).map(([k, v]) => `${k} ${v}`).join(' ')}`).toLowerCase();
  const v: Vitals = {};
  const num = (re: RegExp) => { const m = re.exec(t); return m ? Number(m[1]) : undefined; };
  v.hr = num(/(?:\bhr\b|heart[ _]rate|pulse|नाड़ी|नब्ज|धड़कन)\s*[:=\-]?\s*(\d{2,3})/);
  const bp = /(?:\bbp\b|blood[ _]pressure|b\.p\.?|रक्तचाप)\s*[:=\-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/.exec(t);
  if (bp) { v.sbp = Number(bp[1]); v.dbp = Number(bp[2]); }
  v.spo2 = num(/(?:spo2|sp02|o2 sat|saturation|sat)\s*[:=\-]?\s*(\d{2,3})\s*%?/);
  v.rr = num(/(?:\brr\b|resp(?:iratory)?[ _]rate|resp)\s*[:=\-]?\s*(\d{1,2})/);
  const temp = /(?:temp(?:erature)?|t\b|तापमान|बुखार)\s*[:=\-]?\s*(\d{2,3}(?:\.\d)?)\s*°?\s*([cf])?/.exec(t);
  if (temp) {
    const x = Number(temp[1]);
    const f = temp[2] === 'f' || (!temp[2] && x > 45);
    v.tempC = f ? Math.round(((x - 32) * 5) / 9 * 10) / 10 : x;
  }
  // Discard impossible readings (usually an OCR slip or a different number nearby).
  if (v.hr !== undefined && (v.hr < 20 || v.hr > 250)) delete v.hr;
  if (v.sbp !== undefined && (v.sbp < 40 || v.sbp > 260)) { delete v.sbp; delete v.dbp; }
  if (v.spo2 !== undefined && (v.spo2 < 50 || v.spo2 > 100)) delete v.spo2;
  if (v.tempC !== undefined && (v.tempC < 30 || v.tempC > 44)) delete v.tempC;
  if (v.rr !== undefined && (v.rr < 4 || v.rr > 70)) delete v.rr;
  return v;
}

/** Which readings are outside the usual adult range, worded for a finding. Empty when all are fine. */
export function abnormalities(v: Vitals): { text: string; severe: boolean }[] {
  const out: { text: string; severe: boolean }[] = [];
  if (v.hr !== undefined && v.hr > 120) out.push({ text: `heart rate ${v.hr}/min`, severe: v.hr >= 140 });
  if (v.hr !== undefined && v.hr < 50) out.push({ text: `heart rate ${v.hr}/min`, severe: v.hr < 40 });
  if (v.sbp !== undefined && v.sbp < 90) out.push({ text: `BP ${v.sbp}/${v.dbp ?? '?'}`, severe: v.sbp < 80 });
  if (v.spo2 !== undefined && v.spo2 < 92) out.push({ text: `SpO2 ${v.spo2}%`, severe: v.spo2 < 88 });
  if (v.tempC !== undefined && v.tempC >= 38.3) out.push({ text: `temperature ${v.tempC}°C`, severe: v.tempC >= 39.5 });
  if (v.rr !== undefined && (v.rr > 24 || v.rr < 8)) out.push({ text: `respiratory rate ${v.rr}/min`, severe: v.rr > 30 || v.rr < 8 });
  return out;
}

/** Does a lab result say it is out of range ("High", "Low", "H", "↑", "raised", "elevated", "बढ़ा")? */
export function labIsAbnormal(text: string, details: Record<string, unknown> = {}): boolean {
  const t = `${text} ${Object.values(details).join(' ')}`.toLowerCase();
  return /\b(high|low|raised|elevated|decreased|abnormal|critical)\b|↑|↓|बढ़ा|कम|\(h\)|\(l\)|\b\d+(?:\.\d+)?\s*[hl]\b/.test(t);
}
