// --- Configuration Parameters ---
const TREND_SLOPE_POS = 0.35;   // previous value is 0.20 
const TREND_SLOPE_NEG = -0.35;  // previous value is -0.20
const TREND_MOMENTUM_STRONG = 1.5;
const TREND_DELTA_STRONG = 5.0;
const TREND_DELTA = 1.0;
const LEVEL_THRIVING = 43;    // above 85% of the E scale
const LEVEL_CRITICAL = 3;     // below  5% of the E scale
const LEVEL_HIGH = 32;        // above 60% of the E scale
const LEVEL_LOW = 11;         // below 20% of the E scale
const C_STABILITY_RANGE_EPS = 1e-6;
const MID_WINDOW = 6;
const SHORT_MIN_DELTA = 2.0;
const Z_POS = 0.8;
const Z_NEG = -0.8;
const MIN_SLOPE_POS = 0.20;
const MIN_SLOPE_NEG = -0.20;
const CHANGE_TAG_THRESHOLD = 6.0;
const MID_MIN_RECORDS = 3;   // mid-range metrics require more than this many waves

const ENGAGEMENT_RESULT_FIELDS = [
  "level",
  "trend_base",
  "trend_recent",
  "trend_refined",
  "change_tag",
  "stability",
  "strength_short",
  "weakness_short",
  "strength_mid",
  "weakness_mid",
  "V_deltaP10",
  "D_deltaP10",
  "A_deltaP10",
  "V_deltaP90",
  "D_deltaP90",
  "A_deltaP90",
  "V_deltaZ",
  "D_deltaZ",
  "A_deltaZ",
  "V_slopeP10",
  "D_slopeP10",
  "A_slopeP10",
  "V_slopeP90",
  "D_slopeP90",
  "A_slopeP90",
  "V_slopeZ",
  "D_slopeZ",
  "A_slopeZ",
  "E_momentum_3",
  "E_delta_1",
  "E_delta_1_prev",
  "E_mean_6",
  "E_std_6",
  "E_slope_12",
  "E_slope_6",
  "E_accel_6",
  "V_delta_1",
  "D_delta_1",
  "A_delta_1",
  "V_slope_6",
  "D_slope_6",
  "A_slope_6",
];

const NUMERIC_RESULT_FIELDS = new Set([
  "V_deltaP10",
  "D_deltaP10",
  "A_deltaP10",
  "V_deltaP90",
  "D_deltaP90",
  "A_deltaP90",
  "V_deltaZ",
  "D_deltaZ",
  "A_deltaZ",
  "V_slopeP10",
  "D_slopeP10",
  "A_slopeP10",
  "V_slopeP90",
  "D_slopeP90",
  "A_slopeP90",
  "V_slopeZ",
  "D_slopeZ",
  "A_slopeZ",
  "E_momentum_3",
  "E_delta_1",
  "E_delta_1_prev",
  "E_mean_6",
  "E_std_6",
  "E_slope_12",
  "E_slope_6",
  "E_accel_6",
  "V_delta_1",
  "D_delta_1",
  "A_delta_1",
  "V_slope_6",
  "D_slope_6",
  "A_slope_6",
]);

const MID_DEPENDENT_NUMERIC_FIELDS = new Set([
  "V_slopeP10",
  "D_slopeP10",
  "A_slopeP10",
  "V_slopeP90",
  "D_slopeP90",
  "A_slopeP90",
  "V_slopeZ",
  "D_slopeZ",
  "A_slopeZ",
  "E_slope_12",
  "E_slope_6",
  "E_accel_6",
  "V_slope_6",
  "D_slope_6",
  "A_slope_6",
]);

const MID_DEPENDENT_STRING_FIELDS = new Set([
  "stability",
  "strength_mid",
  "weakness_mid",
]);

const REQUIRED_COLUMNS = {
  year: "year",
  month: "month",
  mail: "mail address",
  engagement: "engagement",
  vigor: "vigor",
  dedication: "dedication",
  absorption: "absorption",
};

