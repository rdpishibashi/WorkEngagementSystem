# -*- coding: utf-8 -*-
"""
WE Analyzer - ワーク・エンゲージメント 分析スクリプト (Refactored)

入力: workengagement.xlsx
出力: we_report.xlsx (2シート)
  1. monthly_trends - 全員×全Wave の月次時系列
  2. latest_individuals - 最新Waveのみ（monthly_trendsと同じ列構成）
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional, Tuple, List, Dict
import numpy as np
import pandas as pd
import argparse

# ========== Constants ==========

# Slope thresholds
TREND_SLOPE = 0.5              # 中期傾き閾値（絶対値）
TREND_SLOPE_STD_MIN = 0.2      # 標準化傾き最小閾値
TREND_SLOPE_STD = 0.45         # 標準化傾き閾値
MIN_SLOPE = 0.20               # 個人傾き最小閾値

# Delta thresholds
TREND_DELTA_STRONG = 5.0       # 強い変化の閾値
TREND_DELTA = 1.0              # 変化閾値
TREND_RECENT_DELTA = 2.0       # trend_recent の上昇／低下判定閾値

# V/D/A strength/weakness thresholds
Z_VDA_THRESHOLD = 0.8          # Z-score 閾値
SHORT_VDA_MIN_DELTA = 2.0      # 短期変化最小閾値

# Personal change threshold
BIG_CHANGE_PERSONAL_Z = 2.0    # 個人内変化大の閾値（2σ、> で判定）

# Level thresholds
LEVEL_THRIVING = 43
LEVEL_CRITICAL = 3
LEVEL_HIGH = 32
LEVEL_LOW = 11

# Stability thresholds (6-month)
STABILITY_RANGE_EPS = 1e-6
STABILITY_STD_STABLE = 1.0
STABILITY_MOMENTUM_STABLE = 0.5
STABILITY_STD_UNSTABLE = 2.5

# Stability thresholds (12-month)
STABILITY_STD_STABLE_LONG = 1.5
STABILITY_MOMENTUM_STABLE_LONG = 0.8
STABILITY_STD_UNSTABLE_LONG = 3.0

# History requirements
MID_MIN_RECORDS = 2            # 中期トレンド計算に必要な最小レコード数
TRAIT_MIN_HISTORY = 6          # 特性評価に必要な最小履歴数
CHANGE_TAG_THRESHOLD = 6.0     # 急上昇・急落の閾値

# Episode thresholds
LOW_EPISODE_THRESHOLD = 2      # Low エピソード判定の連続月数閾値

# Trait evaluation constants
TRAIT_WINDOW_MONTHS = 12       # 特性評価ウィンドウ（月）
TRAIT_MIN_PERIODS = 3          # 最小期間
SECTION_THRESHOLD = 0.5        # セクション閾値
TRAIT_LEVEL_RATIO_MAX = 0.8    # High/Low 比率上限（短期）
TRAIT_LEVEL_RATIO_MIN = 0.6    # High/Low 比率下限（長期）
TRAIT_LEVEL_RATIO_DECAY = 12   # 閾値減衰期間（月）
TRAIT_COUNT_EPS = 1e-6         # 同率判定許容誤差

# slope3m_pattern constants
SLOPE_PATTERN_WINDOW = 12      # パターン判定ウィンドウ（月）
NET_RATIO_THRESHOLD = 0.7      # Net Growth/Decline 比率閾値
SLOPE12_THRESHOLD = 0.4        # 12ヶ月傾き閾値
SLOPE6_STD12_THRESHOLD = 0.2   # 6ヶ月標準化傾き閾値

# Column names
PERSON_COL = "person"
WAVE_COL = "wave"
V_COL = "vigor"
D_COL = "dedication"
A_COL = "absorption"
E_COL = "engagement"
SECTION_COL = "section"
GROUP_COL = "group"


# ========== Input Validation ==========

def validate_input_data(df: pd.DataFrame) -> Tuple[bool, List[str]]:
    """
    入力データの妥当性を検証

    Args:
        df: 入力DataFrame

    Returns:
        (is_valid, error_messages): 検証結果とエラーメッセージのリスト
    """
    errors = []

    # Required columns check
    required_cols = [PERSON_COL, WAVE_COL, V_COL, D_COL, A_COL, E_COL]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        errors.append(f"必須カラムが不足: {', '.join(missing_cols)}")
        return False, errors

    # Check for all-NaN columns
    if df[V_COL].isna().all():
        errors.append("vigor カラムがすべて NaN です")
    if df[D_COL].isna().all():
        errors.append("dedication カラムがすべて NaN です")
    if df[A_COL].isna().all():
        errors.append("absorption カラムがすべて NaN です")

    # Check for negative engagement scores
    negative_count = (df[E_COL] < 0).sum()
    if negative_count > 0:
        errors.append(f"負のエンゲージメントスコアが {negative_count} 件あります")

    # Check for missing wave values
    missing_wave_count = df[WAVE_COL].isna().sum()
    if missing_wave_count > 0:
        errors.append(f"wave 値が欠損しているレコードが {missing_wave_count} 件あります")

    # Check for missing person values
    missing_person_count = df[PERSON_COL].isna().sum()
    if missing_person_count > 0:
        errors.append(f"person 値が欠損しているレコードが {missing_person_count} 件あります")

    # Check value ranges
    for col, min_val, max_val in [(V_COL, 0, 18), (D_COL, 0, 18), (A_COL, 0, 18)]:
        out_of_range = df[(df[col] < min_val) | (df[col] > max_val)][col].dropna()
        if len(out_of_range) > 0:
            errors.append(f"{col} の値が範囲外 ({min_val}-{max_val}): {len(out_of_range)} 件")

    return len(errors) == 0, errors


# ========== Utility Functions ==========

def _safe_numeric(s: pd.Series) -> pd.Series:
    """Series を数値型に安全に変換"""
    return pd.to_numeric(s, errors="coerce")


def _to_wave(df: pd.DataFrame) -> pd.Series:
    """
    year/month または date カラムから wave (YYYY-MM) を生成

    Args:
        df: year/month または date カラムを含む DataFrame

    Returns:
        wave 文字列の Series
    """
    if {"year", "month"}.issubset(df.columns):
        y = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
        m = pd.to_numeric(df["month"], errors="coerce").astype("Int64")
        return pd.Series(
            [f"{int(yy)}-{int(mm):02d}" if pd.notna(yy) and pd.notna(mm) else np.nan
             for yy, mm in zip(y, m)],
            index=df.index
        )
    elif "date" in df.columns:
        return pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m")
    else:
        raise RuntimeError("year/month または date が必要です。")


def _theil_sen_slope_window(y: np.ndarray, max_len: int) -> float:
    """
    Theil-Sen slope estimator（ロバスト傾き推定）

    Args:
        y: データ配列
        max_len: 使用する最大データ点数

    Returns:
        推定された傾き

    Note:
        - データ点数が3未満: 単純な傾き
        - データ点数が3-5: 単純な傾き（Theil-Senより安定）
        - データ点数が6以上: Theil-Sen median slope
    """
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]

    if len(arr) == 0:
        return 0.0
    if len(arr) > max_len:
        arr = arr[-max_len:]

    n = len(arr)

    # For small sample sizes, use simple slope
    if n < 3:
        return float((arr[-1] - arr[0]) / (n - 1)) if n >= 2 else 0.0

    # For 3-5 data points, simple slope is more stable than median slope
    if n < 6:
        return float((arr[-1] - arr[0]) / (n - 1))

    # For 6+ data points, use Theil-Sen median slope
    slopes = [(arr[j] - arr[i]) / (j - i)
              for i in range(n - 1) for j in range(i + 1, n)]
    return float(np.median(slopes)) if slopes else 0.0


def _rolling_momentum_last(y: np.ndarray) -> float:
    """
    3ヶ月モメンタム（直近3ヶ月平均 - 前3ヶ月平均）

    Args:
        y: データ配列

    Returns:
        モメンタム値
    """
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    n = len(arr)

    if n < 3:
        return 0.0

    recent = float(np.nanmean(arr[-3:]))
    if n >= 6:
        prior = float(np.nanmean(arr[-6:-3]))
    elif n > 3:
        prior = float(np.nanmean(arr[:-3]))
    else:
        prior = recent

    return float(recent - prior)


def _rolling_momentum_6_last(y: np.ndarray) -> float:
    """
    6ヶ月モメンタム（直近6ヶ月平均 - 前6ヶ月平均）

    Args:
        y: データ配列

    Returns:
        モメンタム値
    """
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]
    n = len(arr)

    if n < 6:
        return 0.0

    recent = float(np.nanmean(arr[-6:]))
    if n >= 12:
        prior = float(np.nanmean(arr[-12:-6]))
    elif n > 6:
        prior = float(np.nanmean(arr[:-6]))
    else:
        prior = recent

    return float(recent - prior)


def _iqr_last_window(y: np.ndarray, win: int) -> float:
    """
    直近ウィンドウの四分位範囲（IQR）を計算

    Args:
        y: データ配列
        win: ウィンドウサイズ

    Returns:
        IQR値
    """
    arr = np.array(list(y), dtype=float)
    arr = arr[np.isfinite(arr)]

    if len(arr) == 0:
        return float("nan")

    arr = arr[-win:] if len(arr) >= win else arr
    if len(arr) == 0:
        return float("nan")

    return float(np.nanpercentile(arr, 75) - np.nanpercentile(arr, 25))


def _level_from_e(val: float) -> str:
    """
    エンゲージメント値からレベルを判定

    Args:
        val: エンゲージメント値

    Returns:
        レベル文字列
    """
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


def bandify_level(x: str) -> str:
    """
    レベルをバンド化（High/Mid/Low）

    Args:
        x: レベル文字列

    Returns:
        バンド文字列
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


