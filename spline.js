import {tiny, defs} from './examples/common.js';
//import { math } from './math.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4,vec, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

// TODO: you should implement the required classes here or in another file.


export function h00(t) {
  return 2 * t**3 - 3 * t**2 + 1;
}

export function h10(t) {
  return t**3 - 2 * t**2 + t;
}

export function h01(t) {
  return -2 * t**3 + 3 * t**2;
}

export function h11(t) {
  return t**3 - t**2;
}

//To draw the Curve Shape for path if needed
export class Curve_Shape extends Shape {
  // curve_function: (t) => vec3
  constructor(curve_function, sample_count, curve_color=color( 1, 0, 0, 1 )) {
    super("position", "normal");

    this.material = { shader: new defs.Phong_Shader(), ambient: 1.0, color: curve_color }
    this.sample_count = sample_count;

    if (curve_function && this.sample_count) {
      for (let i = 0; i < this.sample_count + 1; i++) {
        let t = 1.0 * i / this.sample_count;
        this.arrays.position.push(curve_function(t));
        this.arrays.normal.push(vec3(0, 0, 0)); // have to add normal to make Phong shader work.
      }
    }
  }

  draw(webgl_manager, uniforms) {
    // call super with "LINE_STRIP" mode
    super.draw(webgl_manager, uniforms, Mat4.identity(), this.material, "LINE_STRIP");
  }
}

//From Obj_Demo_Scene for using .obj models.

const Shape_From_File = defs.Shape_From_File =
class Shape_From_File extends Shape
{                                   // **Shape_From_File** is a versatile standalone Shape that imports
                                    // all its arrays' data from an .obj 3D model file.
  constructor( filename )
    { super( "position", "normal", "texture_coord" );
                                    // Begin downloading the mesh. Once that completes, return
                                    // control to our parse_into_mesh function.
      this.load_file( filename );
    }
  load_file( filename )
      {                             // Request the external file and wait for it to load.
        return fetch( filename )
          .then( response =>
            { if ( response.ok )  return Promise.resolve( response.text() )
              else                return Promise.reject ( response.status )
            })
          .then( obj_file_contents => this.parse_into_mesh( obj_file_contents ) )
          .catch( error => { throw "OBJ file loader:  OBJ file either not found or is of unsupported format." } )
      }
  parse_into_mesh( data )
    {                           // Adapted from the "webgl-obj-loader.js" library found online:
      var verts = [], vertNormals = [], textures = [], unpacked = {};

      unpacked.verts = [];        unpacked.norms = [];    unpacked.textures = [];
      unpacked.hashindices = {};  unpacked.indices = [];  unpacked.index = 0;

      var lines = data.split('\n');

      var VERTEX_RE = /^v\s/;    var NORMAL_RE = /^vn\s/;    var TEXTURE_RE = /^vt\s/;
      var FACE_RE = /^f\s/;      var WHITESPACE_RE = /\s+/;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        var elements = line.split(WHITESPACE_RE);
        elements.shift();

        if      (VERTEX_RE.test(line))   verts.push.apply(verts, elements);
        else if (NORMAL_RE.test(line))   vertNormals.push.apply(vertNormals, elements);
        else if (TEXTURE_RE.test(line))  textures.push.apply(textures, elements);
        else if (FACE_RE.test(line)) {
          var quad = false;
          for (var j = 0, eleLen = elements.length; j < eleLen; j++)
          {
              if(j === 3 && !quad) {  j = 2;  quad = true;  }
              if(elements[j] in unpacked.hashindices)
                  unpacked.indices.push(unpacked.hashindices[elements[j]]);
              else
              {
                  var vertex = elements[ j ].split( '/' );

                  unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                  unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                  unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

                  if (textures.length)
                    {   unpacked.textures.push(+textures[( (vertex[1] - 1)||vertex[0]) * 2 + 0]);
                        unpacked.textures.push(+textures[( (vertex[1] - 1)||vertex[0]) * 2 + 1]);  }

                  unpacked.norms.push(+vertNormals[( (vertex[2] - 1)||vertex[0]) * 3 + 0]);
                  unpacked.norms.push(+vertNormals[( (vertex[2] - 1)||vertex[0]) * 3 + 1]);
                  unpacked.norms.push(+vertNormals[( (vertex[2] - 1)||vertex[0]) * 3 + 2]);

                  unpacked.hashindices[elements[j]] = unpacked.index;
                  unpacked.indices.push(unpacked.index);
                  unpacked.index += 1;
              }
              if(j === 3 && quad)   unpacked.indices.push( unpacked.hashindices[elements[0]]);
          }
        }
      }
      {
      const { verts, norms, textures } = unpacked;
        for( var j = 0; j < verts.length/3; j++ )
        {
          this.arrays.position     .push( vec3( verts[ 3*j ], verts[ 3*j + 1 ], verts[ 3*j + 2 ] ) );
          this.arrays.normal       .push( vec3( norms[ 3*j ], norms[ 3*j + 1 ], norms[ 3*j + 2 ] ) );
          this.arrays.texture_coord.push( vec( textures[ 2*j ], textures[ 2*j + 1 ] ) );
        }
        this.indices = unpacked.indices;
      }
      this.normalize_positions( false );
      this.ready = true;
    }
  draw( caller, uniforms, model_transform, material )
    {               // draw(): Same as always for shapes, but cancel all
                    // attempts to draw the shape before it loads:
      if( this.ready )
        super.draw( caller, uniforms, model_transform, material );
    }
}







