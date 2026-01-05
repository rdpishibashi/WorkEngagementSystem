# Column Index Comparison: Before vs After

## EngagementMasterSS rating2 Sheet - Column Mapping Changes

This document shows the column index changes after adding `intervention_priority` at position 27.

---

## Visual Comparison

```
Position | BEFORE                        | AFTER
---------|-------------------------------|-------------------------------
   0-16  | Common fields (unchanged)     | Common fields (unchanged)
   17    | engagement_rating             | engagement_rating
   18    | vigor_rating                  | vigor_rating
   19    | dedication_rating             | dedication_rating
   20    | absorption_rating             | absorption_rating
   21    | level                         | level
   22    | trend_base                    | trend_base
   23    | trend_recent                  | trend_recent
   24    | trend_refined                 | trend_refined
   25    | change_tag                    | change_tag
   26    | stability                     | stability
   27    | strength_short                | intervention_priority ← NEW
   28    | weakness_short                | strength_short        ← SHIFTED
   29    | strength_mid                  | weakness_short        ← SHIFTED
   30    | weakness_mid                  | strength_mid          ← SHIFTED
   31    | E_delta_1                     | weakness_mid          ← SHIFTED
   32    | E_delta_1_prev                | E_delta_1             ← SHIFTED
   33    | E_delta_1_std_12              | E_delta_1_prev        ← SHIFTED
   34    | E_slope_6                     | E_delta_1_std_12      ← SHIFTED
   35    | E_slope_6_std_12              | E_slope_6             ← SHIFTED
   36    | V_delta_1                     | E_slope_6_std_12      ← SHIFTED
   37    | D_delta_1                     | V_delta_1             ← SHIFTED
   38    | A_delta_1                     | D_delta_1             ← SHIFTED
   39    | V_slope_6                     | A_delta_1             ← SHIFTED
   40    | D_slope_6                     | V_slope_6             ← SHIFTED
   41    | A_slope_6                     | D_slope_6             ← SHIFTED
   42    | (end)                         | A_slope_6             ← SHIFTED
```

---

## Globals.gs Constant Changes

### ColumnMaster2* Constants

```javascript
// BEFORE
const ColumnMaster2Stability = 26;
const ColumnMaster2StrengthShort = 27;
const ColumnMaster2WeaknessShort = 28;
const ColumnMaster2StrengthMid = 29;
const ColumnMaster2WeaknessMid = 30;
const ColumnMaster2E_Delta1 = 31;
const ColumnMaster2E_Delta1Prev = 32;
const ColumnMaster2E_Delta1Std12 = 33;
const ColumnMaster2E_Slope6 = 34;
const ColumnMaster2E_Slope6Std12 = 35;
const ColumnMaster2V_Delta1 = 36;
const ColumnMaster2D_Delta1 = 37;
const ColumnMaster2A_Delta1 = 38;
const ColumnMaster2V_Slope6 = 39;
const ColumnMaster2D_Slope6 = 40;
const ColumnMaster2A_Slope6 = 41;
```

```javascript
// AFTER
const ColumnMaster2Stability = 26;
const ColumnMaster2InterventionPriority = 27;  // ← NEW
const ColumnMaster2StrengthShort = 28;         // ← SHIFTED +1
const ColumnMaster2WeaknessShort = 29;         // ← SHIFTED +1
const ColumnMaster2StrengthMid = 30;           // ← SHIFTED +1
const ColumnMaster2WeaknessMid = 31;           // ← SHIFTED +1
const ColumnMaster2E_Delta1 = 32;              // ← SHIFTED +1
const ColumnMaster2E_Delta1Prev = 33;          // ← SHIFTED +1
const ColumnMaster2E_Delta1Std12 = 34;         // ← SHIFTED +1
const ColumnMaster2E_Slope6 = 35;              // ← SHIFTED +1
const ColumnMaster2E_Slope6Std12 = 36;         // ← SHIFTED +1
const ColumnMaster2V_Delta1 = 37;              // ← SHIFTED +1
const ColumnMaster2D_Delta1 = 38;              // ← SHIFTED +1
const ColumnMaster2A_Delta1 = 39;              // ← SHIFTED +1
const ColumnMaster2V_Slope6 = 40;              // ← SHIFTED +1
const ColumnMaster2D_Slope6 = 41;              // ← SHIFTED +1
const ColumnMaster2A_Slope6 = 42;              // ← SHIFTED +1
```

---

## createRating2MasterToBeAdded() Array Changes

### Record Array Structure

```javascript
// BEFORE (positions 26-32)
const record = [
  // ... positions 0-25 ...
  rating.stability || "",           // 26
  rating.strength_short || "",      // 27
  rating.weakness_short || "",      // 28
  rating.strength_mid || "",        // 29
  rating.weakness_mid || "",        // 30
  rating.e_delta_1 || "",           // 31
  rating.e_delta_1_prev || "",      // 32
  // ... rest ...
];
```

```javascript
// AFTER (positions 26-33)
const record = [
  // ... positions 0-25 ...
  rating.stability || "",           // 26
  interventionPriority,             // 27 ← NEW
  rating.strength_short || "",      // 28 ← SHIFTED
  rating.weakness_short || "",      // 29 ← SHIFTED
  rating.strength_mid || "",        // 30 ← SHIFTED
  rating.weakness_mid || "",        // 31 ← SHIFTED
  rating.e_delta_1 || "",           // 32 ← SHIFTED
  rating.e_delta_1_prev || "",      // 33 ← SHIFTED
  // ... rest ...
];
```

---

## Key Points

1. **Insertion Point**: intervention_priority inserted at index 27
2. **Shift Range**: All indices from 27-41 shifted to 28-42 (+1)
3. **Unchanged Range**: All indices 0-26 remain unchanged
4. **Total Columns**: Increased from 42 to 43 columns

---

## Verification Steps

To verify correct implementation:

### 1. Check Globals.gs
```bash
grep "ColumnMaster2InterventionPriority\|ColumnMaster2StrengthShort" Admin/Globals.gs
```
Expected:
```
const ColumnMaster2InterventionPriority = 27;
const ColumnMaster2StrengthShort = 28;
```

### 2. Check engagement_management.gs
```bash
grep -n "interventionPriority" Admin/engagement_management.gs
```
Expected to find:
- Function definition (line 43)
- Calculation (line 122)
- Array insertion (line 152)
- Test function (lines 217-248)

### 3. Check Array Length
In createRating2MasterToBeAdded(), the record array should have 43 elements (0-42).

---

## Impact Assessment

### ✅ No Breaking Changes
- Existing data columns (0-26) unchanged
- Column references in other scripts remain valid for unchanged columns

### ⚠️ Requires Update
- Any hardcoded references to columns 27+ in other scripts will need updating
- EngagementMasterSS sheet must have column 27 available (already confirmed)

### 📊 Data Migration
- New records: intervention_priority auto-calculated
- Existing records: Column 27 may be empty (can backfill if needed)

---

**Document Version**: 1.0
**Date**: 2026-01-04
**Status**: ✅ Verified Correct
