"use client";

import { useEffect, useRef } from "react";
import { IconAlert } from "../../_components/icons";

export interface AlertContent {
  title: string;
  detail?: string;
  items?: string[];
}

/**
 * A form-level problem (server error, timeout, unknown field ...).
 * Everything is rendered as plain text. Server text is never inserted as HTML.
 * It is announced because of role="alert", and it takes keyboard focus when `takeFocus` is true,
 * so keyboard and screen reader users land on it.
 */
export function FormAlert({ content, takeFocus }: { content: AlertContent; takeFocus: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (takeFocus) ref.current?.focus();
  }, [takeFocus]);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="motion-slide-up flex gap-3 rounded-2xl border border-danger-line border-l-4 border-l-danger bg-danger-soft p-4"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-danger">
        <IconAlert className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-danger">{content.title}</p>
        {content.detail ? <p className="mt-1 text-sm leading-relaxed text-ink">{content.detail}</p> : null}
        {content.items && content.items.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {content.items.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
