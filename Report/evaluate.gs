// --- Configuration Parameters ---
const TREND_SLOPE = 0.5;              // Absolute slope threshold
const TREND_SLOPE_STD_MIN = 0.2;      // Minimum standardized slope threshold
const TREND_SLOPE_STD = 0.45;         // Standardized slope threshold
const TREND_DELTA_STRONG = 5.0;       // Strong change threshold
const TREND_DELTA = 1.0;              // Change threshold
const TREND_RECENT_DELTA = 2.0;       // Trend_recent up/down threshold
const BIG_CHANGE_PERSONAL_Z = 2.0;    // Personal big change threshold (2 sigma)
const CHANGE_TAG_THRESHOLD = 6.0;     // Absolute change threshold for acute changes
const LEVEL_THRIVING = 43;            // above 85% of the E scale
const LEVEL_CRITICAL = 3;             // below  5% of the E scale
const LEVEL_HIGH = 32;                // above 60% of the E scale
const LEVEL_LOW = 11;                 // below 20% of the E scale
const STABILITY_RANGE_EPS = 1e-6;     // Stability tresholds (6-month)
const STABILITY_STD_STABLE = 1.0;     // 25 percentile
const STABILITY_MOMENTUM_STABLE = 0.5;
const STABILITY_STD_UNSTABLE = 3.3;   // 80 percentile
const MID_WINDOW = 6;                 // History requirements
const SHORT_MIN_DELTA = 2.0;
const Z_VDA_THRESHOLD = 0.8;
const MIN_SLOPE_POS = 0.20;
const MIN_SLOPE_NEG = -0.20;
const MID_MIN_RECORDS = 2;            // mid-range metrics require more than this many waves

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
  "E_delta_1",
  "E_delta_1_prev",
  "E_delta_1_std_12",
  "E_slope_6",
  "E_slope_6_std_12",
  "V_delta_1",
  "D_delta_1",
  "A_delta_1",
  "V_slope_6",
  "D_slope_6",
  "A_slope_6",
];

const NUMERIC_RESULT_FIELDS = new Set([
  "E_delta_1",
  "E_delta_1_prev",
  "E_delta_1_std_12",
  "V_delta_1",
  "D_delta_1",
  "A_delta_1",
  "E_slope_6",
  "E_slope_6_std_12",
  "V_slope_6",
  "D_slope_6",
  "A_slope_6",
]);

