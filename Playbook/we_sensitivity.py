# -*- coding: utf-8 -*-
from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd
import argparse
import json

V_COL="vigor_rating"; D_COL="dedication_rating"; A_COL="absorption_rating"; E_COL="Engagement"
WAVE_COL="__wave__"; SECTION_COL="__section__"; GROUP_COL="__group__"; PERSON_COL="__person__"

def _safe_numeric(s): return pd.to_numeric(s, errors="coerce")

def _to_wave(df: pd.DataFrame) -> pd.Series:
    if {"year","month"}.issubset(df.columns):
        y = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
        m = pd.to_numeric(df["month"], errors="coerce").astype("Int64")
        return pd.Series([f"{int(yy)}-{int(mm):02d}" if pd.notna(yy) and pd.notna(mm) else np.nan
                          for yy, mm in zip(y, m)], index=df.index)
    elif "date" in df.columns:
        return pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m")
    else:
        raise RuntimeError("year/month または date が必要です。")

def _theil_sen_slope_window(y, max_len):
    arr = np.array(list(y), dtype=float); arr = arr[np.isfinite(arr)]
    if len(arr)==0: return 0.0
    if len(arr)>max_len: arr = arr[-max_len:]
    n=len(arr)
    if n<3: return float((arr[-1]-arr[0])/(n-1)) if n>=2 else 0.0
    slopes=[(arr[j]-arr[i])/(j-i) for i in range(n-1) for j in range(i+1,n)]
    return float(np.median(slopes)) if slopes else 0.0

def _rolling_momentum_last(y):
    arr=np.array(list(y), dtype=float); arr=arr[np.isfinite(arr)]; n=len(arr)
    if n<3: return 0.0
    recent=float(np.nanmean(arr[-3:]))
    prior=float(np.nanmean(arr[-6:-3])) if n>=6 else (float(np.nanmean(arr[:-3])) if n>3 else recent)
    return float(recent - prior)

def _iqr_last_window(y, win):
    arr=np.array(list(y), dtype=float); arr=arr[np.isfinite(arr)]
    if len(arr)==0: return float("nan")
    arr = arr[-win:] if len(arr)>=win else arr
    if len(arr)==0: return float("nan")
    return float(np.nanpercentile(arr,75)-np.nanpercentile(arr,25))

def add_section_group_zscores(df_in, metrics):
    df=df_in.copy()
    for c in metrics: df[c]=_safe_numeric(df[c])
    def z_apply(g, suffix):
        for c in metrics:
            mu, sd = g[c].mean(), g[c].std(ddof=0)
            g[f"{c}_z_{suffix}"] = 0.0 if (sd==0 or pd.isna(sd)) else (g[c]-mu)/sd
        return g
    df = df.groupby([WAVE_COL, SECTION_COL], group_keys=False).apply(lambda g: z_apply(g, "section"))
    df = df.groupby([WAVE_COL, GROUP_COL], group_keys=False).apply(lambda g: z_apply(g, "group"))
    return df

