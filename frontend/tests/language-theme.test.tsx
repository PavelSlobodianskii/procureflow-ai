// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteChrome } from "@/app/_components/site-chrome";
import { NewRequestScreen } from "@/app/requests/new/new-request-screen";
import { REQUEST_TIMEOUT_MS } from "@/lib/api-client";
import { DICTIONARIES, LANGUAGE_CODES, type Dictionary, type Language } from "@/lib/i18n";
import { LANGUAGE_STORAGE_KEY, THEME_STORAGE_KEY, resetPreferencesForTests, setLanguage } from "@/lib/preferences";
import { readContractJson } from "./helpers/contract";
import { created, createdPostgres, problem, respond, stubFetch } from "./helpers/form";

const OTHER = LANGUAGE_CODES.filter((code) => code !== "en");

const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const languageSelect = () => byId("site-language") as unknown as HTMLSelectElement;
const themeSwitch = () => screen.getByRole("switch");
const submit = () => document.querySelector("button[type=submit]") as HTMLButtonElement;
const html = () => document.documentElement;

function renderPage() {
  const user = userEvent.setup({ delay: null });
  const view = render(
    <SiteChrome>
      <NewRequestScreen />
    </SiteChrome>,
  );
  return { user, ...view };
}

async function choose(user: UserEvent, code: Language) {
  await user.selectOptions(languageSelect(), code);
}

async function fillValid(user: UserEvent) {
  await user.type(byId("pr-description"), "Synthetic chairs");
  await user.type(byId("pr-quantity"), "10");
  await user.type(byId("pr-unit-price"), "249.90");
  await user.type(byId("pr-requester"), "Alex Example");
}

beforeEach(() => {
  resetPreferencesForTests();
  html().removeAttribute("data-theme");
  html().setAttribute("lang", "en");
});

afterEach(() => {
  vi.useRealTimers();
  resetPreferencesForTests();
});

describe("language selector", () => {
  it("starts in English with the four languages listed by their own names", () => {
    renderPage();
    const select = languageSelect();
    expect(select).toHaveValue("en");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "English",
      "Deutsch",
      "Русский",
      "Español",
    ]);
    // each option is tagged with its language so screen readers pronounce it correctly
    expect(within(select).getAllByRole("option").map((option) => option.getAttribute("lang"))).toEqual(["en", "de", "ru", "es"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New purchase request");
    expect(html()).toHaveAttribute("lang", "en");
    expect(document.title).toBe("New purchase request · ProcureFlow AI");
  });

  it("has an accessible name in every language", async () => {
    const { user } = renderPage();
    expect(screen.getByLabelText("Language")).toBe(languageSelect());
    for (const code of OTHER) {
      await choose(user, code);
      expect(screen.getByLabelText(DICTIONARIES[code].site.languageLabel)).toBe(languageSelect());
    }
  });

  it.each(OTHER)("switching to %s translates the page, the tab title and the html lang", async (code) => {
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.page.heroTitle);
    expect(screen.getByRole("link", { name: t.site.skipToContent })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: t.form.ariaLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(t.fields.description.label)).toBe(byId("pr-description"));
    expect(screen.getByLabelText(t.fields.quantity.label)).toBe(byId("pr-quantity"));
    expect(screen.getByLabelText(t.fields.unit_price.label)).toBe(byId("pr-unit-price"));
    expect(screen.getByLabelText(t.fields.currency.label)).toBe(byId("pr-currency"));
    expect(screen.getByLabelText(t.fields.requester_display_name.label)).toBe(byId("pr-requester"));
    expect(screen.getByRole("button", { name: t.form.save })).toBeEnabled();
    expect(screen.getByRole("heading", { name: t.page.aboutTitle })).toBeInTheDocument();
    expect(screen.getByText(t.site.footer)).toBeInTheDocument();
    expect(screen.getByText(t.site.devBadge)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: t.site.themeLabel })).toBeInTheDocument();
    for (const chip of t.page.chips) expect(screen.getByText(chip)).toBeInTheDocument();

    expect(html()).toHaveAttribute("lang", code);
    expect(document.title).toBe(`${t.page.docTitle} · ProcureFlow AI`);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(code);
  });

  it("can switch back to English", async () => {
    const { user } = renderPage();
    await choose(user, "ru");
    await choose(user, "en");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(html()).toHaveAttribute("lang", "en");
  });

  it("remembers the language for the next visit", () => {
    setLanguage("es");
    renderPage();
    expect(languageSelect()).toHaveValue("es");
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeInTheDocument();
  });

  it("keeps what the user typed when the language changes", async () => {
    const { user } = renderPage();
    await fillValid(user);
    await choose(user, "de");
    expect(byId("pr-description")).toHaveValue("Synthetic chairs");
    expect(byId("pr-quantity")).toHaveValue("10");
    expect(byId("pr-unit-price")).toHaveValue("249.90");
    expect(byId("pr-requester")).toHaveValue("Alex Example");
  });

  it("shows the currency symbol chip for the chosen currency", async () => {
    const { user } = renderPage();
    const chip = () => byId("pr-unit-price").previousElementSibling;
    expect(chip()).toHaveTextContent("€");
    await user.selectOptions(byId("pr-currency"), "USD");
    expect(chip()).toHaveTextContent("$");
    await user.selectOptions(byId("pr-currency"), "GBP");
    expect(chip()).toHaveTextContent("£");
    await user.selectOptions(byId("pr-currency"), "CHF");
    expect(chip()).toHaveTextContent("CHF");
  });
});

