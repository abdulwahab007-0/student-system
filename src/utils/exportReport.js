// ── Shared report export helpers: CSV, Excel (.xlsx) and PNG image ──
// Used by the Attendance Report (admin/CR/teacher) and My Attendance (student).

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportCSV(filename, headers, rows) {
  const lines = [headers, ...rows].map(r => r.map(csvEscape).join(','));
  // UTF-8 BOM so Excel opens the file with correct character encoding
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export async function exportExcel(filename, headers, rows) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.max(
      h.length,
      ...rows.map(r => String(r[i] ?? '').length),
      10
    ) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, filename);
}

// Render the table to a PNG using the Canvas API (no extra dependency).
export function exportImage(filename, { title, subtitle, footer, headers, rows }) {
  if (!rows || rows.length === 0) return;
  const PAD = 24;
  const HEADER_H = 30;
  const ROW_H = 26;
  const TITLE_H = 34;
  const SUBTITLE_H = 20;
  const FOOTER_H = 24;
  const MAX_ROWS = 300;

  const c = document.createElement('canvas');
  const m = c.getContext('2d');
  m.font = '600 13px Arial, Helvetica, sans-serif';

  const widths = headers.map((h, i) => {
    let w = m.measureText(h).width + 32;
    const visible = rows.slice(0, MAX_ROWS);
    for (const r of visible) {
      w = Math.max(w, m.measureText(String(r[i] ?? '')).width + 32);
    }
    return Math.min(Math.max(w, 60), 240);
  });
  const tableW = widths.reduce((a, b) => a + b, 0);
  const rowCount = Math.min(rows.length, MAX_ROWS);
  const W = Math.max(820, tableW + PAD * 2);
  const H = PAD + TITLE_H + SUBTITLE_H + HEADER_H + rowCount * ROW_H + FOOTER_H + PAD + 8;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');

  // Background
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  // Title
  let y = PAD;
  g.fillStyle = '#065f46';
  g.font = '700 20px Arial, Helvetica, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(title, PAD, y + TITLE_H / 2);
  y += TITLE_H;

  // Subtitle
  g.fillStyle = '#6b7280';
  g.font = '400 13px Arial, Helvetica, sans-serif';
  g.fillText(subtitle, PAD, y + SUBTITLE_H / 2);
  y += SUBTITLE_H;

  const leftX = PAD;
  const headerTop = y;

  // Header row
  g.fillStyle = '#059669';
  g.fillRect(leftX, y, tableW, HEADER_H);
  g.font = '700 13px Arial, Helvetica, sans-serif';
  g.fillStyle = '#ffffff';
  let x = leftX;
  headers.forEach((h, i) => {
    g.fillText(h, x + 12, y + HEADER_H / 2);
    x += widths[i];
  });
  y += HEADER_H;

  // Rows
  const visible = rows.slice(0, MAX_ROWS);
  visible.forEach((r, ri) => {
    g.fillStyle = ri % 2 === 0 ? '#ffffff' : '#f3f4f6';
    g.fillRect(leftX, y, tableW, ROW_H);
    x = leftX;
    g.font = '400 13px Arial, Helvetica, sans-serif';
    g.fillStyle = '#111827';
    headers.forEach((_, i) => {
      g.fillText(String(r[i] ?? ''), x + 12, y + ROW_H / 2);
      x += widths[i];
    });
    y += ROW_H;
  });

  // Row grid lines
  g.strokeStyle = '#d1d5db';
  g.lineWidth = 1;
  g.beginPath();
  y = headerTop + HEADER_H;
  for (let i = 0; i <= visible.length; i++) {
    g.moveTo(leftX, y);
    g.lineTo(leftX + tableW, y);
    y += ROW_H;
  }
  g.stroke();

  // Column grid lines
  g.beginPath();
  x = leftX;
  for (const wd of widths) {
    x += wd;
    g.moveTo(x, headerTop);
    g.lineTo(x, H - PAD - FOOTER_H - 4);
  }
  g.stroke();

  // Footer
  g.fillStyle = '#6b7280';
  g.font = '400 12px Arial, Helvetica, sans-serif';
  g.fillText(footer, leftX, H - PAD - FOOTER_H / 2);

  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, filename);
  }, 'image/png');
}