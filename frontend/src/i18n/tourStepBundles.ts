import { tourDe } from "./tourDe";
import { tourIt } from "./tourIt";

/**
 * Guided tour copy per UI locale. EN/FR inline; DE/IT in `tourDe.ts` / `tourIt.ts`. Keys must match across locales
 * (see `tourStepParity.test.ts`).
 */
export const tourStepBundles = {
  en: {
    intro: {
      title: "Welcome to Exo",
      body: "Exo sorts your files into the right folders with minimal setup. This short tour shows where to add files, review suggestions, and get help. Skip anytime.",
    },
    "sort-flow-strip": {
      title: "How sorting works",
      body: "A quick intro to sorting on this tab. Open Help here for folder grouping, rules, and sources — or start the guided tour.",
    },
    "sort-tab": {
      title: "Sort files",
      body: "Your home base for organizing documents. Everything you sort starts here.",
    },
    "workspace-local": {
      title: "This computer",
      body: "Drag files or folders here, or click to browse. Exo reads contents and suggests where each item belongs.",
    },
    "external-sources": {
      title: "Mail & cloud",
      body: "Connect Gmail, Drive, Dropbox, and more — sort from inboxes and cloud folders without downloading everything first. Full account setup lives under Sources in the sidebar.",
    },
    "run-sort": {
      title: "Run sort",
      body: "When you're ready, run sort. Review the suggested folders, tweak if needed, then apply — copies or moves follow your Settings.",
    },
    "results-tab": {
      title: "Results",
      body: "After you apply, browse your sorted folder tree here. Refresh if you change files outside Exo.",
    },
    "assistant-chat": {
      title: "Chat & voice",
      body: "Ask questions, dictate tasks, or get help sorting. Connect Gemini under Settings → AI agents for cloud chat and voice.",
    },
    "sources-tab": {
      title: "Sources",
      body: "Connect and manage Gmail, cloud storage, and other accounts in one place.",
    },
    "settings-output-folder": {
      title: "Output folder",
      body: "Sorted files land here by default — usually Documents/Exo Sorted Files. Change it anytime under Settings → File sorting.",
    },
    "help-shortcuts": {
      title: "Help & shortcuts",
      body: "Open Help for keyboard shortcuts and tips. Start this tour again whenever you like.",
    },
    "settings-models-overview": {
      title: "Local sort model",
      body: "When sorting runs on this Mac, your text model lives here. Vision for scans is optional — add it later if you need it.",
    },
    "settings-system": {
      title: "App status",
      body: "Check that the local service is running and text reading is set up. If something's offline, restart the service or see Help.",
    },
  },
  fr: {
    intro: {
      title: "Bienvenue dans Exo",
      body: "Exo range vos fichiers dans les bons dossiers avec peu de configuration. Cette visite courte montre où ajouter des fichiers, relire les suggestions et trouver de l'aide. Ignorer à tout moment.",
    },
    "sort-flow-strip": {
      title: "Comment fonctionne le tri",
      body: "Une courte intro au tri sur cet onglet. Ouvrez Aide pour le regroupement, les règles et les sources — ou lancez la visite guidée.",
    },
    "sort-tab": {
      title: "Trier les fichiers",
      body: "Votre point de départ pour organiser les documents. Tout le tri commence ici.",
    },
    "workspace-local": {
      title: "Cet ordinateur",
      body: "Glissez-déposez des fichiers ou dossiers, ou cliquez pour parcourir. Exo lit le contenu et propose un dossier pour chaque élément.",
    },
    "external-sources": {
      title: "Mail et cloud",
      body: "Connectez Gmail, Drive, Dropbox, etc. — triez depuis les boîtes mail et dossiers cloud sans tout télécharger d'abord. La configuration complète est sous Sources dans la barre latérale.",
    },
    "run-sort": {
      title: "Lancer le tri",
      body: "Quand vous êtes prêt, lancez le tri. Relisez les dossiers proposés, ajustez si besoin, puis appliquez — copie ou déplacement selon vos réglages.",
    },
    "results-tab": {
      title: "Résultats",
      body: "Après application, parcourez l'arborescence triée ici. Actualisez si vous modifiez des fichiers en dehors d'Exo.",
    },
    "assistant-chat": {
      title: "Chat et voix",
      body: "Posez des questions, dictez des tâches ou demandez de l'aide pour trier. Connectez Gemini dans Réglages → Agents IA pour le chat et la voix cloud.",
    },
    "sources-tab": {
      title: "Sources",
      body: "Connectez et gérez Gmail, stockage cloud et autres comptes au même endroit.",
    },
    "settings-output-folder": {
      title: "Dossier de sortie",
      body: "Les fichiers triés arrivent ici par défaut — souvent Documents/Exo Sorted Files. Modifiable à tout moment sous Réglages → Tri de fichiers.",
    },
    "help-shortcuts": {
      title: "Aide et raccourcis",
      body: "Ouvrez l'aide pour les raccourcis et astuces. Relancez cette visite quand vous voulez.",
    },
    "settings-models-overview": {
      title: "Modèle local de tri",
      body: "Quand le tri s'exécute sur ce Mac, votre modèle texte se trouve ici. La vision pour les scans est optionnelle — ajoutez-la plus tard si besoin.",
    },
    "settings-system": {
      title: "État de l'app",
      body: "Vérifiez que le service local tourne et que la lecture de texte est configurée. Si quelque chose est hors ligne, redémarrez le service ou consultez l'aide.",
    },
  },
  de: tourDe,
  it: tourIt,
} as const;
