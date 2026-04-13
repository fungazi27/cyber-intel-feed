#!/usr/bin/env/ bash
set -euo pipefall

cd "$(dirname "$0")/../backend"
source .cti_feed/bin/activate
python rss_aggregator.py