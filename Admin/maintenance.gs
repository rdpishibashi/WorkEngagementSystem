//
// Delete specified year-month records in all sheets in EngagementMasterSS
//
function deleteSpecifiedWavesData() {
  const year = 2026;
  const month = 4;
  _deleteMonthData(year, month);
}

//
// Update rating2 sheet headers to match current record structure.
// Safe to run at any time — only touches the header row (row 1).
//
function updateRating2Headers() {
  ensureRating2Headers();
  console.log("rating2 headers updated: " + RATING2_HEADERS.length + " columns");
}

//
// Check for mismatches between the rating and the individual sheets
//

// Validate the most recent month
function validateCurrentMonth(autoFix = false) {
  let { year, month } = getCurrentDayParts(new Date());

  // Get previous month since measurement is done in previous month
  if (month === 1) {
    month = 12;
    year--;
  } else {
    month--;
  }

  return validateRatingSync(year, month, autoFix);
}

// Validate (set false), or Auto-fix (set true) specific month
function validateMonth() {
  const year = 2025;
  const month = 12;
  const autoFix = true;
  validateRatingSync(year, month, autoFix);
}

// Scan recent 6-month mismatches (false: only scan, true: scan and fix)
function validateRecent() {
  const autoFix = false;
  scanRecentMonths(autoFix);
}

//
// Create a spreadsheet for the individual incorporating the recorded engagement data.
//
function makeIndividualSheet() {
  const address = "ryousuke_fukaya@ulvac.com";
  const responseDate = setResponseDate(new Date("2026-02-28"));
  const startDate = DateUtil.getMonthsOffsetDate(responseDate, -AnalysisPeriod + 1);
  _rebuildIndividualSheetInternal(address, startDate, AnalysisPeriod);
}

//
// Re-calculate the evaluations in the "Rating" and "Individual" sheets for this month 
// using the data from the "Rating" sheet.
//
function remakeAllEvaluations() {
  const startDate = new Date("2024-3-22");
  const normalizedStart = setResponseDate(startDate);

  const ratings = RatingSheet.getDataRange().getValues();
  if (ratings.length <= 1) {
    Logger.log("No rating data found.");
    return;
  }

  Members.slice(1).forEach(member => {
    const address = member[ColumnMemberAddress];
    if (!address) {
      return;
    }

    const matches = [];
    for (let i = 1; i < ratings.length; i++) {
      const row = ratings[i];
      if (row[ColumnAddress] !== address) {
        continue;
      }
      const recordDate = row[ColumnDate];
      if (recordDate instanceof Date && setResponseDate(recordDate) >= normalizedStart) {
        matches.push({ row, sheetRow: i + 1 });
      }
    }

    if (!matches.length) {
      Logger.log(`${member[ColumnMemberName]} has no valid ratings in the specified period.`);
      return;
    }

    const latest = matches[matches.length - 1];
    const latestDate = latest.row[ColumnDate];
    const periodStart = DateUtil.getMonthsOffsetDate(
      setResponseDate(latestDate),
      -AnalysisPeriod + 1
    );

    const engagementStatus = _rebuildIndividualSheetInternal(
      address,
      periodStart,
      AnalysisPeriod,
      latest.sheetRow
    );

    if (!Object.keys(engagementStatus).length) {
      Logger.log(`${member[ColumnMemberName]} can't be calculated.`);
      return;
    }

    Logger.log(
      `${member[ColumnMemberName]} : ${engagementStatus.engagement}, ${engagementStatus.vigor}, ${engagementStatus.dedication}, ${engagementStatus.absorption}`
    );
  });
}


// =============================================================================
// EngagementMasterAll Sync & Maintenance
// =============================================================================

/**
 * Sync data from EngagementMasterSS to EngagementMasterAll.
 * Appends only year-months that do not already exist in All.
 * After appending, updates organization data on All sheets.
 */
function syncToEngagementMasterAll() {
  _syncSheetToAll(RatingMasterSheet2, RatingMasterAllSheet2, "rating2");
  _syncSheetToAll(CommentMasterSheet, CommentMasterAllSheet, "comment");

  // Update current_* columns on the newly appended data
  const memberList = getMemberList();
  console.log("Updating organization data on EngagementMasterAll...");
  const columnMap = {
    address: ColumnAddress,
    name: ColumnName,
    division: ColumnCurrentDivision,
    department: ColumnCurrentDepartment,
    section: ColumnCurrentSection,
    team: ColumnCurrentTeam,
    project: ColumnCurrentProject,
    grade: ColumnGrade
  };
  updateAttributes(RatingMasterAllSheet2, memberList, columnMap);
  updateAttributes(CommentMasterAllSheet, memberList, columnMap);
  console.log("EngagementMasterAll sync completed.");
}

