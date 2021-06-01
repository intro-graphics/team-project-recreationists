import {defs, tiny} from './examples/common.js';
import {
    Buffered_Texture,
    Color_Phong_Shader,
    Depth_Texture_Shader_2D,
    LIGHT_DEPTH_TEX_SIZE,
    Shadow_Textured_Phong_Shader
} from './shadow-shaders.js'

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene,
} = tiny;

const TextureSquare =
    class Square extends tiny.Vertex_Buffer {
        constructor() {
            super("position", "normal", "texture_coord");
            this.arrays.position = [
                vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0),
                vec3(1, 1, 0), vec3(1, 0, 0), vec3(0, 1, 0)
            ];
            this.arrays.normal = [
                vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1),
                vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1),
            ];
            this.arrays.texture_coord = [
                vec(0, 0), vec(1, 0), vec(0, 1),
                vec(1, 1), vec(1, 0), vec(0, 1)
            ]
        }
    }

// used for collision detection
class Body {
    // **Body** can store and update the properties of a 3D body that incrementally
    // moves from its previous place due to velocities.  It conforms to the
    // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
    constructor(shape, material, size, socket_id = "") { // socket_id is optional and only used for players
        Object.assign(this,
            {shape, material, size})
        this.socket_id = socket_id;
    }

    // (within some margin of distance).
    static intersect_cube(p, margin = 0) {
        return p.every(value => value >= -1 - margin && value <= 1 + margin)
    }

    static intersect_sphere(p, margin = 0) {
        return p.dot(p) < 1 + margin;
    }

    emplace(location_matrix, linear_velocity, angular_velocity, spin_axis = vec3(0, 0, 0).randomized(1).normalized()) {                               // emplace(): assign the body's initial values, or overwrite them.
        this.center = location_matrix.times(vec4(0, 0, 0, 1)).to3();
        this.rotation = Mat4.translation(...this.center.times(-1)).times(location_matrix);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = location_matrix;
        this.temp_matrix = Mat4.identity();
        return Object.assign(this, {linear_velocity, angular_velocity, spin_axis})
    }

    advance(time_amount) {
        // advance(): Perform an integration (the simplistic Forward Euler method) to
        // advance all the linear and angular velocities one time-step forward.
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // Apply the velocities scaled proportionally to real time (time_amount):
        // Linear velocity first, then angular:
        this.center = this.center.plus(this.linear_velocity.times(time_amount));
        this.rotation.pre_multiply(Mat4.rotation(time_amount * this.angular_velocity, ...this.spin_axis));
    }

    // The following are our various functions for testing a single point,
    // p, against some analytically-known geometric volume formula

    blend_rotation(alpha) {
        // blend_rotation(): Just naively do a linear blend of the rotations, which looks
        // ok sometimes but otherwise produces shear matrices, a wrong result.

        // TODO:  Replace this function with proper quaternion blending, and perhaps
        // store this.rotation in quaternion form instead for compactness.
        return this.rotation.map((x, i) => vec4(...this.previous.rotation[i]).mix(x, alpha));
    }

    blend_state(alpha) {
        // blend_state(): Compute the final matrix we'll draw using the previous two physical
        // locations the object occupied.  We'll interpolate between these two states as
        // described at the end of the "Fix Your Timestep!" blog post.
        this.drawn_location = Mat4.translation(...this.previous.center.mix(this.center, alpha))
            .times(this.blend_rotation(alpha))
            .times(Mat4.scale(...this.size));
    }

    check_if_colliding(b, collider) {
        // check_if_colliding(): Collision detection function.
        // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
        // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
        // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
        // hack (there are perfectly good analytic expressions that can test if two ellipsoids
        // intersect without discretizing them into points).
        if (this == b)
            return false;
        // Nothing collides with itself.
        // Convert sphere b to the frame where a is a unit sphere:
        const T = this.inverse.times(b.drawn_location, this.temp_matrix);

        const {intersect_test, points, leeway} = collider;
        // For each vertex in that b, shift to the coordinate frame of
        // a_inv*b.  Check if in that coordinate frame it penetrates
        // the unit sphere at the origin.  Leave some leeway.
        return points.arrays.position.some(p =>
            intersect_test(T.times(p.to4(1)).to3(), leeway));
    }
}

