# TECHNICAL_SPEC.md — Work Engagement Report 技術仕様書

> 本書は Report プロジェクト（Google Apps Script）のアーキテクチャ中央仕様書です。
> 実装詳細は各モジュールの参照ドキュメントを参照してください。

---

## 1. システム概要

Work Engagement Report は Google Apps Script ベースのワークエンゲージメント分析・報告システムです。
Google Forms によるアンケート回答を受け取り、エンゲージメント分析を行い、個人別シートの更新、分析レポートメールの送信を自動実行します。

### 技術スタック

| 要素 | 技術 |
|------|------|
| 言語 | Google Apps Script (JavaScript ES6) |
| トリガー | Google Forms の onFormSubmit |
| データストア | Google Spreadsheets (7つ) |
| メール | GmailApp |
| グラフ | Charts API (GAS built-in) |
| テンプレート | ConvertHtml (カスタムライブラリ) |

### ファイル構成

```
Report/
├── evaluate.gs           # エンゲージメント分析エンジン (コア)
├── set_globals.gs        # グローバル設定・スプレッドシート初期化
├── send_response.gs      # フォーム応答処理・メール送信
├── make_individual.gs    # 個人別シート生成・更新
├── make_mail_contents.gs # メール本文生成 (フィードバック・コメント)
├── make_charts.gs        # グラフ生成 (3種類)
├── record_engagement.gs  # データ記録 (rating/comment シート)
├── maintenance.gs        # バッチ処理 (再計算・一括更新)
├── utilities.gs          # ユーティリティ (日付調整・モード切替)
├── tentative.gs          # テスト・デバッグ用 (本番では使用しない)
└── docs/
    ├── TECHNICAL_SPEC.md       # 本書 (技術仕様書)
    ├── evaluate_reference.md   # 分析ロジック詳細リファレンス
    └── MODULE_REFERENCE.md     # モジュールAPIリファレンス
```

---

## 2. データストア

### Spreadsheet 一覧

| 変数名 | シート名 | 用途 |
|--------|----------|------|
| AnswerSS | "Form Responses 1" | Google Forms 回答データ |
| RatingSS | "rating" + 個人別シート | エンゲージメント評価値・個人別分析 |
| CommentSS | "comments" | コメント（気になること・意見） |
| MemberSS | "members" | メンバー情報（名前・所属・メールアドレス） |
| SayingSS | "saying" | 名言・格言データベース |
| AdviceSS | (各カテゴリシート) | アドバイステキスト (vigor/dedication/absorption/engagement) |
| MessageSS | "column" | ウェルビーイングコラム記事 |

### Rating シート構造

| 列 | インデックス | 内容 |
|----|------------|------|
| A-E | 0-4 | year, month, day, date, mail_address |
| F-I | 5-8 | engagement, vigor, dedication, absorption |
| J以降 | 9+ | 分析結果フィールド (ENGAGEMENT_RESULT_FIELDS の24項目) |

### Member シート構造

| 列 | インデックス (0始まり) | 内容 |
|----|----------------------|------|
| B | 1 | name (氏名) |
| E | 4 | mail_address |
| F | 5 | division (部門) |
| G | 6 | department (部署) |
| H | 7 | section (課) |
| I | 8 | team |
| J | 9 | project |
| K | 10 | grade (職位) |
| L | 11 | leave (休職フラグ) |
| M | 12 | count (メール送信回数) |

### Comment シート構造

| 列インデックス | 内容 |
|--------------|------|
| 17 | concern (気になった出来事) |
| 18 | comment (意見) |

---

## 3. 処理フロー

### メイン処理（フォーム送信時）

```
sendResponse(e)
  ├── setGlobals()              # スプレッドシート初期化
  ├── calcEngagement()          # 9問の回答 → V/D/A/E スコア計算
  ├── recordEngagement()        # rating/comment シートに記録
  ├── makeIndividualSheet()     # 個人別シート生成 + analyzeEngagement() 実行
  │   ├── analyzeEngagement()   # コア分析エンジン
  │   └── 分析結果をrating/個人シートに書き込み
  └── sendAnalysisReport()      # レポートメール送信
      ├── 3種のグラフ生成
      ├── createFeedback()      # フィードバックテキスト生成
      ├── makeCommentList()     # コメント一覧生成
      ├── createSaying()        # 名言選択
      ├── getColumn()           # ウェルビーイングコラム取得
      └── GmailApp.sendEmail()  # メール送信
```

