# Route registry

`data/trade-routes.json` is Atlas's route registry: trade roads, pilgrimage and Bible roads,
military roads, river and sea routes. It is a JSON array with one object per route. It grows as
routes come up; each one is authored by Atlas from open sources and carries its own short
explanation. Links name a route by its `id` (`route=` in `docs/link-format.md`).

Check the file with `node tools/check-routes.mjs` (add `--active -950 tyre-jerusalem levant-red-sea`
to check that routes are in use in a given year). It exits 1 on any failure.

## Licence and authoring rules

- Routes are **Atlas-authored, CC BY 4.0**, credited in *About & data*.
- Geometry is drawn **by hand**, from general knowledge and open CORE sources: Pleiades (CC BY 3.0)
  for places and coordinates, Wikidata (CC0), GeoNames (CC BY 4.0). Never traced from ORBIS
  (NC-SA), DARE (SA), a copyrighted atlas or a map in a book.
- Explanations (`summary`) are written fresh, in Atlas's own words. Wikipedia (CC BY-SA) may be
  read for facts but never copied or closely paraphrased.
- **Books (Paul's rule, 2026-11-09).** Nothing comes from Shelf automatically. **Any bite** that
  Paul brings across by hand may be used as route text, whatever its book's copyright status, or
  may inform Atlas's own wording. Either way the explanation stays about the route, the facts are
  checked against open sources, and the book is named in `sources` (`book: true`) with whose
  wording it is (`text`) and whether the bite went in unchanged (`unchanged`).
  - Recommendation, not a rule: when the book is still in copyright, offer Paul an Atlas rewording
    first. If the bite goes in unchanged, `unchanged: true` (with `copyright: "in-copyright"`)
    lets API and export builds leave that text out.
- **Aggregate, never interpret.** Where a place is disputed, the waypoint lists every sourced
  candidate and the line does not pick one. Where a destination is unknown, the line ends open,
  short of any claimed site. Tradition is kept apart from archaeology in `summary` and `sources`.

## Fields

The first seven fields are the original format and stay exactly as they are. Everything after
them is optional, so a route with only the original fields is still valid, and code that reads
only the original fields keeps working.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable kebab-case id. Never renamed once published: links and Shelf point at it. |
| `name` | string | Display name. |
| `from`, `to` | integer | Years the route was in use; negative = BCE (−950 is 950 BCE). Inclusive. Within the timeline (−3000..2025). Why these years is written in `sources`. |
| `color` | string | CSS colour of the line. |
| `summary` | string | The route's short explanation, 2–4 sentences, about the route and not about a book. |
| `points` | `[lng, lat][]` | The line, in order. **Longitude first.** Enough points that a sea route stays on water and a land route on land. The order is the direction of travel as told (outbound); whether goods also moved back is in `summary`. |
| `kind` | string | `trade`, `pilgrimage`, `military`, `migration`, `exploration` or `postal`. Add a new kind here and in the validator. |
| `mode` | string | `sea`, `land` or `river`. Rendering: sea routes are drawn dashed. |
| `goods` | string[] | What the sources say travelled along it, in either direction. People (envoys, craftsmen) go in `summary`, not here. |
| `certainty` | string | How strong the evidence is (below). |
| `waypoints` | object[] | Named stops along the line, in order (below). |
| `sources` | object[] | What was consulted and what for (below). |

### `certainty`

| Value | Meaning |
|---|---|
| `attested` | Use in these years is supported by evidence from the time (inscriptions, documents, archaeology), and the line follows known stops. |
| `schematic` | Use is recorded in the sources, but no source gives the exact line, so it is drawn approximately between real stops. What kind of record it is (evidence from the time, or a later text only) is said in `summary` and `sources`. |
| `legendary` | Known only from myth, legend or saga (for example the Argonauts' voyage), not from any historical record. This says nothing about whether it happened. Kept for future routes; no route uses it yet. |

### `waypoints[]`

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Display name. For a disputed or unknown place the name says so, for example "Ezion-Geber (site disputed)" or "towards Ophir (location unknown)". |
| `lat`, `lng` | number | Where the stop sits **on the line** (the validator allows 25 km). For a disputed place this is a neutral point, not a claimed site; `note` says so. |
| `place` | string | Optional open gazetteer id, `src:id`, with `src` one of `pleiades`, `geonames`, `wikidata`, `atlas` (the link-format id rule). Checked at the source before it is added. |
| `note` | string | Optional. Why the point is where it is, or what is disputed. |
| `candidates` | object[] | Optional, at least two. The sourced options for a disputed or unknown place: `{ name, lat?, lng?, place?, note? }`. Coordinates only when a candidate is a site; a region ("Southern Arabia") has none. Rendering may show sited candidates as linked faint pins. |
| `open` | boolean | Optional. `true` marks an open end: the last waypoint, equal to the last point, where the line stops short of an unknown destination. Rendering should show it as visibly uncertain (for example fading out), never as a place. |

### `sources[]`

| Field | Type | Meaning |
|---|---|---|
| `title` | string | The source (passage, record, article), or a heading such as "Years", "Certainty" or "Geometry" for Atlas's own reasoning. |
| `url` | string | Optional, https. |
| `licence` | string | Optional. The source's licence, where it matters for reuse. |
| `use` | string | What it was used for, or the reasoning itself. |
| `book` | boolean | Only for a book Paul brought across by hand (rule above). `title` is then the book's title. |
| `author` | string | With `book`: the book's author(s). |
| `copyright` | string | With `book`: `"public-domain"` or `"in-copyright"`. |
| `text` | string | With `book`, required: `"bite"` if the route text is the bite's wording, `"atlas"` if Atlas wrote its own wording from it. |
| `unchanged` | boolean | With `text: "bite"`, required: `true` if the bite's text went in word for word, `false` if it was trimmed or adapted. Export builds drop `unchanged` in-copyright text. |
| `field` | string | With `book`, optional: which field holds the text (default `"summary"`). |

Example of a book source (no route uses one yet):

```json
{ "title": "<book title>", "author": "<author>", "book": true, "copyright": "in-copyright",
  "text": "bite", "unchanged": true, "use": "summary is the bite's text, brought across by Paul on <date>; facts checked against <open sources>" }
```

## Routes

| id | Years | Mode | Certainty |
|---|---|---|---|
| `silk-road` … `atlantic-crossing` | — | — | the first 8 corridors (2026): original fields only, schematic |
| `tyre-jerusalem` | −1000..−586 | land | schematic |
| `levant-red-sea` | −970..−931 | sea | schematic (the voyages are known only from the biblical text; see its sources) |
