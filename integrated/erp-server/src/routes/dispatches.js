// routes/dispatches.js
const { Dispatches, JobCards, SalesOrders, Customers, nextDocNumber, logActivity, logDeletion, maybeAutoCompleteOrderDone } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');
const { sanitizeHeaderFilename } = require('../lib/fileSecurity');
const path = require('path');
const { spawn } = require('child_process');

// Calls the Python openpyxl script to generate a real .xlsx file that
// Excel can actually open (as opposed to SpreadsheetML XML with .xls
// extension, which modern Excel refuses or shows security warnings for).
function generateDispatchXlsx(data) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'lib', 'dispatch_excel.py');
    const proc = spawn('python3', [scriptPath]);
    const chunks = [];
    const errChunks = [];

    proc.stdin.write(JSON.stringify(data));
    proc.stdin.end();

    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => errChunks.push(chunk));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('xlsx generation failed: ' + Buffer.concat(errChunks).toString()));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    proc.on('error', reject);
  });
}

function enrich(d) {
  const so = SalesOrders.find(d.so_id);
  const customer = so ? Customers.find(so.customer_id) : null;
  // Strip binary data from attachments - only return metadata to the frontend
  const attachmentsMeta = (d.attachments || []).map(({ data, ...meta }) => meta);
  return Object.assign({}, d, {
    so_number: so ? so.so_number : '-',
    crane_type: so ? so.crane_type : '-',
    capacity: so ? so.capacity : '-',
    customer_name: customer ? customer.company_name : '-',
    customer_address: customer ? customer.address : '',
    customer_mobile: customer ? customer.mobile : '',
    attachments: attachmentsMeta,
  });
}

// ── SpreadsheetML helpers for styled dispatch forms ──────────────────────────
// Builds a full styled Excel workbook for a dispatch form. Shared between
// the Material List and the Hoist/Girder forms.

