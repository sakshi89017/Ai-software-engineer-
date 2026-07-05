# The AI Software Engineer (Gemini Integration)

A developer-focused AI Software Engineering Assistant built with FastAPI, Next.js, and Google Gemini API.

---

## 🛠️ Environment Configuration

To run the application with Google Gemini, replace the OpenAI key with your Google Gen AI key in `backend/.env`:

```env
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TITLE_MODEL=gemini-2.5-flash
```

*Note: The backend service uses the latest unified `google-genai` Python SDK.*

---

## 🚀 Running the Application

### 🐳 Option 1: Docker Compose

Bring up the entire stack (PostgreSQL database, FastAPI backend, and Next.js frontend) with a single command:

```bash
docker-compose up --build
```

Access the dashboard at **http://localhost:3000**.

### 💻 Option 2: Local Development

#### 1. Backend Service
1. Navigate to the `backend` folder.
2. Initialize virtual environment and install packages:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Run Alembic migrations and launch Uvicorn:
   ```bash
   alembic upgrade head
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```

#### 2. Frontend Application
1. Navigate to the `frontend` folder.
2. Install Node dependencies and launch the Next.js dev server:
   ```bash
   npm install
   npm run dev
   ```
