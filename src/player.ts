import { game_instance } from ".";
import { Line, PhysicsObject } from "./collision";

const AIR_MOVE_ACCELERATION = 2000;
const MOVE_SPEED_MAX = 290;
const JUMP_VELOCITY = 750;
const JUMP_VELOCITY_WEREWOLF = 1100;
const THREAD_OFFSET_X = 0;
const THREAD_OFFSET_Y = -8;

const thread_state_cache : number[] = [];

export class PlayerObject extends PhysicsObject {
	facing_right = false;

	thread_points : Array<[number,number]|[Line,boolean,boolean]> = [];

	constructor(x = 0, y = 0) {
		super(x, y, undefined, -12, -30, 24, 30);
		this.thread_points = [[...game_instance.spawn_coordinates]];
	}

	draw(ctx : CanvasRenderingContext2D) {
		ctx.lineWidth = 3;
		ctx.strokeStyle = "#90603a";
		ctx.lineJoin = "round";
		ctx.lineCap = "butt";
		ctx.beginPath();
		for(let i = 0; i < this.thread_points.length; i++) {
			if(i == 0) {
				ctx.moveTo(...thread_point_coords(this.thread_points[i]));
			} else {
				ctx.lineTo(...thread_point_coords(this.thread_points[i]));
			}
		}
		ctx.lineTo(Math.round(this.x+THREAD_OFFSET_X), Math.round(this.y+THREAD_OFFSET_Y));
		ctx.stroke();

		let thread_cycle = 0;
		let state_index = 0;
		for(let i = 0; i < this.thread_points.length; i++) {
			let this_point = this.thread_points[i];
			let [x1,y1] = thread_point_coords(this_point);
			let [x2,y2] = thread_point_coords(this.thread_points[i+1]) ?? [Math.round(this.x+THREAD_OFFSET_X), Math.round(this.y+THREAD_OFFSET_Y)];
			let dx = x2-x1, dy=y2-y1;
			let mag = Math.sqrt(dx*dx+dy*dy);
			dx /= mag; dy /= mag;
			let lo = 0;
			if(dx < dy) lo += 16;

			let len_left = mag;

			ctx.save();
			ctx.translate(x1, y1);
			ctx.transform(dx, dy, -dy, dx, 0, 0);
			while(len_left > 0) {
				let to_add = Math.min(16 - thread_cycle, len_left);
				let state = thread_state_cache[state_index];
				if(state == undefined) {
					state = 0;
					if(Math.random() < 0.5) state = Math.floor(Math.random() * 4);
					thread_state_cache[state_index] = state;
				}
				ctx.drawImage(game_instance.tileset_image, 32+lo+thread_cycle, 128+state*8, to_add, 7, 0, -3.5, to_add, 7);
				thread_cycle += len_left;
				if(thread_cycle > 15.9999) {
					thread_cycle = 0;
					state_index++;
				}
				ctx.translate(to_add, 0);
				len_left -= to_add;
			}
			ctx.restore();
		}

		let sx = 32;
		let sy = 64;
		if(this.facing_right) sy += 32;
		ctx.drawImage(game_instance.tileset_image, sx, sy, 32, 32, Math.round(this.x)-16, Math.round(this.y)-32, 32, 32);
	}

	jump() {
		if(this.touching_floor) {
			let [pvx, pvy] = this.touching_floor.point_velocity(this.x, this.y);
			this.velocity_x -= pvx;
			this.velocity_y -= pvy;
			this.velocity_y = -JUMP_VELOCITY;
			this.velocity_x += pvx;
			this.velocity_y += pvy;
		}
	}

	thread_length = 0;
	thread_limit = 500;
	last_pre_len : number|null = null;
	last_endx = 0;
	last_endy = 0;

