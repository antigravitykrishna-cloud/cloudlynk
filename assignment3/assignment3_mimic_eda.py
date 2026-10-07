"""
Assignment 3: EDA Report + Standards Normalization on MIMIC-IV (demo v2.2)

Usage:  python assignment3_mimic_eda.py [MIMIC_DEMO_DIR] [OUT_DIR]   (or set MIMIC_DIR below; also runs in Jupyter)
Outputs: figures (PNG), tables (CSV) and results.json in OUT_DIR; a printed log.
Cohort : ALL ICU stays in icu/icustays.csv.gz (140 stays, 128 admissions, 100 patients).
Labs   : labevents rows for the stay's hadm_id with charttime inside [intime, outtime].
Vitals : chartevents rows for the stay_id.
"""
import sys, os, json, math
import numpy as np
import pandas as pd
import matplotlib
if "ipykernel" not in sys.modules: matplotlib.use("Agg")   # no GUI needed when run as a script
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

# ---- Paths --------------------------------------------------------------
# Set MIMIC_DIR to the folder that contains hosp/ and icu/ (the unzipped
# mimic-iv-clinical-database-demo-2.2 folder). Leave None to auto-detect.
MIMIC_DIR = None
OUT_DIR = None            # default: "assignment3_outputs" next to where you run it

IN_NOTEBOOK = "ipykernel" in sys.modules
_args = [] if IN_NOTEBOOK else sys.argv[1:]     # notebooks put kernel args in sys.argv
if len(_args) > 0: MIMIC_DIR = _args[0]
if len(_args) > 1: OUT_DIR = _args[1]

def _find_root():
    here = [os.getcwd()]
    try: here.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError: pass
    home = os.path.expanduser("~")
    bases = here + [os.path.join(home, d) for d in ("Downloads", "Desktop", "Documents")]
    for b in bases:
        for cand in (b, os.path.join(b, "mimic-iv-clinical-database-demo-2.2"),
                     os.path.join(b, "mimic-iv-clinical-database-demo-2.2_1")):
            if os.path.exists(os.path.join(cand, "hosp", "patients.csv.gz")): return cand
        if os.path.isdir(b):
            for n in os.listdir(b):
                c = os.path.join(b, n)
                if n.lower().startswith("mimic-iv") and os.path.exists(os.path.join(c, "hosp", "patients.csv.gz")):
                    return c
                # zip extracted into a folder that wraps another folder
                if os.path.isdir(c) and n.lower().startswith("mimic-iv"):
                    for m in os.listdir(c):
                        cc = os.path.join(c, m)
                        if os.path.exists(os.path.join(cc, "hosp", "patients.csv.gz")): return cc
    return None

ROOT = MIMIC_DIR or _find_root()
if not ROOT or not os.path.exists(os.path.join(ROOT, "hosp", "patients.csv.gz")):
    raise SystemExit("Cannot find MIMIC-IV demo data. Unzip the download and set MIMIC_DIR at the top of "
                     "this file to the folder that contains the 'hosp' and 'icu' sub-folders, e.g. "
                     "MIMIC_DIR = r'C:\\Users\\you\\Downloads\\mimic-iv-clinical-database-demo-2.2'")
OUT = OUT_DIR or os.path.join(os.getcwd(), "assignment3_outputs")
os.makedirs(OUT, exist_ok=True)
print("Data folder:", ROOT, "\nOutput folder:", OUT)
R = {}                                    # results collected for the report
sns.set_theme(style="whitegrid")

def rd(p, **kw): return pd.read_csv(os.path.join(ROOT, p), **kw)
def save(name):
    plt.tight_layout(); plt.savefig(os.path.join(OUT, name), dpi=130)
    if IN_NOTEBOOK: plt.show()          # display inline for screenshots
    plt.close()

# ----------------------------------------------------------------------------
# Load
# ----------------------------------------------------------------------------
pat = rd("hosp/patients.csv.gz")
adm = rd("hosp/admissions.csv.gz", parse_dates=["admittime", "dischtime"])
icu = rd("icu/icustays.csv.gz", parse_dates=["intime", "outtime"])
dlab = rd("hosp/d_labitems.csv.gz")
ditem = rd("icu/d_items.csv.gz")
lab = rd("hosp/labevents.csv.gz", parse_dates=["charttime"])
ce = rd("icu/chartevents.csv.gz", parse_dates=["charttime"],
        usecols=["subject_id", "hadm_id", "stay_id", "charttime", "itemid", "valuenum"])

