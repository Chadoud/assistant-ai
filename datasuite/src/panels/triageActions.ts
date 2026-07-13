import { updateCrashTriage } from "../api";
import { el, sectionTitle } from "../dom";

const TRIAGE_STATUSES = [
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "fixed", label: "Fixed" },
  { value: "wontfix", label: "Won't fix" },
] as const;

function statusLabel(value: string): string {
  return TRIAGE_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function bindTriageRows(
  container: HTMLElement,
  triage: Array<Record<string, unknown>>,
): void {
  const table = container.querySelector(".triage-table");
  if (!table) return;

  table.querySelectorAll("tbody tr").forEach((tr, i) => {
    const row = triage[i];
    const signature = String(row?.crash_signature ?? "");
    if (!signature) return;

    const statusCell = tr.querySelector("td[data-triage-status]");
    if (!statusCell) return;

    const select = document.createElement("select");
    select.className = "triage-status-select";
    for (const opt of TRIAGE_STATUSES) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === String(row?.status ?? "new")) o.selected = true;
      select.append(o);
    }

    const fixedInput = document.createElement("input");
    fixedInput.type = "text";
    fixedInput.className = "triage-fixed-input";
    fixedInput.placeholder = "Version";
    fixedInput.value = String(row?.fixed_in_version ?? "");
    fixedInput.hidden = select.value !== "fixed";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "triage-save-btn";
    save.textContent = "Save";
    save.title = "Update triage status";

    const msg = el("span", "triage-msg");

    select.addEventListener("change", () => {
      fixedInput.hidden = select.value !== "fixed";
      msg.textContent = "";
    });

    save.addEventListener("click", async () => {
      save.disabled = true;
      msg.textContent = "Saving…";
      msg.className = "triage-msg";
      try {
        const result = await updateCrashTriage({
          crash_signature: signature,
          status: select.value,
          fixed_in_version: select.value === "fixed" ? fixedInput.value.trim() : undefined,
        });
        if (result.error) {
          msg.textContent = result.error;
          msg.className = "triage-msg triage-msg-error";
          return;
        }
        msg.textContent = "Saved";
        msg.className = "triage-msg triage-msg-ok";
        if (result.row?.fixed_in_version != null) {
          fixedInput.value = String(result.row.fixed_in_version);
        }
      } catch {
        msg.textContent = "Save failed";
        msg.className = "triage-msg triage-msg-error";
      } finally {
        save.disabled = false;
      }
    });

    statusCell.replaceChildren(select, fixedInput, save, msg);
  });
}

export function renderTriageSection(
  container: HTMLElement,
  triage: Array<Record<string, unknown>>,
): void {
  if (triage.length === 0) return;

  container.append(sectionTitle("Crash triage backlog — update status inline"));
  const table = el("table", "data-table triage-table");
  const thead = el("thead");
  const headRow = el("tr");
  for (const h of ["Signature", "Status", "Crashes 30d", "Last crash", "Notes"]) {
    headRow.append(el("th", "", h));
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");
  for (const t of triage) {
    const tr = el("tr");
    tr.append(el("td", "triage-signature", String(t.crash_signature ?? "").slice(0, 16)));
    const statusTd = el("td");
    statusTd.setAttribute("data-triage-status", "1");
    statusTd.textContent = statusLabel(String(t.status ?? "new"));
    tr.append(statusTd);
    tr.append(el("td", "", String(t.crashes_30d ?? "0")));
    tr.append(el("td", "", String(t.last_crash ?? "").slice(0, 16)));
    tr.append(el("td", "triage-notes", String(t.notes ?? "—")));
    tbody.append(tr);
  }
  table.append(tbody);
  container.append(table);
  bindTriageRows(container, triage);
}
