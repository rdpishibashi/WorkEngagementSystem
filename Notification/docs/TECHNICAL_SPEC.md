# TECHNICAL_SPEC.md — Work Engagement Notification 技術仕様書

> 本書は Notification プロジェクト（Google Apps Script）の技術仕様書です。
> 毎月のアンケート通知・リマインダー・未回答者管理を担うプロジェクトの設計と保守情報をまとめています。

---

## 1. システム概要

Work Engagement Notification は、毎月の WE アンケートに関する以下のメール通知を自動化する GAS プロジェクトです。

- アンケート開始の案内メール（全在籍メンバーへ一斉送信）
- 未回答者へのリマインダーメール（複数回）
- エラー発生時のお詫びメール

Report プロジェクトとは独立しており、アンケートの「回答促進」に特化しています。フォームへの回答が Report プロジェクトの `sendResponse()` をトリガーします。

### 他プロジェクトとの関係

```
[Notification]  ─── 開始通知・リマインダーメール送信
      │
      ↓ （メンバーがフォームに回答）
[Google Forms]  ─── onFormSubmit
      │
      ↓
[Report]        ─── 分析・個人レポートメール送信
```

Notification は Report の出力（RatingSS 等）を直接参照しません。共通で参照するのは MemberSS のみです。

---

## 2. ファイル構成

```
Notification/
├── Globals.gs          # グローバル変数・スプレッドシート初期化
├── notification.gs     # メイン処理（トリガー設定・メール送信）
├── check_noentry.gs    # 未回答者チェック・NoEntrySS 書き込み
├── message.gs          # メッセージ取得（季節の挨拶・本文・コラム）
├── operation_mode.gs   # テスト/本番モード切替・フォーム受付制御
├── utilities.gs        # 日付ユーティリティ（全角日付変換・締め切り日計算）
└── tentative.gs        # テスト・デバッグ用（本番では使用しない）
```

---

## 3. スプレッドシート

### 3-1. スプレッドシート一覧

すべてのスプレッドシート ID は ConfigurationSS 経由で取得します（`Globals.gs` 参照）。

| 変数名 | シート名 | 用途 |
|--------|----------|------|
| `MemberSS` | `members` | メンバー情報（在籍メンバーの抽出に使用） |
| `MessageSS` | `greeting`, `message`, `wellbeing` | メールテンプレート・季節の挨拶・本文メッセージ |
| `AnswerSS` | `Form Responses 1` | Google Forms の回答データ（回答済みアドレスの抽出に使用） |
| `NoEntrySS` | `member not entered` | 未回答者リスト（毎回上書き更新） |

### 3-2. ConfigurationSS のセル参照

```
C3  → AnswerSS の ID
C6  → MemberSS の ID
C7  → NoEntrySS の ID
C11 → MessageSS の ID
```

> Admin プロジェクトも ConfigurationSS を参照していますが、**Notification と Admin が参照する ConfigurationSS は別ファイル**（それぞれ独自の `ConfigurationFileId` を持つ）です。

### 3-3. MemberSS のカラム構成（0始まり）

| インデックス | 定数名 | 内容 |
|------------|--------|------|
| 1 | `ColumnMemberName` | 氏名 |
| 2 | `ColumnMemberKana` | カナ |
| 3 | `ColumnMemberAlternativeName` | 別名 |
| 4 | `ColumnMemberAddress` | メールアドレス |
| 5 | `ColumnMemberDivision` | 部門 |
| 6 | `ColumnMemberDepartment` | 部署 |
| 7 | `ColumnMemberSection` | 課 |
| 8 | `ColumnMemberTeam` | チーム |
| 9 | `ColumnMemberProject` | プロジェクト |
| 10 | `ColumnMemberGrade` | 職位 |
| 11 | `ColumnMemberLeave` | 在籍ステータス |

### 3-4. NoEntrySS の書き込み内容

`checkNoEntryMember()` が毎回上書きする5列構成です。

| 列 | 内容 |
|----|------|
| 1 | チェック日時 |
| 2 | 氏名 |
| 3 | メールアドレス |
| 4 | 部署 |
| 5 | 課 |

### 3-5. MessageSS のシートとテンプレートキー

メール本文は `ConvertHtml.getMailTemplate(key, MessageSS)` で取得します。