coh = icu.merge(adm[["hadm_id", "hospital_expire_flag"]], on="hadm_id").merge(
    pat[["subject_id", "gender", "anchor_age"]], on="subject_id")
R["cohort"] = dict(stays=len(coh), admissions=int(coh.hadm_id.nunique()),
                   patients=int(coh.subject_id.nunique()))
print("COHORT", R["cohort"])

# ----------------------------------------------------------------------------
# Variable definitions
# ----------------------------------------------------------------------------
VITALS = {220045: "HR", 220210: "RR", 220277: "SpO2", 220179: "SBP", 220181: "MAP",
          223762: "Temp_C", 223761: "Temp_F"}
LABS = {50912: "Creatinine", 51006: "BUN", 50971: "Potassium", 50983: "Sodium",
        50882: "Bicarbonate", 50931: "Glucose", 51222: "Hemoglobin", 51301: "WBC",
        51265: "Platelets", 50813: "Lactate"}
# sanity: itemids exist in dictionaries
assert set(VITALS) <= set(ditem.itemid) and set(LABS) <= set(dlab.itemid)

v = ce[ce.itemid.isin(VITALS)].dropna(subset=["valuenum"]).copy()
v["var"] = v.itemid.map(VITALS)
fmask = v["var"] == "Temp_F"
v.loc[fmask, "valuenum"] = (v.loc[fmask, "valuenum"] - 32) * 5 / 9   # F -> C
v.loc[fmask, "var"] = "Temp_C"
v = v[v.stay_id.isin(coh.stay_id)]

l = lab[lab.itemid.isin(LABS)].dropna(subset=["valuenum", "hadm_id"]).copy()
l["hadm_id"] = l.hadm_id.astype(int)
l = l.merge(coh[["stay_id", "hadm_id", "intime", "outtime"]], on="hadm_id")
l = l[(l.charttime >= l.intime) & (l.charttime <= l.outtime)].copy()
l["var"] = l.itemid.map(LABS)
print("vital rows", len(v), "| lab rows in ICU window", len(l))

# ----------------------------------------------------------------------------
# A1. Distributions (heart rate, creatinine)
# ----------------------------------------------------------------------------
hr = v[v["var"] == "HR"].valuenum
cr = l[l["var"] == "Creatinine"].valuenum
fig, ax = plt.subplots(2, 2, figsize=(11, 7))
sns.histplot(hr, bins=60, ax=ax[0, 0], color="C0"); ax[0, 0].set_title("Heart rate (bpm), raw")
sns.histplot(cr, bins=60, ax=ax[0, 1], color="C1"); ax[0, 1].set_title("Creatinine (mg/dL), raw")
sns.histplot(np.log(cr), bins=50, ax=ax[1, 1], color="C2"); ax[1, 1].set_title("log(Creatinine)")
sns.histplot(hr[(hr > 20) & (hr < 250)], bins=60, ax=ax[1, 0], color="C0"); ax[1, 0].set_title("Heart rate, 20-250 only")
save("A1_distributions.png")
def desc(s):
    return dict(n=int(len(s)), mean=float(s.mean()), sd=float(s.std()), median=float(s.median()),
                q1=float(s.quantile(.25)), q3=float(s.quantile(.75)), min=float(s.min()),
                max=float(s.max()), skew=float(stats.skew(s)), kurtosis=float(stats.kurtosis(s)))
R["A1"] = {"HR": desc(hr), "Creatinine": desc(cr), "log_Creatinine_skew": float(stats.skew(np.log(cr)))}
pd.DataFrame({"HR": R["A1"]["HR"], "Creatinine": R["A1"]["Creatinine"]}).to_csv(f"{OUT}/A1_summary.csv")
print(pd.DataFrame({"HR": R["A1"]["HR"], "Creatinine": R["A1"]["Creatinine"]}).round(2).to_string())
print("skew of log(creatinine):", round(R["A1"]["log_Creatinine_skew"], 2))
# HR digit preference check (are values piled up on round numbers?)
_h = hr.round().astype(int)
R["A1"]["HR_pct_divisible_by_5"] = round(float(100 * (_h % 5 == 0).mean()), 1)
print("HR values divisible by 5: %.1f%% (20%% expected if no digit preference)" % R["A1"]["HR_pct_divisible_by_5"])

