```
Trend_B_recent の判定に E_momentum_3 を利用していますが、これは直近３ヶ月の E 値の平均からその前の３ヶ月の E 平均です。精神状態の Momentum を分析するのに、期間を３ヶ月で区切って、その３ヶ月の平均値の比較で Momoentum とするのは学術的、現実的に妥当なのか疑問があります。たとえば、今月、先月、先々月の３ヶ月間の移動平均をとって、その３つの値の傾きで判定するといった、連続性を前提とした判定が妥当ではないかと考えます。心理学などの検知や各種関連研究などからの見解とアイデアを教えてください。
```

結論（要旨）
- E_momentum_3（「直近3点平均−直前3点平均」）は“段差（レジーム変化）の粗い検知”には使えますが、心理状態の**連続性**や**慣性（inertia）\**というダイナミクスを捉える標準的な観点とは一致しません。日・週レベルでの変動が大きいワーク・エンゲージメント領域では、3か月固定窓の二重平均は\**遅延と情報損失**が大きい可能性があります。([econtent.hogrefe.com](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com))
- 学術的には、情動・ウェルビーイングは**自己相関（情動の慣性）\**や\**短期の不安定性**を持つ過程として扱われ、連続的な傾き（ドリフト）や自己回帰（AR）を明示的に推定する手法（DSEM等）が推奨されます。したがって、「3か月平均の差」を“Momentum”と定義するのは**概念上ミスマッチ**です。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2901421/?utm_source=chatgpt.com))

以下、（1）学術的根拠（事実）→（2）現行指標の限界（論理）→（3）代替案（設計案）→（4）実装への落とし込み→（5）推奨構成の順で整理します。

# 1. 学術的根拠（事実）

- **ワーク・エンゲージメントは日・週単位で大きく変動**
   日誌研究・週次研究で、個人内分散の寄与が大きいことが繰り返し報告されています（例：日次/週次の日誌研究）。従って、3か月集計は現象の時間粒度に比べて粗い可能性が高い。([econtent.hogrefe.com](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com))
- **情動ダイナミクスのコア概念は“慣性（自己相関）”**
   同一個人の感情が時間をまたいでどれだけ持ち越されるか（自己相関）が重要で、うつ等の不適応とも関連。モメンタムを語るなら自己相関とドリフトを同時に扱うのが筋です。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2901421/?utm_source=chatgpt.com))
- **モデル化は連続性を前提に**
   DSEM（Dynamic Structural Equation Modeling）など、AR項・ランダム効果・局所傾き（ドリフト）を同時推定する枠組みが整っています。([tandfonline.com](https://www.tandfonline.com/doi/full/10.1080/10705511.2017.1406803?utm_source=chatgpt.com))
- **小さな持続的シフトの検出**
   工学・医療のプロセスモニタリングでは、平均の小変化検出にEWMA/CUSUM系が用いられます。患者報告アウトカム等の継続指標でも応用が進み、固定窓の単純差より早期検出・誤警報制御の点で有利です。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11224875/?utm_source=chatgpt.com))
- **“意味のある変化”の判定（測定誤差の調整）**
   心理測定では、**Reliable Change Index（RCI）**で「誤差を超えた真の変化」かを判断します。UWESの再検査信頼性（短期ICC/年次rt）が報告されており、RCIしきい値の算定に利用可能です。([research-portal.uu.nl](https://research-portal.uu.nl/files/2196465/Maassen_The_standard_error.pdf?utm_source=chatgpt.com))

# 2. 現行 E_momentum_3 の限界（論理）

- **二重平滑（3か月平均×2差分）により応答遅延**：新規ショックに対する感度が落ち、発見が遅れる。
- **窓境界で段差（エッジ効果）**：2つの不連続な3点集合を比べるため、連続過程の傾きとしての解釈が難しい。
- **パラメータの恣意性**：3という窓長に理論的根拠が薄い（文献的合意はない）。
- **“モメンタム”の概念不一致**：本来は**連続系列の慣性＋ドリフト**に基づく性質。平均差は水準変化には敏感だが、連続的傾きの定義にはならない。
   （以上は統計的な整合性に基づく指摘であり、既存研究の観測粒度とも整合しません。([econtent.hogrefe.com](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com))）

# 3. 代替案（設計案）—連続性を前提にした“最近動向”の指標

以下はいずれも**数学的に連続性を前提**とし、実装容易性と運用解釈のバランスで選べます。

### A) EWMAドリフト（推奨）

**定義**：( S_t = \lambda E_t + (1-\lambda)S_{t-1} )（EWMA），**最近動向**を ( M^{\text{EWMA}}*t = S_t - S*{t-1} ) と定義。
 **利点**：ノイズ抑制と即応性のトレードオフを**半減期**で直感的に調整（例：半減期=2か月 → (\lambda = 1-2^{-1/2})）。固定窓差分よりも**早期検出**・**誤警報制御**に向く。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11224875/?utm_source=chatgpt.com))

