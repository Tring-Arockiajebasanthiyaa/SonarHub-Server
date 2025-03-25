import nodemailer from "nodemailer";

export const sendEmail = async (to: string, subject: string, text: string) => {
  const adminEmail = process.env.EMAIL_USER;
  if (!adminEmail) {
    console.error("Missing email credentials in .env");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: adminEmail,
    },
  });

  const mailOptions = {
    from: adminEmail,
    to,
    subject,
    text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.response}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