# ----------------------------------------------------------------------------
# A2. Missingness (stay x variable "any measurement during stay")
# ----------------------------------------------------------------------------
MISS_VARS = ["HR", "RR", "SpO2", "SBP", "MAP", "Temp_C",
             "Creatinine", "BUN", "Potassium", "Sodium", "Bicarbonate", "Glucose",
             "Hemoglobin", "WBC", "Platelets", "Lactate"]
allm = pd.concat([v[["stay_id", "var"]], l[["stay_id", "var"]]], ignore_index=True)
obs = pd.crosstab(allm.stay_id, allm["var"]).reindex(index=coh.stay_id, columns=MISS_VARS, fill_value=0) > 0
obs.index = coh.stay_id.values
miss = ~obs
unit_short = coh.set_index("stay_id").first_careunit.str.extract(r"\((.*)\)")[0].fillna(
    coh.set_index("stay_id").first_careunit)
order = pd.DataFrame({"u": unit_short, "los": coh.set_index("stay_id").los}).sort_values(["u", "los"]).index
fig, ax = plt.subplots(1, 2, figsize=(13, 7), gridspec_kw={"width_ratios": [3, 1.3]})
sns.heatmap(miss.loc[order].astype(int), cmap=["#e8eef7", "#c0392b"], cbar=False, yticklabels=False, ax=ax[0])
ax[0].set_title("Missingness: red = NO measurement during ICU stay (rows = 140 stays, sorted by unit, then LOS)")
bounds = unit_short.loc[order].reset_index(drop=True)
for i in range(1, len(bounds)):
    if bounds[i] != bounds[i - 1]: ax[0].axhline(i, color="k", lw=.6)
plt.setp(ax[0].get_xticklabels(), rotation=60, ha="right")
mr = miss.mean().sort_values()
ax[1].barh(mr.index, mr.values * 100, color="#c0392b"); ax[1].set_xlabel("% of stays with variable entirely missing")
save("A2_missingness.png")
# measurement-level sparsity: observations per stay-day
miss_rate = (miss.mean() * 100).round(1)
by_unit = miss.groupby(unit_short.reindex(miss.index).values).mean().mul(100).round(1)
by_unit["n_stays"] = miss.groupby(unit_short.reindex(miss.index).values).size()
by_unit.to_csv(f"{OUT}/A2_missing_by_unit.csv")
# association of missingness with unit (collapse small units) and with death
ug = unit_short.reindex(miss.index).where(lambda s: s.map(s.value_counts()) >= 13, "Other")
chi = {}
for c in MISS_VARS:
    ct = pd.crosstab(ug.values, miss[c].values)
    chi[c] = float(stats.chi2_contingency(ct)[1]) if ct.shape[1] == 2 else None
died = coh.set_index("stay_id").hospital_expire_flag.reindex(miss.index)
mort_p = {}
for c in MISS_VARS:
    ct = pd.crosstab(died.values, miss[c].values)
    mort_p[c] = float(stats.fisher_exact(ct)[1]) if ct.shape == (2, 2) else None
# co-missingness (phi) among variables that are not constant
mv = miss.loc[:, miss.nunique() > 1].astype(float)
phi = mv.corr()
phi.to_csv(f"{OUT}/A2_missingness_phi.csv")
fig, ax = plt.subplots(figsize=(8, 6.5))
sns.heatmap(phi, cmap="vlag", center=0, vmin=-1, vmax=1, ax=ax); ax.set_title("Co-missingness (phi) between missingness indicators")
save("A2_comissing_phi.png")
pairs = phi.where(np.triu(np.ones(phi.shape), 1).astype(bool)).stack().sort_values(ascending=False)
R["A2"] = dict(missing_pct=miss_rate.to_dict(), chi2_p_by_unit=chi, fisher_p_by_death=mort_p,
               top_comissing=[(a, b, round(float(x), 2)) for (a, b), x in pairs.head(6).items()],
               n_vars=len(MISS_VARS))
print("A2 missing %", miss_rate.to_dict()); print(by_unit.to_string())
print("chi2 p by unit", {k: (round(x, 4) if x is not None else None) for k, x in chi.items()})
print("fisher p by death", {k: (round(x, 4) if x is not None else None) for k, x in mort_p.items()})
print("top co-missing", R["A2"]["top_comissing"])