/* WRITE UP FOR HOW TO MAKE YOUR COLLISION BOXES:
The class below is responsible for registering individual collision boxes.
I have created a wrapper that should make the collision process easier.

Collision boxes can either be attached to a specific 'block' or they can be their own 'block'.
If you have a complex building/item then you might just want to put a single,huge block approximately
around it instead of putting a bunch of small blocks. For now, we only have cube collision boxes
because its simpler to implement. If it's a big deal, then I can go back and get the collisions to work
with cylinders and other shapes.

OK, here is how it actually works.

Game will create REGISTER and store it in G.register which means you don't have to use new.
Register has a method called register (So, g.register.register()) which will create a collision
 box with a initial position. This register should be called once per collision box (so don't put
 in a draw or update function, only like a constructor). The item that it returns is where you can
 change the position of the collision box freely. The item returns a class that has a method:
        .emplace(new_position, 0, 0);
new_position should be the position matrix of where you want the collision box to be. You can
see the collision box as a green outline (Shift+T to turn on boxes).
IF you want to attach the collision box to your item,
then just pass the position matrix to emplace. Otherwise, if it should be a larger, unattached one,
then just pass the position matrix of what you want it look like.
That is it. You do not have to do anything else, the player should now not be able to move through it.
The collision detection only checks the corners of the object, so players can pass through objects if they
go through a object without intersecting any of their corners (fix this by making the other object bigger)

Note:
Right now, all of the objects and items you all have made are in the recreationists class.
While it is possible to make it work using this method, I'd recommend splitting each of your
items into separate classes that interface with the Game class. I've gone ahead and done for this for
Jorge's tree and one of Bella's buildings (just one giantic box). Use these as examples for the rest
of the items in the world.

Look at class Tree, game constructor, class Royce for the code samples
*/

class Register {
    constructor() {

        // G.bodies.push(new Body(G.shapes.box_1, undefined, vec3(0, 0, 0))
        //         .emplace(Mat4.translation(...vec3(0, 0, 0))
        //                 .times(Mat4.rotation(Math.PI, ...vec(1, 1, 1).normalized())),
        //             vec(0, 0, 0), Math.random()));
    }

    register(location_matrix, socket_id) { // socket_id is only for remote_players
        let obj = new Body(G.shapes.box_1, undefined, location_matrix, socket_id)
            .emplace(Mat4.translation(...location_matrix), 0, 0)

        G.bodies.push(obj);
        return obj;
    }

    unregister(socket_id) {
        //console.log("called");
        //console.log(`${socket_id} unregistered`)
        let i = 0;
        for (i = 0; i < G.bodies.length; i++) {
            //console.log(i);
            //console.log(`${G.bodies[i].socket_id} compared`);
            if (G.bodies[i].socket_id == socket_id) {
                //console.log("match");
                G.bodies.splice(i, 1);
            }
        }
        // const i = G.bodies.indexOf(obj);
        // if (i > -1) {
        //     G.bodies.splice(i, 1);
        // }
    }
}


// class G global used for accessing items that are shared between classes
class G {
    static shapes = {
        torus: new defs.Torus(15, 15),
        torus2: new defs.Torus(3, 15),
        sphere: new defs.Subdivision_Sphere(4),
        circle: new defs.Regular_2D_Polygon(10, 15),
        cube: new defs.Cube(),
        square: new defs.Square(),
        cylinder: new defs.Cylindrical_Tube(15, 15),
        prism: new defs.Capped_Cylinder(10, 4),
        octogon: new defs.Capped_Cylinder(1, 8),
        pyramid: new defs.Cone_Tip(1, 4),
        cone: new defs.Cone_Tip(1, 100),
        texture_square: new TextureSquare(),
    };

    static materials = {
        player: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: .1, diffusivity: .9, color: hex_color("#ffffff")}),
        bright: new Material(new Shadow_Textured_Phong_Shader(), {color: color(0, 1, 0, .5), ambient: 1}),
        tree_bark: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: .6, color: hex_color("#663300"), smoothness: 60}),
        grass: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: .2, diffusivity: 0.9, color: hex_color("#2f8214"), smoothness: 60}),
        brickGround: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: .1, diffusivity: 1, color: hex_color("#fcc89a"), smoothness: 100}),
        sky: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 0.2, diffusivity: .6, color: hex_color("#a3fcff"), smoothness: 40}),
        sun: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: 0.5, color: hex_color("#f7c600"), smoothness: 100}),
        whiteSquare: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: .6, color: hex_color("#f5eee9"), smoothness: 60}),

        flower_center: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: .6, color: hex_color("#ffff00"), smoothness: 60}),
        trash_bin: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: 1, color: hex_color("#4d3319"), smoothness: 60}),
        brick_stairs: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: 1, color: hex_color("#875d53"), smoothness: 60}),
        lamppost: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: 1, color: hex_color("#1a1a00"), smoothness: 100}),
        building: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: .2, diffusivity: 1, color: hex_color("#fca877"), smoothness: 100}),
        roof: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: 0.6, color: hex_color("#ff8c57"), smoothness: 60}),

        depth_tex: new Material(new Depth_Texture_Shader_2D(), {
            color: color(0, 0, .0, 1),
            ambient: 1, diffusivity: 0, specularity: 0, texture: null
        }),
        pure: new Material(new Color_Phong_Shader(), {}),
    };
    // all of the data from other clients (dictionary, socketid to player info)
    static remote_data = {};
    // the socket we used
    static socket;

    // the id of the player according to the server
    static player_id;

    // a dictionary of socket id to remote player
    static remote_players = {};

    // used to test stop displaying blocks (can remove)
    static test = false;

    // dictionary of all keys pressed
    static keys_pressed = {}; // deprecated

    static controls = {
        // w: false,
        // s: false,
        // shift: false,
        // a: false,
        // s: false
    };

    // if any key was pressed (used for initial camera)
    static key_was_pressed = false;

    // the collision box we are using
    static collider = {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1};

    // bodies that are used in collision
    static bodies = [];

    // use this to register objects for collision
    static register = null;

    static show_collision_boxes = false;

    static hide_my_player = false;

    static hide_other_players = false;
}


