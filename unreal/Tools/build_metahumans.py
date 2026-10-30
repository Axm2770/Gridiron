"""
Builds the MetaHuman football players for GridironDemo with the engine's MetaHuman Creator:
three body archetypes (skill, mid, big) in several skin tones, each auto-rigged and textured by
Epic's MetaHuman cloud service, then assembled with the optimized pipeline into
/Game/Gridiron/MetaHumans/Built/<Name>/ (Body/SKM_<Name>_BodyMesh, Face/SKM_<Name>_FaceMesh).
AGridironAthlete picks a body by the player's mass and a skin tone from the jersey number.

Requires an Epic account sign-in (the editor opens the browser the first time) and the
"MetaHuman Creator Core Data" optional engine content for clothing. Run through
unreal/Tools/metahumans.ps1, which opens the project through a short path: assembly writes
texture paths longer than Windows' 260-character limit otherwise.

Pass -GridironOnly=Name1,Name2 on the command line to build a subset, or -GridironUniformsOnly
to only redo the uniforms (M_PlayerUniform and each body's MI_<Name>_Uniform) on built bodies.
"""
import unreal

ROOT = "/Game/Gridiron/MetaHumans"
assets = unreal.EditorAssetLibrary
sub = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)

# Measurements in cm. "Masculine/Feminine" runs -2 (masculine) to 2 (feminine).
ARCHETYPES = {
    "Skill": {"Height": 184, "Masculine/Feminine": -1.6, "Muscularity": 1.4, "Fat": -0.6, "Across Shoulder": 44, "Waist": 80},
    "Mid": {"Height": 191, "Masculine/Feminine": -1.8, "Muscularity": 1.8, "Fat": 0.0, "Across Shoulder": 47, "Waist": 88},
    "Big": {"Height": 195, "Masculine/Feminine": -1.8, "Muscularity": 1.2, "Fat": 1.6, "Across Shoulder": 50, "Waist": 110},
}
# Skin tone palette coordinates (u: light to deep, v: undertone).
TONES = {"A": (0.25, 0.45), "B": (0.55, 0.55), "C": (0.82, 0.6)}


def log(message):
    unreal.log("Gridiron MetaHumans: " + message)


def character_asset(name):
    path = f"{ROOT}/{name}"
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    return tools.create_asset(name, ROOT, unreal.MetaHumanCharacter, unreal.new_object(type=unreal.MetaHumanCharacterFactoryNew))


def shape_body(character, measurements):
    # Iterating an unreal.Array yields copies, so build a new list rather than editing in place.
    constraints = []
    for c in sub.get_body_constraints(character):
        c = c.copy()
        if str(c.name) in measurements:
            c.set_editor_property("is_active", True)
            c.set_editor_property("target_measurement", float(measurements[str(c.name)]))
        constraints.append(c)
    missing = set(measurements) - {str(c.name) for c in constraints}
    if missing:
        log(f"unknown body constraints: {', '.join(sorted(missing))}")
    sub.set_body_constraints(character, constraints)
    sub.commit_body_state(character)


def build(name, measurements, tone):
    character = character_asset(name)
    if not sub.try_add_object_to_edit(character):
        raise RuntimeError(f"cannot edit {name}")
    try:
        skin = character.skin_settings  # read-only on the asset: edit a copy and commit it
        tone_settings = skin.skin  # nested structs come back as copies too
        tone_settings.u, tone_settings.v = tone
        skin.skin = tone_settings
        sub.commit_skin_settings(character, skin)
        shape_body(character, measurements)
        rig = unreal.MetaHumanCharacterAutoRiggingRequestParams()
        rig.blocking, rig.report_progress = True, False
        rig.rig_type = unreal.MetaHumanRigType.JOINTS_ONLY  # no facial animation: keeps 22 players cheap
        sub.request_auto_rigging(character, rig)
        textures = unreal.MetaHumanCharacterTextureRequestParams()
        textures.blocking, textures.report_progress = True, False
        sub.request_texture_sources(character, textures)
        params = unreal.MetaHumanCharacterEditorBuildParameters()
        params.pipeline_type = unreal.MetaHumanDefaultPipelineType.OPTIMIZED
        params.pipeline_quality = unreal.MetaHumanQualityLevel.LOW
        params.absolute_build_path = f"{ROOT}/Built"
        params.common_folder_path = f"{ROOT}/Common"
        params.enable_wardrobe_item_validation = False
        try:
            sub.build_meta_human(character=character, params=params)
        except Exception as e:
            # The shared face control rigs report link warnings as errors; assembly still succeeds.
            log(f"{name}: build reported: {str(e).splitlines()[0][:160]}")
    finally:
        sub.remove_object_to_edit(character)
    body = f"{ROOT}/Built/{name}/Body/SKM_{name}_BodyMesh"
    if not assets.does_asset_exist(body):
        raise RuntimeError(f"{name}: assembly produced no body mesh")
    log(f"built {name}")


