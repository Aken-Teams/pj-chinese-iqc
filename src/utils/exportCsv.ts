import { downloadBlob } from './downloadBlob'

/**
 * Download a 2D array as a UTF-8 BOM CSV file.
 * The BOM ensures Excel on Windows renders Chinese characters correctly.
 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), filename)
}
