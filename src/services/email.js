const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendWinnerEmail({ to, name, prizeName, ticketNumber }) {
  if (!to) return { skipped: true, reason: 'no email on file' };
  const t = getTransporter();
  await t.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `You won: ${prizeName}!`,
    text: `Hi ${name || 'there'},\n\nCongratulations! Your raffle ticket #${ticketNumber} has won: ${prizeName}.\n\nPlease reply to this email or come to the collection point to claim your prize.\n\nThank you for supporting the raffle!`,
    html: `<p>Hi ${name || 'there'},</p>
      <p><strong>Congratulations!</strong> Your raffle ticket <strong>#${ticketNumber}</strong> has won:</p>
      <p style="font-size:1.2em"><strong>${prizeName}</strong></p>
      <p>Please reply to this email or come to the collection point to claim your prize.</p>
      <p>Thank you for supporting the raffle!</p>`,
  });
  return { skipped: false };
}

module.exports = { sendWinnerEmail };
