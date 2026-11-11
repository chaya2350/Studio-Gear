export function isHiddenStudentField(key: string): boolean {
  const normalized = key.toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  return normalized === 'סיסמאקבועה' || normalized === 'סיסמהקבועה' || normalized === 'קודקבוע';
}
