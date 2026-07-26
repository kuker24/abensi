import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { Role, TeacherLeaveType } from '@prisma/client';

const BRAND_GREEN = '126B3A';
const BRAND_GOLD = 'C9A227';
const TEXT = '1F2937';
const MUTED = '64748B';
const RULE = 'D1D5DB';
const LOGO_SIZE = 56;
const SIGNATURE_HEIGHT = 132;
const SIGNATURE_GAP = 22;
const FOOTER_CLEARANCE = 28;

const TYPE_LABEL: Record<TeacherLeaveType, string> = {
  IZIN: 'Izin',
  SAKIT: 'Sakit',
  DINAS_LUAR: 'Dinas Luar'
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN_TU: 'Admin/TU',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  GURU_MAPEL: 'Guru Mapel',
  GURU_PIKET: 'Guru Piket',
  OPERATOR_IT: 'Operator IT',
  SISWA: 'Siswa',
  DEVELOPER: 'Developer'
};

export interface LeaveLetterModel {
  id: string;
  type: TeacherLeaveType;
  applicantName: string;
  applicantRole: Role;
  startDate: string;
  endDate: string;
  reason: string;
  decisionNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  letterNumber: string;
  generatedAt: string;
  visitInstruction: string;
}

function loadInstitutionLogo(): Buffer | null {
  const candidates = [
    join(process.cwd(), 'assets', 'logoman1.jpeg'),
    join(process.cwd(), 'apps', 'api', 'assets', 'logoman1.jpeg')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate);
  }
  return null;
}

function formatIdDate(value: string) {
  const key = value.slice(0, 10);
  const date = new Date(`${key}T00:00:00+07:00`);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta'
  });
}

export function buildLeaveLetterNumber(id: string, reviewedAt: Date | string | null | undefined) {
  const year = reviewedAt
    ? new Date(reviewedAt).toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' })
    : new Date().toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' });
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'XXXXXXXX';
  return `IZN/${year}/${short}`;
}

