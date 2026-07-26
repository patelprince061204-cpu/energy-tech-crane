// lib/estimation.js
// Estimation pricing engine. Every component price is a direct manual entry
// from the form - this module's job is just to apply the formulas (weight x
// rate, rate x span, sum of sections) and total everything up. No price is
// auto-fetched or forced from a master table; the price_lists table exists
// purely as optional reference data the UI can offer to autofill from - the
// engine itself never looks anything up, it only uses whatever numbers the
// form sent.
//
// Which sections apply depends on the product:
//   - EOT Crane: Main Girder, Hoist/Grab, End Carriage, Panel, Rail
//     (C-Rail or T-Track, picked by the user), DSL, Correction, Erection,
//     Profit. No Gantry Girder section.
//   - EOT Crane with Gantry Girder / Gantry Crane / Goliath Crane /
//     Semi Goliath Crane: same as EOT Crane, PLUS a Gantry Girder section
//     (ISMB/ISMC weight + Square Bar + Plate -> its own steel cost, added
//     to the manufacturing total alongside Main Girder).
//   - EOT Crane without Main Girder: same as EOT Crane MINUS the Main
//     Girder section entirely (no weight, no steel cost for it).
//   - Wire Rope Hoist: only Wire Rope Hoist + Erection + Profit. Every
//     other section (Main Girder, Gantry Girder, End Carriage, Panel,
//     Rail, DSL, Correction) is skipped and costs 0.

const PRODUCTS_WITH_GANTRY_GIRDER = new Set([
  'EOT Crane with Gantry Girder', 'Gantry Crane', 'Goliath Crane', 'Semi Goliath Crane',
]);

function hasMainGirder(product) {
  return product !== 'EOT Crane without Main Girder' && product !== 'Wire Rope Hoist';
}

function hasGantryGirder(product) {
  return PRODUCTS_WITH_GANTRY_GIRDER.has(product);
}

// Wire Rope Hoist the *product* only ever needs the Wire Rope Hoist
// component (never Main Girder, Gantry Girder, End Carriage, Panel, Rail,
// or DSL) - everything collapses to just Hoist + Erection + Profit.
function isWireRopeHoistProduct(product) {
  return product === 'Wire Rope Hoist';
}

function num(v) {
  return Number(v) || 0;
}

function resolveGirderType(input) {
  return input.girder_type === 'Double Girder' ? 'Double Girder' : 'Single Girder';
}

