// src/pages/Materials.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, Spinner, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, DownloadButton, StockQty } from '../components/ui';
import { useAuth } from '../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// ALL helper components are at module scope — never inside a parent component.
// Defining a component inside a render function gives it a new identity every
// render, which causes React to unmount+remount it, destroying focus after
// every single keystroke (the "one character at a time" bug).
// ─────────────────────────────────────────────────────────────────────────────

// Shared inline add-input row used at every level of the tree.
function AddInput({ placeholder, value, onChange, onAdd }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
        className="flex-1 px-2.5 py-1.5 text-xs border border-dashed border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
      />
      <button
        type="button"
        onClick={onAdd}
        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-100 rounded-md hover:bg-amber-500 hover:text-white dark:hover:bg-amber-600 transition-colors"
      >
        Add
      </button>
    </div>
  );
}

// Recursive tree node — renders a single subcategory row at any depth (1-4),
// then recursively renders its children. Depth colours get progressively
// lighter so the nesting is visually clear without needing explicit icons.
// depth 0 = level-2 (direct children of a category)
// depth 3 = level-5 (deepest allowed; no further "Add" input is shown)
const DEPTH_BORDER = [
  'border-slate-300 dark:border-slate-600',   // L2
  'border-amber-300 dark:border-amber-700',   // L3
  'border-emerald-300 dark:border-emerald-800', // L4
  'border-sky-300 dark:border-sky-800',       // L5
];
const DEPTH_LABEL = ['Sub', 'Sub-sub', 'L4', 'L5'];