function drawKop(doc: PDFKit.PDFDocument, logo: Buffer | null) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;
  const startY = doc.y;
  const textLeft = logo ? left + LOGO_SIZE + 14 : left;
  const textWidth = logo ? pageWidth - LOGO_SIZE - 14 : pageWidth;

  if (logo) {
    doc.image(logo, left, startY, { fit: [LOGO_SIZE, LOGO_SIZE], align: 'center', valign: 'center' });
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor(`#${BRAND_GREEN}`)
    .text('KEMENTERIAN AGAMA REPUBLIK INDONESIA', textLeft, startY, { width: textWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(`#${TEXT}`)
    .text('MADRASAH ALIYAH NEGERI 1 ROKAN HULU', textLeft, doc.y + 1, { width: textWidth, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(`#${MUTED}`)
    .text('Kabupaten Rokan Hulu · Provinsi Riau', textLeft, doc.y + 1, { width: textWidth, align: 'center' });
  doc.fontSize(8).fillColor(`#${MUTED}`)
    .text('SIAB2 · Sistem Informasi Akademik Berkarakter', textLeft, doc.y + 1, { width: textWidth, align: 'center' });

  const lineY = Math.max(startY + LOGO_SIZE + 8, doc.y + 8);
  doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(1.6).strokeColor(`#${BRAND_GREEN}`).stroke();
  doc.moveTo(left, lineY + 3).lineTo(right, lineY + 3).lineWidth(0.7).strokeColor(`#${BRAND_GOLD}`).stroke();
  doc.y = lineY + 14;
}

function drawFieldRows(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, pageWidth: number) {
  const left = doc.page.margins.left;
  const labelW = 128;
  const valueX = left + labelW + 10;
  const valueW = pageWidth - labelW - 10;

  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(`#${MUTED}`).text(label, left, y, { width: labelW });
    doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
      .text(`:  ${value}`, valueX, y, { width: valueW });
    doc.y = Math.max(doc.y, y + 16);
  }
}

function drawSignatureBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  subtitle: string,
  name: string
) {
  doc.font('Helvetica').fontSize(9).fillColor(`#${TEXT}`).text(title, x, y, { width, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(`#${MUTED}`).text(subtitle, x, y + 14, { width, align: 'center' });
  const lineY = y + 92;
  doc.moveTo(x + 18, lineY).lineTo(x + width - 18, lineY).lineWidth(0.7).strokeColor(`#${RULE}`).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(`#${TEXT}`)
    .text(name || '................................', x, lineY + 8, { width, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(`#${MUTED}`)
    .text('Tanggal: ........ / ........ / ............', x, lineY + 24, { width, align: 'center' });
}

export async function buildLeaveLetterPdf(model: LeaveLetterModel): Promise<Buffer> {
  const logo = loadInstitutionLogo();

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 48,
      info: {
        Title: `Surat Keterangan ${TYPE_LABEL[model.type]} ${model.letterNumber}`,
        Author: 'MAN 1 Rokan Hulu · SIAB2',
        Subject: 'Surat keterangan izin personel (TTD basah offline)'
      }
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;

    drawKop(doc, logo);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(`#${TEXT}`)
      .text(`SURAT KETERANGAN ${TYPE_LABEL[model.type].toUpperCase()}`, left, doc.y, {
        width: pageWidth,
        align: 'center'
      });
    doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
      .text(`Nomor: ${model.letterNumber}`, left, doc.y + 4, { width: pageWidth, align: 'center' });
    doc.moveDown(1.1);

    doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
      .text('Dengan ini diterangkan bahwa:', { width: pageWidth });
    doc.moveDown(0.55);

    drawFieldRows(doc, [
      ['Nama', model.applicantName],
      ['Jabatan / Peran', ROLE_LABEL[model.applicantRole] || model.applicantRole],
      ['Jenis keterangan', TYPE_LABEL[model.type]],
      ['Tanggal mulai', formatIdDate(model.startDate)],
      ['Tanggal selesai', formatIdDate(model.endDate)],
      ['Alasan', model.reason],
      ['Status keputusan', 'DISETUJUI'],
      ['Catatan peninjau', model.decisionNote?.trim() || '—'],
      ['Ditinjau oleh', model.reviewedByName || '—'],
      ['Tanggal keputusan', model.reviewedAt ? formatIdDate(model.reviewedAt) : '—']
    ], pageWidth);

    doc.moveDown(0.7);
    doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
      .text(model.visitInstruction, left, doc.y, { width: pageWidth, align: 'justify' });
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(8).fillColor(`#${MUTED}`)
      .text(
        'Dokumen dicetak dari SIAB2 untuk ditandatangani basah di kertas (offline). Tidak ada tanda tangan digital. Admin/TU di kolom kiri; pemohon di kolom kanan.',
        left,
        doc.y,
        { width: pageWidth }
      );

    const gap = 28;
    const colWidth = (pageWidth - gap) / 2;
    const footerY = doc.page.height - doc.page.margins.bottom - 12;
    if (doc.y + SIGNATURE_GAP + SIGNATURE_HEIGHT > footerY - FOOTER_CLEARANCE) doc.addPage();
    const signTop = doc.y + SIGNATURE_GAP;
    drawSignatureBlock(doc, left, signTop, colWidth, 'Admin / TU', 'Tanda tangan basah + stempel', model.reviewedByName || '');
    drawSignatureBlock(doc, left + colWidth + gap, signTop, colWidth, 'Pemohon', 'Tanda tangan basah', model.applicantName);

    doc.font('Helvetica').fontSize(7).fillColor(`#${MUTED}`)
      .text(
        `Dicetak ${model.generatedAt} · ${model.letterNumber} · MAN 1 Rokan Hulu`,
        left,
        footerY,
        { width: pageWidth, align: 'center' }
      );

    doc.end();
  });
}
