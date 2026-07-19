import PropTypes from "prop-types";
import { Icon } from "../../globals";
import { Button, Textarea } from "../ui";

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
  const inputRef = React.useRef(null);
  const restoreFocusRef = React.useRef(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  React.useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement;
      if (inputRef.current) inputRef.current.focus();
    } else if (restoreFocusRef.current?.focus) {
      restoreFocusRef.current.focus();
    }
  }, [open]);

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
      const reply = window.aiAssistant?.complete
        ? await window.aiAssistant.complete({
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
    <div
      className="ai-panel"
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose?.();
        }
      }}
    >
      <div className="ai-head">
        <div className="flex items-center gap-10">
          <span className="ai-panel__mark" aria-hidden="true">
            <Icon.Sparkles size={14} />
          </span>
          <div>
            <div id={titleId} className="fw-700 fs-13">
              BOM Copilot
            </div>
            <div className="font-mono fs-10 fg-3">AI · context-aware</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Close AI assistant"
          onClick={onClose}
        >
          <Icon.X size={13} />
        </Button>
      </div>
      <div
        className="ai-body"
        ref={bodyRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with BOM Copilot"
      >
        {messages.map((m, i) => (
          <div key={i} className={"ai-msg " + m.role}>
            {m.role === "assistant" && (
              <span className="ai-msg-ico" aria-hidden="true">
                <Icon.Sparkles size={11} />
              </span>
            )}
            <div className="ai-msg-bub">{m.text}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg assistant">
            <span className="ai-msg-ico" aria-hidden="true">
              <Icon.Sparkles size={11} />
            </span>
            <div className="ai-msg-bub">
              <span className="spinner" aria-hidden="true" /> Thinking…
            </div>
          </div>
        )}
      </div>
      <div className="ai-foot">
        <label htmlFor={`${titleId}-input`} className="sr-only">
          Message BOM Copilot
        </label>
        <Textarea
          id={`${titleId}-input`}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about parts, costs, vendors, risks…"
          rows={1}
          className="ai-foot__input"
        />
        <Button
          variant="primary"
          loading={loading}
          disabled={!input.trim()}
          onClick={() => send(input)}
          className="ai-foot__send"
        >
          Send
        </Button>
      </div>
    </div>
  );
}
AIAssistant.propTypes = { open: PropTypes.bool, onClose: PropTypes.func };

export { AIAssistant };
export default AIAssistant;