MEL = unreal.MaterialEditingLibrary
UNIFORM = f"{ROOT}/M_PlayerUniform"
# Regions as fractions of standing height in the body's reference pose (origin at the feet, X
# across the body). The torso and leg bands are kept narrow so the arms and hands stay skin.
UNIFORM_HLSL = """
float h = Pos.z / Height;
float x = abs(Pos.x) / Height;
float e = 0.004;
float jersey = smoothstep(0.56 - e, 0.56 + e, h) * (1 - smoothstep(0.855 - e, 0.855 + e, h)) * (1 - smoothstep(0.17 - e, 0.17 + e, x));
float pants = smoothstep(0.27 - e, 0.27 + e, h) * (1 - smoothstep(0.56 - e, 0.56 + e, h)) * (1 - smoothstep(0.15 - e, 0.15 + e, x));
float cleats = 1 - smoothstep(0.045 - e, 0.045 + e, h);
float socks = (1 - cleats) * (1 - smoothstep(0.27 - e, 0.27 + e, h));
float3 c = lerp(Skin, Jersey, jersey);
c = lerp(c, Pants, pants);
c = lerp(c, Jersey * 0.6, socks);
c = lerp(c, float3(0.015, 0.015, 0.015), cleats);
return float4(c, saturate(jersey + pants + socks + cleats));
"""


def expr(mat, cls, x, y, **props):
    n = MEL.create_material_expression(mat, cls, x, y)
    for key, value in props.items():
        n.set_editor_property(key, value)
    return n