/**
 * EngagementMasterSS の rating2 シートを「全データ」再構築する。
 *
 * 用途:
 *   direction_6_p90 / volatility_6_p90 の追加と E_slope_3m の列移動により、
 *   updateMaster で更新済みの最新月以外（過去月）の行が旧カラム構成のまま残る問題を解消する。
 *   RatingSS の rating シート（recalculateRatingSheet 実行済み・全波形・新カラム）を正として、
 *   全 (year, month) × 全メンバーの rating2 行を新レイアウト（48列）で作り直す。
 *
 * 前提:
 *   - 先に Report 側で recalculateRatingSheet() を実行し、RatingSS の rating シートが
 *     新カラム順・全波形で最新化されていること（本関数は rating シートのみを参照し、
 *     個人シートには依存しない）。
 *   - 介入優先度は createRating2MasterToBeAdded → calculateInterventionPriority により
 *     新ロジック（stability_6=不安定 +1 / volatility_6_p90=波動あり +2）で再計算される。
 *
 * 注意:
 *   - rating2 の既存データを全削除して書き直す破壊的操作。実行前に EngagementMasterSS の
 *     バックアップ（rating2 のコピー）を推奨。
 *   - rating / evaluation / comment シートは変更しない（rating2 のみ）。
 */
function rebuildAllRating2() {
  const memberList = getMemberList();

  // 1. RatingSS rating シートから全 (year, month) を時系列で収集
  const ratingValues = RatingSheet.getDataRange().getValues();
  const waveSet = {};
  ratingValues.slice(1).forEach(row => {
    const y = row[ColumnYear];
    const m = row[ColumnMonth];
    if (y !== "" && y != null && m !== "" && m != null) {
      waveSet[`${y}-${m}`] = { year: y, month: m };
    }
  });
  const waves = Object.values(waveSet).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  console.log(`rebuildAllRating2: ${waves.length} 波形を再構築します`);

  // 2. 全波形の rating2 レコードを updateMaster と同一ロジックで構築
  const ratings2 = [];
  waves.forEach(({ year, month }) => {
    const ratingsData = getRatingsData(year, month);
    const flagMap = computeFlagConstant6mMap(year, month);
    ratingsData.forEach(rating => {
      rating.flag_constant_6m = flagMap[rating.address] || "";
      const member = memberList.find(m => m.address === rating.address);
      if (member) {
        createRating2MasterToBeAdded(ratings2, rating, member);
      }
    });
    console.log(`  ${year}-${month}: 累計 ${ratings2.length} 件`);
  });

  // 3. 新ヘッダーを確定し、既存データ行を全消去して一括書き込み
  ensureRating2Headers();
  const sheet = RatingMasterSheet2;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
  }
  if (ratings2.length > 0) {
    sheet.getRange(2, 1, ratings2.length, ratings2[0].length).setValues(ratings2);
  }
  console.log(`rebuildAllRating2: rating2 に ${ratings2.length} 行を書き込みました`);

  // 4. current_* 等の組織属性を更新（updateMaster と同じ後処理）
  console.log("Updating organization attributes...");
  updateOrganizationData(memberList);
  console.log("rebuildAllRating2 完了");
}