const DIMENSION_CONFIG = [
  { key: "V", prop: "vigor", deltaKey: "V_delta_1", slopeKey: "V_slope_6", label: "vigor" },
  { key: "D", prop: "dedication", deltaKey: "D_delta_1", slopeKey: "D_slope_6", label: "dedication" },
  { key: "A", prop: "absorption", deltaKey: "A_delta_1", slopeKey: "A_slope_6", label: "absorption" },
];

//
// Analyze the engagement trend
//
function analyzeEngagement(data) {
  if (!data || data.length <= 1) {
    return {};
  }

  const header = data[0].map(value =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  );
  const columnIndex = {};
  header.forEach((name, idx) => {
    if (typeof name === "string") {
      columnIndex[name] = idx;
    }
  });

  Object.keys(REQUIRED_COLUMNS).forEach(key => {
    const columnName = REQUIRED_COLUMNS[key];
    if (!(columnName in columnIndex)) {
      throw new Error(`Column '${columnName}' is required for engagement analysis.`);
    }
  });

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const year = row[columnIndex.year];
    const month = row[columnIndex.month];
    const engagement = row[columnIndex.engagement];
    const vigor = row[columnIndex.vigor];
    const dedication = row[columnIndex.dedication];
    const absorption = row[columnIndex.absorption];

    const wave = formatWave(year, month);
    if (!wave || !Number.isFinite(engagement) || !Number.isFinite(vigor) ||
        !Number.isFinite(dedication) || !Number.isFinite(absorption)) {
      continue;
    }

    rows.push({
      year,
      month,
      wave,
      mail: row[columnIndex["mail address"]],
      engagement,
      vigor,
      dedication,
      absorption,
    });
  }

  if (rows.length === 0) {
    return {};
  }

  const hasMidHistory = rows.length > MID_MIN_RECORDS;

  rows.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return 0;
  });

  const metrics = rows.map(() => ({}));
  const eValues = [];
  const vValues = [];
  const dValues = [];
  const aValues = [];

  let prevSlope6 = NaN;

  for (let i = 0; i < rows.length; i++) {
    const record = rows[i];
    const metric = metrics[i];

    const prevE = eValues.length ? eValues[eValues.length - 1] : NaN;
    const prevPrevE = eValues.length >= 2 ? eValues[eValues.length - 2] : NaN;
    const prevV = vValues.length ? vValues[vValues.length - 1] : NaN;
    const prevD = dValues.length ? dValues[dValues.length - 1] : NaN;
    const prevA = aValues.length ? aValues[aValues.length - 1] : NaN;

    metric.E_delta_1 = Number.isFinite(prevE) ? record.engagement - prevE : 0;
    metric.E_delta_1_prev =
      Number.isFinite(prevE) && Number.isFinite(prevPrevE) ? prevE - prevPrevE : 0;

    const deltaOrZero = (current, previous) =>
      Number.isFinite(previous) ? current - previous : 0;

    metric.V_delta_1 = deltaOrZero(record.vigor, prevV);
    metric.D_delta_1 = deltaOrZero(record.dedication, prevD);
    metric.A_delta_1 = deltaOrZero(record.absorption, prevA);

    metric.E_min6_past = minFromHistory(eValues, MID_WINDOW);
    metric.E_max6_past = maxFromHistory(eValues, MID_WINDOW);

    eValues.push(record.engagement);
    vValues.push(record.vigor);
    dValues.push(record.dedication);
    aValues.push(record.absorption);

    metric.engagement = record.engagement;
    metric.E_mean_6 = meanOfLast(eValues, MID_WINDOW);
    metric.E_momentum_3 = computeMomentum(eValues);
    metric.E_std_6 = stdOfLast(eValues, MID_WINDOW);

    const slope12 = theilSenSlope(eValues, 12);
    const slope6 = theilSenSlope(eValues, MID_WINDOW);
    const accel6 =
      Number.isFinite(prevSlope6) && Number.isFinite(slope6) ? slope6 - prevSlope6 : 0;
    const prevSlopeForRecord = Number.isFinite(prevSlope6) ? prevSlope6 : slope6;

    metric.E_slope_12 = hasMidHistory ? slope12 : NaN;
    metric.E_slope_6 = hasMidHistory ? slope6 : NaN;
    metric.E_accel_6 = hasMidHistory ? accel6 : NaN;
    metric.prev_E_slope_6 = prevSlopeForRecord;
    prevSlope6 = slope6;
  }

  const vSlopeSeries = computePersonalSlope(vValues, MID_WINDOW);
  const dSlopeSeries = computePersonalSlope(dValues, MID_WINDOW);
  const aSlopeSeries = computePersonalSlope(aValues, MID_WINDOW);

  metrics.forEach((metric, idx) => {
    if (hasMidHistory) {
      metric.V_slope_6 = vSlopeSeries[idx];
      metric.D_slope_6 = dSlopeSeries[idx];
      metric.A_slope_6 = aSlopeSeries[idx];
    } else {
      metric.V_slope_6 = NaN;
      metric.D_slope_6 = NaN;
      metric.A_slope_6 = NaN;
    }
  });

  const shortStrengthLists = metrics.map(() => []);
  const shortWeaknessLists = metrics.map(() => []);
  const midStrengthLists = metrics.map(() => []);
  const midWeaknessLists = metrics.map(() => []);
  const perMetricStats = metrics.map(() => ({
    deltaP10: {},
    deltaP90: {},
    deltaZ: {},
    slopeP10: {},
    slopeP90: {},
    slopeZ: {},
  }));

  DIMENSION_CONFIG.forEach(dim => {
    const deltaSeries = metrics.map(m => m[dim.deltaKey]);
    const slopeSeries = metrics.map(m => m[dim.slopeKey]);

    const deltaP90 = expandingQuantileExclusive(deltaSeries, 0.90);
    const deltaP10 = expandingQuantileExclusive(deltaSeries, 0.10);
    const deltaZ = expandingRobustZExclusive(deltaSeries);

    const slopeP90 = expandingQuantileExclusive(slopeSeries, 0.90);
    const slopeP10 = expandingQuantileExclusive(slopeSeries, 0.10);
    const slopeZ = expandingRobustZExclusive(slopeSeries);

    for (let i = 0; i < metrics.length; i++) {
      const deltaValue = deltaSeries[i];
      const slopeValue = slopeSeries[i];
      const stats = perMetricStats[i];
      const label = dim.label;

      stats.deltaP10[label] = deltaP10[i];
      stats.deltaP90[label] = deltaP90[i];
      stats.deltaZ[label] = deltaZ[i];
      stats.slopeP10[label] = slopeP10[i];
      stats.slopeP90[label] = slopeP90[i];
      stats.slopeZ[label] = slopeZ[i];
      const thPos = Number.isFinite(deltaP90[i]) ? Math.max(deltaP90[i], SHORT_MIN_DELTA) : NaN;
      const thNeg = Number.isFinite(deltaP10[i]) ? Math.min(deltaP10[i], -SHORT_MIN_DELTA) : NaN;

      const zVal = deltaZ[i];
      const zSlope = slopeZ[i];
      const posShort =
        Number.isFinite(deltaValue) &&
        Number.isFinite(thPos) &&
        deltaValue >= thPos &&
        (!Number.isFinite(zVal) || zVal >= Z_POS);
      const negShort =
        Number.isFinite(deltaValue) &&
        Number.isFinite(thNeg) &&
        deltaValue <= thNeg &&
        (!Number.isFinite(zVal) || zVal <= Z_NEG);

      if (posShort) shortStrengthLists[i].push(dim.label);
      if (negShort) shortWeaknessLists[i].push(dim.label);

      const thPosSlope =
        Number.isFinite(slopeP90[i]) ? Math.max(slopeP90[i], MIN_SLOPE_POS) : NaN;
      const thNegSlope =
        Number.isFinite(slopeP10[i]) ? Math.min(slopeP10[i], MIN_SLOPE_NEG) : NaN;

      const posMid =
        Number.isFinite(slopeValue) &&
        Number.isFinite(thPosSlope) &&
        slopeValue >= thPosSlope &&
        (!Number.isFinite(zSlope) || zSlope >= Z_POS);
      const negMid =
        Number.isFinite(slopeValue) &&
        Number.isFinite(thNegSlope) &&
        slopeValue <= thNegSlope &&
        (!Number.isFinite(zSlope) || zSlope <= Z_NEG);

      if (hasMidHistory && posMid) midStrengthLists[i].push(dim.label);
      if (hasMidHistory && negMid) midWeaknessLists[i].push(dim.label);
    }
  });

  // Convert labels to codes (vigor -> V, dedication -> D, absorption -> A)
  const labelToCode = { "vigor": "V", "dedication": "D", "absorption": "A" };

  for (let i = 0; i < metrics.length; i++) {
    metrics[i].strength_short = shortStrengthLists[i].map(label => labelToCode[label] || label).join(", ");
    metrics[i].weakness_short = shortWeaknessLists[i].map(label => labelToCode[label] || label).join(", ");
    metrics[i].strength_mid = hasMidHistory ? midStrengthLists[i].map(label => labelToCode[label] || label).join(", ") : "";
    metrics[i].weakness_mid = hasMidHistory ? midWeaknessLists[i].map(label => labelToCode[label] || label).join(", ") : "";

    const stats = perMetricStats[i];

    // Store individual V/D/A statistics
    metrics[i].V_deltaP10 = stats.deltaP10["vigor"];
    metrics[i].D_deltaP10 = stats.deltaP10["dedication"];
    metrics[i].A_deltaP10 = stats.deltaP10["absorption"];

    metrics[i].V_deltaP90 = stats.deltaP90["vigor"];
    metrics[i].D_deltaP90 = stats.deltaP90["dedication"];
    metrics[i].A_deltaP90 = stats.deltaP90["absorption"];

    metrics[i].V_deltaZ = stats.deltaZ["vigor"];
    metrics[i].D_deltaZ = stats.deltaZ["dedication"];
    metrics[i].A_deltaZ = stats.deltaZ["absorption"];

    metrics[i].V_slopeP10 = stats.slopeP10["vigor"];
    metrics[i].D_slopeP10 = stats.slopeP10["dedication"];
    metrics[i].A_slopeP10 = stats.slopeP10["absorption"];

    metrics[i].V_slopeP90 = stats.slopeP90["vigor"];
    metrics[i].D_slopeP90 = stats.slopeP90["dedication"];
    metrics[i].A_slopeP90 = stats.slopeP90["absorption"];

    metrics[i].V_slopeZ = stats.slopeZ["vigor"];
    metrics[i].D_slopeZ = stats.slopeZ["dedication"];
    metrics[i].A_slopeZ = stats.slopeZ["absorption"];

    // Keep formatted versions for compatibility (optional)
    metrics[i].deltaP10 = formatDimensionStats(stats.deltaP10);
    metrics[i].deltaP90 = formatDimensionStats(stats.deltaP90);
    metrics[i].deltaZ = formatDimensionStats(stats.deltaZ);
    metrics[i].slopeP10 = formatDimensionStats(stats.slopeP10);
    metrics[i].slopeP90 = formatDimensionStats(stats.slopeP90);
    metrics[i].slopeZ = formatDimensionStats(stats.slopeZ);
  }

  const rangeE = rollingRangeFull(eValues, MID_WINDOW);
  const rangeV = rollingRangeFull(vValues, MID_WINDOW);
  const rangeD = rollingRangeFull(dValues, MID_WINDOW);
  const rangeA = rollingRangeFull(aValues, MID_WINDOW);

  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i];
    if (hasMidHistory) {
      const sameFlag =
        Number.isFinite(rangeE[i]) && rangeE[i] <= C_STABILITY_RANGE_EPS &&
        Number.isFinite(rangeV[i]) && rangeV[i] <= C_STABILITY_RANGE_EPS &&
        Number.isFinite(rangeD[i]) && rangeD[i] <= C_STABILITY_RANGE_EPS &&
        Number.isFinite(rangeA[i]) && rangeA[i] <= C_STABILITY_RANGE_EPS;

      const stdVal = metric.E_std_6;
      const absMomentum = Math.abs(metric.E_momentum_3);
      const stableFlag = Number.isFinite(stdVal) && stdVal <= 1.0 && absMomentum < 0.5;
      const unstableFlag = Number.isFinite(stdVal) && stdVal >= 2.5;

      if (sameFlag) {
        metric.stability = "不変";
      } else if (stableFlag) {
        metric.stability = "安定";
      } else if (unstableFlag) {
        metric.stability = "不安定";
      } else {
        metric.stability = "やや安定";
      }
    } else {
      metric.stability = "";
    }

    if (hasMidHistory) {
      const slope = metric.E_slope_6;
      if (Number.isFinite(slope) && slope >= TREND_SLOPE_POS) {
        metric.trend_base = "上昇中";
      } else if (Number.isFinite(slope) && slope <= TREND_SLOPE_NEG) {
        metric.trend_base = "低下中";
      } else {
        metric.trend_base = "安定";
      }
    } else {
      metric.trend_base = "未評価";
    }

    const momentum = metric.E_momentum_3;
    const delta = metric.E_delta_1;
    const deltaPrev = metric.E_delta_1_prev;
    const strongDeltaUp = Number.isFinite(delta) && delta >= TREND_DELTA_STRONG;
    const strongDeltaUpPrev =
      Number.isFinite(deltaPrev) && deltaPrev >= TREND_DELTA_STRONG;
    const strongDeltaDown =
      Number.isFinite(delta) && delta <= -TREND_DELTA_STRONG;
    const strongDeltaDownPrev =
      Number.isFinite(deltaPrev) && deltaPrev <= -TREND_DELTA_STRONG;
    const baseTrend = metric.trend_base;
    const deltaOnlyEvaluation = baseTrend === "未評価";
    const stableEvaluation = baseTrend === "安定";

    const recentUp = deltaOnlyEvaluation
      ? strongDeltaUp
      : (
          (Number.isFinite(momentum) && momentum >= TREND_MOMENTUM_STRONG && strongDeltaUp) ||
          (strongDeltaUp && strongDeltaUpPrev) ||
          (stableEvaluation && strongDeltaUp && Number.isFinite(deltaPrev) && deltaPrev >= 0)
        );
    const recentDown = deltaOnlyEvaluation
      ? strongDeltaDown
      : (
          (Number.isFinite(momentum) && momentum <= -TREND_MOMENTUM_STRONG && strongDeltaDown) ||
          (strongDeltaDown && strongDeltaDownPrev) ||
          (stableEvaluation && strongDeltaDown && Number.isFinite(deltaPrev) && deltaPrev <= 0)
        );

    if (recentUp) {
      metric.trend_recent = "上昇";
    } else if (recentDown) {
      metric.trend_recent = "下降";
    } else {
      metric.trend_recent = "横ばい";
    }

    metric.trend_refined = refineTrend({
      base: metric.trend_base,
      recent: metric.trend_recent,
      slope: metric.E_slope_6,
      prevSlope: metric.prev_E_slope_6,
      momentum: metric.E_momentum_3,
      delta: metric.E_delta_1,
      deltaPrev: metric.E_delta_1_prev,
      engagement: metric.engagement,
      minPast: metric.E_min6_past,
      maxPast: metric.E_max6_past,
    });

    metric.change_tag = Math.abs(metric.E_delta_1) >= CHANGE_TAG_THRESHOLD ? "変化大" : "";
    metric.level = levelFromEngagement(metric.engagement);
  }

  const latestMetric = metrics[metrics.length - 1];
  const results = {};

  // Format numeric values to 2 decimal places
  const formatValue = (val) => {
    if (!Number.isFinite(val)) return 0;
    return Number.isInteger(val) ? val : Number(val.toFixed(2));
  };

  ENGAGEMENT_RESULT_FIELDS.forEach(field => {
    const value = latestMetric[field];
    if (!hasMidHistory && MID_DEPENDENT_STRING_FIELDS.has(field)) {
      results[field] = "";
    } else if (!hasMidHistory && MID_DEPENDENT_NUMERIC_FIELDS.has(field)) {
      results[field] = "";
    } else if (NUMERIC_RESULT_FIELDS.has(field)) {
      results[field] = formatValue(value);
    } else {
      results[field] = value !== undefined && value !== null ? value : "";
    }
  });

  if (typeof Logger !== "undefined" && Logger && typeof Logger.log === "function") {
    const detailLog = ENGAGEMENT_RESULT_FIELDS.map(field => `${field}: ${results[field]}`);
    Logger.log(detailLog.join("\n"));
  }
  return results;
}

