import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toAsciiDigits, normalizeIndic, graphemes, scriptProfile, quoteMatches, digitRuns,
} from './text.ts';

test('native digits map to ASCII in every major script', () => {
  assert.equal(toAsciiDigits('१०'), '10');       // Devanagari
  assert.equal(toAsciiDigits('১২৩'), '123');     // Bengali
  assert.equal(toAsciiDigits('௧௨'), '12');       // Tamil
  assert.equal(toAsciiDigits('౫౦౦'), '500');     // Telugu
  assert.equal(toAsciiDigits('೧೦'), '10');       // Kannada
  assert.equal(toAsciiDigits('൨൫'), '25');       // Malayalam
  assert.equal(toAsciiDigits('૯૯'), '99');       // Gujarati
  assert.equal(toAsciiDigits('੭'), '7');         // Gurmukhi
  assert.equal(toAsciiDigits('୪୫'), '45');       // Odia
  assert.equal(toAsciiDigits('۱۲'), '12');       // Extended Arabic-Indic (Urdu)
  assert.equal(toAsciiDigits('BP 120/80'), 'BP 120/80');
});

test('digit runs are extracted whole', () => {
  assert.deepEqual(digitRuns('इंज. सेफ्ट्रिएक्सोन ५०० मि.ग्रा. at १०:३०'), ['500', '10', '30']);
});

test('normalisation removes joiners, folds nukta and collapses spaces', () => {
  assert.equal(normalizeIndic('  Inj.‍   CEFTRIAXONE  '), 'inj. ceftriaxone');
  // precomposed U+0958 (क़) and base + nukta must compare equal
  assert.equal(normalizeIndic('क़'), normalizeIndic('क़'));
  assert.equal(normalizeIndic('दिया॥'), normalizeIndic('दिया।'));
});

test('graphemes keep conjuncts and vowel signs together', () => {
  assert.equal(graphemes('सेफ्ट्रिएक्सोन').length < 'सेफ्ट्रिएक्सोन'.length, true);
  assert.deepEqual(graphemes('कि'), ['कि']);
});

test('script profile finds the dominant script in code-mixed text', () => {
  const p = scriptProfile('Inj. ceftriaxone 1 g IV दिया गया मरीज़ को');
  assert.equal(p.dominant, 'Latin'); // 22 Latin letters vs 13 Devanagari
  assert.equal(scriptProfile('मरीज़ को बुखार है').dominant, 'Devanagari');
  assert.equal(scriptProfile('12:30 / 80').dominant, null);
});

test('quote check: exact quote and native/ASCII digit equivalence pass', () => {
  const block = 'इंज. सेफ्ट्रिएक्सोन १ ग्राम IV दिया गया';
  assert.equal(quoteMatches('सेफ्ट्रिएक्सोन १ ग्राम', block).ok, true);
  assert.equal(quoteMatches('सेफ्ट्रिएक्सोन 1 ग्राम', block).ok, true); // 1 == १
});

test('quote check: a small OCR-style typo still passes', () => {
  const block = 'मरीज़ को तेज बुखार और कंपकंपी हो रही है';
  assert.equal(quoteMatches('मरीज को तेज बुखार और कंपकंपी हो रही है', block).ok, true);
});

test('quote check: numbers must match exactly (10 != 100, 500 != 50)', () => {
  const block = 'इंज. सेफ्ट्रिएक्सोन ५०० मि.ग्रा. दिया';
  const bad = quoteMatches('इंज. सेफ्ट्रिएक्सोन 50 मि.ग्रा. दिया', block);
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.reason, 'digit_mismatch');
  assert.equal(quoteMatches('HR 10', 'HR 100').ok, false);
  assert.equal(quoteMatches('HR 100', 'HR १००').ok, true);
});

test('quote check: a romanised rewrite of Indic evidence is rejected', () => {
  const block = 'मरीज़ को तेज बुखार और कंपकंपी हो रही है';
  const r = quoteMatches('mareez ko tez bukhar aur kampkampi ho rahi hai', block);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'script_mismatch');
});

test('quote check: invented text and empty quotes fail', () => {
  const block = 'मरीज़ को तेज बुखार है';
  assert.equal(quoteMatches('ऑपरेशन के बाद खून बहना बंद हुआ', block).ok, false);
  const e = quoteMatches('   ', block);
  assert.equal(!e.ok && e.reason, 'empty_quote');
});

test('quote check works for Tamil and Telugu text', () => {
  assert.equal(quoteMatches('நோயாளிக்கு காய்ச்சல் ௧௦௨', 'நோயாளிக்கு காய்ச்சல் 102 டிகிரி').ok, true);
  assert.equal(quoteMatches('రోగికి జ్వరం ఉంది', 'రోగికి జ్వరం ఉంది, ఛాతి నొప్పి లేదు').ok, true);
});