| シート名 | 内容 |
|---------|------|
| `greeting` | 季節の挨拶（month 列でフィルタ、複数候補からランダム選択） |
| `message` | 調査案内の本文（sequence 番号で選択。番号 = `(month % count) + 1`）|
| `wellbeing` | ウェルビーイングコラム（sequence 番号で選択） |
| — | メールテンプレート HTML（`notifyStart`, `dayBefore`, `deadline`, `pastDeadline`, `closeDate`, `notifyError` をキーとして取得） |

---

## 4. 処理フロー

### 4-1. 毎月の手動起動：`createMonthTrigger()`

月次運用の**唯一の手動実行ポイント**です。月初めに実行して、その月の通知スケジュールをすべて登録します。

```
createMonthTrigger()
  ├── 月末営業日（lastBusinessDay）を算出して Script Properties に保存
  ├── 各通知日を営業日オフセットで算出
  ├── 既存の管理対象トリガーをすべて削除
  └── 新しいトリガーを登録（9:00 実行）
```

### 4-2. トリガースケジュール

月末営業日を `D` として、以下の日程でトリガーが登録されます。

| 関数名 | 実行タイミング | 動作 |
|--------|--------------|------|
| `notifyStart` | D の 5 営業日前 | AnswerSheet をクリアして調査開始メールを全在籍メンバーへ一斉送信 |
| `day2BeforeDeadline` | D の 2 営業日前 | 未回答者にリマインダー（`dayBefore` テンプレート） |
| `dayBeforeDeadline` | D の 1 営業日前 | 未回答者にリマインダー（`dayBefore` テンプレート） |
| `dayOfDeadline` | D 当日 | 未回答者にリマインダー（`deadline` テンプレート） |
| `dayAfterDeadline` | D の 1 営業日後 | 未回答者にリマインダー（`pastDeadline` テンプレート） |
| `day2AfterDeadline` | D の 2 営業日後 | 未回答者にリマインダー（`pastDeadline` テンプレート） |
| `lastNotice` | D の 3 営業日後 | 未回答者に最終連絡（`closeDate` テンプレート） |

> **12月の特別処理**: `getLastBusinessDayParts()` 内で月が12月の場合 `day = 27` に固定し、年末休暇前にメールが届くよう調整しています。

### 4-3. 調査開始メール：`notifyStart()`

```
notifyStart()
  ├── AnswerSheet の既存データを全削除（前月の回答をクリア）
  └── prepareMailData("notifyStart", ...)
        └── sendBulkMail()
              └── leave == "" のメンバーにのみ送信（"absence" と "leave" は対象外）
```

**`notifyStart()` は AnswerSheet を削除してから送信する**ため、テスト実行時は本番データが消えます。テストモードでも削除が走る点に注意してください。

### 4-4. リマインダーメール：`notifyNoResponseMember(timing)`

```
notifyNoResponseMember(timing)
  ├── checkNoEntryMember() で未回答者を特定・NoEntrySS に書き込み
  │     └── 未回答者が 0 人なら即終了
  ├── Script Properties から LastWorkingDay を取得
  └── NoEntrySS の未回答者リストへ各自のリマインダーを送信
```

締め切り日（`LastWorkingDay`）と最終連絡日（`closeDate = D + 3 営業日`）はメール本文のプレースホルダー `{deadline}`, `{closeDate}` に差し込まれます。

---

## 5. 在籍ステータスと通知対象

MemberSS の `leave` 列（インデックス 11）の値で通知対象を判断します。

| `leave` の値 | 意味 | `notifyStart` | リマインダー |
|-------------|------|:---:|:---:|
| `""` (空) | 在籍中 | ✓ | ✓ |
| `"absence"` | 長期休職 | ✗ | ✗ |
| `"leave"` | 退職・転属 | ✗ | ✗ |

> **Admin / WE-Dashboard との違い**: Admin と WE-Dashboard では `absence` を在籍中と同等に扱いますが、**Notification では `absence` を通知対象外**にしています（`!member[ColumnMemberLeave]` で判定するため、`""` 以外はすべて除外）。

---

## 6. テストモード

### 切替と副作用

