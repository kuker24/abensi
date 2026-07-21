export const DEFAULT_CARD_TEMPLATE_ID = 'siab2-official-vertical';

export const CARD_TEMPLATES = {
  [DEFAULT_CARD_TEMPLATE_ID]: {
    id: DEFAULT_CARD_TEMPLATE_ID,
    name: 'SIAB2 Official Vertical',
    label: 'SIAB2 Resmi Vertikal',
    description: 'Kartu tanda pengenal resmi portrait untuk operasional MAN 1 Rokan Hulu.',
    dimensions: {
      widthMm: 53.98,
      heightMm: 85.6,
      renderWidthPx: 324,
      renderHeightPx: 514,
      orientation: 'portrait',
    },
    pdf: {
      columns: 3,
      rows: 3,
      cardsPerPage: 9,
      marginX: 16,
      marginTop: 18,
      spacingX: 6,
      spacingY: 5,
      headerHeight: 12,
    },
  },
};

export const DEFAULT_CARD_SETTINGS = {
  cardSkin: DEFAULT_CARD_TEMPLATE_ID,
  schoolName: 'MAN 1 Rokan Hulu',
  brandName: 'SIAB2',
  tagline: 'Sistem Informasi Akademik Berkarakter',
  academicYear: '2025/2026',
  showCutMarks: true,
};

export const REQUIRED_CARD_FIELDS = ['nama', 'qr'];

export const REQUIRED_CARD_FIELD_LABELS = {
  nama: 'Nama',
  qr: 'QR',
};

export const getCardTemplate = (templateId = DEFAULT_CARD_TEMPLATE_ID) => {
  return CARD_TEMPLATES[templateId] || CARD_TEMPLATES[DEFAULT_CARD_TEMPLATE_ID];
};

export const getCardTemplateOptions = () => Object.values(CARD_TEMPLATES);
