import { game_instance } from ".";
import { PhysicsObject } from "./collision";

const AIR_MOVE_ACCELERATION = 2000;
const MOVE_SPEED_MAX = 290;
const JUMP_VELOCITY = 750;
const JUMP_VELOCITY_WEREWOLF = 1100;

export class PlayerObject extends PhysicsObject {
	is_werewolf = false;
	facing_right = false;

	constructor(x = 0, y = 0) {
		super(x, y, undefined, -12, -30, 24, 30);
	}

	draw(ctx : CanvasRenderingContext2D) {
		let sx = 32;
		let sy = 64;
		if(this.is_werewolf) sx += 32;
		if(this.facing_right) sy += 32;
		ctx.drawImage(game_instance.tileset_image, sx, sy, 32, 32, Math.round(this.x)-16, Math.round(this.y)-32, 32, 32);
	}

	jump() {
		if(this.touching_floor && !this.is_werewolf)
			this.velocity_y = -JUMP_VELOCITY;
	}

	simulate(dt : number) {
		let moonlit = !!game_instance.moon?.is_point_lit(this.x + this.bound_x + this.bound_width/2, this.y + this.bound_y + this.bound_height/2);
		if(moonlit != this.is_werewolf) {
			this.is_werewolf = moonlit;
			if(this.is_werewolf && !game_instance.awoo_playing) {
				game_instance.awoo_playing = true;
				setTimeout(() => {game_instance.awoo_playing = false}, 4000);
				game_instance.awoo_sound.play(Math.random() * 0.4 + 0.8);
			}
		}

		let moon_vector = game_instance.moon?.get_moon_vector(this.x, this.y) ?? [0,0];

		if(this == game_instance.player || this.is_werewolf) {
			if(this.is_werewolf ? moon_vector[0] < 0 : (game_instance.arrow_left && !game_instance.arrow_right)) {
				if(this.touching_floor) this.velocity_x = -MOVE_SPEED_MAX;
				else if(!this.is_werewolf)this.velocity_x = Math.max(this.velocity_x - dt*AIR_MOVE_ACCELERATION, Math.min(this.velocity_x, -MOVE_SPEED_MAX));
				this.facing_right = false;
			} else if(this.is_werewolf ? moon_vector[0] > 0 : (game_instance.arrow_right && !game_instance.arrow_left)) {
				if(this.touching_floor) this.velocity_x = MOVE_SPEED_MAX;
				else if(!this.is_werewolf) this.velocity_x = Math.min(this.velocity_x + dt*AIR_MOVE_ACCELERATION, Math.max(this.velocity_x, MOVE_SPEED_MAX));
				this.facing_right = true;
			}
		}
		if(!this.is_werewolf)
			if(this.velocity_x < 0) this.facing_right = false;
			else if(this.velocity_x > 0) this.facing_right = true;

		if(this.is_werewolf && this.touching_floor) this.velocity_y = -JUMP_VELOCITY_WEREWOLF;

		super.simulate(dt);
	}
}