function levelFromEngagement(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (value > LEVEL_THRIVING) return "Thriving";
  if (value < LEVEL_CRITICAL) return "Critical";
  if (value > LEVEL_HIGH) return "High";
  if (value < LEVEL_LOW) return "Low";
  return "Moderate";
}

function refineTrend(params) {
  const base = params.base;
  const recent = params.recent;
  const slope = params.slope;
  const prevSlope = params.prevSlope;
  const momentum = params.momentum;
  const delta = params.delta;
  const deltaPrev = params.deltaPrev;
  const engagement = params.engagement;
  const minPast = params.minPast;
  const maxPast = params.maxPast;

  if (base === "未評価") {
    if (recent === "上昇" || recent === "下降" || recent === "横ばい") {
      return recent;
    }
    return "未評価";
  }

  const hasSlope = Number.isFinite(slope);
  const hasPrevSlope = Number.isFinite(prevSlope);
  const hasMom = Number.isFinite(momentum);
  const hasDelta = Number.isFinite(delta);

  const strongMomentumUp = hasMom && momentum >= TREND_MOMENTUM_STRONG;
  const strongMomentumDown = hasMom && momentum <= -TREND_MOMENTUM_STRONG;
  const consecutiveStrongUp =
    Number.isFinite(deltaPrev) && deltaPrev >= TREND_DELTA_STRONG;
  const consecutiveStrongDown =
    Number.isFinite(deltaPrev) && deltaPrev <= -TREND_DELTA_STRONG;
  const moderateMomentum = !hasMom || Math.abs(momentum) < TREND_MOMENTUM_STRONG;
  const moderateDelta = !hasDelta || Math.abs(delta) < TREND_DELTA_STRONG;

  if (
    base === "上昇中" &&
    recent === "上昇" &&
    hasSlope && slope >= TREND_SLOPE_POS &&
    hasDelta && delta >= TREND_DELTA_STRONG &&
    (strongMomentumUp || consecutiveStrongUp)
  ) {
    return "上昇加速";
  }

  if (
    base === "上昇中" &&
    recent === "横ばい" &&
    hasSlope && slope >= TREND_SLOPE_POS &&
    hasMom && Math.abs(momentum) < TREND_MOMENTUM_STRONG &&
    hasDelta && Math.abs(delta) < TREND_DELTA_STRONG
  ) {
    return "上昇継続";
  }

  const downturn =
    base === "上昇中" &&
    recent === "下降" &&
    hasSlope && slope >= TREND_SLOPE_POS &&
    hasDelta && delta <= -TREND_DELTA_STRONG &&
    (strongMomentumDown || consecutiveStrongDown);

  if (downturn && Number.isFinite(engagement) && Number.isFinite(minPast)) {
    if (engagement >= minPast) {
      return "悪化";
    }
    return "低下危機";
  }

  if (
    base === "低下中" &&
    recent === "下降" &&
    hasSlope && slope <= TREND_SLOPE_NEG &&
    hasDelta && delta <= -TREND_DELTA_STRONG &&
    (strongMomentumDown || consecutiveStrongDown)
  ) {
    return "低下加速";
  }

  if (
    base === "低下中" &&
    recent === "横ばい" &&
    hasDelta && delta > TREND_DELTA
  ) {
    return "回復期待";
  }

  if (
    base === "低下中" &&
    recent === "横ばい" &&
    hasSlope && slope <= TREND_SLOPE_NEG &&
    moderateMomentum &&
    moderateDelta
  ) {
    return "低下継続";
  }

  const recovery =
    (base === "低下中" ||
     (base === "安定" && hasPrevSlope && prevSlope <= TREND_SLOPE_NEG)) &&
    recent === "上昇" &&
    hasDelta && delta >= TREND_DELTA_STRONG &&
    (strongMomentumUp || consecutiveStrongUp);

  if (recovery && Number.isFinite(engagement) && Number.isFinite(maxPast)) {
    if (engagement <= maxPast) {
      return "回復";
    }
    return "復活";
  }

  if (
    base === "上昇中" &&
    recent === "横ばい" &&
    hasDelta && delta < -TREND_DELTA
  ) {
    return "低下懸念";
  }

  if (
    base === "安定" &&
    recent === "上昇" &&
    hasSlope && slope > TREND_SLOPE_NEG && slope < TREND_SLOPE_POS &&
    hasDelta && delta > TREND_DELTA &&
    (strongMomentumUp || (Number.isFinite(deltaPrev) && deltaPrev <= SHORT_MIN_DELTA))
  ) {
    return "上昇期待";
  }

  if (
    base === "安定" &&
    recent === "下降" &&
    hasSlope && slope > TREND_SLOPE_NEG && slope < TREND_SLOPE_POS &&
    hasDelta && delta <= -TREND_DELTA_STRONG &&
    Number.isFinite(deltaPrev) && deltaPrev >= 0
  ) {
    return "低下警戒";
  }

  if (
    base === "安定" &&
    recent === "下降" &&
    hasSlope && slope > TREND_SLOPE_NEG && slope < TREND_SLOPE_POS &&
    Number.isFinite(deltaPrev) && deltaPrev >= 0 &&
    hasDelta && delta < -TREND_DELTA &&
    hasMom && momentum <= -TREND_MOMENTUM_STRONG
  ) {
    return "低下警戒";
  }

  if (base === "安定" && !hasSlope) {
    if (recent === "上昇") {
      return "上昇期待";
    }
    if (recent === "下降") {
      return "低下警戒";
    }
    return "安定維持";
  }

  if (base === "低下中") {
    return "低下継続";
  }
  if (base === "上昇中") {
    return "上昇継続";
  }
  return "安定維持";
}

