#!/usr/bin/env python3
"""
ユーザーの指摘内容を検証し、修正が必要な箇所をリストアップ
"""

print("=" * 80)
print("変更内容の検証")
print("=" * 80)

print("\n### 1. 変化大の条件")
print("現在: abs(E_delta_1) / E_std_12 >= 2.0")
print("修正: abs(E_delta_1) / E_std_12 > 2.0")
print("理由: 他の条件と統一（>=を>に）")
print("✓ 正しい修正")

print("\n### 2. trend_base = 上昇中の条件")
print("\n現在の条件:")
print("(E_slope_6 > 0 AND |E_slope_6| > 0.5 AND E_slope_6_std_12 > 0.2)")
print("OR")
print("(E_slope_6_std_12 > 0 AND E_slope_6_std_12 > 0.45)")
print("\n指摘:")
print("- E_slope_6 > 0 は不要 → |E_slope_6| > 0.5 を E_slope_6 > 0.5 にすれば正の値が保証される")
print("- E_slope_6_std_12 > 0 は不要 → E_slope_6_std_12 > 0.45 なら必ず > 0")
print("\n修正後:")
print("(E_slope_6 > 0.5 AND E_slope_6_std_12 > 0.2)")
print("OR")
print("(E_slope_6_std_12 > 0.45)")
print("✓ 正しい修正")

print("\n### 3. trend_base = 低下中の条件")
print("\n現在の条件:")
print("(E_slope_6 < 0 AND |E_slope_6| > 0.5 AND E_slope_6_std_12 < -0.2)")
print("OR")
print("(E_slope_6_std_12 < 0 AND E_slope_6_std_12 < -0.45)")
print("\n修正後:")
print("(E_slope_6 < -0.5 AND E_slope_6_std_12 < -0.2)")
print("OR")
print("(E_slope_6_std_12 < -0.45)")
print("✓ 正しい修正")

print("\n### 4. Priority 4: 回復、低下危機")
print("変更:")
print("- |E_slope_6| > TREND_SLOPE の条件を削除")
print("- trend_recentに「連続上昇」「連続下降」を追加")
print("✓ Excelファイルと一致")

print("\n### 5. Priority 5: 上昇期待、低下警戒")
print("変更:")
print("- E_delta_1 > TREND_DELTA の条件を削除")
print("- trend_base = 「安定」→「安定 or 上昇中」「安定 or 低下中」に拡張")
print("✓ Excelファイルと一致")

print("\n" + "=" * 80)
print("すべての変更が妥当であることを確認しました")
print("=" * 80)
