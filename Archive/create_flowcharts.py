#!/usr/bin/env python3
"""
trend_refinedの判定条件をMermaidフローチャートで図式化
"""

def create_overall_flowchart():
    """全体の判定フロー（Priority順）"""

    mermaid = """```mermaid
flowchart TD
    Start([開始]) --> CheckConstant{flag_constant_6m<br/>== TRUE?}

    CheckConstant -->|Yes| Result1[入力疑義]
    CheckConstant -->|No| CalcTrendRecent[E_delta_1から<br/>短期トレンド計算]

    CalcTrendRecent --> CalcTrendBase[E_slope_6から<br/>中期トレンド計算]

    CalcTrendBase --> CalcChangeTag[E_std_12から<br/>変化大フラグ計算]

    CalcChangeTag --> CheckP1Up{上昇加速<br/>条件?}
    CheckP1Up -->|Yes| ResultP1Up[上昇加速]
    CheckP1Up -->|No| CheckP1Down{低下加速<br/>条件?}

    CheckP1Down -->|Yes| ResultP1Down[低下加速]
    CheckP1Down -->|No| CheckP2Up{上昇継続<br/>条件?}

    CheckP2Up -->|Yes| ResultP2Up[上昇継続]
    CheckP2Up -->|No| CheckP2Down{低下継続<br/>条件?}

    CheckP2Down -->|Yes| ResultP2Down[低下継続]
    CheckP2Down -->|No| CheckP3{P3条件<br/>復活/悪化?}

    CheckP3 -->|Yes| ResultP3[復活 or 悪化]
    CheckP3 -->|No| CheckP4{P4条件<br/>回復/低下危機?}

    CheckP4 -->|Yes| ResultP4[回復 or 低下危機]
    CheckP4 -->|No| CheckP5{P5条件<br/>上昇期待/低下警戒?}

    CheckP5 -->|Yes| ResultP5[上昇期待 or 低下警戒]
    CheckP5 -->|No| CheckP6{P6条件<br/>低下懸念/回復期待?}

    CheckP6 -->|Yes| ResultP6[低下懸念 or 回復期待]
    CheckP6 -->|No| CheckP7{P7条件<br/>上昇/下降/横ばい?}

    CheckP7 -->|Yes| ResultP7[上昇 or 下降 or 横ばい]
    CheckP7 -->|No| ResultP9[安定維持]

    style Result1 fill:#ff6b6b
    style ResultP1Up fill:#51cf66
    style ResultP1Down fill:#ff6b6b
    style ResultP2Up fill:#51cf66
    style ResultP2Down fill:#ff6b6b
    style ResultP3 fill:#ffd43b
    style ResultP4 fill:#ffd43b
    style ResultP5 fill:#74c0fc
    style ResultP6 fill:#74c0fc
    style ResultP7 fill:#e9ecef
    style ResultP9 fill:#adb5bd
```
"""
    return mermaid