# ----------------------------------------------------------------------------
# A3. Outliers  --  physiologic range table from Slide 55 ("Outlier Detection:
# Physiologically Impossible Values")
#   Variable  Valid range  Flag condition
#   HR        20-250 bpm   < 20 or > 250
#   SpO2      60-100 %     > 100 or = 0
#   Temp      30-43 degC   < 30 or > 43
# NOTE: for SpO2 the slide's "valid range" (60-100) and its "flag condition" (>100 or =0)
# differ. The assignment says to flag impossible values, so the headline count uses the
# slide's FLAG CONDITION; the count under the stricter valid range is reported alongside.
# ----------------------------------------------------------------------------
SLIDE = {   # name: (valid_lo, valid_hi, unit, flag_rule_text, flag_function)
    "HR":     (20, 250, "bpm", "<20 or >250", lambda x: (x < 20) | (x > 250)),
    "SpO2":   (60, 100, "%",   ">100 or =0",  lambda x: (x > 100) | (x == 0)),
    "Temp_C": (30, 43,  "degC", "<30 or >43", lambda x: (x < 30) | (x > 43)),
}
RANGES = {k: (lo, hi, u) for k, (lo, hi, u, _, _) in SLIDE.items()}   # valid ranges
rows = []
flagged_vals = {}
for k, (lo, hi, u, rule, fn) in SLIDE.items():
    s = v[v["var"] == k].valuenum
    bad = fn(s)
    outside = (s < lo) | (s > hi)
    flagged_vals[k] = sorted(s[bad].round(1).tolist())
    rows.append(dict(variable=k, unit=u, valid_range=f"{lo}-{hi}", flag_rule=rule, n_obs=len(s),
                     n_flagged=int(bad.sum()), pct_flagged=round(100 * bad.mean(), 4),
                     n_outside_valid_range=int(outside.sum()), pct_outside_valid_range=round(100 * outside.mean(), 4),
                     observed_min=round(s.min(), 1), observed_max=round(s.max(), 1),
                     flagged_values=str(flagged_vals[k]),
                     outside_valid_values=str(sorted(s[outside].round(1).tolist()))))
out3 = pd.DataFrame(rows); out3.to_csv(f"{OUT}/A3_outliers.csv", index=False)
R["A3"] = rows
print(out3.drop(columns=["flagged_values", "outside_valid_values"]).to_string())
print(out3[["variable", "flagged_values", "outside_valid_values"]].to_string())
fig, ax = plt.subplots(1, 3, figsize=(13, 4))
for a_, (k, (lo, hi, u)) in zip(ax, RANGES.items()):
    s = v[v["var"] == k].valuenum
    sns.histplot(s, bins=60, ax=a_); a_.axvline(lo, color="r", ls="--"); a_.axvline(hi, color="r", ls="--")
    a_.set_yscale("log"); a_.set_title(f"{k} ({u}); red = slide valid range [{lo},{hi}]")
save("A3_outliers.png")

# ----------------------------------------------------------------------------
# A4. Temporal pattern - patient/admission with most creatinine draws
# ----------------------------------------------------------------------------
c_all = lab[(lab.itemid == 50912)].dropna(subset=["valuenum", "hadm_id"])
top = c_all.groupby(["subject_id", "hadm_id"]).size().sort_values(ascending=False)
(sid, hid), nd = top.index[0], int(top.iloc[0])
p = c_all[c_all.hadm_id == hid].sort_values("charttime")
gaps = p.charttime.diff().dt.total_seconds().div(3600).dropna()
hrs = c_all.charttime.dt.hour
fig, ax = plt.subplots(1, 3, figsize=(15, 4.3))
ax[0].plot(p.charttime, p.valuenum, "o-"); ax[0].set_title(f"Creatinine, subject {sid} / hadm {int(hid)} ({nd} draws)")
ax[0].tick_params(axis="x", rotation=40); ax[0].set_ylabel("mg/dL")
ax[1].hist(p.charttime.dt.hour + p.charttime.dt.minute / 60, bins=np.arange(0, 25, 1), color="C1")
ax[1].set_title("Time-of-day of this patient's draws"); ax[1].set_xlabel("hour of day")
ax[2].hist(hrs, bins=np.arange(0, 25, 1), color="C2"); ax[2].set_title(f"All creatinine draws in demo labevents (n={len(hrs)})"); ax[2].set_xlabel("hour of day")
save("A4_temporal.png")
R["A4"] = dict(subject_id=int(sid), hadm_id=int(hid), n_draws=nd,
               span_days=round((p.charttime.max() - p.charttime.min()).total_seconds() / 86400, 1),
               median_gap_h=round(float(gaps.median()), 1), gap_iqr=[round(float(gaps.quantile(.25)), 1), round(float(gaps.quantile(.75)), 1)],
               pct_draws_3_to_7am=round(float(100 * hrs.between(3, 6).mean()), 1),
               pct_this_pt_3_to_7am=round(float(100 * p.charttime.dt.hour.between(3, 6).mean()), 1),
               values=[round(float(x), 2) for x in p.valuenum], times=[str(t) for t in p.charttime])
