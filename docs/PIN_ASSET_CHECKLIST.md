# Pin asset checklist

This checklist documents the category pin family used by the map icon resolver. The SVG assets are intentionally small, reusable and consistent with the Leaflet `divIcon` approach used by the app.

## Licence note

The planned glyph system is based on Maki-style POI symbols, which are part of the Mapbox open icon family. For downstream usage, retain the relevant attribution and licence notice in the final distribution: Mapbox Maki is available under the CC BY 4.0 licence; attribution is required when redistributed. The in-app use here is a lightweight local asset set derived from the same style family.

## Asset list

| Key                    | Group                     | Glyph description   | Covers mapping rules                                 |
| ---------------------- | ------------------------- | ------------------- | ---------------------------------------------------- |
| pin_fort               | Heritage & culture        | fortress silhouette | `fort`, `castle`                                     |
| pin_palace             | Heritage & culture        | palace roof         | `palace`, `royal`                                    |
| pin_monument           | Heritage & culture        | monument column     | `monument`, `memorial`, `archaeological_site`        |
| pin_museum             | Heritage & culture        | museum doorway      | `museum`, `gallery`                                  |
| pin_art_gallery        | Heritage & culture        | framed art          | `art_gallery`, `gallery`                             |
| pin_heritage_general   | Heritage & culture        | heritage badge      | general heritage fallback                            |
| pin_hindu_temple       | Religious                 | temple spire        | `hindu_temple`, `temple`                             |
| pin_church             | Religious                 | church steeple      | `church`                                             |
| pin_mosque             | Religious                 | mosque dome         | `mosque`                                             |
| pin_gurudwara          | Religious                 | dome with doorway   | `gurudwara`                                          |
| pin_jain_temple        | Religious                 | jain temple spire   | `jain_temple`                                        |
| pin_buddhist_monastery | Religious                 | stupa silhouette    | `buddhist_monastery`, `stupa`, `monastery`           |
| pin_religious_general  | Religious                 | shrine circle       | other worship spaces                                 |
| pin_beach              | Nature & outdoors         | wave + sun          | `beach`                                              |
| pin_park_garden        | Nature & outdoors         | tree + path         | `park`, `garden`                                     |
| pin_viewpoint          | Nature & outdoors         | mountain peak       | `viewpoint`                                          |
| pin_lake_river         | Nature & outdoors         | water flow          | `lake`, `river`, `ghat`, `riverfront`                |
| pin_waterfall          | Nature & outdoors         | waterfall drop      | `waterfall`                                          |
| pin_hill_mountain      | Nature & outdoors         | mountain            | `hill_station`, `peak`, `mountain`                   |
| pin_wildlife           | Nature & outdoors         | animal paw          | `wildlife`, `sanctuary`, `zoo`                       |
| pin_cave               | Nature & outdoors         | cave opening        | `cave`                                               |
| pin_nature_general     | Nature & outdoors         | leaf                | general nature fallback                              |
| pin_adventure          | Adventure & activity      | mountain + rope     | `trekking`, `rafting`, `paragliding`, `water_sports` |
| pin_amusement_park     | Adventure & activity      | amusement ride      | `amusement_park`                                     |
| pin_restaurant         | Food & drink              | fork + plate        | `restaurant`, `food`                                 |
| pin_cafe               | Food & drink              | coffee cup          | `cafe`, `coffee`                                     |
| pin_street_food        | Food & drink              | local snack         | `street_food`                                        |
| pin_bar_pub            | Food & drink              | cocktail glass      | `bar`, `pub`                                         |
| pin_market_bazaar      | Shopping & markets        | market stall        | `market`, `bazaar`, `shopping`                       |
| pin_shopping_mall      | Shopping & markets        | shopping bag        | `mall`                                               |
| pin_entertainment      | Entertainment & nightlife | theatre mask        | `theatre`, `cinema`, `concert`                       |
| pin_nightlife          | Entertainment & nightlife | disco sparkle       | `club`, `lounge`, `nightlife`                        |
| pin_wellness           | Wellness                  | lotus               | `spa`, `yoga`, `retreat`                             |
| pin_airport            | Transport                 | plane               | `airport`                                            |
| pin_railway            | Transport                 | train               | `railway_station`, `train_station`                   |
| pin_bus_station        | Transport                 | bus                 | `bus_station`                                        |
| pin_metro_station      | Transport                 | metro line          | `metro_station`                                      |
| pin_ferry_port         | Transport                 | ferry               | `ferry_port`                                         |
| pin_hotel              | Stay & trip anchors       | bed                 | trip hotel / base                                    |
| pin_start              | Stay & trip anchors       | start marker        | trip start                                           |
| pin_end                | Stay & trip anchors       | finish check        | trip end                                             |
| pin_generic_poi        | Other                     | compass point       | fallback for unmapped POIs                           |

## Resolution rules

1. `poi.subtypeIcon` if provided.
2. Fine-grained Overture tag from `poi.tags` after `overture_maps|`.
3. `poi.travelCategory` from the category map.
4. Fallback to `pin_generic_poi`.

Unmapped values are logged in development so the map can be extended without shipping a code change.
