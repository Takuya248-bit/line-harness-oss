import { jsPDF } from 'jspdf';
import type { Invoice } from './notion.js';
import { COMPANY, BANK, GREETING_INVOICE, GREETING_ESTIMATE } from '../templates/layout.js';
import { notoSansJPRegular, notoSansJPBold } from './fonts.js';

function formatJapaneseDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  return `${y}年${mo}月${d}日`;
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

export function generateInvoicePDF(invoice: Invoice): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isEstimate = invoice.type === 'estimate';
  const title = isEstimate ? '見積書' : '請求書';
  const greeting = isEstimate ? GREETING_ESTIMATE : GREETING_INVOICE;
  const amountLabel = isEstimate ? 'お見積金額' : 'ご請求金額';

  doc.addFileToVFS('NotoSansJP-Regular.ttf', notoSansJPRegular);
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
  doc.addFileToVFS('NotoSansJP-Bold.ttf', notoSansJPBold);
  doc.addFont('NotoSansJP-Bold.ttf', 'NotoSansJP', 'bold');
  doc.setFont('NotoSansJP', 'normal');

  const pageWidth = 210;
  const margin = 20;
  let y = 20;

  doc.setFontSize(10);
  doc.text(formatJapaneseDate(invoice.issued_date), pageWidth - margin, y, { align: 'right' });
  y += 6;
  doc.text(`${isEstimate ? '見積' : '請求'}番号: ${invoice.invoice_number}`, pageWidth - margin, y, {
    align: 'right',
  });
  y += 12;

  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(24);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 16;

  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(14);
  doc.text(`${invoice.recipient_name} 様`, margin, y);
  y += 8;
  doc.setFont('NotoSansJP', 'normal');
  doc.setFontSize(10);
  doc.text(greeting, margin, y);
  y += 8;
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(14);
  doc.text(`${amountLabel}`, margin, y);
  doc.text(`${formatYen(invoice.total)}-`, margin + 50, y);

  const companyX = 120;
  let companyY = y - 16;
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(10);
  doc.text(COMPANY.name_en, companyX, companyY);
  companyY += 5;
  doc.text(COMPANY.name_ja, companyX, companyY);
  companyY += 5;
  doc.text(COMPANY.representative, companyX, companyY);
  companyY += 6;
  doc.setFont('NotoSansJP', 'normal');
  doc.setFontSize(9);
  doc.text(COMPANY.address_1, companyX, companyY);
  companyY += 4;
  doc.text(COMPANY.address_2, companyX, companyY);
  companyY += 5;
  doc.text(COMPANY.email, companyX, companyY);

  y += 16;

  const tableX = margin;
  const colWidths = { name: 85, qty: 20, price: 30, amount: 35 };
  const tableWidth = colWidths.name + colWidths.qty + colWidths.price + colWidths.amount;
  const rowHeight = 8;

  doc.setFillColor(50, 50, 50);
  doc.rect(tableX, y, tableWidth, rowHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('NotoSansJP', 'bold');
  doc.text('品番・品名', tableX + 2, y + 5.5);
  doc.text('数量', tableX + colWidths.name + colWidths.qty / 2, y + 5.5, { align: 'center' });
  doc.text(
    '単価',
    tableX + colWidths.name + colWidths.qty + colWidths.price / 2,
    y + 5.5,
    { align: 'center' },
  );
  doc.text(
    '金額',
    tableX + colWidths.name + colWidths.qty + colWidths.price + colWidths.amount / 2,
    y + 5.5,
    { align: 'center' },
  );
  y += rowHeight;

  doc.setTextColor(0, 0, 0);
  doc.setFont('NotoSansJP', 'normal');

  const maxRows = 10;
  for (let i = 0; i < maxRows; i++) {
    const item = invoice.items[i];
    doc.setDrawColor(200, 200, 200);
    doc.rect(tableX, y, colWidths.name, rowHeight);
    doc.rect(tableX + colWidths.name, y, colWidths.qty, rowHeight);
    doc.rect(tableX + colWidths.name + colWidths.qty, y, colWidths.price, rowHeight);
    doc.rect(tableX + colWidths.name + colWidths.qty + colWidths.price, y, colWidths.amount, rowHeight);

    if (item) {
      doc.text(item.name, tableX + 2, y + 5.5);
      doc.text(String(item.quantity), tableX + colWidths.name + colWidths.qty / 2, y + 5.5, {
        align: 'center',
      });
      doc.text(
        item.unit_price.toLocaleString('ja-JP'),
        tableX + colWidths.name + colWidths.qty + colWidths.price - 2,
        y + 5.5,
        { align: 'right' },
      );
      doc.text(item.amount.toLocaleString('ja-JP'), tableX + tableWidth - 2, y + 5.5, {
        align: 'right',
      });
    }
    y += rowHeight;
  }

  const subtotal = invoice.items.reduce((sum, item) => sum + item.amount, 0);
  const totalX = tableX + colWidths.name;
  const totalWidth = colWidths.qty + colWidths.price + colWidths.amount;
  doc.setFont('NotoSansJP', 'bold');
  doc.rect(totalX, y, totalWidth, rowHeight);
  doc.text('小計', totalX + 2, y + 5.5);
  doc.text(subtotal.toLocaleString('ja-JP'), tableX + tableWidth - 2, y + 5.5, { align: 'right' });
  y += rowHeight;
  doc.rect(totalX, y, totalWidth, rowHeight);
  doc.text('合計', totalX + 2, y + 5.5);
  doc.text(invoice.total.toLocaleString('ja-JP'), tableX + tableWidth - 2, y + 5.5, {
    align: 'right',
  });
  y += rowHeight + 8;

  doc.setFont('NotoSansJP', 'normal');
  doc.setFontSize(9);
  const noteLines = invoice.notes.split('\n');
  for (const line of noteLines) {
    doc.text(line, margin, y);
    y += 4.5;
  }

  const footerY = 275;
  doc.setDrawColor(100, 100, 100);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(9);
  doc.text(BANK.label, margin, footerY);
  doc.setFont('NotoSansJP', 'normal');
  doc.text(BANK.detail, margin, footerY + 5);

  return doc.output('arraybuffer');
}
