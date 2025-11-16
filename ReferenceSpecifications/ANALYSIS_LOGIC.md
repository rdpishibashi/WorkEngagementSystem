# Analysis Logic Overview

This document summarizes how the current engagement analytics operate across the Apps Script helpers (`evaluate.txt`, `make_individual.txt`, `make_mail_contents.txt`, `send_response.txt`) and the Python pipeline (`we_analyzer.py`). The same constants underpin both paths so narrative messages, Excel outputs, and dashboards stay aligned.

## Inputs and Pre-Processing

- Each survey row includes `year`, `month`, `mail address`, and the four UWES-style scores (`engagement`, `vigor`, `dedication`, `absorption`).
- Records are grouped per person and sorted chronologically.
- Missing or non-numeric cells are coerced to `NaN`/skipped; we only compute metrics when enough history exists.

## Rolling Engagement Features

| Metric | Purpose | Window / Notes |
| --- | --- | --- |
| `E_delta_1`, `V_delta_1`, `D_delta_1`, `A_delta_1` | One-wave change vs the previous response | Fallback to `0` when no prior value |
| `E_delta_1_prev` | Previous one-wave engagement delta | Lets the trend logic flag consecutive swings |
| `E_momentum_3` | Mean of the last three engagement scores minus the preceding three | Falls back to available history when fewer than six points exist |
| `E_mean_6`, `E_std_6` | Rolling six-wave mean and standard deviation | Provides context for trend and stability |
| `E_slope_6`, `E_slope_12` | Theil–Sen slopes over 6 and 12 waves | Resistant to outliers |
| `E_accel_6` | Change in `E_slope_6` relative to the prior step | Highlights acceleration or slowing |
| `V_slope_6`, `D_slope_6`, `A_slope_6` | Dimension-specific slopes | Same Theil–Sen method |
| `E_iqr_6` | Six-wave interquartile range | Used for department spread scoring |

## Adaptive Thresholds for Strength/Weakness

For each dimension (`vigor`, `dedication`, `absorption`) the Apps Script and Python pipeline build expanding histories of deltas and slopes:

- Percentiles: `deltaP90`, `deltaP10`, `slopeP90`, `slopeP10`.
- Robust z-scores: `deltaZ`, `slopeZ` using MAD scaling.

Short-term strength requires the current delta to exceed `max(deltaP90, SHORT_MIN_DELTA)` and have z-score ≥ `Z_POS`. Weakness requires the delta ≤ `min(deltaP10, -SHORT_MIN_DELTA)` with z-score ≤ `Z_NEG`. Mid-term strength/weakness applies the same logic to slopes with minimum slope bounds (`±MIN_SLOPE_POS/NEG`).  

All intermediate values (`deltaP10`, `deltaP90`, `deltaZ`, `slopeP10`, `slopeP90`, `slopeZ`) are surfaced in `ENGAGEMENT_RESULT_FIELDS` so that emails and spreadsheets can show the thresholds that triggered a flag.

## Stability Classification

- `不変`: all four dimensions’ six-wave ranges are within `1e-6`.
- `安定`: `E_std_6 ≤ 1.0` and `|E_momentum_3| < 0.5`.
- `不安定`: `E_std_6 ≥ 2.5`.
- Otherwise `やや安定`.

When the person has `MID_MIN_RECORDS` responses or fewer, stability is left blank (判定保留).

## Trend Flags

1. **Base Trend (`trend_base`)**  
   `E_slope_6 ≥ 0.35 → 上昇中`, `≤ -0.35 → 低下中`, otherwise `安定`（回答数が MID_MIN_RECORDS 以下の場合は `未評価`）。

2. **Recent Trend (`trend_recent`)**  
   - Upward when either:
     - `E_momentum_3 ≥ TREND_MOMENTUM_STRONG` and `E_delta_1 ≥ TREND_DELTA_STRONG`, or
     - Two consecutive strong deltas (`E_delta_1` and `E_delta_1_prev` ≥ threshold).
   - Downward mirrors the rule with negative thresholds.
   - Otherwise reported as `横ばい`.

