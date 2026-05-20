#!/bin/bash
curl -X POST -H "Content-Type: application/json" \
  --data @$(dirname $0)/crm-connector.json \
  http://localhost:8083/connectors