# Verdant & Co. — AI Support Platform

A full-stack AI-powered customer support platform for Verdant & Co., a fictional skincare brand. Customers can send messages, AI generates suggested replies using the brand knowledge base, and agents review and approve replies before customers can see them.

## Live Demo

- **Application:** https://verdant-ai-support.vercel.app/
- **Backend:** https://verdant-ai-support-tymu.onrender.com
- **Webhook:** https://verdant-ai-support-tymu.onrender.com/webhook
- **GitHub:** https://github.com/itsmeshwetadhar/verdant-ai-support

**Agent demo login**
- Email: `agent@verdantco.com`
- Password: `Verdant@123`

## Tech Stack

- Frontend: React.js, Vite, CSS
- Backend: Node.js, Express.js
- Database: Supabase (PostgreSQL)
- AI: Google Gemini API
- Authentication: JWT and bcrypt
- Deployment: Vercel (frontend), Render (backend)

## Key Features

- Customer and agent workspaces.
- Customer conversations and message history.
- AI-generated suggested replies based on the brand knowledge base.
- Agent review, editing and approval before sending replies.
- JWT-protected agent routes.
- HMAC-SHA256 webhook signature verification.
- One open conversation per customer.
- Customers see approved replies, not pending AI drafts.

## Local Setup

**1. Clone the repository**

```bash
git clone https://github.com/itsmeshwetadhar/verdant-ai-support.git
cd verdant-ai-support
```

**2. Backend setup**

```bash
cd server
npm install
```

Create `server/.env` using `server/.env.example` and configure:

- PORT
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- WEBHOOK_SECRET
- GEMINI_API_KEY
- AGENT_EMAIL
- AGENT_PASSWORD_HASH
- JWT_SECRET

Set up the required Supabase tables before running the application.

Start the backend:

```bash
npm run dev
```

**3. Frontend setup**

Open another terminal:

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

## Important Implementation Decisions

- AI replies are drafts, not automatic customer messages.
- Agents remain responsible for reviewing and approving every reply.
- Unknown order information is not invented by the AI.
- Webhook requests are verified using HMAC-SHA256.
- No actual WhatsApp messages are sent; the platform demonstrates the support workflow.

## Scaling and Reliability

**If a customer message fails overnight:** The system has a `webhook_events` table with processing statuses and error details, and drafts support a failed state. In production, I would add durable webhook retries, a dead-letter queue, monitoring for failed events and pending drafts, and alerts for the support team.

**If supporting 20 brands:** My first priority would be tenant isolation. Every customer, conversation, message, draft, agent and knowledge-base query must be scoped to an authenticated `brand_id`. I would introduce brand-specific knowledge bases, agent roles and permissions, and brand-level configuration to prevent cross-brand data access.

## AI Tools and Development

ChatGPT was used as a development assistant for debugging, code guidance, and deployment troubleshooting. I reviewed and tested the generated changes.

One issue encountered: `VITE_API_URL` was initially configured as a Secret in Vercel. Since Vite needs this public-prefixed variable available in the browser, I corrected its configuration and redeployed the frontend.

## Current Scope and Future Improvements

- Integrate a real order-management system for live order tracking.
- Add webhook retry processing and operational alerts.
- Add multi-brand tenant management and role-based permissions.
- Integrate a real messaging provider when required.
