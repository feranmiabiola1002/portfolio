import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Where the site's mail sends "from". Works out of the box with Resend's
// shared test domain. Once feranmiabiola1002@gmail.com's own domain is
// verified in Resend, set RESEND_FROM_EMAIL in Vercel to switch it over
// without touching this file.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'FRENYTECH Website <onboarding@resend.dev>';
const TO_EMAIL = 'feranmiabiola1002@gmail.com';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTH = 2000;

// Best-effort in-memory rate limiter. Resets whenever the serverless
// function cold-starts and is per-instance only, so it is a first line of
// defense, not a hard guarantee — a captcha or a service like Upstash
// Redis would give stronger protection if spam becomes a real problem.
const submissions = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = submissions.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    submissions.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '')
      .split(',')[0]
      .trim() || req.socket?.remoteAddress || 'unknown';

    if (isRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        error: 'Too many submissions from this connection. Please try again in a minute.',
      });
    }

    const body = req.body || {};
    const { firstName, lastName, phone, email, service, message, company } = body;

    // Honeypot: real visitors never see or fill this field. Anything that
    // fills it is a bot — pretend success so it doesn't learn to adapt,
    // but never actually send the email.
    if (company) {
      return res.status(200).json({ success: true });
    }

    const errors = [];
    const trimmedFirst = typeof firstName === 'string' ? firstName.trim() : '';
    const trimmedLast = typeof lastName === 'string' ? lastName.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedService = typeof service === 'string' ? service.trim() : '';

    if (!trimmedFirst) errors.push('First name is required.');
    if (!trimmedLast) errors.push('Last name is required.');
    if (!trimmedEmail) errors.push('Email is required.');
    else if (!EMAIL_REGEX.test(trimmedEmail)) errors.push('Please enter a valid email address.');
    if (!trimmedMessage) errors.push('Message is required.');

    for (const [label, value] of [
      ['First name', trimmedFirst],
      ['Last name', trimmedLast],
      ['Email', trimmedEmail],
      ['Phone', trimmedPhone],
      ['Service', trimmedService],
      ['Message', trimmedMessage],
    ]) {
      if (value.length > MAX_FIELD_LENGTH) errors.push(`${label} is too long.`);
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(' ') });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('Contact API: RESEND_API_KEY is not set in the environment.');
      return res.status(500).json({
        success: false,
        error: 'Server email configuration error. Please contact us directly via WhatsApp or phone instead.',
      });
    }

    const fullName = `${trimmedFirst} ${trimmedLast}`.trim();
    const safeName = escapeHtml(fullName);
    const safeEmail = escapeHtml(trimmedEmail);
    const safePhone = trimmedPhone ? escapeHtml(trimmedPhone) : 'Not provided';
    const safeService = trimmedService ? escapeHtml(trimmedService) : 'Not specified';
    const safeMessage = escapeHtml(trimmedMessage).replace(/\n/g, '<br>');

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: trimmedEmail,
      subject: `New Website Contact — ${fullName}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
          <h2 style="color:#8B6914;margin-bottom:16px;">New Contact Form Submission</h2>
          <p style="margin:6px 0;"><strong>Name:</strong> ${safeName}</p>
          <p style="margin:6px 0;"><strong>Email:</strong> ${safeEmail}</p>
          <p style="margin:6px 0;"><strong>Phone:</strong> ${safePhone}</p>
          <p style="margin:6px 0;"><strong>Service Needed:</strong> ${safeService}</p>
          <p style="margin:16px 0 6px;"><strong>Message:</strong></p>
          <p style="margin:0;padding:12px 16px;background:#f5f5f5;border-radius:8px;">${safeMessage}</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e0e0e0;">
          <p style="color:#888;font-size:12px;">Sent from the FRENYTECH website contact form. Reply to this email to respond directly to ${safeName}.</p>
        </div>
      `,
      text: `New Contact Form Submission\n\nName: ${fullName}\nEmail: ${trimmedEmail}\nPhone: ${trimmedPhone || 'Not provided'}\nService Needed: ${trimmedService || 'Not specified'}\n\nMessage:\n${trimmedMessage}`,
    });

    if (error) {
      console.error('Resend API error:', error);
      return res.status(502).json({
        success: false,
        error: 'Failed to send your message. Please try again later or contact us directly via WhatsApp/phone.',
      });
    }

    return res.status(200).json({ success: true, message: 'Message sent successfully.', id: data?.id });
  } catch (err) {
    console.error('Contact API unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'Something went wrong on our end. Please try again later.',
    });
  }
}
