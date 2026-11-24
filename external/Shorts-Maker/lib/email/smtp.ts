import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { connect as connectTls, type TLSSocket } from "node:tls";

type GmailSmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

type SendMailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachment?: {
    filename: string;
    contentType: string;
    content: Buffer;
  } | null;
};

export type SendMailResult = {
  mode: "attachment" | "link_only";
};

function readEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

export function getGmailSmtpConfig(): GmailSmtpConfig | null {
  const user = readEnv("GMAIL_SMTP_USER");
  const pass = readEnv("GMAIL_SMTP_APP_PASSWORD");
  if (!user || !pass) return null;
  return {
    host: readEnv("GMAIL_SMTP_HOST") || "smtp.gmail.com",
    port: Number(readEnv("GMAIL_SMTP_PORT") || 465),
    user,
    pass,
    from: readEnv("GMAIL_SMTP_FROM") || user,
  };
}

function encodeBase64(value: string | Buffer): string {
  return Buffer.isBuffer(value) ? value.toString("base64") : Buffer.from(value, "utf8").toString("base64");
}

function createSocket(config: GmailSmtpConfig): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = connectTls(config.port, config.host, {
      servername: config.host,
      rejectUnauthorized: true,
    });
    const onError = (error: Error) => reject(error);
    socket.once("error", onError);
    socket.once("secureConnect", () => {
      socket.off("error", onError);
      resolve(socket);
    });
  });
}

async function readSmtpResponse(socket: TLSSocket): Promise<{ code: number; message: string }> {
  return await new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split("\r\n").filter(Boolean);
      if (lines.length === 0) return;
      const lastLine = lines[lines.length - 1];
      if (!/^\d{3} /.test(lastLine)) return;
      socket.off("data", onData);
      socket.off("error", onError);
      resolve({
        code: Number(lastLine.slice(0, 3)),
        message: lines.join("\n"),
      });
    };
    const onError = (error: Error) => {
      socket.off("data", onData);
      socket.off("error", onError);
      reject(error);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function sendCommand(socket: TLSSocket, command: string, expectedCodes: number[]): Promise<void> {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${response.code}): ${response.message}`);
  }
}

function wrapBase64(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n");
}

function normalizeRecipients(input: string | string[]): string[] {
  const recipients = (Array.isArray(input) ? input : [input])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return recipients.filter((item, index) => recipients.indexOf(item) === index);
}

function buildMimeMessage(config: GmailSmtpConfig, input: SendMailInput): string {
  const boundary = `studio-mail-${randomUUID()}`;
  const recipients = normalizeRecipients(input.to);
  const headers = [
    `From: Shorts Studio <${config.from}>`,
    `To: ${recipients.map((item) => `<${item}>`).join(", ")}`,
    `Subject: =?UTF-8?B?${encodeBase64(input.subject)}?=`,
    "MIME-Version: 1.0",
    `Message-ID: <${randomUUID()}@${config.host}>`,
    `Date: ${new Date().toUTCString()}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
  ];

  const parts = [
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(encodeBase64(input.text)),
      "",
    ].join("\r\n"),
  ];
  if (input.html?.trim()) {
    parts.push(
      [
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(encodeBase64(input.html)),
        "",
      ].join("\r\n")
    );
  }
  if (input.attachment) {
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${input.attachment.contentType}; name="${input.attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${input.attachment.filename}"`,
        "",
        wrapBase64(encodeBase64(input.attachment.content)),
        "",
      ].join("\r\n")
    );
  }
  parts.push(`--${boundary}--`);
  return [...headers, ...parts].join("\r\n");
}

export async function sendMailViaGmailSmtp(input: SendMailInput): Promise<SendMailResult> {
  const config = getGmailSmtpConfig();
  if (!config) {
    throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_APP_PASSWORD 환경변수가 필요합니다.");
  }
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    throw new Error("받는 사람 메일 주소가 없습니다.");
  }

  const socket = await createSocket(config);
  try {
    const greeting = await readSmtpResponse(socket);
    if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.message}`);
    await sendCommand(socket, `EHLO ${config.host}`, [250]);
    await sendCommand(socket, "AUTH LOGIN", [334]);
    await sendCommand(socket, encodeBase64(config.user), [334]);
    await sendCommand(socket, encodeBase64(config.pass), [235]);
    await sendCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
    for (const recipient of recipients) {
      await sendCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await sendCommand(socket, "DATA", [354]);
    socket.write(`${buildMimeMessage(config, input)}\r\n.\r\n`);
    const sent = await readSmtpResponse(socket);
    if (sent.code !== 250) {
      throw new Error(`SMTP data failed (${sent.code}): ${sent.message}`);
    }
    await sendCommand(socket, "QUIT", [221]);
    return {
      mode: input.attachment ? "attachment" : "link_only",
    };
  } finally {
    socket.end();
  }
}
