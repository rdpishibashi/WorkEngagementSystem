#!/usr/bin/env python3
"""
trend_refinedの判定条件を、生の指標（E_delta_1, E_slope_6等）で表現したマトリクスを作成
"""

import pandas as pd
import json

# 定数値
CHANGE_TAG_THRESHOLD = 6.0
TREND_RECENT_DELTA = 2.0
TREND_SLOPE = 0.5
TREND_SLOPE_STD_MIN = 0.2
TREND_SLOPE_STD = 0.45
BIG_CHANGE_PERSONAL_Z = 2.0
TREND_DELTA = 1.0

def expand_trend_recent(trend_recent_values):
    """trend_recentの条件を元指標に展開"""
    conditions = []

    for tr in trend_recent_values:
        if tr == "連続上昇":
            conditions.append("(E_delta_1 > 2.0 AND E_delta_1_prev > 2.0)")
        elif tr == "急上昇":
            conditions.append("(E_delta_1 >= 6.0)")
        elif tr == "上昇":
            conditions.append("(2.0 < E_delta_1 < 6.0)")
        elif tr == "横ばい":
            conditions.append("(-2.0 <= E_delta_1 <= 2.0)")
        elif tr == "下降":
            conditions.append("(-6.0 < E_delta_1 < -2.0)")
        elif tr == "急落":
            conditions.append("(E_delta_1 <= -6.0)")
        elif tr == "連続下降":
            conditions.append("(E_delta_1 < -2.0 AND E_delta_1_prev < -2.0)")

    if not conditions:
        return ""
    elif len(conditions) == 1:
        return conditions[0]
    else:
        return "(" + " OR ".join(conditions) + ")"


def expand_trend_base(trend_base_values):
    """trend_baseの条件を元指標に展開"""
    conditions = []

    for tb in trend_base_values:
        if tb == "未評価":
            conditions.append("(データ件数 < 3)")
        elif tb == "上昇中":
            cond = "((E_slope_6 > 0 AND |E_slope_6| > 0.5 AND E_slope_6_std_12 > 0.2) OR (E_slope_6_std_12 > 0 AND E_slope_6_std_12 > 0.45))"
            conditions.append(cond)
        elif tb == "低下中":
            cond = "((E_slope_6 < 0 AND |E_slope_6| > 0.5 AND E_slope_6_std_12 < -0.2) OR (E_slope_6_std_12 < 0 AND E_slope_6_std_12 < -0.45))"
            conditions.append(cond)
        elif tb == "安定":
            # 未評価、上昇中、低下中のいずれでもない
            cond = "(データ件数 >= 3 AND NOT(上昇中条件) AND NOT(低下中条件))"
            conditions.append(cond)

    if not conditions:
        return ""
    elif len(conditions) == 1:
        return conditions[0]
    else:
        return "(" + " OR ".join(conditions) + ")"


def expand_change_tag(change_tag_value):
    """change_tagの条件を元指標に展開"""
    if change_tag_value == "変化大":
        return "(|E_delta_1| / E_std_12 >= 2.0)"
    elif change_tag_value == "not 変化大":
        return "(|E_delta_1| / E_std_12 < 2.0 OR E_std_12 <= 0)"
    else:
        return ""


