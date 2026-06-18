from __future__ import annotations

import logging
import tempfile
import types
from pathlib import Path

import boto3
from botocore.config import Config as BotoConfig

from app.config import settings

logger = logging.getLogger("minigrid.documents")

SRC_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "src"


class _AttrDict(dict):
    """Dict subclass that supports attribute access for template compatibility."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)

    def __setattr__(self, name, value):
        self[name] = value


def _dict_to_attrdict(obj):
    """Recursively convert dicts to AttrDict for both attribute and dict access."""
    if isinstance(obj, dict):
        return _AttrDict({k: _dict_to_attrdict(v) for k, v in obj.items()})
    if isinstance(obj, list):
        return [_dict_to_attrdict(item) for item in obj]
    return obj


def _get_s3_client():
    if not settings.r2_endpoint_url:
        return None
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )


def generate_documents(
    site_data_dict: dict,
    adapter_outputs: dict,
    site_name: str,
    output_dir: str,
) -> dict[str, Path]:
    """Generate PFS documents (Markdown + DOCX). Returns {format: path}.

    Caller must provide an output_dir that persists long enough
    for the files to be read/uploaded after this function returns.
    """
    from src.generator.pfs_generator import PFSGenerator
    from src.models.site import SiteData, CustomerSegment, AnchorLoad, GridArrivalEvidence, ExistingPFSMetrics
    from src.orchestrator import PipelineContext

    data = dict(site_data_dict)
    customers = [CustomerSegment(**c) for c in data.pop("customers", [])]
    anchors = [AnchorLoad(**a) for a in data.pop("anchors", [])]
    grid_evidence = GridArrivalEvidence(**data.pop("grid_arrival_evidence", {}))
    existing_pfs = ExistingPFSMetrics(**data.pop("existing_pfs", {}))
    coords = data.pop("coordinates", [0.0, 0.0])
    data.pop("tariff_scenarios", None)
    data.pop("financing_structure", None)

    site_data = SiteData(
        customers=customers,
        anchors=anchors,
        grid_arrival_evidence=grid_evidence,
        existing_pfs=existing_pfs,
        coordinates=tuple(coords),
        **data,
    )

    ctx = PipelineContext(site_data)
    for name, output in adapter_outputs.items():
        ctx.set_output(name, _dict_to_attrdict(output))

    generator = PFSGenerator()
    md_path_str = generator.generate(site_data, ctx, output_dir)
    md_path = Path(md_path_str)

    result = {}
    if md_path.exists():
        result["markdown"] = md_path

    docx_candidate = md_path.with_suffix(".docx")
    if docx_candidate.exists():
        result["docx"] = docx_candidate

    return result


def upload_to_r2(local_path: Path, storage_key: str) -> bool:
    """Upload a file to R2. Returns True on success."""
    client = _get_s3_client()
    if not client:
        logger.warning("R2 not configured, skipping upload")
        return False

    try:
        client.upload_file(
            str(local_path),
            settings.r2_bucket_name,
            storage_key,
        )
        return True
    except Exception:
        logger.exception(f"Failed to upload {storage_key}")
        return False


def generate_presigned_url(storage_key: str, expires_in: int = 900) -> str | None:
    """Generate a presigned download URL for a document in R2."""
    client = _get_s3_client()
    if not client:
        return None

    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": storage_key,
            },
            ExpiresIn=expires_in,
        )
        return url
    except Exception:
        logger.exception(f"Failed to generate presigned URL for {storage_key}")
        return None


def save_local(local_path: Path, storage_key: str) -> Path:
    """Save document locally when R2 is not configured (dev mode)."""
    local_storage = Path("document_storage")
    dest = local_storage / storage_key
    dest.parent.mkdir(parents=True, exist_ok=True)

    import shutil
    shutil.copy2(local_path, dest)
    return dest
