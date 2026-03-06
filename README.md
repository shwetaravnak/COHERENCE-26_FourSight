# ClinMatch AI
AI-Powered Clinical Trial Eligibility & Matching Engine

## Quick Start

### 1. Install & run backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Open the app
- **Option A (recommended):** Open **http://localhost:8000/** or **http://localhost:8000/app/** in your browser
- **Option B:** Serve the frontend separately (e.g. `npx serve frontend` on port 3000 or 5500) and open that URL

## Features
- Patient form submission & AI trial matching
- PDF/Image upload with OCR extraction (optional: install pytesseract, pdfplumber)
- Researcher dashboard with trial selector
- Inquiry flow (patient interest → researcher accept/decline)
- Admin stats & trial management

## Team
- Member 1: Data + Parser
- Member 2: Matching Engine
- Member 3: FastAPI Backend
- Member 4: Frontend