# 各trend_refinedの条件定義
CONDITIONS = {
    '入力疑義': {
        'priority': 1,
        'description': 'V, D, Aが6ヶ月間すべて同じ値',
        'raw_conditions': {
            'flag_constant_6m': 'TRUE',
        },
        'logic': 'flag_constant_6m == TRUE'
    },

    '上昇加速': {
        'priority': 1,
        'description': '上昇トレンド中に大きな変化で加速',
        'raw_conditions': {
            'trend_recent': ['上昇', '急上昇', '連続上昇'],
            'trend_base': ['上昇中'],
            'change_tag': '変化大',
            '|E_slope_6|': '> 0.5',
        },
        'logic': None  # 後で構築
    },

    '低下加速': {
        'priority': 1,
        'description': '低下トレンド中に大きな変化で加速',
        'raw_conditions': {
            'trend_recent': ['下降', '急落', '連続下降'],
            'trend_base': ['低下中'],
            'change_tag': '変化大',
            '|E_slope_6|': '> 0.5',
        },
        'logic': None
    },

    '上昇継続': {
        'priority': 2,
        'description': '上昇トレンドが継続',
        'raw_conditions': {
            'trend_recent': ['上昇', '急上昇', '連続上昇', '横ばい'],
            'trend_base': ['上昇中'],
            'change_tag': 'not 変化大',
            '|E_slope_6|': '> 0.5',
            'E_delta_1': '>= 0',
        },
        'logic': None
    },

    '低下継続': {
        'priority': 2,
        'description': '低下トレンドが継続',
        'raw_conditions': {
            'trend_recent': ['下降', '急落', '連続下降', '横ばい'],
            'trend_base': ['低下中'],
            'change_tag': 'not 変化大',
            '|E_slope_6|': '> 0.5',
            'E_delta_1': '<= 0',
        },
        'logic': None
    },

    '復活': {
        'priority': 3,
        'description': '低下トレンドから大きく回復',
        'raw_conditions': {
            'trend_recent': ['上昇', '急上昇'],
            'trend_base': ['低下中'],
            'change_tag': '変化大',
            '|E_slope_6|': '> 0.5',
        },
        'logic': None
    },

    '悪化': {
        'priority': 3,
        'description': '上昇トレンドから大きく低下',
        'raw_conditions': {
            'trend_recent': ['下降', '急落'],
            'trend_base': ['上昇中'],
            'change_tag': '変化大',
            '|E_slope_6|': '> 0.5',
        },
        'logic': None
    },

    '回復': {
        'priority': 4,
        'description': '低下トレンドから回復',
        'raw_conditions': {
            'trend_recent': ['上昇', '急上昇'],
            'trend_base': ['低下中'],
            'change_tag': 'not 変化大',
            '|E_slope_6|': '> 0.5',
        },
        'logic': None
    },

    '低下危機': {
        'priority': 4,
        'description': '上昇トレンドから低下',
        'raw_conditions': {
            'trend_recent': ['下降', '急落'],
            'trend_base': ['上昇中'],
            'change_tag': 'not 変化大',
            '|E_slope_6|': '> 0.5',
        },
        'logic': None
    },

    '上昇期待': {
        'priority': 5,
        'description': '安定状態から上昇の兆し',
        'raw_conditions': {
            'trend_recent': ['上昇', '急上昇', '連続上昇'],
            'trend_base': ['安定'],
            'E_delta_1': '> 1.0',
        },
        'logic': None
    },

    '低下警戒': {
        'priority': 5,
        'description': '安定状態から低下の兆し',
        'raw_conditions': {
            'trend_recent': ['下降', '急落', '連続下降'],
            'trend_base': ['安定'],
            'E_delta_1': '< -1.0',
        },
        'logic': None
    },

    '低下懸念': {
        'priority': 6,
        'description': '上昇トレンド中だが横ばいでマイナス変化',
        'raw_conditions': {
            'trend_recent': ['横ばい'],
            'trend_base': ['上昇中'],
            'E_delta_1': '< 0',
        },
        'logic': None
    },

    '回復期待': {
        'priority': 6,
        'description': '低下トレンド中だが横ばいでプラス変化',
        'raw_conditions': {
            'trend_recent': ['横ばい'],
            'trend_base': ['低下中'],
            'E_delta_1': '> 0',
        },
        'logic': None
    },

    '上昇': {
        'priority': 7,
        'description': '未評価または安定状態での上昇',
        'raw_conditions': {
            'trend_recent': ['上昇', '急上昇'],
            'trend_base': ['未評価', '安定'],
        },
        'logic': None
    },

    '下降': {
        'priority': 7,
        'description': '未評価または安定状態での下降',
        'raw_conditions': {
            'trend_recent': ['下降', '急落'],
            'trend_base': ['未評価', '安定'],
        },
        'logic': None
    },

    '横ばい': {
        'priority': 7,
        'description': '未評価または安定状態での横ばい',
        'raw_conditions': {
            'trend_recent': ['横ばい'],
            'trend_base': ['未評価', '安定'],
        },
        'logic': None
    },

    '安定維持': {
        'priority': 9,
        'description': '安定状態で変化も小さい',
        'raw_conditions': {
            'trend_recent': ['横ばい'],
            'trend_base': ['安定'],
            'change_tag': 'not 変化大',
        },
        'logic': None
    },
}


