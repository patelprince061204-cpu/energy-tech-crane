// lib/mailer.js
// Dependency-free Gmail SMTP sender (matches this project's zero-npm-install
// approach — same technique as the website's server.js enquiry notifier, but
// promise-based, response-aware, and able to send to any recipient).
//
// Configuration (environment variables, e.g. in erp-server/.env):
//   EMAIL_USER = your Gmail address        (e.g. energytechcrane@gmail.com)
//   EMAIL_PASS = a Gmail App Password      (Google Account → Security →
//                2-Step Verification → App passwords; regular passwords
//                will NOT work with SMTP)
//
// If either variable is missing, isMailerConfigured() returns false and
// sendMail() rejects — callers surface a friendly "not configured" message.

const tls = require('tls');

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';

function isMailerConfigured() {
  return !!(EMAIL_USER && EMAIL_PASS);
}

// Strip CR/LF so user-influenced values can never inject extra SMTP headers.
function headerSafe(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function sendMail(to, subject, text) {
  return new Promise((resolve, reject) => {
    if (!isMailerConfigured()) {
      reject(new Error('Email is not configured (EMAIL_USER / EMAIL_PASS missing).'));
      return;
    }
    const recipient = headerSafe(to);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      reject(new Error('Invalid recipient email address.'));
      return;
    }

    const steps = [
      'EHLO etc-erp\r\n',
      'AUTH LOGIN\r\n',
      Buffer.from(EMAIL_USER).toString('base64') + '\r\n',
      Buffer.from(EMAIL_PASS).toString('base64') + '\r\n',
      `MAIL FROM:<${EMAIL_USER}>\r\n`,
      `RCPT TO:<${recipient}>\r\n`,
      'DATA\r\n',
      `From: Energy Tech Crane ERP <${EMAIL_USER}>\r\n` +
        `To: <${recipient}>\r\n` +
        `Subject: ${headerSafe(subject)}\r\n` +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        `\r\n${String(text || '')}\r\n.\r\n`,
      'QUIT\r\n',
    ];

    let i = 0;
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch (e) { /* already closed */ }
      err ? reject(err) : resolve();
    };

    const sock = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });

    sock.on('data', (chunk) => {
      const line = String(chunk);
      const code = parseInt(line.slice(0, 3), 10);
      // 4xx/5xx = the server rejected the previous command (bad app password,
      // blocked recipient, etc.) — fail fast with the server's own message.
      if (Number.isFinite(code) && code >= 400) {
        finish(new Error(`SMTP error ${code}: ${line.slice(0, 200).trim()}`));
        return;
      }
      if (i < steps.length) {
        sock.write(steps[i++]);
        // The QUIT step is only reached after Gmail replied 250 (queued) to
        // the message body — once it's written, the mail has been accepted.
        if (i === steps.length) finish(null);
      }
    });

    sock.on('error', (e) => finish(new Error(`SMTP connection error: ${e.message}`)));
    sock.on('close', () => { if (!settled) finish(new Error('SMTP connection closed unexpectedly.')); });
    sock.setTimeout(20000, () => finish(new Error('SMTP connection timed out.')));
  });
}

module.exports = { sendMail, isMailerConfigured };
