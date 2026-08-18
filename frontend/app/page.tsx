"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  MessageSquare,
  X,
  Maximize2,
  Minimize2,
  Send,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  ArrowUpRight,
  StopCircle,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface HealthStatus {
  status: string;
  version: string;
  model: string;
  api_key_configured: boolean;
  service: string;
}

const CURATED_COLLECTION = [
  {
    id: "asset-1",
    label: "RESIDENTIAL SANCTUARY",
    title: "The Sky Penthouse at Aurum Heights",
    location: "Worli Sea Face, Mumbai",
    price: "₹18,50,00,000",
    specs: "4,850 sq.ft • 4 Bedrooms • Private Plunge Pool • Arabian Sea Panoramic",
    inquiry: "I am inquiring about The Sky Penthouse at Aurum Heights in Worli Sea Face. Please provide architectural details, floor plans, and acquisition terms.",
  },
  {
    id: "asset-2",
    label: "COMMERCIAL BLUE-CHIP",
    title: "The Shubh Horizon Tower",
    location: "Financial District, Hyderabad",
    price: "₹6,20,00,000 onwards",
    specs: "Grade-A Office Suites • 9.2% Net Rental Yield • 10-Year Institutional Leases",
    inquiry: "Please provide a financial yield breakdown and tenant covenant profile for Grade-A office suites at The Shubh Horizon Tower.",
  },
  {
    id: "asset-3",
    label: "HERITAGE COASTAL ESTATE",
    title: "Vedic Meadows Luxury Villas",
    location: "North Goa Escapes",
    price: "₹11,00,000,000",
    specs: "1.2 Acres Land Parcel • 5 Bedrooms • Fully Serviced Estate • Private Forest Boundary",
    inquiry: "I am interested in Vedic Meadows Luxury Villas in Goa. What are the title verification status, maintenance protocols, and rental yield projections?",
  },
];

const ADVISORY_PILLARS = [
  {
    number: "01",
    title: "Provenance",
    description: "Every asset undergoes thorough title verification, documentation scrutiny, and historical valuation audits prior to private presentation.",
  },
  {
    number: "02",
    title: "Conviction",
    description: "We filter out market noise, presenting only opportunities distinguished by architectural scarcity, prime positioning, and resilient capital preservation.",
  },
  {
    number: "03",
    title: "Discretion",
    description: "An entirely private mandate experience. From off-market discovery to legal closing, all transactions remain strictly confidential.",
  },
];

const SUGGESTED_ACTIONS = [
  {
    label: "Find a trophy residence",
    prompt: "I am looking for an ultra-luxury trophy residence in a prime metropolitan location. What exclusive options match high architectural pedigree and capital growth?",
  },
  {
    label: "Explore investment assets",
    prompt: "What high-yield commercial and residential asset classes are delivering superior risk-adjusted returns in the current real estate cycle?",
  },
  {
    label: "Discuss an acquisition",
    prompt: "I would like to initiate an acquisition mandate for a ₹10 Cr to ₹25 Cr asset. What is the advisory and due diligence protocol?",
  },
  {
    label: "Speak about a specific property",
    prompt: "Tell me about the signature developments currently represented by Shubh Real Estates and their yield metrics.",
  },
];

