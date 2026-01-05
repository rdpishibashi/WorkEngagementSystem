# Analysis of Proposed Changes to we_analyzer.py

## Summary of Requests

1. **Remove E_slope_3m_ma3 and E_slope_3m** - They don't seem to be used by other indexes
2. **Change E_slope_6_std_12 base** from E_std_12 → E_std_6
3. **Change E_delta_1_std_12 base** from E_std_12 → E_std_6

## Detailed Analysis

---

## 1. Remove E_slope_3m_ma3 and E_slope_3m

### Current Usage

**E_slope_3m** (3-month slope):
- **Calculated**: Line 1420-1447 in `compute_monthly_metrics()`
- **Used by**:
  - `compute_slope_ratios()` (line 1554) → calculates `r_pos` and `r_neg`
  - `compute_slope3m_pattern()` (line 1705) → calculates `slope3m_pattern`
- **Output**: Included in final report (line 1938)

**E_slope_3m_ma3** (3-month moving average of E_slope_3m):
- **Calculated**: Line 1429-1448 in `compute_monthly_metrics()`
- **Used by**: NONE (only included in output)
- **Output**: Included in final report (line 1938)

**r_pos / r_neg** (calculated from E_slope_3m):
- Ratio of positive/negative slopes in last 12 months
- **Used by**: `compute_slope3m_pattern()` (lines 1721-1722, 1731, 1738)
- **Output**: Included in final report (line 1932)

**slope3m_pattern** (calculated from E_slope_3m):
- Pattern classification: Net Growth, Net Decline, U-Shape, etc.
- **Used by**: NONE (only included in output)
- **Output**: Included in final report (line 1921)

### Impact of Removal

#### ✅ **Can be safely removed:**
- **E_slope_3m_ma3** - Not used by any calculations, only in output

#### ⚠️ **Removing E_slope_3m has cascading effects:**
If you remove E_slope_3m, you will also lose:
1. **r_pos / r_neg** - Cannot be calculated without E_slope_3m
2. **slope3m_pattern** - Cannot be calculated without E_slope_3m

#### 📊 **Current Output Columns Affected:**
- `E_slope_3m` (line 1938)
- `E_slope_3m_ma3` (line 1938)
- `r_pos` (line 1932)
- `r_neg` (line 1932)
- `slope3m_pattern` (line 1921)

### Recommendation for Request #1

**Option A: Remove only E_slope_3m_ma3**
- ✅ Safe - no other calculations depend on it
- ✅ Reduces output by 1 column
- ⚠️ E_slope_3m, r_pos, r_neg, slope3m_pattern remain

**Option B: Remove both E_slope_3m and E_slope_3m_ma3**
- ⚠️ Also removes: `r_pos`, `r_neg`, `slope3m_pattern`
- ✅ Reduces output by 5 columns
- ✅ Simplifies analysis pipeline
- ⚠️ Loses pattern classification feature

**My Recommendation**: Option A (remove only E_slope_3m_ma3)
- E_slope_3m provides useful information via r_pos/r_neg and slope3m_pattern
- E_slope_3m_ma3 is redundant and can be removed

---

## 2. Change E_slope_6_std_12 Base: E_std_12 → E_std_6

### Current Implementation (we_analyzer.py:708-713)

```python
# E_slope_6_std_12: 6-month slope standardized by 12-month std
std12 = float(np.nanstd(ep[-12:], ddof=0))
if pd.notna(s6) and pd.notna(std12) and std12 > 0:
    e_slope_6_std_12.append(float(s6 / std12))
```

**Current formula**: `E_slope_6_std_12 = E_slope_6 / E_std_12`

### Where E_slope_6_std_12 is Used

1. **Trend Classification (line 987-988, 993-994)**:
   ```python
   # 上昇中
   | (has_mid_history & (slope_std.notna()) & (slope_std > TREND_SLOPE_STD))  # 0.45

   # 低下中
   | (has_mid_history & (slope_std.notna()) & (slope_std < -TREND_SLOPE_STD))  # -0.45
   ```

   Determines: `trend_base` (上昇中 / 低下中 / 安定)