function padNumber(value, length) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return sign + String(abs).padStart(length, "0");
}

function formatWave(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return "";
  }
  return `${year}-${padNumber(month, 2)}`;
}

function computeMomentum(values) {
  const series = values.filter(Number.isFinite);
  const n = series.length;
  if (n < 3) {
    return 0;
  }

  const recent = mean(series.slice(-3));
  let prior;
  if (n >= 6) {
    prior = mean(series.slice(-6, -3));
  } else if (n > 3) {
    prior = mean(series.slice(0, -3));
  } else {
    prior = recent;
  }
  return recent - prior;
}

function theilSenSlope(values, maxWindow) {
  const filtered = values.filter(Number.isFinite);
  if (filtered.length === 0) {
    return 0;
  }

  const slice = filtered.length > maxWindow
    ? filtered.slice(filtered.length - maxWindow)
    : filtered.slice();

  const n = slice.length;
  if (n < 2) {
    return 0;
  }
  if (n < 3) {
    return (slice[n - 1] - slice[0]) / (n - 1);
  }

  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      slopes.push((slice[j] - slice[i]) / (j - i));
    }
  }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  if (slopes.length % 2 === 1) {
    return slopes[mid];
  }
  return (slopes[mid - 1] + slopes[mid]) / 2;
}