	simulate(dt : number) {
		this.ground_friction_enabled = true;
		let pre_len = 0;
		let last_len = 0;
		this.thread_length = 0;
		let last_dx = 0, last_dy = 0;
		let prev_x=0, prev_y=0;
		for(let i = 0; i < this.thread_points.length; i++) {
			let this_point = this.thread_points[i];
			let [x1,y1] = thread_point_coords(this_point);
			let [x2,y2] = thread_point_coords(this.thread_points[i+1]) ?? [this.x+THREAD_OFFSET_X, this.y+THREAD_OFFSET_Y];
			let dx = x2-x1, dy=y2-y1;
			let mag = Math.sqrt(dx*dx+dy*dy);
			dx /= mag; dy /= mag;

			if(this_point.length == 3 && i > 0) {
				let is_left = ((y2-prev_y)*(x1-prev_x) - (x2-prev_x)*(y1-prev_y)) > 0;
				if(is_left != this_point[2]) {
					this.thread_points.splice(i, 1);
					this.last_pre_len = null;
					i--;
					continue;
				}
			}

			for(let line of [...game_instance.lines].sort((a,b) => {
				let as = Math.abs((a.x2-a.x1)*dy - (a.y2-a.y1)*dx);
				let bs = Math.abs((a.x2-a.x1)*dy - (a.y2-a.y1)*dx);
				return bs-as;
			})) {
				let dist = line.instersect_ray(x1, y1, dx, dy);
				if(dist !== null && dist >= 0.01 && dist <= mag-0.01) {
					let ix = x1+dist*dx;
					let iy = y1+dist*dy;
					let d1 = Math.abs(ix-line.x1) + Math.abs(iy-line.y1);
					let d2 = Math.abs(ix-line.x2) + Math.abs(iy-line.y2);
					let [px, py] = (d2 < d1) ? [line.x2, line.y2] : [line.x1, line.y1]
					let dp = Math.abs(px-x1) + Math.abs(py-y1);
					let dn = Math.abs(px-x2) + Math.abs(py-y2);
					let leftness = ((y2-y1)*(px-x1) - (x2-x1)*(py-y1));
					if(this.thread_points.length > 100) {
						console.log("Too many points!");
					} else if((d1 < 16 || d2 < 16) && Math.abs(leftness) > 0.5 && dp > 1 && dn > 1) {
						let point = [line, d2 < d1, false] as [Line,boolean,boolean];
						point[2] = leftness > 0;
						this.thread_points.splice(i+1, 0, point);
						this.last_pre_len = null;
						i++;
						break;
					}
				}
			}
			[prev_x, prev_y] = [x1,y1];
		}
		for(let i = 0; i < this.thread_points.length; i++) {
			let this_point = this.thread_points[i];
			let [x1,y1] = thread_point_coords(this_point);
			let [x2,y2] = thread_point_coords(this.thread_points[i+1]) ?? [this.x+THREAD_OFFSET_X, this.y+THREAD_OFFSET_Y];
			let dx = x2-x1, dy=y2-y1;
			let mag = Math.sqrt(dx*dx+dy*dy);
			if(i < this.thread_points.length-1)pre_len += mag;
			this.thread_length += mag;
			last_len = mag;
			dx /= mag; dy /= mag;
			last_dx = dx; last_dy = dy;
			[prev_x, prev_y] = [x1,y1];
		}
		if(this == game_instance.player) {
			if(game_instance.arrow_left && !game_instance.arrow_right) {
				if(this.touching_floor) this.velocity_x = -MOVE_SPEED_MAX;
				else this.velocity_x = Math.max(this.velocity_x - dt*AIR_MOVE_ACCELERATION, Math.min(this.velocity_x, -MOVE_SPEED_MAX));
				this.facing_right = false;
			} else if(game_instance.arrow_right && !game_instance.arrow_left) {
				if(this.touching_floor) this.velocity_x = MOVE_SPEED_MAX;
				else this.velocity_x = Math.min(this.velocity_x + dt*AIR_MOVE_ACCELERATION, Math.max(this.velocity_x, MOVE_SPEED_MAX));
				this.facing_right = true;
			}
		}
		if(game_instance.arrow_left && !game_instance.arrow_right) this.facing_right = false;
		else if(game_instance.arrow_right && game_instance.arrow_left) this.facing_right = true;

		if(this.thread_length > this.thread_limit) {
			if(this.thread_length - this.thread_limit > 64) game_instance.advance_map(game_instance.current_map_index);
			let to_reduce = Math.min(this.thread_length - this.thread_limit, 5, last_len);
			this.thread_length -= to_reduce;
			let vel_dot = last_dx * this.velocity_x + last_dy * this.velocity_y;
			let vel_add = -vel_dot;
			if(this.last_pre_len != null) {
				vel_add -= (pre_len - this.last_pre_len) / dt;
				let prev_last_len = Math.sqrt((this.last_endx-this.x-THREAD_OFFSET_X)**2 + (this.last_endy-this.y-THREAD_OFFSET_Y)**2);
				vel_add -= (last_len - prev_last_len) / dt;
			}
			vel_add = Math.min(vel_add, 0);
			this.x -= last_dx * to_reduce;
			this.y -= last_dy * to_reduce;
			this.velocity_x += vel_add * last_dx;
			this.velocity_y += vel_add * last_dy;
			this.ground_friction_enabled = false;
		}
		this.last_pre_len = pre_len;
		this.last_endx = prev_x;
		this.last_endy = prev_y;

		let audio_position = [
			this.x * game_instance.audio_scale,
			-this.y * game_instance.audio_scale,
			10
		] as const;
		
		if(game_instance.audio_ctx.listener.positionX != undefined) {
			game_instance.audio_ctx.listener.positionX.value = audio_position[0];
			game_instance.audio_ctx.listener.positionY.value = audio_position[1];
			game_instance.audio_ctx.listener.positionZ.value = audio_position[2];
		} else if(game_instance.audio_ctx.listener.setPosition) {
			// ffs firefox
			game_instance.audio_ctx.listener.setPosition(...audio_position);
		}

		super.simulate(dt);
	}
}

function thread_point_coords(p : [number,number]|[Line,boolean,boolean]) : [number,number];
function thread_point_coords(p : undefined) : undefined;
function thread_point_coords(p : [number,number]|[Line,boolean,boolean]|undefined) : [number,number]|undefined {
	if(!p) return undefined;
	if(p.length == 3) {
		if(p[1]) return [p[0].x2, p[0].y2];
		else return [p[0].x1, p[0].y1];
	}
	return p;
}
