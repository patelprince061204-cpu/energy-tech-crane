// routes/search.js
// Main top-bar search is scoped to Customers only - other modules have their
// own dedicated search boxes on their list pages.
const { Customers } = require('../db/models');
const { requireAuth } = require('../middleware/auth');

function register(router) {
  router.get('/api/search', requireAuth, async (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) { res.json({ results: [] }); return; }

    const results = Customers.where((c) => c.company_name.toLowerCase().includes(q) || c.mobile.includes(q))
      .slice(0, 10)
      .map((c) => ({ type: 'Customer', id: c.id, label: c.company_name, sublabel: c.mobile, route: `/customers/${c.id}` }));

    res.json({ results });
  });
}

module.exports = { register };
