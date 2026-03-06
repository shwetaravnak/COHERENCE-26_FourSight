import json


# ── MAIN EXPLAINER ───────────────────────────────────
# Takes scoring result for one patient-trial pair
# Returns human readable explanation
def generate_explanation(
    patient:    dict,
    trial:      dict,
    score_data: dict
) -> dict:

    breakdown    = score_data.get("criteria_breakdown", [])
    final_score  = score_data.get("final_score", 0.0)
    is_eligible  = score_data.get("is_eligible", False)
    passed       = score_data.get("passed", 0)
    total        = score_data.get("total", 0)

    # ── SUMMARY SENTENCE ─────────────────────────────
    summary = generate_summary(
        trial, passed, total,
        final_score, is_eligible
    )

    # ── CRITERION CARDS ──────────────────────────────
    criterion_cards = generate_criterion_cards(breakdown)

    # ── SCORE BREAKDOWN TEXT ─────────────────────────
    score_breakdown = generate_score_breakdown(score_data)

    # ── RECOMMENDATION TEXT ──────────────────────────
    recommendation = generate_recommendation(
        final_score, is_eligible, trial
    )

    return {
        "trial_id":        trial.get("trial_id", ""),
        "trial_title":     trial.get("trial_title", ""),
        "summary":         summary,
        "criterion_cards": criterion_cards,
        "score_breakdown": score_breakdown,
        "recommendation":  recommendation,
        "is_eligible":     is_eligible,
        "passed":          passed,
        "total":           total
    }


# ── SUMMARY SENTENCE ─────────────────────────────────
# One line that explains the match result
def generate_summary(
    trial:       dict,
    passed:      int,
    total:       int,
    final_score: float,
    is_eligible: bool
) -> str:

    trial_name = trial.get("title", "this trial")
    percentage = round(final_score * 100, 1)

    if is_eligible and passed == total:
        return (
            f"You meet all {total} criteria for "
            f"{trial_name} with a {percentage}% match score."
        )

    elif is_eligible and passed < total:
        failed = total - passed
        return (
            f"You meet {passed} of {total} criteria for "
            f"{trial_name}. {failed} criterion "
            f"{'does' if failed == 1 else 'do'} not match. "
            f"Overall score: {percentage}%."
        )

    else:
        failed = total - passed
        return (
            f"You do not meet enough criteria for "
            f"{trial_name}. Only {passed} of {total} "
            f"criteria matched. Score: {percentage}%."
        )


# ── CRITERION CARDS ──────────────────────────────────
# Builds the ✅/❌/~ card for each criterion
def generate_criterion_cards(breakdown: list) -> list:
    cards = []

    for item in breakdown:
        status = item.get("status", "UNKNOWN")

        # pick icon based on status
        if status == "PASS":
            icon  = "✅"
            color = "green"
        elif status == "FAIL":
            icon  = "❌"
            color = "red"
        else:
            icon  = "~"
            color = "yellow"

        cards.append({
            "criterion":     item.get("criterion", ""),
            "status":        status,
            "icon":          icon,
            "color":         color,
            "patient_value": item.get("patient_value", "N/A"),
            "required":      item.get("required", "N/A"),
            "reason":        item.get("reason", "")
        })

    return cards


# ── SCORE BREAKDOWN TEXT ─────────────────────────────
# Explains what the 3 scores mean
def generate_score_breakdown(score_data: dict) -> dict:
    rule_score  = score_data.get("rule_score", 0.0)
    ml_score    = score_data.get("ml_score", 0.0)
    final_score = score_data.get("final_score", 0.0)
    geo_bonus   = score_data.get("geo_bonus", 0.0)

    return {
        "rule_score": {
            "value":       round(rule_score * 100, 1),
            "label":       "Rule Score",
            "description": "Based on exact criteria matching"
        },
        "ml_score": {
            "value":       round(ml_score * 100, 1),
            "label":       "AI Score",
            "description": "Based on semantic similarity"
        },
        "geo_bonus": {
            "value":       round(geo_bonus * 100, 1),
            "label":       "Location Bonus",
            "description": "Trial available in your city"
        },
        "final_score": {
            "value":       round(final_score * 100, 1),
            "label":       "Final Score",
            "description": "Overall match confidence"
        }
    }


