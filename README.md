# FRENYTECH Website

Static site (`index.html`) plus one Vercel serverless function (`api/contact.js`)
that sends contact-form messages to feranmiabiola1002@gmail.com via Resend.

## Local setup

```
npm install
cp .env.example .env.local   # then fill in RESEND_API_KEY
vercel dev                   # requires Vercel CLI: npm i -g vercel
```

`vercel dev` is needed (not a plain static server) because `/api/contact`
is a serverless function — a plain `index.html` file server won't run it.

## Deploying

1. Push this project to a GitHub repo (`.env`/`.env.local` are gitignored,
   so your API key never leaves your machine).
2. Import the repo in Vercel.
3. In Vercel → Project → Settings → Environment Variables, add:
   - `RESEND_API_KEY` — your Resend API key
   - (optional) `RESEND_FROM_EMAIL` — only after you verify a sending domain
     in Resend, e.g. `FRENYTECH <contact@frenytech.com>`
4. Deploy. No build command or output directory needed — Vercel serves
   `index.html` as-is and deploys `api/contact.js` automatically.

## Note on Resend's sandbox mode

Until you verify your own domain in Resend, you can only send from
`onboarding@resend.dev`, and Resend will only actually deliver to the
email address you signed up to Resend with. If that's
feranmiabiola1002@gmail.com, contact-form emails will arrive normally.
Verify a domain in Resend whenever you want to send from your own address
or expand who can receive mail.
