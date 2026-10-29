"""
Builds the cinematic templates the game asks for (cinematic.trigger → template name) and the
library asset UGridironSequenceManager loads by default:

  /Game/Gridiron/Cinematics/LS_*                   one Level Sequence per template
  /Game/Gridiron/Cinematics/DA_GridironCinematics  template → sequence + performer class

Each sequence has a spawned cine camera with a camera-cut track and a camera move framed on the
library's stage mark (behind the home end zone, performers facing -X). Performers are spawned and
dressed at runtime (AGridironStageActor), so a template works for every team and player.
Run from build_greybox.py, or alone: Tools > Execute Python Script.
"""
import math
import unreal

FOLDER = "/Game/Gridiron/Cinematics"
FPS = 30
STAGE = unreal.Vector(5000, 0, 0)   # matches UGridironCinematicLibrary::StageLocation
LOOK = unreal.Vector(5000, 0, 130)  # chest height on the stage mark

# template: (seconds, camera start, camera end, focal length mm). Template names come from
# dist/bridge/ue-protocol.mjs (CINEMATICS); keep them in sync.
TEMPLATES = {
    "LS_Championship_Celebration": (8.0, (4200, -500, 90), (4550, 250, 140), 24.0),
    "LS_Locker_Somber": (6.0, (4300, 150, 170), (4550, 80, 160), 50.0),
    "LS_Walkoff_Mob": (5.0, (4400, -300, 150), (4600, 200, 170), 28.0),
    "LS_Sideline_Reaction": (4.0, (4500, -150, 160), (4600, -100, 165), 50.0),
    "LS_DraftNight_Stage": (6.0, (4200, 0, 500), (4500, 0, 160), 35.0),
    "LS_PressConference_Podium": (5.0, (4550, 0, 160), (4570, 0, 160), 50.0),
    "LS_Locker_Confrontation": (6.0, (4500, -250, 165), (4500, 250, 165), 35.0),
    "LS_Injury_Cart": (5.0, (4400, 300, 200), (4550, 100, 140), 35.0),
    "LS_Office_Phone": (4.0, (4600, -80, 165), (4650, -60, 165), 50.0),
}

assets = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()


def look_rotation(cam):
    d = LOOK - unreal.Vector(*cam)
    yaw = math.degrees(math.atan2(d.y, d.x))
    pitch = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
    return pitch, yaw


def build_sequence(name, seconds, start, end, focal):
    path = f"{FOLDER}/{name}"
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    seq = tools.create_asset(name, FOLDER, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    frames = int(seconds * FPS)
    seq.set_display_rate(unreal.FrameRate(FPS, 1))
    seq.set_playback_start(0)
    seq.set_playback_end(frames)

    cam = seq.add_spawnable_from_class(unreal.CineCameraActor)
    template = cam.get_object_template()
    comp = None
    if template:
        comp = template.get_cine_camera_component() or template.get_editor_property("camera_component")
    if comp:
        comp.set_editor_property("current_focal_length", focal)
        focus = comp.get_editor_property("focus_settings")
        focus.set_editor_property("focus_method", unreal.CameraFocusMethod.DISABLE)  # everything sharp
        comp.set_editor_property("focus_settings", focus)

    cut_track = seq.add_track(unreal.MovieSceneCameraCutTrack)
    cut = cut_track.add_section()
    cut.set_range(0, frames)
    cut.set_camera_binding_id(seq.get_portable_binding_id(seq, cam) if hasattr(seq, "get_portable_binding_id") else unreal.MovieSceneSequenceExtensions.get_portable_binding_id(seq, seq, cam))

    move = cam.add_track(unreal.MovieScene3DTransformTrack).add_section()
    move.set_range(0, frames)
    channels = move.get_all_channels()  # loc x, y, z, rot roll, pitch, yaw, scale x, y, z
    for frame, pos in ((0, start), (frames, end)):
        pitch, yaw = look_rotation(pos)
        for index, value in enumerate((pos[0], pos[1], pos[2], 0.0, pitch, yaw)):
            channels[index].add_key(unreal.FrameNumber(frame), value)
    assets.save_loaded_asset(seq)
    return seq


def build_library(sequences):
    path = f"{FOLDER}/DA_GridironCinematics"
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    factory = unreal.DataAssetFactory()
    factory.set_editor_property("data_asset_class", unreal.GridironCinematicLibrary)
    lib = tools.create_asset("DA_GridironCinematics", FOLDER, unreal.GridironCinematicLibrary, factory)
    templates = {}
    for name, seq in sequences.items():
        entry = unreal.GridironCinematicTemplate()
        entry.set_editor_property("sequence", seq)
        entry.set_editor_property("default_performer", unreal.GridironStageActor)
        templates[name] = entry
    lib.set_editor_property("templates", templates)
    mpc = unreal.load_asset("/Game/Gridiron/Materials/MPC_Gridiron")
    if mpc:
        lib.set_editor_property("team_parameters", mpc)
    assets.save_loaded_asset(lib)
    return lib


sequences = {name: build_sequence(name, *spec) for name, spec in TEMPLATES.items()}
build_library(sequences)
unreal.log(f"Gridiron cinematics built: {len(sequences)} templates")
