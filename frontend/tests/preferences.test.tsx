// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DICTIONARIES } from "@/lib/i18n";
import {
  LANGUAGE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  resetPreferencesForTests,
  setLanguage,
  setTheme,
  useLanguage,
  useTheme,
  useTranslation,
} from "@/lib/preferences";

function stubSystemTheme(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: prefersDark && query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => {
  resetPreferencesForTests();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  // @ts-expect-error: remove the stub again so every test starts without matchMedia (like jsdom)
  delete window.matchMedia;
  resetPreferencesForTests();
});

describe("language preference", () => {
  it("defaults to English", () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current[0]).toBe("en");
  });

  it("is stored in this browser and found again by a new page load", () => {
    const first = renderHook(() => useLanguage());
    act(() => first.result.current[1]("de"));
    expect(first.result.current[0]).toBe("de");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");

    first.unmount();
    const second = renderHook(() => useLanguage());
    expect(second.result.current[0]).toBe("de");
  });

  it("ignores a stored value that is not one of the four languages", () => {
    for (const bad of ["fr", "EN", "", "<script>", "de ", "undefined"]) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, bad);
      const { result, unmount } = renderHook(() => useLanguage());
      expect(result.current[0], bad).toBe("en");
      unmount();
    }
  });

  it("gives the matching dictionary", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.language).toBe("en");
    expect(result.current.t).toBe(DICTIONARIES.en);
    act(() => setLanguage("ru"));
    expect(result.current.language).toBe("ru");
    expect(result.current.t).toBe(DICTIONARIES.ru);
  });

  it("every component using it updates when it changes", () => {
    const a = renderHook(() => useLanguage());
    const b = renderHook(() => useLanguage());
    act(() => setLanguage("es"));
    expect(a.result.current[0]).toBe("es");
    expect(b.result.current[0]).toBe("es");
  });
});

describe("theme preference", () => {
  it("defaults to light when the system gives no preference", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("light");
  });

  it("follows the system setting until the user chooses", () => {
    stubSystemTheme(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
    act(() => setTheme("light"));
    expect(result.current[0]).toBe("light"); // the saved choice wins over the system
  });

  it("applies data-theme and color-scheme to the page and stores the choice", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    act(() => result.current[1]("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("ignores a stored value that is not light or dark", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "blue");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("light");
  });
});

describe("what is stored", () => {
  it("only the two preference keys, and only the plain values", () => {
    act(() => {
      setLanguage("de");
      setTheme("dark");
    });
    expect(window.localStorage.length).toBe(2);
    expect(window.localStorage.getItem("procureflow.language")).toBe("de");
    expect(window.localStorage.getItem("procureflow.theme")).toBe("dark");
  });
});

describe("when the browser blocks storage (for example a private window)", () => {
  it("does not crash and still works until the page is closed", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const language = renderHook(() => useLanguage());
    const theme = renderHook(() => useTheme());
    expect(language.result.current[0]).toBe("en");
    expect(theme.result.current[0]).toBe("light");

    act(() => {
      language.result.current[1]("ru");
      theme.result.current[1]("dark");
    });
    expect(language.result.current[0]).toBe("ru");
    expect(theme.result.current[0]).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
