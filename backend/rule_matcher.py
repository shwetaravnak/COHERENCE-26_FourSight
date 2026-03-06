import json


# ── MAIN MATCHER ─────────────────────────────────────
# Takes one patient and one trial
# Returns full breakdown of pass/fail per criterion
def match_patient_to_trial(
    patient: dict,
    trial: dict
) -> dict:

    # parse stored JSON strings back to Python objects
    diagnoses       = json.loads(patient.get("diagnoses", "[]"))
    medications     = json.loads(patient.get("medications", "[]"))
    lab_values      = json.loads(patient.get("lab_values", "{}"))
    medical_history = json.loads(patient.get("medical_history", "[]"))

    # parse trial criteria
    criteria_raw    = trial.get("criteria_parsed", "{}")
    if isinstance(criteria_raw, str):
        criteria = json.loads(criteria_raw)
    else:
        criteria = criteria_raw

    inclusion_rules = criteria.get("inclusion", [])
    exclusion_rules = criteria.get("exclusion", [])

    breakdown = []
    total_rules = 0
    passed_rules = 0

    # ── CHECK INCLUSION RULES ────────────────────────
    for rule in inclusion_rules:
        total_rules += 1
        result = check_rule(
            rule, patient,
            diagnoses, medications,
            lab_values, medical_history
        )
        breakdown.append(result)
        if result["status"] == "PASS":
            passed_rules += 1

    # ── CHECK EXCLUSION RULES ────────────────────────
    for rule in exclusion_rules:
        total_rules += 1
        result = check_exclusion_rule(
            rule, patient,
            diagnoses, medications,
            lab_values, medical_history
        )
        breakdown.append(result)
        if result["status"] == "PASS":
            passed_rules += 1

    # ── CALCULATE RULE SCORE ─────────────────────────
    rule_score = passed_rules / total_rules if total_rules > 0 else 0.0

    return {
        "breakdown":   breakdown,
        "rule_score":  round(rule_score, 3),
        "passed":      passed_rules,
        "total":       total_rules
    }


# ── CHECK ONE INCLUSION RULE ─────────────────────────
def check_rule(
    rule: dict,
    patient: dict,
    diagnoses: list,
    medications: list,
    lab_values: dict,
    medical_history: list
) -> dict:

    field    = rule.get("field", "")
    operator = rule.get("operator", "")

    # ── AGE CHECK ────────────────────────────────────
    if field == "age":
        patient_age = patient.get("age", 0)

        if operator == "between":
            passed = rule["min"] <= patient_age <= rule["max"]
            return {
                "criterion":     f"Age {rule['min']}–{rule['max']}",
                "status":        "PASS" if passed else "FAIL",
                "patient_value": str(patient_age),
                "required":      f"{rule['min']}–{rule['max']}",
                "reason":        f"Patient age {patient_age} {'within' if passed else 'outside'} required range {rule['min']}–{rule['max']}"
            }

    # ── LAB VALUES CHECK ─────────────────────────────
    if field.startswith("lab_values."):
        lab_key = field.split(".")[1]
        patient_val = lab_values.get(lab_key, None)

        if patient_val is None:
            return {
                "criterion":     f"{lab_key} check",
                "status":        "FAIL",
                "patient_value": "Not provided",
                "required":      str(rule.get("value", "")),
                "reason":        f"{lab_key} not provided by patient"
            }

        if operator == ">":
            passed = float(patient_val) > rule["value"]
            return {
                "criterion":     f"{lab_key} > {rule['value']}",
                "status":        "PASS" if passed else "FAIL",
                "patient_value": str(patient_val),
                "required":      f"> {rule['value']}",
                "reason":        f"{lab_key} {patient_val} {'above' if passed else 'below'} required {rule['value']}"
            }

        if operator == "<":
            passed = float(patient_val) < rule["value"]
            return {
                "criterion":     f"{lab_key} < {rule['value']}",
                "status":        "PASS" if passed else "FAIL",
                "patient_value": str(patient_val),
                "required":      f"< {rule['value']}",
                "reason":        f"{lab_key} {patient_val} {'below' if passed else 'above'} required {rule['value']}"
            }

        if operator == "between":
            passed = rule["min"] <= float(patient_val) <= rule["max"]
            return {
                "criterion":     f"{lab_key} {rule['min']}–{rule['max']}",
                "status":        "PASS" if passed else "FAIL",
                "patient_value": str(patient_val),
                "required":      f"{rule['min']}–{rule['max']}",
                "reason":        f"{lab_key} {patient_val} {'within' if passed else 'outside'} range {rule['min']}–{rule['max']}"
            }

    # ── DIAGNOSIS CHECK ──────────────────────────────
    if field == "diagnoses" and operator == "contains":
        required_diag = rule["value"].lower()
        patient_diags = [d.lower() for d in diagnoses]
        passed = any(
            required_diag in d or d in required_diag
            for d in patient_diags
        )
        return {
            "criterion":     f"Diagnosis: {rule['value']}",
            "status":        "PASS" if passed else "FAIL",
            "patient_value": ", ".join(diagnoses) or "None",
            "required":      rule["value"],
            "reason":        f"{'Diagnosis matches' if passed else 'Diagnosis does not match'} required condition"
        }

    # ── MEDICATION CHECK ─────────────────────────────
    if field == "medications" and operator == "contains_any":
        required_med = rule["value"].lower()
        patient_meds = [m.lower() for m in medications]
        passed = any(
            required_med in m or m in required_med
            for m in patient_meds
        )
        return {
            "criterion":     f"Medication: {rule['value']}",
            "status":        "PASS" if passed else "FAIL",
            "patient_value": ", ".join(medications) or "None",
            "required":      rule["value"],
            "reason":        f"{'Required medication found' if passed else 'Required medication not found'}"
        }

    # ── GENDER CHECK ─────────────────────────────────
    if field == "gender" and operator == "equals":
        patient_gender = patient.get("gender", "").upper()
        required_gender = rule["value"].upper()
        passed = patient_gender == required_gender
        return {
            "criterion":     f"Gender: {rule['value']}",
            "status":        "PASS" if passed else "FAIL",
            "patient_value": patient_gender,
            "required":      required_gender,
            "reason":        f"{'Gender matches' if passed else 'Gender does not match'} requirement"
        }

    # ── DEFAULT FALLBACK ─────────────────────────────
    return {
        "criterion":     field,
        "status":        "UNKNOWN",
        "patient_value": "N/A",
        "required":      str(rule.get("value", "")),
        "reason":        "Could not evaluate this criterion"
    }