def create_individual_flowchart(trend_refined):
    """各trend_refinedの詳細フローチャート"""

    flowcharts = {
        '入力疑義': """```mermaid
flowchart TD
    Start([判定開始]) --> Check{flag_constant_6m<br/>== TRUE?}
    Check -->|Yes| Result[入力疑義]
    Check -->|No| NotMatch[該当しない]

    style Result fill:#ff6b6b
    style NotMatch fill:#e9ecef
```""",

        '上昇加速': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>上昇系?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>上昇トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大?<br/>abs E_delta_1 / E_std_12<br/>>= 2.0}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| Result[上昇加速]

    Note1[上昇系:<br/>E_delta_1 > 2.0<br/>OR E_delta_1 >= 6.0<br/>OR 連続上昇]
    Note2[上昇トレンド:<br/>E_slope_6 > 0 AND<br/>abs E_slope_6 > 0.5 AND<br/>E_slope_6_std_12 > 0.2<br/>OR<br/>E_slope_6_std_12 > 0.45]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#51cf66
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '低下加速': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>低下系?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>低下トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大?<br/>abs E_delta_1 / E_std_12<br/>>= 2.0}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| Result[低下加速]

    Note1[低下系:<br/>E_delta_1 < -2.0<br/>OR E_delta_1 <= -6.0<br/>OR 連続下降]
    Note2[低下トレンド:<br/>E_slope_6 < 0 AND<br/>abs E_slope_6 > 0.5 AND<br/>E_slope_6_std_12 < -0.2<br/>OR<br/>E_slope_6_std_12 < -0.45]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#ff6b6b
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '上昇継続': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>上昇系 or 横ばい?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>上昇トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大でない?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| CheckDelta{E_delta_1<br/>>= 0?}

    CheckDelta -->|No| NotMatch5[該当しない]
    CheckDelta -->|Yes| Result[上昇継続]

    Note1[上昇系 or 横ばい:<br/>E_delta_1 > 2.0<br/>OR -2.0 <= E_delta_1 <= 2.0]

    CheckRecent -.-> Note1

    style Result fill:#51cf66
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style NotMatch5 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '低下継続': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>低下系 or 横ばい?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>低下トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大でない?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| CheckDelta{E_delta_1<br/><= 0?}

    CheckDelta -->|No| NotMatch5[該当しない]
    CheckDelta -->|Yes| Result[低下継続]

    Note1[低下系 or 横ばい:<br/>E_delta_1 < -2.0<br/>OR -2.0 <= E_delta_1 <= 2.0]

    CheckRecent -.-> Note1

    style Result fill:#ff6b6b
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style NotMatch5 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '復活': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>上昇 or 急上昇?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>低下トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| Result[復活]

    Note1[上昇 or 急上昇:<br/>2.0 < E_delta_1 < 6.0<br/>OR E_delta_1 >= 6.0]

    CheckRecent -.-> Note1

    style Result fill:#ffd43b
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '上昇期待': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>上昇系?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>安定?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckDelta{E_delta_1<br/>> 1.0?}

    CheckDelta -->|No| NotMatch3[該当しない]
    CheckDelta -->|Yes| Result[上昇期待]

    Note1[上昇系:<br/>E_delta_1 > 2.0<br/>OR E_delta_1 >= 6.0<br/>OR 連続上昇]
    Note2[安定:<br/>明確なトレンドなし]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#74c0fc
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '悪化': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>下降 or 急落?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>上昇トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| Result[悪化]

    Note1[下降 or 急落:<br/>-6.0 < E_delta_1 < -2.0<br/>OR E_delta_1 <= -6.0]

    CheckRecent -.-> Note1

    style Result fill:#ffd43b
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '回復': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>上昇 or 急上昇?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>低下トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大でない?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| Result[回復]

    Note1[上昇 or 急上昇:<br/>2.0 < E_delta_1 < 6.0<br/>OR E_delta_1 >= 6.0]

    CheckRecent -.-> Note1

    style Result fill:#ffd43b
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '低下危機': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>下降 or 急落?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>上昇トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大でない?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| CheckSlope{abs E_slope_6<br/>> 0.5?}

    CheckSlope -->|No| NotMatch4[該当しない]
    CheckSlope -->|Yes| Result[低下危機]

    Note1[下降 or 急落:<br/>-6.0 < E_delta_1 < -2.0<br/>OR E_delta_1 <= -6.0]

    CheckRecent -.-> Note1

    style Result fill:#ffd43b
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style NotMatch4 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '低下警戒': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>低下系?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>安定?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckDelta{E_delta_1<br/>< -1.0?}

    CheckDelta -->|No| NotMatch3[該当しない]
    CheckDelta -->|Yes| Result[低下警戒]

    Note1[低下系:<br/>E_delta_1 < -2.0<br/>OR E_delta_1 <= -6.0<br/>OR 連続下降]
    Note2[安定:<br/>明確なトレンドなし]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#74c0fc
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '低下懸念': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>横ばい?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>上昇トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckDelta{E_delta_1<br/>< 0?}

    CheckDelta -->|No| NotMatch3[該当しない]
    CheckDelta -->|Yes| Result[低下懸念]

    Note1[横ばい:<br/>-2.0 <= E_delta_1 <= 2.0]

    CheckRecent -.-> Note1

    style Result fill:#74c0fc
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '回復期待': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>横ばい?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>低下トレンド?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckDelta{E_delta_1<br/>> 0?}

    CheckDelta -->|No| NotMatch3[該当しない]
    CheckDelta -->|Yes| Result[回復期待]

    Note1[横ばい:<br/>-2.0 <= E_delta_1 <= 2.0]

    CheckRecent -.-> Note1

    style Result fill:#74c0fc
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style Note1 fill:#fff3bf
```""",

        '上昇': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>上昇 or 急上昇?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>未評価 or 安定?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| Result[上昇]

    Note1[上昇 or 急上昇:<br/>2.0 < E_delta_1 < 6.0<br/>OR E_delta_1 >= 6.0]
    Note2[未評価 or 安定:<br/>データ件数 < 3<br/>OR 明確なトレンドなし]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#e9ecef
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '下降': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>下降 or 急落?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>未評価 or 安定?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| Result[下降]

    Note1[下降 or 急落:<br/>-6.0 < E_delta_1 < -2.0<br/>OR E_delta_1 <= -6.0]
    Note2[未評価 or 安定:<br/>データ件数 < 3<br/>OR 明確なトレンドなし]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#e9ecef
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '横ばい': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>横ばい?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>未評価 or 安定?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| Result[横ばい]

    Note1[横ばい:<br/>-2.0 <= E_delta_1 <= 2.0]
    Note2[未評価 or 安定:<br/>データ件数 < 3<br/>OR 明確なトレンドなし]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2

    style Result fill:#e9ecef
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
```""",

        '安定維持': """```mermaid
flowchart TD
    Start([判定開始]) --> CheckRecent{E_delta_1で<br/>横ばい?}
    CheckRecent -->|No| NotMatch1[該当しない]
    CheckRecent -->|Yes| CheckBase{E_slope_6で<br/>安定?}

    CheckBase -->|No| NotMatch2[該当しない]
    CheckBase -->|Yes| CheckChange{変化大でない?}

    CheckChange -->|No| NotMatch3[該当しない]
    CheckChange -->|Yes| Result[安定維持]

    Note1[横ばい:<br/>-2.0 <= E_delta_1 <= 2.0]
    Note2[安定:<br/>明確なトレンドなし]
    Note3[変化大でない:<br/>abs E_delta_1 / E_std_12 < 2.0<br/>OR E_std_12 <= 0]

    CheckRecent -.-> Note1
    CheckBase -.-> Note2
    CheckChange -.-> Note3

    style Result fill:#adb5bd
    style NotMatch1 fill:#e9ecef
    style NotMatch2 fill:#e9ecef
    style NotMatch3 fill:#e9ecef
    style Note1 fill:#fff3bf
    style Note2 fill:#fff3bf
    style Note3 fill:#fff3bf
```""",
    }

    return flowcharts.get(trend_refined, "フローチャート未定義")


def create_flowchart_document():
    """全フローチャートをまとめたMarkdownドキュメントを作成"""

    md_content = """# trend_refined 判定フローチャート

