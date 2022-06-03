import {defs, tiny} from './examples/common.js';
import { Particles_Emitter } from './particle.js';
const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene, Texture
} = tiny;

const DEFAULT_SHOULDER_RZ = 1.2;

export const Articulated_Player = 
class Articulated_Player{
    constructor(player_matrix){
        const square_shape = new defs.Cube();

        //torso node 
        let torso_transform = Mat4.scale(0.6,0.75,0.3);
        this.torso_node = new Node("torso", square_shape, torso_transform);
        // root -> torso
        let root_location = player_matrix.times(Mat4.translation(0, 0.75, 0));
        this.root = new Arc("root", null, this.torso_node, root_location);

        //head node
        let head_transform = Mat4.scale(0.5, 0.5, 0.5).pre_multiply(Mat4.translation(0, 0.5, 0));
        this.head_node = new Node("head", square_shape, head_transform);
        //torso->neck->head
        let neck_location = Mat4.translation(0, 0.75, 0);
        this.neck = new Arc("neck", this.torso_node, this.head_node, neck_location);
        this.torso_node.children_arcs.push(this.neck);

        //right upper arm node 
        let ru_arm_transform = Mat4.scale(0.3, 0.2, 0.2).pre_multiply(Mat4.translation(0.3, 0, 0));
        this.ru_arm_node = new Node("ru_arm", square_shape, ru_arm_transform);
        //torso->r_shoulder->ru_arm 
        let r_shoulder_location = Mat4.translation(0.6, 0.55, 0);
        this.r_shoulder = new Arc("r_shoulder", this.torso_node, this.ru_arm_node, r_shoulder_location);
        this.torso_node.children_arcs.push(this.r_shoulder);

        //right lower arm node
        let rl_arm_transform = Mat4.scale(0.3, 0.2, 0.2).pre_multiply(Mat4.translation(0.3, 0, 0));
        this.rl_arm_node = new Node("rl_arm", square_shape, rl_arm_transform);
        //ru_arm->r_elbow->rl_arm
        let r_elbow_location = Mat4.translation(0.6, 0, 0);
        this.r_elbow = new Arc("r_elbow", this.ru_arm_node, this.rl_arm_node, r_elbow_location);
        this.ru_arm_node.children_arcs.push(this.r_elbow);

        //left upper arm node
        let lu_arm_transform =  Mat4.scale(0.3, 0.2, 0.2).pre_multiply(Mat4.translation(-0.3, 0, 0));
        this.lu_arm_node = new Node("lu_arm", square_shape, lu_arm_transform);
        //torso->l_shoulder->lu_arm
        let l_shoulder_location = Mat4.translation(-0.6, 0.55, 0);
        this.l_shoulder = new Arc("l_shoulder", this.torso_node, this.lu_arm_node, l_shoulder_location);
        this.torso_node.children_arcs.push(this.l_shoulder);

        //left lower arm node
        let ll_arm_transform = Mat4.scale(0.3, 0.2, 0.2).pre_multiply(Mat4.translation(-0.3, 0, 0));
        this.ll_arm_node = new Node("ll_arm", square_shape, ll_arm_transform);
        //lu_arm->l_elbow->ll_arm
        let l_elbow_location = Mat4.translation(-0.6, 0, 0);
        this.l_elbow = new Arc("l_elbow", this.lu_arm_node, this.ll_arm_node, l_elbow_location);
        this.lu_arm_node.children_arcs.push(this.l_elbow);

        //right upper leg node
        let ru_leg_transform = Mat4.scale(0.2, 0.3, 0.2).pre_multiply(Mat4.translation(0, -0.3, 0));
        this.ru_leg_node = new Node("ru_leg", square_shape, ru_leg_transform);
        //torso->r_hip->ru_leg 
        let r_hip_location = Mat4.translation(0.3, -0.75, 0);
        this.r_hip = new Arc("r_hip", this.torso_node, this.ru_leg_node, r_hip_location);
        this.torso_node.children_arcs.push(this.r_hip);

        //right lower leg node
        let rl_leg_transform = Mat4.scale(0.2, 0.3, 0.2).pre_multiply(Mat4.translation(0, -0.3, 0));
        this.rl_leg_node = new Node("rl_leg", square_shape, rl_leg_transform);
        //ru_leg->r_knee->rl_leg
        let r_knee_location = Mat4.translation(0, -0.6, 0);
        this.r_knee = new Arc("r_knee", this.ru_leg_node, this.rl_leg_node, r_knee_location);
        this.ru_leg_node.children_arcs.push(this.r_knee);

        //left upper leg node
        let lu_leg_transform = Mat4.scale(0.2, 0.3, 0.2).pre_multiply(Mat4.translation(0, -0.3, 0));
        this.lu_leg_node = new Node("lu_leg", square_shape, lu_leg_transform);
        //torso->r_hip->ru_leg 
        let l_hip_location = Mat4.translation(-0.3, -0.75, 0);
        this.l_hip = new Arc("l_hip", this.torso_node, this.lu_leg_node, l_hip_location);
        this.torso_node.children_arcs.push(this.l_hip);

        //right lower leg node
        let ll_leg_transform = Mat4.scale(0.2, 0.3, 0.2).pre_multiply(Mat4.translation(0, -0.3, 0));
        this.ll_leg_node = new Node("ll_leg", square_shape, ll_leg_transform);
        //ru_leg->r_knee->rl_leg
        let l_knee_location = Mat4.translation(0, -0.6, 0);
        this.l_knee = new Arc("r_knee", this.lu_leg_node, this.ll_leg_node, l_knee_location);
        this.lu_leg_node.children_arcs.push(this.l_knee);

        this.dof = Matrix.of([0], //0//root_x 
                             [0], //1//root_y 
                             [0], //2//root_z 
                             [0], //3//neck_rx
                             [0], //4//neck_ry 
                             [0], //5//neck_rz
                             [0], //6//r_shoulder_rx
                             [0], //7//r_shoulder_ry
                             [-DEFAULT_SHOULDER_RZ], //8//r_shoulder_rz
                             [0], //9//r_elbow_rx
                             [0], //10//r_elbow_ry
                             [0], //11//r_hip
                             [0], //12//r_knee
                             [0], //13//l_shoulder_rx
                             [0], //14//l_shoulder_ry
                             [DEFAULT_SHOULDER_RZ], //15//l_shoulder_rz
                             [0], //16//l_elbow_rx
                             [0], //17//l_elbow_ry
                             [0], //18//l_hip
                             [0], //19//l_knee
                             [0]  //20// root_rx for flipping 
                             );
        //state 
        this.is_walking = false;
        this.walking_time = 0;
        this.is_waving = false;
        // particle while moving 
        this.particles_emitter = new Particles_Emitter(1.5, 0.1, 0.2, vec4(220/255, 198/255, 152/255, 1.0), 3, 1, 3, false);
    }

