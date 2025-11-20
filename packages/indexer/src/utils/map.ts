export function createMapWithDefault<T extends object, V>(
  target: T,
  defaultValue: V,
): T & { [key: string]: V } {
  // Explicitly typing the handler helps catch these errors
  const handler: ProxyHandler<T> = {
    get: function (obj: T, prop: string | symbol, receiver: any) {
      // Check if the property exists on the original object
      // 'prop in obj' correctly handles 'string | symbol'
      if (prop in obj) {
        // We must cast 'prop' to 'keyof T' here to
        // tell TypeScript it's safe to use as an index.
        return obj[prop as keyof T];
      }

      // If not, return the default value provided
      return defaultValue;
    },
  };

  return new Proxy(target, handler) as T & { [key: string]: V };
}
