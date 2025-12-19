# trend_refined 判定条件マトリクス（生指標版）

このマトリクスは、trend_refinedの判定条件を、中間変数（trend_recent, trend_base）を使わず、
**生の指標値（E_delta_1, E_slope_6, E_std_12等）**で直接表現したものです。

## 定数

| 定数名 | 値 | 説明 |
|--------|-----|------|
| CHANGE_TAG_THRESHOLD | 6.0 | 急上昇・急落の閾値 |
| TREND_RECENT_DELTA | 2.0 | 上昇・下降の閾値 |
| TREND_SLOPE | 0.5 | 中期傾き閾値 |
| TREND_SLOPE_STD_MIN | 0.2 | 標準化傾き最小閾値 |
| TREND_SLOPE_STD | 0.45 | 標準化傾き閾値 |
| BIG_CHANGE_PERSONAL_Z | 2.0 | 個人内変化大の閾値（2σ、> で判定） |
| TREND_DELTA | 1.0 | 期待・警戒の閾値 |

## 判定条件


### Priority 1: 上昇加速

**説明**: 上昇トレンド中に大きな変化で加速

**判定条件**:
```
((2.0 < E_delta_1 < 6.0) OR (E_delta_1 >= 6.0) OR (E_delta_1 > 2.0 AND E_delta_1_prev > 2.0)) AND ((E_slope_6 > 0.5 AND E_slope_6_std_12 > 0.2) OR (E_slope_6_std_12 > 0.45)) AND (|E_delta_1| / E_std_12 > 2.0) AND |E_slope_6| > 0.5
```

**使用指標**: E_delta_1, E_delta_1_prev, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 1: 低下加速

**説明**: 低下トレンド中に大きな変化で加速

**判定条件**:
```
((-6.0 < E_delta_1 < -2.0) OR (E_delta_1 <= -6.0) OR (E_delta_1 < -2.0 AND E_delta_1_prev < -2.0)) AND ((E_slope_6 < -0.5 AND E_slope_6_std_12 < -0.2) OR (E_slope_6_std_12 < -0.45)) AND (|E_delta_1| / E_std_12 > 2.0) AND |E_slope_6| > 0.5
```

**使用指標**: E_delta_1, E_delta_1_prev, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 1: 入力疑義

**説明**: V, D, Aが6ヶ月間すべて同じ値

**判定条件**:
```
flag_constant_6m == TRUE
```

**使用指標**: flag_constant_6m

---

### Priority 2: 上昇継続

**説明**: 上昇トレンドが継続

**判定条件**:
```
((2.0 < E_delta_1 < 6.0) OR (E_delta_1 >= 6.0) OR (E_delta_1 > 2.0 AND E_delta_1_prev > 2.0) OR (-2.0 <= E_delta_1 <= 2.0)) AND ((E_slope_6 > 0.5 AND E_slope_6_std_12 > 0.2) OR (E_slope_6_std_12 > 0.45)) AND (|E_delta_1| / E_std_12 < 2.0 OR E_std_12 <= 0) AND |E_slope_6| > 0.5 AND E_delta_1 >= 0
```

**使用指標**: E_delta_1, E_delta_1_prev, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 2: 低下継続

**説明**: 低下トレンドが継続

**判定条件**:
```
((-6.0 < E_delta_1 < -2.0) OR (E_delta_1 <= -6.0) OR (E_delta_1 < -2.0 AND E_delta_1_prev < -2.0) OR (-2.0 <= E_delta_1 <= 2.0)) AND ((E_slope_6 < -0.5 AND E_slope_6_std_12 < -0.2) OR (E_slope_6_std_12 < -0.45)) AND (|E_delta_1| / E_std_12 < 2.0 OR E_std_12 <= 0) AND |E_slope_6| > 0.5 AND E_delta_1 <= 0
```

**使用指標**: E_delta_1, E_delta_1_prev, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 3: 復活

**説明**: 低下トレンドから大きく回復

**判定条件**:
```
((2.0 < E_delta_1 < 6.0) OR (E_delta_1 >= 6.0)) AND ((E_slope_6 < -0.5 AND E_slope_6_std_12 < -0.2) OR (E_slope_6_std_12 < -0.45)) AND (|E_delta_1| / E_std_12 > 2.0) AND |E_slope_6| > 0.5
```

**使用指標**: E_delta_1, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 3: 悪化

**説明**: 上昇トレンドから大きく低下