/**
 * EngagementMasterAllSS の rating2（アーカイブ・全期間）を最新48列フォーマットで全指標を
 * 再計算して上書きする。raw 測定値のみで指標列が空の古いデータ（2023-2024）を含め、
 * 全行を因果的に再計算し direction_6_p90 / volatility_6_p90 まで揃える。
 *
 * 【依存・前提】
 *   - 分析エンジンは Report を GAS ライブラリ参照（識別子 `ReportEngine`）して
 *     `ReportEngine.analyzeEngagement(rows)` を使用する。
 *     → Admin の「ライブラリ」に Report のスクリプトIDを追加し、識別子を ReportEngine に設定すること。
 *     → ライブラリの Report は direction_6_p90 / volatility_6_p90 を含む最新版を公開しておくこと。
 *   - 介入優先度は Admin 純正 `calculateInterventionPriority` を再利用。
 *   - flag_constant_6m は本ファイルの `_flagConstantForSeries`（computeFlagConstant6mMap と同ロジック）で算出。
 *   - 識別・組織列（year〜grade, current_*）と raw 測定値（*_rating）は既存値を保持し、指標列のみ再計算。
 *
 * 【注意】rating2 を全書き換えする破壊的操作。実行前に rating2 のバックアップ推奨。
 *         comment シートは変更しない。出力はメモリ上で全構築してから1回で書き込む
 *         （計算途中でタイムアウトしてもシートは無変更で安全）。
 */
function rebuildEngagementMasterAll() {
  const sheet = EngagementMasterAllSS.getSheetByName("rating2");
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) { console.log("rating2 にデータがありません"); return; }

  const header = data[0].map(h => String(h).trim());
  const col = {};
  header.forEach((h, i) => { col[h] = i; });

  const required = ["year", "month", "mail_address",
    "engagement_rating", "vigor_rating", "dedication_rating", "absorption_rating"];
  required.forEach(r => { if (!(r in col)) throw new Error(`rating2 に必須列 ${r} がありません`); });

  const rows = data.slice(1);

  // person ごとに分類（元の行インデックスを保持）
  const byAddress = {};
  rows.forEach((row, idx) => {
    const addr = row[col.mail_address];
    if (addr === "" || addr == null) return;
    (byAddress[addr] = byAddress[addr] || []).push({ row, idx });
  });

  // ReportEngine.analyzeEngagement が要求する入力ヘッダー
  const ANALYZE_HEADER = ["year", "month", "mail address",
    "engagement", "vigor", "dedication", "absorption"];
  const FLAG_POINTS = { LOW_FIXED: 3, MID_EVASION: 2, HIGH_AVOIDANCE: 2, FIX_SHIFTED: 4 };

  const outByIdx = {};
  let personCount = 0;

  Object.values(byAddress).forEach(entries => {
    // 年月で時系列ソート
    entries.sort((a, b) => {
      const ay = a.row[col.year], by = b.row[col.year];
      const am = a.row[col.month], bm = b.row[col.month];
      return ay !== by ? ay - by : am - bm;
    });

    const analyzeRows = entries.map(e => ([
      e.row[col.year], e.row[col.month], e.row[col.mail_address],
      e.row[col.engagement_rating], e.row[col.vigor_rating],
      e.row[col.dedication_rating], e.row[col.absorption_rating]
    ]));

    // 因果的に各行を分析（その時点までの履歴のみ）
    const results = entries.map((e, i) =>
      ReportEngine.analyzeEngagement([ANALYZE_HEADER].concat(analyzeRows.slice(0, i + 1))) || {}
    );

    // flag_constant_6m を全行ぶん算出
    const flags = _flagConstantForSeries(entries.map((e, i) => ({
      vigor: e.row[col.vigor_rating],
      dedication: e.row[col.dedication_rating],
      absorption: e.row[col.absorption_rating],
      level: results[i].level
    })));

    entries.forEach((e, i) => {
      const res = results[i];

      // 介入優先度（Admin 純正）。analyzeEngagement 結果を rating オブジェクトにマップ
      const ip = calculateInterventionPriority({
        trend_base: res.trend_base,
        e_delta_1: res.E_delta_1,
        e_delta_1_prev: res.E_delta_1_prev,
        big_change: res.big_change,
        stability_6: res.stability_6,
        volatility_6_p90: res.volatility_6_p90,
        e_delta_1_std_12: res.E_delta_1_std_12,
        e_slope_6_std_12: res.E_slope_6_std_12,
        e_slope_3m: res.E_slope_3m
      });
      const neg = ip.neg + (FLAG_POINTS[flags[i]] || 0);

      const src = e.row;
      const keep = (name) => (name in col ? src[col[name]] : "");
      const record = RATING2_HEADERS.map(h => {
        switch (h) {
          // Report 算出（分析指標）
          case "level": return res.level ?? "";
          case "trend_base": return res.trend_base ?? "";
          case "trend_recent": return res.trend_recent ?? "";
          case "trend_refined": return res.trend_refined ?? "";
          case "big_change": return res.big_change ?? "";
          case "stability_6": return res.stability_6 ?? "";
          case "strength_short": return res.strength_short ?? "";
          case "weakness_short": return res.weakness_short ?? "";
          case "strength_mid": return res.strength_mid ?? "";
          case "weakness_mid": return res.weakness_mid ?? "";
          case "E_delta_1": return res.E_delta_1 ?? "";
          case "E_delta_1_prev": return res.E_delta_1_prev ?? "";
          case "E_delta_1_std_12": return res.E_delta_1_std_12 ?? "";
          case "E_slope_6": return res.E_slope_6 ?? "";
          case "E_slope_6_std_12": return res.E_slope_6_std_12 ?? "";
          case "E_slope_3m": return res.E_slope_3m ?? "";
          case "direction_6_p90": return res.direction_6_p90 ?? "";
          case "volatility_6_p90": return res.volatility_6_p90 ?? "";
          case "V_delta_1": return res.V_delta_1 ?? "";
          case "D_delta_1": return res.D_delta_1 ?? "";
          case "A_delta_1": return res.A_delta_1 ?? "";
          case "V_slope_6": return res.V_slope_6 ?? "";
          case "D_slope_6": return res.D_slope_6 ?? "";
          case "A_slope_6": return res.A_slope_6 ?? "";
          // Admin 算出
          case "intervention_priority_neg": return neg;
          case "intervention_priority_pos": return ip.pos;
          case "flag_constant_6m": return flags[i] || "";
          // 識別・組織・raw 測定値は既存値を保持
          default: return keep(h);
        }
      });
      outByIdx[e.idx] = record;
    });
    personCount++;
  });

  // 元の行順を維持して出力配列を構築
  const output = rows.map((row, idx) =>
    outByIdx[idx] || RATING2_HEADERS.map(h => (h in col ? row[col[h]] : ""))
  );

  // ヘッダーを48列に確定 → 既存データ消去 → 一括書き込み
  const need = RATING2_HEADERS.length;
  if (sheet.getMaxColumns() < need) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), need - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, need).setValues([RATING2_HEADERS]);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
  }
  if (output.length > 0) {
    sheet.getRange(2, 1, output.length, need).setValues(output);
  }
  console.log(`rebuildEngagementMasterAll 完了: ${personCount}名 / ${output.length}行を48列で再構築`);
}

