"use client";

import { useTranslation } from "@/lib/preferences";
import { HeroArt } from "../../_components/hero-art";
import { IconCalculator, IconCheck, IconFlask, IconPencil, IconShield } from "../../_components/icons";
import { RequestForm } from "./request-form";

const CHIP_ICONS = [IconPencil, IconFlask, IconCalculator] as const;

/** The whole page: colourful hero band, the form card overlapping it, and the "about" side panel. */
export function NewRequestScreen() {
  const { t } = useTranslation();
  const p = t.page;

  return (
    <>
      <section className="bg-hero relative overflow-hidden text-white">
        {/* soft decorative circles */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="motion-float-slow absolute -left-10 top-6 h-40 w-40 rounded-full bg-white/10" />
          <span className="motion-float absolute right-1/3 top-2 h-16 w-16 rounded-full bg-cyan-300/15" />
          <span className="motion-float-slow absolute -bottom-12 left-1/3 h-44 w-44 rounded-full bg-indigo-300/10" />
        </div>

        <div className="relative mx-auto grid max-w-5xl items-center gap-6 px-4 pb-24 pt-10 sm:px-6 sm:pb-28 sm:pt-14 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{p.heroTitle}</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-white/95 sm:text-lg">
              {p.introBefore}
              <strong className="font-semibold text-white underline decoration-cyan-200 decoration-2 underline-offset-4">
                {p.introStrong}
              </strong>
              {p.introAfter}
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {p.chips.map((chip, index) => {
                const Icon = CHIP_ICONS[index];
                return (
                  <li
                    key={chip}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white ring-1 ring-white/30"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {chip}
                  </li>
                );
              })}
            </ul>
          </div>
          <HeroArt className="hidden h-auto w-full md:block" />
        </div>
      </section>

      <div className="relative mx-auto -mt-16 max-w-5xl px-4 pb-14 sm:-mt-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <RequestForm />

          <aside
            aria-labelledby="about-title"
            className="shadow-soft rounded-3xl border border-line bg-surface p-5 text-sm leading-relaxed text-ink-soft lg:sticky lg:top-6"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-soft text-teal">
                <IconShield className="h-5 w-5" />
              </span>
              <h2 id="about-title" className="text-base font-semibold text-ink">
                {p.aboutTitle}
              </h2>
            </div>
            <ul className="mt-4 space-y-3">
              {p.about.map((item) => (
                <li key={item} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-soft text-teal"
                  >
                    <IconCheck className="h-3.5 w-3.5" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
