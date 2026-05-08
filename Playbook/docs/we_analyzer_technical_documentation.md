# we_analyzer.py 技術資料（指標算出ロジック詳細版）

## 1. 目的

この文書は `we_analyzer.py` を拡張・保守するための技術資料であり、特に **出力される各指標について、コードを読まなくても算出方法・判定ロジックを確認できる** ことを目的とする。

対象は次の 4 点である。

1. 入出力仕様
2. 実行フロー
3. 各指標の算出方法・判定ロジック
4. 保守時の変更ポイントと影響範囲

---

## 2. プログラムの概要

`we_analyzer.py` は、個人別の Work Engagement 月次データを読み込み、個人ごとの時系列特徴量、トレンド、安定性、特性、変化イベント、介入優先度などを計算し、Excel ファイルに出力するバッチスクリプトである。

コード先頭の docstring 上の定義は次のとおり。

> 入力: EngagementMasterSS.xlsx (デフォルト, シート: rating2)  
> 出力: we_report.xlsx (2シート)  
> 1. monthly_trends - 全員×全Wave の月次時系列  
> 2. latest_individuals - 最新Waveのみ（monthly_trendsと同じ列構成）

---

## 3. 入出力仕様

### 3.1 入力

既定入力は `EngagementMasterSS.xlsx` であり、読み込みシートは次の優先順で決まる。

1. `rating2`
2. 先頭シート

### 3.2 内部で使う正規化列

| 内部列 | 意味 | 取得元 |
|---|---|---|
| `person` | 個人識別子 | `mail_address` 優先、なければ `name` |
| `name` | 氏名 | 元データの `name` |
| `wave` | 月次キー (`YYYY-MM`) | `year/month` または `date` から生成 |
| `vigor` | 活力 | `vigor_rating` または `vigor` |
| `dedication` | 熱意 | `dedication_rating` または `dedication` |
| `absorption` | 没頭 | `absorption_rating` または `absorption` |
| `engagement` | 合計エンゲージメント | `engagement_rating`、なければ V+D+A の合計 |
| `department` | 部門 | `department`、なければ `section` |
| `section` | セクション | `section`、なければ `group` |
| `project` | プロジェクト | `project`、なければ `project_group` |

### 3.3 wave の生成

`_to_wave()` は以下の規則で `wave` を生成する。

- `year` と `month` があれば `YYYY-MM`
- それがなければ `date` を datetime 変換して `YYYY-MM`
- どちらもなければ例外

### 3.4 出力

出力ブックは 2 シート固定。

- `monthly_trends`: 全個人 × 全 wave
- `latest_individuals`: 最新 wave のみ

---

## 4. 実行フロー

`run()` の処理順序は次のとおり。

```text
1. _load_and_prepare_data()
2. validate_input_data()
3. person-wave 重複削除（重複時は最後のレコードを採用）
4. add_section_group_zscores()
5. add_multiscale_features()          ← E_slope_3m もここで算出
6. overwrite_short_mid_personal()
7. compute_flag_constant_6m()
8. apply_personal_trend_logic()       ← trend_base の E_slope_3m フォールバックを使用
9. compute_C_columns()
10. level を計算
11. E_delta_1_std_6 / E_delta_1_std_12 を計算
12. big_change / big_change_abs を計算
13. compute_monthly_metrics()          ← E_ma3, accel_3m のみ（E_slope_3m は step 5 で算出済み）
14. compute_slope_ratios()
15. compute_expanding_episode_distribution_metrics()
16. compute_slope3m_pattern()
17. calculate_intervention_priority()
18. monthly_trends / latest_individuals を構成
19. _write_excel_output()
```

この順序は仕様に近く、安易に入れ替えない方がよい。とくに `trend_refined`、`stability_*`、`trait_*`、`intervention_priority_*` は前段の特徴量に依存する。`E_slope_3m` は `apply_personal_trend_logic()` の `trend_base` フォールバック判定（6ヶ月未満履歴）で参照するため、step 5 で先行計算する必要がある。

---

## 5. 基本関数・共通ロジック

### 5.1 レベル分類 `level`

