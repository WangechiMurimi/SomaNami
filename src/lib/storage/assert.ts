// Types guard compile-time callers; these guard data that arrives untyped at
// runtime, where a missing id would otherwise corrupt an index lookup.
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new TypeError(message)
}