describe("theme switch", () => {
  it("is a switch named 'Dark mode' and starts off", () => {
    renderPage();
    expect(themeSwitch()).toHaveAccessibleName("Dark mode");
    expect(themeSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("turns dark mode on and off, applies it to the page and remembers it", async () => {
    const { user } = renderPage();
    await user.click(themeSwitch());
    expect(themeSwitch()).toHaveAttribute("aria-checked", "true");
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(themeSwitch());
    expect(themeSwitch()).toHaveAttribute("aria-checked", "false");
    expect(html()).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("works with the keyboard (Space and Enter)", async () => {
    const { user } = renderPage();
    themeSwitch().focus();
    await user.keyboard(" ");
    expect(themeSwitch()).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Enter}");
    expect(themeSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("is independent of the language", async () => {
    const { user } = renderPage();
    await user.click(themeSwitch());
    await choose(user, "ru");
    expect(themeSwitch()).toHaveAttribute("aria-checked", "true");
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("switch", { name: "Тёмная тема" })).toBeInTheDocument();
  });
});

describe("the form in other languages", () => {
  it.each(OTHER)("%s: empty submit shows translated errors, a translated announcement and focus", async (code) => {
    const fetchMock = stubFetch(async () => created());
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await user.click(submit());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(t.validation.description.required!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.quantity.required!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.unit_price.required!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.requester_display_name.required!)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.announce.clientErrors(4));
    expect(byId("pr-description")).toHaveFocus();
    // the hidden prefix read before each error is translated too
    expect(byId("pr-quantity-error")).toHaveTextContent(`${t.errorPrefix}${t.validation.quantity.required}`);
  });

  it.each(OTHER)("%s: rule failures use the translated texts", async (code) => {
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await user.type(byId("pr-description"), "ab");
    await user.type(byId("pr-quantity"), "0");
    await user.type(byId("pr-unit-price"), "12.345");
    await user.type(byId("pr-requester"), "A");
    await user.click(submit());
    expect(screen.getByText(t.validation.description.too_short!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.quantity.out_of_range!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.unit_price.invalid_format!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.requester_display_name.too_short!)).toBeInTheDocument();
  });

  it("an error already on screen is re-worded when the language changes", async () => {
    const { user } = renderPage();
    await user.click(submit());
    expect(screen.getByText("Quantity is required.")).toBeInTheDocument();
    await choose(user, "es");
    expect(screen.queryByText("Quantity is required.")).not.toBeInTheDocument();
    expect(screen.getByText(DICTIONARIES.es.validation.quantity.required!)).toBeInTheDocument();
    await choose(user, "ru");
    expect(screen.getByText(DICTIONARIES.ru.validation.quantity.required!)).toBeInTheDocument();
  });

  it.each(OTHER)("%s: loading state is translated (button, announcement, busy)", async (code) => {
    let finish!: (response: Response) => void;
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)));
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());

    expect(screen.getByRole("button", { name: t.form.saving })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(t.announce.sending);
    expect(screen.getByRole("form", { name: t.form.ariaLabel })).toHaveAttribute("aria-busy", "true");
    await act(async () => finish(created()));
  });

  it.each(OTHER)("%s: server 422 errors are shown translated, mapped by their code", async (code) => {
    stubFetch(async () => problem("error.422.validation.json", 422));
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());

    expect(await screen.findByText(t.validation.description.too_short!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.quantity.out_of_range!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.unit_price.invalid_format!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.currency.invalid_choice!)).toBeInTheDocument();
    expect(screen.getByText(t.validation.requester_display_name.too_short!)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.announce.serverErrors(5));
    // the English text from the server is not shown in another language
    expect(screen.queryByText("Description must be at least 3 characters.")).not.toBeInTheDocument();
  });

  it.each(OTHER)("%s: a body-level and an unknown-field error appear translated in the alert", async (code) => {
    const payload = {
      ...readContractJson<Record<string, unknown>>("examples/error.422.validation.json"),
      errors: [
        { field: "$", code: "invalid_type", message: "Request body must be a JSON object." },
        { field: "status", code: "unknown_field", message: "Unknown field. This field is not allowed." },
      ],
    };
    stubFetch(async () => respond(payload, 422, "application/problem+json"));
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.alerts.problems["urn:procureflow:problem:validation-error"].title);
    expect(alert).toHaveTextContent(t.validation.$.invalid_type!);
    expect(alert).toHaveTextContent(`status: ${t.unknownField}`);
  });

  it.each(
    OTHER.flatMap((code) =>
      (
        [
          ["error.400.invalid-json.json", 400, "urn:procureflow:problem:invalid-json"],
          ["error.413.payload-too-large.json", 413, "urn:procureflow:problem:payload-too-large"],
          ["error.415.unsupported-media-type.json", 415, "urn:procureflow:problem:unsupported-media-type"],
          ["error.500.internal-error.json", 500, "urn:procureflow:problem:internal-error"],
        ] as const
      ).map(([file, status, type]) => [code, file, status, type] as const),
    ),
  )("%s: %s is shown in the alert translated, with a translated Try again button", async (code, file, status, type) => {
    stubFetch(async () => problem(file, status));
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.alerts.problems[type].title);
    expect(alert).toHaveTextContent(t.alerts.problems[type].detail);
    expect(alert).toHaveFocus();
    expect(screen.getByRole("button", { name: t.form.retry })).toBeEnabled();
    expect(byId("pr-description")).toHaveValue("Synthetic chairs"); // values are kept
  });

  it.each(OTHER)("%s: timeout alert is translated", async (code) => {
    const { user } = renderPage();
    await choose(user, code);
    await fillValid(user);
    vi.useFakeTimers();
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    await act(async () => {
      submit().click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    const t = DICTIONARIES[code];
    expect(screen.getByRole("alert")).toHaveTextContent(t.alerts.timeout.title);
    expect(screen.getByRole("alert")).toHaveTextContent(t.alerts.timeout.detail);
    expect(byId("pr-unit-price")).toHaveValue("249.90");
  });

  it.each(OTHER)("%s: network failure and unexpected response alerts are translated", async (code) => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(t.alerts.network.title);

    fetchMock.mockImplementation(async () => respond("<html>oops</html>", 502, "text/html"));
    await user.click(screen.getByRole("button", { name: t.form.retry }));
    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.alerts.unexpected.title));
    expect(document.body.textContent).not.toContain("oops");
  });

  it("an alert already on screen is re-worded when the language changes", async () => {
    stubFetch(async () => problem("error.500.internal-error.json", 500));
    const { user } = renderPage();
    await fillValid(user);
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal error");
    await choose(user, "de");
    expect(screen.getByRole("alert")).toHaveTextContent("Interner Fehler");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("an unknown problem code falls back to the server's own English text", async () => {
    // a problem of a known type, but shown in German: translated. The unknown field code falls back to the server text.
    const payload = {
      ...readContractJson<Record<string, unknown>>("examples/error.422.validation.json"),
      errors: [{ field: "quantity", code: "invalid_format", message: "Server fallback text." }],
    };
    stubFetch(async () => respond(payload, 422, "application/problem+json"));
    const { user } = renderPage();
    await choose(user, "de");
    await fillValid(user);
    await user.click(submit());
    expect(await screen.findByText("Server fallback text.")).toBeInTheDocument();
  });
});

