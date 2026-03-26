// --- Configuration Parameters ---
const TREND_SLOPE = 0.5;              // Absolute slope threshold
const TREND_SLOPE_STD = 0.55;         // Standardized slope threshold
const TREND_DELTA_STRONG = 5.0;       // Strong change threshold
const TREND_DELTA = 1.0;              // Change threshold
const TREND_RECENT_DELTA = 2.0;       // Trend_recent up/down threshold
const BIG_CHANGE_PERSONAL_Z = 2.4;    // Personal big change threshold (2 sigma)
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
const LONG_WINDOW =12;                // Inner personal analysis base
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
  "big_change",
  "stability_6",
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
  "E_slope_3m",
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
  "E_slope_3m",
]);

const MID_DEPENDENT_NUMERIC_FIELDS = new Set([
  "E_slope_6",
  "E_slope_6_std_12",
  "V_slope_6",
  "D_slope_6",
  "A_slope_6",
]);

const MID_DEPENDENT_STRING_FIELDS = new Set([
  "stability_6",
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

const LABEL_TO_CODE = { vigor: "V", dedication: "D", absorption: "A" };

//
// Analyze the engagement trend
//
function analyzeEngagement(data) {
  const context = prepareEngagementContext(data);
  if (!context) {
    return {};
  }

  const { rows, hasMidHistory } = context;
  const { metrics, series } = computeEngagementMetrics(rows, hasMidHistory);
  computeStrengthAndWeakness(metrics, hasMidHistory);
  evaluateStabilityTrendAndTags(metrics, series, hasMidHistory);

  const results = formatLatestResult(metrics, hasMidHistory);
  if (typeof Logger !== "undefined" && Logger && typeof Logger.log === "function") {
    const detailLog = ENGAGEMENT_RESULT_FIELDS.map(field => `${field}: ${results[field]}`);
    Logger.log(detailLog.join("\n"));
  }
  return results;
}

function prepareEngagementContext(data) {
  if (!Array.isArray(data) || data.length <= 1) {
    return null;
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

    if (!Number.isFinite(engagement) || !Number.isFinite(vigor) ||
        !Number.isFinite(dedication) || !Number.isFinite(absorption)) {
      continue;
    }

    rows.push({
      year,
      month,
      mail: row[columnIndex["mail address"]],
      engagement,
      vigor,
      dedication,
      absorption,
    });
  }

  if (!rows.length) {
    return null;
  }

  rows.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return 0;
  });

  return {
    rows,
    hasMidHistory: rows.length > MID_MIN_RECORDS,
  };
}

