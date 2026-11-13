
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "./config/supabase.js";
import { verifySignature } from "./middleware/verifySignature.js";
import { generateReply } from "./services/ai.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticateAgent } from "./middleware/authenticateAgent.js";

dotenv.config({ override: true });

const app = express();

// Middleware
app.use(cors());
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  })
);

// Home route
app.get("/", (req, res) => {
  res.send("Verdant AI Support Backend is running!");
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

// Test Supabase connection
app.get("/test-db", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Supabase error:", error);

      return res.status(500).json({
        success: false,
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    res.status(200).json({
      success: true,
      message: "Supabase database connected successfully!",
      data,
    });

  } catch (error) {
    console.error("Unexpected error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
// Webhook route

app.post("/webhook", verifySignature, async (req, res) => {
  let savedEventId = null;

  try {
    const { event_id, customer, brand_id } = req.body;

    // Validate incoming data
    if (!event_id || !customer?.id || !customer?.name || !customer?.phone) {
      return res.status(400).json({
        success: false,
        message: "Missing event ID or customer information",
      });
    }

    // 1. Save webhook event
    const { data: eventData, error: eventError } = await supabase
      .from("webhook_events")
      .insert({
        event_id,
        payload: req.body,
      })
      .select()
      .single();

    if (eventError) {
      if (eventError.code === "23505") {
        return res.status(200).json({
          success: true,
          message: "Duplicate event ignored",
        });
      }

      throw eventError;
    }

    savedEventId = eventData.id;

    // 2. Save or update customer
    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .upsert(
        {
          external_id: customer.id,
          brand_id: brand_id || "verdant-co",
          name: customer.name,
          phone: customer.phone,
        },
        {
          onConflict: "brand_id,external_id",
        }
      )
      .select()
      .single();

    if (customerError) {
      throw customerError;
    }
    
// 3. Find the customer's existing open conversation
const { data: existingConversation, error: conversationError } =
  await supabase
    .from("conversations")
    .select("*")
    .eq("customer_id", customerData.id)
    .eq("brand_id", brand_id || "verdant-co")
    .eq("status", "open")
    .maybeSingle();

if (conversationError) {
  throw conversationError;
}

let conversationData = existingConversation;

// 4. Create a conversation if one does not exist
if (!conversationData) {
  const { data: newConversation, error: createError } = await supabase
    .from("conversations")
    .insert({
      customer_id: customerData.id,
      brand_id: brand_id || "verdant-co",
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createError) {
    throw createError;
  }

  conversationData = newConversation;
}

// 5. Save the customer's message
const { message, type } = req.body;

if (!message?.id || !message?.text || type !== "message.received") {
  throw new Error("Invalid or unsupported incoming message");
}

const { data: messageData, error: messageError } = await supabase
  .from("messages")
  .insert({
    conversation_id: conversationData.id,
    external_message_id: message.id,
    sender_type: "customer",
    body: message.text,
  })
  .select()
  .single();

if (messageError) {
  throw messageError;
}

    // Generate AI reply
    const suggestedReply = await generateReply(message.text);

    // Save AI reply as pending draft
    const { data: draftData, error: draftError } = await supabase
      .from("drafts")
      .insert({
        message_id: messageData.id,
        suggested_reply: suggestedReply,
        status: "pending",
        model: "gemini-3.8-flash",
      })
      .select()
      .single();

    if (draftError) throw draftError;

// 6. Update conversation's latest activity
const { error: activityError } = await supabase
  .from("conversations")
  .update({
    last_message_at: new Date().toISOString(),
  })
  .eq("id", conversationData.id);

if (activityError) {
  throw activityError;
}

    // 3. Mark webhook event as processed
    const { error: updateError } = await supabase
      .from("webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", savedEventId);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({
      success: true,
      message: "Webhook, customer, conversation and message saved successfully",
      event_id,
      customer: customerData,
      conversation: conversationData,
      savedMessage: messageData,
      draft: draftData,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    if (savedEventId) {
      await supabase
        .from("webhook_events")
        .update({
          status: "failed",
          error_message: error.message,
        })
        .eq("id", savedEventId);
    }

    res.status(500).json({
      success: false,
      message: "Failed to process webhook",
      error: error.message,
    });
  }
});


// Get all conversations for Agent Dashboard
app.get("/api/conversations", authenticateAgent, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select(`
        id,
        status,
        last_message_at,
        customers (
          name,
          phone
        ),
        messages (
          id,
          body,
          sender_type,
          created_at,
          drafts (
            id,
            suggested_reply,
            status,
            model
          )
        )
      `)
      .eq("brand_id", "verdant-co")
      .order("last_message_at", { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      conversations: data,
    });
  } catch (error) {
    console.error("Conversations API error:", error);

    res.status(500).json({
      success: false,
      message: "Could not fetch conversations",
    });
  }
});

// Approve an AI-generated reply

app.patch(
  "/api/drafts/:draftId/approve",
  authenticateAgent,
  async (req, res) => {
  try {
    const { draftId } = req.params;
    const { suggested_reply } = req.body;

    if (!suggested_reply || !suggested_reply.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reply cannot be empty",
      });
    }

    // Get the draft
    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id, message_id, status")
      .eq("id", draftId)
      .single();

    if (draftError) throw draftError;

    if (draft.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Draft is already processed",
      });
    }

    // Get the original customer message
    const { data: originalMessage, error: messageError } =
      await supabase
        .from("messages")
        .select("conversation_id")
        .eq("id", draft.message_id)
        .single();

    if (messageError) throw messageError;

    // Save approved reply as agent message
    const { error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: originalMessage.conversation_id,
        sender_type: "agent",
        body: suggested_reply.trim(),
      });

    if (insertError) throw insertError;

    // Mark draft approved
    const { error: updateError } = await supabase
      .from("drafts")
      .update({
        suggested_reply: suggested_reply.trim(),
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("status", "pending");

    if (updateError) throw updateError;

    // Update conversation activity
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", originalMessage.conversation_id);

    res.json({
      success: true,
      message: "Reply approved successfully",
    });

  } catch (error) {
    console.error("Approval error:", error);
    res.status(500).json({
      success: false,
      message: "Could not approve reply",
    });
  }
});

 // CUSTOMER: Load conversation using phone number
app.get("/api/customer/conversation", async (req, res) => {
  try {
    const phone = req.query.phone;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("brand_id", "verdant-co")
      .eq("phone", phone)
      .maybeSingle();

    if (customerError) throw customerError;

    if (!customer) {
      return res.json({
        success: true,
        conversation: null,
        messages: [],
      });
    }

    const { data: conversation, error: conversationError } =
      await supabase
        .from("conversations")
        .select(`
          id,
          status,
          last_message_at,
          messages (
            id,
            body,
            sender_type,
            created_at
          )
        `)
        .eq("customer_id", customer.id)
        .eq("brand_id", "verdant-co")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (conversationError) throw conversationError;

    const messages = (conversation?.messages || []).sort(
      (a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
    );

    res.json({
      success: true,
      customer,
      conversation: conversation
        ? { id: conversation.id, status: conversation.status }
        : null,
      messages,
    });

  } catch (error) {
    console.error("Customer conversation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load customer conversation",
    });
  }
});


// CUSTOMER: Send a new message
app.post("/api/customer/messages", async (req, res) => {
  try {
    const { name, phone, text: messageText } = req.body;

    if (!name || !phone || !messageText?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and message are required",
      });
    }

    const brandId = "verdant-co";

    // 1. Find existing customer
    let { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("brand_id", brandId)
      .eq("phone", phone)
      .maybeSingle();

    if (customerError) throw customerError;

    // 2. Create customer if new
    if (!customer) {
      const { data: newCustomer, error: createCustomerError } =
        await supabase
          .from("customers")
          .insert({
            external_id: `web-${phone}`,
            brand_id: brandId,
            name,
            phone,
          })
          .select()
          .single();

      if (createCustomerError) throw createCustomerError;

      customer = newCustomer;
    }

    // 3. Find open conversation
    let { data: conversation, error: conversationError } =
      await supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("brand_id", brandId)
        .eq("status", "open")
        .maybeSingle();

    if (conversationError) throw conversationError;

    // 4. Create conversation if needed
    if (!conversation) {
      const { data: newConversation, error: createError } =
        await supabase
          .from("conversations")
          .insert({
            customer_id: customer.id,
            brand_id: brandId,
            status: "open",
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

      if (createError) throw createError;

      conversation = newConversation;
    }

    // 5. Save customer message
    const { data: savedMessage, error: messageError } =
      await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_type: "customer",
          body: messageText.trim(),
        })
        .select()
        .single();

    if (messageError) throw messageError;

    // 6. Generate and save private AI draft
    try {
      const suggestedReply = await generateReply(messageText.trim());

      const { error: draftError } = await supabase
        .from("drafts")
        .insert({
          message_id: savedMessage.id,
          suggested_reply: suggestedReply,
          status: "pending",
          model: "gemini-3.8-flash",
        });

      if (draftError) throw draftError;

    } catch (aiError) {
      console.error("AI draft generation failed:", aiError);

      await supabase.from("drafts").insert({
        message_id: savedMessage.id,
        suggested_reply: null,
        status: "failed",
        model: "gemini-3.8-flash",
        error_message: aiError.message,
      });
    }

    // 7. Update conversation activity
    const { error: activityError } = await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);

    if (activityError) throw activityError;

    res.status(201).json({
      success: true,
      message: "Your message has been sent successfully",
      savedMessage,
    });

  } catch (error) {
    console.error("Customer message error:", error);

    res.status(500).json({
      success: false,
      message: "Could not send your message",
    });
  }
});
// AGENT LOGIN
app.post("/api/agent/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (email !== process.env.AGENT_EMAIL) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      process.env.AGENT_PASSWORD_HASH
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { email, role: "agent" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      agent: { email },
    });

  } catch (error) {
    console.error("Agent login error:", error);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