**判定条件**:
```
((-6.0 < E_delta_1 < -2.0) OR (E_delta_1 <= -6.0)) AND ((E_slope_6 > 0.5 AND E_slope_6_std_12 > 0.2) OR (E_slope_6_std_12 > 0.45)) AND (|E_delta_1| / E_std_12 > 2.0) AND |E_slope_6| > 0.5
```

**使用指標**: E_delta_1, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 4: 低下危機

**説明**: 上昇トレンドから低下

**判定条件**:
```
((-6.0 < E_delta_1 < -2.0) OR (E_delta_1 <= -6.0)) AND ((E_slope_6 > 0.5 AND E_slope_6_std_12 > 0.2) OR (E_slope_6_std_12 > 0.45)) AND (|E_delta_1| / E_std_12 < 2.0 OR E_std_12 <= 0) AND |E_slope_6| > 0.5
```

**使用指標**: E_delta_1, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 4: 回復

**説明**: 低下トレンドから回復

**判定条件**:
```
((2.0 < E_delta_1 < 6.0) OR (E_delta_1 >= 6.0)) AND ((E_slope_6 < -0.5 AND E_slope_6_std_12 < -0.2) OR (E_slope_6_std_12 < -0.45)) AND (|E_delta_1| / E_std_12 < 2.0 OR E_std_12 <= 0) AND |E_slope_6| > 0.5
```

**使用指標**: E_delta_1, E_slope_6, E_slope_6_std_12, E_std_12

---

### Priority 5: 上昇期待

**説明**: 安定状態から上昇の兆し

**判定条件**:
```
((2.0 < E_delta_1 < 6.0) OR (E_delta_1 >= 6.0) OR (E_delta_1 > 2.0 AND E_delta_1_prev > 2.0)) AND (データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件)) AND E_delta_1 > 1.0
```

**使用指標**: E_delta_1, E_delta_1_prev, データ件数（履歴月数）

---

### Priority 5: 低下警戒

**説明**: 安定状態から低下の兆し

**判定条件**:
```
((-6.0 < E_delta_1 < -2.0) OR (E_delta_1 <= -6.0) OR (E_delta_1 < -2.0 AND E_delta_1_prev < -2.0)) AND (データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件)) AND E_delta_1 < -1.0
```

**使用指標**: E_delta_1, E_delta_1_prev, データ件数（履歴月数）

---

### Priority 6: 低下懸念

**説明**: 上昇トレンド中だが横ばいでマイナス変化

**判定条件**:
```
(-2.0 <= E_delta_1 <= 2.0) AND ((E_slope_6 > 0.5 AND E_slope_6_std_12 > 0.2) OR (E_slope_6_std_12 > 0.45)) AND E_delta_1 < 0
```

**使用指標**: E_delta_1, E_slope_6, E_slope_6_std_12

---

### Priority 6: 回復期待

**説明**: 低下トレンド中だが横ばいでプラス変化

**判定条件**:
```
(-2.0 <= E_delta_1 <= 2.0) AND ((E_slope_6 < -0.5 AND E_slope_6_std_12 < -0.2) OR (E_slope_6_std_12 < -0.45)) AND E_delta_1 > 0
```

**使用指標**: E_delta_1, E_slope_6, E_slope_6_std_12

---

### Priority 7: 上昇

**説明**: 未評価または安定状態での上昇

**判定条件**:
```
((2.0 < E_delta_1 < 6.0) OR (E_delta_1 >= 6.0)) AND ((データ件数 < 3) OR (データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件)))
```

**使用指標**: E_delta_1, データ件数（履歴月数）

---

### Priority 7: 下降

**説明**: 未評価または安定状態での下降

**判定条件**:
```
((-6.0 < E_delta_1 < -2.0) OR (E_delta_1 <= -6.0)) AND ((データ件数 < 3) OR (データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件)))
```

**使用指標**: E_delta_1, データ件数（履歴月数）

---

### Priority 7: 横ばい

**説明**: 未評価または安定状態での横ばい

**判定条件**:
```
(-2.0 <= E_delta_1 <= 2.0) AND ((データ件数 < 3) OR (データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件)))
```

**使用指標**: E_delta_1, データ件数（履歴月数）

---

### Priority 9: 安定維持

**説明**: 安定状態で変化も小さい

**判定条件**:
```
(-2.0 <= E_delta_1 <= 2.0) AND (データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件)) AND (|E_delta_1| / E_std_12 < 2.0 OR E_std_12 <= 0)
```

**使用指標**: E_delta_1, E_std_12, データ件数（履歴月数）

---
