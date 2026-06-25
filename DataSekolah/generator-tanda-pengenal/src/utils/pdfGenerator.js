import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import React from 'react';
import IDCard from '../components/cards/IDCard';
import {
  CARD_HEIGHT_MM,
  CARD_PIXEL_HEIGHT,
  CARD_PIXEL_WIDTH,
  CARD_WIDTH_MM,
} from '../components/cards/cardConfig';

// ID card gantungan/portrait: 5.5 × 8.5 cm
const CARD_WIDTH = CARD_WIDTH_MM;
const CARD_HEIGHT = CARD_HEIGHT_MM;
const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const CARD_SPACING_X = 5;
const CARD_SPACING_Y = 5;
const COLUMNS = 3;
const ROWS = 3;
const CARDS_PER_PAGE = COLUMNS * ROWS;
const MARGIN_LEFT = (A4_WIDTH - COLUMNS * CARD_WIDTH - (COLUMNS - 1) * CARD_SPACING_X) / 2;
const MARGIN_TOP = 22;
const BATCH_SIZE = 45;

let sharedContainer = null;
let sharedRoot = null;

const initSharedRenderer = () => {
  if (!sharedContainer) {
    sharedContainer = document.createElement('div');
    sharedContainer.style.position = 'fixed';
    sharedContainer.style.left = '-10000px';
    sharedContainer.style.top = '0';
    sharedContainer.style.width = `${CARD_PIXEL_WIDTH}px`;
    sharedContainer.style.height = `${CARD_PIXEL_HEIGHT}px`;
    sharedContainer.style.backgroundColor = '#ffffff';
    sharedContainer.style.overflow = 'hidden';
    document.body.appendChild(sharedContainer);
    sharedRoot = createRoot(sharedContainer);
  }
  return { container: sharedContainer, root: sharedRoot };
};

const cleanupSharedRenderer = () => {
  if (sharedContainer) {
    sharedRoot?.unmount();
    document.body.removeChild(sharedContainer);
    sharedContainer = null;
    sharedRoot = null;
  }
};

const waitForImages = async (container) => {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    })
  );
};

const renderCardToCanvas = async (root, container, user, options) => {
  flushSync(() => {
    root.render(React.createElement(IDCard, { user, ...options, scale: 1 }));
  });

  await waitForImages(container);

  return html2canvas(container, {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    imageTimeout: 15000,
  });
};

export const generatePDF = async (users, options = {}) => {
  const {
    title = 'Kartu Identitas SIAB2',
    schoolName = 'MAN 1 Rokan Hulu',
    programName = 'SIAB2',
    examPeriod,
    onProgress = () => {},
  } = options;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const cardPositions = calculateCardPositions();
  const totalUsers = users.length;
  const totalBatches = Math.ceil(totalUsers / BATCH_SIZE);
  const { container, root } = initSharedRenderer();

  try {
    let processedCount = 0;
    let currentPageInPDF = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalUsers);
      const batchUsers = users.slice(batchStart, batchEnd);
      const batchPages = Math.ceil(batchUsers.length / CARDS_PER_PAGE);

      for (let pageInBatch = 0; pageInBatch < batchPages; pageInBatch++) {
        if (currentPageInPDF > 0) pdf.addPage();

        const pageStart = pageInBatch * CARDS_PER_PAGE;
        const pageEnd = Math.min(pageStart + CARDS_PER_PAGE, batchUsers.length);
        const pageUsers = batchUsers.slice(pageStart, pageEnd);
        const actualPageNumber = currentPageInPDF + 1;
        const totalPages = Math.ceil(totalUsers / CARDS_PER_PAGE);

        addPageHeader(pdf, title, schoolName, programName || examPeriod, actualPageNumber, totalPages);

        for (let i = 0; i < pageUsers.length; i++) {
          const user = pageUsers[i];
          const position = cardPositions[i];

          const canvas = await renderCardToCanvas(root, container, user, {
            schoolName,
            programName: programName || examPeriod,
          });
          const imgData = canvas.toDataURL('image/png');

          pdf.addImage(imgData, 'PNG', position.x, position.y, CARD_WIDTH, CARD_HEIGHT, undefined, 'FAST');
          addCutGuides(pdf, position.x, position.y, CARD_WIDTH, CARD_HEIGHT);

          processedCount++;
          onProgress({
            current: processedCount,
            total: totalUsers,
            user: user.nama || user.fullName,
            batch: batchIndex + 1,
            totalBatches,
            batchProgress: `${batchIndex + 1}/${totalBatches}`,
          });
        }

        currentPageInPDF++;
      }

      if (batchIndex < totalBatches - 1) {
        onProgress({
          current: processedCount,
          total: totalUsers,
          batch: batchIndex + 1,
          totalBatches,
          batchComplete: true,
          message: `Batch ${batchIndex + 1} selesai. Memuat batch berikutnya...`,
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return pdf.output('blob');
  } finally {
    cleanupSharedRenderer();
  }
};

const calculateCardPositions = () => {
  const positions = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      positions.push({
        x: MARGIN_LEFT + col * (CARD_WIDTH + CARD_SPACING_X),
        y: MARGIN_TOP + row * (CARD_HEIGHT + CARD_SPACING_Y),
      });
    }
  }

  return positions;
};

