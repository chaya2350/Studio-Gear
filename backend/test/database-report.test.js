const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTrackReport, buildClassReport, buildScopedStudentReport, minimizeClassReport,
  splitTrackValues, studentHasTrack, resolveStudentTrackIds
} = require('../database-report');

test('splitTrackValues separates combined track values without merging distinct track names', () => {
  assert.deepEqual(splitTrackValues('הוראה / אדריכלות'), ['הוראה', 'אדריכלות']);
  assert.deepEqual(splitTrackValues('הוראה מתקנת / אדריכלות'), ['הוראה מתקנת', 'אדריכלות']);
  assert.deepEqual(splitTrackValues('רוח & ספורט טיפולי'), ['ראיית חשבון', 'ספורט טיפולי']);
  assert.deepEqual(splitTrackValues('חינוך מיוחד / מתמטיקה / ח"מ'), ['חינוך מיוחד', 'מתמטיקה']);
  assert.deepEqual(splitTrackValues('ייעוץ מס / ללא מיסים'), ['ייעוץ מס']);
  assert.deepEqual(splitTrackValues('יעוץ מס / הוראה / ייעוץ מס'), ['ייעוץ מס', 'הוראה']);
  assert.deepEqual(splitTrackValues('הוראה / הוראה מתקנת'), ['הוראה', 'הוראה מתקנת']);
  assert.deepEqual(splitTrackValues('הנדסת חשמל / הנדסת אנרגיה'), ['הנדסת אנרגיה']);
  assert.deepEqual(splitTrackValues('הנדסת חשמל / גרפיקה'), ['הנדסת אנרגיה', 'גרפיקה']);
  assert.deepEqual(splitTrackValues('תיכנות / תכנות'), ['תכנות']);
});

test('studentHasTrack matches a selected single track inside a combined student track', () => {
  assert.equal(studentHasTrack('גרפיקה / הוראה מתקנת', 'גרפיקה'), true);
  assert.equal(studentHasTrack('גרפיקה / הוראה מתקנת', 'הוראה מתקנת'), true);
  assert.equal(studentHasTrack('גרפיקה / הוראה', 'הוראה מתקנת'), false);
  assert.equal(studentHasTrack('גרפיקה / הוראה מתקנת', 'הוראה'), false);
  assert.equal(studentHasTrack('גרפיקה / הוראה מתקנת', 'גרפיקה מתקדמת'), false);
  assert.equal(studentHasTrack('יעוץ מס / הוראה / ייעוץ מס', 'ייעוץ מס'), true);
  assert.equal(studentHasTrack('רו״ח / גרפיקה', 'ראיית חשבון'), true);
  assert.equal(studentHasTrack('ראיית חשבון / גרפיקה', 'רו"ח'), true);
  assert.equal(studentHasTrack('ספורט טיפולי / מתמטיקה', 'ספורט'), true);
});

test('resolveStudentTrackIds includes each constituent track and resolves merged tracks to their main track', () => {
  const tracks = [
    { id: 1, name: 'גרפיקה', merged_into: null },
    { id: 2, name: 'הוראה מתקנת', merged_into: null },
    { id: 3, name: 'ייעוץ מס', merged_into: 2 },
  ];
  assert.deepEqual(resolveStudentTrackIds('גרפיקה / הוראה מתקנת / ייעוץ מס', tracks), [1, 2]);
});

test('buildClassReport normalizes year A/B into H/V for class matching and display', () => {
  const students = [
    { id_number: '111', name: 'אילנה כהן', track: 'חינוך מיוחד', year: 'א', extra_data: '{"מקבילה":"2"}' },
    { id_number: '222', name: 'ברוריה לוי', track: 'תכנות', year: 'ב', extra_data: '{"מקבילה":"1"}' }
  ];
  const report = buildClassReport(students, [], {}, 'ה2');

  assert.equal(report.year, 'ה');
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].id_number, '111');
  assert.equal(report.rows[0].class_name, 'ה2');
});

test('buildClassName normalizes imported year and parallel into the displayed class name', () => {
  const { buildClassName } = require('../database-report');
  assert.equal(buildClassName('ב', '1'), 'ו1');
  assert.equal(buildClassName('עולה לשנה א׳', '2'), 'ה2');
  assert.equal(buildClassName('ו', 'מקבילה 1'), 'ו1');
  assert.equal(buildClassName('ו', '1׳'), 'ו1');
});

