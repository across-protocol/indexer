/**
 * Resolves a redis key from a prefix and a list of arguments
 * @param redisKeyPrefix The prefix to use for the key
 * @param args A list of arguments to append to the key
 * @returns A redis key with the prefix and arguments joined by colons
 * @example makeId("prefix", "arg1", "arg2") => "prefix:arg1:arg2"
 */
export function makeId(
  redisKeyPrefix: string,
  ...args: Array<string | number>
) {
  return [redisKeyPrefix, ...args].join(":");
}