print(pd.Series({k: x for k, x in R["A4"].items() if k not in ("values", "times")}).to_string())
print(pd.DataFrame({"charttime": R["A4"]["times"], "creatinine": R["A4"]["values"]}).head(12).to_string(index=False), "\n... (", nd, "draws in total)")

# ----------------------------------------------------------------------------
# A5. Correlation (per-stay means of cleaned values)
# ----------------------------------------------------------------------------
def clean(df):
    d = df.copy()
    for k, (lo, hi, _) in RANGES.items():
        d = d[~((d["var"] == k) & ((d.valuenum < lo) | (d.valuenum > hi)))]
    return d
feat = pd.concat([clean(v)[["stay_id", "var", "valuenum"]], l[["stay_id", "var", "valuenum"]]], ignore_index=True)
F = feat.groupby(["stay_id", "var"]).valuenum.mean().unstack()
CORR_VARS = ["HR", "RR", "SpO2", "SBP", "MAP", "Temp_C", "Creatinine", "BUN", "Potassium", "Sodium", "Bicarbonate", "Hemoglobin", "Glucose", "WBC", "Platelets"]
Fc = F[CORR_VARS]
Cm = Fc.corr(min_periods=20)
nmat = Fc.notna().astype(int).T @ Fc.notna().astype(int)
fig, ax = plt.subplots(figsize=(10, 8.5))
sns.heatmap(Cm, annot=True, fmt=".2f", cmap="vlag", center=0, vmin=-1, vmax=1, ax=ax, annot_kws={"size": 7})
ax.set_title("Pearson correlation of per-stay mean values (pairwise complete)")
save("A5_correlation.png")
cp = Cm.where(np.triu(np.ones(Cm.shape), 1).astype(bool)).stack()
strong = cp[cp.abs() > 0.6].sort_values(key=abs, ascending=False)
R["A5"] = dict(n_features=len(CORR_VARS),
               strong=[(a, b, round(float(x), 3), int(nmat.loc[a, b])) for (a, b), x in strong.items()])
print("A5 |r|>0.6:", R["A5"]["strong"])
Cm.round(3).to_csv(f"{OUT}/A5_corr.csv")

# ----------------------------------------------------------------------------
# A6. Subgroup shift: creatinine by gender
# ----------------------------------------------------------------------------
lc = l[l["var"] == "Creatinine"].merge(coh[["stay_id", "subject_id", "gender"]].drop_duplicates("stay_id"), on="stay_id", suffixes=("", "_c"))
pp = lc.groupby(["subject_id_c" if "subject_id_c" in lc else "subject_id", "gender"]).valuenum.mean().reset_index(name="m")
fig, ax = plt.subplots(1, 2, figsize=(10, 4.5))
sns.boxplot(data=lc, x="gender", y="valuenum", ax=ax[0], showfliers=False); ax[0].set_title("Creatinine, all ICU measurements")
sns.violinplot(data=pp, x="gender", y="m", ax=ax[1], cut=0, inner="point"); ax[1].set_title("Creatinine, per-patient mean")
save("A6_subgroup.png")
g = {s: lc[lc.gender == s].valuenum for s in ["F", "M"]}
gp = {s: pp[pp.gender == s].m for s in ["F", "M"]}
R["A6"] = dict(
    value_level={s: dict(n=int(len(x)), median=round(float(x.median()), 2), mean=round(float(x.mean()), 2)) for s, x in g.items()},
    patient_level={s: dict(n=int(len(x)), median=round(float(x.median()), 2), mean=round(float(x.mean()), 2)) for s, x in gp.items()},
    mwu_p_value_level=float(stats.mannwhitneyu(g["F"], g["M"]).pvalue),
    mwu_p_patient_level=float(stats.mannwhitneyu(gp["F"], gp["M"]).pvalue))