// Builds the full priced estimation record from the form's raw entries.
// Every cost field below is a direct calculation from manually-entered
// numbers - nothing is looked up from a price table.
function priceEstimation(input) {
  const product = input.product || 'EOT Crane';
  const girderType = resolveGirderType(input);
  const isDoubleGirder = girderType === 'Double Girder';
  const panelType = input.panel_type === 'ALL VFD' ? 'ALL VFD' : 'LT';
  const railType = input.rail_type === 'T-Track' ? 'T-Track' : 'C-Rail';

  const includeMainGirder = hasMainGirder(product);
  const includeGantryGirder = hasGantryGirder(product);
  const isHoistOnly = isWireRopeHoistProduct(product);

  const steelRatePerKg = num(input.main_girder?.steel_rate_per_kg);

  // --- Main Girder (skipped for "EOT Crane without Main Girder" and "Wire Rope Hoist") ---
  // Single Girder: Weight x Steel Rate.
  // Double Girder: (Main Girder Weight + Other Girder Weight) x Steel Rate.
  const mainGirderWeight = includeMainGirder ? num(input.main_girder?.weight) : 0;
  const otherGirderWeight = (includeMainGirder && isDoubleGirder) ? num(input.main_girder?.other_weight) : 0;
  const totalGirderWeight = mainGirderWeight + otherGirderWeight;
  const mainGirderCost = includeMainGirder ? totalGirderWeight * steelRatePerKg : 0;

  // --- Gantry Girder (only for products with a gantry girder section) ---
  // ISMB/ISMC Weight = Weight per Meter x (Length x 2) - two gantry girders.
  // Square Bar: size and kg/m are looked up from the capacity - the user
  // only enters the length (auto-synced from gantry length but editable).
  //   1 Ton - 7.5 Ton  →  40×40  →  12.56 kg/m
  //   10 Ton - 50 Ton  →  50×50  →  20 kg/m
  const gantrySize = includeGantryGirder ? (input.gantry_girder?.size || '') : '';
  const gantryWeightPerMeter = includeGantryGirder ? num(input.gantry_girder?.weight_per_meter) : 0;
  const gantryLength = includeGantryGirder ? num(input.gantry_girder?.length) : 0;
  const ismbIsmcWeight = gantryWeightPerMeter * (gantryLength * 2);

  // Derive square bar size and kg/m from capacity.
  const capacityNum = parseFloat(input.capacity || '0') || 0;
  const squareBarSize = includeGantryGirder ? (capacityNum <= 7.5 ? '40×40' : '50×50') : '';
  const squareBarKgPerMeter = includeGantryGirder ? (capacityNum <= 7.5 ? 12.56 : 20) : 0;
  // Square bar length: user-editable field; falls back to gantry length if not set.
  const squareBarLength = includeGantryGirder ? num(input.gantry_girder?.square_bar_length || gantryLength) : 0;
  const squareBarWeight = Math.round(squareBarKgPerMeter * squareBarLength * 2 * 100) / 100;

  const plateWeight = includeGantryGirder ? num(input.gantry_girder?.plate_weight) : 0;
  const totalGantrySteelWeight = ismbIsmcWeight + squareBarWeight + plateWeight;
  const gantryGirderCost = includeGantryGirder ? Math.round(totalGantrySteelWeight * steelRatePerKg * 100) / 100 : 0;

  // --- Wire Rope Hoist (Single Girder) / Grab Unit Assembly (Double Girder) ---
  // Both prices are direct manual entries.
  const useGrabUnit = isDoubleGirder && !isHoistOnly;
  const wireRopeHoistPrice = useGrabUnit ? 0 : num(input.wire_rope_hoist?.price);
  const grabUnitAssemblyPrice = useGrabUnit ? num(input.grab_unit_assembly?.price) : 0;
  const hoistOrGrabCost = useGrabUnit ? grabUnitAssemblyPrice : wireRopeHoistPrice;

  // --- End Carriage: manual price entry, Carriage Type kept as a label only ---
  const carriageType = input.end_carriage?.carriage_type === 'Open End Carriage' ? 'Open End Carriage' : 'L-Block';
  const endCarriagePrice = isHoistOnly ? 0 : num(input.end_carriage?.price);

  // --- Panel: manual price entry ---
  const panelPrice = isHoistOnly ? 0 : num(input.panel?.price);

  // --- Rail: user picks C-Rail OR T-Track; only the selected one is costed ---
  const cRailRatePerMeter = (isHoistOnly || railType !== 'C-Rail') ? 0 : num(input.c_rail?.price_per_meter);
  const cRailSpan = (isHoistOnly || railType !== 'C-Rail') ? 0 : num(input.c_rail?.span);
  const cRailCost = cRailRatePerMeter * cRailSpan;

  const tTrackRatePerMeter = (isHoistOnly || railType !== 'T-Track') ? 0 : num(input.t_track?.price_per_meter);
  const tTrackSpan = (isHoistOnly || railType !== 'T-Track') ? 0 : num(input.t_track?.span);
  const tTrackCost = tTrackRatePerMeter * tTrackSpan;

  const railCost = railType === 'T-Track' ? tTrackCost : cRailCost;

  // --- DSL --- (skipped for Wire Rope Hoist)
  const dslLength = isHoistOnly ? 0 : num(input.dsl?.length);
  const dslRatePerMeter = isHoistOnly ? 0 : num(input.dsl?.price_per_meter);
  const dslCost = dslRatePerMeter * dslLength;

  // --- Optional Accessories: manual list of {label, price} entries --- (skipped for Wire Rope Hoist)
  const optionalAccessories = isHoistOnly ? [] : (Array.isArray(input.optional_accessories) ? input.optional_accessories : [])
    .filter((a) => a && (a.label || a.price))
    .map((a) => ({ label: a.label || '', price: num(a.price) }));
  const optionalAccessoriesCost = optionalAccessories.reduce((sum, a) => sum + a.price, 0);

  // --- Correction (skipped for Wire Rope Hoist) & Erection (always available) ---
  const correctionAmount = isHoistOnly ? 0 : num(input.correction_amount);
  const erectionAmount = num(input.erection_amount);

  const manufacturingTotal = isHoistOnly
    ? hoistOrGrabCost + erectionAmount
    : mainGirderCost + gantryGirderCost + hoistOrGrabCost + endCarriagePrice + panelPrice
      + railCost + dslCost + optionalAccessoriesCost + correctionAmount + erectionAmount;

  const profitMode = input.profit_mode === 'fixed' ? 'fixed' : 'percent';
  const profitValue = num(input.profit_value);
  const profitAmount = profitMode === 'fixed' ? profitValue : manufacturingTotal * (profitValue / 100);
  const finalSellingPrice = manufacturingTotal + profitAmount;

  return {
    product,
    capacity: input.capacity || '',
    girder_type: girderType,
    span: input.span || '',
    lift_height: input.lift_height || '',
    length: input.length || '',
    column_to_column: input.column_to_column || '',
    ismb: input.ismb || '',
    ismc: input.ismc || '',
    panel_type: panelType,
    rail_type: railType,

    include_main_girder: includeMainGirder, include_gantry_girder: includeGantryGirder, is_hoist_only: isHoistOnly,

    main_girder: includeMainGirder ? {
      weight: mainGirderWeight,
      other_weight: otherGirderWeight,
      total_weight: totalGirderWeight,
      steel_rate_per_kg: steelRatePerKg,
      cost: mainGirderCost,
    } : null,

    gantry_girder: includeGantryGirder ? {
      size: gantrySize,
      weight_per_meter: gantryWeightPerMeter,
      length: gantryLength,
      ismb_ismc_weight: ismbIsmcWeight,
      square_bar_size: squareBarSize,
      square_bar_kg_per_meter: squareBarKgPerMeter,
      square_bar_length: squareBarLength,
      square_bar_weight: squareBarWeight,
      plate_weight: plateWeight,
      total_steel_weight: totalGantrySteelWeight,
      steel_rate_per_kg: steelRatePerKg,
      cost: gantryGirderCost,
    } : null,

    wire_rope_hoist: useGrabUnit ? null : { price: wireRopeHoistPrice },
    grab_unit_assembly: useGrabUnit ? { price: grabUnitAssemblyPrice } : null,
    hoist_or_grab_cost: hoistOrGrabCost,

    end_carriage: isHoistOnly ? null : { carriage_type: carriageType, span_range: input.end_carriage?.span_range || '', price: endCarriagePrice },
    panel: isHoistOnly ? null : { panel_type: panelType, price: panelPrice },
    c_rail: (isHoistOnly || railType !== 'C-Rail') ? null : { span: cRailSpan, price_per_meter: cRailRatePerMeter, cost: cRailCost },
    t_track: (isHoistOnly || railType !== 'T-Track') ? null : { span: tTrackSpan, price_per_meter: tTrackRatePerMeter, cost: tTrackCost },
    rail_cost: railCost,
    dsl: isHoistOnly ? null : { length: dslLength, price_per_meter: dslRatePerMeter, cost: dslCost },
    optional_accessories: optionalAccessories,
    optional_accessories_cost: optionalAccessoriesCost,
    correction_amount: correctionAmount,
    erection_amount: erectionAmount,

    manufacturing_total: manufacturingTotal,
    profit_mode: profitMode,
    profit_value: profitValue,
    profit_amount: profitAmount,
    final_selling_price: finalSellingPrice,
  };
}

module.exports = { priceEstimation, resolveGirderType, hasMainGirder, hasGantryGirder, isWireRopeHoistProduct };