    //update player model 
    update(player_matrix, program_state){
        this._fk_update(player_matrix, program_state);
        this._set_dof();
        this.root.location_matrix = player_matrix.times(Mat4.translation(0, 0.75, 0));
    }

    _fk_update(player_matrix, program_state){
        let dt = program_state.animation_delta_time/1000;
        let t = program_state.animation_time/1000;
        //walking animation
        if(this.is_walking){
            this.particles_emitter.add_particles(player_matrix.times(Mat4.translation(0, -1, 0)));
            this.walking_time+=dt*10;
            //create a function for the joint angle of arm 
            let rx = Math.sin(this.walking_time);
            this.dof[7][0] = rx; //right shoulder rx
            this.dof[14][0] = rx; //left shoulder rx
            this.dof[11][0] = rx; //right hip rx
            this.dof[18][0] = -rx; //left hip rx
        }else{ //not walking 
            this.walking_time = 0;
            this.dof[7][0] = 0; //right shoulder
            this.dof[14][0] = 0; //left shoulder
            this.dof[11][0] = 0; //right hip rx
            this.dof[18][0] = 0; //left hip rx
            //settle movement of arm at rest 
            this.dof[8][0] = -DEFAULT_SHOULDER_RZ + 1/30*Math.sin(t*2); //r_shoulder_rz
            this.dof[15][0] = DEFAULT_SHOULDER_RZ - 1/30*Math.sin(t*2); //l_shoulder_rz
        }
        if(!this.particles_emitter.is_empty()){
            this.particles_emitter.update_particles(program_state);
        }
    }