// 個人の時系列(vigor/dedication/absorption/level)から各行の flag_constant_6m を算出する。
// Admin の computeFlagConstant6mMap と同一ロジック（v==d==a の3か月連続＋level、FIX_SHIFTED 含む）を
// 全行ぶん返す（AllSS 全期間再構築用）。
function _flagConstantForSeries(waves) {
  const ESTABLISHED = new Set(["LOW_FIXED", "MID_EVASION", "HIGH_AVOIDANCE"]);
  const n = waves.length;

  const fixedVals = waves.map(w => {
    const v = w.vigor, d = w.dedication, a = w.absorption;
    if (v !== "" && v != null && d !== "" && d != null && a !== "" && a != null
        && v === d && d === a) return v;
    return null;
  });

  const prelim = waves.map((w, i) => {
    if (i < 2) return "";
    const win = [fixedVals[i - 2], fixedVals[i - 1], fixedVals[i]];
    if (win.some(v => v === null) || !(win[0] === win[1] && win[1] === win[2])) return "";
    const lv = w.level;
    if (lv === "Critical" || lv === "Low") return "LOW_FIXED";
    if (lv === "Moderate") return "MID_EVASION";
    if (lv === "High" || lv === "Thriving") return "HIGH_AVOIDANCE";
    return "";
  });

  const flags = [];
  for (let i = 0; i < n; i++) {
    if (!ESTABLISHED.has(prelim[i])) { flags.push(prelim[i]); continue; }
    const currentFixed = fixedVals[i];
    const isThirdMonth = (i < 3) || (fixedVals[i - 3] !== currentFixed);
    if (isThirdMonth) {
      let isShifted = false;
      for (let j = i - 3; j >= 0; j--) {
        if (ESTABLISHED.has(prelim[j]) && fixedVals[j] !== currentFixed) { isShifted = true; break; }
      }
      flags.push(isShifted ? "FIX_SHIFTED" : prelim[i]);
    } else {
      flags.push(prelim[i]);
    }
  }
  return flags;
}

