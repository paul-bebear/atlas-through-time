# Atlas link format, v2

A link can open Atlas at a year and place, with pins, an era band, highlighted
polities and highlighted routes. Atlas owns this format. Other projects (Paul's
reading app, Shelf, is the first) build links from this page and pin a version.
Design and reasons: the vault note *Shelf Connection*, §3.3.

```
https://atlas-through-time.vercel.app/#v=2&year=-950&span=-970,-931&qid=Q3185305,Q41642&pins=@33.27,35.20~Tyre;@29.56,34.95~Elath;@29.48,34.98~Ezion-Geber&route=levant-red-sea
```

## Where the view lives

- The view is in the **fragment** (`#…`), which browsers never send to a server, so it
  never reaches access logs.
- A fragment is a link view only when it starts with `v=2`. Anything else after `#` is
  ignored.
- The older query form `?year=&sel=&mode=&thread=&beat=` keeps working. If a `v=2`
  fragment is present, it wins and the query is ignored.
- Keys are separated by `&`, and a key is separated from its value by `=`. If a key
  appears twice, the first value counts. Unknown keys are ignored.
- Values are percent-encoded. Inside a label, encode `;` `@` `~` `&` `#` and `%` (as
  `%3B %40 %7E %26 %23 %25`); `+` reads as a space.

## Keys

| Key | Form | Meaning | Checks |
|---|---|---|---|
| `v` | `2` | Format version. | Required. |
| `year` | integer, e.g. `-950` | Timeline year (negative = BCE). | Clamped to −3000…2025. Not an integer: ignored. |
| `span` | `a,b` | An era band on the timeline. Atlas writes its label itself ("c. 970–931 BCE"). | Integers, `a ≤ b`, each clamped to −3000…2025. Otherwise ignored. |
| `qid` | `Q…,Q…` | Up to 2 polities by Wikidata QID. Atlas uses the registry row whose years cover `year`, highlights it on the borders shown, and puts a red pin with its name at its point (else at the centre of its shapes). | `^Q[1-9][0-9]{0,9}$`. More than 2: the rest ignored. An unknown QID is ignored. Resolved from Atlas's committed registry slice, so it works when the database is down. |
| `pins` | items separated by `;` | Up to 8 pins. Each is `[src:id]@lat,lng[~label]`. | See below. More than 8: the rest ignored. |
| `route` | `id,id,…` | Up to 3 Atlas route ids (`docs/routes.md`). The trade routes layer turns on and these routes are drawn thicker, with their names; the other routes dim. A route outside `year` is drawn grey, its label giving its dates, rather than hidden. | `^[a-z0-9][a-z0-9-]{0,47}$`. Unknown ids are ignored. |
| `scene` | id | A curated Atlas scene (planned, A5). | Parsed and ignored for now; the rest of the link applies. |
| `at` | `lat,lng,alt` | The camera: latitude, longitude, altitude in globe radii. | lat −90…90, lng −180…180, alt 0.05…10. Otherwise ignored. |

## Pins

```
[src:id]@lat,lng[~label]
pleiades:678378@33.27,35.20~Tyrus
@29.56,34.95~Elath
```

- `src:id` is optional. It must match `^[a-z]+:[A-Za-z0-9._-]{1,24}$` with `src` one of
  `pleiades`, `geonames`, `wikidata`, `atlas`. A pin with a bad id is dropped.
- `lat` and `lng` are decimal degrees (up to 7 decimals), −90…90 and −180…180. A pin with
  bad or missing coordinates is dropped. The coordinates always travel with the pin, so a
  pin works even when Atlas does not know its id.
- `label` is plain text, at most 40 characters (longer is cut), with control characters
  removed. It is always rendered as text, never as markup. A label that is not valid
  percent-encoding is dropped and the pin is kept.
- **Ids Atlas knows today:** `atlas:<city>`, where `<city>` is an Atlas city name
  lower-cased with runs of other characters turned into `-` (`atlas:jerusalem`,
  `atlas:constantinople`). Such a pin takes Atlas's own, period-correct name. Pleiades,
  GeoNames and Wikidata place ids are accepted and kept for later (planned A2/A4); for
  now those pins use their `~label`.
- Pins are a pointer someone sent, not Atlas facts. They are drawn in their own dashed
  violet style, counted under *From the link you opened* (in the layers panel and in a chip
  above the timeline), and are **never stored** (no database, localStorage or IndexedDB),
  never sent anywhere, and never in the API or exports.
- A click or tap on a pin opens its own card: its label, its position, the id it carries
  (linked for Pleiades, Wikidata and GeoNames), and that it came from the link. It does not
  select the polity under it.

## What Atlas does with a link

1. Parse once at boot, before the old permalink restore. Each item is checked on its own;
   a bad item is dropped without breaking the rest.
2. Set the year, draw the pins and the span. The span is a violet band in its own lane
   under the timeline's selection span, at least 12 px wide, with its label beside it.
3. Resolve `qid` (loading the registry slice only when a link carries one), highlight and
   pin the polities. A click or tap on one of their shapes later brings the link's selection
   back with the registry name and card; where the map's border data names the polity
   differently, the card says "Shown on this map as …".
4. Turn on the trade routes layer and highlight the routes. Sea routes (`mode: "sea"`) are
   dashed, and while in use their dashes move in the direction of travel. A route whose last
   waypoint is an open end (`open: true`) fades out over its last quarter and is labelled
   with that waypoint's name ("towards Ophir (location unknown)"), never drawn as a place.
   A highlighted route shows its named stops. A click or tap on a highlighted route, its
   name or a stop opens the route's card: name, years, mode, certainty, goods, its summary,
   its stops with every candidate for a disputed one, and its sources.
5. Camera: `at` if given (exactly); else the pins' bounding box with padding; else the
   polities; else the routes; else the camera stays where it is. On a phone the box is fitted
   into the part of the globe no panel covers (the top row, the layers pill, the card, the
   chip, the timeline), and fitted again after a rotation or when the card changes size,
   until the visitor touches the globe.
6. Whenever the border snapshot is not the timeline year, the timeline says so:
   "Borders shown: c. 1000 BCE" (for every visitor, not only links).
7. The link's view (pins, route highlights, era band, polities) stays until **Clear**:
   selecting something else does not drop it. Meanwhile a chip above the timeline (under the
   layers pill in phone landscape) says what the link added, "From the link you opened ·
   3 pins · 2 routes", with Clear; the layers panel has the same Clear. The address bar keeps
   the fragment the whole time, also for a link with only `qid`, `year`, `span` or `at`, so it
   can be shared again (the timeline's own `?year=` is written in front of it). **Clear**
   removes the pins, the route highlights, the era band, the fragment, and the link's
   polities while they are still the selection; the trade routes layer stays on.

## Rules for anyone building links

- A link carries only years, coordinates, open gazetteer ids and their gazetteer names,
  and Atlas ids. Never a book title, author, or any text from a book.
- Atlas has no analytics and no third-party scripts. Any script Atlas ever adds must not
  read, forward or log the fragment.

## Checks

`node tools/check-link-format.mjs` runs the parser against good and malformed links
(bad ids, 20 pins, markup in a label, out-of-range numbers, encoded separators).