| 関数 | Operation Mode | フォームの回答受付 |
|------|---------------|------------------|
| `switchToTestMode()` | `'test'` に設定 | **無効化**（`setAcceptingResponses(false)`）|
| `switchToOperationMode()` | `'operation'` に設定 | **有効化**（`setAcceptingResponses(true)`）|

> フォームの受付状態が変わるため、テストモード切替は本番稼働中に実行しないでください。

### テストモードの送信動作

`TestMode == true` のとき:

- `sendBulkMail()` / `sendNotification()` は `index % TestMailInterval === 0`（35件ごと）の1件だけ `TestMailTo` に送信します
- それ以外のメンバーへはログ出力のみで送信はスキップされます

### Script Properties キー一覧

| キー | 格納値 | 設定タイミング |
|------|--------|--------------|
| `'Operation Mode'` | `'test'` または `'operation'` | `switchToTestMode/OperationMode()` |
| `'Last Working Day'` | `"YYYY-M-D"` 形式の文字列 | `createMonthTrigger()` |

---

## 7. メールのプレースホルダー一覧

### 調査開始メール（`notifyStart` テンプレート）

| プレースホルダー | 内容 | 取得元 |
|----------------|------|--------|
| `{fullname}` | 氏名 | MemberSS |
| `{seasonGreeting}` | 季節の挨拶 | MessageSS greeting シート |
| `{message}` | 調査案内の本文 | MessageSS message シート |
| `{deadline}` | 締め切り日（例: ９月３０日） | `getLastBusinessDayParts()` |
| `{formURL}` | フォームの URL | `Globals.gs` の `FormURL` 定数 |

### リマインダーメール（`dayBefore`, `deadline`, `pastDeadline`, `closeDate`）

| プレースホルダー | 内容 | 取得元 |
|----------------|------|--------|
| `{fullname}` | 氏名 | NoEntrySS |
| `{deadline}` | 締め切り日（全角） | `getJananeseDateString(LastWorkingDay)` |
| `{closeDate}` | 最終連絡日（全角） | `getJananeseDateString(D + 3 営業日)` |
| `{formURL}` | フォームの URL | `Globals.gs` の `FormURL` 定数 |

---

## 8. 外部依存

| ライブラリ | 使用関数 | 用途 |
|-----------|---------|------|
| `DateUtil` | `getLastBusinessDay`, `getBusinessDay`, `getPreviousMonthEndDate`, `getMonthsOffsetDate`, `getMonthFirstDate` | 営業日計算・日付操作 |
| `ConvertHtml` | `getMailTemplate`, `createHtmlEmail` | HTML メールテンプレート処理 |
| `FormApp` | `openById`, `setAcceptingResponses` | テストモード切替時のフォーム制御 |

---

## 9. 保守時の注意点

### 月次運用手順

1. 月初に `createMonthTrigger()` を**手動実行**してトリガーを登録する
2. トリガーが正しく登録されているか GAS エディタの「トリガー」画面で確認する
3. テストモードで確認する場合は `switchToTestMode()` を実行し、確認後必ず `switchToOperationMode()` で戻す

### 機能拡張・保守時のチェックポイント

- **メールテンプレートの追加・変更**: MessageSS の HTML テンプレートと `ConvertHtml.getMailTemplate()` のキー名が一致していることを確認する
- **通知タイミングの変更**: `createMonthTrigger()` 内の `triggersToCreate` 配列と、ラッパー関数（`dayBeforeDeadline` 等）を合わせて変更する
- **在籍ステータスの判定変更**: `sendBulkMail()` の `!member[ColumnMemberLeave]` 判定と `checkNoEntryMember()` の `row[leaveIndex] === ""` の両方を変更する必要がある
- **MemberSS カラム変更**: `Globals.gs` の `ColumnMember*` 定数と `checkNoEntryMember()` の `nonRespondentsAttributes` 配列を合わせて更新する
- **ConfigurationSS の参照**: スプレッドシート ID の変更は ConfigurationSS の対応セル（C3/C6/C7/C11）を更新すれば Globals.gs の変更は不要

### `notifyStart()` の破壊的動作

`notifyStart()` の冒頭で `AnswerSheet` の全データを削除します。**本番環境で誤って実行すると、その月の回答済みデータが消えます。** テスト環境での確認を徹底してください。

---

*作成日: 2026-05-23*
