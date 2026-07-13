import { describe, expect, it } from "vitest";
import { parseWhatsAppCredentialPaste } from "./whatsappCredentialPaste";

describe("parseWhatsAppCredentialPaste", () => {
  it("parses JSON credentials", () => {
    expect(
      parseWhatsAppCredentialPaste(
        JSON.stringify({
          phone_number_id: "1156851180847399",
          business_account_id: "1514478924057944",
          access_token: "EAAtesttoken",
        }),
      ),
    ).toEqual({
      phoneNumberId: "1156851180847399",
      businessAccountId: "1514478924057944",
      accessToken: "EAAtesttoken",
    });
  });

  it("parses curl with bearer and graph phone id", () => {
    const curl = `curl -X POST 'https://graph.facebook.com/v25.0/1156851180847399/messages' \\
-H 'Authorization: Bearer EAAJB123abc'`;
    expect(parseWhatsAppCredentialPaste(curl)).toMatchObject({
      phoneNumberId: "1156851180847399",
      accessToken: "EAAJB123abc",
    });
  });

  it("parses labeled dashboard paste with two numeric ids", () => {
    const text = `Phone number ID: 1156851180847399
WhatsApp Business Account ID: 1514478924057944`;
    expect(parseWhatsAppCredentialPaste(text)).toMatchObject({
      phoneNumberId: "1156851180847399",
      businessAccountId: "1514478924057944",
    });
  });
});
