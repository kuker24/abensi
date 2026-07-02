import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import React from 'react';
import IDCard from '../components/cards/IDCard';
import { DEFAULT_CARD_SETTINGS, getCardTemplate } from './cardTemplates';

const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const CAPTURE_SCALE = 2;
const BATCH_SIZE = 36;

let sharedContainer = null;
let sharedRoot = null;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const getResolvedSettings = (options = {}) => ({
  ...DEFAULT_CARD_SETTINGS,
  ...options,
  ...(options.settings || {}),
});

const initSharedRenderer = (template) => {
  const { renderWidthPx, renderHeightPx } = template.dimensions;

  if (!sharedContainer) {
    sharedContainer = document.createElement('div');
    sharedContainer.style.position = 'fixed';
    sharedContainer.style.left = '-10000px';
    sharedContainer.style.top = '0';
    sharedContainer.style.pointerEvents = 'none';
    sharedContainer.style.backgroundColor = 'transparent';
    sharedContainer.style.zIndex = '-1';
    document.body.appendChild(sharedContainer);
    sharedRoot = createRoot(sharedContainer);
  }

  sharedContainer.style.width = `${renderWidthPx}px`;
  sharedContainer.style.height = `${renderHeightPx}px`;
  sharedContainer.style.overflow = 'hidden';

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

const renderCardToImage = async ({ user, settings, container, root }) => {
  flushSync(() => {
    root.render(React.createElement(IDCard, {
      user,
      settings,
      scale: 1,
    }));
  });

  await nextFrame();

  const canvas = await html2canvas(container, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: null,
    imageTimeout: 15000,
  });

  return canvas.toDataURL('image/png');
};

const calculateCardPositions = (template) => {
  const positions = [];
  const { widthMm, heightMm } = template.dimensions;
  const { columns, rows, marginX, marginTop, spacingX, spacingY } = template.pdf;
  const gridWidth = columns * widthMm + (columns - 1) * spacingX;
  const startX = Math.max(marginX, (A4_WIDTH - gridWidth) / 2);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      positions.push({
        x: startX + col * (widthMm + spacingX),
        y: marginTop + row * (heightMm + spacingY),
      });
    }
  }

  return positions;
};

const drawCutMarks = (pdf, x, y, width, height) => {
  const mark = 2.2;
  const gap = 0.7;

  pdf.setDrawColor(178, 196, 210);
  pdf.setLineWidth(0.12);

  const corners = [
    [x, y, 1, 1],
    [x + width, y, -1, 1],
    [x, y + height, 1, -1],
    [x + width, y + height, -1, -1],
  ];

  corners.forEach(([cx, cy, sx, sy]) => {
    pdf.line(cx + sx * gap, cy, cx + sx * (gap + mark), cy);
    pdf.line(cx, cy + sy * gap, cx, cy + sy * (gap + mark));
  });
};

const addPageHeader = (pdf, title, schoolName, academicYear, currentPage, totalPages) => {
  pdf.setFillColor(5, 8, 11);
  pdf.rect(0, 0, A4_WIDTH, 12, 'F');

  pdf.setFillColor(111, 166, 216);
  pdf.rect(0, 0, 3, 12, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(title, 8, 5.2);

  pdf.setTextColor(184, 205, 222);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(`${schoolName} · Tahun Ajaran ${academicYear}`, 8, 9.2);

  pdf.setTextColor(92, 116, 134);
  pdf.setFontSize(7);
  pdf.text(`Halaman ${currentPage}/${totalPages}`, A4_WIDTH - 8, A4_HEIGHT - 5, { align: 'right' });
};

/**
 * Generate print-ready A4 portrait PDF with official vertical ID cards.
 * Default card size: CR80 portrait 53.98mm x 85.60mm, 9 cards per A4 page.
 * @param {Array} users - Array of validated user objects
 * @param {Object} options - PDF/card options
 * @returns {Promise<Blob>} - PDF blob
 */
export const generatePDF = async (users, options = {}) => {
  if (!users?.length) {
    throw new Error('Tidak ada data siap export. Lengkapi field wajib terlebih dahulu.');
  }

  const settings = getResolvedSettings(options);
  const template = getCardTemplate(settings.cardSkin);
  const { widthMm, heightMm } = template.dimensions;
  const cardsPerPage = template.pdf.cardsPerPage;
  const title = options.title || 'Kartu Digital Madrasah SIAB2';
  const totalUsers = users.length;
  const totalPages = Math.ceil(totalUsers / cardsPerPage);
  const totalBatches = Math.ceil(totalUsers / BATCH_SIZE);
  const cardPositions = calculateCardPositions(template);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const { container, root } = initSharedRenderer(template);

  try {
    let processedCount = 0;

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) pdf.addPage();

      addPageHeader(
        pdf,
        title,
        settings.schoolName,
        settings.academicYear,
        pageIndex + 1,
        totalPages
      );

      const pageStart = pageIndex * cardsPerPage;
      const pageUsers = users.slice(pageStart, pageStart + cardsPerPage);

      for (let i = 0; i < pageUsers.length; i++) {
        const user = pageUsers[i];
        const position = cardPositions[i];
        const imageData = await renderCardToImage({ user, settings, container, root });

        if (settings.showCutMarks) {
          drawCutMarks(pdf, position.x, position.y, widthMm, heightMm);
        }

        pdf.addImage(
          imageData,
          'PNG',
          position.x,
          position.y,
          widthMm,
          heightMm,
          undefined,
          'FAST'
        );

        processedCount += 1;
        options.onProgress?.({
          current: processedCount,
          total: totalUsers,
          user: user.nama,
          batch: Math.ceil(processedCount / BATCH_SIZE),
          totalBatches,
          page: pageIndex + 1,
          totalPages,
        });
      }

      await nextFrame();
    }

    return pdf.output('blob');
  } finally {
    cleanupSharedRenderer();
  }
};

export const generateSingleCardPDF = async (user, options = {}) => {
  if (!user) throw new Error('Data kartu tidak tersedia.');

  const settings = getResolvedSettings(options);
  const template = getCardTemplate(settings.cardSkin);
  const { widthMm, heightMm } = template.dimensions;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  });

  const { container, root } = initSharedRenderer(template);

  try {
    const imageData = await renderCardToImage({ user, settings, container, root });
    pdf.addImage(imageData, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
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

export const getCardDimensions = (cardSkin) => {
  const template = getCardTemplate(cardSkin);
  return {
    width: template.dimensions.widthMm,
    height: template.dimensions.heightMm,
    widthPx: template.dimensions.renderWidthPx,
    heightPx: template.dimensions.renderHeightPx,
    orientation: template.dimensions.orientation,
    cardsPerPage: template.pdf.cardsPerPage,
  };
};

export default {
  generatePDF,
  generateSingleCardPDF,
  downloadPDF,
  printPDF,
  getCardDimensions,
};
