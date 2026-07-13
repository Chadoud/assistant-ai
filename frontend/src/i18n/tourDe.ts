/**
 * Guided tour copy — German (UI locale de). Kept in sync with {@link tourStepBundles.en} keys.
 * Run `npx vitest run src/i18n/tourStepParity.test.ts` after step changes.
 */
export const tourDe = {
  intro: {
    title: "Willkommen bei Exo",
    body: "Exo sortiert Ihre Dateien mit wenig Aufwand in die richtigen Ordner. Diese kurze Tour zeigt, wo Sie Dateien hinzufügen, Vorschläge prüfen und Hilfe finden. Jederzeit überspringbar.",
  },
  "sort-flow-strip": {
    title: "So funktioniert das Sortieren",
    body: "Kurze Einführung zum Sortieren auf diesem Tab. Öffnen Sie Hilfe für Gruppierung, Regeln und Quellen — oder starten Sie die geführte Tour.",
  },
  "sort-tab": {
    title: "Dateien sortieren",
    body: "Ihre Startseite zum Organisieren. Jedes Sortieren beginnt hier.",
  },
  "workspace-local": {
    title: "Dieser Mac",
    body: "Dateien oder Ordner hierher ziehen oder klicken zum Durchsuchen. Exo liest Inhalte und schlägt passende Ordner vor.",
  },
  "external-sources": {
    title: "Mail & Cloud",
    body: "Gmail, Drive, Dropbox u. a. verbinden — aus Postfächern und Cloud-Ordnern sortieren, ohne alles vorher herunterzuladen. Vollständige Einrichtung unter Quellen in der Seitenleiste.",
  },
  "run-sort": {
    title: "Sortieren starten",
    body: "Wenn Sie bereit sind: Sortieren starten. Ordner vorschläge prüfen, bei Bedarf anpassen, dann anwenden — kopieren oder verschieben gemäß Einstellungen.",
  },
  "results-tab": {
    title: "Ergebnisse",
    body: "Nach dem Anwenden den sortierten Ordnerbaum hier durchsuchen. Aktualisieren, wenn Sie Dateien außerhalb von Exo ändern.",
  },
  "assistant-chat": {
    title: "Chat & Sprache",
    body: "Fragen stellen, Aufgaben diktieren oder Hilfe beim Sortieren. Gemini unter Einstellungen → KI-Agenten für Cloud-Chat und Sprache verbinden.",
  },
  "sources-tab": {
    title: "Quellen",
    body: "Gmail, Cloud-Speicher und andere Konten an einem Ort verbinden und verwalten.",
  },
  "settings-output-folder": {
    title: "Ausgabeordner",
    body: "Sortierte Dateien landen standardmäßig hier — meist Dokumente/Exo Sorted Files. Jederzeit änderbar unter Einstellungen → Dateien sortieren.",
  },
  "help-shortcuts": {
    title: "Hilfe & Tastenkürzel",
    body: "Hilfe für Tastenkürzel und Tipps. Diese Tour jederzeit erneut starten.",
  },
  "settings-models-overview": {
    title: "Lokales Sortiermodell",
    body: "Wenn das Sortieren auf diesem Mac läuft, liegt Ihr Textmodell hier. Vision für Scans ist optional — bei Bedarf später hinzufügen.",
  },
  "settings-system": {
    title: "App-Status",
    body: "Prüfen, ob der lokale Dienst läuft und die Texterkennung eingerichtet ist. Bei Offline: Dienst neu starten oder Hilfe öffnen.",
  },
} as const;
