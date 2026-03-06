from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import json
import uuid
import shutil
import os

# ── IMPORT ALL OUR FILES ─────────────────────────────
from database import get_db, init_db
from models import User, Patient, Trial, MatchResult, Inquiry
from anonymizer import (
    prepare_patient_for_db,
    hash_password,
    verify_password,
    generate_patient_hash
)
from criteria_parser import get_parsed_criteria_json
from rule_matcher import match_patient_to_trial
from ml_matcher import ml_match
from scorer import score_patient_against_all_trials
from explainer import generate_explanation
from ocr_parser import extract_from_file

# ── APP SETUP ────────────────────────────────────────
app = FastAPI(title="ClinMatch AI", version="1.0.0")

# ── CORS ─────────────────────────────────────────────
# Allow frontend from common dev ports (file:// and different ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5500",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ── TEMP UPLOAD FOLDER ───────────────────────────────
UPLOAD_DIR = "../data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── SERVE FRONTEND ───────────────────────────────────
# Open http://localhost:8000/ or http://localhost:8000/app/ to use the app
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(_BASE_DIR, "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# ════════════════════════════════════════════════════
# STARTUP — runs when server starts
# ════════════════════════════════════════════════════
@app.on_event("startup")
def startup():
    # create all tables
    init_db()
    # load trials from JSON into DB
    seed_trials()
    print("[OK] ClinMatch AI server started")


def seed_trials():
    from database import SessionLocal
    db = SessionLocal()

    # only seed if trials table is empty
    existing = db.query(Trial).count()
    if existing > 0:
        print(f"[OK] {existing} trials already in database")
        db.close()
        return

    # load from trials.json
    trials_path = os.path.join(
        os.path.dirname(__file__),
        "../data/trials.json"
    )

    if not os.path.exists(trials_path):
        print("[ERR] trials.json not found")
        db.close()
        return

    with open(trials_path) as f:
        trials_data = json.load(f)

    for t in trials_data:
        # parse criteria text into JSON rules
        criteria_json = get_parsed_criteria_json(
            t.get("inclusion_text", ""),
            t.get("exclusion_text", "")
        )

        trial = Trial(
            trial_id        = t["trial_id"],
            title           = t["title"],
            phase           = t["phase"],
            disease_area    = t["disease_area"],
            sponsor         = t["sponsor"],
            locations       = json.dumps(t["locations"]),
            inclusion_text  = t["inclusion_text"],
            exclusion_text  = t["exclusion_text"],
            criteria_parsed = criteria_json,
            is_active       = True
        )
        db.add(trial)

    db.commit()
    db.close()
    print(f"[OK] {len(trials_data)} trials seeded into database")


# ════════════════════════════════════════════════════
# PYDANTIC MODELS — request/response shapes
# ════════════════════════════════════════════════════
class RegisterRequest(BaseModel):
    email:       str
    password:    str
    full_name:   str
    role:        str   # patient / researcher / admin
    institution: Optional[str] = None

class LoginRequest(BaseModel):
    email:    str
    password: str
    role:     str

class PatientFormRequest(BaseModel):
    user_id:         str
    age:             int
    gender:          str
    diagnoses:       List[str]
    medications:     List[str]
    lab_values:      dict
    medical_history: List[str]
    location_city:   str
    location_state:  Optional[str] = "India"

class InquirySendRequest(BaseModel):
    patient_hash: str
    trial_id:     str
    patient_note: Optional[str] = ""

class InquiryRespondRequest(BaseModel):
    researcher_note: Optional[str] = ""


# ════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ════════════════════════════════════════════════════

# ── REGISTER ─────────────────────────────────────────
@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # check if email already exists
    existing = db.query(User).filter(
        User.email == req.email
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    user = User(
        user_id          = str(uuid.uuid4()),
        email            = req.email,
        hashed_password  = hash_password(req.password),
        role             = req.role.lower(),   # always store lowercase
        full_name        = req.full_name,
        institution      = req.institution
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Registration successful",
        "user_id": user.user_id,
        "role":    user.role
    }


# ── LOGIN ────────────────────────────────────────────
@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.email == req.email,
        User.role  == req.role.lower()   # compare lowercase to lowercase
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect password"
        )

    return {
        "message":   "Login successful",
        "user_id":   user.user_id,
        "role":      user.role,
        "full_name": user.full_name
    }


# ════════════════════════════════════════════════════
# TRIAL ENDPOINTS
# ════════════════════════════════════════════════════

# ── GET ALL TRIALS ───────────────────────────────────
@app.get("/trials")
def get_trials(
    location:     Optional[str] = None,
    phase:        Optional[int] = None,
    disease_area: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Trial).filter(Trial.is_active == True)

    if phase:
        query = query.filter(Trial.phase == phase)

    if disease_area:
        query = query.filter(
            Trial.disease_area.contains(disease_area)
        )

    trials = query.all()

    # filter by location if provided
    if location:
        trials = [
            t for t in trials
            if location.lower() in t.locations.lower()
        ]

    result = []
    for t in trials:
        result.append({
            "trial_id":      t.trial_id,
            "title":         t.title,
            "phase":         t.phase,
            "disease_area":  t.disease_area,
            "sponsor":       t.sponsor,
            "locations":     json.loads(t.locations),
            "inclusion_text": t.inclusion_text,
            "exclusion_text": t.exclusion_text
        })

    return result


# ── GET ONE TRIAL ────────────────────────────────────
@app.get("/trials/{trial_id}")
def get_trial(trial_id: str, db: Session = Depends(get_db)):
    trial = db.query(Trial).filter(
        Trial.trial_id == trial_id
    ).first()

    if not trial:
        raise HTTPException(
            status_code=404,
            detail="Trial not found"
        )

    return {
        "trial_id":       trial.trial_id,
        "title":          trial.title,
        "phase":          trial.phase,
        "disease_area":   trial.disease_area,
        "sponsor":        trial.sponsor,
        "locations":      json.loads(trial.locations),
        "inclusion_text": trial.inclusion_text,
        "exclusion_text": trial.exclusion_text
    }


# ── ADD NEW TRIAL (admin) ────────────────────────────
@app.post("/trials/add")
def add_trial(trial_data: dict, db: Session = Depends(get_db)):
    criteria_json = get_parsed_criteria_json(
        trial_data.get("inclusion_text", ""),
        trial_data.get("exclusion_text", "")
    )

    trial = Trial(
        trial_id        = f"T{str(uuid.uuid4())[:8].upper()}",
        title           = trial_data["title"],
        phase           = trial_data["phase"],
        disease_area    = trial_data["disease_area"],
        sponsor         = trial_data["sponsor"],
        locations       = json.dumps(trial_data["locations"]),
        inclusion_text  = trial_data["inclusion_text"],
        exclusion_text  = trial_data["exclusion_text"],
        criteria_parsed = criteria_json,
        is_active       = True
    )
    db.add(trial)
    db.commit()

    return {
        "message":  "Trial added successfully",
        "trial_id": trial.trial_id
    }


# ════════════════════════════════════════════════════
# PATIENT ENDPOINTS
# ════════════════════════════════════════════════════

# ── SUBMIT FORM ──────────────────────────────────────
@app.post("/patient/submit-form")
def submit_patient_form(
    req: PatientFormRequest,
    db: Session = Depends(get_db)
):
    # anonymize and prepare data
    form_data = {
        "age":             req.age,
        "gender":          req.gender,
        "diagnoses":       req.diagnoses,
        "medications":     req.medications,
        "lab_values":      req.lab_values,
        "medical_history": req.medical_history,
        "location_city":   req.location_city,
        "location_state":  req.location_state
    }

    patient_data = prepare_patient_for_db(req.user_id, form_data)

    # save to database
    patient = Patient(**patient_data)
    db.add(patient)
    db.commit()

    # run matching immediately
    results = run_matching(
        patient_data["patient_hash"], db
    )

    return {
        "message":      "Patient data saved",
        "patient_hash": patient_data["patient_hash"],
        "matches_found": len(results)
    }


# ── UPLOAD PDF/IMAGE ─────────────────────────────────
@app.post("/patient/upload-file")
async def upload_patient_file(
    file: UploadFile = File(...)
):
    # save file temporarily
    temp_path = os.path.join(
        UPLOAD_DIR,
        f"temp_{uuid.uuid4()}_{file.filename}"
    )

    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # extract fields using OCR
    extracted = extract_from_file(temp_path)

    # delete temp file
    os.remove(temp_path)

    if extracted.get("error"):
        raise HTTPException(
            status_code=400,
            detail=extracted.get("message", "OCR failed")
        )

    return {
        "message":   "File processed successfully",
        "extracted": extracted
    }


# ── GET PATIENT MATCHES ──────────────────────────────
@app.get("/patient/{patient_hash}/matches")
def get_patient_matches(
    patient_hash: str,
    db: Session = Depends(get_db)
):
    matches = db.query(MatchResult).filter(
        MatchResult.patient_hash == patient_hash
    ).order_by(
        MatchResult.final_score.desc()
    ).all()

    if not matches:
        raise HTTPException(
            status_code=404,
            detail="No matches found for this patient"
        )

    result = []
    for m in matches:
        trial = db.query(Trial).filter(
            Trial.trial_id == m.trial_id
        ).first()

        result.append({
            "trial_id":          m.trial_id,
            "title":             trial.title if trial else "",
            "phase":             trial.phase if trial else "",
            "disease_area":      trial.disease_area if trial else "",
            "sponsor":           trial.sponsor if trial else "",
            "locations":         json.loads(trial.locations) if trial else [],
            "rule_score":        m.rule_score,
            "ml_score":          m.ml_score,
            "final_score":       m.final_score,
            "percentage":        round(m.final_score * 100, 1),
            "is_eligible":       m.is_eligible,
            "criteria_breakdown": json.loads(m.criteria_breakdown),
            "explanation_text":  m.explanation_text
        })

    return result


# ── GET EXPLANATION ──────────────────────────────────
@app.get("/explain/{patient_hash}/{trial_id}")
def get_explanation(
    patient_hash: str,
    trial_id:     str,
    db: Session = Depends(get_db)
):
    match = db.query(MatchResult).filter(
        MatchResult.patient_hash == patient_hash,
        MatchResult.trial_id     == trial_id
    ).first()

    if not match:
        raise HTTPException(
            status_code=404,
            detail="Match result not found"
        )

    trial = db.query(Trial).filter(
        Trial.trial_id == trial_id
    ).first()

    patient = db.query(Patient).filter(
        Patient.patient_hash == patient_hash
    ).first()

    score_data = {
        "rule_score":        match.rule_score,
        "ml_score":          match.ml_score,
        "final_score":       match.final_score,
        "is_eligible":       match.is_eligible,
        "criteria_breakdown": json.loads(match.criteria_breakdown),
        "passed": sum(
            1 for c in json.loads(match.criteria_breakdown)
            if c["status"] == "PASS"
        ),
        "total": len(json.loads(match.criteria_breakdown))
    }

    explanation = generate_explanation(
        patient.__dict__ if patient else {},
        trial.__dict__   if trial   else {},
        score_data
    )

    return explanation


# ════════════════════════════════════════════════════
# MATCHING ENGINE
# ════════════════════════════════════════════════════
def run_matching(patient_hash: str, db: Session):
    # get patient
    patient = db.query(Patient).filter(
        Patient.patient_hash == patient_hash
    ).first()

    if not patient:
        return []

    # get all active trials
    trials = db.query(Trial).filter(
        Trial.is_active == True
    ).all()

    results = []

    for trial in trials:
        trial_dict = {
            "trial_id":       trial.trial_id,
            "title":          trial.title,
            "phase":          trial.phase,
            "disease_area":   trial.disease_area,
            "locations":      trial.locations,
            "inclusion_text": trial.inclusion_text,
            "exclusion_text": trial.exclusion_text,
            "criteria_parsed": trial.criteria_parsed
        }

        patient_dict = {
            "age":             patient.age,
            "gender":          patient.gender,
            "diagnoses":       patient.diagnoses,
            "medications":     patient.medications,
            "lab_values":      patient.lab_values,
            "medical_history": patient.medical_history,
            "location_city":   patient.location_city
        }

        # rule based matching
        rule_result = match_patient_to_trial(
            patient_dict, trial_dict
        )

        # ml matching
        ml_result = ml_match(patient_dict, trial_dict)

        # scoring
        from scorer import calculate_final_score
        score_data = calculate_final_score(
            rule_result, ml_result,
            patient_dict, trial_dict
        )

        # explanation
        explanation = generate_explanation(
            patient_dict, trial_dict,
            {**score_data,
             "criteria_breakdown": rule_result["breakdown"],
             "passed": rule_result["passed"],
             "total":  rule_result["total"]}
        )

        # save to database
        match_id = str(uuid.uuid4())
        match = MatchResult(
            match_id           = match_id,
            patient_hash       = patient_hash,
            trial_id           = trial.trial_id,
            rule_score         = score_data["rule_score"],
            ml_score           = score_data["ml_score"],
            final_score        = score_data["final_score"],
            is_eligible        = score_data["is_eligible"],
            criteria_breakdown = json.dumps(
                                     rule_result["breakdown"]
                                 ),
            explanation_text   = explanation["summary"]
        )
        db.add(match)
        results.append(match)

    db.commit()
    return results


# ════════════════════════════════════════════════════
# INQUIRY ENDPOINTS
# ════════════════════════════════════════════════════

# ── SEND INQUIRY ─────────────────────────────────────
@app.post("/inquiry/send")
def send_inquiry(
    req: InquirySendRequest,
    db: Session = Depends(get_db)
):
    # check match exists
    match = db.query(MatchResult).filter(
        MatchResult.patient_hash == req.patient_hash,
        MatchResult.trial_id     == req.trial_id
    ).first()

    if not match:
        raise HTTPException(
            status_code=404,
            detail="Match not found"
        )

    # check no duplicate inquiry
    existing = db.query(Inquiry).filter(
        Inquiry.patient_hash == req.patient_hash,
        Inquiry.trial_id     == req.trial_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Inquiry already sent for this trial"
        )

    inquiry = Inquiry(
        inquiry_id   = str(uuid.uuid4()),
        patient_hash = req.patient_hash,
        trial_id     = req.trial_id,
        match_score  = match.final_score,
        status       = "pending",
        patient_note = req.patient_note
    )
    db.add(inquiry)
    db.commit()

    return {
        "message":    "Inquiry sent successfully",
        "inquiry_id": inquiry.inquiry_id,
        "status":     "pending"
    }


# ── GET PATIENT INQUIRIES ────────────────────────────
@app.get("/inquiry/patient/{patient_hash}")
def get_patient_inquiries(
    patient_hash: str,
    db: Session = Depends(get_db)
):
    inquiries = db.query(Inquiry).filter(
        Inquiry.patient_hash == patient_hash
    ).all()

    result = []
    for inq in inquiries:
        trial = db.query(Trial).filter(
            Trial.trial_id == inq.trial_id
        ).first()

        result.append({
            "inquiry_id":      inq.inquiry_id,
            "trial_id":        inq.trial_id,
            "trial_title":     trial.title if trial else "",
            "match_score":     inq.match_score,
            "status":          inq.status,
            "patient_note":    inq.patient_note,
            "researcher_note": inq.researcher_note,
            "created_at":      str(inq.created_at)
        })

    return result


# ── GET RESEARCHER INQUIRIES ─────────────────────────
@app.get("/inquiry/researcher/{trial_id}")
def get_researcher_inquiries(
    trial_id: str,
    db: Session = Depends(get_db)
):
    inquiries = db.query(Inquiry).filter(
        Inquiry.trial_id == trial_id
    ).order_by(
        Inquiry.match_score.desc()
    ).all()

    result = []
    for inq in inquiries:
        patient = db.query(Patient).filter(
            Patient.patient_hash == inq.patient_hash
        ).first()

        match = db.query(MatchResult).filter(
            MatchResult.patient_hash == inq.patient_hash,
            MatchResult.trial_id     == trial_id
        ).first()

        result.append({
            "inquiry_id":        inq.inquiry_id,
            "patient_hash":      inq.patient_hash,
            "match_score":       inq.match_score,
            "status":            inq.status,
            "patient_note":      inq.patient_note,
            "age":               patient.age if patient else None,
            "gender":            patient.gender if patient else None,
            "location_city":     patient.location_city if patient else None,
            "diagnoses":         json.loads(patient.diagnoses) if patient else [],
            "medications":       json.loads(patient.medications) if patient else [],
            "lab_values":        json.loads(patient.lab_values) if patient else {},
            "criteria_breakdown": json.loads(match.criteria_breakdown) if match else []
        })

    return result


# ── ACCEPT INQUIRY ───────────────────────────────────
@app.post("/inquiry/accept/{inquiry_id}")
def accept_inquiry(
    inquiry_id: str,
    req: InquiryRespondRequest,
    db: Session = Depends(get_db)
):
    inquiry = db.query(Inquiry).filter(
        Inquiry.inquiry_id == inquiry_id
    ).first()

    if not inquiry:
        raise HTTPException(
            status_code=404,
            detail="Inquiry not found"
        )

    inquiry.status          = "accepted"
    inquiry.researcher_note = req.researcher_note
    db.commit()

    return {
        "message": "Inquiry accepted",
        "status":  "accepted"
    }


# ── DECLINE INQUIRY ──────────────────────────────────
@app.post("/inquiry/decline/{inquiry_id}")
def decline_inquiry(
    inquiry_id: str,
    req: InquiryRespondRequest,
    db: Session = Depends(get_db)
):
    inquiry = db.query(Inquiry).filter(
        Inquiry.inquiry_id == inquiry_id
    ).first()

    if not inquiry:
        raise HTTPException(
            status_code=404,
            detail="Inquiry not found"
        )

    inquiry.status          = "declined"
    inquiry.researcher_note = req.researcher_note
    db.commit()

    return {
        "message": "Inquiry declined",
        "status":  "declined"
    }


# ════════════════════════════════════════════════════
# RESEARCHER ENDPOINTS
# ════════════════════════════════════════════════════

# ── GET MATCHED PATIENTS FOR TRIAL ───────────────────
@app.get("/researcher/trial/{trial_id}/patients")
def get_matched_patients(
    trial_id: str,
    db: Session = Depends(get_db)
):
    matches = db.query(MatchResult).filter(
        MatchResult.trial_id    == trial_id,
        MatchResult.is_eligible == True
    ).order_by(
        MatchResult.final_score.desc()
    ).all()

    result = []
    for m in matches:
        patient = db.query(Patient).filter(
            Patient.patient_hash == m.patient_hash
        ).first()

        inquiry = db.query(Inquiry).filter(
            Inquiry.patient_hash == m.patient_hash,
            Inquiry.trial_id     == trial_id
        ).first()

        result.append({
            "patient_hash":      m.patient_hash,
            "final_score":       m.final_score,
            "percentage":        round(m.final_score * 100, 1),
            "rule_score":        m.rule_score,
            "ml_score":          m.ml_score,
            "age":               patient.age if patient else None,
            "gender":            patient.gender if patient else None,
            "location_city":     patient.location_city if patient else None,
            "diagnoses":         json.loads(patient.diagnoses) if patient else [],
            "medications":       json.loads(patient.medications) if patient else [],
            "lab_values":        json.loads(patient.lab_values) if patient else {},
            "criteria_breakdown": json.loads(m.criteria_breakdown),
            "inquiry_status":    inquiry.status if inquiry else None,
            "has_inquiry":       inquiry is not None
        })

    return result


# ════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ════════════════════════════════════════════════════

# ── GET ALL USERS ────────────────────────────────────
@app.get("/admin/users")
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [
        {
            "user_id":   u.user_id,
            "email":     u.email,
            "role":      u.role,
            "full_name": u.full_name,
            "created_at": str(u.created_at)
        }
        for u in users
    ]


# ── GET STATS ────────────────────────────────────────
@app.get("/admin/stats")
def get_stats(db: Session = Depends(get_db)):
    total_patients   = db.query(Patient).count()
    total_trials     = db.query(Trial).count()
    total_matches    = db.query(MatchResult).count()
    total_inquiries  = db.query(Inquiry).count()
    total_researchers = db.query(User).filter(
        User.role == "researcher"
    ).count()

    pending  = db.query(Inquiry).filter(
        Inquiry.status == "pending"
    ).count()
    accepted = db.query(Inquiry).filter(
        Inquiry.status == "accepted"
    ).count()
    declined = db.query(Inquiry).filter(
        Inquiry.status == "declined"
    ).count()

    return {
        "total_patients":    total_patients,
        "total_trials":      total_trials,
        "total_matches":     total_matches,
        "total_inquiries":   total_inquiries,
        "total_researchers": total_researchers,
        "inquiry_stats": {
            "pending":  pending,
            "accepted": accepted,
            "declined": declined
        }
    }


# ════════════════════════════════════════════════════
# ROUTES & REDIRECTS
# ════════════════════════════════════════════════════
@app.get("/")
def root():
    """Redirect to the app UI."""
    return RedirectResponse(url="/app/", status_code=302)

@app.get("/app")
def app_redirect():
    """Redirect /app to /app/ (trailing slash required for StaticFiles)."""
    return RedirectResponse(url="/app/", status_code=302)

@app.get("/api/status")
def api_status():
    """API health check for programmatic access."""
    return {
        "message": "ClinMatch AI API is running",
        "version": "1.0.0",
        "docs":    "/docs",
        "app":     "/app/"
    }