const MID_DEPENDENT_NUMERIC_FIELDS = new Set([
  "E_slope_6",
  "E_slope_6_std_12",
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
    metric.E_std_12 = stdOfLast(eValues, 12);

    const slope6 = theilSenSlope(eValues, MID_WINDOW);
    const prevSlopeForRecord = Number.isFinite(prevSlope6) ? prevSlope6 : slope6;

    metric.E_slope_6 = hasMidHistory ? slope6 : NaN;
    metric.prev_E_slope_6 = prevSlopeForRecord;

    // E_slope_6_std_12: standardized 6-month slope by 12-month std
    const std12 = metric.E_std_12;
    if (hasMidHistory && Number.isFinite(slope6) && Number.isFinite(std12) && std12 > 0) {
      metric.E_slope_6_std_12 = slope6 / std12;
    } else {
      metric.E_slope_6_std_12 = NaN;
    }

    // E_delta_1_std_12: standardized 1-month change by 12-month std
    if (Number.isFinite(metric.E_delta_1) && Number.isFinite(std12) && std12 > 1e-9) {
      metric.E_delta_1_std_12 = metric.E_delta_1 / std12;
    } else {
      metric.E_delta_1_std_12 = NaN;
    }

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

  // Convert labels to codes (vigor -> V, dedication -> D, absorption -> A)
  const labelToCode = { "vigor": "V", "dedication": "D", "absorption": "A" };

  // Calculate adaptive short/mid strength/weakness using expanding quantiles and Z-scores
  const shortStrengthLists = metrics.map(() => []);
  const shortWeaknessLists = metrics.map(() => []);
  const midStrengthLists = metrics.map(() => []);
  const midWeaknessLists = metrics.map(() => []);

  DIMENSION_CONFIG.forEach(dim => {
    // Extract delta and slope series for this dimension
    const deltaSeries = metrics.map(m => m[dim.deltaKey]);
    const slopeSeries = metrics.map(m => m[dim.slopeKey]);

    // Calculate expanding quantiles and Z-scores for deltas (short-term)
    const deltaP90 = expandingQuantileExclusive(deltaSeries, 0.90);
    const deltaP10 = expandingQuantileExclusive(deltaSeries, 0.10);
    const deltaZ = expandingRobustZExclusive(deltaSeries);

    // Calculate expanding quantiles and Z-scores for slopes (mid-term)
    const slopeP90 = expandingQuantileExclusive(slopeSeries, 0.90);
    const slopeP10 = expandingQuantileExclusive(slopeSeries, 0.10);
    const slopeZ = expandingRobustZExclusive(slopeSeries);

    for (let i = 0; i < metrics.length; i++) {
      const deltaValue = deltaSeries[i];
      const slopeValue = slopeSeries[i];

      // Short-term strength/weakness: adaptive thresholds
      const thresholdPosShort = Math.max(deltaP90[i] || -Infinity, SHORT_MIN_DELTA);
      const thresholdNegShort = Math.min(deltaP10[i] || Infinity, -SHORT_MIN_DELTA);

      if (Number.isFinite(deltaValue) && deltaValue >= thresholdPosShort &&
          (!Number.isFinite(deltaZ[i]) || Math.abs(deltaZ[i]) > Z_VDA_THRESHOLD)) {
        shortStrengthLists[i].push(dim.label);
      }
      if (Number.isFinite(deltaValue) && deltaValue <= thresholdNegShort &&
          (!Number.isFinite(deltaZ[i]) || Math.abs(deltaZ[i]) > Z_VDA_THRESHOLD)) {
        shortWeaknessLists[i].push(dim.label);
      }

      // Mid-term strength/weakness: adaptive thresholds
      if (hasMidHistory) {
        const thresholdPosMid = Math.max(slopeP90[i] || -Infinity, MIN_SLOPE_POS);
        const thresholdNegMid = Math.min(slopeP10[i] || Infinity, MIN_SLOPE_NEG);

        if (Number.isFinite(slopeValue) && slopeValue >= thresholdPosMid &&
            (!Number.isFinite(slopeZ[i]) || Math.abs(slopeZ[i]) > Z_VDA_THRESHOLD)) {
          midStrengthLists[i].push(dim.label);
        }
        if (Number.isFinite(slopeValue) && slopeValue <= thresholdNegMid &&
            (!Number.isFinite(slopeZ[i]) || Math.abs(slopeZ[i]) > Z_VDA_THRESHOLD)) {
          midWeaknessLists[i].push(dim.label);
        }
      }
    }
  });

  for (let i = 0; i < metrics.length; i++) {
    metrics[i].strength_short = shortStrengthLists[i].map(label => labelToCode[label] || label).join(", ");
    metrics[i].weakness_short = shortWeaknessLists[i].map(label => labelToCode[label] || label).join(", ");
    metrics[i].strength_mid = hasMidHistory ? midStrengthLists[i].map(label => labelToCode[label] || label).join(", ") : "";
    metrics[i].weakness_mid = hasMidHistory ? midWeaknessLists[i].map(label => labelToCode[label] || label).join(", ") : "";
  }

  const rangeE = rollingRangeFull(eValues, MID_WINDOW);
  const rangeV = rollingRangeFull(vValues, MID_WINDOW);
  const rangeD = rollingRangeFull(dValues, MID_WINDOW);
  const rangeA = rollingRangeFull(aValues, MID_WINDOW);

  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i];
    if (hasMidHistory) {
      const sameFlag =
        Number.isFinite(rangeE[i]) && rangeE[i] <= STABILITY_RANGE_EPS &&
        Number.isFinite(rangeV[i]) && rangeV[i] <= STABILITY_RANGE_EPS &&
        Number.isFinite(rangeD[i]) && rangeD[i] <= STABILITY_RANGE_EPS &&
        Number.isFinite(rangeA[i]) && rangeA[i] <= STABILITY_RANGE_EPS;

      const stdVal = metric.E_std_6;
      const absMomentum = Math.abs(metric.E_momentum_3);
      const stableFlag = Number.isFinite(stdVal) && stdVal < STABILITY_STD_STABLE && absMomentum < STABILITY_MOMENTUM_STABLE;
      const unstableFlag = Number.isFinite(stdVal) && stdVal > STABILITY_STD_UNSTABLE;

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
      const slopeStd = metric.E_slope_6_std_12;

      // Condition 1: Strong absolute slope AND minimum standardized slope
      // Condition 2: OR strong standardized slope alone (must have mid history)
      if ((Number.isFinite(slope) && slope > TREND_SLOPE && Number.isFinite(slopeStd) && slopeStd > TREND_SLOPE_STD_MIN) ||
          (hasMidHistory && Number.isFinite(slopeStd) && slopeStd > TREND_SLOPE_STD)) {
        metric.trend_base = "上昇中";
      } else if ((Number.isFinite(slope) && slope < -TREND_SLOPE && Number.isFinite(slopeStd) && slopeStd < -TREND_SLOPE_STD_MIN) ||
                 (hasMidHistory && Number.isFinite(slopeStd) && slopeStd < -TREND_SLOPE_STD)) {
        metric.trend_base = "低下中";
      } else {
        metric.trend_base = "安定";
      }
    } else {
      metric.trend_base = "未評価";
    }

    const delta = metric.E_delta_1;
    const deltaPrev = metric.E_delta_1_prev;

    // Thresholds for recent trend classification
    const acuteThr = CHANGE_TAG_THRESHOLD;   // 6.0 for 急上昇/急落
    const recentThr = TREND_RECENT_DELTA;    // 2.0 for 上昇/下降

    // Classification logic with priority: 連続 > 急 > 通常
    let recentTrend = "横ばい";

    // Acute changes (large magnitude)
    const acuteUp = Number.isFinite(delta) && delta >= acuteThr;
    const acuteDown = Number.isFinite(delta) && delta <= -acuteThr;

    // Moderate changes
    const moderateUp = Number.isFinite(delta) && delta > recentThr && delta < acuteThr;
    const moderateDown = Number.isFinite(delta) && delta < -recentThr && delta > -acuteThr;

    // Consecutive patterns (2 periods in same direction)
    const upPrev = Number.isFinite(deltaPrev) && deltaPrev > recentThr;
    const downPrev = Number.isFinite(deltaPrev) && deltaPrev < -recentThr;
    const consecutiveUp = Number.isFinite(delta) && delta > recentThr && upPrev;
    const consecutiveDown = Number.isFinite(delta) && delta < -recentThr && downPrev;

    // Apply priority order
    if (moderateDown) recentTrend = "下降";
    if (moderateUp) recentTrend = "上昇";
    if (acuteDown) recentTrend = "急落";
    if (acuteUp) recentTrend = "急上昇";
    if (consecutiveDown) recentTrend = "連続下降";
    if (consecutiveUp) recentTrend = "連続上昇";

    metric.trend_recent = recentTrend;

    metric.trend_refined = refineTrend({
      base: metric.trend_base,
      recent: metric.trend_recent,
      slope: metric.E_slope_6,
      delta: metric.E_delta_1,
      E_std_12: metric.E_std_12,
    });

    // Calculate change_tag using standardized approach
    metric.change_tag = calculateChangeTag(metric.E_delta_1, metric.E_std_12) === "変化大" ? "変化大" : "";
    metric.level = levelFromEngagement(metric.engagement);
  }

  const latestMetric = metrics[metrics.length - 1];
  const results = {};

  // Format numeric values to 2 decimal places
  const formatValue = (val) => {
    if (!Number.isFinite(val)) return "";  // Return empty string for NaN/undefined instead of 0
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

function calculateChangeTag(E_delta_1, E_std_12) {
  // Calculate standardized change tag
  if (Number.isFinite(E_std_12) && E_std_12 > 1e-9 && Number.isFinite(E_delta_1)) {
    return Math.abs(E_delta_1) / E_std_12 > BIG_CHANGE_PERSONAL_Z ? "変化大" : "not 変化大";
  }
  return "not 変化大";
}

function refineTrend(params) {
  const base = params.base;
  const recent = params.recent;
  const slope = params.slope;
  const delta = params.delta;
  const E_std_12 = params.E_std_12;

  // Calculate change_tag
  const changeTag = calculateChangeTag(delta, E_std_12);

  // Define trend categories
  const upTrends = ["上昇", "急上昇", "連続上昇"];
  const downTrends = ["下降", "急落", "連続下降"];

  // Priority 1: Handle 未評価 (insufficient history)
  if (base === "未評価") {
    if (recent === "上昇" || recent === "急上昇") {
      return "上昇";
    }
    if (recent === "下降" || recent === "急落") {
      return "下降";
    }
    if (recent === "横ばい") {
      return "横ばい";
    }
    return "横ばい";
  }

  // Priority 2: 上昇加速
  // Note: abs(slope) check ensures slope magnitude is significant
  // even if trend_base was satisfied by slope_std alone
  if (upTrends.includes(recent) &&
      base === "上昇中" &&
      changeTag === "変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {
    return "上昇加速";
  }

  // Priority 2: 低下加速
  if (downTrends.includes(recent) &&
      base === "低下中" &&
      changeTag === "変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {
    return "低下加速";
  }

  // Priority 3: 上昇継続
  if (["上昇", "急上昇", "連続上昇", "横ばい"].includes(recent) &&
      base === "上昇中" &&
      changeTag === "not 変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE &&
      Number.isFinite(delta) && delta >= 0) {
    return "上昇継続";
  }

  // Priority 3: 低下継続
  if (["下降", "急落", "連続下降", "横ばい"].includes(recent) &&
      base === "低下中" &&
      changeTag === "not 変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE &&
      Number.isFinite(delta) && delta <= 0) {
    return "低下継続";
  }

  // Priority 4: 復活
  if (["上昇", "急上昇"].includes(recent) &&
      base === "低下中" &&
      changeTag === "変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {
    return "復活";
  }

  // Priority 4: 悪化
  if (["下降", "急落"].includes(recent) &&
      base === "上昇中" &&
      changeTag === "変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {
    return "悪化";
  }

  // Priority 5: 回復
  if (["上昇", "急上昇", "連続上昇"].includes(recent) &&
      base === "低下中" &&
      changeTag === "not 変化大") {
    return "回復";
  }

  // Priority 5: 低下危機
  if (["下降", "急落", "連続下降"].includes(recent) &&
      base === "上昇中" &&
      changeTag === "not 変化大") {
    return "低下危機";
  }

  // Priority 6: 上昇期待
  if (base === "安定" &&
      ["上昇", "急上昇", "連続上昇"].includes(recent)) {
    return "上昇期待";
  }

  // Priority 6: 低下警戒
  if (base === "安定" &&
      ["下降", "急落", "連続下降"].includes(recent)) {
    return "低下警戒";
  }

  // Priority 7: 低下懸念
  if (recent === "横ばい" &&
      base === "上昇中" &&
      Number.isFinite(delta) && delta < 0) {
    return "低下懸念";
  }

  // Priority 7: 回復期待
  if (recent === "横ばい" &&
      base === "低下中" &&
      Number.isFinite(delta) && delta > 0) {
    return "回復期待";
  }

  // Priority 8: 安定維持
  if (base === "安定" && recent === "横ばい") {
    return "安定維持";
  }

  if (recent === "横ばい" &&
      base === "安定" &&
      changeTag === "not 変化大") {
    return "安定維持";
  }

  // Fallback
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

function mean(values) {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

function median(values) {
  if (!values.length) {
    return NaN;
  }
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return NaN;
  }
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length || q < 0 || q > 1) {
    return NaN;
  }
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return NaN;
  }
  if (q === 0) return sorted[0];
  if (q === 1) return sorted[sorted.length - 1];

  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Calculate expanding quantile excluding current value (shifted by 1)
 * @param {Array<number>} series - Time series data
 * @param {number} q - Quantile (0-1)
 * @returns {Array<number>} - Expanding quantiles (shifted)
 */
function expandingQuantileExclusive(series, q) {
  const result = [];
  for (let i = 0; i < series.length; i++) {
    if (i === 0) {
      result.push(NaN);
    } else {
      const window = series.slice(0, i);
      result.push(quantile(window, q));
    }
  }
  return result;
}

/**
 * Calculate expanding robust Z-score (MAD-based) excluding current value
 * @param {Array<number>} series - Time series data
 * @returns {Array<number>} - Robust Z-scores (shifted)
 */
function expandingRobustZExclusive(series) {
  const result = [];
  const eps = 1e-9;

  for (let i = 0; i < series.length; i++) {
    if (i === 0) {
      result.push(NaN);
    } else {
      const window = series.slice(0, i);
      const med = median(window);

      if (!Number.isFinite(med)) {
        result.push(NaN);
        continue;
      }

      // Calculate MAD (Median Absolute Deviation)
      const absDeviations = window.filter(Number.isFinite).map(v => Math.abs(v - med));
      const mad = 1.4826 * median(absDeviations);

      if (!Number.isFinite(mad) || mad < eps) {
        result.push(NaN);
      } else {
        const currentValue = series[i];
        if (!Number.isFinite(currentValue)) {
          result.push(NaN);
        } else {
          result.push((currentValue - med) / mad);
        }
      }
    }
  }
  return result;
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
    "いつも感じる": 6,
    "とてもよく感じる": 5,
    "よく感じる": 4,
    "時々感じる": 3,
    "めったに感じない": 2,
    "ほとんど感じない": 1,
    "全くない": 0
  };

  return values[answer] !== undefined ? values[answer] : 0;
}
