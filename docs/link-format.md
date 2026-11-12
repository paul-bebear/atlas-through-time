# Atlas link format, v2

A link can open Atlas at a year and place, with pins, an era band, highlighted
polities and highlighted routes. Atlas owns this format. Other projects (a reading
app, Shelf, is the first) build links from this page and pin a version.
Design and reasons: the vault note *Shelf Connection*, §3.3.

```
https://atlas-through-time.vercel.app/#v=2&year=-950&route=levant-red-sea&span=-970,-931&qid=Q3185305,Q41642&pins=@33.27,35.20~Tyre;@29.56,34.95~Elath;@29.48,34.98~Ezion-Geber
```

## Where the view lives

- The view is in the **fragment** (`#…`), which browsers never send to a server, so it
  never reaches access logs.
- A fragment is a link view only when it starts with `v=2`. Anything else after `#` is
  ignored.
- The older query form `?year=&sel=&mode=&thread=&beat=` keeps working. If a `v=2`
  fragment is present, it wins and the query is ignored.
- The view must be in the fragment. `?v=2&…` as a query is not read (only the older
  `?year=` is): a query reaches the server, the fragment does not.
- Keys are separated by `&`, and a key is separated from its value by `=`. If a key
  appears twice, the first value counts. Unknown keys are ignored. `&` and `=` must be
  literal: `%26` and `%3D` are not read as separators.
- Values are percent-encoded. Inside a label, encode `;` `@` `~` `&` `#` and `%` (as
  `%3B %40 %7E %26 %23 %25`); `+` reads as a space.
- **Recommended key order:** `v`, `year`, `route`, `span`, `qid`, then `pins` last. A link
  cut short (a chat app, a length limit) then loses only its last pins and still shows its
  routes and polities.

## Separators, literal or encoded

The separators inside a value (`,` in `span`, `at`, `qid`, `route` and a pin's
coordinates; `;` `@` `~` in `pins`) may be written literally or percent-encoded
(`%2C %3B %40 %7E`, either case), as a URL library writes them. Both forms mean the same.

- **Each value decides for itself.** A value that has a literal separator of a kind reads
  only the literal ones; an encoded one beside them is text (or makes that item invalid).
  Only a value with no literal separator of that kind reads the encoded one as the
  separator. So `qid=Q1%2CQ2` gives two polities, `qid=Q1,Q2%2CQ3` gives only `Q1`.
- In a pin, the first `@` and then the first `~` cut it (literal if there is one, else
  encoded); everything after that `~` is the label. The coordinates are numbers only, so
  their comma may be `,` or `%2C`.
- **Labels** are decoded once, after the pin has been cut, so an encoded `;` `,` `~` `@`
  in a label is text: `~a%3Bb%2Cc` shows "a;b,c". One case is read as a separator: in a
  `pins` value with no literal `;`, an encoded `;` followed straight by the start of a pin
  (`@lat,lng` or `src:id@lat,lng`) starts a new pin. To keep such text in a label, write
  the `;` between pins literally.
- **Double encoding is not undone.** `%252C` is not a separator; the item is dropped. In
  a label it shows decoded once (`%252C` shows as "%2C").
- `year`, `span`, `at` and `scene` are decoded first, as before.
- **Minus and decimal point.** In the numbers of `pins`, `at` and `span`, `-` may be written
  `%2D` and `.` may be written `%2E` (either case), as some URL libraries do:
  `@%2D33%2E87,151%2E21` is `@-33.87,151.21`. Nothing else in a pin's coordinates is decoded.
  (`at` and `span` already allowed this, being decoded first.)

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
  violet style, always with their labels (crowded, a label moves out on a short leader line
  rather than hiding), counted under *From the link you opened* (in the layers panel and in a chip
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
   A highlighted route shows its named stops, each name once: a stop two routes share is
   labelled once, a stop on a link pin is named by the pin, and one on a city by the city's
   name (at a route's end by the stop's own label, the city's name then left out). Route
   names, the open end's label and a route's first and last stop always show, like the
   pins' labels; where labels crowd, the other stops and city names give way first. A click or tap on a highlighted route, its
   name or a stop opens the route's card: name, years, mode, certainty, goods, its summary,
   its stops with every candidate for a disputed one, and its sources.
5. Camera: `at` if given (exactly); else the pins together with every point of the
   highlighted routes (open end included) and the polities, with padding; else the camera
   stays where it is. On desktop the box is fitted, centred, into the band between the top
   row and the chip and timeline. On a phone the box is fitted into the part of the globe no panel covers
   (the top row, the layers pill, the card, the chip, the timeline), and fitted again after a
   rotation or when the card changes size, until the visitor touches the globe. On a phone the
   polity's card first opens as a one-line peek ("Tap for details"), so the map shows first.
   A tap or click made before the polities arrive is kept: they are still highlighted and
   pinned, but their card does not replace the one the visitor opened, and the camera stays.
6. Whenever the border snapshot is not the timeline year, the timeline says so:
   "Borders shown: c. 1000 BCE" (for every visitor, not only links).
7. The link's view (pins, route highlights, era band, polities) stays until **Clear**:
   selecting something else does not drop it. Meanwhile a chip above the timeline (under the
   layers pill in phone landscape) says what the link added, "From the link you opened ·
   3 pins · 2 routes", with Clear; the layers panel has the same Clear. The chip shows only
   when the link put something on screen that Clear takes away: a link with only `year` or
   `at` gets none. A link that asked for `pins`, `qid` or `route` but from which nothing could
   be shown (every item invalid, or unknown to Atlas) gets a quiet note in the chip's place
   instead, "This link's places and routes could not be read.", with Dismiss; if some items
   survived, the chip counts those as usual. In Map Quiz and Empire Story the chip is put
   away (their own panels take its place) and comes back with Discovery or US territorial
   growth; the layers panel's Clear stays reachable meanwhile. On a phone the chip also gives
   way while the layers panel is open (the panel covers its place) and comes back when the
   panel closes. Clear removes everything the link put on screen, its polities included,
   whatever the visitor opened in between (a link pin's card goes with its pin); what the
   visitor chose themselves stays: a route from the list or tapped on the globe (with its
   highlight, the trade routes layer kept on for it), a city's card and pin, a searched or
   tapped country, and one of the link's own polities once the visitor tapped it. The address bar keeps
   the fragment the whole time, also for a link with only `qid`, `year`, `span` or `at`, so it
   can be shared again (the timeline's own `?year=` is written in front of it). **Clear**
   removes the pins, the route highlights, the era band, the fragment, and the link's
   polities while they are still the selection. If the link turned the trade routes layer on,
   Clear turns it off again, unless the card of a route the visitor opened is still open; if
   the visitor had it on, or toggled it themselves after opening the link, it stays as they set it.

## Rules for anyone building links

- A link carries only years, coordinates, open gazetteer ids and their gazetteer names,
  and Atlas ids. Never a book title, author, or any text from a book.
- Atlas has no analytics and no third-party scripts. Any script Atlas ever adds must not
  read, forward or log the fragment.

## Checks

`node tools/check-link-format.mjs` runs the parser against good and malformed links
(bad ids, 20 pins, markup in a label, out-of-range numbers, separators fully, partly and
doubly encoded, encoded separators inside labels, `%2D` and `%2E` in numbers), when a link counts as unreadable, and against a list of links with the
result the parser gave before encoded separators were accepted, which must not change.
