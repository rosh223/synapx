from models.schemas import ExtractionResultSchema, FinalOutputSchema, ClaimRoutingSchema

class RoutingEngine:
    def __init__(self):
        self.investigation_keywords = ["fraud", "inconsistent", "staged", "suspicious", "deliberate", "unclear"]

    def evaluate(self, extraction: ExtractionResultSchema) -> FinalOutputSchema:
        """Route the claim using the first matching business rule."""
        route = None
        reasoning = ""

        # Priority matters: missing data outranks investigation, injury, and value checks.
        if extraction.missingMandatoryFields and len(extraction.missingMandatoryFields) > 0:
            route = ClaimRoutingSchema.MANUAL_REVIEW
            reasoning = f"Route to Manual Review because mandatory fields are missing: {', '.join(extraction.missingMandatoryFields)}"

        elif self._contains_fraud_keywords(extraction.incident.description):
            route = ClaimRoutingSchema.INVESTIGATION_FLAG
            reasoning = "Route to Investigation Flag because suspicious keywords (e.g., fraud, staged) were found in the incident description."

        elif self._has_injuries(extraction):
            route = ClaimRoutingSchema.SPECIALIST_QUEUE
            reasoning = "Route to Specialist Queue because injuries were reported among the involved parties."

        elif self._is_low_value(extraction):
            route = ClaimRoutingSchema.FAST_TRACK
            reasoning = "Route to Fast-Track because the estimated damage is under the $25,000 threshold and no other red flags were found."

        else:
            route = ClaimRoutingSchema.MANUAL_REVIEW
            reasoning = "Route to Manual Review. Claim does not meet Fast-Track criteria and requires standard processing."

        return FinalOutputSchema(
            extractedFields=extraction,
            missingFields=extraction.missingMandatoryFields,
            recommendedRoute=route,
            reasoning=reasoning
        )

    def _contains_fraud_keywords(self, description: str) -> bool:
        desc_lower = description.lower()
        return any(keyword in desc_lower for keyword in self.investigation_keywords)

    def _has_injuries(self, extraction: ExtractionResultSchema) -> bool:
        for party in extraction.involvedParties:
            if party.injuries and party.injuries.strip().lower() not in ["none", "no", "n/a", ""]:
                return True
        return False

    def _is_low_value(self, extraction: ExtractionResultSchema) -> bool:
        # Prefer the claim-level estimate when present.
        if extraction.initialEstimate is not None:
            return extraction.initialEstimate < 25000.0

        total_damage = sum((asset.estimatedDamage or 0) for asset in extraction.assets)
        return total_damage > 0 and total_damage < 25000.0
