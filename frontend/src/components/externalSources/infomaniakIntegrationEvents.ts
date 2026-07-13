/** Fired after kDrive connect/disconnect so workspace and sibling cards refresh. */
export const INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT = "exosites:infomaniak-integration-changed";

/** Fired after Infomaniak Calendar connect/disconnect. */
export const INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT = "exosites-infomaniak-calendar-integration-changed";

export function notifyInfomaniakDriveIntegrationChanged() {
  window.dispatchEvent(new CustomEvent(INFOMANIAK_DRIVE_INTEGRATION_CHANGED_EVENT));
}

export function notifyInfomaniakCalendarIntegrationChanged() {
  window.dispatchEvent(new CustomEvent(INFOMANIAK_CALENDAR_INTEGRATION_CHANGED_EVENT));
}

export function notifyInfomaniakAllIntegrationsChanged() {
  notifyInfomaniakDriveIntegrationChanged();
  notifyInfomaniakCalendarIntegrationChanged();
}