export class Recreationists extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        this.player_matrix = Mat4.identity();

        // *** Materials
        this.materials = {
            test: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            // brickGround: new Material(new Shadow_Textured_Phong(1), {
            //     ambient: 1, diffusivity: .6, color: hex_color("#fcc89a"), smoothness: 60,
            //     specularity: 0.4, color_texture: null, light_depth_texture: null
            // }),
            // brickGround: new Material(new Shadow_Textured_Phong_Shader(),
            //     {ambient: .4, diffusivity: .6, color: hex_color("#fcc89a")}),
            brickGround: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: .1, diffusivity: 1, color: hex_color("#fcc89a"), smoothness: 100}),
            sky: new Material(new defs.Phong_Shader(),
                {ambient: 0.2, diffusivity: .6, color: hex_color("#a3fcff"), smoothness: 40}),
            sun: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 0.5, color: hex_color("#f7c600"), smoothness: 100}),
            whiteSquare: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#f5eee9"), smoothness: 60}),
            grass: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: .2, diffusivity: 0.9, color: hex_color("#2f8214"), smoothness: 60}),
            tree_bark: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#663300"), smoothness: 60}),
            flower_center: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#ffff00"), smoothness: 60}),
            trash_bin: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: 1, color: hex_color("#4d3319"), smoothness: 60}),
            brick_stairs: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: 1, color: hex_color("#875d53"), smoothness: 60}),
            lamppost: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: 1, color: hex_color("#1a1a00"), smoothness: 100}),
            building: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: .2, diffusivity: 1, color: hex_color("#fca877"), smoothness: 100}),
            roof: new Material(new Shadow_Textured_Phong_Shader(),
                {ambient: 1, diffusivity: 0.6, color: hex_color("#ff8c57"), smoothness: 60}),

            pure: new Material(new Color_Phong_Shader(), {})
        }

        this.day_night_cycle = true;
        this.shadow_init = false;

        this.game = new Game();
    }

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button("Move forward", ["w"], () => G.controls.w = true, undefined, () => G.controls.w = false);
        this.key_triggered_button("Turn left", ["a"], () => G.controls.a = true, undefined, () => G.controls.a = false);
        this.key_triggered_button("Turn right", ["d"], () => G.controls.d = true, undefined, () => G.controls.d = false);
        this.key_triggered_button("Move backwards", ["s"], () => G.controls.s = true, undefined, () => G.controls.s = false);
        this.key_triggered_button("Jump", ["z"], () => G.controls.shift = true, undefined, () => G.controls.shift = false);
        this.key_triggered_button("Show Collision Boxes", ["Shift", "T"], () => G.show_collision_boxes = !G.show_collision_boxes);
        this.key_triggered_button("Hide other players", ["Shift", "Y"], () => G.hide_other_players = !G.hide_other_players);
        this.key_triggered_button("Hide my player", ["Shift", "U"], () => G.hide_my_player = !G.hide_my_player);
        this.key_triggered_button("Toggle day-night cycle", ["Shift", "P"], () => this.day_night_cycle = !this.day_night_cycle);
    }

    draw_tree(context, program_state, x, y, z) {
        var model_transform = Mat4.identity().times(Mat4.translation(x, y, z))
            .times(Mat4.scale(.5, 6, .5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.tree_bark);
        model_transform = Mat4.identity().times(Mat4.translation(x, y + 7, z))
            .times(Mat4.scale(3, 2, 3));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);
        model_transform = Mat4.identity().times(Mat4.translation(x, y + 10, z))
            .times(Mat4.scale(2, 1, 2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);
    }

    draw_flower(context, program_state, x, y, z, petal_color) {
        var model_transform = Mat4.identity().times(Mat4.translation(x, y, z))
            .times(Mat4.scale(.1, .6, .1));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);
        model_transform = Mat4.identity().times(Mat4.translation(x, y + .6, z))
            .times(Mat4.scale(.2, .2, .2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.flower_center);

        var i;
        for (i = 10; i < 60; i = i + 10) {
            model_transform = Mat4.identity().times(Mat4.translation(x, y + .6, z))
                .times(Mat4.rotation(i, 0, 0, 1))
                .times(Mat4.scale(.1, .5, .05));
            G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass.override({color: hex_color(petal_color)}));
        }
    }

    draw_trash(context, program_state, x, y, z) {
        var model_transform = Mat4.identity()
            .times(Mat4.translation(x, y + 1, z))
            .times(Mat4.rotation(1.57, 8, 0, 0))
            .times(Mat4.scale(1, 1, 3.5));

        G.shapes.cylinder.draw(context, program_state, model_transform, this.materials.trash_bin);
    }

    draw_stairs(context, program_state, x, y, z, length, num_steps, size) {
        var model_transform = Mat4.identity()
            .times(Mat4.translation(x, y + size, z))
            .times(Mat4.scale(size, size, length));

        var i;
        for (i = 0; i < num_steps; i++) {
            G.shapes.cube.draw(context, program_state, model_transform, this.materials.brick_stairs);
            model_transform = Mat4.identity()
                .times(Mat4.translation(x + size * (i + 1), y + size * (i + 2), z))
                .times(Mat4.scale(size, size, length));
        }
    }

    draw_lamppost(context, program_state, x, y, z) {
        var model_transform = Mat4.identity()
            .times(Mat4.translation(x, y + 3, z))
            .times(Mat4.scale(.1, 10, .1))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0));
        G.shapes.cylinder.draw(context, program_state, model_transform, this.materials.lamppost);

        model_transform = Mat4.identity()
            .times(Mat4.translation(x, y + 8, z))
            .times(Mat4.scale(.1, .1, 3));
        G.shapes.cylinder.draw(context, program_state, model_transform, this.materials.lamppost);

        model_transform = Mat4.identity()
            .times(Mat4.translation(x, y + 7, z + 1.2))
            .times(Mat4.scale(.5, 1, .5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.flower_center);

        model_transform = Mat4.identity()
            .times(Mat4.translation(x, y + 7, z - 1.2))
            .times(Mat4.scale(.5, 1, .5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.flower_center);
    }

    texture_buffer_init(gl) {
        // Depth Texture
        this.lightDepthTexture = gl.createTexture();
        // Bind it to TinyGraphics
        this.light_depth_texture = new Buffered_Texture(this.lightDepthTexture);
        G.materials.player.light_depth_texture = this.light_depth_texture;
        this.materials.brickGround.light_depth_texture = this.light_depth_texture;

        this.lightDepthTextureSize = LIGHT_DEPTH_TEX_SIZE;
        gl.bindTexture(gl.TEXTURE_2D, this.lightDepthTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,      // target
            0,                  // mip level
            gl.DEPTH_COMPONENT, // internal format
            this.lightDepthTextureSize,   // width
            this.lightDepthTextureSize,   // height
            0,                  // border
            gl.DEPTH_COMPONENT, // format
            gl.UNSIGNED_INT,    // type
            null);              // data
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Depth Texture Buffer
        this.lightDepthFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightDepthFramebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,       // target
            gl.DEPTH_ATTACHMENT,  // attachment point
            gl.TEXTURE_2D,        // texture target
            this.lightDepthTexture,         // texture
            0);                   // mip level
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // create a color texture of the same size as the depth texture
        // see article why this is needed_
        this.unusedTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.unusedTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.lightDepthTextureSize,
            this.lightDepthTextureSize,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // attach it to the framebuffer
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,        // target
            gl.COLOR_ATTACHMENT0,  // attachment point
            gl.TEXTURE_2D,         // texture target
            this.unusedTexture,         // texture
            0);                    // mip level
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    display(context, program_state) {
        // display():  Called once per frame of animation.
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        // if (!context.scratchpad.controls) {
        //     this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
        //     // Define the global camera and projection matrices, which are stored in program_state.
        //     //program_state.set_camera(this.camera_matrix);
        // }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, .1, 1000);

        const t = program_state.animation_time / 1000;

        const gl = context.context;
        if (!this.shadow_init) {
            const ext = gl.getExtension("WEBGL_depth_texture");
            if (!ext) {
                return alert("Need WEBGL_depth_texture");
            }
            this.texture_buffer_init(gl);
            this.shadow_init = true;
        }

        // Draw the background
        //---------------------------------------------------

        // Set coordinate system matrix at the origin
        let model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.translation(0, 0, 0));

        // Draw the sun
        const day_time = 10; // seconds that day time should last (12 hours in real life)
        let day_cycle = 0;
        if (this.day_night_cycle) {
            day_cycle = Math.PI * t / day_time;
        }
        let sun_dist = 5000; // distance from sun to origin (as it revolves)
        let distance = Math.sin(day_cycle) * sun_dist;
        let height = Math.cos(day_cycle) * sun_dist;
        let radius = 10; // radius of sun
        model_transform = model_transform.times(Mat4.translation(0, height, 0))
            .times(Mat4.translation(0, 0, -distance))
            .times(Mat4.scale(radius, radius, radius));

        // Place light at the sun
        const light_position = vec4(0, height, -distance, 1);
        const light_view_target = vec4(0, 0, 0, 1)
        const light_color = color(1, 1, 1, 1);
        program_state.lights = [
            new Light(
                light_position,
                light_color,
                10 ** (radius)
            )
        ];
        G.shapes.sphere.draw(context, program_state, model_transform, this.materials.sun);

        // Draw the sky as a giant blue sphere
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.scale(500, 500, 500));
        G.shapes.sphere.draw(context, program_state, model_transform, this.materials.sky);
        model_transform = Mat4.identity();

        // Step 1: set the perspective and camera to the POV of light
        const light_view_mat = Mat4.look_at(
            vec3(light_position[0], light_position[1], light_position[2]),
            vec3(light_view_target[0], light_view_target[1], light_view_target[2]),
            vec3(1, 1, 0), // assume the light to target will have a up dir of +y, maybe need to change according
            // to your case
        );
        const light_field_of_view = 130 * Math.PI / 180;
        const light_proj_mat = Mat4.perspective(light_field_of_view, 1, 0.5, 500);
        // Bind the Depth Texture Buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightDepthFramebuffer);
        gl.viewport(0, 0, this.lightDepthTextureSize, this.lightDepthTextureSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // Prepare uniforms
        program_state.light_view_mat = light_view_mat;
        program_state.light_proj_mat = light_proj_mat;
        program_state.light_tex_mat = light_proj_mat;
        program_state.view_mat = light_view_mat;
        program_state.projection_transform = light_proj_mat;
        this.render(context, program_state, model_transform, false);

        // Step 2: unbind, draw to the canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        program_state.view_mat = program_state.camera_inverse;
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);
        this.render(context, program_state, model_transform, true);

        // update game
        this.game.update(context, program_state);

        // Step 3: display the textures
        G.shapes.texture_square.draw(context, program_state,
            Mat4.translation(-.99, .08, 0).times(
                Mat4.scale(0.5, 0.5 * gl.canvas.width / gl.canvas.height, 1)
            ),
            G.materials.depth_tex.override({texture: this.lightDepthTexture})
        );
    }

    render(context, program_state, model_transform, shadow) {
        // Define the directions: +Y: UP
        //                        -Y: DOWN
        //                        +X: RIGHT    (Toward Powell)
        //                        -X: LEFT     (Toward Royce)
        //                        +Z: Backward (Toward the hill)
        //                        -Z: Forward  (Toward the campus)

        console.log("Rendering");

        program_state.draw_shadow = shadow;

        // Draw the ground
        model_transform = model_transform
            .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(1000, 1000, 1))
        G.shapes.square.draw(context, program_state, model_transform, shadow ? this.materials.brickGround : this.materials.pure);

        model_transform = Mat4.identity();

        // Draw the grass
        model_transform = model_transform.times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, 60, 0.01))
            .times(Mat4.scale(80, 40, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.grass);
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, -60, 0.01))
            .times(Mat4.scale(80, 40, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.grass);
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, -180, 0.01))
            .times(Mat4.scale(80, 60, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.grass);

        //start drawing objects
        this.draw_lamppost(context, program_state, 78, 0, 50);
        //this.draw_tree(context, program_state, 75, 0, 95);
        this.draw_trash(context, program_state, 80, 0, 102);
        this.draw_trash(context, program_state, 80, 0, 104.5);

        model_transform = Mat4.identity().times(Mat4.translation(70, 0, 103))
            .times(Mat4.scale(7, 2, 2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass)


        // Draw buildings:
        // 1) Draw simple building
        // Box
        model_transform = Mat4.identity().times(Mat4.translation(-125, 0, -180))
            .times(Mat4.scale(25, 40, 60));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Roof
        model_transform = Mat4.identity().times(Mat4.translation(-125, 40, -180))
            .times(Mat4.scale(25, 10, 119.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);

        // 2) Draw Royce
        // // Rear Box
        // model_transform = Mat4.identity().times(Mat4.translation(-145,0,0))
        //                                  .times(Mat4.scale(25,35,80));
        // G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // // Roof for Rear Box
        // model_transform = Mat4.identity().times(Mat4.translation(-145,35,0))
        //                                  .times(Mat4.scale(25,9,159.8));
        // G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        // // Draw middle box
        // model_transform = Mat4.identity().times(Mat4.translation(-160,0,0))
        //                                  .times(Mat4.scale(60,35,30));
        // G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // // Draw middle box roof
        // model_transform = Mat4.identity().times(Mat4.translation(-160,35,0))
        //                                  .times(Mat4.rotation(Math.PI/2,0,1,0))
        //                                  .times(Mat4.scale(30,20,120));
        // G.shapes.prism.draw(context, program_state, model_transform, this.materials.building);
        // // Draw two towers with their rooves
        // // First tower
        // model_transform = Mat4.identity().times(Mat4.translation(-110,0,-35))
        //                                  .times(Mat4.scale(12,70,10));
        // G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // // to-do: Draw a pyramid roof

        // // Second tower
        // model_transform = Mat4.identity().times(Mat4.translation(-110,0,35))
        //                                  .times(Mat4.scale(12,70,10));
        // G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // // to-do: Draw a pyramid roof

        // 3) Draw Powell
        // Main Box
        model_transform = Mat4.identity().times(Mat4.translation(220, 0, 0))
            .times(Mat4.scale(100, 50, 80));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Roof for Main Box
        model_transform = Mat4.identity().times(Mat4.translation(120 + 25, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(120 + 75, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(120 + 125, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(120 + 175, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        // Draw entrance inner building
        model_transform = Mat4.identity().times(Mat4.translation(215, 0, 0))
            .times(Mat4.scale(105, 50, 25));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Draw roof for entrance
        model_transform = Mat4.identity().times(Mat4.translation(215, 50, 0))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0))
            .times(Mat4.scale(25, 10, 210));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.building);
        // Draw the two columns
        // First column
        model_transform = Mat4.identity().times(Mat4.translation(110, 0, -25))
            .times(Mat4.scale(2.5, 60, 2.5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110, 60 + 4, -25))
            .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(2.5, 2.5, 4));
        G.shapes.cone.draw(context, program_state, model_transform, this.materials.roof);
        // Second column
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110, 0, 25))
            .times(Mat4.scale(2.5, 60, 2.5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110, 60 + 4, 25))
            .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(2.5, 2.5, 4));
        G.shapes.cone.draw(context, program_state, model_transform, this.materials.roof);
        // Draw the octogon blocks
        model_transform = Mat4.identity().times(Mat4.translation(150, 0, 0))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(20, 20, 150));
        G.shapes.octogon.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(150, 0, 0))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(15, 15, 170));
        G.shapes.octogon.draw(context, program_state, model_transform, this.materials.building);
        // to-do: Place octogon pyramid on top of octogons

        // to-do: Draw fountain
        // Place circle on top of grass
        model_transform = Mat4.identity().times(Mat4.translation(0, 0.02, 100))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(20, 20, 1));
        G.shapes.circle.draw(context, program_state, model_transform, this.materials.brickGround);
        model_transform = Mat4.identity().times(Mat4.translation(0, 0.02, -240))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(30, 30, 1));
        G.shapes.circle.draw(context, program_state, model_transform, this.materials.brickGround);
        //--------------------------------------------------------------------------------

        this.game.draw(context, program_state, shadow);
    }
}

