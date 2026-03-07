import re
import json
import os


# ── INSTALL NEEDED ───────────────────────────────────
# pip install pytesseract Pillow pdfplumber
# Also install Tesseract OCR on Windows:
# https://github.com/UB-Mannheim/tesseract/wiki

try:
    import pytesseract
    from PIL import Image
    # Windows path for Tesseract
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print("⚠️ pytesseract not installed — image OCR disabled")

try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("⚠️ pdfplumber not installed — PDF OCR disabled")


# ── MAIN ENTRY POINT ─────────────────────────────────
# Takes a file path (PDF or image)
# Returns extracted patient fields
def extract_from_file(file_path: str) -> dict:
    ext = os.path.splitext(file_path)[1].lower()

    # ── PDF ──────────────────────────────────────────
    if ext == ".pdf":
        text = extract_text_from_pdf(file_path)

    # ── IMAGE ────────────────────────────────────────
    elif ext in [".jpg", ".jpeg", ".png"]:
        text = extract_text_from_image(file_path)

    else:
        return {
            "error":   True,
            "message": f"Unsupported file type: {ext}"
        }

    if not text or len(text.strip()) < 10:
        return {
            "error":   True,
            "message": "Could not extract text from file. The image may be blurry, too dark, or not a valid medical report. Please upload a clearer image."
        }

    # ── PARSE EXTRACTED TEXT ─────────────────────────
    fields = parse_medical_text(text)
    fields["raw_text"] = text
    fields["error"]    = False

    # ── QUALITY CHECK ────────────────────────────────
    # Count how many fields were actually extracted
    extracted_count = 0
    total_fields = 6  # age, gender, diagnoses, medications, lab_values, location
    if fields.get("age") is not None: extracted_count += 1
    if fields.get("gender") is not None: extracted_count += 1
    if fields.get("diagnoses") and len(fields["diagnoses"]) > 0: extracted_count += 1
    if fields.get("medications") and len(fields["medications"]) > 0: extracted_count += 1
    if fields.get("lab_values") and len(fields["lab_values"]) > 0: extracted_count += 1
    if fields.get("location_city") is not None: extracted_count += 1

    quality_score = round(extracted_count / total_fields, 2)
    fields["quality_score"] = quality_score
    fields["fields_extracted"] = extracted_count
    fields["fields_total"] = total_fields

    # If very few fields extracted, warn about low quality
    if extracted_count <= 1:
        fields["quality_warning"] = "Very few medical details could be read from this report. The image may be unclear or not a medical document. Please try uploading a clearer image or fill in the form manually."
    elif extracted_count <= 3:
        fields["quality_warning"] = "Some fields could not be extracted. Please review and fill in any missing information below."
    else:
        fields["quality_warning"] = None

    return fields


# ── EXTRACT FROM PDF ─────────────────────────────────
def extract_text_from_pdf(file_path: str) -> str:
    if not PDF_AVAILABLE:
        return ""

    text = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"❌ PDF extraction error: {e}")
        return ""

    return text.strip()


# ── EXTRACT FROM IMAGE ───────────────────────────────
def extract_text_from_image(file_path: str) -> str:
    if not OCR_AVAILABLE:
        return ""

    try:
        img  = Image.open(file_path)
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception as e:
        print(f"❌ Image OCR error: {e}")
        return ""


# ── PARSE MEDICAL TEXT ───────────────────────────────
# Takes raw text from OCR
# Extracts patient fields using regex
def parse_medical_text(text: str) -> dict:
    text_lower = text.lower()

    fields = {
        "age":             extract_age(text_lower),
        "gender":          extract_gender(text_lower),
        "diagnoses":       extract_diagnoses(text_lower),
        "medications":     extract_medications(text_lower),
        "lab_values":      extract_lab_values(text_lower),
        "medical_history": extract_medical_history(text_lower),
        "location_city":   extract_location(text_lower),
        "confidence":      {}
    }

    # ── CONFIDENCE SCORES ────────────────────────────
    # tells frontend which fields to highlight
    fields["confidence"] = calculate_confidence(fields)

    return fields