2. **Pattern Classification (line 1710, 1734)**:
   ```python
   # In compute_slope3m_pattern()
   if abs(e_slope_6_std_12) >= SLOPE6_STD12_THRESHOLD  # 0.2
   ```

   Determines: `slope3m_pattern` (Net Growth / Net Decline)

3. **Output**: Included in final report (line 1937, 1991)

### Impact of Changing to E_std_6

**Effect**: E_slope_6_std_12 values will become **LARGER** (more sensitive)

**Why**:
- E_std_6 < E_std_12 (shorter period = smaller std deviation)
- Dividing by a smaller number → larger result
- Example: If E_slope_6 = 1.0, E_std_6 = 2.0, E_std_12 = 3.0
  - Current: 1.0 / 3.0 = 0.33
  - Proposed: 1.0 / 2.0 = 0.50

### Consequences

#### ✅ **Positive Effects:**
- **More sensitive detection** of recent trends
- Better alignment with 6-month slope (both use 6-month window)
- **Conceptual consistency**: Normalizing a 6-month metric by 6-month variability

#### ⚠️ **Behavior Changes:**

1. **trend_base Classification**:
   - More people will be classified as "上昇中" or "低下中"
   - Fewer people will be "安定"
   - Threshold: `TREND_SLOPE_STD = 0.45` may need adjustment

2. **slope3m_pattern Classification**:
   - More patterns classified as "Net Growth" / "Net Decline"
   - Fewer "Oscillating" / "Flat/Noisy" patterns
   - Threshold: `SLOPE6_STD12_THRESHOLD = 0.2` may need adjustment

3. **Historical Comparison**:
   - ⚠️ **Breaking change**: Cannot directly compare with old data
   - Old E_slope_6_std_12 values will be systematically smaller

### Recommendation for Request #2

**✅ SUPPORT this change, BUT:**

1. **Rename the field** to reflect new calculation:
   - Current: `E_slope_6_std_12` (confusing after change)
   - Proposed: `E_slope_6_std_6` (accurate name)

2. **Adjust thresholds** to maintain similar classification rates:
   - Old threshold: `TREND_SLOPE_STD = 0.45`
   - New threshold: ~`0.60-0.70` (multiply by ratio of E_std_12/E_std_6, typically 1.4-1.6)
   - **Recommend**: Test on historical data to calibrate

3. **Consider transition period**:
   - Keep both calculations for 1-2 months
   - Compare results to validate thresholds
   - Then deprecate old calculation

---

## 3. Change E_delta_1_std_12 Base: E_std_12 → E_std_6

### Current Implementation (we_analyzer.py:1884-1888)

```python
use["E_delta_1_std_12"] = np.where(
    use["E_std_12"] > 0,
    use["E_delta_1"] / use["E_std_12"],
    np.nan,
)
```

**Current formula**: `E_delta_1_std_12 = E_delta_1 / E_std_12`

### Where E_delta_1_std_12 is Used

1. **Output only**: Included in final report (line 1931, 1988)
2. **NOT used in any calculations** (confirmed by grep search)

**Note**: There's a related field `big_change` (line 1890-1894) that uses the same logic:
```python
use["big_change"] = np.where(
    (use["E_std_12"] > 0) & (use["E_delta_1"].abs() / use["E_std_12"] > BIG_CHANGE_PERSONAL_Z),  # 2.0
    "変化大",
    "",
)
```

### Impact of Changing to E_std_6

**Effect**: E_delta_1_std_12 values will become **LARGER**

**Same reasoning as #2**:
- E_std_6 < E_std_12
- Dividing by smaller number → larger standardized change

### Consequences

#### ✅ **Positive Effects:**
- **More sensitive** to recent month-to-month changes
- Better reflects short-term volatility (6-month context vs 12-month)
- **Conceptual consistency**: Recent change normalized by recent variability

#### ⚠️ **Behavior Changes:**

