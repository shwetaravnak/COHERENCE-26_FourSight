import json
from sentence_transformers import SentenceTransformer, util

# ── LOAD MODEL ONCE ──────────────────────────────────
# This loads when server starts
# Downloads ~80MB first time only
# Never loads again after that
print("[*] Loading ML model...")
model = SentenceTransformer('all-MiniLM-L6-v2')
print("[OK] ML model loaded")


# ── MAIN ML MATCHER ──────────────────────────────────
# Takes one patient and one trial
# Returns semantic similarity score 0.0 to 1.0
def ml_match(patient: dict, trial: dict) -> dict:

    # ── BUILD PATIENT TEXT ───────────────────────────
    # Convert patient data into one text string
    # so the model can understand it
    patient_text = build_patient_text(patient)

    # ── BUILD TRIAL TEXT ─────────────────────────────
    # Convert trial criteria into one text string
    trial_text = build_trial_text(trial)

    # ── COMPUTE SIMILARITY ───────────────────────────
    overall_score = compute_similarity(patient_text, trial_text)

    # ── FIELD LEVEL SIMILARITY ───────────────────────
    # Also compare individual fields for better accuracy
    field_scores = compute_field_scores(patient, trial)

    # ── AVERAGE ALL SCORES ───────────────────────────
    all_scores = [overall_score] + list(field_scores.values())
    avg_score  = sum(all_scores) / len(all_scores)

    return {
        "ml_score":     round(avg_score, 3),
        "overall":      round(overall_score, 3),
        "field_scores": field_scores
    }


# ── BUILD PATIENT TEXT ───────────────────────────────
# Converts patient dict into readable text for the model
def build_patient_text(patient: dict) -> str:
    diagnoses   = json.loads(patient.get("diagnoses", "[]"))
    medications = json.loads(patient.get("medications", "[]"))
    lab_values  = json.loads(patient.get("lab_values", "{}"))
    history     = json.loads(patient.get("medical_history", "[]"))

    parts = []

    if patient.get("age"):
        parts.append(f"Patient is {patient['age']} years old")

    if patient.get("gender"):
        gender = "male" if patient["gender"] == "M" else "female"
        parts.append(f"Gender is {gender}")

    if diagnoses:
        parts.append(f"Diagnosed with {', '.join(diagnoses)}")

    if medications:
        parts.append(f"Currently taking {', '.join(medications)}")

    if lab_values.get("HbA1c"):
        parts.append(f"HbA1c is {lab_values['HbA1c']}")

    if lab_values.get("BMI"):
        parts.append(f"BMI is {lab_values['BMI']}")

    if lab_values.get("creatinine"):
        parts.append(f"Creatinine is {lab_values['creatinine']}")

    if history:
        parts.append(f"Medical history: {', '.join(history)}")

    if patient.get("location_city"):
        parts.append(f"Located in {patient['location_city']}")

    return ". ".join(parts)


# ── BUILD TRIAL TEXT ─────────────────────────────────
# Converts trial criteria into readable text for model
def build_trial_text(trial: dict) -> str:
    parts = []

    if trial.get("title"):
        parts.append(trial["title"])

    if trial.get("disease_area"):
        parts.append(f"Disease area: {trial['disease_area']}")

    if trial.get("inclusion_text"):
        parts.append(f"Inclusion: {trial['inclusion_text']}")

    if trial.get("exclusion_text"):
        parts.append(f"Exclusion: {trial['exclusion_text']}")

    return ". ".join(parts)


# ── COMPUTE SIMILARITY ───────────────────────────────
# Core function — converts two texts to vectors
# and measures how similar they are
def compute_similarity(text1: str, text2: str) -> float:
    if not text1 or not text2:
        return 0.0

    # encode both texts into vectors
    embedding1 = model.encode(text1, convert_to_tensor=True)
    embedding2 = model.encode(text2, convert_to_tensor=True)

    # cosine similarity between vectors
    # returns value between -1 and 1
    # we clamp to 0–1
    score = util.cos_sim(embedding1, embedding2)
    return max(0.0, float(score[0][0]))


# ── FIELD LEVEL SCORES ───────────────────────────────
# Compare specific patient fields to trial text
# for more accurate matching
def compute_field_scores(
    patient: dict,
    trial: dict
) -> dict:
    scores = {}
    trial_text = trial.get("inclusion_text", "").lower()

    # ── DIAGNOSIS SIMILARITY ─────────────────────────
    diagnoses = json.loads(patient.get("diagnoses", "[]"))
    if diagnoses:
        diag_text = " ".join(diagnoses)
        scores["diagnosis"] = round(
            compute_similarity(diag_text, trial_text), 3
        )

    # ── MEDICATION SIMILARITY ────────────────────────
    medications = json.loads(patient.get("medications", "[]"))
    if medications:
        med_text = " ".join(medications)
        scores["medications"] = round(
            compute_similarity(med_text, trial_text), 3
        )

    # ── DISEASE AREA SIMILARITY ──────────────────────
    disease_area = trial.get("disease_area", "")
    if diagnoses and disease_area:
        scores["disease_area"] = round(
            compute_similarity(
                " ".join(diagnoses),
                disease_area
            ), 3
        )

    return scores


# ── TEST ─────────────────────────────────────────────
if __name__ == "__main__":
    patient = {
        "age":             58,
        "gender":          "M",
        "diagnoses":       json.dumps(["COPD"]),
        "medications":     json.dumps(["Salbutamol"]),
        "lab_values":      json.dumps({
                               "BMI": 24.0,
                               "HbA1c": 6.1
                           }),
        "medical_history": json.dumps([
                               "no active cancer",
                               "no cardiovascular disease"
                           ]),
        "location_city":   "Delhi"
    }

    trial = {
        "trial_id":      "T015",
        "title":         "COPD Pulmonary Rehabilitation Study",
        "disease_area":  "Pulmonology",
        "inclusion_text": "Patients aged 50 to 80 years with COPD, BMI between 18 and 30, currently on Salbutamol",
        "exclusion_text": "No active cancer, no cardiovascular disease, no severe depression"
    }

    result = ml_match(patient, trial)

    print(f"\n🤖 ML Score:     {result['ml_score']}")
    print(f"🔍 Overall:      {result['overall']}")
    print(f"📊 Field Scores:")
    for field, score in result["field_scores"].items():
        bar = "█" * int(score * 20)
        print(f"   {field:<20} {bar:<20} {score}")