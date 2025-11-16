# -*- coding: utf-8 -*-
from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd
import argparse

TREND_SLOPE_POS = 0.35
TREND_SLOPE_NEG = -0.35
TREND_MOMENTUM_STRONG = 1.5
TREND_DELTA_STRONG = 5.0
LEVEL_THRIVING = 43     # above 85% of the E scale
LEVEL_CRITICAL = 3      # below  5% of the E scale
LEVEL_HIGH = 32         # above 60% of the E scale
LEVEL_LOW = 11          # below 20% of the E scale
C_STABILITY_RANGE_EPS = 1e-6
MID_MIN_RECORDS = 3
CHANGE_TAG_THRESHOLD = 6.0
SHORT_MIN_DELTA = 2.0
MIN_SLOPE_POS = 0.20
MIN_SLOPE_NEG = -0.20
Z_POS = 0.8
Z_NEG = -0.8

V_COL="vigor_rating"; D_COL="dedication_rating"; A_COL="absorption_rating"; E_COL="Engagement"
WAVE_COL="__wave__"; SECTION_COL="__section__"; GROUP_COL="__group__"; PERSON_COL="__person__"

SHEET_INDIV="Individuals"; SHEET_LATEST="LatestIndividuals"
SHEET_DEPT="DeptDashboard"; SHEET_THRESH="Thresholds"


# === Added: personal short/mid computation helpers ===
def _expanding_quantile_exclusive(series: pd.Series, q: float) -> pd.Series:
    return series.expanding(min_periods=1).quantile(q).shift(1)

def _expanding_robust_z_exclusive(series: pd.Series, eps: float = 1e-9) -> pd.Series:
    med = series.expanding(min_periods=1).median().shift(1)
    abs_dev = (series - med).abs()
    mad = 1.4826 * abs_dev.expanding(min_periods=1).median().shift(1)
    z = (series - med) / mad
    z[(mad.isna()) | (mad < eps)] = np.nan
    return z

def _compute_personal_slope(series: pd.Series, window: int) -> pd.Series:
    vals = series.to_numpy(dtype=float)
    out = []
    for i in range(len(vals)):
        segment = vals[max(0, i-window+1):i+1]
        if np.isfinite(segment).sum() < window:
            out.append(np.nan)
        else:
            out.append(_theil_sen_slope_window(segment, window))
    return pd.Series(out, index=series.index, dtype="float64")

def overwrite_short_mid_personal(use: pd.DataFrame, mid_window: int = 6) -> pd.DataFrame:
    df = use.copy().sort_values([PERSON_COL, WAVE_COL])
    dims = [("V", V_COL), ("D", D_COL), ("A", A_COL)]
    LABELS = ["活力", "熱意", "没頭"]
    min_delta = SHORT_MIN_DELTA

    for dim, col in dims:
        dcol = f"{dim}_delta_1"
        if dcol not in df.columns:
            df[dcol] = df.groupby(PERSON_COL, sort=False)[col].apply(lambda s: s - s.shift(1)).reset_index(level=0, drop=True)

    for dim, col in dims:
        scol = f"{dim}_slope_{mid_window}"
        if scol not in df.columns:
            df[scol] = df.groupby(PERSON_COL, sort=False)[col].apply(lambda s: _compute_personal_slope(s, mid_window)).reset_index(level=0, drop=True)

    short_pos_cols, short_neg_cols, mid_pos_cols, mid_neg_cols = [], [], [], []

    for dim, col in dims:
        dcol = f"{dim}_delta_1"
        p90 = df.groupby(PERSON_COL, sort=False)[dcol].apply(lambda s: _expanding_quantile_exclusive(s, 0.90)).reset_index(level=0, drop=True)
        p10 = df.groupby(PERSON_COL, sort=False)[dcol].apply(lambda s: _expanding_quantile_exclusive(s, 0.10)).reset_index(level=0, drop=True)
        z   = df.groupby(PERSON_COL, sort=False)[dcol].apply(_expanding_robust_z_exclusive).reset_index(level=0, drop=True)

        th_pos = pd.Series(np.maximum(p90.values, min_delta), index=df.index)
        th_neg = pd.Series(np.minimum(p10.values, -min_delta), index=df.index)
        pos = (df[dcol] >= th_pos) & (z.isna() | (z >= Z_POS))
        neg = (df[dcol] <= th_neg) & (z.isna() | (z <= Z_NEG))

        sp = f"{dim}_short_strength_flag_self"; sn = f"{dim}_short_weakness_flag_self"
        df[sp] = pos.fillna(False); df[sn] = neg.fillna(False)
        short_pos_cols.append(sp); short_neg_cols.append(sn)

        scol = f"{dim}_slope_{mid_window}"
        slope = df[scol]
        p90s = df.groupby(PERSON_COL, sort=False)[scol].apply(lambda s: _expanding_quantile_exclusive(s, 0.90)).reset_index(level=0, drop=True)
        p10s = df.groupby(PERSON_COL, sort=False)[scol].apply(lambda s: _expanding_quantile_exclusive(s, 0.10)).reset_index(level=0, drop=True)
        zs   = df.groupby(PERSON_COL, sort=False)[scol].apply(_expanding_robust_z_exclusive).reset_index(level=0, drop=True)

        th_pos_s = pd.Series(np.maximum(p90s.values, MIN_SLOPE_POS), index=df.index)
        th_neg_s = pd.Series(np.minimum(p10s.values, MIN_SLOPE_NEG), index=df.index)
        posm = slope.notna() & (slope >= th_pos_s) & (zs.isna() | (zs >= Z_POS))
        negm = slope.notna() & (slope <= th_neg_s) & (zs.isna() | (zs <= Z_NEG))

        mp = f"{dim}_mid_strength_flag_self"; mn = f"{dim}_mid_weakness_flag_self"
        df[mp] = posm.fillna(False); df[mn] = negm.fillna(False)
        mid_pos_cols.append(mp); mid_neg_cols.append(mn)

    df["C_short_strength"] = [", ".join([lab for lab,flg in zip(LABELS, [df[c].iat[i] for c in short_pos_cols]) if flg]) for i in range(len(df))]
    df["C_short_weakness"] = [", ".join([lab for lab,flg in zip(LABELS, [df[c].iat[i] for c in short_neg_cols]) if flg]) for i in range(len(df))]
    df["C_mid_strength"]   = [", ".join([lab for lab,flg in zip(LABELS, [df[c].iat[i] for c in mid_pos_cols])   if flg]) for i in range(len(df))]
    df["C_mid_weakness"]   = [", ".join([lab for lab,flg in zip(LABELS, [df[c].iat[i] for c in mid_neg_cols])   if flg]) for i in range(len(df))]

    return df
