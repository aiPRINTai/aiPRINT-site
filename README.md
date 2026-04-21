# aiPRINT.ai — AI-Generated Art Prints

Turn any idea into a gallery-worthy print.  
Source code for the **aiPRINT.ai** website.

## About
aiPRINT.ai transforms text prompts into unique, high-quality art prints.  
Customers can describe their idea, receive proofs, and order archival prints (metal, fine-art paper, or canvas).

## Tech Stack
- Frontend: HTML + Tailwind (CDN)
- Hosting: Vercel
- Contact form: self-hosted (Resend for delivery)
- Payments: Stripe Checkout
- Database: Neon Postgres (orders, users, admin audit log)
- Transactional email: Resend
- File storage: Vercel Blob
- AI image generation: Google Gemini (via serverless API route)
- Auth: JWT (30-day, HttpOnly cookie)

## Local / Dev (optional)
If/when we add serverless routes:
1. Install Node 18+
2. `npm install`
3. Add env vars (see `.env.example`)
4. Run locally with `vercel dev`

## Contact
info@aiPRINT.ai  
Instagram: @aiPRINT.ai

© 2025 aiPRINT.ai — All rights reserved.
