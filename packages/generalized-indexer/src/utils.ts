export function intToKey(
  num: number | bigint, 
  length: number = 16, 
  padChar: string = '0'
): string {
  if (typeof num === 'number' && !Number.isInteger(num)) {
    throw new Error('Number is a float, expected an integer or bigint');
  }
  const numStr = num.toString();
  if (numStr.length > length) {
    throw new Error('Number length exceeds the specified length parameter');
  }
  return padChar.repeat(length - numStr.length) + numStr;
}
