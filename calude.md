# Trailbound (working title) — Co-op Off-Road Prototype

## What we're building
A 3D co-op off-road exploration game for 1–4 players, built in Godot 4 with typed GDScript.
Players are a volunteer trail-survey crew driving 4x4 trucks across rough highland terrain:
crawling over rocks, pushing through mud and rivers, winching each other out of trouble, and
activating survey beacons together to reveal a lost trail network.

Design pillars:
1. Slow, deliberate driving. The fun is picking a line, not top speed.
2. Teamwork matters. Players should regularly need each other (winching, spotting, scouting).
3. Readable low-poly look. Simple shapes, flat colors, strong silhouettes.

## Hard rules
- Original work only. Do not decompile, disassemble, extract or analyze the binaries or assets of
  any commercial game, and do not run reverse-engineering tools (e.g. REA) against them. Write
  everything from scratch or use permissively licensed open-source code and CC0 assets.
- Assets must be CC0 or MIT. Record every external asset and addon (name, source URL, license)
  in CREDITS.md.
- Download only from official sources (GitHub releases of the named repos, the Godot Asset
  Library, the asset sites listed below). Ask me before anything over ~50 MB.
- Work one milestone at a time. Don't start the next one until the current milestone's
  "Done when" checks pass and I confirm.
- Commit to git at the end of every milestone and at stable checkpoints, with clear messages.
- Keep PROGRESS.md updated: done, in progress, next, known issues, tuning values that worked.

## Tech stack
- Engine: Godot 4.x stable. Use a version that the current Terrain3D release supports
  (check its releases page). If the system Godot is newer than Terrain3D supports, tell me.
- Language: GDScript with static typing everywhere.
- Physics: Jolt (Project Settings > Physics > 3D > Physics Engine = Jolt Physics).
- Renderer: Forward+. If the GPU has trouble, fall back to Mobile or Compatibility.
- Terrain: Terrain3D (github.com/TokisanGames/Terrain3D), MIT.
- Networking: Godot high-level multiplayer (ENetMultiplayerPeer, MultiplayerSpawner,
  MultiplayerSynchronizer). Bring in netfox (github.com/foxssake/netfox) only if M2 smoothing
  is not good enough.
- Assets (CC0): Kenney (Car Kit, Nature Kit), Quaternius, Poly Haven, ambientCG.
  Primitive placeholder meshes are fine until gameplay works.
- Tooling: godot-mcp (Coding-Solo/godot-mcp). Use it to launch the editor, run the project and
  read debug output after every meaningful change. Fix all errors and warnings you see.

## Project layout
```
res://
  addons/                 third-party addons
  assets/                 models, textures, audio (CC0 only)
  scenes/
    main_menu.tscn
    world.tscn
    vehicles/truck.tscn
    ui/hud.tscn
    ui/map.tscn
  scripts/
    autoload/net.gd       networking singleton (host, join, peers, spawning)
    autoload/game.gd      session + co-op progress state
    vehicles/truck.gd
    vehicles/truck_tuning.gd   Resource with all handling values
    vehicles/winch.gd
    world/mud_zone.gd
    world/water_zone.gd
    world/beacon.gd
    camera/chase_camera.gd
```

## Coding conventions
- One responsibility per script; keep scripts under ~300 lines.
- Prefer signals over hard node references between systems.
- Every tunable number is an @export on a Resource (TruckTuning.tres) so handling can be tuned
  in the editor without touching code.
- All controls go through the InputMap. Support keyboard + mouse and gamepad.
- Comment the "why" for physics and networking code; I'm learning from this codebase.

## Milestones

### M0 — Setup
- Create the Godot project, a Godot .gitignore, and git init.
- Switch physics to Jolt. Install Terrain3D and enable it.
- Input actions: accelerate, brake_reverse, steer_left, steer_right, handbrake, range_toggle,
  difflock_toggle, winch_aim_attach, winch_in, winch_out, reset_vehicle, camera_cycle, open_map.