describe("success state in other languages", () => {
  it.each(OTHER)("%s: labels, status, note and storage text are translated", async (code) => {
    stubFetch(async () => created());
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());

    const heading = await screen.findByRole("heading", { name: t.success.title });
    expect(heading).toHaveFocus();
    // Look inside the result panel only: a word such as "Entwurf" also appears in the page intro.
    const panel = within(screen.getByRole("region", { name: t.success.title }));
    expect(panel.getByText(t.success.lead)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(t.success.noteStrong);
    expect(screen.getByRole("note")).toHaveTextContent(t.success.noteBody);
    expect(panel.getByText(t.success.statusValue)).toBeInTheDocument();
    for (const label of [t.success.id, t.success.created, t.success.storage, t.success.description, t.success.quantity, t.success.unitPrice, t.success.requester, t.success.total]) {
      expect(panel.getByText(label)).toBeInTheDocument();
    }
    expect(panel.getByText(t.success.totalNote)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.announce.saved);
    expect(panel.getByRole("button", { name: t.success.another })).toBeInTheDocument();
    // the server's own data is shown as it came
    expect(panel.getByText("PR-2026-000001")).toBeInTheDocument();
    expect(panel.getByText("Synthetic office chairs, model A")).toBeInTheDocument();
    expect(panel.getByText("Alex Example")).toBeInTheDocument();
  });

  it.each(LANGUAGE_CODES)("%s: a PostgreSQL draft is described as saved in the demo database, not as temporary storage", async (code) => {
    stubFetch(async () => createdPostgres());
    const { user } = renderPage();
    await choose(user, code);
    const t = DICTIONARIES[code];
    await fillValid(user);
    await user.click(submit());

    await screen.findByRole("heading", { name: t.success.title });
    const panel = within(screen.getByRole("region", { name: t.success.title }));
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(t.success.postgresNoteStrong);
    expect(note).toHaveTextContent(t.success.postgresNoteBody);
    expect(note).not.toHaveTextContent(t.success.noteStrong);
    expect(note).not.toHaveTextContent(t.success.noteBody);
    expect(panel.getByText(t.success.postgresStorageValue)).toBeInTheDocument();
    expect(panel.queryByText(t.success.storageValue)).not.toBeInTheDocument();
    expect(panel.getByText(t.success.statusValue)).toBeInTheDocument(); // still only a draft
    expect(panel.getByText("PR-2026-000001")).toBeInTheDocument();
  });

  it("formats amounts for the language (German 2.499,00, Spanish 2.499,00, Russian 2 499,00, English 2,499.00)", async () => {
    stubFetch(async () => created());
    const { user } = renderPage();
    await fillValid(user);
    await user.click(submit());
    expect(await screen.findByText("2,499.00 EUR")).toBeInTheDocument();
    expect(screen.getByText("249.90 EUR")).toBeInTheDocument();

    await choose(user, "de");
    expect(screen.getByText("2.499,00 EUR")).toBeInTheDocument();
    expect(screen.getByText("249,90 EUR")).toBeInTheDocument();
    await choose(user, "es");
    expect(screen.getByText("2.499,00 EUR")).toBeInTheDocument();
    await choose(user, "ru");
    expect(screen.getByText("2 499,00 EUR")).toBeInTheDocument(); // no-break space between groups
    expect(document.body.textContent).toContain("2 499,00 EUR");
  });

  it("the success panel is re-worded when the language changes", async () => {
    stubFetch(async () => created());
    const { user } = renderPage();
    await fillValid(user);
    await user.click(submit());
    await screen.findByRole("heading", { name: "Draft saved" });
    await choose(user, "es");
    expect(screen.getByRole("heading", { name: "Borrador guardado" })).toBeInTheDocument();
  });
});

