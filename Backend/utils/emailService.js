import "dotenv/config";

const sendOtpEmail = async (recipient, subject, textContent) => {
    const { BREVO_API_KEY, MAIL_FROM } = process.env;

    if (!BREVO_API_KEY || !MAIL_FROM) {
        throw new Error(
            "Email configuration is missing. Set BREVO_API_KEY and MAIL_FROM.",
        );
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            accept: "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            sender: { email: MAIL_FROM },
            to: [{ email: recipient }],
            subject,
            textContent,
        }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        const detail =
            typeof result.message === "string"
                ? result.message
                : `Brevo API returned HTTP ${response.status}`;
        throw new Error(`Failed to send OTP email: ${detail}`);
    }

    return result;
};

// Admin Registration OTP
export const sendAdminOTP = async (email, otp) => {
    try {
        const result = await sendOtpEmail(
            email,
            "Admin Registration OTP - DQRSmartAttendance",
            `Your Admin registration OTP is ${otp}. It is valid for 3 minutes. Do not share this OTP with anyone.`,
        );

        console.log("Admin OTP email sent successfully:", result.messageId);
        return result;
    } catch (error) {
        console.error("Admin OTP email failed:", error.message);
        throw error;
    }
};

// Professor Registration OTP
export const sendProfessorRegistrationOTP = async (email, otp) => {
    try {
        const result = await sendOtpEmail(
            email,
            "Professor Registration OTP - DQRSmartAttendance",
            `Your Professor registration OTP is ${otp}. It is valid for 3 minutes. Do not share this OTP with anyone.`,
        );

        console.log(
            "Professor OTP email sent successfully:",
            result.messageId,
        );
        return result;
    } catch (error) {
        console.error("Professor OTP email failed:", error.message);
        throw error;
    }
};

// Student Registration OTP
export const sendStudentRegistrationOTP = async (email, otp) => {
    try {
        const result = await sendOtpEmail(
            email,
            "Student Account Activation OTP - DQRSmartAttendance",
            `Your Student account activation OTP is ${otp}. It is valid for 3 minutes. Do not share this OTP with anyone.`,
        );

        console.log(
            "Student OTP email sent successfully:",
            result.messageId,
        );
        return result;
    } catch (error) {
        console.error("Student OTP email failed:", error.message);
        throw error;
    }
};
