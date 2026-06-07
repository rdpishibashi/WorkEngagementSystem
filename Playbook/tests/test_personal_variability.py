# -*- coding: utf-8 -*-
"""
個人内変動指標（direction_6 / volatility_6 系列）の単体テスト。

新方式: 閾値はその個人の過去6か月窓の分位点（P90/P75）で定める完全な個人内基準。
- 方向/波動の判定は = を含まない厳密な不等号（>, <）
- direction の閾値が STABILITY_RANGE_EPS 以下なら判定保留
- 波動は符号反転回数 >= DIR6_SIGN_CHANGE_MIN(=3)（差分0は除外して計数）
すべて 0–54 尺度の engagement で算出。

実行方法:
    cd Playbook
    python tests/test_personal_variability.py
    （pytest があれば: pytest tests/test_personal_variability.py -v）
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import we_analyzer as wa


def _make_person(engagement, person="p1", start=(2024, 1)):
    """engagement 系列から add_multiscale_features + 個人内変動指標済みの DataFrame を作る。"""
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


def _accel_rise(n=14):
    return [round(10 + 0.2 * i * i, 2) for i in range(n)]


def _accel_decline(n=14):
    return [round(44 - 0.2 * i * i, 2) for i in range(n)]


# ---------- _ols_residual_sd ----------

def test_ols_residual_sd_perfect_line():
    assert wa._ols_residual_sd([1, 3, 5, 7, 9, 11]) == 0.0


def test_ols_residual_sd_known():
    assert wa._ols_residual_sd([0, 0, 0, 0, 0, 6]) > 0
    assert np.isnan(wa._ols_residual_sd([5]))


# ---------- 判定保留（履歴・母数・閾値ゼロ） ----------

def test_insufficient_history():
    # 5 ヶ月（窓が作れない）-> すべて判定保留・latest NaN
    df = _make_person([30, 28, 32, 29, 31])
    for c in ["direction_6_p90", "direction_6_p75", "volatility_6_p90", "volatility_6_p75"]:
        assert _last(df, c) == "判定保留"
    assert pd.isna(_last(df, "direction_6_latest"))
    assert pd.isna(_last(df, "residual_sd_6_latest"))
    assert pd.isna(_last(df, "sign_change_count_6"))


def test_insufficient_past_windows():
    # 9 ヶ月 -> 過去窓 3 (<5) -> 判定保留。latest 値は数値
    df = _make_person(_accel_rise(9))
    assert _last(df, "direction_6_p90") == "判定保留"
    assert _last(df, "volatility_6_p90") == "判定保留"
    assert np.isfinite(_last(df, "direction_6_latest"))
    assert pd.isna(_last(df, "direction_6_threshold_p90"))


def test_constant_series_is_hold():
    # 完全一定 -> 過去 |D6| が全て 0 -> 閾値 <= eps -> direction 判定保留
    df = _make_person([30] * 14)
    assert _last(df, "direction_6_p90") == "判定保留"
    assert _last(df, "direction_6_p75") == "判定保留"
    # 閾値の数値自体は出力される（≈0）
    assert _last(df, "direction_6_threshold_p90") <= wa.STABILITY_RANGE_EPS


def test_sufficient_history_not_hold():
    # 14 ヶ月の明確な加速トレンド -> 判定保留にならず閾値が出る
    df = _make_person(_accel_rise(14))
    assert _last(df, "direction_6_p90") != "判定保留"
    assert np.isfinite(_last(df, "direction_6_threshold_p90"))


# ---------- direction_6（方向, 厳密不等号） ----------

def test_steady_linear_is_direction_no_change():
    # 一定ペースの上昇: latest D6 == 過去 P90 -> 厳密 > により方向変化なし（個人内では平常）
    df = _make_person([10 + 2 * i for i in range(14)])
    assert _last(df, "direction_6_p90") == "方向変化なし"
    assert _last(df, "direction_6_p75") == "方向変化なし"


def test_accelerating_rise_is_up():
    # 過去の自分より強い上昇 -> 上昇
    df = _make_person(_accel_rise(14))
    assert _last(df, "direction_6_p90") == "上昇"
    assert _last(df, "direction_6_p75") == "上昇"
    assert _last(df, "direction_6_latest") > 0


def test_accelerating_decline_is_down():
    df = _make_person(_accel_decline(14))
    assert _last(df, "direction_6_p90") == "下降"
    assert _last(df, "direction_6_p75") == "下降"
    assert _last(df, "direction_6_latest") < 0


def test_flat_latest_after_trend_is_direction_no_change():
    # 12ヶ月上昇後フラット -> 過去|D6|大で閾値>0, latest D6≈0 -> 方向変化なし
    df = _make_person([10 + 2 * i for i in range(12)] + [32] * 6)
    assert _last(df, "direction_6_p90") == "方向変化なし"
    assert _last(df, "direction_6_p75") == "方向変化なし"


# ---------- volatility_6（波動, 厳密 > / 符号反転 >=3） ----------

def test_clean_trend_is_no_volatility():
    df = _make_person([10 + 2 * i for i in range(14)])
    assert _last(df, "volatility_6_p90") == "波動なし"
    assert _last(df, "volatility_6_p75") == "波動なし"
    assert _last(df, "sign_change_count_6") == 0


def test_oscillation_is_volatility():
    # 長く安定 -> 直近6ヶ月で大きく上下（符号反転4回 >= 3）
    df = _make_person([30] * 10 + [22, 38, 22, 38, 22, 38])
    assert _last(df, "sign_change_count_6") >= wa.DIR6_SIGN_CHANGE_MIN
    assert _last(df, "volatility_6_p75") == "波動あり"


def test_two_sign_changes_not_volatility():
    # 符号反転2回は新閾値(3)未満 -> 波動なし
    df = _make_person([30] * 10 + [30, 35, 30, 35, 35, 35])
    assert _last(df, "sign_change_count_6") == 2
    assert _last(df, "volatility_6_p90") == "波動なし"
    assert _last(df, "volatility_6_p75") == "波動なし"


def test_zero_diff_excluded_in_sign_count():
    # 差分系列 [+,0,+,0,+] -> 0 を除外すれば符号反転 0 回
    df = _make_person([30] * 8 + [30, 35, 35, 40, 40, 45])
    assert _last(df, "sign_change_count_6") == 0


# ---------- 閾値の単調性・感度 ----------

def test_threshold_monotonicity():
    df = _make_person(_accel_rise(14))
    assert _last(df, "direction_6_threshold_p75") <= _last(df, "direction_6_threshold_p90") + 1e-9
    assert _last(df, "volatility_6_threshold_p75") <= _last(df, "volatility_6_threshold_p90") + 1e-9


def test_p75_at_least_as_sensitive_as_p90():
    df = _make_person(_accel_rise(14))
    d90 = _last(df, "direction_6_p90")
    d75 = _last(df, "direction_6_p75")
    if d90 in ("上昇", "下降"):
        assert d75 == d90


# ---------- intervention priority（stability_6 / volatility_6_p90 の新ロジック） ----------

def _neutral_ip_row(**overrides):
    """介入優先度がゼロになる中立行。overrides で個別フィールドを上書き。"""
    base = {
        "trend_base": "安定",
        "trend_recent": "横ばい",   # 直近変化は trend_recent カテゴリで加点（横ばい=0）
        "trend_refined": "安定維持",
        "big_change": "",
        "stability_6": "",
        "volatility_6_p90": "波動なし",
        "E_delta_1_std_12": 0.0, "E_delta_1_std_6": 0.0,
        "E_slope_6_std_12": 0.0, "E_slope_6_std_6": 0.0,
        "E_slope_3m": 0.0,
    }
    base.update(overrides)
    return pd.Series(base)


def test_ip_neutral_is_zero():
    assert wa.calculate_intervention_priority(_neutral_ip_row()) == (0, 0)


def test_ip_stability_unstable_adds_neg1():
    # 不安定 → 方向不問で neg +1
    assert wa.calculate_intervention_priority(_neutral_ip_row(stability_6="不安定")) == (1, 0)


def test_ip_stability_semi_unstable_adds_neg1():
    # やや不安定 → 不安定と同様に neg +1
    assert wa.calculate_intervention_priority(_neutral_ip_row(stability_6="やや不安定")) == (1, 0)


def test_ip_volatility_adds_neg1():
    # volatility 波動あり → neg +1（中期指標のため -2 から引き下げ、stability と同重み）
    assert wa.calculate_intervention_priority(_neutral_ip_row(volatility_6_p90="波動あり")) == (1, 0)


def test_ip_stability_and_volatility_both_fire():
    # 両方発火 → +1 +1 = neg 2（二重計上を許容する仕様）
    row = _neutral_ip_row(stability_6="不安定", volatility_6_p90="波動あり")
    assert wa.calculate_intervention_priority(row) == (2, 0)


def test_ip_trend_recent_scores():
    # 直近変化は trend_recent カテゴリで加点。急=連続=±3、上昇/下降=±2、横ばい=0。
    # base=安定（base点なし）で trend_recent 単独の寄与を検証。
    cases = {
        "急上昇": (0, 3), "連続上昇": (0, 3), "上昇": (0, 2),
        "急落": (3, 0), "連続下降": (3, 0), "下降": (2, 0),
        "横ばい": (0, 0),
    }
    for recent, expected in cases.items():
        row = _neutral_ip_row(trend_base="安定", trend_recent=recent)
        assert wa.calculate_intervention_priority(row) == expected, recent


def test_ip_e_delta_1_std_no_longer_scores():
    # E_delta_1_std の段階スコアは廃止（trend_recent と重複のため削除）。
    # 大きな値を入れても neg/pos に寄与しないことを確認。
    assert wa.calculate_intervention_priority(_neutral_ip_row(E_delta_1_std_12=-5.0)) == (0, 0)
    assert wa.calculate_intervention_priority(_neutral_ip_row(E_delta_1_std_12=5.0)) == (0, 0)


def test_ip_unstable_while_rising_still_neg():
    # 上昇中(trend_base, recent横ばい) は pos +1。不安定・波動は各 neg +1。
    row = _neutral_ip_row(trend_base="上昇中", stability_6="不安定", volatility_6_p90="波動あり")
    assert wa.calculate_intervention_priority(row) == (2, 1)


def test_ip_downward_reversal_flips_base_to_neg():
    # 下降反転（base 上昇中 × recent 下降系）→ base の点を neg に振替（C2）＋ trend_recent の neg。
    # 下降: base振替neg1 + 下降neg2 = 3 / 急落・連続下降: neg1 + neg3 = 4。
    expected = {"下降": (3, 0), "急落": (4, 0), "連続下降": (4, 0)}
    for recent, exp in expected.items():
        row = _neutral_ip_row(trend_base="上昇中", trend_recent=recent)
        assert wa.calculate_intervention_priority(row) == exp, recent


def test_ip_rising_non_reversal_keeps_pos():
    # 上昇中 × 下降系でない → base pos +1 ＋ trend_recent の pos。
    # 横ばい: 1+0 / 上昇: 1+2 / 急上昇・連続上昇: 1+3。
    expected = {"横ばい": (0, 1), "上昇": (0, 3), "急上昇": (0, 4), "連続上昇": (0, 4)}
    for recent, exp in expected.items():
        row = _neutral_ip_row(trend_base="上昇中", trend_recent=recent)
        assert wa.calculate_intervention_priority(row) == exp, recent


def test_ip_upward_reversal_not_flipped():
    # 上昇反転（base 低下中 × recent 上昇系＝回復）は対象外。base は neg +1 のまま、
    # trend_recent 急上昇 が pos +3 → (1, 3)。pos 優勢で回復として表示される。
    row = _neutral_ip_row(trend_base="低下中", trend_recent="急上昇")
    assert wa.calculate_intervention_priority(row) == (1, 3)


def test_ip_sustained_decline_adds_neg1():
    # 低下継続（持続的低下の高止まり、recent横ばい）→ neg +1。base低下中(+1)と二重計上で neg=2。
    row = _neutral_ip_row(trend_base="低下中", trend_recent="横ばい", trend_refined="低下継続")
    assert wa.calculate_intervention_priority(row) == (2, 0)


def test_ip_sustained_decline_neg_only_no_pos_analog():
    # 上昇継続には pos 加点しない（非対称）。base上昇中の pos +1 のみ（recent横ばい）。
    row = _neutral_ip_row(trend_base="上昇中", trend_recent="横ばい", trend_refined="上昇継続")
    assert wa.calculate_intervention_priority(row) == (0, 1)


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
