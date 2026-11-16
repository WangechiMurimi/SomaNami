/** "1 chat", "3 chats": a number with the word that agrees with it. */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
