# -*- coding: utf-8 -*-
"""
個人内変動指標（direction_6 / volatility_6 / change_1m / acceleration_6 /
intervention_priority_6）の単体テスト。

実行方法:
    cd Playbook
    python tests/test_personal_variability.py
    （pytest があれば: pytest tests/test_personal_variability.py -v）

新指標はすべて 0–54 尺度の engagement に対して算出される。
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import we_analyzer as wa


def _make_person(engagement, person="p1", start=(2025, 1)):
    """engagement 系列から add_multiscale_features 済みの DataFrame を作る。

    V/D/A は E/3 に割り当てる（新指標は E_COL のみ使用）。"""
    y, m = start
    waves = []
    for _ in engagement:
        waves.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    vda = [round(e / 3.0, 3) for e in engagement]
    df = pd.DataFrame({
        wa.PERSON_COL: person,
        "name": person,
        wa.WAVE_COL: waves,
        wa.V_COL: vda,
        wa.D_COL: vda,
        wa.A_COL: vda,
        wa.E_COL: [float(e) for e in engagement],
    })
    df = wa.add_multiscale_features(df)
    return wa.add_personal_variability_features(df)


def _last(df, col):
    return df.sort_values(wa.WAVE_COL).iloc[-1][col]


# ---------- _mad_scaled_sigma ----------

def test_mad_scaled_sigma_basic():
    # 一定値 -> MAD=0
    assert wa._mad_scaled_sigma([5, 5, 5, 5]) == 0.0
    # 既知系列
    val = wa._mad_scaled_sigma([1, 2, 3, 4, 5])
    assert abs(val - 1.4826 * 1.0) < 1e-9  # median=3, MAD=1
    # NaN 混在でも有限値のみで計算
    assert np.isfinite(wa._mad_scaled_sigma([np.nan, 2, 2, np.nan, 2]))
    # 全 NaN -> NaN
    assert np.isnan(wa._mad_scaled_sigma([np.nan, np.nan]))


# ---------- direction_6 ----------

def test_direction_decline():
    df = _make_person([44, 40, 36, 32, 28, 24, 20, 16])
    assert _last(df, "direction_6") == "下降"


def test_direction_rise():
    df = _make_person([10, 14, 18, 22, 26, 30, 34, 38])
    assert _last(df, "direction_6") == "上昇"


def test_direction_flat():
    df = _make_person([30, 31, 29, 30, 31, 29, 30, 31])
    assert _last(df, "direction_6") == "横ばい"


def test_direction_insufficient_history():
    # 5 点（< DIR6_MIN_OBS=6）-> 判定保留
    df = _make_person([30, 28, 32, 29, 31])
    assert _last(df, "direction_6") == "判定保留"
    assert _last(df, "volatility_6") == "判定保留"


# ---------- volatility_6 ----------

def test_volatility_clean_trend_is_normal():
    # きれいな急下降はレンジが大きくても波動ではない
    df = _make_person([54, 48, 42, 36, 30, 24, 18, 12])
    assert _last(df, "direction_6") == "下降"
    assert _last(df, "volatility_6") == "通常"


def test_volatility_high_when_recent_oscillation_exceeds_baseline():
    # 前半安定 -> 直近6ヶ月で大きく上下（個人内基準を超える波動）
    df = _make_person([30, 30, 30, 30, 30, 30, 24, 36, 24, 36, 24, 36])
    assert _last(df, "direction_6") == "横ばい"
    assert _last(df, "volatility_6") == "高"


def test_volatility_stable_is_normal():
    df = _make_person([30, 31, 29, 30, 31, 29, 30, 31])
    assert _last(df, "volatility_6") == "通常"


# ---------- change_1m ----------

def test_change_1m_up():
    df = _make_person([30, 30, 30, 30, 30, 30, 41])
    assert _last(df, "change_1m") == "上昇"


def test_change_1m_down():
    df = _make_person([30, 30, 30, 30, 30, 30, 19])
    assert _last(df, "change_1m") == "低下"


def test_change_1m_flat():
    df = _make_person([30, 30, 30, 30, 30, 30, 31])
    assert _last(df, "change_1m") == "横ばい"


# ---------- acceleration_6 ----------

def test_acceleration_6_present_and_numeric():
    df = _make_person([10, 14, 18, 22, 26, 30, 34, 38])
    val = _last(df, "acceleration_6")
    assert isinstance(val, float)
    # E_accel_6 は削除され acceleration_6 に統合されている
    assert "E_accel_6" not in df.columns


# ---------- intervention_priority_6 ----------

def _row(direction, volatility, engagement):
    return pd.Series({
        "direction_6": direction,
        "volatility_6": volatility,
        wa.E_COL: float(engagement),
    })


def test_priority_matrix():
    f = wa.calculate_intervention_priority_6
    assert f(_row("下降", "通常", 10)) == "最優先"   # 下降 + 低
    assert f(_row("下降", "通常", 40)) == "高"        # 下降 + 高
    assert f(_row("横ばい", "高", 10)) == "高"        # 波動 + 低
    assert f(_row("横ばい", "通常", 10)) == "高"      # 慢性低水準
    assert f(_row("横ばい", "高", 40)) == "中"        # 波動 + 高水準
    assert f(_row("上昇", "通常", 10)) == "中"        # 上昇 + 低
    assert f(_row("上昇", "通常", 40)) == "低"        # 上昇 + 高
    assert f(_row("横ばい", "通常", 40)) == "低"      # 安定
    assert f(_row("判定保留", "判定保留", 40)) == "判定保留"


def test_priority_level_boundaries():
    f = wa.calculate_intervention_priority_6
    # 22.5 未満が低、22.5〜31.5 が中、31.5 超が高
    assert f(_row("下降", "通常", 22.4)) == "最優先"   # 低
    assert f(_row("下降", "通常", 22.5)) == "高"        # 中
    assert f(_row("下降", "通常", 31.5)) == "高"        # 中
    assert f(_row("上昇", "通常", 31.6)) == "低"        # 高


def _run_all():
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        print(f"  PASS {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()
