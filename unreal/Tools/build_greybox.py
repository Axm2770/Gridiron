"""
Builds /Game/Gridiron/Maps/Greybox in the GridironDemo project using only engine content:
a regulation field with yard lines, sky and lights tagged for the sequence manager, a ball,
the match director (pooling 22 greybox athletes) and the broadcast camera director.

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
    a = actors.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))
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
endzone = material("MI_EndZone", (0.12, 0.22, 0.45))
ball_mat = material("MI_Ball", (0.42, 0.2, 0.08))

box("Field", (0, 0, -5), (FIELD_LEN, FIELD_WID, 10), turf)
for side in (-1, 1):
    box(f"EndZone_{'Home' if side > 0 else 'Away'}", (side * 55 * YARD, 0, 0.5), (10 * YARD, FIELD_WID, 1), endzone)
for yd in range(0, 101, 5):  # goal line to goal line, every 5 yards
    x = (yd - 50) * YARD
    box(f"Line_{yd:03d}", (x, 0, 1), (12 if yd % 10 else 18, FIELD_WID, 1), paint)
for side in (-1, 1):  # sidelines
    box(f"Sideline_{side}", (0, side * FIELD_WID / 2, 1), (FIELD_LEN, 12, 1), paint)

# Lighting tagged for UGridironSequenceManager::ApplyEnvironment.
tagged(unreal.DirectionalLight, "Sun", (0, 0, 5000), (-45, 30, 0), "GridironSun")
tagged(unreal.SkyLight, "Sky", (0, 0, 600), tag="GridironSky")
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

levels.save_current_level()
unreal.log("Gridiron greybox level built: " + MAP)

# setup.ps1 passes -GridironQuit so a headless setup run closes the editor when done.
if "-gridironquit" in unreal.SystemLibrary.get_command_line().lower():
    unreal.SystemLibrary.quit_editor()
