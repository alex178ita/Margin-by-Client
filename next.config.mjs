// Domini Zoho autorizzati a incorporare l'app come Web Tab del CRM.
const ZOHO = [
  "https://*.zoho.eu", "https://*.zoho.com", "https://*.zoho.in",
  "https://*.zohoplatform.eu", "https://*.zohoplatform.com",
  "https://*.zohostatic.eu", "https://*.zohostatic.com",
  "https://crm.zoho.eu", "https://crm.zoho.com", "https://one.zoho.eu"
].join(" ");

export default {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${ZOHO}` },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
      ]
    }];
  }
};
