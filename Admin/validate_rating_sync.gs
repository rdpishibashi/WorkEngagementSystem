/**
 * Validation utility to ensure rating sheet and individual sheets are in sync
 *
 * This helps detect when analysis results differ between the rating sheet
 * and individual sheets, which can cause incorrect data in EngagementMasterSS.
 */

/**
 * Validate that all individual sheets match the rating sheet
 *
 * @param {number} year - Year to validate (optional, defaults to current)
 * @param {number} month - Month to validate (optional, defaults to current)
 * @param {boolean} autoFix - If true, automatically fix mismatches by copying from individual to rating sheet
 * @returns {Object} Validation report with mismatches found
 */
function validateRatingSync(year = null, month = null, autoFix = false) {
  // Use current month if not specified
  if (year === null || month === null) {
    const { year: currentYear, month: currentMonth } = getCurrentDayParts(new Date());
    year = year || currentYear;
    month = month || currentMonth;
  }

  console.log(`\n=== Validating Rating Sync for ${year}-${month} ===`);
  console.log(`Auto-fix mode: ${autoFix ? 'ON' : 'OFF'}\n`);

  const memberList = getMemberList();
  const ratingData = RatingSheet.getDataRange().getValues();
  const ratingHeader = ratingData[0];

  const report = {
    year: year,
    month: month,
    totalChecked: 0,
    mismatches: [],
    fixed: [],
    errors: []
  };

  // Fields to compare (analysis results only, skip base data)
  const fieldsToCompare = [
    { name: 'level', ratingCol: ColumnRatingLevel },
    { name: 'trend_base', ratingCol: ColumnRatingTrendBase },
    { name: 'trend_recent', ratingCol: ColumnRatingTrendRecent },
    { name: 'trend_refined', ratingCol: ColumnRatingTrendRefined },
    { name: 'big_change', ratingCol: ColumnRatingBigChange },
    { name: 'stability_6', ratingCol: ColumnRatingStability6 },
    { name: 'direction_6_p90', ratingCol: ColumnRatingDirection6P90 },
    { name: 'volatility_6_p90', ratingCol: ColumnRatingVolatility6P90 },
    { name: 'E_delta_1', ratingCol: ColumnRatingE_Delta1 },
    { name: 'E_delta_1_prev', ratingCol: ColumnRatingE_Delta1Prev },
    { name: 'E_delta_1_std_12', ratingCol: ColumnRatingE_Delta1Std12 },
    { name: 'E_slope_6', ratingCol: ColumnRatingE_Slope6 },
    { name: 'E_slope_6_std_12', ratingCol: ColumnRatingE_Slope6Std12 },
    { name: 'V_delta_1', ratingCol: ColumnRatingV_Delta1 },
    { name: 'D_delta_1', ratingCol: ColumnRatingD_Delta1 },
    { name: 'A_delta_1', ratingCol: ColumnRatingA_Delta1 },
    { name: 'V_slope_6', ratingCol: ColumnRatingV_Slope6 },
    { name: 'D_slope_6', ratingCol: ColumnRatingD_Slope6 },
    { name: 'A_slope_6', ratingCol: ColumnRatingA_Slope6 }
  ];

  // Check each member
  memberList.forEach(member => {
    const address = member.address;
    const name = member.name;

    // Skip header row
    if (!address || address === 'mail address') return;

    // Get individual sheet
    const individualSheet = RatingSS.getSheetByName(name);
    if (!individualSheet) {
      // No individual sheet exists - this is OK, might be a new member
      return;
    }

    // Get individual sheet data
    const individualData = individualSheet.getDataRange().getValues();
    if (individualData.length < 2) {
      // No data in individual sheet
      return;
    }

    // Find the target year/month row in individual sheet
    const individualRow = individualData.find(row =>
      row[ColumnYear] === year && row[ColumnMonth] === month
    );

    if (!individualRow) {
      // No data for this year/month in individual sheet
      return;
    }

    // Find corresponding row in rating sheet
    const ratingRowIndex = ratingData.findIndex((row, idx) =>
      idx > 0 && // Skip header
      row[ColumnYear] === year &&
      row[ColumnMonth] === month &&
      row[ColumnAddress] === address
    );

    if (ratingRowIndex === -1) {
      report.errors.push({
        member: name,
        address: address,
        issue: `Found in individual sheet but not in rating sheet for ${year}-${month}`
      });
      return;
    }

    const ratingRow = ratingData[ratingRowIndex];
    report.totalChecked++;

    // Compare each field
    const fieldMismatches = [];
    fieldsToCompare.forEach(field => {
      const individualValue = individualRow[field.ratingCol];
      const ratingValue = ratingRow[field.ratingCol];

      // Normalize values for comparison (handle null, undefined, empty string, 0)
      const normalizedIndividual = normalizeValue(individualValue);
      const normalizedRating = normalizeValue(ratingValue);

      if (normalizedIndividual !== normalizedRating) {
        fieldMismatches.push({
          field: field.name,
          individualValue: individualValue,
          ratingValue: ratingValue
        });
      }
    });

    if (fieldMismatches.length > 0) {
      const mismatch = {
        member: name,
        address: address,
        yearMonth: `${year}-${month}`,
        ratingRowNumber: ratingRowIndex + 1, // +1 for 1-based row number
        fields: fieldMismatches
      };

      report.mismatches.push(mismatch);

      console.log(`❌ MISMATCH: ${name} (${address})`);
      fieldMismatches.forEach(fm => {
        console.log(`   ${fm.field}: individual="${fm.individualValue}" vs rating="${fm.ratingValue}"`);
      });

      // Auto-fix if enabled
      if (autoFix) {
        const success = fixMismatch(individualRow, ratingRowIndex + 1, fieldsToCompare);
        if (success) {
          report.fixed.push(mismatch);
          console.log(`   ✓ Fixed by copying from individual sheet to rating sheet`);
        } else {
          console.log(`   ✗ Failed to fix`);
        }
      }
    }
  });

  // Print summary
  console.log(`\n=== Validation Summary ===`);
  console.log(`Total members checked: ${report.totalChecked}`);
  console.log(`Mismatches found: ${report.mismatches.length}`);
  console.log(`Errors: ${report.errors.length}`);

  if (autoFix) {
    console.log(`Fixed: ${report.fixed.length}`);
  }

  if (report.mismatches.length === 0 && report.errors.length === 0) {
    console.log(`✓ All individual sheets match rating sheet!`);
  }

  return report;
}

