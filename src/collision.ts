import { game_instance } from ".";
import { MapObject } from "./objects";
import { TiledProperty } from "./types";

const GRAVITY = 4000;
const MAX_WALKABLE_SLOPE = 1;
const STEP_HEIGHT = 10;
const FLOOR_FRICTION_COEFF = 10;
const WALL_DEPTH = 16;

export class Line {
	x1 : number; y1 : number; x2 : number; y2 : number;
	vx1=0; vy1=0; vx2=0; vy2=0;
	constructor(x1:number, y1:number, x2:number, y2:number) {
		this.x1=x1; this.y1=y1; this.x2=x2; this.y2=y2;
	}

	instersect_ray(x:number, y:number, dx:number, dy:number) : number|null {
		let rls = dx*dx+dy*dy;
		let d1 = (-dy*(this.x1-x) + dx*(this.y1-y));
		let d2 = (-dy*(this.x2-x) + dx*(this.y2-y));
		if((d2 >= 0 != d1 >= 0) && d2 != d1) {
			let l1 = (dx*(this.x1-x) + dy*(this.y1-y));
			let l2 = (dx*(this.x2-x) + dy*(this.y2-y));
			let slope = (l2-l1)/(d2-d1);
			let intersect_point = (-d1 * slope + l1) / rls;
			if(intersect_point > 0) return intersect_point;
		}
		return null;
	}

	point_velocity(x:number, y:number) : [number,number] {
		let mag_squared = (this.x2-this.x1)**2 + (this.y2-this.y1)**2;
		let fac = ((x-this.x1)*(this.x2-this.x1) + (y-this.y1)*(this.y2-this.y1)) / mag_squared;
		return [
			this.vx1*(1-fac) + this.vx2*fac,
			this.vy1*(1-fac) + this.vy2*fac
		];
	}
}

export class PhysicsObject extends MapObject {
	bound_width : number; bound_height : number; bound_x : number; bound_y : number;

	velocity_x : number = 0;
	velocity_y : number = 0;
	ground_friction_enabled = true;

	touching_floor : Line|null = null;
	constructor(x = 0, y = 0, properties? : TiledProperty[], bound_x = 0, bound_y = 0, bound_width = 32, bound_height = 32) {
		super(x, y, properties)
		this.bound_width=bound_width;
		this.bound_height=bound_height;
		this.bound_x=bound_x;
		this.bound_y=bound_y;
	}