# === End added helpers ===
def _safe_numeric(s): return pd.to_numeric(s, errors="coerce")

def _to_wave(df: pd.DataFrame) -> pd.Series:
    if {"year","month"}.issubset(df.columns):
        y = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
        m = pd.to_numeric(df["month"], errors="coerce").astype("Int64")
        return pd.Series([f"{int(yy)}-{int(mm):02d}" if pd.notna(yy) and pd.notna(mm) else np.nan for yy,mm in zip(y,m)], index=df.index)
    elif "date" in df.columns:
        return pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m")
    else:
        raise RuntimeError("year/month または date が必要です。")

def _theil_sen_slope_window(y, max_len):
    arr = np.array(list(y), dtype=float); arr = arr[np.isfinite(arr)]
    if len(arr)==0: return 0.0
    if len(arr)>max_len: arr = arr[-max_len:]
    n=len(arr)
    if n<3: return float((arr[-1]-arr[0])/(n-1)) if n>=2 else 0.0
    slopes=[(arr[j]-arr[i])/(j-i) for i in range(n-1) for j in range(i+1,n)]
    return float(np.median(slopes)) if slopes else 0.0

def _rolling_momentum_last(y):
    arr=np.array(list(y), dtype=float); arr=arr[np.isfinite(arr)]; n=len(arr)
    if n<3: return 0.0
    recent=float(np.nanmean(arr[-3:]))
    prior=float(np.nanmean(arr[-6:-3])) if n>=6 else (float(np.nanmean(arr[:-3])) if n>3 else recent)
    return float(recent - prior)

def _iqr_last_window(y, win):
    arr=np.array(list(y), dtype=float); arr=arr[np.isfinite(arr)]
    if len(arr)==0: return float("nan")
    arr = arr[-win:] if len(arr)>=win else arr
    if len(arr)==0: return float("nan")
    return float(np.nanpercentile(arr,75)-np.nanpercentile(arr,25))

def add_section_group_zscores(df_in, metrics):
    df=df_in.copy()
    for c in metrics: df[c]=_safe_numeric(df[c])
    def z_apply(g, suffix, key_cols):
        g_out = g.copy()
        key_vals = g.name if isinstance(g.name, tuple) else (g.name,)
        for col, val in zip(key_cols, key_vals):
            g_out[col] = val
        for c in metrics:
            mu, sd = g_out[c].mean(), g_out[c].std(ddof=0)
            g_out[f"{c}_z_{suffix}"] = 0.0 if (sd==0 or pd.isna(sd)) else (g_out[c]-mu)/sd
        return g_out
    df = df.groupby([WAVE_COL, SECTION_COL], group_keys=False).apply(
        lambda g: z_apply(g, "section", [WAVE_COL, SECTION_COL]), include_groups=False
    )
    df = df.groupby([WAVE_COL, GROUP_COL], group_keys=False).apply(
        lambda g: z_apply(g, "group", [WAVE_COL, GROUP_COL]), include_groups=False
    )
    return df

