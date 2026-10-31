# Low Range — Co-op Off-Road Browser Game

## What we're building
A low-poly off-road driving game that runs in the browser. Drive 4x4s from a start arch to a finish
arch across open country, crawl through mud in low range, winch out of trouble, and log survey posts
and cairns on the way. Up to 3 friends play together on the same Wi-Fi.

Design pillars:
1. Slow, deliberate driving. The fun is picking a line, not top speed.
2. Big maps worth exploring, with a real mix of roads and off-road.
3. Readable low-poly look. Simple shapes, flat colours, strong silhouettes.

## Hard rules
- Original work only. Do not decompile, disassemble, extract or analyze the binaries or assets of
  any commercial game or its mods, and do not run reverse-engineering tools (e.g. REA) against them.
  Do not recreate a specific existing game. Write everything from scratch or use permissively
  licensed open-source code and CC0 assets.
- Assets must be CC0 or MIT. Record every external asset and library (name, source URL, license)
  in CREDITS.md.
- Download only from official sources. Ask before anything over ~50 MB.
- Work one phase at a time and commit at the end of each phase with a clear message.
- Keep PROGRESS.md updated: done, in progress, next, known issues, tuning values that worked.

## Tech stack
- Browser: three.js r128 (from cdnjs), plain JavaScript, no build step.
- Server: `server.js`, Node.js with no dependencies. Serves the game and relays positions over
  WebSocket for same-Wi-Fi multiplayer.
- Physics: our own raycast-wheel rigid body in `js/car.js`. Gravity is 9.81 on every map.

## How to run
- Solo: double-click `index.html`, or run the server and open http://localhost:3000.
- With friends on the same Wi-Fi: double-click `start-server.bat` on one computer. It prints a
  "Friends open" address; up to 2 friends open it in Chrome. The menu also shows it with a Copy button.
  If friends can't connect, allow Node.js on Private networks in Windows Firewall.

## Project layout
```
index.html            page, styles and HUD markup; loads js/ in order
server.js             LAN server: static files, 3-player cap, relay, map pins, best times
start-server.bat      double-click launcher for Windows
js/util.js            helpers, seeded noise, polylines (roads)
js/regions.js         surfaces, quick maps, shared region defaults
js/himalaya.js        big map: Dhauli Valley (roads, switchbacks, fords, hamlets, pass)
js/moon.js            big map: Mare Serenum (craters, rille, Earth physics)
js/scene.js           renderer, lights, sky meshes
js/terrain.js         chunk streaming, heights, surfaces, colours, overview map image
js/world.js           cairns, arches, survey posts, prop kit, buildRegion
js/cars.js            the four vehicles: handling numbers, bodies, cockpit interior
js/car.js             vehicle physics, collisions, placement
js/effects.js         dust, rain/snow, sky and time of day
js/input.js           state, keys/touch/gamepad, cameras (chase, driver's seat, hood)
js/gameplay.js        winch, survey posts, finish, results
js/audio.js           engine sound
js/net.js             multiplayer client: interpolation, car types, colours, pins
js/hud.js             compass and HUD readouts, per-frame vehicle visuals
js/minimap.js         minimap, full map, fog of war, shared pins
js/main.js            menus, main loop, boot
```

## Coding conventions
- Scripts are classic `<script>` files sharing one global scope; load order in index.html matters.
- Every tunable vehicle number lives in `CAR_TYPES` (js/cars.js). Region looks and rules live in
  the region definition objects.
- Terrain must stay deterministic: everything comes from seeded noise so every player's browser
  builds the same world.
- Comment the "why" for physics and networking code; I'm learning from this codebase.

## Testing routine for every phase
1. Run `node server.js`, open the game, check the browser console for errors and warnings.
2. For multiplayer, open three windows (or three devices on the Wi-Fi) and check sync.
3. Give me a short manual playtest checklist for things only a human can judge
   (handling feel, camera comfort, readability).
4. Update PROGRESS.md and commit.