export default function ShubhRealEstates() {
  // Chatbot State (Fixed Bottom Right)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Health check
  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/health`, { cache: "no-store" });
      if (res.ok) {
        const data: HealthStatus = await res.json();
        setHealth(data);
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch {
      setIsConnected(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 25000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [messages, isChatOpen, isMaximized]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const clearConversation = () => {
    handleStop();
    setMessages([]);
  };

  const openChatWithPrompt = (promptText: string) => {
    setIsChatOpen(true);
    sendMessage(promptText);
  };

  const sendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputPrompt;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: "msg-" + Date.now(),
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInputPrompt("");
    setIsLoading(true);

    const assistantMsgId = "asst-" + Date.now();
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formattedHistory = newHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        content: m.content,
      }));

      const res = await fetch(`${API_URL}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: formattedHistory,
          model: "gemini-3.5-flash-lite",
          stream: true,
          system_instruction:
            "You are the senior private property advisor for 'Shubh Real Estates', an elite private real estate advisory firm specializing in trophy residences, heritage estates, and high-conviction commercial assets. Speak with quiet confidence, precision, architectural awareness, and financial clarity. Address clients with dignity, discretion, and professional depth. Avoid generic AI enthusiasm, emojis, or sales pressure.",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMessage = `Advisory channel error (${res.status}).`;
        try {
          const errData = await res.json();
          if (errData.detail) errMessage = errData.detail;
        } catch {}
        throw new Error(errMessage);
      }

      if (!res.body) throw new Error("No advisory stream response received.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                accumulatedText += parsed.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, content: accumulatedText } : msg
                  )
                );
              } else if (parsed.error) {
                accumulatedText += `\n\n[Advisory notice: ${parsed.error}]`;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, content: accumulatedText } : msg
                  )
                );
              }
            } catch {
              if (dataStr && !dataStr.startsWith("{")) {
                accumulatedText += dataStr;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, content: accumulatedText } : msg
                  )
                );
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content:
                    msg.content ||
                    `The advisory channel could not establish a connection to the backend server at \`${API_URL}\`.\n\nPlease verify that the backend is active and your Gemini API key is configured.`,
                }
              : msg
          )
        );
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
    <div className="min-h-screen bg-[#0B0B0A] text-[#F1EEE7] font-sans antialiased selection:bg-[#C5A880]/20 selection:text-[#F1EEE7]">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION (FULL SCREEN BACKGROUND VILLA IMAGE AS VISUAL FOUNDATION) */}
      {/* ========================================================================= */}
      <section className="relative min-h-screen w-full flex flex-col justify-between">
        {/* Full-Screen Architectural Background Image */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Image
            src="/hero-bg.webp"
            alt="Shubh Real Estates Architectural Residence"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center filter brightness-[0.70] contrast-[1.02]"
          />
          {/* Subtle Solid Translucent Charcoal Treatment */}
          <div className="absolute inset-0 bg-[#0B0B0A]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0A] via-transparent to-[#0B0B0A]/80" />
        </div>

        {/* TOP NAVIGATION */}
        <header className="relative z-20 w-full border-b border-white/[0.07] bg-[#0B0B0A]/40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 sm:px-12 h-20 flex items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold tracking-[0.2em] text-[#F1EEE7] uppercase">
                SHUBH
              </span>
              <span className="h-3 w-[1px] bg-white/20" />
              <span className="text-[10px] tracking-[0.25em] text-[#AAA69D] uppercase font-light">
                Real Estates
              </span>
            </div>

            {/* Nav Links */}
            <nav className="hidden md:flex items-center gap-8 text-[11px] tracking-[0.15em] text-[#AAA69D] uppercase font-medium">
              <a href="#collection" className="hover:text-[#F1EEE7] transition-colors">
                The Collection
              </a>
              <a href="#approach" className="hover:text-[#F1EEE7] transition-colors">
                Our Approach
              </a>
              <a href="#advisory" className="hover:text-[#F1EEE7] transition-colors">
                Advisory Protocol
              </a>
            </nav>

            {/* Right Action Button */}
            <button
              onClick={() => setIsChatOpen(true)}
              className="text-[11px] tracking-[0.15em] uppercase font-medium text-[#F1EEE7] border border-white/20 hover:border-[#C5A880]/60 px-4 py-2 transition-colors bg-[#141412]/50 backdrop-blur-sm"
            >
              Speak with Advisor
            </button>
          </div>
        </header>

        {/* HERO MAIN BODY */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 py-16 my-auto">
          <div className="max-w-3xl">
            {/* Small Descriptor */}
            <div className="flex items-center gap-2.5 mb-6 text-[10px] tracking-[0.28em] text-[#AAA69D] uppercase font-medium">
              <span className="h-[1px] w-6 bg-[#C5A880]/80" />
              <span>PRIVATE REAL ESTATE ADVISORY</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-[4.2rem] font-light tracking-[-0.03em] text-[#F1EEE7] leading-[1.10] mb-8">
              Exceptional properties. <br />
              <span className="font-normal text-[#F1EEE7]">Considered acquisitions.</span>
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-[#AAA69D] leading-relaxed max-w-xl mb-10 font-light">
              Private advisory for distinguished residences, trophy assets, and high-conviction real estate opportunities across premier metropolitan corridors.
            </p>

            {/* Rectangular Restrained CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-16">
              <button
                onClick={() => {
                  setIsChatOpen(true);
                  if (messages.length === 0) {
                    sendMessage("Good evening. I would like a consultation on current prime acquisition opportunities.");
                  }
                }}
                className="text-xs tracking-[0.12em] uppercase font-medium bg-[#F1EEE7] text-[#0B0B0A] px-7 py-4 border border-[#F1EEE7] hover:bg-transparent hover:text-[#F1EEE7] transition-all"
              >
                Speak with the Advisor
              </button>

              <a
                href="#collection"
                className="text-xs tracking-[0.12em] uppercase font-medium text-[#AAA69D] hover:text-[#F1EEE7] px-7 py-4 border border-white/15 hover:border-white/40 transition-colors bg-[#141412]/40 backdrop-blur-sm"
              >
                Explore Properties
              </a>
            </div>

            {/* Whispered Metrics */}
            <div className="pt-8 border-t border-white/10 grid grid-cols-3 gap-8 text-left max-w-lg">
              <div>
                <div className="text-xl sm:text-2xl font-light text-[#F1EEE7] tracking-tight">₹2,400 Cr+</div>
                <div className="text-[10px] text-[#77736B] tracking-[0.1em] uppercase mt-1">
                  Portfolio Advised
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-light text-[#F1EEE7] tracking-tight">14.8%</div>
                <div className="text-[10px] text-[#77736B] tracking-[0.1em] uppercase mt-1">
                  Avg Capital Return
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-light text-[#F1EEE7] tracking-tight">100%</div>
                <div className="text-[10px] text-[#77736B] tracking-[0.1em] uppercase mt-1">
                  Title Provenance
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HERO BOTTOM SCROLL BAR */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 py-5 flex items-center justify-between border-t border-white/[0.07] text-[10px] tracking-[0.2em] text-[#77736B] uppercase">
          <span>Scroll to explore portfolio</span>
          <span className="hidden sm:inline">Provenance • Conviction • Discretion</span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. THE COLLECTION (CURATED EXCEPTIONAL HOLDINGS)                           */}
      {/* ========================================================================= */}
      <section id="collection" className="py-28 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#262522]">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <div className="text-[10px] tracking-[0.28em] text-[#C5A880] uppercase font-medium mb-3">
              THE COLLECTION
            </div>
            <h2 className="text-3xl sm:text-4xl font-light text-[#F1EEE7] tracking-tight">
              Curated Acquisition Opportunities
            </h2>
          </div>
          <p className="text-xs text-[#AAA69D] max-w-md font-light leading-relaxed">
            Distinguished residential sanctuaries and institutional-grade commercial holdings available exclusively via private mandate.
          </p>
        </div>

        {/* Property Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {CURATED_COLLECTION.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col justify-between bg-[#141412] border border-[#262522] p-8 hover:border-[#C5A880]/40 transition-all duration-300"
            >
              <div>
                <div className="text-[9px] tracking-[0.22em] text-[#77736B] uppercase font-semibold mb-3">
                  {item.label}
                </div>

                <h3 className="text-lg font-normal text-[#F1EEE7] mb-2 leading-snug">
                  {item.title}
                </h3>

                <div className="text-xs text-[#AAA69D] mb-6 font-light">
                  {item.location}
                </div>

                <div className="pt-4 border-t border-[#262522] mb-6">
                  <div className="text-xs text-[#77736B] uppercase tracking-wider mb-1">Acquisition Valuation</div>
                  <div className="text-lg font-light text-[#F1EEE7]">{item.price}</div>
                </div>

                <p className="text-xs text-[#AAA69D] font-light leading-relaxed mb-8">
                  {item.specs}
                </p>
              </div>

              <button
                onClick={() => openChatWithPrompt(item.inquiry)}
                className="w-full flex items-center justify-between text-[11px] tracking-[0.14em] uppercase font-medium text-[#AAA69D] group-hover:text-[#F1EEE7] pt-4 border-t border-[#262522] transition-colors"
              >
                <span>Consult Advisor on this Asset</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#77736B] group-hover:text-[#C5A880] transition-colors" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. OUR APPROACH (PROVENANCE, CONVICTION, DISCRETION)                      */}
      {/* ========================================================================= */}
      <section id="approach" className="py-28 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#262522] bg-[#0E0E0C]">
        <div className="mb-16">
          <div className="text-[10px] tracking-[0.28em] text-[#C5A880] uppercase font-medium mb-3">
            OUR APPROACH
          </div>
          <h2 className="text-3xl sm:text-4xl font-light text-[#F1EEE7] tracking-tight">
            Three Principles of Private Advisory
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {ADVISORY_PILLARS.map((pillar, idx) => (
            <div key={idx} className="flex flex-col border-t border-[#262522] pt-6">
              <div className="text-xs text-[#C5A880] font-mono mb-4 tracking-widest">
                {pillar.number}
              </div>
              <h3 className="text-lg font-normal text-[#F1EEE7] mb-3">
                {pillar.title}
              </h3>
              <p className="text-xs text-[#AAA69D] leading-relaxed font-light">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. ADVISORY PROTOCOL                                                      */}
      {/* ========================================================================= */}
      <section id="advisory" className="py-28 px-6 sm:px-12 max-w-7xl mx-auto border-t border-[#262522]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5">
            <div className="text-[10px] tracking-[0.28em] text-[#C5A880] uppercase font-medium mb-3">
              ADVISORY PROTOCOL
            </div>
            <h2 className="text-3xl font-light text-[#F1EEE7] tracking-tight mb-6">
              Intelligent Synthesis for Complex Mandates
            </h2>
            <p className="text-xs text-[#AAA69D] font-light leading-relaxed mb-8">
              Our AI advisor operates as an analytical layer on top of human-quality private brokerage, synthesizing asset valuation benchmarks, municipal title checks, and yield simulations in real time.
            </p>
            <button
              onClick={() => setIsChatOpen(true)}
              className="text-xs tracking-[0.14em] uppercase font-medium text-[#F1EEE7] border-b border-[#C5A880] pb-1 hover:text-[#C5A880] transition-colors"
            >
              Initiate Private Consultation →
            </button>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-6 bg-[#141412] border border-[#262522]">
              <div className="text-[10px] tracking-[0.15em] uppercase text-[#77736B] mb-2">Parameters Analyzed</div>
              <div className="text-sm font-normal text-[#F1EEE7]">Investment Horizon & Cap Rate</div>
            </div>
            <div className="p-6 bg-[#141412] border border-[#262522]">
              <div className="text-[10px] tracking-[0.15em] uppercase text-[#77736B] mb-2">Parameters Analyzed</div>
              <div className="text-sm font-normal text-[#F1EEE7]">Architectural Pedigree & Scarcity</div>
            </div>
            <div className="p-6 bg-[#141412] border border-[#262522]">
              <div className="text-[10px] tracking-[0.15em] uppercase text-[#77736B] mb-2">Parameters Analyzed</div>
              <div className="text-sm font-normal text-[#F1EEE7]">Municipal Title & Due Diligence</div>
            </div>
            <div className="p-6 bg-[#141412] border border-[#262522]">
              <div className="text-[10px] tracking-[0.15em] uppercase text-[#77736B] mb-2">Parameters Analyzed</div>
              <div className="text-sm font-normal text-[#F1EEE7]">Bespoke Lifestyle Requirements</div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. EDITORIAL FOOTER                                                      */}
      {/* ========================================================================= */}
      <footer className="border-t border-[#262522] py-12 px-6 sm:px-12 bg-[#080807] text-[#77736B] text-[11px]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tracking-[0.2em] text-[#F1EEE7] uppercase">
              SHUBH REAL ESTATES
            </span>
            <span className="h-3 w-[1px] bg-white/10" />
            <span className="tracking-[0.1em] text-[#77736B]">PRIVATE ADVISORY MANDATE</span>
          </div>

          <div className="flex items-center gap-6 tracking-[0.1em] uppercase text-[10px]">
            <span>© 2026 Shubh Real Estates</span>
            <span>All Mandates Strictly Confidential</span>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 6. FLOATING BOTTOM-RIGHT CHATBOT (BUTTON + FIXED MODAL TERMINAL)          */}
      {/* ========================================================================= */}

      {/* FLOATING ACTION BUTTON */}
      {!isChatOpen && (
        <div className="fixed bottom-8 right-8 z-50">
          <button
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-3 bg-[#141412] text-[#F1EEE7] border border-[#262522] hover:border-[#C5A880]/60 px-5 py-3.5 shadow-2xl transition-all hover:bg-[#1B1A17]"
          >
            <div className="h-2 w-2 rounded-full bg-[#C5A880]" />
            <span className="text-xs tracking-[0.15em] uppercase font-medium">Shubh Advisor</span>
          </button>
        </div>
      )}

      {/* CHAT WINDOW (Floating Bottom-Right OR Full-Screen Expanded Modal) */}
      {isChatOpen && (
        <>
          {/* Backdrop when maximized */}
          {isMaximized && (
            <div
              onClick={() => setIsMaximized(false)}
              className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm transition-opacity"
            />
          )}

          <div
            className={`fixed z-50 flex flex-col bg-[#141412] border border-[#262522] shadow-2xl transition-all duration-300 ${
              isMaximized
                ? "inset-4 sm:inset-10 max-w-5xl mx-auto"
                : "bottom-8 right-8 w-[92vw] sm:w-[430px] h-[590px]"
            }`}
          >
            {/* TERMINAL HEADER */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#262522] bg-[#1B1A17]/70">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 border border-[#C5A880]/40 flex items-center justify-center text-[10px] font-medium text-[#C5A880]">
                  S
                </div>
                <div>
                  <h3 className="text-xs tracking-[0.16em] uppercase font-semibold text-[#F1EEE7]">
                    SHUBH ADVISOR
                  </h3>
                  <div className="flex items-center gap-2 text-[9px] tracking-[0.14em] text-[#AAA69D] uppercase">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isConnected ? "bg-[#C5A880]" : "bg-rose-400"
                      }`}
                    />
                    <span>{isConnected ? "PRIVATE ADVISORY CHANNEL" : "CONNECTING..."}</span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 text-[#77736B]">
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    title="Reset channel"
                    className="p-1.5 hover:text-[#F1EEE7] transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  title={isMaximized ? "Restore size" : "Expand window"}
                  className="p-1.5 hover:text-[#F1EEE7] transition-colors"
                >
                  {isMaximized ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsChatOpen(false);
                    setIsMaximized(false);
                  }}
                  title="Close channel"
                  className="p-1.5 hover:text-[#F1EEE7] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* CONVERSATION STREAM */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {messages.length === 0 ? (
                <div className="flex flex-col justify-between h-full py-2">
                  <div>
                    <p className="text-sm font-light text-[#F1EEE7] leading-relaxed mb-1">
                      Good evening. I am your private property advisor.
                    </p>
                    <p className="text-xs text-[#AAA69D] leading-relaxed mb-6 font-light">
                      Tell me what you are looking to acquire, and I will narrow the field.
                    </p>
                  </div>

                  {/* Text-Based Suggested Choices */}
                  <div className="space-y-2 border-t border-[#262522] pt-4">
                    <div className="text-[10px] tracking-[0.18em] uppercase text-[#77736B] mb-2 font-medium">
                      Advisory Inquiries
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SUGGESTED_ACTIONS.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendMessage(item.prompt)}
                          className="text-left px-3 py-2.5 bg-[#1B1A17] border border-[#262522] hover:border-[#C5A880]/50 hover:bg-[#201F1B] transition-all group flex items-center justify-between"
                        >
                          <span className="text-[11px] text-[#AAA69D] group-hover:text-[#F1EEE7] line-clamp-1">
                            {item.label}
                          </span>
                          <ChevronRight className="h-3 w-3 text-[#77736B] group-hover:text-[#C5A880] transition-colors shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`text-[9px] tracking-[0.14em] uppercase text-[#77736B] mb-1 ${
                          isUser ? "text-right" : "text-left"
                        }`}
                      >
                        {isUser ? "Client" : "Shubh Advisor"} • {message.timestamp}
                      </div>

                      <div
                        className={`max-w-[90%] p-3.5 leading-relaxed text-xs ${
                          isUser
                            ? "bg-[#1B1A17] border border-[#262522] text-[#F1EEE7]"
                            : "bg-[#0B0B0A] border border-[#262522] text-[#F1EEE7]"
                        }`}
                      >
                        <div className="whitespace-pre-wrap font-light">
                          {message.content || (
                            <div className="flex items-center gap-1.5 py-1 text-[#AAA69D]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#C5A880] animate-pulse" />
                              <span className="text-[10px] tracking-wider uppercase text-[#77736B]">
                                Formulating advisory response…
                              </span>
                            </div>
                          )}
                        </div>

                        {!isUser && message.content && (
                          <div className="mt-2 pt-2 border-t border-[#262522] flex items-center justify-end">
                            <button
                              onClick={() => handleCopy(message.content, message.id)}
                              className="text-[9px] tracking-wider uppercase text-[#77736B] hover:text-[#AAA69D] flex items-center gap-1 transition-colors"
                            >
                              {copiedId === message.id ? (
                                <>
                                  <Check className="h-2.5 w-2.5 text-[#C5A880]" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-2.5 w-2.5" /> Copy Analysis
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
              <div ref={messagesEndRef} />
            </div>

            {/* TERMINAL INPUT */}
            <div className="p-3 border-t border-[#262522] bg-[#1B1A17]/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="relative flex items-center bg-[#0B0B0A] border border-[#262522] focus-within:border-[#C5A880]/50 transition-colors"
              >
                <textarea
                  ref={inputRef}
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tell the advisor what you’re looking for…"
                  rows={1}
                  className="flex-1 bg-transparent px-3.5 py-3 text-xs text-[#F1EEE7] placeholder-[#77736B] focus:outline-none resize-none"
                />

                <div className="pr-2">
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      title="Halt response"
                      className="p-1.5 text-[#AAA69D] hover:text-[#F1EEE7] transition-colors"
                    >
                      <StopCircle className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim()}
                      title="Send message"
                      className="p-1.5 text-[#AAA69D] hover:text-[#C5A880] disabled:opacity-30 disabled:hover:text-[#AAA69D] transition-colors"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
