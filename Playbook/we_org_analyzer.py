# -*- coding: utf-8 -*-
"""
WE Organization Analyzer - 組織別統計分析（時系列）

入力: workengagement.xlsx
出力: org_statistics.xlsx (2シート)
  1. monthly_trends - 全Wave×全組織の統計指標時系列
  2. latest_index - 最新Wave×全組織の統計指標

組織レベル:
  - Section (部門別)
  - Group (グループ別)
  - Whole (全体)

統計指標:
  - mean, median, sd, q25, q75, iqr, min, max
"""
from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd
import argparse

# ========== Constants (from we_analyzer.py) ==========
TREND_SLOPE_POS = 0.35
TREND_SLOPE_NEG = -0.35
TREND_MOMENTUM_STRONG = 1.5
TREND_DELTA_STRONG = 5.0
TREND_DELTA = 1.0

LEVEL_THRIVING = 43
LEVEL_CRITICAL = 3
LEVEL_HIGH = 32
LEVEL_LOW = 11

C_STABILITY_RANGE_EPS = 1e-6
STABILITY_STD_STABLE = 1.0
STABILITY_MOMENTUM_STABLE = 0.5
STABILITY_STD_UNSTABLE = 2.5

STABILITY_STD_STABLE_LONG = 1.5
STABILITY_MOMENTUM_STABLE_LONG = 0.8
STABILITY_STD_UNSTABLE_LONG = 3.0

MID_MIN_RECORDS = 3
CHANGE_TAG_THRESHOLD = 6.0
SHORT_MIN_DELTA = 2.0
MIN_SLOPE_POS = 0.20
MIN_SLOPE_NEG = -0.20
Z_POS = 0.8
Z_NEG = -0.8

TRAIT_WINDOW_MONTHS = 12
TRAIT_MIN_PERIODS = 3
SECTION_THRESHOLD = 0.5
TRAIT_MIN_HISTORY = 6
TRAIT_LEVEL_RATIO_MAX = 0.8
TRAIT_LEVEL_RATIO_MIN = 0.6
TRAIT_LEVEL_RATIO_DECAY = 12
TRAIT_COUNT_EPS = 1e-6
PATTERN_DOMINANCE_RATIO = 0.7
PATTERN_MIN_DATA_POINTS = 3
SLOPE_PATTERN_WINDOW = 12

V_COL = "vigor_rating"
D_COL = "dedication_rating"
A_COL = "absorption_rating"
E_COL = "Engagement"
WAVE_COL = "__wave__"
SECTION_COL = "__section__"
GROUP_COL = "__group__"
PERSON_COL = "__person__"

# ========== Metrics to Aggregate ==========
SHORTTERM_CONTINUOUS_METRICS = [
    'engagement', 'vigor', 'dedication', 'absorption',
    'E_delta_1', 'E_delta_1_prev', 'E_momentum_3', 'E_momentum_6',
    'E_mean_3', 'E_mean_6',
    'E_std_6', 'E_std_12', 'E_std_18',
    'E_iqr_6',
    'E_slope_6', 'E_slope_12', 'E_slope_6_std_12', 'E_accel_6',
    'V_delta_1', 'D_delta_1', 'A_delta_1',
    'V_slope_6', 'D_slope_6', 'A_slope_6'
]

LONGTERM_CONTINUOUS_METRICS = [
    'pct_high', 'pct_mid', 'pct_low',
    'episodes_recovery', 'episodes_fall',
    'recovery_rate', 'fall_rate',
    'low_streak_max', 'episodes_low2plus',
    'E_ma3', 'E_slope_3m', 'E_slope_3m_ma3', 'accel_3m',
    'trait_strength_conf_V', 'trait_strength_conf_D', 'trait_strength_conf_A',
    'trait_weakness_conf_V', 'trait_weakness_conf_D', 'trait_weakness_conf_A'
]

ALL_CONTINUOUS_METRICS = SHORTTERM_CONTINUOUS_METRICS + LONGTERM_CONTINUOUS_METRICS

# ========== Utility Functions (from we_analyzer.py) ==========
def _safe_numeric(s):
    return pd.to_numeric(s, errors="coerce")

def _to_wave(df: pd.DataFrame) -> pd.Series:
    if {"year", "month"}.issubset(df.columns):
        y = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
        m = pd.to_numeric(df["month"], errors="coerce").astype("Int64")
        return pd.Series(
            [f"{int(yy)}-{int(mm):02d}" if pd.notna(yy) and pd.notna(mm) else np.nan for yy, mm in zip(y, m)],
            index=df.index
        )
    elif "date" in df.columns:
        return pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m")
    else:
        raise RuntimeError("year/month または date が必要です。")

def _theil_sen_slope_window(y, max_len):
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return 0.0
    if len(arr) > max_len:
        arr = arr[-max_len:]
    n = len(arr)
    if n < 3:
        return float((arr[-1] - arr[0]) / (n - 1)) if n >= 2 else 0.0
    slopes = [(arr[j] - arr[i]) / (j - i) for i in range(n - 1) for j in range(i + 1, n)]
    return float(np.median(slopes)) if slopes else 0.0