def add_multiscale_features(df_in):
    df=df_in.copy().sort_values([PERSON_COL, WAVE_COL])
    rows=[]
    for pid,g in df.groupby(PERSON_COL, sort=False):
        e=g[E_COL].to_numpy(float)
        v=g[V_COL].to_numpy(float); d=g[D_COL].to_numpy(float); a=g[A_COL].to_numpy(float)
        e_mean_6=[]; e_std_6=[]; e_iqr_6=[]; e_slope_12=[]; e_slope_6=[]; e_accel_6=[]; e_mom_3=[]; e_d1=[]; e_d1p=[]; prev_slope6_vals=[]
        v_s6=[]; d_s6=[]; a_s6=[]; v_d1=[]; d_d1=[]; a_d1=[]
        prev_s6=np.nan
        for i in range(len(g)):
            def _slope6(x): return _theil_sen_slope_window(x[:i+1], 6)
            def _slope12(x):return _theil_sen_slope_window(x[:i+1],12)
            def _delta1(x): return float(x[i]-x[i-1]) if i>=1 else 0.0
            ep=e[:i+1]
            e_mean_6.append(float(np.nanmean(ep[-6:]))) 
            e_std_6.append(float(np.nanstd(ep[-6:], ddof=0)))
            e_iqr_6.append(_iqr_last_window(ep,6))
            s12=_slope12(e); e_slope_12.append(s12)
            s6=_slope6(e);   e_slope_6.append(s6)
            prev_for_record = prev_s6 if np.isfinite(prev_s6) else s6
            prev_slope6_vals.append(prev_for_record)
            e_accel_6.append(float(s6 - prev_s6) if np.isfinite(prev_s6) and np.isfinite(s6) else 0.0)
            prev_s6=s6
            e_mom_3.append(_rolling_momentum_last(ep))
            e_d1.append(_delta1(e)); e_d1p.append(float(e[i-1]-e[i-2])) if i>=2 else e_d1p.append(0.0)
            v_s6.append(_slope6(v)); d_s6.append(_slope6(d)); a_s6.append(_slope6(a))
            v_d1.append(_delta1(v)); d_d1.append(_delta1(d)); a_d1.append(_delta1(a))
        tmp=g[[PERSON_COL, WAVE_COL]].copy()
        tmp["E_mean_6"]=e_mean_6; tmp["E_std_6"]=e_std_6; tmp["E_iqr_6"]=e_iqr_6
        tmp["E_slope_12"]=e_slope_12; tmp["E_slope_6"]=e_slope_6; tmp["E_accel_6"]=e_accel_6
        tmp["Prev_E_slope_6"]=prev_slope6_vals
        tmp["E_momentum_3"]=e_mom_3; tmp["E_delta_1"]=e_d1; tmp["E_delta_1_prev"]=e_d1p
        tmp["V_slope_6"]=v_s6; tmp["D_slope_6"]=d_s6; tmp["A_slope_6"]=a_s6
        tmp["V_delta_1"]=v_d1; tmp["D_delta_1"]=d_d1; tmp["A_delta_1"]=a_d1
        rows.append(tmp)
    feats=pd.concat(rows, ignore_index=True) if rows else df[[PERSON_COL, WAVE_COL]].copy()
    return df.merge(feats, on=[PERSON_COL, WAVE_COL], how="left")

