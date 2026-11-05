const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStudentUpdateNotice } = require('../student-update-notice');

test('describes changed profile values without creating a notice for unchanged values', () => {
  const before = { name: 'שרה', address: 'רחוב א 1', track: 'אדריכלות' };
  const after = { ...before, address: 'רחוב ב 2' };

  assert.deepEqual(buildStudentUpdateNotice(before, after), {
    title: 'עדכון פרטי תלמידה',
    body: 'הכתובת עודכנה מ־רחוב א 1 ל־רחוב ב 2.'
  });
  assert.equal(buildStudentUpdateNotice(before, before), null);
});

test('describes engagement updates and never reveals passwords', () => {
  const notice = buildStudentUpdateNotice({
    marital_status: '',
    wedding_date: '',
    phone_code: '02',
    extra_data: { password: 'old secret', 'קוד לטלפון ציבורי': '123' }
  }, {
    marital_status: 'מאורסת',
    wedding_date: '2027-06-01',
    phone_code: '03',
    extra_data: { password: 'new secret', 'קוד לטלפון ציבורי': '456' }
  });

  assert.equal(notice.title, 'עדכון פרטי תלמידה');
  assert.match(notice.body, /התארסה, מתחתנת ב־2027-06-01/);
  assert.match(notice.body, /פרטי התחברות או קוד גישה עודכנו/);
  assert.doesNotMatch(notice.body, /old secret|new secret|123|456/);
});