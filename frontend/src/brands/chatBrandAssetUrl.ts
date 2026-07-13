import { publicAssetUrl } from "../constants";

/** Brand logo URL for assistant chat (packaged Electron-safe). */
export function chatBrandAssetUrl(relativeUnderBrands: string): string {
  const trimmed = relativeUnderBrands.replace(/^\/+/, "").replace(/^brands\//, "");
  return publicAssetUrl(`brands/${trimmed}`);
}