def apply_personal_trend_logic(df_in: pd.DataFrame) -> pd.DataFrame:
    df_sorted = df_in.sort_values([PERSON_COL, WAVE_COL]).copy()
    counts = df_sorted.groupby(PERSON_COL, sort=False)[PERSON_COL].transform("size")
    has_mid_history = counts > MID_MIN_RECORDS

    df_sorted["E_min6_past"] = df_sorted.groupby(PERSON_COL, sort=False)[E_COL].transform(
        lambda s: s.shift(1).rolling(window=6, min_periods=1).min()
    )
    df_sorted["E_max6_past"] = df_sorted.groupby(PERSON_COL, sort=False)[E_COL].transform(
        lambda s: s.shift(1).rolling(window=6, min_periods=1).max()
    )

    slope = df_sorted["E_slope_6"]
    base = np.full(len(df_sorted), "安定", dtype=object)
    base[~has_mid_history] = "未評価"
    mid_mask = has_mid_history & slope.notna()
    base[mid_mask & (slope >= TREND_SLOPE_POS)] = "上昇中"
    base[mid_mask & (slope <= TREND_SLOPE_NEG)] = "低下中"
    df_sorted["Trend_B_base"] = base

    slope_cols = ["E_slope_6", "E_slope_12", "E_accel_6", "V_slope_6", "D_slope_6", "A_slope_6"]
    for col in slope_cols:
        if col in df_sorted.columns:
            df_sorted.loc[~has_mid_history, col] = np.nan

    delta = df_sorted["E_delta_1"]
    delta_prev = df_sorted["E_delta_1_prev"]
    momentum = df_sorted["E_momentum_3"]

    strong_delta_up = (delta >= TREND_DELTA_STRONG).fillna(False)
    strong_delta_down = (delta <= -TREND_DELTA_STRONG).fillna(False)
    strong_delta_up_prev = (delta_prev >= TREND_DELTA_STRONG).fillna(False)
    strong_delta_down_prev = (delta_prev <= -TREND_DELTA_STRONG).fillna(False)
    momentum_up = (momentum >= TREND_MOMENTUM_STRONG).fillna(False)
    momentum_down = (momentum <= -TREND_MOMENTUM_STRONG).fillna(False)
    delta_prev_ge0 = (delta_prev >= 0).fillna(False)
    delta_prev_le0 = (delta_prev <= 0).fillna(False)

    delta_only = df_sorted["Trend_B_base"] == "未評価"
    stable_eval = df_sorted["Trend_B_base"] == "安定"

    recent_up = (
        (delta_only & strong_delta_up)
        | (
            (~delta_only)
            & (
                (momentum_up & strong_delta_up)
                | (strong_delta_up & strong_delta_up_prev)
                | (stable_eval & strong_delta_up & delta_prev_ge0)
            )
        )
    )
    recent_down = (
        (delta_only & strong_delta_down)
        | (
            (~delta_only)
            & (
                (momentum_down & strong_delta_down)
                | (strong_delta_down & strong_delta_down_prev)
                | (stable_eval & strong_delta_down & delta_prev_le0)
            )
        )
    )

    recent = np.array(["横ばい"] * len(df_sorted), dtype=object)
    recent[recent_down] = "下降"
    recent[recent_up] = "上昇"
    df_sorted["Trend_B_recent"] = recent

    def _refine(row: pd.Series) -> str:
        base = row["Trend_B_base"]
        recent = row["Trend_B_recent"]
        slope_val = row["E_slope_6"]
        prev_slope = row.get("Prev_E_slope_6", np.nan)
        mom = row["E_momentum_3"]
        d1 = row["E_delta_1"]
        d1_prev = row.get("E_delta_1_prev", np.nan)
        current_e = row[E_COL]
        min6 = row["E_min6_past"]
        max6 = row["E_max6_past"]

        if base == "未評価":
            if recent in {"上昇", "下降", "横ばい"}:
                return recent
            return "未評価"

        has_slope = pd.notna(slope_val)
        has_prev_slope = pd.notna(prev_slope)
        has_mom = pd.notna(mom)
        has_d1 = pd.notna(d1)

        strong_momentum_up = has_mom and mom >= TREND_MOMENTUM_STRONG
        strong_momentum_down = has_mom and mom <= -TREND_MOMENTUM_STRONG
        consecutive_strong_up = pd.notna(d1_prev) and d1_prev >= TREND_DELTA_STRONG
        consecutive_strong_down = pd.notna(d1_prev) and d1_prev <= -TREND_DELTA_STRONG
        moderate_momentum = (not has_mom) or abs(mom) < TREND_MOMENTUM_STRONG
        moderate_delta = (not has_d1) or abs(d1) < TREND_DELTA_STRONG

        if (
            base == "上昇中"
            and recent == "上昇"
            and has_slope
            and slope_val >= TREND_SLOPE_POS
            and has_d1
            and d1 >= TREND_DELTA_STRONG
            and (strong_momentum_up or consecutive_strong_up)
        ):
            return "上昇加速"

        if (
            base == "上昇中"
            and recent == "横ばい"
            and has_slope
            and slope_val >= TREND_SLOPE_POS
            and has_mom
            and (-TREND_MOMENTUM_STRONG < mom < TREND_MOMENTUM_STRONG)
            and has_d1
            and (-TREND_DELTA_STRONG < d1 < TREND_DELTA_STRONG)
        ):
            return "上昇継続"

        downturn = (
            base == "上昇中"
            and recent == "下降"
            and has_slope
            and slope_val >= TREND_SLOPE_POS
            and has_d1
            and d1 <= -TREND_DELTA_STRONG
            and (strong_momentum_down or consecutive_strong_down)
        )
        if downturn and pd.notna(current_e) and pd.notna(min6):
            return "悪化" if current_e >= min6 else "低下危機"

        if (
            base == "低下中"
            and recent == "下降"
            and has_slope
            and slope_val <= TREND_SLOPE_NEG
            and has_d1
            and d1 <= -TREND_DELTA_STRONG
            and (strong_momentum_down or consecutive_strong_down)
        ):
            return "低下加速"

        if (
            base == "低下中"
            and recent == "横ばい"
            and has_d1
            and d1 > 0
        ):
            return "回復期待"

        if (
            base == "低下中"
            and recent == "横ばい"
            and has_slope
            and slope_val <= TREND_SLOPE_NEG
            and moderate_momentum
            and moderate_delta
        ):
            return "低下継続"

        recovery = (
            (
                base == "低下中"
                or (base == "安定" and has_prev_slope and prev_slope <= TREND_SLOPE_NEG)
            )
            and recent == "上昇"
            and has_d1
            and d1 >= TREND_DELTA_STRONG
            and (strong_momentum_up or consecutive_strong_up)
        )
        if recovery and pd.notna(current_e) and pd.notna(max6):
            return "回復" if current_e <= max6 else "復活"

        if (
            base == "上昇中"
            and recent == "横ばい"
            and has_d1
            and d1 < 0
        ):
            return "低下懸念"

        if (
            base == "安定"
            and recent == "上昇"
            and has_slope
            and (-TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS)
            and has_d1
            and d1 > 0
            and (strong_momentum_up or (pd.notna(d1_prev) and d1_prev <= SHORT_MIN_DELTA))
        ):
            return "上昇期待"

        if (
            base == "安定"
            and recent == "下降"
            and has_slope
            and (-TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS)
            and has_d1
            and d1 < 0
            and pd.notna(d1_prev)
            and d1_prev >= 0
            and (
                d1 <= -TREND_DELTA_STRONG
                or (has_mom and mom <= -TREND_MOMENTUM_STRONG)
            )
        ):
            return "低下警戒"

        if base == "安定" and not has_slope:
            if recent == "上昇":
                return "上昇期待"
            if recent == "下降":
                return "低下警戒"
            return "安定維持"

        if base == "低下中":
            return "低下継続"
        if base == "上昇中":
            return "上昇継続"
        return "安定維持"

    df_sorted["Trend_B_refined"] = df_sorted.apply(_refine, axis=1)
    return df_sorted.sort_index()

