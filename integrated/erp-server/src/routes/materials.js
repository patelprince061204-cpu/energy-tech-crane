// routes/materials.js
// Material Management: Category > Sub-category > Material hierarchy.
// Creating a Material only asks for Category, Sub-category, and Material
// Name - Unit and quantity are system-tracked (quantity starts at 0 and
// builds up via Stock In / Material Purchase, Unit defaults to "unit" and
// can be adjusted via Edit if needed).
//
// Material Purchase still links to one real Material record (so stock-in
// keeps working) - Category/Sub-category there are filters to help find the
// right Material in the dropdown, not separate freeform data.

const { Categories, Subcategories, Materials, StockMovements, MaterialPurchases, logActivity, logDeletion } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');
const { sanitizeHeaderFilename } = require('../lib/fileSecurity');

// Walk the ancestor chain from a subcategory node up to the root (the
// category itself is not in this table, so we stop at parent_id === null).
// Returns up to 5 nodes ordered from shallowest to deepest.
function resolveAncestors(subcategoryId, allSubcategories) {
  const byId = {};
  allSubcategories.forEach((s) => { byId[s.id] = s; });
  const chain = [];
  let current = byId[subcategoryId];
  let guard = 0;
  while (current && guard < 10) {
    chain.unshift(current); // prepend so we end up root-first
    current = current.parent_id ? byId[current.parent_id] : null;
    guard++;
  }
  return chain; // [level-2, level-3, level-4, level-5] relative to category
}

// A material's linked PO Numbers come from its stock movement history.
// Stock In (arrival/purchase) and Stock Out (usage) are tracked as two
// SEPARATE lists here - "PO Number Details" (purchased against) and "Usage
// PO Number Details" (used against) - each with its own filter on the
// Material Management page, per the requirement that these must be
// trackable independently rather than merged into one column.
function materialPoInfo(materialId) {
  const tagged = StockMovements
    .where((mv) => mv.material_id === materialId && (mv.po_number || '').trim())
    .sort((a, b) => b.id - a.id);
  const inTagged = tagged.filter((mv) => mv.type === 'in');
  const outTagged = tagged.filter((mv) => mv.type === 'out');
  const po_numbers = [...new Set(tagged.map((mv) => mv.po_number.trim()))];
  const purchase_po_numbers = [...new Set(inTagged.map((mv) => mv.po_number.trim()))];
  const usage_po_numbers = [...new Set(outTagged.map((mv) => mv.po_number.trim()))];
  const lastIn = inTagged[0];
  const last_po_number = lastIn ? lastIn.po_number.trim() : (tagged[0] ? tagged[0].po_number.trim() : '');
  return { po_numbers, purchase_po_numbers, usage_po_numbers, last_po_number };
}

