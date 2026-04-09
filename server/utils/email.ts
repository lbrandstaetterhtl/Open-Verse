import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// SECURITY FIX [VULN-011]: HTML-escape user input before embedding in email
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendVerificationEmail(email: string, username: string, token: string) {
  const verificationLink = `${process.env.REPLIT_DOMAIN}/verify-email?token=${token}`;
  const safeUsername = escapeHtml(username);

  const msg = {
    to: email,
    from: "noreply@purecoffee.com", // Replace with your verified sender
    subject: "Verify your Pure Coffee account",
    html: `
      <div>
        <h2>Welcome to Pure Coffee, ${safeUsername}!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <p><a href="${verificationLink}">Verify Email Address</a></p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Failed to send verification email");
  }
}
