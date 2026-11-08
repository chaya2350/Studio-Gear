const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionCookie, SESSION_SECONDS } = require('../auth-utils');

test('remember me controls cookie persistence without exposing credentials', () => {
  const session = sessionCookie('token', false, false);
  assert.match(session, /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(session, /Max-Age/);
  assert.match(sessionCookie('token', true, true), new RegExp(`Max-Age=${SESSION_SECONDS}; Secure`));
  assert.match(sessionCookie('', false, false, true), /Max-Age=0/);
});