# ── RECOMMENDATION TEXT ──────────────────────────────
# What should the patient do next
def generate_recommendation(
    final_score: float,
    is_eligible: bool,
    trial:       dict
) -> str:

    trial_name = trial.get("title", "this trial")
    locations  = trial.get("locations", [])

    if isinstance(locations, str):
        try:
            locations = json.loads(locations)
        except:
            locations = []

    location_text = ""
    if locations:
        location_text = (
            f" The trial is available in "
            f"{', '.join(locations)}."
        )

    if is_eligible and final_score >= 0.80:
        return (
            f"You are an excellent candidate for "
            f"{trial_name}.{location_text} "
            f"We strongly recommend expressing interest."
        )

    elif is_eligible and final_score >= 0.60:
        return (
            f"You are a good candidate for "
            f"{trial_name}.{location_text} "
            f"Consider expressing interest — "
            f"the researcher will review your profile."
        )

    elif is_eligible:
        return (
            f"You partially match {trial_name}."
            f"{location_text} "
            f"You may still express interest and "
            f"let the researcher decide."
        )

    else:
        return (
            f"You do not currently meet the minimum "
            f"criteria for {trial_name}. "
            f"You can still view other matched trials."
        )


# ── GENERATE FOR ALL TRIALS ──────────────────────────
# Runs explainer for every trial in ranked list
def explain_all_matches(
    patient:       dict,
    ranked_trials: list
) -> list:

    explanations = []

    for trial in ranked_trials:
        explanation = generate_explanation(
            patient, trial, trial
        )
        explanations.append(explanation)

    return explanations


# ── TEST ─────────────────────────────────────────────
if __name__ == "__main__":

    patient = {
        "age":           58,
        "location_city": "Delhi"
    }

    trial = {
        "trial_id":    "T015",
        "title":       "COPD Pulmonary Rehabilitation Study",
        "locations":   json.dumps(["Ahmedabad", "Kolkata", "Delhi"])
    }

    score_data = {
        "rule_score":  0.857,
        "ml_score":    0.812,
        "geo_bonus":   0.05,
        "final_score": 0.889,
        "is_eligible": True,
        "passed":      6,
        "total":       7,
        "criteria_breakdown": [
            {
                "criterion":     "Age 50–80",
                "status":        "PASS",
                "patient_value": "58",
                "required":      "50–80",
                "reason":        "Patient age 58 within range"
            },
            {
                "criterion":     "Diagnosis: COPD",
                "status":        "PASS",
                "patient_value": "COPD",
                "required":      "COPD",
                "reason":        "Diagnosis matches"
            },
            {
                "criterion":     "BMI 18–30",
                "status":        "PASS",
                "patient_value": "24.0",
                "required":      "18–30",
                "reason":        "BMI within range"
            },
            {
                "criterion":     "Medication: Salbutamol",
                "status":        "PASS",
                "patient_value": "Salbutamol",
                "required":      "Salbutamol",
                "reason":        "Required medication found"
            },
            {
                "criterion":     "No active cancer",
                "status":        "PASS",
                "patient_value": "Not present",
                "required":      "Must not have cancer",
                "reason":        "Exclusion condition not present"
            },
            {
                "criterion":     "No cardiovascular disease",
                "status":        "PASS",
                "patient_value": "Not present",
                "required":      "Must not have CVD",
                "reason":        "Exclusion condition not present"
            },
            {
                "criterion":     "No severe depression",
                "status":        "FAIL",
                "patient_value": "Present",
                "required":      "Must not have depression",
                "reason":        "Patient has excluded condition"
            }
        ]
    }

    result = generate_explanation(patient, trial, score_data)

    print("\n📋 EXPLANATION REPORT")
    print(f"Summary: {result['summary']}\n")

    print("Criterion Breakdown:")
    for card in result["criterion_cards"]:
        print(f"  {card['icon']} {card['criterion']}")
        print(f"     Patient:  {card['patient_value']}")
        print(f"     Required: {card['required']}")
        print(f"     Reason:   {card['reason']}\n")

    print("Score Breakdown:")
    for key, val in result["score_breakdown"].items():
        print(f"  {val['label']}: {val['value']}%")

    print(f"\nRecommendation: {result['recommendation']}")