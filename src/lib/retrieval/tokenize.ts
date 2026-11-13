/**
 * Closed-class English words plus the question openers a natural-language query
 * always carries ("what is the role of X" must rank on X alone, not on "what").
 */
const STOPWORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
])

// Apostrophes are stripped rather than split on so "cell's" becomes "cells"
// instead of the meaningless fragment "s".
const APOSTROPHES = /['‘’ʼ]/g
const NON_WORD = /[^\p{L}\p{N}]+/u

/** True when `word` is an English stopword and so carries no retrieval signal. */
export function isStopword(word: string): boolean {
  return STOPWORDS.has(word)
}

/**
 * Lowercases text and splits it into meaningful terms, dropping punctuation,
 * stopwords, and single characters (which match far too much to rank on).
 */
export function tokenize(text: string | null | undefined): string[] {
  if (typeof text !== 'string' || text === '') return []
  return text
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .split(NON_WORD)
    .filter((term) => term.length > 1 && !STOPWORDS.has(term))
}

/** Counts how often each term occurs, as `Map<term, count>`. */
export function countTerms(terms: readonly string[]): Map<string, number> {
  const counts = new Map()
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
  return counts
}
