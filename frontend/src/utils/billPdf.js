import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const downloadBillPdf = (bill) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 18;

  // Title Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('RETAIL BILL / INVOICE', pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Horizontal line separator
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Metadata Table (Bill Info)
  const dateStr = formatDate(bill.date);
  const metaBody = [
    [
      { content: `Customer : ${bill.customerNameSnapshot || '-'}`, styles: { fontStyle: 'bold' } },
      { content: `Date : ${dateStr}`, styles: { halign: 'right' } }
    ],
    [
      { content: `Vehicle No : ${bill.vehicleNumber || '-'}` },
      { content: '', styles: { halign: 'right' } }
    ]
  ];

  autoTable(doc, {
    body: metaBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 0 }, textColor: [71, 85, 105] }, // slate-600
    columnStyles: {
      0: { cellWidth: 60, halign: 'left' },
      1: { cellWidth: 60, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 6;

  // Transaction Details Table
  const unitLabel = bill.quantityUnit === 'ton' ? 'ton' : 'unit';
  const rateLabel = `Rs. ${Number(bill.pricePerUnit || 0).toLocaleString('en-IN')}/${unitLabel}`;
  const materialTotal = Number(bill.totalAmount || 0);
  const passAmount = Number(bill.passAmount || 0);
  const grandTotal = materialTotal + passAmount;

  const head = [['Particulars', 'Qty / Weight', 'Rate', 'Amount (Rs.)']];
  const body = [
    [
      `Material: ${bill.materialNameSnapshot || '-'}`,
      `${Number(bill.quantity || 0).toFixed(2)} ${unitLabel}${bill.quantity !== 1 ? 's' : ''}`,
      rateLabel,
      materialTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ],
    [
      'Pass Charges',
      '-',
      '-',
      passAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ]
  ];

  // Add Grand Total row as footer using exact column structure for alignment
  const foot = [
    [
      '',
      '',
      { content: 'Total Amount', styles: { fontStyle: 'bold', halign: 'right' } },
      { content: `Rs. ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { fontStyle: 'bold', halign: 'right' } }
    ]
  ];

  autoTable(doc, {
    head,
    body,
    foot,
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 3.5, valign: 'middle', textColor: [30, 41, 59] }, // slate-800
    headStyles: { font: 'helvetica', fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 }, // slate-700
    columnStyles: {
      0: { halign: 'left', cellWidth: 45 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 25 }
    },
    footStyles: { font: 'helvetica', fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 10 } // slate-100 / slate-900
  });

  // Footer note
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Thank you for your business!', pageWidth / 2, 200, { align: 'center' });

  doc.save(`Bill-${(bill.customerNameSnapshot || 'invoice').replace(/\s+/g, '_')}-${dateStr.replace(/\//g, '_')}.pdf`);
};