// This is the game class, it is used to keep track of all the active entities in the game (such as
// all of the connected players). It calls every objects' update method and then their draw method.
// use the update method to determine if collisions have occured or to calculate position. Then draw.
// ( Not implemented) IT also centralizes all of the input from the keyboard.
class Game {
    constructor() {

        // create the collision register
        G.register = new Register;

        this.entities = [];

        this.entities.push(new Tree(75, 0, 95)); // Jorge's tree

        this.entities.push(new Royce()); // Bella's Royce Hall

        let local_player = new LocalPlayer();
        this.entities.push(local_player);

        const socket = io.connect();
        socket.on('setId', function (data) {
            G.player_id = data.id;
            local_player.socket_id = data.id;
        });
        socket.on('remote_data', function (data) {
            //console.log(data);
            //console.log("received remote data");
            data.forEach(function (i, index) {
                if (i.player_matrix !== false && i.id !== G.player_id) {
                    if (!(i.id in G.remote_players)) {
                        //console.log(i, index);
                        G.remote_players[i.id] = new Player(i.id);
                        //console.log(i.player_matrix);
                        G.remote_data[i.id] = i.player_matrix;
                        console.log(`created player ${i.id}`);
                    } else {
                        G.remote_data[i.id] = i.player_matrix;
                    }

                }
                //console.log(item, index);
            });
        });

        socket.on('deletePlayer', function (data) {
            console.log(`deleted player ${data.id}`);
            G.register.unregister(data.id);
            G.remote_players[data.id] = false;

            //delete G.remote_players[socket.id];
            //console.log(G.remote_players);
        });

        G.socket = socket;
    }