1. **E_delta_1_std_12 values**:
   - Will be ~1.4-1.6x larger on average
   - Extreme changes will appear more extreme

2. **big_change classification**:
   - Currently uses E_std_12, would need to be updated too
   - More people flagged as "変化大" unless threshold adjusted
   - Current threshold: `BIG_CHANGE_PERSONAL_Z = 2.0`
   - Suggested new: ~`2.8-3.2` (to maintain similar rates)

3. **Historical Comparison**:
   - ⚠️ **Breaking change**: Cannot directly compare with old data

### Recommendation for Request #3

**✅ SUPPORT this change, BUT:**

1. **Rename the field**:
   - Current: `E_delta_1_std_12` (misleading after change)
   - Proposed: `E_delta_1_std_6` (accurate name)

2. **Update big_change logic** to use E_std_6:
   ```python
   use["big_change"] = np.where(
       (use["E_std_6"] > 0) & (use["E_delta_1"].abs() / use["E_std_6"] > NEW_THRESHOLD),
       "変化大",
       "",
   )
   ```

3. **Adjust threshold**:
   - Test on historical data to find equivalent threshold
   - Maintain similar "変化大" classification rate

---

## Summary of Recommendations

| Change | Support? | Conditions | Risk Level |
|--------|----------|------------|------------|
| Remove E_slope_3m_ma3 | ✅ Yes | None | 🟢 Low |
| Remove E_slope_3m | ⚠️ Maybe | Also removes r_pos, r_neg, slope3m_pattern | 🟡 Medium |
| Change E_slope_6_std_12 → E_std_6 | ✅ Yes | Rename field, adjust thresholds | 🟡 Medium |
| Change E_delta_1_std_12 → E_std_6 | ✅ Yes | Rename field, update big_change logic | 🟢 Low |

## Implementation Checklist

### Request #1: Remove E_slope_3m fields
- [ ] Remove `E_slope_3m_ma3` from compute_monthly_metrics()
- [ ] Remove `E_slope_3m_ma3` from output columns (line 1938, 1992)
- [ ] **Decision**: Keep or remove E_slope_3m?
  - If removing: Also remove compute_slope_ratios(), compute_slope3m_pattern()
  - If keeping: No further changes

### Request #2: Change E_slope_6_std_12 base
- [ ] Change calculation in add_multiscale_features() (line 709):
  ```python
  std6 = float(np.nanstd(ep[-6:], ddof=0))
  ```
- [ ] Rename field: `E_slope_6_std_12` → `E_slope_6_std_6`
- [ ] Update all references in code
- [ ] Test thresholds on historical data
- [ ] Adjust `TREND_SLOPE_STD` if needed (~0.60-0.70)
- [ ] Adjust `SLOPE6_STD12_THRESHOLD` if needed
- [ ] Update output column name (line 1937, 1991)

### Request #3: Change E_delta_1_std_12 base
- [ ] Change calculation (line 1884-1888):
  ```python
  use["E_delta_1_std_6"] = np.where(
      use["E_std_6"] > 0,
      use["E_delta_1"] / use["E_std_6"],
      np.nan,
  )
  ```
- [ ] Update big_change calculation (line 1890-1894) to use E_std_6
- [ ] Test new threshold for big_change (~2.8-3.2)
- [ ] Update output column name (line 1931, 1988)

### Testing Strategy
- [ ] Run on recent 3 months of data
- [ ] Compare classification distributions before/after
- [ ] Validate that ~same % of people get each trend_base classification
- [ ] Validate that ~same % get "変化大" flag
- [ ] Document any threshold adjustments made

## Data Compatibility Note

⚠️ **Breaking Changes**: Requests #2 and #3 change the meaning of existing fields. Consider:

1. **Transition Plan**:
   - Month 1: Add new fields alongside old ones
   - Month 2-3: Run both, compare results
   - Month 4: Remove old fields

2. **Documentation**:
   - Update any reports/dashboards using these fields
   - Add notes explaining the change
   - Archive old calculation logic for reference
