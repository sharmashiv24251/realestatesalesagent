"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  RefreshCw,
  Copy,
  Check,
  StopCircle,
  Phone,
  MessageSquare,
  BarChart3,
  X,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

type Channel = "chat" | "voice";

const STARTER_PROMPTS = [
  "What configurations do you have at Northstar One?",
  "What's the starting price for a 2 BHK?",
  "I'd like to book a site visit",
  "Do you have flexible payment plans?",
];

export default function NorthstarHomes() {
  const [channel, setChannel] = useState<Channel>("chat");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const idCounter = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${idCounter.current++}`;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const startSession = async (forChannel: Channel) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: forChannel }),
      });
      const data = await res.json();
      setSessionId(data.session_id);
    } catch {
      setSessionId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const [healthRes, sessionRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/v1/health`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "chat" }),
        }),
      ]);
      if (cancelled) return;
      setIsConnected(healthRes.status === "fulfilled" && healthRes.value.ok);
      if (sessionRes.status === "fulfilled") {
        const data = await sessionRes.value.json();
        if (!cancelled) setSessionId(data.session_id);
      }
    };

    bootstrap();
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/v1/health`, { cache: "no-store" })
        .then((res) => {
          if (!cancelled) setIsConnected(res.ok);
        })
        .catch(() => {
          if (!cancelled) setIsConnected(false);
        });
    }, 25000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [API_URL]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const switchChannel = (next: Channel) => {
    if (next === channel) return;
    handleStop();
    setChannel(next);
    setMessages([]);
    setConversationEnded(false);
    setAnalytics(null);
    startSession(next);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const resetConversation = () => {
    handleStop();
    setMessages([]);
    setConversationEnded(false);
    setAnalytics(null);
    startSession(channel);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const viewAnalytics = async () => {
    if (!sessionId) return;
    setAnalyticsOpen(true);
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/session/${sessionId}/analytics`);
      const data = await res.json();
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const sendMessage = async (customText?: string) => {
    const text = (customText ?? inputValue).trim();
    if (!text || isLoading || !sessionId || conversationEnded) return;

    const userMessage: Message = {
      id: nextId("msg"),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const reply: Message = {
        id: nextId("asst"),
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, reply]);
      if (data.ended) setConversationEnded(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId("err"),
            role: "assistant",
            content: `Couldn't reach the Northstar agent at \`${API_URL}\`. Is the backend running?`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0A] text-[#F1EEE7] font-sans antialiased flex flex-col">
      {/* HEADER */}
      <header className="border-b border-[#262522] bg-[#0B0B0A]/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold tracking-[0.15em] uppercase">Northstar Homes</div>
            <div className="text-[11px] text-[#77736B] tracking-wide mt-0.5">
              Northstar One &middot; Sector 79, Gurugram
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px] tracking-[0.14em] uppercase text-[#77736B]">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[#C5A880]" : "bg-rose-400"}`} />
            <span>{isConnected ? "Agent online" : "Connecting..."}</span>
          </div>
        </div>
      </header>

      {/* MAIN CHAT */}
      <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Controls row */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center bg-[#141412] border border-[#262522] rounded-full p-1 text-[11px] tracking-wide">
            <button
              onClick={() => switchChannel("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                channel === "chat" ? "bg-[#C5A880] text-[#0B0B0A]" : "text-[#AAA69D] hover:text-[#F1EEE7]"
              }`}
            >
              <MessageSquare className="h-3 w-3" /> Chat
            </button>
            <button
              onClick={() => switchChannel("voice")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                channel === "voice" ? "bg-[#C5A880] text-[#0B0B0A]" : "text-[#AAA69D] hover:text-[#F1EEE7]"
              }`}
            >
              <Phone className="h-3 w-3" /> Voice preview
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={viewAnalytics}
              disabled={!sessionId || messages.length === 0}
              title="View conversation analytics"
              className="p-2 text-[#77736B] hover:text-[#F1EEE7] disabled:opacity-30 transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
            </button>
            {messages.length > 0 && (
              <button
                onClick={resetConversation}
                title="Start a new conversation"
                className="p-2 text-[#77736B] hover:text-[#F1EEE7] transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {channel === "voice" && (
          <div className="mb-4 text-[11px] text-[#AAA69D] bg-[#141412] border border-[#262522] rounded-lg px-4 py-2.5">
            Voice preview: Aarav replies as if on a call -- short, no formatting, one question at a
            time. Type as if speaking; there&apos;s no real audio here.
          </div>
        )}

        {/* Conversation */}
        <div className="flex-1 flex flex-col bg-[#141412] border border-[#262522] rounded-xl overflow-hidden min-h-[480px]">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-between py-2">
                <div>
                  <p className="text-base font-light mb-1">Hi, I&apos;m Aarav from Northstar Homes.</p>
                  <p className="text-sm text-[#AAA69D] font-light">
                    Tell me what you&apos;re looking for and I&apos;ll help you find the right fit at
                    Northstar One.
                  </p>
                </div>
                <div className="space-y-2 border-t border-[#262522] pt-4 mt-6">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-[#77736B] mb-2">
                    Try asking
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STARTER_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        className="text-left px-3 py-2.5 bg-[#1B1A17] border border-[#262522] hover:border-[#C5A880]/50 transition-colors text-[12px] text-[#AAA69D] hover:text-[#F1EEE7] rounded-lg"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                    <div className="text-[9px] tracking-[0.12em] uppercase text-[#77736B] mb-1">
                      {isUser ? "You" : "Aarav"} &middot; {m.timestamp}
                    </div>
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-lg leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-[#1B1A17] border border-[#262522]"
                          : "bg-[#0B0B0A] border border-[#262522]"
                      }`}
                    >
                      {m.content}
                      {!isUser && (
                        <div className="mt-1.5 pt-1.5 border-t border-[#262522]/60 flex justify-end">
                          <button
                            onClick={() => handleCopy(m.content, m.id)}
                            className="text-[9px] tracking-wide uppercase text-[#77736B] hover:text-[#AAA69D] flex items-center gap-1"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="h-2.5 w-2.5 text-[#C5A880]" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-2.5 w-2.5" /> Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {isLoading && (
              <div className="flex items-center gap-1.5 text-[#77736B] text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C5A880] animate-pulse" />
                Aarav is typing...
              </div>
            )}
            {conversationEnded && (
              <div className="text-center text-[11px] text-[#77736B] py-2 tracking-wide">
                Conversation ended. Start a new one with the reset button above.
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#262522] bg-[#1B1A17]/60">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="relative flex items-center bg-[#0B0B0A] border border-[#262522] focus-within:border-[#C5A880]/50 rounded-lg transition-colors"
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={conversationEnded ? "Conversation ended" : "Type your message..."}
                rows={1}
                disabled={conversationEnded}
                className="flex-1 bg-transparent px-3.5 py-3 text-sm placeholder-[#77736B] focus:outline-none resize-none disabled:opacity-50"
              />
              <div className="pr-2">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="p-1.5 text-[#AAA69D] hover:text-[#F1EEE7] transition-colors"
                  >
                    <StopCircle className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || conversationEnded}
                    className="p-1.5 text-[#AAA69D] hover:text-[#C5A880] disabled:opacity-30 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* ANALYTICS PANEL */}
      {analyticsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#141412] border border-[#262522] rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#262522]">
              <h3 className="text-xs tracking-[0.15em] uppercase font-semibold">Conversation Analytics</h3>
              <button onClick={() => setAnalyticsOpen(false)} className="text-[#77736B] hover:text-[#F1EEE7]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {analyticsLoading ? (
                <div className="text-[11px] text-[#77736B]">Loading...</div>
              ) : analytics ? (
                <pre className="text-[11px] leading-relaxed text-[#AAA69D] whitespace-pre-wrap break-words">
                  {JSON.stringify(analytics, null, 2)}
                </pre>
              ) : (
                <div className="text-[11px] text-[#77736B]">Couldn&apos;t load analytics.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