    update(context, program_state) {
        this.entities.map(x => x.update(context, program_state));
        for (let i in G.remote_players) {
            if (G.remote_players[i] !== false) {
                G.remote_players[i].update(context, program_state);
            }
        }
    }

    draw(context, program_state, shadow) {
        this.entities.map(x => x.draw(context, program_state, shadow));
        for (let i in G.remote_players) {
            if (G.remote_players[i] !== false) {
                G.remote_players[i].draw(context, program_state, shadow);
            }
        }

        const {points, leeway} = G.collider;
        const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);
        if (G.show_collision_boxes) {
            for (let b of G.bodies)
                points.draw(context, program_state, b.drawn_location.times(Mat4.scale(...size)), G.materials.bright, "LINE_STRIP");
        }
    }
}

class Royce {
    constructor() {
        this.collision_box = G.register.register(vec3(0, 0, 0)); //initial position doesn't matter, we overwrite anyways
    }

    update(context, program_state) {

    }

    draw(context, program_state, shadow) {
        // Collision around whole thing
        let model_transform = Mat4.identity().times(Mat4.translation(-130, 0, 0))
            .times(Mat4.scale(30, 35, 80));

        this.collision_box.emplace(model_transform, 0, 0);

        // Rear Box
        model_transform = Mat4.identity().times(Mat4.translation(-145, 0, 0))
            .times(Mat4.scale(25, 35, 80));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Roof for Rear Box
        model_transform = Mat4.identity().times(Mat4.translation(-145, 35, 0))
            .times(Mat4.scale(25, 9, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.roof);
        // Draw middle box
        model_transform = Mat4.identity().times(Mat4.translation(-160, 0, 0))
            .times(Mat4.scale(60, 35, 30));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Draw middle box roof
        model_transform = Mat4.identity().times(Mat4.translation(-160, 35, 0))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0))
            .times(Mat4.scale(30, 20, 120));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.building);
        // Draw two towers with their rooves
        // First tower
        model_transform = Mat4.identity().times(Mat4.translation(-110, 0, -35))
            .times(Mat4.scale(12, 70, 10));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // to-do: Draw a pyramid roof

        // Second tower
        model_transform = Mat4.identity().times(Mat4.translation(-110, 0, 35))
            .times(Mat4.scale(12, 70, 10));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // to-do: Draw a pyramid roof
    }
}