print(pd.concat({"all measurements": pd.DataFrame(R["A6"]["value_level"]).T, "per-patient mean": pd.DataFrame(R["A6"]["patient_level"]).T}).rename_axis(["level", "gender"]).to_string())
print("Mann-Whitney p (measurements): %.2e | p (per patient): %.2e" % (R["A6"]["mwu_p_value_level"], R["A6"]["mwu_p_patient_level"]))

# ----------------------------------------------------------------------------
# A7. Label distribution
# ----------------------------------------------------------------------------
ca = coh.drop_duplicates("hadm_id")
vc = ca.hospital_expire_flag.value_counts().sort_index()
vs = coh.hospital_expire_flag.value_counts().sort_index()
va = adm.hospital_expire_flag.value_counts().sort_index()
fig, ax = plt.subplots(figsize=(4.5, 4))
ax.bar(["Survived (0)", "Died (1)"], vc.values, color=["C0", "C3"])
for i, x in enumerate(vc.values): ax.text(i, x, f"{x}\n({100*x/vc.sum():.1f}%)", ha="center", va="bottom")
ax.set_ylim(0, vc.max() * 1.2); ax.set_title("hospital_expire_flag (ICU-cohort admissions)")
save("A7_label.png")
R["A7"] = dict(cohort_admissions={int(k): int(x) for k, x in vc.items()}, cohort_stays={int(k): int(x) for k, x in vs.items()},
               all_admissions={int(k): int(x) for k, x in va.items()},
               death_rate_pct=float(round(100 * vc.get(1, 0) / vc.sum(), 1)), imbalance=float(round(vc.max() / vc.min(), 2)))
print("hospital_expire_flag, ICU-cohort admissions:", R["A7"]["cohort_admissions"], "-> %.1f%% died, imbalance %.2f : 1" % (R["A7"]["death_rate_pct"], R["A7"]["imbalance"]))
print("ICU stays:", R["A7"]["cohort_stays"], "| all admissions in demo:", R["A7"]["all_admissions"])

# ----------------------------------------------------------------------------
# B1/B2. ICD
# ----------------------------------------------------------------------------
dx = rd("hosp/diagnoses_icd.csv.gz", dtype={"icd_code": str}); ddx = rd("hosp/d_icd_diagnoses.csv.gz", dtype={"icd_code": str})
dx["icd_code"] = dx.icd_code.str.strip()
n_adm = dx.hadm_id.nunique()
dx["code"] = dx.icd_version.astype(str) + ":" + dx.icd_code      # version-qualified (ICD-9 and ICD-10 collide otherwise)
per_code = dx.groupby("code").hadm_id.nunique()
thr = math.ceil(0.01 * n_adm)
common = per_code[per_code >= thr]
R["B1"] = dict(n_admissions=int(n_adm), n_rows=len(dx), unique_raw_codes=int(per_code.size),
               unique_raw_codes_ignoring_version=int(dx.icd_code.nunique()),
               threshold_admissions=int(thr), codes_ge_1pct=int(common.size),
               icd9_rows=int((dx.icd_version == 9).sum()), icd10_rows=int((dx.icd_version == 10).sum()),
               max_prevalence_pct=float(round(100 * per_code.max() / n_adm, 1)),
               all_codes_in_dictionary=bool(dx.merge(ddx, on=["icd_code", "icd_version"], how="left").long_title.notna().all()))
