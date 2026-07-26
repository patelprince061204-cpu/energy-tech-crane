// routes/restore.js
// Delete History & Recovery: every deletion anywhere in the system is logged
// with a full snapshot (see logDeletion in db/models.js). This route lets
// Admin and Accountant browse those deletions and restore any of them.
// Per the brief, only Admin and Accountant may restore - no other role.

const { ActivityLogs, restoreFromLog, logActivity } = require('../db/models');
const { requireAuth, requireRole } = require('../middleware/auth');

function register(router) {
  router.get('/api/deleted-records', requireAuth, requireRole('accounts'), async (req, res) => {
    const { module } = req.query;
    let rows = ActivityLogs.where((l) => (l.action === 'delete' || l.action === 'bulk_delete') && l.snapshot);
    if (module) rows = rows.filter((l) => l.module === module);
    res.json({
      deleted: rows
        .sort((a, b) => b.id - a.id)
        .map((l) => ({
          log_id: l.id, module: l.module, details: l.details,
          deleted_by: l.user_name, deleted_at: l.created_at,
          restorable: l.restorable, restored_at: l.restored_at || null,
        })),
    });
  });

  router.post('/api/deleted-records/:logId/restore', requireAuth, requireRole('accounts'), async (req, res) => {
    const result = restoreFromLog(req.params.logId);
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    logActivity({
      userId: req.user.id, userName: req.user.name, action: 'restore',
      module: result.module, recordId: result.record.id,
      details: `Restored from deletion log #${req.params.logId}`,
    });
    res.json({ ok: true, record: result.record, module: result.module });
  });
}

module.exports = { register };
