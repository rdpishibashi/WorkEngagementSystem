# trend_refined Decision Logic Comparison

## Overview
This document compares the `trend_refined` decision logic between:
- **Python**: `we_analyzer.py` - function `_refine_trend` (lines 833-989)
- **JavaScript**: `evaluate.gs` - function `refineTrend` (lines 469-614)

---

## Critical Differences

### 1. 入力疑義 (Input Suspect) Check

| Python | JavaScript |
|--------|------------|
| ✅ **Priority 1**: Checks if V/D/A values are constant for 6 months<br>`if _is_input_suspect(row): return "入力疑義"` | ❌ **Missing**: No input suspect check at all |

**Impact**: JavaScript will never return "入力疑義", potentially allowing questionable data through.

---

### 2. Priority Order Shift

Due to the missing 入力疑義 check, all subsequent priorities are shifted:

| Python Priority | JavaScript Priority | Category |
|----------------|---------------------|----------|
| **Priority 1** | *Missing* | 入力疑義 |
| **Priority 2** | **Priority 1** | 未評価/変動中 handling |
| **Priority 3** | **Priority 2** | 上昇加速/低下加速 |
| **Priority 4** | **Priority 3** | 上昇継続/低下継続 |
| **Priority 5** | **Priority 4** | 復活/悪化 |
| **Priority 6** | **Priority 5** | 回復/低下危機 |
| **Priority 7** | **Priority 6** | 上昇期待/低下警戒 |
| **Priority 8** | **Priority 7** | 低下懸念/回復期待 |
| **Priority 9** | **Priority 8** | 安定維持 (first check) |
| **Priority 10** | **Priority 9** | 安定維持 (second check) |

---

## Detailed Logic Comparison

### Priority 1 (Python Only): 入力疑義

```python
# Python - HIGHEST PRIORITY
if _is_input_suspect(row):
    return "入力疑義"
```

```javascript
// JavaScript - NO EQUIVALENT
```

**Condition**: V/D/A values remain constant for 6 months
**Result**: "入力疑義"

---

### Priority 2 (Python) / Priority 1 (JavaScript): 未評価 & 変動中

#### 未評価 (Not Evaluated)

| Python | JavaScript |
|--------|------------|
| `if trend_base == "未評価":` | `if (base === "未評価") {` |
| • 上昇/急上昇 → "上昇" | • 上昇/急上昇 → "上昇" |
| • 下降/急落 → "下降" | • 下降/急落 → "下降" |
| • 横ばい → "安定" | • 横ばい → "安定" |
| | • else → "安定" ⚠️ |

**Difference**: JavaScript has an extra fallback to "安定" for 未評価 cases.

#### 変動中 (Fluctuating)

| Python | JavaScript |
|--------|------------|
| `if trend_base == "変動中":` | `if (base === "変動中") {` |
| • recent in up_trends → "変動中上昇" | • upTrends.includes(recent) → "変動中上昇" |
| • recent in down_trends → "変動中低下" | • downTrends.includes(recent) → "変動中低下" |
| • recent == "横ばい" → "変動中安定" | • recent === "横ばい" → "変動中安定" |
| • else → "変動中" | • else → "変動中" |

**Status**: ✅ Identical logic

---

### Priority 3 (Python) / Priority 2 (JavaScript): 上昇加速 & 低下加速

#### 上昇加速 (Surging)

| Python | JavaScript |
|--------|------------|
| `trend_recent in up_trends AND` | `upTrends.includes(recent) AND` |
| `trend_base == "上昇中" AND` | `base === "上昇中" AND` |
| `change_tag == "変化大" AND` | `stabilityPersonalZ === "変化大" AND` |
| `abs(E_slope_6) > TREND_SLOPE` | `abs(slope) > TREND_SLOPE` |

#### 低下加速 (Slumping)

| Python | JavaScript |
|--------|------------|
| `trend_recent in down_trends AND` | `downTrends.includes(recent) AND` |
| `trend_base == "低下中" AND` | `base === "低下中" AND` |
| `change_tag == "変化大" AND` | `stabilityPersonalZ === "変化大" AND` |
| `abs(E_slope_6) > TREND_SLOPE` | `abs(slope) > TREND_SLOPE` |

