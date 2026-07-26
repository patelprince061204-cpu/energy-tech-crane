// routes/companySettings.js
// Company Settings: the company's own profile data - legal/contact details,
// bank details for receiving payments, uploaded certificates (ISO, GST, trade
// licenses, etc.), and team/staff directory with optional photos. Entirely
// Admin-only, both to view and to edit - this is sensitive internal data
// (bank account numbers, etc.), not something every role should browse.
//
// Company Details + Bank Details live as a single settings row (there's only
// ever one company). Certificates and Team Members are separate row-based
// tables since each entry can carry its own uploaded file/photo.

const { CompanySettings, CompanyCertificates, CompanyTeam, logActivity, logDeletion } = require('../db/models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sanitizeHeaderFilename, isAllowedImageType } = require('../lib/fileSecurity');

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getSettingsRow() {
  let row = CompanySettings.first(() => true);
  if (!row) row = CompanySettings.insert({});
  return row;
}

function register(router) {
  router.get('/api/company-settings', requireAuth, requireRole('admin'), async (req, res) => {
    const row = getSettingsRow();
    const { logo_data, ...rest } = row;
    res.json({ settings: Object.assign({}, rest, { has_logo: !!logo_data }) });
  });

  router.put('/api/company-settings', requireAuth, requireRole('admin'), async (req, res) => {
    const b = req.body || {};
    const row = getSettingsRow();
    const patch = {};
    ['company_name', 'gstin', 'pan', 'address', 'phone', 'email', 'website',
      'bank_name', 'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_branch'].forEach((key) => {
      if (b[key] !== undefined) patch[key] = b[key];
    });
    if (req.files && req.files.logo) {
      const file = req.files.logo;
      if (file.data.length > MAX_FILE_BYTES) {
        res.status(400).json({ error: `Logo is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)}MB.` });
        return;
      }
      if (!isAllowedImageType(file.mimeType)) {
        res.status(400).json({ error: 'Logo must be an image file (JPG, PNG, GIF, WEBP, or SVG).' });
        return;
      }
      patch.logo_data = file.data.toString('base64');
      patch.logo_mime_type = file.mimeType;
      patch.logo_filename = file.filename;
    }
    const updated = CompanySettings.update(row.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'company_settings', details: 'Updated company settings' });
    const { logo_data, ...rest } = updated;
    res.json({ settings: Object.assign({}, rest, { has_logo: !!logo_data }) });
  });

  router.get('/api/company-settings/logo', requireAuth, requireRole('admin'), async (req, res) => {
    const row = getSettingsRow();
    if (!row.logo_data) { res.status(404).json({ error: 'No logo uploaded.' }); return; }
    res.setHeader('Content-Type', row.logo_mime_type || 'image/png');
    res.end(Buffer.from(row.logo_data, 'base64'));
  });

  router.get('/api/company-certificates', requireAuth, requireRole('admin'), async (req, res) => {
    const rows = CompanyCertificates.all().map(({ file_data, ...rest }) => Object.assign({}, rest, { has_file: !!file_data }));
    res.json({ certificates: rows.sort((a, b) => b.id - a.id) });
  });

  router.post('/api/company-certificates', requireAuth, requireRole('admin'), async (req, res) => {
    const fields = req.body || {};
    if (!fields.name || !fields.name.trim()) {
      res.status(400).json({ error: 'Certificate name is required.' });
      return;
    }
    const file = req.files && req.files.file;
    if (file && file.data.length > MAX_FILE_BYTES) {
      res.status(400).json({ error: `File is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)}MB.` });
      return;
    }
    const cert = CompanyCertificates.insert({
      name: fields.name.trim(),
      issuing_authority: fields.issuing_authority || '',
      valid_until: fields.valid_until || '',
      file_data: file ? file.data.toString('base64') : null,
      file_mime_type: file ? file.mimeType : null,
      file_filename: file ? file.filename : null,
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'company_certificate', recordId: cert.id, details: cert.name });
    const { file_data, ...rest } = cert;
    res.status(201).json({ certificate: Object.assign({}, rest, { has_file: !!file_data }) });
  });

  router.get('/api/company-certificates/:id/file', requireAuth, requireRole('admin'), async (req, res) => {
    const cert = CompanyCertificates.find(req.params.id);
    if (!cert || !cert.file_data) { res.status(404).json({ error: 'No file for this certificate.' }); return; }
    res.setHeader('Content-Type', cert.file_mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeHeaderFilename(cert.file_filename)}"`);
    res.end(Buffer.from(cert.file_data, 'base64'));
  });

  router.delete('/api/company-certificates/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const cert = CompanyCertificates.find(req.params.id);
    if (!cert) { res.status(404).json({ error: 'Certificate not found.' }); return; }
    CompanyCertificates.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'company_certificate', record: cert });
    res.json({ ok: true });
  });

  router.get('/api/company-team', requireAuth, requireRole('admin'), async (req, res) => {
    const rows = CompanyTeam.all().map(({ photo_data, ...rest }) => Object.assign({}, rest, { has_photo: !!photo_data }));
    res.json({ team: rows.sort((a, b) => b.id - a.id) });
  });

  router.post('/api/company-team', requireAuth, requireRole('admin'), async (req, res) => {
    const fields = req.body || {};
    if (!fields.name || !fields.name.trim()) {
      res.status(400).json({ error: 'Team member name is required.' });
      return;
    }
    const file = req.files && req.files.photo;
    if (file && file.data.length > MAX_FILE_BYTES) {
      res.status(400).json({ error: `Photo is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)}MB.` });
      return;
    }
    if (file && !isAllowedImageType(file.mimeType)) {
      res.status(400).json({ error: 'Photo must be an image file (JPG, PNG, GIF, WEBP, or SVG).' });
      return;
    }
    const member = CompanyTeam.insert({
      name: fields.name.trim(),
      designation: fields.designation || '',
      department: fields.department || '',
      phone: fields.phone || '',
      email: fields.email || '',
      photo_data: file ? file.data.toString('base64') : null,
      photo_mime_type: file ? file.mimeType : null,
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'company_team_member', recordId: member.id, details: member.name });
    const { photo_data, ...rest } = member;
    res.status(201).json({ member: Object.assign({}, rest, { has_photo: !!photo_data }) });
  });

  router.put('/api/company-team/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const existing = CompanyTeam.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Team member not found.' }); return; }
    const fields = req.body || {};
    if (fields.name !== undefined && !fields.name.trim()) {
      res.status(400).json({ error: 'Team member name cannot be empty.' });
      return;
    }
    const patch = {};
    ['name', 'designation', 'department', 'phone', 'email'].forEach((key) => {
      if (fields[key] !== undefined) patch[key] = fields[key];
    });
    const file = req.files && req.files.photo;
    if (file) {
      if (file.data.length > MAX_FILE_BYTES) {
        res.status(400).json({ error: `Photo is too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)}MB.` });
        return;
      }
      if (!isAllowedImageType(file.mimeType)) {
        res.status(400).json({ error: 'Photo must be an image file (JPG, PNG, GIF, WEBP, or SVG).' });
        return;
      }
      patch.photo_data = file.data.toString('base64');
      patch.photo_mime_type = file.mimeType;
    }
    const member = CompanyTeam.update(req.params.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'company_team_member', recordId: member.id, details: member.name });
    const { photo_data, ...rest } = member;
    res.json({ member: Object.assign({}, rest, { has_photo: !!photo_data }) });
  });

  router.get('/api/company-team/:id/photo', requireAuth, requireRole('admin'), async (req, res) => {
    const member = CompanyTeam.find(req.params.id);
    if (!member || !member.photo_data) { res.status(404).json({ error: 'No photo for this team member.' }); return; }
    res.setHeader('Content-Type', member.photo_mime_type || 'image/png');
    res.end(Buffer.from(member.photo_data, 'base64'));
  });

  router.delete('/api/company-team/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const member = CompanyTeam.find(req.params.id);
    if (!member) { res.status(404).json({ error: 'Team member not found.' }); return; }
    CompanyTeam.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'company_team_member', record: member });
    res.json({ ok: true });
  });
}

module.exports = { register };
