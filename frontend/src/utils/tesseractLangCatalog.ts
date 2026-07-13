/**
 * Standard Tesseract `*.traineddata` language codes (tessdata / tessdata_best).
 * `osd` and `equ` are special models — not used for text OCR; see `TESSERACT_OCR_SPECIAL_CODES`.
 */

export const TESSERACT_OCR_SPECIAL_CODES = new Set(["osd", "equ"]);

interface TessOcrLangEntry {
  code: string;
  label: string;
}

/** User-facing catalog (sorted by label). Install matching `.traineddata` for each code. */
export const TESSERACT_OCR_LANG_CATALOG: TessOcrLangEntry[] = [
  { code: "afr", label: "Afrikaans" },
  { code: "amh", label: "Amharic" },
  { code: "ara", label: "Arabic" },
  { code: "asm", label: "Assamese" },
  { code: "aze", label: "Azerbaijani" },
  { code: "azc", label: "Azerbaijani (Cyr.)" },
  { code: "bel", label: "Belarusian" },
  { code: "ben", label: "Bengali" },
  { code: "bod", label: "Tibetan" },
  { code: "bos", label: "Bosnian" },
  { code: "bre", label: "Breton" },
  { code: "bul", label: "Bulgarian" },
  { code: "cat", label: "Catalan" },
  { code: "ceb", label: "Cebuano" },
  { code: "ces", label: "Czech" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "chi_tra", label: "Chinese (Traditional)" },
  { code: "chr", label: "Cherokee" },
  { code: "cos", label: "Corsican" },
  { code: "cym", label: "Welsh" },
  { code: "dan", label: "Danish" },
  { code: "deu", label: "German" },
  { code: "div", label: "Dhivehi (Thaana)" },
  { code: "dzo", label: "Dzongkha" },
  { code: "ell", label: "Greek" },
  { code: "eng", label: "English" },
  { code: "enm", label: "Middle English" },
  { code: "epo", label: "Esperanto" },
  { code: "est", label: "Estonian" },
  { code: "eus", label: "Basque" },
  { code: "fao", label: "Faroese" },
  { code: "fas", label: "Persian" },
  { code: "fil", label: "Filipino" },
  { code: "fin", label: "Finnish" },
  { code: "fra", label: "French" },
  { code: "frm", label: "Middle French" },
  { code: "fry", label: "Frisian" },
  { code: "gla", label: "Scottish Gaelic" },
  { code: "gle", label: "Irish" },
  { code: "glg", label: "Galician" },
  { code: "grc", label: "Ancient Greek" },
  { code: "guj", label: "Gujarati" },
  { code: "hat", label: "Haitian Creole" },
  { code: "heb", label: "Hebrew" },
  { code: "hin", label: "Hindi" },
  { code: "hrv", label: "Croatian" },
  { code: "hun", label: "Hungarian" },
  { code: "hye", label: "Armenian" },
  { code: "iku", label: "Inuktitut" },
  { code: "ind", label: "Indonesian" },
  { code: "isl", label: "Icelandic" },
  { code: "ita", label: "Italian" },
  { code: "ita_old", label: "Italian (old)" },
  { code: "jav", label: "Javanese" },
  { code: "jpn", label: "Japanese" },
  { code: "kan", label: "Kannada" },
  { code: "kat", label: "Georgian" },
  { code: "kat_old", label: "Georgian (old)" },
  { code: "kaz", label: "Kazakh" },
  { code: "khm", label: "Khmer" },
  { code: "kir", label: "Kyrgyz" },
  { code: "kor", label: "Korean" },
  { code: "kur", label: "Kurdish" },
  { code: "lao", label: "Lao" },
  { code: "lat", label: "Latin" },
  { code: "lav", label: "Latvian" },
  { code: "lit", label: "Lithuanian" },
  { code: "ltz", label: "Luxembourgish" },
  { code: "mal", label: "Malayalam" },
  { code: "mar", label: "Marathi" },
  { code: "mkd", label: "Macedonian" },
  { code: "mlt", label: "Maltese" },
  { code: "mon", label: "Mongolian" },
  { code: "mri", label: "Maori" },
  { code: "msa", label: "Malay" },
  { code: "mya", label: "Myanmar (Burmese)" },
  { code: "nep", label: "Nepali" },
  { code: "nld", label: "Dutch" },
  { code: "nor", label: "Norwegian" },
  { code: "oci", label: "Occitan" },
  { code: "ori", label: "Oriya" },
  { code: "pan", label: "Punjabi" },
  { code: "pol", label: "Polish" },
  { code: "por", label: "Portuguese" },
  { code: "pus", label: "Pashto" },
  { code: "que", label: "Quechua" },
  { code: "ron", label: "Romanian" },
  { code: "rus", label: "Russian" },
  { code: "san", label: "Sanskrit" },
  { code: "sin", label: "Sinhala" },
  { code: "slk", label: "Slovak" },
  { code: "slv", label: "Slovenian" },
  { code: "snd", label: "Sindhi" },
  { code: "spa", label: "Spanish" },
  { code: "spa_old", label: "Spanish (old)" },
  { code: "sqi", label: "Albanian" },
  { code: "srp", label: "Serbian" },
  { code: "sun", label: "Sundanese" },
  { code: "swa", label: "Swahili" },
  { code: "swe", label: "Swedish" },
  { code: "syr", label: "Syriac" },
  { code: "tam", label: "Tamil" },
  { code: "tat", label: "Tatar" },
  { code: "tel", label: "Telugu" },
  { code: "tgk", label: "Tajik" },
  { code: "tha", label: "Thai" },
  { code: "tir", label: "Tigrinya" },
  { code: "ton", label: "Tongan" },
  { code: "tur", label: "Turkish" },
  { code: "uig", label: "Uyghur" },
  { code: "ukr", label: "Ukrainian" },
  { code: "urd", label: "Urdu" },
  { code: "uzb", label: "Uzbek" },
  { code: "uzb_cyrl", label: "Uzbek (Cyrillic)" },
  { code: "vie", label: "Vietnamese" },
  { code: "yid", label: "Yiddish" },
  { code: "yor", label: "Yoruba" },
]
  .filter((e) => !TESSERACT_OCR_SPECIAL_CODES.has(e.code))
  .sort((a, b) => a.label.localeCompare(b.label));

