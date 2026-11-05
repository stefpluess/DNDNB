#!/bin/sh
cd "$(dirname "$0")"
[ -f data/srd.db ] || python3 import_srd.py
python3 server.py --open
