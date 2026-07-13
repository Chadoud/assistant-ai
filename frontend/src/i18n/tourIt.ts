/**
 * Guided tour copy — Italian (UI locale it). Kept in sync with {@link tourStepBundles.en} keys.
 * Run `npx vitest run src/i18n/tourStepParity.test.ts` after step changes.
 */
export const tourIt = {
  intro: {
    title: "Benvenuto in Exo",
    body: "Exo mette i tuoi file nelle cartelle giuste con poca configurazione. Questo breve tour mostra dove aggiungere file, rivedere i suggerimenti e trovare aiuto. Salta quando vuoi.",
  },
  "sort-flow-strip": {
    title: "Come funziona l'ordinamento",
    body: "Breve intro all'ordinamento su questa scheda. Apri Aiuto per raggruppamento, regole e sorgenti — o avvia il tour guidato.",
  },
  "sort-tab": {
    title: "Ordina file",
    body: "La base per organizzare i documenti. Ogni ordinamento parte da qui.",
  },
  "workspace-local": {
    title: "Questo computer",
    body: "Trascina file o cartelle qui, o clicca per sfogliare. Exo legge i contenuti e suggerisce dove mettere ogni elemento.",
  },
  "external-sources": {
    title: "Mail e cloud",
    body: "Collega Gmail, Drive, Dropbox e altri — ordina da caselle e cartelle cloud senza scaricare tutto prima. Configurazione completa in Sorgenti nella barra laterale.",
  },
  "run-sort": {
    title: "Avvia ordinamento",
    body: "Quando sei pronto, avvia l'ordinamento. Rivedi le cartelle suggerite, modifica se serve, poi applica — copia o sposta secondo le Impostazioni.",
  },
  "results-tab": {
    title: "Risultati",
    body: "Dopo l'applicazione, sfoglia l'albero delle cartelle ordinate qui. Aggiorna se modifichi file fuori da Exo.",
  },
  "assistant-chat": {
    title: "Chat e voce",
    body: "Fai domande, detta compiti o chiedi aiuto per ordinare. Collega Gemini in Impostazioni → Agenti IA per chat e voce cloud.",
  },
  "sources-tab": {
    title: "Sorgenti",
    body: "Collega e gestisci Gmail, archiviazione cloud e altri account in un unico posto.",
  },
  "settings-output-folder": {
    title: "Cartella di output",
    body: "I file ordinati finiscono qui per impostazione predefinita — di solito Documenti/Exo Sorted Files. Modificabile in Impostazioni → Ordinamento file.",
  },
  "help-shortcuts": {
    title: "Aiuto e scorciatoie",
    body: "Apri Aiuto per scorciatoie e suggerimenti. Riavvia questo tour quando vuoi.",
  },
  "settings-models-overview": {
    title: "Modello locale di ordinamento",
    body: "Quando l'ordinamento gira su questo Mac, il modello testo è qui. Visione per scansioni è opzionale — aggiungila dopo se serve.",
  },
  "settings-system": {
    title: "Stato app",
    body: "Verifica che il servizio locale sia attivo e la lettura testo configurata. Se qualcosa è offline, riavvia il servizio o consulta Aiuto.",
  },
} as const;