def _rolling_momentum_last(y):
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    n = len(arr)
    if n < 3:
        return 0.0
    recent = float(np.nanmean(arr[-3:]))
    prior = float(np.nanmean(arr[-6:-3])) if n >= 6 else (float(np.nanmean(arr[:-3])) if n > 3 else recent)
    return float(recent - prior)

def _rolling_momentum_6_last(y):
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    n = len(arr)
    if n < 6:
        return 0.0
    recent = float(np.nanmean(arr[-6:]))
    prior = float(np.nanmean(arr[-12:-6])) if n >= 12 else (float(np.nanmean(arr[:-6])) if n > 6 else recent)
    return float(recent - prior)

def _iqr_last_window(y, win):
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return float("nan")
    arr = arr[-win:] if len(arr) >= win else arr
    if len(arr) == 0:
        return float("nan")
    return float(np.nanpercentile(arr, 75) - np.nanpercentile(arr, 25))

def _level_from_e(val: float) -> str:
    if pd.isna(val):
        return ""
    if val > LEVEL_THRIVING:
        return "Thriving"
    if val < LEVEL_CRITICAL:
        return "Critical"
    if val > LEVEL_HIGH:
        return "High"
    if val < LEVEL_LOW:
        return "Low"
    return "Moderate"

def bandify_level(x) -> str:
    if pd.isna(x):
        return "Unknown"
    if x in ("Thriving", "High"):
        return "High"
    if x == "Moderate":
        return "Mid"
    if x in ("Low", "Critical"):
        return "Low"
    return str(x)

def slope3_ols(y: np.ndarray) -> float:
    x = np.arange(len(y), dtype=float)
    if len(x) == 0:
        return np.nan
    xm, ym = x.mean(), y.mean()
    denom = ((x - xm) ** 2).sum()
    if denom == 0:
        return np.nan
    return float(((x - xm) * (y - ym)).sum() / denom)

def _dynamic_level_ratio_threshold(history_len: float) -> float:
    if not np.isfinite(history_len) or history_len <= 0:
        return float("inf")
    if history_len <= TRAIT_MIN_HISTORY:
        return TRAIT_LEVEL_RATIO_MAX
    if TRAIT_LEVEL_RATIO_DECAY <= 0:
        return TRAIT_LEVEL_RATIO_MIN
    excess = min(history_len - TRAIT_MIN_HISTORY, TRAIT_LEVEL_RATIO_DECAY)
    frac = excess / TRAIT_LEVEL_RATIO_DECAY
    return TRAIT_LEVEL_RATIO_MAX - (TRAIT_LEVEL_RATIO_MAX - TRAIT_LEVEL_RATIO_MIN) * frac

def _select_dim_labels(counts: dict[str, float]) -> list[str]:
    if not counts:
        return []
    max_val = max(counts.values())
    if not np.isfinite(max_val) or max_val <= 0:
        return []
    labels = [
        lab for lab, val in counts.items()
        if np.isfinite(val) and abs(val - max_val) <= TRAIT_COUNT_EPS and val > 0
    ]
    return labels

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
        segment = vals[max(0, i - window + 1):i + 1]
        if np.isfinite(segment).sum() < window:
            out.append(np.nan)
        else:
            out.append(_theil_sen_slope_window(segment, window))
    return pd.Series(out, index=series.index, dtype="float64")

