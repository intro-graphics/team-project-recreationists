import {defs, tiny} from './examples/common.js';
import { Articulated_Player } from './player-model.js';
import {
    Buffered_Texture,
    Color_Phong_Shader,
    Depth_Texture_Shader_2D,
    LIGHT_DEPTH_TEX_SIZE,
    Shadow_Textured_Phong_Shader
} from './shadow-shaders.js';
import { Hermite_Spline, Curve_Shape } from './spline.js';
import { Spring_System } from "./spring-system.js";

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene, Texture
} = tiny;

const { Textured_Phong } = defs;

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
    constructor(shape, material, size, socket_id = "default") { // socket_id is optional and only used for players
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

class Cube_Outline extends Shape {
    constructor() {
        super("position", "color");
        //  TODO (Requirement 5).
        // When a set of lines is used in graphics, you should think of the list entries as
        // broken down into pairs; each pair of vertices will be drawn as a line segment.
        // Note: since the outline is rendered with Basic_shader, you need to redefine the position and color of each vertex
        this.arrays.position = Vector3.cast(
            [ 1,-1, 1], [ 1,-1,-1],
            [ 1,-1,-1], [-1,-1,-1],
            [-1,-1,-1], [-1,-1, 1],
            [-1,-1, 1], [ 1,-1, 1],
            [ 1,-1, 1], [ 1, 1, 1],
            [ 1,-1,-1], [ 1, 1,-1],
            [-1,-1,-1], [-1, 1,-1],
            [-1,-1, 1], [-1, 1, 1],
            [ 1, 1, 1], [ 1, 1,-1],
            [ 1, 1,-1], [-1, 1,-1],
            [-1, 1,-1], [-1, 1, 1],
            [-1, 1, 1], [ 1, 1, 1],
        );
        let white = color(1.0, 1.0, 1.0, 1.0);
        this.arrays.color = [
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
            white, white,
        ];
        this.indices = false;
    }
}

    // had to add this class to fix colision bug
class Square extends Shape {
    // **Square** demonstrates two triangles that share vertices.  On any planar surface, the
    // interior edges don't make any important seams.  In these cases there's no reason not
    // to re-use data of the common vertices between triangles.  This makes all the vertex
    // arrays (position, normals, etc) smaller and more cache friendly.
    constructor() {
        super("position", "normal", "texture_coord");
        // Specify the 4 square corner locations, and match those up with normal vectors:
        //this.arrays.position = Vector3.cast([-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 1, 0]);
        this.arrays.position = Vector3.cast([-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 1, 0], [0, 0, 0]);

        //this.arrays.normal = Vector3.cast([0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
        this.arrays.normal = Vector3.cast([0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]);

        // Arrange the vertices into a square shape in texture space too:
        //this.arrays.texture_coord = Vector.cast([0, 0], [1, 0], [0, 1], [1, 1]);
        this.arrays.texture_coord = Vector.cast([0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]);

        // Use two triangles this time, indexing into four distinct vertices:
        this.indices.push(0, 1, 2, 1, 3, 2, 4);
    }
}
    // had to add this class to fix colision bug
class Cube extends Shape {
    // **Cube** A closed 3D shape, and the first example of a compound shape (a Shape constructed
    // out of other Shapes).  A cube inserts six Square strips into its own arrays, using six
    // different matrices as offsets for each square.
    constructor() {
        super("position", "normal", "texture_coord");
        // Loop 3 times (for each axis), and inside loop twice (for opposing cube sides):
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 2; j++) {
                const square_transform = Mat4.rotation(i == 0 ? Math.PI / 2 : 0, 1, 0, 0)
                    .times(Mat4.rotation(Math.PI * j - (i == 1 ? Math.PI / 2 : 0), 0, 1, 0))
                    .times(Mat4.translation(0, 0, 1));
                // Calling this function of a Square (or any Shape) copies it into the specified
                // Shape (this one) at the specified matrix offset (square_transform):
                Square.insert_transformed_copy_into(this, [], square_transform);
            }
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
        triangle: new defs.Triangle(),
    };

    static materials = {
        player: new Material(new Shadow_Textured_Phong_Shader(),
            {
                ambient: .7,
                diffusivity: .9,
                color: hex_color("#ffffff"),
                color_texture: null,
                light_depth_texture: null
            }),
        bright: new Material(new Shadow_Textured_Phong_Shader(), {color: color(0, 1, 0, .5), ambient: 1}),
        tree_bark: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: 1, diffusivity: .6, color: hex_color("#663300"), smoothness: 60}),
        grass: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: .2, diffusivity: 0.9, color: hex_color("#2f8214"), smoothness: 60}),
        brickGround: new Material(new Shadow_Textured_Phong_Shader(),
            {ambient: .1, diffusivity: 1, color: hex_color("#fcc89a"), smoothness: 100}),
        sky: new Material(new defs.Phong_Shader(),
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
        
        pure: new Material(new Color_Phong_Shader(), {ambient: .7, diffusivity: 1}),
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
        f: false
    };

    // if any key was pressed (used for initial camera)
    static key_was_pressed = false;

    // the collision box we are using
    //static collider = {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1};
    // fixes collision bug
    static collider = {intersect_test: Body.intersect_cube, points: new Cube(), leeway: .1};


    // bodies that are used in collision
    static bodies = [];

    // use this to register objects for collision
    static register = null;

    static show_collision_boxes = false;

    static hide_my_player = false;

    static hide_other_players = false;

    static slides; // slides instance
    
    static show_curve=false;

    static show_mesh = false;
}

class Simulation {
    constructor() {
      this.particles = [];
      this.springs = [];
      this.g_acc = vec3(0, 0, 0);
      this.ground_ks = 0;
      this.ground_kd = 0;
    }
  
    update(dt) {
      
        for (const p of this.particles) {
            p.ext_force = vec3(0, 0, 0);
            // add gravity
            p.ext_force = this.g_acc.times(p.mass);
            // add ground collision and damping
            // secret_calculate_ground_forces(this, p);
            this.handle_ground_collision(p);
        }
      for (const s of this.springs) {
        s.update();
      }
      for (const p of this.particles) {
        p.update(dt);
      }
      
    }
  
    handle_ground_collision(p) {
      // detect if ground collision with particles
  
      const P = vec3(0, 0, 0); // ground location
      const n = vec3(0, 1, 0); // normal
  
     
      const x = p.pos;
      const collision_eq = (x.minus(P)).dot(n);
      if (collision_eq < 0) {
        //console.log("colliding");
  
        p.ext_force = vec3(0, 0, 0); //stop gravity if colliding with ground
        //p.ext_force = p.ext_force.times(-1);
        
        const ks = this.ground_ks;
        const kd = this.ground_kd;
        const P_g = P;
        const nhat = n;
        const v = p.vel;
      
        const P_g_minus_x = P_g.minus(x);
        const P_g_minus_x_dot_nhat = P_g_minus_x.dot(nhat);
  
        const fs = nhat.times(ks*P_g_minus_x_dot_nhat);
  
        const v_dot_nhat = v.dot(nhat);
        const fd = nhat.times(kd*v_dot_nhat); 
        
        const fn = fs.minus(fd);
  
        //console.log(fn);
        p.ext_force.add_by(fn);
        //console.log(p.ext_force);
  
        //also apply friction if collision is happening
        const vhat = v.normalized();
        const f_n = this.g_acc.times(p.mass); // f = ma
        const fnorm_n = f_n.norm();
        const mu_k = -2.0 // some random coefficient I came up with (negative because this is opposite to direction of motion)
  
        // f_k = -\mu_k ||f_n|| v_t / ||v_t||
        const f_k = vhat.times(fnorm_n*mu_k);
  
        p.ext_force.add_by(f_k); // add the friction
      }
    }
  