// Person Master Sheet

/**
 * Headers for the person_master sheet.
 */
const PERSON_MASTER_HEADERS = [
  "mail_address", "name", "division", "department", "section",
  "team", "project", "grade", "status", "is_active", "last_measured_date"
];

/**
 * Update person_master in EngagementMasterSS.
 */
function updatePersonMasterSheet() {
  _writePersonMasterSheet(RatingMasterSheet2, EngagementMasterSS);
}

/**
 * Update person_master in EngagementMasterAll.
 */
function updatePersonMasterAllSheet() {
  _writePersonMasterSheet(RatingMasterAllSheet2, EngagementMasterAllSS);
}

// =============================================================================
// Helper Functions (prefixed with _ to hide from GAS Run dropdown)
// =============================================================================

/**
 * Delete existing data for a specific year/month from ALL 4 master sheets.
 * Use this before re-running updateMaster() to avoid duplicates.
 */
function _deleteMonthData(year, month) {
  _deleteMonthFromSheet(RatingMasterSheet, year, month, "rating");
  _deleteMonthFromSheet(RatingMasterSheet2, year, month, "rating2");
  _deleteMonthFromSheet(EvaluationMasterSheet, year, month, "evaluation");
  _deleteMonthFromSheet(CommentMasterSheet, year, month, "comment");
}

