"use client";

import { useTranslation } from "@/lib/preferences";
import { IconArrowLeft } from "./icons";
import { Mascot } from "./mascot";

export function NotFoundContent() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <Mascot mood="oops" className="h-28 w-28" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink">{t.notFound.title}</h1>
      <p className="mt-2 text-ink-soft">{t.notFound.body}</p>
      <a
        href="/requests/new"
        className="lift bg-brand-gradient mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2 font-semibold text-white shadow-soft"
      >
        <IconArrowLeft className="h-4 w-4" />
        {t.notFound.link}
      </a>
    </div>
  );
}
