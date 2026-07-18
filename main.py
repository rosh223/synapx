import os
from dotenv import load_dotenv
from services.document_parser import DocumentParser
from services.extraction_agent import ExtractionAgent
from services.routing_engine import RoutingEngine

load_dotenv()

def main():
    print('--- ClaimSense Autonomous Agent Initialized ---')
    print(f"Environment: {os.getenv('NODE_ENV', 'development')}")
    
    print('\n--- Phase 2: Testing Document Ingestion ---')
    parser = DocumentParser()
    
    sample_pdf_path = os.path.join(os.path.dirname(__file__), 'data', 'ACORD-Automobile-Loss-Notice-12.05.16.pdf')
    
    try:
        print(f"Parsing file: {sample_pdf_path}")
        extracted_text = parser.parse_file(sample_pdf_path)
        print(f"Total extracted length: {len(extracted_text)} characters.")
        
        print('\n--- Phase 3 & 4: AI Extraction and Routing ---')
        agent = ExtractionAgent()
        router = RoutingEngine()
        
        print("Sending raw text to AI for structured extraction...")
        if not os.getenv("NVIDIA_API_KEY"):
            print("⚠️ WARNING: NVIDIA_API_KEY is not set in .env.")
            print("To see the full pipeline, please add your API key.")
        else:
            ai_result = agent.extract_claim_data(extracted_text)
            print("✅ Data Extracted Successfully.")
            
            print("Applying Business Routing Rules...")
            final_output = router.evaluate(ai_result)
            
            print("\n================ FINAL CLAIM REPORT ================")
            print(f"Routing Decision: {final_output.recommendedRoute.value}")
            print(f"Reasoning: {final_output.reasoning}")
            print(f"Missing Fields: {len(final_output.missingFields)}")
            print("==================================================\n")
            print("Full JSON Payload for Frontend:")
            print(final_output.model_dump_json(indent=2))
        
    except Exception as e:
        print(f"Error during execution: {e}")

if __name__ == '__main__':
    main()
