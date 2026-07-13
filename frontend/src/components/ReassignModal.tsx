import { useMemo, useState } from "react";
import type { FileEntry, FolderNode } from "../api";
import ModalShell from "./ModalShell";
import UnsavedChangesDialog from "./UnsavedChangesDialog";
import { flattenFolderRelPaths } from "../utils/flattenFolderTree";
import { useI18n } from "../i18n/I18nContext";

interface ReassignModalProps {
  file: FileEntry;
  existingFolders: FolderNode[];
  onReassign: (file: FileEntry, newFolder: string) => void;
  onClose: () => void;
}

export default function ReassignModal({ file, existingFolders, onReassign, onClose }: ReassignModalProps) {
  const { t } = useI18n();
  const initialEffective = file.final_folder ?? file.suggested_folder ?? "";
  const [selected, setSelected] = useState(initialEffective);
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const folderOptions = useMemo(() => flattenFolderRelPaths(existingFolders), [existingFolders]);

  const finalFolder = useCustom ? custom.trim() : selected;
  const isDirty = finalFolder !== initialEffective;

  const handleConfirm = () => {
    if (!finalFolder) return;
    onReassign(file, finalFolder);
    onClose();
  };

  const tryClose = () => {
    if (isDirty) setLeaveConfirmOpen(true);
    else onClose();
  };

  return (
    <>
    <ModalShell
      title={t("reassign.title")}
      onClose={tryClose}
      maxWidthClass="max-w-sm"
      footer={(
        <div className="flex justify-end gap-3">
          <button onClick={tryClose} className="px-3 py-2 rounded-lg text-sm text-muted hover:text-text-primary transition-colors">
            {t("reassign.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!finalFolder}
            className="px-4 py-2 rounded-lg bg-button-primary hover:bg-button-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {t("reassign.moveHere")}
          </button>
        </div>
      )}
    >

        {/* File name */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-muted mb-1">{t("reassign.fileLabel")}</p>
          <p className="text-sm font-medium text-text-primary truncate" title={file.name}>{file.name}</p>
        </div>

        {/* Folder options */}
        <div className="px-5 pb-4 space-y-3">
          {/* Existing folders */}
          {folderOptions.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-2">{t("reassign.chooseExisting")}</p>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {folderOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setSelected(opt.value);
                      setUseCustom(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors
                      ${!useCustom && selected === opt.value
                        ? "bg-button-primary text-white"
                        : "bg-bg-secondary text-text-primary hover:bg-hover-overlay"
                      }`}
                  >
                    <span>📁</span>
                    <span className="truncate" title={opt.label}>
                      {opt.label}
                    </span>
                    <span className="ml-auto text-xs opacity-60 shrink-0">
                      {t("reassign.fileCount", { count: String(opt.fileCount) })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom folder name */}
          <div>
            <p className="text-xs text-muted mb-2">{t("reassign.orCreateNew")}</p>
            <input
              type="text"
              placeholder={t("reassign.customPlaceholder")}
              value={custom}
              onChange={e => { setCustom(e.target.value); setUseCustom(true); }}
              onFocus={() => setUseCustom(true)}
              className={`w-full bg-bg-secondary border rounded-lg px-3 py-2 text-sm text-text-primary 
                focus:outline-none placeholder:text-muted transition-colors
                ${useCustom ? "border-accent" : "border-border"}`}
            />
          </div>
        </div>

    </ModalShell>

    <UnsavedChangesDialog
      open={leaveConfirmOpen}
      title={t("reassign.discardTitle")}
      message={t("reassign.discardMessage")}
      cancelLabel={t("reassign.discardKeepEditing")}
      discardLabel={t("reassign.discardClose")}
      showSave={false}
      onCancel={() => setLeaveConfirmOpen(false)}
      onDiscard={() => {
        setLeaveConfirmOpen(false);
        onClose();
      }}
    />
    </>
  );
}