def slope3_ols(y: np.ndarray) -> float:
    """
    3点の単回帰傾き（OLS）

    Args:
        y: データ配列（3点）

    Returns:
        傾き
    """
    x = np.arange(len(y), dtype=float)
    if len(x) == 0:
        return np.nan

    xm, ym = x.mean(), y.mean()
    denom = ((x - xm) ** 2).sum()

    if denom == 0:
        return np.nan

    return float(((x - xm) * (y - ym)).sum() / denom)


def _dynamic_level_ratio_threshold(history_len: float) -> float:
    """
    観測履歴に応じた High/Low 比率の要求値を線形に緩和

    Args:
        history_len: 履歴の長さ

    Returns:
        要求比率閾値
    """
    if not np.isfinite(history_len) or history_len <= 0:
        return float("inf")

    if history_len <= TRAIT_MIN_HISTORY:
        return TRAIT_LEVEL_RATIO_MAX

    if TRAIT_LEVEL_RATIO_DECAY <= 0:
        return TRAIT_LEVEL_RATIO_MIN

    excess = min(history_len - TRAIT_MIN_HISTORY, TRAIT_LEVEL_RATIO_DECAY)
    frac = excess / TRAIT_LEVEL_RATIO_DECAY

    return TRAIT_LEVEL_RATIO_MAX - (TRAIT_LEVEL_RATIO_MAX - TRAIT_LEVEL_RATIO_MIN) * frac


def _select_dim_labels(counts: Dict[str, float]) -> List[str]:
    """
    同率トップの次元名リストを抽出

    Args:
        counts: 次元ごとのカウント辞書

    Returns:
        トップ次元のリスト
    """
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


def parse_trait_list(val) -> List[str]:
    """
    カンマ区切りの特性リストをパース

    Args:
        val: 文字列またはリスト

    Returns:
        特性のリスト
    """
    if isinstance(val, str):
        return [s.strip() for s in val.split(",") if s.strip()]
    return []


# ========== Personal Short/Mid Computation ==========

def _expanding_quantile_exclusive(series: pd.Series, q: float) -> pd.Series:
    """
    現在値を除外した expanding quantile（累積分位数）

    Args:
        series: データ系列
        q: 分位数（0-1）

    Returns:
        累積分位数系列
    """
    return series.expanding(min_periods=1).quantile(q).shift(1)


def _expanding_robust_z_exclusive(series: pd.Series, eps: float = 1e-9) -> pd.Series:
    """
    現在値を除外した robust Z-score（MAD ベース）

    Args:
        series: データ系列
        eps: ゼロ除算回避用の小さい値

    Returns:
        robust Z-score 系列
    """
    med = series.expanding(min_periods=1).median().shift(1)
    abs_dev = (series - med).abs()
    mad = 1.4826 * abs_dev.expanding(min_periods=1).median().shift(1)

    z = (series - med) / mad
    z[(mad.isna()) | (mad < eps)] = np.nan

    return z


def _compute_personal_slope(series: pd.Series, window: int) -> pd.Series:
    """
    個人ごとの rolling slope を計算

    Args:
        series: データ系列
        window: ウィンドウサイズ

    Returns:
        傾き系列
    """
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
    """
    個人ベースの短期・中期の strength/weakness フラグを計算

    Args:
        use: 入力DataFrame
        mid_window: 中期ウィンドウサイズ（デフォルト: 6ヶ月）

    Returns:
        フラグが追加されたDataFrame
    """
    df = use.copy().sort_values([PERSON_COL, WAVE_COL])
    dims = [("V", V_COL), ("D", D_COL), ("A", A_COL)]
    LABELS = ["V", "D", "A"]
    min_delta = SHORT_VDA_MIN_DELTA

    # Calculate delta_1 for each dimension
    for dim, col in dims:
        dcol = f"{dim}_delta_1"
        if dcol not in df.columns:
            df[dcol] = df.groupby(PERSON_COL, sort=False)[col].apply(
                lambda s: s - s.shift(1)
            ).reset_index(level=0, drop=True)

    # Calculate slope for each dimension
    for dim, col in dims:
        scol = f"{dim}_slope_{mid_window}"
        if scol not in df.columns:
            df[scol] = df.groupby(PERSON_COL, sort=False)[col].apply(
                lambda s: _compute_personal_slope(s, mid_window)
            ).reset_index(level=0, drop=True)

    short_pos_cols, short_neg_cols, mid_pos_cols, mid_neg_cols = [], [], [], []

    # Short-term strength/weakness flags
    for dim, col in dims:
        dcol = f"{dim}_delta_1"

        # Calculate thresholds
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

        pos = (df[dcol] >= th_pos) & (z.isna() | (z.abs() > Z_VDA_THRESHOLD))
        neg = (df[dcol] <= th_neg) & (z.isna() | (z.abs() > Z_VDA_THRESHOLD))

        sp = f"{dim}_short_strength_flag_self"
        sn = f"{dim}_short_weakness_flag_self"
        df[sp] = pos.fillna(False)
        df[sn] = neg.fillna(False)
        short_pos_cols.append(sp)
        short_neg_cols.append(sn)

    # Mid-term strength/weakness flags
    for dim, col in dims:
        scol = f"{dim}_slope_{mid_window}"
        slope = df[scol]

        # Calculate thresholds
        p90s = df.groupby(PERSON_COL, sort=False)[scol].apply(
            lambda s: _expanding_quantile_exclusive(s, 0.90)
        ).reset_index(level=0, drop=True)
        p10s = df.groupby(PERSON_COL, sort=False)[scol].apply(
            lambda s: _expanding_quantile_exclusive(s, 0.10)
        ).reset_index(level=0, drop=True)
        zs = df.groupby(PERSON_COL, sort=False)[scol].apply(
            _expanding_robust_z_exclusive
        ).reset_index(level=0, drop=True)

        th_pos_s = pd.Series(np.maximum(p90s.values, MIN_SLOPE), index=df.index)
        th_neg_s = pd.Series(np.minimum(p10s.values, -MIN_SLOPE), index=df.index)

        posm = slope.notna() & (slope >= th_pos_s) & (zs.isna() | (zs.abs() > Z_VDA_THRESHOLD))
        negm = slope.notna() & (slope <= th_neg_s) & (zs.isna() | (zs.abs() > Z_VDA_THRESHOLD))

        mp = f"{dim}_mid_strength_flag_self"
        mn = f"{dim}_mid_weakness_flag_self"
        df[mp] = posm.fillna(False)
        df[mn] = negm.fillna(False)
        mid_pos_cols.append(mp)
        mid_neg_cols.append(mn)

    # Create combined C_columns
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

