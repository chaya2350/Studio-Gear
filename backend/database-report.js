function parseExtraData(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'object') return rawValue;
  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeYear(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeClassValue(value) {
  const raw = normalizeYear(value);
  if (!raw) return '';
  return raw.replace(/\s*[-–—]\s*/g, '').trim();
}

function parseClassParts(classValue) {
  const normalized = normalizeClassValue(classValue);
  const match = normalized.match(/^([א-ת]+)(\d+)?$/);
  if (!match) return { year: normalized, parallel: '' };
  return { year: match[1], parallel: match[2] || '' };
}

function gatherExtraKeys(students) {
  const keys = new Set();
  for (const student of students) {
    const extra = student && typeof student.extra_data === 'object' && student.extra_data ? student.extra_data : {};
    for (const key of Object.keys(extra)) {
      if (String(key || '').trim()) keys.add(String(key).trim());
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b, 'he'));
}

function normalizeTrackKey(value) {
  return String(value || '').normalize('NFKC').replace(/[\u2018\u2019\u05F3\u05F4'"`]/g, '').replace(/[-_]/g, '').replace(/\s+/g, '').toLocaleLowerCase();
}

function displayTrackName(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const normalized = normalizeTrackKey(raw);
  const map = {
    'רוח': 'רוח',
    'ראייתחשבון': 'רוח',
    'ספורט': 'ספורט טיפולי',
    'ספורטטיפולי': 'ספורט טיפולי',
    'הומ': 'הוראה מתקנת',
    'הוראהמתקנת': 'הוראה מתקנת'
  };
  return map[normalized] || raw;
}

function displayExamName(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const normalized = normalizeTrackKey(raw);
  const map = {
    'רוח': 'רוח',
    'ראייתחשבון': 'רוח',
    'ספורט': 'ספורט טיפולי',
    'ספורטטיפולי': 'ספורט טיפולי',
    'הומ': 'הוראה מתקנת',
    'הוראהמתקנת': 'הוראה מתקנת'
  };
  return map[normalized] || raw;
}

function splitTrackValues(value) {
  return String(value || '')
    .split(/[\/,&]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((item) => displayTrackName(item));
}

function buildTrackReport(students, examsOrTrackName, maybeTrackName, maybeYear, gradesByExam = {}) {
  const exams = Array.isArray(examsOrTrackName) ? examsOrTrackName : [];
  const trackName = Array.isArray(examsOrTrackName) ? String(maybeTrackName || '') : String(examsOrTrackName || '');
  const year = Array.isArray(examsOrTrackName) ? String(maybeYear || '') : String(maybeTrackName || '');

  const canonicalTrackName = displayTrackName(trackName);
  const filtered = (students || []).filter((student) => {
    const studentTracks = splitTrackValues(student?.track);
    const studentYear = normalizeYear(student?.year);
    return studentYear === normalizeYear(year) && studentTracks.some((track) => track === canonicalTrackName);
  }).sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const validExams = exams.filter((exam) => {
    const examTrack = displayTrackName(exam?.track);
    const examYear = normalizeYear(exam?.year);
    return examTrack === canonicalTrackName && (!examYear || examYear === normalizeYear(year));
  }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));

  const columns = [
    { key: 'name', label: 'שם' },
    { key: 'id_number', label: 'מ.ז.' },
    ...validExams.map((exam) => ({ key: `exam_${exam.id}`, label: displayExamName(exam.name) || 'מבחן' })),
    { key: 'username', label: 'שם משתמש' },
    { key: 'password', label: 'סיסמא' }
  ];

  const rows = filtered.map((student) => {
    const row = {
      name: student.name || '',
      id_number: student.id_number || ''
    };

    const extra = parseExtraData(student?.extra_data);
    for (const exam of validExams) {
      const grade = gradesByExam?.[exam.id]?.[student.id_number];
      row[`exam_${exam.id}`] = grade == null ? '' : grade;
    }

    const usernameEntry = Object.entries(extra).find(([key]) => {
      const normalized = String(key || '').toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
      return normalized.includes('שםמשתמש') || normalized.includes('username') || normalized.includes('user') || normalized.includes('login');
    });
    const passwordEntry = Object.entries(extra).find(([key]) => {
      const normalized = String(key || '').toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
      return normalized.includes('סיסמ') || normalized.includes('password') || normalized === 'pass';
    });

    row.username = usernameEntry ? String(usernameEntry[1] ?? '').trim() : '';
    row.password = passwordEntry ? String(passwordEntry[1] ?? '').trim() : '';

    return row;
  });

  return { track: canonicalTrackName || '', year: normalizeYear(year), columns, rows };
}

function buildClassReport(students, exams, gradesByExam, className) {
  const normalizedClass = normalizeClassValue(className);
  const { year, parallel } = parseClassParts(normalizedClass);

  const filteredStudents = (students || []).filter((student) => {
    const studentBaseYear = normalizeYear(student?.year);
    const studentExtra = parseExtraData(student?.extra_data);
    const parallelEntry = Object.entries(studentExtra).find(([key]) => {
      const normalizedKey = String(key || '').replace(/\s+/g, '').toLowerCase();
      return normalizedKey.includes('מקב') || normalizedKey.includes('parallel') || normalizedKey.includes('קבוצה');
    });
    const studentParallel = parallelEntry ? String(parallelEntry[1] || '').trim() : '';
    const matchesYear = studentBaseYear === year;
    const matchesParallel = !parallel || studentParallel === parallel;
    return matchesYear && matchesParallel;
  }).sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const filteredExams = (exams || []).filter((exam) => {
    const examYear = normalizeYear(exam?.year);
    return !examYear || examYear === year;
  }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));

  const columns = [
    { key: 'name', label: 'שם' },
    { key: 'id_number', label: 'מ.ז.' },
    { key: 'track', label: 'מסלול' },
    { key: 'phone', label: 'טלפון' },
    { key: 'phone_code', label: 'קידומת' },
    { key: 'birth_date', label: 'תאריך לידה' },
    { key: 'address', label: 'כתובת' },
    ...filteredExams.map((exam) => ({ key: `exam_${exam.id}`, label: exam.name || 'מבחן' }))
  ];

  const studentsWithGrades = filteredStudents.map((student) => {
    const grades = {};
    const row = {
      name: student.name || '',
      id_number: student.id_number || '',
      track: student.track || '',
      phone: student.phone || '',
      phone_code: student.phone_code || '',
      birth_date: student.birth_date || '',
      address: student.address || '',
      grades,
    };

    for (const exam of filteredExams) {
      const examGrades = gradesByExam?.[exam.id] || {};
      const grade = examGrades[student.id_number];
      grades[Number(exam.id)] = grade == null ? undefined : grade;
      row[`exam_${exam.id}`] = grade == null ? '' : grade;
    }

    return row;
  });

  return { class_name: normalizedClass, year, parallel, columns, rows: studentsWithGrades, exams: filteredExams, students: studentsWithGrades };
}

module.exports = { buildTrackReport, buildClassReport };