// Case- and whitespace-insensitive material lookup by name. Used to merge
// duplicate entries: typing a name that already exists (in Add Material or
// Record Purchase) updates the FIRST record ever created with that name
// instead of creating a second one.
function normName(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
// True when `selectedSubId` is either the exact node `materialSubId` points
// to, or one of its ancestors up the L2->L5 chain. Lets picking a shallower
// sub-category level (e.g. L3) still match a material that was filed one or
// more levels deeper (up to L5) underneath it, instead of requiring the
// exact same node.
function subcategoryMatches(materialSubId, selectedSubId, allSubcategories) {
  if (materialSubId == null || selectedSubId == null) return false;
  if (String(materialSubId) === String(selectedSubId)) return true;
  const chain = resolveAncestors(materialSubId, allSubcategories);
  return chain.some((node) => String(node.id) === String(selectedSubId));
}

function findMaterialByName(name) {
  const key = normName(name);
  if (!key) return null;
  const matches = Materials.all().filter((m) => normName(m.material_name) === key);
  if (!matches.length) return null;
  matches.sort((a, b) => a.id - b.id); // oldest record wins
  return matches[0];
}

// Fallback bucket for materials that get auto-created from a typed name
// without the user picking a Category first (e.g. Record Material Purchase
// with only a Material Name typed in). Ensures a Material record always
// lands in the Material section instead of silently not being created.
function getOrCreateUncategorized() {
  const existing = Categories.all().find((c) => normName(c.name) === 'uncategorized');
  if (existing) return existing;
  return Categories.insert({ name: 'Uncategorized' });
}

function enrichMaterial(m) {
  const category = m.category_id ? Categories.find(m.category_id) : null;
  const allSubs = Subcategories.all();
  const ancestors = m.subcategory_id ? resolveAncestors(m.subcategory_id, allSubs) : [];

  // Keep backward-compat names for existing exports/PDF code, plus add breadcrumb
  const subcategory_name   = ancestors[0]?.name || '-';
  const subsubcategory_name = ancestors[1]?.name || '-';

  // Full breadcrumb: ['Steel', 'Plates', 'MS Plates', 'Thick', 'Hot Rolled']
  const breadcrumb = [
    category?.name,
    ...ancestors.map((a) => a.name),
  ].filter(Boolean);

  const { po_numbers, purchase_po_numbers, usage_po_numbers, last_po_number } = materialPoInfo(m.id);

  return Object.assign({}, m, {
    category_name: category ? category.name : '-',
    subcategory_name,
    subsubcategory_name,
    breadcrumb,
    // Full path as a single readable string, e.g. "Steel > Plates > MS Plates
    // > Thick > Hot Rolled" — used on the Excel/PDF export so the complete
    // hierarchy is visible in one column instead of just Category + one
    // Sub-category level.
    category_path: breadcrumb.length ? breadcrumb.join(' > ') : '-',
    depth: ancestors.length, // 0 = no sub, 1 = one sub, up to 4 for 5-level
    po_numbers,        // every distinct PO Number ever linked to this material (purchase + usage combined)
    purchase_po_numbers, // PO Number Details - POs this material was purchased/arrived against
    usage_po_numbers,    // Usage PO Number Details - POs this material was used/stocked-out against
    last_po_number,    // most recent arrival's PO Number - used as the Stock Out default
  });
}

function enrichMovement(mv) {
  const material = Materials.find(mv.material_id);
  return Object.assign({}, mv, {
    material_name: material ? material.material_name : 'Unknown material',
    material_unit: material ? material.unit : '',
    material_code: material ? material.material_code : '',
  });
}

function enrichPurchase(p) {
  const material = p.material_id ? Materials.find(p.material_id) : null;
  // When a purchase isn't linked to an existing Material record (material
  // name wasn't available to auto-select), fall back to the category/
  // sub-category chosen directly on the purchase plus any manually typed name.
  const subcategoryId = material ? material.subcategory_id : p.subcategory_id;
  const categoryId = material ? material.category_id : p.category_id;
  const subcategory = subcategoryId ? Subcategories.find(subcategoryId) : null;
  const category = categoryId ? Categories.find(categoryId) : null;
  const { bill_data, ...rest } = p;
  return Object.assign({}, rest, {
    material_name: material ? material.material_name : (p.manual_material_name || '-'),
    material_unit: material ? material.unit : '',
    category_name: category ? category.name : '-',
    subcategory_name: subcategory ? subcategory.name : '-',
    has_bill: !!bill_data,
  });
}

function register(router) {
  // ---- Categories ----
  router.get('/api/categories', requireAuth, async (req, res) => {
    res.json({ categories: Categories.all().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) });
  });

  router.post('/api/categories', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const { name } = req.body || {};
    if (!name) { res.status(400).json({ error: 'Category name is required.' }); return; }
    const category = Categories.insert({ name });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'category', recordId: category.id, details: name });
    res.status(201).json({ category });
  });

  router.put('/api/categories/:id', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const category = Categories.update(req.params.id, { name: req.body.name });
    if (!category) { res.status(404).json({ error: 'Category not found.' }); return; }
    res.json({ category });
  });

  router.delete('/api/categories/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const id = Number(req.params.id);
    const category = Categories.find(id);
    if (!category) { res.status(404).json({ error: 'Category not found.' }); return; }
    const hasSubcategories = Subcategories.count((s) => s.category_id === id) > 0;
    if (hasSubcategories) {
      res.status(400).json({ error: 'Cannot delete a category that still has sub-categories. Remove those first.' });
      return;
    }
    Categories.delete(id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'category', record: category });
    res.json({ ok: true });
  });

  // ---- Subcategories (unlimited depth up to 5 levels via parent_id) ----
  // GET /api/subcategories?category_id=X       → full tree for a category (all depths)
  // GET /api/subcategories?parent_id=Y         → direct children of a node
  // GET /api/subcategories?category_id=X&direct=true → level-2 only (direct children)
  router.get('/api/subcategories', requireAuth, async (req, res) => {
    const { category_id, parent_id, direct } = req.query;
    let rows = Subcategories.all();
    if (category_id) {
      if (direct === 'true') {
        // Only the immediate children of the category (depth 1)
        rows = rows.filter((s) => String(s.category_id) === String(category_id) && !s.parent_id);
      } else {
        // Full subtree for this category: all nodes that belong to this category
        rows = rows.filter((s) => String(s.category_id) === String(category_id));
      }
    } else if (parent_id) {
      // Direct children of a subcategory node
      rows = rows.filter((s) => String(s.parent_id) === String(parent_id));
    }
    res.json({ subcategories: rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) });
  });

  router.post('/api/subcategories', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const { name, category_id, parent_id } = req.body || {};
    if (!name) { res.status(400).json({ error: 'Name is required.' }); return; }

    if (parent_id) {
      const parent = Subcategories.find(parent_id);
      if (!parent) { res.status(404).json({ error: 'Parent node not found.' }); return; }

      // Count depth of this parent (walk up the chain)
      const allSubs = Subcategories.all();
      const byId = {};
      allSubs.forEach((s) => { byId[s.id] = s; });
      let depth = 1; // parent is level-2, so child will be level-3 etc.
      let cur = parent;
      while (cur.parent_id && depth < 10) { cur = byId[cur.parent_id]; depth++; }
      // depth 1 = parent is level-2, child will be level-3
      // depth 4 = parent is level-5, child would be level-6 → blocked
      if (depth >= 4) {
        res.status(400).json({ error: 'Maximum 5 levels supported: Main → Sub → Sub-Sub → Sub-Sub-Sub → Sub-Sub-Sub-Sub.' });
        return;
      }

      const subcategory = Subcategories.insert({
        name,
        category_id: parent.category_id,
        parent_id: Number(parent_id),
      });
      logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'subcategory', recordId: subcategory.id, details: `${name} (under ${parent.name})` });
      res.status(201).json({ subcategory });
    } else {
      if (!category_id || !Categories.find(category_id)) { res.status(404).json({ error: 'Category not found.' }); return; }
      const subcategory = Subcategories.insert({ name, category_id: Number(category_id), parent_id: null });
      logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'subcategory', recordId: subcategory.id, details: name });
      res.status(201).json({ subcategory });
    }
  });

  router.put('/api/subcategories/:id', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const patch = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.category_id !== undefined) patch.category_id = req.body.category_id ? Number(req.body.category_id) : null;
    const subcategory = Subcategories.update(req.params.id, patch);
    if (!subcategory) { res.status(404).json({ error: 'Sub-category not found.' }); return; }
    res.json({ subcategory });
  });

  router.delete('/api/subcategories/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const id = Number(req.params.id);
    const subcategory = Subcategories.find(id);
    if (!subcategory) { res.status(404).json({ error: 'Sub-category not found.' }); return; }
    const hasMaterials = Materials.count((m) => m.subcategory_id === id) > 0;
    if (hasMaterials) {
      res.status(400).json({ error: 'Cannot delete a sub-category that still has materials. Remove those first.' });
      return;
    }
    Subcategories.delete(id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'subcategory', record: subcategory });
    res.json({ ok: true });
  });

  // ---- Materials ----
  router.get('/api/materials', requireAuth, async (req, res) => {
    const { category_id, subcategory_id, po_number, usage_po_number } = req.query;
    let rows = Materials.all();
    if (category_id) rows = rows.filter((m) => m.category_id === Number(category_id));
    if (subcategory_id) rows = rows.filter((m) => m.subcategory_id === Number(subcategory_id));
    let enriched = rows.map(enrichMaterial);
    // "PO Number Details" filter - materials purchased against a given PO Number.
    if (po_number) enriched = enriched.filter((m) => (m.purchase_po_numbers || []).includes(po_number));
    // "Usage PO Number Details" filter - materials used/stocked-out against a given PO Number.
    // Independent from the purchase filter above, per the requirement that
    // the two be searchable/trackable separately.
    if (usage_po_number) enriched = enriched.filter((m) => (m.usage_po_numbers || []).includes(usage_po_number));
    res.json({ materials: enriched.sort((a, b) => a.material_name.localeCompare(b.material_name, undefined, { numeric: true, sensitivity: 'base' })) });
  });

  router.get('/api/materials/:id', requireAuth, async (req, res) => {
    const m = Materials.find(req.params.id);
    if (!m) { res.status(404).json({ error: 'Material not found.' }); return; }
    const history = StockMovements.where((mv) => mv.material_id === m.id).sort((a, b) => b.id - a.id);
    res.json({ material: enrichMaterial(m), history });
  });

  // ---- Stock Movements (used by the "PO section" on a PO Number's detail
  // page to automatically show when material arrived and when it was used) ----
  router.get('/api/stock-movements', requireAuth, async (req, res) => {
    const { po_number, material_id, type } = req.query;
    let rows = StockMovements.all();
    if (po_number) rows = rows.filter((mv) => (mv.po_number || '').trim().toLowerCase() === String(po_number).trim().toLowerCase());
    if (material_id) rows = rows.filter((mv) => mv.material_id === Number(material_id));
    if (type) rows = rows.filter((mv) => mv.type === type);
    res.json({ movements: rows.map(enrichMovement).sort((a, b) => b.id - a.id) });
  });

  // Creating a material only requires Category (Sub-category and Material
  // Name are both optional). Unit defaults to "unit" and quantity starts at
  // 0 - both can be adjusted later via Edit / Stock In, but aren't part of
  // initial registration. When Material Name is left blank, it's derived
  // from the deepest selected category/sub-category so the record still has
  // a sensible, human-readable name.
  router.post('/api/materials', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const b = req.body || {};
    if (!b.category_id) { res.status(400).json({ error: 'Category is required.' }); return; }
    const category = Categories.find(b.category_id);
    if (!category) { res.status(404).json({ error: 'Category not found.' }); return; }
    const subcategory = b.subcategory_id ? Subcategories.find(b.subcategory_id) : null;
    if (b.subcategory_id && !subcategory) { res.status(404).json({ error: 'Sub-category not found.' }); return; }
    const seq = Materials.count() + 1;
    const materialCode = `MAT-${String(seq).padStart(4, '0')}`;
    const typedName = (b.material_name || '').trim();

    // If a material with this exact name already exists, update the existing
    // record (add the entered quantity to its stock) instead of creating a
    // duplicate entry. Only brand-new names create a new material.
    const existingByName = typedName ? findMaterialByName(typedName) : null;
    if (existingByName) {
      const addQty = Math.max(0, Number(b.quantity || 0));
      const patch = {};
      if (addQty > 0) patch.quantity = existingByName.quantity + addQty;
      // Fill in supplier only if the existing record doesn't have one yet —
      // never silently overwrite data on the original record.
      if (!existingByName.company_name && (b.company_name || '').trim()) patch.company_name = b.company_name.trim();
      const material = Object.keys(patch).length ? Materials.update(existingByName.id, patch) : existingByName;
      if (addQty > 0) {
        StockMovements.insert({
          material_id: material.id, type: 'in', quantity: addQty,
          reference: 'Stock added via Add Material (existing material matched by name)',
          po_number: (b.po_number || '').trim(), user_id: req.user.id,
        });
      }
      logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'material', recordId: material.id, details: `${material.material_name} — duplicate entry merged into ${material.material_code}${addQty > 0 ? ` (+${addQty} ${material.unit})` : ''}` });
      res.json({
        material: enrichMaterial(material),
        merged: true,
        message: `"${material.material_name}" already exists as ${material.material_code} — the existing record was updated${addQty > 0 ? ` (stock +${addQty} ${material.unit})` : ''} instead of creating a duplicate.`,
      });
      return;
    }

    const materialName = typedName || `${subcategory ? subcategory.name : category.name} (${materialCode})`;
    const material = Materials.insert({
      material_code: materialCode,
      material_name: materialName, category_id: Number(b.category_id),
      subcategory_id: b.subcategory_id ? Number(b.subcategory_id) : null,
      unit: b.unit || 'unit', quantity: Number(b.quantity || 0),
      company_name: b.company_name || '',
    });
    if (material.quantity > 0) {
      StockMovements.insert({ material_id: material.id, type: 'in', quantity: material.quantity, reference: 'Opening Stock', user_id: req.user.id });
    }
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'material', recordId: material.id, details: material.material_name });
    res.status(201).json({ material: enrichMaterial(material) });
  });

  router.put('/api/materials/:id', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const existing = Materials.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Material not found.' }); return; }
    const patch = {};
    ['material_name', 'unit', 'company_name'].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    if (req.body.category_id !== undefined) patch.category_id = req.body.category_id ? Number(req.body.category_id) : null;
    if (req.body.subcategory_id !== undefined) patch.subcategory_id = req.body.subcategory_id ? Number(req.body.subcategory_id) : null;
    // Material Name is optional here too — if it's cleared out, re-derive it
    // from the (possibly just-updated) category/sub-category instead of
    // saving a blank name.
    if (patch.material_name !== undefined && !String(patch.material_name).trim()) {
      const catId = patch.category_id !== undefined ? patch.category_id : existing.category_id;
      const subId = patch.subcategory_id !== undefined ? patch.subcategory_id : existing.subcategory_id;
      const cat = catId ? Categories.find(catId) : null;
      const sub = subId ? Subcategories.find(subId) : null;
      patch.material_name = `${sub ? sub.name : (cat ? cat.name : 'Material')} (${existing.material_code})`;
    }
    const material = Materials.update(req.params.id, patch);
    res.json({ material: enrichMaterial(material) });
  });

  router.post('/api/materials/:id/stock-in', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const { quantity, reference, po_number } = req.body || {};
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: 'Quantity must be a valid number greater than zero.' }); return; }
    const material = Materials.find(req.params.id);
    if (!material) { res.status(404).json({ error: 'Material not found.' }); return; }
    const updated = Materials.update(material.id, { quantity: material.quantity + qty });
    StockMovements.insert({
      material_id: material.id, type: 'in', quantity: qty, reference: reference || 'Stock In',
      po_number: (po_number || '').trim(), user_id: req.user.id,
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'stock_in', module: 'material', recordId: material.id, details: `+${qty} ${material.unit}` });
    res.json({ material: enrichMaterial(updated) });
  });

  router.post('/api/materials/:id/stock-out', requireAuth, forbidRole('sales', 'accounts'), async (req, res) => {
    const { quantity, reference, po_number } = req.body || {};
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: 'Quantity must be a valid number greater than zero.' }); return; }
    if (!reference || !reference.trim()) {
      res.status(400).json({ error: 'Please enter a note explaining where this material was used.' });
      return;
    }
    const material = Materials.find(req.params.id);
    if (!material) { res.status(404).json({ error: 'Material not found.' }); return; }
    if (qty > material.quantity) {
      res.status(400).json({ error: `Insufficient stock. Available: ${material.quantity} ${material.unit}.` });
      return;
    }
    const updated = Materials.update(material.id, { quantity: material.quantity - qty });
    StockMovements.insert({
      material_id: material.id, type: 'out', quantity: qty, reference: reference.trim(),
      po_number: (po_number || '').trim(), user_id: req.user.id,
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'stock_out', module: 'material', recordId: material.id, details: `-${qty} ${material.unit}` });
    res.json({ material: enrichMaterial(updated) });
  });

  router.delete('/api/materials/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const material = Materials.find(req.params.id);
    if (!material) { res.status(404).json({ error: 'Material not found.' }); return; }
    Materials.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'material', record: material });
    res.json({ ok: true });
  });

  router.post('/api/materials/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const material = Materials.find(id);
      if (material && Materials.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'material', record: material, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Material Purchase ----
  // Unit + Quantity Purchased + Category + Sub Category (filters to find the
  // right Material) + Company Name. Recording a purchase increases that
  // Material's stock automatically. Restricted to Production Team and Admin.
  router.get('/api/material-purchases', requireAuth, requireRole('production'), async (req, res) => {
    const { material_id, company_name, po_number } = req.query;
    let rows = MaterialPurchases.all();
    if (material_id) rows = rows.filter((p) => p.material_id === Number(material_id));
    if (company_name) rows = rows.filter((p) => p.company_name.toLowerCase().includes(company_name.toLowerCase()));
    if (po_number) rows = rows.filter((p) => (p.po_number || '').trim().toLowerCase() === String(po_number).trim().toLowerCase());
    res.json({ purchases: rows.map(enrichPurchase).sort((a, b) => b.id - a.id) });
  });

  // Material is auto-selected from the 5-level category/sub-category chain
  // when a matching Material record exists, but it's not mandatory - if
  // nothing matches yet, the purchase can still be recorded (optionally
  // against the chosen category/sub-category and a manually typed name) and
  // simply won't move any inventory stock.
  //
  // Matching rule when no Material was picked from the dropdown: matching
  // gets more specific the more the user fills in.
  //   - Category only            -> matches ANY material already in that
  //                                 Category (Sub-category/Name ignored).
  //   - Category + Sub-category  -> must also be in that Sub-category.
  //   - Category + Material Name -> must also have that Material Name
  //                                 (case/whitespace-insensitive).
  //   - Category + Sub-category + Name -> must match all three.
  // Whatever combination matches an existing material adds this purchase's
  // stock to it; a new material (using exactly the fields the user filled
  // in) is only created when nothing matches.
  //
  // PO Number (optional, select-from-list or type-manually) and Remarks /
  // Usage Location (optional) are recorded on the purchase itself. When a
  // Material was matched, the same PO Number is also stamped onto the Stock
  // In movement it creates - so that material's next Stock Out defaults to
  // "the same PO Number it was purchased for" (still editable by the user).
  router.post('/api/material-purchases', requireAuth, requireRole('production'), async (req, res) => {
    const b = req.body || {};
    if (!b.quantity || !b.company_name) {
      res.status(400).json({ error: 'Quantity and company name are required.' });
      return;
    }
    const quantity = Number(b.quantity);
    if (quantity <= 0) { res.status(400).json({ error: 'Quantity must be greater than zero.' }); return; }

    let material = b.material_id ? Materials.find(b.material_id) : null;
    if (b.material_id && !material) { res.status(404).json({ error: 'Material not found.' }); return; }
    if (b.category_id && !Categories.find(b.category_id)) { res.status(404).json({ error: 'Category not found.' }); return; }
    if (b.subcategory_id && !Subcategories.find(b.subcategory_id)) { res.status(404).json({ error: 'Sub-category not found.' }); return; }

    let materialNote = '';
    const typedName = (b.material_name || '').trim();
    if (!material && b.category_id) {
      // Narrow the match by every field the user actually filled in - so
      // Category alone matches broadly, but adding a Sub-category and/or a
      // Material Name makes the match that much more specific.
      const category = Categories.find(b.category_id);
      const subcategoryId = b.subcategory_id ? Number(b.subcategory_id) : null;
      let candidates = Materials.all().filter((m) => m.category_id === category.id);
      const matchedOnSub  = subcategoryId != null;
      const matchedOnName = !!typedName;
      if (matchedOnSub) {
        const allSubs = Subcategories.all();
        candidates = candidates.filter((m) => subcategoryMatches(m.subcategory_id, subcategoryId, allSubs));
      }
      if (matchedOnName) candidates = candidates.filter((m) => normName(m.material_name) === normName(typedName));
      candidates.sort((a, c) => a.id - c.id);
      const existingMatch = candidates[0] || null;

      if (existingMatch) {
        material = existingMatch;
        const basis = matchedOnSub && matchedOnName ? 'Category + Sub-category + Material Name'
          : matchedOnSub ? 'Category + Sub-category'
          : matchedOnName ? 'Category + Material Name'
          : 'Category';
        materialNote = `Matched existing material ${material.material_code} (${material.material_name}) by ${basis} — its stock will be updated.`;
      } else {
        const seq = Materials.count() + 1;
        const materialCode = `MAT-${String(seq).padStart(4, '0')}`;
        material = Materials.insert({
          material_code: materialCode,
          material_name: typedName || category.name,
          category_id: category.id,
          subcategory_id: subcategoryId,
          unit: b.unit || 'unit',
          quantity: 0,
          company_name: b.company_name || '',
        });
        logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'material', recordId: material.id, details: `${material.material_name} (auto-created from Record Purchase)` });
        materialNote = `New material ${material.material_code} was created automatically under "${category.name}".`;
      }
    } else if (!material && typedName) {
      // No Category was chosen at all - fall back to matching by the typed
      // Material Name instead (still updates existing stock if that exact
      // name already exists anywhere), landing under "Uncategorized" if new.
      const existingByName = findMaterialByName(typedName);
      if (existingByName) {
        material = existingByName;
        materialNote = `Matched existing material ${material.material_code} — its stock will be updated.`;
      } else {
        const category = getOrCreateUncategorized();
        const seq = Materials.count() + 1;
        const materialCode = `MAT-${String(seq).padStart(4, '0')}`;
        material = Materials.insert({
          material_code: materialCode,
          material_name: typedName,
          category_id: category.id,
          subcategory_id: null,
          unit: b.unit || 'unit',
          quantity: 0,
          company_name: b.company_name || '',
        });
        logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'material', recordId: material.id, details: `${material.material_name} (auto-created from Record Purchase)` });
        materialNote = `New material ${material.material_code} was created automatically from this purchase.`;
      }
    }

    const billFile = req.files && req.files.bill;
    if (billFile) {
      const MAX_BILL_BYTES = 15 * 1024 * 1024;
      if (billFile.data.length > MAX_BILL_BYTES) {
        res.status(400).json({ error: `Bill file is too large. Maximum size is ${MAX_BILL_BYTES / (1024 * 1024)}MB.` });
        return;
      }
    }

    const poNumber = (b.po_number || '').trim();
    const remarks = (b.remarks || '').trim();

    const purchase = MaterialPurchases.insert({
      material_id: material ? material.id : null,
      // Only kept when there's no linked Material, purely for the
      // category/sub-category breadcrumb and label on the purchase record.
      category_id: !material && b.category_id ? Number(b.category_id) : null,
      subcategory_id: !material && b.subcategory_id ? Number(b.subcategory_id) : null,
      manual_material_name: !material ? (b.material_name || '').trim() : null,
      quantity, company_name: b.company_name,
      purchase_date: b.purchase_date || new Date().toISOString().slice(0, 10),
      po_number: poNumber,
      remarks,
      recorded_by: req.user.id,
      bill_data: billFile ? billFile.data.toString('base64') : null,
      bill_mime_type: billFile ? billFile.mimeType : null,
      bill_filename: billFile ? billFile.filename : null,
    });

    // Connects to Materials: recording a purchase increases stock automatically,
    // but only when a specific Material record was matched/selected.
    let updatedMaterial = null;
    if (material) {
      updatedMaterial = Materials.update(material.id, { quantity: material.quantity + quantity });
      StockMovements.insert({
        material_id: material.id, type: 'in', quantity,
        reference: `Purchase from ${b.company_name}`, po_number: poNumber, user_id: req.user.id,
      });
    }

    const label = material ? material.material_name : (purchase.manual_material_name || 'unspecified material');
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'material_purchase', recordId: purchase.id, details: `${quantity}${material ? ` ${material.unit}` : ''} of ${label} from ${b.company_name}` });
    res.status(201).json({ purchase: enrichPurchase(purchase), material: updatedMaterial ? enrichMaterial(updatedMaterial) : null, message: materialNote || undefined });
  });

  router.get('/api/material-purchases/:id/bill', requireAuth, requireRole('production'), async (req, res) => {
    const purchase = MaterialPurchases.find(req.params.id);
    if (!purchase || !purchase.bill_data) { res.status(404).json({ error: 'No bill uploaded for this purchase.' }); return; }
    res.setHeader('Content-Type', purchase.bill_mime_type || 'application/octet-stream');
    // Inline (not attachment) so PDFs/images open directly in the browser
    // tab for viewing, matching the "View Document" action on the list.
    res.setHeader('Content-Disposition', `inline; filename="${sanitizeHeaderFilename(purchase.bill_filename)}"`);
    res.end(Buffer.from(purchase.bill_data, 'base64'));
  });

  router.delete('/api/material-purchases/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const purchase = MaterialPurchases.find(req.params.id);
    if (!purchase) { res.status(404).json({ error: 'Purchase record not found.' }); return; }
    MaterialPurchases.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'material_purchase', record: purchase });
    res.json({ ok: true });
  });

  router.post('/api/material-purchases/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const purchase = MaterialPurchases.find(id);
      if (purchase && MaterialPurchases.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'material_purchase', record: purchase, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Downloads ----
  registerExport(router, {
    path: '/api/materials',
    title: 'Material Management',
    middleware: [requireAuth],
    columns: [
      { key: 'category_name', label: 'Category', width: 120 },
      { key: 'subcategory_name', label: 'Sub-category', width: 120 },
      { key: 'category_path', label: 'Category Path', width: 220 },
      { key: 'material_name', label: 'Material Name', width: 180 },
      { key: 'unit', label: 'Unit', width: 70 },
      { key: 'quantity', label: 'Total Items', width: 90 },
      { key: 'purchase_po_display', label: 'PO Number Details', width: 160 },
      { key: 'usage_po_display', label: 'Usage PO Number Details', width: 160 },
    ],
    getRows: async () => Materials.all().map(enrichMaterial).map((m) => ({
      ...m,
      purchase_po_display: (m.purchase_po_numbers || []).join(', '),
      usage_po_display: (m.usage_po_numbers || []).join(', '),
    })).sort((a, b) => a.material_name.localeCompare(b.material_name, undefined, { numeric: true, sensitivity: 'base' })),
  });

  registerExport(router, {
    path: '/api/material-purchases',
    title: 'Material Purchase',
    middleware: [requireAuth, requireRole('production')],
    columns: [
      { key: 'purchase_date', label: 'Date', width: 90 },
      { key: 'category_name', label: 'Category', width: 110 },
      { key: 'subcategory_name', label: 'Sub-category', width: 110 },
      { key: 'material_name', label: 'Material', width: 180 },
      { key: 'quantity', label: 'Quantity Purchased', width: 100 },
      { key: 'material_unit', label: 'Unit', width: 70 },
      { key: 'company_name', label: 'Company Name', width: 160 },
      { key: 'po_number', label: 'PO Number', width: 100 },
      { key: 'remarks', label: 'Remarks / Usage Location', width: 160 },
    ],
    getRows: async (req) => {
      const { date_from, date_to, product } = req.query;
      let rows = MaterialPurchases.all().map(enrichPurchase);
      if (date_from) rows = rows.filter((p) => p.purchase_date >= date_from);
      if (date_to) rows = rows.filter((p) => p.purchase_date <= date_to);
      if (product) rows = rows.filter((p) => p.material_name === product);
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