3. **Refined Trend (`trend_refined`)**  
   A rule tree in both code paths blends base trend, recent trend, short-term deltas, momentum, and six-wave min/max to label nuanced phases such as `上昇加速`, `回復期待`, `低下懸念`, `低下危機`, `復活`, etc. (Apps Script implements this in `refineTrend`; Python mirrors it in `apply_personal_trend_logic`).

### Refined Trend Labels

   The helper receives the following inputs (all precomputed per person and wave):

- `base`: result of the base trend test (`上昇中`, `安定`, `低下中`, or `未評価`).
- `recent`: result of the recent trend test (`上昇`, `横ばい`, `下降`).
- `slope`: current six-wave Theil–Sen slope (`E_slope_6`).
- `prevSlope`: prior six-wave slope (Apps Script keeps it explicitly; Python recomputes).
- `momentum`: three-on-three momentum (`E_momentum_3`).
- `delta`: latest engagement delta (`E_delta_1`).
- `deltaPrev`: previous engagement delta (`E_delta_1_prev`).
- `engagement`: current engagement score.
- `minPast` / `maxPast`: rolling minimum/maximum of the prior six waves (exclusive of the current point).

These inputs feed the following decision ladder (threshold constants noted in brackets):

| Label | Condition Overview |
| --- | --- |
| `未評価` | Base trend is `未評価`; returns `recent` if available, otherwise `未評価`. |
| `上昇加速` (surging) | `base=上昇中`, `recent=上昇`, slope ≥ `TREND_SLOPE_POS`, delta ≥ `TREND_DELTA_STRONG`, and either momentum ≥ `TREND_MOMENTUM_STRONG` or the previous delta already exceeded the same threshold. |
| `上昇継続` (rising) | `base=上昇中`, `recent=横ばい`, slope ≥ `TREND_SLOPE_POS`, and both `abs(momentum)` and `abs(delta)` stay below the strong thresholds. |
| `悪化` (worsening) | The “downturn” condition (below) is true and current engagement ≥ prior six-wave minimum. |
| `低下危機` (severe) | Same downturn condition but engagement has broken below the prior six-wave minimum. |
| *(Downturn condition)* | `base=上昇中`, `recent=下降`, slope ≥ `TREND_SLOPE_POS`, delta ≤ `-TREND_DELTA_STRONG`, and either momentum ≤ `-TREND_MOMENTUM_STRONG` or the previous delta already breached the negative threshold. |
| `低下加速` (slumping) | `base=低下中`, `recent=下降`, slope ≤ `TREND_SLOPE_NEG`, delta ≤ `-TREND_DELTA_STRONG`, and strong downward momentum (current or consecutive). |
| `回復期待` (hopeful) | `base=低下中`, `recent=横ばい`, delta > 0 (any uptick counts). |
| `低下継続` (declining) | `base=低下中`, `recent=横ばい`, slope ≤ `TREND_SLOPE_NEG`, and both `abs(momentum)` and `abs(delta)` remain below the strong thresholds. Also the default whenever the base trend stays `低下中` and no other rule fires. |
| `回復` (recovering)| Recovery condition (below) is true and engagement ≤ prior six-wave maximum. |
| `復活` (resurgence)| Same recovery condition but engagement has already cleared the prior six-wave maximum. |
| *(Recovery condition)* | (`base=低下中` **or** `base=安定` with previous slope ≤ `TREND_SLOPE_NEG`) **and** `recent=上昇`, delta ≥ `TREND_DELTA_STRONG`, with strong upward momentum (current or consecutive). |
| `低下懸念` (weakening) | `base=上昇中`, `recent=横ばい`, and delta is negative (slipping despite an upward base slope). |
| `上昇期待` (improving) | `base=安定`, `recent=上昇`, slope remains within the neutral band (`TREND_SLOPE_NEG` < slope < `TREND_SLOPE_POS`), delta > 0, and either strong upward momentum or a non-positive previous delta (≤ `SHORT_MIN_DELTA`). Also returned when `base=安定`, slope is unavailable, and `recent=上昇`. |
| `低下警戒` (cautious) | `base=安定`, slope within the neutral band, `recent=下降`, and either (a) delta ≤ `-TREND_DELTA_STRONG` with a non-negative previous delta, or (b) momentum ≤ `-TREND_MOMENTUM_STRONG` with delta < 0 and previous delta ≥ 0. Also returned when `base=安定`, slope is unavailable, and `recent=下降`. |
| `安定維持` (stable)| Default when `base=安定` and none of the above cases apply. |
| `上昇継続` (default) | Returned when `base=上昇中` and no earlier rule matched. |
| `低下継続` (default) | Returned when `base=低下中` and no earlier rule matched. |