def compute_C_columns(df_in: pd.DataFrame, mid_window: int) -> pd.DataFrame:
    df_sorted = df_in.sort_values([PERSON_COL, WAVE_COL]).copy()

    group_sorted = df_sorted.groupby(PERSON_COL, sort=False)
    def _const_window_range(series: pd.Series) -> pd.Series:
        roll = series.rolling(window=mid_window, min_periods=mid_window)
        return roll.max() - roll.min()
    range_e = group_sorted[E_COL].transform(_const_window_range)
    range_v = group_sorted[V_COL].transform(_const_window_range)
    range_d = group_sorted[D_COL].transform(_const_window_range)
    range_a = group_sorted[A_COL].transform(_const_window_range)

    same_flag = (
        range_e.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_v.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_d.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_a.le(C_STABILITY_RANGE_EPS).fillna(False)
    )

    std_flag = df_sorted["E_std_6"]
    abs_momentum = df_sorted["E_momentum_3"].abs()

    stable_flag = (std_flag <= 1.0) & (abs_momentum < 0.5)
    unstable_flag = (std_flag >= 2.5)

    counts = df_sorted.groupby(PERSON_COL, sort=False)[PERSON_COL].transform("size")
    has_mid_history = counts > MID_MIN_RECORDS
    stability_values = np.array([""] * len(df_sorted), dtype=object)
    if has_mid_history.any():
        evaluated = np.select(
            [same_flag, stable_flag, unstable_flag],
            ["不変", "安定", "不安定"],
            default="やや安定",
        )
        stability_values[has_mid_history] = evaluated[has_mid_history]
    df_sorted["C_stability"] = stability_values

    trait_strength = {}
    trait_weakness = {}
    for pid, g in df_sorted.groupby(PERSON_COL, sort=False):
        med_v = g[f"{V_COL}_z_section"].rolling(window=12, min_periods=3).median()
        med_d = g[f"{D_COL}_z_section"].rolling(window=12, min_periods=3).median()
        med_a = g[f"{A_COL}_z_section"].rolling(window=12, min_periods=3).median()

        ts = []
        tw = []
        for k in range(len(g)):
            labels = [
                ("活力", med_v.iloc[k]),
                ("熱意", med_d.iloc[k]),
                ("没頭", med_a.iloc[k]),
            ]
            ts.append(", ".join([lab for lab, val in labels if pd.notna(val) and val >= 0.5]))
            tw.append(", ".join([lab for lab, val in labels if pd.notna(val) and val <= -0.5]))
        trait_strength.update(zip(g.index, ts))
        trait_weakness.update(zip(g.index, tw))

    df_sorted["C_trait_strength"] = df_sorted.index.map(trait_strength).fillna("")
    df_sorted["C_trait_weakness"] = df_sorted.index.map(trait_weakness).fillna("")

    def _section_flag(row: pd.Series, threshold: float, comparator) -> str:
        labels = []
        for lab, val in [
            ("活力", row.get(f"{V_COL}_z_section")),
            ("熱意", row.get(f"{D_COL}_z_section")),
            ("没頭", row.get(f"{A_COL}_z_section")),
        ]:
            if pd.notna(val) and comparator(val, threshold):
                labels.append(lab)
        return ", ".join(labels)

    df_sorted["C_section_strength"] = df_sorted.apply(
        lambda r: _section_flag(r, 0.5, lambda x, thr: x >= thr),
        axis=1,
    )
    df_sorted["C_section_weakness"] = df_sorted.apply(
        lambda r: _section_flag(r, -0.5, lambda x, thr: x <= thr),
        axis=1,
    )

    return df_sorted.sort_index()