def add_section_group_zscores(df_in: pd.DataFrame, metrics: List[str]) -> pd.DataFrame:
    """
    セクションおよびグループごとの Z-score を追加

    Args:
        df_in: 入力DataFrame
        metrics: Z-score を計算する指標のリスト

    Returns:
        Z-score カラムが追加されたDataFrame
    """
    df = df_in.copy()
    for c in metrics:
        df[c] = _safe_numeric(df[c])

    def _add_z(group_cols: List[str], suffix: str):
        """指定されたグループごとに Z-score を計算"""
        grp = df.groupby(group_cols, dropna=False)
        means = grp[metrics].transform("mean")
        stds = grp[metrics].transform(lambda s: s.std(ddof=0))

        for c in metrics:
            std = stds[c]
            z = np.where((std == 0) | std.isna(), 0.0, (df[c] - means[c]) / std)
            df[f"{c}_z_{suffix}"] = z

    _add_z([WAVE_COL, SECTION_COL], "section")
    _add_z([WAVE_COL, GROUP_COL], "group")

    return df


# ========== Multi-scale Features ==========

def add_multiscale_features(df_in: pd.DataFrame) -> pd.DataFrame:
    """
    個人ごとの多尺度特徴量を計算

    計算される特徴量:
    - 移動平均（3ヶ月、6ヶ月）
    - 標準偏差（6, 12, 18ヶ月）
    - IQR（6ヶ月）
    - 傾き（6, 12ヶ月）
    - 加速度、モメンタム
    - デルタ（1ヶ月差分）

    Args:
        df_in: 入力DataFrame

    Returns:
        特徴量カラムが追加されたDataFrame
    """
    df = df_in.copy().sort_values([PERSON_COL, WAVE_COL])
    rows = []

    for pid, person_data in df.groupby(PERSON_COL, sort=False):
        e = person_data[E_COL].to_numpy(float)
        v = person_data[V_COL].to_numpy(float)
        d = person_data[D_COL].to_numpy(float)
        a = person_data[A_COL].to_numpy(float)

        # Initialize feature lists
        e_mean_3, e_mean_6 = [], []
        e_std_6, e_std_12, e_std_18 = [], [], []
        e_iqr_6 = []
        e_slope_12, e_slope_6, e_accel_6 = [], [], []
        e_slope_6_std_12 = []
        e_mom_3, e_mom_6 = [], []
        e_d1, e_d1p = [], []
        prev_slope6_vals = []
        v_s6, d_s6, a_s6 = [], [], []
        v_d1, d_d1, a_d1 = [], [], []
        prev_s6 = np.nan

        for i in range(len(person_data)):
            # Helper functions for slope and delta
            def _slope6(x):
                return _theil_sen_slope_window(x[:i + 1], 6)

            def _slope12(x):
                return _theil_sen_slope_window(x[:i + 1], 12)

            def _delta1(x):
                return float(x[i] - x[i - 1]) if i >= 1 else 0.0

            # Engagement features
            ep = e[:i + 1]
            e_mean_3.append(float(np.nanmean(ep[-3:])))
            e_mean_6.append(float(np.nanmean(ep[-6:])))
            e_std_6.append(float(np.nanstd(ep[-6:], ddof=0)))
            e_std_12.append(float(np.nanstd(ep[-12:], ddof=0)))
            e_std_18.append(float(np.nanstd(ep[-18:], ddof=0)))
            e_iqr_6.append(_iqr_last_window(ep, 6))

            # Slopes
            s12 = _slope12(e)
            e_slope_12.append(s12)
            s6 = _slope6(e)
            e_slope_6.append(s6)

            # E_slope_6_std_12: 6-month slope standardized by 12-month std
            std12 = float(np.nanstd(ep[-12:], ddof=0))
            if pd.notna(s6) and pd.notna(std12) and std12 > 0:
                e_slope_6_std_12.append(float(s6 / std12))
            else:
                e_slope_6_std_12.append(np.nan)

            # Acceleration and momentum
            prev_for_record = prev_s6 if np.isfinite(prev_s6) else s6
            prev_slope6_vals.append(prev_for_record)
            e_accel_6.append(float(s6 - prev_s6) if np.isfinite(prev_s6) and np.isfinite(s6) else 0.0)
            prev_s6 = s6

            e_mom_3.append(_rolling_momentum_last(ep))
            e_mom_6.append(_rolling_momentum_6_last(ep))

            # Deltas
            e_d1.append(_delta1(e))
            e_d1p.append(float(e[i - 1] - e[i - 2])) if i >= 2 else e_d1p.append(0.0)

            # V/D/A features
            v_s6.append(_slope6(v))
            d_s6.append(_slope6(d))
            a_s6.append(_slope6(a))
            v_d1.append(_delta1(v))
            d_d1.append(_delta1(d))
            a_d1.append(_delta1(a))

        # Create feature DataFrame for this person
        person_features = person_data[[PERSON_COL, WAVE_COL]].copy()
        person_features["E_mean_3"] = e_mean_3
        person_features["E_mean_6"] = e_mean_6
        person_features["E_std_6"] = e_std_6
        person_features["E_std_12"] = e_std_12
        person_features["E_std_18"] = e_std_18
        person_features["E_iqr_6"] = e_iqr_6
        person_features["E_slope_12"] = e_slope_12
        person_features["E_slope_6"] = e_slope_6
        person_features["E_slope_6_std_12"] = e_slope_6_std_12
        person_features["E_accel_6"] = e_accel_6
        person_features["Prev_E_slope_6"] = prev_slope6_vals
        person_features["E_momentum_3"] = e_mom_3
        person_features["E_momentum_6"] = e_mom_6
        person_features["E_delta_1"] = e_d1
        person_features["E_delta_1_prev"] = e_d1p
        person_features["V_slope_6"] = v_s6
        person_features["D_slope_6"] = d_s6
        person_features["A_slope_6"] = a_s6
        person_features["V_delta_1"] = v_d1
        person_features["D_delta_1"] = d_d1
        person_features["A_delta_1"] = a_d1
        rows.append(person_features)

    feats = pd.concat(rows, ignore_index=True) if rows else df[[PERSON_COL, WAVE_COL]].copy()
    return df.merge(feats, on=[PERSON_COL, WAVE_COL], how="left")


# ========== Personal Trend Logic ==========

def _calculate_change_tag(row: pd.Series) -> str:
    """
    個人内変化の大きさを判定

    Args:
        row: データ行

    Returns:
        "変化大" または "not 変化大"
    """
    E_delta_1 = row.get("E_delta_1", np.nan)
    E_std_12 = row.get("E_std_12", np.nan)

    # Check for valid values with epsilon for numerical stability
    if pd.notna(E_std_12) and E_std_12 > 1e-9 and pd.notna(E_delta_1):
        return "変化大" if abs(E_delta_1) / E_std_12 > BIG_CHANGE_PERSONAL_Z else "not 変化大"
    else:
        return "not 変化大"


def _is_input_suspect(row: pd.Series) -> bool:
    """
    入力疑義を判定（V/D/A が6ヶ月間一定）

    Args:
        row: データ行

    Returns:
        True if input is suspect
    """
    flag_constant_6m = row.get("flag_constant_6m", False)
    # Normalize to boolean
    return flag_constant_6m in ("TRUE", True, 1)


