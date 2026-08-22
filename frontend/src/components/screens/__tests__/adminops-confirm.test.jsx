import { render, screen, fireEvent } from "@testing-library/react";
import { DangerConfirm } from "../AdminOpsScreen.jsx";

// The only thing standing between a stray click and an overwritten production
// database is this gate, so it gets the one test on this screen.
describe("AdminOps DangerConfirm", () => {
  const setup = (phrase, onConfirm = vi.fn()) => {
    render(
      <DangerConfirm
        open
        title="Restore backup #42"
        phrase={phrase}
        consequences="This overwrites the database."
        confirmLabel="Restore now"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    return { btn: screen.getByRole("button", { name: "Restore now" }), onConfirm };
  };

  it("keeps the destructive button disabled until the exact phrase is typed", () => {
    const { btn, onConfirm } = setup("42");
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "4" } });
    expect(btn).toBeDisabled();

    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "42" } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("never arms on an empty phrase (missing id must not mean 'anything goes')", () => {
    const { btn } = setup("");
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    expect(btn).toBeDisabled();
  });
});
