# -*- coding: utf-8 -*-
"""
Verification script for Admin GAS changes.

Simulates and verifies the following GAS functions using local Excel exports:
1. syncToEngagementMasterAll() — what months would be synced
2. repairEngagementMasterAllOrganization() — how current_* would change
3. updatePersonMasterSheet() / updatePersonMasterAllSheet() — person_master output

Usage:
    python tools/verify_admin_changes.py
"""

import pandas as pd
import numpy as np
from pathlib import Path

SS_DIR = Path(__file__).parent.parent / "SpreadSheet"

def load_excel(name, sheet="rating2"):
    path = SS_DIR / name
    if not path.exists():
        print(f"  [SKIP] {name} not found")
        return None
    return pd.read_excel(path, sheet_name=sheet)


def verify_sync():
    """Simulate syncToEngagementMasterAll(): identify months to append."""
    print("=" * 70)
    print("1. syncToEngagementMasterAll() — Sync Coverage Analysis")
    print("=" * 70)

    all_df = load_excel("EngagementMasterAll.xlsx", "rating2")
    ss_df = load_excel("EngagementMasterSS.xlsx", "rating2")

    if all_df is None or ss_df is None:
        return

    all_months = set(zip(all_df["year"].astype(int), all_df["month"].astype(int)))
    ss_months = set(zip(ss_df["year"].astype(int), ss_df["month"].astype(int)))

    new_months = sorted(ss_months - all_months)
    overlap_months = sorted(all_months & ss_months)
    all_only = sorted(all_months - ss_months)

    print(f"\n  EngagementMasterAll : {len(all_df)} rows, {len(all_months)} months "
          f"({min(all_months)} ~ {max(all_months)})")
    print(f"  EngagementMasterSS  : {len(ss_df)} rows, {len(ss_months)} months "
          f"({min(ss_months)} ~ {max(ss_months)})")
    print(f"\n  Months in All only (not in SS) : {len(all_only)}")
    for ym in all_only:
        count = len(all_df[(all_df["year"] == ym[0]) & (all_df["month"] == ym[1])])
        print(f"    {ym[0]}-{ym[1]:02d} : {count} rows")
    print(f"\n  Overlap months (already in All) : {len(overlap_months)}")
    for ym in overlap_months:
        count_all = len(all_df[(all_df["year"] == ym[0]) & (all_df["month"] == ym[1])])
        count_ss = len(ss_df[(ss_df["year"] == ym[0]) & (ss_df["month"] == ym[1])])
        match = "OK" if count_all == count_ss else f"DIFF (All={count_all}, SS={count_ss})"
        print(f"    {ym[0]}-{ym[1]:02d} : {match}")
    print(f"\n  NEW months to append : {len(new_months)}")
    new_row_count = 0
    for ym in new_months:
        count = len(ss_df[(ss_df["year"] == ym[0]) & (ss_df["month"] == ym[1])])
        new_row_count += count
        print(f"    {ym[0]}-{ym[1]:02d} : {count} rows")
    print(f"\n  Total rows to append: {new_row_count}")

    # Column compatibility check
    all_cols = set(all_df.columns)
    ss_cols = set(ss_df.columns)
    if all_cols != ss_cols:
        print(f"\n  WARNING: Column mismatch!")
        print(f"    In All only: {all_cols - ss_cols}")
        print(f"    In SS only:  {ss_cols - all_cols}")
    else:
        print(f"\n  Column check: OK ({len(all_cols)} columns match)")


def verify_org_repair():
    """Simulate repairEngagementMasterAllOrganization(): show what would change."""
    print("\n" + "=" * 70)
    print("2. repairEngagementMasterAllOrganization() — Organization Repair")
    print("=" * 70)

    all_df = load_excel("EngagementMasterAll.xlsx", "rating2")
    member_df = load_excel("MemberSS.xlsx", "members")

    if all_df is None or member_df is None:
        return

    # Build member lookup
    members = {}
    for _, m in member_df.iterrows():
        addr = m.get("mail_address")
        if pd.notna(addr):
            members[addr] = {
                "name": m.get("alternative_name") if pd.notna(m.get("alternative_name")) else m.get("member_name"),
                "division": m.get("division", ""),
                "department": m.get("department", ""),
                "section": m.get("section", ""),
                "team": m.get("team", ""),
                "project": m.get("project", ""),
                "grade": m.get("grade", ""),
                "leave": m.get("leave", ""),
            }

    # Simulate updateAttributes
    changes = {"updated": 0, "cleared_leave": 0, "cleared_unknown": 0, "unchanged": 0}
    sample_changes = []

    org_cols = ["current_division", "current_department", "current_section",
                "current_team", "current_project"]

    for idx, row in all_df.iterrows():
        addr = row.get("mail_address")
        member = members.get(addr)

        if member:
            leave_val = member["leave"]
            if pd.notna(leave_val) and str(leave_val).strip().lower() in ("y", "leave"):
                # Would clear all org fields
                current_vals = [row.get(c, "") for c in org_cols]
                if any(pd.notna(v) and str(v).strip() != "" for v in current_vals):
                    changes["cleared_leave"] += 1
                else:
                    changes["unchanged"] += 1
            else:
                # Would update to current member values
                diff = False
                for col, mkey in [("current_department", "department"),
                                  ("current_section", "section"),
                                  ("current_division", "division")]:
                    old_val = str(row.get(col, "")) if pd.notna(row.get(col)) else ""
                    new_val = str(member.get(mkey, "")) if pd.notna(member.get(mkey)) else ""
                    if old_val != new_val:
                        diff = True
                        if len(sample_changes) < 10:
                            sample_changes.append({
                                "name": row.get("name"),
                                "col": col,
                                "old": old_val,
                                "new": new_val,
                                "year_month": f"{int(row['year'])}-{int(row['month']):02d}"
                            })
                if diff:
                    changes["updated"] += 1
                else:
                    changes["unchanged"] += 1
        else:
            # Unknown member — would clear org fields
            current_vals = [row.get(c, "") for c in org_cols]
            if any(pd.notna(v) and str(v).strip() != "" for v in current_vals):
                changes["cleared_unknown"] += 1
            else:
                changes["unchanged"] += 1

    print(f"\n  Total rows in All: {len(all_df)}")
    print(f"  Rows to update (org changed)  : {changes['updated']}")
    print(f"  Rows to clear (leave/retired) : {changes['cleared_leave']}")
    print(f"  Rows to clear (not in MemberSS): {changes['cleared_unknown']}")
    print(f"  Rows unchanged                : {changes['unchanged']}")

    if sample_changes:
        print(f"\n  Sample changes (first {len(sample_changes)}):")
        for sc in sample_changes:
            print(f"    {sc['name']} ({sc['year_month']}) {sc['col']}: "
                  f"'{sc['old']}' → '{sc['new']}'")


