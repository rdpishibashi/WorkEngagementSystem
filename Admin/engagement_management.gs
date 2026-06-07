/**
 * Compute flag_constant_6m for each address for the target year/month.
 * Reads the full RatingSheet history, groups by address, and applies
 * the same 2-pass algorithm as we_analyzer.py.
 *
 * @param {number} year  - Target year
 * @param {number} month - Target month
 * @returns {Object} Map of { address → flag string }
 */
function computeFlagConstant6mMap(year, month) {
  const allRows = RatingSheet.getDataRange().getValues().slice(1);
  const byAddress = {};
  allRows.forEach(row => {
    const addr = row[ColumnAddress];
    if (!addr) return;
    if (!byAddress[addr]) byAddress[addr] = [];
    byAddress[addr].push({
      year: row[ColumnYear],
      month: row[ColumnMonth],
      vigor: row[ColumnRatingVigor],
      dedication: row[ColumnRatingDedication],
      absorption: row[ColumnRatingAbsorption],
      level: row[ColumnRatingLevel]
    });
  });

  const result = {};
  const ESTABLISHED = new Set(["LOW_FIXED", "MID_EVASION", "HIGH_AVOIDANCE"]);

  Object.entries(byAddress).forEach(([addr, waves]) => {
    waves.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
    const targetIdx = waves.findIndex(w => w.year === year && w.month === month);
    if (targetIdx < 0) return;

    const subset = waves.slice(0, targetIdx + 1);

    // Determine whether each row has a uniform fixed value (v == d == a, all present)
    const fixedVals = subset.map(w => {
      const v = w.vigor, d = w.dedication, a = w.absorption;
      if (v !== "" && v != null && d !== "" && d != null && a !== "" && a != null
          && v === d && d === a) return v;
      return null;
    });

    // Pass 1: preliminary flag based on 3-month window
    const prelim = subset.map((w, i) => {
      if (i < 2) return "";
      const win = [fixedVals[i - 2], fixedVals[i - 1], fixedVals[i]];
      if (win.some(v => v === null) || !(win[0] === win[1] && win[1] === win[2])) return "";
      const lv = w.level;
      if (lv === "Critical" || lv === "Low") return "LOW_FIXED";
      if (lv === "Moderate") return "MID_EVASION";
      if (lv === "High" || lv === "Thriving") return "HIGH_AVOIDANCE";
      return "";
    });

    const i = subset.length - 1;
    if (!ESTABLISHED.has(prelim[i])) {
      result[addr] = prelim[i];
      return;
    }

    // Pass 2: FIX_SHIFTED — only at the exact 3rd month of a new fixed-value run
    const currentFixed = fixedVals[i];
    const isThirdMonth = (i < 3) || (fixedVals[i - 3] !== currentFixed);

    if (isThirdMonth) {
      let isShifted = false;
      for (let j = i - 3; j >= 0; j--) {
        if (ESTABLISHED.has(prelim[j]) && fixedVals[j] !== currentFixed) {
          isShifted = true;
          break;
        }
      }
      result[addr] = isShifted ? "FIX_SHIFTED" : prelim[i];
    } else {
      result[addr] = prelim[i];
    }
  });

  return result;
}

function getRatingsData(year, month) {
  const ratingsData = RatingSheet.getDataRange().getValues();
  return ratingsData.slice(1).map(row => ({
    year: row[ColumnYear],
    month: row[ColumnMonth],
    day: row[ColumnDay],
    date: row[ColumnDate],
    address: row[ColumnAddress],
    engagement: row[ColumnRatingEngagement],
    vigor: row[ColumnRatingVigor],
    dedication: row[ColumnRatingDedication],
    absorption: row[ColumnRatingAbsorption],
    level: row[ColumnRatingLevel],
    trend_base: row[ColumnRatingTrendBase],
    trend_recent: row[ColumnRatingTrendRecent],
    trend_refined: row[ColumnRatingTrendRefined],
    big_change: row[ColumnRatingBigChange],
    stability_6: row[ColumnRatingStability6],
    strength_short: row[ColumnRatingStrengthShort],
    weakness_short: row[ColumnRatingWeaknessShort],
    strength_mid: row[ColumnRatingStrengthMid],
    weakness_mid: row[ColumnRatingWeaknessMid],
    e_delta_1: row[ColumnRatingE_Delta1],
    e_delta_1_prev: row[ColumnRatingE_Delta1Prev],
    e_delta_1_std_12: row[ColumnRatingE_Delta1Std12],
    e_slope_6: row[ColumnRatingE_Slope6],
    e_slope_6_std_12: row[ColumnRatingE_Slope6Std12],
    v_delta_1: row[ColumnRatingV_Delta1],
    d_delta_1: row[ColumnRatingD_Delta1],
    a_delta_1: row[ColumnRatingA_Delta1],
    v_slope_6: row[ColumnRatingV_Slope6],
    d_slope_6: row[ColumnRatingD_Slope6],
    a_slope_6: row[ColumnRatingA_Slope6],
    e_slope_3m: row[ColumnRatingE_Slope3m],
    direction_6_p90: row[ColumnRatingDirection6P90],
    volatility_6_p90: row[ColumnRatingVolatility6P90]
  })).filter(rating => rating.year === year && rating.month === month);
}