function computePersonalSlope(values, window) {
  const result = [];
  const filteredValues = values.map(v => (Number.isFinite(v) ? v : NaN));

  for (let i = 0; i < filteredValues.length; i++) {
    const segment = filteredValues.slice(Math.max(0, i - window + 1), i + 1);
    result.push(theilSenSlope(segment, window));
  }
  return result;
}

function expandingQuantileExclusive(values, q) {
  const result = [];
  const history = [];
  for (let i = 0; i < values.length; i++) {
    if (history.length === 0) {
      result.push(NaN);
    } else {
      result.push(quantile(history, q));
    }
    if (Number.isFinite(values[i])) {
      history.push(values[i]);
    }
  }
  return result;
}

function expandingRobustZExclusive(values, eps) {
  const result = [];
  const history = [];
  const epsilon = eps || 1e-9;

  for (let i = 0; i < values.length; i++) {
    if (history.length === 0) {
      result.push(NaN);
    } else {
      const med = median(history);
      const deviations = history.map(v => Math.abs(v - med));
      const mad = 1.4826 * median(deviations);
      if (!Number.isFinite(mad) || mad < epsilon) {
        result.push(NaN);
      } else {
        result.push((values[i] - med) / mad);
      }
    }

    if (Number.isFinite(values[i])) {
      history.push(values[i]);
    }
  }

  return result;
}

