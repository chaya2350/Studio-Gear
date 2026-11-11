const FIELD_LABELS = {
  name: 'השם עודכן',
  address: 'הכתובת עודכנה',
  phone: 'הטלפון עודכן',
  track: 'המסלול עודכן',
  year: 'שנת הלימודים עודכנה',
  parallel: 'המקבילה עודכנה',
  marital_status: 'הסטטוס האישי עודכן',
  married_name: 'השם לאחר חתונה עודכן',
  personal_phone: 'הטלפון האישי עודכן',
  wedding_date: 'תאריך החתונה עודכן',
  wedding_venue: 'מקום החתונה עודכן'
};

function normalized(value) {
  return String(value ?? '').trim();
}

function formatValue(value) {
  return normalized(value) || 'לא צוין';
}

function normalizeExtraData(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (error) {
      if (error instanceof SyntaxError) return {};
      throw error;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isSensitiveKey(key) {
  const normalizedKey = key.toLocaleLowerCase().replace(/[\s_-]+/g, '');
  return /סיסמ|password|passwd|שםמשתמש|username|login|קודלטלפון|phonecode/.test(normalizedKey);
}

function buildStudentUpdateNotice(before, after) {
  const changes = new Map();
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const oldValue = normalized(before[field]);
    const newValue = normalized(after[field]);
    if (oldValue !== newValue) changes.set(field, { label, oldValue, newValue });
  }

  const oldExtra = normalizeExtraData(before.extra_data);
  const newExtra = normalizeExtraData(after.extra_data);
  const extraKeys = new Set([...Object.keys(oldExtra), ...Object.keys(newExtra)]);
  let sensitiveExtraChanged = normalized(before.phone_code) !== normalized(after.phone_code);
  for (const key of extraKeys) {
    const oldValue = normalized(oldExtra[key]);
    const newValue = normalized(newExtra[key]);
    if (oldValue === newValue) continue;
    if (isSensitiveKey(key)) {
      sensitiveExtraChanged = true;
      continue;
    }
    changes.set(`extra:${key}`, { label: key, oldValue, newValue });
  }

  const lines = [];
  const engagementFields = ['marital_status', 'married_name', 'wedding_date'];
  const engagementChanged = engagementFields.some(field => changes.has(field));
  if (after.marital_status === 'מאורסת' && engagementChanged) {
    const date = normalized(after.wedding_date);
    lines.push(before.marital_status === 'מאורסת'
      ? `פרטי האירוסין עודכנו${date ? `; תאריך החתונה: ${date}` : ''}.`
      : `התארסה${date ? `, מתחתנת ב־${date}` : ''}.`);
    engagementFields.forEach(field => changes.delete(field));
  }

  for (const [field, change] of changes) {
    lines.push(`${field.startsWith('extra:') ? `הפרט ${change.label} עודכן` : change.label} מ־${formatValue(change.oldValue)} ל־${formatValue(change.newValue)}.`);
  }
  if (sensitiveExtraChanged || changes.has('phone_code')) {
    lines.push('פרטי התחברות או קוד גישה עודכנו.');
  }
  if (!lines.length) return null;

  return { title: 'עדכון פרטי תלמידה', body: lines.join('\n') };
}

module.exports = { buildStudentUpdateNotice };