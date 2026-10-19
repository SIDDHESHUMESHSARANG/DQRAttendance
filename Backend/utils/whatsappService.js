import twilio from "twilio";

const toWhatsAppAddress = (value, settingName) => {
  const number = value?.startsWith("whatsapp:")
    ? value.slice("whatsapp:".length)
    : value;

  if (typeof number !== "string" || !/^\+[1-9]\d{7,14}$/.test(number)) {
    throw new Error(`${settingName} must be a phone number in E.164 format`);
  }

  return `whatsapp:${number}`;
};

export const sendWhatsAppMessage = async (recipient, body) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } =
    process.env;

  const missingSettings = [
    ["TWILIO_ACCOUNT_SID", TWILIO_ACCOUNT_SID],
    ["TWILIO_AUTH_TOKEN", TWILIO_AUTH_TOKEN],
    ["TWILIO_WHATSAPP_FROM", TWILIO_WHATSAPP_FROM],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingSettings.length > 0) {
    throw new Error(
      `Missing Twilio WhatsApp settings: ${missingSettings.join(", ")}`,
    );
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const message = await client.messages.create({
    from: toWhatsAppAddress(TWILIO_WHATSAPP_FROM, "TWILIO_WHATSAPP_FROM"),
    to: toWhatsAppAddress(recipient, "WhatsApp recipient"),
    body,
  });

  return { sid: message.sid, status: message.status };
};