function minFromHistory(history, window) {
  if (!history.length) {
    return NaN;
  }
  const slice = history.slice(Math.max(0, history.length - window));
  if (!slice.length) {
    return NaN;
  }
  return Math.min.apply(null, slice);
}

function maxFromHistory(history, window) {
  if (!history.length) {
    return NaN;
  }
  const slice = history.slice(Math.max(0, history.length - window));
  if (!slice.length) {
    return NaN;
  }
  return Math.max.apply(null, slice);
}

function rollingRangeFull(values, window) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < window) {
      result.push(NaN);
      continue;
    }
    const slice = values.slice(i - window + 1, i + 1);
    if (slice.some(v => !Number.isFinite(v))) {
      result.push(NaN);
      continue;
    }
    const minVal = Math.min.apply(null, slice);
    const maxVal = Math.max.apply(null, slice);
    result.push(maxVal - minVal);
  }
  return result;
}

function stdOfLast(values, window) {
  const slice = collectLastFinite(values, window);
  if (!slice.length) {
    return 0;
  }
  const meanValue = mean(slice);
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / slice.length;
  return Math.sqrt(variance);
}

function meanOfLast(values, window) {
  const slice = collectLastFinite(values, window);
  if (!slice.length) {
    return NaN;
  }
  return mean(slice);
}

