import { describe, expect, it } from "vitest";
import { isLinkPreviewAgent } from "./linkPreview";

describe("isLinkPreviewAgent", () => {
  it.each([
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "curl/8.5.0",
    "",
    null,
  ])("%j é robô", (agent) => {
    expect(isLinkPreviewAgent(agent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  ])("%j é pessoa", (agent) => {
    expect(isLinkPreviewAgent(agent)).toBe(false);
  });
});
