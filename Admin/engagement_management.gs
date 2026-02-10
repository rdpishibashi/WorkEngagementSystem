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
    change_tag: row[ColumnRatingChangeTag],
    stability: row[ColumnRatingStability],
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
    a_slope_6: row[ColumnRatingA_Slope6]
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
    rating.change_tag || "",
    rating.stability || "",
    interventionPriority.neg,              // 27
    interventionPriority.pos,              // 28
    rating.strength_short || "",
    rating.weakness_short || "",
    rating.strength_mid || "",
    rating.weakness_mid || "",
    rating.e_delta_1 ?? "",
    rating.e_delta_1_prev ?? "",
    rating.e_delta_1_std_12 ?? "",
    rating.e_slope_6 ?? "",
    rating.e_slope_6_std_12 ?? "",
    rating.v_delta_1 ?? "",
    rating.d_delta_1 ?? "",
    rating.a_delta_1 ?? "",
    rating.v_slope_6 ?? "",
    rating.d_slope_6 ?? "",
    rating.a_slope_6 ?? ""
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
  const trendBase = rating.trend_base || "";
  if (trendBase === "低下中") {
    neg += 1;
  } else if (trendBase === "上昇中") {
    pos += 1;
  }

  // --- trend_recent ---
  const trendRecent = rating.trend_recent || "";
  const trendRecentNeg = { "急落": 2, "連続下降": 1 };
  const trendRecentPos = { "急上昇": 2, "連続上昇": 1 };
  neg += trendRecentNeg[trendRecent] || 0;
  pos += trendRecentPos[trendRecent] || 0;

  // --- Direction flag based on E_delta_1 sign ---
  const eDelta1 = rating.e_delta_1;
  const deltaNegative = eDelta1 !== "" && eDelta1 != null && eDelta1 < 0;
  const deltaPositive = eDelta1 !== "" && eDelta1 != null && eDelta1 > 0;

  // --- big_change (change_tag) ---
  const changeTag = rating.change_tag || "";
  if (changeTag === "変化大") {
    if (deltaNegative) {
      neg += 1;
    } else if (deltaPositive) {
      pos += 1;
    }
  }

  // --- big_change_abs (stability: "不安定" corresponds to "変化大") ---
  const stability = rating.stability || "";
  if (stability === "不安定") {
    if (deltaNegative) {
      neg += 1;
    } else if (deltaPositive) {
      pos += 1;
    }
  }

  // --- E_delta_1_std_12 (tiered score, sign determines neg/pos) ---
  const eDeltaStd12 = rating.e_delta_1_std_12;
  const deltaTiers = [
    [1.0, 2.0, 1],
    [2.0, 3.0, 2],
    [3.0, 4.0, 3],
    [4.0, Infinity, 4]
  ];
  if (eDeltaStd12 !== "" && eDeltaStd12 != null) {
    const tier = getTieredScore(Math.abs(eDeltaStd12), deltaTiers);
    if (eDeltaStd12 < 0) {
      neg += tier;
    } else if (eDeltaStd12 > 0) {
      pos += tier;
    }
  }

  // --- E_slope_6_std_12 (tiered score, sign determines neg/pos) ---
  const eSlopeStd12 = rating.e_slope_6_std_12;
  const slopeTiers = [
    [0.25, 0.50, 1],
    [0.50, 1.00, 2],
    [1.00, 1.50, 3],
    [1.50, Infinity, 4]
  ];
  if (eSlopeStd12 !== "" && eSlopeStd12 != null) {
    const tier = getTieredScore(Math.abs(eSlopeStd12), slopeTiers);
    if (eSlopeStd12 < 0) {
      neg += tier;
    } else if (eSlopeStd12 > 0) {
      pos += tier;
    }
  }

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

function addToMasterRatingSheets(masterData) {
  addDataToSheet(RatingMasterSheet, masterData.ratings);
  addDataToSheet(RatingMasterSheet2, masterData.ratings2);
  addDataToSheet(EvaluationMasterSheet, masterData.evaluations);
}

function addDataToSheet(sheet, data) {
  if (data.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
  }
}
