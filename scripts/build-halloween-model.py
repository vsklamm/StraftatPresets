"""Blender 5.2: --background --factory-startup --python scripts/build-halloween-model.py.
Optional argument after --: STRAFTAT-Public checkout. Source assets remain untouched.
"""
import bpy
import math
import sys
import tempfile
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[sys.argv.index('--') + 1]).expanduser() if '--' in sys.argv else Path.home() / 'dev/STRAFTAT-Public'
ASSETS = SOURCE / 'STRAFTAT/Assets'
OUTPUT = ROOT / 'public/halloween'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(ASSETS / 'Weapons/GlandGrenade/SM_Gland_Grenade_02.fbx'))
objects = list(bpy.context.selected_objects)
body = next(o for o in objects if 'Goupille' not in o.name)


def material(name, color, metallic=0, emission=0, vertex_colors=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .76 if not metallic else .58
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    if vertex_colors:
        node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        node.layer_name = 'Gland patina'
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    return mat


skin = material('Pumpkin orange with original gland patina', (1, 1, 1), vertex_colors=True)
metal = material('Pumpkin-orange gland pin', (1, 1, 1), metallic=.15, vertex_colors=True)
carving = material('Charred sockets and carved grin', (.075, .024, .014))
lids = material('Heavy burnt-orange eyelids', (.55, .16, .018))
fire = material('Aboubi ivory eyes and candlelit teeth', (.73, .72, .43), emission=.6)
texture = bpy.data.images.load(str(ASSETS / 'Weapons/GlandGrenade/T_GralndGrenade_00_BC.png'))
pixels = list(texture.pixels)
tex_width, tex_height = texture.size
for obj in objects:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.clear()
    obj.data.materials.append(skin if obj == body else metal)
    colors = obj.data.color_attributes.new(name='Gland patina', type='BYTE_COLOR', domain='CORNER')
    uv = obj.data.uv_layers.active.data
    for i, loop in enumerate(obj.data.loops):
        u, v = uv[i].uv
        pixel = (min(tex_height-1, int(v * tex_height)) * tex_width + min(tex_width-1, int(u * tex_width))) * 4
        r, g, b = pixels[pixel:pixel+3]
        # Keep the source's mottling, but paint both shell and hardware pumpkin orange.
        # A lifted floor keeps broad rusty patches from reading as brown.
        orange = min(.98, .52 + r * .65)
        rgb = (orange, orange * .43, orange * .045)
        colors.data[i].color_srgb = (*rgb, 1)
    for vertex in obj.data.vertices:
        x, y, z = vertex.co
        if obj == body and z < -.015:
            theta = math.atan2(y, x)
            radius = math.hypot(x, y)
            level = max(-1, min(1, (z + .077) / .087))
            profile = .11 * math.sqrt(max(0, 1 - level * level))
            target = (.25 * radius + .75 * profile) * (1 + .10 * math.cos(theta * 9))
            if radius > .0001:
                vertex.co.x *= target / radius
                vertex.co.y *= target / radius
        vertex.co.z = (z + .035) * (.82 if z < -.035 else 1)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    obj.name = 'Gland pumpkin body' if obj == body else 'Original gland pin'
bpy.context.view_layer.update()

# Sample the real character's facial relief onto the front of the pumpkin.
# Only a small surface patch is exported, not the head, body, rig or game textures.
bpy.ops.import_scene.fbx(filepath=str(ASSETS / 'Character/Aboubi/StaticMeshes/SM_Aboubi00.fbx'))
character_objects = list(bpy.context.selected_objects)
head = next(o for o in character_objects if 'Head' in o.name)
bpy.context.view_layer.objects.active = head
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def front_point(mesh, x, z):
    hit, point, _, face = mesh.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
    return (point, face) if hit else (None, None)


def make_mesh(name, verts, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.000001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    objects.append(obj)
    return obj


verts, faces, face_colors = [], [], []
columns, rows = 32, 30
for row in range(rows+1):
    z = -.094 + row / rows * .125
    for column in range(columns+1):
        x = -.073 + column / columns * .146
        point, face_index = front_point(body, x, z)
        head_point, _ = front_point(head, x / .60, (z + .002) / .50 + 1.83)
        if point is None:
            verts.append((x, 0, z)); face_colors.append(None); continue
        envelope = max(0, 1 - (x/.074)**6) * max(0, 1 - ((z+.0315)/.063)**6)
        # The nose and lips come from Aboubi. Clamp the separate cigarette projection.
        relief = max(0, min(.085, -head_point.y - .105)) * .55 if head_point is not None else 0
        point.y -= (.0015 + relief) * envelope
        verts.append(tuple(point))
        source_colors = body.data.color_attributes['Gland patina'].data
        polygon = body.data.polygons[face_index]
        face_colors.append(sum((Vector(source_colors[i].color) for i in polygon.loop_indices), Vector((0,0,0,0))) / len(polygon.loop_indices))
for row in range(rows):
    for column in range(columns):
        a = row*(columns+1)+column
        quad = (a, a+1, a+columns+2, a+columns+1)
        if all(face_colors[i] is not None for i in quad):
            faces.append(quad)
relief = make_mesh('Aboubi facial relief', verts, faces, skin)
colors = relief.data.color_attributes.new(name='Gland patina', type='BYTE_COLOR', domain='CORNER')
for i, loop in enumerate(relief.data.loops):
    colors.data[i].color = face_colors[loop.vertex_index]
for polygon in relief.data.polygons:
    polygon.use_smooth = True
for obj in character_objects:
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.view_layer.update()


def oval(cx, cz, rx, rz, count=16):
    return [(cx+math.cos(i/count*math.tau)*rx, cz+math.sin(i/count*math.tau)*rz) for i in range(count)]


# Drooping, pupil-less eyes under heavy lids. The asymmetric cuts keep a pumpkin grin.
eye = [(.019,-.012), (.026,-.004), (.039,.001), (.051,.001), (.059,-.006),
       (.053,-.014), (.042,-.017), (.03,-.016)]
eyes = [eye, [(-x,z) for x,z in reversed(eye)]]
mouth = [(-.055,-.060), (-.037,-.070), (-.017,-.073), (0,-.074), (.019,-.072), (.039,-.066), (.057,-.054),
         (.047,-.077), (.029,-.086), (.012,-.087), (0,-.084), (-.018,-.089), (-.039,-.082)]
sockets = [oval(-.039,-.008,.025,.022), oval(.039,-.008,.025,.022), mouth]
bags = [oval(-.039,-.009,.022,.0175), oval(.039,-.009,.022,.0175)]
teeth = [[(-.035,-.071),(-.022,-.073),(-.025,-.082),(-.032,-.080)],
         [(.012,-.075),(.026,-.072),(.024,-.081),(.015,-.083)],
         [(.031,-.082),(.042,-.078),(.038,-.072)]]


def project_shapes(name, shapes, offset, mat):
    verts, faces = [], []
    def triangle(a, b, c, depth):
        if depth:
            ab, bc, ca = (a+b)/2, (b+c)/2, (c+a)/2
            for points in [(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]:
                triangle(*points, depth-1)
            return
        indices = []
        for v in (a,b,c):
            point, _ = front_point(relief, v.x, v.y)
            if point is None:
                point, _ = front_point(body, v.x, v.y)
            if point is None:
                raise RuntimeError('Carving missed the grenade')
            indices.append(len(verts))
            verts.append((v.x, point.y-offset, v.y))
        faces.append(indices)
    for shape in shapes:
        polygon = [Vector((x,z,0)) for x,z in shape]
        for indices in tessellate_polygon([polygon]):
            triangle(*(polygon[i] for i in indices), 2)
    return make_mesh(name, verts, faces, mat)


project_shapes('Carved sockets and grin', sockets, .004, carving)
project_shapes('Heavy lower eyelids', bags, .007, lids)
project_shapes('Blank eyes and pumpkin teeth', eyes+teeth, .010, fire)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    for vertex in obj.data.vertices:
        vertex.co *= 7
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / 'gland-pumpkin.glb'), export_format='GLB', use_selection=True, export_texcoords=False, export_animations=False, export_cameras=False, export_lights=False, export_extras=False)

# Render the same asset for reduced motion / unavailable graphics.
bpy.ops.object.camera_add(location=(1.3,-5,1.25))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,-.08))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=2.65
scene=bpy.context.scene; scene.camera=camera
for location,power,size in [((1,-3,4),220,3),((-3,-1,1),100,3),((1,3,3),320,2)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    lamp=bpy.context.object; lamp.data.energy=power; lamp.data.shape='DISK'; lamp.data.size=size
    lamp.rotation_euler=(-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.world.color=(.15,.15,.15); scene.render.film_transparent=True
scene.render.resolution_x=512; scene.render.resolution_y=512; scene.render.resolution_percentage=100
scene.render.filepath=str(Path(tempfile.gettempdir()) / 'straftat-gland-pumpkin.png')
bpy.ops.render.render(write_still=True)
print('Exported', OUTPUT / 'gland-pumpkin.glb')