function createMasterDataToBeAdded(masterData, rating, member) {
  createRatingMasterToBeAdded(masterData.ratings, rating, member);
  createRating2MasterToBeAdded(masterData.ratings2, rating, member);
  createEvaluationMasterToBeAdded(masterData.evaluations, rating, member);
}

function createRatingMasterToBeAdded(ratingsToBeAppended, rating, member) {
  const factors = [
    { name: "エンゲージメント", code: "E", value: rating.engagement, max: MaxValueEngagement },
    { name: "活力", code: "V", value: rating.vigor, max: MaxValueFactor },
    { name: "熱意", code: "D", value: rating.dedication, max: MaxValueFactor },
    { name: "没頭", code: "A", value: rating.absorption, max: MaxValueFactor }
  ];

  factors.forEach(factor => {
    const record = [
      rating.year,           // 0
      rating.month,          // 1
      rating.day,            // 2
      rating.date,           // 3
      rating.address,        // 4
      member.name,           // 5
      member.division,       // 6
      member.division,       // 7 - current_division
      member.department,     // 8
      member.department,     // 9 - current_department
      member.section,        // 10
      member.section,        // 11 - current_section
      member.team,           // 12
      member.team,           // 13 - current_team
      member.project,        // 14
      member.project,        // 15 - current_project
      member.grade,          // 16
      factor.name,           // 17 - factor
      factor.value / factor.max * MaxScale  // 18 - rating (score)
    ];

    ratingsToBeAppended.push(record);
  });
}

function createRating2MasterToBeAdded(ratings2ToBeAppended, rating, member) {
  // Calculate intervention_priority
  const interventionPriority = calculateInterventionPriority(rating);

  const record = [
    rating.year,
    rating.month,
    rating.day,
    rating.date,
    rating.address,
    member.name,
    member.division,
    member.division,
    member.department,
    member.department,
    member.section,
    member.section,
    member.team,
    member.team,
    member.project,
    member.project,
    member.grade,
    rating.engagement,
    rating.vigor,
    rating.dedication,
    rating.absorption,
    rating.level || "",
    rating.trend_base || "",
    rating.trend_recent || "",
    rating.trend_refined || "",
    rating.big_change || "",
    rating.stability_6 || "",
    rating.direction_6_p90 || "",          // 27: stability_6 の直後
    rating.volatility_6_p90 || "",         // 28
    interventionPriority.neg,              // 29 (was 27)
    interventionPriority.pos,              // 30 (was 28)
    rating.strength_short || "",
    rating.weakness_short || "",
    rating.strength_mid || "",
    rating.weakness_mid || "",
    rating.e_delta_1 ?? "",
    rating.e_delta_1_prev ?? "",
    rating.e_delta_1_std_12 ?? "",
    rating.e_slope_6 ?? "",
    rating.e_slope_6_std_12 ?? "",
    rating.e_slope_3m ?? "",
    rating.v_delta_1 ?? "",
    rating.d_delta_1 ?? "",
    rating.a_delta_1 ?? "",
    rating.v_slope_6 ?? "",
    rating.d_slope_6 ?? "",
    rating.a_slope_6 ?? "",
    rating.flag_constant_6m || ""   // 最終列
  ];
  ratings2ToBeAppended.push(record);
}

/**
 * Calculate tiered score based on absolute value and threshold tiers
 *
 * @param {number} absValue - Absolute value to evaluate
 * @param {Array} tiers - Array of [lowerBound, upperBound, score] tuples
 * @returns {number} Tiered score (0 if no tier matches)
 */
function getTieredScore(absValue, tiers) {
  for (const [lower, upper, score] of tiers) {
    if (absValue > lower && absValue <= upper) {
      return score;
    }
  }
  return 0;
}

