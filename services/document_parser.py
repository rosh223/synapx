import os
import pdfplumber

class DocumentParser:
    def parse_file(self, file_path: str) -> str:
        """Return text content from a supported document."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pdf':
            return self._parse_pdf(file_path)
        elif ext == '.txt':
            return self._parse_txt(file_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}. Only .pdf and .txt are supported.")

    def _parse_pdf(self, file_path: str) -> str:
        """Extract text from a PDF file."""
        extracted_text = []
        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        extracted_text.append(text)
            return self._clean_text("\n".join(extracted_text))
        except Exception as e:
            raise RuntimeError(f"Failed to parse PDF: {str(e)}")

    def _parse_txt(self, file_path: str) -> str:
        """Read text from a TXT file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return self._clean_text(f.read())
        except Exception as e:
            raise RuntimeError(f"Failed to read TXT file: {str(e)}")

    def _clean_text(self, raw_text: str) -> str:
        """Normalize parser output."""
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        return "\n".join(lines)
