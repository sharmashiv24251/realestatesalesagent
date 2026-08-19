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
  PhoneOff,
  MessageSquare,
  BarChart3,
  X,
  Maximize2,
  Minimize2,
  ArrowRight,
  ChevronDown,
  Flame,
  Zap,
  Snowflake,
  Calendar,
  Compass,
  CheckCircle2,
  User,
  Sparkles,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

type Channel = "chat" | "voice";

interface LeadProfile {
  configuration_interest?: string | null;
  budget_min_inr?: number | null;
  budget_max_inr?: number | null;
  budget_stated_raw?: string | null;
  purpose?: string | null;
  purchase_timeline?: string | null;
  financing?: string | null;
  loan_preapproved?: boolean | null;
  current_locality?: string | null;
  possession_preference?: string | null;
  family_size?: number | null;
  first_time_buyer?: boolean | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}

interface SessionOutcome {
  interest_level?: "hot" | "warm" | "cold" | string;
  interest_evidence?: string[];
  site_visit_status?: "booked" | "failed" | "not_discussed" | string;
  booking_attempts?: Array<Record<string, unknown>>;
  scheduled_datetime_ist?: string | null;
  follow_up_required?: boolean;
  preferred_callback_time?: string | null;
  do_not_contact?: boolean;
  escalation_requested?: boolean;
  escalation_reason?: string | null;
  next_best_action?: string;
  end_reason?: string;
}

interface ConversationStats {
  languages_used?: string[];
  language_switches?: number;
  turn_count?: number;
  sentiment_trajectory?: string[];
  objections_raised?: Array<{ type: string; resolved: boolean }>;
  unanswered_questions?: string[];
  out_of_scope_attempts?: number;
  qualification_completeness?: number;
}

interface SessionAnalytics {
  session_id: string;
  lead?: LeadProfile;
  conversation?: ConversationStats;
  outcome?: SessionOutcome;
  ops?: {
    duration_seconds?: number;
    tool_calls?: number;
    total_tokens?: number;
  };
}

const STARTER_PROMPTS = [
  "What configurations and sizes are available?",
  "What is the starting price for a 2 BHK & 3 BHK?",
  "Can I schedule a private site visit this weekend?",
  "Tell me about the payment schedule & booking terms",
];

