// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestForm } from "@/app/requests/new/request-form";
import { REQUEST_TIMEOUT_MS } from "@/lib/api-client";
import { messages, readContractJson } from "./helpers/contract";
import {
  created,
  field,
  fillValid,
  pendingFetch,
  problem,
  respond,
  stubFetch,
  submitButton,
} from "./helpers/form";

afterEach(() => {
  vi.useRealTimers();
});

const setup = () => {
  const user = userEvent.setup({ delay: null });
  render(<RequestForm />);
  return user;
};

describe("initial render", () => {
  it("shows five labelled fields, a draft-only button and no errors", () => {
    setup();
    for (const name of ["description", "quantity", "unitPrice", "currency", "requester"] as const) {
      expect(field(name)).toBeInTheDocument();
    }
    expect(field("currency")).toHaveValue("EUR");
    expect(within(field("currency")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "EUR",
      "USD",
      "GBP",
      "CHF",
    ]);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("has no approval, order, release or supplier controls", () => {
    setup();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("client validation", () => {
  it("shows all five field errors on an empty submit, sends nothing and focuses the first error", async () => {
    const fetchMock = stubFetch(async () => created());
    const user = setup();
    await user.click(submitButton());

    expect(fetchMock).not.toHaveBeenCalled();
    for (const text of [
      "Description is required.",
      "Quantity is required.",
      "Unit price is required.",
      "Requester display name is required.",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(field("description")).toHaveFocus();
    expect(field("description")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("status")).toHaveTextContent("The form has 4 errors");
  });

  it("links every error to its input with aria-describedby", async () => {
    const user = setup();
    await user.click(submitButton());
    const input = field("quantity");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const text = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(text).toContain("Quantity is required.");
  });

  it("uses the contract's exact texts for rule failures", async () => {
    const user = setup();
    await user.type(field("description"), "ab");
    await user.type(field("quantity"), "0");
    await user.type(field("unitPrice"), "12.345");
    await user.type(field("requester"), "A");
    await user.click(submitButton());
    const texts = messages().fields;
    expect(screen.getByText(texts.description.too_short)).toBeInTheDocument();
    expect(screen.getByText(texts.quantity.out_of_range)).toBeInTheDocument();
    expect(screen.getByText(texts.unit_price.invalid_format)).toBeInTheDocument();
    expect(screen.getByText(texts.requester_display_name.too_short)).toBeInTheDocument();
  });

  it("checks a field when the user leaves it, but not before the user typed anything", async () => {
    const user = setup();
    await user.tab(); // description focused, nothing typed
    await user.tab(); // leave description untouched
    expect(screen.queryByText("Description is required.")).not.toBeInTheDocument();

    await user.type(field("description"), "ab");
    await user.tab();
    expect(screen.getByText("Description must be at least 3 characters.")).toBeInTheDocument();
  });

  it("removes an error as soon as the field becomes valid", async () => {
    const user = setup();
    await user.click(submitButton());
    expect(screen.getByText("Description is required.")).toBeInTheDocument();
    await user.type(field("description"), "Synthetic chairs");
    expect(screen.queryByText("Description is required.")).not.toBeInTheDocument();
    expect(field("description")).not.toHaveAttribute("aria-invalid");
  });
});

describe("sending", () => {
  it("sends trimmed text, an integer quantity and a string price", async () => {
    const fetchMock = stubFetch(async () => created());
    const user = setup();
    await fillValid(user, { description: "  Synthetic chairs  ", requester: " Alex Example " });
    await user.click(submitButton());
    await screen.findByRole("heading", { name: "Draft saved" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      description: "Synthetic chairs",
      quantity: 10,
      unit_price: "249.90",
      currency: "EUR",
      requester_display_name: "Alex Example",
    });
  });

  it("shows the loading state: disabled button, aria-busy and an announcement", async () => {
    const { resolve } = pendingFetch();
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const button = screen.getByRole("button", { name: /saving draft/i });
    expect(button).toBeDisabled();
    expect(screen.getByRole("form", { name: "Purchase request form" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Sending your request");

    await act(async () => resolve(created()));
    expect(await screen.findByRole("heading", { name: "Draft saved" })).toBeInTheDocument();
  });

  it("ignores a second submit event while the first is still in flight (guard in code, not only the disabled button)", async () => {
    const { mock, resolve } = pendingFetch();
    const user = setup();
    await fillValid(user);
    const form = screen.getByRole("form", { name: "Purchase request form" });
    // fireEvent.submit bypasses the disabled button, like a script or an unusual browser path would.
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(created()));
  });

  it("does not send twice when Enter is pressed again while loading", async () => {
    const { mock, resolve } = pendingFetch();
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());
    await user.type(field("requester"), "{Enter}");
    await user.click(screen.getByRole("button", { name: /saving draft/i }));
    expect(mock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(created()));
  });
});

describe("success state", () => {
  it("shows id, draft status, the data, the estimated total and the temporary-storage note", async () => {
    stubFetch(async () => created());
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const heading = await screen.findByRole("heading", { name: "Draft saved" });
    expect(heading).toHaveFocus();
    expect(screen.getByText("PR-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Synthetic office chairs, model A")).toBeInTheDocument();
    expect(screen.getByText("249.90 EUR")).toBeInTheDocument();
    expect(screen.getByText("2,499.00 EUR")).toBeInTheDocument();
    expect(screen.getByText("Alex Example")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/temporary development storage/i);
    expect(screen.getByRole("note")).toHaveTextContent(/lost when the server restarts/i);
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved.");
  });

  it("'Create another request' shows an empty form and focuses the first field", async () => {
    stubFetch(async () => created());
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());
    await user.click(await screen.findByRole("button", { name: "Create another request" }));

    expect(field("description")).toHaveValue("");
    expect(field("description")).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "Draft saved" })).not.toBeInTheDocument();
  });
});

describe("422 from the server", () => {
  it("maps each error to its input, keeps the values and focuses the first one", async () => {
    stubFetch(async () => problem("error.422.validation.json", 422));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const texts = messages().fields;
    expect(await screen.findByText(texts.description.too_short)).toBeInTheDocument();
    expect(screen.getByText(texts.quantity.out_of_range)).toBeInTheDocument();
    expect(screen.getByText(texts.unit_price.invalid_format)).toBeInTheDocument();
    expect(screen.getByText(texts.currency.invalid_choice)).toBeInTheDocument();
    expect(screen.getByText(texts.requester_display_name.too_short)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    expect(field("description")).toHaveFocus();
    expect(field("description")).toHaveValue("Synthetic chairs");
    expect(field("quantity")).toHaveValue("10");
    expect(field("unitPrice")).toHaveValue("249.90");
    expect(field("requester")).toHaveValue("Alex Example");
    expect(submitButton()).toBeEnabled();
  });

  it("shows a body-level ($) error in the form-level alert", async () => {
    stubFetch(async () => problem("error.422.not-an-object.json", 422));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Validation failed");
    expect(alert).toHaveTextContent("Request body must be a JSON object.");
    expect(alert).toHaveFocus();
  });

  it("shows an unknown-field error in the form-level alert", async () => {
    const payload = {
      ...readContractJson<Record<string, unknown>>("examples/error.422.validation.json"),
      errors: [{ field: "status", code: "unknown_field", message: "Unknown field. This field is not allowed." }],
    };
    stubFetch(async () => respond(payload, 422, "application/problem+json"));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("status: Unknown field. This field is not allowed.");
  });

  it("shows both field errors and an alert when the answer has both kinds", async () => {
    const payload = {
      ...readContractJson<Record<string, unknown>>("examples/error.422.validation.json"),
      errors: [
        { field: "quantity", code: "out_of_range", message: "Quantity must be between 1 and 100000." },
        { field: "approved", code: "unknown_field", message: "Unknown field. This field is not allowed." },
      ],
    };
    stubFetch(async () => respond(payload, 422, "application/problem+json"));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    expect(await screen.findByText("Quantity must be between 1 and 100000.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("approved: Unknown field");
    expect(field("quantity")).toHaveFocus(); // the field wins focus, the alert is still announced
  });
});

describe.each([
  ["error.400.invalid-json.json", 400, "Invalid JSON", "The request body is not valid JSON."],
  ["error.413.payload-too-large.json", 413, "Payload too large", "The request body must not exceed 16384 bytes."],
  ["error.415.unsupported-media-type.json", 415, "Unsupported media type", "Content-Type must be application/json."],
  ["error.500.internal-error.json", 500, "Internal error", "An unexpected error occurred."],
])("form-level alert for %s", (example, status, title, detail) => {
  it(`shows "${title}", keeps the values and offers "Try again"`, async () => {
    stubFetch(async () => problem(example, status));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(detail);
    expect(alert).toHaveFocus();
    expect(field("description")).toHaveValue("Synthetic chairs");
    expect(field("quantity")).toHaveValue("10");
    expect(field("unitPrice")).toHaveValue("249.90");
    expect(field("requester")).toHaveValue("Alex Example");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});

describe("timeout and network failure", () => {
  it("shows the timeout alert after 10 seconds, keeps the values and does not retry by itself", async () => {
    const user = setup();
    await fillValid(user);

    vi.useFakeTimers();
    const fetchMock = stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    await act(async () => {
      submitButton().click();
    });
    expect(screen.getByRole("button", { name: /saving draft/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    // Waiting much longer must not trigger a second attempt.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The server did not respond");
    expect(alert).toHaveTextContent(/may or may not have been saved/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(field("description")).toHaveValue("Synthetic chairs");
    expect(field("unitPrice")).toHaveValue("249.90");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("shows the network alert when the server cannot be reached", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server could not be reached");
    expect(alert).toHaveTextContent(/may or may not have been saved/i);
    expect(field("requester")).toHaveValue("Alex Example");
  });

  it("'Try again' is a deliberate second attempt that can succeed", async () => {
    const fetchMock = stubFetch(async () => problem("error.500.internal-error.json", 500));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());
    await screen.findByRole("alert");

    fetchMock.mockImplementation(async () => created());
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Draft saved" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("responses that are not trusted", () => {
  it("shows a generic alert and never renders raw server text", async () => {
    stubFetch(async () => respond('<img src=x onerror="alert(1)"> SECRET-SERVER-TEXT', 502, "text/html"));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unexpected response");
    expect(document.body.textContent).not.toContain("SECRET-SERVER-TEXT");
    expect(document.querySelector("img")).toBeNull();
    expect(field("description")).toHaveValue("Synthetic chairs");
  });

  it("renders HTML inside a problem's text as plain text, not as markup", async () => {
    const payload = {
      ...readContractJson<Record<string, unknown>>("examples/error.500.internal-error.json"),
      detail: "<b>bold</b><script>window.hacked = true</script>",
    };
    stubFetch(async () => respond(payload, 500, "application/problem+json"));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("<b>bold</b><script>window.hacked = true</script>");
    expect(alert.querySelector("b")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("does not show a 201 that carries an extra approval field", async () => {
    const draft = { ...readContractJson<Record<string, unknown>>("examples/create-response.201.json"), approved: true };
    stubFetch(async () => respond(draft, 201));
    const user = setup();
    await fillValid(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Unexpected response");
    expect(screen.queryByRole("heading", { name: "Draft saved" })).not.toBeInTheDocument();
  });
});
