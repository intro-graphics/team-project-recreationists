import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene,
} = tiny;



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
        prism: new defs.Capped_Cylinder(10,4),
        octogon: new defs.Capped_Cylinder(1,8),
        pyramid: new defs.Cone_Tip(1,4),
        cone: new defs.Cone_Tip(1,100),
    };

    static materials = {
        test: new Material(new defs.Phong_Shader(),
            {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),

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
    static keys_pressed = {};

    // if any key was pressed (used for initial camera)
    static key_was_pressed = false;
}


export class Recreationists extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        this.player_matrix = Mat4.identity();


        // *** Materials
        this.materials = {
            test: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            brickGround: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#fcc89a"), smoothness: 60}),
            sky: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#a3fcff"), smoothness: 40}),
            sun: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 0.5, color: hex_color("#f7c600"), smoothness: 100}),
            whiteSquare: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#f5eee9"), smoothness: 60}),
            grass: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#2f8214"), smoothness: 60}),
            tree_bark: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#663300"), smoothness: 60}),
            flower_center: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: .6, color: hex_color("#ffff00"), smoothness: 60}),
            trash_bin: new Material(new defs.Phong_Shader(), 
                {ambient: 1, diffusivity: 1, color: hex_color("#4d3319"), smoothness: 60}),
            brick_stairs: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 1, color: hex_color("#875d53"), smoothness: 60}),
            lamppost: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 1, color: hex_color("#1a1a00"), smoothness: 100}),
            building: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 1, color: hex_color("#fca877"), smoothness: 100}),
            roof: new Material(new defs.Phong_Shader(),
                {ambient: 1, diffusivity: 0.6, color: hex_color("#ff8c57"), smoothness: 60}),
            bush: new Material(new defs.Phong_Shader(),
                {ambient: .75, diffusivity: .1, color: hex_color("#056113"), smoothness: 60}),


        }

        this.game = new Game();

    }

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button("View solar system", ["Control", "0"], () => G.test = true);//this.initial_camera_location);
        this.new_line();
        this.key_triggered_button("Move forward", ["k"], () => G.keys_pressed["k"] = true);
        this.key_triggered_button("Turn left", ["h"], () => G.keys_pressed["h"] = true);
        this.key_triggered_button("Turn right", ["l"], () => G.keys_pressed["l"] = true);
        this.key_triggered_button("Move backwards", ["j"], () => G.keys_pressed["j"] = true);
        this.key_triggered_button("Jump", ["m"], () => G.keys_pressed["m"] = true);

    }


    draw_tree(context, program_state, x, y, z) {
        var model_transform = Mat4.identity().times(Mat4.translation(x, y, z))
                                            .times(Mat4.scale(.5, 6, .5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.tree_bark);
        model_transform = Mat4.identity().times(Mat4.translation(x, y+7, z))
                                            .times(Mat4.scale(3, 2, 3));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass.override({ambient: .5}));
        model_transform = Mat4.identity().times(Mat4.translation(x, y+10, z))
                                            .times(Mat4.scale(2, 1, 2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.grass.override({ambient: .6}));
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
        .times(Mat4.translation(x, y+1, z))
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
            .times(Mat4.scale(size, size, length ));

        }

    }

    draw_lamppost(context, program_state, x, y, z) {
        var model_transform = Mat4.identity()
        .times(Mat4.translation(x, y + 3, z))
        .times(Mat4.scale(.1, 10, .1))
        .times(Mat4.rotation(Math.PI/2, 1, 0, 0));
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

    display(context, program_state) {
        // display():  Called once per frame of animation.
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            //program_state.set_camera(this.camera_matrix);
        }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, .1, 1000);

        // TODO: Lighting (Requirement 2)
        //const light_position = vec4(0, 5, 5, 1);
        //program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];


        // TODO:  Fill in matrix operations and drawing code to draw the solar system scene (Requirements 3 and 4)
        const t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;
        /*
        if (this.move !== undefined) {
            if (this.move === true) {
                this.move = false;
                this.player_matrix = this.player_matrix.times(Mat4.translation(0,0,-1));
                this.camera_matrix = Mat4.inverse(this.player_matrix
                                                                    .times(Mat4.translation(0,2,10))
                                                                    //.times(Mat4.rotation(Math.PI/4,0,0,0))
                                                 );
                program_state.set_camera(this.camera_matrix);
            }
        }
        */

        // Draw the background
        //---------------------------------------------------

        // Set coordinate system matrix at the origin
        let model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.translation(0, 0, 0));

        // Draw the sun
        let radius = 20; // radius of sun
        let distance = 100; // distance of sun from origin
        let height = 400;
        model_transform = model_transform.times(Mat4.translation(0, height, 0))
            .times(Mat4.translation(0, 0, -distance))
            .times(Mat4.scale(radius, radius, radius));


        // Place light at the sun
        const light_position = vec4(0, height, -distance, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 10 ** radius)];

        G.shapes.sphere.draw(context, program_state, model_transform, this.materials.sun);

        // Define the directions: +Y: UP
        //                        -Y: DOWN
        //                        +X: RIGHT    (Toward Powell)
        //                        -X: LEFT     (Toward Royce)
        //                        +Z: Backward (Toward the hill)
        //                        -Z: Forward  (Toward the campus)


        // Draw the sky as a giant blue sphere
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.scale(500, 500, 500));
        G.shapes.sphere.draw(context, program_state, model_transform, this.materials.sky);
        model_transform = Mat4.identity();

        // Draw the ground
        model_transform = model_transform.times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(1000, 1000, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.brickGround);

        // to-do: Draw the squares on the ground like a grid
        //model_transform = Mat4.identity();
        //model_transform = model_transform.times(Mat4.rotation(Math.PI/2,1,0,0))
        //                                 .times(Mat4.scale(1,1,1))
        //                                 .times(Mat4.translation(-5,5,0));
        //G.shapes.square.draw(context, program_state, model_transform, this.materials.whiteSquare);
        //for (let i=-5; i<5; i=i+1)
        //{
        //    for (let j=5; j>-5; j=j-1)
        //    {
        //        model_transform = model_transform.times(Mat4.translation(i+0.2,j+0.2,0));
        //        G.shapes.square.draw(context, program_state, model_transform, this.materials.whiteSquare);
        //    }
        //}

        //trying: to draw brick colored lines on ground


        //G.shapes.square.draw(context, program_state, model_transform, this.materials.brickGround);

        model_transform = Mat4.identity();

        // Draw the grass
        model_transform = model_transform.times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, 60, -0.01))
            .times(Mat4.scale(80, 40, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.grass);
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, -60, -0.01))
            .times(Mat4.scale(80, 40, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.grass);
        model_transform = Mat4.identity();
        model_transform = model_transform.times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.translation(0, -180, -0.01))
            .times(Mat4.scale(80, 60, 1));
        G.shapes.square.draw(context, program_state, model_transform, this.materials.grass);


        //start drawing objects, first grass patch
        this.draw_lamppost(context, program_state, 78, 0, 50);
        this.draw_tree(context, program_state, 75, 0, 95);
        this.draw_trash(context, program_state, 80, 0, 102);
        this.draw_trash(context, program_state, 80, 0, 104.5);
        this.draw_tree(context, program_state, -70, 0 , 90);

        model_transform = Mat4.identity().times(Mat4.translation(-70, 0, 97))
        .times(Mat4.scale(5, 2, 2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.bush);

        this.draw_lamppost(context, program_state, -78, 0, 50);


        //second grass patch
        this.draw_tree(context, program_state, 73, 0, -25);
        this.draw_tree(context, program_state, 76, 0, -30);
        this.draw_lamppost(context, program_state, 79, 0, -40);
        this.draw_lamppost(context, program_state, -79, 0, -40);


        //objects next to powell library
        this.draw_tree(context, program_state, 115, 0, 75);
        model_transform = Mat4.identity().times(Mat4.translation(113, 0, 79))
        .times(Mat4.scale(5, 3, 2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.bush);

        model_transform = Mat4.identity().times(Mat4.translation(70, 0, 103))
        .times(Mat4.scale(7, 2, 2));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.bush);
        
        
        // Draw buildings:
        // 1) Draw simple building
        // Box
        model_transform = Mat4.identity().times(Mat4.translation(-125,0,-180))
                                         .times(Mat4.scale(25,40,60));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Roof
        model_transform = Mat4.identity().times(Mat4.translation(-125,40,-180))
                                         .times(Mat4.scale(25,10,119.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        
        // 2) Draw Royce
        // Rear Box 
        model_transform = Mat4.identity().times(Mat4.translation(-145,0,0))
                                         .times(Mat4.scale(25,35,80));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Roof for Rear Box
        model_transform = Mat4.identity().times(Mat4.translation(-145,35,0))
                                         .times(Mat4.scale(25,9,159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        // Draw middle box
        model_transform = Mat4.identity().times(Mat4.translation(-160,0,0))
                                         .times(Mat4.scale(60,35,30));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Draw middle box roof
        model_transform = Mat4.identity().times(Mat4.translation(-160,35,0))
                                         .times(Mat4.rotation(Math.PI/2,0,1,0))
                                         .times(Mat4.scale(30,20,120));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.building);
        // Draw two towers with their rooves
        // First tower
        model_transform = Mat4.identity().times(Mat4.translation(-110,0,-35))
                                         .times(Mat4.scale(12,70,10));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // to-do: Draw a pyramid roof
        
        // Second tower
        model_transform = Mat4.identity().times(Mat4.translation(-110,0,35))
                                         .times(Mat4.scale(12,70,10));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // to-do: Draw a pyramid roof
 
        // 3) Draw Powell
        // Main Box 
        model_transform = Mat4.identity().times(Mat4.translation(220,0,0))
                                         .times(Mat4.scale(100,50,80));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Roof for Main Box
        model_transform = Mat4.identity().times(Mat4.translation(120+25,50,0))
                                         .times(Mat4.scale(25,12,159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(120+75,50,0))
                                         .times(Mat4.scale(25,12,159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(120+125,50,0))
                                         .times(Mat4.scale(25,12,159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(120+175,50,0))
                                         .times(Mat4.scale(25,12,159.8));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.roof);
        // Draw entrance inner building
        model_transform = Mat4.identity().times(Mat4.translation(215,0,0))
                                         .times(Mat4.scale(105,50,25));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Draw roof for entrance
        model_transform = Mat4.identity().times(Mat4.translation(215,50,0))
                                         .times(Mat4.rotation(Math.PI/2,0,1,0))
                                         .times(Mat4.scale(25,10,210));
        G.shapes.prism.draw(context, program_state, model_transform, this.materials.building);
        // Draw the two columns
        // First column 
        model_transform = Mat4.identity().times(Mat4.translation(110,0,-25))
                                         .times(Mat4.scale(2.5,60,2.5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110,60+4,-25))
                                         .times(Mat4.rotation(-Math.PI/2, 1,0,0))
                                         .times(Mat4.scale(2.5,2.5,4));
        G.shapes.cone.draw(context, program_state, model_transform, this.materials.roof);
        // Second column 
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110,0,25))
                                         .times(Mat4.scale(2.5,60,2.5));
        G.shapes.cube.draw(context, program_state, model_transform, this.materials.building);
        // Place cone above tower
        model_transform = Mat4.identity().times(Mat4.translation(110,60+4,25))
                                         .times(Mat4.rotation(-Math.PI/2, 1,0,0))
                                         .times(Mat4.scale(2.5,2.5,4));
        G.shapes.cone.draw(context, program_state, model_transform, this.materials.roof);
        // Draw the octogon blocks
        model_transform = Mat4.identity().times(Mat4.translation(150,0,0))
                                         .times(Mat4.rotation(Math.PI/2,1,0,0))
                                         .times(Mat4.scale(20,20,150));
        G.shapes.octogon.draw(context, program_state, model_transform, this.materials.roof);
        model_transform = Mat4.identity().times(Mat4.translation(150,0,0))
                                         .times(Mat4.rotation(Math.PI/2,1,0,0))
                                         .times(Mat4.scale(15,15,170));
        G.shapes.octogon.draw(context, program_state, model_transform, this.materials.building);
        // to-do: Place octogon pyramid on top of octogons
       

        // to-do: Draw fountain
        // Place circle on top of grass
        model_transform = Mat4.identity().times(Mat4.translation(0,0.02,100))
                                         .times(Mat4.rotation(Math.PI/2,1,0,0))
                                         .times(Mat4.scale(20,20,1));
        G.shapes.circle.draw(context, program_state, model_transform, this.materials.brickGround);
        model_transform = Mat4.identity().times(Mat4.translation(0,0.02,-240))
                                         .times(Mat4.rotation(Math.PI/2,1,0,0))
                                         .times(Mat4.scale(30,30,1));
        G.shapes.circle.draw(context, program_state, model_transform, this.materials.brickGround);
        //--------------------------------------------------------------------------------
        


        this.game.update(context, program_state);
        this.game.draw(context, program_state);


    }
}

// This is the game class, it is used to keep track of all the active entities in the game (such as
// all of the connected players). It calls every objects' update method and then their draw method.
// use the update method to determine if collisions have occured or to calculate position. Then draw.
// ( Not implemented) IT also centralizes all of the input from the keyboard.
class Game {
    constructor() {
        this.entities = [];

        let local_player = new LocalPlayer();
        this.entities.push(local_player);

        const socket = io.connect();
        socket.on('setId', function (data) {
            G.player_id = data.id;
            local_player.socket_id = data.id;
        });
        socket.on('remote_data', function (data) {
            //console.log(data);
            //console.log("recieved remote data");
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
            console.log(`deleted player ${socket.id}`);
            G.remote_players[data.id] = false;
            //delete G.remote_players[socket.id];
            console.log(G.remote_players);

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

    draw(context, program_state) {
        this.entities.map(x => x.draw(context, program_state));
        for (let i in G.remote_players) {
            if (G.remote_players[i] !== false) {
                G.remote_players[i].draw(context, program_state);
            }
        }

    }
}

// This is a general player. It is used to make adding new players easy. Use local player for the player
// that you actually control in the game.
class Player {
    constructor(socket_id) {
        this.player_matrix = Mat4.identity().times(Mat4.translation(0, 10, 0));
        this.socket_id = socket_id;
    }

    update(context, program_state) {
        // assume this is a remote player
        if (this.socket_id !== G.player_id) {
            let pos = G.remote_data[this.socket_id];
            //console.log(this.socket_id);
            //console.log(pos);
            this.player_matrix = Matrix.of(pos[0], pos[1], pos[2], pos[3]);
        }


    }

    draw(context, program_state) {
        //if ( this.socket_id in G.remote_players) {
        G.shapes.cube.draw(context, program_state, this.player_matrix, G.materials.test);
        //}

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
        if (G.keys_pressed['k'] === true) {
            this.key_was_pressed = true;
            G.keys_pressed['k'] = false;
            this.acceleration = this.acceleration.plus([0, 0, -1]);

            this.player_matrix = this.player_matrix.times(Mat4.translation(0, 0, -1));


        }
        if (G.keys_pressed['l'] === true) {
            this.key_was_pressed = true;
            G.keys_pressed['l'] = false;
            this.player_matrix = this.player_matrix
                .times(Mat4.rotation(-Math.PI / 4, 0, 1, 0))
            //.times(Mat4.translation(0,0,-z));


        }
        if (G.keys_pressed['h'] === true) {
            this.key_was_pressed = true;
            G.keys_pressed['h'] = false;
            this.player_matrix = this.player_matrix
                .times(Mat4.rotation(Math.PI / 4, 0, 1, 0))
            //.times(Mat4.translation(0,0,-z));


        }
        if (G.keys_pressed['j'] === true) {
            this.key_was_pressed = true;
            G.keys_pressed['j'] = false;
            this.player_matrix = this.player_matrix.times(Mat4.translation(0, 0, 1));

        }
        if (G.keys_pressed['m'] === true) {
            this.key_was_pressed = true;
            G.keys_pressed['m'] = false;
            if (!this.jumping) {

                this.jumping = true;
                //this.player_matrix = this.player_matrix.times(Mat4.translation(0,1,0));
                console.log("m pressed");
                this.apply_force([0, 9.8 * 0.05, 0]);
            }

        }


        //desired = desired.map((x,i) => Vector.from(this.camera_matrix).mix(x, 0.1));
        //program_state.set_camera(desired);


    }


    update(context, program_state) {
        this.key_pressed(context, program_state);
        if (this.key_was_pressed) {
            this.camera_matrix = Mat4.inverse(this.player_matrix
                    .times(Mat4.translation(0, 2, 10))
                //.times(Mat4.rotation(Math.PI/4,0,0,0))
            );
        }
        program_state.set_camera(this.camera_matrix);

        this.apply_force([0, -9.8 * 0.001, 0]);

        //console.log(this.velocity);
        this.velocity = this.velocity.plus(this.acceleration);

        // stop at the ground
        if (this.player_matrix[1][3] <= 1.25 && this.velocity[1] < 0) {
            //this.velocity = [this.velocity[0], 0, this.velocity[1]];
            this.velocity[1] = 0;
            this.jumping = false;
        }

        this.player_matrix = this.player_matrix.times(Mat4.translation(0, this.velocity[1], 0,)); //this.velocity.z));
        //this.player_matrix = this.player_matrix.times(Mat4.translation(0,-0.001,0,)); //this.velocity.z));

        this.acceleration = this.acceleration.times(0);
        //console.log(this.acceleration);

        // tell the server our position
        G.socket.emit('update', {
            player_matrix: this.player_matrix,

        })
    }

    //draw(context, program_state) {
    //G.shapes.cube.draw(context, program_state, this.player_matrix, G.materials.test);

    //}
}
