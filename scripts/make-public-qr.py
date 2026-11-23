#!/usr/bin/env python3
"""Generate the public onboarding QR only after the real HTTPS deployment URL is known."""
import sys
from pathlib import Path
from urllib.parse import urlparse
import qrcode
if len(sys.argv) < 2:
    raise SystemExit('Usage: python scripts/make-public-qr.py https://your-app.pages.dev [output.png]')
url=sys.argv[1].rstrip('/')+'/'
parsed=urlparse(url)
if parsed.scheme!='https' or not parsed.hostname:
    raise SystemExit('The production registration URL must be HTTPS.')
out=Path(sys.argv[2] if len(sys.argv)>2 else 'public-registration-qr.png')
qr=qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
qr.add_data(url);qr.make(fit=True);qr.make_image(fill_color='#183b31',back_color='white').save(out)
print('Created:',out.resolve(), '->', url)