/**
 * Calculate intervention priority scores split into negative and positive directions
 *
 * @param {Object} rating - Rating object with trend/change/statistical indicators
 * @returns {{neg: number, pos: number}} Intervention priority scores
 */
function calculateInterventionPriority(rating) {
  let neg = 0;
  let pos = 0;

  // --- trend_base ---
  // 下降反転（base 上昇中だが trend_recent が下降系）の場合は、上昇基調の pos 点を
  // neg に振り替える。「低下危機」等（base 上昇中・recent 下降）の早期警戒を介入優先度に
  // 反映させるため。上昇反転（base 低下中・recent 上昇系＝回復）は対象外で従来どおり neg+1。
  // Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）
  const trendBase = rating.trend_base || "";
  const trendRecent = rating.trend_recent || "";
  const DOWN_TRENDS = ["下降", "急落", "連続下降"];
  if (trendBase === "低下中") {
    neg += 1;
  } else if (trendBase === "上昇中") {
    if (DOWN_TRENDS.includes(trendRecent)) {
      neg += 1;
    } else {
      pos += 1;
    }
  }

  // --- trend_refined: 低下継続（持続的低下の高止まり）→ neg +1 ---
  // 「低下継続」= base低下中＋直近は下降/横ばい＋大きな変化なし＋6か月の実下降(slope_ok)。
  // 大きく低下した後に低位で高止まりすると E_delta_1 / 傾きベースの加点が減衰し、
  // trend_base 低下中の neg +1 しか残らず候補から漏れる。持続的低下を介入優先度に残すための加点。
  // trend_base 低下中(+1)との二重計上は意図的（stability＋volatility と同じ設計）。neg のみ加点
  // （上昇継続＝pos 側には加点しない非対称）。
  // Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）
  if ((rating.trend_refined || "") === "低下継続") {
    neg += 1;
  }

  // --- trend_recent（直近トレンド）による直近変化の加点 ---
  // trend_recent は E_delta_1 / E_delta_1_prev から導出されるため、生の E_delta_1 加点とは
  // 同一ソースの重複。直近変化は trend_recent カテゴリに一本化し、直近の寄与を厚くする。
  // 急(|Δ|≥6)と連続(2期連続|Δ|≥2)は同重み±3、通常の上昇/下降は±2。
  // ※ trend_recent の分類は「連続 > 急 > 通常」の優先で、連続が急を上書きする。
  // Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）
  const TREND_RECENT_SCORE = {
    "急上昇": 3, "連続上昇": 3, "上昇": 2,
    "急落": -3, "連続下降": -3, "下降": -2,
    "横ばい": 0
  };
  const trScore = TREND_RECENT_SCORE[trendRecent] || 0;
  if (trScore > 0) {
    pos += trScore;
  } else if (trScore < 0) {
    neg += -trScore;
  }

  // --- big_change ---
  // Report stores "増加変化大" (positive) or "減少変化大" (negative); direction is already encoded.
  const changeTag = rating.big_change || "";
  if (changeTag === "増加変化大") {
    pos += 1;
  } else if (changeTag === "減少変化大") {
    neg += 1;
  }

  // --- stability_6: 個人内基準の大変動（"不安定" / "やや不安定"）→ 方向不問で neg +1 ---
  //     Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）
  if (["不安定", "やや不安定"].includes(rating.stability_6 || "")) {
    neg += 1;
  }

  // --- volatility_6_p90: "波動あり"（個人内基準の反復的変動）→ 方向不問で neg +1 ---
  //     中期指標のため短期判断を埋もれさせないよう +1（stability_6 と同重み）。
  //     Playbook/we_analyzer.py の calculate_intervention_priority と完全同期（we-system Section 3）
  if ((rating.volatility_6_p90 || "") === "波動あり") {
    neg += 1;
  }

  // --- E_delta_1_std_12 の段階スコアは廃止 ---
  // E_delta_1_std = E_delta_1 / stdNorm は trend_recent と同じ「今月の変化」を別正規化した
  // だけで重複するため、直近変化を trend_recent に一本化した際に削除した。
  // （個人内基準の単月変化は big_change が neg/pos ±1 で拾う）
  // Playbook/we_analyzer.py と完全同期（we-system Section 3）

  // --- E_slope_6_std_12 (tiered score, sign determines neg/pos) ---
  const eSlopeStd12 = rating.e_slope_6_std_12;
  const SLOPETIERS = [
    [0.25, 0.50, 1],
    [0.50, 1.00, 2],
    [1.00, 1.50, 3],
    [1.50, Infinity, 4]
  ];
  if (eSlopeStd12 !== "" && eSlopeStd12 != null) {
    const tier = getTieredScore(Math.abs(eSlopeStd12), SLOPETIERS);
    if (eSlopeStd12 < 0) {
      neg += tier;
    } else if (eSlopeStd12 > 0) {
      pos += tier;
    }
  }

  // --- 直近3ヶ月トレンド ---
  const eSlope3m = rating.e_slope_3m;
  const TREND_SLOPE_3M = 5.0;  // matches TREND_SLOPE_3M in we_analyzer.py / evaluate.gs
  if (eSlope3m !== "" && eSlope3m != null) {
    if (eSlope3m <= -TREND_SLOPE_3M) {
      neg += 1;
    } else if (eSlope3m >= TREND_SLOPE_3M) {
      pos += 1;
    }
  }

  // --- flag_constant_6m ---
  // 調査抵抗疑義（中期指標）。多くが毎月候補に出続けるのを避けるため引き下げ。
  // Playbook/we_analyzer.py の _FLAG_CONSTANT_POINTS と完全同期（we-system Section 3）
  const flagConstantPoints = { "LOW_FIXED": 2, "MID_EVASION": 1, "HIGH_AVOIDANCE": 1, "FIX_SHIFTED": 3 };
  neg += flagConstantPoints[rating.flag_constant_6m] || 0;

  return { neg, pos };
}