**Status**: ✅ Identical logic (different variable names)

---

### Priority 4 (Python) / Priority 3 (JavaScript): 上昇継続 & 低下継続

#### 上昇継続 (Rising)

| Python | JavaScript |
|--------|------------|
| `recent in ["上昇", "急上昇", "連続上昇", "横ばい"] AND` | `["上昇", "急上昇", "連続上昇", "安定"].includes(recent) AND` ⚠️ |
| `base == "上昇中" AND` | `base === "上昇中" AND` |
| `change_tag == "not 変化大" AND` | `stabilityPersonalZ === "not 変化大" AND` |
| `abs(E_slope_6) > TREND_SLOPE AND` | `abs(slope) > TREND_SLOPE AND` |
| `E_delta_1 >= 0` | `delta >= 0` |

**⚠️ BUG**: JavaScript uses **"安定"** instead of **"横ばい"**
- "安定" is a `trend_base` value, NOT a `trend_recent` value
- "横ばい" is the correct `trend_recent` value
- This means JavaScript will never match the "横ばい" case for 上昇継続

#### 低下継続 (Declining)

| Python | JavaScript |
|--------|------------|
| `recent in ["下降", "急落", "連続下降", "横ばい"] AND` | `["下降", "急落", "連続下降", "安定"].includes(recent) AND` ⚠️ |
| `base == "低下中" AND` | `base === "低下中" AND` |
| `change_tag == "not 変化大" AND` | `stabilityPersonalZ === "not 変化大" AND` |
| `abs(E_slope_6) > TREND_SLOPE AND` | `abs(slope) > TREND_SLOPE AND` |
| `E_delta_1 <= 0` | `delta <= 0` |

**⚠️ BUG**: Same issue - JavaScript uses "安定" instead of "横ばい"

---

### Priority 5 (Python) / Priority 4 (JavaScript): 復活 & 悪化

#### 復活 (Resurgence)

| Python | JavaScript |
|--------|------------|
| `recent in ["上昇", "急上昇"] AND` | `["上昇", "急上昇"].includes(recent) AND` |
| `base == "低下中" AND` | `base === "低下中" AND` |
| `change_tag == "変化大" AND` | `stabilityPersonalZ === "変化大" AND` |
| `abs(E_slope_6) > TREND_SLOPE` | `abs(slope) > TREND_SLOPE` |

#### 悪化 (Severe)

| Python | JavaScript |
|--------|------------|
| `recent in ["下降", "急落"] AND` | `["下降", "急落"].includes(recent) AND` |
| `base == "上昇中" AND` | `base === "上昇中" AND` |
| `change_tag == "変化大" AND` | `stabilityPersonalZ === "変化大" AND` |
| `abs(E_slope_6) > TREND_SLOPE` | `abs(slope) > TREND_SLOPE` |

**Status**: ✅ Identical logic

---

### Priority 6 (Python) / Priority 5 (JavaScript): 回復 & 低下危機

#### 回復 (Recovering)

| Python | JavaScript |
|--------|------------|
| `recent in ["上昇", "急上昇", "連続上昇"] AND` | `["上昇", "急上昇", "連続上昇"].includes(recent) AND` |
| `base == "低下中" AND` | `base === "低下中" AND` |
| `change_tag == "not 変化大"` | `stabilityPersonalZ === "not 変化大"` |

#### 低下危機 (Severe)

| Python | JavaScript |
|--------|------------|
| `recent in ["下降", "急落", "連続下降"] AND` | `["下降", "急落", "連続下降"].includes(recent) AND` |
| `base == "上昇中" AND` | `base === "上昇中" AND` |
| `change_tag == "not 変化大"` | `stabilityPersonalZ === "not 変化大"` |

**Status**: ✅ Identical logic

---

### Priority 7 (Python) / Priority 6 (JavaScript): 上昇期待 & 低下警戒

#### 上昇期待 (Hopeful)

