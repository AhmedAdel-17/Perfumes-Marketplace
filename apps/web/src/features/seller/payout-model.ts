/**
 * Pattern — presentation model. Totals describe the loaded statements, not a
 * payable balance or a promise of settlement. CSV preserves server line facts.
 */
interface SummaryRow { readonly status: string; readonly netPiastres: number }
export function summarisePayouts(rows: readonly SummaryRow[]) {
  return rows.reduce((summary, row) => {
    summary.count += 1;
    if (row.status === 'paid') summary.paidPiastres += row.netPiastres;
    else summary.unpaidPiastres += row.netPiastres;
    return summary;
  }, { count: 0, paidPiastres: 0, unpaidPiastres: 0 });
}

export interface CsvStatementLine {
  readonly subOrderReference: string;
  readonly commissionSource: string;
  readonly commissionBps: number;
  readonly grossPiastres: number;
  readonly commissionPiastres: number;
  readonly shippingPiastres: number;
  readonly netPiastres: number;
}

function cell(value: string | number): string {
  const text = typeof value === 'string' && /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** Integer piastres avoid locale-dependent decimal or rounding transformations. */
export function statementCsv(reference: string, lines: readonly CsvStatementLine[]): string {
  const rows: (string | number)[][] = [
    ['مرجع الكشف', 'مرجع الطلب', 'مصدر العمولة', 'العمولة بنقاط الأساس', 'المبيعات بالقرش', 'العمولة بالقرش', 'استرداد التوصيل بالقرش', 'الصافي بالقرش'],
    ...lines.map((line) => [reference, line.subOrderReference, line.commissionSource, line.commissionBps,
      line.grossPiastres, line.commissionPiastres, line.shippingPiastres, line.netPiastres]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
