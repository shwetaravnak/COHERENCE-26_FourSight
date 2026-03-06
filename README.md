# Overwrite README with our version
@"
# ClinMatch AI
AI-Powered Clinical Trial Eligibility & Matching Engine

## Setup
### Backend
cd backend
pip install fastapi uvicorn faker sentence-transformers
uvicorn main:app --reload

### Frontend
cd frontend
npm install
npm start

## Team
- Member 1: Data + Parser
- Member 2: Matching Engine
- Member 3: FastAPI Backend
- Member 4: React Frontend
"@ | Set-Content README.md