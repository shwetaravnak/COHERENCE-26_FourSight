import hashlib
import uuid
import json


def hash_id(raw_id: str) -> str:
    return hashlib.sha256(raw_id.encode()).hexdigest()


def generate_patient_hash() -> str:
    unique_id = str(uuid.uuid4())
    return hashlib.sha256(unique_id.encode()).hexdigest()


def anonymize_patient(patient: dict) -> dict:
    pii_fields = [
        "name", "full_name", "phone", "phone_number",
        "email", "address", "national_id", "aadhar",
        "passport", "date_of_birth", "dob"
    ]
    for field in pii_fields:
        patient.pop(field, None)

    if "dob" in patient:
        from datetime import date
        try:
            dob = date.fromisoformat(patient["dob"])
            today = date.today()
            patient["age"] = today.year - dob.year
        except:
            pass
        patient.pop("dob", None)

    return patient


def prepare_patient_for_db(user_id: str, form_data: dict) -> dict:
    patient_hash = generate_patient_hash()
    clean_data = anonymize_patient(form_data.copy())

    patient = {
        "patient_hash":    patient_hash,
        "user_id":         user_id,
        "age":             clean_data.get("age"),
        "gender":          clean_data.get("gender"),
        "diagnoses":       json.dumps(clean_data.get("diagnoses", [])),
        "medications":     json.dumps(clean_data.get("medications", [])),
        "lab_values":      json.dumps(clean_data.get("lab_values", {})),
        "medical_history": json.dumps(clean_data.get("medical_history", [])),
        "location_city":   clean_data.get("location_city", ""),
        "location_state":  clean_data.get("location_state", "India"),
    }

    return patient


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password