def overwrite_short_mid_personal(use: pd.DataFrame, mid_window: int = 6) -> pd.DataFrame:
    df = use.copy().sort_values([PERSON_COL, WAVE_COL])
    dims = [("V", V_COL), ("D", D_COL), ("A", A_COL)]
    LABELS = ["V", "D", "A"]
    min_delta = SHORT_MIN_DELTA

    for dim, col in dims:
        dcol = f"{dim}_delta_1"
        if dcol not in df.columns:
            df[dcol] = df.groupby(PERSON_COL, sort=False)[col].apply(
                lambda s: s - s.shift(1)
            ).reset_index(level=0, drop=True)

    for dim, col in dims:
        scol = f"{dim}_slope_{mid_window}"
        if scol not in df.columns:
            df[scol] = df.groupby(PERSON_COL, sort=False)[col].apply(
                lambda s: _compute_personal_slope(s, mid_window)
            ).reset_index(level=0, drop=True)

    short_pos_cols, short_neg_cols, mid_pos_cols, mid_neg_cols = [], [], [], []

    for dim, col in dims:
        dcol = f"{dim}_delta_1"
        p90 = df.groupby(PERSON_COL, sort=False)[dcol].apply(
            lambda s: _expanding_quantile_exclusive(s, 0.90)
        ).reset_index(level=0, drop=True)
        p10 = df.groupby(PERSON_COL, sort=False)[dcol].apply(
            lambda s: _expanding_quantile_exclusive(s, 0.10)
        ).reset_index(level=0, drop=True)
        z = df.groupby(PERSON_COL, sort=False)[dcol].apply(
            _expanding_robust_z_exclusive
        ).reset_index(level=0, drop=True)

        th_pos = pd.Series(np.maximum(p90.values, min_delta), index=df.index)
        th_neg = pd.Series(np.minimum(p10.values, -min_delta), index=df.index)
        pos = (df[dcol] >= th_pos) & (z.isna() | (z >= Z_POS))
        neg = (df[dcol] <= th_neg) & (z.isna() | (z <= Z_NEG))

        sp = f"{dim}_short_strength_flag_self"
        sn = f"{dim}_short_weakness_flag_self"
        df[sp] = pos.fillna(False)
        df[sn] = neg.fillna(False)
        short_pos_cols.append(sp)
        short_neg_cols.append(sn)

        scol = f"{dim}_slope_{mid_window}"
        slope = df[scol]
        p90s = df.groupby(PERSON_COL, sort=False)[scol].apply(
            lambda s: _expanding_quantile_exclusive(s, 0.90)
        ).reset_index(level=0, drop=True)
        p10s = df.groupby(PERSON_COL, sort=False)[scol].apply(
            lambda s: _expanding_quantile_exclusive(s, 0.10)
        ).reset_index(level=0, drop=True)
        zs = df.groupby(PERSON_COL, sort=False)[scol].apply(
            _expanding_robust_z_exclusive
        ).reset_index(level=0, drop=True)

        th_pos_s = pd.Series(np.maximum(p90s.values, MIN_SLOPE_POS), index=df.index)
        th_neg_s = pd.Series(np.minimum(p10s.values, MIN_SLOPE_NEG), index=df.index)
        posm = slope.notna() & (slope >= th_pos_s) & (zs.isna() | (zs >= Z_POS))
        negm = slope.notna() & (slope <= th_neg_s) & (zs.isna() | (zs <= Z_NEG))

        mp = f"{dim}_mid_strength_flag_self"
        mn = f"{dim}_mid_weakness_flag_self"
        df[mp] = posm.fillna(False)
        df[mn] = negm.fillna(False)
        mid_pos_cols.append(mp)
        mid_neg_cols.append(mn)

    df["C_short_strength"] = [
        ", ".join([lab for lab, flg in zip(LABELS, [df[c].iat[i] for c in short_pos_cols]) if flg])
        for i in range(len(df))
    ]
    df["C_short_weakness"] = [
        ", ".join([lab for lab, flg in zip(LABELS, [df[c].iat[i] for c in short_neg_cols]) if flg])
        for i in range(len(df))
    ]
    df["C_mid_strength"] = [
        ", ".join([lab for lab, flg in zip(LABELS, [df[c].iat[i] for c in mid_pos_cols]) if flg])
        for i in range(len(df))
    ]
    df["C_mid_weakness"] = [
        ", ".join([lab for lab, flg in zip(LABELS, [df[c].iat[i] for c in mid_neg_cols]) if flg])
        for i in range(len(df))
    ]

    return df

def add_section_group_zscores(df_in, metrics):
    df = df_in.copy()
    for c in metrics:
        df[c] = _safe_numeric(df[c])

    def z_apply(g, suffix, key_cols):
        g_out = g.copy()
        key_vals = g.name if isinstance(g.name, tuple) else (g.name,)
        for col, val in zip(key_cols, key_vals):
            g_out[col] = val
        for c in metrics:
            mu, sd = g_out[c].mean(), g_out[c].std(ddof=0)
            g_out[f"{c}_z_{suffix}"] = 0.0 if (sd == 0 or pd.isna(sd)) else (g_out[c] - mu) / sd
        return g_out

    df = df.groupby([WAVE_COL, SECTION_COL], group_keys=False).apply(
        lambda g: z_apply(g, "section", [WAVE_COL, SECTION_COL]), include_groups=False
    )
    df = df.groupby([WAVE_COL, GROUP_COL], group_keys=False).apply(
        lambda g: z_apply(g, "group", [WAVE_COL, GROUP_COL]), include_groups=False
    )
    return df

