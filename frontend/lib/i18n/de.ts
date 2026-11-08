import { pluralWord } from "./plural";
import type { Dictionary } from "./types";

export const de: Dictionary = {
  nativeName: "Deutsch",
  site: {
    skipToContent: "Zum Hauptinhalt springen",
    devBadge: "Entwicklungsvorschau · Nur synthetische Daten",
    footer: "Lernprojekt. Alle Namen, Artikel und Beträge sind erfunden.",
    languageLabel: "Sprache",
    themeLabel: "Dunkelmodus",
  },
  page: {
    docTitle: "Neue Beschaffungsanfrage",
    heroTitle: "Neue Beschaffungsanfrage",
    introBefore: "Beschreiben Sie den Artikel oder die Leistung, die Sie benötigen. Dabei wird nur ein ",
    introStrong: "Entwurf",
    introAfter: " gespeichert.",
    chips: ["Nur Entwurf", "Synthetische Daten", "Summe vom Server berechnet"],
    aboutTitle: "Über dieses Formular",
    about: [
      "Es erstellt einen Entwurf – mehr nicht.",
      "Nach dem Speichern wird nichts an andere weitergeleitet.",
      "Verwenden Sie nur erfundene Namen und Artikel. Dies ist ein Lernprojekt.",
      "Entwürfe liegen nur im temporären Entwicklungsspeicher und verschwinden, wenn der Server neu startet.",
      "Die geschätzte Summe berechnet der Server, nicht Ihr Browser.",
    ],
  },
  form: {
    ariaLabel: "Formular für Beschaffungsanfrage",
    allRequired: "Alle Felder sind Pflichtfelder.",
    save: "Entwurf speichern",
    saving: "Entwurf wird gespeichert…",
    retry: "Erneut versuchen",
    savesOnly: "Speichert nur einen Entwurf. Es wird nichts versendet.",
  },
  sections: {
    need: { title: "Was benötigen Sie?", subtitle: "Beschreiben Sie den Artikel oder die Leistung." },
    cost: { title: "Kostenschätzung", subtitle: "Eine grobe Schätzung genügt." },
    who: { title: "Wer fragt an?", subtitle: "Ein erfundener Name für diese Demo." },
  },
  fields: {
    description: {
      label: "Beschreibung",
      hint: (min, max) => `Artikel oder Leistung, ${min} bis ${max} Zeichen.`,
    },
    quantity: { label: "Menge", hint: (min, max) => `Ganze Zahl von ${min} bis ${max}.` },
    unit_price: {
      label: "Geschätzter Stückpreis",
      hint: "Mit Punkt als Dezimaltrenner, zum Beispiel 249.90.",
    },
    currency: { label: "Währung", hint: "Beträge werden nicht umgerechnet." },
    requester_display_name: {
      label: "Anzeigename des Anfragenden",
      hint: "Nur ein erfundener Name. Geben Sie keine echten personenbezogenen Daten ein.",
    },
  },
  errorPrefix: "Fehler: ",
  validation: {
    $: { invalid_type: "Der Anfragetext muss ein JSON-Objekt sein." },
    description: {
      required: "Beschreibung ist erforderlich.",
      invalid_type: "Beschreibung muss Text sein.",
      too_short: "Beschreibung muss mindestens 3 Zeichen lang sein.",
      too_long: "Beschreibung darf höchstens 500 Zeichen lang sein.",
    },
    quantity: {
      required: "Menge ist erforderlich.",
      invalid_type: "Menge muss eine ganze Zahl sein.",
      out_of_range: "Menge muss zwischen 1 und 100000 liegen.",
    },
    unit_price: {
      required: "Stückpreis ist erforderlich.",
      invalid_type: 'Stückpreis muss Text sein, zum Beispiel "249.90".',
      invalid_format:
        'Stückpreis muss ein positiver Betrag mit höchstens 2 Dezimalstellen sein, zum Beispiel "249.90".',
      out_of_range: "Stückpreis muss größer als 0 und höchstens 10000000.00 sein.",
    },
    currency: {
      required: "Währung ist erforderlich.",
      invalid_type: "Währung muss Text sein.",
      invalid_choice: "Währung muss eine der folgenden sein: EUR, USD, GBP, CHF.",
    },
    requester_display_name: {
      required: "Anzeigename des Anfragenden ist erforderlich.",
      invalid_type: "Anzeigename des Anfragenden muss Text sein.",
      too_short: "Anzeigename des Anfragenden muss mindestens 2 Zeichen lang sein.",
      too_long: "Anzeigename des Anfragenden darf höchstens 80 Zeichen lang sein.",
    },
  },
  unknownField: "Unbekanntes Feld. Dieses Feld ist nicht erlaubt.",
  announce: {
    sending: "Ihre Anfrage wird gesendet. Bitte warten.",
    saved: "Entwurf gespeichert.",
    clientErrors: (count) =>
      `Das Formular enthält ${count} ${pluralWord("de", count, { one: "Fehler", other: "Fehler" })}. Bitte korrigieren Sie diese und versuchen Sie es erneut.`,
    serverErrors: (count) =>
      `Der Server hat ${count} ${pluralWord("de", count, { one: "Feld", other: "Felder" })} abgelehnt. Bitte korrigieren Sie diese.`,
  },
  alerts: {
    timeout: {
      title: "Der Server hat nicht geantwortet",
      detail:
        "Die Antwort hat zu lange gedauert. Ihr Entwurf wurde möglicherweise gespeichert, möglicherweise nicht. Ihre Eingaben sind noch vorhanden. Bitte versuchen Sie es erneut.",
    },
    network: {
      title: "Der Server ist nicht erreichbar",
      detail:
        "Prüfen Sie, ob der Entwicklungsserver läuft. Ihr Entwurf wurde möglicherweise gespeichert, möglicherweise nicht. Ihre Eingaben sind noch vorhanden. Bitte versuchen Sie es erneut.",
    },
    unexpected: {
      title: "Unerwartete Antwort",
      detail:
        "Der Server hat eine Antwort gesendet, die dieses Formular nicht versteht. Ihr Entwurf wurde möglicherweise gespeichert, möglicherweise nicht. Ihre Eingaben sind noch vorhanden. Bitte versuchen Sie es erneut.",
    },
    problems: {
      "urn:procureflow:problem:invalid-json": {
        title: "Ungültiges JSON",
        detail: "Der Anfragetext ist kein gültiges JSON.",
      },
      "urn:procureflow:problem:payload-too-large": {
        title: "Anfrage zu groß",
        detail: "Der Anfragetext darf 16384 Bytes nicht überschreiten.",
      },
      "urn:procureflow:problem:unsupported-media-type": {
        title: "Nicht unterstützter Medientyp",
        detail: "Content-Type muss application/json sein.",
      },
      "urn:procureflow:problem:validation-error": {
        title: "Validierung fehlgeschlagen",
        detail: "Ein oder mehrere Felder sind ungültig.",
      },
      "urn:procureflow:problem:not-found": {
        title: "Nicht gefunden",
        detail: "Diese Route existiert nicht.",
      },
      "urn:procureflow:problem:method-not-allowed": {
        title: "Methode nicht erlaubt",
        detail: "Diese Route erlaubt diese HTTP-Methode nicht.",
      },
      "urn:procureflow:problem:internal-error": {
        title: "Interner Fehler",
        detail: "Es ist ein unerwarteter Fehler aufgetreten.",
      },
    },
  },
  success: {
    title: "Entwurf gespeichert",
    lead: "Ihre Anfrage wurde als Entwurf gespeichert.",
    noteStrong: "Temporärer Entwicklungsspeicher.",
    noteBody:
      "Dieser Entwurf liegt nur im Arbeitsspeicher des Entwicklungsservers. Er geht verloren, wenn der Server neu startet. Er wurde an niemanden gesendet.",
    id: "Anfrage-ID",
    status: "Status",
    statusValue: "Entwurf",
    created: "Erstellt",
    storage: "Speicher",
    storageValue: "Temporärer Entwicklungsspeicher",
    description: "Beschreibung",
    quantity: "Menge",
    unitPrice: "Stückpreis",
    requester: "Anfragender",
    total: "Geschätzte Summe",
    totalNote: "Nur eine Schätzung: Menge mal Stückpreis, vom Server berechnet.",
    another: "Weitere Anfrage erstellen",
  },
  notFound: {
    title: "Seite nicht gefunden",
    body: "Diese Seite gibt es nicht.",
    link: "Zum Formular",
  },
};