function computeEngagementMetrics(rows, hasMidHistory) {
  const metrics = rows.map(() => ({}));
  const series = {
    E: [],
    V: [],
    D: [],
    A: [],
  };

  let prevSlope6 = NaN;

  for (let i = 0; i < rows.length; i++) {
    const record = rows[i];
    const metric = metrics[i];

    const prevE = series.E.length ? series.E[series.E.length - 1] : NaN;
    const prevPrevE = series.E.length >= 2 ? series.E[series.E.length - 2] : NaN;
    const prevV = series.V.length ? series.V[series.V.length - 1] : NaN;
    const prevD = series.D.length ? series.D[series.D.length - 1] : NaN;
    const prevA = series.A.length ? series.A[series.A.length - 1] : NaN;

    metric.E_delta_1 = Number.isFinite(prevE) ? record.engagement - prevE : 0;
    metric.E_delta_1_prev =
      Number.isFinite(prevE) && Number.isFinite(prevPrevE) ? prevE - prevPrevE : 0;

    const deltaOrZero = (current, previous) =>
      Number.isFinite(previous) ? current - previous : 0;

    metric.V_delta_1 = deltaOrZero(record.vigor, prevV);
    metric.D_delta_1 = deltaOrZero(record.dedication, prevD);
    metric.A_delta_1 = deltaOrZero(record.absorption, prevA);

    series.E.push(record.engagement);
    series.V.push(record.vigor);
    series.D.push(record.dedication);
    series.A.push(record.absorption);

    metric.engagement = record.engagement;
    metric.E_momentum_3 = computeMomentum(series.E);
    metric.E_std_6 = series.E.length >= MID_WINDOW
      ? stdOfLast(series.E, MID_WINDOW)
      : NaN;
    const finiteCount = series.E.filter(Number.isFinite).length;
    metric.E_std_12 = finiteCount >= LONG_WINDOW
      ? stdOfLast(series.E, LONG_WINDOW)
      : NaN;

    // Standardization denominator: prefer E_std_12, fall back to E_std_6
    // when 6 <= finiteCount < 12
    const stdNorm = Number.isFinite(metric.E_std_12)
      ? metric.E_std_12
      : (finiteCount >= MID_WINDOW ? metric.E_std_6 : NaN);

    // E_slope_6_std_12: standardized 6-month slope by long-term std
    const slope6 = theilSenSlope(series.E, MID_WINDOW);
    const prevSlopeForRecord = Number.isFinite(prevSlope6) ? prevSlope6 : slope6;

    metric.E_slope_6 = hasMidHistory ? slope6 : NaN;
    metric.prev_E_slope_6 = prevSlopeForRecord;

    metric.E_slope_6_std_12 =
      hasMidHistory && Number.isFinite(slope6) && Number.isFinite(stdNorm) && stdNorm > 0
        ? slope6 / stdNorm
        : NaN;

    // E_delta_1_std_12: standardized 1-month change by long-term std
    metric.E_delta_1_std_12 =
      Number.isFinite(metric.E_delta_1) && Number.isFinite(stdNorm) && stdNorm > 1e-9
        ? metric.E_delta_1 / stdNorm
        : NaN;

    // E_slope_3m: 3-point OLS regression slope of engagement
    if (series.E.length >= 3) {
      const e = series.E;
      const y0 = e[e.length - 3], y1 = e[e.length - 2], y2 = e[e.length - 1];
      if (Number.isFinite(y0) && Number.isFinite(y1) && Number.isFinite(y2)) {
        metric.E_slope_3m = (y2 - y0) / 2;
      } else {
        metric.E_slope_3m = NaN;
      }
    } else {
      metric.E_slope_3m = NaN;
    }

    prevSlope6 = slope6;
  }

  const vSlopeSeries = computePersonalSlope(series.V, MID_WINDOW);
  const dSlopeSeries = computePersonalSlope(series.D, MID_WINDOW);
  const aSlopeSeries = computePersonalSlope(series.A, MID_WINDOW);

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

  return { metrics, series };
}

function computeStrengthAndWeakness(metrics, hasMidHistory) {
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

  metrics.forEach((metric, idx) => {
    metric.strength_short = shortStrengthLists[idx].map(label => LABEL_TO_CODE[label] || label).join(", ");
    metric.weakness_short = shortWeaknessLists[idx].map(label => LABEL_TO_CODE[label] || label).join(", ");
    metric.strength_mid = hasMidHistory ? midStrengthLists[idx].map(label => LABEL_TO_CODE[label] || label).join(", ") : "";
    metric.weakness_mid = hasMidHistory ? midWeaknessLists[idx].map(label => LABEL_TO_CODE[label] || label).join(", ") : "";
  });
}

function evaluateStabilityTrendAndTags(metrics, series, hasMidHistory) {
  const rangeE = rollingRangeFull(series.E, MID_WINDOW);
  const rangeV = rollingRangeFull(series.V, MID_WINDOW);
  const rangeD = rollingRangeFull(series.D, MID_WINDOW);
  const rangeA = rollingRangeFull(series.A, MID_WINDOW);

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
        metric.stability_6 = "不変";
      } else if (stableFlag) {
        metric.stability_6 = "安定";
      } else if (unstableFlag) {
        metric.stability_6 = "不安定";
      } else {
        metric.stability_6 = "やや安定";
      }
    } else {
      metric.stability_6 = "";
    }

    if (hasMidHistory) {
      const slope = metric.E_slope_6;
      const slopeStd = metric.E_slope_6_std_12;
      const slope3m = metric.E_slope_3m;

      // Fallback to E_slope_3m (with stricter threshold) when standardized slope unavailable (<6 records)
      const useSlope3m = !Number.isFinite(slopeStd);

      if ((Number.isFinite(slope) && slope > TREND_SLOPE) ||
          (Number.isFinite(slopeStd) && slopeStd > TREND_SLOPE_STD) ||
          (useSlope3m && Number.isFinite(slope3m) && slope3m > TREND_DELTA_STRONG)) {
        metric.trend_base = "上昇中";
      } else if ((Number.isFinite(slope) && slope < -TREND_SLOPE) ||
                 (Number.isFinite(slopeStd) && slopeStd < -TREND_SLOPE_STD) ||
                 (useSlope3m && Number.isFinite(slope3m) && slope3m < -TREND_DELTA_STRONG)) {
        metric.trend_base = "低下中";
      } else {
        metric.trend_base = "安定";
      }
    } else {
      metric.trend_base = "未評価";
    }

    metric.trend_recent = classifyRecentTrend(metric.E_delta_1, metric.E_delta_1_prev);

    metric.trend_refined = refineTrend({
      base: metric.trend_base,
      recent: metric.trend_recent,
      slope: metric.E_slope_6,
      delta: metric.E_delta_1,
      E_std_6: metric.E_std_6,
      E_delta_1_std: metric.E_delta_1_std_12,
    });

    // Calculate big_change using standardized approach (directional)
    const changeTag = calculateChangeTag(metric.E_delta_1, metric.E_std_6);
    metric.big_change = changeTag !== "not 変化大" ? changeTag : "";
    metric.level = levelFromEngagement(metric.engagement);
  }
}

