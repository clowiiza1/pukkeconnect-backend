import nodemailer from 'nodemailer';
import { env } from '../config.js';

const emailConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
let transporter;

async function getTransporter() {
  if (!emailConfigured) return null;
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

export async function sendPasswordResetEmail({ to, link }) {
  const transport = await getTransporter();
  const composed = {
    to,
    from: env.smtp.from || env.smtp.user || 'no-reply@pukkeconnect.dev',
    subject: 'Reset your PukkeConnect password',
    text: `We received a request to reset your PukkeConnect password.\n\nUse the link below to set a new password. This link expires in ${env.resetTokenTtlMinutes} minutes.\n\n${link}\n\nIf you did not request a password reset you can ignore this email.`,
    html: `
      <p>We received a request to reset your PukkeConnect password.</p>
      <p><a href="${link}" target="_blank" rel="noopener noreferrer">Reset your password</a></p>
      <p>This link expires in ${env.resetTokenTtlMinutes} minutes. If you did not request this, please ignore this message.</p>
    `,
  };

  if (!transport) {
    console.info('[mailer] Password reset email (SMTP disabled):', composed);
    return;
  }

  await transport.sendMail(composed);
}
