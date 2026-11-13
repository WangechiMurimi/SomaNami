/**
 * Starting points from the design's "ways of understanding". Each fills the
 * question box with a prompt the user can edit before sending; they stand in
 * for the explanation levels and formats of US-04 and US-05 until those land.
 */
export const WAYS_IN = [
  {
    title: 'Talk it through',
    prompt: 'Talk me through the main ideas here, one step at a time.',
  },
  {
    title: 'Find your explanation',
    prompt: 'Explain the key idea simply, with an everyday analogy.',
  },
  {
    title: 'See another perspective',
    prompt: 'Compare the main ideas here and summarise how they connect.',
  },
] as const
