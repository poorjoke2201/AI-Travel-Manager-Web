# Travel Manager Frontend Design System

## Direction

Travel Manager is a modern digital travel journal: an editorial atlas and personal notebook where trips, routes, plans, photographs, and recommendations are collected as pages. The product should feel tactile and exploratory without becoming a paper simulator.

The balance is **70% modern product clarity and 30% travel-journal personality**. Information remains easy to scan, keyboard accessible, responsive, and functional. Journal details provide hierarchy, warmth, and memory.

Do not copy the supplied references or their content. They are stylistic references only.

## Visual Language

- Foundation: warm paper, faint grain, restrained map contours, and generous whitespace.
- Ink: deep blue-black for primary text and navigation.
- Accents: pine, ocean, terracotta, and ochre used sparingly for states and wayfinding.
- Display type: editorial serif for destinations, trip names, and page titles.

## Motion

2. Which trip am I viewing?
3. What can I do next?

- Map: folded-atlas composition with a clear route and restrained annotations.
- Explore: map-led atlas with pinned destinations and compact filters.
- Public trips: curated postcard wall with readable metadata and editorial variation.
  The intro animation belongs in the login, registration, and OTP shell as a looping ambient travel backdrop. It should keep playing while the user completes authentication and must not appear as a blocking post-login splash screen.

Recommended location:

```text
client/public/assets/intro/login-intro.mp4
```

Reference it in the client as:

```text
/assets/intro/login-intro.mp4
```

Keep the source video lightweight. Provide `login-intro-fallback.gif` in the same folder as the animated fallback. The auth shell should autoplay it muted, loop it, respect reduced motion, and show the GIF if the video is missing or fails to load. Authentication forms must remain usable if both visual assets fail.

Landing-page scrapbook objects use small cursor-based parallax offsets to create physical depth. Newspaper assets are static, flat editorial background layers with no shadow or hover animation. The five feature assets are free-standing foreground objects: they may hover-lift, shift a few pixels with pointer movement, and slide or roll into the central spotlight when selected. Keep movement subtle, return layers to rest on pointer exit, and disable it when `prefers-reduced-motion` is enabled.

## Asset Checklist

Add assets gradually to these folders. Use lowercase kebab-case filenames. Prefer original or properly licensed assets.

### Required first

- [x] `client/public/assets/intro/intro.mp4` - looping auth intro video.
- [x] `client/public/assets/intro/login-intro-fallback.gif` - animated fallback for the auth intro video.
- [ ] `client/public/assets/brand/wordmark.svg` - Travel Manager wordmark.
- [x] `client/public/assets/texture/paper-grains.webp` - very subtle warm paper texture.
- [x] `client/public/assets/texture/map-contours.webp` - faint atlas contour texture.

### Landing and trip covers

- [x] `client/public/assets/destinations/landing-hero-01.webp` - landing carousel image.
- [x] `client/public/assets/destinations/landing-hero-02.webp` - landing carousel image.
- [x] `client/public/assets/destinations/landing-hero-03.webp` - landing carousel image.
- [x] `client/public/assets/destinations/landing-hero-04.webp` - landing carousel image.
- [ ] `client/public/assets/destinations/destination-01.webp` - destination card image.
- [ ] `client/public/assets/destinations/destination-02.webp` - destination card image.
- [ ] `client/public/assets/destinations/destination-03.webp` - destination card image.
- [ ] `client/public/assets/destinations/destination-04.webp` - destination card image.
- [ ] `client/public/assets/destinations/trip-cover-default.webp` - fallback trip cover.

### Travel ephemera

- [x] `client/public/assets/ephemera/tickets.webp` - ticket fragment.
- [x] `client/public/assets/ephemera/luggage.webp` - luggage/travel object.
- [x] `client/public/assets/ephemera/passport-stamp.webp` - transparent stamp mark.
- [x] `client/public/assets/ephemera/map.webp` - atlas/map fragment.
- [x] `client/public/assets/ephemera/car.webp` - road-trip/movement object.
- [x] `client/public/assets/ephemera/postcards.webp` - reusable postcard frame.
- [x] `client/public/assets/ephemera/masking-tape.webp` - transparent tape strip.
- [x] `client/public/assets/ephemera/paperclip.webp` - small clip accent.

### Interface illustration

- [x] `client/public/assets/illustrations/compass.svg` - compass mark.
- [x] `client/public/assets/illustrations/location.svg` - route/location mark.
- [x] `client/public/assets/illustrations/airplane.svg` - flight accent.
- [x] `client/public/assets/illustrations/camera.svg` - memory/photo accent.
- [x] `client/public/assets/illustrations/coconut.svg` - destination/culture accent.
- [x] `client/public/assets/illustrations/journal.svg` - notebook accent.
- [x] `client/public/assets/illustrations/slippers.svg` - rest/packing accent.

### Explore and itinerary

- [x] `client/public/assets/maps/atlas-background.webp` - low-contrast map background.
- [x] `client/public/assets/maps/map-placeholder.webp` - fallback when map tiles are unavailable.
- [x] `client/public/assets/places/place-01.webp` - place/recommendation image.
- [x] `client/public/assets/places/place-02.webp` - place/recommendation image.
- [x] `client/public/assets/places/place-03.webp` - place/recommendation image.

### Asset guidance

- Photography: documentary, natural light, lived-in, and crop-friendly; avoid generic glossy stock imagery.
- Textures: subtle enough that text contrast and map controls remain clear.
- Illustrations: one consistent line weight and a restrained ink color.
- Transparent files: use SVG or WebP where possible; optimize large photos before adding them.
- Do not add decorative art to every component. Each object should support wayfinding, context, or the feeling of a collected journey.

## Implementation Order

1. Establish tokens, typography, texture layers, focus states, and motion utilities.
2. Redesign shared public and authenticated layouts.
3. Build reusable journal primitives: sheets, covers, notes, tags, polaroids, route lines, pins, tickets, and timelines.
4. Rebuild the landing page and login-success transition.
5. Rebuild dashboard, create-trip, and discovery selection.
6. Rebuild trip details, itinerary, map, transport, pre-trip, and budget views.
7. Rebuild explore, public trips, profile, and fallback states.
8. Verify desktop/mobile layouts, keyboard navigation, reduced motion, and existing frontend behavior.

Backend files are out of scope for this redesign.
