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

---

## 📁 Code Upload & AI Analysis Module

The application enables developers to upload codebases and individual source files to perform detailed, context-aware AI analyses.

### 📊 Database Schema (UploadedFiles)
*   `id` (UUID): Primary key.
*   `user_id` (UUID): Foreign key referencing the authenticated user.
*   `filename` (VARCHAR): Safe name of the uploaded source file.
*   `language` (VARCHAR): Detected programming language of the file.
*   `size` (INTEGER): File size in bytes.
*   `path` (VARCHAR): Safe local file storage path.
*   `created_at` (TIMESTAMP): Upload timestamp.

### 🌐 REST API Specifications
*   `POST /api/uploads`: Upload a source file (multipart/form-data).
*   `GET /api/uploads`: List all uploads for the current authenticated user.
*   `GET /api/uploads/{id}`: Fetch file metadata and complete text content.
*   `DELETE /api/uploads/{id}`: Delete metadata and cleanup disk files.
*   `POST /api/uploads/{id}/analyze`: Streams code review, bug diagnostics, or unit test generation chunks via Server-Sent Events (SSE).

### 🔒 Security Implementations
*   **JWT Protection**: All file interactions are gated behind user authentication; users can only see or access their own uploads.
*   **Extension Validation**: Restricts uploads strictly to standard source text extensions (Python, JS, TS, Go, Rust, Java, C/C++, HTML, CSS, SQL, JSON, YAML, Markdown, TXT).
*   **Size Constraint**: Enforces a strict maximum limit of `20 MB` per file.
*   **Traversal Prevention**: Sanitizes file paths to prevent directory traversal vulnerabilities during local storage.
