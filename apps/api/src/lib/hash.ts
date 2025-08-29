import crypto from 'node:crypto';

export const stableStringify = (obj: unknown): string => {
  const sorter = (value: any): any => {
    if (Array.isArray(value)) return value.map(sorter);
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc: any, key) => {
          acc[key] = sorter((value as any)[key]);
          return acc;
        }, {} as any);
    }
    return value;
  };
  return JSON.stringify(sorter(obj));
};

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

