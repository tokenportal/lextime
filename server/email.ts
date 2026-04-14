import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export interface SendMailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

function buildTransporter(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
  });
}

export async function sendMail(cfg: SmtpConfig, opts: SendMailOptions): Promise<void> {
  const transporter = buildTransporter(cfg);
  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}

export async function verifySmtp(cfg: SmtpConfig): Promise<void> {
  const transporter = buildTransporter(cfg);
  await transporter.verify();
}
