import nodemailer from 'nodemailer';
import { HttpError } from '../../middleware/errors.js';

/**
 * Delivery of one-time codes by email (SMTP) and SMS (Twilio or Africa's Talking).
 * Without a provider, development prints the message in the server console; production refuses.
 */
const isProd = process.env.NODE_ENV === 'production';
const env = process.env;

const mailer = env.SMTP_HOST && nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT ?? 587),
  secure: Number(env.SMTP_PORT) === 465,   // 465 = implicit TLS; 587 upgrades with STARTTLS
  requireTLS: Number(env.SMTP_PORT ?? 587) !== 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

function devFallback(channel, to, text) {
  if (isProd) throw new HttpError(503, `${channel} delivery is not configured`);
  console.log(`[dev ${channel}] to ${to}: ${text}`);
}

export async function sendEmail(to, subject, text) {
  if (!mailer) return devFallback('email', to, text);
  await mailer.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to, subject, text });
}

const form = (data) => new URLSearchParams(data).toString();

export async function sendSms(to, text) {
  let res;
  switch (env.SMS_PROVIDER) {
    case 'twilio':
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form({ To: to, From: env.TWILIO_FROM, Body: text }),
      });
      break;
    case 'africastalking':
      res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ username: env.AT_USERNAME, to, message: text, ...(env.AT_FROM && { from: env.AT_FROM }) }),
      });
      break;
    default:
      return devFallback('sms', to, text);
  }
  if (!res.ok) {
    console.error(`[sms] ${env.SMS_PROVIDER} answered ${res.status}: ${await res.text()}`);
    throw new HttpError(502, 'The SMS could not be sent');
  }
}

// "a***@school.cm", "••••••4567": tells the user where the code went without leaking the full address
export const maskEmail = (email) => email.replace(/^(.)[^@]*/, (_, first) => `${first}***`);
export const maskPhone = (phone) => phone.replace(/\d(?=(?:\D*\d){4})/g, '•');