def add_multiscale_features(df_in):
    df = df_in.copy().sort_values([PERSON_COL, WAVE_COL])
    rows = []
    for pid, g in df.groupby(PERSON_COL, sort=False):
        e = g[E_COL].to_numpy(float)
        v = g[V_COL].to_numpy(float)
        d = g[D_COL].to_numpy(float)
        a = g[A_COL].to_numpy(float)

        e_mean_3 = []
        e_mean_6 = []
        e_std_6 = []
        e_std_12 = []
        e_std_18 = []
        e_iqr_6 = []
        e_slope_12 = []
        e_slope_6 = []
        e_accel_6 = []
        e_slope_6_std_12 = []
        e_mom_3 = []
        e_mom_6 = []
        e_d1 = []
        e_d1p = []
        prev_slope6_vals = []
        v_s6 = []
        d_s6 = []
        a_s6 = []
        v_d1 = []
        d_d1 = []
        a_d1 = []
        prev_s6 = np.nan

        for i in range(len(g)):
            def _slope6(x):
                return _theil_sen_slope_window(x[:i + 1], 6)

            def _slope12(x):
                return _theil_sen_slope_window(x[:i + 1], 12)

            def _delta1(x):
                return float(x[i] - x[i - 1]) if i >= 1 else 0.0

            ep = e[:i + 1]
            e_mean_3.append(float(np.nanmean(ep[-3:])))
            e_mean_6.append(float(np.nanmean(ep[-6:])))
            e_std_6.append(float(np.nanstd(ep[-6:], ddof=0)))
            e_std_12.append(float(np.nanstd(ep[-12:], ddof=0)))
            e_std_18.append(float(np.nanstd(ep[-18:], ddof=0)))
            e_iqr_6.append(_iqr_last_window(ep, 6))
            s12 = _slope12(e)
            e_slope_12.append(s12)
            s6 = _slope6(e)
            e_slope_6.append(s6)

            std12 = float(np.nanstd(ep[-12:], ddof=0))
            if pd.notna(s6) and pd.notna(std12) and std12 > 0:
                e_slope_6_std_12.append(float(s6 / std12))
            else:
                e_slope_6_std_12.append(np.nan)

            prev_for_record = prev_s6 if np.isfinite(prev_s6) else s6
            prev_slope6_vals.append(prev_for_record)
            e_accel_6.append(float(s6 - prev_s6) if np.isfinite(prev_s6) and np.isfinite(s6) else 0.0)
            prev_s6 = s6
            e_mom_3.append(_rolling_momentum_last(ep))
            e_mom_6.append(_rolling_momentum_6_last(ep))
            e_d1.append(_delta1(e))
            e_d1p.append(float(e[i - 1] - e[i - 2])) if i >= 2 else e_d1p.append(0.0)
            v_s6.append(_slope6(v))
            d_s6.append(_slope6(d))
            a_s6.append(_slope6(a))
            v_d1.append(_delta1(v))
            d_d1.append(_delta1(d))
            a_d1.append(_delta1(a))

        tmp = g[[PERSON_COL, WAVE_COL]].copy()
        tmp["E_mean_3"] = e_mean_3
        tmp["E_mean_6"] = e_mean_6
        tmp["E_std_6"] = e_std_6
        tmp["E_std_12"] = e_std_12
        tmp["E_std_18"] = e_std_18
        tmp["E_iqr_6"] = e_iqr_6
        tmp["E_slope_12"] = e_slope_12
        tmp["E_slope_6"] = e_slope_6
        tmp["E_slope_6_std_12"] = e_slope_6_std_12
        tmp["E_accel_6"] = e_accel_6
        tmp["Prev_E_slope_6"] = prev_slope6_vals
        tmp["E_momentum_3"] = e_mom_3
        tmp["E_momentum_6"] = e_mom_6
        tmp["E_delta_1"] = e_d1
        tmp["E_delta_1_prev"] = e_d1p
        tmp["V_slope_6"] = v_s6
        tmp["D_slope_6"] = d_s6
        tmp["A_slope_6"] = a_s6
        tmp["V_delta_1"] = v_d1
        tmp["D_delta_1"] = d_d1
        tmp["A_delta_1"] = a_d1
        rows.append(tmp)

    feats = pd.concat(rows, ignore_index=True) if rows else df[[PERSON_COL, WAVE_COL]].copy()
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

        if base == "低下中" and recent == "横ばい" and has_d1 and d1 > TREND_DELTA:
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
            (base == "低下中" or (base == "安定" and has_prev_slope and prev_slope <= TREND_SLOPE_NEG))
            and recent == "上昇"
            and has_d1
            and d1 >= TREND_DELTA_STRONG
            and (strong_momentum_up or consecutive_strong_up)
        )
        if recovery and pd.notna(current_e) and pd.notna(max6):
            return "回復" if current_e <= max6 else "復活"

        if base == "上昇中" and recent == "横ばい" and has_d1 and d1 < -TREND_DELTA:
            return "低下懸念"

        if (
            base == "安定"
            and recent == "上昇"
            and has_slope
            and (-TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS)
            and has_d1
            and d1 > TREND_DELTA
            and (strong_momentum_up or (pd.notna(d1_prev) and d1_prev <= SHORT_MIN_DELTA))
        ):
            return "上昇期待"

        if (
            base == "安定"
            and recent == "下降"
            and has_slope
            and (-TREND_SLOPE_POS < slope_val < TREND_SLOPE_POS)
            and has_d1
            and d1 < -TREND_DELTA
            and pd.notna(d1_prev)
            and d1_prev >= 0
            and (d1 <= -TREND_DELTA_STRONG or (has_mom and mom <= -TREND_MOMENTUM_STRONG))
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

    def _const_window_range(series: pd.Series, window: int) -> pd.Series:
        roll = series.rolling(window=window, min_periods=window)
        return roll.max() - roll.min()

    range_e = group_sorted[E_COL].transform(lambda s: _const_window_range(s, mid_window))
    range_v = group_sorted[V_COL].transform(lambda s: _const_window_range(s, mid_window))
    range_d = group_sorted[D_COL].transform(lambda s: _const_window_range(s, mid_window))
    range_a = group_sorted[A_COL].transform(lambda s: _const_window_range(s, mid_window))

    same_flag = (
        range_e.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_v.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_d.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_a.le(C_STABILITY_RANGE_EPS).fillna(False)
    )

    std_flag = df_sorted["E_std_6"]
    abs_momentum = df_sorted["E_momentum_3"].abs()

    stable_flag = (std_flag <= STABILITY_STD_STABLE) & (abs_momentum < STABILITY_MOMENTUM_STABLE)
    unstable_flag = std_flag >= STABILITY_STD_UNSTABLE

    counts = df_sorted.groupby(PERSON_COL, sort=False)[PERSON_COL].transform("size")
    has_mid_history = counts > MID_MIN_RECORDS
    stability_values = np.array([""] * len(df_sorted), dtype=object)
    if has_mid_history.any():
        evaluated = np.select(
            [same_flag, stable_flag, unstable_flag], ["不変", "安定", "不安定"], default="やや安定"
        )
        stability_values[has_mid_history] = evaluated[has_mid_history]
    df_sorted["C_stability"] = stability_values

    range_e_12 = group_sorted[E_COL].transform(lambda s: _const_window_range(s, 12))
    range_v_12 = group_sorted[V_COL].transform(lambda s: _const_window_range(s, 12))
    range_d_12 = group_sorted[D_COL].transform(lambda s: _const_window_range(s, 12))
    range_a_12 = group_sorted[A_COL].transform(lambda s: _const_window_range(s, 12))

    same_flag_long = (
        range_e_12.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_v_12.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_d_12.le(C_STABILITY_RANGE_EPS).fillna(False)
        & range_a_12.le(C_STABILITY_RANGE_EPS).fillna(False)
    )

    std_flag_long = df_sorted["E_std_12"]
    abs_momentum_long = df_sorted["E_momentum_6"].abs()

    stable_flag_long = (std_flag_long <= STABILITY_STD_STABLE_LONG) & (abs_momentum_long < STABILITY_MOMENTUM_STABLE_LONG)
    unstable_flag_long = std_flag_long >= STABILITY_STD_UNSTABLE_LONG

    has_long_history = counts > 12
    stability_long_values = np.array([""] * len(df_sorted), dtype=object)
    if has_long_history.any():
        evaluated_long = np.select(
            [same_flag_long, stable_flag_long, unstable_flag_long],
            ["完全不変", "持続安定", "持続不安定"],
            default="やや持続安定"
        )
        stability_long_values[has_long_history] = evaluated_long[has_long_history]
    df_sorted["C_stability_long"] = stability_long_values

    df_sorted["_trait_level_band"] = df_sorted[E_COL].apply(_level_from_e).apply(bandify_level)
    dims = [
        ("V", f"{V_COL}_z_section"),
        ("D", f"{D_COL}_z_section"),
        ("A", f"{A_COL}_z_section"),
    ]
    trait_strength = {}
    trait_weakness = {}
    trait_strength_conf_V = {}
    trait_strength_conf_D = {}
    trait_strength_conf_A = {}
    trait_weakness_conf_V = {}
    trait_weakness_conf_D = {}
    trait_weakness_conf_A = {}

    for pid, g in df_sorted.groupby(PERSON_COL, sort=False):
        band = g["_trait_level_band"]
        valid_level = band.isin(["High", "Mid", "Low"]).astype(float)
        high_indicator = band.eq("High").astype(float)
        low_indicator = band.eq("Low").astype(float)

        level_count = valid_level.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()
        high_count = high_indicator.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()
        low_count = low_indicator.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()

        strength_counts_series = {}
        weakness_counts_series = {}
        for label, col in dims:
            s_flag = (g[col] >= SECTION_THRESHOLD).astype(float).where(g[col].notna(), 0.0)
            w_flag = (g[col] <= -SECTION_THRESHOLD).astype(float).where(g[col].notna(), 0.0)
            strength_counts_series[label] = s_flag.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()
            weakness_counts_series[label] = w_flag.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()

        strength_labels = []
        weakness_labels = []
        conf_v_s = []
        conf_d_s = []
        conf_a_s = []
        conf_v_w = []
        conf_d_w = []
        conf_a_w = []

        for idx in range(len(g)):
            history_len = level_count.iloc[idx]
            high_cnt = high_count.iloc[idx]
            low_cnt = low_count.iloc[idx]

            label_strength = ""
            cv_s = np.nan
            cd_s = np.nan
            ca_s = np.nan

            if pd.notna(history_len) and history_len >= TRAIT_MIN_HISTORY:
                threshold_high = _dynamic_level_ratio_threshold(history_len)
                pct_high = (high_cnt / history_len) if history_len > 0 else np.nan
                if pd.notna(pct_high) and pct_high >= threshold_high:
                    counts_dict = {lab: strength_counts_series[lab].iloc[idx] for lab, _ in dims}
                    total = sum(counts_dict.values())
                    if total > 0:
                        cv_s = counts_dict["V"] / total
                        cd_s = counts_dict["D"] / total
                        ca_s = counts_dict["A"] / total
                    labels = _select_dim_labels(counts_dict)
                    label_strength = ", ".join(labels)

            label_weakness = ""
            cv_w = np.nan
            cd_w = np.nan
            ca_w = np.nan

            if pd.notna(history_len) and history_len >= TRAIT_MIN_HISTORY:
                threshold_low = _dynamic_level_ratio_threshold(history_len)
                pct_low = (low_cnt / history_len) if history_len > 0 else np.nan
                if pd.notna(pct_low) and pct_low >= threshold_low:
                    counts_dict = {lab: weakness_counts_series[lab].iloc[idx] for lab, _ in dims}
                    total = sum(counts_dict.values())
                    if total > 0:
                        cv_w = counts_dict["V"] / total
                        cd_w = counts_dict["D"] / total
                        ca_w = counts_dict["A"] / total
                    labels = _select_dim_labels(counts_dict)
                    label_weakness = ", ".join(labels)

            strength_labels.append(label_strength)
            weakness_labels.append(label_weakness)
            conf_v_s.append(cv_s)
            conf_d_s.append(cd_s)
            conf_a_s.append(ca_s)
            conf_v_w.append(cv_w)
            conf_d_w.append(cd_w)
            conf_a_w.append(ca_w)

        trait_strength.update(zip(g.index, strength_labels))
        trait_weakness.update(zip(g.index, weakness_labels))
        trait_strength_conf_V.update(zip(g.index, conf_v_s))
        trait_strength_conf_D.update(zip(g.index, conf_d_s))
        trait_strength_conf_A.update(zip(g.index, conf_a_s))
        trait_weakness_conf_V.update(zip(g.index, conf_v_w))
        trait_weakness_conf_D.update(zip(g.index, conf_d_w))
        trait_weakness_conf_A.update(zip(g.index, conf_a_w))

    df_sorted["C_trait_strength"] = df_sorted.index.map(trait_strength).fillna("")
    df_sorted["C_trait_weakness"] = df_sorted.index.map(trait_weakness).fillna("")
    df_sorted["trait_strength_conf_V"] = df_sorted.index.map(trait_strength_conf_V)
    df_sorted["trait_strength_conf_D"] = df_sorted.index.map(trait_strength_conf_D)
    df_sorted["trait_strength_conf_A"] = df_sorted.index.map(trait_strength_conf_A)
    df_sorted["trait_weakness_conf_V"] = df_sorted.index.map(trait_weakness_conf_V)
    df_sorted["trait_weakness_conf_D"] = df_sorted.index.map(trait_weakness_conf_D)
    df_sorted["trait_weakness_conf_A"] = df_sorted.index.map(trait_weakness_conf_A)
    df_sorted.drop(columns=["_trait_level_band"], inplace=True, errors="ignore")

    return df_sorted.sort_index()

def compute_monthly_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pid, g in individuals.groupby(PERSON_COL):
        g_sorted = g.sort_values(WAVE_COL)
        e_series = g_sorted.set_index(WAVE_COL)[E_COL]

        if e_series.empty:
            continue

        E_ma3 = e_series.rolling(3, min_periods=1).mean()

        slope_vals = [np.nan] * len(e_series)
        if len(e_series) >= 3:
            for i in range(2, len(e_series)):
                arr = e_series.iloc[i - 2:i + 1].values.astype(float)
                if np.isfinite(arr).sum() >= 3:
                    slope_vals[i] = slope3_ols(arr)
        slope_s = pd.Series(slope_vals, index=e_series.index)

        slope_ma3 = slope_s.rolling(3, min_periods=1).mean()

        accel_vals = [np.nan] * len(slope_s)
        if len(slope_s) >= 3:
            for i in range(2, len(slope_s)):
                arr = slope_s.iloc[i - 2:i + 1].values.astype(float)
                if np.isfinite(arr).sum() >= 3:
                    accel_vals[i] = slope3_ols(arr)
        accel_s = pd.Series(accel_vals, index=e_series.index)

        rows.append(
            pd.DataFrame(
                {
                    PERSON_COL: pid,
                    WAVE_COL: e_series.index,
                    "E_ma3": E_ma3.values,
                    "E_slope_3m": slope_s.values,
                    "E_slope_3m_ma3": slope_ma3.values,
                    "accel_3m": accel_s.values,
                }
            )
        )
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=[PERSON_COL, WAVE_COL])