export const TESSERACT_OCR_CATALOG_CODES = new Set(TESSERACT_OCR_LANG_CATALOG.map((e) => e.code));

/**
 * Default OCR allowlist for new app profiles (Tesseract `*.traineddata` codes).
 * Covers common Western languages plus Chinese (Simplified), Russian, Korean, and Arabic.
 * Persisted `ocrLanguages: []` still means “use every text pack detected on this machine”.
 */
export const DEFAULT_OCR_TESSERACT_LANGUAGE_CODES: readonly string[] = [
  "fra",
  "eng",
  "ita",
  "spa",
  "chi_sim",
  "rus",
  "kor",
  "ara",
].filter((c) => TESSERACT_OCR_CATALOG_CODES.has(c));

const TESS_LABEL_BY_CODE = new Map(TESSERACT_OCR_LANG_CATALOG.map((e) => [e.code, e.label]));

/**
 * Human-readable name for a Tesseract language id (`bul` → "Bulgarian"). Unknown or
 * `script/…` ids get a light formatting fallback; the raw id stays available for tooltips.
 */
export function tessLangDisplayLabel(code: string): string {
  const raw = (code || "").trim();
  if (!raw) return code;
  const lower = raw.toLowerCase();
  const fromCatalog = TESS_LABEL_BY_CODE.get(lower);
  if (fromCatalog) return fromCatalog;
  if (lower.startsWith("script/")) {
    const rest = raw.slice("script/".length).replace(/([a-z])([A-Z])/g, "$1 $2");
    return rest.replace(/_/g, " ").trim() || raw;
  }
  return raw;
}

/** Installed `.traineddata` codes usable for text OCR (excludes `osd` / `equ`). */
export function textOcrPacksInstalled(installed?: string[] | null): string[] {
  if (!installed?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of installed) {
    const c = raw.trim().toLowerCase();
    if (!c || TESSERACT_OCR_SPECIAL_CODES.has(c)) continue;
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.sort();
}
