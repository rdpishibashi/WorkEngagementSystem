# -*- coding: utf-8 -*-
"""
WE Playbook Builder - ワーク・エンゲージメント プレイブック生成スクリプト

入力: workengagement.xlsx のみ
出力: we_playbook.xlsx (4シート)
  1. shortterm - 最新Wave時点のメンバー短期状態（name カラムまで固定枠）
  2. monthly_trends - 全員×全Wave の月次時系列（個人分析用、属性カラムなし）
  3. longterm - 個人の長期傾向・特性（name カラムまで固定枠、属性カラムなし）
  4. LatestIndividuals - 最新Waveのみ（monthly_trendsと同じ列構成）
"""
from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd
import argparse

# ========== Constants (from we_analyzer.py) ==========
# Trend detection
TREND_SLOPE_POS = 0.35
TREND_SLOPE_NEG = -0.35
TREND_MOMENTUM_STRONG = 1.5
TREND_DELTA_STRONG = 5.0
TREND_DELTA = 1.0

# Level thresholds
LEVEL_THRIVING = 43
LEVEL_CRITICAL = 3
LEVEL_HIGH = 32
LEVEL_LOW = 11

# Stability thresholds
C_STABILITY_RANGE_EPS = 1e-6
STABILITY_STD_STABLE = 1.0          # E_std_6 <= this for "安定"
STABILITY_MOMENTUM_STABLE = 0.5     # |E_momentum_3| < this for "安定"
STABILITY_STD_UNSTABLE = 2.5        # E_std_6 >= this for "不安定"

# History requirements
MID_MIN_RECORDS = 3

# Change detection
CHANGE_TAG_THRESHOLD = 6.0
SHORT_MIN_DELTA = 2.0
MIN_SLOPE_POS = 0.20
MIN_SLOPE_NEG = -0.20
Z_POS = 0.8
Z_NEG = -0.8

# Trait analysis
TRAIT_WINDOW_MONTHS = 12            # 12ヶ月ロール中央値のウィンドウ
TRAIT_MIN_PERIODS = 3               # 最小データ点数
SECTION_THRESHOLD = 0.5             # C_trait_strength/weakness の閾値

# Pattern detection (longterm)
PATTERN_DOMINANCE_RATIO = 0.7       # Net Growth/Decline 判定の比率閾値
PATTERN_MIN_DATA_POINTS = 3         # パターン判定に必要な最小データ点数

# Input validation (shortterm)
CONSTANT_PERIOD_DAYS = 183          # 6ヶ月 = 183日（flag_constant_6m）

V_COL = "vigor_rating"
D_COL = "dedication_rating"
A_COL = "absorption_rating"
E_COL = "Engagement"
WAVE_COL = "__wave__"
SECTION_COL = "__section__"
GROUP_COL = "__group__"
PERSON_COL = "__person__"

# ========== Utility Functions ==========
def norm_person(s: pd.Series) -> pd.Series:
    """個人IDの正規化（小文字・trim）"""
    return s.astype(str).str.lower().str.strip()

def _to_wave(df: pd.DataFrame) -> pd.Series:
    """年月からWave（月末Timestamp）を生成"""
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

def wave_to_timestamp(wave_str: pd.Series) -> pd.Series:
    """Wave文字列（YYYY-MM）を月末Timestampに変換"""
    return pd.to_datetime(wave_str + "-01", errors="coerce").dt.to_period("M").dt.to_timestamp("M")

def _safe_numeric(s):
    return pd.to_numeric(s, errors="coerce")

def _theil_sen_slope_window(y, max_len):
    """Theil-Sen傾き推定（外れ値に頑健）"""
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
    """3ヶ月モメンタム（直近3ヶ月平均 - 前3ヶ月平均）"""
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    n = len(arr)
    if n < 3:
        return 0.0
    recent = float(np.nanmean(arr[-3:]))
    prior = float(np.nanmean(arr[-6:-3])) if n >= 6 else (float(np.nanmean(arr[:-3])) if n > 3 else recent)
    return float(recent - prior)

def _iqr_last_window(y, win):
    """IQR（四分位範囲）計算"""
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return float("nan")
    arr = arr[-win:] if len(arr) >= win else arr
    if len(arr) == 0:
        return float("nan")
    return float(np.nanpercentile(arr, 75) - np.nanpercentile(arr, 25))

