/**
 * Builds the deep-link URLs for contacting a person by phone. `tel:`/`sms:`
 * keep the dialable form (with `+`); WhatsApp's wa.me requires digits only.
 */
export function contactLinks(phone: string): {
  tel: string;
  sms: string;
  whatsapp: string;
} {
  const digits = phone.replace(/\D/g, "");
  // Keep a leading + (international prefix) for tel:/sms:; strip everything
  // else so spaced/dashed DB numbers still dial.
  const dialable = `${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
  return {
    tel: `tel:${dialable}`,
    sms: `sms:${dialable}`,
    whatsapp: `https://wa.me/${digits}`,
  };
}