def uniform_material():
    """M_PlayerUniform: the baked MetaHuman skin with a football uniform painted over it by
    reference-pose position (jersey in "Paint Tint", the athlete's team colour; pants; team socks;
    black cleats). Masking the pre-skinned position keeps the kit on the right body parts while
    animating, and costs no cloth simulation for 22 players."""
    if assets.does_asset_exist(UNIFORM):  # bodies reference it: rebuild the graph in place
        mat = unreal.load_asset(UNIFORM)
        MEL.delete_all_material_expressions(mat)
    else:
        tools = unreal.AssetToolsHelpers.get_asset_tools()
        mat = tools.create_asset("M_PlayerUniform", ROOT, unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("used_with_skeletal_mesh", True)
    mat.set_editor_property("used_with_morph_targets", True)
    P = unreal
    skin = expr(mat, P.MaterialExpressionTextureSampleParameter2D, -900, -300, parameter_name="Skin Color",
                texture=unreal.load_asset("/Engine/EngineResources/WhiteSquareTexture"))
    normal = expr(mat, P.MaterialExpressionTextureSampleParameter2D, -900, 0, parameter_name="Skin Normal",
                  texture=unreal.load_asset("/Engine/EngineMaterials/DefaultNormal"), sampler_type=P.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    jersey = expr(mat, P.MaterialExpressionVectorParameter, -900, 250, parameter_name="Paint Tint", default_value=unreal.LinearColor(0.6, 0.05, 0.05, 1))
    pants = expr(mat, P.MaterialExpressionVectorParameter, -900, 400, parameter_name="Pants Color", default_value=unreal.LinearColor(0.75, 0.75, 0.72, 1))
    height = expr(mat, P.MaterialExpressionScalarParameter, -900, 550, parameter_name="Body Height", default_value=185.0)
    skinned = expr(mat, P.MaterialExpressionPreSkinnedPosition, -1100, 650)
    pos = expr(mat, P.MaterialExpressionVertexInterpolator, -900, 650)  # vertex-shader only: interpolate to pixels
    MEL.connect_material_expressions(skinned, "", pos, "VS")

    custom = expr(mat, P.MaterialExpressionCustom, -500, 200, code=UNIFORM_HLSL, description="Uniform",
                  output_type=P.CustomMaterialOutputType.CMOT_FLOAT4)
    names = ["Pos", "Height", "Skin", "Jersey", "Pants"]
    inputs = []
    for name in names:
        i = P.CustomInput()
        i.set_editor_property("input_name", name)
        inputs.append(i)
    custom.set_editor_property("inputs", inputs)
    for src, name in zip([pos, height, skin, jersey, pants], names):
        MEL.connect_material_expressions(src, "RGB" if src is skin else "", custom, name)

    colour = expr(mat, P.MaterialExpressionComponentMask, -250, 100, r=True, g=True, b=True, a=False)
    MEL.connect_material_expressions(custom, "", colour, "")
    MEL.connect_material_property(colour, "", P.MaterialProperty.MP_BASE_COLOR)
    cloth = expr(mat, P.MaterialExpressionComponentMask, -250, 300, r=False, g=False, b=False, a=True)
    MEL.connect_material_expressions(custom, "", cloth, "")
    rough = expr(mat, P.MaterialExpressionLinearInterpolate, -50, 300, const_a=0.5, const_b=0.8)
    MEL.connect_material_expressions(cloth, "", rough, "Alpha")
    MEL.connect_material_property(rough, "", P.MaterialProperty.MP_ROUGHNESS)
    flat = expr(mat, P.MaterialExpressionConstant3Vector, -250, 0, constant=unreal.LinearColor(0, 0, 1, 0))
    bump = expr(mat, P.MaterialExpressionLinearInterpolate, -50, 0)
    MEL.connect_material_expressions(normal, "RGB", bump, "A")
    MEL.connect_material_expressions(flat, "", bump, "B")
    MEL.connect_material_expressions(cloth, "", bump, "Alpha")
    MEL.connect_material_property(bump, "", P.MaterialProperty.MP_NORMAL)
    MEL.delete_unused_expressions(mat)
    MEL.recompile_material(mat)
    assets.save_loaded_asset(mat)
    log("M_PlayerUniform compiled")
    return mat


def dress(name, height, parent):
    """Gives a built body its uniform instance (baked skin textures, height for the regions)."""
    folder = f"{ROOT}/Built/{name}/Body"
    body = unreal.load_asset(f"{folder}/SKM_{name}_BodyMesh")
    if not body:
        return False
    path = f"{folder}/MI_{name}_Uniform"
    if assets.does_asset_exist(path):
        mi = unreal.load_asset(path)
    else:
        tools = unreal.AssetToolsHelpers.get_asset_tools()
        mi = tools.create_asset(f"MI_{name}_Uniform", folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, parent)
    MEL.set_material_instance_texture_parameter_value(mi, "Skin Color", unreal.load_asset(f"{folder}/Baked/T_Body_BC"))
    MEL.set_material_instance_texture_parameter_value(mi, "Skin Normal", unreal.load_asset(f"{folder}/Baked/T_Body_N"))
    MEL.set_material_instance_scalar_parameter_value(mi, "Body Height", float(height))
    assets.save_loaded_asset(mi)
    materials = []
    for slot in body.get_editor_property("materials"):  # copies: write the edited list back
        slot = slot.copy()
        current = slot.get_editor_property("material_interface")
        if current and "Body" in current.get_name():
            slot.set_editor_property("material_interface", mi)
        materials.append(slot)
    body.set_editor_property("materials", materials)
    assets.save_loaded_asset(body)
    log(f"dressed {name}")
    return True


def share_mannequin_animation():
    """Let the mannequin's locomotion play on MetaHuman bodies (same bone names)."""
    manny = unreal.load_asset("/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin")
    for path in assets.list_assets(f"{ROOT}/Common", recursive=True):
        if path.endswith("metahuman_base_skel"):
            skeleton = unreal.load_asset(path)
            skeleton.set_editor_property("compatible_skeletons", [manny])
            assets.save_loaded_asset(skeleton)
            log(f"{path} accepts mannequin animation")


if not assets.does_asset_exist("/MetaHumanCharacter/Optional/BodyTextures/T_Skin_V1_Body_BC"):
    raise RuntimeError("MetaHuman Creator optional content is missing (Epic Games Launcher > UE 5.8 > Options > MetaHuman Creator Core Data)")

line = unreal.SystemLibrary.get_command_line()
only = None
for token in line.split():
    if token.lower().startswith("-gridirononly="):
        only = set(token.split("=", 1)[1].split(","))
uniforms_only = "-gridironuniformsonly" in line.lower()
built = []
for shape, measurements in ARCHETYPES.items():
    for tone_name, tone in TONES.items():
        name = f"{shape}{tone_name}"
        if (only and name not in only) or uniforms_only:
            continue
        try:
            build(name, measurements, tone)
            built.append(name)
        except Exception as e:
            unreal.log_error(f"Gridiron MetaHumans: {name} failed: {e}")
uniform = uniform_material()
for shape, measurements in ARCHETYPES.items():
    for tone_name in TONES:
        dress(f"{shape}{tone_name}", measurements["Height"], uniform)
share_mannequin_animation()
assets.save_directory(ROOT, only_if_is_dirty=False, recursive=True)
log(f"done: {len(built)} built ({', '.join(built)})")
if "-gridironquit" in line.lower():
    unreal.SystemLibrary.quit_editor()