function register(router) {
  router.get('/api/dispatches', requireAuth, async (req, res) => {
    const { status, so_id } = req.query;
    let rows = Dispatches.all();
    if (status) rows = rows.filter((d) => d.status === status);
    if (so_id) rows = rows.filter((d) => d.so_id === Number(so_id));
    res.json({ dispatches: rows.map(enrich).sort((a, b) => b.id - a.id) });
  });

  router.get('/api/dispatches/:id', requireAuth, async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    res.json({ dispatch: enrich(d) });
  });

  // Excel download: Dispatch Material List (real .xlsx via openpyxl)
  router.get('/api/dispatches/:id/material-list-excel', requireAuth, async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    const so = SalesOrders.find(d.so_id);
    const customer = so ? Customers.find(so.customer_id) : null;
    try {
      const xlsx = await generateDispatchXlsx({
        form_type: 'material_list',
        company_name: customer ? customer.company_name : '',
        transporter_name: d.transporter_name || '',
        vehicle_number: d.vehicle_number || '',
        dispatch_date: d.dispatch_date || '',
        dispatch_number: d.dispatch_number || '',
        so_number: so ? so.so_number : '',
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${d.dispatch_number}-material-list.xlsx"`);
      res.end(xlsx);
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate Excel file.' });
    }
  });

  // Excel download: Hoist Material / End Carriage / Main Girder (real .xlsx)
  router.get('/api/dispatches/:id/hoist-material-excel', requireAuth, async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    const so = SalesOrders.find(d.so_id);
    const customer = so ? Customers.find(so.customer_id) : null;
    try {
      const xlsx = await generateDispatchXlsx({
        form_type: 'hoist_material',
        company_name: customer ? customer.company_name : '',
        transporter_name: d.transporter_name || '',
        vehicle_number: d.vehicle_number || '',
        dispatch_date: d.dispatch_date || '',
        dispatch_number: d.dispatch_number || '',
        so_number: so ? so.so_number : '',
        crane_type: so ? so.crane_type : '',
        capacity: so ? so.capacity : '',
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${d.dispatch_number}-hoist-girder.xlsx"`);
      res.end(xlsx);
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate Excel file.' });
    }
  });

  // ── Save form data (material list quantities + hoist/girder specs) ──────────
  // Stores the user-entered form values directly on the dispatch record so they
  // survive page reloads and can be reflected in the downloaded Excel too.
  router.post('/api/dispatches/:id/save-form', requireAuth, forbidRole('accounts'), async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    const { form_type, form_data } = req.body || {};
    if (!form_type || !form_data) { res.status(400).json({ error: 'form_type and form_data are required.' }); return; }
    const patch = {};
    if (form_type === 'material_list') patch.material_list_data = form_data;
    if (form_type === 'hoist_material') patch.hoist_material_data = form_data;
    const updated = Dispatches.update(d.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'dispatch', recordId: d.id, details: `Saved ${form_type} form` });
    res.json({ dispatch: enrich(updated) });
  });

  // ── Multiple file attachments ─────────────────────────────────────────────
  // Accepts up to 10 files uploaded under the field name "files" or "files[]".
  // Files are stored base64-encoded in the dispatch record under `attachments`.
  // Each attachment: { filename, mimeType, data (base64), size, uploaded_at }
  router.post('/api/dispatches/:id/attachments', requireAuth, forbidRole('accounts'), async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }

    // Accept files under "files", "files[]", or any field starting with "file"
    const uploadedFiles = [];
    for (const key of Object.keys(req.files || {})) {
      const entry = req.files[key];
      const fileList = Array.isArray(entry) ? entry : [entry];
      fileList.forEach((f) => {
        if (f && f.filename && f.data && f.data.length > 0) {
          uploadedFiles.push(f);
        }
      });
    }

    if (uploadedFiles.length === 0) {
      res.status(400).json({ error: 'No files received.' });
      return;
    }

    const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB per file
    const existing = d.attachments || [];
    const added = [];

    for (const f of uploadedFiles) {
      if (f.data.length > MAX_FILE_BYTES) {
        continue; // skip oversized files silently, report at end
      }
      added.push({
        filename: f.filename,
        mimeType: f.mimeType,
        data: f.data.toString('base64'),
        size: f.data.length,
        uploaded_at: new Date().toISOString(),
      });
    }

    if (added.length === 0) {
      res.status(400).json({ error: 'All files exceeded the 15MB limit.' });
      return;
    }

    const updated = Dispatches.update(d.id, { attachments: [...existing, ...added] });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'dispatch', recordId: d.id, details: `Added ${added.length} attachment(s)` });
    // Strip binary data from response — client only needs metadata
    const attachmentsMeta = (updated.attachments || []).map(({ data, ...meta }) => meta);
    res.json({ attachments: attachmentsMeta, added: added.length });
  });

  // Delete a single attachment by index
  router.delete('/api/dispatches/:id/attachments/:index', requireAuth, forbidRole('accounts'), async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    const idx = Number(req.params.index);
    const existing = d.attachments || [];
    if (isNaN(idx) || idx < 0 || idx >= existing.length) {
      res.status(400).json({ error: 'Invalid attachment index.' });
      return;
    }
    const updated = Dispatches.update(d.id, { attachments: existing.filter((_, i) => i !== idx) });
    const attachmentsMeta = (updated.attachments || []).map(({ data, ...meta }) => meta);
    res.json({ attachments: attachmentsMeta });
  });

  // View/download a single attachment
  router.get('/api/dispatches/:id/attachments/:index', requireAuth, async (req, res) => {
    const d = Dispatches.find(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    const idx = Number(req.params.index);
    const attachments = d.attachments || [];
    if (isNaN(idx) || idx < 0 || idx >= attachments.length) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    const att = attachments[idx];
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${sanitizeHeaderFilename(att.filename)}"`);
    res.end(Buffer.from(att.data, 'base64'));
  });

  router.post('/api/dispatches', requireAuth, forbidRole('accounts'), async (req, res) => {
    const b = req.body || {};
    if (!b.so_id || !b.vehicle_number) {
      res.status(400).json({ error: 'PO Number and vehicle number are required.' });
      return;
    }
    const so = SalesOrders.find(b.so_id);
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    if (['Completed', 'Done'].includes(so.status)) {
      res.status(400).json({ error: 'This PO Number is already completed and cannot be dispatched again.' }); return;
    }
    // Auto-advance SO to "Ready for Dispatch" if it isn't already — this lets
    // users create a dispatch even when the SO is still showing Production or
    // Pending, rather than forcing a manual status update first.
    if (so.status !== 'Ready for Dispatch') {
      SalesOrders.update(so.id, { status: 'Ready for Dispatch' });
    }
    const dispatch = Dispatches.insert({
      dispatch_number: nextDocNumber('DSP'), job_card_id: b.job_card_id ? Number(b.job_card_id) : null,
      so_id: Number(b.so_id), vehicle_number: b.vehicle_number, transporter_name: b.transporter_name || '',
      driver_name: b.driver_name || '', driver_mobile: b.driver_mobile || '',
      dispatch_address: b.dispatch_address || '', dispatch_city: b.dispatch_city || '', dispatch_state: b.dispatch_state || '',
      dispatch_date: b.dispatch_date || new Date().toISOString().slice(0, 10), status: 'Ready',
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'dispatch', recordId: dispatch.id, details: dispatch.dispatch_number });
    res.status(201).json({ dispatch: enrich(dispatch) });
  });

  router.put('/api/dispatches/:id', requireAuth, forbidRole('accounts'), async (req, res) => {
    const validStatuses = ['Ready', 'Dispatched', 'Delivered'];
    const b = req.body || {};
    if (b.status && !validStatuses.includes(b.status)) { res.status(400).json({ error: 'Invalid status.' }); return; }
    const dispatch = Dispatches.update(req.params.id, b);
    if (!dispatch) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    if (b.status === 'Delivered') {
      SalesOrders.update(dispatch.so_id, { status: 'Completed' });
      // Fulfillment side just finished — if the invoice was already fully
      // Paid before delivery was confirmed, this is the side that completes
      // the pair, so check immediately rather than requiring a manual step.
      maybeAutoCompleteOrderDone(dispatch.so_id, { userId: req.user.id, userName: req.user.name });
    }
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'dispatch', recordId: dispatch.id, details: b.status || '' });
    res.json({ dispatch: enrich(dispatch) });
  });

  router.delete('/api/dispatches/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const dispatch = Dispatches.find(req.params.id);
    if (!dispatch) { res.status(404).json({ error: 'Dispatch not found.' }); return; }
    Dispatches.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'dispatch', record: dispatch });
    res.json({ ok: true });
  });

  router.post('/api/dispatches/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const dispatch = Dispatches.find(id);
      if (dispatch && Dispatches.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'dispatch', record: dispatch, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  registerExport(router, {
    path: '/api/dispatches',
    title: 'Dispatch Management',
    middleware: [requireAuth],
    landscape: true,
    columns: [
      { key: 'dispatch_number', label: 'Dispatch #', width: 90 },
      { key: 'so_number', label: 'PO Number', width: 90 },
      { key: 'customer_name', label: 'Customer', width: 130 },
      { key: 'vehicle_number', label: 'Vehicle Number', width: 100 },
      { key: 'transporter_name', label: 'Transporter', width: 130 },
      { key: 'driver_name', label: 'Driver Name', width: 110 },
      { key: 'driver_mobile', label: 'Driver Mobile', width: 90 },
      { key: 'dispatch_date', label: 'Date', width: 80 },
      { key: 'status', label: 'Status', width: 90 },
    ],
    getRows: async (req) => {
      const { date_from, date_to, product } = req.query;
      let rows = Dispatches.all().map(enrich);
      if (date_from) rows = rows.filter((d) => d.dispatch_date >= date_from);
      if (date_to) rows = rows.filter((d) => d.dispatch_date <= date_to);
      if (product) rows = rows.filter((d) => d.crane_type === product);
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