def build_thresholds_sheet() -> pd.DataFrame:
    rows = [
        ("Trend_B_refined", 1, "上昇加速", f"Trend_B_base=上昇中, Trend_B_recent=上昇, E_slope_6≥{TREND_SLOPE_POS:.2f}, E_delta_1≥{TREND_DELTA_STRONG:.1f}, (E_momentum_3≥{TREND_MOMENTUM_STRONG:.1f} または E_delta_1_prev≥{TREND_DELTA_STRONG:.1f})"),
        ("Trend_B_refined", 2, "上昇継続", f"Trend_B_base=上昇中, Trend_B_recent=横ばい, E_slope_6≥{TREND_SLOPE_POS:.2f}, |E_momentum_3|<{TREND_MOMENTUM_STRONG:.1f}, |E_delta_1|<{TREND_DELTA_STRONG:.1f}（その他の上昇中ケースも最終的にここへ収束）"),
        ("Trend_B_refined", 3, "低下懸念", "Trend_B_base=上昇中, Trend_B_recent=横ばい, E_delta_1<0"),
        ("Trend_B_refined", 4, "悪化", f"Trend_B_base=上昇中, Trend_B_recent=下降, E_slope_6≥{TREND_SLOPE_POS:.2f}, E_delta_1≤-{TREND_DELTA_STRONG:.1f}, (E_momentum_3≤-{TREND_MOMENTUM_STRONG:.1f} または E_delta_1_prev≤-{TREND_DELTA_STRONG:.1f}), E≥E_min6_past"),
        ("Trend_B_refined", 5, "低下危機", f"Trend_B_base=上昇中, Trend_B_recent=下降, E_slope_6≥{TREND_SLOPE_POS:.2f}, E_delta_1≤-{TREND_DELTA_STRONG:.1f}, (E_momentum_3≤-{TREND_MOMENTUM_STRONG:.1f} または E_delta_1_prev≤-{TREND_DELTA_STRONG:.1f}), E<E_min6_past"),
        ("Trend_B_refined", 6, "低下加速", f"Trend_B_base=低下中, Trend_B_recent=下降, E_slope_6≤{TREND_SLOPE_NEG:.2f}, E_delta_1≤-{TREND_DELTA_STRONG:.1f}, (E_momentum_3≤-{TREND_MOMENTUM_STRONG:.1f} または E_delta_1_prev≤-{TREND_DELTA_STRONG:.1f})"),
        ("Trend_B_refined", 7, "回復期待", "Trend_B_base=低下中, Trend_B_recent=横ばい, E_delta_1>0"),
        ("Trend_B_refined", 8, "低下継続", f"Trend_B_base=低下中, Trend_B_recent=横ばい, E_slope_6≤{TREND_SLOPE_NEG:.2f}, |E_momentum_3|<{TREND_MOMENTUM_STRONG:.1f}, |E_delta_1|<{TREND_DELTA_STRONG:.1f}（その他の低下中ケースも最終的にここへ収束）"),
        ("Trend_B_refined", 9, "回復", f"Trend_B_base=低下中 または (安定 かつ 過去傾き≤{TREND_SLOPE_NEG:.2f}), Trend_B_recent=上昇, E_delta_1≥{TREND_DELTA_STRONG:.1f}, (E_momentum_3≥{TREND_MOMENTUM_STRONG:.1f} または E_delta_1_prev≥{TREND_DELTA_STRONG:.1f}), E≤E_max6_past"),
        ("Trend_B_refined", 10, "復活", f"上記回復条件 + E>E_max6_past"),
        ("Trend_B_refined", 11, "上昇期待", f"Trend_B_base=安定, Trend_B_recent=上昇, {TREND_SLOPE_NEG:.2f}<E_slope_6<{TREND_SLOPE_POS:.2f}, E_delta_1>0, (E_momentum_3≥{TREND_MOMENTUM_STRONG:.1f} または E_delta_1_prev≤{SHORT_MIN_DELTA:.1f})"),
        ("Trend_B_refined", 12, "低下警戒", f"Trend_B_base=安定, Trend_B_recent=下降, {TREND_SLOPE_NEG:.2f}<E_slope_6<{TREND_SLOPE_POS:.2f}, E_delta_1<0, E_delta_1_prev≥0, (E_delta_1≤-{TREND_DELTA_STRONG:.1f} または E_momentum_3≤-{TREND_MOMENTUM_STRONG:.1f})"),
        ("Trend_B_refined", 13, "安定維持", "その他（Trend_B_base=安定）"),
        ("C_stability", 1, "不変", "mid_window期間（既定6）のE/V/D/Aがすべて同値"),
        ("C_stability", 2, "安定", "E_std_6≤1.0 かつ |E_momentum_3|<0.5"),
        ("C_stability", 3, "不安定", "E_std_6≥2.5"),
        ("C_stability", 4, "やや安定", "上記以外"),
        ("Level_A", 1, "Thriving", f"E > {LEVEL_THRIVING}"),
        ("Level_A", 2, "Critical", f"E < {LEVEL_CRITICAL}"),
        ("Level_A", 3, "High", f"{LEVEL_HIGH} < E ≤ {LEVEL_THRIVING}"),
        ("Level_A", 4, "Low", f"{LEVEL_CRITICAL} ≤ E < {LEVEL_LOW}"),
        ("Level_A", 5, "Moderate", f"{LEVEL_LOW} ≤ E ≤ {LEVEL_HIGH}"),
    ]
    return pd.DataFrame(rows, columns=["Category", "Priority", "Label", "Condition"])

def _level_from_e(val: float) -> str:
    if pd.isna(val): return ""
    if val > LEVEL_THRIVING: return "Thriving"
    if val < LEVEL_CRITICAL: return "Critical"
    if val > LEVEL_HIGH: return "High"
    if val < LEVEL_LOW: return "Low"
    return "Moderate"

