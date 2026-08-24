# Project Notes

Standalone **Capstone Project Management** app (monitoring capstone projects) —
a copy of the "Project Tracker" startup codebase, fully decoupled from it.

- Stack: TanStack Start (React 19), Supabase, Groq
- Dev server: port **3001** (`strictPort`) so it can run alongside other local apps
- Not connected to Lovable; standard Vite plugin stack in `vite.config.ts`
- Database: dedicated Supabase project — credentials in `.env` (never committed)