    draw(webgl_manager, uniforms, shapes, materials) {
      const red = color(1, 0, 0, 1);
      const blue = color(0, 0, 1, 1);
      for (const p of this.particles) {
        const pos = p.pos;
        let model_transform = Mat4.scale(0.2, 0.2, 0.2);
        model_transform.pre_multiply(Mat4.translation(pos[0], pos[1], pos[2]));
        //const phong = new defs.Phong_Shader();
        //const metal = { shader: phong, ambient: .2, diffusivity: 1, specularity:  1, color: color( .9,.5,.9,1 ) };
  
        shapes.ball.draw( webgl_manager, uniforms, model_transform,  { ...materials, color: blue} );
  
      }
  
      // using cubes
      for (const s of this.springs) {
        //console.log(s);
        const p1 = s.particle_1.pos;
        const p2 = s.particle_2.pos;
        const len = (p2.minus(p1)).norm();
        const center = (p1.plus(p2)).times(0.5);
  
        let model_transform = Mat4.scale(0.05, len/2, 0.05);
  
        // credit: https://computergraphics.stackexchange.com/questions/4008/rotate-a-cylinder-from-xy-plane-to-given-points
        const p = p1.minus(p2).normalized();
        let v = vec3(0, 1, 0);
        if (Math.abs(v.cross(p).norm()) < 0.1) {
          v = vec3(0, 0, 1);
          model_transform = Mat4.scale(0.05, 0.05, len/2);
        }
        const w = v.cross(p).normalized();
  
        const theta = Math.acos(v.dot(p));
        model_transform.pre_multiply(Mat4.rotation(theta, w[0], w[1], w[2]));
        model_transform.pre_multiply(Mat4.translation(center[0], center[1], center[2]));
        shapes.box.draw(webgl_manager, uniforms, model_transform, {...materials, color: red});
      }
    }
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
            brickGround: new Material(new Shadow_Textured_Phong_Shader(1),
                {
                    ambient: .1,
                    diffusivity: 1,
                    color: hex_color("#fcc89a"),
                    smoothness: 100,
                    color_texture: null,
                    light_depth_texture: null
                }),
            sky: new Material(new defs.Phong_Shader(),
                {ambient: 0.2, diffusivity: .6, color: hex_color("#a3fcff"), smoothness: 40}),
            sun: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 0, color: hex_color("#f7c600")}),
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

        this.day_night_cycle = false;
        this.shadow_init = false;
        this.shadow_demo = false;
        //this.light_turned_on = true; // overrides all the light (testing if performance can be better)

        this.game = new Game();
        
        this.time_step = 0.001;
        this.running = false;
        this.t_sim = 0.0;
        this.sim_speed = 1.0;
        this.sim = new Simulation();
        
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
        this.key_triggered_button("Toggle shadow", ["Shift", "O"], () => this.shadow_demo = !this.shadow_demo)
        this.key_triggered_button("Next slide", ["Shift", "D"], () => G.slides.next_slide())
        this.key_triggered_button("Prev slide", ["Shift", "A"], () => G.slides.prev_slide())
        this.key_triggered_button("Show Spline Curve", ["Shift", "C"], () => G.show_curve = !G.show_curve);
        this.key_triggered_button("Cheer!", ["f"], () => G.controls.f = true, undefined, () => G.controls.f = false);
        this.key_triggered_button("Show Flag Mesh", ["Shift", "F"], () => G.show_mesh = !G.show_mesh);
        //this.key_triggered_button("Wave hand", ["f"], () => G.controls.f = true, undefined, () => G.controls.f = false);
    }

    texture_buffer_init(gl) {
        // Depth Texture
        this.lightDepthTexture = gl.createTexture();
        // Bind it to TinyGraphics
        this.light_depth_texture = new Buffered_Texture(this.lightDepthTexture);
        for (const [key, value] of Object.entries(this.materials)) {
            if (value.shader instanceof Shadow_Textured_Phong_Shader) {
                this.materials[key].light_depth_texture = this.light_depth_texture;
            }
        }
        for (const [key, value] of Object.entries(G.materials)) {
            if (value.shader instanceof Shadow_Textured_Phong_Shader) {
                G.materials[key].light_depth_texture = this.light_depth_texture;
            }
        }

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

        const t = program_state.animation_time / 1000;
        //const dt = program_state.animation_delta_time / 1000;

        let model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.translation(0, 0, 0));

        //if (this.light_turned_on) {
        const gl = context.context;
        if (!this.shadow_init) {
            console.log("Initializing shadows...");
            const ext = gl.getExtension("WEBGL_depth_texture");
            if (!ext) {
                return alert("Need WEBGL_depth_texture");
            }
            this.texture_buffer_init(gl);
            console.log("Shadows initialized");
            this.shadow_init = true;
        }

        // Draw the background
        //---------------------------------------------------

        // Place light at the sun
        const day_time = 10; // seconds that day time should last (12 hours in real life)
        let day_cycle = 0;
        if (this.day_night_cycle) {
            day_cycle = Math.PI * t / day_time;
        }
        // day_cycle = 0;
        let sun_dist = 100; // distance from sun to origin (as it revolves)
        if (this.shadow_demo) {
            sun_dist = 10;
        }
        let distance = Math.sin(day_cycle) * sun_dist;
        let height = Math.cos(day_cycle) * sun_dist;
        let radius = 10; // radius of sun
        if (this.shadow_demo) {
            this.light_position = vec4(distance, 15, height, 1);
        } else {
            this.light_position = vec4(1, height, -distance, 1);
        }
        const light_view_target = vec4(0, 0, 0, 1)
        this.light_brightness = Math.max(Math.cos(day_cycle), 0)
        if (this.shadow_demo) {
            this.light_brightness = 1;
        }
        const light_color = color(this.light_brightness, this.light_brightness, this.light_brightness, 1);
        program_state.lights = [
            new Light(
                this.light_position,
                light_color,
                10 ** radius
            )
        ];

        //if (this.shadow_demo) {
        // Set coordinate system matrix at the origin


        // Step 1: set the perspective and camera to the POV of light
        const light_view_mat = Mat4.look_at(
            vec3(this.light_position[0], this.light_position[1], this.light_position[2]),
            vec3(light_view_target[0], light_view_target[1], light_view_target[2]),
            vec3(0, 1, 0), // assume the light to target will have a up dir of +y
        );
        const light_field_of_view = 160 * Math.PI / 180;
        const light_proj_mat = Mat4.perspective(light_field_of_view, 1, 0.5, 2000);
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
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 2000);
        this.render(context, program_state, model_transform, true);

        // update game
        this.game.update(context, program_state);

        // physics simulation
        let dt = Math.min(1/30, program_state.animation_delta_time/1000);
        dt *= this.sim_speed;
    
        if (this.running) {
        const t_next = this.t_sim + dt;
        while (this.t_sim < t_next) {
            this.sim.update(this.time_step);
            this.t_sim += this.time_step;
        }
        }
        
        const blue = color(0, 0, 1, 1);        
        this.sim.draw(context, this.uniforms, this.shapes, {...this.materials.metal, color: blue});

    

        // Step 3: display the textures
        if (this.shadow_demo) {
            G.shapes.texture_square.draw(context, program_state,
                Mat4.translation(-.99, .08, 0).times(
                    Mat4.scale(0.5, 0.5 * gl.canvas.width / gl.canvas.height, 1)
                ),
                G.materials.depth_tex.override({texture: this.lightDepthTexture})
            );
        }
        //}
        //} // end of this.light_turned_on
        //else {
          //  this.render(context, program_state, model_transform, false);
        //}
    }

    render(context, program_state, model_transform, shadow) {
        // Define the directions: +Y: UP
        //                        -Y: DOWN
        //                        +X: RIGHT    (Toward Powell)
        //                        -X: LEFT     (Toward Royce)
        //                        +Z: Backward (Toward the hill)
        //                        -Z: Forward  (Toward the campus)

        //console.log("Rendering");

        program_state.draw_shadow = shadow;
        const t = program_state.animation_time;

        if (shadow) {
            // Draw the sun
            G.shapes.sphere.draw(context, program_state,
                Mat4.translation(this.light_position[0], this.light_position[1], this.light_position[2])
                    .times(Mat4.scale(1, 1, 1)),
                this.materials.sun);
        }

        // Draw the sky as a giant blue sphere
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.scale(200, 200, 400));
        if (shadow) {
            G.shapes.sphere.draw(context, program_state, model_transform,
                shadow ?
                    this.materials.sky.override({ambient: this.light_brightness}) : G.materials.pure);
        }
        model_transform = Mat4.identity();

        // Draw the ground
        model_transform = model_transform
            .times(Mat4.translation(0, -.1, 0))
            .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(1000, 1000, .1))
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.brickGround : this.materials.pure);

        model_transform = Mat4.identity();

        // Draw the grass
        model_transform = model_transform.times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, 60, 0.01))
            .times(Mat4.scale(80, 40, .1));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.grass : G.materials.pure);
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, -60, 0.01))
            .times(Mat4.scale(80, 40, .1));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.grass: G.materials.pure);
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, 180, 0.01))
            .times(Mat4.scale(80, 60, .1));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.grass : G.materials.pure);


        /*
        // Draw buildings:
        // 1) Draw simple building
        // Box
        model_transform = Mat4.identity().times(Mat4.translation(-125, 0, -180))
            .times(Mat4.scale(25, 40, 60));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // Roof
        model_transform = Mat4.identity().times(Mat4.translation(-125, 40, -180))
            .times(Mat4.scale(25, 10, 119.8));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? this.materials.roof: G.materials.pure);

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
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // Roof for Main Box
        model_transform = Mat4.identity().times(Mat4.translation(120 + 25, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        model_transform = Mat4.identity().times(Mat4.translation(120 + 75, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        model_transform = Mat4.identity().times(Mat4.translation(120 + 125, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        model_transform = Mat4.identity().times(Mat4.translation(120 + 175, 50, 0))
            .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        // Draw entrance inner building
        model_transform = Mat4.identity().times(Mat4.translation(215, 0, 0))
            .times(Mat4.scale(105, 50, 25));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // Draw roof for entrance
        model_transform = Mat4.identity().times(Mat4.translation(215, 50, 0))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0))
            .times(Mat4.scale(25, 10, 210));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // Draw the two columns
        // First column
        model_transform = Mat4.identity().times(Mat4.translation(110, 0, -25))
            .times(Mat4.scale(2.5, 60, 2.5));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110, 60 + 4, -25))
            .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(2.5, 2.5, 4));
        G.shapes.cone.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        // Second column
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110, 0, 25))
            .times(Mat4.scale(2.5, 60, 2.5));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110, 60 + 4, 25))
            .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(2.5, 2.5, 4));
        G.shapes.cone.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        // Draw the octogon blocks
        model_transform = Mat4.identity().times(Mat4.translation(150, 0, 0))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(20, 20, 150));
        G.shapes.octogon.draw(context, program_state, model_transform, shadow ? this.materials.roof : G.materials.pure);
        model_transform = Mat4.identity().times(Mat4.translation(150, 0, 0))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(15, 15, 170));
        G.shapes.octogon.draw(context, program_state, model_transform, shadow ? this.materials.building : G.materials.pure);
        // to-do: Place octogon pyramid on top of octogons

        // to-do: Draw fountain
        // Place circle on top of grass
        model_transform = Mat4.identity().times(Mat4.translation(0, 0.02, 100))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(20, 20, 1));
        G.shapes.circle.draw(context, program_state, model_transform, shadow ? this.materials.brickGround : G.materials.pure);
        */

        //simple objects without collision boxes
        model_transform = Mat4.identity()
        .times(Mat4.translation(105, 0, -60))
        .times(Mat4.scale(5, 1, 25));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);

        model_transform = Mat4.identity()
        .times(Mat4.translation(107, 0.1, 55))
        .times(Mat4.scale(5, .7, 26));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);

        model_transform = Mat4.identity()
        .times(Mat4.translation(-95, 0, 62))
        .times(Mat4.scale(5, 1, 19));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);

        model_transform = Mat4.identity()
        .times(Mat4.translation(-95, 0, -62.5))
        .times(Mat4.scale(5, 1, 18));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);

        model_transform = Mat4.identity()
        .times(Mat4.translation(94, 0, -225))
        .times(Mat4.scale(5, 1, 15));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);

        model_transform = Mat4.identity()
        .times(Mat4.translation(94, 0, -150))
        .times(Mat4.scale(4, 3, 40))
        .times(Mat4.rotation(-.8, 0, 0, 1));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass);

        //Other end
        model_transform = Mat4.identity().times(Mat4.translation(0, 0.02, -240))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(30, 30, 1));
        G.shapes.circle.draw(context, program_state, model_transform, shadow ? this.materials.brickGround : G.materials.pure);
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


        //objects on/near 1st grass patch
        this.entities.push(new Tree(75, 0, 95)); // Jorge's tree
        this.entities.push(new Trash(80, 0, 102, 1));
        this.entities.push(new Trash(80, 0, 104.5, 0));
        this.entities.push(new Lamppost(78, 0, 50));
        this.entities.push(new Lamppost(-78, 0, 50));
        this.entities.push(new Bush(70, 0, 103, 7, 2, 2, "#00FF00"));
        this.entities.push(new Bush(-70, 0, 95, 7, 2, 2, "#00FF00"));

        //objects on 2nd grass patch
        this.entities.push(new Tree(73, 0, -25));
        this.entities.push(new Tree(76, 0, -30));
        this.entities.push(new Lamppost(79, 0, -40));
        this.entities.push(new Lamppost(-79, 0, -40));

        //objects on 3rd grass patch
        this.entities.push(new Lamppost(79, 0, -125));
        this.entities.push(new Lamppost(-79, 0, -125));
        this.entities.push(new Tree(73, 0, -150));
        this.entities.push(new Tree(-73, 0, -150));
        this.entities.push(new Lamppost(79, 0, -180));
        this.entities.push(new Lamppost(-79, 0, -180));
        this.entities.push(new Lamppost(79, 0, -238));
        this.entities.push(new Lamppost(-79, 0, -238));


        //objects next to powell library
        this.entities.push(new Tree(115, 0, 75));
        this.entities.push(new Bush(113, 0, 79, 5, 3, 2, "#00FF00"));
        this.entities.push(new Stairs(102.5, 0, 0, 27.4, 6, .3, 0));
        this.entities.push(new Bush(105, 1.1, 0, 1, 1, 27.4, "#875d53"));
        this.entities.push(new Stairs(106.5, 2, 0, 27.4, 4, .3, 0));

        //objects next to powell library, left of stairs
        this.entities.push(new Bush(111, 0, -27, 9, 2.7, 1, "#875d53"));
        this.entities.push(new Bush(114, 0, -27, 9, 3.7, 1, "#875d53"));
        this.entities.push(new Trash(100.7, 0, -30, 1));
        this.entities.push(new Trash(100.7, 0, -32.5, 0));

        this.entities.push(new Bush(105, 0, -32, 3, 2, 3, "#00FF00"));
        /*
        this.entities.push(new Bush(105.6, 0.4, -32, 3, 2, 3, "#00FF00"));
        this.entities.push(new Bush(106.2, 0.8, -32, 3, 2, 3, "#00FF00"));
        this.entities.push(new Bush(106.8, 1.2, -32, 3, 2, 3, "#00FF00"));
        this.entities.push(new Bush(107.4, 1.6, -32, 3, 2, 3, "#00FF00"));
        this.entities.push(new Bush(108, 2, -32, 3, 2, 3, "#00FF00"));
        this.entities.push(new Bush(105, 0, -60, 5, 1, 25, "#2f8214"));
        this.entities.push(new Bush(115, 0, -60, 5, 5, 25, "#00FF00"));
        */
        this.entities.push(new Bush(108, 2.5, -32, 3, 2, 3, "#00FF00"));
        this.entities.push(new Bush(115, 0, -55, 5, 5, 30, "#00FF00"));

        //objects next to powell library, right of stairs
        this.entities.push(new Bush(111, 0, 27, 9, 2.7, 1, "#875d53")); //brick stairs
        this.entities.push(new Bush(114, 0, 27, 9, 3.7, 1, "#875d53"));
        this.entities.push(new Trash(100.7, 0, 27, 1));
        this.entities.push(new Tree(107, 0, 55));
        this.entities.push(new Bush(112, 0, 52, 2, 4, 23, "#00FF00"));
        this.entities.push(new Bush(105, 0, 100, 5, 2, 5, "#2f8214"));


        //objects next to Royce Hall
        this.entities.push(new Stairs(-94, 0, 0, 25, 7, .5, 1));
        this.entities.push(new Bush(-95, 0, 26, 4, 4, 1, "#875d53"));
        this.entities.push(new Bush(-95, 0, -26, 4, 4, 1, "#875d53"));

        //objects next to Royce Hall, left of stairs
        this.entities.push(new Bush(-95, 0, 36, 7, 5, 8.5, "#00FF00"));
        this.entities.push(new Bush(-97, 0, 63, 1.5, 4, 16, "#00FF00"));
        this.entities.push(new Tree(-75, 0, 90));

        //objects next to Royce Hall, right of stairs
        this.entities.push(new Bush(-95, 0, -35.5, 7, 5, 8.5, "#00FF00"));
        this.entities.push(new Bush(-97, 0, -62.5, 1.5, 4, 17, "#00FF00"));


        //objects next to Haines Hall
        this.entities.push(new Bush(-97, 0, -180, 3, 2, 60, "#975d53"));
        this.entities.push(new Bush(-97, 3, -140, 3, 1, 20, "#00FF00"));
        this.entities.push(new Bush(-97, 3, -220, 3, 1, 20, "00FF00"));
        this.entities.push(new Stairs(-92, 0, -180, 10, 10, .2, 1));
        this.entities.push(new Stairs(-98, 2, -180, 10, 5, .3, 1));
        this.entities.push(new Bush(-93, 0, -145, 1, 2.5, 25, "#00FF00"));
        this.entities.push(new Bush(-93, 0, -215, 1, 2.5, 25, "#00FF00"));

        //objects next to Kaplan Hall
        this.entities.push(new Stairs(91, 0, -200, 10, 13, .3, 0));
        var iter = 0;
        for(iter = 0; iter < 4; iter = iter + 1) {
            this.entities.push(new Flower(89 + .8 * iter, .8 + .5 * iter, -189, "#FF0000"));
            this.entities.push(new Flower(89 + .8 * iter, .8 + .5 * iter, -188, "#FFFFFF"));
            this.entities.push(new Flower(89 + .8 * iter, .8 + .5 * iter, -187, "#0000FF"));
        }
        this.entities.push(new Bush(97, 2, -150, 2, 5, 40.5, "#00FF00"));
        this.entities.push(new Tree(90, 2, -170));
        this.entities.push(new Bush(97, 2, -225, 2, 3.5, 15, "#00FF00"));
        for(iter = 0; iter < 4; iter = iter + 1) {
            this.entities.push(new Flower(89 + .8 * iter, 1 , -212, "#FFFF00"));
            this.entities.push(new Flower(89 + .8 * iter, 1, -214, "#0000FF"));
        }
        //this.entities.push(new Flower(89, .8, -190, "#FFFFFF"));

        //Fountain
        this.entities.push(new Fountain());
        this.entities.push(new Bush(40, 0, 100, 20, 2, 3, "#975d53"));
        this.entities.push(new Bush(-40, 0, 100, 20, 2, 3, "#975d53"));

        this.entities.push(new Royce()); // Bella's Royce Hall
        this.entities.push(new Haines()); //Haines Hall
        this.entities.push(new Powell()); //Powell Library
        this.entities.push(new Kaplan()); //Kaplan Hall


        //flagpole
        this.entities.push(new Flagpole());

        //Bird
        //Along pathway
        this.path1=[[0.0, 7.0, 0.0,    -10.0,0.0,10.0],
                    [0.0, 7.0, 10.0,    10.0,0.0,10.0],
                    [10.0, 7.0, 10.0,  10.0, 0.0,-10.0], //-
                    [10.0, 7.0, 0.0,    -10.0,0.0,-10.0],
                    [0.0, 7.0, 0.0,    -10.0,0.0,10.0]];
        this.entities.push(new Birdy(this.path1));

        //Around Flag

        this.path2=[[-10.0, 10.0, -250.0,-5.0,0.0,5.0],
                    [-10.0, 20.0, -275.0,5.0,0.0,5.0],
                    [10.0, 30.0, -275.0,5.0,0.0,-5.0],
                    [10.0, 40.0, -250.0,-5.0,0.0,-5.0],
                    [-10.0, 10.0, -250.0,-5.0,0.0,5.0]];
        this.entities.push(new Birdy(this.path2));


        //Slides instance
        G.slides = new Slides();
        this.entities.push(G.slides);

        //Target instance
        this.entities.push(new Target(0, 0.05, -60));

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
                //points.draw(context, program_state, b.drawn_location.times(Mat4.scale(...size)));

        }
    }
}