def compute_dept_dashboard(use: pd.DataFrame) -> pd.DataFrame:
    use = use.sort_values([GROUP_COL, PERSON_COL, WAVE_COL])
    use["low_flag"] = use[f"{E_COL}_z_section"] <= -1.0
    def _streak(s):
        out=[]; c=0
        for v in s:
            if v: c+=1
            else: c=0
            out.append(c)
        return pd.Series(out, index=s.index)
    use["low_streak"]=use.groupby([GROUP_COL, PERSON_COL], group_keys=False)["low_flag"].apply(_streak).reset_index(drop=True)

    def agg(g):
        e=g[E_COL].to_numpy(float); ez=g[f"{E_COL}_z_section"].to_numpy(float)
        result = {
            "mean_E_z_section": float(np.nanmean(ez)),
            "share_high_section": float(np.nanmean((ez>=1.0).astype(float))),
            "share_low_section":  float(np.nanmean((ez<=-1.0).astype(float))),
            "share_lowstreak_ge2": float(np.nanmean((g["low_streak"]>=2).astype(float))),
            "std_E_z_section": float(np.nanstd(ez, ddof=0)),
            "iqr_E": float(np.nanpercentile(e,75)-np.nanpercentile(e,25)) if len(e)>0 else np.nan,
            "median_E_momentum_3": float(np.nanmedian(g["E_momentum_3"])),
            "median_E_delta_1": float(np.nanmedian(g["E_delta_1"])),
            "median_E_slope_6": float(np.nanmedian(g["E_slope_6"])),
            "median_E_slope_12": float(np.nanmedian(g["E_slope_12"])),
        }
        key_vals = g.name if isinstance(g.name, tuple) else (g.name,)
        for col, val in zip([WAVE_COL, SECTION_COL, GROUP_COL], key_vals):
            result[col] = val
        return pd.Series(result)
    dash = use.groupby([WAVE_COL, SECTION_COL, GROUP_COL], as_index=False).apply(agg, include_groups=False).reset_index(drop=True)

    q = {}
    for col in ["mean_E_z_section","median_E_slope_6","median_E_delta_1","share_low_section","share_lowstreak_ge2","std_E_z_section","iqr_E"]:
        q[f"{col}_Q1"] = dash.groupby(WAVE_COL)[col].transform(lambda s: s.quantile(0.25))
        q[f"{col}_Q3"] = dash.groupby(WAVE_COL)[col].transform(lambda s: s.quantile(0.75))

    def label_dept(row, i):
        lvl = "高水準" if row["mean_E_z_section"]>=q["mean_E_z_section_Q3"].iloc[i] else ("低水準" if row["mean_E_z_section"]<=q["mean_E_z_section_Q1"].iloc[i] else "中水準")
        trn = "上昇" if (row["median_E_slope_6"]>q["median_E_slope_6_Q3"].iloc[i] and row["median_E_delta_1"]>q["median_E_delta_1_Q3"].iloc[i]) else ("低下" if (row["median_E_slope_6"]<q["median_E_slope_6_Q1"].iloc[i] and row["median_E_delta_1"]<q["median_E_delta_1_Q1"].iloc[i]) else "横ばい")
        risk_flag = (row["share_low_section"]>=q["share_low_section_Q3"].iloc[i]) or (row["share_lowstreak_ge2"]>=q["share_lowstreak_ge2_Q3"].iloc[i]) or (row["std_E_z_section"]>=q["std_E_z_section_Q3"].iloc[i]) or (row["iqr_E"]>=q["iqr_E_Q3"].iloc[i])
        rsk = "要警戒" if risk_flag else "通常"
        return lvl, trn, rsk

    labels = [label_dept(r, i) for i,r in dash.iterrows()]
    dash["Dept_Level"] = [t[0] for t in labels]
    dash["Dept_Trend"] = [t[1] for t in labels]
    dash["Dept_Risk"]  = [t[2] for t in labels]

    def eval_label(val, q1, q3):
        if pd.isna(val) or pd.isna(q1) or pd.isna(q3): return ""
        if val >= q3: return "高"
        if val <= q1: return "低"
        return ""

    dash["低位構成比(評価)"]      = [eval_label(r["share_low_section"],    q["share_low_section_Q1"].iloc[i],    q["share_low_section_Q3"].iloc[i]) for i,r in dash.iterrows()]
    dash["連続低位構成比(評価)"]  = [eval_label(r["share_lowstreak_ge2"], q["share_lowstreak_ge2_Q1"].iloc[i], q["share_lowstreak_ge2_Q3"].iloc[i]) for i,r in dash.iterrows()]
    dash["ばらつき(std)(評価)"]   = [eval_label(r["std_E_z_section"],     q["std_E_z_section_Q1"].iloc[i],     q["std_E_z_section_Q3"].iloc[i]) for i,r in dash.iterrows()]
    dash["散らばり(IQR)(評価)"]   = [eval_label(r["iqr_E"],                q["iqr_E_Q1"].iloc[i],                q["iqr_E_Q3"].iloc[i]) for i,r in dash.iterrows()]

    return dash