def add_multiscale_features(df_in):
    df=df_in.copy().sort_values([PERSON_COL, WAVE_COL])
    rows=[]
    for pid,g in df.groupby(PERSON_COL, sort=False):
        e=g[E_COL].to_numpy(float)
        e_mean_6=[]; e_std_6=[]; e_iqr_6=[]; e_slope_12=[]; e_slope_6=[]; e_accel_6=[]; e_mom_3=[]; e_d1=[]; e_d1p=[]
        for i in range(len(g)):
            def _slope6(x): return _theil_sen_slope_window(x[:i+1], 6)
            def _slope12(x):return _theil_sen_slope_window(x[:i+1],12)
            def _delta1(x): return float(x[i]-x[i-1]) if i>=1 else 0.0
            ep=e[:i+1]
            e_mean_6.append(float(np.nanmean(ep[-6:]))) 
            e_std_6.append(float(np.nanstd(ep[-6:], ddof=0)))
            e_iqr_6.append(_iqr_last_window(ep,6))
            s12=_slope12(e); e_slope_12.append(s12)
            s6=_slope6(e);   e_slope_6.append(s6)
            e_accel_6.append(float(s6 - (e_slope_6[-1] if len(e_slope_6)>0 else s6)))
            e_mom_3.append(_rolling_momentum_last(ep))
            e_d1.append(_delta1(e)); e_d1p.append(float(e[i-1]-e[i-2])) if i>=2 else e_d1p.append(0.0)
        tmp=g[[PERSON_COL, WAVE_COL]].copy()
        tmp["E_mean_6"]=e_mean_6; tmp["E_std_6"]=e_std_6; tmp["E_iqr_6"]=e_iqr_6
        tmp["E_slope_12"]=e_slope_12; tmp["E_slope_6"]=e_slope_6; tmp["E_accel_6"]=e_accel_6
        tmp["E_momentum_3"]=e_mom_3; tmp["E_delta_1"]=e_d1; tmp["E_delta_1_prev"]=e_d1p
        rows.append(tmp)
    feats=pd.concat(rows, ignore_index=True) if rows else df[[PERSON_COL, WAVE_COL]].copy()
    return df.merge(feats, on=[PERSON_COL, WAVE_COL], how="left")

def tune_thresholds_global(use: pd.DataFrame, strict_high: float=0.90, strict_low: float=0.10):
    grouped = use.groupby([WAVE_COL, GROUP_COL])
    med = lambda col: grouped[col].median()
    def qpair(s, pos=True):
        s=s.replace([np.inf,-np.inf], np.nan).dropna()
        if len(s)==0: return (1.0,0.5) if pos else (-1.0,-0.5)
        if pos: return float(s.quantile(0.75)), float(s.quantile(strict_high if len(s)>=20 else 0.75))
        else:   return float(s.quantile(0.25)), float(s.quantile(strict_low  if len(s)>=20 else 0.25))
    rows=[]
    metrics=["E_momentum_3","E_slope_6","E_delta_1","E_accel_6","E_std_6","E_iqr_6"]
    for m in metrics:
        s = med(m)
        qbad, qbad_str = qpair(s, pos=False)
        qgood,qgood_str= qpair(s, pos=True)
        rows.append([m, qbad, qgood, qbad_str, qgood_str, len(s)])
    thr = pd.DataFrame(rows, columns=["Metric","Q1_or_bad","Q3_or_good","Pbad_strict","Pgood_strict","N_groups*waves"])
    return thr