class Tree {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.collision_box = G.register.register(vec3(x, y, z));
    }

    update(context, program_state) {

    }

    draw(context, program_state, shadow) {
        let x = this.x;
        let y = this.y;
        let z = this.z;

        let model_transform = Mat4.identity().times(Mat4.translation(x, y, z))
            .times(Mat4.scale(.5, 6, .5));
        this.collision_box.emplace(model_transform, 0, 0);
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.tree_bark);
        model_transform = Mat4.identity().times(Mat4.translation(x, y + 7, z))
            .times(Mat4.scale(3, 2, 3));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.grass);
        model_transform = Mat4.identity().times(Mat4.translation(x, y + 10, z))
            .times(Mat4.scale(2, 1, 2));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.grass);
    }
}

// This is a general player. It is used to make adding new players easy. Use local player for the player
// that you actually control in the game.
class Player {
    constructor(socket_id) {
        this.player_matrix = Mat4.identity().times(Mat4.translation(Math.random() * 40 - 20, 10, Math.random() * 40 - 20));
        this.socket_id = socket_id;
        this.collision_box = G.register.register(vec3(0, -10, 0), socket_id);
    }

    update(context, program_state) {
        this.collision_box.emplace(this.player_matrix, 0, 0);

        // assume this is a remote player
        if (this.socket_id !== G.player_id) {
            let pos = G.remote_data[this.socket_id];
            //console.log(this.socket_id);
            //console.log(pos);
            this.player_matrix = Matrix.of(pos[0], pos[1], pos[2], pos[3]);
        }
    }