def run(input_path: Path, output_path: Path, mid_window: int = 6):
    xl = pd.ExcelFile(input_path)
    sheet = "rating2" if "rating2" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet)
    df[WAVE_COL]=_to_wave(df)
    df[SECTION_COL]=df["section"]
    gr=df["group"].astype(str).str.strip()
    df[GROUP_COL]=np.where(gr.eq("")|gr.str.lower().eq("nan"), df["section"], df["group"])
    if "mail_address" in df.columns: df[PERSON_COL]=df["mail_address"]
    elif "name" in df.columns: df[PERSON_COL]=df["name"]
    else: raise RuntimeError("個人識別列（mail_address または name）が必要です。")
    for c in [V_COL,D_COL,A_COL]: df[c]=pd.to_numeric(df[c], errors="coerce")
    df[E_COL]=df[[V_COL,D_COL,A_COL]].sum(axis=1, min_count=3)

    use=df[[PERSON_COL,"name","project","grade",SECTION_COL,GROUP_COL,WAVE_COL,V_COL,D_COL,A_COL,E_COL]].copy()
    use=add_section_group_zscores(use,[V_COL,D_COL,A_COL,E_COL])
    use=add_multiscale_features(use)
    use = overwrite_short_mid_personal(use, mid_window=mid_window)
    use = apply_personal_trend_logic(use)
    use = compute_C_columns(use, mid_window=mid_window)
    use["Level_A"] = use[E_COL].apply(_level_from_e)
    use["ChangeTag"]=np.where(np.abs(use["E_delta_1"])>=CHANGE_TAG_THRESHOLD, "変化大", "")

    thresholds_df = build_thresholds_sheet()
    indiv_cols = [
        "name", PERSON_COL, "project", "grade", SECTION_COL, GROUP_COL, WAVE_COL,
        V_COL, D_COL, A_COL, E_COL,
        "Level_A","Trend_B_base","Trend_B_recent","Trend_B_refined","ChangeTag",
        "C_stability",
        "C_short_strength","C_short_weakness",
        "C_mid_strength","C_mid_weakness",
        "C_trait_strength","C_trait_weakness",
        "C_section_strength","C_section_weakness",
        "E_momentum_3","E_delta_1","E_delta_1_prev","E_mean_6","E_std_6","E_iqr_6","E_slope_12","E_slope_6","E_accel_6",
        "V_delta_1","D_delta_1","A_delta_1","V_slope_6","D_slope_6","A_slope_6",
    ]
    indiv_cols=[c for c in indiv_cols if c in use.columns]
    individuals=use[indiv_cols].copy().sort_values([SECTION_COL, GROUP_COL, "name", WAVE_COL])
    latest_wave = individuals[WAVE_COL].max()
    latest = individuals[individuals[WAVE_COL]==latest_wave].copy()

    dash = compute_dept_dashboard(use)

    try:
        import xlsxwriter
        engine="xlsxwriter"
    except Exception:
        engine=None

    with pd.ExcelWriter(output_path, engine=engine) as w:
        individuals.to_excel(w, sheet_name=SHEET_INDIV, index=False)
        latest.to_excel(w, sheet_name=SHEET_LATEST, index=False)
        dash.to_excel(w, sheet_name=SHEET_DEPT, index=False)
        thresholds_df.to_excel(w, sheet_name=SHEET_THRESH, index=False)
        if engine=="xlsxwriter":
            wb=w.book
            intfmt=wb.add_format({"num_format":"0"})
            twofmt=wb.add_format({"num_format":"0.00"})
            for sh,data in [(SHEET_INDIV, individuals), (SHEET_LATEST, latest)]:
                ws=w.sheets[sh]; ws.freeze_panes(1,1); ws.autofilter(0,0,0, max(0, data.shape[1]-1))
                colidx={c:i for i,c in enumerate(data.columns)}
                for key in [V_COL,D_COL,A_COL,E_COL]:
                    if key in colidx: ws.set_column(colidx[key], colidx[key], 12, intfmt)
                float_keys = [
                              "E_momentum_3","E_delta_1","E_mean_6","E_std_6","E_iqr_6","E_slope_12","E_slope_6","E_accel_6",
                              "V_delta_1","D_delta_1","A_delta_1","V_slope_6","D_slope_6","A_slope_6"]
                for key in float_keys:
                    if key in colidx: ws.set_column(colidx[key], colidx[key], 12, twofmt)
            ws_d=w.sheets[SHEET_DEPT]; ws_d.freeze_panes(1,0)
            from pandas.api.types import is_numeric_dtype
            for i,c in enumerate(dash.columns):
                if is_numeric_dtype(dash[c]): ws_d.set_column(i,i,14, twofmt)
            ws_thr=w.sheets[SHEET_THRESH]; ws_thr.freeze_panes(1,0)
            for idx, col in enumerate(thresholds_df.columns):
                fmt = intfmt if col == "Priority" else None
                width = 14 if col in {"Category", "Label"} else (36 if col == "Condition" else 12)
                ws_thr.set_column(idx, idx, width, fmt)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input","-i", type=str, default="workengagement.xlsx")
    ap.add_argument("--output","-o", type=str, default="we_report.xlsx")
    ap.add_argument("--mid-window", type=int, default=6)
    args = ap.parse_args()
    inp = Path(args.input)
    if not inp.exists(): inp = Path("/mnt/data")/args.input
    if not inp.exists(): raise FileNotFoundError(f"入力ファイルが見つかりません: {args.input}")
    outp = Path(args.output)
    run(inp, outp, mid_window=int(args.mid_window))
    print(f"Done: {outp.resolve()}")

if __name__ == "__main__":
    main()
