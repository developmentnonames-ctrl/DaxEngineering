import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export const LABEL_SHEET = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  columns: 3,
  rows: 8,
  cellWidthMm: 70,
  cellHeightMm: 37,
  marginLeftMm: 0,
  marginTopMm: 0.5,
  gapXMm: 0,
  gapYMm: 0,
  paddingMm: 3,
  qrSizeMm: 28,
  qrQuietModules: 2,
} as const;

export type SheetGeometry = typeof LABEL_SHEET;

export const perSheet = (g: SheetGeometry = LABEL_SHEET) => g.columns * g.rows;

export interface LabelSlot {
  page: number;
  row: number;
  column: number;
  xMm: number;
  yMm: number;
}

export function labelSlots(
  count: number,
  skip: number,
  g: SheetGeometry = LABEL_SHEET,
): LabelSlot[] {
  const size = perSheet(g);
  const slots: LabelSlot[] = [];
  for (let i = 0; i < count; i++) {
    const index = skip + i;
    const within = index % size;
    const row = Math.floor(within / g.columns);
    const column = within % g.columns;
    slots.push({
      page: Math.floor(index / size),
      row,
      column,
      xMm: g.marginLeftMm + column * (g.cellWidthMm + g.gapXMm),
      yMm: g.marginTopMm + row * (g.cellHeightMm + g.gapYMm),
    });
  }
  return slots;
}

export function withCopies<T>(labels: readonly T[], copies: number): T[] {
  return labels.flatMap((label) => Array.from({ length: copies }, () => label));
}

export type LabelContent =
  | {
      kind: 'item';
      url: string;
      partNo: string;
      brand: string;
      description: string;
      uom: string;
    }
  | {
      kind: 'bin';
      url: string;
      code: string;
      zone: string;
      binKind: string | null;
    };

const PT_PER_MM = 72 / 25.4;
export const mm = (value: number) => value * PT_PER_MM;

type Doc = PDFKit.PDFDocument;

function drawQr(doc: Doc, url: string, x: number, y: number, size: number) {
  const matrix = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const quiet = LABEL_SHEET.qrQuietModules;
  const module = size / (matrix.size + quiet * 2);
  for (let r = 0; r < matrix.size; r++) {
    let c = 0;
    while (c < matrix.size) {
      if (!matrix.get(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < matrix.size && matrix.get(r, c)) c++;
      doc.rect(
        x + (start + quiet) * module,
        y + (r + quiet) * module,
        (c - start) * module,
        module,
      );
    }
  }
  doc.fillColor('black').fill();
}

function fitSize(
  doc: Doc,
  text: string,
  font: string,
  width: number,
  max: number,
  min: number,
): number {
  doc.font(font);
  let size = max;
  while (size > min && doc.fontSize(size).widthOfString(text) > width) {
    size -= 0.5;
  }
  return size;
}

function line(
  doc: Doc,
  text: string,
  font: string,
  size: number,
  x: number,
  y: number,
  width: number,
  lines = 1,
): number {
  doc.font(font).fontSize(size);
  const height = doc.currentLineHeight(true) * lines;
  doc.text(text, x, y, { width, height, ellipsis: true, lineGap: 0 });
  return y + height + mm(0.8);
}

const BIN_KIND_LABEL: Record<string, string> = {
  RECEIVING: 'Receiving',
  QUARANTINE: 'Quarantine',
  WARRANTY: 'Warranty',
};

function drawText(
  doc: Doc,
  label: LabelContent,
  x: number,
  y: number,
  w: number,
) {
  if (label.kind === 'item') {
    const size = fitSize(doc, label.partNo, 'Helvetica-Bold', w, 11, 7);
    let next = line(doc, label.partNo, 'Helvetica-Bold', size, x, y, w);
    next = line(doc, label.brand, 'Helvetica', 8, x, next, w);
    next = line(doc, label.description, 'Helvetica', 7, x, next, w, 3);
    line(doc, label.uom, 'Helvetica', 7, x, next, w);
    return;
  }
  const size = fitSize(doc, label.code, 'Helvetica-Bold', w, 16, 8);
  let next = line(doc, label.code, 'Helvetica-Bold', size, x, y, w);
  next = line(doc, label.zone, 'Helvetica', 8, x, next, w, 2);
  if (label.binKind) {
    line(
      doc,
      BIN_KIND_LABEL[label.binKind] ?? label.binKind,
      'Helvetica-Bold',
      8,
      x,
      next,
      w,
    );
  }
}

export function renderLabels(
  labels: readonly LabelContent[],
  skip: number,
  g: SheetGeometry = LABEL_SHEET,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [mm(g.pageWidthMm), mm(g.pageHeightMm)],
    margin: 0,
    autoFirstPage: false,
    info: { Title: 'Labels' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const slots = labelSlots(labels.length, skip, g);
  const qr = mm(g.qrSizeMm);
  const pad = mm(g.paddingMm);
  let page = -1;
  labels.forEach((label, i) => {
    const slot = slots[i];
    if (!slot) return;
    while (page < slot.page) {
      doc.addPage({ size: [mm(g.pageWidthMm), mm(g.pageHeightMm)], margin: 0 });
      page++;
    }
    const x = mm(slot.xMm);
    const y = mm(slot.yMm);
    const cellH = mm(g.cellHeightMm);
    const qrY = y + (cellH - qr) / 2;
    drawQr(doc, label.url, x + pad, qrY, qr);
    const textX = x + pad + qr + mm(2);
    const textW = mm(g.cellWidthMm) - (textX - x) - pad;
    drawText(doc, label, textX, qrY + mm(1), textW);
  });
  if (page < 0) doc.addPage();
  doc.end();
  return done;
}
