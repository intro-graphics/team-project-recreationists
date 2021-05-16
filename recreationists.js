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
        circle: new defs.Regular_2D_Polygon(1, 15),
        cube: new defs.Cube(),
  
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
}

export class Recreationists extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        this.player_matrix = Mat4.identity();
        this.camera_matrix = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));

       
        // *** Materials
        this.materials = {
            test: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
          
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
    
    }

    display(context, program_state) {
        // display():  Called once per frame of animation.
        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(this.camera_matrix);
        }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, .1, 1000);

        // TODO: Lighting (Requirement 2)
        const light_position = vec4(0, 5, 5, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];

        
        // TODO:  Fill in matrix operations and drawing code to draw the solar system scene (Requirements 3 and 4)
        const t = program_state.animation_time / 1000, dt = program_state.animation_delta_time / 1000;
        
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
		socket.on('setId', function(data){
			G.player_id = data.id;
            local_player.socket_id = data.id;
		});
		socket.on('remote_data', function(data){
            //console.log(data);
			//console.log("recieved remote data");
            data.forEach(function (i, index) {
                if (i.player_matrix !== false && i.id !== G.player_id) {
                    if ( !(i.id in G.remote_players)) {
                        //console.log(i, index);
                        let new_player = new Player(i.id);
                        G.remote_players[i.id] = new_player;
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
        
		socket.on('deletePlayer', function(data){
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
            if (G.remote_players[i] !== false) { G.remote_players[i].update(context, program_state); }
        } 
    }

    draw(context, program_state) {
        this.entities.map(x => x.draw(context, program_state));
        for (let i in G.remote_players) {
            if (G.remote_players[i] !== false) { G.remote_players[i].draw(context, program_state); }
        } 

    }
}

    // This is a general player. It is used to make adding new players easy. Use local player for the player 
    // that you actually control in the game.
class Player {
    constructor(socket_id) {
        this.player_matrix = Mat4.identity();
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
    }

    key_pressed(context, program_state) {
        let x = this.player_matrix[0];
        let y = this.player_matrix[1];
        let z = this.player_matrix[2];
        //console.log(x,y,z);
        if (G.keys_pressed['k'] === true) {
            G.keys_pressed['k'] = false;
            this.player_matrix = this.player_matrix.times(Mat4.translation(0,0,-1));
            this.camera_matrix = Mat4.inverse(this.player_matrix
                                                                .times(Mat4.translation(0,2,10))
                                                                //.times(Mat4.rotation(Math.PI/4,0,0,0))
                                             );
            //program_state.set_camera(this.camera_matrix);
          
        }
        if (G.keys_pressed['l'] === true) {
            G.keys_pressed['l'] = false;
            this.player_matrix = this.player_matrix
                                                    .times(Mat4.rotation(-Math.PI/4,0,1,0))
                                                    //.times(Mat4.translation(0,0,-z));
            this.camera_matrix = Mat4.inverse(this.player_matrix
                                                                .times(Mat4.translation(0,2,10))
                                                                //.times(Mat4.rotation(Math.PI/4,0,0,0))
                                             );
            //program_state.set_camera(this.camera_matrix);
          
        }
        if (G.keys_pressed['h'] === true) {
            G.keys_pressed['h'] = false;
            this.player_matrix = this.player_matrix
                                                    .times(Mat4.rotation(Math.PI/4,0,1,0))
                                                    //.times(Mat4.translation(0,0,-z));
            this.camera_matrix = Mat4.inverse(this.player_matrix
                                                                .times(Mat4.translation(0,2,10))
                                                                //.times(Mat4.rotation(Math.PI/4,0,0,0))
                                             );
            //program_state.set_camera(this.camera_matrix);
          
        }
        if (G.keys_pressed['j'] === true) {
            G.keys_pressed['j'] = false;
            this.player_matrix = this.player_matrix.times(Mat4.translation(0,0,1));
            this.camera_matrix = Mat4.inverse(this.player_matrix
                                                                .times(Mat4.translation(0,2,10))
                                                                //.times(Mat4.rotation(Math.PI/4,0,0,0))
                                             );
            //program_state.set_camera(this.camera_matrix);
          
        }
    }
     
    
    update(context, program_state) {
        this.key_pressed(context, program_state);

        // tell the server our position
        G.socket.emit('update', {
            player_matrix: this.player_matrix,
            
        })
    }

    //draw(context, program_state) {
        //G.shapes.cube.draw(context, program_state, this.player_matrix, G.materials.test);

    //}
}
