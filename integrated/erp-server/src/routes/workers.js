// routes/workers.js
// Worker Management - one record per real person, each holding a full
// history of every job they've been assigned, with each job tracked as
// Assigned or Completed. Viewable/creatable by Production Team and Admin.
// Deletion restricted to Admin and Accountant only, per the system-wide
// delete-permission rule.

const { Workers, WorkAssignments, logActivity, logDeletion } = require('../db/models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

const MOBILE_RE = /^[0-9]{10}$/;

function enrichWorker(w) {
  const assignments = WorkAssignments.where((a) => a.worker_id === w.id).sort((a, b) => b.id - a.id);
  return Object.assign({}, w, {
    total_jobs: assignments.length,
    completed_jobs: assignments.filter((a) => a.status === 'Completed').length,
    latest_work: assignments[0] ? assignments[0].work_assigned : '',
    latest_date: assignments[0] ? assignments[0].date : '',
  });
}

function register(router) {
  router.get('/api/workers', requireAuth, requireRole('production'), async (req, res) => {
    const { q } = req.query;
    let rows = Workers.all();
    if (q) {
      const needle = q.toLowerCase();
      const matchingWorkerIds = new Set(
        WorkAssignments.where((a) => a.work_assigned.toLowerCase().includes(needle)).map((a) => a.worker_id)
      );
      rows = rows.filter((w) =>
        w.worker_name.toLowerCase().includes(needle) ||
        (w.mobile || '').includes(needle) ||
        matchingWorkerIds.has(w.id)
      );
    }
    res.json({ workers: rows.map(enrichWorker).sort((a, b) => b.id - a.id) });
  });

  router.get('/api/workers/:id', requireAuth, requireRole('production'), async (req, res) => {
    const worker = Workers.find(req.params.id);
    if (!worker) { res.status(404).json({ error: 'Worker record not found.' }); return; }
    const assignments = WorkAssignments.where((a) => a.worker_id === worker.id).sort((a, b) => b.id - a.id);
    res.json({ worker: enrichWorker(worker), assignments });
  });

  router.post('/api/workers', requireAuth, requireRole('production'), async (req, res) => {
    const b = req.body || {};
    if (!b.worker_name) {
      res.status(400).json({ error: 'Worker name is required.' });
      return;
    }
    if (b.mobile && !MOBILE_RE.test(b.mobile)) {
      res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      return;
    }
    const worker = Workers.insert({ worker_name: b.worker_name, mobile: b.mobile || '' });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'worker', recordId: worker.id, details: worker.worker_name });

    if (b.work_assigned && b.work_assigned.trim()) {
      const assignment = WorkAssignments.insert({
        worker_id: worker.id, work_assigned: b.work_assigned.trim(),
        work_description: b.work_description || '', work_location: b.work_location || '',
        date: b.date || new Date().toISOString().slice(0, 10), status: b.status === 'Completed' ? 'Completed' : 'Assigned',
      });
      logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'work_assignment', recordId: assignment.id, details: `${worker.worker_name} - ${assignment.work_assigned}` });
    }
    res.status(201).json({ worker: enrichWorker(worker) });
  });

  router.put('/api/workers/:id', requireAuth, requireRole('production'), async (req, res) => {
    if (req.body.mobile && !MOBILE_RE.test(req.body.mobile)) {
      res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      return;
    }
    const patch = {};
    ['worker_name', 'mobile'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    const worker = Workers.update(req.params.id, patch);
    if (!worker) { res.status(404).json({ error: 'Worker record not found.' }); return; }
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'worker', recordId: worker.id, details: worker.worker_name });
    res.json({ worker: enrichWorker(worker) });
  });

  router.delete('/api/workers/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const worker = Workers.find(req.params.id);
    if (!worker) { res.status(404).json({ error: 'Worker record not found.' }); return; }
    const assignments = WorkAssignments.where((a) => a.worker_id === worker.id);
    assignments.forEach((a) => {
      WorkAssignments.delete(a.id);
      logDeletion({ userId: req.user.id, userName: req.user.name, module: 'work_assignment', record: a, bulk: true });
    });
    Workers.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'worker', record: worker });
    res.json({ ok: true });
  });

  router.post('/api/workers/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const worker = Workers.find(id);
      if (worker && Workers.delete(id)) {
        WorkAssignments.where((a) => a.worker_id === worker.id).forEach((a) => {
          WorkAssignments.delete(a.id);
          logDeletion({ userId: req.user.id, userName: req.user.name, module: 'work_assignment', record: a, bulk: true });
        });
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'worker', record: worker, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  router.post('/api/workers/:id/assignments', requireAuth, requireRole('production'), async (req, res) => {
    const worker = Workers.find(req.params.id);
    if (!worker) { res.status(404).json({ error: 'Worker record not found.' }); return; }
    const b = req.body || {};
    if (!b.work_assigned || !b.work_assigned.trim()) {
      res.status(400).json({ error: 'Work Assigned is required.' });
      return;
    }
    const assignment = WorkAssignments.insert({
      worker_id: worker.id, work_assigned: b.work_assigned.trim(),
      work_description: b.work_description || '', work_location: b.work_location || '',
      date: b.date || new Date().toISOString().slice(0, 10), status: b.status === 'Completed' ? 'Completed' : 'Assigned',
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'work_assignment', recordId: assignment.id, details: `${worker.worker_name} - ${assignment.work_assigned}` });
    res.status(201).json({ assignment, worker: enrichWorker(worker) });
  });

  router.put('/api/workers/:workerId/assignments/:id', requireAuth, requireRole('production'), async (req, res) => {
    const worker = Workers.find(req.params.workerId);
    if (!worker) { res.status(404).json({ error: 'Worker record not found.' }); return; }
    const existing = WorkAssignments.find(req.params.id);
    if (!existing || existing.worker_id !== worker.id) { res.status(404).json({ error: 'Assignment not found.' }); return; }
    const b = req.body || {};
    if (b.work_assigned !== undefined && !b.work_assigned.trim()) {
      res.status(400).json({ error: 'Work Assigned cannot be empty.' });
      return;
    }
    const patch = {};
    ['work_assigned', 'work_description', 'work_location', 'date', 'status'].forEach((k) => {
      if (b[k] !== undefined) patch[k] = b[k];
    });
    const assignment = WorkAssignments.update(req.params.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'work_assignment', recordId: assignment.id, details: `${worker.worker_name} - ${assignment.work_assigned}` });
    res.json({ assignment, worker: enrichWorker(worker) });
  });

  router.delete('/api/workers/:workerId/assignments/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const assignment = WorkAssignments.find(req.params.id);
    if (!assignment || assignment.worker_id !== Number(req.params.workerId)) { res.status(404).json({ error: 'Assignment not found.' }); return; }
    WorkAssignments.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'work_assignment', record: assignment });
    res.json({ ok: true });
  });

  registerExport(router, {
    path: '/api/workers',
    title: 'Worker Work History',
    middleware: [requireAuth, requireRole('production')],
    columns: [
      { key: 'worker_name', label: 'Worker Name', width: 140 },
      { key: 'mobile', label: 'Mobile Number', width: 100 },
      { key: 'work_assigned', label: 'Work Assigned', width: 150 },
      { key: 'work_description', label: 'Work Description', width: 220 },
      { key: 'work_location', label: 'Work Location', width: 130 },
      { key: 'date', label: 'Date', width: 90 },
      { key: 'status', label: 'Status', width: 90 },
    ],
    getRows: async () => {
      const workers = Workers.all();
      const rows = [];
      WorkAssignments.all().sort((a, b) => b.id - a.id).forEach((a) => {
        const worker = workers.find((w) => w.id === a.worker_id);
        rows.push({
          worker_name: worker ? worker.worker_name : 'Unknown',
          mobile: worker ? worker.mobile : '',
          work_assigned: a.work_assigned, work_description: a.work_description,
          work_location: a.work_location, date: a.date, status: a.status,
        });
      });
      return rows;
    },
  });
}

module.exports = { register };
