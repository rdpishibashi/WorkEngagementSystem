#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playbook プロジェクトの残りのファイルを5階層に対応させるスクリプト

we_playbook.py, we_org_analyzer.py, we_sensitivity.py を更新
"""
import re
from pathlib import Path

def update_file_constants(file_path):
    """ファイルの定数定義を更新"""
    print(f"\n更新中: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # パターン1: SECTION_COL = "__section__" 形式
    if '__section__' in content:
        pattern1 = r'(SECTION_COL\s*=\s*"__section__"\s*\nGROUP_COL\s*=\s*"__group__")'
        replacement1 = '''DIVISION_COL = "__division__"  # Empty - not used in analysis
DEPARTMENT_COL = "__department__"  # Previously "section"
SECTION_COL = "__section__"  # Previously "group" or "tech_group"
TEAM_COL = "__team__"  # Empty - not used in analysis
PROJECT_COL = "__project__"  # Previously "project_group"'''

        content = re.sub(pattern1, replacement1, content)

    # パターン2: SECTION_COL = "section" 形式
    elif 'SECTION_COL = "section"' in content:
        pattern2 = r'(SECTION_COL\s*=\s*"section"\s*\nGROUP_COL\s*=\s*"group")'
        replacement2 = '''DIVISION_COL = "division"  # Empty - not used in analysis
DEPARTMENT_COL = "department"  # Previously "section"
SECTION_COL = "section"  # Previously "group" or "tech_group"
TEAM_COL = "team"  # Empty - not used in analysis
PROJECT_COL = "project"  # Previously "project_group"'''

        content = re.sub(pattern2, replacement2, content)

    # グループ化ロジックの更新: SECTION_COL → DEPARTMENT_COL, GROUP_COL → SECTION_COL
    # _add_z 関数呼び出しを更新
    content = re.sub(
        r'_add_z\(\[WAVE_COL,\s*SECTION_COL\],\s*"section"\)',
        '_add_z([WAVE_COL, DEPARTMENT_COL], "section")',
        content
    )
    content = re.sub(
        r'_add_z\(\[WAVE_COL,\s*GROUP_COL\],\s*"group"\)',
        '_add_z([WAVE_COL, SECTION_COL], "group")',
        content
    )

    # .groupby([WAVE_COL, SECTION_COL, GROUP_COL], ...) を更新
    content = re.sub(
        r'\.groupby\(\[WAVE_COL,\s*SECTION_COL,\s*GROUP_COL\]',
        '.groupby([WAVE_COL, DEPARTMENT_COL, SECTION_COL]',
        content
    )

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✓ {file_path.name} を更新しました")
        return True
    else:
        print(f"  - {file_path.name} は変更不要でした")
        return False

def main():
    playbook_dir = Path("/home/user/WorkEngagementSystem/Playbook")

    files_to_update = [
        playbook_dir / "we_playbook.py",
        playbook_dir / "we_org_analyzer.py",
        playbook_dir / "we_sensitivity.py"
    ]

    print("="*80)
    print("Playbook プロジェクトの5階層対応")
    print("="*80)

    updated_count = 0
    for file_path in files_to_update:
        if file_path.exists():
            if update_file_constants(file_path):
                updated_count += 1
        else:
            print(f"\nエラー: ファイルが見つかりません: {file_path}")

    print(f"\n{'='*80}")
    print(f"完了: {updated_count} ファイルを更新しました")
    print(f"{'='*80}")

if __name__ == "__main__":
    main()
