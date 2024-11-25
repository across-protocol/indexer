import * as assertModule from "assert";
import { AssertError } from "../errors/AssertError";

/**
 * A stand-in assert function that returns a formatted error payload
 * @param value An arbitrary predicate that will be asserted for truthiness
 * @param message An error message that will be passed if the assert fails
 * @returns An assertion of `value`.
 * @throws {@link AssertError} if assert's validity fails
 */
export function assert(value: unknown, message: string): asserts value {
  try {
    return assertModule.ok(value, message);
  } catch (e: unknown) {
    throw new AssertError(message);
  }
}