- Confirm godot-mcp can launch and run the project.
- Done when: the empty project runs with no errors; CREDITS.md and PROGRESS.md exist.

### M1 — Single-player driving
- Terrain: about 1 km x 1 km of highland. Generate the heightmap with FastNoiseLite (rolling
  hills, a few steep rocky ridges, a valley with a shallow river), load it into Terrain3D, and
  auto-paint at least 3 textures (grass, dirt, rock) by slope and height.
- Truck: VehicleBody3D with 4 VehicleWheel3D, all-wheel drive. Low custom center of mass,
  long-travel suspension, strong grip at low speed, simple engine torque curve.
- Gearbox: automatic forward/reverse with a High/Low range toggle. Low = more torque, lower
  top speed.
- Chase camera: smooth follow, orbit with mouse or right stick, never clips into terrain.
- Reset: puts the truck upright at its current position when stuck or rolled.
- HUD: speed, range (H/L), diff lock state.
- Done when: the truck can climb a ~30 degree rocky slope in Low range but struggles in High;
  rollover + reset works; steady 60 FPS; no errors or warnings.

### M2 — Multiplayer (1–4 players)
- Main menu: player name, Host (port), Join (IP:port).
- Command-line args via OS.get_cmdline_user_args(): --host, --join <ip>, --name <name>, so you
  can launch a host and clients automatically for testing.
- Architecture (owner-authoritative vehicles, fine for co-op): each player simulates their own
  truck locally for zero input lag. Transform, velocity and wheel visuals sync via
  MultiplayerSynchronizer. Remote trucks are interpolated proxies (frozen kinematic bodies with
  ~100 ms buffered interpolation). The host owns shared world state (beacons, progress).
- Spawn/despawn with MultiplayerSpawner. Distinct color and floating name label per player.
- Graceful disconnects: a client leaving removes their truck; the host leaving returns
  everyone to the menu with a message.
- Done when: 2, then 4, local instances connect and see each other drive smoothly with no
  visible jitter, and disconnects never crash anything.

### M3 — Off-road systems
- Diff lock: with it off, drive torque shifts away from wheels with low ground contact or high
  slip (approximating an open differential losing traction); with it on, all wheels get equal
  torque. Use per-wheel engine_force on VehicleWheel3D.
- Mud: Area3D zones that lower wheel grip and add drag; darker, wetter terrain texture.
- Water: river depth matters. Past wheel-hub depth, add drag and slight upward push. Past
  bonnet depth, the engine stalls until reset.
- Winch: aim from the front bumper and attach to an anchor (nodes in group "winch_anchor":
  trees, rocks) or another player's truck within 25 m. Draw the cable as a line mesh. Pull with
  a capped spring-damper force; winch_in / winch_out control cable length. For truck-to-truck
  winching, send the pull force by RPC to the owner of the other truck, who applies it locally.
- Done when: a truck stuck in deep mud can be winched out by a second player, and diff lock
  clearly helps on cross-axle terrain.

### M4 — Co-op goal loop
- Place 8–12 survey beacons across the map, several in hard-to-reach spots.
- A beacon activates when any player stays within 5 m for 3 s (host decides, synced to all).
- Each activated beacon reveals a trail segment on a simple top-down map (open_map) and adds
  a compass marker on the HUD.
- All beacons active: summary screen with session time and each player's contribution.
- Done when: a full session from hosting to completion works with 2+ players.

### Later (not now)
More vehicles, upgrades, day/night and weather, sound design, Steam lobbies (GodotSteam),
internet play without port forwarding (netfox.noray).

## Testing routine for every milestone
1. Run through godot-mcp, read the debug output, fix every error and warning.
2. For multiplayer, launch one host and 1–3 clients with the CLI args and check sync.
3. Give me a short manual playtest checklist for the things only a human can judge
   (handling feel, camera comfort, readability).
4. Update PROGRESS.md and commit.