Momentum or delta checks treat missing values as “moderate” (i.e., `abs() < threshold`). The Apps Script helper short-circuits on `未評価` and neutral slope availability to avoid forcing trend names when data is scarce.

The same logic can be expressed as the following decision table (conditions use the threshold constants noted above):

| Label | Base | Recent | Slope Condition | Momentum Condition | Delta Condition | Previous Δ Condition | Extra Checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 未評価 | `未評価` | any | – | – | – | – | Return `recent` if defined, else `未評価` |
| 上昇加速 | `上昇中` | `上昇` | `slope ≥ TREND_SLOPE_POS` | `momentum ≥ TREND_MOMENTUM_STRONG` (optional) | `delta ≥ TREND_DELTA_STRONG` | `deltaPrev ≥ TREND_DELTA_STRONG` (alternative to strong momentum) | – |
| 上昇継続 | `上昇中` | `横ばい` | `slope ≥ TREND_SLOPE_POS` | `|momentum| < TREND_MOMENTUM_STRONG` | `|delta| < TREND_DELTA_STRONG` | – | – |
| 低下懸念 | `上昇中` | `横ばい` | – | – | `delta < 0` | – | – |
| 悪化 | `上昇中` | `下降` | `slope ≥ TREND_SLOPE_POS` | `momentum ≤ -TREND_MOMENTUM_STRONG` | `delta ≤ -TREND_DELTA_STRONG` | `deltaPrev ≤ -TREND_DELTA_STRONG` (alternative to strong momentum) | `engagement ≥ minPast` |
| 低下危機 | same as `悪化` | same as `悪化` | same as `悪化` | same as `悪化` | same as `悪化` | same as `悪化` | `engagement < minPast` |
| 低下加速 | `低下中` | `下降` | `slope ≤ TREND_SLOPE_NEG` | `momentum ≤ -TREND_MOMENTUM_STRONG` (optional) | `delta ≤ -TREND_DELTA_STRONG` | `deltaPrev ≤ -TREND_DELTA_STRONG` (alternative to strong momentum) | – |
| 回復期待 | `低下中` | `横ばい` | – | – | `delta > 0` | – | – |
| 低下継続 | `低下中` | `横ばい` | `slope ≤ TREND_SLOPE_NEG` | `|momentum| < TREND_MOMENTUM_STRONG` | `|delta| < TREND_DELTA_STRONG` | – | – |
| 回復 | `低下中` or (`安定` with `prevSlope ≤ TREND_SLOPE_NEG`) | `上昇` | – | `momentum ≥ TREND_MOMENTUM_STRONG` (optional) | `delta ≥ TREND_DELTA_STRONG` | `deltaPrev ≥ TREND_DELTA_STRONG` (alternative to strong momentum) | `engagement ≤ maxPast` |
| 復活 | same as `回復` | same as `回復` | same as `回復` | same as `回復` | same as `回復` | same as `回復` | `engagement > maxPast` |
| 上昇期待 | `安定` | `上昇` | `TREND_SLOPE_NEG < slope < TREND_SLOPE_POS` (or slope missing) | `momentum ≥ TREND_MOMENTUM_STRONG` | `delta > 0` | `deltaPrev ≤ SHORT_MIN_DELTA` (alternative to strong momentum) | – |
| 低下警戒 | `安定` | `下降` | `TREND_SLOPE_NEG < slope < TREND_SLOPE_POS` (or slope missing) | `momentum ≤ -TREND_MOMENTUM_STRONG` (optional) | `delta < 0` (強い減少がある場合は `delta ≤ -TREND_DELTA_STRONG`) | `deltaPrev ≥ 0` (for strong-delta path) | 「強い減少」または「強いモメンタム」のどちらかを満たす |
| 安定維持 | `安定` | (any not matched above) | – | – | – | – | Default |
| 上昇継続 (default) | `上昇中` | (any not matched above) | – | – | – | – | Default |
| 低下継続 (default) | `低下中` | (any not matched above) | – | – | – | – | Default |

