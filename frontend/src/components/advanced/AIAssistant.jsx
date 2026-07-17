import PropTypes from "prop-types";

function AIAssistant({ open, onClose }) {
  const [messages, setMessages] = React.useState([
    {
      role: "assistant",
      text: "Hi! I'm your BOM copilot. Ask me about parts, costs, vendors, or upcoming risks.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const bodyRef = React.useRef(null);
  React.useEffect(() => {
    if (bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);
  const send = async (text) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    const mockReply = (q) => {
      const l = q.toLowerCase();
      if (/cost|budget|spend/.test(l))
        return "ATLAS BOM cost is ₹4,218 (+2.2% vs last rev). Workspace YTD spend ₹1.84 Cr against ₹5 Cr budget — 36.8% allocated.";
      if (/risk|supply|delay/.test(l))
        return "3 supply risks today: EL-BMS-12S lead time crept 28→35d (Daly, CN), HW-FAS-M3-08 has a 95% duplicate match.";
      if (/vendor|supplier/.test(l))
        return "14 vendors active across 6 countries. Top scorer: McMaster (A+, 99% on-time).";
      if (/lead.*time|deliver/.test(l))
        return "Avg lead time across active BOM is 21 days. Critical path is EL-MCU-STM32H7 at 42 days.";
      return "I don't have a precise answer for that yet. Try asking about cost, vendors, lead times, supply risk, or duplicates.";
    };
    try {
      const reply = window.claude?.complete
        ? await window.claude.complete({
            messages: [{ role: "user", content: text }],
          })
        : mockReply(text);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: mockReply(text) }]);
    }
    setLoading(false);
  };
  if (!open) return null;
  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div className="flex items-center gap-10">
          <span
            className="w-28 h-28 br-6 inline-flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), oklch(0.55 0.18 30))",
              color: "white",
            }}
          >
            <Icon.Sparkles size={14} />
          </span>
          <div>
            <div className="fw-700 fs-13">BOM Copilot</div>
            <div className="font-mono fs-10 fg-3">AI · context-aware</div>
          </div>
        </div>
        <button className="icon-btn w-26 h-26" onClick={onClose}>
          <Icon.X size={13} />
        </button>
      </div>
      <div className="ai-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={"ai-msg " + m.role}>
            {m.role === "assistant" && (
              <span className="ai-msg-ico">
                <Icon.Sparkles size={11} />
              </span>
            )}
            <div className="ai-msg-bub">{m.text}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg assistant">
            <span className="ai-msg-ico">
              <Icon.Sparkles size={11} />
            </span>
            <div className="ai-msg-bub">
              <span className="spinner" /> Thinking\u2026
            </div>
          </div>
        )}
      </div>
      <div className="ai-foot">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about parts, costs, vendors, risks\u2026"
          className="flex-1 border-line rounded-r2 bg-canvas fg fs-12 font-sans"
          style={{ minHeight: 38, maxHeight: 100, padding: 8, resize: "none" }}
        />
        <button
          className="btn primary"
          disabled={!input.trim() || loading}
          onClick={() => send(input)}
          style={{ height: 38 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
AIAssistant.propTypes = { open: PropTypes.bool, onClose: PropTypes.func };

export { AIAssistant };
export default AIAssistant;
