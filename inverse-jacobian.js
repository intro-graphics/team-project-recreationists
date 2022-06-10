import {tiny, defs} from './examples/common.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Matrix} = tiny;

export function psuedo_inverse(j){
    //do under contrained psudoinverse since 21 > 3
    /*
    j+ = j_T((jj_T)^-1)
    */
    let jj_T = j.times(_transpose(j));
    let det = _determinent(jj_T);
    if(det === 0){
        return _transpose(j); //if not invertable use transpose method 
    }
    let jj_T_inv = _inverse(jj_T);
    return _transpose(j).times(jj_T_inv);
}

//transpose of 3x21 matrix because tinygraphic's transpose does not work 
function _transpose(matrix){
    return Matrix.of([matrix[0][0], matrix[1][0], matrix[2][0]],
                     [matrix[0][1], matrix[1][1], matrix[2][1]],
                     [matrix[0][2], matrix[1][2], matrix[2][2]],
                     [matrix[0][3], matrix[1][3], matrix[2][3]],
                     [matrix[0][4], matrix[1][4], matrix[2][4]],
                     [matrix[0][5], matrix[1][5], matrix[2][5]],
                     [matrix[0][6], matrix[1][6], matrix[2][6]],
                     [matrix[0][7], matrix[1][7], matrix[2][7]],
                     [matrix[0][8], matrix[1][8], matrix[2][8]],
                     [matrix[0][9], matrix[1][9], matrix[2][9]],
                     [matrix[0][10], matrix[1][10], matrix[2][10]],
                     [matrix[0][11], matrix[1][11], matrix[2][11]],
                     [matrix[0][12], matrix[1][12], matrix[2][12]],
                     [matrix[0][13], matrix[1][13], matrix[2][13]],
                     [matrix[0][14], matrix[1][14], matrix[2][14]],
                     [matrix[0][15], matrix[1][15], matrix[2][15]],
                     [matrix[0][16], matrix[1][16], matrix[2][16]],
                     [matrix[0][17], matrix[1][17], matrix[2][17]],
                     [matrix[0][18], matrix[1][18], matrix[2][18]],
                     [matrix[0][19], matrix[1][19], matrix[2][19]],
                     [matrix[0][20], matrix[1][20], matrix[2][20]],
                    )
}

//compute determinant of a 3x3 matrix 
function _determinent(matrix){
    return matrix[0][0]*(matrix[1][1]*matrix[2][2]-matrix[1][2]*matrix[2][1])-matrix[0][1]*(matrix[1][0]*matrix[2][2]-matrix[1][2]*matrix[2][0])+matrix[0][2]*(matrix[1][0]*matrix[2][1]-matrix[1][1]*matrix[2][0]);
}

//compute inverse of a invertable 3x3 matrix 
export function _inverse(matrix){
    let det = _determinent(matrix);
    let row_0 = [matrix[1][1]*matrix[2][2]-matrix[1][2]*matrix[2][1], 
                 -(matrix[1][0]*matrix[2][2]-matrix[1][2]*matrix[2][0]), 
                 matrix[1][0]*matrix[2][1]-matrix[1][1]*matrix[2][0]];
    let row_1 = [-(matrix[0][1]*matrix[2][2]-matrix[0][2]*matrix[2][1]),
                 matrix[0][0]*matrix[2][2]-matrix[0][2]*matrix[2][0],
                 -(matrix[0][0]*matrix[2][1]-matrix[0][1]*matrix[2][0])];
    let row_2 = [matrix[0][1]*matrix[1][2]-matrix[0][2]*matrix[1][1],
                 -(matrix[0][0]*matrix[1][2]-matrix[0][2]*matrix[1][0]),
                matrix[0][0]*matrix[1][1]-matrix[0][1]*matrix[1][0]];
    let adj_matrix = Matrix.of([row_0[0], row_1[0], row_2[0]],
                               [row_0[1], row_1[1], row_2[1]],
                               [row_0[2], row_1[2], row_2[2]]);
    return adj_matrix.times(1/det);
}
