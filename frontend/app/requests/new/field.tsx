"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@/lib/preferences";
import { IconAlert, IconChevronDown } from "../../_components/icons";

export interface ControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Extra classes for the wrapper (used to let neighbouring fields share rows). */
  className?: string;
  children: (controlProps: ControlProps) => ReactNode;
}

const BASE =
  "block min-h-11 w-full border bg-surface px-3.5 py-2 text-base text-ink shadow-sm transition-colors placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/20";

/**
 * Shared look of text inputs, the textarea and the select. 16px text avoids zoom on phones.
 * `attached` removes the left rounding when a prefix chip sits to the left of the input.
 */
export function controlClassName(invalid: boolean, attached = false): string {
  const shape = attached ? "rounded-r-xl" : "rounded-xl";
  const colour = invalid ? "border-danger ring-1 ring-danger" : "border-line-strong hover:border-brand";
  return `${BASE} ${shape} ${colour}`;
}

/** A small label chip on the left of an input (currency symbol, "×", user icon). Decoration only. */
export function InputGroup({ prefix, invalid, children }: { prefix: ReactNode; invalid: boolean; children: ReactNode }) {
  return (
    <div className="flex">
      <span
        aria-hidden="true"
        className={`inline-flex min-w-12 shrink-0 items-center justify-center rounded-l-xl border border-r-0 bg-surface-3 px-3 text-sm font-semibold text-ink-soft ${
          invalid ? "border-danger" : "border-line-strong"
        }`}
      >
        {prefix}
      </span>
      {children}
    </div>
  );
}

/** A <select> with a custom caret. Still a native select, so it works everywhere. */
export function SelectShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
    </div>
  );
}

/**
 * One form field: a real <label>, an optional hint and an error message.
 * The hint and the error are linked to the control with aria-describedby, so a screen reader
 * reads them together with the label.
 */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const { t } = useTranslation();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">
        {children({
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
          "aria-required": true,
        })}
      </div>
      {error ? (
        <p id={errorId} className="motion-slide-up mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="sr-only">{t.errorPrefix}</span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}