def _level_from_e(val: float) -> str:
    """Engagement値からLevel_Aを判定"""
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
    """Level_Aをバンド化（High/Mid/Low）

    バンド化ルール:
    - High: Thriving, High
    - Mid:  Moderate
    - Low:  Low, Critical

    エピソード計算では、Critical を Low と同じ仲間、Thriving を High と同じ仲間として扱います。
    """
    if pd.isna(x):
        return "Unknown"
    if x in ("Thriving", "High"):
        return "High"
    if x == "Moderate":
        return "Mid"
    if x in ("Low", "Critical"):
        return "Low"
    return str(x)

def parse_trait_list(val):
    """カンマ区切りの特性リストをパース"""
    if isinstance(val, str):
        return [s.strip() for s in val.split(",") if s.strip()]
    return []

def slope3_ols(y: np.ndarray) -> float:
    """3点の単回帰傾き（OLS）"""
    x = np.arange(len(y), dtype=float)
    if len(x) == 0:
        return np.nan
    xm, ym = x.mean(), y.mean()
    denom = ((x - xm) ** 2).sum()
    if denom == 0:
        return np.nan
    return float(((x - xm) * (y - ym)).sum() / denom)

# ========== Personal Short/Mid Computation ==========
def _expanding_quantile_exclusive(series: pd.Series, q: float) -> pd.Series:
    """expanding quantile（当該行を除外）"""
    return series.expanding(min_periods=1).quantile(q).shift(1)

def _expanding_robust_z_exclusive(series: pd.Series, eps: float = 1e-9) -> pd.Series:
    """expanding robust Z-score（MAD使用、当該行を除外）"""
    med = series.expanding(min_periods=1).median().shift(1)
    abs_dev = (series - med).abs()
    mad = 1.4826 * abs_dev.expanding(min_periods=1).median().shift(1)
    z = (series - med) / mad
    z[(mad.isna()) | (mad < eps)] = np.nan
    return z

def _compute_personal_slope(series: pd.Series, window: int) -> pd.Series:
    """個人内のTheil-Sen傾き計算"""
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
    """短期・中期の個人内強み/弱みを計算"""
    df = use.copy().sort_values([PERSON_COL, WAVE_COL])
    dims = [("V", V_COL), ("D", D_COL), ("A", A_COL)]
    LABELS = ["活力", "熱意", "没頭"]
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

# ========== Section/Group Z-scores ==========
def add_section_group_zscores(df_in, metrics):
    """部門/グループ内でのZ-scoreを計算"""
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

# ========== Multi-scale Features ==========
def add_multiscale_features(df_in):
    """多層時系列特徴量を追加"""
    df = df_in.copy().sort_values([PERSON_COL, WAVE_COL])
    rows = []
    for pid, g in df.groupby(PERSON_COL, sort=False):
        e = g[E_COL].to_numpy(float)
        v = g[V_COL].to_numpy(float)
        d = g[D_COL].to_numpy(float)
        a = g[A_COL].to_numpy(float)
        e_mean_6 = []
        e_std_6 = []
        e_iqr_6 = []
        e_slope_12 = []
        e_slope_6 = []
        e_accel_6 = []
        e_mom_3 = []
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
            e_mean_6.append(float(np.nanmean(ep[-6:])))
            e_std_6.append(float(np.nanstd(ep[-6:], ddof=0)))
            e_iqr_6.append(_iqr_last_window(ep, 6))
            s12 = _slope12(e)
            e_slope_12.append(s12)
            s6 = _slope6(e)
            e_slope_6.append(s6)
            prev_for_record = prev_s6 if np.isfinite(prev_s6) else s6
            prev_slope6_vals.append(prev_for_record)
            e_accel_6.append(float(s6 - prev_s6) if np.isfinite(prev_s6) and np.isfinite(s6) else 0.0)
            prev_s6 = s6
            e_mom_3.append(_rolling_momentum_last(ep))
            e_d1.append(_delta1(e))
            e_d1p.append(float(e[i - 1] - e[i - 2])) if i >= 2 else e_d1p.append(0.0)
            v_s6.append(_slope6(v))
            d_s6.append(_slope6(d))
            a_s6.append(_slope6(a))
            v_d1.append(_delta1(v))
            d_d1.append(_delta1(d))
            a_d1.append(_delta1(a))
        tmp = g[[PERSON_COL, WAVE_COL]].copy()
        tmp["E_mean_6"] = e_mean_6
        tmp["E_std_6"] = e_std_6
        tmp["E_iqr_6"] = e_iqr_6
        tmp["E_slope_12"] = e_slope_12
        tmp["E_slope_6"] = e_slope_6
        tmp["E_accel_6"] = e_accel_6
        tmp["Prev_E_slope_6"] = prev_slope6_vals
        tmp["E_momentum_3"] = e_mom_3
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

