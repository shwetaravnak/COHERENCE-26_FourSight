from sqlalchemy import Column, String, Integer, Float, Boolean, Text, DateTime
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    user_id        = Column(String, primary_key=True, index=True)
    email          = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role           = Column(String)   
    full_name      = Column(String)
    institution    = Column(String, nullable=True)  
    created_at     = Column(DateTime, default=func.now())


class Patient(Base):
    __tablename__ = "patients"

    patient_hash    = Column(String, primary_key=True, index=True)
    user_id         = Column(String, index=True)  
    age             = Column(Integer)
    gender          = Column(String)
    diagnoses       = Column(Text)    
    medications     = Column(Text)   
    lab_values      = Column(Text)    
    medical_history = Column(Text)   
    location_city   = Column(String, index=True)
    location_state  = Column(String)
    created_at      = Column(DateTime, default=func.now())

class Trial(Base):
    __tablename__ = "trials"

    trial_id         = Column(String, primary_key=True, index=True)
    title            = Column(String)
    phase            = Column(Integer)
    disease_area     = Column(String, index=True)
    sponsor          = Column(String)
    locations        = Column(Text)   
    inclusion_text   = Column(Text)  
    exclusion_text   = Column(Text)  
    criteria_parsed  = Column(Text)   
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=func.now())


class MatchResult(Base):
    __tablename__ = "match_results"

    match_id            = Column(String, primary_key=True, index=True)
    patient_hash        = Column(String, index=True)  
    trial_id            = Column(String, index=True)  
    rule_score          = Column(Float)   
    ml_score            = Column(Float)  
    final_score         = Column(Float, index=True)   
    is_eligible         = Column(Boolean)
    criteria_breakdown  = Column(Text)    
    explanation_text    = Column(Text)   
    created_at          = Column(DateTime, default=func.now())


class Inquiry(Base):
    __tablename__ = "inquiries"

    inquiry_id       = Column(String, primary_key=True, index=True)
    patient_hash     = Column(String, index=True)  
    trial_id         = Column(String, index=True)   
    match_score      = Column(Float)   
    status           = Column(String, default="pending")
    patient_note     = Column(Text, nullable=True)
    researcher_note  = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=func.now())
    updated_at       = Column(DateTime, onupdate=func.now())