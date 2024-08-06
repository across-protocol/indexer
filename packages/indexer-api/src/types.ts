export type JSON =
  | string
  | undefined
  | null
  | number
  | boolean
  | { [x: string]: JSON }
  | Array<JSON>;
