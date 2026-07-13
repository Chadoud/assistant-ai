#!/usr/bin/env bash
# Shared Infomaniak Web hosting FTP helpers (datasuite, marketing).
# Node.js api.exosites.ch uses SSH — see scripts/deploy-cloud-api.sh.

infomaniak_ftp_load_env() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    echo "Missing ${env_file}" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  FTP_HOST="${FTP_HOST:-YOUR_IK_ID.ftp.infomaniak.com}"
  : "${FTP_USER:?Set FTP_USER in ${env_file}}"
  : "${FTP_PASSWORD:?Set FTP_PASSWORD in ${env_file}}"
  REMOTE_PATH="${REMOTE_PATH:-sites/datasuite.exosites.ch}"
  REMOTE_PATH="${REMOTE_PATH#./}"
  REMOTE_PATH="${REMOTE_PATH%/}"
}

infomaniak_ftp_assert_datasuite_path() {
  local path="$1"
  if [[ "$path" != *datasuite.exosites.ch* ]]; then
    echo "Refusing deploy: REMOTE_PATH must target datasuite.exosites.ch (got: ${path})" >&2
    return 1
  fi
  if [[ "$path" == *api.exosites.ch* ]]; then
    echo "Refusing deploy: api.exosites.ch is Node.js — use deploy-cloud-api.sh" >&2
    return 1
  fi
}

infomaniak_ftp_list() {
  local remote_path="$1"
  curl -sS --ftp-pasv -u "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_HOST}/${remote_path}" --list-only
}

infomaniak_ftp_upload() {
  local local_file="$1"
  local remote_file="$2"
  curl -sS --ftp-create-dirs --ftp-pasv \
    -u "${FTP_USER}:${FTP_PASSWORD}" \
    -T "${local_file}" \
    "ftp://${FTP_HOST}/${remote_file}"
}

infomaniak_ftp_upload_tree() {
  local local_dir="$1"
  local remote_prefix="$2"
  local file rel remote
  while IFS= read -r -d '' file; do
    rel="${file#${local_dir}/}"
    remote="${remote_prefix}/${rel}"
    echo "  → ${remote}"
    infomaniak_ftp_upload "$file" "$remote"
  done < <(find "$local_dir" -type f -print0)
}

infomaniak_ftp_delete_file() {
  local remote_file="$1"
  curl -sS --ftp-pasv -u "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_HOST}/" -Q "DELE ${remote_file}" >/dev/null 2>&1 || true
}

infomaniak_ftp_remove_dir() {
  local remote_dir="$1"
  curl -sS --ftp-pasv -u "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_HOST}/" -Q "RMD ${remote_dir}" >/dev/null 2>&1 || true
}

infomaniak_ftp_delete() {
  infomaniak_ftp_delete_file "$1"
}

infomaniak_ftp_remove_tree() {
  local remote_dir="$1"
  remote_dir="${remote_dir#./}"
  remote_dir="${remote_dir%/}"

  local name child
  while IFS= read -r name; do
    [[ -z "$name" || "$name" == "." || "$name" == ".." ]] && continue
    child="${remote_dir}/${name}"
    if infomaniak_ftp_list "${child}/" >/dev/null 2>&1; then
      infomaniak_ftp_remove_tree "$child"
      infomaniak_ftp_remove_dir "$child"
    else
      infomaniak_ftp_delete_file "$child"
    fi
  done < <(infomaniak_ftp_list "${remote_dir}/" || true)

  infomaniak_ftp_remove_dir "$remote_dir"
}