`_level_from_e(val)` の規則。

- `engagement >= 43` → `Thriving`
- `engagement <= 3` → `Critical`
- `engagement >= 32` → `High`
- `engagement <= 11` → `Low`
- それ以外 → `Moderate`

### 5.2 バンド化 `bandify_level()`

- `Thriving`, `High` → `High`
- `Moderate` → `Mid`
- `Low`, `Critical` → `Low`
- NaN → `Unknown`

この 3 バンドは `pct_high`, `pct_mid`, `pct_low`, `episodes_*`, `trait_*` の基礎になる。

### 5.3 ロバスト傾き `_theil_sen_slope_window(y, max_len)`

入力系列の末尾 `max_len` 点以内で傾きを計算する。

- 有効データ 0 点 → `0.0`
- 1 点 → `0.0`
- 2 点 → 単純傾き `(last - first) / (n-1)`
- 3〜5 点 → 単純傾き
- 6 点以上 → 全点対の傾きの中央値（Theil-Sen）

したがって、名前は Theil-Sen だが、少数点では単純傾きを返す。

### 5.4 3点 OLS 傾き `slope3_ols(y)`

`x = [0,1,2]` に対する単回帰の傾き。

\[
\text{slope} = \frac{\sum (x-\bar{x})(y-\bar{y})}{\sum (x-\bar{x})^2}
\]

`E_slope_3m` と `accel_3m` に使う。

### 5.5 モメンタム `_rolling_momentum(y, window)`

\[
\text{momentum} = \text{直近window点平均} - \text{その直前window点平均}
\]

- 例: `window=3` なら「直近3ヶ月平均 − その前3ヶ月平均」
- 前半窓が足りない場合は、残っている履歴平均で代替

### 5.6 直近窓 IQR `_iqr_last_window(y, win)`

直近 `win` 点以内について

\[
IQR = Q_{75} - Q_{25}
\]

を計算する。

---

## 6. 前処理と品質管理

### 6.1 入力バリデーション

`validate_input_data()` は次をチェックする。

- 必須列欠落
- `vigor`, `dedication`, `absorption` が全て NaN
- `engagement` の負値
- `wave` 欠損
- `person` 欠損
- V/D/A の範囲外値（0〜18）

ただし **停止はしない**。エラー表示後も処理継続する。

### 6.2 重複処理

`person`, `wave` が重複した場合は

- 同一キーの複数レコードを警告表示
- `keep='last'` で最後のレコードだけ残す

---

## 7. 指標辞典（出力列ごとの算出方法）

以下では、`monthly_trends` / `latest_individuals` に出力される 66 列について、算出方法を列ごとに整理する。

### 7.1 識別・基本列

#### `person`
個人識別子。`mail_address` があればそれを使い、なければ `name`。

#### `name`
入力の `name` 列をそのまま保持。

#### `wave`
月次キー。`YYYY-MM` 形式。

#### `engagement`
`engagement_rating` があればそれを数値化して使用。なければ

\[
engagement = vigor + dedication + absorption
\]

（3 項目すべて揃っているときのみ）

#### `vigor`, `dedication`, `absorption`
対応する rating 列または同名列を数値化して使用。

---

### 7.2 レベル・パターン・統合ラベル群

#### `level`
前述の `_level_from_e()` による 5 区分。

#### `slope3m_pattern`
個人ごとに 1 つだけ算出され、当人の全行に同じ値が付与される。  
入力は **直近 12 ヶ月以内の `E_slope_3m` 系列** と **最新行の `E_slope_12`, `E_slope_6_std_12`**。

判定順序:

1. **Insufficient**  
   有効な `E_slope_3m` が 3 個以下。

2. **Net Growth**  
   以下をすべて満たす。
   - 正の `E_slope_3m` 比率 `r_pos >= 0.7`
   - `E_slope_3m` 平均 `> 0`
   - `|E_slope_12| >= 0.4`
   - `|E_slope_6_std_12| >= 0.2`

3. **Net Decline**  
   以下をすべて満たす。
   - 負の `E_slope_3m` 比率 `r_neg >= 0.7`
   - `E_slope_3m` 平均 `< 0`
   - `|E_slope_12| >= 0.4`
   - `|E_slope_6_std_12| >= 0.2`

