/**
 * Opens a browser print dialog pre-formatted for PDF export.
 * Users can choose "Save as PDF" in the print dialog.
 */
export function printToPdf(title: string, tableHtml: string): void {
  const win = window.open('', '_blank')
  if (!win) return

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
    h1 { font-size: 16px; font-weight: 700; margin-bottom: 16px; letter-spacing: 1px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase;
         letter-spacing: 0.5px; color: #666; padding: 6px 8px; border-bottom: 2px solid #ddd; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    .pass  { color: #2d6a4f; font-weight: 600; }
    .warn  { color: #b57c00; font-weight: 600; }
    .fail  { color: #a62c2c; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 2px; }
    .badge-pass { background: #d8f3dc; color: #2d6a4f; }
    .badge-warn { background: #fff3cd; color: #b57c00; }
    .badge-fail { background: #ffe5e5; color: #a62c2c; }
    .print-date { font-size: 10px; color: #999; margin-bottom: 12px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="print-date">Exported: ${new Date().toLocaleString()}</p>
  ${tableHtml}
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`)
  win.document.close()
}