# ========== Personal Trend Logic ==========
def apply_personal_trend_logic(df_in: pd.DataFrame) -> pd.DataFrame:
    """個人トレンド判定ロジック"""
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

# ========== C_columns (Stability, Traits) ==========
def compute_C_columns(df_in: pd.DataFrame, mid_window: int) -> pd.DataFrame:
    """安定性・特性強み/弱みを計算"""
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

    trait_strength = {}
    trait_weakness = {}
    for pid, g in df_sorted.groupby(PERSON_COL, sort=False):
        med_v = g[f"{V_COL}_z_section"].rolling(window=TRAIT_WINDOW_MONTHS, min_periods=TRAIT_MIN_PERIODS).median()
        med_d = g[f"{D_COL}_z_section"].rolling(window=TRAIT_WINDOW_MONTHS, min_periods=TRAIT_MIN_PERIODS).median()
        med_a = g[f"{A_COL}_z_section"].rolling(window=TRAIT_WINDOW_MONTHS, min_periods=TRAIT_MIN_PERIODS).median()

        ts = []
        tw = []
        for k in range(len(g)):
            labels = [("活力", med_v.iloc[k]), ("熱意", med_d.iloc[k]), ("没頭", med_a.iloc[k])]
            ts.append(", ".join([lab for lab, val in labels if pd.notna(val) and val >= SECTION_THRESHOLD]))
            tw.append(", ".join([lab for lab, val in labels if pd.notna(val) and val <= -SECTION_THRESHOLD]))
        trait_strength.update(zip(g.index, ts))
        trait_weakness.update(zip(g.index, tw))

    df_sorted["C_trait_strength"] = df_sorted.index.map(trait_strength).fillna("")
    df_sorted["C_trait_weakness"] = df_sorted.index.map(trait_weakness).fillna("")

    return df_sorted.sort_index()

# ========== Monthly Metrics ==========
def compute_monthly_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    """月次メトリクス（E_ma3, slope_3m, slope_3m_ma3, accel_3m）を計算
    注: E_monthly は Engagement と同じなので削除"""
    rows = []
    for pid, g in individuals.groupby(PERSON_COL):
        g_sorted = g.sort_values(WAVE_COL)
        # Engagement 値をそのまま使用（月次リサンプリング不要）
        e_series = g_sorted.set_index(WAVE_COL)[E_COL]

        if e_series.empty:
            continue

        # 3ヶ月移動平均
        E_ma3 = e_series.rolling(3, min_periods=1).mean()

        # slope_3m: 3点の単回帰傾き
        slope_vals = [np.nan] * len(e_series)
        if len(e_series) >= 3:
            for i in range(2, len(e_series)):
                arr = e_series.iloc[i - 2:i + 1].values.astype(float)
                if np.isfinite(arr).sum() >= 3:
                    slope_vals[i] = slope3_ols(arr)
        slope_s = pd.Series(slope_vals, index=e_series.index)

        # slope_3m の3ヶ月移動平均
        slope_ma3 = slope_s.rolling(3, min_periods=1).mean()

        # accel_3m: slope_3m の加速度（3点傾き）
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
                    "slope_3m": slope_s.values,
                    "slope_3m_ma3": slope_ma3.values,
                    "accel_3m": accel_s.values,
                }
            )
        )
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=[PERSON_COL, WAVE_COL])

def compute_monthly_metrics_for_pattern(individuals: pd.DataFrame) -> pd.DataFrame:
    """longterm のパターン判定用の月次メトリクスを計算（後方互換用）"""
    metrics = compute_monthly_metrics(individuals)
    return metrics[[PERSON_COL, WAVE_COL, "slope_3m"]].rename(columns={WAVE_COL: "__month__"})

