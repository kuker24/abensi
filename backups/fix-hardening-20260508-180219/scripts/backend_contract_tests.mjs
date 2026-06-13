#!/usr/bin/env node
import assert from 'node:assert/strict';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const username = process.env.ADMIN_USERNAME || 'admin.tu';
const password = process.env.ADMIN_PASSWORD || 'Admin#12345';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed ${response.status}: ${text}`);
  return data;
}

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password })
});
const auth = { authorization: `Bearer ${login.accessToken}` };
const stamp = Date.now();

const note = await request('/picket-notes', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    date: new Date().toISOString(),
    title: `Contract Picket ${stamp}`,
    body: 'Uji kontrak Buku Piket otomatis.',
    category: 'UMUM',
    severity: 'INFO'
  })
});
assert.ok(note.id);

const updatedNote = await request(`/picket-notes/${note.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ title: `Contract Picket Updated ${stamp}` })
});
assert.equal(updatedNote.title, `Contract Picket Updated ${stamp}`);

const inactiveNote = await request(`/picket-notes/${note.id}`, {
  method: 'DELETE',
  headers: auth,
  body: JSON.stringify({ reason: 'Contract test cleanup.' })
});
assert.equal(inactiveNote.active, false);

const preview = await request('/identity/users/import/preview', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ rows: [{ username: `contract.user.${stamp}`, fullName: 'Contract User', role: 'SISWA', password: 'SchoolHub#2026' }] })
});
assert.equal(preview.summary.invalid, 0);

const importForm = new FormData();
importForm.append('file', new Blob([`username,fullName,role,password\ncontract.file.${stamp},Contract File,SISWA,SchoolHub#2026\n`], { type: 'text/csv' }), 'users.csv');
const filePreview = await request('/identity/users/import/file/preview', {
  method: 'POST',
  headers: auth,
  body: importForm
});
assert.equal(filePreview.summary.invalid, 0);

const createdUser = await request('/identity/users', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ username: `contract.user.create.${stamp}`, fullName: 'Contract Create', role: 'SISWA', password: 'SchoolHub#2026' })
});
assert.ok(createdUser.id);

const editedUser = await request(`/identity/users/${createdUser.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ fullName: 'Contract Create Edited' })
});
assert.equal(editedUser.fullName, 'Contract Create Edited');

const inactiveUser = await request(`/identity/users/${createdUser.id}`, {
  method: 'DELETE',
  headers: auth,
  body: JSON.stringify({ reason: 'Contract test cleanup.' })
});
assert.equal(inactiveUser.active, false);

const classItem = await request('/academic/classes', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ code: `CT-${stamp}`, name: 'Contract Class', yearLabel: '2026/2027' })
});
assert.ok(classItem.id);
const editedClass = await request(`/academic/classes/${classItem.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ name: 'Contract Class Edited' })
});
assert.equal(editedClass.name, 'Contract Class Edited');

const subject = await request('/academic/subjects', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ code: `CTS-${stamp}`, name: 'Contract Subject' })
});
assert.ok(subject.id);
const editedSubject = await request(`/academic/subjects/${subject.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ name: 'Contract Subject Edited' })
});
assert.equal(editedSubject.name, 'Contract Subject Edited');

const audit = await request('/audit?module=picket&page=1&limit=10', { headers: auth });
assert.ok(Array.isArray(audit.items));
assert.ok(audit.items.length >= 1);

console.log(JSON.stringify({ ok: true, baseUrl, checks: ['picket-crud', 'user-crud', 'json-import-preview', 'file-import-preview', 'academic-update', 'audit'] }, null, 2));
