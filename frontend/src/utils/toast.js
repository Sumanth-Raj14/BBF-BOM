let _toasts = [];
let _idSeq = 0;
let _listeners = [];

function notify() {
  _listeners.forEach((fn) => fn(_toasts));
}

export function subscribe(fn) {
  _listeners.push(fn);
  fn(_toasts);
  return () => {
    _listeners = _listeners.filter((f) => f !== fn);
  };
}

export function toast(msg, opts = {}) {
  const id = ++_idSeq;
  const t = {
    id,
    msg,
    kind: opts.kind || "info",
    action: opts.action,
    duration: opts.duration ?? 3400,
  };
  _toasts = [..._toasts, t];
  notify();
  if (t.duration > 0) {
    setTimeout(() => {
      _toasts = _toasts.filter((x) => x.id !== id);
      notify();
    }, t.duration);
  }
  return id;
}

toast.dismiss = (id) => {
  _toasts = _toasts.filter((x) => x.id !== id);
  notify();
};

toast.getToasts = () => _toasts;