	simulate(dt : number) : void {
		this.x += this.velocity_x*dt;
		this.y += this.velocity_y*dt + (GRAVITY * 0.5 * dt * dt);
		this.velocity_y += GRAVITY * dt;

		this.touching_floor = null;
		let normal_impulse = 0;
		for(let line of game_instance.lines) {
			if(line.x2 >= line.x1) continue;
			let slope = (line.y1-line.y2) / (line.x1-line.x2);
			if(Math.abs(slope) > MAX_WALKABLE_SLOPE) continue;
			if(line.x2 >= this.x+this.bound_x+this.bound_width || line.x1 <= this.x+this.bound_x) continue;
			let px = this.x+this.bound_x;
			let py = this.y+this.bound_y + this.bound_height;
			let top = Math.min(line.y1, line.y2);
			if(slope < 0) {
				px += this.bound_width;
			}
			let fy = slope * (px - line.x2) + line.y2;
			let is_top = false;
			if(fy <= top) {
				fy = top;
				is_top = true;
			}
			if(py >= fy && py <= fy+STEP_HEIGHT) {
				this.touching_floor = line;
				this.y += fy-py;

				let [pvx, pvy] = line.point_velocity(this.x, this.y);
				this.velocity_x -= pvx;
				this.velocity_y -= pvy;
				if(is_top) {
					normal_impulse = Math.abs(this.velocity_y);
					this.velocity_y = 0;
				} else {
					let ovx = this.velocity_x;
					let ovy = this.velocity_y;
					// make the velocity parallel to the line;
					let dx = line.x1-line.x2;
					let dy = line.y1-line.y2;
					let invdist = 1/Math.sqrt(dx*dx+dy*dy);
					dx *= invdist;
					dy *= invdist;
					let vel_dot = ovx*dx + ovy*dy;
					this.velocity_x = dx*vel_dot;
					this.velocity_y = dy*vel_dot;
					let v_dx = this.velocity_x - ovx;
					let v_dy = this.velocity_y - ovy;
					normal_impulse += Math.sqrt(v_dx*v_dx+v_dy*v_dy);
				}
				this.velocity_x += pvx;
				this.velocity_y += pvy;
			}
		}
		if(this.touching_floor && (this.velocity_x != 0 || this.velocity_y != 0) && this.ground_friction_enabled) {
			let [pvx, pvy] = this.touching_floor.point_velocity(this.x, this.y);
			this.velocity_x -= pvx;
			this.velocity_y -= pvy;
			let total = Math.sqrt(this.velocity_x*this.velocity_x + this.velocity_y*this.velocity_y);
			let fac = 1 - Math.min(1, normal_impulse * FLOOR_FRICTION_COEFF / total);
			this.velocity_x *= fac;
			this.velocity_y *= fac;
			this.velocity_x += pvx;
			this.velocity_y += pvy;
		}

		let line_penetrations : Array<[Line, number]> = [];
		for(let line of game_instance.lines) {
			if(Math.min(line.x1, line.x2) >= this.x+this.bound_x+this.bound_width) continue;
			if(Math.max(line.x1, line.x2) <= this.x+this.bound_x) continue;
			if(Math.min(line.y1, line.y2) >= this.y+this.bound_y+this.bound_height) continue;
			if(Math.max(line.y1, line.y2) <= this.y+this.bound_y) continue;
			let nx = line.y1 - line.y2;
			let ny = line.x2 - line.x1;
			let inv_length = 1/Math.sqrt(nx*nx+ny*ny);
			nx *= inv_length;
			ny *= inv_length;
			let penetration = -1;
			for(let cx = 0; cx < 2; cx++) for(let cy = 0; cy < 2; cy++) {
				let px = this.x+this.bound_x+this.bound_width*cx;
				let py = this.y+this.bound_y+this.bound_height*cy;
				let pdx = px - line.x1;
				let pdy = py - line.y1;
				let this_penetration = -(pdx*nx + pdy*ny);
				if(this_penetration >= 0 && this_penetration > penetration) penetration = this_penetration;
			}
			if(penetration >= 0 && penetration <= WALL_DEPTH) {
				line_penetrations.push([line, penetration]);
				/*this.x += penetration * nx;
				this.y += penetration * ny;*/
			}
		}
		line_penetrations.sort((a, b) => {return a[1] - b[1];});
		for(let [line] of line_penetrations) {
			if(Math.min(line.x1, line.x2) >= this.x+this.bound_x+this.bound_width) continue;
			if(Math.max(line.x1, line.x2) <= this.x+this.bound_x) continue;
			if(Math.min(line.y1, line.y2) >= this.y+this.bound_y+this.bound_height) continue;
			if(Math.max(line.y1, line.y2) <= this.y+this.bound_y) continue;
			let nx = line.y1 - line.y2;
			let ny = line.x2 - line.x1;
			let inv_length = 1/Math.sqrt(nx*nx+ny*ny);
			nx *= inv_length;
			ny *= inv_length;
			let penetration = -1;
			let touch_x = this.x;
			let touch_y = this.y;
			for(let cx = 0; cx < 2; cx++) for(let cy = 0; cy < 2; cy++) {
				let px = this.x+this.bound_x+this.bound_width*cx;
				let py = this.y+this.bound_y+this.bound_height*cy;
				let pdx = px - line.x1;
				let pdy = py - line.y1;
				let this_penetration = -(pdx*nx + pdy*ny);
				if(this_penetration >= 0 && this_penetration > penetration) {
					penetration = this_penetration;
					touch_x = px;
					touch_y = py;
				}
			}
			if(penetration >= 0 && penetration <= WALL_DEPTH) {	
				let [pvx, pvy] = line.point_velocity(touch_x, touch_y);
				this.velocity_x -= pvx;
				this.velocity_y -= pvy;
				this.x += penetration * nx;
				this.y += penetration * ny;
				let normal_vel = this.velocity_x*nx + this.velocity_y*ny;
				this.velocity_x -= normal_vel * nx;
				this.velocity_y -= normal_vel * ny;
				this.velocity_x += pvx;
				this.velocity_y += pvy;
			}
		}
	}

	draw(ctx : CanvasRenderingContext2D) {
		ctx.fillStyle = "red";
		ctx.fillRect(this.x+this.bound_x, this.y+this.bound_y, this.bound_width, this.bound_height);
	}
}