def verify_person_master():
    """Simulate writePersonMasterSheet(): show expected person_master output."""
    print("\n" + "=" * 70)
    print("3. updatePersonMasterSheet() — Person Master Generation")
    print("=" * 70)

    member_df = load_excel("MemberSS.xlsx", "members")
    ss_df = load_excel("EngagementMasterSS.xlsx", "rating2")
    all_df = load_excel("EngagementMasterAll.xlsx", "rating2")

    if member_df is None:
        return

    # Build last_measured_date from both sources
    last_measured_ss = {}
    last_measured_all = {}

    if ss_df is not None:
        for addr, group in ss_df.groupby("mail_address"):
            dates = pd.to_datetime(group["date"], errors="coerce")
            valid = dates.dropna()
            if len(valid) > 0:
                last_measured_ss[addr] = valid.max()

    if all_df is not None:
        for addr, group in all_df.groupby("mail_address"):
            dates = pd.to_datetime(group["date"], errors="coerce")
            valid = dates.dropna()
            if len(valid) > 0:
                last_measured_all[addr] = valid.max()

    # Build person_master
    rows = []
    for _, m in member_df.iterrows():
        addr = m.get("mail_address")
        if pd.isna(addr):
            continue

        leave_val = m.get("leave", "")
        if pd.isna(leave_val) or str(leave_val).strip() == "":
            status = "active"
        elif str(leave_val).strip().lower() == "y":
            status = "leave (legacy Y — needs reclassification)"
        elif str(leave_val).strip().lower() == "leave":
            status = "leave"
        elif str(leave_val).strip().lower() == "absence":
            status = "absence"
        else:
            status = f"unknown ({leave_val})"

        is_active = status == "active"
        name = m.get("alternative_name") if pd.notna(m.get("alternative_name")) else m.get("member_name")

        rows.append({
            "mail_address": addr,
            "name": name,
            "department": m.get("department", ""),
            "section": m.get("section", ""),
            "grade": m.get("grade", ""),
            "status": status,
            "is_active": is_active,
            "last_measured_ss": last_measured_ss.get(addr, ""),
            "last_measured_all": last_measured_all.get(addr, ""),
        })

    pm_df = pd.DataFrame(rows)

    # Summary
    active = pm_df[pm_df["is_active"] == True]
    inactive = pm_df[pm_df["is_active"] == False]

    print(f"\n  Total members: {len(pm_df)}")
    print(f"  Active:   {len(active)}")
    print(f"  Inactive: {len(inactive)}")

    print(f"\n  Status breakdown:")
    for status, count in pm_df["status"].value_counts().items():
        print(f"    {status}: {count}")

    print(f"\n  Active members by department:")
    if "department" in active.columns:
        for dept, count in active["department"].value_counts().items():
            dept_str = dept if pd.notna(dept) and str(dept).strip() else "(empty)"
            print(f"    {dept_str}: {count}")

    print(f"\n  Inactive members:")
    for _, row in inactive.iterrows():
        dept = row["department"] if pd.notna(row["department"]) and str(row["department"]).strip() else "(empty)"
        ss_date = str(row["last_measured_ss"])[:10] if row["last_measured_ss"] else "N/A"
        all_date = str(row["last_measured_all"])[:10] if row["last_measured_all"] else "N/A"
        print(f"    {row['name']:12s} | {dept:12s} | status={row['status']:10s} "
              f"| last(SS)={ss_date} | last(All)={all_date}")

    # Check for members with measurement data but not in MemberSS
    if ss_df is not None:
        ss_addrs = set(ss_df["mail_address"].dropna().unique())
        member_addrs = set(pm_df["mail_address"])
        orphans = ss_addrs - member_addrs
        if orphans:
            print(f"\n  WARNING: {len(orphans)} addresses in EngagementMasterSS but NOT in MemberSS:")
            for addr in sorted(orphans):
                name = ss_df[ss_df["mail_address"] == addr]["name"].iloc[0] if len(ss_df[ss_df["mail_address"] == addr]) > 0 else "?"
                print(f"    {addr} ({name})")

    if all_df is not None:
        all_addrs = set(all_df["mail_address"].dropna().unique())
        member_addrs = set(pm_df["mail_address"])
        orphans = all_addrs - member_addrs
        if orphans:
            print(f"\n  WARNING: {len(orphans)} addresses in EngagementMasterAll but NOT in MemberSS:")
            for addr in sorted(orphans):
                name = all_df[all_df["mail_address"] == addr]["name"].iloc[0] if len(all_df[all_df["mail_address"] == addr]) > 0 else "?"
                print(f"    {addr} ({name})")


if __name__ == "__main__":
    verify_sync()
    verify_org_repair()
    verify_person_master()