def label_trend_series(use: pd.DataFrame, thr: pd.DataFrame, strict_high: float, strict_low: float):
    bands = {}
    for _,r in thr.iterrows():
        m=r["Metric"]
        bands[f"{m}_Q1"]=r["Q1_or_bad"]; bands[f"{m}_Q3"]=r["Q3_or_good"]
        bands[f"{m}_P{int(strict_low*100)}"]=r["Pbad_strict"]; bands[f"{m}_P{int(strict_high*100)}"]=r["Pgood_strict"]
    s6=use["E_slope_6"]; d1=use["E_delta_1"]; m3=use["E_momentum_3"]; a6=use["E_accel_6"]; d1_prev=use.get("E_delta_1_prev", pd.Series(0, index=use.index))
    base_imp = (m3>bands["E_momentum_3_Q3"]) | (s6>bands["E_slope_6_Q3"])
    base_wor = (m3<bands["E_momentum_3_Q1"]) | (s6<bands["E_slope_6_Q1"])
    def hyst(g):
        i=base_imp.loc[g.index].to_numpy(); w=base_wor.loc[g.index].to_numpy()
        out=[]
        for k in range(len(g)):
            imp2 = i[max(0,k-1):k+1].sum()>=2
            wor2 = w[max(0,k-1):k+1].sum()>=2
            t="安定"
            if imp2 and not wor2: t="上昇中"
            if wor2 and not imp2: t="低下中"
            out.append(t)
        return pd.Series(out, index=g.index)
    base = use.sort_values([PERSON_COL, WAVE_COL]).groupby(PERSON_COL, group_keys=False).apply(hyst)
    recent = np.where(d1>bands["E_delta_1_Q3"], "直近上昇", np.where(d1<bands["E_delta_1_Q1"], "直近下降", "直近横ばい"))
    up_strict   = (s6>=bands[f"E_slope_6_P{int(strict_high*100)}"]) & (d1>=bands[f"E_delta_1_P{int(strict_high*100)}"]) & (m3>=bands[f"E_momentum_3_P{int(strict_high*100)}"]) & (a6>=bands[f"E_accel_6_P{int(strict_high*100)}"])
    dn_strict   = (s6<=bands[f"E_slope_6_P{int(strict_low*100)}"])  & (d1<=bands[f"E_delta_1_P{int(strict_low*100)}"])  & (m3<=bands[f"E_momentum_3_P{int(strict_low*100)}"])  & (a6<=bands[f"E_accel_6_P{int(strict_low*100)}"])
    cont_up     = (s6>bands["E_slope_6_Q3"]) & (d1>bands["E_delta_1_Q3"])
    zero_hold   = (s6==0.0) & (d1==0.0)
    out=[]
    for b,r,idx in zip(base, recent, use.index):
        if (d1.loc[idx] > 0) and (d1_prev.loc[idx] <= 0):
            out.append("回復"); continue
        if (b=="低下中") and (d1.loc[idx] > 0) and (d1_prev.loc[idx] > 0):
            out.append("反転上昇傾向"); continue
        if b in ("上昇中","安定") and r=="直近上昇":
            if bool(up_strict.loc[idx]): out.append("上昇加速"); continue
            if bool(cont_up.loc[idx]):   out.append("上昇継続"); continue
            if (b=="上昇中" and bool(zero_hold.loc[idx])): out.append("安定維持"); continue
            out.append("上昇期待" if b=="安定" else "上昇継続"); continue
        if b=="上昇中" and r=="直近下降":
            if (d1.loc[idx] < 0) and (d1_prev.loc[idx] < 0): out.append("反転低下傾向")
            else: out.append("反落")
            continue
        if b=="低下中" and r=="直近下降":
            out.append("低下加速" if bool(dn_strict.loc[idx]) else "低下継続"); continue
        if b in ("上昇中","安定") and r=="直近横ばい":
            out.append("安定維持"); continue
        if b=="安定" and r=="直近下降":
            out.append("低下警戒"); continue
        out.append(b)
    return pd.Series(out, index=use.index)

def dept_wave_quantiles(use: pd.DataFrame, dept_q: float=0.75):
    dash_cols = ["mean_E_z_section","median_E_slope_6","median_E_delta_1","share_low_section","share_lowstreak_ge2","std_E_z_section","iqr_E"]
    use = use.sort_values([GROUP_COL, PERSON_COL, WAVE_COL])
    use["low_flag"] = use[f"{E_COL}_z_section"] <= -1.0
    def _streak(s):
        out=[]; c=0
        for v in s:
            if v: c+=1
            else: c=0
            out.append(c)
        return pd.Series(out, index=s.index)
    use["low_streak"]=use.groupby([GROUP_COL, PERSON_COL], group_keys=False)["low_flag"].apply(_streak).reset_index(drop=True)
    def agg(g):
        e=g[E_COL].to_numpy(float); ez=g[f"{E_COL}_z_section"].to_numpy(float)
        return pd.Series({
            "mean_E_z_section": float(np.nanmean(ez)),
            "share_low_section":  float(np.nanmean((ez<=-1.0).astype(float))),
            "share_lowstreak_ge2": float(np.nanmean((g["low_streak"]>=2).astype(float))),
            "std_E_z_section": float(np.nanstd(ez, ddof=0)),
            "iqr_E": float(np.nanpercentile(e,75)-np.nanpercentile(e,25)) if len(e)>0 else np.nan,
            "median_E_delta_1": float(np.nanmedian(g["E_delta_1"])),
            "median_E_slope_6": float(np.nanmedian(g["E_slope_6"])),
        })
    dash = use.groupby([WAVE_COL, SECTION_COL, GROUP_COL], as_index=False).apply(agg).reset_index(drop=True)
    Qlow=1.0-dept_q
    records=[]
    for w,g in dash.groupby(WAVE_COL):
        rec={"wave": w}
        for c in dash_cols:
            s=g[c].replace([np.inf,-np.inf], np.nan).dropna()
            if len(s)==0:
                rec[f"{c}_Qlow"]=np.nan; rec[f"{c}_Qhigh"]=np.nan
            else:
                rec[f"{c}_Qlow"]=float(s.quantile(Qlow))
                rec[f"{c}_Qhigh"]=float(s.quantile(dept_q))
        records.append(rec)
    return pd.DataFrame(records).sort_values("wave")

