import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button.jsx";
import { StatusPill, Badge, toneForStatus } from "../Badge.jsx";
import { Modal } from "../Modal.jsx";
import { Switch } from "../Choice.jsx";

describe("Button", () => {
  it("applies variant + size token classes", () => {
    render(<Button variant="primary" size="lg">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveClass("ui-btn", "ui-btn--primary", "ui-btn--lg");
    expect(btn).toHaveAttribute("type", "button");
  });

  it("is disabled and aria-busy while loading, and does not fire onClick", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("StatusPill / Badge tone mapping", () => {
  it("maps domain statuses to semantic tones", () => {
    expect(toneForStatus("Released")).toBe("success");
    expect(toneForStatus("In Review")).toBe("warning");
    expect(toneForStatus("Deprecated")).toBe("danger");
    expect(toneForStatus("wibble")).toBe("neutral");
  });

  it("renders a StatusPill with the derived tone class", () => {
    render(<StatusPill status="Released" />);
    const pill = screen.getByText("Released");
    expect(pill).toHaveClass("ui-status", "ui-status--success");
  });

  it("honors an explicit Badge tone", () => {
    render(<Badge tone="info">v1.3</Badge>);
    expect(screen.getByText("v1.3")).toHaveClass("ui-badge--info");
  });
});

describe("Switch", () => {
  it("exposes role=switch with aria-checked and toggles via onChange", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Wireframe" />);
    const sw = screen.getByRole("switch", { name: "Wireframe" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Modal", () => {
  it("renders an accessible dialog and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Confirm delete">
        Body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // labelled by its title
    expect(dialog).toHaveAccessibleName("Confirm delete");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        Body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