// The target on the ground
class Target {
    constructor(x,y,z) {
        /*
        fetch('https://docs.google.com/presentation/d/1AVBgakFxnAVCK56Huu8QCWpZHfhY6XN_i2VtU2xGFrE/edit?usp=sharing.json')
        .then(response => response.json())
        .then(data => console.log(data));
        */
        this.x = x;
        this.y = y;
        this.z = z;
        this.images = [
            new Material(new Textured_Phong(), {
            color: hex_color("#000000"),
            ambient: 1, diffusivity: 0.0, specularity: 0.0,
            texture: new Texture("assets/target_transparent.png") })
        ];
        this.current_image = 0;
    }

 
    update(context, program_state) {

    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity()
            .times(Mat4.translation(this.x, this.y, this.z))
            .times(Mat4.rotation(Math.PI/2, 0, 0, 1))
            .times(Mat4.scale(0.1, 2, 2))
            
            ;
            
        //G.shapes.cube.draw(context, program_state, model_transform, G.materials.pure.override({color: color(1, 1, 1, 0)}));

        G.shapes.cube.draw(context, program_state, model_transform, this.images[this.current_image]);//G.materials.pure.override({color: color(1, 1, 1, 1.0)}));
        //G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[0]}) : G.materials.pure.override({color:this.colorArray[0]}));

    }
}

// The slides that we use in game
class Slides {
    constructor() {
        /*
        fetch('https://docs.google.com/presentation/d/1AVBgakFxnAVCK56Huu8QCWpZHfhY6XN_i2VtU2xGFrE/edit?usp=sharing.json')
        .then(response => response.json())
        .then(data => console.log(data));
        */

        this.images = [
            
        ];
        let i = 0;
        for (i = 1; i < 19; i++) {
            this.images.push(
                new Material(new Textured_Phong(), {
                    color: hex_color("#000000"),
                    ambient: 1, diffusivity: 0.1, specularity: 0.1,
                    texture: new Texture("assets/" + i + "slide.png") 
                })
            );
        }

        this.current_image = 0;
    }

