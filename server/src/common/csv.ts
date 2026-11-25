/**
 * 极简 CSV 生成（RFC 4180）。
 * 导出给 Excel 打开时，调用方在返回值前加 BOM 即可正确识别 UTF-8。
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date
      ? value.toISOString().replace('T', ' ').slice(0, 19)
      : String(value);
  // 含逗号、引号、换行时用双引号包裹，内部双引号翻倍
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
