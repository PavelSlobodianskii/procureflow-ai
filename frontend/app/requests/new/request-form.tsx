"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPurchaseRequest } from "@/lib/api-client";
import { INITIAL_FORM_VALUES, validateForm, type FormValues } from "@/lib/form";
import { localizeError, localizeProblem } from "@/lib/i18n/localize";
import type { Dictionary, Language } from "@/lib/i18n";
import { CURRENCY_SYMBOLS } from "@/lib/money-display";
import { useTranslation } from "@/lib/preferences";
import {
  CURRENCIES,
  FIELD_NAMES,
  type FieldError,
  type FieldName,
  type Problem,
  type PurchaseRequestDraft,
} from "@/lib/types";
import { LIMITS, errorsForField } from "@/lib/validation";
import { IconCalculator, IconFileText, IconRefresh, IconSave, IconUser } from "../../_components/icons";
import { Mascot, type MascotMood } from "../../_components/mascot";
import { Field, InputGroup, SelectShell, controlClassName } from "./field";
import { FormAlert, type AlertContent } from "./form-alert";
import { SuccessPanel } from "./success-panel";

type Phase = { name: "editing" } | { name: "sending" } | { name: "done"; draft: PurchaseRequestDraft };
type FieldErrors = Partial<Record<FieldName, FieldError>>;

/**
 * What went wrong, kept as a code (not as words), so it can be shown in the language the user has
 * chosen right now, even if they switch language while the message is on screen.
 */
type AlertState = (
  | { kind: "problem"; problem: Problem }
  | { kind: "validation"; problem: Problem; others: FieldError[] }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "unexpected" }
) & {
  /** True when the alert (not a field) should receive keyboard focus. */
  takeFocus: boolean;
};

type Announcement =
  | { kind: "sending" }
  | { kind: "saved" }
  | { kind: "clientErrors"; count: number }
  | { kind: "serverErrors"; count: number };

/** A field that spans four rows (label, hint, control, error) of its parent grid, so neighbours line up. */
const SHARED_ROWS = "sm:row-span-4 sm:grid sm:grid-rows-subgrid";

const isFieldName = (name: string): name is FieldName => (FIELD_NAMES as readonly string[]).includes(name);

/** Split a list of errors into per-field errors (first error per field) and everything else. */
function splitErrors(errors: FieldError[]): { fields: FieldErrors; others: FieldError[]; first?: FieldName } {
  const fields: FieldErrors = {};
  const others: FieldError[] = [];
  let first: FieldName | undefined;
  for (const error of errors) {
    if (isFieldName(error.field)) {
      if (fields[error.field] === undefined) fields[error.field] = error;
      first ??= error.field;
    } else {
      others.push(error);
    }
  }
  return { fields, others, first };
}

function alertContent(alert: AlertState, language: Language, t: Dictionary): AlertContent {
  switch (alert.kind) {
    case "timeout":
      return t.alerts.timeout;
    case "network":
      return t.alerts.network;
    case "unexpected":
      return t.alerts.unexpected;
    case "problem":
      return localizeProblem(language, t, alert.problem);
    case "validation": {
      const { title, detail } = localizeProblem(language, t, alert.problem);
      return {
        title,
        detail,
        items: alert.others.map((error) => {
          const message = localizeError(language, t, error);
          return error.field === "$" ? message : `${error.field}: ${message}`;
        }),
      };
    }
  }
}

function announcementText(announcement: Announcement | null, t: Dictionary): string {
  switch (announcement?.kind) {
    case "sending":
      return t.announce.sending;
    case "saved":
      return t.announce.saved;
    case "clientErrors":
      return t.announce.clientErrors(announcement.count);
    case "serverErrors":
      return t.announce.serverErrors(announcement.count);
    default:
      return "";
  }
}

const SECTION_TONES = {
  brand: "bg-brand-soft text-brand",
  teal: "bg-teal-soft text-teal",
  pink: "bg-pink-soft text-pink",
} as const;