/**
 * Normalize a value for comparison
 * Treats null, undefined, empty string, and 0 as equivalent empty values
 */
function normalizeValue(value) {
  if (value === null || value === undefined || value === '' || value === 0) {
    return '';
  }
  // For numbers, keep precision to avoid floating point comparison issues
  if (typeof value === 'number') {
    return Number(value.toFixed(10));
  }
  return value;
}

/**
 * Fix a mismatch by copying data from individual sheet to rating sheet
 */
function fixMismatch(individualRow, ratingRowNumber, fieldsToCompare) {
  try {
    // Copy each field from individual to rating
    fieldsToCompare.forEach(field => {
      const value = individualRow[field.ratingCol];
      RatingSheet.getRange(ratingRowNumber, field.ratingCol + 1).setValue(value);
    });
    return true;
  } catch (error) {
    console.error(`Error fixing mismatch: ${error}`);
    return false;
  }
}

/**
 * Scan all recent months (last 6 months) for mismatches
 */
function scanRecentMonths(autoFix = false) {
  const { year: currentYear, month: currentMonth } = getCurrentDayParts(setResponseDate(new Date()));

  console.log(`\n=== Scanning Recent 6 Months ===\n`);

  const allReports = [];

  for (let i = 0; i < 6; i++) {
    let year = currentYear;
    let month = currentMonth - i;

    if (month <= 0) {
      month += 12;
      year--;
    }

    const report = validateRatingSync(year, month, autoFix);
    allReports.push(report);
  }

  // Overall summary
  const totalMismatches = allReports.reduce((sum, r) => sum + r.mismatches.length, 0);
  const totalFixed = allReports.reduce((sum, r) => sum + r.fixed.length, 0);

  console.log(`\n=== Overall Summary ===`);
  console.log(`Total mismatches across all months: ${totalMismatches}`);
  if (autoFix) {
    console.log(`Total fixed: ${totalFixed}`);
  }

  return allReports;
}
