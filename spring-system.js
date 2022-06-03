import {tiny, defs} from './examples/common.js';
//import { math } from './math.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4,vec, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

// TODO: you should implement the required classes here or in another file.
export class Particle {
    constructor(mass = 0, pos = vec3(0,0,0), vel = vec3(0,0,0)) {
        this.pos = pos;
        this.vel = vel;
        this.acc = vec3(0,0,0);
        this.mass = mass;
    }
}

export class Spring {
    constructor(p1= -1, p2= -1, ks= 0, kd= 0, len= 0) {
        this.p1 = p1;
        this.p2 = p2;
        this.ks = ks;
        this.kd = kd;
        this.len = len;
    }
}

export class Spring_System {
    constructor() {
        this.particles = [];
        this.springs = [];
        this.gravity = 0;
    }

    clear() {
        this.particles = [];
        this.springs = [];
    }

    create_particles(num) {
        this.particles = [];
        for (let i = 0; i < num; i++) {
            this.particles.push(new Particle());
        }
    }

    create_springs(num) {
        this.springs = [];
        for (let i = 0; i < num; i++) {
            this.springs.push(new Spring());
        }
    }

    set_particle(idx, mass, x, y, z, vx, vy, vz) {
        this.particles[idx].mass = mass;
        this.particles[idx].pos = vec3(x, y, z);
        this.particles[idx].vel = vec3(vx, vy, vz);
    }

    link_spring(idx, p1, p2, ks, kd, len) {
        this.springs[idx].p1 = p1;
        this.springs[idx].p2 = p2;
        this.springs[idx].ks = ks;
        this.springs[idx].kd = kd;
        this.springs[idx].len = len;
    }

    set_gravity(g) {
        this.gravity = g;
    }

    // update each particle's acceleration
    update_acc(particles, springs) {
        // base gravity
        for (let i = 0; i < particles.length; i++) {
            particles[i].acc = vec3(0, -this.gravity, 0);
        }

        // apply spring force
        for (let spring of springs) {
            let p1 = particles[spring.p1];
            let p2 = particles[spring.p2]
            let dij = p2.pos.minus(p1.pos);     // position difference
            let dfm_len = dij.norm()            // deformed length of spring
            dij.normalize();                    // unit vector for direction
            let vij = p2.vel.minus(p1.vel);     // velocity difference

            // calculate spring force
            let f_elastic = spring.ks * (dfm_len - spring.len);
            let f_viscous = spring.kd * (vij.dot(dij));     // idk why it's not negative but it works
            let fij = dij.times(f_elastic + f_viscous);
            let fji = fij.times(-1);

            // update particles acceleration
            particles[spring.p1].acc = particles[spring.p1].acc.plus(fij.times(1 / p1.mass));
            particles[spring.p2].acc = particles[spring.p2].acc.plus(fji.times(1 / p2.mass));
        }
    }

    symplectic_update(dt) {
        this.update_acc(this.particles, this.springs);
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i].pos;
            let v = this.particles[i].vel;

            this.particles[i].vel = v.plus(this.particles[i].acc.times(dt));
            this.particles[i].pos = p.plus(this.particles[i].vel.times(dt));
        }
    }
}