def build_complete_logic(trend_refined):
    """各trend_refinedの完全な論理式を構築"""
    cond = CONDITIONS[trend_refined]
    raw_cond = cond['raw_conditions']

    parts = []

    # flag_constant_6m
    if 'flag_constant_6m' in raw_cond:
        parts.append(f"flag_constant_6m == {raw_cond['flag_constant_6m']}")
        return " AND ".join(parts)

    # trend_recent
    if 'trend_recent' in raw_cond:
        tr_cond = expand_trend_recent(raw_cond['trend_recent'])
        if tr_cond:
            parts.append(tr_cond)

    # trend_base
    if 'trend_base' in raw_cond:
        tb_cond = expand_trend_base(raw_cond['trend_base'])
        if tb_cond:
            parts.append(tb_cond)

    # change_tag
    if 'change_tag' in raw_cond:
        ct_cond = expand_change_tag(raw_cond['change_tag'])
        if ct_cond:
            parts.append(ct_cond)

    # |E_slope_6|
    if '|E_slope_6|' in raw_cond:
        parts.append(f"|E_slope_6| {raw_cond['|E_slope_6|']}")

    # E_delta_1
    if 'E_delta_1' in raw_cond:
        parts.append(f"E_delta_1 {raw_cond['E_delta_1']}")

    return " AND ".join(parts)


def create_markdown_matrix():
    """Markdown形式で詳細マトリクスを作成"""

    # 全条件の論理式を構築
    for trend_refined in CONDITIONS:
        CONDITIONS[trend_refined]['logic'] = build_complete_logic(trend_refined)

    # Markdownファイルを生成
    md_content = """# trend_refined 判定条件マトリクス（生指標版）

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
| BIG_CHANGE_PERSONAL_Z | 2.0 | 個人内変化大の閾値（2σ） |
| TREND_DELTA | 1.0 | 期待・警戒の閾値 |

## 判定条件

"""

    # Priority順にソート
    sorted_conditions = sorted(CONDITIONS.items(), key=lambda x: (x[1]['priority'], x[0]))

    for trend_refined, cond in sorted_conditions:
        md_content += f"\n### Priority {cond['priority']}: {trend_refined}\n\n"
        md_content += f"**説明**: {cond['description']}\n\n"
        md_content += "**判定条件**:\n```\n"
        md_content += cond['logic']
        md_content += "\n```\n"

        # 使用指標のリスト
        indicators = set()
        logic = cond['logic']
        if 'E_delta_1' in logic:
            indicators.add('E_delta_1')
        if 'E_delta_1_prev' in logic:
            indicators.add('E_delta_1_prev')
        if 'E_slope_6' in logic:
            indicators.add('E_slope_6')
        if 'E_slope_6_std_12' in logic:
            indicators.add('E_slope_6_std_12')
        if 'E_std_12' in logic:
            indicators.add('E_std_12')
        if 'flag_constant_6m' in logic:
            indicators.add('flag_constant_6m')
        if 'データ件数' in logic:
            indicators.add('データ件数（履歴月数）')

        md_content += f"\n**使用指標**: {', '.join(sorted(indicators))}\n"
        md_content += "\n---\n"

    # ファイルに保存
    with open('trend_refined_raw_indicators.md', 'w', encoding='utf-8') as f:
        f.write(md_content)

    print("✓ 生指標版マトリクスを作成しました: trend_refined_raw_indicators.md")

    return md_content


def create_excel_matrix():
    """Excel形式でも出力"""

    rows = []
    for trend_refined in sorted(CONDITIONS.keys(), key=lambda x: (CONDITIONS[x]['priority'], x)):
        cond = CONDITIONS[trend_refined]

        row = {
            'Priority': cond['priority'],
            'trend_refined': trend_refined,
            '説明': cond['description'],
            '判定条件（完全な論理式）': build_complete_logic(trend_refined),
        }

        rows.append(row)

    df = pd.DataFrame(rows)

    # Excelに保存
    with pd.ExcelWriter('trend_refined_raw_indicators.xlsx', engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='生指標条件', index=False)

        workbook = writer.book
        worksheet = writer.sheets['生指標条件']

        # 列幅調整
        worksheet.set_column('A:A', 10)
        worksheet.set_column('B:B', 15)
        worksheet.set_column('C:C', 35)
        worksheet.set_column('D:D', 120)

        # ヘッダー書式
        header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#4472C4',
            'font_color': 'white',
            'border': 1,
            'text_wrap': True,
            'valign': 'vcenter'
        })

        for col_num, value in enumerate(df.columns.values):
            worksheet.write(0, col_num, value, header_format)

        # テキスト折り返し
        wrap_format = workbook.add_format({'text_wrap': True, 'valign': 'top'})
        for row_num in range(1, len(df) + 1):
            worksheet.write(row_num, 3, df.iloc[row_num - 1]['判定条件（完全な論理式）'], wrap_format)

    print("✓ 生指標版マトリクス（Excel）を作成しました: trend_refined_raw_indicators.xlsx")


if __name__ == "__main__":
    # Markdown版を作成
    create_markdown_matrix()

    # Excel版も作成
    create_excel_matrix()