describe("API payloads and codes are never changed by the language", () => {
  it.each(LANGUAGE_CODES)("%s: the request body is the same English-named JSON", async (code) => {
    const fetchMock = stubFetch(async () => created());
    const { user } = renderPage();
    await choose(user, code);
    await fillValid(user);
    await user.click(submit());
    await screen.findByRole("heading", { name: DICTIONARIES[code].success.title });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/requests");
    expect(JSON.parse(init.body as string)).toEqual({
      description: "Synthetic chairs",
      quantity: 10,
      unit_price: "249.90",
      currency: "EUR",
      requester_display_name: "Alex Example",
    });
    expect(JSON.stringify(init.headers)).not.toMatch(/accept-language/i);
  });
});

describe("no English leaks into another language", () => {
  /** Long English texts of the interface (functions skipped), by path. */
  function englishTexts(dictionary: Dictionary, path = "", out: Array<[string, string]> = []): Array<[string, string]> {
    for (const [key, value] of Object.entries(dictionary)) {
      const here = path ? `${path}.${key}` : key;
      if (typeof value === "string") out.push([here, value]);
      else if (Array.isArray(value)) value.forEach((item, i) => out.push([`${here}[${i}]`, item]));
      else if (value && typeof value === "object") englishTexts(value as unknown as Dictionary, here, out);
    }
    return out;
  }

  function counterpart(dictionary: Dictionary, path: string): string | undefined {
    return path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], dictionary) as string | undefined;
  }

  function expectNoEnglish(code: Language) {
    const body = document.body.textContent ?? "";
    for (const [path, english] of englishTexts(DICTIONARIES.en)) {
      if (english.length < 8) continue;
      if (counterpart(DICTIONARIES[code], path) === english) continue; // genuinely identical, for example "Status"
      expect(body, `English text "${english}" (${path}) is visible in ${code}`).not.toContain(english);
    }
  }

  it.each(OTHER)("%s: initial page, errors, alert and success state contain no English interface text", async (code) => {
    const fetchMock = stubFetch(async () => problem("error.500.internal-error.json", 500));
    const { user } = renderPage();
    await choose(user, code);
    expectNoEnglish(code); // initial page

    await user.click(submit());
    expectNoEnglish(code); // field errors

    await fillValid(user);
    await user.click(submit());
    await screen.findByRole("alert");
    expectNoEnglish(code); // server problem alert

    fetchMock.mockImplementation(async () => created());
    await user.click(screen.getByRole("button", { name: DICTIONARIES[code].form.retry }));
    await screen.findByRole("heading", { name: DICTIONARIES[code].success.title });
    expectNoEnglish(code); // success state
  });
});

