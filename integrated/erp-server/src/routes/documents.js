// routes/documents.js
// Documents: free-form file storage for the Accounts Department - invoices
// received from vendors, signed agreements, tax filings, bank statements,
// anything that doesn't fit a structured module. Any file type is accepted;
// the only required field is a Document Name.
//
// Files are stored as base64 inside the JSON datastore (same place as every
// other record), consistent with this app's "no external file storage"
// architecture. That's fine at the scale this tool runs at; a real SQL/cloud
// port would swap this for actual blob storage with no change to the API
// shape (see PORTING.md convention used elsewhere in this codebase).

const { Documents, logActivity, logDeletion } = require('../db/models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sanitizeHeaderFilename } = require('../lib/fileSecurity');

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB - generous for invoices/scans, bounded because the whole table rewrites to disk on every save

function enrich(d) {
  // Never send file bytes back on list/detail reads - only on the explicit
  // download endpoint. Keeps the document list fast and light.
  const { data, ...rest } = d;
  return rest;
}

function register(router) {
  router.get('/api/documents', requireAuth, requireRole('accounts'), async (req, res) => {
    const { q } = req.query;
    let rows = Documents.all();
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((d) =>
        d.document_name.toLowerCase().includes(needle) ||
        (d.category || '').toLowerCase().includes(needle) ||
        (d.notes || '').toLowerCase().includes(needle)
      );
    }
    res.json({ documents: rows.map(enrich).sort((a, b) => b.id - a.id) });
  });

  router.post('/api/documents', requireAuth, requireRole('accounts'), async (req, res) => {
    const fields = req.body || {};
    const file = req.files && req.files.file;
    if (!fields.document_name || !fields.document_name.trim()) {
      res.status(400).json({ error: 'Document Name is required.' });
      return;
    }
    if (!file) {
      res.status(400).json({ error: 'Please choose a file to upload.' });
      return;
    }
    if (file.data.length > MAX_FILE_BYTES) {
      res.status(400).json({ error: `File is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)}MB.` });
      return;
    }
    const doc = Documents.insert({
      document_name: fields.document_name.trim(),
      category: fields.category || '',
      notes: fields.notes || '',
      filename: file.filename,
      mime_type: file.mimeType,
      size: file.data.length,
      data: file.data.toString('base64'),
      uploaded_by: req.user.id,
      uploaded_by_name: req.user.name,
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'document', recordId: doc.id, details: doc.document_name });
    res.status(201).json({ document: enrich(doc) });
  });

  router.get('/api/documents/:id/download', requireAuth, requireRole('accounts'), async (req, res) => {
    const doc = Documents.find(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Document not found.' }); return; }
    const buffer = Buffer.from(doc.data, 'base64');
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeHeaderFilename(doc.filename)}"`);
    res.end(buffer);
  });

  router.put('/api/documents/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const existing = Documents.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Document not found.' }); return; }
    const b = req.body || {};
    if (b.document_name !== undefined && !b.document_name.trim()) {
      res.status(400).json({ error: 'Document Name cannot be empty.' });
      return;
    }
    const patch = {};
    if (b.document_name !== undefined) patch.document_name = b.document_name.trim();
    if (b.category !== undefined) patch.category = b.category;
    if (b.notes !== undefined) patch.notes = b.notes;
    const doc = Documents.update(req.params.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'document', recordId: doc.id, details: doc.document_name });
    res.json({ document: enrich(doc) });
  });

  router.delete('/api/documents/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const doc = Documents.find(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Document not found.' }); return; }
    Documents.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'document', record: doc });
    res.json({ ok: true });
  });

  router.post('/api/documents/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const doc = Documents.find(id);
      if (doc && Documents.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'document', record: doc, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });
}

module.exports = { register };