# ── EXTRACT AGE ──────────────────────────────────────
def extract_age(text: str):
    patterns = [
        r'age[:\s]+(\d{1,3})',
        r'(\d{1,3})\s*years?\s*old',
        r'(\d{1,3})\s*yr',
        r'age\s*[-:]\s*(\d{1,3})'
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            age = int(match.group(1))
            if 1 <= age <= 120:
                return age
    return None


# ── EXTRACT GENDER ───────────────────────────────────
def extract_gender(text: str):
    if re.search(r'\b(male|man|mr\.?)\b', text):
        return "M"
    if re.search(r'\b(female|woman|mrs\.?|ms\.?)\b', text):
        return "F"
    if re.search(r'\bsex\s*[:]\s*m\b', text):
        return "M"
    if re.search(r'\bsex\s*[:]\s*f\b', text):
        return "F"
    return None


# ── EXTRACT DIAGNOSES ────────────────────────────────
def extract_diagnoses(text: str) -> list:
    known_diseases = [
        ("type 2 diabetes",        "Type 2 Diabetes"),
        ("type ii diabetes",       "Type 2 Diabetes"),
        ("diabetes mellitus",      "Type 2 Diabetes"),
        ("t2dm",                   "Type 2 Diabetes"),
        ("hypertension",           "Hypertension"),
        ("high blood pressure",    "Hypertension"),
        ("breast cancer",          "Breast Cancer"),
        ("copd",                   "COPD"),
        ("chronic obstructive",    "COPD"),
        ("rheumatoid arthritis",   "Rheumatoid Arthritis"),
        ("depression",             "Depression"),
        ("asthma",                 "Asthma"),
        ("chronic kidney disease", "Chronic Kidney Disease"),
        ("ckd",                    "Chronic Kidney Disease"),
        ("renal failure",          "Chronic Kidney Disease"),
        ("parkinson",              "Parkinson's Disease"),
        ("lupus",                  "Lupus"),
        ("sle",                    "Lupus"),
    ]

    found = []
    for keyword, standard_name in known_diseases:
        if keyword in text:
            if standard_name not in found:
                found.append(standard_name)

    return found


# ── EXTRACT MEDICATIONS ──────────────────────────────
def extract_medications(text: str) -> list:
    known_meds = [
        "metformin", "insulin", "glipizide",
        "lisinopril", "amlodipine", "losartan",
        "tamoxifen", "letrozole",
        "tiotropium", "salbutamol",
        "methotrexate", "hydroxychloroquine",
        "sertraline", "fluoxetine",
        "budesonide", "montelukast",
        "furosemide", "erythropoietin",
        "levodopa", "pramipexole",
        "prednisone"
    ]

    found = []
    for med in known_meds:
        if med in text:
            found.append(med.capitalize())

    return found


# ── EXTRACT LAB VALUES ───────────────────────────────
def extract_lab_values(text: str) -> dict:
    lab_values = {}

    # HbA1c
    hba1c = re.search(
        r'hba1c\s*[:=]?\s*([\d.]+)', text
    )
    if hba1c:
        lab_values["HbA1c"] = float(hba1c.group(1))

    # BMI
    bmi = re.search(
        r'bmi\s*[:=]?\s*([\d.]+)', text
    )
    if bmi:
        lab_values["BMI"] = float(bmi.group(1))

    # Creatinine
    creatinine = re.search(
        r'creatinine\s*[:=]?\s*([\d.]+)', text
    )
    if creatinine:
        lab_values["creatinine"] = float(creatinine.group(1))

    # Blood pressure
    bp = re.search(
        r'b\.?p\.?\s*[:=]?\s*(\d{2,3})\s*/\s*(\d{2,3})', text
    )
    if bp:
        lab_values["blood_pressure"] = f"{bp.group(1)}/{bp.group(2)}"

    return lab_values


# ── EXTRACT MEDICAL HISTORY ──────────────────────────
def extract_medical_history(text: str) -> list:
    history = []

    conditions = [
        ("no cardiovascular",     "no cardiovascular disease"),
        ("no heart disease",      "no cardiovascular disease"),
        ("no prior chemo",        "no prior chemotherapy"),
        ("no chemotherapy",       "no prior chemotherapy"),
        ("no renal",              "no renal impairment"),
        ("no kidney",             "no renal impairment"),
        ("no insulin",            "no insulin therapy"),
        ("non smoker",            "non-smoker"),
        ("non-smoker",            "non-smoker"),
        ("no cancer",             "no active cancer"),
        ("no depression",         "no severe depression"),
        ("no pregnancy",          "no pregnancy"),
    ]

    for keyword, standard in conditions:
        if keyword in text:
            if standard not in history:
                history.append(standard)

    return history


# ── EXTRACT LOCATION ─────────────────────────────────
def extract_location(text: str) -> str:
    cities = [
        "mumbai", "delhi", "pune", "bangalore",
        "chennai", "hyderabad", "kolkata", "ahmedabad"
    ]
    for city in cities:
        if city in text:
            return city.capitalize()
    return None


# ── CONFIDENCE SCORES ────────────────────────────────
# Returns high/medium/low for each field
# Used by frontend to show which fields to verify
def calculate_confidence(fields: dict) -> dict:
    confidence = {}

    confidence["age"] = (
        "high" if fields["age"] else "low"
    )
    confidence["gender"] = (
        "high" if fields["gender"] else "low"
    )
    confidence["diagnoses"] = (
        "high"   if len(fields["diagnoses"]) > 0
        else "low"
    )
    confidence["medications"] = (
        "high"   if len(fields["medications"]) > 0
        else "medium"
    )
    confidence["lab_values"] = (
        "high"   if len(fields["lab_values"]) >= 2
        else "medium" if len(fields["lab_values"]) == 1
        else "low"
    )
    confidence["location_city"] = (
        "high" if fields["location_city"] else "low"
    )

    return confidence


# ── TEST ─────────────────────────────────────────────
if __name__ == "__main__":
    # test with fake medical text
    # (simulates what OCR would extract from a report)
    sample_text = """
    Patient Medical Report
    
    Age: 58 years old
    Sex: Male
    
    Diagnosis: COPD (Chronic Obstructive Pulmonary Disease)
    
    Current Medications:
    - Salbutamol 2.5mg
    
    Lab Results:
    BMI: 24.0
    HbA1c: 6.1
    Creatinine: 0.9
    BP: 128/82
    
    Medical History:
    No cardiovascular disease
    No active cancer
    Non-smoker
    
    Location: Delhi
    """

    print("📄 Testing OCR Parser with sample text...\n")
    fields = parse_medical_text(sample_text)

    print(f"Age:          {fields['age']}")
    print(f"Gender:       {fields['gender']}")
    print(f"Diagnoses:    {fields['diagnoses']}")
    print(f"Medications:  {fields['medications']}")
    print(f"Lab Values:   {fields['lab_values']}")
    print(f"History:      {fields['medical_history']}")
    print(f"Location:     {fields['location_city']}")
    print(f"\nConfidence:   {fields['confidence']}")