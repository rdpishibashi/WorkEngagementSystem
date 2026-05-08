# -*- coding: utf-8 -*-
"""
Create members_history sheet in MemberSS.xlsx.

Consolidates all historical member sheets (FY23, FY24, FY25, FY25Q3) into a single
members_history sheet. Does NOT include the current "members" sheet.

Schema mapping:
  FY23/FY24/FY25 (old):  section → department, tech_group → section, project_group → project
  FY25Q3 (new):          division, department, section, team, project (as-is)

left_date estimation:
  Based on the last FY sheet where the member appears.
  FY23 end = 2024-06, FY24 end = 2025-06, FY25 end = 2025-12, FY25Q3 end = 2026-03

Usage:
    python tools/create_members_history.py
"""

import pandas as pd
import numpy as np
from pathlib import Path
from copy import deepcopy

SS_DIR = Path(__file__).parent.parent / "SpreadSheet"
MEMBER_FILE = SS_DIR / "MemberSS.xlsx"

# Output columns
OUTPUT_COLUMNS = [
    "member_name", "name_kana", "mail_address",
    "division", "department", "section", "team", "project",
    "location", "alias", "grade", "leave",
    "left_date", "note"
]

# FY periods (sheet_name, end_date for left_date estimation)
FY_SHEETS = [
    ("members in FY23",   "2024-06"),
    ("members in FY24",   "2025-06"),
    ("members in FY25",   "2025-12"),
    ("members in FY25Q3", "2026-03"),
]


def read_and_normalize(sheet_name: str) -> pd.DataFrame:
    """Read a historical sheet and normalize to output schema."""
    df = pd.read_excel(MEMBER_FILE, sheet_name=sheet_name)

    if sheet_name == "members in FY25Q3":
        # New schema — columns already match
        result = pd.DataFrame({
            "member_name": df["member_name"],
            "name_kana": df["name_kana"],
            "mail_address": df["mail_address"],
            "division": df.get("division", ""),
            "department": df.get("department", ""),
            "section": df.get("section", ""),
            "team": df.get("team", ""),
            "project": df.get("project", ""),
            "grade": df.get("grade", ""),
            "leave": df.get("leave", ""),
            "note": df.get("note", ""),
        })
    else:
        # Old schema: section → department, tech_group → section, project_group → project
        result = pd.DataFrame({
            "member_name": df["member_name"],
            "name_kana": df["name_kana"],
            "mail_address": df["mail_address"],
            "division": "",
            "department": df.get("section", ""),       # old "section" = department level
            "section": df.get("tech_group", ""),        # old "tech_group" = section level
            "team": "",
            "project": df.get("project_group", ""),     # old "project_group" = project
            "grade": df.get("grade", ""),
            "leave": df.get("leave", ""),
            "note": df.get("note", ""),
        })

    result["source_sheet"] = sheet_name
    return result


def build_members_history() -> pd.DataFrame:
    """Build consolidated members_history from all historical sheets."""

    # Read all historical sheets
    all_records = []
    for sheet_name, _ in FY_SHEETS:
        df = read_and_normalize(sheet_name)
        all_records.append(df)
        print(f"  Read {sheet_name}: {len(df)} rows")

    combined = pd.concat(all_records, ignore_index=True)
    print(f"\n  Total records across all sheets: {len(combined)}")

    # Get unique members by mail_address, keeping the LATEST record
    # Sort by FY order (FY23 first, FY25Q3 last) so last occurrence = latest
    unique_members = {}
    last_seen_fy = {}  # mail_address → last FY sheet name

    for sheet_name, end_date in FY_SHEETS:
        sheet_df = combined[combined["source_sheet"] == sheet_name]
        for _, row in sheet_df.iterrows():
            addr = row["mail_address"]
            if pd.isna(addr):
                continue
            unique_members[addr] = row.to_dict()
            last_seen_fy[addr] = (sheet_name, end_date)

    print(f"  Unique members by mail_address: {len(unique_members)}")

    # Build final dataframe
    rows = []
    for addr, record in unique_members.items():
        sheet_name, end_date = last_seen_fy[addr]

        # Estimate left_date: if member is NOT in the latest sheet (FY25Q3),
        # use the end date of their last appearance
        left_date = ""
        if sheet_name != "members in FY25Q3":
            left_date = end_date

        rows.append({
            "member_name": record["member_name"],
            "name_kana": record["name_kana"],
            "mail_address": addr,
            "division": record["division"] if pd.notna(record["division"]) else "",
            "department": record["department"] if pd.notna(record["department"]) else "",
            "section": record["section"] if pd.notna(record["section"]) else "",
            "team": record["team"] if pd.notna(record["team"]) else "",
            "project": record["project"] if pd.notna(record["project"]) else "",
            "location": "",
            "alias": "",
            "grade": record["grade"] if pd.notna(record["grade"]) else "",
            "leave": record["leave"] if pd.notna(record["leave"]) else "",
            "left_date": left_date,
            "note": record["note"] if pd.notna(record["note"]) else "",
        })

    result_df = pd.DataFrame(rows, columns=OUTPUT_COLUMNS)

    # Sort: active (no left_date) first, then by department, then name
    result_df["_sort_left"] = result_df["left_date"].apply(lambda x: "9999" if x == "" else x)
    result_df = result_df.sort_values(["_sort_left", "department", "member_name"])
    result_df = result_df.drop(columns=["_sort_left"]).reset_index(drop=True)

    return result_df


def main():
    print("=" * 70)
    print("Creating members_history sheet in MemberSS.xlsx")
    print("=" * 70)

    history_df = build_members_history()

    # Summary
    active = history_df[history_df["left_date"] == ""]
    left = history_df[history_df["left_date"] != ""]

    print(f"\n  Result: {len(history_df)} unique members")
    print(f"  Still in FY25Q3 (no left_date): {len(active)}")
    print(f"  Left before FY25Q3 (has left_date): {len(left)}")

    if len(left) > 0:
        print(f"\n  Members with left_date:")
        for _, row in left.iterrows():
            print(f"    {row['member_name']:12s} | {row['department']:12s} | "
                  f"left_date={row['left_date']} | last_leave={row['leave']}")

    print(f"\n  Department breakdown (all members):")
    for dept, count in history_df["department"].value_counts().items():
        dept_str = dept if dept else "(empty)"
        print(f"    {dept_str}: {count}")

    # Write to MemberSS.xlsx
    print(f"\n  Writing 'members_history' sheet to {MEMBER_FILE}...")

    with pd.ExcelWriter(MEMBER_FILE, engine="openpyxl", mode="a",
                         if_sheet_exists="replace") as writer:
        history_df.to_excel(writer, sheet_name="members_history", index=False)

    print("  Done!")


if __name__ == "__main__":
    main()