### B) ローカル線形傾き（短窓Theil–Sen / WLS）

**定義**：直近K点（例：K=4〜6）で**Theil–Sen傾き**または**時間重み付き最小二乗傾き**を推定。
 **利点**：現行の `E_slope_6` と整合。短窓版（例：`E_slope_4`）を「Trend_B_recent」に採用すれば、**外れ値頑健性**と**連続的傾き**を両立。

### C) 慣性調整ドリフト（AR(1)残差傾き）

**定義**： (E_t = \alpha + \phi E_{t-1} + \beta t + \varepsilon_t) を個人内で逐次推定し、(\beta)（時間ドリフト）を“最近動向”として用いる。
 **利点**：**情動の慣性（(\phi)）**を明示的に制御し、真のトレンド成分を抽出。DSEMの考え方に近い簡便近似。([tandfonline.com](https://www.tandfonline.com/doi/full/10.1080/10705511.2017.1406803?utm_source=chatgpt.com))

### D) 変化点検知の補助（CUSUM/EWMAチャート）

**定義**：系列の小さな平均シフトを早期検出する統計的モニタリング。
 **利点**：しきい値設計で**発見遅延と誤警報率（ARL）**を調整可能。重大な悪化の早期アラートに有用（過検知を抑えるため、A/BやCと併用）。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11224875/?utm_source=chatgpt.com))

### E) RCIゲーティング（“意味のある変化”の担保）