def _refine_trend(row: pd.Series) -> str:
    """
    統合トレンド (trend_refined) を判定

    Priority 順に評価し、最初にマッチしたものを返す。

    判定ロジック:
    1. 入力疑義（V/D/A が6ヶ月間一定）
    2. 上昇加速 / 低下加速（トレンド継続中に大きな変化）
    3. 上昇継続 / 低下継続（トレンド継続）
    4. 復活 / 悪化（トレンド反転with大きな変化）
    5. 回復 / 低下危機（トレンド反転without大きな変化）
    6. 上昇期待 / 低下警戒（安定状態からの変化）
    7. 低下懸念 / 回復期待（トレンド中の横ばい）
    8. 上昇 / 下降 / 横ばい（未評価または安定状態）
    9. 安定維持（デフォルト）

    Note on abs(E_slope_6) checks:
    これらのチェックは冗長に見えるが、必要である。
    trend_base が "上昇中" または "低下中" の場合、以下の2つの条件のいずれかで判定される:
    - (slope > TREND_SLOPE AND slope_std > TREND_SLOPE_STD_MIN)
    - OR (slope_std > TREND_SLOPE_STD)

    第2の条件（slope_std のみ）では、abs(slope) > TREND_SLOPE が保証されない。
    したがって、slope の絶対値が十分大きいことを確認するために追加チェックが必要。

    Args:
        row: データ行

    Returns:
        trend_refined 文字列
    """
    trend_recent = row["Trend_B_recent"]
    trend_base = row["Trend_B_base"]
    E_slope_6 = row.get("E_slope_6", np.nan)
    E_delta_1 = row.get("E_delta_1", np.nan)

    change_tag = _calculate_change_tag(row)

    # Define trend categories
    up_trends = ["上昇", "急上昇", "連続上昇"]
    down_trends = ["下降", "急落", "連続下降"]

    # Priority 1: 入力疑義（最優先）
    if _is_input_suspect(row):
        return "入力疑義"

    # Priority 1: 上昇加速
    # Note: abs(E_slope_6) check ensures slope magnitude is significant
    # even if trend_base was satisfied by slope_std alone
    if (trend_recent in up_trends and
        trend_base == "上昇中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "上昇加速"

    # Priority 1: 低下加速
    if (trend_recent in down_trends and
        trend_base == "低下中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "低下加速"

    # Priority 2: 上昇継続
    if (trend_recent in ["上昇", "急上昇", "連続上昇", "横ばい"] and
        trend_base == "上昇中" and
        change_tag == "not 変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE and
        pd.notna(E_delta_1) and E_delta_1 >= 0):
        return "上昇継続"

    # Priority 2: 低下継続
    if (trend_recent in ["下降", "急落", "連続下降", "横ばい"] and
        trend_base == "低下中" and
        change_tag == "not 変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE and
        pd.notna(E_delta_1) and E_delta_1 <= 0):
        return "低下継続"

    # Priority 3: 復活
    if (trend_recent in ["上昇", "急上昇"] and
        trend_base == "低下中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "復活"

    # Priority 3: 悪化
    if (trend_recent in ["下降", "急落"] and
        trend_base == "上昇中" and
        change_tag == "変化大" and
        pd.notna(E_slope_6) and abs(E_slope_6) > TREND_SLOPE):
        return "悪化"

    # Priority 4: 回復
    if (trend_recent in ["上昇", "急上昇", "連続上昇"] and
        trend_base == "低下中" and
        change_tag == "not 変化大"):
        return "回復"

    # Priority 4: 低下危機
    if (trend_recent in ["下降", "急落", "連続下降"] and
        trend_base == "上昇中" and
        change_tag == "not 変化大"):
        return "低下危機"

    # Priority 5: 上昇期待
    if (trend_base == "安定" and
        trend_recent in ["上昇", "急上昇", "連続上昇"]):
        return "上昇期待"

    # Priority 5: 低下警戒
    if (trend_base == "安定" and
        trend_recent in ["下降", "急落", "連続下降"]):
        return "低下警戒"

    # Priority 6: 低下懸念
    if (trend_recent == "横ばい" and
        trend_base == "上昇中" and
        pd.notna(E_delta_1) and E_delta_1 < 0):
        return "低下懸念"

    # Priority 6: 回復期待
    if (trend_recent == "横ばい" and
        trend_base == "低下中" and
        pd.notna(E_delta_1) and E_delta_1 > 0):
        return "回復期待"

    # Priority 7: 未評価または安定の一般パターン
    if trend_base == "未評価":
        if trend_recent in ["上昇", "急上昇"]:
            return "上昇"
        if trend_recent in ["下降", "急落"]:
            return "下降"
        if trend_recent == "横ばい":
            return "横ばい"

    if trend_base == "安定" and trend_recent == "横ばい":
        return "安定維持"

    # Priority 9: 安定維持
    if (trend_recent == "横ばい" and
        trend_base == "安定" and
        change_tag == "not 変化大"):
        return "安定維持"

    # Fallback（理論上はここに到達しないはず）
    return "安定維持"


def apply_personal_trend_logic(df_in: pd.DataFrame) -> pd.DataFrame:
    """
    個人ごとのトレンドロジックを適用

    計算される項目:
    - Trend_B_base: 中期トレンド（上昇中/低下中/安定/未評価）
    - Trend_B_recent: 短期トレンド（急上昇/上昇/横ばい/下降/急落/連続上昇/連続下降）
    - Trend_B_refined: 統合トレンド（17カテゴリー）

    Args:
        df_in: 入力DataFrame

    Returns:
        トレンドカラムが追加されたDataFrame
    """
    df_sorted = df_in.sort_values([PERSON_COL, WAVE_COL]).copy()
    counts = df_sorted.groupby(PERSON_COL, sort=False)[PERSON_COL].transform("size")
    has_mid_history = counts > MID_MIN_RECORDS

    # 直近6ヶ月の過去最小／最大（回復・悪化判定用）
    df_sorted["E_min6_past"] = df_sorted.groupby(PERSON_COL, sort=False)[E_COL].transform(
        lambda s: s.shift(1).rolling(window=6, min_periods=1).min()
    )
    df_sorted["E_max6_past"] = df_sorted.groupby(PERSON_COL, sort=False)[E_COL].transform(
        lambda s: s.shift(1).rolling(window=6, min_periods=1).max()
    )

    # ---- 中期トレンド（Trend_B_base）----
    slope = df_sorted["E_slope_6"]
    slope_std = df_sorted["E_slope_6_std_12"]
    base = np.full(len(df_sorted), "安定", dtype=object)
    base[~has_mid_history] = "未評価"
    mid_mask = has_mid_history & slope.notna()

    # 上昇中（簡素化：slope > TREND_SLOPEで正が保証される、slope_std > TREND_SLOPE_STDで正が保証される）
    base[
        (mid_mask & (slope > TREND_SLOPE) & (slope_std > TREND_SLOPE_STD_MIN))
        | ((slope_std.notna()) & (slope_std > TREND_SLOPE_STD))
    ] = "上昇中"

    # 低下中（簡素化：slope < -TREND_SLOPEで負が保証される、slope_std < -TREND_SLOPE_STDで負が保証される）
    base[
        (mid_mask & (slope < -TREND_SLOPE) & (slope_std < -TREND_SLOPE_STD_MIN))
        | ((slope_std.notna()) & (slope_std < -TREND_SLOPE_STD))
    ] = "低下中"

    df_sorted["Trend_B_base"] = base

    # 履歴不足の人は傾き系指標を NaN に
    slope_cols = ["E_slope_6", "E_slope_12", "E_slope_6_std_12", "E_accel_6",
                  "V_slope_6", "D_slope_6", "A_slope_6"]
    for col in slope_cols:
        if col in df_sorted.columns:
            df_sorted.loc[~has_mid_history, col] = np.nan

    # ---- 短期トレンド（Trend_B_recent）----
    delta = df_sorted["E_delta_1"]
    delta_prev = df_sorted["E_delta_1_prev"]

    # 変化量の閾値
    acute_thr = CHANGE_TAG_THRESHOLD  # 6.0 (急上昇／急落)
    recent_thr = TREND_RECENT_DELTA   # 2.0 (上昇／下降)

    delta_vals = delta.to_numpy(dtype=float)
    delta_prev_vals = delta_prev.to_numpy(dtype=float)

    # 統合トレンド判定（連続性も含む）
    recent = np.full(len(df_sorted), "横ばい", dtype=object)

    # 急上昇・急落判定（絶対値が大きい）
    acute_up = delta_vals >= acute_thr
    acute_down = delta_vals <= -acute_thr

    # 上昇・下降判定（中程度の変化）
    moderate_up = (delta_vals > recent_thr) & (delta_vals < acute_thr)
    moderate_down = (delta_vals < -recent_thr) & (delta_vals > -acute_thr)

    # 連続性判定
    up_prev = delta_prev_vals > recent_thr
    down_prev = delta_prev_vals < -recent_thr

    # 連続上昇・連続下降（2期連続で閾値超え）
    consecutive_up = (delta_vals > recent_thr) & up_prev
    consecutive_down = (delta_vals < -recent_thr) & down_prev

    # 優先順位: 連続 > 急 > 通常
    recent[moderate_down] = "下降"
    recent[moderate_up] = "上昇"
    recent[acute_down] = "急落"
    recent[acute_up] = "急上昇"
    recent[consecutive_down] = "連続下降"
    recent[consecutive_up] = "連続上昇"

    df_sorted["Trend_B_recent"] = recent

    # ---- 統合トレンド (Trend_B_refined) ----
    df_sorted["Trend_B_refined"] = df_sorted.apply(_refine_trend, axis=1)

    return df_sorted.sort_index()


# ========== C_columns (Stability, Traits) ==========

def _compute_stability(df_sorted: pd.DataFrame, mid_window: int) -> pd.DataFrame:
    """
    安定性指標を計算（6ヶ月および12ヶ月）

    Args:
        df_sorted: ソート済みDataFrame
        mid_window: 中期ウィンドウサイズ

    Returns:
        安定性カラムが追加されたDataFrame
    """
    group_sorted = df_sorted.groupby(PERSON_COL, sort=False)

    def _const_window_range(series: pd.Series, window: int) -> pd.Series:
        """指定ウィンドウでの最大-最小を計算"""
        roll = series.rolling(window=window, min_periods=window)
        return roll.max() - roll.min()

    # C_stability (6-month)
    range_e = group_sorted[E_COL].transform(lambda s: _const_window_range(s, mid_window))
    range_v = group_sorted[V_COL].transform(lambda s: _const_window_range(s, mid_window))
    range_d = group_sorted[D_COL].transform(lambda s: _const_window_range(s, mid_window))
    range_a = group_sorted[A_COL].transform(lambda s: _const_window_range(s, mid_window))

    same_flag = (
        range_e.le(STABILITY_RANGE_EPS).fillna(False)
        & range_v.le(STABILITY_RANGE_EPS).fillna(False)
        & range_d.le(STABILITY_RANGE_EPS).fillna(False)
        & range_a.le(STABILITY_RANGE_EPS).fillna(False)
    )

    std_flag = df_sorted["E_std_6"]
    abs_momentum = df_sorted["E_momentum_3"].abs()

    stable_flag = (std_flag < STABILITY_STD_STABLE) & (abs_momentum < STABILITY_MOMENTUM_STABLE)
    unstable_flag = std_flag > STABILITY_STD_UNSTABLE

    counts = df_sorted.groupby(PERSON_COL, sort=False)[PERSON_COL].transform("size")
    has_mid_history = counts > MID_MIN_RECORDS
    stability_values = np.array([""] * len(df_sorted), dtype=object)

    if has_mid_history.any():
        evaluated = np.select(
            [same_flag, stable_flag, unstable_flag],
            ["不変", "安定", "不安定"],
            default="やや安定"
        )
        stability_values[has_mid_history] = evaluated[has_mid_history]

    df_sorted["C_stability"] = stability_values

    # C_stability_long (12-month)
    range_e_12 = group_sorted[E_COL].transform(lambda s: _const_window_range(s, 12))
    range_v_12 = group_sorted[V_COL].transform(lambda s: _const_window_range(s, 12))
    range_d_12 = group_sorted[D_COL].transform(lambda s: _const_window_range(s, 12))
    range_a_12 = group_sorted[A_COL].transform(lambda s: _const_window_range(s, 12))

    same_flag_long = (
        range_e_12.le(STABILITY_RANGE_EPS).fillna(False)
        & range_v_12.le(STABILITY_RANGE_EPS).fillna(False)
        & range_d_12.le(STABILITY_RANGE_EPS).fillna(False)
        & range_a_12.le(STABILITY_RANGE_EPS).fillna(False)
    )

    std_flag_long = df_sorted["E_std_12"]
    abs_momentum_long = df_sorted["E_momentum_6"].abs()

    stable_flag_long = (std_flag_long < STABILITY_STD_STABLE_LONG) & \
                       (abs_momentum_long < STABILITY_MOMENTUM_STABLE_LONG)
    unstable_flag_long = std_flag_long > STABILITY_STD_UNSTABLE_LONG

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

    return df_sorted


def _compute_trait_strength_weakness(df_sorted: pd.DataFrame) -> pd.DataFrame:
    """
    特性の強み・弱みと信頼度を計算

    Args:
        df_sorted: ソート済みDataFrame

    Returns:
        特性カラムが追加されたDataFrame
    """
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

    for pid, person_data in df_sorted.groupby(PERSON_COL, sort=False):
        band = person_data["_trait_level_band"]
        valid_level = band.isin(["High", "Mid", "Low"]).astype(float)
        high_indicator = band.eq("High").astype(float)
        low_indicator = band.eq("Low").astype(float)

        level_count = valid_level.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()
        high_count = high_indicator.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()
        low_count = low_indicator.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()

        strength_counts_series = {}
        weakness_counts_series = {}

        for label, col in dims:
            s_flag = (person_data[col] > SECTION_THRESHOLD).astype(float).where(person_data[col].notna(), 0.0)
            w_flag = (person_data[col] < -SECTION_THRESHOLD).astype(float).where(person_data[col].notna(), 0.0)
            strength_counts_series[label] = s_flag.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()
            weakness_counts_series[label] = w_flag.rolling(window=TRAIT_WINDOW_MONTHS, min_periods=1).sum()

        strength_labels = []
        weakness_labels = []
        conf_v_s, conf_d_s, conf_a_s = [], [], []
        conf_v_w, conf_d_w, conf_a_w = [], [], []

        for idx in range(len(person_data)):
            history_len = level_count.iloc[idx]
            high_cnt = high_count.iloc[idx]
            low_cnt = low_count.iloc[idx]

            # Strength evaluation
            label_strength = ""
            cv_s = cd_s = ca_s = np.nan

            if pd.notna(history_len) and history_len >= TRAIT_MIN_HISTORY:
                threshold_high = _dynamic_level_ratio_threshold(history_len)
                pct_high = (high_cnt / history_len) if history_len > 0 else np.nan

                if pd.notna(pct_high) and pct_high >= threshold_high:
                    counts = {lab: strength_counts_series[lab].iloc[idx] for lab, _ in dims}
                    total = sum(counts.values())

                    if total > 0:
                        cv_s = counts["V"] / total
                        cd_s = counts["D"] / total
                        ca_s = counts["A"] / total

                    labels = _select_dim_labels(counts)
                    label_strength = ", ".join(labels)

            # Weakness evaluation
            label_weakness = ""
            cv_w = cd_w = ca_w = np.nan

            if pd.notna(history_len) and history_len >= TRAIT_MIN_HISTORY:
                threshold_low = _dynamic_level_ratio_threshold(history_len)
                pct_low = (low_cnt / history_len) if history_len > 0 else np.nan

                if pd.notna(pct_low) and pct_low >= threshold_low:
                    counts = {lab: weakness_counts_series[lab].iloc[idx] for lab, _ in dims}
                    total = sum(counts.values())

                    if total > 0:
                        cv_w = counts["V"] / total
                        cd_w = counts["D"] / total
                        ca_w = counts["A"] / total

                    labels = _select_dim_labels(counts)
                    label_weakness = ", ".join(labels)

            strength_labels.append(label_strength)
            weakness_labels.append(label_weakness)
            conf_v_s.append(cv_s)
            conf_d_s.append(cd_s)
            conf_a_s.append(ca_s)
            conf_v_w.append(cv_w)
            conf_d_w.append(cd_w)
            conf_a_w.append(ca_w)

        trait_strength.update(zip(person_data.index, strength_labels))
        trait_weakness.update(zip(person_data.index, weakness_labels))
        trait_strength_conf_V.update(zip(person_data.index, conf_v_s))
        trait_strength_conf_D.update(zip(person_data.index, conf_d_s))
        trait_strength_conf_A.update(zip(person_data.index, conf_a_s))
        trait_weakness_conf_V.update(zip(person_data.index, conf_v_w))
        trait_weakness_conf_D.update(zip(person_data.index, conf_d_w))
        trait_weakness_conf_A.update(zip(person_data.index, conf_a_w))

    df_sorted["C_trait_strength"] = df_sorted.index.map(trait_strength).fillna("")
    df_sorted["C_trait_weakness"] = df_sorted.index.map(trait_weakness).fillna("")
    df_sorted["trait_strength_conf_V"] = df_sorted.index.map(trait_strength_conf_V)
    df_sorted["trait_strength_conf_D"] = df_sorted.index.map(trait_strength_conf_D)
    df_sorted["trait_strength_conf_A"] = df_sorted.index.map(trait_strength_conf_A)
    df_sorted["trait_weakness_conf_V"] = df_sorted.index.map(trait_weakness_conf_V)
    df_sorted["trait_weakness_conf_D"] = df_sorted.index.map(trait_weakness_conf_D)
    df_sorted["trait_weakness_conf_A"] = df_sorted.index.map(trait_weakness_conf_A)
    df_sorted.drop(columns=["_trait_level_band"], inplace=True, errors="ignore")

    return df_sorted


def compute_C_columns(df_in: pd.DataFrame, mid_window: int) -> pd.DataFrame:
    """
    安定性および特性カラムを計算

    Args:
        df_in: 入力DataFrame
        mid_window: 中期ウィンドウサイズ

    Returns:
        安定性・特性カラムが追加されたDataFrame
    """
    df_sorted = df_in.sort_values([PERSON_COL, WAVE_COL]).copy()
    df_sorted = _compute_stability(df_sorted, mid_window)
    df_sorted = _compute_trait_strength_weakness(df_sorted)
    return df_sorted.sort_index()


# ========== flag_constant_6m ==========

def _is_constant_values(vals: np.ndarray, min_count: int = 6) -> bool:
    """
    配列の値が一定かどうかを判定

    Args:
        vals: データ配列
        min_count: 判定に必要な最小データ数

    Returns:
        True if values are constant
    """
    finite = vals[np.isfinite(vals)]
    return len(set(finite)) <= 1 if len(finite) >= min_count else False


def compute_flag_constant_6m(df_in: pd.DataFrame) -> pd.DataFrame:
    """
    flag_constant_6m を計算

    V/D/A が直近6ヶ月間すべて同じ値の場合に TRUE

    Args:
        df_in: 入力DataFrame

    Returns:
        flag_constant_6m カラムが追加されたDataFrame
    """
    df = df_in.copy().sort_values([PERSON_COL, WAVE_COL])

    def _compute_flag(person_data: pd.DataFrame) -> pd.Series:
        """個人ごとにフラグを計算"""
        flags = []

        for i in range(len(person_data)):
            if i < 5:  # Need at least 6 months
                flags.append("FALSE")
                continue

            # Get the last 6 months including current
            v_vals = person_data[V_COL].iloc[max(0, i-5):i+1].values
            d_vals = person_data[D_COL].iloc[max(0, i-5):i+1].values
            a_vals = person_data[A_COL].iloc[max(0, i-5):i+1].values

            # Check if all values are the same
            v_constant = _is_constant_values(v_vals, 6)
            d_constant = _is_constant_values(d_vals, 6)
            a_constant = _is_constant_values(a_vals, 6)

            flags.append("TRUE" if (v_constant and d_constant and a_constant) else "FALSE")

        return pd.Series(flags, index=person_data.index)

    df["flag_constant_6m"] = df.groupby(PERSON_COL, sort=False, group_keys=False).apply(
        _compute_flag, include_groups=False
    ).reset_index(level=0, drop=True)

    return df


# ========== Monthly Metrics ==========

def compute_monthly_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    """
    月次メトリクス（E_ma3, E_slope_3m, E_slope_3m_ma3, accel_3m）を計算

    Args:
        individuals: 個人データ

    Returns:
        月次メトリクスのDataFrame
    """
    rows = []

    for pid, person_data in individuals.groupby(PERSON_COL):
        person_sorted = person_data.sort_values(WAVE_COL)
        e_series = person_sorted.set_index(WAVE_COL)[E_COL]

        if e_series.empty:
            continue

        # 3ヶ月移動平均
        E_ma3 = e_series.rolling(3, min_periods=1).mean()

        # E_slope_3m: 3点の単回帰傾き
        slope_vals = [np.nan] * len(e_series)
        if len(e_series) >= 3:
            for i in range(2, len(e_series)):
                arr = e_series.iloc[i - 2:i + 1].values.astype(float)
                if np.isfinite(arr).sum() >= 3:
                    slope_vals[i] = slope3_ols(arr)
        slope_s = pd.Series(slope_vals, index=e_series.index)

        # E_slope_3m の3ヶ月移動平均
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
                    "E_slope_3m": slope_s.values,
                    "E_slope_3m_ma3": slope_ma3.values,
                    "accel_3m": accel_s.values,
                }
            )
        )

    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=[PERSON_COL, WAVE_COL])


