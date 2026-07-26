// lib/excel.js
// Generates real Excel files using SpreadsheetML (the Excel 2003 XML format) -
// a format Microsoft documented and Excel/LibreOffice/Google Sheets all open
// natively, with full support for styled headers, column widths, and number
// formatting. Chosen because this sandbox has no network access to install
// exceljs/xlsx, and a real .xlsx (ZIP container) is complex to hand-build
// correctly. SpreadsheetML needs no ZIP/binary handling at all - it's just
// well-formed XML - while still opening as a proper, styled spreadsheet.
//
// Output filename uses .xls; Excel recognizes the XML content automatically
// regardless of extension (it checks the <?mso-application?> processing
// instruction), so this is not a renamed CSV - it's a real native format.

function escapeXml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cellFor(value) {
  if (value == null || value === '') return '<Cell><Data ss:Type="String"></Data></Cell>';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

// columns: [{ key, label, width? }]
// rows: array of plain objects keyed by column `key`
function buildSheet(title, columns, rows) {
  const headerRow = `<Row ss:Height="20">${columns.map((c) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>`).join('')}</Row>`;
  const dataRows = rows.map((row) => {
    const cells = columns.map((c) => cellFor(row[c.key])).join('');
    return `<Row>${cells}</Row>`;
  }).join('');
  const colDefs = columns.map((c) => `<Column ss:Width="${c.width || 110}"/>`).join('');
  return `
 <Worksheet ss:Name="${escapeXml(title).slice(0, 31)}">
  <Table>
   ${colDefs}
   ${headerRow}
   ${dataRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>`;
}

// sheets: [{ title, columns, rows }] - one or more tabs in the workbook
function buildWorkbook(sheets) {
  const sheetXml = sheets.map((s) => buildSheet(s.title, s.columns, s.rows)).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Company>Energy Tech Crane</Company>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1C2530" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
 </Styles>
${sheetXml}
</Workbook>`;
}

// Convenience for the common case: one table -> one downloadable file
function singleSheetWorkbook(title, columns, rows) {
  return buildWorkbook([{ title, columns, rows }]);
}

module.exports = { buildWorkbook, singleSheetWorkbook };
