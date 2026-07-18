import os
import json
from typing import Optional
from openai import OpenAI
from models.schemas import ExtractionResultSchema

class ExtractionAgent:
    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key
        self._client = None

        self.system_prompt = """
        You are an expert, highly meticulous Insurance Claims Adjuster and Data Extraction AI.
        Your task is to analyze First Notice of Loss (FNOL) documents and extract all relevant information 
        into a structured format.

        INSTRUCTIONS:
        1. Extract the Policy Information, Incident Details, Involved Parties, and Assets.
        2. Pay special attention to the Involved Parties: categorize them correctly as one of: "Claimant", "Third Party", "Witness", "Insured Driver".
        3. If there are any injuries mentioned, document them carefully under the specific party.
        4. If a field is explicitly stated in the text, extract it accurately.
        5. IMPORTANT: Identify missing mandatory fields. A field is "missing" if it is logically required for a claim 
           but not present in the text (e.g., Policy Number, Incident Date/Time, Insured Name, Vehicle VIN).
           List these missing fields in the `missingMandatoryFields` array.
        6. Do not hallucinate or make up data. If data is not present, omit it or leave it null.
        7. For estimatedDamage, provide a numeric dollar amount if mentioned, otherwise null.
        8. You MUST return your response as a valid JSON object matching the requested schema.
        """

    def extract_claim_data(self, raw_text: str) -> ExtractionResultSchema:
        """Extract structured claim data from raw document text."""
        # Keep startup independent of API credentials.
        if self._client is None:
            key = self._api_key or os.getenv("NVIDIA_API_KEY")
            if not key:
                raise RuntimeError("NVIDIA_API_KEY is not set. Please add it to your .env file.")
            
            self._client = OpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=key
            )

        try:
            # This endpoint does not enforce structured output server-side.
            schema_json = ExtractionResultSchema.model_json_schema()
            
            completion = self._client.chat.completions.create(
                model="minimaxai/minimax-m2.7",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": f"Extract data strictly according to this JSON Schema:\n{json.dumps(schema_json)}\n\nHere is the document text:\n\n{raw_text}"}
                ],
                temperature=0.0,
                max_tokens=4096,
            )

            content = completion.choices[0].message.content.strip()
            
            # Remove markdown JSON fences (e.g., ```json ... ```) safely
            if content.startswith("```"):
                lines = content.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                content = "\n".join(lines).strip()
            
            parsed_data = json.loads(content)
            return ExtractionResultSchema.model_validate(parsed_data)

        except json.JSONDecodeError as e:
            raise RuntimeError(f"AI did not return valid JSON: {str(e)}\nRaw Output: {content}")
        except Exception as e:
            raise RuntimeError(f"AI Extraction failed: {str(e)}")