# ========== Shortterm Members ==========
def build_shortterm(individuals: pd.DataFrame, raw: pd.DataFrame, latest_wave: pd.Timestamp) -> pd.DataFrame:
    """shortterm シートを構築"""
    short = individuals[individuals[WAVE_COL] == latest_wave].copy()
    # 列順: __person__, name, project, grade, __section__, __group__, ...
    need = [PERSON_COL, "name", "project", "grade", SECTION_COL, GROUP_COL, WAVE_COL, "Level_A", "Trend_B_refined"]
    for c in need:
        if c not in short.columns:
            short[c] = np.nan

    short = short[need].drop_duplicates()

    # flag_constant_6m の計算
    six_m = pd.Timedelta(days=CONSTANT_PERIOD_DAYS)
    flags = []
    for pid, g in raw.groupby(PERSON_COL):
        g = g.sort_values(WAVE_COL)
        for col in [E_COL, V_COL, D_COL, A_COL]:
            if col not in g.columns:
                g[col] = np.nan
        longest = pd.Timedelta(0)
        start = None
        prev = None
        for _, r in g.iterrows():
            cur = (r.get(E_COL), r.get(V_COL), r.get(D_COL), r.get(A_COL))
            if prev is None:
                start = r[WAVE_COL]
                prev = cur
                continue
            if cur != prev:
                span = r[WAVE_COL] - start
                if span > longest:
                    longest = span
                start = r[WAVE_COL]
                prev = cur
        if start is not None and pd.notna(g[WAVE_COL]).any():
            lastw = g[WAVE_COL].dropna().iloc[-1]
            longest = max(longest, lastw - start)
        flags.append({PERSON_COL: pid, "flag_constant_6m": bool(longest >= six_m)})
    flags = pd.DataFrame(flags)

    short = short.merge(flags, on=PERSON_COL, how="left")
    short["ShortTerm_ArchetypeJP"] = short["Level_A"].astype(str) + "×" + short["Trend_B_refined"].astype(str)
    short["AnalysisFlag"] = np.where(
        (short["flag_constant_6m"] == True) & (short["Trend_B_refined"].astype(str) == "安定維持"),
        "分析不可（入力疑義）",
        "有効",
    )
    return short

