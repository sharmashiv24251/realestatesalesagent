"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
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
  Maximize2,
  Minimize2,
  ArrowRight,
  ChevronDown,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

type Channel = "chat" | "voice";

const STARTER_PROMPTS = [
  "What configurations and sizes are available?",
  "What is the starting price for a 2 BHK & 3 BHK?",
  "Can I schedule a private site visit this weekend?",
  "Tell me about the payment schedule & booking terms",
];

export default function NorthstarHomes() {
  // Chat widget visibility & size
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Conversation state
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
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatOpen]);

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
            content: `Couldn't reach the Northstar sales consultant at \`${API_URL}\`. Please verify if the backend server is running.`,
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

  const openWithPrompt = (prompt: string) => {
    setIsChatOpen(true);
    sendMessage(prompt);
  };

  return (
    <div className="relative min-h-screen bg-[#0A0A09] text-[#F3F0E9] font-sans antialiased overflow-x-hidden flex flex-col justify-between selection:bg-[#C5A880]/30 selection:text-[#F3F0E9]">
      {/* 1. CINEMATIC BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <Image
          src="/hero-bg.webp"
          alt="Northstar Homes Architecture"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-40 brightness-95"
        />
        {/* Soft, natural gradients to create depth without visual clutter */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A09]/95 via-[#0A0A09]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A09] via-transparent to-[#0A0A09]/80" />
      </div>

      {/* 2. MINIMAL LUXURY HEADER */}
      <header className="relative z-10 w-full">
        <div className="max-w-7xl mx-auto px-8 sm:px-12 py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 bg-[#C5A880] rotate-45" />
            <div className="text-base font-medium tracking-[0.3em] uppercase text-[#F3F0E9]">
              NORTHSTAR
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs tracking-[0.18em] uppercase text-[#99948B]">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"
              }`}
            />
            <span>{isConnected ? "Aarav Available" : "Connecting..."}</span>
          </div>
        </div>
      </header>

      {/* 3. CLEAN, SPACIOUS HERO SECTION */}
      <main className="relative z-10 flex-1 flex flex-col justify-center max-w-7xl mx-auto px-8 sm:px-12 py-12 lg:py-20 w-full">
        <div className="max-w-2xl space-y-8">
          {/* Subtle location tag */}
          <div className="text-xs tracking-[0.25em] uppercase text-[#C5A880] font-medium">
            Sector 79 &middot; Gurugram
          </div>

          {/* Minimal headline with generous breathing room */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#F3F0E9] leading-[1.15]">
            Northstar One
          </h1>

          {/* Refined subtitle */}
          <p className="text-lg sm:text-xl text-[#A5A096] font-light leading-relaxed max-w-xl">
            Ultra-luxury residences nestled against the Aravalis. Designed for privacy, light, and elevated living.
          </p>

          {/* Simple CTA */}
          <div className="pt-2">
            <button
              onClick={() => {
                setIsChatOpen(true);
                if (inputRef.current) inputRef.current.focus();
              }}
              className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full bg-[#C5A880] hover:bg-[#D4BC96] text-[#0A0A09] text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-[0_4px_25px_rgba(197,168,128,0.2)] hover:shadow-[0_6px_30px_rgba(197,168,128,0.35)] cursor-pointer"
            >
              <span>Enquire with Aarav</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>

      {/* 4. MINIMAL FOOTER */}
      <footer className="relative z-10 py-8 px-8 sm:px-12">
        <div className="max-w-7xl mx-auto text-xs text-[#736E66] tracking-wide">
          &copy; {new Date().getFullYear()} Northstar Homes. All rights reserved.
        </div>
      </footer>

      {/* 5. FLOATING LAUNCHER (When Chat is Closed) */}
      {!isChatOpen && (
        <div className="fixed bottom-8 right-8 z-40">
          <button
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-3.5 px-5 py-3.5 rounded-full bg-[#181714] hover:bg-[#201F1B] border border-[#C5A880]/40 hover:border-[#C5A880] text-[#F3F0E9] shadow-[0_12px_40px_rgba(0,0,0,0.6)] hover:scale-105 transition-all duration-300 cursor-pointer"
          >
            <div className="relative flex items-center justify-center h-8 w-8 rounded-full bg-[#C5A880] text-[#0A0A09]">
              <MessageSquare className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[#181714]" />
            </div>
            <div className="text-left pr-1">
              <div className="text-xs font-semibold tracking-wide text-[#F3F0E9]">Chat with Aarav</div>
              <div className="text-[10px] text-[#99948B]">Sales Consultant</div>
            </div>
          </button>
        </div>
      )}

      {/* 6. EXPANDED / DOCKED CHAT WINDOW */}
      {isChatOpen && (
        <div
          className={
            isExpanded
              ? "fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8 animate-in fade-in duration-200"
              : "fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-[440px] md:w-[460px] h-[640px] max-h-[88vh] flex flex-col"
          }
        >
          <div
            className={`flex flex-col bg-[#141311] border border-[#2B2924] rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.9)] transition-all duration-300 ${
              isExpanded ? "w-full max-w-3xl h-[86vh]" : "w-full h-full"
            }`}
          >
            {/* CHAT HEADER */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2B2924] bg-[#1A1916]">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-[#24221D] border border-[#C5A880]/50 flex items-center justify-center font-medium text-[#C5A880] text-sm shadow-inner">
                    A
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#1A1916] ${
                      isConnected ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-wide text-[#F3F0E9] flex items-center gap-2">
                    <span>Aarav</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C5A880]/15 text-[#C5A880] font-normal tracking-wider uppercase">
                      Sales
                    </span>
                  </div>
                  <div className="text-xs text-[#99948B] mt-0.5">
                    Northstar One &middot; Sector 79
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={viewAnalytics}
                  disabled={!sessionId || messages.length === 0}
                  title="View conversation analytics"
                  className="p-2 text-[#99948B] hover:text-[#F3F0E9] disabled:opacity-20 transition-colors rounded-lg hover:bg-[#24221D]"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={resetConversation}
                    title="Reset conversation"
                    className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors rounded-lg hover:bg-[#24221D]"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Minimize to corner" : "Expand to modal"}
                  className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors rounded-lg hover:bg-[#24221D]"
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    setIsChatOpen(false);
                    setIsExpanded(false);
                  }}
                  title="Close chat"
                  className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors rounded-lg hover:bg-[#24221D]"
                >
                  {isExpanded ? <X className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* CHANNEL TOGGLE */}
            <div className="flex items-center justify-between px-6 py-3 bg-[#11100E] border-b border-[#24221D]">
              <div className="flex items-center bg-[#1A1916] border border-[#2B2924] rounded-full p-1 text-xs">
                <button
                  onClick={() => switchChannel("chat")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                    channel === "chat"
                      ? "bg-[#C5A880] text-[#0A0A09] font-medium shadow-sm"
                      : "text-[#99948B] hover:text-[#F3F0E9]"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Chat</span>
                </button>
                <button
                  onClick={() => switchChannel("voice")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                    channel === "voice"
                      ? "bg-[#C5A880] text-[#0A0A09] font-medium shadow-sm"
                      : "text-[#99948B] hover:text-[#F3F0E9]"
                  }`}
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>Voice preview</span>
                </button>
              </div>

              <div className="text-xs text-[#736E66]">
                {channel === "voice" ? "Phone Call Simulation" : "Digital Concierge"}
              </div>
            </div>

            {/* MESSAGES VIEW */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-between py-2">
                  <div className="space-y-3">
                    <h2 className="text-base font-normal text-[#F3F0E9]">
                      Welcome to Northstar Homes.
                    </h2>
                    <p className="text-sm text-[#A5A096] font-light leading-relaxed">
                      I&apos;m Aarav, your personal sales consultant. Feel free to ask about floor plans, pricing, Aravali views, or booking a private site visit.
                    </p>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-[#24221D]">
                    <div className="text-xs tracking-wider uppercase text-[#736E66] font-medium">
                      Suggested Inquiries
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => openWithPrompt(prompt)}
                          className="text-left px-4 py-3 bg-[#1A1916] hover:bg-[#22201C] border border-[#2B2924] hover:border-[#C5A880]/50 transition-all text-xs sm:text-sm text-[#C5C0B6] hover:text-[#F3F0E9] rounded-xl cursor-pointer leading-relaxed"
                        >
                          {prompt}
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
                      <div className="text-[11px] tracking-wide text-[#736E66] mb-1.5 px-1">
                        {isUser ? "You" : "Aarav"} &middot; {m.timestamp}
                      </div>
                      <div
                        className={`max-w-[85%] px-4 py-3 rounded-2xl leading-relaxed text-sm ${
                          isUser
                            ? "bg-[#C5A880] text-[#0A0A09] font-medium rounded-tr-sm shadow-md"
                            : "bg-[#1A1916] border border-[#2B2924] text-[#F3F0E9] rounded-tl-sm shadow-md"
                        }`}
                      >
                        {m.content}
                        {!isUser && (
                          <div className="mt-2.5 pt-2 border-t border-[#2B2924]/80 flex justify-end">
                            <button
                              onClick={() => handleCopy(m.content, m.id)}
                              className="text-[11px] text-[#99948B] hover:text-[#F3F0E9] flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              {copiedId === m.id ? (
                                <>
                                  <Check className="h-3 w-3 text-[#C5A880]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copy</span>
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
                <div className="flex items-center gap-2.5 text-[#A5A096] text-xs pt-1 px-1">
                  <span className="h-2 w-2 rounded-full bg-[#C5A880] animate-pulse" />
                  <span>Aarav is thinking...</span>
                </div>
              )}
              {conversationEnded && (
                <div className="text-center text-xs text-[#99948B] py-3 tracking-wide">
                  Conversation completed. Click the refresh button above to start a new chat.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT SECTION */}
            <div className="p-4 border-t border-[#2B2924] bg-[#1A1916]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="relative flex items-center bg-[#11100E] border border-[#2B2924] focus-within:border-[#C5A880]/70 rounded-xl transition-all"
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={conversationEnded ? "Conversation ended" : "Ask Aarav about Northstar One..."}
                  rows={1}
                  disabled={conversationEnded}
                  className="flex-1 bg-transparent px-4 py-3 text-sm placeholder-[#736E66] focus:outline-none resize-none disabled:opacity-50 text-[#F3F0E9]"
                />
                <div className="pr-3 flex items-center gap-1.5">
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors"
                      title="Stop generating"
                    >
                      <StopCircle className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || conversationEnded}
                      className="p-2 rounded-lg bg-[#C5A880] hover:bg-[#D4BC96] text-[#0A0A09] disabled:opacity-25 transition-all cursor-pointer"
                      title="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 7. ANALYTICS MODAL */}
      {analyticsOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-[#141311] border border-[#2B2924] rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2B2924]">
              <h3 className="text-xs tracking-[0.2em] uppercase font-semibold text-[#F3F0E9]">
                Conversation Analytics
              </h3>
              <button
                onClick={() => setAnalyticsOpen(false)}
                className="text-[#99948B] hover:text-[#F3F0E9] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {analyticsLoading ? (
                <div className="text-xs text-[#99948B]">Loading analytics...</div>
              ) : analytics ? (
                <pre className="text-xs leading-relaxed text-[#A5A096] whitespace-pre-wrap break-words font-mono bg-[#0A0A09] p-4 rounded-xl border border-[#24221D]">
                  {JSON.stringify(analytics, null, 2)}
                </pre>
              ) : (
                <div className="text-xs text-[#99948B]">Couldn&apos;t load analytics.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
