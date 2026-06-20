"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "alfred";
  text: string;
}

const QUICK_PROMPTS = [
  "How many settlements?",
  "Top 10 sites",
  "Security risk breakdown",
  "Demand by DisCo",
];

export function AlfredChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "alfred",
      text: "I'm Alfred, your DARES IMG data assistant. Ask me about settlements, DisCos, demand, scores, or security risk across the 23,806 sites.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const res = await api.alfred.chat(userMsg);
      setMessages((prev) => [...prev, { role: "alfred", text: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "alfred", text: "Sorry, I couldn't process that. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
          A
        </span>
        <span className="text-[11px] font-semibold">Alfred</span>
        <span className="text-[10px] text-muted-foreground">— Data Assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5" style={{ maxHeight: "160px" }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded px-2 py-1 text-[11px] leading-relaxed whitespace-pre-line ${
                m.role === "user"
                  ? "bg-primary text-white"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground animate-pulse">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-1 px-2 pb-1">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-border px-2 py-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask Alfred about settlements..."
          className="h-6 flex-1 rounded border border-input bg-background px-1.5 text-[11px] outline-none focus:border-primary"
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="h-6 rounded bg-primary px-2 text-[10px] font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
