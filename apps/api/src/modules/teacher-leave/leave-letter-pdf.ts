import PDFDocument from 'pdfkit';
import type { Role, TeacherLeaveType } from '@prisma/client';

const BRAND_GREEN = '126B3A';
const BRAND_GOLD = 'C9A227';
const TEXT = '111827';
const MUTED = '6B7280';

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

function formatIdDate(value: string) {
  const key = value.slice(0, 10);
  const date = new Date(`${key}T00:00:00+07:00`);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export function buildLeaveLetterNumber(id: string, reviewedAt: Date | string | null | undefined) {
  const year = reviewedAt
    ? new Date(reviewedAt).toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' })
    : new Date().toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' });
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'XXXXXXXX';
  return `IZN/${year}/${short}`;
}

export async function buildLeaveLetterPdf(model: LeaveLetterModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('Helvetica-Bold').fontSize(14).fillColor(`#${BRAND_GREEN}`)
      .text('MADRASAH ALIYAH NEGERI 1 ROKAN HULU', { align: 'center', width: pageWidth });
    doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
      .text('SIAB2 · SchoolHub e-Hadir', { align: 'center', width: pageWidth });
    doc.fontSize(8).fillColor(`#${MUTED}`)
      .text('Dokumen resmi internal madrasah', { align: 'center', width: pageWidth });
    doc.moveDown(0.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y)
      .lineWidth(1.5).strokeColor(`#${BRAND_GOLD}`).stroke();
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(`#${TEXT}`)
      .text(`SURAT KETERANGAN ${TYPE_LABEL[model.type].toUpperCase()}`, { align: 'center', width: pageWidth });
    doc.font('Helvetica').fontSize(9).fillColor(`#${MUTED}`)
      .text(`Nomor: ${model.letterNumber}`, { align: 'center', width: pageWidth });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
      .text('Yang bertanda tangan di bawah ini menerangkan bahwa:', { width: pageWidth });
    doc.moveDown(0.6);

    const rows: Array<[string, string]> = [
      ['Nama', model.applicantName],
      ['Jabatan / Peran', ROLE_LABEL[model.applicantRole] || model.applicantRole],
      ['Jenis keterangan', TYPE_LABEL[model.type]],
      ['Tanggal mulai', formatIdDate(model.startDate)],
      ['Tanggal selesai', formatIdDate(model.endDate)],
      ['Alasan', model.reason],
      ['Keputusan', 'DISETUJUI'],
      ['Catatan peninjau', model.decisionNote || '—'],
      ['Ditinjau oleh', model.reviewedByName || '—'],
      ['Tanggal keputusan', model.reviewedAt ? formatIdDate(model.reviewedAt) : '—']
    ];

    for (const [label, value] of rows) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(`#${MUTED}`).text(label, doc.page.margins.left, y, { width: 130 });
      doc.font('Helvetica').fontSize(10).fillColor(`#${TEXT}`)
        .text(value, doc.page.margins.left + 140, y, { width: pageWidth - 140 });
      doc.moveDown(0.35);
    }

    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor(`#${TEXT}`)
      .text(model.visitInstruction, { width: pageWidth, align: 'justify' });
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor(`#${MUTED}`)
      .text('Dokumen ini dicetak dari SIAB2 dan wajib ditandatangani basah oleh Admin/TU serta pemohon di hadapan Admin TU.', {
        width: pageWidth
      });

    doc.moveDown(1.4);
    const colWidth = (pageWidth - 24) / 2;
    const signTop = doc.y;
    const leftX = doc.page.margins.left;
    const rightX = leftX + colWidth + 24;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(`#${TEXT}`)
      .text('Admin / TU', leftX, signTop, { width: colWidth, align: 'center' });
    doc.text('Pemohon', rightX, signTop, { width: colWidth, align: 'center' });

    doc.font('Helvetica').fontSize(8).fillColor(`#${MUTED}`)
      .text('(tanda tangan basah + stempel)', leftX, signTop + 14, { width: colWidth, align: 'center' });
    doc.text('(tanda tangan basah)', rightX, signTop + 14, { width: colWidth, align: 'center' });

    const lineY = signTop + 90;
    doc.moveTo(leftX + 20, lineY).lineTo(leftX + colWidth - 20, lineY).strokeColor(`#${MUTED}`).lineWidth(0.8).stroke();
    doc.moveTo(rightX + 20, lineY).lineTo(rightX + colWidth - 20, lineY).stroke();

    doc.font('Helvetica').fontSize(9).fillColor(`#${TEXT}`)
      .text(model.reviewedByName || '................................', leftX, lineY + 8, { width: colWidth, align: 'center' });
    doc.text(model.applicantName, rightX, lineY + 8, { width: colWidth, align: 'center' });

    doc.fontSize(7).fillColor(`#${MUTED}`)
      .text(`Dicetak ${model.generatedAt} · ${model.letterNumber}`, doc.page.margins.left, doc.page.height - 36, {
        width: pageWidth,
        align: 'center'
      });

    doc.end();
  });
}