# ── CHECK ONE EXCLUSION RULE ─────────────────────────
def check_exclusion_rule(
    rule: dict,
    patient: dict,
    diagnoses: list,
    medications: list,
    lab_values: dict,
    medical_history: list
) -> dict:

    field    = rule.get("field", "")
    operator = rule.get("operator", "")

    # ── MEDICAL HISTORY NOT CONTAINS ─────────────────
    if field == "medical_history" and operator == "not_contains":
        condition = rule["value"].lower()
        history_lower = [h.lower() for h in medical_history]

        # check if the BAD condition is present
        has_condition = any(
            condition in h or h in condition
            for h in history_lower
        )

        # also check diagnoses for exclusion conditions
        diag_lower = [d.lower() for d in diagnoses]
        has_in_diag = any(
            condition in d or d in condition
            for d in diag_lower
        )

        has_bad_condition = has_condition or has_in_diag

        # PASS means the bad condition is NOT present
        passed = not has_bad_condition

        return {
            "criterion":     f"No {rule['value']}",
            "status":        "PASS" if passed else "FAIL",
            "patient_value": "Not present" if passed else "Present",
            "required":      f"Must not have {rule['value']}",
            "reason":        f"{'Exclusion condition not present' if passed else 'Patient has excluded condition: ' + rule['value']}"
        }

    # ── LAB VALUE EXCLUSION ───────────────────────────
    if field.startswith("lab_values."):
        lab_key = field.split(".")[1]
        patient_val = lab_values.get(lab_key, None)

        if patient_val is None:
            return {
                "criterion":     f"{lab_key} exclusion",
                "status":        "PASS",
                "patient_value": "Not provided",
                "required":      str(rule.get("value", "")),
                "reason":        f"{lab_key} not provided — assuming within range"
            }

        if operator == ">":
            # exclusion: patient fails if value IS above threshold
            fails = float(patient_val) > rule["value"]
            return {
                "criterion":     f"{lab_key} not above {rule['value']}",
                "status":        "FAIL" if fails else "PASS",
                "patient_value": str(patient_val),
                "required":      f"Must be ≤ {rule['value']}",
                "reason":        f"{lab_key} {patient_val} {'exceeds' if fails else 'within'} exclusion limit {rule['value']}"
            }

        if operator == "<":
            fails = float(patient_val) < rule["value"]
            return {
                "criterion":     f"{lab_key} not below {rule['value']}",
                "status":        "FAIL" if fails else "PASS",
                "patient_value": str(patient_val),
                "required":      f"Must be ≥ {rule['value']}",
                "reason":        f"{lab_key} {patient_val} {'below' if fails else 'above'} exclusion limit {rule['value']}"
            }

    # ── DEFAULT FALLBACK ─────────────────────────────
    return {
        "criterion":     field,
        "status":        "PASS",
        "patient_value": "N/A",
        "required":      "N/A",
        "reason":        "Exclusion condition not evaluated"
    }


# ── TEST ─────────────────────────────────────────────
if __name__ == "__main__":
    # test patient
    patient = {
        "age":             58,
        "gender":          "M",
        "diagnoses":       json.dumps(["COPD"]),
        "medications":     json.dumps(["Salbutamol"]),
        "lab_values":      json.dumps({
                               "BMI": 24.0,
                               "HbA1c": 6.1,
                               "creatinine": 0.9
                           }),
        "medical_history": json.dumps([
                               "no active cancer",
                               "no cardiovascular disease",
                               "no severe depression"
                           ])
    }

    # test trial T015
    from criteria_parser import parse_criteria
    criteria = parse_criteria(
        "Patients aged 50 to 80 years with COPD, BMI between 18 and 30, currently on Salbutamol",
        "No active cancer, no cardiovascular disease, no severe depression"
    )

    trial = {
        "trial_id":       "T015",
        "title":          "COPD Pulmonary Rehabilitation Study",
        "criteria_parsed": json.dumps(criteria)
    }

    result = match_patient_to_trial(patient, trial)

    print(f"\n📊 Rule Score: {result['rule_score']}")
    print(f"✅ Passed: {result['passed']}/{result['total']}\n")
    for item in result["breakdown"]:
        icon = "✅" if item["status"] == "PASS" else "❌"
        print(f"{icon} {item['criterion']}")
        print(f"   Patient: {item['patient_value']}")
        print(f"   Required: {item['required']}")
        print(f"   Reason: {item['reason']}\n")