function classifyRecentTrend(delta, deltaPrev) {
  // Thresholds for recent trend classification
  const acuteThr = CHANGE_TAG_THRESHOLD;        // 急上昇／急落
  const recentThr = TREND_RECENT_DELTA;         // 上昇／下降
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

  if (moderateDown) recentTrend = "下降";
  if (moderateUp) recentTrend = "上昇";
  if (acuteDown) recentTrend = "急落";
  if (acuteUp) recentTrend = "急上昇";
  if (consecutiveDown) recentTrend = "連続下降";
  if (consecutiveUp) recentTrend = "連続上昇";

  return recentTrend;
}

function formatLatestResult(metrics, hasMidHistory) {
  if (!metrics.length) {
    return {};
  }

  const latestMetric = metrics[metrics.length - 1];
  const results = {};

  // Format numeric values to 2 decimal places
  const formatValue = (val) => {
    if (!Number.isFinite(val)) return "";
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

function calculateChangeTag(E_delta_1, E_std_6) {
  // Calculate standardized change tag with direction
  if (Number.isFinite(E_std_6) && E_std_6 > 1e-9 && Number.isFinite(E_delta_1)) {
    if (Math.abs(E_delta_1) / E_std_6 > BIG_CHANGE_PERSONAL_Z) {
      return E_delta_1 > 0 ? "増加変化大" : "減少変化大";
    }
  }
  return "not 変化大";
}

function refineTrend(params) {
  const base = params.base;
  const recent = params.recent;
  const slope = params.slope;
  const delta = params.delta;
  const E_std_6 = params.E_std_6;
  const E_delta_1_std = params.E_delta_1_std;

  // Calculate big_change
  const changeTag = calculateChangeTag(delta, E_std_6);

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
      changeTag === "増加変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {
    return "上昇加速";
  }

  // Priority 2: 低下加速
  if (downTrends.includes(recent) &&
      base === "低下中" &&
      changeTag === "減少変化大" &&
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
      changeTag === "増加変化大" &&
      Number.isFinite(slope) && Math.abs(slope) > TREND_SLOPE) {
    return "復活";
  }

  // Priority 4: 悪化
  if (["下降", "急落"].includes(recent) &&
      base === "上昇中" &&
      changeTag === "減少変化大" &&
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

  // Priority 8: 上昇期待 (横ばいだが個人基準で増加変化大)
  if (recent === "横ばい" &&
      base === "安定" &&
      changeTag === "増加変化大" &&
      Number.isFinite(E_delta_1_std) && E_delta_1_std > TREND_RECENT_DELTA) {
    return "上昇期待";
  }

  // Priority 8: 低下警戒 (横ばいだが個人基準で減少変化大)
  if (recent === "横ばい" &&
      base === "安定" &&
      changeTag === "減少変化大" &&
      Number.isFinite(E_delta_1_std) && E_delta_1_std < -TREND_RECENT_DELTA) {
    return "低下警戒";
  }

  // Priority 9: 安定維持
  if (base === "安定" && recent === "横ばい") {
    return "安定維持";
  }

  // Fallback
  return "安定維持";
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
