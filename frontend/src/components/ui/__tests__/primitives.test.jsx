import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button.jsx";
import { StatusPill, Badge, toneForStatus } from "../Badge.jsx";
import { Modal } from "../Modal.jsx";
import { Switch } from "../Choice.jsx";
import { Menu } from "../Menu.jsx";
import { ScreenHeader, ContentFrame } from "../ScreenHeader.jsx";
import { Breadcrumb } from "../Navigation.jsx";

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

describe("Menu", () => {
  it("injects menu-button semantics onto an interactive trigger without nesting a role=button wrapper", () => {
    render(
      <Menu
        ariaLabel="Row actions"
        trigger={<Button iconOnly aria-label="Actions">...</Button>}
        items={[{ label: "Edit", onSelect: () => {} }]}
      />,
    );
    // The real <button> carries the menu-button semantics directly.
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // No extra wrapper button was introduced (only the trigger button exists).
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("opens the menu on trigger click and preserves the trigger's own onClick", () => {
    const onClick = vi.fn();
    render(
      <Menu
        ariaLabel="Row actions"
        trigger={
          <Button iconOnly aria-label="Actions" onClick={onClick}>
            ...
          </Button>
        }
        items={[{ label: "Edit", onSelect: () => {} }]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menu", { name: "Row actions" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("wraps a non-interactive trigger in a role=button span", () => {
    render(
      <Menu
        ariaLabel="More"
        trigger={<span>label</span>}
        items={[{ label: "Edit", onSelect: () => {} }]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "label" });
    expect(trigger.tagName).toBe("SPAN");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
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

describe("ScreenHeader", () => {
  it("renders the shared .screen-header/h1/.sub markup plus an actions cluster", () => {
    render(
      <ScreenHeader
        title="Purchase Orders"
        description="42 orders"
        actions={<button>New PO</button>}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Purchase Orders" });
    expect(heading.tagName).toBe("H1");
    expect(heading.closest(".screen-header")).toBeTruthy();
    // Semantic <header> landmark, not a bare <div>.
    expect(heading.closest(".screen-header").tagName).toBe("HEADER");
    expect(screen.getByText("42 orders")).toHaveClass("sub");
    expect(
      screen.getByRole("button", { name: "New PO" }).closest(".screen-header__actions"),
    ).toBeTruthy();
  });

  it("renders an optional breadcrumb slot above the title", () => {
    render(
      <ScreenHeader
        title="Purchase Order #100234"
        breadcrumbs={<Breadcrumb items={[{ label: "Purchase Orders" }, { label: "#100234" }]} />}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Purchase Order #100234" });
    const crumbs = heading.closest(".screen-header").querySelector(".screen-header__crumbs");
    expect(crumbs).toBeTruthy();
    expect(crumbs.querySelector("nav.ui-breadcrumb")).toBeTruthy();
  });
});

describe("ContentFrame", () => {
  it("applies the centered content-frame class by default", () => {
    render(<ContentFrame>hi</ContentFrame>);
    expect(screen.getByText("hi")).toHaveClass("content-frame");
    expect(screen.getByText("hi")).not.toHaveClass("content-frame--full");
  });

  it("applies the full-bleed variant when full is set", () => {
    render(<ContentFrame full>hi</ContentFrame>);
    expect(screen.getByText("hi")).toHaveClass("content-frame", "content-frame--full");
  });
});
