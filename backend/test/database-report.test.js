const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrackReport, buildClassReport } = require('../database-report');

test('buildTrackReport filters students by track and year and hides phone fields', () => {
  const students = [
    { id_number: '111', name: 'אילנה כהן', track: 'רוח', year: 'יב', phone: '050', extra_data: { 'תעודת זהות': '111', 'שם משתמש': 'user1', 'סיסמה': 'pass1' } },
    { id_number: '222', name: 'ברוריה לוי', track: 'תיאטרון', year: 'יב', phone: '052', extra_data: {} },
    { id_number: '333', name: 'גילה שטרן', track: 'רוח', year: 'יא', phone: '053', extra_data: {} }
  ];

  const report = buildTrackReport(students, [], 'רוח', 'יב');

  assert.equal(report.track, 'רוח');
  assert.equal(report.year, 'יב');
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].name, 'אילנה כהן');
  assert.equal(report.rows[0].username, 'user1');
  assert.equal(report.rows[0].password, 'pass1');
  assert.equal(report.rows[0].phone, undefined);
  assert.equal(report.columns.some((column) => column.key === 'phone'), false);
});

test('buildClassReport includes only the selected class plus its parallel and relevant grades', () => {
  const students = [
    { id_number: '111', name: 'אילנה כהן', track: 'רוח', year: 'יב', phone: '050', extra_data: '{"מקבילה":"2"}' },
    { id_number: '222', name: 'ברוריה לוי', track: 'תיאטרון', year: 'יב', phone: '052', extra_data: '{"מקבילה":"1"}' },
    { id_number: '333', name: 'גילה שטרן', track: 'רוח', year: 'יא', phone: '053', extra_data: '{"מקבילה":"2"}' }
  ];
  const exams = [
    { id: 1, name: 'מבחן עברית', year: 'יב' },
    { id: 2, name: 'מבחן מתמטיקה', year: 'יא' }
  ];
  const grades = {
    1: { 111: 95, 222: 88 },
    2: { 111: 76, 333: 90 }
  };

  const report = buildClassReport(students, exams, grades, 'יב2');

  assert.equal(report.class_name, 'יב2');
  assert.equal(report.exams.length, 1);
  assert.equal(report.exams[0].name, 'מבחן עברית');
  assert.equal(report.students.length, 1);
  assert.equal(report.students[0].id_number, '111');
  assert.equal(report.students[0].grades[1], 95);
  assert.equal(report.students[0].grades[2], undefined);
});

test('buildTrackReport shows only track-specific exams and credentials without phone prefix', () => {
  const students = [
    {
      id_number: '111',
      name: 'אילנה כהן',
      track: 'רוח',
      year: 'יב',
      phone: '0501234567',
      phone_code: '972',
      extra_data: '{"שם משתמש":"user1","סיסמה":"pass1","קידומת":"972"}'
    },
    {
      id_number: '222',
      name: 'ברוריה לוי',
      track: 'תיאטרון',
      year: 'יב',
      phone: '0527654321',
      phone_code: '972',
      extra_data: '{"שם משתמש":"user2","סיסמה":"pass2"}'
    }
  ];
  const exams = [
    { id: 1, name: 'מבחן רוח', track: 'רוח', year: 'יב' },
    { id: 2, name: 'מבחן תיאטרון', track: 'תיאטרון', year: 'יב' }
  ];

  const report = buildTrackReport(students, exams, 'רוח', 'יב');

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].name, 'אילנה כהן');
  assert.equal(report.rows[0].username, 'user1');
  assert.equal(report.rows[0].password, 'pass1');
  assert.equal(report.rows[0].phone_code, undefined);
  assert.ok(report.columns.some((column) => column.key === 'exam_1'));
  assert.equal(report.columns.some((column) => column.key === 'exam_2'), false);
});

test('buildTrackReport includes a student in both matching tracks when their track field contains multiple values', () => {
  const students = [
    { id_number: '111', name: 'אילנה כהן', track: 'רוח / הוראה מתקנת', year: 'יב', extra_data: '{"שם משתמש":"user1","סיסמה":"pass1"}' },
    { id_number: '222', name: 'ברוריה לוי', track: 'רוח', year: 'יב', extra_data: '{"שם משתמש":"user2","סיסמה":"pass2"}' }
  ];
  const exams = [
    { id: 1, name: 'מבחן רוח', track: 'רוח', year: 'יב' },
    { id: 2, name: 'מבחן הוראה מתקנת', track: 'הוראה מתקנת', year: 'יב' }
  ];

  const reportA = buildTrackReport(students, exams, 'רוח', 'יב');
  const reportB = buildTrackReport(students, exams, 'הוראה מתקנת', 'יב');

  assert.equal(reportA.rows.some((row) => row.id_number === '111'), true);
  assert.equal(reportB.rows.some((row) => row.id_number === '111'), true);
  assert.equal(reportA.rows.length, 2);
  assert.equal(reportB.rows.length, 1);
});
