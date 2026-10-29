function buildGlobalSearchResult({ q, students = [], equipment = [], examCodes = [], teachers = [] }) {
  const query = String(q || '').trim();
  if (query.length < 2) {
    return { students: [], equipment: [], examCodes: [], teachers: [] };
  }

  return {
    students: Array.isArray(students) ? students : [],
    equipment: Array.isArray(equipment) ? equipment : [],
    examCodes: Array.isArray(examCodes) ? examCodes : [],
    teachers: Array.isArray(teachers) ? teachers : [],
  };
}

module.exports = { buildGlobalSearchResult };
