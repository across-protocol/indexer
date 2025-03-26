export function intToKey(
  num: number | bigint,
  length: number = 16,
  padChar: string = "0",
): string {
  if (typeof num === "number" && !Number.isInteger(num)) {
    throw new Error("Number is a float, expected an integer or bigint");
  }
  const numStr = num.toString();
  if (numStr.length > length) {
    throw new Error("Number length exceeds the specified length parameter");
  }
  return padChar.repeat(length - numStr.length) + numStr;
}
export function makeKey(array: string[], delimiter: string = "!"): string {
  return array.join(delimiter);
}

export function parseKey(
  key: string,
  delimiter: string = "!",
): (number | string)[] {
  return key.split(delimiter);
}

export function sleep(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