### エンゲージメントスコア計算 (calcEngagement)

9問のアンケート回答（7段階: 0-6点）を3因子に分類します。

- **Vigor (活力)**: 質問 0, 1, 4 → 合計 0-18
- **Dedication (熱意)**: 質問 2, 3, 6 → 合計 0-18
- **Absorption (没頭)**: 質問 5, 7, 8 → 合計 0-18
- **Engagement (総合)**: V + D + A → 合計 0-54

7段階回答の変換:

| 回答 | 点数 |
|------|------|
| いつも感じる | 6 |
| とてもよく感じる | 5 |
| よく感じる | 4 |
| 時々感じる | 3 |
| めったに感じない | 2 |
| ほとんど感じない | 1 |
| 全くない | 0 |

---

## 4. 分析エンジン (evaluate.gs)

### analyzeEngagement() の処理フロー

```
analyzeEngagement(data)
  ├── prepareEngagementContext()    # データ検証・ソート
  ├── computeEngagementMetrics()   # 数値指標計算
  │   ├── E_delta_1, V/D/A_delta_1  (1期変化量)
  │   ├── E_std_6, E_std_12         (標準偏差)
  │   ├── E_slope_6                 (Theil-Sen傾き)
  │   ├── E_slope_6_std_12          (標準化傾き)
  │   ├── E_momentum_3              (モメンタム)
  │   └── E_slope_3m                (3期OLS傾き)
  ├── computeStrengthAndWeakness() # 強み・弱み判定
  │   ├── expanding quantile (P10/P90) による適応的閾値
  │   └── expanding robust Z-score (MAD-based) による判定
  ├── evaluateStabilityTrendAndTags()
  │   ├── stability_6    (安定性: 不変/安定/やや安定/不安定)
  │   ├── trend_base     (基本トレンド: 上昇中/安定/低下中/未評価)
  │   ├── trend_recent   (直近変化: 連続上昇/急上昇/上昇/横ばい/下降/急落/連続下降)
  │   ├── big_change     (短期変動: 変化大/空)
  │   ├── trend_refined  (統合トレンド: 13カテゴリ)
  │   └── level          (レベル: Thriving/High/Moderate/Low/Critical)
  └── computeDirectionVolatility()   # 個人内変動指標（Playbook/we_analyzer.py と完全同期）
      ├── direction_6_p90   (中期方向: 上昇/下降/横ばい/判定保留, 過去窓 D6 の P90 を閾値)
      └── volatility_6_p90  (中期波動: 波動あり/波動なし/判定保留, 過去窓 R6 の P90 + 符号反転≥3)
```

### 統計手法

- **Theil-Sen slope**: 外れ値に頑健な傾き推定（全ペアの傾きの中央値）
- **MAD-based Z-score**: Median Absolute Deviation による頑健なZ-score (1.4826倍)
- **Expanding quantile (exclusive)**: 現在値を除外した過去データの分位数で適応的閾値を設定

### 出力フィールド (ENGAGEMENT_RESULT_FIELDS: 24項目)

`evaluate.gs` で定義。`E_slope_3m` を `E_slope_6_std_12` と `V_delta_1` の間へ移動し、その後に `direction_6_p90`, `volatility_6_p90` を追加（RatingSS rating/個人シートおよび EngagementMasterSS rating2 と同列順）:

```
level, trend_base, trend_recent, trend_refined, big_change, stability_6,
strength_short, weakness_short, strength_mid, weakness_mid,
E_delta_1, E_delta_1_prev, E_delta_1_std_12, E_slope_6, E_slope_6_std_12,
E_slope_3m, direction_6_p90, volatility_6_p90,
V_delta_1, D_delta_1, A_delta_1, V_slope_6, D_slope_6, A_slope_6
```

詳細なロジックと閾値については `evaluate_reference.md` を参照してください。

---

## 5. 期間設定

| 定数 | 値 | 用途 |
|------|------|------|
| Deadline | 10日 | 月の10日以内の回答は前月として処理 |
| ReportPeriod | 6ヶ月 | レポートメールのグラフ・コメント表示期間 |
| AnalysisPeriod | 18ヶ月 | 分析計算用データ保持期間（個人別シート） |

### 日付調整ロジック (setResponseDate)

回答日が月の10日以内の場合、前月末日として処理されます。
これにより、月初に前月分の回答を入力できます。

---

## 6. メール生成