**定義**：変化量が ( \text{RCI} = \Delta / \text{SE}*{\Delta} ) で|RCI|≥1.96（95%）等を満たす場合のみ“上昇/低下”を確定。
 **利点**：測定誤差を考慮し**誤判定を低減**。UWESの信頼性（例：短期ICC、年次rt）を使って (\text{SE}*{\Delta}) を算定可能。([research-portal.uu.nl](https://research-portal.uu.nl/files/2196465/Maassen_The_standard_error.pdf?utm_source=chatgpt.com))

# 4. 実装への落とし込み（`we_analyzer.py` 前提）

最小変更で下記を提案します（**事実**：現行は Theil–Sen 傾きをすでに算出）。

- **置換/併存方針**
  - `Trend_B_recent` の一次根拠を `E_momentum_3` → **`M^{EWMA}` または 短窓 `E_slope_4`** に変更。
  - 互換性のため `E_momentum_3_deprecated` を並行出力（2サイクル程度）し、`Thresholds` に定義変更を明記。
- **推定式（例）**
  - `EWMA(half_life=h)`：( \lambda = 1-2^{-1/h} )、( M^{\text{EWMA}}*t=S_t-S*{t-1} )。
  - `短窓Theil–Sen`：直近K点（K=4または6）で傾き。
  - `AR(1)残差傾き`：簡易にはロバスト回帰で ((E_{t-1}, t)) を説明変数にし、(\beta) を抽出。
- **しきい値の較正**
  - 既存の `TREND_DELTA_STRONG=5.0` 等は維持しつつ、`M^{EWMA}` と `E_slope_4` の分布を**WAVE内分位（Q1/Q3）**で正規化。
  - 重要アラートのみ **RCIゲート**（|RCI|≥1.96）を追加して誤警報を抑制。([research-portal.uu.nl](https://research-portal.uu.nl/files/2196465/Maassen_The_standard_error.pdf?utm_source=chatgpt.com))

# 5. 推奨構成（妥当性・実務の折衷）

1. **基礎トレンド**：現行の `E_slope_6`（Theil–Sen）を継続（中期）。
2. **最近動向**：`M^{EWMA}`（半減期2か月を初期値）**＋** `E_slope_4` を併用し、符号一致時のみ「上昇/低下」を強く表示。
3. **重大変化アラート**：EWMA/CUSUM補助チャートで早期検知（管理限界は偽陽性率で設計）。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11224875/?utm_source=chatgpt.com))
4. **確証ルール**：|RCI|基準で“確定”バッジを付与（UWESの信頼性はテストマニュアルや短期ICCを参照）。([wilmarschaufeli.nl](https://www.wilmarschaufeli.nl/publications/Schaufeli/Test Manuals/Test_manual_UWES_English.pdf?utm_source=chatgpt.com))

------

## まとめ

- 「3か月平均の差」をモメンタムと呼ぶのは**概念上・統計上ともに最適ではない**。
- **慣性（自己相関）と連続的傾き**を捉える設計（EWMAドリフト／短窓傾き／AR(1)調整）に置き換えると、**即応性**と**妥当性**が上がります。
- **RCI**で測定誤差を越えた“意味のある変化”を保証しつつ、**EWMA/CUSUM**で小さな持続シフトを早期検出するのが実務的に強い構成です。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2901421/?utm_source=chatgpt.com))

-----



# 設計（月次データ向け・実装可能）

## 層1：中期の基礎トレンド（現状維持）

* 指標：`E_slope_6`（Theil–Sen、既存）
* 役割：中期ドリフト（6か月相当）。既存の `Trend_B_base` 判定（±0.35）をそのまま使用。

## 層2：最近動向（連続性を前提）

直近の変化を**2つの連続指標**で捉え、**符号一致**で強度を上げる。

### 2-1) EWMAドリフト

* 定義：
  ( S_t = \lambda E_t + (1-\lambda)S_{t-1} ), 初期 ( S_1=E_1 )
  **ドリフト** ( M^{\text{EWMA}}*t = S_t - S*{t-1} )
* パラメータ：**半減期 = 2か月**（初期値）
  (\lambda = 1-2^{-1/\text{half_life}}) → half_life=2 なら (\lambda \approx 0.2929)
* 直感：新しい月を強めに、過去は指数的に薄めて**連続的な傾向変化**を即時に捉える。

### 2-2) 短窓 Theil–Sen 傾き

* 定義：**直近K=4点**で Theil–Sen の傾き `E_slope_4` を推定（データ不足時はある範囲で計算）。
* 目的：**局所的な連続傾斜**の把握（EWMAドリフトの裏取り）。
  ※時間ギャップがある場合は、横軸を**実月差**で与えるオプション（後述）を用意。

### 2-3) 統合ルール（`Trend_B_recent` の置換）

* まず**連続指標の符号一致**をチェック：

  * `M^{EWMA}_t > +m_thr` かつ `E_slope_4 > +s_thr` → 「最近：上昇」（強）
  * `M^{EWMA}_t < -m_thr` かつ `E_slope_4 < -s_thr` → 「最近：低下」（強）
  * 符号が一致しない／どちらかが閾値未満 → 「最近：横ばい／弱信号」
  
* 閾値の決め方（**実装容易・堅牢**の順に2案）
  A. **個人内・expanding ロバストZ**（既存C系と同じ思想）：

  * 個人内の履歴で `M^{EWMA}` と `E_slope_4` をそれぞれ中央値/MADで標準化 → `z_M`, `z_S`
  * `z_M ≥ 0.8` かつ `z_S ≥ 0.8` → 上昇（強）
  * `z_M ≤ -0.8` かつ `z_S ≤ -0.8` → 低下（強）
  * それ以外 → 弱/横ばい

  B. **WAVE内（同時点・同組織）分位**：
  同一WAVE×Sectionの分布で `M^{EWMA}`, `E_slope_4` の分位（Q1/Q3）を取って判定（組織相対）。

   → Aは**自己相対**、Bは**組織相対**。`Trend_B_recent` は自己相対（A）を推奨（既存C系との整合）。

## 層3：有意性ゲート（誤警報抑制）

* 目的：測定誤差内の微小変化を「上昇/低下」と誤判定しない。
* 実装レベルの選択肢：

  * **簡易ゲート**（推奨デフォルト）：`delta_1` の個人内 rolling-MAD から z を作り、|z|≥1.96 で“確度高”フラグ。
  * **RCI（Reliable Change Index）**：再検査信頼性 r を与えられる場合、
    (\text{SE}*\Delta = \sqrt{2 \cdot SD^2 \cdot (1-r)})、(\text{RCI} = \Delta / \text{SE}*\Delta) で |RCI|≥1.96 の時だけ「確定」バッジ。
    （r が未提供なら簡易ゲートを使い、r を得たら切替可能）

---

# 欠測・月ギャップの扱い（オプション）

* 既定：**観測順インデックス**を時間として扱い、`E_slope_4` を算出（コード変更最小）。
* オプション：`TIME_AWARE=True` の場合、横軸 x に**実カレンダー月**（例：2025-01, 2025-04 なら間隔=3）を与えて傾きを算出。
  → 欠測が目立つ組織でのみ有効化可能（処理コストと複雑性のバランスを取る）。

---

# 具体的な出力列・定数（追加）

## 追加定数（例）

* `RECENT_HALFLIFE = 2` （EWMA半減期：月）
* `RECENT_SLOPE_WINDOW = 4`
* `RECENT_MIN_RECORDS = 3`  （最近判定に必要な最小有効点数）
* `RECENT_Z_POS = 0.8`, `RECENT_Z_NEG = -0.8`
* `TIME_AWARE = False`  （既定）

## 追加列（Individuals / LatestIndividuals）

* `E_EWMA_h2`（EWMAスムース値）
* `E_EWMA_drift`（`M^{EWMA}` = 当月EWMA − 前月EWMA）
* `E_slope_4`（直近4点 Theil–Sen 傾き）
* `Recent_strength_flag`（|z|≥1.96 等のゲート結果）
* `Trend_B_recent`（置換後の最近トレンドラベル）
* `Trend_B_recent_reason`（例：`EWMA↑ & slope4↑ & gate=pass` などの合成根拠）

## Thresholds シート追記

* 「最近動向（Trend_B_recent）」の定義を**EWMAドリフト＋短窓傾き＋ゲート**に更新。
* 旧 `E_momentum_3` は「参考（非推奨）」として1～2サイクル併記可（運用移行のため）。

---

# 判定テーブル（例：自己相対A方式）

| 条件                                                          | ラベル         |
| ----------------------------------------------------------- | ----------- |
| `z_M ≥ 0.8` かつ `z_S ≥ 0.8` かつ `Recent_strength_flag=True`   | 最近：上昇（強）    |
| `z_M ≤ -0.8` かつ `z_S ≤ -0.8` かつ `Recent_strength_flag=True` | 最近：低下（強）    |
| `z_M` と `z_S` の符号一致（いずれも >0 または <0）                         | 最近：上昇/低下（弱） |
| それ以外                                                        | 最近：横ばい      |

※ 強弱の境は `RECENT_Z_POS/NEG` とゲートで調整可。

---

# 実装差分（`we_analyzer.py` への最小変更方針）

1. **特徴量生成**

   * 個人×昇順で `E_EWMA_h2` と `E_EWMA_drift` を rolling/累積で追加（初期値・欠損の扱いは既存ルールに倣う）。
   * 末尾から K=4 のサブ系列で `E_slope_4`（Theil–Sen）を計算（既存の Theil–Sen 関数を再利用）。
   * 個人内 expanding で `z_M`, `z_S`（中央値/MAD）を計算。

2. **ゲート**

   * 簡易版：`delta_1` の rolling-MAD で z を作り、|z|≥1.96 をフラグ。
   * （将来）RCIに切替可能なパラメータフックを用意。

3. **`Trend_B_recent` のロジック置換**

   * 既存の `E_momentum_3` 依存を廃し、上記テーブルに置換。
   * 旧列は `E_momentum_3_deprecated` として残す（互換・比較用）。

4. **Thresholds（説明文）更新**

   * 数式・定義・閾値・ゲートを日本語で反映。
   * 旧→新の移行注記（2サイクルで旧列削除予定など）。

5. **互換性**

   * pandas≦2.1 の環境でも動くよう、`include_groups=False` 非依存の書き方に寄せる予定があれば併せて修正。

---

# 先の推奨構成との整合

* **一致**しています：

  * 層1：既存 `E_slope_6`（中期基礎）維持
  * 層2：**EWMAドリフト**＋**短窓Theil–Sen**で**連続性**と**即応性**を確保
  * 層3：**有意性ゲート**（簡易z/将来RCI）で誤警報抑制
  * 重大変化は既存 `ChangeTag`（|ΔE|≥6）を補助的に継続

