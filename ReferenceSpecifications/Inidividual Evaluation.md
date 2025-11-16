以下は、これまで採用してきた主要指標を、学術的根拠・実務上の理由・判断基準（しきい値）・総合評価の観点で体系化したまとめです。対象は、**部門（section）基準**に正規化したデータを前提とします（group 欠損時は group=section）。UWES（Vigor/Dedication/Absorption）の理論枠組みに立脚し、時系列頑健推定を組み合わせて、個人×時点をカテゴリー化してアクションに接続する設計としています。

# 1. 基本構成要素（UWES）

## 1.1 構成次元と総合指標

- **Vigor / Dedication / Absorption（V/D/A）**：UWESの3因子。ワーク・エンゲージメント（以下 E）は **E = V + D + A** の合計で扱う（入力は整数、欠損なし）
   **根拠**：UWES はワーク・エンゲージメントを V/D/A の三側面で定義する国際的な標準枠組み。短縮版でもこの三因子構造が支持されている。([Wilmar Schaufeli](https://www.wilmarschaufeli.nl/publications/Schaufeli/251.pdf?utm_source=chatgpt.com))
- **安定性と可変性**：エンゲージメントは**状態特性の両面**を持ち、時点間で変動しうる（日単位・週単位の研究）。よって、**短・中・長期の指標**を併用する必要がある。([Hogrefe eContent](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com), [Isonderhouden](https://www.isonderhouden.nl/doc/pdf/arnoldbakker/articles/articles_arnold_bakker_212.pdf?utm_source=chatgpt.com))

## 1.2 基準化（正規化）と参照集団

- **z_section, z_group**：同**月×部門（section）**／同**月×部署（group）\**内での z スコア（平均0, 標準偏差1）。
   \*\*採用理由\*\*：全社横断の比較（\*_z_org）では、部門間の業務特性差（要求やリズム、スキル構成）が大きく、評価が歪む。\*\*同じ文脈（同月×同部門/部署）での相対位置\*\*を把握する方が解釈可能性・公正性が高い。
   \*\*しきい値\*\*：\**±1.0 SD** を「高位／低位」の便宜判定に使用。**理由**：心理学の標準化効果量の実務ガイドライン（Cohen の small/medium/large）を応用し、±1SD は“明確な偏り”の実務上の目安として妥当。ガイドラインは一般論だが、分野固有の目安がない場合の参照として広く用いられる。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6736231/?utm_source=chatgpt.com), [Simply Psychology](https://www.simplypsychology.org/effect-size.html?utm_source=chatgpt.com), [rpsychologist.com](https://rpsychologist.com/cohend/?utm_source=chatgpt.com))

# 2. 時系列特徴量（短・中・長）

## 2.1 短期：**E_momentum_3**

- **定義**：直近3ヶ月平均 − 直前3ヶ月平均（差分）。
- **採用理由**：週次・日次レベルでの変動も観測される中（ダイアリー研究）、**直近の実質的な変化方向**をノイズ耐性を保ちつつ単純に把握できる。移動平均差は**外れ値に対して素朴で頑健**。([Hogrefe eContent](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com), [Isonderhouden](https://www.isonderhouden.nl/doc/pdf/arnoldbakker/articles/articles_arnold_bakker_212.pdf?utm_source=chatgpt.com))
- **解釈**：正→改善傾向、負→悪化傾向。部署内中央値の分位に基づきチューニング（自動バンド化）して閾値を決める（下記 §4）。

## 2.2 中期：**E_slope_6（Theil–Sen、最大6ヵ月窓）**

- **定義**：直近最大6点に対する **Theil–Sen** 傾き（全ペアの傾きの**中央値**）。
- **採用理由**：**外れ値耐性**と**単調トレンド抽出**に優れ、OLS より壊れにくい。**29%程度までの外れデータに耐える**特性が知られる。([SciPy Documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html?utm_source=chatgpt.com), [Scikit-learn](https://scikit-learn.org/stable/auto_examples/linear_model/plot_theilsen.html?utm_source=chatgpt.com), [Wikipedia](https://en.wikipedia.org/wiki/Theil–Sen_estimator?utm_source=chatgpt.com))
- **解釈**：正→中期的上昇、負→下降。短期のモメンタムと組み合わせて**偽陽性/偽陰性の相互補完**を図る。

## 2.3 長期：**E_slope_12（Theil–Sen、最大12ヵ月窓）**

- **定義**：直近最大12点の Theil–Sen 傾き。
- **採用理由**：制度改編・体制変更の影響を受けにくい**ロバストな基調傾向**の把握。中期（6M）と併置して**傾きの一貫性**を確認する。

## 2.4 変動幅：**E_mean_6 / E_std_6 / E_iqr_6**

- **定義**：直近6ヶ月の平均・標準偏差・**IQR=Q3−Q1**。
- **採用理由**：平均水準（Mean）に加え、**ばらつき（Std, IQR）\**で安定性を読み解く。IQR は外れ値の影響を受けにくい\**ロバスト分散**で、上下25%を刈り取って中央50%の広がりを測る。([Wikipedia](https://en.wikipedia.org/wiki/Interquartile_range?utm_source=chatgpt.com), [Statistics By Jim](https://statisticsbyjim.com/basics/interquartile-range/?utm_source=chatgpt.com), [Fiveable](https://library.fiveable.me/key-terms/ap-stats/interquartile-range-iqr?utm_source=chatgpt.com))
- **解釈**：Std/IQR が大きい＝**振れが大きい**（支援・業務負荷・役割不確実性などのシグナル）。Mean は平準化された最近水準の把握に使う。

## 2.5 低位連続：**E_low_streak_section**

- **定義**：**z_section ≤ −1** が**連続**している長さ（右端からの連続カウント）。
- **採用理由**：瞬間的低下と、**慢性的な低位状態**を区別する。
- **基準**：**≧2ヶ月**で注意（要アセスメント）。短期ノイズを越える継続性の目安。

# 3. カテゴリー化ロジック（A/B/C）

## 3.1 **Level_A**（位置）

- **定義**：**Engagement_z_section** を主基準（±1.0）。部署基準（z_group）で**≤−1.0**が出れば**低位優先**。
- **理由**：同一部門の文脈で相対位置を明確化し、部署固有の分布歪みも補正。

## 3.2 **Trend_B**（方向）

- **定義**：(**E_momentum_3** **∨** **E_slope_6**) による**二波ヒステリシス**判定（直近2観測の多数決）。
- **理由**：短期差分と中期傾きの**相補性**で頑健性を確保。ヒステリシスは単月反転による誤判定（チラつき）を抑制。

## 3.3 **C_stability**（安定性）

- **定義**：部署内 75%分位相当の帯を参照し、**E_std_6**または**E_iqr_6**が高位帯、または**E_low_streak_section ≥ 2**で、**要注意／変動大**を付与。
- **理由**：**高振幅**または**低位持続**は早期介入の優先指標。

# 4. 部署・部門ダッシュボード（集計視点）

- **mean_E_z_section**：部署の（同月×部門）基準平均。0超なら**部門平均超**の水準。
- **share_high_section / share_low_section**：部署内構成比（判定は z_section ±1、**分母=部署**）。
- **std_E_z_section**：部署内の**相対位置のばらつき**（大＝メンバー間ギャップ大）。
- **share_low_group**：部署基準で低位（z_group ≤−1）の構成比。
- **share_lowstreak_ge2**：部門基準で低位**連続2ヶ月以上**の人の割合。
- **カテゴリ分布**：`share_低位_悪化中` など（**分母=部署**）。
   **目的**：管理職に、(i) 水準、(ii) 広がり、(iii) リスク持続、(iv) 構成の推移を**一目で可視化**させ、マネジメント行動（配置・支援・業務設計）に結び付ける。

# 5. 次元別の強み・弱み／ドライバ

## 5.1 スナップショット（即時）

- **C_section_strength / C_section_weakness**：同月×部門基準の z を閾値 **±0.5** で判定。
   **理由**：±1 は「顕著」だが、アクション設計では**早期に把握**したい。**±0.5（中程度）\**の偏位で示唆を出す。効果量基準の\**実務的運用**。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6736231/?utm_source=chatgpt.com))

## 5.2 特性（中長期）

- **C_trait_strength / C_trait_weakness**：**12ヶ月ロール中央値**の z_section を**±0.5**で評価。
   **理由**：短期ノイズを平滑化し、**その人の相対的な得手不得手**を部門内で安定的に把握。

## 5.3 ドライバ（変化要因の同定）

- **短期**：`Δ3`（V/D/A の3ヶ月モメンタム）。
- **中期**：`slope_6`（V/D/A の Theil–Sen 傾き）。
- **強弱分離**：相対寄与上位 **70%** かつ絶対下限（Δ3で ≥0.5、slope_6で ≥0.2 など）で、**Strength（上昇寄与）／Weakness（低下寄与）\**を分離。
   \*\*理由\*\*：1次元だけに依存した判定の偏りを避け、\*\*多次元の寄与\*\*を抽出して\**面接・支援の焦点化**に直結。

# 6. しきい値のチューニングと根拠

- **位置（±1.0 SD）**：実務では「顕著に高/低」を指す便宜基準。Cohen 流儀の効果量指標に整合する。ただし**分野固有分布**が判明すれば、**四分位/十分位**など**分位ベース**に置き換え可。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6736231/?utm_source=chatgpt.com))
- **スナップショット/特性（±0.5 SD）**：早期示唆と偽陽性のバランス（中程度偏位で注意喚起）。
- **ドライバ（相対70%＋絶対下限）**：**大きさ×一貫性**の双方で弁別し、アクションの優先度を付ける。
- **Trend_B の自動バンド**：部署単位で **E_momentum_3 / E_slope_6** の**月次中央値分布**を集約し、**四分位点**で**改善・悪化の帯**を抽出（データ主導）。
  - **根拠**：基準を固定せず**文脈適応**（部署・時期の分布変動）に合わせるため。

# 7. 総合評価（個人×時点 → アクション）

1. **Level_A**（どの高さにいるか）
2. **Trend_B**（どちらに向かっているか；ヒステリシスで安定判定）
3. **C_stability**（振れ幅・低位持続のリスク）
4. **C_section_strength/weakness**（今の長短所）＋ **C_trait_***（中長期の得手不得手）
5. **C_driver_short/mid（Strength/Weakness）**（何が上げ／下げに効いているか）

これらを**階層的に読む**ことで、

- **［早期介入］**：低位×悪化中×要注意（変動大/連続低位）は速やかな個別面談・業務調整。
- **［維持・伸長］**：高位×安定 は成功要因の共有と役割拡張。
- **［焦点化支援］**：Driver（短期/中期）と Trait を突き合わせ、**V/D/A のどれを何で支援**するか（資源付与、裁量設計、フィードバック設計、学習機会、チーム編成）に直結。

# 8. 妥当性・限界・運用上の注意

- **ロバスト推定の採用**：Theil–Sen と IQR により外れ値の影響を抑制（OLS の脆弱さを回避）。([SciPy Documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html?utm_source=chatgpt.com), [Scikit-learn](https://scikit-learn.org/stable/auto_examples/linear_model/plot_theilsen.html?utm_source=chatgpt.com), [Wikipedia](https://en.wikipedia.org/wiki/Interquartile_range?utm_source=chatgpt.com))
- **参照集団の整合性**：**section 基準**での相対化により、業務差によるバイアスを縮減。
- **短期変動の実在**：日次・週次での変動が知られており、**短期×中期×長期**の**多層指標**を併用すべき。([Hogrefe eContent](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com), [Isonderhouden](https://www.isonderhouden.nl/doc/pdf/arnoldbakker/articles/articles_arnold_bakker_212.pdf?utm_source=chatgpt.com))
- **解釈の節度**：Cohen のしきい値は**一般指針**であり、**分野固有の再チューニング**が望ましい（部署×時期で分位基準へ移行する運用を推奨）。([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6736231/?utm_source=chatgpt.com))
- **プライバシーと倫理**：個人の精神的傾向を扱うため、**説明責任**（何をどう見てどう判断したか）と**同意**、**ケアへの接続**（産業保健・EAP 等）を確保する。

# 9. 追加の提案（論文化に向けた拡張）

1. **感度分析**：
   - しきい値（±1, ±0.5、相対70%等）を変化させたときのカテゴリ遷移行列、安定度（κ係数）を付録で提示。
2. **妥当性検証**：
   - 外的基準（短中期パフォーマンス、欠勤、離職意向、NPS 等）との**先行的妥当性（predictive validity）**を検証。週次研究の知見を踏まえ、**翌月・翌四半期**での予測力を報告。([Isonderhouden](https://www.isonderhouden.nl/doc/pdf/arnoldbakker/articles/articles_arnold_bakker_212.pdf?utm_source=chatgpt.com))
3. **多層モデル（補足研究）**：
   - 研究パートではマルチレベル（個人-部署-部門）を明示し、**部署/部門ランダム効果**や**交互作用**の検証を別稿として示すと学術的価値が高い。
4. **可視化標準**：
   - 管理職向けは**信号灯（R/Y/G）＋スパークライン**＋**ドライバ注記**の統一テンプレートを付録に。
5. **再現可能性**：
   - 解析コードとスキーマ（変数辞書）、疑似データを**付録/リポジトリ**として公開（個人情報の匿名化徹底）。

------

## 参考文献（主要根拠）

- Schaufeli, W. B., et al. “The Measurement of Work Engagement With a Short Questionnaire.”（UWES定義）. ([Wilmar Schaufeli](https://www.wilmarschaufeli.nl/publications/Schaufeli/251.pdf?utm_source=chatgpt.com))
- Xanthopoulou & Bakker. “Daily Fluctuations in Work Engagement.”（日次変動の概観）. ([Hogrefe eContent](https://econtent.hogrefe.com/doi/10.1027/1016-9040/a000160?utm_source=chatgpt.com))
- Bakker, A. B. (2010). “Weekly work engagement and performance.”（週次レベルの関連）. ([Isonderhouden](https://www.isonderhouden.nl/doc/pdf/arnoldbakker/articles/articles_arnold_bakker_212.pdf?utm_source=chatgpt.com))
- SciPy / scikit-learn ドキュメント（Theil–Sen の頑健性）. ([SciPy Documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html?utm_source=chatgpt.com), [Scikit-learn](https://scikit-learn.org/stable/auto_examples/linear_model/plot_theilsen.html?utm_source=chatgpt.com))
- Interquartile Range（IQR）— 代表的説明（ロバスト尺度）. ([Wikipedia](https://en.wikipedia.org/wiki/Interquartile_range?utm_source=chatgpt.com))
- Brydges, C. R. (2019). “Effect Size Guidelines…”（Cohen 指針の一般性と限界）. ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6736231/?utm_source=chatgpt.com))

------

### 最後に（実務指針と論文化の接点）

- 本手法は、**国際標準の構成概念（UWES）**と、**ロバスト時系列統計（Theil–Sen、IQR）**、**分位に基づくデータ主導しきい値**を組み合わせ、**実務の意思決定**（誰に、いつ、何を）へ線形に接続できるのが強みです。
- 論文では、**(i) 構成概念妥当性**（三因子構造の確認）、**(ii) 予測妥当性**（先行指標としての力）、**(iii) 介入実装**（ドライバに基づく処方的提案）を三位一体で提示すると説得力が高まります。
- しきい値や窓長は**固定値ではなく可調整**（部署横断のベンチマークが集まれば、**分野固有の基準**へアップデート）と明記してください。