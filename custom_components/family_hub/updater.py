"""Self-update: install a new version of this integration from an uploaded zip file, without needing file-manager/SSH access to the Home Assistant host."""
from __future__ import annotations

import base64
import binascii
import io
import json
import os
import shutil
import tempfile
import zipfile

# Generous headroom over the ~200KB this integration actually is - big enough for years of growth
MAX_ZIP_BYTES = 20 * 1024 * 1024
# Cheap zip-bomb guard: cap total *uncompressed* size too, independent of
# the compressed upload size.
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024


class UpdateError(Exception):
    """Raised for any problem with an uploaded update package.

    The current install is never touched until every validation step here
    has passed, so raising this always leaves Family Hub exactly as it was.
    """


def decode_update_zip(zip_b64: str) -> bytes:
    """Decode + size-check a base64-encoded zip payload from the panel."""
    if not zip_b64 or not isinstance(zip_b64, str):
        raise UpdateError("No file was uploaded.")
    try:
        raw = base64.b64decode(zip_b64, validate=True)
    except (binascii.Error, ValueError) as err:
        raise UpdateError("The uploaded file isn't valid base64 data.") from err
    if not raw:
        raise UpdateError("The uploaded file is empty.")
    if len(raw) > MAX_ZIP_BYTES:
        raise UpdateError(
            f"The uploaded file is too large ({len(raw)} bytes, max {MAX_ZIP_BYTES})."
        )
    return raw


def _check_member_name(name: str) -> None:
    """Reject any zip entry that could escape the extraction directory."""
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or ":" in normalized:
        raise UpdateError(f"Refusing to extract unsafe path in update package: {name}")
    parts = [p for p in normalized.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise UpdateError(f"Refusing to extract unsafe path in update package: {name}")


def _extract_to_temp(zip_bytes: bytes, temp_dir: str) -> str:
    """Extract the zip into temp_dir, return the path to its family_hub/ root."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as err:
        raise UpdateError("The uploaded file isn't a valid zip archive.") from err

    with zf:
        infos = zf.infolist()
        if not infos:
            raise UpdateError("The uploaded zip is empty.")
        total_uncompressed = 0
        for info in infos:
            _check_member_name(info.filename)
            total_uncompressed += info.file_size
        if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
            raise UpdateError("The uploaded zip is suspiciously large once extracted - refusing to install it.")
        zf.extractall(temp_dir)

    # Accept either family_hub/ at the zip root (how family_hub_vN.zip is
    # built) or the integration's files directly at the zip root.
    candidate = os.path.join(temp_dir, "family_hub")
    if os.path.isdir(candidate) and os.path.isfile(os.path.join(candidate, "manifest.json")):
        return candidate
    if os.path.isfile(os.path.join(temp_dir, "manifest.json")):
        return temp_dir
    raise UpdateError("The uploaded zip doesn't look like a Family Hub package (no manifest.json found).")


def _validate_manifest(source_dir: str) -> dict:
    manifest_path = os.path.join(source_dir, "manifest.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except (OSError, ValueError) as err:
        raise UpdateError("Could not read manifest.json in the uploaded package.") from err
    if manifest.get("domain") != "family_hub":
        raise UpdateError(
            f"This doesn't look like a Family Hub update (manifest domain is {manifest.get('domain')!r})."
        )
    return manifest


def install_update_from_zip(integration_dir: str, zip_bytes: bytes, backup_root: str | None = None) -> dict:
    """Validate and install an update package over the live integration_dir."""
    integration_dir = os.path.normpath(integration_dir)
    components_dir = os.path.dirname(integration_dir)  # .../custom_components
    if backup_root is None:
        config_root = os.path.dirname(components_dir)
        backup_root = os.path.join(config_root, "family_hub_backups")

    # Extraction happens in the OS temp directory, not inside custom_components/
    temp_dir = tempfile.mkdtemp(prefix="family_hub_update_")
    try:
        source_dir = _extract_to_temp(zip_bytes, temp_dir)
        manifest = _validate_manifest(source_dir)

        os.makedirs(backup_root, exist_ok=True)
        backup_dir = os.path.join(backup_root, "family_hub_backup")
        if os.path.isdir(integration_dir):
            if os.path.isdir(backup_dir):
                shutil.rmtree(backup_dir)
            shutil.copytree(integration_dir, backup_dir)

        # Copy new files in over the existing install rather than wiping the target directory first
        for root, _dirs, files in os.walk(source_dir):
            rel = os.path.relpath(root, source_dir)
            target_root = integration_dir if rel == "." else os.path.join(integration_dir, rel)
            os.makedirs(target_root, exist_ok=True)
            for fname in files:
                shutil.copy2(os.path.join(root, fname), os.path.join(target_root, fname))

        return {"version": manifest.get("version", "unknown"), "backup_dir": backup_dir}
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
