// lib/exportRoutes.js
// Shared helper so every module can expose consistent "Download Excel" /
// "Download PDF" endpoints with minimal repeated code. Each module calls
// registerExport(router, { path, title, columns, getRows, middleware }) once.

const { singleSheetWorkbook } = require('./excel');
const { generateTablePdf } = require('./pdf');

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// path: route prefix, e.g. '/api/customers'
// title: human-readable report title, e.g. 'Customer Master'
// columns: [{ key, label, width? }], OR a function (req) => columns, for the
//   rare case where the column set itself depends on the requester's role
//   (e.g. Sales Orders hides financial columns from Production entirely,
//   rather than showing the header with blank data).
// getRows: async (req) => array of plain row objects to export
// middleware: array of middleware functions to apply before the handler
//   (typically [requireAuth], or [requireAuth, forbidRole(...)] to match
//   the module's normal read permissions)
// landscape: true for wide tables that need more horizontal room in the PDF
function registerExport(router, { path, title, columns, getRows, middleware = [], landscape = false }) {
  const resolveColumns = (req) => (typeof columns === 'function' ? columns(req) : columns);

  router.get(`${path}/export/excel`, ...middleware, async (req, res) => {
    try {
      const cols = resolveColumns(req);
      const rows = await getRows(req);
      const xml = singleSheetWorkbook(title, cols, rows);
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="${slug(title)}.xls"`);
      res.end(xml);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to generate Excel export.' });
    }
  });

  router.get(`${path}/export/pdf`, ...middleware, async (req, res) => {
    try {
      const cols = resolveColumns(req);
      const rows = await getRows(req);
      const pdfBytes = await generateTablePdf(title, cols, rows, { landscape });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${slug(title)}.pdf"`);
      res.end(Buffer.from(pdfBytes));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to generate PDF export.' });
    }
  });
}

module.exports = { registerExport };
