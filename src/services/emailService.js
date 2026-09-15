const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

/**
 * Sends an email. Fails gracefully (logs error) instead of throwing,
 * so a missing/misconfigured SMTP setup never breaks the main request flow.
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    });
    return info;
  } catch (error) {
    console.error(`Email send failed to ${to}: ${error.message}`);
    return null;
  }
};

const emailTemplates = {
  welcome: (name) => ({
    subject: 'Welcome to InternIQ',
    html: `<p>Hi ${name},</p><p>Welcome to InternIQ! Your account has been created successfully.</p>`,
  }),
  passwordReset: (resetUrl) => ({
    subject: 'Reset your InternIQ password',
    html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a>. This link expires in 1 hour.</p><p>If you did not request this, please ignore this email.</p>`,
  }),
  applicationConfirmation: (internshipTitle) => ({
    subject: 'Application Submitted',
    html: `<p>Your application for "${internshipTitle}" has been submitted successfully. We will notify you of any status updates.</p>`,
  }),
  applicationAccepted: (internshipTitle) => ({
    subject: 'Application Accepted 🎉',
    html: `<p>Congratulations! Your application for "${internshipTitle}" has been accepted.</p>`,
  }),
  applicationRejected: (internshipTitle) => ({
    subject: 'Application Update',
    html: `<p>Your application for "${internshipTitle}" was not successful this time. Keep applying!</p>`,
  }),
  companyApproved: (companyName) => ({
    subject: 'Company Account Approved',
    html: `<p>Congratulations, ${companyName}! Your company account has been approved. You can now post internships.</p>`,
  }),
  supervisorAssigned: (supervisorName) => ({
    subject: 'Supervisor Assigned',
    html: `<p>${supervisorName} has been assigned as your supervisor for your internship.</p>`,
  }),
  coordinatorAccountCreated: (name, email, tempPassword, universityName) => ({
    subject: 'Your InternIQ Coordinator Account',
    html: `<p>Hi ${name},</p><p>An account has been created for you as a University Coordinator${universityName ? ` at ${universityName}` : ''}.</p><p>Login email: <strong>${email}</strong><br/>Temporary password: <strong>${tempPassword}</strong></p><p>Please log in and change your password as soon as possible.</p>`,
  }),
  coordinatorAssigned: (coordinatorName) => ({
    subject: 'University Coordinator Assigned',
    html: `<p>${coordinatorName} has been assigned as your university coordinator for your internship.</p>`,
  }),
};

module.exports = { sendEmail, emailTemplates };