function SectionHeading({
  id,
  icon,
  tone,
  title,
  subtitle,
}: {
  id: string;
  icon: ReactNode;
  tone: keyof typeof SECTION_TONES;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${SECTION_TONES[tone]}`}>{icon}</span>
      <div>
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function RequestForm() {
  const { language, t } = useTranslation();
  const [values, setValues] = useState<FormValues>(INITIAL_FORM_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  const controls = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});
  const dirty = useRef(new Set<FieldName>());
  const submittedOnce = useRef(false);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const focusDescriptionNext = useRef(false);

  const sending = phase.name === "sending";

  // Closing the page cancels a request that is still in flight.
  useEffect(() => () => abort.current?.abort(), []);

  // After "Create another request" the form is shown again; put the cursor in its first field.
  useEffect(() => {
    if (focusDescriptionNext.current && phase.name === "editing") {
      focusDescriptionNext.current = false;
      controls.current.description?.focus();
    }
  }, [phase.name]);

  function focusField(name: FieldName | undefined) {
    if (name) controls.current[name]?.focus();
  }

  function change(name: FieldName, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);
    dirty.current.add(name);
    // A shown error disappears as soon as the field becomes valid. New errors appear when the user leaves the field.
    if (fieldErrors[name] && !errorsForField(validateForm(next), name)) {
      setFieldErrors((current) => ({ ...current, [name]: undefined }));
    }
  }

  function leave(name: FieldName) {
    if (!dirty.current.has(name) && !submittedOnce.current) return;
    const error = errorsForField(validateForm(values), name);
    setFieldErrors((current) => ({ ...current, [name]: error }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return; // A second click or Enter press while sending does nothing.
    submittedOnce.current = true;

    const result = validateForm(values);
    if (!result.ok) {
      const { fields, first } = splitErrors(result.errors);
      setFieldErrors(fields);
      setAlert(null);
      setAnnouncement({ kind: "clientErrors", count: Object.keys(fields).length });
      focusField(first);
      return;
    }

    inFlight.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setFieldErrors({});
    setAlert(null);
    setPhase({ name: "sending" });
    setAnnouncement({ kind: "sending" });

    const outcome = await createPurchaseRequest(result.value, { signal: controller.signal });

    inFlight.current = false;
    abort.current = null;

    switch (outcome.kind) {
      case "aborted":
        return;
      case "created":
        setPhase({ name: "done", draft: outcome.draft });
        setAnnouncement({ kind: "saved" });
        return;
      case "validation": {
        const { fields, others, first } = splitErrors(outcome.errors);
        setFieldErrors(fields);
        setPhase({ name: "editing" });
        if (others.length > 0) {
          setAlert({ kind: "validation", problem: outcome.problem, others, takeFocus: first === undefined });
        }
        setAnnouncement(first ? { kind: "serverErrors", count: Object.keys(fields).length } : null);
        focusField(first);
        return;
      }
      case "problem":
        setPhase({ name: "editing" });
        setAnnouncement(null);
        setAlert({ kind: "problem", problem: outcome.problem, takeFocus: true });
        return;
      case "timeout":
      case "network":
      case "unexpected":
        setPhase({ name: "editing" });
        setAnnouncement(null);
        setAlert({ kind: outcome.kind, takeFocus: true });
        return;
    }
  }

  function createAnother() {
    setValues(INITIAL_FORM_VALUES);
    setFieldErrors({});
    setAlert(null);
    setAnnouncement(null);
    dirty.current.clear();
    submittedOnce.current = false;
    focusDescriptionNext.current = true;
    setPhase({ name: "editing" });
  }

  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcementText(announcement, t)}
    </p>
  );

  if (phase.name === "done") {
    return (
      <div>
        {liveRegion}
        <SuccessPanel draft={phase.draft} onCreateAnother={createAnother} />
      </div>
    );
  }

  const errorText = (name: FieldName): string | undefined => {
    const error = fieldErrors[name];
    return error ? localizeError(language, t, error) : undefined;
  };

  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);
  const mood: MascotMood = sending ? "thinking" : alert || hasFieldErrors ? "oops" : "happy";
  const descriptionLength = Array.from(values.description).length;
  const currencySymbol = (CURRENCY_SYMBOLS as Record<string, string>)[values.currency] ?? values.currency;
  const f = t.fields;
  const retryable = alert !== null && alert.kind !== "validation";

  return (
    <div>
      {liveRegion}
      <form
        noValidate
        aria-label={t.form.ariaLabel}
        aria-busy={sending}
        onSubmit={submit}
        className="space-y-7 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8"
      >
        <div className="flex items-center gap-3">
          <Mascot mood={mood} className="h-16 w-16 shrink-0" />
          <p className="relative rounded-2xl rounded-bl-sm bg-brand-soft px-4 py-2.5 text-sm font-medium text-ink">
            {t.form.allRequired}
          </p>
        </div>

        {alert ? <FormAlert content={alertContent(alert, language, t)} takeFocus={alert.takeFocus} /> : null}

        <div role="group" aria-labelledby="sec-need" className="space-y-4">
          <SectionHeading
            id="sec-need"
            icon={<IconFileText className="h-5 w-5" />}
            tone="brand"
            title={t.sections.need.title}
            subtitle={t.sections.need.subtitle}
          />
          <Field
            id="pr-description"
            label={f.description.label}
            hint={f.description.hint(LIMITS.description.min, LIMITS.description.max)}
            error={errorText("description")}
          >
            {(props) => (
              <>
                <textarea
                  {...props}
                  ref={(element) => {
                    controls.current.description = element;
                  }}
                  name="description"
                  rows={4}
                  autoComplete="off"
                  value={values.description}
                  onChange={(event) => change("description", event.target.value)}
                  onBlur={() => leave("description")}
                  className={controlClassName(Boolean(fieldErrors.description))}
                />
                <p aria-hidden="true" className="mt-1 text-right text-xs tabular-nums text-muted">
                  {descriptionLength} / {LIMITS.description.max}
                </p>
              </>
            )}
          </Field>
        </div>

        <div role="group" aria-labelledby="sec-cost" className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5">
          <SectionHeading
            id="sec-cost"
            icon={<IconCalculator className="h-5 w-5" />}
            tone="teal"
            title={t.sections.cost.title}
            subtitle={t.sections.cost.subtitle}
          />
          {/* On wider screens the three fields share rows (subgrid): labels, hints, controls and error
              messages line up even when a hint wraps onto two lines or only one field shows an error. */}
          <div className="grid gap-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-0">
            <Field
              id="pr-quantity"
              label={f.quantity.label}
              hint={f.quantity.hint(LIMITS.quantity.min, LIMITS.quantity.max)}
              error={errorText("quantity")}
              className={SHARED_ROWS}
            >
              {(props) => (
                <InputGroup prefix="×" invalid={Boolean(fieldErrors.quantity)}>
                  <input
                    {...props}
                    ref={(element) => {
                      controls.current.quantity = element;
                    }}
                    name="quantity"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={values.quantity}
                    onChange={(event) => change("quantity", event.target.value)}
                    onBlur={() => leave("quantity")}
                    className={`min-w-0 ${controlClassName(Boolean(fieldErrors.quantity), true)}`}
                  />
                </InputGroup>
              )}
            </Field>

            <Field
              id="pr-unit-price"
              label={f.unit_price.label}
              hint={f.unit_price.hint}
              error={errorText("unit_price")}
              className={SHARED_ROWS}
            >
              {(props) => (
                <InputGroup prefix={currencySymbol} invalid={Boolean(fieldErrors.unit_price)}>
                  <input
                    {...props}
                    ref={(element) => {
                      controls.current.unit_price = element;
                    }}
                    name="unit_price"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={values.unit_price}
                    onChange={(event) => change("unit_price", event.target.value)}
                    onBlur={() => leave("unit_price")}
                    className={`min-w-0 tabular-nums ${controlClassName(Boolean(fieldErrors.unit_price), true)}`}
                  />
                </InputGroup>
              )}
            </Field>

            <Field
              id="pr-currency"
              label={f.currency.label}
              hint={f.currency.hint}
              error={errorText("currency")}
              className={SHARED_ROWS}
            >
              {(props) => (
                <SelectShell>
                  <select
                    {...props}
                    ref={(element) => {
                      controls.current.currency = element;
                    }}
                    name="currency"
                    value={values.currency}
                    onChange={(event) => change("currency", event.target.value)}
                    onBlur={() => leave("currency")}
                    className={`cursor-pointer appearance-none pr-10 ${controlClassName(Boolean(fieldErrors.currency))}`}
                  >
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </SelectShell>
              )}
            </Field>
          </div>
        </div>

        <div role="group" aria-labelledby="sec-who" className="space-y-4">
          <SectionHeading
            id="sec-who"
            icon={<IconUser className="h-5 w-5" />}
            tone="pink"
            title={t.sections.who.title}
            subtitle={t.sections.who.subtitle}
          />
          <Field
            id="pr-requester"
            label={f.requester_display_name.label}
            hint={f.requester_display_name.hint}
            error={errorText("requester_display_name")}
          >
            {(props) => (
              <InputGroup prefix={<IconUser className="h-4 w-4" />} invalid={Boolean(fieldErrors.requester_display_name)}>
                <input
                  {...props}
                  ref={(element) => {
                    controls.current.requester_display_name = element;
                  }}
                  name="requester_display_name"
                  type="text"
                  autoComplete="off"
                  value={values.requester_display_name}
                  onChange={(event) => change("requester_display_name", event.target.value)}
                  onBlur={() => leave("requester_display_name")}
                  className={`min-w-0 ${controlClassName(Boolean(fieldErrors.requester_display_name), true)}`}
                />
              </InputGroup>
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={sending}
            className="lift bg-brand-gradient inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-2 text-base font-semibold text-white shadow-soft hover:shadow-card disabled:cursor-not-allowed disabled:opacity-80 sm:w-auto"
          >
            {sending ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 animate-spin fill-none stroke-current">
                <circle cx="12" cy="12" r="9" strokeWidth="3" className="opacity-30" />
                <path d="M21 12a9 9 0 0 0-9-9" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : retryable ? (
              <IconRefresh className="h-5 w-5" />
            ) : (
              <IconSave className="h-5 w-5" />
            )}
            {sending ? t.form.saving : retryable ? t.form.retry : t.form.save}
          </button>
          <p className="text-sm text-muted">{t.form.savesOnly}</p>
        </div>
      </form>
    </div>
  );
}
