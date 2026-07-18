from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum

class PolicySchema(BaseModel):
    policyNumber: Optional[str] = Field(None, description="Policy number as shown on the document")
    policyholderName: Optional[str] = Field(None, description="Full name of the insured/policyholder")
    effectiveDateStart: Optional[str] = Field(None, description="Policy start date")
    effectiveDateEnd: Optional[str] = Field(None, description="Policy end date")

class IncidentSchema(BaseModel):
    date: Optional[str] = Field(None, description="Date of the incident")
    time: Optional[str] = Field(None, description="Time of the incident")
    location: Optional[str] = Field(None, description="Full address or description of where the loss occurred")
    description: Optional[str] = Field(None, description="Narrative description of what happened")
    authorityContacted: Optional[str] = Field(None, description="Police or Fire department name if contacted")
    reportNumber: Optional[str] = Field(None, description="Authority report number")

class PartyType(str, Enum):
    CLAIMANT = 'Claimant'
    THIRD_PARTY = 'Third Party'
    WITNESS = 'Witness'
    INSURED_DRIVER = 'Insured Driver'

class PartySchema(BaseModel):
    name: str
    type: PartyType
    contactDetails: Optional[str] = None
    injuries: Optional[str] = Field(None, description="Description of injuries if any")

class AssetSchema(BaseModel):
    type: str = Field(description="Vehicle, Property, etc.")
    id: str = Field(description="VIN, Plate Number, or Serial Number")
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[str] = None
    estimatedDamage: Optional[float] = Field(None, description="Dollar amount if specified")

class ClaimRoutingSchema(str, Enum):
    FAST_TRACK = 'FAST_TRACK'
    MANUAL_REVIEW = 'MANUAL_REVIEW'
    INVESTIGATION_FLAG = 'INVESTIGATION_FLAG'
    SPECIALIST_QUEUE = 'SPECIALIST_QUEUE'

class ExtractionResultSchema(BaseModel):
    policy: PolicySchema
    incident: IncidentSchema
    involvedParties: List[PartySchema]
    assets: List[AssetSchema]
    initialEstimate: Optional[float] = None
    missingMandatoryFields: List[str] = Field(description="List of fields that were required but not found in the document")

class FinalOutputSchema(BaseModel):
    extractedFields: ExtractionResultSchema
    missingFields: List[str]
    recommendedRoute: ClaimRoutingSchema
    reasoning: str = Field(description="Detailed explanation for the routing decision")