# ========== Episode & Distribution Metrics ==========

def compute_expanding_episode_distribution_metrics(individuals: pd.DataFrame) -> pd.DataFrame:
    """
    エピソード・分布指標を expanding（累積）計算

    Args:
        individuals: 個人データ

    Returns:
        エピソード指標のDataFrame
    """
    rows = []

    for pid, person_data in individuals.sort_values([PERSON_COL, WAVE_COL]).groupby(PERSON_COL):
        person_data = person_data.reset_index(drop=True)
        bands = person_data["level"].apply(bandify_level).tolist()

        rec = 0
        fall = 0
        high_cnt = 0
        mid_cnt = 0
        low_cnt = 0
        max_low_streak = 0
        current_low_streak = 0
        low_episode_count = 0
        prev_band = None

        for idx, (wave, band) in enumerate(zip(person_data[WAVE_COL], bands)):
            # Count band occurrences
            if band == "High":
                high_cnt += 1
            elif band == "Mid":
                mid_cnt += 1
            elif band == "Low":
                low_cnt += 1

            # Track recovery and fall episodes
            if prev_band is not None:
                if prev_band == "Low" and band in ("Mid", "High"):
                    rec += 1
                elif prev_band in ("Mid", "High") and band == "Low":
                    fall += 1

            # Track low streaks
            if band == "Low":
                current_low_streak += 1
                if current_low_streak > max_low_streak:
                    max_low_streak = current_low_streak
                if current_low_streak == LOW_EPISODE_THRESHOLD:
                    low_episode_count += 1
            else:
                current_low_streak = 0

            # Calculate cumulative statistics
            total = idx + 1
            pct_high = float(high_cnt / total) if total else np.nan
            pct_mid = float(mid_cnt / total) if total else np.nan
            pct_low = float(low_cnt / total) if total else np.nan
            fall_rate = float(fall / total) if total else 0.0
            recovery_rate = float(rec / fall) if fall else 0.0

            rows.append({
                PERSON_COL: pid,
                WAVE_COL: wave,
                "episodes_recovery": rec,
                "episodes_fall": fall,
                "pct_high": pct_high,
                "pct_mid": pct_mid,
                "pct_low": pct_low,
                "low_streak_max": int(max_low_streak),
                "episodes_low2plus": int(low_episode_count),
                "recovery_rate": recovery_rate,
                "fall_rate": fall_rate,
            })

            prev_band = band

    return pd.DataFrame(rows)


