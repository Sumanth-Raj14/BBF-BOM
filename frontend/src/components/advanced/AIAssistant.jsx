import PropTypes from "prop-types";
import { Icon } from "../../globals";
import { Button, Textarea } from "../ui";

const AI_NOT_CONFIGURED_TEXT =
  "AI backend not configured. Conversational assistance isn't available yet — this workspace doesn't have a chat/LLM endpoint wired up. You can still use the dedicated AI tools (demand forecast, interchangeability, validation) elsewhere in the app.";

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
    // No conversational AI/chat backend exists in this workspace (checked
    // api.aiAPI: only demand-forecast, interchangeability, and validation
    // endpoints are implemented — none accept free-form chat). Rather than
    // fabricate an answer, tell the user honestly that it isn't wired up.
    setMessages((m) => [...m, { role: "assistant", text: AI_NOT_CONFIGURED_TEXT }]);
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
