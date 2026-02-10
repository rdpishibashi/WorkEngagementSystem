# -*- coding: utf-8 -*-
"""intervention_priority の内訳検証用スクリプト"""
from pathlib import Path
import numpy as np
import pandas as pd
import we_analyzer

# 1. Run the analyzer to generate fresh output
input_path = Path("EngagementMasterSS.xlsx")
if not input_path.exists():
    input_path = Path(__file__).parent.parent / "SpreadSheet" / "EngagementMasterSS.xlsx"
output_path = Path("we_report.xlsx")
we_analyzer.run(input_path, output_path)

# 2. Read the latest_individuals sheet
df = pd.read_excel(output_path, sheet_name="latest_individuals")

# 3. Compute each factor's contribution
def factor_trend_base_neg(row):
    return 1 if row.get("trend_base") == "低下中" else 0

def factor_trend_base_pos(row):
    return 1 if row.get("trend_base") == "上昇中" else 0

def factor_trend_recent_neg(row):
    return {"急落": 2, "連続下降": 1}.get(row.get("trend_recent", ""), 0)

def factor_trend_recent_pos(row):
    return {"急上昇": 2, "連続上昇": 1}.get(row.get("trend_recent", ""), 0)

def factor_big_change_neg(row):
    d = row.get("E_delta_1", np.nan)
    return 1 if row.get("big_change") == "変化大" and pd.notna(d) and d < 0 else 0

def factor_big_change_pos(row):
    d = row.get("E_delta_1", np.nan)
    return 1 if row.get("big_change") == "変化大" and pd.notna(d) and d > 0 else 0

def factor_big_change_abs_neg(row):
    d = row.get("E_delta_1", np.nan)
    return 1 if row.get("big_change_abs") == "変化大" and pd.notna(d) and d < 0 else 0

def factor_big_change_abs_pos(row):
    d = row.get("E_delta_1", np.nan)
    return 1 if row.get("big_change_abs") == "変化大" and pd.notna(d) and d > 0 else 0

DELTA_STD6_TIERS = [(1.0, 2.0, 1), (2.0, 3.0, 2), (3.0, 4.0, 3), (4.0, float("inf"), 4)]
SLOPE_STD6_TIERS = [(0.25, 0.50, 1), (0.50, 1.00, 2), (1.00, 1.50, 3), (1.50, float("inf"), 4)]

def _tier(val, tiers):
    if pd.isna(val):
        return 0
    for lo, hi, sc in tiers:
        if lo < val <= hi:
            return sc
    return 0

def factor_delta_std6_neg(row):
    v = row.get("E_delta_1_std_6", np.nan)
    return _tier(abs(v), DELTA_STD6_TIERS) if pd.notna(v) and v < 0 else 0

def factor_delta_std6_pos(row):
    v = row.get("E_delta_1_std_6", np.nan)
    return _tier(abs(v), DELTA_STD6_TIERS) if pd.notna(v) and v > 0 else 0

def factor_slope_std6_neg(row):
    v = row.get("E_slope_6_std_6", np.nan)
    return _tier(abs(v), SLOPE_STD6_TIERS) if pd.notna(v) and v < 0 else 0

def factor_slope_std6_pos(row):
    v = row.get("E_slope_6_std_6", np.nan)
    return _tier(abs(v), SLOPE_STD6_TIERS) if pd.notna(v) and v > 0 else 0

# 4. Build verification DataFrame
out = pd.DataFrame()
out["name"] = df["name"]
out["wave"] = df["wave"]
out["intervention_priority_neg"] = df["intervention_priority_neg"]
out["intervention_priority_pos"] = df["intervention_priority_pos"]

# Neg factors
out["neg_trend_base"] = df.apply(factor_trend_base_neg, axis=1)
out["neg_trend_recent"] = df.apply(factor_trend_recent_neg, axis=1)
out["neg_big_change"] = df.apply(factor_big_change_neg, axis=1)
out["neg_big_change_abs"] = df.apply(factor_big_change_abs_neg, axis=1)
out["neg_E_delta_1_std_6"] = df.apply(factor_delta_std6_neg, axis=1)
out["neg_E_slope_6_std_6"] = df.apply(factor_slope_std6_neg, axis=1)

# Pos factors
out["pos_trend_base"] = df.apply(factor_trend_base_pos, axis=1)
out["pos_trend_recent"] = df.apply(factor_trend_recent_pos, axis=1)
out["pos_big_change"] = df.apply(factor_big_change_pos, axis=1)
out["pos_big_change_abs"] = df.apply(factor_big_change_abs_pos, axis=1)
out["pos_E_delta_1_std_6"] = df.apply(factor_delta_std6_pos, axis=1)
out["pos_E_slope_6_std_6"] = df.apply(factor_slope_std6_pos, axis=1)

# Verify: sum of factors should match the priority scores
out["neg_sum_check"] = (
    out["neg_trend_base"] + out["neg_trend_recent"] +
    out["neg_big_change"] + out["neg_big_change_abs"] +
    out["neg_E_delta_1_std_6"] + out["neg_E_slope_6_std_6"]
)
out["pos_sum_check"] = (
    out["pos_trend_base"] + out["pos_trend_recent"] +
    out["pos_big_change"] + out["pos_big_change_abs"] +
    out["pos_E_delta_1_std_6"] + out["pos_E_slope_6_std_6"]
)
out["neg_match"] = out["intervention_priority_neg"] == out["neg_sum_check"]
out["pos_match"] = out["intervention_priority_pos"] == out["pos_sum_check"]

# Raw source values for reference
out["trend_base"] = df["trend_base"]
out["trend_recent"] = df["trend_recent"]
out["big_change"] = df["big_change"]
out["big_change_abs"] = df["big_change_abs"]
out["E_delta_1"] = df["E_delta_1"]
out["E_delta_1_std_6"] = df["E_delta_1_std_6"]
out["E_slope_6_std_6"] = df["E_slope_6_std_6"]

# 5. Write output
verify_path = Path("verify_intervention.xlsx")
out.to_excel(verify_path, index=False, sheet_name="verification")

# 6. Summary
neg_ok = out["neg_match"].all()
pos_ok = out["pos_match"].all()
print(f"neg match: {'ALL OK' if neg_ok else 'MISMATCH FOUND'}")
print(f"pos match: {'ALL OK' if pos_ok else 'MISMATCH FOUND'}")
print(f"Output: {verify_path.resolve()}")