4. **U-Shape**  
   - 前半平均 `< 0`
   - 後半平均 `> 0`
   - 最初の 3 点に負が 2 個以上
   - 最後の 3 点に正が 2 個以上

5. **Inverted-U**
   - 前半平均 `> 0`
   - 後半平均 `< 0`
   - 最初の 3 点に正が 2 個以上
   - 最後の 3 点に負が 2 個以上

6. **Oscillating**  
   ゼロを無視した符号反転回数が 3 回以上。

7. **Flat/Noisy**  
   上記いずれにも該当しない。

#### `trend_base`
中期トレンド。カテゴリは `上昇中`, `低下中`, `安定`, `未評価`。

前提:
- 個人の総履歴数が `> 2` でなければ `未評価`
- 判定材料は `E_slope_6`, `E_slope_6_std_6`, 場合により `E_slope_3m`

判定（定数: `TREND_SLOPE = 2.0`, `TREND_SLOPE_STD = 0.58`, `TREND_SLOPE_3M = 5.0`）:

- `上昇中`（以下のいずれかを満たす）
  - `E_slope_6 >= 2.0`
  - または `E_slope_6_std_6 >= 0.58`
  - または `E_slope_6_std_6` が NaN（履歴6ヶ月未満）で `E_slope_3m >= 5.0`

- `低下中`（以下のいずれかを満たす）
  - `E_slope_6 <= -2.0`
  - または `E_slope_6_std_6 <= -0.58`
  - または `E_slope_6_std_6` が NaN（履歴6ヶ月未満）で `E_slope_3m <= -5.0`

- 上記以外 → `安定`

#### `trend_recent`
短期トレンド。カテゴリは  
`急上昇`, `上昇`, `横ばい`, `下降`, `急落`, `連続上昇`, `連続下降`。

入力:
- `E_delta_1`
- `E_delta_1_prev`

閾値:
- 急変化閾値: `6.0`（`TREND_DELTA_STRONG`）
- 通常変化閾値: `2.0`（`TREND_DELTA`）

判定ロジック:

- `急上昇`: `E_delta_1 >= 6.0`
- `急落`: `E_delta_1 <= -6.0`
- `上昇`: `2.0 <= E_delta_1 < 6.0`
- `下降`: `-6.0 < E_delta_1 <= -2.0`
- `連続上昇`: `E_delta_1 >= 2.0` かつ `E_delta_1_prev >= 2.0`
- `連続下降`: `E_delta_1 <= -2.0` かつ `E_delta_1_prev <= -2.0`
- それ以外: `横ばい`

優先順位は **連続 > 急 > 通常 > 横ばい**。

#### `trend_refined`
最終統合ラベル。`_refine_trend()` が **優先順位順** に判定する。主なカテゴリは次の通り。

- `入力疑義`
- `上昇加速`
- `低下加速`
- `上昇継続`
- `低下継続`
- `復活`
- `悪化`
- `回復`
- `低下危機`
- `上昇期待`
- `低下警戒`
- `低下懸念`
- `回復期待`
- `上昇`
- `下降`
- `横ばい`
- `安定維持`

主要条件を整理すると次のとおり。

1. **入力疑義**  
   `flag_constant_6m` が TRUE。

2. **上昇加速 / 低下加速**  
   - `trend_base` が `上昇中` / `低下中`
   - `trend_recent` が同方向
   - `big_change` 相当が同方向
   - `slope_ok`（後述）

3. **上昇継続 / 低下継続**
   - `trend_base` が同方向
   - `trend_recent` が同方向または `横ばい`
   - 大変化ではない
   - `slope_ok`（後述）
   - 当月差分 `E_delta_1` が同方向または 0

4. **復活 / 悪化**
   - `trend_base` と `trend_recent` が逆方向
   - `big_change` 相当あり
   - `slope_ok`（後述）

**`slope_ok` の定義**（条件 2〜4 共通）:

```
slope_ok = |E_slope_6| > TREND_SLOPE (2.0)
           OR |E_slope_3m| >= TREND_SLOPE_3M (5.0)
```

`trend_base` が `E_slope_3m` フォールバック（履歴 3–5 件）で判定された場合、`E_slope_6` が小さくても `|E_slope_3m| >= 5.0` が保証されるため `slope_ok = true` となる。`E_slope_6` のみによる条件で `trend_refined` が安定維持（フォールバック）に落ちる不整合を解消する。

5. **回復 / 低下危機**
   - `trend_base` と `trend_recent` が逆方向
   - 大変化ではない

6. **上昇期待 / 低下警戒**
   - `trend_base == 安定`
   - `trend_recent` が上昇側 / 低下側

7. **低下懸念 / 回復期待**
   - `trend_recent == 横ばい`
   - `trend_base` は上昇中 / 低下中
   - `E_delta_1` は逆向き

8. **横ばいだが個人基準では大変化**
   - `trend_base == 安定`
   - `trend_recent == 横ばい`
   - `big_change` 相当あり
   - `E_delta_1_std_12`（なければ `_6`）が ±2.0 を超える

9. **trend_base == 未評価 の簡易判定**
   - recent が上昇側 → `上昇`
   - recent が下降側 → `下降`
   - それ以外 → `横ばい`

10. **安定維持**
   - `trend_base == 安定` かつ `trend_recent == 横ばい`
   - または最終フォールバック

---

### 7.3 変化イベント群

#### `big_change`
個人内標準化変化量で判定する。

\[
E\_delta\_1\_std\_6 = \frac{E\_delta\_1}{E\_std\_6}
\]

ただし、`E_std_6 > 0` のときのみ有効。  
判定:

- `abs(E_delta_1) / E_std_6 >= 2.4` かつ `E_delta_1 > 0` → `増加変化大`
- `abs(E_delta_1) / E_std_6 >= 2.4` かつ `E_delta_1 < 0` → `減少変化大`
- それ以外 → 空文字

#### `big_change_abs`
絶対変化量で判定する補助タグ。

- `abs(E_delta_1) >= 6.0` → `変化大`
- それ以外 → 空文字

---

### 7.4 安定性群

#### `stability_6`
6 ヶ月安定性。カテゴリは `不変`, `安定`, `不安定`, `やや安定`。  
ただし履歴数が 2 以下なら空文字。

入力:
- 直近 6 ヶ月の `engagement`, `vigor`, `dedication`, `absorption` の range
- `E_std_6`
- `|E_momentum_3|`

判定順序:

1. `不変`  
   E/V/D/A の 6 ヶ月 range がすべて 0 同等 (`<= 1e-6`)。

2. `安定`  
   - `E_std_6 <= 1.0`
   - `|E_momentum_3| <= 0.5`

3. `不安定`
   - `E_std_6 >= 3.3`

4. それ以外
   - `やや安定`

#### `stability_12`
12 ヶ月安定性。カテゴリは `完全不変`, `持続安定`, `持続不安定`, `やや持続安定`。  
履歴数が 12 以下なら空文字。

判定順序:

1. `完全不変`
   - E/V/D/A の 12 ヶ月 range がすべて 0 同等

2. `持続安定`
   - `E_std_12 <= 1.5`
   - `|E_momentum_6| <= 0.8`

3. `持続不安定`
   - `E_std_12 >= 3.7`

4. それ以外
   - `やや持続安定`

---

### 7.5 介入優先度群

#### `intervention_priority_neg`
#### `intervention_priority_pos`

`calculate_intervention_priority(row)` が負方向・正方向を別々に加点する。  
基本的に **悪化方向の加点** が `neg`、**改善方向の加点** が `pos`。

加点項目は次のとおり。

1. **trend_base**
   - `低下中` → `neg +1`
   - `上昇中` → `pos +1`

2. **E_delta_1（直近変化量）**
   - `E_delta_1 >= 6.0` → `pos +2`
   - `E_delta_1 <= -6.0` → `neg +2`
   - `2.0 <= E_delta_1 < 6.0` → `pos +1`
   - `-6.0 < E_delta_1 <= -2.0` → `neg +1`
   - `E_delta_1 >= 2.0` かつ `E_delta_1_prev >= 2.0` → `pos +1`（連続変化加点）
   - `E_delta_1 <= -2.0` かつ `E_delta_1_prev <= -2.0` → `neg +1`（連続変化加点）

