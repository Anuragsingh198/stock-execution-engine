export function normalizeDate(date: Date | string): Date {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'string') {
    return new Date(date);
  }
  return new Date();
}
