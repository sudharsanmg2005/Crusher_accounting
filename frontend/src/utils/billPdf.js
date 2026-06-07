import jsPDF from 'jspdf';

const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatTime = (date) => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const downloadBillPdf = (bill) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 18;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('Krishna Blue Metals', pageWidth / 2, y, { align: 'center' });
  y += 12;

  doc.setFontSize(11);
  doc.text(`Bill No : ${bill.billNumber || bill._id?.slice(-6) || '-'}`, margin, y);
  y += 8;

  const dateStr = formatDate(bill.date);
  const timeStr = formatTime(bill.date);
  doc.text(`Date : ${dateStr}`, margin, y);
  doc.text(`Time : ${timeStr}`, pageWidth - margin, y, { align: 'right' });
  y += 8;

  doc.text(`Customer Name : ${bill.customerNameSnapshot || '-'}`, margin, y);
  y += 8;

  if (bill.vehicleNumber) {
    doc.text(`Vehicle No : ${bill.vehicleNumber}`, margin, y);
    y += 8;
  }

  const unitLabel = bill.quantityUnit === 'ton' ? 'ton' : 'unit';
  const rateLabel = `Rate/${unitLabel}`;
  doc.text(`Material : ${bill.materialNameSnapshot || '-'}`, margin, y);
  doc.text(`${rateLabel} : ${Number(bill.pricePerUnit || 0).toLocaleString()}`, pageWidth - margin, y, { align: 'right' });
  y += 8;

  doc.text(`Load Weight : ${bill.quantity} ${unitLabel}${bill.quantity !== 1 ? 's' : ''}`, margin, y);
  y += 10;

  const materialTotal = Number(bill.totalAmount || 0);
  const passAmount = Number(bill.passAmount || 0);
  const grandTotal = materialTotal + passAmount;

  doc.text(`Total Material Price : ${materialTotal.toLocaleString()}`, margin + 8, y);
  y += 8;
  doc.text(`Pass : ${passAmount.toLocaleString()}`, margin + 8, y);
  y += 10;
  doc.setFont('times', 'bold');
  doc.text(`Total : ${grandTotal.toLocaleString()}`, margin + 8, y);

  doc.save(`Bill-${bill.billNumber || bill._id?.slice(-6) || 'invoice'}.pdf`);
};