test('buildTrackReport filters students by track and year and hides phone fields', () => {
  const students = [
    { id_number: '111', name: 'אילנה כהן', track: 'רוח', year: 'יב', phone: '050', extra_data: { 'תעודת זהות': '111', 'שם משתמש': 'user1', 'סיסמה': 'pass1' } },
    { id_number: '222', name: 'ברוריה לוי', track: 'תיאטרון', year: 'יב', phone: '052', extra_data: {} },
    { id_number: '333', name: 'גילה שטרן', track: 'רוח', year: 'יא', phone: '053', extra_data: {} }
  ];

  const report = buildTrackReport(students, [], 'רוח', 'יב');

  assert.equal(report.track, 'ראיית חשבון');
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
  assert.equal(report.rows[0].class_name, 'יב2');
  assert.equal(report.exams.length, 1);
  assert.equal(report.exams[0].name, 'מבחן עברית');
  assert.equal(report.students.length, 1);
  assert.equal(report.students[0].id_number, '111');
  assert.equal(report.students[0].grades[1], 95);
  assert.equal(report.students[0].grades[2], undefined);
});

test('buildClassReport canonicalizes aliases without merging distinct track names', () => {
  const students = [
    { id_number: '111', name: 'אילנה כהן', track: 'חינוך מיוחד / הוראה / הוראה מתקנת / חינוך מיוחד', year: 'א', extra_data: '{"מקבילה":"2"}' }
  ];

  const report = buildClassReport(students, [], {}, 'ה2');

  assert.equal(report.rows[0].track, 'חינוך מיוחד / הוראה / הוראה מתקנת');
});

test('minimizeClassReport excludes personal student and exam fields', () => {
  const report = minimizeClassReport({
    class_name: 'יב2',
    year: 'יב',
    exams: [{ id: 8, name: 'מבחן', year: 'יב', track: 'חשאי' }],
    rows: [{ name: 'רחל', id_number: '123456789', phone: '0501234567', address: 'כתובת', exam_8: 91 }]
  });

  assert.deepEqual(report.exams, [{ id: 8, name: 'מבחן', year: 'יב' }]);
  assert.deepEqual(report.rows, [{ name: 'רחל', exam_8: 91 }]);
  assert.deepEqual(report.columns, [
    { key: 'name', label: 'שם' },
    { key: 'exam_8', label: 'מבחן' }
  ]);
});

test('buildScopedStudentReport returns counts and name lists for class, school, and track scopes', () => {
  const students = [
    { id_number: '111', name: 'שרה א', year: 'א', parallel: '1', track: 'הוראה / עיצוב', photo_url: '/uploads/student.jpg' },
    { id_number: '222', name: 'שרה ב', year: 'א', parallel: '2', track: 'הוראה' },
    { id_number: '333', name: 'שרה ג', year: 'ב', parallel: '1', track: 'עיצוב' },
    { id_number: '444', name: 'בוגרת', year: 'בוגרות', parallel: null, track: 'הוראה' }
  ];
  const exams = [
    { id: 1, name: 'מבחן א', year: 'א', track: 'הוראה' },
    { id: 2, name: 'מבחן ב', year: 'ב', track: 'עיצוב' }
  ];
  const grades = { 1: { 111: 90, 222: 80 }, 2: { 333: 95 } };

  const classReport = buildScopedStudentReport(students, exams, grades, { scope: 'class', className: 'א1' });
  const linkedReport = buildScopedStudentReport(students, exams, grades, {
    scope: 'class', className: 'א1', includeProfileData: true
  });
  const schoolReport = buildScopedStudentReport(students, exams, grades, { scope: 'school' });
  const trackReport = buildScopedStudentReport(students, exams, grades, { scope: 'track', track: 'הוראה' });

  assert.equal(classReport.count, 1);
  assert.deepEqual(classReport.rows.map(row => row.name), ['שרה א']);
  assert.equal(schoolReport.count, 3);
  assert.deepEqual(trackReport.rows.map(row => row.name), ['שרה א', 'שרה ב']);
  assert.equal(trackReport.rows.some(row => 'id_number' in row), false);
  assert.equal(linkedReport.rows[0].id_number, '111');
  assert.equal(linkedReport.rows[0].photo_url, '/uploads/student.jpg');
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
