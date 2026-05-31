# WorkEngagementSystem — プロジェクト概要

Work Engagement の月次アンケート・分析・通知・可視化を担う複数プロジェクトの集合体。
各プロジェクトは独立した GAS プロジェクトまたは Python スクリプトだが、データパイプラインと
指標判定ロジックで相互に連携している。

---

## データパイプライン

  Google Forms
      ↓ onFormSubmit
  [Report]        ← 個人分析・レポートメール送信
      ↓ RatingSS に書き込み
  [Admin]         ← 毎月 updateMaster() を手動実行
      ↓ EngagementMasterSS に書き込み
  [WE-Dashboard]  ← Streamlit ダッシュボード（Python）
  [Playbook]      ← バッチ分析スクリプト（Python）

  [Notification]  ← 毎月の調査開始・リマインダーメール（Report とは独立）

---

## プロジェクト一覧

### Report/          （GAS）
毎月のアンケート回答を受け取り、エンゲージメント分析を行い、
個人別シート（RatingSS）の更新と分析レポートメールの送信を自動実行する。
→ 詳細: Report/docs/TECHNICAL_SPEC.md

### Admin/           （GAS）
RatingSS（Report の出力）を読み込み、組織データ・介入必要度スコアを付加して
EngagementMasterSS（WE-Dashboard / Playbook のデータソース）に書き出す。
→ 詳細: Admin/docs/TECHNICAL_SPEC.md

### Notification/    （GAS）
毎月の調査開始案内メールと未回答者へのリマインダーメールを自動送信する。
Report プロジェクトとは独立しており、回答の促進に特化している。
→ 詳細: Notification/docs/TECHNICAL_SPEC.md

### Playbook/        （Python）
EngagementMasterSS.xlsx を入力とするバッチ分析スクリプト群。
evaluate.gs と同じ指標判定ロジックを Python で実装している。
→ 詳細: Playbook/docs/we_analyzer_technical_documentation.md

### WE-Dashboard/    （Python / Streamlit）
EngagementMasterSS.xlsx を入力とする Web ダッシュボード。
Streamlit Cloud およびローカル（Mac / Windows）で動作する。
→ 詳細: WE-Dashboard/docs/TECHNICAL_ARCHITECTURE.md、WE-Dashboard/CLAUDE.md

---

## SpreadSheet/      （参照専用）

Google Sheets を Excel 形式でエクスポートしたスナップショット。
コードから参照されるカラム構成やデータ内容の確認に使用する。
編集不可。正は Google Sheets 側。

---

## 作業開始前に

/we-preflight コマンド（.claude/commands/we-preflight.md）を実行して
関連ドキュメントの確認と we-system スキルの読み込みを行うこと。