describe("accessibility of the whole page (axe)", () => {
  async function expectNoViolations(container: Element) {
    const results = await axe(container);
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  }

  it.each(LANGUAGE_CODES)("%s, light: no violations on the initial page and with errors", async (code) => {
    const { user, container } = renderPage();
    await choose(user, code);
    await expectNoViolations(container);
    await user.click(submit());
    await expectNoViolations(container);
  });

  it("dark mode: no violations", async () => {
    const { user, container } = renderPage();
    await user.click(themeSwitch());
    await expectNoViolations(container);
  });

  it("success state with the mascot and confetti: no violations", async () => {
    stubFetch(async () => created());
    const { user, container } = renderPage();
    await fillValid(user);
    await user.click(submit());
    await screen.findByRole("heading", { name: "Draft saved" });
    await expectNoViolations(container);
  });

  it("decorative art is hidden from assistive technology", () => {
    const { container } = renderPage();
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThan(10);
    for (const svg of svgs) expect(svg, "an <svg> without aria-hidden").toHaveAttribute("aria-hidden", "true");
  });

  it("the language select and the theme switch can be reached with the keyboard, in order", async () => {
    const { user } = renderPage();
    await user.tab(); // skip link
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
    await user.tab();
    expect(languageSelect()).toHaveFocus();
    await user.tab();
    expect(themeSwitch()).toHaveFocus();
    await user.tab();
    expect(byId("pr-description")).toHaveFocus();
  });
});
