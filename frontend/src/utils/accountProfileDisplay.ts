import type { EntitlementStatus } from "../api";

function trim(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Full name from cloud account fields, when both parts are present.
 */
export function accountFullName(entitlement: EntitlementStatus | null | undefined): string {
  const firstName = trim(entitlement?.cloudFirstName);
  const lastName = trim(entitlement?.cloudLastName);
  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  if (lastName) return lastName;
  return "";
}

/**
 * Primary label for signed-in account UI — name when known, otherwise email.
 */
export function accountDisplayLabel(entitlement: EntitlementStatus | null | undefined): string {
  const name = accountFullName(entitlement);
  if (name) return name;
  return trim(entitlement?.cloudEmail);
}

/**
 * Avatar initials from account name, falling back to the email local-part.
 */
export function accountAvatarInitials(entitlement: EntitlementStatus | null | undefined): string {
  const firstName = trim(entitlement?.cloudFirstName);
  const lastName = trim(entitlement?.cloudLastName);
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
  if (firstName) return firstName.charAt(0).toUpperCase();
  if (lastName) return lastName.charAt(0).toUpperCase();

  const email = trim(entitlement?.cloudEmail);
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

/**
 * Tooltip/title text — include email when a separate display name is shown.
 */
export function accountProfileTitle(entitlement: EntitlementStatus | null | undefined): string {
  const label = accountDisplayLabel(entitlement);
  const email = trim(entitlement?.cloudEmail);
  if (label && email && label !== email) return `${label} · ${email}`;
  return label || email;
}
