export function isUpcomingExam(examDate: string | null | undefined, now = new Date()): boolean {
  if (!examDate) return true;

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return examDate >= `${year}-${month}-${day}`;
}
