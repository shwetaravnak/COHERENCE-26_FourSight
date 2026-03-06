import re
import json


# ── MAIN PARSER ──────────────────────────────────────
# Takes raw inclusion/exclusion text from trials.json
# Returns structured JSON rules
def parse_criteria(inclusion_text: str, exclusion_text: str) -> dict:
    inclusion_rules = parse_inclusion(inclusion_text)
    exclusion_rules = parse_exclusion(exclusion_text)

    return {
        "inclusion": inclusion_rules,
        "exclusion": exclusion_rules
    }


# ── INCLUSION PARSER ─────────────────────────────────
def parse_inclusion(text: str) -> list:
    rules = []
    text = text.lower().strip()

    # ── RULE 1: AGE RANGE ────────────────────────────
    # matches: "aged 30 to 65" or "age 30-65"
    age_range = re.search(
        r'aged?\s+(\d+)\s+to\s+(\d+)', text
    )
    if age_range:
        rules.append({
            "field":    "age",
            "operator": "between",
            "min":      int(age_range.group(1)),
            "max":      int(age_range.group(2)),
            "raw":      age_range.group(0)
        })

    # ── RULE 2: HbA1c GREATER THAN ───────────────────
    # matches: "hba1c greater than 7.5"
    hba1c_gt = re.search(
        r'hba1c\s+greater\s+than\s+([\d.]+)', text
    )
    if hba1c_gt:
        rules.append({
            "field":    "lab_values.HbA1c",
            "operator": ">",
            "value":    float(hba1c_gt.group(1)),
            "raw":      hba1c_gt.group(0)
        })

    # ── RULE 3: HbA1c LESS THAN ──────────────────────
    # matches: "hba1c below 8.0"
    hba1c_lt = re.search(
        r'hba1c\s+below\s+([\d.]+)', text
    )
    if hba1c_lt:
        rules.append({
            "field":    "lab_values.HbA1c",
            "operator": "<",
            "value":    float(hba1c_lt.group(1)),
            "raw":      hba1c_lt.group(0)
        })

    # ── RULE 4: HbA1c BETWEEN ────────────────────────
    # matches: "hba1c between 7.0 and 10.0"
    hba1c_range = re.search(
        r'hba1c\s+between\s+([\d.]+)\s+and\s+([\d.]+)', text
    )
    if hba1c_range:
        rules.append({
            "field":    "lab_values.HbA1c",
            "operator": "between",
            "min":      float(hba1c_range.group(1)),
            "max":      float(hba1c_range.group(2)),
            "raw":      hba1c_range.group(0)
        })

    # ── RULE 5: BMI BETWEEN ──────────────────────────
    # matches: "bmi between 22 and 35"
    bmi_range = re.search(
        r'bmi\s+between\s+([\d.]+)\s+and\s+([\d.]+)', text
    )
    if bmi_range:
        rules.append({
            "field":    "lab_values.BMI",
            "operator": "between",
            "min":      float(bmi_range.group(1)),
            "max":      float(bmi_range.group(2)),
            "raw":      bmi_range.group(0)
        })

    # ── RULE 6: BMI GREATER THAN ─────────────────────
    # matches: "bmi greater than 27"
    bmi_gt = re.search(
        r'bmi\s+greater\s+than\s+([\d.]+)', text
    )
    if bmi_gt:
        rules.append({
            "field":    "lab_values.BMI",
            "operator": ">",
            "value":    float(bmi_gt.group(1)),
            "raw":      bmi_gt.group(0)
        })

    # ── RULE 7: BMI BELOW ────────────────────────────
    # matches: "bmi below 32"
    bmi_lt = re.search(
        r'bmi\s+below\s+([\d.]+)', text
    )
    if bmi_lt:
        rules.append({
            "field":    "lab_values.BMI",
            "operator": "<",
            "value":    float(bmi_lt.group(1)),
            "raw":      bmi_lt.group(0)
        })

    # ── RULE 8: CREATININE BETWEEN ───────────────────
    # matches: "creatinine between 1.2 and 2.0"
    creat_range = re.search(
        r'creatinine\s+between\s+([\d.]+)\s+and\s+([\d.]+)', text
    )
    if creat_range:
        rules.append({
            "field":    "lab_values.creatinine",
            "operator": "between",
            "min":      float(creat_range.group(1)),
            "max":      float(creat_range.group(2)),
            "raw":      creat_range.group(0)
        })

    # ── RULE 9: DIAGNOSIS ────────────────────────────
    # matches known disease names in text
    diseases = [
        "type 2 diabetes",
        "hypertension",
        "breast cancer",
        "copd",
        "rheumatoid arthritis",
        "depression",
        "asthma",
        "chronic kidney disease",
        "parkinson's disease",
        "lupus"
    ]
    for disease in diseases:
        if disease in text:
            rules.append({
                "field":    "diagnoses",
                "operator": "contains",
                "value":    disease,
                "raw":      disease
            })

    # ── RULE 10: MEDICATIONS ─────────────────────────
    # matches: "currently on Metformin"
    # or "currently on Metformin or Lisinopril"
    med_match = re.search(
        r'currently\s+on\s+([\w\s]+?)(?:,|$)', text
    )
    if med_match:
        meds_text = med_match.group(1)
        # split by "or"
        meds = [m.strip() for m in meds_text.split(" or ")]
        for med in meds:
            if med:
                rules.append({
                    "field":    "medications",
                    "operator": "contains_any",
                    "value":    med.strip(),
                    "raw":      med_match.group(0)
                })

    return rules


