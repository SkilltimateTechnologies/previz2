bl_info = {
    "name": "Previz Keys (.json)",
    "author": "Skilltimate Studio",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "File > Import > Previz Keys (.json)",
    "description": "Import a baked previz film: cameras with animated lens and focus, "
                   "character and prop transforms, and cut markers bound to cameras.",
    "category": "Import-Export",
}

import bpy
import json
import os
from bpy.props import StringProperty, BoolProperty, FloatProperty
from bpy_extras.io_utils import ImportHelper


# ---------------------------------------------------------------------------
# Axis conversion.
#
# The previz file is three.js convention: Y up, right handed, cameras looking
# down -Z.  Blender is Z up, right handed, cameras also looking down -Z.  The
# basis change is a -90 degree rotation about X, which for a position is
#
#     (x, y, z)  ->  (x, -z, y)
#
# A quaternion's vector part transforms the same way, and w is untouched.
# Because the camera's local axes convert with everything else, an imported
# camera ends up pointing where it pointed in previz with no extra correction.
# ---------------------------------------------------------------------------

def conv_pos(v):
    return (v[0], -v[2], v[1])


def conv_quat(q):
    # incoming [x, y, z, w]  ->  Blender (w, x, y, z)
    return (q[3], q[0], -q[2], q[1])


def set_linear(obj_or_data):
    """Previz keys are reduced against linear interpolation, so anything else
    would put the motion somewhere the previz never showed."""
    ad = getattr(obj_or_data, "animation_data", None)
    if not ad or not ad.action:
        return
    for fc in ad.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
        fc.update()


def key_track(obj, data_path, track, fps, offset, convert, index_count):
    """Write one reduced track onto an object or its data."""
    if not track:
        return
    for k in track:
        frame = offset + k["t"] * fps
        value = convert(k["v"])
        if index_count == 1:
            setattr(obj, data_path, value)
        else:
            setattr(obj, data_path, value)
        obj.keyframe_insert(data_path=data_path, frame=frame)


def make_collection(name, parent):
    col = bpy.data.collections.new(name)
    parent.children.link(col)
    return col


# ---------------------------------------------------------------------------

def build_camera(sc_col, cam, fps, offset, make_dof):
    cam_data = bpy.data.cameras.new(cam["name"])
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.sensor_width = 36.0          # previz solves against a 36mm gauge
    cam_obj = bpy.data.objects.new(cam["name"], cam_data)
    cam_obj.rotation_mode = 'QUATERNION'
    sc_col.objects.link(cam_obj)

    for k in cam.get("position", []):
        cam_obj.location = conv_pos(k["v"])
        cam_obj.keyframe_insert("location", frame=offset + k["t"] * fps)
    for k in cam.get("rotation", []):
        cam_obj.rotation_quaternion = conv_quat(k["v"])
        cam_obj.keyframe_insert("rotation_quaternion", frame=offset + k["t"] * fps)

    # Focal length is a real animatable channel in Blender, which is the main
    # reason to use this importer rather than glTF: glTF cannot carry a zoom.
    for k in cam.get("focal", []):
        cam_data.lens = float(k["v"])
        cam_data.keyframe_insert("lens", frame=offset + k["t"] * fps)

    if make_dof:
        cam_data.dof.use_dof = True
        for k in cam.get("focus", []):
            cam_data.dof.focus_distance = float(k["v"])
            cam_data.dof.keyframe_insert("focus_distance",
                                         frame=offset + k["t"] * fps)

    set_linear(cam_obj)
    set_linear(cam_data)
    return cam_obj


def build_empty(sc_col, entry, fps, offset, kind, size):
    obj = bpy.data.objects.new(entry["name"], None)
    obj.empty_display_type = kind
    obj.empty_display_size = size
    obj.rotation_mode = 'QUATERNION'
    sc_col.objects.link(obj)

    for k in entry.get("position", []):
        obj.location = conv_pos(k["v"])
        obj.keyframe_insert("location", frame=offset + k["t"] * fps)
    for k in entry.get("rotation", []):
        obj.rotation_quaternion = conv_quat(k["v"])
        obj.keyframe_insert("rotation_quaternion", frame=offset + k["t"] * fps)

    set_linear(obj)
    return obj


