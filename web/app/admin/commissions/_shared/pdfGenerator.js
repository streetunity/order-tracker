// PDF report generation for commission payouts.
// Two flavors: by agent + date range, or from a pre-selected list.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateString, toOrdinal } from "./formatters";

const addSignatureSection = (doc, startY) => {
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Accountant Signature:", 14, startY);
  doc.line(55, startY, 120, startY);
  doc.text("Date:", 130, startY);
  doc.line(145, startY, 190, startY);
};

const loadLogo = async () => {
  const logoImg = new Image();
  logoImg.src = "/smt-logo.png";
  await new Promise((res, rej) => { logoImg.onload = res; logoImg.onerror = rej; });
  return logoImg;
};

export async function generateAgentPdfReport({ pdfAgent, pdfStartDate, pdfEndDate, stageSettings, getAuthHeaders }) {
  const params = new URLSearchParams({ salesPerson: pdfAgent, startDate: pdfStartDate, endDate: pdfEndDate });
  const res = await fetch(`/api/commissions/payouts/paid?${params}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch commission data");
  const payouts = await res.json();
  if (payouts.length === 0) throw new Error("No paid commissions found for selected period");

  const logoImg = await loadLogo();
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const lw = 30;
  const lh = (logoImg.height / logoImg.width) * lw;
  doc.addImage(logoImg, "PNG", pw - lw - 14, 10, lw, lh);

  doc.setFontSize(18); doc.setFont(undefined, "bold");
  doc.text("Commission Payout Report", 14, 20);
  doc.setFontSize(12); doc.setFont(undefined, "normal");
  doc.text(`Sales Agent: ${pdfAgent}`, 14, 35);
  doc.text(`Pay Period: ${formatDateString(pdfStartDate)} - ${formatDateString(pdfEndDate)}`, 14, 42);
  doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, 49);

  const totalPaid = payouts.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const tableData = payouts.map(p => {
    const matchIdx = stageSettings.findIndex(s => s.stage === p.stage);
    const pn = matchIdx >= 0
      ? matchIdx + 1
      : (Number.isInteger(p.phaseIndex) ? Math.min(p.phaseIndex, stageSettings.length - 1) + 1 : 0);
    const cr = p.itemCommission?.commission?.commissionRate || 0;
    const pctShare = (p.percentage != null) ? p.percentage : (stageSettings.length > 0 ? 100 / stageSettings.length : 100);
    const acp = (cr * pctShare / 100).toFixed(2);
    return [
      p.itemCommission?.commission?.order?.account?.name || "N/A",
      p.itemCommission?.productCode || "N/A",
      pn > 0 ? toOrdinal(pn) : "N/A",
      `$${parseFloat(p.amount || 0).toFixed(2)}`,
      `${acp}%`,
      p.paymentMethod || "N/A",
      new Date(p.paidAt).toLocaleDateString(),
    ];
  });

  autoTable(doc, {
    startY: 55,
    head: [["Customer", "Item", "Stage", "Amount", "Commission %", "Method", "Paid Date"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [60, 60, 60], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "center" } },
  });

  const fy = doc.lastAutoTable.finalY;
  doc.setFontSize(12); doc.setFont(undefined, "bold");
  doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, pw - 14, fy + 10, { align: "right" });

  const sy = fy + 30;
  if (sy + 40 > ph - 20) { doc.addPage(); addSignatureSection(doc, 30); }
  else { addSignatureSection(doc, sy); }

  doc.save(`Commission_Report_${pdfAgent.replace(/\s+/g, "_")}_${pdfStartDate}_to_${pdfEndDate}.pdf`);
}

export async function generateSelectedPdfReport({ items, stageSettings }) {
  if (items.length === 0) throw new Error("No selected commissions found");

  const logoImg = await loadLogo();
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const lw = 30;
  const lh = (logoImg.height / logoImg.width) * lw;
  doc.addImage(logoImg, "PNG", pw - lw - 14, 10, lw, lh);

  doc.setFontSize(18); doc.setFont(undefined, "bold");
  doc.text("Commission Payout Report", 14, 20);

  const reps = [...new Set(items.map(p => p.itemCommission?.commission?.salesPersonName).filter(Boolean))];
  const repText = reps.length === 1 ? reps[0] : `${reps.length} Sales Reps`;
  const dates = items.map(p => new Date(p.paidAt)).sort((a, b) => a - b);

  doc.setFontSize(12); doc.setFont(undefined, "normal");
  doc.text(`Sales Agent: ${repText}`, 14, 35);
  doc.text(`Pay Period: ${dates[0].toLocaleDateString()} - ${dates[dates.length - 1].toLocaleDateString()}`, 14, 42);
  doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 14, 49);
  doc.text(`Selected Items: ${items.length}`, 14, 56);

  const totalPaid = items.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const tableData = items.map(p => {
    const matchIdx = stageSettings.findIndex(s => s.stage === p.stage);
    const pn = matchIdx >= 0
      ? matchIdx + 1
      : (Number.isInteger(p.phaseIndex) ? Math.min(p.phaseIndex, stageSettings.length - 1) + 1 : 0);
    const cr = p.itemCommission?.commission?.commissionRate || 0;
    const pctShare = (p.percentage != null) ? p.percentage : (stageSettings.length > 0 ? 100 / stageSettings.length : 100);
    const acp = (cr * pctShare / 100).toFixed(2);
    return [
      p.itemCommission?.commission?.order?.account?.name || "N/A",
      p.itemCommission?.productCode || "N/A",
      p.itemCommission?.commission?.salesPersonName || "N/A",
      pn > 0 ? toOrdinal(pn) : "N/A",
      `$${parseFloat(p.amount || 0).toFixed(2)}`,
      `${acp}%`,
      new Date(p.paidAt).toLocaleDateString(),
    ];
  });

  autoTable(doc, {
    startY: 62,
    head: [["Customer", "Item", "Sales Rep", "Stage", "Amount", "Commission %", "Paid Date"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [60, 60, 60], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 4: { halign: "right" }, 5: { halign: "center" } },
  });

  const fy = doc.lastAutoTable.finalY;
  doc.setFontSize(12); doc.setFont(undefined, "bold");
  doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, pw - 14, fy + 10, { align: "right" });

  const sy = fy + 30;
  if (sy + 40 > ph - 20) { doc.addPage(); addSignatureSection(doc, 30); }
  else { addSignatureSection(doc, sy); }

  doc.save(`Commission_Report_Selected_${new Date().toISOString().split('T')[0]}.pdf`);
}