def compute_expanding_episode_distribution_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pid, g in individuals.sort_values([PERSON_COL, WAVE_COL]).groupby(PERSON_COL):
        g = g.reset_index(drop=True)
        lv_list = g["Level_A"].apply(bandify_level).tolist()
        waves = g[WAVE_COL].tolist()

        for idx in range(len(g)):
            lv_upto_now = lv_list[:idx + 1]
            n = len(lv_upto_now)

            rec = 0
            fall = 0
            for i in range(1, len(lv_upto_now)):
                prev_band = lv_upto_now[i - 1]
                curr_band = lv_upto_now[i]
                if prev_band == "Low" and curr_band in ("Mid", "High"):
                    rec += 1
                if prev_band in ("Mid", "High") and curr_band == "Low":
                    fall += 1

            pct_high = float(sum(1 for x in lv_upto_now if x == "High") / n) if n else np.nan
            pct_mid = float(sum(1 for x in lv_upto_now if x == "Mid") / n) if n else np.nan
            pct_low = float(sum(1 for x in lv_upto_now if x == "Low") / n) if n else np.nan

            max_streak = 0
            cur_streak = 0
            for x in lv_upto_now:
                if x == "Low":
                    cur_streak += 1
                    max_streak = max(max_streak, cur_streak)
                else:
                    cur_streak = 0

            episodes2 = 0
            cur_streak = 0
            for x in lv_upto_now:
                if x == "Low":
                    cur_streak += 1
                else:
                    if cur_streak >= 2:
                        episodes2 += 1
                    cur_streak = 0
            if cur_streak >= 2:
                episodes2 += 1

            observed_months = idx + 1
            fall_rate = float(fall / observed_months) if observed_months > 0 else 0.0
            recovery_rate = float(rec / fall) if fall else 0.0

            rows.append({
                PERSON_COL: pid,
                WAVE_COL: waves[idx],
                "episodes_recovery": rec,
                "episodes_fall": fall,
                "pct_high": pct_high,
                "pct_mid": pct_mid,
                "pct_low": pct_low,
                "low_streak_max": int(max_streak),
                "episodes_low2plus": int(episodes2),
                "recovery_rate": recovery_rate,
                "fall_rate": fall_rate,
            })

    return pd.DataFrame(rows)