const formatInr = (amount?: number | null) => {
  if (!amount || amount <= 0) return null;
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    const l = amount / 100000;
    return `₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
};

const formatVisitDateTime = (isoDatetime?: string | null) => {
  if (!isoDatetime) return null;
  const parsed = new Date(isoDatetime);
  if (Number.isNaN(parsed.getTime())) return isoDatetime;
  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

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
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionAnalytics | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

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

  // Call timer for voice channel
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (channel === "voice" && !conversationEnded && messages.length > 0) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [channel, conversationEnded, messages.length]);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatOpen, conversationEnded, sessionSummary]);

  const switchChannel = (next: Channel) => {
    if (next === channel) return;
    handleStop();
    setChannel(next);
    setMessages([]);
    setConversationEnded(false);
    setSessionSummary(null);
    setAnalytics(null);
    setCallDuration(0);
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
    setSessionSummary(null);
    setAnalytics(null);
    setCallDuration(0);
    startSession(channel);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const endSession = async () => {
    if (!sessionId || isEndingSession || conversationEnded) return;
    setIsEndingSession(true);
    handleStop();

    try {
      const res = await fetch(`${API_URL}/api/v1/session/${sessionId}/end`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSessionSummary(data.analytics);
        setConversationEnded(true);
      } else {
        // Fallback: fetch analytics directly
        const aRes = await fetch(`${API_URL}/api/v1/session/${sessionId}/analytics`);
        if (aRes.ok) {
          const aData = await aRes.json();
          setSessionSummary(aData);
        }
        setConversationEnded(true);
      }
    } catch {
      setConversationEnded(true);
    } finally {
      setIsEndingSession(false);
    }
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

      if (data.ended) {
        setConversationEnded(true);
        // Automatically fetch final analytics to populate summary
        try {
          const aRes = await fetch(`${API_URL}/api/v1/session/${sessionId}/analytics`);
          if (aRes.ok) {
            const aData = await aRes.json();
            setSessionSummary(aData);
          }
        } catch {
          // ignore error
        }
      }
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

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
              : "fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-[460px] md:w-[500px] h-[680px] max-h-[90vh] flex flex-col"
          }
        >
          <div
            className={`flex flex-col bg-[#141311] border border-[#2B2924] rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.9)] transition-all duration-300 ${
              isExpanded ? "w-full max-w-4xl h-[88vh]" : "w-full h-full"
            }`}
          >
            {/* CHAT HEADER */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2B2924] bg-[#1A1916]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-9 w-9 rounded-full bg-[#24221D] border border-[#C5A880]/50 flex items-center justify-center font-medium text-[#C5A880] text-sm shadow-inner">
                    A
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#1A1916] ${
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
                  <div className="text-[11px] text-[#99948B]">
                    Northstar One &middot; Sector 79
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                {/* END SESSION BUTTON (Header) */}
                {messages.length > 0 && !conversationEnded && (
                  <button
                    onClick={endSession}
                    disabled={isEndingSession}
                    title="End this session & view summary"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-rose-200 transition-all cursor-pointer font-medium"
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">End Session</span>
                  </button>
                )}

                <button
                  onClick={viewAnalytics}
                  disabled={!sessionId || messages.length === 0}
                  title="View conversation analytics"
                  className="p-2 text-[#99948B] hover:text-[#F3F0E9] disabled:opacity-20 transition-colors rounded-lg hover:bg-[#24221D] cursor-pointer"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={resetConversation}
                    title="Reset conversation"
                    className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors rounded-lg hover:bg-[#24221D] cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Minimize to corner" : "Expand to modal"}
                  className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors rounded-lg hover:bg-[#24221D] cursor-pointer"
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    setIsChatOpen(false);
                    setIsExpanded(false);
                  }}
                  title="Close chat"
                  className="p-2 text-[#99948B] hover:text-[#F3F0E9] transition-colors rounded-lg hover:bg-[#24221D] cursor-pointer"
                >
                  {isExpanded ? <X className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* CHANNEL TOGGLE */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-[#11100E] border-b border-[#24221D]">
              <div className="flex items-center bg-[#1A1916] border border-[#2B2924] rounded-full p-1 text-xs">
                <button
                  onClick={() => switchChannel("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all cursor-pointer ${
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
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all cursor-pointer ${
                    channel === "voice"
                      ? "bg-[#C5A880] text-[#0A0A09] font-medium shadow-sm"
                      : "text-[#99948B] hover:text-[#F3F0E9]"
                  }`}
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>Voice Call</span>
                </button>
              </div>

              <div className="text-xs text-[#736E66] flex items-center gap-2">
                {channel === "voice" ? (
                  <span className="flex items-center gap-1.5 text-amber-300/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Voice Mode
                  </span>
                ) : (
                  <span>Digital Concierge</span>
                )}
              </div>
            </div>

            {/* VOICE CALL SIMULATION BANNER (If channel === 'voice') */}
            {channel === "voice" && (
              <div className="px-5 py-3 bg-gradient-to-r from-[#1D1B16] via-[#221F19] to-[#1D1B16] border-b border-[#C5A880]/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center h-8 w-8 rounded-full bg-[#C5A880]/20 border border-[#C5A880]/40 text-[#C5A880]">
                    <Phone className="h-4 w-4 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#F3F0E9] flex items-center gap-2">
                      <span>Aarav (Audio Inbound)</span>
                      {!conversationEnded && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {formatTimer(callDuration)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#A5A096]">
                      {conversationEnded ? "Call terminated" : "Connected · Real-time AI consultation"}
                    </div>
                  </div>
                </div>

                {/* Voice Call Specific End Call Button */}
                {!conversationEnded ? (
                  <button
                    onClick={endSession}
                    disabled={isEndingSession}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-[0_2px_15px_rgba(225,29,72,0.35)] transition-all cursor-pointer active:scale-95"
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                    <span>End Call</span>
                  </button>
                ) : (
                  <button
                    onClick={resetConversation}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#C5A880] hover:bg-[#D4BC96] text-[#0A0A09] text-xs font-semibold tracking-wide transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>New Call</span>
                  </button>
                )}
              </div>
            )}

            {/* MESSAGES VIEW */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-between py-2">
                  <div className="space-y-3">
                    <h2 className="text-base font-normal text-[#F3F0E9] flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#C5A880]" />
                      Welcome to Northstar Homes.
                    </h2>
                    <p className="text-sm text-[#A5A096] font-light leading-relaxed">
                      I&apos;m Aarav, your luxury real estate consultant. Tell me what you are looking for—configurations, budget, Aravali views, or schedule a private site visit.
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
                      <div className="text-[11px] tracking-wide text-[#736E66] mb-1 px-1">
                        {isUser ? "You" : "Aarav"} &middot; {m.timestamp}
                      </div>
                      <div
                        className={`max-w-[88%] px-4 py-3 rounded-2xl leading-relaxed text-sm ${
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
                  <span>Aarav is consulting Northstar catalog...</span>
                </div>
              )}

              {/* FINAL SESSION SUMMARY & LEAD INTELLIGENCE DOSSIER */}
              {conversationEnded && (
                <div className="pt-2 animate-in fade-in slide-in-from-bottom-3 duration-300">
                  <div className="bg-[#181714] border border-[#C5A880]/40 rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.8)] space-y-4">
                    {/* Header & Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#2B2924]">
                      <div>
                        <div className="text-[10px] tracking-[0.2em] uppercase font-semibold text-[#C5A880]">
                          Session Concluded &bull; Lead Dossier
                        </div>
                        <h3 className="text-sm sm:text-base font-medium text-[#F3F0E9] mt-0.5">
                          Captured Requirements & Intelligence
                        </h3>
                      </div>

                      {/* Interest badge */}
                      {sessionSummary?.outcome && (
                        <div className="flex items-center gap-1.5 self-start sm:self-auto">
                          {sessionSummary.outcome.interest_level === "hot" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                              <Flame className="h-3.5 w-3.5 text-emerald-400" />
                              High Priority (Hot Lead)
                            </span>
                          ) : sessionSummary.outcome.interest_level === "warm" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/50">
                              <Zap className="h-3.5 w-3.5 text-amber-400" />
                              Moderate Interest (Warm)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900/80 text-slate-300 border border-slate-700/50">
                              <Snowflake className="h-3.5 w-3.5 text-blue-400" />
                              Early Inquirer (Cold)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* KEY REQUIREMENTS GRID */}
                    {sessionSummary?.lead ? (
                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        {/* Configuration */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl">
                          <div className="text-[10px] text-[#8C877E] uppercase tracking-wider mb-1">
                            Configuration
                          </div>
                          <div className="font-medium text-[#F3F0E9] truncate">
                            {sessionSummary.lead.configuration_interest || (
                              <span className="text-[#66625B] font-normal italic">Not specified</span>
                            )}
                          </div>
                        </div>

                        {/* Budget */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl">
                          <div className="text-[10px] text-[#8C877E] uppercase tracking-wider mb-1">
                            Budget
                          </div>
                          <div className="font-medium text-[#F3F0E9] truncate">
                            {sessionSummary.lead.budget_min_inr && sessionSummary.lead.budget_max_inr
                              ? `${formatInr(sessionSummary.lead.budget_min_inr)} – ${formatInr(
                                  sessionSummary.lead.budget_max_inr
                                )}`
                              : sessionSummary.lead.budget_min_inr
                              ? `Min ${formatInr(sessionSummary.lead.budget_min_inr)}`
                              : sessionSummary.lead.budget_max_inr
                              ? `Up to ${formatInr(sessionSummary.lead.budget_max_inr)}`
                              : sessionSummary.lead.budget_stated_raw || (
                                  <span className="text-[#66625B] font-normal italic">Not specified</span>
                                )}
                          </div>
                        </div>

                        {/* Intention / Purpose */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl">
                          <div className="text-[10px] text-[#8C877E] uppercase tracking-wider mb-1">
                            Buyer Intention
                          </div>
                          <div className="font-medium text-[#F3F0E9] capitalize truncate">
                            {sessionSummary.lead.purpose ? (
                              sessionSummary.lead.purpose === "end_use" ? (
                                "Self-Use Residence"
                              ) : (
                                "Investment Asset"
                              )
                            ) : (
                              <span className="text-[#66625B] font-normal italic">Not specified</span>
                            )}
                          </div>
                        </div>

                        {/* Purchase Timeline */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl">
                          <div className="text-[10px] text-[#8C877E] uppercase tracking-wider mb-1">
                            Timeline
                          </div>
                          <div className="font-medium text-[#F3F0E9] capitalize truncate">
                            {sessionSummary.lead.purchase_timeline ? (
                              sessionSummary.lead.purchase_timeline.replace("_", " ")
                            ) : (
                              <span className="text-[#66625B] font-normal italic">Not specified</span>
                            )}
                          </div>
                        </div>

                        {/* Financing */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl">
                          <div className="text-[10px] text-[#8C877E] uppercase tracking-wider mb-1">
                            Financing
                          </div>
                          <div className="font-medium text-[#F3F0E9] capitalize truncate">
                            {sessionSummary.lead.financing ? (
                              `${sessionSummary.lead.financing.replace("_", " ")}${
                                sessionSummary.lead.loan_preapproved ? " (Pre-approved)" : ""
                              }`
                            ) : (
                              <span className="text-[#66625B] font-normal italic">Not specified</span>
                            )}
                          </div>
                        </div>

                        {/* Current Locality */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl">
                          <div className="text-[10px] text-[#8C877E] uppercase tracking-wider mb-1">
                            Current Locality
                          </div>
                          <div className="font-medium text-[#F3F0E9] truncate">
                            {sessionSummary.lead.current_locality || (
                              <span className="text-[#66625B] font-normal italic">Not specified</span>
                            )}
                          </div>
                        </div>

                        {/* Customer Contact Name & Phone */}
                        <div className="p-3 bg-[#12110F] border border-[#262420] rounded-xl col-span-2 flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            <User className="h-4 w-4 text-[#C5A880] shrink-0" />
                            <div className="truncate">
                              <div className="text-[10px] text-[#8C877E] uppercase tracking-wider">
                                Contact Information
                              </div>
                              <div className="font-medium text-[#F3F0E9] truncate">
                                {sessionSummary.lead.customer_name || sessionSummary.lead.customer_phone ? (
                                  `${sessionSummary.lead.customer_name || "Name not given"} · ${
                                    sessionSummary.lead.customer_phone || "Phone not given"
                                  }`
                                ) : (
                                  <span className="text-[#66625B] font-normal italic">
                                    Anonymous Inquiry
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {sessionSummary.outcome?.scheduled_datetime_ist && (
                            <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-800/40">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>Visit: {formatVisitDateTime(sessionSummary.outcome.scheduled_datetime_ist)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-[#12110F] rounded-xl border border-[#262420] text-center text-xs text-[#8C877E]">
                        Gathering final session analytics...
                      </div>
                    )}

                    {/* AI NEXT BEST ACTION CALLOUT */}
                    {sessionSummary?.outcome?.next_best_action && (
                      <div className="p-3.5 bg-gradient-to-r from-[#221F18] to-[#1C1A15] border border-[#C5A880]/30 rounded-xl space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-[#C5A880]">
                          <Compass className="h-3.5 w-3.5" />
                          <span>Consultant Next Best Action</span>
                        </div>
                        <p className="text-xs text-[#E6E2D8] font-normal leading-relaxed">
                          {sessionSummary.outcome.next_best_action}
                        </p>
                      </div>
                    )}

                    {/* EVIDENCE TAGS */}
                    {sessionSummary?.outcome?.interest_evidence &&
                      sessionSummary.outcome.interest_evidence.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wider text-[#736E66]">
                            Observed Buying Signals
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {sessionSummary.outcome.interest_evidence.map((ev, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-[#24221D] text-[#C5C0B6] border border-[#302D26]"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 text-[#C5A880]" />
                                <span className="capitalize">{ev}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* RESTART CHAT CTA BUTTON */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                      <button
                        onClick={resetConversation}
                        className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#C5A880] hover:bg-[#D4BC96] text-[#0A0A09] text-xs font-semibold uppercase tracking-wider shadow-lg hover:shadow-[0_4px_20px_rgba(197,168,128,0.3)] transition-all cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Restart Chat / New Session</span>
                      </button>

                      <button
                        onClick={viewAnalytics}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-[#1F1E1B] hover:bg-[#2A2824] border border-[#38352E] text-xs text-[#C5C0B6] hover:text-[#F3F0E9] transition-all cursor-pointer"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>Raw Data</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* INPUT SECTION */}
            <div className="p-4 border-t border-[#2B2924] bg-[#1A1916]">
              {conversationEnded ? (
                <div className="flex items-center justify-between p-2.5 px-4 bg-[#11100E] border border-[#2B2924] rounded-xl text-xs">
                  <span className="text-[#8C877E]">
                    Session ended. All information gathered above.
                  </span>
                  <button
                    onClick={resetConversation}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C5A880] hover:bg-[#D4BC96] text-[#0A0A09] font-medium transition-all cursor-pointer text-xs"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Restart Chat</span>
                  </button>
                </div>
              ) : (
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
                    placeholder={
                      channel === "voice"
                        ? "Speak or type voice response..."
                        : "Ask Aarav about Northstar One..."
                    }
                    rows={1}
                    className="flex-1 bg-transparent px-4 py-3 text-sm placeholder-[#736E66] focus:outline-none resize-none text-[#F3F0E9]"
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
                        disabled={!inputValue.trim()}
                        className="p-2 rounded-lg bg-[#C5A880] hover:bg-[#D4BC96] text-[#0A0A09] disabled:opacity-25 transition-all cursor-pointer"
                        title="Send message"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. RAW ANALYTICS MODAL */}
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

