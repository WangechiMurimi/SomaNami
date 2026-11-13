/**
 * Guards an index lookup value, because `IDBIndex.getAll(undefined)` means
 * "no query" and matches every record — so an undefined id would make
 * `removeByIndex` silently empty the whole store instead of deleting nothing.
 */
export function requireIndexValue(
  indexName: string,
  value: IDBValidKey | null | undefined,
): IDBValidKey {
  if (value === undefined || value === null) {
    throw new TypeError(
      `Index "${indexName}" needs a value to look up, got ${value}`,
    )
  }
  return value
}
