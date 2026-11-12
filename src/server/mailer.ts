import nodemailer from "nodemailer";
import { EMAIL_MAX_JOBS, SMTP_DEFAULT_PORT, SMTP_IMPLICIT_TLS_PORT } from "../shared/constants";
import { escapeHtml, safeHttpUrl } from "../shared/text";

export type SmtpConfig = {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export type DigestJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  matchedSkills: string[];
};

export function readSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const portValue = process.env.SMTP_PORT?.trim();
  const port = portValue ? Number(portValue) : SMTP_DEFAULT_PORT;
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.SMTP_FROM?.trim() || user;
  const configured = host.length > 0 && from.length > 0 && Number.isInteger(port) && port > 0;
  return { configured, host, port, user, pass, from };
}

function formatFrom(from: string): string {
  if (from.includes("<")) {
    return from;
  }
  return `Radar de vagas <${from}>`;
}

function vagasLabel(count: number): string {
  return count === 1 ? "1 vaga nova" : `${count} vagas novas`;
}

export function buildDigest(input: { alertName: string; jobs: DigestJob[]; totalCount: number }): {
  subject: string;
  text: string;
  html: string;
} {
  const shown = input.jobs.slice(0, EMAIL_MAX_JOBS);
  const hiddenCount = input.totalCount - shown.length;
  const subject = `Radar de vagas: ${vagasLabel(input.totalCount)} — ${input.alertName}`;
  const lines = [
    `${vagasLabel(input.totalCount)} para o alerta "${input.alertName}".`,
    "",
    ...shown.flatMap((job) => {
      const place = job.location ? ` · ${job.location}` : "";
      const link = safeHttpUrl(job.url);
      const block = [`${job.title}`, `${job.company}${place}`];
      if (job.matchedSkills.length > 0) {
        block.push(`Casou com: ${job.matchedSkills.join(", ")}`);
      }
      block.push(link ?? "Link indisponível", "");
      return block;
    }),
  ];
  if (hiddenCount > 0) {
    lines.push(`E mais ${hiddenCount} no painel do Radar de vagas.`);
  }
  lines.push("", "A vaga continua no site de origem. Este aviso só aponta para ela.");

  const items = shown
    .map((job) => {
      const link = safeHttpUrl(job.url);
      const title = escapeHtml(job.title);
      const company = escapeHtml(job.company);
      const location = job.location ? ` · ${escapeHtml(job.location)}` : "";
      const skills = job.matchedSkills.length > 0 ? `<div>Casou com: ${escapeHtml(job.matchedSkills.join(", "))}</div>` : "";
      const anchor = link ? `<div><a href="${escapeHtml(link)}">Abrir vaga</a></div>` : "";
      return `<li><strong>${title}</strong><div>${company}${location}</div>${skills}${anchor}</li>`;
    })
    .join("");
  const more = hiddenCount > 0 ? `<p>E mais ${hiddenCount} no painel do Radar de vagas.</p>` : "";
  const html = `<div><p>${escapeHtml(vagasLabel(input.totalCount))} para o alerta <strong>${escapeHtml(input.alertName)}</strong>.</p><ul>${items}</ul>${more}<p>A vaga continua no site de origem. Este aviso só aponta para ela.</p></div>`;

  return { subject, text: lines.join("\n"), html };
}

function createTransport() {
  const smtp = readSmtpConfig();
  if (!smtp.configured) {
    return null;
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === SMTP_IMPLICIT_TLS_PORT,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}

export async function sendMail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const smtp = readSmtpConfig();
  const transport = createTransport();
  if (!smtp.configured || !transport) {
    throw new Error("Configure o SMTP nas variáveis de ambiente.");
  }
  await transport.sendMail({
    from: formatFrom(smtp.from),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