function collectLastFinite(values, window) {
  const slice = [];
  for (let idx = values.length - 1; idx >= 0 && slice.length < window; idx--) {
    const value = values[idx];
    if (Number.isFinite(value)) {
      slice.unshift(value);
    }
  }
  return slice;
}

function formatDimensionStats(stats) {
  if (!stats) {
    return "";
  }
  const parts = Object.entries(stats)
    .map(([label, value]) => {
      if (!label) {
        return "";
      }
      if (Number.isFinite(value)) {
        return `${label}:${formatNumber(value)}`;
      }
      return `${label}:`;
    })
    .filter(part => part !== "");
  return parts.join(", ");
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function quantile(values, q) {
  if (!values.length) {
    return NaN;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function median(values) {
  return quantile(values, 0.5);
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

//
// Calculate the ratings for the engagement factors.
//
function calcEngagement(engagementAnswers) {
  const columns = {
    vigor:      [0, 1, 4],
    dedication: [2, 3, 6],
    absorption: [5, 7, 8]
  };

  const engagement = {};

  Object.keys(columns).forEach(factor => {
    engagement[factor] = columns[factor]
      .map(index => engagementValue(engagementAnswers[index]))
      .reduce((a, b) => a + b, 0);
  });

  engagement.engagement = engagement.vigor + engagement.dedication + engagement.absorption;

  return engagement;
}

//
// Translate the user's selection into a numerical rating.
//
function engagementValue(answer) {
  const values = {
    "いつも感じていた":    6,
    "頻繁に感じた":       5,
    "よく感じた":         4,
    "ときどき感じた":      3,
    "めったに感じなかった": 2,
    "ほとんど感じなかった": 1,
    "まったく感じなかった": 0
  };

  return values[answer] !== undefined ? values[answer] : 0;
}