### グラフ (make_charts.gs)

| 関数 | グラフ種類 | 内容 |
|------|-----------|------|
| individualEngagementChart | 棒グラフ | エンゲージメント推移 (0-10スケール) |
| individualEngagementVariationChart | 折れ線グラフ | 月間増減 (適応スケール: ±4以内は固定、超えたら自動) |
| individualEngagementElementsChart | 折れ線グラフ | V/D/A構成要素推移 |

グラフデータは ReportPeriod (6ヶ月) でフィルタリングされます。
個人別シートは AnalysisPeriod (18ヶ月) のデータを保持しますが、グラフには直近6ヶ月のみ表示されます。

### フィードバック (make_mail_contents.gs)

`makeEngagementComment()` が `trend_refined` に基づいて個別フィードバックを生成します:

1. トレンドメッセージ（17パターン）
2. レベル別コメント（Thriving/Critical）
3. 強み/弱み分析 + アドバイス（AdviceSS からランダム選択）
4. 中期変動コメント（`volatility_6_p90 === "波動あり"` のとき固定文 + `direction_6_p90` に応じた AdviceSS アドバイス: 変動中上昇/変動中下降/変動中/変動中安定）
5. 安定性コメント（不安定/不変の場合）

### 名言 (send_response.gs)

`createSaying()`: `weakness_short` のカテゴリからランダムに1つ選択し、
SayingSS から対応カテゴリの名言を取得します。

### ウェルビーイングコラム

`getColumn()`: メール送信回数 (`articleCount`) に基づく連番でコラム記事を取得します。

### メール構成

```
件名: ワークエンゲージメント調査結果
送信元: ishibashi@rdpi.co.jp
BCC: iryozo@rdpi.jp

本文:
├── 氏名
├── グラフ3枚 (inline images)
├── フィードバック (trend/level/strength/weakness)
├── コメント一覧 (過去6ヶ月の concern + comment)
├── 名言
└── ウェルビーイングコラム
```

---

## 7. バッチ処理 (maintenance.gs)

### recalculateRatingSheet()

Rating シートの全行の分析結果を再計算します。
ユーザーごとに時系列順に処理し、各行ではその時点までのデータのみを使用します。
結果は一括書き込み（バルクライト）で効率化されています。

### recalculateMonth(targetYear, targetMonth)

特定月の行のみを対象に再計算します。全履歴をコンテキストとして使用しますが、
書き込みは対象月の行のみに行います。

### remakeAllIndividualSheets()

全メンバーの個人別シートを再作成します。`recalculateRatingSheet()` の後に実行することを想定しています。

シート名は `resolveMemberName(address)` で解決します。現役 `members` シートに居ない退職者は `members_history` シート（列レイアウトが異なるためヘッダー名で解決）を参照し、それでも見つからない場合のみメールアドレスにフォールバックします。これにより退職者の個人シート名がメールアドレスになる問題を防ぎます。`sendReport` / `recordAndSendReport` も同じ `resolveMemberName` を使用します。

---

## 8. テストモード

PropertiesService の `'Operation Mode'` プロパティで制御します:

| モード | 値 | 動作 |
|--------|-----|------|
| テストモード | `'test'` | メール送信先をテストアドレスに固定 |
| 本番モード | `'operation'` | 実際のユーザーアドレスに送信 |

切替関数: `switchToTestMode()` / `switchToOperationMode()`

---

## 9. 初期化とリトライ

`ensureSpreadsheets()`: 全7つの Spreadsheet を開き、シートオブジェクトをグローバル変数に設定します。

- 最大3回リトライ
- リトライ間隔: `RETRY_DELAY_MS` = 60秒
- Google Spreadsheet API の一時的なエラーに対応

---

## 10. 外部依存

| ライブラリ | 提供する関数 | 用途 |
|-----------|------------|------|
| DateUtil | `getPreviousMonthEndDate`, `getMonthsOffsetDate`, `getMonthFirstDate`, `getMondayOfWeek` | 日付ユーティリティ |
| ConvertHtml | `getMailTemplate`, `createHtmlEmail` | HTMLメールテンプレート |

これらは GAS プロジェクトにライブラリとして追加されている外部スクリプトです。

---

*最終更新: 2026-06-30（make_mail_contents.gs: volatility_6_p90 のアドバイスを direction_6_p90 で 4 パターン出し分け、横ばい rank 追加により engagement 全 rank を利用可能に）*