3. **big_change**
   - `減少変化大` → `neg +1`
   - `増加変化大` → `pos +1`

4. **stability_6 == 不安定**
   - その月差分 `E_delta_1 < 0` → `neg +1`
   - `E_delta_1 > 0` → `pos +1`

5. **標準化差分スコア**
   - 優先して `E_delta_1_std_12`、なければ `E_delta_1_std_6`
   - 絶対値に対する段階スコア  
     - `(1,2]` → 1
     - `(2,3]` → 2
     - `(3,4]` → 3
     - `>4` → 4
   - 符号が負なら `neg`、正なら `pos`

6. **標準化傾きスコア**
   - 優先して `E_slope_6_std_12`、なければ `E_slope_6_std_6`
   - 絶対値に対する段階スコア  
     - `(0.25,0.50]` → 1
     - `(0.50,1.00]` → 2
     - `(1.00,1.50]` → 3
     - `>1.50` → 4
   - 符号が負なら `neg`、正なら `pos`

7. **直近3ヶ月トレンド**
   - `E_slope_3m <= -2.0`（`-TREND_SLOPE`）→ `neg +1`
   - `E_slope_3m >= 2.0`（`TREND_SLOPE`）→ `pos +1`

---

### 7.6 短期・中期 V/D/A 強み・弱み群

#### `short_strength`
#### `short_weakness`

各人・各次元（V/D/A）について 1 ヶ月差分 `*_delta_1` を使い、  
**その人自身の過去履歴を基準** に異常に大きい変化を検出する。

各次元ごとに次を計算する。

- expanding 90 パーセンタイル `p90`（ただし現在値は除外）
- expanding 10 パーセンタイル `p10`（ただし現在値は除外）
- expanding robust Z-score（中央値と MAD ベース、現在値除外）

閾値:

- 正方向判定しきい値  
  \[
  th\_pos = \max(p90, 2.0)
  \]
- 負方向判定しきい値  
  \[
  th\_neg = \min(p10, -2.0)
  \]

判定:

- `short_strength` の次元ラベル追加条件  
  - `delta_1 >= th_pos`
  - かつ `robust_z` が NaN または `|robust_z| > 0.8`

- `short_weakness` の次元ラベル追加条件  
  - `delta_1 <= th_neg`
  - かつ `robust_z` が NaN または `|robust_z| > 0.8`

該当次元を `V`, `D`, `A` としてカンマ連結する。  
例: `V, D`

#### `mid_strength`
#### `mid_weakness`

短期版と同じ考え方だが、対象は 6 ヶ月 rolling slope（`*_slope_6`。関数引数 `mid_window` に依存）である。

各次元について:

- expanding 90 / 10 パーセンタイル（現在値除外）
- expanding robust Z-score
- 最低傾き閾値 `MIN_SLOPE = 0.2`

しきい値:

\[
th\_pos\_s = \max(p90s, 0.2)
\]
\[
th\_neg\_s = \min(p10s, -0.2)
\]

判定:

- `mid_strength`
  - `slope >= th_pos_s`
  - `|robust_z| > 0.8` または Z が NaN

- `mid_weakness`
  - `slope <= th_neg_s`
  - `|robust_z| > 0.8` または Z が NaN

履歴数が 2 以下の人は、後段 `apply_personal_trend_logic()` で空文字に上書きされる。

---

### 7.7 trait 群

#### `trait_strength`
#### `trait_weakness`

過去 12 ヶ月窓での **持続的な高位/低位傾向** と **V/D/A の部門内相対強弱** を組み合わせて判定する。

前処理:
- `engagement` を `High/Mid/Low` に帯域化
- 直近 12 ヶ月窓で `High` 件数、`Low` 件数を累積

発火条件（共通）:
- 履歴数 `>= 6`
- 高位比率または低位比率が **動的閾値** 以上

