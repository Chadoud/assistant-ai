/** Bundled example structure packs under ``public/structure-packs/``. */
export const BUNDLED_STRUCTURE_PACKS = [
  { file: "client-project-v1.json", labelKey: "settings.sortStructure.presetClientProject" },
  { file: "vendor-documents-v1.json", labelKey: "settings.sortStructure.presetVendorDocs" },
  {
    file: "real-estate-country-property-subject-v1.json",
    labelKey: "settings.sortStructure.presetRealEstateSubject",
  },
  { file: "real-estate-country-property-v1.json", labelKey: "settings.sortStructure.presetRealEstateLegacy" },
  { file: "personal-finance-v1.json", labelKey: "settings.sortStructure.presetFinance" },
] as const;