# ========== Monthly Slope Ratios (r_pos, r_neg) ==========

def compute_slope_ratios(individuals: pd.DataFrame) -> pd.DataFrame:
    """
    各Wave時点での直近12ヶ月のE_slope_3m正負比率を計算

    Args:
        individuals: 個人データ

    Returns:
        正負比率のDataFrame
    """
    rows = []

    for pid, person_data in individuals.groupby(PERSON_COL):
        person_sorted = person_data.sort_values(WAVE_COL)
        e_slope_3m = person_sorted["E_slope_3m"].values

        r_pos_list = []
        r_neg_list = []

        for i in range(len(person_sorted)):
            # Get last up to 12 months of E_slope_3m including current
            start_idx = max(0, i - SLOPE_PATTERN_WINDOW + 1)
            window_slopes = e_slope_3m[start_idx:i + 1]

            # Filter out NaN values
            valid_slopes = window_slopes[~pd.isna(window_slopes)]

            if len(valid_slopes) > 0:
                r_pos = float(sum(1 for x in valid_slopes if x > 0) / len(valid_slopes))
                r_neg = float(sum(1 for x in valid_slopes if x < 0) / len(valid_slopes))
            else:
                r_pos = np.nan
                r_neg = np.nan

            r_pos_list.append(r_pos)
            r_neg_list.append(r_neg)

        person_features = person_sorted[[PERSON_COL, WAVE_COL]].copy()
        person_features["r_pos"] = r_pos_list
        person_features["r_neg"] = r_neg_list
        rows.append(person_features)

    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(
        columns=[PERSON_COL, WAVE_COL, "r_pos", "r_neg"]
    )