動的閾値 `_dynamic_level_ratio_threshold(history_len)`:
- 履歴 6 ヶ月時点で 0.8
- その後、履歴が長いほど線形に緩和
- 最低 0.6 まで

つまり、必要比率は

\[
0.8 \to 0.6
\]

へ漸減する。

`trait_strength`:
- `pct_high >= 動的閾値`
- その 12 ヶ月窓で `vigor_z_section`, `dedication_z_section`, `absorption_z_section` のうち
  - `> 0.5` の回数を数える
- 最大回数の次元ラベルを返す
- 同率トップは複数返す

`trait_weakness`:
- `pct_low >= 動的閾値`
- 同様に各 `*_z_section < -0.5` の回数を数える
- 最大回数の次元ラベルを返す

#### `trait_strength_conf_V`, `trait_strength_conf_D`, `trait_strength_conf_A`

`trait_strength` が成立した時、  
直近 12 ヶ月窓での各次元の strength カウント構成比を返す。

\[
conf\_V = \frac{V\text{ の strength カウント}}{V+D+A の strength カウント合計}
\]

D, A も同様。

#### `trait_weakness_conf_V`, `trait_weakness_conf_D`, `trait_weakness_conf_A`

`trait_weakness` 版。  
各次元の weakness カウント構成比。

---

### 7.8 入力疑義フラグ

#### `flag_constant_6m`

各人について、**V/D/A の 3 値がすべて等しい（v==d==a）状態が 3 ヶ月連続**したときにカテゴリ文字列を付与する。該当しない月は空文字 `""`。

カテゴリ（優先順位順）:

| 値 | 条件 |
|---|---|
| `FIX_SHIFTED` | 3ヶ月連続 v==d==a かつ、以前の固定値から値が変化してちょうど 3ヶ月目 |
| `LOW_FIXED` | 3ヶ月連続 v==d==a かつ level が `Critical` または `Low` |
| `MID_EVASION` | 3ヶ月連続 v==d==a かつ level が `Moderate` |
| `HIGH_AVOIDANCE` | 3ヶ月連続 v==d==a かつ level が `High` または `Thriving` |
| `""` | 上記いずれにも該当しない |

`trend_refined` では `flag_constant_6m != ""` のとき最優先で `入力疑義` を返す。  
`intervention_priority_neg` には加点マップ（`FIX_SHIFTED`: +4、`LOW_FIXED`: +3、`MID_EVASION`/`HIGH_AVOIDANCE`: +2）が適用される。

---

### 7.9 差分・比率・モメンタム・移動統計群

#### `E_delta_1`
\[
E\_delta\_1(t) = E(t) - E(t-1)
\]

初回行は `0.0`。

#### `E_delta_1_prev`
\[
E\_delta\_1\_prev(t) = E(t-1) - E(t-2)
\]

3 点未満では `0.0`。

#### `E_delta_1_std_6`
\[
E\_delta\_1\_std\_6 = \frac{E\_delta\_1}{E\_std\_6}
\]

ただし `E_std_6 > 0` のときのみ。

#### `E_delta_1_std_12`
\[
E\_delta\_1\_std\_12 = \frac{E\_delta\_1}{E\_std\_12}
\]

ただし `E_std_12 > 0` のときのみ。

#### `r_pos`
各時点で、直近 12 ヶ月以内の有効な `E_slope_3m` のうち、正のものの比率。