# ========== Longterm Master ==========
def derive_slope_pattern(monthly_trends: pd.DataFrame) -> pd.DataFrame:
    """slope_3m からパターンを判定"""
    pat = []
    for pid, g in monthly_trends.groupby(PERSON_COL):
        s = g.sort_values("__month__")["slope_3m"].dropna()
        if s.empty or len(s) < PATTERN_MIN_DATA_POINTS:
            patt = "Insufficient"
        else:
            pos_ratio = float((s > 0).mean())
            neg_ratio = float((s < 0).mean())
            mean_s = float(s.mean())
            sign_changes = int((np.sign(s) != np.sign(s.shift(1))).sum()) if len(s) > 1 else 0
            if pos_ratio >= PATTERN_DOMINANCE_RATIO and mean_s > 0:
                patt = "Net Growth"
            elif neg_ratio >= PATTERN_DOMINANCE_RATIO and mean_s < 0:
                patt = "Net Decline"
            else:
                k = len(s)
                if k >= 4:
                    early = float(s.iloc[:k // 2].mean())
                    late = float(s.iloc[k // 2:].mean())
                    if early < 0 and late > 0:
                        patt = "U-Shape"
                    elif early > 0 and late < 0:
                        patt = "Inverted-U"
                    else:
                        patt = "Flat/Noisy" if sign_changes < 2 else "Oscillating"
                else:
                    patt = "Flat/Noisy"
        pat.append({PERSON_COL: pid, "slope3m_pattern": patt})
    return pd.DataFrame(pat)

def trait_multi_top(df_person: pd.DataFrame, kind: str):
    """特性の最頻値を抽出（複数トップ許容）"""
    col = f"C_trait_{kind}"
    if col not in df_person.columns:
        order = ["活力", "熱意", "没頭"]
        return "", {k: "" for k in order}, {k: np.nan for k in order}

    vals = df_person[col].dropna().astype(str).tolist()
    items = []
    for v in vals:
        items += parse_trait_list(v)

    order = ["活力", "熱意", "没頭"]
    counts = {k: 0 for k in order}
    for it in items:
        if it in counts:
            counts[it] += 1

    total = sum(counts.values())
    if total == 0:
        tops = []
    else:
        maxc = max(counts.values())
        tops = [k for k in order if counts[k] == maxc and maxc > 0]

    conf = {k: (counts[k] / total if total > 0 else np.nan) for k in order}
    flags = {k: ("Y" if k in tops else "") for k in order}
    return ",".join(tops) if tops else "", flags, conf

# ========== Episode & Distribution Metrics ==========
def compute_expanding_episode_distribution_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    """エピソード・分布指標を expanding（累積）計算
    各Wave時点までのデータで episodes, pct, streak を計算

    注: bandify_level() により、Critical は Low と同じ仲間、Thriving は High と同じ仲間として扱われます。
    - Low グループ: Critical, Low
    - High グループ: High, Thriving
    """
    rows = []
    for pid, g in individuals.sort_values([PERSON_COL, WAVE_COL]).groupby(PERSON_COL):
        g = g.reset_index(drop=True)
        # Level_A をバンド化（Critical→Low, Thriving→High）
        lv_list = g["Level_A"].apply(bandify_level).tolist()
        waves = g[WAVE_COL].tolist()

        # 各Wave時点での累積計算
        for idx in range(len(g)):
            # 最初のWaveからこのWaveまでのデータ
            lv_upto_now = lv_list[:idx + 1]
            n = len(lv_upto_now)

            # episodes_recovery_from_low: Low→(Mid/High) 転換回数
            # 注: Critical→Moderate も Low→Mid として検出される
            rec = 0
            for i in range(1, len(lv_upto_now)):
                if lv_upto_now[i - 1] == "Low" and lv_upto_now[i] in ("Mid", "High"):
                    rec += 1

            # episodes_fall_to_low: (Mid/High)→Low 転換回数
            # 注: Moderate→Critical も Mid→Low として検出される
            fall = 0
            for i in range(1, len(lv_upto_now)):
                if lv_upto_now[i - 1] in ("Mid", "High") and lv_upto_now[i] == "Low":
                    fall += 1

            # pct_high, pct_mid, pct_low
            pct_high = float(sum(1 for x in lv_upto_now if x == "High") / n) if n else np.nan
            pct_mid = float(sum(1 for x in lv_upto_now if x == "Mid") / n) if n else np.nan
            pct_low = float(sum(1 for x in lv_upto_now if x == "Low") / n) if n else np.nan

            # low_streak_max: 連続Lowの最長長さ
            max_streak = 0
            cur_streak = 0
            for x in lv_upto_now:
                if x == "Low":
                    cur_streak += 1
                    max_streak = max(max_streak, cur_streak)
                else:
                    cur_streak = 0

            # episodes_low_2plus: 連続Low≥2のエピソード数
            episodes2 = 0
            cur_streak = 0
            for x in lv_upto_now:
                if x == "Low":
                    cur_streak += 1
                else:
                    if cur_streak >= 2:
                        episodes2 += 1
                    cur_streak = 0
            # 最後のstreakも確認
            if cur_streak >= 2:
                episodes2 += 1

            rows.append({
                PERSON_COL: pid,
                WAVE_COL: waves[idx],
                "episodes_recovery_from_low": rec,
                "episodes_fall_to_low": fall,
                "pct_high": pct_high,
                "pct_mid": pct_mid,
                "pct_low": pct_low,
                "low_streak_max": int(max_streak),
                "episodes_low_2plus": int(episodes2),
            })

    return pd.DataFrame(rows)

def compute_final_episode_distribution_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    """エピソード・分布指標の最終値（全期間）を取得（longterm シート用）"""
    expanding_metrics = compute_expanding_episode_distribution_metrics(individuals)
    # 各人の最終Wave（最後の行）を取得
    final_metrics = expanding_metrics.sort_values([PERSON_COL, WAVE_COL]).groupby(PERSON_COL).tail(1)
    return final_metrics.drop(columns=[WAVE_COL])

def build_longterm_master(individuals: pd.DataFrame, monthly_pattern_df: pd.DataFrame) -> pd.DataFrame:
    """longterm マスターシートを構築（属性カラムなし）"""
    # name の取得
    name_map = individuals.groupby(PERSON_COL)["name"].first().to_dict()

    # Level_A からエピソード・分布を計算（全期間の最終値）
    epi_dist_df = compute_final_episode_distribution_metrics(individuals)

    # Traits 集計
    trait_rows = []
    for pid, gp in individuals.groupby(PERSON_COL):
        s_top, s_flags, s_conf = trait_multi_top(gp, "strength")
        w_top, w_flags, w_conf = trait_multi_top(gp, "weakness")
        trait_rows.append(
            {
                PERSON_COL: pid,
                "Long_trait_strength": s_top,
                "Long_trait_strength_V": s_flags["活力"],
                "Long_trait_strength_D": s_flags["熱意"],
                "Long_trait_strength_A": s_flags["没頭"],
                "Long_trait_strength_conf_V": s_conf["活力"],
                "Long_trait_strength_conf_D": s_conf["熱意"],
                "Long_trait_strength_conf_A": s_conf["没頭"],
                "Long_trait_weakness": w_top,
                "Long_trait_weakness_V": w_flags["活力"],
                "Long_trait_weakness_D": w_flags["熱意"],
                "Long_trait_weakness_A": w_flags["没頭"],
                "Long_trait_weakness_conf_V": w_conf["活力"],
                "Long_trait_weakness_conf_D": w_conf["熱意"],
                "Long_trait_weakness_conf_A": w_conf["没頭"],
            }
        )
    traits_df = pd.DataFrame(trait_rows)

    # slope pattern
    patterns_df = derive_slope_pattern(monthly_pattern_df)

    # 統合（name カラムを追加）
    longterm = (
        pd.DataFrame({PERSON_COL: list(name_map.keys()), "name": list(name_map.values())})
        .merge(patterns_df, on=PERSON_COL, how="left")
        .merge(epi_dist_df, on=PERSON_COL, how="left")
        .merge(traits_df, on=PERSON_COL, how="left")
    )
    return longterm

# ========== Excel Output with Formatting ==========
def write_playbook(
    out_path: Path, shortterm: pd.DataFrame, monthly_trends: pd.DataFrame,
    longterm: pd.DataFrame, latest: pd.DataFrame
):
    """4シートをフォーマット付きでExcel出力"""
    try:
        import xlsxwriter
        engine = "xlsxwriter"
    except Exception:
        engine = None

    with pd.ExcelWriter(out_path, engine=engine, datetime_format="yyyy-mm", date_format="yyyy-mm") as w:
        # シート書き込み（順序指定: shortterm, longterm, monthly_trends, LatestIndividuals）
        shortterm.to_excel(w, sheet_name="shortterm", index=False)
        longterm.to_excel(w, sheet_name="longterm", index=False)
        monthly_trends.to_excel(w, sheet_name="monthly_trends", index=False)
        latest.to_excel(w, sheet_name="LatestIndividuals", index=False)

        if engine == "xlsxwriter":
            wb = w.book
            fmt_ym = wb.add_format({"num_format": "yyyy-mm"})
            fmt_f2 = wb.add_format({"num_format": "0.00"})
            fmt_pct = wb.add_format({"num_format": "0.00"})  # pct_* 用
            fmt_int = wb.add_format({"num_format": "0"})

            # shortterm（name カラムまで固定）
            ws_short = w.sheets["shortterm"]
            col_idx_st = {c: i for i, c in enumerate(shortterm.columns)}
            name_col_idx = col_idx_st.get("name", 1)
            ws_short.freeze_panes(1, name_col_idx + 1)
            ws_short.autofilter(0, 0, 0, max(0, shortterm.shape[1] - 1))
            if WAVE_COL in col_idx_st:
                ws_short.set_column(col_idx_st[WAVE_COL], col_idx_st[WAVE_COL], 10, fmt_ym)

            # monthly_trends（name カラムまで固定）
            ws_mt = w.sheets["monthly_trends"]
            col_idx_mt = {c: i for i, c in enumerate(monthly_trends.columns)}
            name_col_idx_mt = col_idx_mt.get("name", 1)
            ws_mt.freeze_panes(1, name_col_idx_mt + 1)
            ws_mt.autofilter(0, 0, 0, max(0, monthly_trends.shape[1] - 1))
            if WAVE_COL in col_idx_mt:
                ws_mt.set_column(col_idx_mt[WAVE_COL], col_idx_mt[WAVE_COL], 10, fmt_ym)
            for key in [V_COL, D_COL, A_COL, E_COL]:
                if key in col_idx_mt:
                    ws_mt.set_column(col_idx_mt[key], col_idx_mt[key], 12, fmt_int)
            float_keys = [
                "E_momentum_3", "E_delta_1", "E_delta_1_prev", "E_mean_6", "E_std_6", "E_iqr_6",
                "E_slope_12", "E_slope_6", "E_accel_6",
                # 月次メトリクス（E_monthly削除）
                "E_ma3", "slope_3m", "slope_3m_ma3", "accel_3m",
                "V_delta_1", "D_delta_1", "A_delta_1", "V_slope_6", "D_slope_6", "A_slope_6"
            ]
            for key in float_keys:
                if key in col_idx_mt:
                    ws_mt.set_column(col_idx_mt[key], col_idx_mt[key], 12, fmt_f2)

            # エピソード指標（整数）
            int_keys_mt = ["episodes_recovery_from_low", "episodes_fall_to_low", "low_streak_max", "episodes_low_2plus"]
            for key in int_keys_mt:
                if key in col_idx_mt:
                    ws_mt.set_column(col_idx_mt[key], col_idx_mt[key], 12, fmt_int)

            # 分布指標（pct_* は小数点2桁）
            pct_keys_mt = ["pct_high", "pct_mid", "pct_low"]
            for key in pct_keys_mt:
                if key in col_idx_mt:
                    ws_mt.set_column(col_idx_mt[key], col_idx_mt[key], 12, fmt_pct)

            # longterm（name カラムまで固定）
            ws_lt = w.sheets["longterm"]
            col_idx_lt = {c: i for i, c in enumerate(longterm.columns)}
            name_col_idx_lt = col_idx_lt.get("name", 1)
            ws_lt.freeze_panes(1, name_col_idx_lt + 1)
            ws_lt.autofilter(0, 0, 0, max(0, longterm.shape[1] - 1))

            int_cols = ["episodes_recovery_from_low", "episodes_fall_to_low", "low_streak_max", "episodes_low_2plus"]
            for c in int_cols:
                if c in col_idx_lt:
                    ws_lt.set_column(col_idx_lt[c], col_idx_lt[c], 12, fmt_int)

            # pct_* は小数点2桁
            pct_cols = ["pct_high", "pct_mid", "pct_low"]
            for c in pct_cols:
                if c in col_idx_lt:
                    ws_lt.set_column(col_idx_lt[c], col_idx_lt[c], 12, fmt_pct)

            # conf_* も小数点2桁
            for c in longterm.columns:
                if c in col_idx_lt and "conf" in c.lower():
                    ws_lt.set_column(col_idx_lt[c], col_idx_lt[c], 12, fmt_f2)

            # LatestIndividuals（name カラムまで固定）
            ws_latest = w.sheets["LatestIndividuals"]
            col_idx_latest = {c: i for i, c in enumerate(latest.columns)}
            name_col_idx_latest = col_idx_latest.get("name", 1)
            ws_latest.freeze_panes(1, name_col_idx_latest + 1)
            ws_latest.autofilter(0, 0, 0, max(0, latest.shape[1] - 1))
            if WAVE_COL in col_idx_latest:
                ws_latest.set_column(col_idx_latest[WAVE_COL], col_idx_latest[WAVE_COL], 10, fmt_ym)
            for key in [V_COL, D_COL, A_COL, E_COL]:
                if key in col_idx_latest:
                    ws_latest.set_column(col_idx_latest[key], col_idx_latest[key], 12, fmt_int)
            for key in float_keys:
                if key in col_idx_latest:
                    ws_latest.set_column(col_idx_latest[key], col_idx_latest[key], 12, fmt_f2)

            # エピソード指標（整数）
            for key in int_keys_mt:
                if key in col_idx_latest:
                    ws_latest.set_column(col_idx_latest[key], col_idx_latest[key], 12, fmt_int)

            # 分布指標（pct_* は小数点2桁）
            for key in pct_keys_mt:
                if key in col_idx_latest:
                    ws_latest.set_column(col_idx_latest[key], col_idx_latest[key], 12, fmt_pct)

# ========== Main Pipeline ==========
def run_playbook(input_path: Path, output_path: Path, mid_window: int = 6):
    """メインパイプライン"""
    # 入力読み込み
    xl = pd.ExcelFile(input_path)
    sheet = xl.sheet_names[0]
    df = xl.parse(sheet)

    # 基本列の準備
    df[WAVE_COL] = _to_wave(df)
    df[WAVE_COL] = wave_to_timestamp(df[WAVE_COL])
    df[SECTION_COL] = df["section"]
    gr = df["group"].astype(str).str.strip()
    df[GROUP_COL] = np.where(gr.eq("") | gr.str.lower().eq("nan"), df["section"], df["group"])

    if "mail_address" in df.columns:
        df[PERSON_COL] = norm_person(df["mail_address"])
    elif "name" in df.columns:
        df[PERSON_COL] = norm_person(df["name"])
    else:
        raise RuntimeError("個人識別列（mail_address または name）が必要です。")

    for c in [V_COL, D_COL, A_COL]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Engagement 列（engagement_rating を優先）
    if "engagement_rating" in df.columns:
        df[E_COL] = pd.to_numeric(df["engagement_rating"], errors="coerce")
    else:
        df[E_COL] = df[[V_COL, D_COL, A_COL]].sum(axis=1, min_count=3)

    use = df[[PERSON_COL, "name", "project", "grade", SECTION_COL, GROUP_COL, WAVE_COL, V_COL, D_COL, A_COL, E_COL]].copy()

    # 分析パイプライン
    use = add_section_group_zscores(use, [V_COL, D_COL, A_COL, E_COL])
    use = add_multiscale_features(use)
    use = overwrite_short_mid_personal(use, mid_window=mid_window)
    use = apply_personal_trend_logic(use)
    use = compute_C_columns(use, mid_window=mid_window)
    use["Level_A"] = use[E_COL].apply(_level_from_e)
    use["ChangeTag"] = np.where(np.abs(use["E_delta_1"]) >= CHANGE_TAG_THRESHOLD, "変化大", "")

    # 月次メトリクスの計算（E_ma3, slope_3m, slope_3m_ma3, accel_3m）
    # 注: E_monthly は Engagement と同じなので削除
    monthly_metrics_df = compute_monthly_metrics(use)

    # エピソード・分布指標の expanding 計算（各Wave時点までの累積値）
    epi_dist_df = compute_expanding_episode_distribution_metrics(use)

    # use に月次メトリクスをマージ
    use = use.merge(monthly_metrics_df, on=[PERSON_COL, WAVE_COL], how="left")

    # use にエピソード・分布指標をマージ（expanding 計算）
    use = use.merge(epi_dist_df, on=[PERSON_COL, WAVE_COL], how="left")

    # 列順整理（__person__, name の順、属性カラムなし）
    # E_accel_6 の後ろに月次メトリクス（E_monthly削除）、その後ろにエピソード・分布指標を配置
    monthly_cols = [
        PERSON_COL, "name", WAVE_COL,
        V_COL, D_COL, A_COL, E_COL,
        "Level_A", "Trend_B_base", "Trend_B_recent", "Trend_B_refined", "ChangeTag",
        "C_stability",
        "C_short_strength", "C_short_weakness",
        "C_mid_strength", "C_mid_weakness",
        "C_trait_strength", "C_trait_weakness",
        "E_momentum_3", "E_delta_1", "E_delta_1_prev", "E_mean_6", "E_std_6", "E_iqr_6",
        "E_slope_12", "E_slope_6", "E_accel_6",
        # 月次メトリクス（E_monthly削除）
        "E_ma3", "slope_3m", "slope_3m_ma3", "accel_3m",
        # エピソード・分布指標（expanding 計算）
        "episodes_recovery_from_low", "episodes_fall_to_low",
        "pct_high", "pct_mid", "pct_low", "low_streak_max", "episodes_low_2plus",
        "V_delta_1", "D_delta_1", "A_delta_1", "V_slope_6", "D_slope_6", "A_slope_6"
    ]
    monthly_cols = [c for c in monthly_cols if c in use.columns]
    monthly_trends = use[monthly_cols].copy().sort_values([PERSON_COL, WAVE_COL])

    latest_wave = monthly_trends[WAVE_COL].max()
    latest = monthly_trends[monthly_trends[WAVE_COL] == latest_wave].copy()

    # shortterm / longterm 構築
    # shortterm は属性カラム含む（use から取得）
    shortterm = build_shortterm(use, use, latest_wave)

    # longterm のパターン判定用に月次メトリクスを計算
    monthly_pattern_df = compute_monthly_metrics_for_pattern(use)
    longterm = build_longterm_master(monthly_trends, monthly_pattern_df)

    # 出力
    write_playbook(output_path, shortterm, monthly_trends, longterm, latest)

def main():
    ap = argparse.ArgumentParser(description="WE Playbook Builder - ワーク・エンゲージメント プレイブック生成")
    ap.add_argument("--input", "-i", type=str, default="workengagement.xlsx", help="入力ファイル（workengagement.xlsx）")
    ap.add_argument("--output", "-o", type=str, default="we_playbook.xlsx", help="出力ファイル（we_playbook.xlsx）")
    ap.add_argument("--mid-window", type=int, default=6, help="中期ウィンドウサイズ（デフォルト: 6）")
    args = ap.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        inp = Path("/mnt/data") / args.input
    if not inp.exists():
        raise FileNotFoundError(f"入力ファイルが見つかりません: {args.input}")

    outp = Path(args.output)
    run_playbook(inp, outp, mid_window=int(args.mid_window))
    print(f"✓ 完了: {outp.resolve()}")
    print(f"  - shortterm: 最新Wave時点のメンバー短期状態（name カラムまで固定枠）")
    print(f"  - monthly_trends: 全員×全Wave の月次時系列（個人分析用、属性カラムなし）")
    print(f"  - longterm: 個人の長期傾向・特性（name カラムまで固定枠、属性カラムなし）")
    print(f"  - LatestIndividuals: 最新Waveのみ（monthly_trendsと同じ列構成）")

if __name__ == "__main__":
    main()
