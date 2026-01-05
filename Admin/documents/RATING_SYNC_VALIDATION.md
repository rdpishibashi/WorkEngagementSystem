# Rating Sheet Sync Validation

## Problem

The rating sheet and individual sheets in RatingSS can get out of sync, causing incorrect data to be copied to EngagementMasterSS by `updateMaster()`.

**Root Cause:** The `makeIndividualSheet()` function (Report/make_individual.gs:70) should write analysis results to BOTH the individual sheet AND the rating sheet. If this write operation fails or if the rating sheet is manually edited, the sheets can become inconsistent.

## Solution

A new validation utility (`validate_rating_sync.gs`) has been created to:
1. Compare analysis fields between rating sheet and individual sheets
2. Detect mismatches
3. Optionally auto-fix by copying from individual sheets to rating sheet

## Usage

### Quick Check - Current Month

```javascript
// Just check for mismatches (no fixes)
validateCurrentMonth();
```

### Check Specific Month

```javascript
// Check 2025-12
validateRatingSync(2025, 12, false);
```

### Auto-Fix Specific Month

```javascript
// Check and fix 2025-12
validateRatingSync(2025, 12, true);

// Or use the convenience function
validateAndFix_2025_12();
```

### Scan Recent 6 Months

```javascript
// Scan without fixing
scanRecentMonths(false);

// Scan and fix all mismatches
scanRecentMonths(true);
```

## Output Example

```
=== Validating Rating Sync for 2025-12 ===
Auto-fix mode: OFF

❌ MISMATCH: 瀋 凌波 (lingbo_shen@ulvac.com)
   trend_base: individual="未評価" vs rating="安定"
   trend_refined: individual="下降" vs rating="上昇期待"
   E_delta_1: individual="-4" vs rating="3"

❌ MISMATCH: 山本 弘輝 (hiroki_yamamoto@ulvac.com)
   trend_base: individual="未評価" vs rating="低下中"
   trend_refined: individual="横ばい" vs rating="回復"
   E_delta_1: individual="-2" vs rating="4"

=== Validation Summary ===
Total members checked: 106
Mismatches found: 2
Errors: 0
```

## Fields Validated

The following analysis fields are compared:
- level
- trend_base, trend_recent, trend_refined
- change_tag, stability
- E_delta_1, E_delta_1_prev, E_delta_1_std_12
- E_slope_6, E_slope_6_std_12
- V_delta_1, D_delta_1, A_delta_1
- V_slope_6, D_slope_6, A_slope_6

## Workflow to Fix Current Issue

Since you've already manually corrected the rating sheet for lingbo_shen and hiroki_yamamoto:

### Step 1: Validate (Confirm Fix)

```javascript
// This should show 0 mismatches now
validateRatingSync(2025, 12, false);
```

### Step 2: Delete Wrong Data from EngagementMasterSS

```javascript
// Use existing utility
deleteMonthData(2025, 12);
```

### Step 3: Re-import Corrected Data

```javascript
// This will read from the corrected rating sheet
reimportMonth(2025, 12);

// Or just run the standard process
updateMaster();  // If it's still December processing period
```

## Prevention - Add to Regular Workflow

Consider adding validation to your regular process:

```javascript
function updateMasterWithValidation() {
  // Validate current month before updating master
  const report = validateCurrentMonth(true); // Auto-fix any issues

  if (report.mismatches.length > 0) {
    console.warn(`⚠️  Found and fixed ${report.mismatches.length} mismatches before updating master`);
  }

  // Proceed with normal update
  updateMaster();
}
```

## Technical Details

### Data Flow

```
1. Form submission → AnswerSheet
2. recordEngagement() → RatingSheet (base data only)
3. makeIndividualSheet() →
   - Reads from RatingSheet
   - Calls analyzeEngagement()
   - Writes results to IndividualSheet
   - Writes results BACK to RatingSheet (line 70)
4. updateMaster() →
   - Reads from RatingSheet
   - Writes to EngagementMasterSS
```

### Why Mismatches Happen

1. **Race condition**: Multiple concurrent submissions
2. **Write failure**: Line 70 in makeIndividualSheet() fails silently
3. **Manual edits**: Rating sheet edited after individual sheets created
4. **Process interruption**: makeIndividualSheet() crashes between writing to individual and rating sheets

### Value Normalization

The validator treats these as equivalent "empty" values:
- `null`
- `undefined`
- `""` (empty string)
- `0`

Numbers are rounded to 10 decimal places to avoid floating-point comparison issues.