    next_slide() {
        if (this.images.length - 1 <= this.current_image) {
            this.current_image = 0;
        } else {
            this.current_image += 1;
        }
    }

    prev_slide() {
        if (0 >= this.current_image) {
            this.current_image = this.images.length-1;
        } else {
            this.current_image -= 1;
        }
    }

    update(context, program_state) {

    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity().times(Mat4.translation(-60, 10, -70))
            .times(Mat4.scale(0.1, 10, 10));
            
        //G.shapes.cube.draw(context, program_state, model_transform, G.materials.pure.override({color: color(1, 1, 1, 0)}));

        G.shapes.cube.draw(context, program_state, model_transform, this.images[this.current_image]);//G.materials.pure.override({color: color(1, 1, 1, 1.0)}));
        //G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[0]}) : G.materials.pure.override({color:this.colorArray[0]}));

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
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.building : G.materials.pure);
        // Roof for Rear Box
        model_transform = Mat4.identity().times(Mat4.translation(-145, 35, 0))
            .times(Mat4.scale(25, 9, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? G.materials.roof : G.materials.pure);
        // Draw middle box
        model_transform = Mat4.identity().times(Mat4.translation(-160, 0, 0))
            .times(Mat4.scale(60, 35, 30));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.building : G.materials.pure);
        // Draw middle box roof
        model_transform = Mat4.identity().times(Mat4.translation(-160, 35, 0))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0))
            .times(Mat4.scale(30, 20, 120));
        G.shapes.prism.draw(context, program_state, model_transform, shadow ? G.materials.building : G.materials.pure);
        // Draw two towers with their rooves
        // First tower
        model_transform = Mat4.identity().times(Mat4.translation(-110, 0, -35))
            .times(Mat4.scale(12, 70, 10));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.building : G.materials.pure);
        // to-do: Draw a pyramid roof

        // Second tower
        model_transform = Mat4.identity().times(Mat4.translation(-110, 0, 35))
            .times(Mat4.scale(12, 70, 10));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.building : G.materials.pure);
        // to-do: Draw a pyramid roof
    }
}

class Powell {
    constructor() {
        this.collision_box = G.register.register(vec3(0, 0, 0));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {

        let model_transform = Mat4.identity()
        .times(Mat4.translation(220, 0, 0))
        .times(Mat4.scale(100, 50, 80));

        this.collision_box.emplace(model_transform, 0, 0);
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Roof for Main Box
        model_transform = Mat4.identity()
        .times(Mat4.translation(120 + 25, 50, 0))
        .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.roof);
        model_transform = Mat4.identity()
        .times(Mat4.translation(120 + 75, 50, 0))
        .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.roof);
        model_transform = Mat4.identity()
        .times(Mat4.translation(120 + 125, 50, 0))
        .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.roof);
        model_transform = Mat4.identity()
        .times(Mat4.translation(120 + 175, 50, 0))
        .times(Mat4.scale(25, 12, 159.8));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.roof);
        // Draw entrance inner building
        model_transform = Mat4.identity()
        .times(Mat4.translation(215, 0, 0))
        .times(Mat4.scale(105, 50, 25));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Draw roof for entrance
        model_transform = Mat4.identity()
        .times(Mat4.translation(215, 50, 0))
        .times(Mat4.rotation(Math.PI / 2, 0, 1, 0))
        .times(Mat4.scale(25, 10, 210));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.building);
        // Draw the two columns
        // First column
        model_transform = Mat4.identity()
        .times(Mat4.translation(110, 0, -25))
        .times(Mat4.scale(2.5, 60, 2.5));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Place cone above tower
        model_transform = Mat4.identity()
        .times(Mat4.translation(110, 60 + 4, -25))
        .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
        .times(Mat4.scale(2.5, 2.5, 4));
        G.shapes.cone.draw(context, program_state, model_transform, G.materials.roof);
        // Second column
        // Place cone above tower
        model_transform = Mat4.identity()
        .times(Mat4.translation(110, 0, 25))
        .times(Mat4.scale(2.5, 60, 2.5));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Place cone above tower
        model_transform = Mat4.identity()
        .times(Mat4.translation(110, 60 + 4, 25))
        .times(Mat4.rotation(-Math.PI / 2, 1, 0, 0))
        .times(Mat4.scale(2.5, 2.5, 4));
        G.shapes.cone.draw(context, program_state, model_transform, G.materials.roof);
        // Draw the octogon blocks
        model_transform = Mat4.identity()
        .times(Mat4.translation(150, 0, 0))
        .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
        .times(Mat4.scale(20, 20, 150));
        G.shapes.octogon.draw(context, program_state, model_transform, G.materials.roof);
        model_transform = Mat4.identity()
        .times(Mat4.translation(150, 0, 0))
        .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
        .times(Mat4.scale(15, 15, 170));
        G.shapes.octogon.draw(context, program_state, model_transform, G.materials.building);
    }
}

class Haines {
    constructor() {
        this.collision_box = G.register.register(vec3(0, 0, 0));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity()
        .times(Mat4.translation(-125, 0, -180))
        .times(Mat4.scale(25, 40, 60));
        this.collision_box.emplace(model_transform, 0, 0);
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);
        // Roof
        model_transform = Mat4.identity()
        .times(Mat4.translation(-125, 40, -180))
        .times(Mat4.scale(25, 10, 119.8));
        G.shapes.prism.draw(context, program_state, model_transform, G.materials.roof);

    }

}

class Kaplan {
    constructor() {
        this.collision_box = G.register.register(vec3(0, 0, 0));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity()
        .times(Mat4.translation(125, 0, -180))
        .times(Mat4.scale(25, 40, 60));
        this.collision_box.emplace(model_transform, 0, 0);
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building);

        model_transform = Mat4.identity()
        .times(Mat4.translation(105, 0, -200))
        .times(Mat4.scale(10, 45, 10));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.building.override({color: hex_color("#FFFFFF")}));
    }
}

class Tree {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.collision_box = G.register.register(vec3(this.x, this.y, this.z));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {

        let model_transform = Mat4.identity().times(Mat4.translation(this.x, this.y, this.z))
            .times(Mat4.scale(.5, 6, .5));
        this.collision_box.emplace(model_transform, 0, 0);
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.tree_bark : G.materials.pure);

        model_transform = Mat4.identity().times(Mat4.translation(this.x, this.y + 7, this.z))
            .times(Mat4.scale(3, 2, 3));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.grass.override({ambient: .5}) : G.materials.pure);

        model_transform = Mat4.identity().times(Mat4.translation(this.x, this.y + 10, this.z))
            .times(Mat4.scale(2, 1, 2));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.grass.override({ambient: .6}) : G.materials.pure);
    }
}

class Trash {
    constructor(x, y, z, isBlue) {
        this.x = x; this.y = y; this.z = z;
        this.isblue = isBlue;
        this.collision_box = G.register.register(vec3(this.x, this.y, this.z));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {


        let model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y+1, this.z))
        .times(Mat4.scale(1, 2, 1));
        this.collision_box.emplace(model_transform, 0, 0);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y+1, this.z))
        .times(Mat4.rotation(1.57, 1, 0, 0))
        .times(Mat4.scale(1, 1, 3.5));
        G.shapes.cylinder.draw(context, program_state, model_transform, shadow ? G.materials.trash_bin : G.materials.pure);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y + 2.3, this.z))
        .times(Mat4.rotation(1.57, 1, 0, 0))
        .times(Mat4.scale(1.05, 1.05, .6));

        var color = "";

        if(this.isblue)
            color = "#0000FF";
        else
            color = "#00FF00";

        G.shapes.cylinder.draw(context, program_state, model_transform, shadow ? G.materials.trash_bin.override({color: hex_color(color)}) : G.materials.pure);
    }
}

class Lamppost {
    constructor(x, y, z) {
        this.x = x; this.y = y; this.z = z;    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y + 3, this.z))
        .times(Mat4.scale(.1, 10, .1))
        .times(Mat4.rotation(Math.PI/2, 1, 0, 0));
        G.shapes.cylinder.draw(context, program_state, model_transform, shadow ? G.materials.lamppost : G.materials.pure);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y + 8, this.z))
        .times(Mat4.rotation(1.57, 0, 1, 0))
        .times(Mat4.scale(.1, .1, 3));
        G.shapes.cylinder.draw(context, program_state, model_transform, shadow ? G.materials.lamppost : G.materials.pure);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x + 1.2, this.y + 7, this.z))
        .times(Mat4.scale(.5, 1, .5));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.flower_center : G.materials.pure);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x - 1.2, this.y + 7, this.z))
        .times(Mat4.scale(.5, 1, .5));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.flower_center : G.materials.pure);
    }
}

