
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [view, setView] = useState("agent");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("agentToken") || ""
  );

  const [email, setEmail] = useState("agent@verdantco.com");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [approving, setApproving] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customer, setCustomer] = useState(null);
  const [customerMessages, setCustomerMessages] = useState([]);
  const [customerText, setCustomerText] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerSending, setCustomerSending] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [customerSuccess, setCustomerSuccess] = useState("");

  useEffect(() => {
    if (view === "agent" && token) {
      fetchConversations();
    }
  }, [view, token]);

  async function handleLogin(e) {
    e.preventDefault();

    try {
      setLoginLoading(true);
      setLoginError("");

      const response = await fetch(`${API_URL}/api/agent/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Login failed");
      }

      sessionStorage.setItem("agentToken", result.token);
      setToken(result.token);
      setPassword("");
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("agentToken");
    setToken("");
    setConversations([]);
    setSelectedConversation(null);
    setError("");
    setSuccess("");
    setLoginError("");
  }

  async function fetchConversations() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (response.status === 401) {
        handleLogout();
        setLoginError("Session expired. Please sign in again.");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load conversations");
      }

      setConversations(result.conversations);

      setSelectedConversation((current) => {
        if (
          current &&
          result.conversations.some((item) => item.id === current)
        ) {
          return current;
        }

        return result.conversations[0]?.id || null;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const selected = conversations.find(
    (item) => item.id === selectedConversation
  );

  const messages = selected?.messages || [];

  const pendingDraftMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.sender_type === "customer" &&
        message.drafts?.status === "pending"
    );

  const draft = pendingDraftMessage?.drafts;

  function updateDraftText(value) {
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === selectedConversation
          ? {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === pendingDraftMessage.id
                  ? {
                      ...message,
                      drafts: {
                        ...message.drafts,
                        suggested_reply: value,
                      },
                    }
                  : message
              ),
            }
          : conversation
      )
    );
  }

  async function approveDraft() {
    if (!draft?.suggested_reply?.trim()) {
      setError("Please enter a reply before approving.");
      return;
    }

    try {
      setApproving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `${API_URL}/api/drafts/${draft.id}/approve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            suggested_reply: draft.suggested_reply,
          }),
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        handleLogout();
        setLoginError("Session expired. Please sign in again.");
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Approval failed");
      }

      setSuccess("Reply approved successfully!");
      await fetchConversations();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function loadCustomerConversation(e) {
    e.preventDefault();

    if (!customerName.trim() || !customerPhone.trim()) {
      setCustomerError("Please enter your name and phone number.");
      return;
    }

    try {
      setCustomerLoading(true);
      setCustomerError("");
      setCustomerSuccess("");

      const response = await fetch(
        `${API_URL}/api/customer/conversation?phone=${encodeURIComponent(
          customerPhone.trim()
        )}`
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load conversation.");
      }

      setCustomer({
        name: customerName.trim(),
        phone: customerPhone.trim(),
      });

      setCustomerMessages(result.messages || []);
    } catch (err) {
      setCustomerError(err.message);
    } finally {
      setCustomerLoading(false);
    }
  }

  async function sendCustomerMessage(e) {
    e.preventDefault();
    if (!customerText.trim()) return;

    try {
      setCustomerSending(true);
      setCustomerError("");
      setCustomerSuccess("");

      const response = await fetch(`${API_URL}/api/customer/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          text: customerText,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not send message.");
      }

      setCustomerText("");
      setCustomerSuccess("Your message has been sent!");
      await loadCustomerMessages(customer.phone);
    } catch (err) {
      setCustomerError(err.message);
    } finally {
      setCustomerSending(false);
    }
  }

  async function loadCustomerMessages(phone) {
    const response = await fetch(
      `${API_URL}/api/customer/conversation?phone=${encodeURIComponent(phone)}`
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Could not refresh messages.");
    }

    setCustomerMessages(result.messages || []);
  }

  function customerLogout() {
    setCustomer(null);
    setCustomerMessages([]);
    setCustomerText("");
    setCustomerError("");
    setCustomerSuccess("");
  }

  function formatTime(date) {
    if (!date) return "";
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(date) {
    if (!date) return "";
    return new Date(date).toLocaleDateString([], {
      day: "numeric",
      month: "short",
    });
  }

  function getLatestMessage(conversation) {
    const list = conversation.messages || [];
    return list[list.length - 1];
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">V</div>
          <div>
            <h1>verdant<span>&</span>co.</h1>
            <p>CARE STUDIO</p>
          </div>
        </div>

        <div className="topbar-center">
          <span className="topbar-dot" />
          AI SUPPORT PLATFORM
        </div>

        <div className="topbar-actions">
          <button
            className={`mode-button ${view === "customer" ? "active" : ""}`}
            onClick={() => setView("customer")}
          >
            Customer view
          </button>
          <button
            className={`mode-button ${view === "agent" ? "active" : ""}`}
            onClick={() => setView("agent")}
          >
            Agent workspace
          </button>
        </div>
      </header>

      {view === "agent" ? (
        !token ? (
          <main className="login-page">
            <div className="login-decoration">
              <span className="login-eyebrow">VERDANT & CO. · SUPPORT</span>
              <h2>Thoughtful care.<br /><em>Every conversation.</em></h2>
              <p>
                A calmer way to connect with customers, understand their needs,
                and deliver thoughtful support.
              </p>
              <div className="login-leaf">✳</div>
              <span className="login-footer">MADE FOR BETTER CUSTOMER CARE</span>
            </div>

            <form className="login-card" onSubmit={handleLogin}>
              <span className="eyebrow">WELCOME BACK</span>
              <h2>Agent sign in</h2>
              <p className="login-description">
                Sign in to access your support workspace.
              </p>

              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@verdantco.com"
                required
              />

              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />

              {loginError && <p className="error-message">{loginError}</p>}

              <button className="primary-button login-submit" disabled={loginLoading}>
                {loginLoading ? "Signing in..." : "Sign in to workspace"}
                <span>↗</span>
              </button>

              <p className="login-note">
                <span>●</span> Secure agent access
              </p>
            </form>
          </main>
        ) : (
          <main className="workspace">
            <aside className="workspace-sidebar">
              <div className="sidebar-heading">
                <div>
                  <span className="eyebrow">WORKSPACE</span>
                  <h2>Inbox</h2>
                </div>
                <span className="inbox-count">{conversations.length}</span>
              </div>

              <div className="sidebar-filter">
                <span>◷</span> All conversations
                <span className="filter-count">{conversations.length}</span>
              </div>

              <div className="conversation-heading">
                <span>RECENT MESSAGES</span>
                <button onClick={fetchConversations} title="Refresh">↻</button>
              </div>

              {loading && <p className="sidebar-message">Loading inbox...</p>}
              {error && <p className="error-message sidebar-error">{error}</p>}
              {success && <p className="success-message">{success}</p>}

              {!loading && conversations.length === 0 && (
                <p className="sidebar-message">No conversations yet.</p>
              )}

              <div className="conversation-list">
                {conversations.map((conversation) => {
                  const latest = getLatestMessage(conversation);
                  const isActive = selectedConversation === conversation.id;
                  const hasPending = conversation.messages?.some(
                    (message) => message.drafts?.status === "pending"
                  );

                  return (
                    <button
                      key={conversation.id}
                      className={`conversation-card ${isActive ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedConversation(conversation.id);
                        setError("");
                        setSuccess("");
                      }}
                    >
                      <div className="avatar">
                        {(conversation.customers?.name || "C")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="conversation-info">
                        <div className="conversation-topline">
                          <strong>{conversation.customers?.name || "Customer"}</strong>
                          <span>{formatTime(conversation.last_message_at)}</span>
                        </div>
                        <p>{latest?.body || "No messages yet"}</p>
                        <div className="conversation-bottomline">
                          <span>{conversation.customers?.phone}</span>
                          {hasPending && <span className="mini-pending">Review needed</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="sidebar-profile">
                <div className="profile-avatar">A</div>
                <div className="profile-info">
                  <strong>Support Agent</strong>
                  <span>Online · Workspace</span>
                </div>
                <button onClick={handleLogout} title="Sign out">↗</button>
              </div>
            </aside>

            <section className="conversation-workspace">
              {selected ? (
                <>
                  <div className="conversation-toolbar">
                    <div>
                      <span className="eyebrow">CUSTOMER CONVERSATION</span>
                      <h2>{selected.customers?.name}</h2>
                    </div>
                    <div className="toolbar-meta">
                      <span className="status-pill">
                        <i /> {draft ? "Needs review" : selected.status}
                      </span>
                      <button className="icon-button" onClick={fetchConversations} title="Refresh">↻</button>
                    </div>
                  </div>

                  <div className="customer-summary">
                    <div className="summary-avatar">
                      {(selected.customers?.name || "C").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong>{selected.customers?.name}</strong>
                      <span>{selected.customers?.phone}</span>
                    </div>
                    <div className="summary-date">
                      <span>LAST ACTIVITY</span>
                      <strong>{formatDate(selected.last_message_at)}</strong>
                    </div>
                  </div>

                  <div className="message-stream">
                    <div className="stream-date">
                      <span />
                      <p>CONVERSATION HISTORY</p>
                      <span />
                    </div>

                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message-row ${message.sender_type === "customer" ? "from-customer" : "from-agent"}`}
                      >
                        <div className="message-avatar">
                          {message.sender_type === "customer"
                            ? (selected.customers?.name || "C").charAt(0).toUpperCase()
                            : "V"}
                        </div>
                        <div className="message-content">
                          <div className="message-meta">
                            <strong>
                              {message.sender_type === "customer"
                                ? selected.customers?.name
                                : "Verdant Support"}
                            </strong>
                            <span>{formatTime(message.created_at)}</span>
                          </div>
                          <div className="message-bubble">{message.body}</div>
                        </div>
                      </div>
                    ))}

                    {!messages.length && (
                      <p className="empty-state">No messages in this conversation yet.</p>
                    )}
                  </div>

                  <div className="conversation-bottom-note">
                    <span>✳</span>
                    Customer messages and approved replies appear in this timeline.
                  </div>
                </>
              ) : (
                <div className="empty-workspace">
                  <div className="empty-icon">✳</div>
                  <h2>Your inbox, in balance.</h2>
                  <p>Select a conversation to view its messages and AI suggestions.</p>
                </div>
              )}
            </section>

            <aside className="copilot-panel">
              <div className="copilot-heading">
                <div className="copilot-icon">✳</div>
                <div>
                  <span className="eyebrow">YOUR ASSISTANT</span>
                  <h2>AI Copilot</h2>
                </div>
              </div>

              <div className="copilot-intro">
                <span className="copilot-spark">✦</span>
                <h3>A little help,<br />when you need it.</h3>
                <p>AI drafts a thoughtful response based on Verdant & Co.'s support guidelines. You stay in control.</p>
              </div>

              {draft ? (
                <div className="draft-review">
                  <div className="draft-status">
                    <span className="draft-status-dot" />
                    AWAITING YOUR REVIEW
                  </div>

                  <div className="draft-title-row">
                    <h3>Suggested reply</h3>
                    <span className="ai-label">AI DRAFT</span>
                  </div>

                  <p className="draft-hint">
                    Review and edit the response before sending it to the customer.
                  </p>

                  <textarea
                    className="draft-editor"
                    value={draft.suggested_reply || ""}
                    onChange={(e) => updateDraftText(e.target.value)}
                    rows={9}
                  />

                  <div className="draft-disclaimer">
                    <span>ⓘ</span>
                    This reply is private until you approve it.
                  </div>

                  <button
                    className="primary-button approve-button"
                    onClick={approveDraft}
                    disabled={approving}
                  >
                    {approving ? "Approving..." : "Approve & send reply"}
                    <span>↗</span>
                  </button>

                  {error && <p className="error-message">{error}</p>}
                  {success && <p className="success-message">{success}</p>}
                </div>
              ) : (
                <div className="no-draft">
                  <div className="no-draft-icon">✓</div>
                  <h3>You're all caught up</h3>
                  <p>
                    {selected
                      ? "There are no pending AI drafts for this conversation."
                      : "Choose a conversation to review its AI suggestions."}
                  </p>
                </div>
              )}

              <div className="copilot-footer">
                <span>✳</span>
                AI assisted. Human approved.
              </div>
            </aside>
          </main>
        )
      ) : (
        <main className="customer-page">
          <div className="customer-brand-intro">
            <span className="eyebrow">A NOTE FROM VERDANT & CO.</span>
            <h2>We're here to<br /><em>take care of you.</em></h2>
            <p>Questions about your order or products? Our support team is happy to help.</p>
          </div>

          {!customer ? (
            <form className="customer-entry-card" onSubmit={loadCustomerConversation}>
              <div className="customer-card-icon">✳</div>
              <span className="eyebrow">CUSTOMER SUPPORT</span>
              <h3>Let's get started.</h3>
              <p>Enter your details to continue your conversation with us.</p>

              <label>Your name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />

              <label>Phone number</label>
              <input
                type="tel"
                placeholder="Enter your phone number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
              />

              {customerError && <p className="error-message">{customerError}</p>}

              <button className="primary-button" disabled={customerLoading}>
                {customerLoading ? "Please wait..." : "Continue to support"}
                <span>↗</span>
              </button>
            </form>
          ) : (
            <section className="customer-chat-card">
              <div className="customer-chat-top">
                <div>
                  <span className="eyebrow">YOUR CONVERSATION</span>
                  <h3>Hello, {customer.name}</h3>
                  <p>{customer.phone}</p>
                </div>
                <button className="text-button" onClick={customerLogout}>
                  Change customer
                </button>
              </div>

              <div className="customer-chat-history">
                {customerMessages.length === 0 ? (
                  <div className="customer-empty">
                    <span>✳</span>
                    <p>Your conversation starts here. Send us a message whenever you're ready.</p>
                  </div>
                ) : (
                  customerMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`customer-chat-message ${message.sender_type === "customer" ? "mine" : "theirs"}`}
                    >
                      <span>
                        {message.sender_type === "customer"
                          ? "YOU"
                          : "VERDANT SUPPORT"}
                      </span>
                      <p>{message.body}</p>
                      <small>{formatTime(message.created_at)}</small>
                    </div>
                  ))
                )}
              </div>

              {customerError && <p className="error-message">{customerError}</p>}
              {customerSuccess && <p className="success-message">{customerSuccess}</p>}

              <form className="customer-composer" onSubmit={sendCustomerMessage}>
                <textarea
                  placeholder="Write your message..."
                  value={customerText}
                  onChange={(e) => setCustomerText(e.target.value)}
                  rows={3}
                />
                <button className="primary-button" disabled={customerSending || !customerText.trim()}>
                  {customerSending ? "Sending..." : "Send message"}
                  <span>↗</span>
                </button>
              </form>

              <p className="customer-privacy">
                Our support team will review your message and respond shortly.
              </p>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