    _ik_update(program_state){
        let dt = program_state.animation_delta_time/1000;
        let t = program_state.animation_time/1000;
    }

    _set_dof(){
       this.root.articulation_matrix = this._get_translate_mat(this.dof[0][0], this.dof[1][0], this.dof[2][0]).times(this._get_rotation_mat(this.dof[20]));
       this.neck.articulation_matrix = this._get_rotation_mat(this.dof[3][0], this.dof[4][0], this.dof[5][0]);
       this.r_shoulder.articulation_matrix = this._get_rotation_mat(this.dof[6][0], this.dof[7][0], this.dof[8][0]);
       this.r_elbow.articulation_matrix = this._get_rotation_mat(this.dof[9][0], this.dof[10][0]);
       this.r_hip.articulation_matrix = this._get_rotation_mat(this.dof[11][0]);
       this.r_knee.articulation_matrix = this._get_rotation_mat(this.dof[12][0]);
       this.l_shoulder.articulation_matrix = this._get_rotation_mat(this.dof[13][0], this.dof[14][0], this.dof[15][0]);
       this.l_elbow.articulation_matrix = this._get_rotation_mat(this.dof[16][0], this.dof[17][0]);
       this.l_hip.articulation_matrix = this._get_rotation_mat(this.dof[18][0]);
       this.l_knee = this._get_rotation_mat(this.dof[19][0]);
    }

    _get_translate_mat(x, y, z){
        return Mat4.translation(x, y, z);
    }

    _get_rotation_mat(rx, ry = 0, rz = 0){
        return Mat4.rotation(rz, 0, 0, 1)
              .times(Mat4.rotation(ry, 0, 1, 0))
              .times(Mat4.rotation(rx, 1, 0, 0));
    }

    set_color(torso_color, head_color, leg_color, arm_color){
        this.torso_node.color = torso_color;
        this.head_node.color = head_color;
        this.ru_leg_node.color = leg_color.plus(torso_color);
        this.rl_leg_node.color = leg_color;
        this.lu_leg_node.color = leg_color.plus(torso_color);
        this.ll_leg_node.color = leg_color;
        this.ru_arm_node.color = arm_color.plus(torso_color);
        this.rl_arm_node.color = arm_color;
        this.lu_arm_node.color = arm_color.plus(torso_color);
        this.ll_arm_node.color = arm_color;
    }

    draw(context, program_state, material) {
        //draw particles
        this.particles_emitter.render(context, program_state)
        this.matrix_stack = [];
        this._rec_draw(this.root, Mat4.identity(), context, program_state, material);
    }

    _rec_draw(arc, matrix, context, program_state, material) {
        if (arc !== null) {
            const L = arc.location_matrix;
            const A = arc.articulation_matrix;
            matrix.post_multiply(L.times(A));
            this.matrix_stack.push(matrix.copy());

            const node = arc.child_node;
            const T = node.transform_matrix;
            matrix.post_multiply(T);
            node.shape.draw(context, program_state, matrix, material.override({color:node.color}));

            matrix = this.matrix_stack.pop();
            for (const next_arc of node.children_arcs) {
                this.matrix_stack.push(matrix.copy());
                this._rec_draw(next_arc, matrix, context, program_state, material);
                matrix = this.matrix_stack.pop();
            }
        }
    }
}

class Node {
    constructor(name, shape, transform) {
        this.name = name;
        this.shape = shape;
        this.transform_matrix = transform;
        this.children_arcs = [];
        this.color = color(1, 1, 1, 1);
    }
}

class Arc {
    constructor(name, parent, child, location) {
        this.name = name;
        this.parent_node = parent;
        this.child_node = child;
        this.location_matrix = location;
        this.articulation_matrix = Mat4.identity();
    }
}