class Flagpole {
    constructor() {
        this.collision_box = G.register.register(vec3(0, 0, 0));

        // variables
        this.sample_count = 10;
        this.t_sim = 0;
        this.timestep = 0.01;

        // spline
        this.spline = new Hermite_Spline(this.sample_count);
        this.spline.add_point(-24, 60, -250, -20, -20, 10);
        this.spline.add_point(-20, 56, -245, -35, 20,  20);
        this.points = [];
        this.curves = [];
        for (let p of this.spline.points) {
            this.points.push(p);
        }
        for (let c of this.spline.curve_fns) {
            this.curves.push(new Curve_Shape(c, this.sample_count));
        }

        // initialize mesh
        this.mesh = new Spring_System();
        this.mesh.set_gravity(3);

        // dimensions of flag are 12x24
        // triangles are 6x8
        // 2 triangles height and 3 triangles width
        this.mesh.create_particles(12);
        this.mesh.create_springs(23);
        this.mesh.set_particle(0,  0.5,-24, 60, -250, 0, 0 ,0);
        this.mesh.set_particle(1,  0.5,-24, 54, -250, 0, 0 ,0);
        this.mesh.set_particle(2,  0.5,-24, 48, -250, 0, 0 ,0);
        this.mesh.set_particle(3,  0.5,-16, 60, -250, 0, 0 ,0);
        this.mesh.set_particle(4,  0.5,-16, 54, -250, 0, 0 ,0);
        this.mesh.set_particle(5,  0.5,-16, 48, -250, 0, 0 ,0);
        this.mesh.set_particle(6,  0.5,-8,  60, -250, 0, 0 ,0);
        this.mesh.set_particle(7,  0.5,-8,  54, -250, 0, 0 ,0);
        this.mesh.set_particle(8,  0.5,-8,  48, -250, 0, 0 ,0);
        this.mesh.set_particle(9,  0.5,0,   60, -250, 0, 0 ,0);
        this.mesh.set_particle(10, 0.5,0,   54, -250, 0, 0 ,0);
        this.mesh.set_particle(11, 0.5,0,   48, -250, 0, 0 ,0);
        // vertical connections
        this.mesh.link_spring(0, 0,  1,  1000, 10, 6);
        this.mesh.link_spring(1, 1,  2,  1000, 10, 6);
        this.mesh.link_spring(2, 3,  4,  1000, 10, 6);
        this.mesh.link_spring(3, 4,  5,  1000, 10, 6);
        this.mesh.link_spring(4, 6,  7,  1000, 10, 6);
        this.mesh.link_spring(5, 7,  8,  1000, 10, 6);
        this.mesh.link_spring(6, 9,  10, 1000, 10, 6);
        this.mesh.link_spring(7, 10, 11, 1000, 10, 6);
        // horizontal connections
        this.mesh.link_spring(8,  0,  3,  1000, 10, 8);
        this.mesh.link_spring(9,  3,  6,  1000, 10, 8);
        this.mesh.link_spring(10, 6,  9,  1000, 10, 8);
        this.mesh.link_spring(11, 1,  4,  1000, 10, 8);
        this.mesh.link_spring(12, 4,  7,  1000, 10, 8);
        this.mesh.link_spring(13, 7,  10, 1000, 10, 8);
        this.mesh.link_spring(14, 2,  5,  1000, 10, 8);
        this.mesh.link_spring(15, 5,  8,  1000, 10, 8);
        this.mesh.link_spring(16, 8,  11, 1000, 10, 8);
        // diagonal connections
        this.mesh.link_spring(17, 0,  4,  1000, 10, 10);
        this.mesh.link_spring(18, 1,  5,  1000, 10, 10);
        this.mesh.link_spring(19, 3,  7,  1000, 10, 10);
        this.mesh.link_spring(20, 4,  8,  1000, 10, 10);
        this.mesh.link_spring(21, 6,  10, 1000, 10, 10);
        this.mesh.link_spring(22, 7,  11, 1000, 10, 10);

        // vertices for flag polygons
        this.triangle_vertices = [
            [0, 1, 4], [4, 3, 0], [3, 4, 7], [7, 6, 3], [6, 7, 10], [10, 9, 6],
            [1, 2, 5], [5, 4, 1], [4, 5, 8], [8, 7, 4], [7, 8, 11], [11, 10, 7]];
    }

    // p1-p2 is height, p3-p2 is length, and p1-p3 is hypotenuse
    triangle_transform(p1, p2, p3) {
        // legs of triangle
        let x = p3.minus(p2);
        let y = p1.minus(p2);
        let z = p1.minus(p3);

        // scale triangle
        let model_transform = Mat4.scale(x.norm(), y.norm(), z.norm());

        // apply change of bases
        let u = [];
        u[0] = x.normalized();
        u[1] = y.normalized();
        u[2] = u[1].cross(u[0]).normalized();
        let change_of_bases = Mat4.identity();
        for (let i = 0; i < 3; i++) {
            change_of_bases[i][0] = u[0][i];
            change_of_bases[i][1] = u[1][i];
            change_of_bases[i][2] = u[2][i];
        }
        model_transform.pre_multiply(change_of_bases);

        // translate triangle
        model_transform.pre_multiply(Mat4.translation(p2[0], p2[1], p2[2]));
        return model_transform;
    }

    spring_transform(i) {
        let s = this.mesh.springs[i];
        const p1 = this.mesh.particles[s.p1].pos;
        const p2 = this.mesh.particles[s.p2].pos;
        const len = (p2.minus(p1)).norm();
        const center = (p1.plus(p2)).times(0.5);

        let model_transform;
        if (i < 17) {
            model_transform = Mat4.scale(0.1, len / 2 + 0.1, 0.02);
        }
        else {
            model_transform = Mat4.scale(0.1, len / 2, 0.02);
        }
        // from week 6 discussion and
        // https://computergraphics.stackexchange.com/questions/4008/rotate-a-cylinder-from-xy-plane-to-given-points
        const p = p1.minus(p2).normalized();
        let v = vec3(0,1,0);
        if (Math.abs(v.cross(p).norm()) < 0.1) {
            v = vec3(0,0,1);
            model_transform = Mat4.scale(0.05, 0.05, len/2);
        }

        const w = v.cross(p).normalized();
        const theta = Math.acos(v.dot(p));
        model_transform.pre_multiply(Mat4.rotation(theta, w[0], w[1], w[2]));
        model_transform.pre_multiply(Mat4.translation(center[0], center[1], center[2]));
        return model_transform;
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        // draw flagpole
        let model_transform = Mat4.identity()
        .times(Mat4.translation(0, 30, -250))
        .times(Mat4.scale(.5, 60, .5))
        .times(Mat4.rotation(Math.PI/2, 1, 0, 0));
        this.collision_box.emplace(model_transform, 0, 0);
        G.shapes.cylinder.draw(context, program_state, model_transform, G.materials.lamppost);

        // if (this.step < this.sample_count){
        //     this.step += 0.05;
        // }
        // if (this.step >= this.sample_count){
        //     this.step = 0;
        //     this.curve_step +=1;
        // }
        // if (this.curve_step > (this.spline.num_points-2)){
        //     this.curve_step=0;
        // }
        //
        // let fn = this.spline.curve_fns[this.curve_step];
        //
        // let top_pos = fn(this.step / this.sample_count);

        let dt = Math.min(1 / 30, program_state.animation_delta_time / 1000);
        let t_next = this.t_sim + dt;
        let t_spline = 0.5 * Math.sin(1 / 4 * Math.PI * (this.t_sim) - Math.PI / 2) + 0.5;    // loops between 0 and 3

        let top_pos = this.spline.curve_fns[0](t_spline);

        while (this.t_sim < t_next) {
            this.mesh.symplectic_update(this.timestep);
            this.mesh.particles[9].pos = vec3(0, 60, -250);
            this.mesh.particles[9].vel = vec3(0, 0, 0);
            this.mesh.particles[9].acc = vec3(0, 0, 0);
            this.mesh.particles[10].pos = vec3(0, 54, -250);
            this.mesh.particles[10].vel = vec3(0, 0, 0);
            this.mesh.particles[10].acc = vec3(0, 0, 0);
            this.mesh.particles[11].pos = vec3(0, 48, -250);
            this.mesh.particles[11].vel = vec3(0, 0, 0);
            this.mesh.particles[11].acc = vec3(0, 0, 0);
            this.mesh.particles[0].pos = top_pos;
            this.mesh.particles[0].vel = vec3(0, 0, 0);
            this.mesh.particles[0].acc = vec3(0, 0, 0);
            this.t_sim += this.timestep;
        }

        // dampen velocity
        for (let i = 0; i < this.mesh.particles.length; i++) {
            this.mesh.particles[i].vel = this.mesh.particles[i].vel.times(0.8);
        }

        // draw flag mesh and spline
        if (G.show_mesh) {
            // draw particles
            for (let p of this.mesh.particles) {
                model_transform = Mat4.scale(0.25, 0.25, 0.25);
                model_transform.pre_multiply(Mat4.translation(p.pos[0], p.pos[1], p.pos[2]));
                G.shapes.sphere.draw(context, program_state, model_transform, G.materials.grass);
            }
            // draw springs
            for (let i = 0; i < this.mesh.springs.length; i++) {
                model_transform = this.spring_transform(i);
                G.shapes.square.draw(context, program_state, model_transform, G.materials.whiteSquare);
            }
            // draw spline
            for (let c of this.curves) {
                c.draw(context, program_state);
            }
        }
        // draw flag
        else {
            for (let v of this.triangle_vertices) {
                let p1 = this.mesh.particles[v[0]].pos;
                let p2 = this.mesh.particles[v[1]].pos;
                let p3 = this.mesh.particles[v[2]].pos;
                model_transform = this.triangle_transform(p1, p2, p3);
                G.shapes.triangle.draw(context, program_state, model_transform, G.materials.whiteSquare);
            }

            // draw horizontal + vertical chain springs (fill in flag edges)
            for (let i = 0; i < this.mesh.springs.length; i++) {
                model_transform = this.spring_transform(i);
                G.shapes.square.draw(context, program_state, model_transform, G.materials.whiteSquare);
            }
        }
    }
}

class Flower {
    constructor(x, y, z, color) {
        this.x = x; this.y = y+.5; this.z = z;
        this.color = color;
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y, this.z))
        .times(Mat4.scale(.1, .6, .1));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.grass : G.materials.pure);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y + .6, this.z))
        .times(Mat4.scale(.2, .2, .2));
        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.flower_center : G.materials.pure);

        var i;
        for (i = 10; i < 60; i = i + 10) {
            model_transform = Mat4.identity()
            .times(Mat4.translation(this.x, this.y + .6, this.z))
            .times(Mat4.rotation(i, 0, 0, 1))
            .times(Mat4.scale(.1, .5, .05));
            G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.grass.override({color: hex_color(this.color)}) : G.materials.pure);
        }
    }
}

class Stairs {
    constructor(x, y, z, length, num_steps, size, is_reverse) {
        this.x = x; this.y = y; this.z = z;
        this.length = length; this.num_steps = num_steps; this.size = size;
        this.is_reverse = is_reverse;
        this.collision_box = G.register.register(vec3(this.x, this.y, this.z));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        let approx_reach = this.size * this.num_steps;
        let model_transform = Mat4.identity()
        .times(Mat4.translation(this.x + .5 * approx_reach, this.y + .5 * approx_reach, this.z))
        .times(Mat4.scale(.6 * approx_reach, .7 * approx_reach, .9 * this.length))
        .times(Mat4.rotation(1.57, 0, 1, 0));

        this.collision_box.emplace(model_transform, 0, 0);

        model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y + this.size, this.z))
        .times(Mat4.scale(this.size, this.size, this.length));

        var orient = 1;
        if(this.is_reverse)
            orient = -1;

        var i;
        for (i = 0; i < this.num_steps; i++) {
            G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.brick_stairs : G.materials.pure);
            model_transform = Mat4.identity()
            .times(Mat4.translation(this.x + orient * this.size * (i + 1), this.y + this.size * (i + 2), this.z))
            .times(Mat4.scale(this.size, this.size, this.length ));

        }

    }
}

