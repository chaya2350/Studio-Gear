export interface PrintableLabel {
  title: string;
  barcodeUrl: string;
  code: string;
  subtitle?: string;
}

const LABELS_PER_PAGE = 24;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!);
}

export function printA4LabelSheet(labels: PrintableLabel[], title: string): void {
  if (!labels.length) {
    window.alert('אין מדבקות להדפסה.');
    return;
  }

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    window.alert('חלון ההדפסה נחסם. אפשרי חלונות קופצים לאתר ונסי שוב.');
    return;
  }

  const pages: string[] = [];
  for (let start = 0; start < labels.length; start += LABELS_PER_PAGE) {
    const pageLabels = labels.slice(start, start + LABELS_PER_PAGE);
    const cells = pageLabels.map(label => `
      <article class="label">
        <div class="label-info">
          <div class="label-title">${escapeHtml(label.title)}</div>
          ${label.subtitle ? `<div class="label-subtitle">${escapeHtml(label.subtitle)}</div>` : ''}
          <div class="label-code">${escapeHtml(label.code)}</div>
        </div>
        <img class="label-barcode" src="${escapeHtml(label.barcodeUrl)}" alt="">
      </article>
    `);
    while (cells.length < LABELS_PER_PAGE) cells.push('<article class="label label-empty"></article>');
    pages.push(`<section class="sheet">${cells.join('')}</section>`);
  }

  win.document.write(`<!doctype html>
    <html lang="he" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #fff; }
          .sheet {
            width: 210mm;
            height: 297mm;
            display: grid;
            grid-template-columns: repeat(3, 70mm);
            grid-template-rows: repeat(8, 35mm);
            align-content: center;
            break-after: page;
            page-break-after: always;
            overflow: hidden;
          }
          .sheet:last-child { break-after: auto; page-break-after: auto; }
          .label {
            width: 70mm;
            height: 35mm;
            padding: 1mm 2mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5mm;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .label-info {
            min-width: 0;
            width: 100%;
            flex: 0 0 auto;
            text-align: center;
            overflow: hidden;
          }
          .label-title {
            font-size: 8pt;
            line-height: 1.15;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .label-subtitle {
            margin-top: 0.5mm;
            font-size: 6pt;
            line-height: 1.1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .label-code {
            margin-top: 0.5mm;
            font-family: monospace;
            font-size: 6pt;
            line-height: 1;
            direction: ltr;
            text-align: center;
          }
          .label-barcode {
            display: block;
            width: 56mm;
            height: 17mm;
            flex: 0 0 17mm;
            padding: 0 2mm;
            background: #fff;
            object-fit: contain;
          }
          @page { size: A4 portrait; margin: 0; }
          @media screen {
            body { background: #e5e7eb; }
            .sheet {
              margin: 12mm auto;
              background: white;
              box-shadow: 0 1mm 5mm #0003;
            }
            .label { outline: 0.1mm dotted #ddd; outline-offset: -0.5mm; }
          }
          @media print {
            .sheet { margin: 0; }
            .label { outline: none; }
          }
        </style>
      </head>
      <body>${pages.join('')}</body>
    </html>`);
  win.document.close();

  Promise.all(Array.from(win.document.images, image => image.decode()))
    .then(() => win.setTimeout(() => {
      if (!win.closed) {
        win.focus();
        win.print();
      }
    }, 100))
    .catch(error => {
      console.error('Could not load barcode images for label printing:', error);
      win.alert('לא ניתן לטעון את אחד הברקודים. בדקי את החיבור ונסי שוב.');
    });
}