| Python | JavaScript |
|--------|------------|
| `base == "安定" AND` | `base === "安定" AND` |
| `recent in ["上昇", "急上昇", "連続上昇"]` | `["上昇", "急上昇", "連続上昇"].includes(recent)` |

#### 低下警戒 (Cautious)

| Python | JavaScript |
|--------|------------|
| `base == "安定" AND` | `base === "安定" AND` |
| `recent in ["下降", "急落", "連続下降"]` | `["下降", "急落", "連続下降"].includes(recent)` |

**Status**: ✅ Identical logic

---

### Priority 8 (Python) / Priority 7 (JavaScript): 低下懸念 & 回復期待

#### 低下懸念 (Weakening)

| Python | JavaScript |
|--------|------------|
| `recent == "横ばい" AND` | `recent === "横ばい" AND` |
| `base == "上昇中" AND` | `base === "上昇中" AND` |
| `E_delta_1 < 0` | `delta < 0` |

#### 回復期待 (Hopeful)

| Python | JavaScript |
|--------|------------|
| `recent == "横ばい" AND` | `recent === "横ばい" AND` |
| `base == "低下中" AND` | `base === "低下中" AND` |
| `E_delta_1 > 0` | `delta > 0` |

**Status**: ✅ Identical logic

---

### Priority 9 (Python) / Priority 8 (JavaScript): 未評価/安定 General Patterns

| Python | JavaScript |
|--------|------------|
| `if base == "未評価":` | *Handled earlier at Priority 1* |
| • 上昇/急上昇 → "上昇" | |
| • 下降/急落 → "下降" | |
| • 横ばい → "安定" | |
| `if base == "安定" and recent == "横ばい":` | `if (base === "安定" && recent === "横ばい") {` |
| → "安定維持" | → "安定維持" |

**Difference**: Python handles 未評価 cases here as well (redundant with Priority 2)

---

### Priority 10 (Python) / Priority 9 (JavaScript): 安定維持 Final Check

| Python | JavaScript |
|--------|------------|
| `recent == "横ばい" AND` | `recent === "横ばい" AND` |
| `base == "安定" AND` | `base === "安定" AND` |
| `change_tag == "not 変化大"` | `changeTag === "not 変化大"` ⚠️ |
| → "安定維持" | → "安定維持" |

**⚠️ BUG**: JavaScript uses undefined variable `changeTag` (should be `stabilityPersonalZ`)
- This code will throw an error or always be false

---

## Summary of Issues

### 🔴 Critical Issues in JavaScript

1. **Missing 入力疑義 Check**
   - Python has highest priority check for suspicious input (constant V/D/A values)
   - JavaScript completely lacks this validation

2. **Bug in 上昇継続/低下継続**
   - Uses "安定" (trend_base value) instead of "横ばい" (trend_recent value)
   - Will never match the 横ばい case correctly

3. **Undefined Variable Bug**
   - Priority 9 uses `changeTag` which is not defined in the function
   - Should be `stabilityPersonalZ`

### ⚠️ Logical Differences

4. **Extra Fallback for 未評価**
   - JavaScript has `else → "安定"` fallback for 未評価 cases
   - Python doesn't have this extra fallback at Priority 2

---

## Recommended Actions

### For JavaScript (`evaluate.gs`):

1. **Add 入力疑義 check** at Priority 1 (before current Priority 1)
   - Implement `flag_constant_6m` check
   - Return "入力疑義" if V/D/A are constant for 6 months

2. **Fix 上昇継続/低下継続**
   - Change `"安定"` to `"横ばい"` in the arrays at lines 528 and 537

3. **Fix undefined variable**
   - Change `changeTag` to `stabilityPersonalZ` at line 608

4. **Consider removing redundant 未評価 fallback**
   - The `else → "安定"` at line 494 may be unnecessary

---

## Constants Used

Both implementations use the same thresholds:
- `TREND_SLOPE = 0.5`
- `BIG_CHANGE_PERSONAL_Z = 2.0`
- `TREND_RECENT_DELTA = 2.0`
- `CHANGE_TAG_THRESHOLD = 6.0`