    draw(context, program_state, shadow) {
        if (!G.hide_other_players) {
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player : G.materials.pure);
        }
    }
}

// this is for the player that the user actually controls. The parent class player is also used for
// connected players
class LocalPlayer extends Player {
    constructor() {
        super();
        this.camera_matrix = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));
        this.acceleration = new Vector([0, 0, 0]);
        this.velocity = new Vector([0, 0, 0]);
        this.jumping = false;
        this.speed = 0.25;
        this.rotation_speed = 0.01;
        // this.collisions = {
        //     f: false, // forward
        //     b: false, // backward
        //     l: false, // left
        //     r: false, // right
        //     d: false, // down
        //     u: false // up
        // };
        this.collision_matrix = this.player_matrix;

        this.local_collision_box = G.register.register(vec3(0, 0, 0), "localplayer");
    }

    // for physics calculation
    apply_force(force) {
        this.acceleration = this.acceleration.plus(force);
    }

    key_pressed(context, program_state) {
        let x = this.player_matrix[0];
        let y = this.player_matrix[1];
        let z = this.player_matrix[2];

        //console.log(x,y,z);
        this.velocity[2] = 0; // don't move unless button pressed
        if (G.controls.w === true) {
            G.key_was_pressed = true;
            //this.acceleration = this.acceleration.plus([0, 0, -this.speed]);
            //this.player_matrix = this.player_matrix.times(Mat4.translation(0, 0, -this.speed));
            //this.velocity = vec3(this.velocity.x, this.velocity.y, -this.speed );
            this.velocity[2] = -this.speed;
        }
        if (G.controls.s === true) {
            G.key_was_pressed = true;
            //this.player_matrix = this.player_matrix.times(Mat4.translation(0, 0, this.speed));
            this.velocity[2] = this.speed;
        }
        if (G.controls.d === true) {
            G.key_was_pressed = true;
            this.player_matrix = this.player_matrix
                .times(Mat4.rotation(-2 * Math.PI * this.rotation_speed, 0, 1, 0))

            //.times(Mat4.translation(0,0,-z));
        }
        if (G.controls.a === true) {
            G.key_was_pressed = true;
            this.player_matrix = this.player_matrix
                .times(Mat4.rotation(2 * Math.PI * this.rotation_speed, 0, 1, 0))
            //.times(Mat4.translation(0,0,-z));
        }

        if (G.controls.shift === true) {
            G.key_was_pressed = true;
            if (!this.jumping) {
                this.jumping = true;
                //this.player_matrix = this.player_matrix.times(Mat4.translation(0,1,0));
                //console.log("m pressed");
                this.apply_force([0, 9.8 * 0.05, 0]);
            }
        }
        //desired = desired.map((x,i) => Vector.from(this.camera_matrix).mix(x, 0.1));
        //program_state.set_camera(desired);
    }

    // test if problem in new position
    collision_test(new_position) {
        this.local_collision_box.emplace(new_position, 0, 0);

        for (let a of G.bodies) {
            // a.inverse = Mat4.inverse(a.drawn_location);

            // Cache the inverse of matrix of body "a" to save time.
            //let a = this.collision_box;
            //let a = this.local_collision_box;
            a.inverse = Mat4.inverse(a.drawn_location);

            // *** Collision process is here ***
            // Loop through all bodies again (call each "b"):
            for (let b of G.bodies) {
                if (a.socket_id !== "" && a.socket_id !== "localplayer") continue;
                // Pass the two bodies and the collision shape to check_if_colliding():
                if (!a.check_if_colliding(b, G.collider))
                    continue;
                // If we get here, we collided, so turn red and zero out the
                // velocity so they don't inter-penetrate any further.

                // a.material = this.active_color;
                // a.linear_velocity = vec3(0, 0, 0);
                // a.angular_velocity = 0;
                console.log(a.socket_id);
                console.log("collision");
                return true;
            }
        }
    }

    update(context, program_state) {
        this.key_pressed(context, program_state);
        // if (this.key_was_pressed) {
        //     this.camera_matrix = Mat4.inverse(this.player_matrix
        //             .times(Mat4.translation(0, 2, 10))
        //         //.times(Mat4.rotation(Math.PI/4,0,0,0))
        //     );
        // }


        const g = -9.8 * 0.001;

        this.apply_force([0, g, 0]); // gravity

        //this.velocity = this.velocity.plus(g); // apply gravity

        //console.log(this.velocity);
        this.velocity = this.velocity.plus(this.acceleration);

        // test if bottom collision
        this.collision_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], 0));
        if (this.collision_test(this.collision_matrix)) {
            this.jumping = false;
            this.velocity = vec3(0, 0, this.velocity[2]);
        }

        // stop at the ground
        if (this.player_matrix[1][3] <= 1.25 && this.velocity[1] < 0) {
            //this.velocity = [this.velocity[0], 0, this.velocity[1]];
            this.velocity[1] = 0;
            this.jumping = false;
        }


        this.collision_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], this.velocity[2]));

        if (this.collision_test(this.collision_matrix)) {
            this.velocity = vec3(0, 0, 0);
        }

        this.player_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], this.velocity[2])); //this.velocity.z));
        //this.player_matrix = this.player_matrix.times(Mat4.translation(0,-0.001,0,)); //this.velocity.z));

        this.acceleration = this.acceleration.times(0);
        //console.log(this.acceleration);

        // update camera
        this.camera_matrix = Mat4.inverse(this.player_matrix
                .times(Mat4.translation(0, 2, 10))
            //.times(Mat4.rotation(Math.PI/4,0,0,0))
        );
        program_state.set_camera(this.camera_matrix);

        // tell the server our position
        G.socket.emit('update', {
            player_matrix: this.player_matrix,
        })
    }

    draw(context, program_state, shadow) {
        if (!G.hide_my_player) {
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player : G.materials.pure);
        }
    }
}
