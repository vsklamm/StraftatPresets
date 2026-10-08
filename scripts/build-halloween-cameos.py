"""Blender: export the game's Zastava and Cochin for the short Halloween scene.

Run with --background --factory-startup --python scripts/build-halloween-cameos.py
and optionally -- /path/to/STRAFTAT-Public. Source files remain untouched.
"""
import bpy
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[sys.argv.index('--') + 1]).expanduser() if '--' in sys.argv else Path.home() / 'dev/STRAFTAT-Public'
ASSETS = SOURCE / 'STRAFTAT/Assets'
OUTPUT = ROOT / 'public/halloween'


def surface(name, texture=None, color=(1, 1, 1), metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .78
    shader.inputs['Metallic'].default_value = metallic
    if texture:
        image = bpy.data.images.load(str(ASSETS / texture))
        if max(image.size) > 512:
            scale = 512 / max(image.size)
            image.scale(round(image.size[0] * scale), round(image.size[1] * scale))
        image.pack()
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    return mat


def export(kind, source, texture):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=str(ASSETS / source))
    meshes = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    paint = surface('Original ' + kind + ' paint', texture)
    glass = surface('Dark Zastava windows', color=(.045, .07, .075), metallic=.25) if kind == 'zastava' else None
    for obj in meshes:
        # A static pig rides like the car. Do not export a rig or animation clips.
        for modifier in list(obj.modifiers):
            obj.modifiers.remove(modifier)
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.data.materials.clear()
        obj.data.materials.append(glass if 'Window' in obj.name else paint)
        if kind == 'cochin':
            # Both exported actors face +Z in glTF, so they share one drive transform.
            for v in obj.data.vertices:
                v.co.x *= -1
                v.co.y *= -1
    floor = min(v.co.z for obj in meshes for v in obj.data.vertices)
    for obj in meshes:
        for v in obj.data.vertices:
            v.co.z -= floor
        if 'Wheel' in obj.name:
            coords = [v.co for v in obj.data.vertices]
            center = Vector([(min(v[i] for v in coords) + max(v[i] for v in coords)) / 2 for i in range(3)])
            for v in obj.data.vertices:
                v.co -= center
            obj.location = center
    # Keep the four wheel pivots, but combine the static body and glass surfaces.
    bpy.ops.object.select_all(action='DESELECT')
    static = [o for o in meshes if 'Wheel' not in o.name]
    for obj in static:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = static[0]
    bpy.ops.object.join()
    bpy.context.object.name = 'Zastava body' if kind == 'zastava' else 'Cochin'
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (kind + '.glb')), export_format='GLB',
        use_selection=True, export_animations=False, export_skins=False, export_cameras=False,
        export_lights=False, export_extras=False, export_image_format='JPEG')
    print('EXPORTED', kind, 'triangles', sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes))
    # Inspection renders use the exact exported materials and retained source meshes.
    bpy.ops.object.camera_add(location=(5, -7, 4))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, .8)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 5.5 if kind == 'zastava' else 3.8
    scene = bpy.context.scene
    scene.camera = camera
    for location, power in [((2, -4, 6), 650), ((-4, -1, 3), 400), ((0, 4, 4), 450)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = 5
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.film_transparent = True
    scene.world.color = (.15, .15, .15)
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(Path(tempfile.gettempdir()) / ('straftat-' + kind + '.png'))
    bpy.ops.render.render(write_still=True)


export('zastava', 'Environment/Props/SM_ZastavaCar_00.fbx', 'Environment/Props/Materials/Textures/Zastava/T_Zastava_00_BC.jpg')
export('cochin', 'Character/NPCs/Cochin/SK_Cochin00.fbx', 'Character/NPCs/Cochin/T_Cochin00_BC.png')