\[
r\_pos = \frac{\#(E\_slope\_3m > 0)}{\#(\text{有効 } E\_slope\_3m)}
\]

#### `r_neg`
同様に、負の `E_slope_3m` 比率。

\[
r\_neg = \frac{\#(E\_slope\_3m < 0)}{\#(\text{有効 } E\_slope\_3m)}
\]

#### `E_momentum_3`
\[
\text{直近3ヶ月平均} - \text{その前3ヶ月平均}
\]

#### `E_momentum_6`
\[
\text{直近6ヶ月平均} - \text{その前6ヶ月平均}
\]

#### `E_mean_3`
直近 3 ヶ月平均。3 ヶ月未満なら存在する履歴で平均。

#### `E_mean_6`
直近 6 ヶ月平均。6 ヶ月未満なら存在する履歴で平均。

#### `E_std_6`
直近 6 ヶ月の母標準偏差（`ddof=0`）。6 ヶ月未満では NaN。

#### `E_std_12`
直近 12 ヶ月の母標準偏差。12 ヶ月未満では NaN。

#### `E_std_18`
直近 18 ヶ月の母標準偏差。18 ヶ月未満では NaN。

#### `E_iqr_6`
直近 6 ヶ月以内の IQR。履歴不足でも存在する分で計算。

---

### 7.10 傾き・加速度群

#### `E_slope_6`
`engagement` の直近 6 点以内に対するロバスト傾き。  
計算は `_theil_sen_slope_window(..., 6)`。

#### `E_slope_12`
`engagement` の直近 12 点以内に対するロバスト傾き。  
計算は `_theil_sen_slope_window(..., 12)`。

#### `E_slope_3m`
直近 3 点の `engagement` に対する OLS 傾き。  
3 点揃わなければ NaN。

#### `E_slope_6_std_6`
\[
E\_slope\_6\_std\_6 = \frac{E\_slope\_6}{E\_std\_6}
\]

ただし `E_std_6 > 0` のときのみ。

#### `E_slope_6_std_12`
\[
E\_slope\_6\_std\_12 = \frac{E\_slope\_6}{E\_std\_12}
\]

ただし `E_std_12 > 0` のときのみ。

#### `E_ma3`
`engagement` の 3 ヶ月移動平均。`rolling(3, min_periods=1).mean()`。

#### `V_slope_6`, `D_slope_6`, `A_slope_6`
各次元の直近 6 点以内のロバスト傾き。

#### `V_delta_1`, `D_delta_1`, `A_delta_1`
各次元の 1 ヶ月差分。初回行は `0.0`。

---

### 7.11 分布・エピソード群

これらは `compute_expanding_episode_distribution_metrics()` により、**その時点までの累積履歴** に対して計算される。

#### `pct_high`
その時点までの `High` バンド比率。

\[
pct\_high = \frac{\text{High バンド累積件数}}{\text{累積月数}}
\]

#### `pct_mid`
その時点までの `Mid` バンド比率。

#### `pct_low`
その時点までの `Low` バンド比率。

#### `episodes_recovery`
直前月が `Low`、当月が `Mid` または `High` になった回数の累積。

#### `episodes_fall`
直前月が `Mid` または `High`、当月が `Low` になった回数の累積。

#### `recovery_rate`
\[
recovery\_rate = \frac{episodes\_recovery}{episodes\_fall}
\]

`episodes_fall = 0` の場合は NaN。

#### `fall_rate`
\[
fall\_rate = \frac{episodes\_fall}{累積月数}
\]

#### `episodes_low2plus`
`Low` が 2 ヶ月連続に達した瞬間の回数の累積。  
つまり `Low` 連続列の長さが 2 になった時点で 1 加算し、3 ヶ月目・4 ヶ月目では増えない。

#### `low_streak_max`
その時点までの `Low` 連続最長月数。

---

## 8. 補助指標だが最終出力に出ないもの

保守上重要なので記載する。

### `E_accel_6`
\[
E\_accel\_6(t) = E\_slope\_6(t) - E\_slope\_6(t-1)
\]

前回傾きがない場合は `0.0`。  
最終出力には含まれないが、傾き系列の変化を表す。

### `Prev_E_slope_6`
前回時点の `E_slope_6`。最初は当月値で代用。  
最終出力には含まれない。

### `E_min6_past`, `E_max6_past`
`apply_personal_trend_logic()` 内で作られる、直近 6 ヶ月の過去最小・最大。  
現行の `_refine_trend()` では実質使われていない。

### `*_z_section`, `*_z_group`
各 wave の部門・セクション内 Z-score。

- `*_z_section`: `[wave, department]` 単位
- `*_z_group`: `[wave, section]` 単位

計算式:

\[
z = \frac{x - \mu}{\sigma}
\]

ただし `σ=0` または NaN の場合は `0.0`。

trait 判定では主に `*_z_section` を使用する。

---

## 9. 実装上の注意点・仕様上の癖

### 9.1 `trend_base` の履歴条件は「6ヶ月」ではない
中期トレンドという名前だが、実際の評価可否条件は

- 履歴件数 `> 2`

である。  
ただし `E_std_6` や `E_slope_6_std_6` が安定して使えるのは 6 ヶ月以降なので、初期数ヶ月は `E_slope_3m` フォールバックの影響を受ける。

### 9.2 `trend_recent` は初期月でも `横ばい` が付く
最初の月は `E_delta_1 = 0.0` なので、`横ばい` になる。

### 9.3 `big_change` と `big_change_abs` は基準が異なる
- `big_change`: 個人内標準偏差基準
- `big_change_abs`: 生の絶対差分基準

両者が矛盾することはある。

### 9.4 `slope3m_pattern` は月ごとではなく「人ごと」
関数は個人ごとに 1 回だけ判定し、結果をその人の全 wave に付与する。

### 9.5 `trait_*` は部門内相対評価
V/D/A の強み・弱みは生スコアではなく `*_z_section` を使う。  
したがって組織構成や部門平均との差の影響を受ける。

### 9.6 出力に含まれない計算列がある
`E_accel_6`, `Prev_E_slope_6`, `E_min6_past`, `E_max6_past`, 個別フラグ列などは内部計算だけに使われる。

---

## 10. 変更時の影響範囲

### 10.1 閾値変更の影響

- `TREND_SLOPE`（2.0）, `TREND_SLOPE_STD`（0.58）, `TREND_SLOPE_3M`（5.0）
  - `trend_base`, `trend_refined`, `intervention_priority_*`（E_slope_3m 加点）に波及

- `TREND_DELTA_STRONG`（6.0）, `TREND_DELTA`（2.0）
  - `trend_recent`, `trend_refined`, `intervention_priority_*`（E_delta_1 加点）に波及

- `CHANGE_TAG_THRESHOLD`（6.0）
  - `big_change_abs` のみに波及（`trend_recent` 判定は `TREND_DELTA_STRONG` を使用）

- `STABILITY_*`
  - `stability_6`, `stability_12`, `intervention_priority_*` に波及

- `Z_VDA_THRESHOLD`, `SHORT_VDA_MIN_DELTA`, `MIN_SLOPE`
  - `short_*`, `mid_*` に波及

- `TRAIT_*`, `SECTION_THRESHOLD`
  - `trait_*` とその confidence 列に波及

### 10.2 出力列追加・削除の変更点

出力列は `run()` の `monthly_cols` で固定列順管理されている。  
列を増やしたい場合は

1. 計算処理を追加
2. `monthly_cols` に列名追加
3. `_write_excel_output()` の数値書式リストも必要に応じて更新

の 3 箇所確認が必要。

### 10.3 中期ウィンドウ変更
`mid_window` は主に以下へ影響する。

- `overwrite_short_mid_personal()` の `*_slope_mid_window`
- `_compute_stability()` の 6ヶ月安定性計算

ただし `add_multiscale_features()` の `E_slope_6` や `V_slope_6` は固定 6 ヶ月であり、`mid_window` と完全連動ではない。  
この点は将来拡張時の設計上の不整合候補である。

---

## 11. 保守観点での改善候補

1. `validate_input_data()` の strict mode 追加
2. `trend_refined` の判定表をデータ駆動化
3. `mid_window` と `E_slope_6` 系固定値の整合化
4. `slope3m_pattern` を wave ごとの可変判定にするか、個人固定と明記するかの整理
5. `E_min6_past`, `E_max6_past` の未使用整理
6. Excel 出力列定義を設定ファイル化

---

## 12. 参照ファイル

- 実装本体: `we_analyzer.py`
- 入力データ: `EngagementMasterSS.xlsx`
- 参考メモ: 2023年7月〜2025年9月の27か月間、延べ94名を UWES-9 で測定し、`we_report202509.xlsx` / `org_statistics202509.xlsx` があるというプロジェクト説明。fileciteturn1file0

