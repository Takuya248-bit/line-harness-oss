#!/bin/bash
cd /Users/kimuratakuya/line-harness/trending-topic-collector
/usr/bin/python3 -m src.main >> /tmp/trending-collector.log 2>&1
