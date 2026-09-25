# DocuMind AI - Multi-Tenant AI Document Chat SaaS Platform

![DocuMind AI Architecture](https://img.shields.io/badge/Security-Strict%20Multi--Tenant%20Isolation-indigo?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20PostgreSQL%20%7C%20pgvector%20%7C%20OpenAI-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)

**DocuMind AI** is an enterprise-grade, multi-tenant AI Document Chat SaaS platform. Users create private workspaces/organizations, securely upload knowledge documents (PDF, DOCX, TXT), and chat with an AI assistant that answers questions **strictly from retrieved tenant documents** using high-precision Retrieval-Augmented Generation (RAG).

The application enforces **strict tenant boundary isolation** across every layer: authentication, API routing, database models, document chunks, and vector similarity search. Documents, embeddings, and conversations belonging to one organization can **never** be accessed or queried by another organization.

---

## 🌟 Key Features

### 1. Multi-Tenancy & Hard Boundary Isolation
- **Organization & Workspace Partitioning**: Every user belongs to one or more workspaces with role-based access control (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
- **Zero-Trust Client Resolution**: Tenant IDs supplied by the frontend are never trusted blindly; the server-side authorization middleware verifies the authenticated user's active membership in the target organization.
- **Database-Level Isolation**: All documents, chunks, embeddings, conversations, and messages contain direct foreign-key relationships to their respective `organizationId`.
- **Vector Search Isolation**: Vector queries in PostgreSQL `pgvector` include an unbreakable `WHERE c."organizationId" = $tenantId` predicate.
- **Cross-Tenant Test Suite**: Dedicated penetration tests specifically verifying that cross-tenant document inspection, deletion, and vector searches are blocked.

### 2. High-Precision RAG Pipeline
- **Multi-Format Document Ingestion**: Supports `.pdf`, `.docx`, and `.txt` files with automated parsing and text extraction.
- **Intelligent Semantic Chunking**: Recursive sentence and paragraph boundary preservation with configurable overlap (~150 chars) to maintain context across chunk borders.
- **Vector Embeddings**: Generates 1536-dimensional embeddings with OpenAI's `text-embedding-3-small`.
- **pgvector Cosine Search**: Searches chunk vectors with the `<=>` cosine distance operator and filters by relevance threshold.
- **Grounded, Anti-Hallucination Prompts**: System prompt instructs the LLM to answer strictly from provided context and explicitly state when an answer is not present in the documents.
- **Source Citations**: Answers include exact chunk citations displaying document titles, page numbers, similarity match percentages, and text snippets.

### 3. Real-Time AI Chat
- **Streaming Responses**: Token-by-token streaming via Server-Sent Events (SSE).
- **Persistent Conversation Threads**: Thread history saved per workspace and user.
- **Interactive Citation Inspector**: Popover modal for inspecting underlying document chunks and relevance scores.
- **Markdown & Code Highlighting**: Formats tables, lists, and code blocks cleanly.

### 4. SaaS Dashboard & Analytics
- **Workspace Metrics**: Real-time stats on total documents, indexed chunks, storage usage, and queries executed.
- **Document Management**: Processing status badges (`READY`, `PROCESSING`, `FAILED`), chunk preview inspector, and secure deletion.
- **Workspace Tuning**: Adjustable Top-K chunks slider and LLM temperature per organization.
- **Team Management**: Invite team members by email and assign roles.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS v4, Lucide Icons, React Markdown |
| **Backend** | Node.js (ESM), Express.js, TypeScript, Multer, Zod |
| **Database & Vectors** | PostgreSQL 16 with `pgvector` extension, Prisma ORM |
| **Authentication** | JWT (Access Tokens + Refresh Tokens), Bcrypt password hashing |
| **AI & Embeddings** | OpenAI API (`gpt-4o-mini`, `text-embedding-3-small`) |
| **Document Processing**| `pdf-parse`, `mammoth` (DOCX), UTF-8 text parser |
| **Deployment** | Docker, Docker Compose, Multi-stage builds, Nginx reverse proxy |

---

## 📐 System Architecture

```mermaid
graph TD
    subgraph Frontend ["Frontend (React + Vite + Tailwind v4)"]
        UI[SaaS Dashboard & Chat UI]
        AuthContext[Auth & Tenant Context]
        SSE[SSE Stream Reader]
    end

    subgraph Backend ["Backend (Node.js + Express + TypeScript)"]
        AuthMiddleware["JWT Authentication Middleware"]
        TenantGuard["Tenant Isolation Middleware (Membership Verification)"]
        DocController["Document Controller & Parser"]
        RagEngine["RAG Pipeline Orchestrator"]
    end

    subgraph Storage ["PostgreSQL + pgvector"]
        TenantTable[("organizations & members")]
        DocTable[("documents")]
        VectorTable[("document_chunks (embedding vector(1536))")]
        ChatTable[("conversations & messages")]
    end

    subgraph AI ["OpenAI Services"]
        EmbedAPI["text-embedding-3-small"]
        ChatAPI["gpt-4o-mini (Streaming)"]
    end

    UI --> AuthMiddleware
    AuthMiddleware --> TenantGuard
    TenantGuard --> DocController
    TenantGuard --> RagEngine

    DocController --> EmbedAPI
    EmbedAPI --> VectorTable

    RagEngine --> EmbedAPI
    RagEngine --> |"SELECT WHERE organizationId = :tenantId"| VectorTable
    RagEngine --> ChatAPI
    ChatAPI --> SSE
    SSE --> UI
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: v20 or higher
- **PostgreSQL with pgvector** (or Docker)
- **OpenAI API Key**

### 1. Clone & Install Dependencies

```bash
# Install root, backend, and frontend dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2. Configure Environment Variables

Create `.env` in `backend/`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/documind?schema=public"

# JWT Secrets
JWT_SECRET="your-secure-jwt-secret-at-least-32-chars"
JWT_REFRESH_SECRET="your-secure-refresh-token-secret"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# OpenAI
OPENAI_API_KEY="sk-proj-your-openai-api-key"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

# Storage & CORS
CORS_ORIGIN="http://localhost:5173"
MAX_FILE_SIZE_MB=25
```

### 3. Initialize Database & pgvector

Push the Prisma schema and run the seed script:

```bash
cd backend
npx prisma db push
npx prisma db seed
cd ..
```

### 4. Run Development Servers

Run backend and frontend concurrently:

```bash
# Terminal 1: Backend (Port 5000)
npm run dev:backend

# Terminal 2: Frontend (Port 5173)
npm run dev:frontend
```

Open your browser at `http://localhost:5173`.

---

## 🐳 Docker Deployment

The entire stack (PostgreSQL with `pgvector`, Backend API, and Frontend SPA) is packaged into Docker Compose:

```bash
# Provide your OpenAI API key in .env or pass it inline
export OPENAI_API_KEY="sk-proj-your-openai-key"

# Build and start all containers in detached mode
docker compose up -d --build
```

- **Frontend Application**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000`
- **Postgres pgvector**: `localhost:5432`

To shut down:
```bash
docker compose down
```

---

## 🧪 Security & Cross-Tenant Test Suite

Run the automated Vitest test suite to verify strict tenant isolation:

```bash
cd backend
npm test
```

### Test Coverage Highlights:
- **Tenant Forgery Prevention**: Rejects spoofed `x-organization-id` headers when user is not a verified member.
- **Cross-Tenant Document Access**: Returns `404 Not Found` if a user attempts to fetch another tenant's document ID.
- **Cross-Tenant Deletion Block**: Rejects deletion attempts of another tenant's files.
- **Vector Search Isolation**: Guarantees that Tenant A's document chunks are never retrieved for Tenant B's queries.
- **Conversation Isolation**: Prohibits users from loading chat threads from other organizations.

---

## 🌐 Cloud Deployment Options

### 1. Database (Cloud PostgreSQL with pgvector)
- **Supabase**: Free tier includes `pgvector` pre-installed (`CREATE EXTENSION IF NOT EXISTS vector;`).
- **Neon Serverless Postgres**: Supports `pgvector` out of the box.

### 2. Backend (Render / Railway / Fly.io)
1. Link your GitHub repository.
2. Set Root Directory to `backend`.
3. Build Command: `npm install && npx prisma generate && npm run build`.
4. Start Command: `node dist/index.js`.
5. Set environment variables: `DATABASE_URL`, `OPENAI_API_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`.

### 3. Frontend (Vercel / Cloudflare Pages)
1. Link your GitHub repository.
2. Set Root Directory to `frontend`.
3. Framework Preset: `Vite`.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