def run(input_path: Path, output_path: Path, strict_list, deptq_list):
    xl = pd.ExcelFile(input_path)
    sheet = "rating2" if "rating2" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet)
    df[WAVE_COL]=_to_wave(df)
    df[SECTION_COL]=df["section"]
    gr=df["group"].astype(str).str.strip()
    df[GROUP_COL]=np.where(gr.eq("")|gr.str.lower().eq("nan"), df["section"], df["group"])
    if "mail_address" in df.columns: df[PERSON_COL]=df["mail_address"]
    elif "name" in df.columns: df[PERSON_COL]=df["name"]
    else: raise RuntimeError("個人識別列（mail_address または name）が必要です。")
    for c in [V_COL,D_COL,A_COL]: df[c]=pd.to_numeric(df[c], errors="coerce")
    df[E_COL]=df[[V_COL,D_COL,A_COL]].sum(axis=1, min_count=3)

    use=df[[PERSON_COL,"name","project","grade",SECTION_COL,GROUP_COL,WAVE_COL,V_COL,D_COL,A_COL,E_COL]].copy()
    use=add_section_group_zscores(use,[V_COL,D_COL,A_COL,E_COL])
    use=add_multiscale_features(use)
    latest_wave = use[WAVE_COL].max()

    tags = [f"P{int(round(sh*100))}" for sh in strict_list]
    sl_list = [round(1.0-sh, 6) for sh in strict_list]
    thr_map = {}
    for sh,sl,tag in zip(strict_list, sl_list, tags):
        thr_map[tag] = tune_thresholds_global(use, sh, sl)

    metrics = ["E_momentum_3","E_slope_6","E_delta_1","E_accel_6","E_std_6","E_iqr_6"]

    import xlsxwriter
    with pd.ExcelWriter(str(output_path), engine="xlsxwriter") as w:
        # Params
        pd.DataFrame({"param":["STRICT_LIST","DEPTQ_LIST"],
                      "values":[json.dumps(strict_list), json.dumps(deptq_list)]}).to_excel(w, sheet_name="Params", index=False)

        # GlobalBands
        rows = []
        for label in ["Q1_or_bad", "Q3_or_good"]:
            for tag in tags:
                thr = thr_map[tag]
                rec = [label, tag]
                for m in metrics:
                    rec.append(float(thr.loc[thr["Metric"]==m, label].values[0]))
                rows.append(rec)
        for tag, sh, sl in zip(tags, strict_list, sl_list):
            thr = thr_map[tag]
            lab = f"P{int(round(sl*100))}_bad_strict"
            rec=[lab, tag] + [float(thr.loc[thr["Metric"]==m, "Pbad_strict"].values[0]) for m in metrics]
            rows.append(rec)
        for tag, sh, sl in zip(tags, strict_list, sl_list):
            thr = thr_map[tag]
            lab = f"P{int(round(sh*100))}_good_strict"
            rec=[lab, tag] + [float(thr.loc[thr["Metric"]==m, "Pgood_strict"].values[0]) for m in metrics]
            rows.append(rec)
        thr_ref = thr_map[tags[0]]
        rec=["N_groups*waves",""] + [int(thr_ref.loc[thr_ref["Metric"]==m, "N_groups*waves"].values[0]) for m in metrics]
        rows.append(rec)
        gb = pd.DataFrame(rows, columns=["Metric","Pxx"]+metrics)
        gb.to_excel(w, sheet_name="GlobalBands", index=False)
        wb = w.book; ws = w.sheets["GlobalBands"]
        fmt_2dec = wb.add_format({"num_format":"0.00"})
        for col in range(2, 2+len(metrics)):
            ws.set_column(col, col, None, fmt_2dec)

        # IImpact_Indiv
        ordered_labels = [
            "上昇期待","上昇継続","上昇加速","回復","反転上昇傾向",
            "低下警戒","低下継続","低下加速","反落","反転低下傾向","安定維持"
        ]
        counts_all={}; counts_latest={}
        for tag, sh, sl in zip(tags, strict_list, sl_list):
            thr = thr_map[tag]
            labs = label_trend_series(use, thr, sh, sl)
            counts_all[tag] = labs.value_counts(dropna=False)
            counts_latest[tag] = labs[use[WAVE_COL]==latest_wave].value_counts(dropna=False)

        header1 = ["Trend_B_refined"] + ["count_all"]*len(tags) + ["count_latest"]*len(tags)
        header2 = ["Pxx"] + tags + tags
        imp_rows=[header1, header2]
        for lab in ordered_labels:
            row=[lab]
            for tag in tags: row.append(int(counts_all[tag].get(lab,0)))
            for tag in tags: row.append(int(counts_latest[tag].get(lab,0)))
            imp_rows.append(row)
        imp_df = pd.DataFrame(imp_rows)
        imp_df.to_excel(w, sheet_name="IImpact_Indiv", header=False, index=False)

        # Change_Indiv_Pxx
        base_idx = int(np.argmin([abs(x-0.90) for x in strict_list]))
        base_tag = tags[base_idx]; base_sh = strict_list[base_idx]; base_sl = sl_list[base_idx]
        base_thr = thr_map[base_tag]
        base_labels = label_trend_series(use, base_thr, base_sh, base_sl)
        latest_idx = (use[WAVE_COL]==latest_wave)

        for tag, sh, sl in zip(tags, strict_list, sl_list):
            thr = thr_map[tag]
            alt_labels = label_trend_series(use, thr, sh, sl)
            sub = use.loc[latest_idx].copy()
            alt_latest = alt_labels.reindex(sub.index)
            base_latest = base_labels.reindex(sub.index)
            delta = pd.DataFrame({
                "person": sub[PERSON_COL].values,
                "name":   sub["name"].values,
                "group":  sub[GROUP_COL].values,
                "section":sub[SECTION_COL].values,
                "wave":   [latest_wave]*len(sub),
                "base":   base_latest.values,
                "alt":    alt_latest.values
            })
            delta = delta[delta["base"]!=delta["alt"]]
            delta.to_excel(w, sheet_name=f"Change_Indiv_{tag}", index=False)

        # DeptWaveQ_Qxx
        for dq in deptq_list:
            dwq = dept_wave_quantiles(use, dq)
            sheet_name = f"DeptWaveQ_Q{int(round(dq*100))}"
            dwq.to_excel(w, sheet_name=sheet_name, index=False)
            # 数値フォーマットを 0.00 に設定（wave列以外）
            ws_dw = w.sheets[sheet_name]
            fmt_2dec_dw = wb.add_format({"num_format":"0.00"})
            ncols = len(dwq.columns)
            if ncols > 1:
                ws_dw.set_column(1, ncols-1, None, fmt_2dec_dw)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-i","--input", type=str, default="workengagement.xlsx")
    ap.add_argument("-o","--output", type=str, default="sensitivity.xlsx")
    ap.add_argument("--strict_list", nargs="+", type=float, default=[0.95, 0.90, 0.85])
    ap.add_argument("--deptq_list", nargs="+", type=float, default=[0.75, 0.80])
    args = ap.parse_args()
    inp = Path(args.input)
    if not inp.exists(): inp = Path("/mnt/data")/args.input
    if not inp.exists(): raise FileNotFoundError(f"入力ファイルが見つかりません: {args.input}")
    run(inp, Path(args.output), args.strict_list, args.deptq_list)
    print("Done")

if __name__ == "__main__":
    main()