def import_previz(context, filepath, sequential, make_dof, make_markers):
    with open(filepath, "r", encoding="utf-8") as fh:
        film = json.load(fh)

    if film.get("schema", "").split("/")[0] != "previz-keys":
        raise ValueError("Not a previz keys file")

    fps = int(film.get("fps", 24))
    scene = context.scene
    scene.render.fps = fps
    scene.frame_start = 1

    root = bpy.data.collections.new(film.get("project", "previz"))
    scene.collection.children.link(root)

    offset = 1.0
    last_frame = 1
    made = {"cameras": 0, "characters": 0, "props": 0, "markers": 0}

    for sc in film.get("scenes", []):
        label = "SC%d %s" % (sc.get("index", 0), sc.get("name", ""))
        sc_col = make_collection(label.strip(), root)

        cams = {}
        for cam in sc.get("cameras", []):
            cams[cam["name"]] = build_camera(sc_col, cam, fps, offset, make_dof)
            made["cameras"] += 1

        for ch in sc.get("characters", []):
            build_empty(sc_col, ch, fps, offset, 'ARROWS', 0.5)
            made["characters"] += 1

        for pr in sc.get("props", []):
            build_empty(sc_col, pr, fps, offset, 'CUBE', 0.3)
            made["props"] += 1

        # Cut markers bound to their camera make the scene actually cut on
        # playback, which is the whole point of importing a shot list.
        if make_markers:
            for cut in sc.get("cuts", []):
                frame = int(round(offset + cut["t0"] * fps))
                name = "SC%d/%d %s" % (sc.get("index", 0), cut.get("shot", 0),
                                       cut.get("name", ""))
                mk = scene.timeline_markers.new(name.strip(), frame=frame)
                cam_obj = cams.get(cut.get("camera", ""))
                if cam_obj:
                    mk.camera = cam_obj
                made["markers"] += 1

        dur_frames = sc.get("duration", 0.0) * fps
        last_frame = max(last_frame, int(round(offset + dur_frames)))
        if sequential:
            offset += dur_frames

    scene.frame_end = max(2, last_frame)
    return made


# ---------------------------------------------------------------------------

class IMPORT_OT_previz_keys(bpy.types.Operator, ImportHelper):
    bl_idname = "import_scene.previz_keys"
    bl_label = "Import Previz Keys"
    bl_options = {'REGISTER', 'UNDO'}

    filename_ext = ".json"
    filter_glob: StringProperty(default="*.json", options={'HIDDEN'})

    sequential: BoolProperty(
        name="Lay scenes end to end",
        description="Offset each scene by the length of the ones before it, so the "
                    "whole film plays on one timeline. Turn off to stack every "
                    "scene at frame 1",
        default=True)

    make_dof: BoolProperty(
        name="Import focus distance",
        description="Enable depth of field on each camera and key its focus distance",
        default=True)

    make_markers: BoolProperty(
        name="Cut markers bound to cameras",
        description="Create a timeline marker per shot and bind it to that shot's "
                    "camera, so playback cuts between them",
        default=True)

    def execute(self, context):
        try:
            made = import_previz(context, self.filepath, self.sequential,
                                 self.make_dof, self.make_markers)
        except Exception as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        self.report({'INFO'},
                    "Previz: %d cameras, %d characters, %d props, %d cuts"
                    % (made["cameras"], made["characters"],
                       made["props"], made["markers"]))
        return {'FINISHED'}


def menu_func_import(self, context):
    self.layout.operator(IMPORT_OT_previz_keys.bl_idname,
                         text="Previz Keys (.json)")


def register():
    bpy.utils.register_class(IMPORT_OT_previz_keys)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)


def unregister():
    bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    bpy.utils.unregister_class(IMPORT_OT_previz_keys)


if __name__ == "__main__":
    register()
