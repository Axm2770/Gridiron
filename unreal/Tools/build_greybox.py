"""
Builds /Game/Gridiron/Maps/Greybox in the GridironDemo project using only engine content:
a regulation field with yard lines and team-coloured end zones, a stadium bowl with an instanced
crowd (M_Crowd), light towers, a rain/snow weather actor (M_Weather),
sky and lights tagged for the sequence manager, a ball, the match director (pooling 22
athletes), the broadcast camera director and the venue (team colours, time of day, weather).

Run headless via unreal/Tools/setup.ps1, or inside the editor: Tools > Execute Python Script.
"""
import unreal

YARD = 91.44  # cm
FIELD_LEN = 120 * YARD  # including end zones
FIELD_WID = 53.33 * YARD
MAP = "/Game/Gridiron/Maps/Greybox"

assets = unreal.EditorAssetLibrary
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

CUBE = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
SPHERE = unreal.load_asset("/Engine/BasicShapes/Sphere.Sphere")
BASIC = unreal.load_asset("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")


def material(name, rgb):
    """A colour instance of the engine's basic shape material (its 'Color' parameter)."""
    path = f"/Game/Gridiron/Materials/{name}"
    if assets.does_asset_exist(path):
        return unreal.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialInstanceConstantFactoryNew()
    mi = tools.create_asset(name, "/Game/Gridiron/Materials", unreal.MaterialInstanceConstant, factory)
    unreal.MaterialEditingLibrary.set_material_instance_parent(mi, BASIC)
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(*rgb, 1.0))
    assets.save_loaded_asset(mi)
    return mi


def box(label, loc, size, mat):
    """Cube actor sized in centimetres (the engine cube is 100 cm)."""
    a = actors.spawn_actor_from_object(CUBE, unreal.Vector(*loc))
    a.set_actor_label(label)
    a.set_actor_scale3d(unreal.Vector(size[0] / 100, size[1] / 100, size[2] / 100))
    a.static_mesh_component.set_material(0, mat)
    return a


def tagged(cls, label, loc, rot=(0, 0, 0), tag=None):
    """rot is (pitch, yaw, roll). unreal.Rotator's positional order is roll, pitch, yaw, so pass keywords."""
    rotator = unreal.Rotator(pitch=rot[0], yaw=rot[1], roll=rot[2])
    a = actors.spawn_actor_from_class(cls, unreal.Vector(*loc), rotator)
    a.set_actor_label(label)
    if tag:
        a.tags = [tag]
    return a


# Fresh level every run so the script is safe to repeat.
if assets.does_asset_exist(MAP):
    assets.delete_asset(MAP)
levels.new_level(MAP)

turf = material("MI_Turf", (0.08, 0.32, 0.12))
paint = material("MI_Paint", (0.95, 0.95, 0.92))
concrete = material("MI_Concrete", (0.32, 0.33, 0.35))
ball_mat = material("MI_Ball", (0.42, 0.2, 0.08))


def team_parameters():
    """MPC_Gridiron: HomePrimary/AwayPrimary/CrowdDensity, written at match time by GridironVenue."""
    path = "/Game/Gridiron/Materials/MPC_Gridiron"
    if assets.does_asset_exist(path):
        return unreal.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mpc = tools.create_asset("MPC_Gridiron", "/Game/Gridiron/Materials", unreal.MaterialParameterCollection, unreal.MaterialParameterCollectionFactoryNew())
    def param(cls, name, value):
        # These struct constructors take no keyword arguments; set fields after creating them.
        p = cls()
        p.set_editor_property("parameter_name", name)
        p.set_editor_property("default_value", value)
        return p

    mpc.set_editor_property("vector_parameters", [
        param(unreal.CollectionVectorParameter, "HomePrimary", unreal.LinearColor(0.12, 0.22, 0.45, 1.0)),
        param(unreal.CollectionVectorParameter, "AwayPrimary", unreal.LinearColor(0.5, 0.08, 0.08, 1.0)),
    ])
    mpc.set_editor_property("scalar_parameters", [param(unreal.CollectionScalarParameter, "CrowdDensity", 0.7)])
    assets.save_loaded_asset(mpc)
    return mpc


