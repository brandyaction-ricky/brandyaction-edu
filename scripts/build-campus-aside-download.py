"""Build the public, credential-free Aside download from the portable bundle."""
from pathlib import Path
import base64
import json
import sys
import time
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
environment = sys.argv[1] if len(sys.argv) > 1 else "development"
if environment not in ("development", "production"):
    raise ValueError("Unknown campus environment")
target = root / "skills/packages" / f"moonshot-campus-report-{environment}.zip"
target.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    bundle = Path(tmp) / "moonshot-campus-report"
    subprocess.run(["node", root / "scripts/build-campus-aside-skill.mjs", bundle, environment], check=True)
    if len(sys.argv) > 2:
        if environment != 'production':
            raise ValueError("A public production gateway key belongs only in the production package")
        key = json.loads(Path(sys.argv[2]).read_text())['key']
        claims = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        if claims.get('role') != 'anon' or claims.get('ref') != 'qitqxizuwmmlhlcgsrqe' or claims.get('sub') or claims.get('exp', 0) < time.time():
            raise ValueError("Expected a current public anon key for the EDU production project")
        (bundle / 'scripts/gateway-public.json').write_text(json.dumps({'key': key}))
    with ZipFile(target, "w") as archive:
        for entry in sorted(bundle.rglob("*")):
            if entry.is_file():
                member = ZipInfo(entry.relative_to(tmp).as_posix())
                member.compress_type = ZIP_DEFLATED
                archive.writestr(member, entry.read_bytes())
