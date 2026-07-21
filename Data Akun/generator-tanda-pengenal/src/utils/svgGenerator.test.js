import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCardPngFilename,
  buildCardSVGMarkup,
  buildCardSvgFilename,
  getCardAssetDimensions,
} from './cardAssetMarkup.js';

const QR_MARKUP = {
  viewBox: '0 0 144 144',
  content: '<rect width="144" height="144" fill="#ffffff"/><path d="M8 8h24v24H8z" fill="#071018"/>',
};
const LOGO_DATA_URL = 'data:image/png;base64,aW1hZ2U=';

const officialUser = {
  id: 'official-card',
  nama: "'Contoh Resmi",
  nisn: '1234567890',
  nis: '24001',
  role: 'student',
  card_source: 'database',
  is_official: 'true',
  qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKLMNOP',
};

const draftUser = {
  id: 'draft-card',
  nama: 'Contoh Draft',
  nisn: 'DRAFT-001',
  role: 'student',
  card_source: 'csv',
  is_official: 'false',
  qr_value: 'schoolhub:qr:v1:QR_LOCAL_ABCDEF12345678',
};

const teacherUser = {
  id: 'teacher-card',
  nama: 'Guru Contoh',
  nip: '198001012006041001',
  role: 'teacher',
  card_source: 'database',
  is_official: 'true',
  qr_value: 'schoolhub:qr:v1:QR_TEACHERIDENTITY',
};

const employeeWithoutNip = {
  id: 'employee-card',
  nama: 'Pegawai Contoh',
  role: 'employee',
  card_source: 'database',
  is_official: 'true',
  qr_value: 'schoolhub:qr:v1:QR_EMPLOYEEIDENTITY',
};

test('official SVG is one card asset without database source badge or A4 wrapper', () => {
  const svg = buildCardSVGMarkup(officialUser, { qrMarkup: QR_MARKUP, logoDataUrl: LOGO_DATA_URL });

  assert.match(svg, /<svg[^>]+width="53\.98mm"[^>]+height="85\.6mm"[^>]+viewBox="0 0 324 514"/);
  assert.match(svg, /data-card-asset="siab2-card-only"/);
  assert.equal(svg.includes('RESMI / DATABASE'), false);
  assert.equal(svg.includes('DATABASE'), false);
  assert.equal(svg.includes('schoolhub-api'), false);
  assert.equal(svg.includes('source-badge'), false);
  assert.equal(svg.includes('A4 3'), false);
  assert.equal(svg.includes('KARTU TANDA PENGENAL RESMI'), false);
  assert.equal(svg.includes('KARTU DIGITAL MADRASAH'), false);
  assert.equal(svg.includes('official-badge'), false);
  assert.equal(svg.includes('>RESMI<'), false);
  assert.match(svg, />'CONTOH RESMI</);
  assert.equal(svg.includes('&apos;'), false);
  assert.match(svg, />NIS: 24001</);
  assert.match(svg, />SISWA</);
  assert.equal(svg.includes('KELAS'), false);
  assert.match(svg, />KARTU TANDA PENGENAL SIAB2</);
  assert.match(svg, /background: transparent/);
});

test('draft SVG keeps DRAFT watermark and draft source badge', () => {
  const svg = buildCardSVGMarkup(draftUser, { qrMarkup: QR_MARKUP, logoDataUrl: LOGO_DATA_URL });

  assert.equal(svg.includes('DRAFT'), true);
  assert.equal(svg.includes('DRAFT / TIDAK TERVERIFIKASI'), true);
  assert.equal(svg.includes('draft-source-badge'), true);
  assert.equal(svg.includes('RESMI / DATABASE'), false);
});

test('SVG identity line adapts for teacher, employee, and missing identity values', () => {
  const teacherSvg = buildCardSVGMarkup(teacherUser, { qrMarkup: QR_MARKUP, logoDataUrl: LOGO_DATA_URL });
  const employeeSvg = buildCardSVGMarkup(employeeWithoutNip, { qrMarkup: QR_MARKUP, logoDataUrl: LOGO_DATA_URL });

  assert.match(teacherSvg, />NIP: 198001012006041001</);
  assert.match(teacherSvg, />GURU</);
  assert.equal(teacherSvg.includes('NIS:'), false);
  assert.match(employeeSvg, />NIP: </);
  assert.match(employeeSvg, />PEGAWAI</);
  assert.equal(employeeSvg.includes('>-<'), false);
});

test('card asset dimensions and filenames stay card-only', () => {
  const dimensions = getCardAssetDimensions();

  assert.deepEqual(dimensions, {
    widthMm: 53.98,
    heightMm: 85.6,
    renderWidthPx: 324,
    renderHeightPx: 514,
    orientation: 'portrait',
  });
  assert.equal(buildCardSvgFilename(officialUser, 0), 'kartu-siab2-01.svg');
  assert.equal(buildCardPngFilename(officialUser, 1), 'kartu-siab2-02.png');
});
