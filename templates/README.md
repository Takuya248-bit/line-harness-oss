# LINE Harness Industry Template Packs

Pre-built template packs for common business types.
Each pack contains JSON files that can be loaded via the LINE Harness API using curl or the SDK.

## Packs

| Directory | Industry | Description |
|---|---|---|
| `english-school/` | English School | Consultation funnel, quote follow-up, A/B testing, survey, FAQ, rich menu |
| `restaurant/` | Restaurant | Reservation reminders, repeat visit, coupons, birthday messages |
| `beauty-salon/` | Beauty Salon | Booking flow, follow-up, rebooking, review requests |
| `ec-retail/` | EC / Retail | Cart abandonment, post-purchase review, repeat purchase |

## Usage

Each pack contains a `setup.sh` script that calls the API in the correct order.

```bash
# Set your API base URL and auth token
export API_BASE="https://your-line-harness.workers.dev"
export API_TOKEN="your-token"

# Run any pack
cd templates/english-school
bash setup.sh
```

Alternatively, import individual JSON files:

```bash
curl -X POST "$API_BASE/api/tags" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d @tags.json
```

## Customization

Each pack's JSON files contain `__PLACEHOLDER__` values that must be replaced before import.
Search for strings starting with `__` to find all customization points.
