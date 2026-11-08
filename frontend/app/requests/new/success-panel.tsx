"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatAmount, formatTimestamp } from "@/lib/money-display";
import { useTranslation } from "@/lib/preferences";
import type { PurchaseRequestDraft } from "@/lib/types";
import { Confetti } from "../../_components/confetti";
import {
  IconCalendar,
  IconCheck,
  IconDatabase,
  IconFileText,
  IconHash,
  IconInfo,
  IconPlus,
  IconTag,
  IconUser,
} from "../../_components/icons";
import { Mascot } from "../../_components/mascot";

type Tone = "brand" | "teal" | "pink" | "warn";
const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  teal: "bg-teal-soft text-teal",
  pink: "bg-pink-soft text-pink",
  warn: "bg-warn-soft text-warn",
};

/** One labelled value as a small tile with a coloured icon. The value is plain text from the server. */
function Tile({
  label,
  icon,
  tone,
  wide,
  children,
}: {
  label: string;
  icon: ReactNode;
  tone: Tone;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface-2 p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="flex items-center gap-2 text-sm font-medium text-muted">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${TONES[tone]}`}>{icon}</span>
        {label}
      </dt>
      <dd className="mt-2 min-w-0 whitespace-pre-wrap break-words text-base font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Shown after a 201. Every value is the server's answer, rendered as text. */
export function SuccessPanel({ draft, onCreateAnother }: { draft: PurchaseRequestDraft; onCreateAnother: () => void }) {
  const { language, t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const { data, estimated_total: total } = draft;
  const s = t.success;
  // The server says where the draft is kept (contract v1 and v1.1). Describe it accurately.
  const inMemory = draft.storage_mode === "in_memory_dev";
  const noteStrong = inMemory ? s.noteStrong : s.postgresNoteStrong;
  const noteBody = inMemory ? s.noteBody : s.postgresNoteBody;
  const storageValue = inMemory ? s.storageValue : s.postgresStorageValue;

  return (
    <section
      aria-labelledby="result-title"
      className="motion-slide-up overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
    >
      <div className="bg-success-gradient relative overflow-hidden px-5 py-7 text-white sm:px-8">
        <Confetti />
        <div className="relative flex items-center gap-4">
          <span className="motion-pop grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-success shadow-lg">
            <IconCheck className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="result-title" ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight">
              {s.title}
            </h2>
            <p className="mt-1 text-white/95">{s.lead}</p>
          </div>
          <Mascot mood="cheer" className="motion-bob hidden h-20 w-20 shrink-0 sm:block" />
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-8">
        <p
          role="note"
          className="flex gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4 text-sm leading-relaxed text-warn"
        >
          <IconInfo className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <strong>{noteStrong}</strong> {noteBody}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm text-brand">
            <IconHash className="h-4 w-4" />
            <span className="font-semibold uppercase tracking-wide">{s.id}</span>
            <span className="font-mono font-semibold">{draft.id}</span>
          </p>
          <p className="inline-flex items-center gap-2 text-sm text-muted">
            <IconTag className="h-4 w-4" />
            {s.status}
            <span className="rounded-full bg-warn-soft px-3 py-0.5 text-sm font-semibold text-warn">{s.statusValue}</span>
          </p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Tile label={s.created} icon={<IconCalendar className="h-4 w-4" />} tone="teal">
            {formatTimestamp(draft.created_at)}
          </Tile>
          <Tile label={s.storage} icon={<IconDatabase className="h-4 w-4" />} tone={inMemory ? "warn" : "teal"}>
            {storageValue}
          </Tile>
          <Tile label={s.description} icon={<IconFileText className="h-4 w-4" />} tone="brand" wide>
            {data.description}
          </Tile>
          <Tile label={s.quantity} icon={<IconHash className="h-4 w-4" />} tone="pink">
            {String(data.quantity)}
          </Tile>
          <Tile label={s.unitPrice} icon={<IconTag className="h-4 w-4" />} tone="teal">
            {formatAmount(data.unit_price, language)} {data.currency}
          </Tile>
          <Tile label={s.requester} icon={<IconUser className="h-4 w-4" />} tone="brand" wide>
            {data.requester_display_name}
          </Tile>
        </dl>

        <div className="rounded-2xl border border-teal/40 bg-teal-soft p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal">{s.total}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ink sm:text-4xl">
            <span>
              {formatAmount(total.amount, language)} {total.currency}
            </span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">{s.totalNote}</p>
        </div>

        <button
          type="button"
          onClick={onCreateAnother}
          className="lift inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand bg-surface px-5 py-2 text-base font-semibold text-brand hover:bg-brand-soft sm:w-auto"
        >
          <IconPlus className="h-4 w-4" />
          {s.another}
        </button>
      </div>
    </section>
  );
}