このドキュメントは、trend_refinedの判定ロジックをフローチャート形式で視覚化したものです。

## 表示方法

このMarkdownファイルは、Mermaid記法でフローチャートを記述しています。
以下のツールで正しく表示できます:

- GitHub（自動的にレンダリング）
- VS Code（Mermaid拡張機能）
- Typora
- オンラインMermaidエディター: https://mermaid.live/

## 色の凡例

- 🟢 **緑**: 上昇系（上昇加速、上昇継続など）
- 🔴 **赤**: 低下系（低下加速、低下継続など）
- 🟡 **黄**: 転換系（復活、悪化など）
- 🔵 **青**: 期待・警戒系（上昇期待、低下警戒など）
- ⚪ **灰**: 安定・その他

---

## 全体フロー（Priority順の判定）

全17のtrend_refinedは、Priority 1から順に評価され、最初にマッチした条件が採用されます。

"""
    md_content += create_overall_flowchart()
    md_content += "\n\n---\n\n"

    # 個別フローチャート
    conditions_order = [
        ('入力疑義', 1),
        ('上昇加速', 1),
        ('低下加速', 1),
        ('上昇継続', 2),
        ('低下継続', 2),
        ('復活', 3),
        ('悪化', 3),
        ('回復', 4),
        ('低下危機', 4),
        ('上昇期待', 5),
        ('低下警戒', 5),
        ('低下懸念', 6),
        ('回復期待', 6),
        ('上昇', 7),
        ('下降', 7),
        ('横ばい', 7),
        ('安定維持', 9),
    ]

    for trend_refined, priority in conditions_order:
        md_content += f"## Priority {priority}: {trend_refined}\n\n"
        flowchart = create_individual_flowchart(trend_refined)
        md_content += flowchart
        md_content += "\n\n---\n\n"

    # 補足説明
    md_content += """## 補足: 指標の計算方法