class Bush {
    constructor(x, y, z, width, height, length, color) {
        this.x = x; this.y = y; this.z = z;
        this.height = height; this.width = width; this.length = length;
        this.color = color;
        this.collision_box = G.register.register(vec3(this.x, this.y, this.z));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {

        let model_transform = Mat4.identity()
        .times(Mat4.translation(this.x, this.y, this.z))
        .times(Mat4.scale(this.width, this.height, this.length))
        this.collision_box.emplace(model_transform, 0, 0);

        G.shapes.cube.draw(context, program_state, model_transform, shadow ? G.materials.grass.override({color: hex_color(this.color)}) : G.materials.pure);
    }
}

class Fountain {
    constructor() {
        this.collision_box = G.register.register(vec3(0, 0, 0));
    }

    update(context, program_state) {
    }

    draw(context, program_state, shadow) {
        let model_transform = Mat4.identity()
        .times(Mat4.translation(0, 0, 100))
        .times(Mat4.scale(18, 2, 18));
        this.collision_box.emplace(model_transform, 0, 0);

        var i;
        for (i = .1; i < 6.28; i = i + .4) {
            model_transform = Mat4.identity()
            .times(Mat4.translation(0, 0, 100))
            .times(Mat4.rotation(i + 1.57, 0, 1, 0))
            .times(Mat4.translation(0, 0, 20))
            .times(Mat4.scale(4, 2, 1));

            G.shapes.cube.draw(context, program_state, model_transform, G.materials.brick_stairs);
        }

        model_transform = Mat4.identity()
        .times(Mat4.translation(0, 1.8, 100))
        .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
        .times(Mat4.scale(19, 19, 1));
        G.shapes.circle.draw(context, program_state, model_transform, G.materials.whiteSquare.override({color: hex_color("#00006F")}));

        model_transform = Mat4.identity()
        .times(Mat4.translation(0, 5, 100))
        .times(Mat4.scale(.8, 5, .8));
        G.shapes.cube.draw(context, program_state, model_transform, G.materials.whiteSquare.override({color: hex_color("#0000FF")}));
    }
}


//Bird
class Birdy extends Shape {
    constructor(v){
        super( "position", "normal", "texture_coord" );
        
        //colors
        this.color1=color(Math.random(),Math.random(),Math.random(),1);
        this.color2=color(Math.random(),Math.random(),Math.random(),1);
        this.color3=color(Math.random(),Math.random(),Math.random(),1);
        this.color4=color(Math.random(),Math.random(),Math.random(),1);
        this.yellow=color( 1,0.7,0,1 );

        //arrays
        this.points = [];
        this.curves = [];

        //variables
        this.sample_count = 10;
        this.step=0;
        this.curve_step=0;
        this.prev_vec=vec3(0,0,0);

        //spline
        this.spline = new Hermite_Spline(this.sample_count);

        //populating spline
        //v is array of array[ x,y,z,,tx,ty,tz]
        for (let pt of v){
            this.spline.add_point(pt[0],pt[1],pt[2],pt[3],pt[4],pt[5])
        }
        for (let p of this.spline.points) {
         this.points.push(p);
        }
         for (let c of this.spline.curve_fns) {
         // console.log(c(2));
             this.curves.push(new Curve_Shape(c, this.sample_count));
    }  
    }

    draw(context, program_state, shadow ) {
        let prev_step=0;

        //to draw the curve
        if (G.show_curve){
        for (let c of this.curves) {

        c.draw(context, program_state);
            }
        }

        if (this.step <=this.sample_count){
        prev_step=this.step;
        this.step +=0.05;
        }
        if (this.step >this.sample_count){
        this.step=0;
        //prev_step=0
        this.curve_step +=1;
        }
        if (this.curve_step > (this.spline.num_points-2)){
        this.curve_step=0;

        }
        if (this.spline.num_points >0){
        let fn= this.spline.curve_fns[this.curve_step];

        let pos = fn(this.step/this.sample_count);

        let next =fn ((this.step+1)/this.sample_count);
        let dis=next.minus(pos);
        let x= dis.normalized();
        let dt=x.minus(this.prev_vec.normalized());
        let y=dt.normalized();
        this.prev_vec=x;
        //change of basis
        let u = [];
        u[0] = x;
        u[1] = y;
        u[2] = u[1].cross(u[0]).normalized();
        let change_of_bases = Mat4.identity();
        for (let i = 0; i < 3; i++) {
        change_of_bases[i][0] = u[0][i];
        change_of_bases[i][1] = u[1][i];
        change_of_bases[i][2] = u[2][i];
        }

        let model_transform=Mat4.scale(0.5,0.5,0.5)
                        .times(Mat4.rotation(1.5,-1,0,0))
                        .times(Mat4.rotation(1.5,0,1,0));

        model_transform=model_transform.pre_multiply(change_of_bases);

        model_transform= model_transform
        .pre_multiply(Mat4.translation(pos[0],pos[1],pos[2]));    
        this.drawing_parts(context,program_state,model_transform,shadow);
            
        }
    }

    drawing_parts(context,program_state,model_transform,shadow) {


        let main_body_transform=model_transform
        .times(Mat4.scale(0.5,0.4,1));
        G.shapes.sphere.draw(context, program_state, main_body_transform, {...G.materials.brick_stairs,color:this.color1});

        //head
        let head_transform=model_transform
        .times(Mat4.translation(0,0.35,1.2))
        .times(Mat4.rotation(60,-1,0,0))
        .times(Mat4.scale(0.25,0.30,0.5));
        G.shapes.sphere.draw(context, program_state, head_transform, {...G.materials.brick_stairs,color:this.color2});

        //beak
        let beak_transform=model_transform
        .times(Mat4.translation(0,0.35,1.8))
        //.times(Mat4.rotation(60,-1,0,0))
        .times(Mat4.scale(0.1,0.1,0.4));

        G.shapes.cone.draw(context, program_state, beak_transform, {...G.materials.brick_stairs,color:this.yellow});

        //right wing
        let rocking_angle=Math.PI/13*Math.sin(2*Math.PI*1/1*program_state.animation_time/1000);
        let theta=Math.PI/9;
        let right_wing_transform=model_transform
        .times(Mat4.translation(-1.1,0.2,0.2))
        .times(Mat4.rotation(rocking_angle,0,0,1))
        .times(Mat4.scale(1,0.1,0.3));
        G.shapes.sphere.draw(context, program_state, right_wing_transform, {...G.materials.brick_stairs,color:this.color3});

        //left wing
        let left_wing_transform=model_transform
        .times(Mat4.translation(1.1,0.2,0.2))
        .times(Mat4.rotation(-rocking_angle,0,0,1))
        .times(Mat4.scale(1,0.1,0.3));
        G.shapes.sphere.draw(context, program_state, left_wing_transform, {...G.materials.brick_stairs,color:this.color3});


        //tail
        let  tail_transform=model_transform
        .times(Mat4.translation(0,-0.1,-1.2))
        .times(Mat4.rotation(49.9,1,0,0))
        .times(Mat4.scale(0.1,0.05,0.6));
        G.shapes.sphere.draw(context, program_state, tail_transform, {...G.materials.brick_stairs,color:this.color4});
        let tail_transform2=tail_transform
        .times(Mat4.translation(1,-1,0));
        G.shapes.sphere.draw(context, program_state, tail_transform2,{...G.materials.brick_stairs,color:this.color4});
        let tail_transform3=tail_transform
        .times(Mat4.translation(-1,-1,0));
        G.shapes.sphere.draw(context, program_state, tail_transform3, {...G.materials.brick_stairs,color:this.color4});

    }
      update(context, program_state) {
        }
}


// This is a general player. It is used to make adding new players easy. Use local player for the player
// that you actually control in the game.
class Player {
    constructor(socket_id) {
        this.player_matrix =Mat4.identity()
                                            //.times(Mat4.scale(1, 2, 1))
                                            .times(Mat4.translation(Math.random() * 40 - 20, 10, Math.random() * 200 - 100))
                                            //.times(Mat4.scale(1, 2, 1))
                                            ;
        this.player_model = new Articulated_Player(this.player_matrix);
        this.socket_id = socket_id;
        this.collision_box = G.register.register(vec3(0, 0, 0), socket_id);

        this.rocking_time=0;
        this.rocking_angle=0;
        this.rocking_angle2=0;
        this.rocking_angle3=0;//Math.PI/24*Math.sin(2*Math.PI*1/1*program_state.animation_time/1000);
        // 4 random colors for upper body, head, arms, and legs
        this.colorArray = [];
        for (var j=0;j<4;j++)
            this.colorArray[j]=color(Math.random(), Math.random(), Math.random(), 1.0);
    }

    update(context, program_state) {
        let player_box = this.player_matrix   .times(Mat4.translation(0, 0.6, 0))
                                        .times(Mat4.scale(1, 1.7, 1));
        //let player_box = this.player_matrix.times(Mat4.scale(1, 2, 1));
        this.collision_box.emplace(player_box, 0, 0);
        /*
        this.rocking_time+=program_state.animation_delta_time/1000;
        this.rocking_angle=Math.PI/24*Math.sin(2*Math.PI*1/1*this.rocking_time);
        this.rocking_angle2=Math.PI/24*Math.cos(2*Math.PI*1/1*this.rocking_time);
        */
        //this.rocking_time+=program_state.animation_delta_time/1000;
        this.rocking_time = program_state.animation_time/1000;
        this.rocking_angle=Math.PI/24*Math.sin(2*Math.PI*1/1*this.rocking_time);
        this.rocking_angle2=Math.PI/24*Math.cos(2*Math.PI*1/1*this.rocking_time);

        // assume this is a remote player
        if (this.socket_id !== G.player_id) {
            let pos = G.remote_data[this.socket_id];
            //console.log(this.socket_id);
            //console.log(pos);
            this.player_matrix = Matrix.of(pos[0], pos[1], pos[2], pos[3]);
        }
    }