## Level and Change Tag

- `level`: Thriving when `E > 43`, High when `E > 32`, Low when `E < 11`, Critical when `E < 3`, otherwise Moderate.
- `change_tag`: `変化大` when the absolute engagement delta is ≥ 6.0.

## Outputs

- **Apps Script**:
  - `evaluate.txt` writes all calculated fields into a dictionary keyed by `ENGAGEMENT_RESULT_FIELDS`, covering levels, trends, stability, short/mid strengths and weaknesses, percentile/z-score diagnostics, and raw metrics (`E_*`, `V_*`, `D_*`, `A_*`).
  - `make_individual.txt` merges those fields into the member sheet and Rating sheet, extending the header automatically when new fields are added.
  - `make_mail_contents.txt` converts the trend/strength metadata into narrative paragraphs, while `send_response.txt` orchestrates sheet updates, chart generation, and email delivery using cached `LastIndividualData`.

- **Python (`we_analyzer.py`)**:
  - `Individuals` sheet: one row per person per wave with all computed metrics, trend/stability labels, personal short/mid flags, trait/section strengths, and diagnostic stats（セクション/グループの Z スコアは内部利用のみで列には含めない）。
  - `LatestIndividuals` sheet: filtered to the most recent wave per person.
  - `DeptDashboard` sheet: section/group aggregates with z-scores, streak counts, normalized outlier ratios, and evaluation columns.
  - `Thresholds` sheet: rule reference table describing each narrative label, level band, and risk heuristic.

## Key Constants

| Constant | Default | Purpose |
| --- | --- | --- |
| `TREND_SLOPE_POS`, `TREND_SLOPE_NEG` | ±0.35 | Base trend slope gates |
| `TREND_MOMENTUM_STRONG` | 1.5 | Recent momentum threshold |
| `TREND_DELTA_STRONG` | 5.0 | Strong one-wave change |
| `SHORT_MIN_DELTA` | 2.0 | Minimum swing to consider |
| `Z_POS`, `Z_NEG` | ±0.8 | Z-score gates for short/mid logic |
| `MIN_SLOPE_POS`, `MIN_SLOPE_NEG` | ±0.20 | Mid-term slope bounds |
| `LEVEL_THRIVING`, `LEVEL_HIGH`, `LEVEL_LOW`, `LEVEL_CRITICAL` | 43 / 32 / 11 / 3 | Engagement level bands |
| `CHANGE_TAG_THRESHOLD` | 6.0 | Absolute delta trigger for `変化大` |
| `MID_WINDOW` | 6 | Six-wave window used for slopes and stability |
| `MID_MIN_RECORDS` | 3 | Minimum history before mid-term stats are evaluated |

Adjusting these constants cascades through both Apps Script and Python outputs.

## How to Modify or Extend

- Keep the constant blocks in `evaluate.txt` and `we_analyzer.py` aligned whenever possible; if they intentionally diverge, document the rationale in comments and here.
- Short-term/mid-term strength logic lives inside `evaluate.txt`’s `buildStrengthFlags` helpers and the Python `overwrite_short_mid_personal` helper.
- Trend refinements are defined in `evaluate.txt`’s `refineTrend` and mirrored in `we_analyzer.py`’s `apply_personal_trend_logic`; always update both.
- Department-level heuristics (streak ratios, variance scoring) are centralized in `we_analyzer.py`’s dashboard builder; Apps Script does not duplicate that aggregation logic.

Whenever constants or logic change, re-run the Python pipeline (`python we_analyzer.py …`) and trigger a test submission through Apps Script in test mode to ensure narrative messages, Excel outputs, and cached charts stay in sync. Capture masked before/after samples for validation per repository guidelines.