### 短期トレンド判定（E_delta_1ベース）

| 判定 | 条件 |
|------|------|
| 連続上昇 | E_delta_1 > 2.0 **AND** E_delta_1_prev > 2.0 |
| 急上昇 | E_delta_1 >= 6.0 |
| 上昇 | 2.0 < E_delta_1 < 6.0 |
| 横ばい | -2.0 <= E_delta_1 <= 2.0 |
| 下降 | -6.0 < E_delta_1 < -2.0 |
| 急落 | E_delta_1 <= -6.0 |
| 連続下降 | E_delta_1 < -2.0 **AND** E_delta_1_prev < -2.0 |

### 中期トレンド判定（E_slope_6ベース）

| 判定 | 条件 |
|------|------|
| 未評価 | データ件数 < 3 |
| 上昇中 | (E_slope_6 > 0 **AND** \\|E_slope_6\\| > 0.5 **AND** E_slope_6_std_12 > 0.2) **OR** (E_slope_6_std_12 > 0.45) |
| 低下中 | (E_slope_6 < 0 **AND** \\|E_slope_6\\| > 0.5 **AND** E_slope_6_std_12 < -0.2) **OR** (E_slope_6_std_12 < -0.45) |
| 安定 | 上記以外 |

### 変化大判定

| 判定 | 条件 |
|------|------|
| 変化大 | \\|E_delta_1\\| / E_std_12 >= 2.0 |
| 変化大でない | \\|E_delta_1\\| / E_std_12 < 2.0 **OR** E_std_12 <= 0 |

### 定数値

| 定数名 | 値 | 意味 |
|--------|-----|------|
| CHANGE_TAG_THRESHOLD | 6.0 | 急上昇・急落の閾値 |
| TREND_RECENT_DELTA | 2.0 | 上昇・下降の閾値 |
| TREND_SLOPE | 0.5 | 中期傾き閾値 |
| TREND_SLOPE_STD_MIN | 0.2 | 標準化傾き最小閾値 |
| TREND_SLOPE_STD | 0.45 | 標準化傾き閾値 |
| BIG_CHANGE_PERSONAL_Z | 2.0 | 個人内2σ閾値 |
| TREND_DELTA | 1.0 | 期待・警戒閾値 |
"""

    # ファイルに保存
    with open('trend_refined_flowcharts.md', 'w', encoding='utf-8') as f:
        f.write(md_content)

    print("✓ フローチャートドキュメントを作成しました: trend_refined_flowcharts.md")
    print("  - Mermaid形式のフローチャート")
    print("  - GitHubやVS Codeで表示可能")
    print("  - オンラインエディター: https://mermaid.live/")

    return md_content


if __name__ == "__main__":
    create_flowchart_document()
