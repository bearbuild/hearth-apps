# Travel Map setup

Travel Map stores its household-specific configuration in the app data folder,
not in the published app:

```text
.playground/local/visited-map/
```

Create that folder and add a `config.json` file:

```json
{
  "version": 1,
  "people": [
    {
      "id": "alex",
      "name": "Alex",
      "color": "#3b82f6",
      "short": "A",
      "emoji": "👤",
      "email": "alex@example.invalid"
    },
    {
      "id": "sam",
      "name": "Sam",
      "color": "#ec4899",
      "short": "S",
      "emoji": "👤"
    }
  ]
}
```

For each family member, configure:

- `id` — a unique, stable lowercase identifier.
- `name` — the display name.
- `color` — a CSS hex color for that person's map markers.
- `short` — a short label, usually an initial.
- `emoji` — the person's avatar.
- `email` — optional Google account email, used for identity-based map defaults.

The only required setup file is `config.json`. Travel Map creates its travel
data file automatically when data is first saved. Existing travel data can be
placed at:

```text
.playground/local/visited-map/data.json
```

Keep the `people` list in `config.json`, rather than in `data.json`.
