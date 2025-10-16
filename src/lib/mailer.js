import nodemailer from 'nodemailer';
import Mailjet from 'node-mailjet';
import { env } from '../config.js';

const smtpConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
const mailjetConfigured = Boolean(env.mailjet.apiKey && env.mailjet.apiSecret && env.mailjet.from);
let transporter;
let mailjetClient;

async function getTransporter() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port ?? 587,
      secure: env.smtp.secure || Number(env.smtp.port ?? 587) === 465,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });

    if (env.nodeEnv !== 'production') {
      try {
        await transporter.verify();
      } catch (err) {
        console.warn('SMTP verification failed; falling back to console logging', err.message);
        transporter = null;
      }
    }
  }
  return transporter;
}

function getMailjetClient() {
  if (!mailjetConfigured) return null;
  if (!mailjetClient) {
    mailjetClient = Mailjet.apiConnect(env.mailjet.apiKey, env.mailjet.apiSecret);
  }
  return mailjetClient;
}

function parseAddress(address) {
  if (!address) return { name: '', email: '' };
  const match = address.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    const email = match[2].trim();
    return { name, email };
  }
  return { name: '', email: address.trim() };
}

export async function sendPasswordResetEmail({ to, link }) {
  const composed = {
    to,
    from: env.mailjet.from || env.smtp.from || env.smtp.user || 'no-reply@pukkeconnect.dev',
    subject: 'Reset your PukkeConnect password',
    text: `We received a request to reset your PukkeConnect password.\n\nUse the link below to set a new password. This link expires in ${env.resetTokenTtlMinutes} minutes.\n\n${link}\n\nIf you did not request a password reset you can ignore this email.`,
    html: `
      <p>We received a request to reset your PukkeConnect password.</p>
      <p><a href="${link}" target="_blank" rel="noopener noreferrer">Reset your password</a></p>
      <p>This link expires in ${env.resetTokenTtlMinutes} minutes. If you did not request this, please ignore this message.</p>
    `,
  };

  const mailjet = getMailjetClient();
  if (mailjet) {
    try {
      const { name: fromName, email: fromEmail } = parseAddress(composed.from);
      const toAddress = parseAddress(to);

      const response = await mailjet
        .post('send', { version: 'v3.1' })
        .request({
          Messages: [
            {
              From: {
                Email: fromEmail || env.mailjet.from,
                ...(fromName ? { Name: fromName } : {}),
              },
              To: [
                {
                  Email: toAddress.email || to,
                  ...(toAddress.name ? { Name: toAddress.name } : {}),
                },
              ],
              Subject: composed.subject,
              TextPart: composed.text,
              HTMLPart: composed.html,
            },
          ],
        });

      const status = response?.body?.Messages?.[0]?.Status;
      if (status === 'success') return;

      console.error('[mailer] Mailjet send did not report success, attempting SMTP fallback', response?.body);
    } catch (err) {
      console.error('[mailer] Mailjet send failed, attempting SMTP fallback', err);
    }
  }

  const transport = await getTransporter();
  if (transport) {
    await transport.sendMail(composed);
    return;
  }

  console.info('[mailer] Password reset email (no provider configured):', composed);
}