    // MADE CHANGES HERE TO DRAW THE PLAYER AND ANIMATE IT
        // Define the directions: +Y: UP
        //                        -Y: DOWN
        //                        +X: RIGHT    (Toward Powell)
        //                        -X: LEFT     (Toward Royce)
        //                        +Z: Backward (Toward the hill)
        //                        -Z: Forward  (Toward the campus)
    draw(context, program_state, shadow) {
        if (!G.hide_other_players) {

            //G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player : G.materials.pure);
             // The  player_matrix coordinates origin (0,0,0) will represent the bottom-middle of the upper body
            // First draw the upper body as a 1.2x1.5x0.6 rectangle centered at (0, 0.75, 0)
            // Upper Body:

            this.player_matrix=this.player_matrix.times(Mat4.translation(0,0.75,0))
                                                 .times(Mat4.scale(0.6,0.75,0.3));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[0]}) : G.materials.pure.override({color:this.colorArray[0]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.6,1/0.75,1/0.3))
                                                 .times(Mat4.translation(0,-0.75,0));

            // Define angles for rocking the legs and arms
            //let rocking_angle3=Math.PI/24*Math.sin(2*Math.PI*1/1*program_state.animation_time/1000);
            //let rocking_angle2=Math.PI/24*Math.cos(2*Math.PI*1/1*program_state.animation_time/1000);

            // Now draw the two legs as two rectangles underneath the body
            // Centered at (-0.3,-0.5,0) and (0.3, 0.5, 0)
            // Both of dimensions 0.4x1.0x0.4
            // Leg 1:
            this.player_matrix=this.player_matrix.times(Mat4.translation(-0.3,-0.5,0))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(this.rocking_angle,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.scale(0.2,0.5,0.2));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[1]}) : G.materials.pure.override({color:this.colorArray[1]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.2,1/0.5,1/0.2))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(-this.rocking_angle,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.translation(0.3,0.5,0));

            // Leg 2:
            this.player_matrix=this.player_matrix.times(Mat4.translation(0.3,-0.5,0))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(this.rocking_angle2,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.scale(0.2,0.5,0.2));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[1]}) : G.materials.pure.override({color:this.colorArray[1]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.2,1/0.5,1/0.2))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(-this.rocking_angle2,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.translation(-0.3,0.5,0));

            // Now draw two arms as two rotated rectangles on either side of the body
            // Both of dimensions 0.4x1.5x0.4
            // Both rotated about the shoulders (0.6, 1.5, 0) and (-0.6, 1.5, 0) by an angle theta (z-axis rotation)
            // Arm 1:
            let theta=Math.PI/12;

            this.player_matrix=this.player_matrix.times(Mat4.translation(0.6,1.5,0))
                                                 .times(Mat4.rotation(theta,0,0,1))
                                                 .times(Mat4.rotation(this.rocking_angle,1,0,0))
                                                 .times(Mat4.scale(0.2,0.75,0.2))
                                                 .times(Mat4.translation(1,-1,0));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[2]}) : G.materials.pure.override({color:this.colorArray[2]}));
            this.player_matrix=this.player_matrix.times(Mat4.translation(-1,1,0))
                                                 .times(Mat4.scale(1/0.2,1/0.75,1/0.2))
                                                 .times(Mat4.rotation(-this.rocking_angle,1,0,0))
                                                 .times(Mat4.rotation(-theta,0,0,1))
                                                 .times(Mat4.translation(-0.6,-1.5,0));

            // Arm 2:
            this.player_matrix=this.player_matrix.times(Mat4.translation(-0.6,1.5,0))
                                                 .times(Mat4.rotation(-theta,0,0,1))
                                                 .times(Mat4.rotation(this.rocking_angle2,1,0,0))
                                                 .times(Mat4.scale(0.2,0.75,0.2))
                                                 .times(Mat4.translation(-1,-1,0));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[2]}) : G.materials.pure.override({color:this.colorArray[2]}));
            this.player_matrix=this.player_matrix.times(Mat4.translation(1,1,0))
                                                 .times(Mat4.scale(1/0.2,1/0.75,1/0.2))
                                                 .times(Mat4.rotation(-this.rocking_angle2,1,0,0))
                                                 .times(Mat4.rotation(theta,0,0,1))
                                                 .times(Mat4.translation(0.6,-1.5,0));

            let rocking_angle3=Math.PI/24*Math.sin(2*Math.PI*1/1*program_state.animation_time/1000);
            // Draw head as one cube on top of the upper body centered at (0, 1.5 + 0.5, 0)
            // Dimensions are 1.0x1.0x1.0
            // Head:
            this.player_matrix=this.player_matrix.times(Mat4.translation(0,2,0))
                                                 .times(Mat4.translation(rocking_angle3*0.25,0,0))
                                                 .times(Mat4.scale(0.5,0.5,0.5));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[3]}) : G.materials.pure.override({color:this.colorArray[3]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.5,1/0.5,1/0.5))
                                                 .times(Mat4.translation(-rocking_angle3*0.25,0,0))
                                                 .times(Mat4.translation(0,-2,0));


        }
    }
}