# ========== slope3m_pattern Helper Functions ==========

def _sign(x: float) -> int:
    """
    値の符号を返す

    Args:
        x: 数値

    Returns:
        +1 (正), -1 (負), 0 (ゼロまたはNaN)
    """
    if pd.isna(x):
        return 0
    if x > 0:
        return 1
    if x < 0:
        return -1
    return 0


def _count_sign_flips(slopes: List[float]) -> int:
    """
    傾きの符号反転回数をカウント（ゼロを無視）

    Args:
        slopes: 傾きのリスト

    Returns:
        符号反転回数
    """
    last_sign = 0
    flips = 0

    for x in slopes:
        s = _sign(x)
        if s == 0:
            continue
        if last_sign != 0 and s != last_sign:
            flips += 1
        last_sign = s

    return flips


def _front_back_means(slopes: List[float]) -> Tuple[float, float]:
    """
    リストを前半・後半に分割して平均を計算

    Args:
        slopes: 傾きのリスト

    Returns:
        (前半平均, 後半平均)
    """
    n = len(slopes)
    if n == 0:
        return (np.nan, np.nan)

    n_front = n // 2
    if n_front == 0:
        return (np.nan, float(np.mean(slopes)))

    front = slopes[:n_front]
    back = slopes[n_front:]
    front_mean = float(np.mean(front))
    back_mean = float(np.mean(back))

    return front_mean, back_mean


def _first_last_segments(slopes: List[float], k: int = 3) -> Tuple[List[float], List[float]]:
    """
    最初と最後の k 個の非NaN値を抽出

    Args:
        slopes: 傾きのリスト
        k: 抽出する要素数

    Returns:
        (最初のk個, 最後のk個)
    """
    non_null = [x for x in slopes if pd.notna(x)]
    if not non_null:
        return [], []

    first = non_null[: min(k, len(non_null))]
    last = non_null[-min(k, len(non_null)) :]

    return first, last


# ========== slope3m_pattern Calculation ==========

def compute_slope3m_pattern(monthly_trends: pd.DataFrame) -> pd.DataFrame:
    """
    slope3m_pattern を分類

    直近12ヶ月の E_slope_3m、E_slope_12、E_slope_6_std_12 を使用して
    以下のパターンに分類:
    - Insufficient: データ不足
    - Net Growth / Net Decline: 一貫した上昇/低下
    - U-Shape / Inverted-U: U字型/逆U字型
    - Oscillating: 振動的
    - Flat/Noisy: 平坦/ノイズ的

    Args:
        monthly_trends: 月次トレンドデータ

    Returns:
        slope3m_pattern のDataFrame
    """
    pat = []

    for pid, person_data in monthly_trends.groupby(PERSON_COL):
        person_sorted = person_data.sort_values(WAVE_COL)

        # Get last up to SLOPE_PATTERN_WINDOW months of E_slope_3m
        e_slope_3m_seq = person_sorted["E_slope_3m"].tail(SLOPE_PATTERN_WINDOW).tolist()

        # Get latest values of E_slope_12 and E_slope_6_std_12
        latest_row = person_sorted.iloc[-1]
        e_slope_12 = latest_row.get("E_slope_12", np.nan)
        e_slope_6_std_12 = latest_row.get("E_slope_6_std_12", np.nan)

        # Filter None/NaN values but keep chronological order
        valid_slopes = [x for x in e_slope_3m_seq if pd.notna(x)]
        N = len(valid_slopes)

        # Step 1. Insufficient
        if N <= 3:
            patt = "Insufficient"
        else:
            # Basic stats
            r_pos = sum(1 for x in valid_slopes if x > 0) / N
            r_neg = sum(1 for x in valid_slopes if x < 0) / N
            mean_3m = float(np.mean(valid_slopes))
            flips = _count_sign_flips(valid_slopes)
            front_mean, back_mean = _front_back_means(valid_slopes)
            first3, last3 = _first_last_segments(valid_slopes, k=3)

            # Step 2. Net Growth / Net Decline
            if pd.notna(e_slope_12) and pd.notna(e_slope_6_std_12):
                if (
                    r_pos >= NET_RATIO_THRESHOLD
                    and mean_3m > 0
                    and abs(e_slope_12) >= SLOPE12_THRESHOLD
                    and abs(e_slope_6_std_12) >= SLOPE6_STD12_THRESHOLD
                ):
                    patt = "Net Growth"
                elif (
                    r_neg >= NET_RATIO_THRESHOLD
                    and mean_3m < 0
                    and abs(e_slope_12) >= SLOPE12_THRESHOLD
                    and abs(e_slope_6_std_12) >= SLOPE6_STD12_THRESHOLD
                ):
                    patt = "Net Decline"
                else:
                    patt = None
            else:
                patt = None

            # Step 3. U-Shape / Inverted-U
            if patt is None and first3 and last3:
                neg_first = sum(1 for x in first3 if x < 0)
                pos_first = sum(1 for x in first3 if x > 0)
                neg_last = sum(1 for x in last3 if x < 0)
                pos_last = sum(1 for x in last3 if x > 0)

                # U-Shape
                if (
                    front_mean < 0
                    and back_mean > 0
                    and neg_first >= 2
                    and pos_last >= 2
                ):
                    patt = "U-Shape"
                # Inverted-U
                elif (
                    front_mean > 0
                    and back_mean < 0
                    and pos_first >= 2
                    and neg_last >= 2
                ):
                    patt = "Inverted-U"

            # Step 4. Oscillating
            if patt is None and flips >= 3:
                patt = "Oscillating"

            # Step 5. Flat/Noisy
            if patt is None:
                patt = "Flat/Noisy"

        pat.append({PERSON_COL: pid, "slope3m_pattern": patt})

    return pd.DataFrame(pat)


# ========== Main Pipeline ==========