def team_material(name, parameter, mpc):
    """Material whose base colour reads a team colour from the MPC."""
    path = f"/Game/Gridiron/Materials/{name}"
    if assets.does_asset_exist(path):
        return unreal.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mat = tools.create_asset(name, "/Game/Gridiron/Materials", unreal.Material, unreal.MaterialFactoryNew())
    node = unreal.MaterialEditingLibrary.create_material_expression(mat, unreal.MaterialExpressionCollectionParameter, -300, 0)
    node.set_editor_property("collection", mpc)
    node.set_editor_property("parameter_name", parameter)
    unreal.MaterialEditingLibrary.connect_material_property(node, "", unreal.MaterialProperty.MP_BASE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    assets.save_loaded_asset(mat)
    return mat


MEL = unreal.MaterialEditingLibrary


def expr(mat, cls, x, y, **props):
    n = MEL.create_material_expression(mat, cls, x, y)
    for key, value in props.items():
        n.set_editor_property(key, value)
    return n


def link(src, dst, pin=""):
    MEL.connect_material_expressions(src, "", dst, pin)


def new_material(name):
    """(material, created). Existing materials are reused so the script is safe to repeat."""
    path = f"/Game/Gridiron/Materials/{name}"
    if assets.does_asset_exist(path):
        return unreal.load_asset(path), False
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mat = tools.create_asset(name, "/Game/Gridiron/Materials", unreal.Material, unreal.MaterialFactoryNew())
    # Packaged builds only compile shaders for usages flagged here.
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    return mat, True


def crowd_material(mpc):
    """M_Crowd: home/away colour from per-instance custom data 0, shade varied per spectator,
    seats hidden where PerInstanceRandom exceeds CrowdDensity, and a gentle bob."""
    mat, created = new_material("M_Crowd")
    if not created:
        return mat
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    P = unreal
    home = expr(mat, P.MaterialExpressionCollectionParameter, -900, -300, collection=mpc, parameter_name="HomePrimary")
    away = expr(mat, P.MaterialExpressionCollectionParameter, -900, -180, collection=mpc, parameter_name="AwayPrimary")
    team = expr(mat, P.MaterialExpressionPerInstanceCustomData, -900, -60, data_index=0)
    rnd = expr(mat, P.MaterialExpressionPerInstanceRandom, -900, 100)
    colours = expr(mat, P.MaterialExpressionLinearInterpolate, -600, -200)
    link(home, colours, "A"); link(away, colours, "B"); link(team, colours, "Alpha")
    shade = expr(mat, P.MaterialExpressionLinearInterpolate, -600, 0, const_a=0.45, const_b=1.2)
    link(rnd, shade, "Alpha")
    base = expr(mat, P.MaterialExpressionMultiply, -350, -100)
    link(colours, base, "A"); link(shade, base, "B")
    MEL.connect_material_property(base, "", P.MaterialProperty.MP_BASE_COLOR)

    density = expr(mat, P.MaterialExpressionCollectionParameter, -900, 250, collection=mpc, parameter_name="CrowdDensity")
    keep = expr(mat, P.MaterialExpressionSubtract, -600, 200)
    link(density, keep, "A"); link(rnd, keep, "B")
    mask = expr(mat, P.MaterialExpressionAdd, -350, 200, const_b=0.5)  # > 0.5 (the clip value) keeps the seat
    link(keep, mask, "A")
    MEL.connect_material_property(mask, "", P.MaterialProperty.MP_OPACITY_MASK)

    time = expr(mat, P.MaterialExpressionTime, -900, 450)
    rate = expr(mat, P.MaterialExpressionMultiply, -700, 450, const_b=0.7)
    link(time, rate, "A")
    phase = expr(mat, P.MaterialExpressionMultiply, -700, 550, const_b=5.0)
    link(rnd, phase, "A")
    cycle = expr(mat, P.MaterialExpressionAdd, -550, 500)
    link(rate, cycle, "A"); link(phase, cycle, "B")
    wave = expr(mat, P.MaterialExpressionSine, -400, 500)
    link(cycle, wave)
    lift = expr(mat, P.MaterialExpressionMultiply, -250, 500, const_b=4.0)  # cm
    link(wave, lift, "A")
    flat = expr(mat, P.MaterialExpressionConstant2Vector, -250, 400)
    bob = expr(mat, P.MaterialExpressionAppendVector, -100, 450)
    link(flat, bob, "A"); link(lift, bob, "B")
    MEL.connect_material_property(bob, "", P.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    MEL.recompile_material(mat)
    assets.save_loaded_asset(mat)
    return mat


def weather_material():
    """M_Weather: each instance's resting position (custom data) is treated as a fixed world point that falls
    at FallSpeed and wraps into BoxSize around the actor (which follows the camera), so precipitation
    stays put in the world while the box moves. Drift sways it sideways."""
    mat, created = new_material("M_Weather")
    if not created:
        return mat
    P = unreal
    mat.set_editor_property("blend_mode", P.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("shading_model", P.MaterialShadingModel.MSM_UNLIT)
    # Expands instance culling bounds to cover the whole box the particles move through.
    mat.set_editor_property("max_world_position_offset_displacement", 4000.0)
    tint = expr(mat, P.MaterialExpressionVectorParameter, -400, -300, parameter_name="Tint", default_value=unreal.LinearColor(0.62, 0.68, 0.75, 1))
    MEL.connect_material_property(tint, "", P.MaterialProperty.MP_EMISSIVE_COLOR)
    opacity = expr(mat, P.MaterialExpressionScalarParameter, -700, -150, parameter_name="Opacity", default_value=0.35)
    # Fade particles within a few metres of the lens so drops never smear across the view.
    depth = expr(mat, P.MaterialExpressionPixelDepth, -900, -50)
    near = expr(mat, P.MaterialExpressionSubtract, -750, -50, const_b=250.0)
    link(depth, near, "A")
    ramp = expr(mat, P.MaterialExpressionMultiply, -600, -50, const_b=1.0 / 700.0)
    link(near, ramp, "A")
    fade = expr(mat, P.MaterialExpressionSaturate, -450, -50)
    link(ramp, fade)
    faded = expr(mat, P.MaterialExpressionMultiply, -300, -100)
    link(opacity, faded, "A"); link(fade, faded, "B")
    MEL.connect_material_property(faded, "", P.MaterialProperty.MP_OPACITY)

    # Resting position in the box (custom data 0-2), which is also where each instance sits.
    local = expr(mat, P.MaterialExpressionPerInstanceCustomData3Vector, -1400, 50, data_index=0)
    actor = expr(mat, P.MaterialExpressionActorPositionWS, -1600, 150)
    time = expr(mat, P.MaterialExpressionTime, -1600, 300)
    speed = expr(mat, P.MaterialExpressionScalarParameter, -1600, 400, parameter_name="FallSpeed", default_value=1400.0)
    drop = expr(mat, P.MaterialExpressionMultiply, -1400, 350)
    link(time, drop, "A"); link(speed, drop, "B")
    flat = expr(mat, P.MaterialExpressionConstant2Vector, -1400, 250)
    fall = expr(mat, P.MaterialExpressionAppendVector, -1250, 300)
    link(flat, fall, "A"); link(drop, fall, "B")
    point = expr(mat, P.MaterialExpressionSubtract, -1100, 100)  # world-fixed point after falling
    link(local, point, "A"); link(fall, point, "B")

    box_param = expr(mat, P.MaterialExpressionVectorParameter, -1600, 550, parameter_name="BoxSize", default_value=unreal.LinearColor(5000, 5000, 2500, 0))
    box = expr(mat, P.MaterialExpressionComponentMask, -1400, 550, r=True, g=True, b=True, a=False)
    link(box_param, box)
    corner = expr(mat, P.MaterialExpressionConstant3Vector, -1400, 650, constant=unreal.LinearColor(-0.5, -0.5, 0, 0))
    lo = expr(mat, P.MaterialExpressionMultiply, -1250, 600)
    link(box, lo, "A"); link(corner, lo, "B")
    from_actor = expr(mat, P.MaterialExpressionSubtract, -950, 100)
    link(point, from_actor, "A"); link(actor, from_actor, "B")
    from_corner = expr(mat, P.MaterialExpressionSubtract, -800, 150)
    link(from_actor, from_corner, "A"); link(lo, from_corner, "B")
    cells = expr(mat, P.MaterialExpressionDivide, -650, 200)
    link(from_corner, cells, "A"); link(box, cells, "B")
    wrap = expr(mat, P.MaterialExpressionFrac, -500, 200)
    link(cells, wrap)
    inside = expr(mat, P.MaterialExpressionMultiply, -380, 250)
    link(wrap, inside, "A"); link(box, inside, "B")
    placed = expr(mat, P.MaterialExpressionAdd, -260, 300)
    link(inside, placed, "A"); link(lo, placed, "B")
    offset = expr(mat, P.MaterialExpressionSubtract, -140, 300)
    link(placed, offset, "A"); link(local, offset, "B")
    rnd = expr(mat, P.MaterialExpressionPerInstanceRandom, -700, 750)
    slow = expr(mat, P.MaterialExpressionMultiply, -550, 700, const_b=0.35)
    link(time, slow, "A")
    phase = expr(mat, P.MaterialExpressionAdd, -420, 720)
    link(slow, phase, "A"); link(rnd, phase, "B")
    sway_wave = expr(mat, P.MaterialExpressionSine, -300, 720)
    link(phase, sway_wave)
    drift = expr(mat, P.MaterialExpressionScalarParameter, -300, 820, parameter_name="Drift", default_value=8.0)
    sway = expr(mat, P.MaterialExpressionMultiply, -170, 760)
    link(sway_wave, sway, "A"); link(drift, sway, "B")
    still = expr(mat, P.MaterialExpressionConstant2Vector, -170, 860)
    sideways = expr(mat, P.MaterialExpressionAppendVector, -40, 800)
    link(sway, sideways, "A"); link(still, sideways, "B")
    total = expr(mat, P.MaterialExpressionAdd, 100, 400)
    link(offset, total, "A"); link(sideways, total, "B")
    MEL.connect_material_property(total, "", P.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    MEL.recompile_material(mat)
    assets.save_loaded_asset(mat)
    return mat


mpc = team_parameters()
home_mat = team_material("M_HomeTeam", "HomePrimary", mpc)
away_mat = team_material("M_AwayTeam", "AwayPrimary", mpc)
crowd_mat = crowd_material(mpc)
weather_mat = weather_material()
crowd_sections = []


def seats(x0, y0, x1, y1, z, team=0.0):
    """A crowd section on top of a stand block (z = the block's top)."""
    s = unreal.GridironCrowdSection()
    s.set_editor_property("min", unreal.Vector(x0, y0, z))
    s.set_editor_property("max", unreal.Vector(x1, y1, z))
    s.set_editor_property("team", team)
    crowd_sections.append(s)

box("Field", (0, 0, -5), (FIELD_LEN, FIELD_WID, 10), turf)
for side in (-1, 1):
    # The offense (home in the replay) attacks +X, so the home end zone sits at +X.
    box(f"EndZone_{'Home' if side > 0 else 'Away'}", (side * 55 * YARD, 0, 0.5), (10 * YARD, FIELD_WID, 1), home_mat if side > 0 else away_mat)

# Stands. The near side (-Y) stays low so the sideline broadcast cameras (y -36..-43 m,
# 7-15 m up) see over it; the far side rises higher. A home-colour band trims each tier.
HALF_WID = FIELD_WID / 2
for side, tiers in ((-1, [(600, 200), (1000, 420), (1400, 640)]), (1, [(600, 300), (1100, 800), (1600, 1300), (2100, 1800)])):
    for i, (dist, height) in enumerate(tiers):
        y = side * (HALF_WID + dist)
        box(f"Stand_{'Near' if side < 0 else 'Far'}_{i}", (0, y, height / 2), (FIELD_LEN + 1200, 400, height), concrete)
        box(f"StandTrim_{'Near' if side < 0 else 'Far'}_{i}", (0, y - side * 201, height - 40), (FIELD_LEN + 1200, 4, 60), home_mat)
        half = (FIELD_LEN + 1200) / 2
        if side < 0 and i == len(tiers) - 1:  # a visiting block in the upper near corner
            seats(-half, y - 200, -half / 2, y + 200, height, 1.0)
            seats(-half / 2, y - 200, half, y + 200, height)
        else:
            seats(-half, y - 200, half, y + 200, height)
for side in (-1, 1):  # end-zone stands in each team's colour; away fans fill the -X end
    x = side * (FIELD_LEN / 2 + 900)
    box(f"Stand_End_{side}", (x, 0, 350), (600, FIELD_WID + 1200, 700), concrete)
    box(f"StandTrim_End_{side}", (x - side * 301, 0, 660), (4, FIELD_WID + 1200, 60), home_mat if side > 0 else away_mat)
    seats(x - 300, -(HALF_WID + 600), x + 300, HALF_WID + 600, 700, 0.0 if side > 0 else 1.0)
    # Corner blocks close the bowl between the end stand and each sideline stand (lower on the
    # camera side so the sideline broadcast angles stay clear).
    for sy, height in ((-1, 500), (1, 900)):
        cy = sy * (HALF_WID + 1100)
        box(f"Stand_Corner_{side}_{sy}", (x, cy, height / 2), (600, 1000, height), concrete)
        seats(x - 300, cy - 500, x + 300, cy + 500, height, 0.0 if side > 0 else 1.0)

crowd = tagged(unreal.GridironCrowd, "Crowd", (0, 0, 0))
crowd.seats.set_material(0, crowd_mat)
crowd.set_editor_property("sections", crowd_sections)
crowd.rebuild()
unreal.log(f"Crowd: {crowd.seats.get_instance_count()} spectators in {len(crowd_sections)} sections")
weather = tagged(unreal.GridironWeather, "Weather", (0, 0, 0))
weather.set_editor_property("material", weather_mat)

# Light towers in the corners; GridironVenue switches the tagged spotlights on for dusk and night.
for sx in (-1, 1):
    for sy in (-1, 1):
        base = (sx * (FIELD_LEN / 2 + 1500), sy * (HALF_WID + 2600))
        box(f"Tower_{sx}_{sy}", (base[0], base[1], 2500), (120, 120, 5000), concrete)
        to_center = unreal.MathLibrary.find_look_at_rotation(unreal.Vector(base[0], base[1], 5000), unreal.Vector(0, 0, 0))
        light = actors.spawn_actor_from_class(unreal.SpotLight, unreal.Vector(base[0], base[1], 5000), to_center)
        light.set_actor_label(f"TowerLight_{sx}_{sy}")
        light.tags = ["GridironStadiumLight"]
        light.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
        comp = light.spot_light_component
        comp.set_editor_property("intensity", 0.0)
        comp.set_editor_property("attenuation_radius", 20000.0)
        comp.set_editor_property("outer_cone_angle", 38.0)
        comp.set_editor_property("inner_cone_angle", 20.0)
for yd in range(0, 101, 5):  # goal line to goal line, every 5 yards
    x = (yd - 50) * YARD
    box(f"Line_{yd:03d}", (x, 0, 1), (12 if yd % 10 else 18, FIELD_WID, 1), paint)
for side in (-1, 1):  # sidelines
    box(f"Sideline_{side}", (0, side * FIELD_WID / 2, 1), (FIELD_LEN, 12, 1), paint)

# Lighting tagged for UGridironSequenceManager::ApplyEnvironment.
# Movable lights: no lighting build needed, and the sequence manager changes time of day at runtime.
sun = tagged(unreal.DirectionalLight, "Sun", (0, 0, 5000), (-45, 30, 0), "GridironSun")
sun.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sky = tagged(unreal.SkyLight, "Sky", (0, 0, 600), tag="GridironSky")
sky.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
sky.light_component.set_editor_property("real_time_capture", True)
tagged(unreal.SkyAtmosphere, "Atmosphere", (0, 0, 0))
tagged(unreal.ExponentialHeightFog, "Fog", (0, 0, 0))
tagged(unreal.PlayerStart, "PlayerStart", (0, -4300, 1500), (-15, 90, 0))

ball = actors.spawn_actor_from_object(SPHERE, unreal.Vector(0, 0, 30))
ball.set_actor_label("Ball")
ball.set_actor_scale3d(unreal.Vector(0.28, 0.17, 0.17))
ball.static_mesh_component.set_material(0, ball_mat)
ball.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
ball.set_mobility(unreal.ComponentMobility.MOVABLE)

broadcast = tagged(unreal.GridironBroadcastDirector, "BroadcastDirector", (0, 0, 0))
director = tagged(unreal.GridironMatchDirector, "MatchDirector", (0, 0, 0))
director.set_editor_property("athlete_class", unreal.GridironAthlete)
director.set_editor_property("ball", ball)
director.set_editor_property("broadcast", broadcast)
tagged(unreal.GridironVenue, "Venue", (0, 0, 0))

levels.save_current_level()

# Cinematic templates and the library the sequence manager loads (they read MPC_Gridiron).
import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_cinematics.py"), encoding="utf-8").read())

unreal.log("Gridiron greybox level built: " + MAP)

# setup.ps1 passes -GridironQuit so a headless setup run closes the editor when done.
if "-gridironquit" in unreal.SystemLibrary.get_command_line().lower():
    unreal.SystemLibrary.quit_editor()
