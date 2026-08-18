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
  Sparkles,
  ArrowUpRight,
  MapPin,
  Building2,
  Compass,
  FileText,
  Calendar,
  ShieldCheck,
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
  "What configurations do you have at Northstar One?",
  "What's the starting price for a 2 BHK?",
  "I'd like to book a site visit",
  "Do you have flexible payment plans?",
];

const SPEC_HIGHLIGHTS = [
  { label: "Starting Price", value: "₹1.85 Cr*", icon: Building2 },
  { label: "Configurations", value: "2, 3 & 4 BHK", icon: Compass },
  { label: "Possession Date", value: "Q4 2026", icon: Calendar },
  { label: "RERA Status", value: "Approved", icon: ShieldCheck },
];

export default function NorthstarHomes() {
  // Chat Widget State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Chat conversation state
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

  const openWithPrompt = (prompt: string) => {
    setIsChatOpen(true);
    sendMessage(prompt);
  };

  return (
    <div className="relative min-h-screen bg-[#0B0B0A] text-[#F1EEE7] font-sans antialiased overflow-x-hidden flex flex-col justify-between selection:bg-[#C5A880]/25 selection:text-[#F1EEE7]">
      {/* 1. CINEMATIC HERO BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <Image
          src="/hero-bg.webp"
          alt="Northstar One Luxury Architecture"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center brightness-95 contrast-105 scale-100"
        />
        {/* Multilayer Luxury Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0A] via-[#0B0B0A]/60 to-[#0B0B0A]/85" />
        <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#0B0B0A]/40 to-[#0B0B0A]/90" />
      </div>

      {/* 2. NAVIGATION BAR */}
      <header className="relative z-20 w-full border-b border-[#262522]/80 bg-[#0B0B0A]/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[#C5A880] rotate-45" />
                <span className="text-base font-semibold tracking-[0.25em] uppercase text-[#F1EEE7]">
                  NORTHSTAR
                </span>
              </div>
              <div className="text-[9px] tracking-[0.2em] text-[#AAA69D] uppercase mt-0.5 pl-4">
                Luxury Residences
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs uppercase tracking-[0.15em] text-[#AAA69D]">
            <a href="#overview" className="hover:text-[#C5A880] transition-colors">
              Overview
            </a>
            <a href="#residences" className="hover:text-[#C5A880] transition-colors">
              Residences
            </a>
            <a href="#amenities" className="hover:text-[#C5A880] transition-colors">
              Club &amp; Amenities
            </a>
            <a href="#location" className="hover:text-[#C5A880] transition-colors">
              Location
            </a>
          </nav>

          {/* Right Header CTAs */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setIsChatOpen(true);
                if (inputRef.current) inputRef.current.focus();
              }}
              className="group hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-[#1B1A17]/80 hover:bg-[#C5A880] border border-[#C5A880]/30 hover:border-[#C5A880] text-xs font-medium text-[#F1EEE7] hover:text-[#0B0B0A] transition-all duration-300 shadow-sm cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#C5A880] group-hover:text-[#0B0B0A] transition-colors" />
              <span>Talk to Aarav (AI)</span>
            </button>
            <div className="flex items-center gap-2 text-[10px] tracking-[0.14em] uppercase text-[#77736B] border-l border-[#262522] pl-4">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isConnected ? "bg-[#C5A880] shadow-[0_0_8px_#C5A880]" : "bg-rose-400"
                }`}
              />
              <span className="hidden lg:inline">{isConnected ? "Sales Concierge Live" : "Connecting..."}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 3. HERO MAIN STAGE */}
      <main className="relative z-10 flex-1 flex flex-col justify-center max-w-7xl mx-auto px-6 sm:px-8 py-12 lg:py-16 w-full">
        <div className="max-w-3xl space-y-6">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#141412]/80 backdrop-blur-md border border-[#C5A880]/30 text-[11px] tracking-[0.18em] uppercase text-[#C5A880]">
            <MapPin className="h-3.5 w-3.5 text-[#C5A880]" />
            <span>Sector 79, Gurugram &middot; Foothills of Aravalis</span>
          </div>

          {/* Hero Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#F1EEE7] leading-[1.12]">
            Architectural grandeur designed for <span className="italic font-serif text-[#C5A880]">elevated living</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-[#AAA69D] font-light leading-relaxed max-w-2xl">
            Introducing <strong className="text-[#F1EEE7] font-normal">Northstar One</strong>. Ultra-luxury 2, 3 &amp; 4 BHK residences featuring panoramic hillside views, 45,000 sq.ft private clubhouse, and signature concierge services.
          </p>

          {/* CTA Group */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={() => openWithPrompt("I'd like to book a private site visit")}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#C5A880] hover:bg-[#D4BC96] text-[#0B0B0A] text-xs font-semibold uppercase tracking-[0.14em] transition-all shadow-[0_4px_25px_rgba(197,168,128,0.25)] hover:shadow-[0_6px_30px_rgba(197,168,128,0.35)] cursor-pointer"
            >
              <span>Schedule Private Tour</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>

            <button
              onClick={() => openWithPrompt("What configurations and pricing do you have at Northstar One?")}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#141412]/80 hover:bg-[#1B1A17] border border-[#262522] hover:border-[#C5A880]/40 text-[#F1EEE7] text-xs font-medium uppercase tracking-[0.14em] backdrop-blur-md transition-all cursor-pointer"
            >
              <FileText className="h-4 w-4 text-[#C5A880]" />
              <span>Explore Floor Plans</span>
            </button>
          </div>

          {/* Key Specs Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-6 border-t border-[#262522]/80 max-w-2xl">
            {SPEC_HIGHLIGHTS.map((spec) => {
              const Icon = spec.icon;
              return (
                <div key={spec.label} className="bg-[#141412]/60 backdrop-blur-md border border-[#262522]/60 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[#77736B] text-[10px] tracking-[0.12em] uppercase mb-1">
                    <Icon className="h-3 w-3 text-[#C5A880]" />
                    <span>{spec.label}</span>
                  </div>
                  <div className="text-sm sm:text-base font-medium text-[#F1EEE7]">{spec.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 4. FOOTER TICKER STRIP */}
      <footer className="relative z-10 border-t border-[#262522]/80 bg-[#0B0B0A]/80 backdrop-blur-md py-4 px-6 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#77736B]">
          <div className="flex items-center gap-6 text-[11px] tracking-wide">
            <span>&copy; {new Date().getFullYear()} Northstar Homes Ltd.</span>
            <span className="hidden md:inline">&middot;</span>
            <span className="hidden md:inline">RERA Reg: RC/REP/HARERA/GGM/755/487/2023/99</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#AAA69D]">
            <span>Sector 79, Southern Peripheral Road, Gurugram</span>
          </div>
        </div>
      </footer>

      {/* 5. FLOATING BOTTOM-RIGHT CHATBOT WIDGET TRIGGER */}
      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
          {/* Prompt nudge pill */}
          <button
            onClick={() => setIsChatOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#141412]/95 backdrop-blur-xl border border-[#C5A880]/30 shadow-2xl text-[12px] text-[#AAA69D] hover:text-[#F1EEE7] hover:border-[#C5A880] transition-all cursor-pointer animate-fade-in"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#C5A880]" />
            <span>Have questions? Chat with Aarav</span>
          </button>

          {/* Floating trigger button */}
          <button
            onClick={() => setIsChatOpen(true)}
            aria-label="Open chat with Aarav"
            className="relative flex items-center justify-center h-14 w-14 rounded-full bg-[#C5A880] hover:bg-[#D4BC96] text-[#0B0B0A] shadow-[0_8px_30px_rgba(197,168,128,0.35)] hover:scale-105 transition-all duration-300 cursor-pointer"
          >
            <MessageSquare className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0B0B0A]" />
            </span>
          </button>
        </div>
      )}

      {/* 6. CHATBOT WINDOW (DOCKED POP-UP OR EXPANDED FULL MODAL) */}
      {isChatOpen && (
        <div
          className={
            isExpanded
              ? "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
              : "fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[410px] h-[610px] max-h-[90vh] flex flex-col"
          }
        >
          <div
            className={`flex flex-col bg-[#141412]/95 backdrop-blur-2xl border border-[#262522] rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.85)] transition-all duration-300 ${
              isExpanded ? "w-full max-w-4xl h-[88vh]" : "w-full h-full"
            }`}
          >
            {/* CHAT HEADER */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#262522] bg-[#1B1A17]/80">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-9 w-9 rounded-full bg-[#252420] border border-[#C5A880]/40 flex items-center justify-center font-medium text-[#C5A880] text-xs">
                    AH
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#141412] ${
                      isConnected ? "bg-emerald-500" : "bg-rose-400"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5">
                    <span>Aarav</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#C5A880]/15 text-[#C5A880] font-normal tracking-wide">
                      AI Consultant
                    </span>
                  </div>
                  <div className="text-[10px] text-[#77736B] tracking-wide">
                    Northstar One &middot; Sector 79
                  </div>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={viewAnalytics}
                  disabled={!sessionId || messages.length === 0}
                  title="View conversation analytics"
                  className="p-1.5 text-[#77736B] hover:text-[#F1EEE7] disabled:opacity-30 transition-colors rounded-md hover:bg-[#252420]"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={resetConversation}
                    title="Reset conversation"
                    className="p-1.5 text-[#77736B] hover:text-[#F1EEE7] transition-colors rounded-md hover:bg-[#252420]"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Collapse to bottom corner" : "Expand to modal"}
                  className="p-1.5 text-[#77736B] hover:text-[#F1EEE7] transition-colors rounded-md hover:bg-[#252420]"
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    setIsChatOpen(false);
                    setIsExpanded(false);
                  }}
                  title="Close chat"
                  className="p-1.5 text-[#77736B] hover:text-[#F1EEE7] transition-colors rounded-md hover:bg-[#252420]"
                >
                  {isExpanded ? <X className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* CHANNEL TOGGLE BAR */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0B0B0A]/60 border-b border-[#262522]/80">
              <div className="flex items-center bg-[#141412] border border-[#262522] rounded-full p-0.5 text-[11px] tracking-wide">
                <button
                  onClick={() => switchChannel("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors ${
                    channel === "chat"
                      ? "bg-[#C5A880] text-[#0B0B0A] font-medium"
                      : "text-[#AAA69D] hover:text-[#F1EEE7]"
                  }`}
                >
                  <MessageSquare className="h-3 w-3" /> Chat
                </button>
                <button
                  onClick={() => switchChannel("voice")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors ${
                    channel === "voice"
                      ? "bg-[#C5A880] text-[#0B0B0A] font-medium"
                      : "text-[#AAA69D] hover:text-[#F1EEE7]"
                  }`}
                >
                  <Phone className="h-3 w-3" /> Voice preview
                </button>
              </div>

              <div className="text-[10px] text-[#77736B] tracking-wide font-mono">
                {channel === "voice" ? "Concierge Audio Mode" : "Interactive Chat"}
              </div>
            </div>

            {channel === "voice" && (
              <div className="mx-4 mt-3 text-[11px] text-[#AAA69D] bg-[#1B1A17] border border-[#262522] rounded-lg px-3 py-2 leading-snug">
                Voice preview: Aarav replies as if on a call &mdash; short, conversational, one question at a time.
              </div>
            )}

            {/* MESSAGES VIEW */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-sm">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-between py-2">
                  <div className="space-y-1.5">
                    <p className="text-sm font-normal text-[#F1EEE7]">
                      Hi, I&apos;m Aarav from Northstar Homes.
                    </p>
                    <p className="text-xs text-[#AAA69D] font-light leading-relaxed">
                      I can help you with floor plans, pricing breakdowns, Aravali-view unit selections, or scheduling a site visit.
                    </p>
                  </div>
                  <div className="space-y-2 border-t border-[#262522] pt-3 mt-4">
                    <div className="text-[9px] tracking-[0.15em] uppercase text-[#77736B]">
                      Suggested questions
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {STARTER_PROMPTS.map((p) => (
                        <button
                          key={p}
                          onClick={() => sendMessage(p)}
                          className="text-left px-3 py-2 bg-[#1B1A17]/80 hover:bg-[#1B1A17] border border-[#262522] hover:border-[#C5A880]/50 transition-colors text-[11px] text-[#AAA69D] hover:text-[#F1EEE7] rounded-lg cursor-pointer leading-snug"
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
                        className={`max-w-[88%] px-3.5 py-2.5 rounded-xl leading-relaxed whitespace-pre-wrap text-[13px] ${
                          isUser
                            ? "bg-[#C5A880] text-[#0B0B0A] font-medium"
                            : "bg-[#1B1A17] border border-[#262522] text-[#F1EEE7]"
                        }`}
                      >
                        {m.content}
                        {!isUser && (
                          <div className="mt-2 pt-1.5 border-t border-[#262522]/60 flex justify-end">
                            <button
                              onClick={() => handleCopy(m.content, m.id)}
                              className="text-[9px] tracking-wide uppercase text-[#77736B] hover:text-[#AAA69D] flex items-center gap-1 cursor-pointer"
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
                <div className="flex items-center gap-2 text-[#77736B] text-[11px] pt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C5A880] animate-pulse" />
                  Aarav is thinking...
                </div>
              )}
              {conversationEnded && (
                <div className="text-center text-[11px] text-[#77736B] py-2 tracking-wide">
                  Conversation ended. Start a new one with the reset button above.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* CHAT INPUT FORM */}
            <div className="p-3 border-t border-[#262522] bg-[#1B1A17]/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="relative flex items-center bg-[#0B0B0A] border border-[#262522] focus-within:border-[#C5A880]/60 rounded-xl transition-colors"
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={conversationEnded ? "Conversation ended" : "Type your query for Aarav..."}
                  rows={1}
                  disabled={conversationEnded}
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-xs sm:text-sm placeholder-[#77736B] focus:outline-none resize-none disabled:opacity-50 text-[#F1EEE7]"
                />
                <div className="pr-2 flex items-center gap-1">
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
                      className="p-1.5 rounded-lg bg-[#C5A880] hover:bg-[#D4BC96] text-[#0B0B0A] disabled:opacity-25 transition-all cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
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
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="bg-[#141412] border border-[#262522] rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#262522]">
              <h3 className="text-xs tracking-[0.15em] uppercase font-semibold">Conversation Analytics</h3>
              <button
                onClick={() => setAnalyticsOpen(false)}
                className="text-[#77736B] hover:text-[#F1EEE7] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {analyticsLoading ? (
                <div className="text-[11px] text-[#77736B]">Loading analytics...</div>
              ) : analytics ? (
                <pre className="text-[11px] leading-relaxed text-[#AAA69D] whitespace-pre-wrap break-words font-mono bg-[#0B0B0A] p-3 rounded-lg border border-[#262522]">
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