# ========== Individual Metrics Computation ==========
def compute_individual_metrics(input_path: Path) -> pd.DataFrame:
    """
    Process workengagement.xlsx to compute individual-level metrics
    Returns: DataFrame with all individual metrics for all waves
    """
    xl = pd.ExcelFile(input_path)
    sheet = "rating2" if "rating2" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet)

    df[WAVE_COL] = _to_wave(df)
    df[SECTION_COL] = df["section"] if "section" in df.columns else "Unknown"
    gr = df["group"].astype(str).str.strip() if "group" in df.columns else pd.Series(["Unknown"] * len(df), index=df.index)
    df[GROUP_COL] = np.where(gr.eq("") | gr.str.lower().eq("nan"), df[SECTION_COL], gr)

    if "mail_address" in df.columns:
        df[PERSON_COL] = df["mail_address"]
    elif "name" in df.columns:
        df[PERSON_COL] = df["name"]
    else:
        raise RuntimeError("個人識別列（mail_address または name）が必要です。")

    for c in [V_COL, D_COL, A_COL]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    if "engagement_rating" in df.columns:
        df[E_COL] = pd.to_numeric(df["engagement_rating"], errors="coerce")
    else:
        df[E_COL] = df[[V_COL, D_COL, A_COL]].sum(axis=1, min_count=3)

    cols_to_use = [PERSON_COL, "name", WAVE_COL, V_COL, D_COL, A_COL, E_COL]
    if SECTION_COL in df.columns:
        cols_to_use.append(SECTION_COL)
    if GROUP_COL in df.columns:
        cols_to_use.append(GROUP_COL)

    use = df[cols_to_use].copy()
    use = add_section_group_zscores(use, [V_COL, D_COL, A_COL, E_COL])
    use = add_multiscale_features(use)
    use = overwrite_short_mid_personal(use, mid_window=6)
    use = apply_personal_trend_logic(use)
    use = compute_C_columns(use, mid_window=6)
    use["Level_A"] = use[E_COL].apply(_level_from_e)
    use["ChangeTag"] = np.where(np.abs(use["E_delta_1"]) >= CHANGE_TAG_THRESHOLD, "変化大", "")

    monthly_metrics_df = compute_monthly_metrics(use)
    use = use.merge(monthly_metrics_df, on=[PERSON_COL, WAVE_COL], how="left")

    epi_dist_df = compute_expanding_episode_distribution_metrics(use)
    use = use.merge(epi_dist_df, on=[PERSON_COL, WAVE_COL], how="left")

    # Rename columns
    column_mapping = {
        PERSON_COL: "person",
        WAVE_COL: "wave",
        V_COL: "vigor",
        D_COL: "dedication",
        A_COL: "absorption",
        E_COL: "engagement",
        SECTION_COL: "section",
        GROUP_COL: "group"
    }
    use = use.rename(columns=column_mapping)

    return use