export class Hermite_Spline  {
  constructor(sample_count = 20) {
    this.points = [];
    this.tangents = [];
    this.curve_fns = [];
    this.num_points = 0;
    this.sample_count = sample_count;
  }

  draw(webgl_manager, uniforms) {
    // call super with "LINE_STRIP" mode
    super.draw(webgl_manager, uniforms, Mat4.identity(), this.material, "LINE_STRIP");
  }

  add_point(x, y, z, sx, sy, sz) {
    let pt = vec3(x, y, z);
    let tan = vec3(sx, sy, sz);
    this.points.push(pt);
    this.tangents.push(tan);
    this.num_points += 1;
    if (this.num_points > 1) {
      this.set_curve(this.num_points - 2);
    }
  }

  set_tangent(idx, sx, sy, sz) {
    this.tangents[idx] = vec3(sx, sy, sz);
    if (idx > 0) {
      this.set_curve(idx - 1);
    }
    if (idx + 1 < this.num_points) {
      this.set_curve(idx);
    }
  }

  set_point(idx, x, y, z) {
    this.points[idx] = vec3(x, y, z);
  }

  set_curve(idx) {
    this.curve_fns[idx] = this.curve_fn(idx, idx+1);
  }

  clear() {
    this.num_points = 0;
    this.points = [];
    this.tangents = [];
    this.curve_fns =[];
  }


  curve_fn(idx1, idx2) {
    try {
      let pk = this.points[idx1];
      let mk = this.tangents[idx1];
      let pk1 = this.points[idx2];
      let mk1 = this.tangents[idx2];
      // let dist = pk1.minus(pk);
      return (t) => pk.times(h00(t))
          .plus(mk.times(h10(t)))     // should divide by this.sample_count but it doesn't work
          .plus(pk1.times(h01(t)))
          .plus(mk1.times(h11(t)));    // should divide by this.sample_count but it doesn't work
    } catch (error) {
      console.error(error);
      document.getElementById("output").value = error;
      return;
    }
  }

  get_arc_length() {
    let len = 0;
    if (this.curve_fns < 1) {
      return 0;
    }
    for (let fn of this.curve_fns) {
      let prev = fn(0);
      for (let i = 1; i <= this.sample_count; i++) {
        let t = 1.0 * i /this.sample_count;
        let dis = fn(t).minus(prev);
        len += dis.norm();
        prev = fn(t);
      }
    }

    return len;
  }


}
