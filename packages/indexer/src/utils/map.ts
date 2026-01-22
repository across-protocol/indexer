/**
 * Safely serializes a JavaScript value to a JSON string, automatically converting
 * `BigInt` values to strings.
 * * Standard `JSON.stringify` throws a TypeError when encountering BigInts.
 * This utility solves that by serializing `100n` as `"100"`.
 *
 * @param {any} value - The value to convert to a JSON string.
 * @param {string | number} [space] - Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
 * @returns {string} A JSON string representing the given value.
 *
 * @example
 * const data = {
 * id: 1,
 * amount: 5000000000000000000n // BigInt
 * };
 * * // Returns: '{"id":1,"amount":"5000000000000000000"}'
 * const json = safeJsonStringify(data);
 */
export const safeJsonStringify = (
  value: any,
  space: string | number = 1,
): string => {
  return JSON.stringify(
    value,
    (_key, val) => (typeof val === "bigint" ? val.toString() : val),
    space,
  );
};