// this is for the player that the user actually controls. The parent class player is also used for
// connected players
class LocalPlayer extends Player {
    constructor() {
        super();
        this.camera_matrix = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));
        this.acceleration = vec3(0, 0, 0);
        this.velocity = vec3(0, 0, 0);
        this.jumping = false;
        this.speed = 0.1;
        this.rotation_speed = 0.01;
        this.jumptime=0;
        // this.collisions = {
        //     f: false, // forward
        //     b: false, // backward
        //     l: false, // left
        //     r: false, // right
        //     d: false, // down
        //     u: false // up
        // };
        this.collision_matrix = this.player_matrix;//this.player_matrix.times(Mat4.scale(1, 2, 1));

        //this.local_collision_box = G.register.register(vec3(0, 0, 0), "localplayer");

        // 4 random colors for upper body, head, arms, and legs
        /* Already created in the player parent class
        this.colorArray = [];
        for (var j=0;j<4;j++)
            this.colorArray[j]=color(Math.random(), Math.random(), Math.random(), 1.0);
            */
       //
       //this.rocking_time=0; // Already created in parent player class
       this.playerMoved=false;
       //this.rocking_angle=0; // already defined in parent player class
       //this.rocking_angle2=0;// already defined in parent player class
       this.flip_angle=0;

       this.ks = 0.5; // static force
       this.kd = 0.5; // kinetic force
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

        //check if player is walking 
        if((G.controls.w || G.controls.a || G.controls.s || G.controls.d) && !this.jumping){
            this.player_model.is_walking = true;
        }else{
            this.player_model.is_walking = false;
        }

        this.velocity[2] = 0; // don't move unless button pressed
        if (G.controls.w === true) {
            G.key_was_pressed = true;
            this.playerMoved=true;
            //this.acceleration = this.acceleration.plus([0, 0, -this.speed]);
            //this.player_matrix = this.player_matrix.times(Mat4.translation(0, 0, -this.speed));
            //this.velocity = vec3(this.velocity.x, this.velocity.y, -this.speed );
            this.velocity[2] = -this.speed * 3;
        }
        if (G.controls.s === true) {
            G.key_was_pressed = true;
            this.playerMoved=true;
            //this.player_matrix = this.player_matrix.times(Mat4.translation(0, 0, this.speed));
            this.velocity[2] = this.speed * 3;
        }
        if (G.controls.d === true) {
            G.key_was_pressed = true;
            this.playerMoved=true;
            this.player_matrix = this.player_matrix
                .times(Mat4.rotation(-2 * Math.PI * this.rotation_speed, 0, 1, 0))

            //.times(Mat4.translation(0,0,-z));
        }
        if (G.controls.a === true) {
            G.key_was_pressed = true;
            this.playerMoved=true;
            this.player_matrix = this.player_matrix
                .times(Mat4.rotation(2 * Math.PI * this.rotation_speed, 0, 1, 0))
            //.times(Mat4.translation(0,0,-z));
        }

        if (G.controls.shift === true && this.player_model.is_waving != true) {
            G.key_was_pressed = true;
            if (!this.jumping) {
                this.jumping = true;
                //this.player_matrix = this.player_matrix.times(Mat4.translation(0,1,0));
                //console.log("m pressed");
                this.apply_force([0, 9.8 * 0.02, 0]);
            }
        }

        if(G.controls.f === true && this.jumping != true){
            G.key_was_pressed = true;
            this.player_model.is_waving = true;
            this.player_model.set_wave_fn(this.player_model._get_current_end_effector_loc());
        }
        //desired = desired.map((x,i) => Vector.from(this.camera_matrix).mix(x, 0.1));
        //program_state.set_camera(desired);
    }

    // test if problem in new position
    collision_test(new_position) {
        //this.local_collision_box.emplace(new_position, 0, 0);
        let player_box = new_position   .times(Mat4.translation(0, 0.6, 0))
                                        .times(Mat4.scale(1, 1.7, 1));
        this.collision_box.emplace(player_box, 0, 0);

        //for (let a of G.bodies) {
            // a.inverse = Mat4.inverse(a.drawn_location);

            // Cache the inverse of matrix of body "a" to save time.
            //let a = this.collision_box;
            /*
            let a = this.local_collision_box;
            a.inverse = Mat4.inverse(a.drawn_location);
            */
            // *** Collision process is here ***
            // Loop through all bodies again (call each "b"):
            //return false;
            for (let b of G.bodies) {
                //if (a.socket_id !== "" && a.socket_id !== "localplayer") continue;
                // Pass the two bodies and the collision shape to check_if_colliding():
                b.inverse = Mat4.inverse(b.drawn_location);
                if (!b.check_if_colliding(this.collision_box, G.collider))
                    continue;
                // If we get here, we collided, so turn red and zero out the
                // velocity so they don't inter-penetrate any further.

                // a.material = this.active_color;
                // a.linear_velocity = vec3(0, 0, 0);
                // a.angular_velocity = 0;
                //console.log(a.socket_id);
                console.log("collision");
                return true;
            }
        //}
    }

    update(context, program_state) {
        this.acceleration = this.acceleration.times(0);

        this.key_pressed(context, program_state);
        // if (this.key_was_pressed) {
        //     this.camera_matrix = Mat4.inverse(this.player_matrix
        //             .times(Mat4.translation(0, 2, 10))
        //         //.times(Mat4.rotation(Math.PI/4,0,0,0))
        //     );
        // }
        //
        if (this.playerMoved || this.jumping)
        {
            this.rocking_time+=program_state.animation_delta_time/1000;
            this.rocking_angle=Math.PI/24*Math.sin(2*Math.PI*1/1*this.rocking_time);
            this.rocking_angle2=Math.PI/24*Math.cos(2*Math.PI*1/1*this.rocking_time);
        }

        this.playerMoved=false;
        const g = -9.8 * 0.001;

        this.apply_force([0, g, 0]); // gravity

        //this.velocity = this.velocity.plus(g); // apply gravity

        //console.log(this.velocity);
        

        // test if bottom collision
        this.collision_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], 0));
        if (this.collision_test(this.collision_matrix)) {
            this.jumping = false;
            this.jumptime=0;
            this.flip_angle=0;
            this.velocity = vec3(0, 0, this.velocity[2]);
        }

        // stop at the ground
        if (this.player_matrix[1][3] <= 1.25 && this.velocity[1] < 0) {
            //this.velocity = [this.velocity[0], 0, this.velocity[1]];
            this.velocity[1] = 0;
            this.jumping = false;
            this.jumptime=0;
            this.flip_angle=0;
        }


        this.collision_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], this.velocity[2]));

        // moving into a collision
        if (this.collision_test(this.collision_matrix)) {
            this.velocity = vec3(0, this.velocity[1], 0);
        }

        // already in a collision without moving
        if (this.collision_test(this.player_matrix)) {
            console.log("colliding in object");
            //this.apply_force([0, 0, -this.speed * 3]);
            //this.velocity = vec3(0, 0, this.speed * 3);
            // apply a mass spring damper system to move the player outside of the object
            const P_g = 2;
            const x_t = 1;
            const static_force = (P_g-x_t)*this.ks;
            const dynamic_force = this.kd*(this.velocity[2]);
            const normal_force = static_force - dynamic_force;
            this.velocity = vec3(0, 0, normal_force);
        }

        
        this.player_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], this.velocity[2])); //this.velocity.z));
        this.velocity = this.velocity.plus(this.acceleration);
        //this.player_matrix = this.player_matrix.times(Mat4.translation(0,-0.001,0,)); //this.velocity.z));

        
        //console.log(this.acceleration);

        // update camera
        this.camera_matrix = Mat4.inverse(this.player_matrix.times(Mat4.translation(0, 2, 10))
            //.times(Mat4.rotation(Math.PI/4,0,0,0))
        );
        program_state.set_camera(this.camera_matrix);

        
        /*
        // tell the server our position
        G.socket.emit('update', {
            player_matrix: this.player_matrix,
        })
        */
        this.player_model.update(this.player_matrix, program_state);
    }

    draw(context, program_state, shadow) {
        if (!G.hide_my_player) {
            // MADE CHANGES HERE TO DRAW THE PLAYER AND ANIMATE IT
            // Define the directions: +Y: UP
            //                        -Y: DOWN
            //                        +X: RIGHT    (Toward Powell)
            //                        -X: LEFT     (Toward Royce)
            //                        +Z: Backward (Toward the hill)
            //                        -Z: Forward  (Toward the campus)


            // If the player is jumping, then the player matrix should rotate so as to create a forward flip
            // Forward flip:
            if (this.jumping == true)
            {
                if (this.jumptime == 0)
                {
                    // we are at the start of the jump
                    // update the jump time at each iteration

                    this.jumptime+=0.01;
                }
                else if (this.jumptime < 0.5)
                {
                    // from 0 second after hitting jump until 0.5 seconds later, just update the jump time
                    this.jumptime+=0.01;
                }
                else if (this.jumptime >= 0.5 && this.jumptime < 1.5)
                {
                    // At 0.5 seconds, start the forward flip by rotating the entire player_matrix forward
                    // About the x-axis
                    // The body must perform one rotation in one second exactly

                    this.jumptime+=0.01;
                    this.flip_angle=2*Math.PI*(this.jumptime-0.5);
                }
            }

            // Perform the forward flip
            this.player_matrix=this.player_matrix.times(Mat4.translation(0,0.75,0));
            this.player_matrix=this.player_matrix.times(Mat4.rotation(this.flip_angle,1,0,0));
            this.player_matrix=this.player_matrix.times(Mat4.translation(0,-0.75,0));

            /*
            // The  player_matrix coordinates origin (0,0,0) will represent the bottom-middle of the upper body
            // First draw the upper body as a 1.2x1.5x0.6 rectangle centered at (0, 0.75, 0)
            // Upper Body:
            this.player_matrix=this.player_matrix.times(Mat4.translation(0,0.75,0))
                                                 .times(Mat4.scale(0.6,0.75,0.3));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[0]}) : G.materials.pure.override({color:this.colorArray[0]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.6,1/0.75,1/0.3))
                                                 .times(Mat4.translation(0,-0.75,0));

            // Define angles for rocking the legs and arms
            let rocking_angle3=Math.PI/24*Math.sin(2*Math.PI*1/1*program_state.animation_time/1000);
            //let rocking_angle2=Math.PI/24*Math.cos(2*Math.PI*1/1*program_state.animation_time/1000);

            // Now draw the two legs as two rectangles underneath the body
            // Centered at (-0.3,-0.5,0) and (0.3, 0.5, 0)
            // Both of dimensions 0.4x1.0x0.4
            // Leg 1:
            this.player_matrix=this.player_matrix.times(Mat4.translation(-0.3,-0.5,0))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(this.rocking_angle,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.scale(0.2,0.5,0.2));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[1]}) : G.materials.pure.override({color:this.colorArray[1]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.2,1/0.5,1/0.2))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(-this.rocking_angle,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.translation(0.3,0.5,0));
            // Leg 2:
            this.player_matrix=this.player_matrix.times(Mat4.translation(0.3,-0.5,0))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(this.rocking_angle2,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.scale(0.2,0.5,0.2));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[1]}) : G.materials.pure.override({color:this.colorArray[1]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.2,1/0.5,1/0.2))
                                                 .times(Mat4.translation(0,0.5,0))
                                                 .times(Mat4.rotation(-this.rocking_angle2,1,0,0))
                                                 .times(Mat4.translation(0,-0.5,0))
                                                 .times(Mat4.translation(-0.3,0.5,0));

            // Now draw two arms as two rotated rectangles on either side of the body
            // Both of dimensions 0.4x1.5x0.4
            // Both rotated about the shoulders (0.6, 1.5, 0) and (-0.6, 1.5, 0) by an angle theta (z-axis rotation)
            // Arm 1:
            let theta=Math.PI/12;

            this.player_matrix=this.player_matrix.times(Mat4.translation(0.6,1.5,0))
                                                 .times(Mat4.rotation(theta,0,0,1))
                                                 .times(Mat4.rotation(this.rocking_angle,1,0,0))
                                                 .times(Mat4.scale(0.2,0.75,0.2))
                                                 .times(Mat4.translation(1,-1,0));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[2]}) : G.materials.pure.override({color:this.colorArray[2]}));
            this.player_matrix=this.player_matrix.times(Mat4.translation(-1,1,0))
                                                 .times(Mat4.scale(1/0.2,1/0.75,1/0.2))
                                                 .times(Mat4.rotation(-this.rocking_angle,1,0,0))
                                                 .times(Mat4.rotation(-theta,0,0,1))
                                                 .times(Mat4.translation(-0.6,-1.5,0));
            // Arm 2:
            this.player_matrix=this.player_matrix.times(Mat4.translation(-0.6,1.5,0))
                                                 .times(Mat4.rotation(-theta,0,0,1))
                                                 .times(Mat4.rotation(this.rocking_angle2,1,0,0))
                                                 .times(Mat4.scale(0.2,0.75,0.2))
                                                 .times(Mat4.translation(-1,-1,0));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[2]}) : G.materials.pure.override({color:this.colorArray[2]}));
            this.player_matrix=this.player_matrix.times(Mat4.translation(1,1,0))
                                                 .times(Mat4.scale(1/0.2,1/0.75,1/0.2))
                                                 .times(Mat4.rotation(-this.rocking_angle2,1,0,0))
                                                 .times(Mat4.rotation(theta,0,0,1))
                                                 .times(Mat4.translation(0.6,-1.5,0));

            // Draw head as one cube on top of the upper body centered at (0, 1.5 + 0.5, 0)
            // Dimensions are 1.0x1.0x1.0
            // Head:
            this.player_matrix=this.player_matrix.times(Mat4.translation(0,2,0))
                                                 .times(Mat4.translation(rocking_angle3*0.25,0,0))
                                                 .times(Mat4.scale(0.5,0.5,0.5));
            G.shapes.cube.draw(context, program_state, this.player_matrix, shadow ? G.materials.player.override({color:this.colorArray[3]}) : G.materials.pure.override({color:this.colorArray[3]}));
            this.player_matrix=this.player_matrix.times(Mat4.scale(1/0.5,1/0.5,1/0.5))
                                                 .times(Mat4.translation(-rocking_angle3*0.25,0,0))
                                                 .times(Mat4.translation(0,-2,0));
            */
            //now debug human model first 
            this.player_model.dof[20][0] = this.flip_angle;
            this.player_model.set_color(this.colorArray[0],this.colorArray[3], this.colorArray[1], this.colorArray[2]);
            this.player_model.draw(context, program_state, 
                shadow ? G.materials.player : G.materials.pure);
            

        // tell the server our position (put this here so the backflips replicate)
        G.socket.emit('update', {
            player_matrix: this.player_matrix,
        })

         // Undo the forward flip rotation
         this.player_matrix=this.player_matrix.times(Mat4.translation(0,0.75,0));
         this.player_matrix=this.player_matrix.times(Mat4.rotation(-this.flip_angle,1,0,0));
         this.player_matrix=this.player_matrix.times(Mat4.translation(0,-0.75,0));
         // Reset the flip angle
         this.flip_angle=0;

        }
    }
}
