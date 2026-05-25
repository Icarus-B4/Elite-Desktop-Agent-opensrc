"""@deprecated Use setup_hermes / yarn migrate:hermes — Mission Control → Hermes Agent."""

import os
import sys

print("setup_mc.py ist veraltet. Bitte ausführen:")
print("  yarn migrate:hermes")
print("  hermes gateway start")
print("Siehe docs/HERMES_INTEGRATION.md")

if __name__ == "__main__":
    script = os.path.join(os.path.dirname(__file__), "..", "scripts", "migrate-elite-to-hermes.mjs")
    if os.path.isfile(script):
        os.system(f'node "{script}"')
    sys.exit(0)
