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

const getTwilioClient = () => {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM,
  } = process.env;
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

  return {
    client: twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
    from: toWhatsAppAddress(TWILIO_WHATSAPP_FROM, "TWILIO_WHATSAPP_FROM"),
  };
};

export const sendWhatsAppMessage = async (recipient, body) => {
  const { client, from } = getTwilioClient();
  const message = await client.messages.create({
    from,
    to: toWhatsAppAddress(recipient, "WhatsApp recipient"),
    body,
  });

  return { sid: message.sid, status: message.status };
};

export const sendWhatsAppTemplate = async (recipient, contentVariables) => {
  const { TWILIO_WHATSAPP_CONTENT_SID } = process.env;

  if (!TWILIO_WHATSAPP_CONTENT_SID) {
    throw new Error(
      "Missing Twilio WhatsApp setting: TWILIO_WHATSAPP_CONTENT_SID",
    );
  }

  const { client, from } = getTwilioClient();
  const message = await client.messages.create({
    from,
    to: toWhatsAppAddress(recipient, "WhatsApp recipient"),
    contentSid: TWILIO_WHATSAPP_CONTENT_SID,
    contentVariables: JSON.stringify(contentVariables),
  });

  return { sid: message.sid, status: message.status };
};
