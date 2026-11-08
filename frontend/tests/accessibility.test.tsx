// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { RequestForm } from "@/app/requests/new/request-form";
import NewRequestPage from "@/app/requests/new/page";
import { created, field, fillValid, LABELS, problem, stubFetch, submitButton } from "./helpers/form";

const setup = () => {
  const user = userEvent.setup({ delay: null });
  const view = render(<RequestForm />);
  return { user, ...view };
};

async function expectNoViolations(container: Element) {
  // jsdom cannot measure colours, so contrast is checked by design (see the notes in the report), not here.
  const results = await axe(container);
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

describe("automated checks (axe)", () => {
  it("initial form has no violations", async () => {
    const { container } = setup();
    await expectNoViolations(container);
  });

  it("form with field errors has no violations", async () => {
    const { user, container } = setup();
    await user.click(submitButton());
    await expectNoViolations(container);
  });

  it("form with a form-level alert has no violations", async () => {
    stubFetch(async () => problem("error.500.internal-error.json", 500));
    const { user, container } = setup();
    await fillValid(user);
    await user.click(submitButton());
    await screen.findByRole("alert");
    await expectNoViolations(container);
  });

  it("success state has no violations", async () => {
    stubFetch(async () => created());
    const { user, container } = setup();
    await fillValid(user);
    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Draft saved" });
    await expectNoViolations(container);
  });

  it("the whole page (heading, form and side panel) has no violations", async () => {
    const { container } = render(<NewRequestPage />);
    await expectNoViolations(container);
  });
});

describe("labels and descriptions", () => {
  it("every input, textarea and select has an accessible name from a real label", () => {
    setup();
    for (const label of Object.values(LABELS)) {
      const control = screen.getByLabelText(label);
      expect(control.id).not.toBe("");
      expect(document.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
    }
    const controls = document.querySelectorAll("input, textarea, select");
    expect(controls).toHaveLength(5);
  });

  it("hints are linked with aria-describedby", () => {
    setup();
    const described = field("unitPrice").getAttribute("aria-describedby") ?? "";
    expect(described).not.toBe("");
    const text = described.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(text.join(" ")).toContain("249.90");
  });

  it("an error is added to aria-describedby next to the hint, and aria-invalid is set", async () => {
    const { user } = setup();
    await user.click(submitButton());
    const input = field("unitPrice");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(ids[1])).toHaveTextContent("Unit price is required.");
  });

  it("error messages are readable by assistive technology (visible text plus an 'Error:' prefix)", async () => {
    const { user } = setup();
    await user.click(submitButton());
    expect(document.getElementById("pr-quantity-error")).toHaveTextContent("Error: Quantity is required.");
  });
});

describe("announcements", () => {
  it("has one persistent polite live region from the start", () => {
    setup();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("form-level problems use role=alert", async () => {
    stubFetch(async () => problem("error.500.internal-error.json", 500));
    const { user } = setup();
    await fillValid(user);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("can be completed with the keyboard alone, in reading order, with no positive tabindex", async () => {
    stubFetch(async () => created());
    const { user } = setup();
    expect(document.querySelector("[tabindex]:not([tabindex='-1'])")).toBeNull();

    await user.tab();
    expect(field("description")).toHaveFocus();
    await user.keyboard("Synthetic chairs");
    await user.tab();
    expect(field("quantity")).toHaveFocus();
    await user.keyboard("10");
    await user.tab();
    expect(field("unitPrice")).toHaveFocus();
    await user.keyboard("249.90");
    await user.tab();
    // A native <select> is operated with the arrow keys by the browser itself (not simulated here).
    expect(field("currency")).toHaveFocus();
    await user.tab();
    expect(field("requester")).toHaveFocus();
    await user.keyboard("Alex Example");
    await user.tab();
    expect(submitButton()).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: "Draft saved" })).toHaveFocus();
  });

  it("moves focus to the first invalid field after a failed submit", async () => {
    const { user } = setup();
    await user.type(field("description"), "Synthetic chairs");
    await user.click(submitButton());
    expect(field("quantity")).toHaveFocus();
  });

  it("moves focus to the alert for a form-level problem", async () => {
    stubFetch(async () => problem("error.500.internal-error.json", 500));
    const { user } = setup();
    await fillValid(user);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveFocus();
  });

  it("the success actions are reachable by keyboard", async () => {
    stubFetch(async () => created());
    const { user } = setup();
    await fillValid(user);
    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Draft saved" });
    await user.tab();
    expect(screen.getByRole("button", { name: "Create another request" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(field("description")).toHaveFocus();
  });
});
