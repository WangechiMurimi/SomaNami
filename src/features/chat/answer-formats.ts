/**
 * "Show another format" choices under the latest answer. Each asks a follow-up
 * in the same conversation, so the learner gets the same concept in a new form
 * without retyping the question (US-05 AC2). They are prompts, not a format
 * setting: the server has no format parameter yet. TODO(#40): replace with
 * a real format option when US-05 lands; "Visual" waits for answers that can
 * carry more than text.
 */
export const ANSWER_FORMATS = [
  {
    id: 'example',
    label: 'Example',
    prompt:
      'Show that again as a worked example, using only what my materials say.',
  },
  {
    id: 'summary',
    label: 'Summary',
    prompt: 'Summarise that as a few short bullet points.',
  },
] as const

export type AnswerFormat = (typeof ANSWER_FORMATS)[number]['id']
