# Backend setup

## Twilio WhatsApp low-attendance alerts

### Sandbox testing

For a test account, use the Twilio WhatsApp Sandbox. Each recipient must join
your Sandbox by sending its `join <your sandbox code>` phrase to the Sandbox
number. Joining opens a 24-hour customer-service window; the free-form
low-attendance reminder can be sent only while that window is open. Recipients
must rejoin when their Sandbox membership expires.

Configure the Sandbox sender and select Sandbox mode in `Backend/.env`:

```env
TWILIO_WHATSAPP_FROM=+14155238886
TWILIO_WHATSAPP_MODE=sandbox
```

The Sandbox does not support custom templates. Twilio trial accounts include
100 WhatsApp messages as trial units; Sandbox messages are otherwise billed at
Twilio's standard WhatsApp API rates. This mode is for testing, not production.

### Production sending

Without `TWILIO_WHATSAPP_MODE=sandbox`, low-attendance reminders use an approved
Twilio WhatsApp Content Template. In Twilio Content Template Builder, create a
WhatsApp template with these placeholders in this order:

```text
Hello {{1}}, your current attendance is {{2}}%. Please contact your professor and attend upcoming classes to improve it.
```

Submit the template for WhatsApp approval. After approval, configure these
values in `Backend/.env`:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=+your_twilio_whatsapp_sender_number
TWILIO_WHATSAPP_CONTENT_SID=HX_your_approved_content_sid
```

The backend sends the student's name as `{{1}}` and current attendance
percentage as `{{2}}`. `TWILIO_WHATSAPP_FROM` must be the WhatsApp-enabled
Twilio sender configured for the account. Do not set Sandbox mode when using a
production template. Restart the backend after changing `.env`. Do not commit
`.env` or share its credentials.
