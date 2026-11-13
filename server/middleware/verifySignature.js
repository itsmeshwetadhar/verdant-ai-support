
import crypto from "node:crypto";

export const verifySignature = (req, res, next) => {
  try {
    const signature = req.headers["x-signature"];
    const secret = process.env.WEBHOOK_SECRET;

    if (!signature || !secret || !req.rawBody) {
      return res.status(401).json({
        success: false,
        message: "Missing signature or webhook configuration",
      });
    }

    const expectedSignature =
      "sha256=" +
      crypto
        .createHmac("sha256", secret)
        .update(req.rawBody)
        .digest("hex");

    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    next();
  } catch (error) {
    console.error("Signature verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Signature verification failed",
    });
  }
};
