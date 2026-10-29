"""
Builds /Game/Gridiron/Maps/Greybox in the GridironDemo project using only engine content:
a regulation field with yard lines and team-coloured end zones, greybox stands and light towers,
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


mpc = team_parameters()
home_mat = team_material("M_HomeTeam", "HomePrimary", mpc)
away_mat = team_material("M_AwayTeam", "AwayPrimary", mpc)

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
for side in (-1, 1):  # end-zone stands in each team's colour
    x = side * (FIELD_LEN / 2 + 900)
    box(f"Stand_End_{side}", (x, 0, 350), (600, FIELD_WID + 1200, 700), concrete)
    box(f"StandTrim_End_{side}", (x - side * 301, 0, 660), (4, FIELD_WID + 1200, 60), home_mat if side > 0 else away_mat)

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
unreal.log("Gridiron greybox level built: " + MAP)

# setup.ps1 passes -GridironQuit so a headless setup run closes the editor when done.
if "-gridironquit" in unreal.SystemLibrary.get_command_line().lower():
    unreal.SystemLibrary.quit_editor()
