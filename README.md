# Synpax — FNOL Automation Agent

Synpax is an AI-augmented claims processing platform designed to automate the lifecycle of First Notice of Loss (FNOL) documents. The system uses a strict decoupling pattern: **AI for data extraction** (via Groq's Llama 3.3) and **deterministic rules (pure Python code) for decision routing**.

## Features
- **Document Parsing:** Extracts text from PDF and TXT documents.
- **AI Extraction:** Uses Groq's Llama 3.3 model to intelligently extract structured JSON data (Policy Info, Incident Details, Involved Parties, Assets).
- **Rule-Based Routing:** Automatically routes claims to Fast-Track, Manual Review, Investigation, or Specialist queues based on deterministic business logic.
- **Stateless Architecture:** Uses `localStorage` on the frontend so no database is required.
- **Rate Limiting:** Built-in sliding window rate limiter to protect API endpoints.

## 1. Prerequisites
- Python 3.12+
- A valid [Groq API Key](https://console.groq.com/keys)

## 2. Local Setup & Installation

1. **Clone the repository and navigate to the project directory:**
   ```bash
   git clone <repo-url>
   cd Synpax
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install the dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables:**
   Copy the example `.env` file and add your Groq API key:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and paste your API key:
   ```env
   GROQ_API_KEY=gsk_your_api_key_here
   ```

5. **Run the Application:**
   ```bash
   python app.py
   ```
   Open your browser and navigate to [http://localhost:8000](http://localhost:8000). You can use the sample files in `static/samples/` to test the system.

## 3. Deployment (Render)

This project is fully configured for deployment on [Render](https://render.com) as a Web Service.

1. Push your repository to GitHub.
2. In your Render Dashboard, click **New +** → **Web Service**.
3. Connect your repository.
4. Render will automatically detect the settings from `render.yaml`.
5. **Important:** Scroll down to the **Environment Variables** section and add your Groq API Key:
   - **Key:** `GROQ_API_KEY`
   - **Value:** `gsk_your_api_key_here`
6. Click **Create Web Service**.

Once deployed, the FastAPI backend will serve both the API endpoints and the frontend dashboard seamlessly.