# ── EXCLUSION PARSER ─────────────────────────────────
def parse_exclusion(text: str) -> list:
    rules = []
    text = text.lower().strip()

    # ── EXCL RULE 1: CREATININE ABOVE ────────────────
    # matches: "creatinine above 1.5"
    creat_above = re.search(
        r'creatinine\s+above\s+([\d.]+)', text
    )
    if creat_above:
        rules.append({
            "field":    "lab_values.creatinine",
            "operator": ">",
            "value":    float(creat_above.group(1)),
            "raw":      creat_above.group(0),
            "type":     "exclusion"
        })

    # ── EXCL RULE 2: CREATININE BELOW ────────────────
    # matches: "creatinine below 1.5"
    creat_below = re.search(
        r'creatinine\s+below\s+([\d.]+)', text
    )
    if creat_below:
        rules.append({
            "field":    "lab_values.creatinine",
            "operator": "<",
            "value":    float(creat_below.group(1)),
            "raw":      creat_below.group(0),
            "type":     "exclusion"
        })

    # ── EXCL RULE 3: NO CONDITION ────────────────────
    # matches: "no cardiovascular disease"
    # matches: "no prior chemotherapy"
    # matches: "no pregnancy"
    no_conditions = re.findall(
        r'no\s+(?:prior\s+|active\s+|severe\s+)?([\w\s]+?)(?:,|$)',
        text
    )
    for condition in no_conditions:
        condition = condition.strip()
        if condition and len(condition) > 2:
            rules.append({
                "field":    "medical_history",
                "operator": "not_contains",
                "value":    condition,
                "raw":      f"no {condition}",
                "type":     "exclusion"
            })

    # ── EXCL RULE 4: GENDER ──────────────────────────
    # matches: "female patients only"
    if "female" in text:
        rules.append({
            "field":    "gender",
            "operator": "equals",
            "value":    "F",
            "raw":      "female patients only",
            "type":     "exclusion"
        })

    return rules


# ── PARSE AND SAVE TO TRIAL ──────────────────────────
# Call this when loading trials into DB
# Parses the text and returns criteria as JSON string
def get_parsed_criteria_json(
    inclusion_text: str,
    exclusion_text: str
) -> str:
    criteria = parse_criteria(inclusion_text, exclusion_text)
    return json.dumps(criteria)


# ── TEST ─────────────────────────────────────────────
# Run this file directly to test:
# python criteria_parser.py
if __name__ == "__main__":
    inclusion = "Patients aged 30 to 65 years with Type 2 Diabetes, HbA1c greater than 7.5, BMI between 22 and 35, currently on Metformin"
    exclusion = "No prior insulin therapy, no cardiovascular disease, no pregnancy, creatinine above 1.5"

    result = parse_criteria(inclusion, exclusion)

    print("\n✅ INCLUSION RULES:")
    for r in result["inclusion"]:
        print(f"   {r}")

    print("\n❌ EXCLUSION RULES:")
    for r in result["exclusion"]:
        print(f"   {r}")