function _deleteMonthFromSheet(sheet, year, month, sheetName) {
  const data = sheet.getDataRange().getValues();
  const header = data[0];

  console.log(`Checking ${sheetName} sheet for ${year}-${month}...`);

  const filteredData = data.slice(1).filter(row => {
    return !(row[ColumnYear] === year && row[ColumnMonth] === month);
  });

  const deletedCount = data.length - 1 - filteredData.length;

  if (deletedCount === 0) {
    console.log(`  No ${year}-${month} records found in ${sheetName}`);
    return;
  }

  console.log(`  Found ${deletedCount} records to delete from ${sheetName}`);

  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  if (filteredData.length > 0) {
    sheet.getRange(2, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
  }

  console.log(`  Deleted ${deletedCount} rows from ${sheetName}`);
}

/**
 * Rebuild an individual member's sheet from RatingSheet data.
 */
function _rebuildIndividualSheetInternal(address, startDate, period, ratingRowNumber = null) {
  const ratings = RatingSheet.getDataRange().getValues();
  if (ratings.length <= 1) {
    return {};
  }

  const header = ratings[0];
  const rows = ratings.slice(1).map((row, idx) => ({
    row,
    sheetRow: idx + 2,
  })).filter(item => item.row[ColumnAddress] === address);

  if (!rows.length) {
    return {};
  }

  const filteredRows = rows.filter(item => {
    const recordDate = item.row[ColumnDate];
    return recordDate instanceof Date && setResponseDate(recordDate) >= startDate;
  });

  if (!filteredRows.length) {
    return {};
  }

  const member = Members.find(m => m[ColumnMemberAddress] === address);
  const sheetName = member ? member[ColumnMemberName] : address;
  let sheet = RatingSS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = RatingSS.insertSheet(sheetName);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet
    .getRange(2, 1, filteredRows.length, filteredRows[0].row.length)
    .setValues(filteredRows.map(item => item.row));

  const latestRow = filteredRows[filteredRows.length - 1].row;
  const engagementStatus = {
    engagement: latestRow[ColumnRatingEngagement],
    vigor: latestRow[ColumnRatingVigor],
    dedication: latestRow[ColumnRatingDedication],
    absorption: latestRow[ColumnRatingAbsorption],
  };

  _updateEngagementStatus(sheet, engagementStatus, sheet.getLastRow());

  if (ratingRowNumber !== null) {
    _updateEngagementStatus(RatingSheet, engagementStatus, ratingRowNumber);
  }

  return engagementStatus;
}

/**
 * Append rows from a source sheet to a target sheet,
 * skipping year-months that already exist in the target.
 */
function _syncSheetToAll(sourceSheet, targetSheet, sheetName) {
  const sourceData = sourceSheet.getDataRange().getValues();
  const targetData = targetSheet.getDataRange().getValues();

  if (sourceData.length <= 1) {
    console.log(`${sheetName}: No source data to sync.`);
    return;
  }

  const sourceHeader = sourceData[0];
  const targetHeader = targetData[0];
  const sourceRows = sourceData.slice(1);
  const targetRows = targetData.length > 1 ? targetData.slice(1) : [];

  // Build set of existing year-month keys in target
  const existingKeys = new Set();
  targetRows.forEach(row => {
    const key = `${row[ColumnYear]}-${row[ColumnMonth]}`;
    existingKeys.add(key);
  });

  // Filter source rows to only include new year-months
  const newRows = sourceRows.filter(row => {
    const key = `${row[ColumnYear]}-${row[ColumnMonth]}`;
    return !existingKeys.has(key);
  });

  if (newRows.length === 0) {
    console.log(`${sheetName}: No new data to append.`);
    return;
  }

  // Ensure target has headers (if empty sheet)
  if (targetData.length <= 1 && targetRows.length === 0) {
    targetSheet.getRange(1, 1, 1, sourceHeader.length).setValues([sourceHeader]);
  }

  // Ensure column count matches — pad or trim new rows to target header width
  const targetWidth = targetHeader.length > 0 ? targetHeader.length : sourceHeader.length;
  const paddedRows = newRows.map(row => {
    if (row.length >= targetWidth) {
      return row.slice(0, targetWidth);
    }
    return [...row, ...Array(targetWidth - row.length).fill("")];
  });

  // Append new rows
  const startRow = targetSheet.getLastRow() + 1;
  targetSheet.getRange(startRow, 1, paddedRows.length, targetWidth).setValues(paddedRows);

  // Log summary of appended months
  const addedMonths = new Set();
  newRows.forEach(row => addedMonths.add(`${row[ColumnYear]}-${String(row[ColumnMonth]).padStart(2, '0')}`));
  console.log(`${sheetName}: Appended ${newRows.length} rows for months: ${[...addedMonths].sort().join(', ')}`);
}

/**
 * Generate/update the person_master sheet in a given spreadsheet.
 * Uses MemberSS for member data and the rating2 sheet for last_measured_date.
 *
 * @param {Sheet} rating2Sheet - The rating2 sheet to derive last_measured_date from
 * @param {Spreadsheet} targetSS - The spreadsheet to write person_master to
 */
function _writePersonMasterSheet(rating2Sheet, targetSS) {
  const memberList = getMemberList();

  // Build last_measured_date map from rating2
  const rating2Data = rating2Sheet.getDataRange().getValues();
  const lastMeasuredMap = {};
  for (let i = 1; i < rating2Data.length; i++) {
    const row = rating2Data[i];
    const address = row[ColumnAddress];
    const date = row[ColumnDate];
    if (address && date instanceof Date) {
      if (!lastMeasuredMap[address] || date > lastMeasuredMap[address]) {
        lastMeasuredMap[address] = date;
      }
    }
  }

  // Build person_master rows
  const rows = memberList.map(member => {
    let status = "active";
    if (member.leave === "leave") {
      status = "leave";
    } else if (member.leave === "absence") {
      status = "absence";
    }
    const isActive = (status !== "leave");
    const lastMeasured = lastMeasuredMap[member.address] || "";

    return [
      member.address,
      member.alternativeName || member.name,
      member.division || "",
      member.department || "",
      member.section || "",
      member.team || "",
      member.project || "",
      member.grade || "",
      status,
      isActive,
      lastMeasured
    ];
  });

  // Write to person_master sheet (create if not exists)
  let sheet = targetSS.getSheetByName("person_master");
  if (!sheet) {
    sheet = targetSS.insertSheet("person_master");
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, PERSON_MASTER_HEADERS.length).setValues([PERSON_MASTER_HEADERS]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, PERSON_MASTER_HEADERS.length).setValues(rows);
  }

  console.log(`person_master: ${rows.length} members written (${rows.filter(r => r[9]).length} active).`);
}


function _updateEngagementStatus(sheet, engagementStatus, row = null) {
  if (!engagementStatus || !sheet) {
    return;
  }

  const targetRow = row || sheet.getLastRow();
  if (!targetRow) {
    return;
  }

  const values = [
    engagementStatus.engagement ?? "",
    engagementStatus.vigor ?? "",
    engagementStatus.dedication ?? "",
    engagementStatus.absorption ?? "",
  ];

  sheet
    .getRange(targetRow, ColumnRatingEngagement + 1, 1, values.length)
    .setValues([values]);
}
