const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGlobalSearchResult } = require('../search-utils');

test('global search includes teacher names in result set', () => {
  const result = buildGlobalSearchResult({
    q: 'נעמי',
    students: [{ id_number: '1', name: 'נועה כהן' }],
    equipment: [],
    examCodes: [],
    teachers: [{ id: 9, name: 'נעמי לוי', subject: 'מתמטיקה' }],
  });

  assert.deepEqual(result.students.length, 1);
  assert.deepEqual(result.teachers.length, 1);
  assert.equal(result.teachers[0].name, 'נעמי לוי');
});
