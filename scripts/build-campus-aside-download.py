"""Build the public, credential-free Aside download from the portable bundle."""
from pathlib import Path
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
target = root / "public/campus/downloads/moonshot-campus-report.zip"
with tempfile.TemporaryDirectory() as tmp:
    bundle = Path(tmp) / "moonshot-campus-report"
    subprocess.run(["node", root / "scripts/build-campus-aside-skill.mjs", bundle], check=True)
    with ZipFile(target, "w") as archive:
        for entry in sorted(bundle.rglob("*")):
            if entry.is_file():
                member = ZipInfo(entry.relative_to(tmp).as_posix())
                member.compress_type = ZIP_DEFLATED
                archive.writestr(member, entry.read_bytes())
