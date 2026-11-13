
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ override: true });

const payload = {
  event_id: "test-event-011",
  type: "message.received",
  brand_id: "verdant-co",
  timestamp: new Date().toISOString(),
  customer: {
    id: "customer-001",
    name: "Test Customer",
    phone: "9876543210",
  },
  message: {
    id: "message-011",
    type: "text",
    text: "Where is my order?",
  },
};

// Create the exact JSON string that will be sent
const body = JSON.stringify(payload);

// Generate signature from that exact string
const signature =
  "sha256=" +
  crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

// Send directly to backend
const response = await fetch("http://localhost:5000/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-signature": signature,
  },
  body: body,
});

console.log("HTTP STATUS:", response.status);
console.log("RESPONSE:", await response.json());