function SubTreeNode({ node, allSubs, depth, expanded, onToggle, addInputs, onInputChange, onAdd, onDelete }) {
  const nodeKey = `sub-${node.id}`;
  const isOpen = expanded.has(nodeKey);
  const children = allSubs.filter((s) => s.parent_id === node.id);
  const atMaxDepth = depth >= 3; // depth 3 = level-5, can't add further

  return (
    <div className={`ml-4 pl-3 border-l-2 ${DEPTH_BORDER[Math.min(depth, 3)]} mt-1.5`}>
      {/* Row header */}
      <div className="flex items-center gap-1.5 py-1">
        {/* Expand/collapse chevron */}
        <button
          onClick={() => onToggle(nodeKey)}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 w-4 h-4 flex items-center justify-center"
        >
          {children.length > 0 || !atMaxDepth ? (
            <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" />
          )}
        </button>

        {/* Level badge */}
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex-shrink-0 w-8">
          {DEPTH_LABEL[depth] || `L${depth + 2}`}
        </span>

        {/* Name */}
        <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">{node.name}</span>

        {/* Child count */}
        {children.length > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{children.length}</span>
        )}

        {/* Delete */}
        <button
          onClick={() => onDelete(node.id)}
          className="flex-shrink-0 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 text-base leading-none ml-1"
          title={`Delete "${node.name}"`}
        >×</button>
      </div>

      {/* Children (recursive) + add input when open */}
      {isOpen && (
        <div>
          {children.length === 0 && !atMaxDepth && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-5 mb-1">No children yet.</p>
          )}
          {children.map((child) => (
            <SubTreeNode
              key={child.id}
              node={child}
              allSubs={allSubs}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              addInputs={addInputs}
              onInputChange={onInputChange}
              onAdd={onAdd}
              onDelete={onDelete}
            />
          ))}
          {!atMaxDepth && (
            <div className="ml-5 mb-1">
              <AddInput
                placeholder={`Add under "${node.name}"…`}
                value={addInputs[nodeKey] || ''}
                onChange={(v) => onInputChange(nodeKey, v)}
                onAdd={() => onAdd(node.id, nodeKey)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Category Manager: up to 5 levels ─────────────────────────────────────────
// Structure: Category (L1) → Sub (L2) → Sub-sub (L3) → L4 → L5
// The tree is fully recursive via SubTreeNode above.
function CategoryManagerModal({ open, onClose, onChanged }) {
  const [categories, setCategories] = useState([]);
  const [allSubs, setAllSubs] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [addInputs, setAddInputs] = useState({});

  const load = useCallback(() => {
    api.get('/api/categories').then((res) => setCategories(res.categories));
    api.get('/api/subcategories').then((res) => setAllSubs(res.subcategories));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });
  const onInputChange = (key, val) => setAddInputs((p) => ({ ...p, [key]: val }));

  const addCategory = async (e) => {
    e.preventDefault();
    setError('');
    try { await api.post('/api/categories', { name: newCategory }); setNewCategory(''); load(); onChanged(); }
    catch (err) { setError(err.message); }
  };

  // Add a child under a category (level-2) or under a subcategory node (any deeper level)
  const addNode = async (parentSubId, key, catId) => {
    const name = (addInputs[key] || '').trim();
    if (!name) return;
    setError('');
    try {
      if (parentSubId) {
        await api.post('/api/subcategories', { name, parent_id: parentSubId });
      } else {
        await api.post('/api/subcategories', { name, category_id: catId });
      }
      onInputChange(key, '');
      load(); onChanged();
    } catch (err) { setError(err.message); }
  };

  const deleteSub = async (id) => {
    setError('');
    try { await api.delete(`/api/subcategories/${id}`); load(); onChanged(); }
    catch (err) { setError(err.message); }
  };

  const deleteCategory = async (id) => {
    setError('');
    try { await api.delete(`/api/categories/${id}`); load(); onChanged(); }
    catch (err) { setError(err.message); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Categories & Hierarchy" wide>
      {error && <Banner>{error}</Banner>}

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Up to <strong>5 levels</strong>: <span className="text-slate-700 dark:text-slate-200">Main → Sub → Sub-Sub → L4 → L5</span>.
        Click any row to expand it, then use the add input to create a child node.
      </p>

      {/* Add category */}
      <form onSubmit={addCategory} className="flex gap-2 mb-5">
        <Input
          placeholder="New main category (e.g. Steel, Electrical, Mechanical)"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" variant="accent">+ Add Category</Button>
      </form>

      {/* Category tree */}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {categories.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No categories yet.</p>
        )}
        {categories.map((cat) => {
          const catKey = `cat-${cat.id}`;
          const isOpen = expanded.has(catKey);
          const directChildren = allSubs.filter((s) => s.category_id === cat.id && !s.parent_id);

          return (
            <div key={cat.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              {/* ── Level 1: Category (root) ── */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1C2530] dark:bg-slate-900/80 text-white">
                <button
                  onClick={() => toggle(catKey)}
                  className="flex-shrink-0 text-slate-400 hover:text-white"
                >
                  <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex-shrink-0">Main</span>
                <span className="flex-1 text-sm font-bold">{cat.name}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{directChildren.length} sub</span>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="text-slate-500 hover:text-red-400 text-sm ml-2 flex-shrink-0"
                  title={`Delete "${cat.name}"`}
                >Delete</button>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 pt-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                  {directChildren.length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 ml-5">No sub-categories yet.</p>
                  )}
                  {/* Level 2+ children rendered recursively */}
                  {directChildren.map((child) => (
                    <SubTreeNode
                      key={child.id}
                      node={child}
                      allSubs={allSubs}
                      depth={0}
                      expanded={expanded}
                      onToggle={toggle}
                      addInputs={addInputs}
                      onInputChange={onInputChange}
                      onAdd={(parentId, key) => addNode(parentId, key, null)}
                      onDelete={deleteSub}
                    />
                  ))}
                  {/* Add level-2 sub-category */}
                  <div className="ml-4 mt-2">
                    <AddInput
                      placeholder={`Add sub-category under "${cat.name}"…`}
                      value={addInputs[catKey] || ''}
                      onChange={(v) => onInputChange(catKey, v)}
                      onAdd={() => addNode(null, catKey, cat.id)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}


// ── Add / Edit Material Form with 5-level cascading selectors ────────────────
function MaterialForm({ onSaved, onClose, existing }) {
  const [categories, setCategories] = useState([]);
  // Each level's options, loaded dynamically when its parent is selected.
  // levels[0] = direct children of the selected category (L2)
  // levels[1] = children of selected L2 node (L3)  ... up to levels[3] (L5)
  const [levels, setLevels] = useState([[], [], [], []]);
  // Selected node IDs at each sub-level: [L2-id, L3-id, L4-id, L5-id]
  const [selected, setSelected] = useState(['', '', '', '']);
  const [form, setForm] = useState({
    category_id: '',
    material_name: existing?.material_name || '',
    unit: existing?.unit || 'kg',
    quantity: existing?.quantity ?? '',
    company_name: existing?.company_name || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/categories').then((res) => setCategories(res.categories));
  }, []);

  // When editing an existing material, reconstruct the ancestor chain so the
  // selectors pre-populate correctly.
  useEffect(() => {
    if (!existing?.category_id) return;
    setForm((f) => ({ ...f, category_id: String(existing.category_id) }));
    if (!existing.subcategory_id) return;

    api.get('/api/subcategories').then((res) => {
      const all = res.subcategories;
      const byId = {};
      all.forEach((s) => { byId[s.id] = s; });

      // Walk up the ancestor chain from the stored subcategory_id
      const chain = [];
      let cur = byId[existing.subcategory_id];
      while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId[cur.parent_id] : null; }

      // chain[0] = L2 node, chain[1] = L3 node, etc.
      const newSelected = ['', '', '', ''];
      const newLevels = [[], [], [], []];

      // L2 options = direct children of the category
      newLevels[0] = all.filter((s) => String(s.category_id) === String(existing.category_id) && !s.parent_id);

      chain.forEach((node, i) => {
        newSelected[i] = String(node.id);
        if (i < 3) {
          newLevels[i + 1] = all.filter((s) => s.parent_id === node.id);
        }
      });

      setSelected(newSelected);
      setLevels(newLevels);
    });
  }, [existing]);

  const onCategoryChange = (e) => {
    const id = e.target.value;
    setForm((f) => ({ ...f, category_id: id }));
    setSelected(['', '', '', '']);
    setLevels([[], [], [], []]);
    if (id) {
      api.get(`/api/subcategories?category_id=${id}&direct=true`).then((res) =>
        setLevels((l) => { const n = [...l]; n[0] = res.subcategories; return n; })
      );
    }
  };

  const onLevelChange = (levelIndex, nodeId) => {
    // Clear all deeper selections and options when a shallower node changes
    const newSelected = [...selected];
    newSelected[levelIndex] = nodeId;
    for (let i = levelIndex + 1; i < 4; i++) newSelected[i] = '';
    setSelected(newSelected);

    const newLevels = [...levels];
    for (let i = levelIndex + 1; i < 4; i++) newLevels[i] = [];
    setLevels(newLevels);

    if (nodeId && levelIndex < 3) {
      api.get(`/api/subcategories?parent_id=${nodeId}`).then((res) => {
        if (res.subcategories.length > 0) {
          setLevels((l) => { const n = [...l]; n[levelIndex + 1] = res.subcategories; return n; });
        }
      });
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    // Use the deepest selected level as the stored subcategory_id
    const finalSubId = [...selected].reverse().find((id) => id) || '';
    const payload = {
      category_id: form.category_id,
      subcategory_id: finalSubId || null,
      material_name: form.material_name,
      unit: form.unit,
      company_name: form.company_name,
      quantity: form.quantity,
    };
    try {
      const res = existing
        ? await api.put(`/api/materials/${existing.id}`, payload)
        : await api.post('/api/materials', payload);
      onSaved(res.material, res.merged ? res.message : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const UNITS = ['kg', 'g', 'ton', 'meter', 'mm', 'cm', 'liter', 'ml', 'set', 'pcs', 'nos', 'box', 'roll', 'unit'];
  const LEVEL_LABELS = ['Sub-category', 'Sub-Sub-category', 'Level 4', 'Level 5'];

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}

      {/* Category (L1) */}
      <Select label="Category *" value={form.category_id} onChange={onCategoryChange} required>
        <option value="">Select category…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>

      {/* Dynamic cascading dropdowns for L2–L5 */}
      {levels.map((opts, i) => {
        if (!form.category_id) return null;         // nothing until category picked
        if (i > 0 && !selected[i - 1]) return null; // nothing until parent picked
        if (opts.length === 0 && !selected[i]) return null; // no children = stop cascade
        return (
          <Select
            key={i}
            label={LEVEL_LABELS[i]}
            value={selected[i]}
            onChange={(e) => onLevelChange(i, e.target.value)}
          >
            <option value="">— None —</option>
            {opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        );
      })}

      <Input label="Material Name (optional)" value={form.material_name} onChange={set('material_name')} placeholder="e.g. MS Plate 12mm — auto-named from category if left blank" />
      <Input label="Supplier / Company Name" value={form.company_name} onChange={set('company_name')} placeholder="e.g. Jindal Steel" />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Unit *" value={form.unit} onChange={set('unit')} required>
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </Select>
        {!existing && (
          <Input label="Opening Stock (optional)" type="number" min="0" value={form.quantity} onChange={set('quantity')} placeholder="0" />
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : existing ? 'Update Material' : 'Add Material'}</Button>
      </div>
    </form>
  );
}

// ── Stock Move Modal ─────────────────────────────────────────────────────────
// "Record Material" - used for both Stock In (material arrival) and Stock Out
// (material used/consumed). PO Number can be picked from the existing PO
// Number list or typed in manually, for either direction. Stock Out defaults
// to the material's most recent linked PO Number (e.g. the one it was last
// purchased for) but the user is always free to change it.
function StockMoveModal({ material, type, onClose, onDone }) {
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const isOut = type === 'out';
  const [poMode, setPoMode] = useState('select'); // 'select' | 'manual'
  const [poNumber, setPoNumber] = useState((isOut && material.last_po_number) || '');
  const [poList, setPoList] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Offer the existing PO Numbers (PO Number / Sales Orders section) as a
  // selection, for both Stock In and Stock Out.
  useEffect(() => {
    api.get('/api/sales-orders')
      .then((res) => setPoList(res.sales_orders || []))
      .catch(() => setPoList([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (isOut && !reference.trim()) { setError('Please enter a note explaining where this material was used.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/materials/${material.id}/stock-${type}`, { quantity, reference, po_number: poNumber.trim() });
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Stock ${type === 'in' ? 'In' : 'Out'}: ${material.material_name}`}>
      <form onSubmit={submit} className="space-y-3">
        {error && <Banner>{error}</Banner>}
        <p className="text-sm text-slate-500 dark:text-slate-400">Total Items: <StockQty quantity={material.quantity} unit={material.unit} /></p>
        <Input label={`Quantity to ${type === 'in' ? 'add' : 'remove'} *`} type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus />

        {/* PO Number: select from PO Number list, or type manually */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PO Number (optional)</label>
          <div className="flex rounded-md overflow-hidden border border-slate-300 dark:border-slate-600 mb-2">
            <button
              type="button"
              onClick={() => setPoMode('select')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${poMode === 'select' ? 'bg-[#1C2530] text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
            >
              Select PO Number
            </button>
            <button
              type="button"
              onClick={() => setPoMode('manual')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${poMode === 'manual' ? 'bg-[#1C2530] text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
            >
              Type Manually
            </button>
          </div>
          {poMode === 'select' ? (
            <Select value={poNumber} onChange={(e) => setPoNumber(e.target.value)}>
              <option value="">— No PO / not linked —</option>
              {poList.map((so) => (
                <option key={so.id} value={so.so_number}>
                  {so.so_number}{so.customer_name ? ` — ${so.customer_name}` : ''}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Type the PO Number manually" />
          )}
          {isOut && material.last_po_number && (
            <p className="text-[11px] text-slate-400 mt-1">This material was last purchased against PO Number <span className="font-mono">{material.last_po_number}</span> — pre-filled above, change it if this usage belongs to a different PO.</p>
          )}
        </div>

        {isOut ? (
          <Input label="Note — where was this material used? *" value={reference} onChange={(e) => setReference(e.target.value)} required placeholder="e.g. Job Card JC-0004 girder fabrication" />
        ) : (
          <Input label="Reference (Job Card / Reason)" value={reference} onChange={(e) => setReference(e.target.value)} />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={type === 'in' ? 'accent' : 'danger'} disabled={saving}>{saving ? 'Saving...' : `Confirm Stock ${type === 'in' ? 'In' : 'Out'}`}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Stock History Modal ─────────────────────────────────────────────────────
function StockHistoryModal({ material, onClose }) {
  const [history, setHistory] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.get(`/api/materials/${material.id}`).then((res) => setHistory(res.history));
  }, [material.id]);

  const inHistory = history ? history.filter((h) => h.type === 'in') : [];
  const outHistory = history ? history.filter((h) => h.type === 'out') : [];
  const dateFmt = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  return (
    <Modal open onClose={onClose} title={`Stock History: ${material.material_name}`} wide>
      {history === null ? <Spinner /> : (
        <div className="space-y-5">
          {/* Stock In */}
          <div>
            <h3 className="text-sm font-semibold text-emerald-600 mb-2">Stock In ({inHistory.length})</h3>
            {inHistory.length === 0 ? <p className="text-xs text-slate-400">No stock-in records.</p> : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {inHistory.map((h, i) => (
                  <div key={h.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                    <span className="text-emerald-600 font-bold w-16 text-right flex-shrink-0">+{h.quantity}</span>
                    <span className="text-slate-500 text-xs flex-shrink-0">{material.unit}</span>
                    <span className="text-slate-600 dark:text-slate-300 flex-1 truncate">{h.reference || '—'}</span>
                    {h.po_number && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 flex-shrink-0">{h.po_number}</span>}
                    <span className="text-slate-400 text-xs flex-shrink-0">{dateFmt(h.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stock Out */}
          <div>
            <h3 className="text-sm font-semibold text-red-500 mb-2">Stock Out ({outHistory.length})</h3>
            {outHistory.length === 0 ? <p className="text-xs text-slate-400">No stock-out records.</p> : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {outHistory.map((h, i) => (
                  <div key={h.id}>
                    <button
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left ${i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'} ${h.reference ? 'hover:bg-red-50 dark:hover:bg-red-900/10' : ''}`}
                      onClick={() => h.reference && setExpandedId(expandedId === h.id ? null : h.id)}
                    >
                      <span className="text-red-500 font-bold w-16 text-right flex-shrink-0">−{h.quantity}</span>
                      <span className="text-slate-500 text-xs flex-shrink-0">{material.unit}</span>
                      <span className="text-slate-600 dark:text-slate-300 flex-1 truncate">{h.reference || '—'}</span>
                      {h.po_number && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 flex-shrink-0">{h.po_number}</span>}
                      <span className="text-slate-400 text-xs flex-shrink-0">{dateFmt(h.created_at)}</span>
                    </button>
                    {expandedId === h.id && (
                      <div className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-xs text-red-700 dark:text-red-400 border-t border-red-100 dark:border-red-900">
                        {h.reference}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Materials List ───────────────────────────────────────────────────────────
export function MaterialsList() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [moveModal, setMoveModal] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [q, setQ] = useState('');
  // 5-level cascading path filter: [Main, Sub, Sub-Sub, L4, L5]
  // Each entry holds the selected breadcrumb name at that depth ('' = All).
  const [pathFilter, setPathFilter] = useState(['', '', '', '', '']);
  const [poFilter, setPoFilter] = useState('');
  const [usagePoFilter, setUsagePoFilter] = useState('');
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/materials').then((res) => setMaterials(res.materials)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canManage = user.role === 'admin' || user.role === 'production';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  // Options for filter level `i` = unique breadcrumb values at depth i among
  // materials that already match every shallower selection. breadcrumb comes
  // from the API: [Main, Sub, Sub-Sub, L4, L5].
  const filterOptionsAt = (i) => [...new Set(
    materials
      .filter((m) => {
        const bc = m.breadcrumb || [];
        for (let j = 0; j < i; j++) { if (pathFilter[j] && bc[j] !== pathFilter[j]) return false; }
        return !!bc[i];
      })
      .map((m) => m.breadcrumb[i])
  )].sort((a, b) => a.localeCompare(b));

  // Changing a level clears every deeper selection so the cascade stays valid.
  const setPathLevel = (i, value) => setPathFilter((prev) => {
    const next = [...prev];
    next[i] = value;
    for (let j = i + 1; j < 5; j++) next[j] = '';
    return next;
  });

  const anyPathFilter = pathFilter.some(Boolean);

  // Every distinct PO Number linked to any material, split into "PO Number
  // Details" (purchased against) and "Usage PO Number Details" (used
  // against) so the two can be filtered independently.
  // Numeric-aware sort so "PO-2" sorts before "PO-11" instead of the
  // plain-string order ("PO-1", "PO-11", "PO-2", "PO-20", ...).
  const poNumberOptions = [...new Set(materials.flatMap((m) => m.purchase_po_numbers || []))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const usagePoNumberOptions = [...new Set(materials.flatMap((m) => m.usage_po_numbers || []))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const filteredMaterials = materials.filter((m) => {
    const bc = m.breadcrumb || [];
    for (let j = 0; j < 5; j++) { if (pathFilter[j] && bc[j] !== pathFilter[j]) return false; }
    if (poFilter && !(m.purchase_po_numbers || []).includes(poFilter)) return false;
    if (usagePoFilter && !(m.usage_po_numbers || []).includes(usagePoFilter)) return false;
    if (q) {
      const needle = q.toLowerCase();
      if (![m.material_code, m.material_name, m.category_name, m.subcategory_name, m.unit, m.company_name || '', ...(m.purchase_po_numbers || []), ...(m.usage_po_numbers || [])].join(' ').toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/api/materials/${deleteTarget.id}`); setDeleteTarget(null); load(); }
    finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try { await api.post('/api/materials/bulk-delete', { ids: selectedIds }); setBulkDeleteOpen(false); clear(); load(); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Material Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Materials organised by category and sub-category.</p>
        </div>
      {notice && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-sm px-4 py-3 rounded-lg shadow-lg flex items-start gap-2">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} className="font-bold px-1 leading-none">×</button>
        </div>
      )}
        <div className="flex gap-2">
          <DownloadButton basePath="/api/materials" fileLabel="material-management" />
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => setCategoryManagerOpen(true)}>Manage Categories</Button>
              <Button variant="accent" onClick={() => setAddOpen(true)}>+ Add Material</Button>
            </>
          )}
        </div>
      </div>

      <Card>
        {/* Search + filters */}
        <div className="mb-4 space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by code, material name, category, sub-category, company..."
            className="w-full max-w-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
          <div className="flex gap-2 flex-wrap">
            {['Main Category', 'Sub Category', 'Sub-Sub Category', 'Level 4 (L4)', 'Level 5 (L5)'].map((label, i) => {
              const opts = filterOptionsAt(i);
              // Show a level once its parent level is selected (Main is always
              // shown); hide it when there's nothing to pick at that depth.
              if (i > 0 && !pathFilter[i - 1]) return null;
              if (opts.length === 0 && !pathFilter[i]) return null;
              return (
                <select
                  key={label}
                  value={pathFilter[i]}
                  onChange={(e) => setPathLevel(i, e.target.value)}
                  className="px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="">{`All ${label}`}</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              );
            })}
            {(anyPathFilter || q || poFilter || usagePoFilter) && (
              <button onClick={() => { setPathFilter(['', '', '', '', '']); setQ(''); setPoFilter(''); setUsagePoFilter(''); }} className="text-xs text-amber-600 hover:underline px-2">Clear filters</button>
            )}
          </div>
          {(poNumberOptions.length > 0 || usagePoNumberOptions.length > 0) && (
            <div className="flex gap-2 flex-wrap items-center">
              {poNumberOptions.length > 0 && (
                <select
                  value={poFilter}
                  onChange={(e) => setPoFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="">All PO Number Details</option>
                  {poNumberOptions.map((po) => <option key={po} value={po}>{po}</option>)}
                </select>
              )}
              {usagePoNumberOptions.length > 0 && (
                <select
                  value={usagePoFilter}
                  onChange={(e) => setUsagePoFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="">All Usage PO Number Details</option>
                  {usagePoNumberOptions.map((po) => <option key={po} value={po}>{po}</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        {canDelete && (
          <BulkActionsBar count={selectedIds.length} onClear={clear}>
            <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>Delete Selected</Button>
          </BulkActionsBar>
        )}

        {loading ? <Spinner /> : (
          <>
          <div className="flex items-center gap-4 mb-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Low stock</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>Sufficient stock</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>Medium (normal)</span>
          </div>
          <Table
            selectable={canDelete}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            columns={[
              {
                key: 'category_name', label: 'Category / Path',
                render: (r) => {
                  const crumbs = r.breadcrumb || [r.category_name];
                  return (
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{crumbs[0]}</p>
                      {crumbs.length > 1 && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">
                          {crumbs.slice(1).join(' › ')}
                        </p>
                      )}
                    </div>
                  );
                },
              },
              { key: 'material_name', label: 'Material Name', render: (r) => <span className="font-medium">{r.material_name}</span> },
              {
                key: 'company_name', label: 'Company / Supplier',
                render: (r) => r.company_name
                  ? <span className="text-slate-700 dark:text-slate-300">{r.company_name}</span>
                  : <span className="text-slate-300 dark:text-slate-500">—</span>,
              },
              { key: 'unit', label: 'Unit' },
              { key: 'quantity', label: 'Stock', render: (r) => <StockQty quantity={r.quantity} unit={r.unit} /> },
              {
                key: 'purchase_po_numbers', label: 'PO Number Details', render: (r) => (r.purchase_po_numbers || []).length
                  ? <span className="font-mono text-xs">{(r.purchase_po_numbers || []).join(', ')}</span>
                  : <span className="text-slate-300 dark:text-slate-500">—</span>,
              },
              {
                key: 'usage_po_numbers', label: 'Usage PO Number Details', render: (r) => (r.usage_po_numbers || []).length
                  ? <span className="font-mono text-xs">{(r.usage_po_numbers || []).join(', ')}</span>
                  : <span className="text-slate-300 dark:text-slate-500">—</span>,
              },
              {
                key: 'history', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => setHistoryTarget(r)}>History</Button>
                  </div>
                ),
              },
              ...(canManage ? [{
                key: 'actions', label: '', render: (r) => (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => setMoveModal({ material: r, type: 'in' })}>Stock In</Button>
                    <Button size="sm" variant="secondary" onClick={() => setMoveModal({ material: r, type: 'out' })}>Stock Out</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditTarget(r)}>Edit</Button>
                    {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>}
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredMaterials}
            emptyMessage="No materials in inventory yet."
          />
          </>
        )}
      </Card>

      {/* Modals */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Material" wide>
        <MaterialForm onClose={() => setAddOpen(false)} onSaved={(m, mergedMsg) => { setAddOpen(false); if (mergedMsg) { setNotice(mergedMsg); setTimeout(() => setNotice(''), 8000); } load(); }} />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Material" wide>
        <MaterialForm existing={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      </Modal>

      <CategoryManagerModal open={categoryManagerOpen} onClose={() => setCategoryManagerOpen(false)} onChanged={load} />

      {moveModal && (
        <StockMoveModal
          material={moveModal.material}
          type={moveModal.type}
          onClose={() => setMoveModal(null)}
          onDone={() => { setMoveModal(null); load(); }}
        />
      )}

      {historyTarget && <StockHistoryModal material={historyTarget} onClose={() => setHistoryTarget(null)} />}

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.material_name} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected material(s)`} />
    </div>
  );
}