top = common.sort_values(ascending=False).head(15).rename("n_adm").reset_index()
top[["v", "c"]] = top.code.str.split(":", expand=True)
top = top.merge(ddx.rename(columns={"icd_version": "v2"}).assign(v=lambda d: d.v2.astype(str)), left_on=["v", "c"], right_on=["v", "icd_code"], how="left")
top["pct"] = (100 * top.n_adm / n_adm).round(1)
top[["code", "n_adm", "pct", "long_title"]].to_csv(f"{OUT}/B1_top_codes.csv", index=False)
R["B1"]["top"] = top[["code", "n_adm", "pct", "long_title"]].values.tolist()
fig, ax = plt.subplots(figsize=(7, 4))
ax.hist(per_code.values, bins=np.arange(0.5, per_code.max() + 1.5), color="C0"); ax.set_yscale("log")
ax.axvline(thr - 0.5, color="r", ls="--", label=f">=1% of admissions ({thr}+ admissions)")
ax.set_xlabel("# admissions containing the code"); ax.set_ylabel("# unique codes (log)"); ax.legend(); ax.set_title("Long tail of raw ICD codes")
save("B1_long_tail.png")
print(pd.Series({k: x for k, x in R["B1"].items() if k != "top"}).to_string()); print(top[["code", "n_adm", "pct", "long_title"]].to_string())

# roll-up to 3-character family: first 3 chars of the code, per ICD version
dx["family"] = dx.icd_version.astype(str) + ":" + dx.icd_code.str[:3]
fam = dx.groupby("family").hadm_id.nunique()
top20 = per_code.sort_values(ascending=False).head(20).index
ex = pd.DataFrame({"raw_code": top20, "family": [c.split(":")[0] + ":" + c.split(":")[1][:3] for c in top20]})
ex.to_csv(f"{OUT}/B2_rollup_top20.csv", index=False)
multi = dx.groupby("family").code.nunique(); multi = multi[multi > 1]
R["B2"] = dict(unique_raw=int(per_code.size), unique_families=int(fam.size),
               reduction_pct=round(100 * (1 - fam.size / per_code.size), 1),
               top20_unique_raw=20, top20_unique_families=int(ex.family.nunique()),
               families_ge_1pct=int((fam >= thr).sum()),
               families_with_multiple_raw=int(len(multi)), example=ex.head(8).values.tolist(),
               e_v_code_note=int(dx.icd_code.str.match(r"^[EV]").sum()))
print(pd.Series({k: x for k, x in R["B2"].items() if k not in ("example", "e_v_code_note")}).to_string())
print(ex.to_string())

# ----------------------------------------------------------------------------
# B3. LOINC coverage of lab itemids
# ----------------------------------------------------------------------------
ids = lab.itemid.drop_duplicates()
dl = dlab[dlab.itemid.isin(ids)]
has_col = "loinc_code" in dlab.columns
R["B3"] = dict(d_labitems_columns=list(dlab.columns), n_itemids_in_labevents=int(ids.nunique()),
               n_in_dictionary=int(dl.itemid.nunique()), loinc_column_present=has_col)
if has_col:
    R["B3"]["n_with_loinc"] = int(dl.loinc_code.notna().sum())
    R["B3"]["fraction_with_loinc"] = round(float(dl.loinc_code.notna().mean()), 4)
else:
    R["B3"]["n_with_loinc"] = 0; R["B3"]["fraction_with_loinc"] = 0.0
# what a fallback must cope with: label/fluid/category shape of the (unmapped) items
R["B3"]["by_fluid"] = dl.fluid.value_counts().to_dict()
R["B3"]["by_category"] = dl.category.value_counts().to_dict()
lab_ct = lab.itemid.value_counts()
R["B3"]["top10_items"] = [(int(i), dlab.set_index("itemid").label[i], dlab.set_index("itemid").fluid[i], int(n)) for i, n in lab_ct.head(10).items()]
cs = lab_ct.cumsum() / lab_ct.sum()
R["B3"]["event_share_top"] = {n: round(float(cs.iloc[n - 1]), 3) for n in (10, 25, 50, 100)}
dup = dl.assign(l=dl.label.str.lower().str.strip()).groupby("l").itemid.nunique(); dup = dup[dup > 1]
R["B3"]["duplicate_labels_across_itemids"] = int(len(dup))
print("d_labitems columns:", R["B3"]["d_labitems_columns"])
print("itemids in labevents: %d | with a loinc_code: %d | fraction: %.1f%%" % (R["B3"]["n_itemids_in_labevents"], R["B3"]["n_with_loinc"], 100 * R["B3"]["fraction_with_loinc"]))
print("share of lab events covered by top-N itemids:", R["B3"]["event_share_top"])
print(pd.DataFrame(R["B3"]["top10_items"], columns=["itemid", "label", "fluid", "n_events"]).to_string(index=False))

json.dump(R, open(f"{OUT}/results.json", "w"), indent=1, default=str)
print("done")
