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
    V_deltaP10: row[ColumnRatingV_DeltaP10],
    D_deltaP10: row[ColumnRatingD_DeltaP10],
    A_deltaP10: row[ColumnRatingA_DeltaP10],
    V_deltaP90: row[ColumnRatingV_DeltaP90],
    D_deltaP90: row[ColumnRatingD_DeltaP90],
    A_deltaP90: row[ColumnRatingA_DeltaP90],
    V_deltaZ: row[ColumnRatingV_DeltaZ],
    D_deltaZ: row[ColumnRatingD_DeltaZ],
    A_deltaZ: row[ColumnRatingA_DeltaZ],
    V_slopeP10: row[ColumnRatingV_SlopeP10],
    D_slopeP10: row[ColumnRatingD_SlopeP10],
    A_slopeP10: row[ColumnRatingA_SlopeP10],
    V_slopeP90: row[ColumnRatingV_SlopeP90],
    D_slopeP90: row[ColumnRatingD_SlopeP90],
    A_slopeP90: row[ColumnRatingA_SlopeP90],
    V_slopeZ: row[ColumnRatingV_SlopeZ],
    D_slopeZ: row[ColumnRatingD_SlopeZ],
    A_slopeZ: row[ColumnRatingA_SlopeZ],
    E_momentum_3: row[ColumnRatingE_Momentum3],
    E_delta_1: row[ColumnRatingE_Delta1],
    E_delta_1_prev: row[ColumnRatingE_Delta1Prev],
    E_mean_6: row[ColumnRatingE_Mean6],
    E_std_6: row[ColumnRatingE_Std6],
    E_slope_12: row[ColumnRatingE_Slope12],
    E_slope_6: row[ColumnRatingE_Slope6],
    E_accel_6: row[ColumnRatingE_Accel6],
    V_delta_1: row[ColumnRatingV_Delta1],
    D_delta_1: row[ColumnRatingD_Delta1],
    A_delta_1: row[ColumnRatingA_Delta1],
    V_slope_6: row[ColumnRatingV_Slope6],
    D_slope_6: row[ColumnRatingD_Slope6],
    A_slope_6: row[ColumnRatingA_Slope6]
  })).filter(rating => rating.year === year && rating.month === month);
}

function createMasterDataToBeAdded(masterData, rating, member) {
  createRatingMasterToBeAdded(masterData.ratings, rating, member);
  createRating2MasterToBeAdded(masterData.ratings2, rating, member);
  createRating3MasterToBeAdded(masterData.ratings3, rating, member);
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
      rating.year,
      rating.month,
      rating.day,
      rating.date,
      rating.address,
      member.name,
      member.section,
      member.section,
      member.group,
      member.group,
      member.project,
      member.project,
      member.grade
    ];

    record[ColumnMasterFactor] = factor.name;
    record[ColumnMasterRating] = factor.value / factor.max * MaxScale;

    // Add slope_6 and delta_1 based on factor code
    const slope6Key = factor.code + "_slope_6";
    const delta1Key = factor.code + "_delta_1";
    record[ColumnMasterSlope6] = rating[slope6Key] || "";
    record[ColumnMasterDelta1] = rating[delta1Key] || "";

    // Add strength and weakness
    let strength = "";
    let weakness = "";
    let trendRefined = "";

    if (factor.code === "E") {
      // For Engagement factor, use trend_base, trend_recent, and trend_refined
      strength = rating.trend_base || "";
      weakness = rating.trend_recent || "";
      trendRefined = rating.trend_refined || "";
    } else {
      // For V, D, A factors, check if code exists in strength/weakness fields
      // strength_short and weakness_short are now in "V, D, A" format
      const code = factor.code;

      // Check strength_short and strength_mid (both can be true)
      const strengthParts = [];
      if (rating.strength_short && rating.strength_short.includes(code)) {
        strengthParts.push("short");
      }
      if (rating.strength_mid && rating.strength_mid.includes(code)) {
        strengthParts.push("mid");
      }
      strength = strengthParts.join(", ");

      // Check weakness_short and weakness_mid (both can be true)
      const weaknessParts = [];
      if (rating.weakness_short && rating.weakness_short.includes(code)) {
        weaknessParts.push("short");
      }
      if (rating.weakness_mid && rating.weakness_mid.includes(code)) {
        weaknessParts.push("mid");
      }
      weakness = weaknessParts.join(", ");
    }

    record[ColumnMasterStrength] = strength;
    record[ColumnMasterWeakness] = weakness;
    record[ColumnMasterTrendRefined] = trendRefined;

    ratingsToBeAppended.push(record);
  });
}

function createRating2MasterToBeAdded(ratings2ToBeAppended, rating, member) {
  const record = [
    rating.year,
    rating.month,
    rating.date,
    rating.address,
    member.name,
    member.section,
    member.group,
    member.project,
    member.grade,
    rating.engagement,
    rating.vigor,
    rating.dedication,
    rating.absorption
  ];
  ratings2ToBeAppended.push(record);
}

function createRating3MasterToBeAdded(ratings3ToBeAppended, rating, member) {
  const record = [
    rating.year,
    rating.month,
    rating.date,
    rating.address,
    member.name,
    member.section,
    member.group,
    member.project,
    member.grade,
    rating.level || "",
    rating.trend_base || "",
    rating.trend_recent || "",
    rating.trend_refined || "",
    rating.change_tag || "",
    rating.stability || "",
    rating.strength_short || "",
    rating.weakness_short || "",
    rating.strength_mid || "",
    rating.weakness_mid || "",
    rating.V_deltaP10 || "",
    rating.D_deltaP10 || "",
    rating.A_deltaP10 || "",
    rating.V_deltaP90 || "",
    rating.D_deltaP90 || "",
    rating.A_deltaP90 || "",
    rating.V_deltaZ || "",
    rating.D_deltaZ || "",
    rating.A_deltaZ || "",
    rating.V_slopeP10 || "",
    rating.D_slopeP10 || "",
    rating.A_slopeP10 || "",
    rating.V_slopeP90 || "",
    rating.D_slopeP90 || "",
    rating.A_slopeP90 || "",
    rating.V_slopeZ || "",
    rating.D_slopeZ || "",
    rating.A_slopeZ || "",
    rating.E_momentum_3 || "",
    rating.E_delta_1 || "",
    rating.E_delta_1_prev || "",
    rating.E_mean_6 || "",
    rating.E_std_6 || "",
    rating.E_slope_12 || "",
    rating.E_slope_6 || "",
    rating.E_accel_6 || "",
    rating.V_delta_1 || "",
    rating.D_delta_1 || "",
    rating.A_delta_1 || "",
    rating.V_slope_6 || "",
    rating.D_slope_6 || "",
    rating.A_slope_6 || ""
  ];
  ratings3ToBeAppended.push(record);
}

function createEvaluationMasterToBeAdded(evaluationToBeAppended, rating, member) {
  const record = [
    rating.year,
    rating.month,
    rating.day,
    rating.date,
    rating.address,
    member.name,
    member.section,
    member.section, // Current section
    member.group,
    member.group,   // Current group
    member.project,
    member.project, // Current project
    member.grade,
    getEngagementCategory(rating.engagement),
    rating.engagement / MaxValueEngagement * MaxScale,
    '' // Placeholder for evaluation, if needed
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
  addDataToSheet(RatingMasterSheet3, masterData.ratings3);
  addDataToSheet(EvaluationMasterSheet, masterData.evaluations);
}

function addDataToSheet(sheet, data) {
  if (data.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
  }
}
