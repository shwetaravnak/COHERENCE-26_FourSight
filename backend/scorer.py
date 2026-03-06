import json


# ── MAIN SCORER ──────────────────────────────────────
# Takes rule result + ml result for one patient-trial pair
# Returns final confidence score + ranking info
def calculate_final_score(
    rule_result: dict,
    ml_result:   dict,
    patient:     dict,
    trial:       dict
) -> dict:

    rule_score = rule_result.get("rule_score", 0.0)
    ml_score   = ml_result.get("ml_score", 0.0)

    # ── WEIGHTED FORMULA ─────────────────────────────
    # Rules are more reliable so get 60% weight
    # ML similarity gets 40% weight
    base_score = (rule_score * 0.6) + (ml_score * 0.4)

    # ── GEOGRAPHIC BONUS ─────────────────────────────
    geo_bonus = calculate_geo_bonus(patient, trial)

    # ── FINAL SCORE ──────────────────────────────────
    # cap at 1.0 maximum
    final_score = min(1.0, base_score + geo_bonus)

    # ── ELIGIBILITY DECISION ─────────────────────────
    # patient is eligible only if rule score is
    # above 0.5 — ML alone cannot make them eligible
    is_eligible = rule_score >= 0.5

    # ── MATCH LABEL ──────────────────────────────────
    label = get_match_label(final_score)

    return {
        "rule_score":   round(rule_score, 3),
        "ml_score":     round(ml_score, 3),
        "geo_bonus":    round(geo_bonus, 3),
        "final_score":  round(final_score, 3),
        "percentage":   round(final_score * 100, 1),
        "is_eligible":  is_eligible,
        "label":        label
    }


# ── GEOGRAPHIC BONUS ─────────────────────────────────
# Give small bonus if patient city matches trial location
def calculate_geo_bonus(
    patient: dict,
    trial:   dict
) -> float:

    patient_city = patient.get("location_city", "").lower()

    # parse trial locations
    locations_raw = trial.get("locations", "[]")
    if isinstance(locations_raw, str):
        try:
            locations = json.loads(locations_raw)
        except:
            locations = []
    else:
        locations = locations_raw

    trial_cities = [loc.lower() for loc in locations]

    if patient_city and patient_city in trial_cities:
        return 0.05   # 5% bonus for location match

    return 0.0


# ── MATCH LABEL ──────────────────────────────────────
# Returns human readable label based on score
def get_match_label(score: float) -> str:
    if score >= 0.80:
        return "Excellent Match"
    elif score >= 0.60:
        return "Good Match"
    elif score >= 0.40:
        return "Partial Match"
    else:
        return "Low Match"


# ── RANK TRIALS ──────────────────────────────────────
# Takes list of scored trials for one patient
# Returns sorted list highest score first
def rank_trials(scored_trials: list) -> list:
    return sorted(
        scored_trials,
        key=lambda x: x["final_score"],
        reverse=True
    )


# ── SCORE ALL TRIALS FOR ONE PATIENT ─────────────────
# Runs full scoring pipeline for patient vs all trials
# Returns ranked list
def score_patient_against_all_trials(
    patient:      dict,
    trials:       list,
    rule_results: dict,
    ml_results:   dict
) -> list:

    scored = []

    for trial in trials:
        trial_id = trial["trial_id"]

        rule_result = rule_results.get(trial_id, {
            "rule_score": 0.0,
            "breakdown":  [],
            "passed":     0,
            "total":      0
        })

        ml_result = ml_results.get(trial_id, {
            "ml_score": 0.0
        })

        score_data = calculate_final_score(
            rule_result,
            ml_result,
            patient,
            trial
        )

        scored.append({
            "trial_id":          trial_id,
            "title":             trial.get("title", ""),
            "phase":             trial.get("phase", ""),
            "disease_area":      trial.get("disease_area", ""),
            "sponsor":           trial.get("sponsor", ""),
            "locations":         trial.get("locations", "[]"),
            "rule_score":        score_data["rule_score"],
            "ml_score":          score_data["ml_score"],
            "geo_bonus":         score_data["geo_bonus"],
            "final_score":       score_data["final_score"],
            "percentage":        score_data["percentage"],
            "is_eligible":       score_data["is_eligible"],
            "label":             score_data["label"],
            "criteria_breakdown": rule_result.get("breakdown", []),
            "passed":            rule_result.get("passed", 0),
            "total":             rule_result.get("total", 0)
        })

    return rank_trials(scored)


# ── TEST ─────────────────────────────────────────────
if __name__ == "__main__":

    rule_result = {
        "rule_score": 0.857,
        "passed":     6,
        "total":      7,
        "breakdown":  []
    }

    ml_result = {
        "ml_score": 0.812
    }

    patient = {
        "location_city": "Delhi"
    }

    trial = {
        "trial_id":  "T015",
        "title":     "COPD Pulmonary Rehabilitation Study",
        "locations": json.dumps(["Ahmedabad", "Kolkata", "Delhi"])
    }

    result = calculate_final_score(
        rule_result,
        ml_result,
        patient,
        trial
    )

    print("\n📊 SCORE BREAKDOWN")
    print(f"   Rule Score:   {result['rule_score']} (×0.6)")
    print(f"   ML Score:     {result['ml_score']} (×0.4)")
    print(f"   Geo Bonus:    +{result['geo_bonus']}")
    print(f"   ─────────────────────")
    print(f"   Final Score:  {result['final_score']}")
    print(f"   Percentage:   {result['percentage']}%")
    print(f"   Label:        {result['label']}")
    print(f"   Eligible:     {result['is_eligible']}")