# ========== Organizational Statistics ==========
def calc_org_statistics(group_df: pd.DataFrame, wave_date, org_type: str, org_name: str) -> dict:
    """
    Calculate mean, median, sd, q25, q75, iqr, min, max
    for all continuous metrics in a single organization at a single wave
    """
    stats = {
        'wave': wave_date,
        'org_type': org_type,
        'org_name': org_name,
        'member_count': len(group_df)
    }

    for metric in ALL_CONTINUOUS_METRICS:
        if metric in group_df.columns:
            values = pd.to_numeric(group_df[metric], errors='coerce').dropna()

            if len(values) > 0:
                stats[f'{metric}_mean'] = float(values.mean())
                stats[f'{metric}_median'] = float(values.median())
                stats[f'{metric}_sd'] = float(values.std(ddof=1))
                stats[f'{metric}_q25'] = float(values.quantile(0.25))
                stats[f'{metric}_q75'] = float(values.quantile(0.75))
                stats[f'{metric}_iqr'] = float(values.quantile(0.75) - values.quantile(0.25))
                stats[f'{metric}_min'] = float(values.min())
                stats[f'{metric}_max'] = float(values.max())
            else:
                for suffix in ['mean', 'median', 'sd', 'q25', 'q75', 'iqr', 'min', 'max']:
                    stats[f'{metric}_{suffix}'] = np.nan

    return stats