def run(input_path: Path, output_path: Path, mid_window: int = 6):
    """
    メイン処理パイプライン

    Args:
        input_path: 入力Excelファイルパス
        output_path: 出力Excelファイルパス
        mid_window: 中期ウィンドウサイズ（デフォルト: 6ヶ月）
    """
    # Read input
    xl = pd.ExcelFile(input_path)
    sheet = "rating2" if "rating2" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet)

    # Prepare columns
    df[WAVE_COL] = _to_wave(df)
    df[SECTION_COL] = df["section"]
    gr = df["group"].astype(str).str.strip()
    df[GROUP_COL] = np.where(gr.eq("") | gr.str.lower().eq("nan"), df["section"], df["group"])

    if "mail_address" in df.columns:
        df[PERSON_COL] = df["mail_address"]
    elif "name" in df.columns:
        df[PERSON_COL] = df["name"]
    else:
        raise RuntimeError("個人識別列（mail_address または name）が必要です。")

    # Convert V/D/A/E columns
    df[V_COL] = pd.to_numeric(df.get("vigor_rating", df.get(V_COL)), errors="coerce")
    df[D_COL] = pd.to_numeric(df.get("dedication_rating", df.get(D_COL)), errors="coerce")
    df[A_COL] = pd.to_numeric(df.get("absorption_rating", df.get(A_COL)), errors="coerce")

    if "engagement_rating" in df.columns:
        df[E_COL] = pd.to_numeric(df["engagement_rating"], errors="coerce")
    else:
        df[E_COL] = df[[V_COL, D_COL, A_COL]].sum(axis=1, min_count=3)

    # Select columns
    cols_to_use = [PERSON_COL, "name", WAVE_COL, V_COL, D_COL, A_COL, E_COL]
    if SECTION_COL in df.columns:
        cols_to_use.append(SECTION_COL)
    if GROUP_COL in df.columns:
        cols_to_use.append(GROUP_COL)

    use = df[cols_to_use].copy()

    # Validate input
    is_valid, errors = validate_input_data(use)
    if not is_valid:
        print("⚠️  入力データの検証エラー:")
        for error in errors:
            print(f"  - {error}")
        print("処理を続行しますが、結果に問題がある可能性があります。")

    # Remove duplicates
    dup_mask = use.duplicated(subset=[PERSON_COL, WAVE_COL], keep='last')
    if dup_mask.sum() > 0:
        duplicates = use[use.duplicated(subset=[PERSON_COL, WAVE_COL], keep=False)].sort_values(
            [PERSON_COL, WAVE_COL]
        )
        print(f"⚠️  WARNING: 入力データに {dup_mask.sum()} 件の重複を検出しました:")
        for (person, wave), group in duplicates.groupby([PERSON_COL, WAVE_COL]):
            print(f"  - {person}, {wave}: {len(group)} レコード")
        print(f"  → 最新のレコードを残して重複を削除します")
        use = use[~dup_mask].copy()

    # Feature engineering pipeline
    use = add_section_group_zscores(use, [V_COL, D_COL, A_COL, E_COL])
    use = add_multiscale_features(use)
    use = overwrite_short_mid_personal(use, mid_window=mid_window)
    use = compute_flag_constant_6m(use)
    use = apply_personal_trend_logic(use)
    use = compute_C_columns(use, mid_window=mid_window)

    use["level"] = use[E_COL].apply(_level_from_e)

    # Personal standardized change and big_change
    use["E_delta_1_std_12"] = np.where(
        use["E_std_12"] > 0,
        use["E_delta_1"] / use["E_std_12"],
        np.nan,
    )

    use["big_change"] = np.where(
        (use["E_std_12"] > 0) & (use["E_delta_1"].abs() / use["E_std_12"] > BIG_CHANGE_PERSONAL_Z),
        "変化大",
        "",
    )

    use["big_change_abs"] = np.where(
        use["E_delta_1"].abs() >= CHANGE_TAG_THRESHOLD,
        "変化大",
        "",
    )

    # Additional metrics
    monthly_metrics_df = compute_monthly_metrics(use)
    use = use.merge(monthly_metrics_df, on=[PERSON_COL, WAVE_COL], how="left")

    slope_ratios_df = compute_slope_ratios(use)
    use = use.merge(slope_ratios_df, on=[PERSON_COL, WAVE_COL], how="left")

    epi_dist_df = compute_expanding_episode_distribution_metrics(use)
    use = use.merge(epi_dist_df, on=[PERSON_COL, WAVE_COL], how="left")

    pattern_df = compute_slope3m_pattern(use)
    use = use.merge(pattern_df, on=PERSON_COL, how="left")

    # Rename columns
    use = use.rename(columns={
        "Trend_B_base": "trend_base",
        "Trend_B_recent": "trend_recent",
        "Trend_B_refined": "trend_refined",
        "C_stability": "stability_6",
        "C_stability_long": "stability_12",
        "C_short_strength": "short_strength",
        "C_short_weakness": "short_weakness",
        "C_mid_strength": "mid_strength",
        "C_mid_weakness": "mid_weakness",
        "C_trait_strength": "trait_strength",
        "C_trait_weakness": "trait_weakness",
    })

    # Build output sheets
    monthly_cols = [
        "person", "name", "wave",
        "level", "slope3m_pattern",
        "trend_base", "trend_recent", "trend_refined",
        "big_change", "big_change_abs",
        "stability_6", "stability_12",
        "short_strength", "short_weakness",
        "mid_strength", "mid_weakness",
        "trait_strength", "trait_weakness",
        "flag_constant_6m",
        "engagement", "vigor", "dedication", "absorption",
        "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",
        "r_pos", "r_neg",
        "E_momentum_3",
        "E_mean_3", "E_mean_6",
        "E_std_6", "E_std_12", "E_std_18",
        "E_iqr_6",
        "E_slope_6", "E_slope_12", "E_slope_6_std_12",
        "E_ma3", "E_slope_3m", "E_slope_3m_ma3",
        "pct_high", "pct_mid", "pct_low",
        "episodes_recovery", "episodes_fall",
        "recovery_rate", "fall_rate",
        "episodes_low2plus", "low_streak_max",
        "V_delta_1", "D_delta_1", "A_delta_1",
        "V_slope_6", "D_slope_6", "A_slope_6",
        "trait_strength_conf_V", "trait_strength_conf_D", "trait_strength_conf_A",
        "trait_weakness_conf_V", "trait_weakness_conf_D", "trait_weakness_conf_A",
    ]
    monthly_cols = [c for c in monthly_cols if c in use.columns]
    monthly_trends = use[monthly_cols].copy().sort_values(["person", "wave"])

    latest_wave = monthly_trends["wave"].max()
    latest_individuals = monthly_trends[monthly_trends["wave"] == latest_wave].copy()

    # Excel output
    try:
        import xlsxwriter
        engine = "xlsxwriter"
    except Exception:
        engine = None

    with pd.ExcelWriter(output_path, engine=engine) as w:
        monthly_trends.to_excel(w, sheet_name="monthly_trends", index=False)
        latest_individuals.to_excel(w, sheet_name="latest_individuals", index=False)

        if engine == "xlsxwriter":
            wb = w.book
            intfmt = wb.add_format({"num_format": "0"})
            twofmt = wb.add_format({"num_format": "0.00"})
            pctfmt = wb.add_format({"num_format": "0.00"})

            for sh, data in [("monthly_trends", monthly_trends),
                            ("latest_individuals", latest_individuals)]:
                ws = w.sheets[sh]
                ws.freeze_panes(1, 2)
                ws.autofilter(0, 0, 0, max(0, data.shape[1] - 1))
                colidx = {c: i for i, c in enumerate(data.columns)}

                # Integer columns
                for key in ["vigor", "dedication", "absorption", "engagement",
                           "episodes_recovery", "episodes_fall",
                           "episodes_low2plus", "low_streak_max"]:
                    if key in colidx:
                        ws.set_column(colidx[key], colidx[key], 12, intfmt)

                # Float columns
                float_keys = [
                    "E_momentum_3", "E_delta_1", "E_delta_1_prev", "E_delta_1_std_12",
                    "E_mean_3", "E_mean_6",
                    "E_std_6", "E_std_12", "E_std_18", "E_iqr_6",
                    "E_slope_12", "E_slope_6", "E_slope_6_std_12",
                    "E_ma3", "E_slope_3m", "E_slope_3m_ma3",
                    "V_delta_1", "D_delta_1", "A_delta_1",
                    "V_slope_6", "D_slope_6", "A_slope_6",
                    "recovery_rate", "fall_rate",
                    "trait_strength_conf_V", "trait_strength_conf_D", "trait_strength_conf_A",
                    "trait_weakness_conf_V", "trait_weakness_conf_D", "trait_weakness_conf_A"
                ]
                for key in float_keys:
                    if key in colidx:
                        ws.set_column(colidx[key], colidx[key], 12, twofmt)

                # Percentage columns
                for key in ["pct_high", "pct_mid", "pct_low", "r_pos", "r_neg"]:
                    if key in colidx:
                        ws.set_column(colidx[key], colidx[key], 12, pctfmt)


def main():
    """コマンドライン実行用のメイン関数"""
    ap = argparse.ArgumentParser(description="WE Analyzer - ワーク・エンゲージメント 分析スクリプト")
    ap.add_argument("--input", "-i", type=str, default="workengagement.xlsx", help="入力ファイル")
    ap.add_argument("--output", "-o", type=str, default="we_report.xlsx", help="出力ファイル")
    ap.add_argument("--mid-window", type=int, default=6, help="中期ウィンドウサイズ（デフォルト: 6）")
    args = ap.parse_args()

    inp = Path(args.input)
    if not inp.exists():
        inp = Path("/mnt/data") / args.input
    if not inp.exists():
        raise FileNotFoundError(f"入力ファイルが見つかりません: {args.input}")

    outp = Path(args.output)
    run(inp, outp, mid_window=int(args.mid_window))
    print(f"✓ 完了: {outp.resolve()}")
    print(f"  - monthly_trends: 全員×全Wave の月次時系列")
    print(f"  - latest_individuals: 最新Waveのみ（monthly_trendsと同じ列構成）")


if __name__ == "__main__":
    main()
