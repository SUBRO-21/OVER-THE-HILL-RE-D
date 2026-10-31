# Progress

## Done
- **Groundwork:** split the single 89 KB `index.html` into `js/` modules; server serves `js/`
  with a path-traversal guard; project-only git repo (the old one was rooted at the Desktop).
- **Same-Wi-Fi multiplayer for 3:** player cap with colour slots; a 4th player sees "This game is
  full"; the menu shows the address for friends with a Copy button; remote trucks drawn 150 ms in
  the past and blended between updates, briefly extrapolated when an update is late; per-client
  rate limit; shared map pins.
- **Vehicles:** Trail Jeep, Ridge Pickup, Goat Crawler, Survey Rover. All handling numbers in
  `CAR_TYPES`. Friends see the vehicle you picked.
- **Driver's-seat camera:** right-hand-drive interior with dashboard, turning steering wheel, live
  speed/RPM/4H-4L gauges, head look by dragging, head sway from acceleration. `C` cycles chase /
  driver's seat / hood.
- **Big-map engine:** 4 km x 4 km maps streamed in 256 m chunks with three detail levels; trees,
  rocks and collision only near the player; overview map drawn in the background from the player
  outwards.
- **Dhauli Valley (Himalayan):** river valley, tarmac main road (max 7% grade), gravel switchback
  roads to two hamlets and the pass (max 13.5%), causeway, two fords (0.4 m deep), landslides on
  the main road, four mud tracks, glacial lake, deodar forest, snowline, huts, temple, prayer flags,
  km stones. 5 survey posts in order, then the finish at the pass.
- **Mare Serenum (Moon, Earth physics):** maria and highlands, craters at three scales, a rille,
  the big Halden crater with ray streaks, black sky with Earth, lander/antenna/habitat props.
  5 survey posts.
- **Minimap:** heading-up or north-up (`T`), zoom (`PgUp`/`PgDn` and buttons), fog of war on big
  maps that clears around every driver and is remembered per map, player colours, survey posts,
  off-screen arrows, footer readout to the nearest pin. Click the full map (`M`) to drop a pin
  everyone on the map sees.

## Tuning values that worked
- Suspension: about 9 cm static sag and damping ratio about 0.47 for every vehicle.
- Steering wheel: 7:1 ratio to the road-wheel angle.
- Remote interpolation delay 150 ms, extrapolation up to 200 ms.
- Chunk build budget 4 ms per frame on big maps; overview map 3 ms per frame.

## Known issues / to check by playing
- Route time target is about 25 minutes per big map. Straight-line route lengths: Dhauli
  4.9 km, Serenum 7.2 km; real driving distance is longer. Time a full run on each and adjust.
- Frame rate was only measured in a software-rendered headless browser. Check on a real GPU.
- The causeway is a raised road over the river (the water under it is cut off), not a true bridge.
- Distant mountains have no tree meshes; forest is shown by darker ground colour beyond about 600 m.

## Next
- Playtest checklist: handling of each vehicle in 4H and 4L, cockpit comfort at speed, whether
  the posts' hints are enough to find the way, minimap readability.
