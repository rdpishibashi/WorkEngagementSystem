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
    interventionPriority,                 // 27
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
 * Calculate intervention priority score based on trend indicators
 *
 * @param {Object} rating - Rating object with trend_refined, trend_recent, and change_tag
 * @returns {number} Intervention priority score (0-8)
 */
function calculateInterventionPriority(rating) {
  let score = 0;

  // trend_refined scores
  const trendRefinedScores = {
    "低下加速": 5,
    "低下危機": 4,
    "悪化": 3,
    "低下警戒": 2,
    "低下懸念": 1,
    "上昇加速": 1,
    "復活": 2,
    "回復": 3
  };

  const trendRefined = rating.trend_refined || "";
  score += trendRefinedScores[trendRefined] || 0;

  // trend_recent scores
  const trendRecentScores = {
    "急落": 2,
    "連続下降": 1
  };

  const trendRecent = rating.trend_recent || "";
  score += trendRecentScores[trendRecent] || 0;

  // change_tag scores
  const changeTag = rating.change_tag || "";
  if (changeTag === "変化大") {
    score += 1;
  }

  return score;
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
