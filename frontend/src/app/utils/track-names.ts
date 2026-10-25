export function splitTrackNames(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  return String(value || '')
    .split(/[\/,&]/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((part) => part.replace(/[\u2018\u2019\u05F3\u05F4'"`]/g, ''))
    .map((part) => {
      const normalized = part.replace(/\s+/g, '').toLocaleLowerCase();
      if (normalized === 'יעוץמס' || normalized === 'ללאמיסים') return 'ייעוץ מס';
      if (normalized === 'הוראה') return 'הוראה מתקנת';
      if (normalized === 'הנדסתחשמל' || normalized === 'אנרגיה') return 'הנדסת אנרגיה';
      return part;
    })
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    });
}

export function collectTrackNames(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.flatMap(splitTrackNames))]
    .sort((a, b) => a.localeCompare(b, 'he'));
}