function createEvaluationMasterToBeAdded(evaluationToBeAppended, rating, member) {
  const record = [
    rating.year,              // 0
    rating.month,             // 1
    rating.day,               // 2
    rating.date,              // 3
    rating.address,           // 4
    member.alternativeName,   // 5
    member.division,          // 6
    member.division,          // 7 - current_division
    member.department,        // 8
    member.department,        // 9 - current_department
    member.section,           // 10
    member.section,           // 11 - current_section
    member.team,              // 12
    member.team,              // 13 - current_team
    member.project,           // 14
    member.project,           // 15 - current_project
    member.grade,             // 16
    getEngagementCategory(rating.engagement),  // 17 - evaluation factor
    rating.engagement / MaxValueEngagement * MaxScale  // 18 - engagement score
  ];

  evaluationToBeAppended.push(record);
}

function getEngagementCategory(engagement) {
  if (engagement >= EngagementCriteriaHigh) return "高い";
  if (engagement <= EngagementCriteriaLow) return "低い";
  return "中間";
}

const RATING2_HEADERS = [
  "year", "month", "day", "date", "mail_address",
  "name", "division", "current_division",
  "department", "current_department",
  "section", "current_section",
  "team", "current_team",
  "project", "current_project",
  "grade",
  "engagement_rating", "vigor_rating", "dedication_rating", "absorption_rating",
  "level", "trend_base", "trend_recent", "trend_refined",
  "big_change", "stability_6",
  "direction_6_p90", "volatility_6_p90",         // col 27-28: stability_6 の直後（個人内変動指標を安定性と隣接させる）
  "intervention_priority_neg", "intervention_priority_pos",   // col 29-30 (was 27-28)
  "strength_short", "weakness_short", "strength_mid", "weakness_mid",  // col 31-34 (was 29-32)
  "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",          // col 35-37 (was 33-35)
  "E_slope_6", "E_slope_6_std_12",                            // col 38-39 (was 36-37)
  "E_slope_3m",                                               // col 40 (was 38)
  "V_delta_1", "D_delta_1", "A_delta_1",                      // col 41-43 (unchanged)
  "V_slope_6", "D_slope_6", "A_slope_6",                      // col 44-46 (unchanged)
  "flag_constant_6m"                                          // col 47 (unchanged)
];

function ensureRating2Headers() {
  const sheet = RatingMasterSheet2;
  const maxCols = sheet.getMaxColumns();
  if (RATING2_HEADERS.length > maxCols) {
    sheet.insertColumnsAfter(maxCols, RATING2_HEADERS.length - maxCols);
  }
  sheet.getRange(1, 1, 1, RATING2_HEADERS.length).setValues([RATING2_HEADERS]);
}

function addToMasterRatingSheets(masterData) {
  addDataToSheet(RatingMasterSheet, masterData.ratings);
  ensureRating2Headers();
  addDataToSheet(RatingMasterSheet2, masterData.ratings2);
  addDataToSheet(EvaluationMasterSheet, masterData.evaluations);
}

function addDataToSheet(sheet, data) {
  if (data.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
  }
}
