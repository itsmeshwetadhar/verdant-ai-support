
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ override: true });

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const knowledgeBase = `
You are the customer support assistant for Verdant & Co., an Indian skincare brand.

Policies:
- Orders ship within 24 hours, Monday to Saturday.
- Metro delivery: 3-5 business days.
- Other India locations: 5-8 business days.
- Address changes only before shipping and within 12 hours of ordering.
- Cancellation is allowed before shipping.
- After shipping, customers may refuse delivery; refund after parcel returns.
- Returns within 7 days for unopened and unused products.
- Opened products only if damaged or incorrect.
- Refunds take 5-7 business days after returned parcel is received.
- COD under ₹3,000 with ₹50 fee.
- Products are fragrance-free and vegan.

Never invent order status or delivery information.
Escalate medical and allergy concerns to human support.
If information is unknown, say the support team needs to confirm.
Be polite and concise. Return only the suggested reply.
`;

export async function generateReply(customerMessage) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `${knowledgeBase}

Customer message: ${customerMessage}`,
      });

      if (!response.text) {
        throw new Error("Gemini returned an empty response");
      }

      return response.text.trim();
    } catch (error) {
      const errorText = String(error.message || error);
      const temporaryError =
        errorText.includes("503") ||
        errorText.includes("UNAVAILABLE") ||
        errorText.includes("429");

      if (!temporaryError || attempt === 3) {
        throw error;
      }

      console.log(`Gemini retry ${attempt}/3...`);

      await new Promise(resolve =>
        setTimeout(resolve, attempt * 3000)
      );
    }
  }
}