const addCutGuides = (pdf, x, y, width, height) => {
  const mark = 3;
  const gap = 0.8;
  const right = x + width;
  const bottom = y + height;

  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.15);

  pdf.line(x - mark, y, x - gap, y);
  pdf.line(x, y - mark, x, y - gap);
  pdf.line(right + gap, y, right + mark, y);
  pdf.line(right, y - mark, right, y - gap);
  pdf.line(x - mark, bottom, x - gap, bottom);
  pdf.line(x, bottom + gap, x, bottom + mark);
  pdf.line(right + gap, bottom, right + mark, bottom);
  pdf.line(right, bottom + gap, right, bottom + mark);
};

const addPageHeader = (pdf, title, schoolName, programName, currentPage, totalPages) => {
  pdf.setFillColor(4, 120, 87);
  pdf.rect(0, 0, A4_WIDTH, 15, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, A4_WIDTH / 2, 6, { align: 'center' });

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${schoolName} | ${programName || 'SIAB2'}`, A4_WIDTH / 2, 11, { align: 'center' });

  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8);
  pdf.text('Potong mengikuti tanda sudut abu-abu. Ukuran kartu 55 × 85 mm.', A4_WIDTH / 2, A4_HEIGHT - 5, { align: 'center' });
  pdf.text(`Halaman ${currentPage} dari ${totalPages}`, A4_WIDTH - 10, A4_HEIGHT - 5, { align: 'right' });
};

export const generateSingleCardPDF = async (user, options = {}) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [CARD_WIDTH, CARD_HEIGHT],
    compress: true,
  });

  const { container, root } = initSharedRenderer();

  try {
    const canvas = await renderCardToCanvas(root, container, user, options);
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, CARD_WIDTH, CARD_HEIGHT, undefined, 'FAST');

    return pdf.output('blob');
  } finally {
    cleanupSharedRenderer();
  }
};

export const downloadPDF = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const printPDF = (blob) => {
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');

  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};

export const getCardDimensions = (scale = 1) => ({
  width: CARD_WIDTH * 3.7795275591 * scale,
  height: CARD_HEIGHT * 3.7795275591 * scale,
});

export const getPrintLayout = () => ({
  cardWidthMm: CARD_WIDTH,
  cardHeightMm: CARD_HEIGHT,
  columns: COLUMNS,
  rows: ROWS,
  cardsPerPage: CARDS_PER_PAGE,
});

export default {
  generatePDF,
  generateSingleCardPDF,
  downloadPDF,
  printPDF,
  getCardDimensions,
  getPrintLayout,
};