def create_monthly_trends(individuals_df: pd.DataFrame) -> pd.DataFrame:
    """
    For each wave, calculate organizational statistics
    Returns: DataFrame with time series of org stats
    """
    all_stats = []

    waves = sorted(individuals_df['wave'].dropna().unique())

    for wave in waves:
        wave_data = individuals_df[individuals_df['wave'] == wave].copy()

        # Section level
        if 'section' in wave_data.columns:
            for section, section_group in wave_data.groupby('section'):
                stats = calc_org_statistics(section_group, wave, 'Section', section)
                all_stats.append(stats)

        # Group level
        if 'group' in wave_data.columns:
            for group, group_group in wave_data.groupby('group'):
                stats = calc_org_statistics(group_group, wave, 'Group', group)
                all_stats.append(stats)

        # Whole organization
        stats = calc_org_statistics(wave_data, wave, 'Whole', 'All')
        all_stats.append(stats)

    return pd.DataFrame(all_stats)

def create_latest_index(monthly_trends_df: pd.DataFrame) -> pd.DataFrame:
    """Extract just the latest wave from monthly_trends"""
    latest_wave = monthly_trends_df['wave'].max()
    return monthly_trends_df[monthly_trends_df['wave'] == latest_wave].copy()

def write_output(output_path: Path, monthly_trends: pd.DataFrame, latest_index: pd.DataFrame):
    """Write to Excel with formatting"""
    try:
        import xlsxwriter
        engine = 'xlsxwriter'
    except ImportError:
        engine = None

    with pd.ExcelWriter(output_path, engine=engine) as writer:
        monthly_trends.to_excel(writer, sheet_name='monthly_trends', index=False)
        latest_index.to_excel(writer, sheet_name='latest_index', index=False)

        if engine == 'xlsxwriter':
            wb = writer.book
            float_fmt = wb.add_format({'num_format': '0.00'})
            int_fmt = wb.add_format({'num_format': '0'})
            pct_fmt = wb.add_format({'num_format': '0.00%'})

            for sheet_name in ['monthly_trends', 'latest_index']:
                ws = writer.sheets[sheet_name]
                ws.freeze_panes(1, 3)
                ws.autofilter(0, 0, 0, monthly_trends.shape[1] - 1)

                col_idx = {c: i for i, c in enumerate(monthly_trends.columns)}

                # Integer columns
                if 'member_count' in col_idx:
                    ws.set_column(col_idx['member_count'], col_idx['member_count'], 12, int_fmt)

                # Float columns (all statistics)
                for col in monthly_trends.columns:
                    if any(suffix in col for suffix in ['_mean', '_median', '_sd', '_q25', '_q75', '_iqr', '_min', '_max']):
                        if col in col_idx:
                            ws.set_column(col_idx[col], col_idx[col], 12, float_fmt)

                    # Percentage columns (rate metrics)
                    if any(x in col for x in ['recovery_rate', 'fall_rate', 'pct_']):
                        if col in col_idx and '_mean' not in col:  # Don't double-format aggregated rates
                            pass  # Already handled by float_fmt above

def main():
    parser = argparse.ArgumentParser(
        description="WE Organization Analyzer - 組織別統計分析（時系列）"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        default="workengagement.xlsx",
        help="入力ファイル (workengagement.xlsx)"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="org_statistics.xlsx",
        help="出力ファイル (org_statistics.xlsx)"
    )
    args = parser.parse_args()

    print("Step 1: Processing individual metrics...")
    individuals_df = compute_individual_metrics(Path(args.input))
    print(f"  ✓ Processed {len(individuals_df)} individual records")

    print("Step 2: Calculating organizational statistics for all waves...")
    monthly_trends = create_monthly_trends(individuals_df)
    print(f"  ✓ Calculated {len(monthly_trends)} org×wave statistics")

    print("Step 3: Extracting latest wave statistics...")
    latest_index = create_latest_index(monthly_trends)
    print(f"  ✓ Extracted {len(latest_index)} latest org statistics")

    print("Step 4: Writing output...")
    write_output(Path(args.output), monthly_trends, latest_index)

    print(f"\n✓ 完了: {Path(args.output).resolve()}")
    print(f"  - monthly_trends: {len(monthly_trends)} rows (組織×Wave別統計)")
    print(f"  - latest_index: {len(latest_index)} rows (最新Wave組織別統計)")

if __name__ == "__main__":
    main()
