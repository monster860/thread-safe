import { game_instance } from ".";
import { Line } from "./collision";
import { TiledProperty, TiledText } from "./types";

export class MapObject {
	properties = new Map<string, number|string|boolean>();
	x:number; y:number;
	constructor(x:number, y:number, properties?:TiledProperty[]) {
		this.x=x;
		this.y=y;
		if(properties) {
			for(let property of properties) {
				this.properties.set(property.name, property.value);
			}
		}
	}
	simulate(dt : number) : void {}
	draw(ctx : CanvasRenderingContext2D) : void {}

	in_interact_range(x:number, y:number) : boolean {return false;}

	interact() : void {

	}

	protected string_property(def : string, name : string) : string {
		let prop = this.properties.get(name);
		if(typeof prop == "string") return prop;
		return def;
	}
	protected opt_string_property(name : string) : string|null {
		let prop = this.properties.get(name);
		if(typeof prop == "string") return prop;
		return null;
	}
	protected float_property(def : number, name : string) : number {
		let prop = this.properties.get(name);
		if(typeof prop == "number") return prop;
		return def;
	}
	protected bool_property(def : boolean, name : string) : boolean {
		let prop = this.properties.get(name);
		if(typeof prop == "boolean") return prop;
		return def;
	}

	protected draw_interact_icon(ctx : CanvasRenderingContext2D, x : number, y : number) : void {
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = "15px Verdana";
		ctx.fillStyle = "black";
		ctx.fillText("E", x, y+1);
		ctx.fillStyle = "white";
		ctx.fillText("E", x, y);
		ctx.strokeStyle = "black";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(x, y, 10, 0, Math.PI*2);
		ctx.stroke();
		ctx.strokeStyle = "white";
		ctx.beginPath();
		ctx.arc(x, y-1, 10, 0, Math.PI*2);
		ctx.stroke();
	}

	cleanup() {}
}

export class SwitchObject extends MapObject {
	is_on = false;
	facing_right = false;
	floored = false;
	target_tag = "";
	reset_time = 0;
	reset_timer = 0;
	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		this.facing_right = this.bool_property(this.facing_right, "facing_right");
		this.floored = this.bool_property(this.floored, "floored");
		this.target_tag = this.string_property(this.target_tag, "target_tag");
		this.is_on = this.bool_property(false, "is_on");
		this.reset_time = this.float_property(this.reset_time, "reset_time");
		this.update_tagged(true);
	}

	draw(ctx : CanvasRenderingContext2D) : void {
		if(this.floored) {
			let sx = 0;
			let sy = 128;
			if(this.is_on) sy += 16;
			if(this.reset_time) sy += 128;
			ctx.drawImage(game_instance.tileset_image, sx, sy, 32, 16, this.x - 16, this.y - 16, 32, 16);
		} else {
			let sx = 0;
			let sy = 64;
			if(this.is_on) sy += 32;
			if(this.facing_right) sx += 16;
			if(this.reset_time) sy += 128;
			ctx.drawImage(game_instance.tileset_image, sx, sy, 16, 32, this.x - (this.facing_right ? 0 : 16), this.y - 32, 16, 32);
		}
		if(game_instance.player && this.in_interact_range(game_instance.player.x, game_instance.player.y)) this.draw_interact_icon(ctx, this.x, this.y-32);
	}

	simulate(dt : number) : void {
		super.simulate(dt);
		if(this.reset_time && this.is_on) {
			this.reset_timer += dt;
			if(this.reset_timer > this.reset_time) {
				this.reset_timer = 0;
				this.is_on = false;
				game_instance.switch_off_sound.play(1);
				this.update_tagged();
			}
		}
	}

	in_interact_range(x:number, y:number) : boolean {
		let dx = x - this.x;
		let dy = y - this.y;
		return (dx*dx+dy*dy) < 32*32;
	}

	interact() : void {
		if(this.is_on && this.reset_time) return;
		this.is_on = !this.is_on;
		if(this.is_on) game_instance.switch_on_sound.play(1);
		else game_instance.switch_off_sound.play(1);
		this.update_tagged();
	}
	private update_tagged(instant = false) : void {
		let tags = this.target_tag.split("|");
		for(let tag of tags) {
			if(tag.startsWith("!")) tag = tag.substring(1);
			let tagged_object = game_instance.tagged_objects.get(tag);
			if(tagged_object) {
				tagged_object.update_switch(this, instant);
			}
		}
	}
}

export class SwitchableObject extends MapObject {
	tag : string|null = null;
	switches_on = new Set<SwitchObject>();
	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		this.tag = this.opt_string_property("tag");
		if(this.tag) {
			game_instance.tagged_objects.set(this.tag, this);
		}
	}

	update_switch(obj : SwitchObject|null, instant = false) : void {
		if(obj) {
			let spl = obj.target_tag.split("|");
			let invert = spl.includes("!" + this.tag);
			if(obj.is_on != invert) this.switches_on.add(obj);
			else this.switches_on.delete(obj);
		}
	}
}

type GateType = {
	sx : number, sy : number, width : number, height : number
};

const gate_types : {[key : string]: GateType} = {
	"wood_4": {sx: 0, sy: 48, width: 128, height: 16},
	"wood_2": {sx: 0, sy: 32, width: 64, height: 16}
};

const corner_orderings = [[0, 0], [0, 1], [1, 1], [1, 0]];

const SPIN_SOUND_FREQ_FAC = 20;
const TRANSLATE_SOUND_FREQ_FAC = 1;

export class GateObject extends SwitchableObject {
	gate_type : GateType;
	dx = 0; dy = 0;
	rotation_initial = 0; rotation_final = 0;
	move_dx = 0; move_dy = 0;
	transition_time = 0;
	state = 0;
	transition_target = 0;
	switched_on = false;

	easing_constant = 10;

	continuous = false;
	continuous_bounce = true;

	gain : GainNode = game_instance.audio_ctx.createGain();
	panner : PannerNode = game_instance.audio_ctx.createPanner();

	base_translate_freq : number = 1;
	base_rotate_freq : number = 1;
	translate_sound : OscillatorNode|null = null;
	rotate_sound : OscillatorNode|null = null;
	translate_sound_2 : OscillatorNode|null = null;
	rotate_sound_2 : OscillatorNode|null = null;

	lines : Line[] = [];

	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);

		this.gain.connect(this.panner);
		this.panner.connect(game_instance.audio_ctx.destination);
		this.panner.panningModel = "HRTF";

		let gate_type_string = this.properties.get("gate_type");
		if(typeof gate_type_string != "string") throw new Error("Missing gate type!");
		let gate_type = gate_types[gate_type_string];
		if(!gate_type) throw new Error("invalid gate type " + gate_type_string);
		this.gate_type = gate_type;

		this.dx = this.float_property(this.dx, "dx");
		this.dy = this.float_property(this.dx, "dy");
		this.move_dx = this.float_property(this.move_dx, "move_dx");
		this.move_dy = this.float_property(this.move_dx, "move_dy");
		this.rotation_initial = this.float_property(this.rotation_initial, "rotation_initial") * Math.PI / 180;
		this.rotation_final = this.float_property(0, "rotation_final") * Math.PI / 180;
		this.transition_time = this.float_property(0, "transition_time");
		this.easing_constant = this.float_property(this.easing_constant, "easing_constant");

		this.gain.gain.value = Math.min(this.transition_time / 3, 1);

		this.continuous = this.bool_property(this.continuous, "continuous");
		this.continuous_bounce = this.bool_property(this.continuous_bounce, "continuous_bounce");
		if(this.continuous) this.transition_target = 1;

		for(let i = 0; i < 4; i++) {
			let line = new Line(0,0,0,0);
			this.lines.push(line);
			game_instance.lines.push(line);
		}

		for(let object of game_instance.objects) {
			if(!(object instanceof SwitchObject)) continue;
			let spl = object.target_tag.split("|");
			if(this.tag && (spl.includes(this.tag) || spl.includes("!"+this.tag))) this.update_switch(object, true);
		}
		if(!this.tag) this.update_switch(null, true);

		this.update_collision();
	}

	simulate(dt : number) : void {
		if(this.continuous && !this.continuous_bounce) this.transition_target = 1;
		if(this.continuous ? this.switched_on : this.state != this.transition_target) {
			let error = this.transition_target - this.state;
			if(this.continuous) {
				this.state += dt / this.transition_time * Math.sign(error);
				if(this.continuous_bounce) {
					while(this.state >= 2) this.state -= 2;
					while(this.state < 0) this.state += 2;
					if(this.state > 1) {this.state = 2 - this.state; this.transition_target = 1 - this.transition_target}
				} else {
					while(this.state >= 1) this.state--;
					while(this.state < 0) this.state++;
				}
			} else {
				this.state += Math.min(Math.abs(error), dt / this.transition_time) * Math.sign(error);
			}
			this.update_collision();
			if(!this.translate_sound && (this.move_dx || this.move_dy)) {
				this.base_translate_freq = Math.sqrt(this.move_dx**2 + this.move_dy**2) / this.transition_time * TRANSLATE_SOUND_FREQ_FAC;
				this.translate_sound = game_instance.audio_ctx.createOscillator();
				this.translate_sound.frequency.value = this.base_translate_freq;
				this.translate_sound.type = "triangle";
				this.translate_sound.start();
				this.translate_sound.connect(this.gain);

				this.translate_sound_2 = game_instance.audio_ctx.createOscillator();
				this.translate_sound_2.frequency.value = this.base_translate_freq + 100;
				this.translate_sound_2.type = "triangle";
				this.translate_sound_2.start();
				this.translate_sound_2.connect(this.gain);
			}
			if(!this.rotate_sound && this.rotation_final != this.rotation_initial) {
				this.base_rotate_freq = Math.abs(this.rotation_final - this.rotation_initial) / this.transition_time * SPIN_SOUND_FREQ_FAC
				this.rotate_sound = game_instance.audio_ctx.createOscillator();
				this.rotate_sound.frequency.value = this.base_rotate_freq;
				this.rotate_sound.type = "triangle";
				this.rotate_sound.start();
				this.rotate_sound.connect(this.gain);

				this.rotate_sound_2 = game_instance.audio_ctx.createOscillator();
				this.rotate_sound_2.frequency.value = this.base_rotate_freq + 100;
				this.rotate_sound_2.type = "triangle";
				this.rotate_sound_2.start();
				this.rotate_sound_2.connect(this.gain);
			}
			if(this.translate_sound) this.translate_sound.frequency.value = this.base_translate_freq * this.easing_derivative(this.state);
			if(this.translate_sound_2) this.translate_sound_2.frequency.value = this.base_translate_freq * this.easing_derivative(this.state)+100;
			if(this.rotate_sound) this.rotate_sound.frequency.value = this.base_rotate_freq * this.easing_derivative(this.state);
			if(this.rotate_sound_2) this.rotate_sound_2.frequency.value = this.base_rotate_freq * this.easing_derivative(this.state)+100;
		} else {
			if(this.translate_sound) {this.translate_sound.stop(); this.translate_sound = null;}
			if(this.rotate_sound) {this.rotate_sound.stop(); this.rotate_sound = null;}
			if(this.translate_sound_2) {this.translate_sound_2.stop(); this.translate_sound_2 = null;}
			if(this.rotate_sound_2) {this.rotate_sound_2.stop(); this.rotate_sound_2 = null;}
		}
		this.panner.positionX.value = game_instance.audio_scale * (this.x + this.move_dx * this.state);
		this.panner.positionY.value = -game_instance.audio_scale * (this.y + this.move_dy * this.state);
	}

	cleanup(): void {
		super.cleanup();
		if(this.translate_sound) {this.translate_sound.stop(); this.translate_sound = null;}
		if(this.rotate_sound) {this.rotate_sound.stop(); this.translate_sound = null;}
		if(this.translate_sound_2) {this.translate_sound_2.stop(); this.translate_sound_2 = null;}
		if(this.rotate_sound_2) {this.rotate_sound_2.stop(); this.rotate_sound_2 = null;}
	}

	get rotation() : number {
		let eased = this.easing(this.state);
		return this.rotation_final * (eased) + this.rotation_initial * (1 - eased);
	}

	draw(ctx : CanvasRenderingContext2D) : void {
		if(this.move_dx || this.move_dy) {
			ctx.lineCap = "round";
			ctx.strokeStyle = "#333";
			ctx.lineWidth = 4;
			ctx.beginPath();
			ctx.moveTo(this.x, this.y);
			ctx.lineTo(this.x+this.move_dx, this.y+this.move_dy);
			ctx.stroke();
			
			ctx.strokeStyle = "#777";
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(this.x+0.5, this.y+0.5);
			ctx.lineTo(this.x+this.move_dx+0.5, this.y+this.move_dy+0.5);
			ctx.stroke();
			
			ctx.strokeStyle = "black";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(this.x, this.y);
			ctx.lineTo(this.x+this.move_dx, this.y+this.move_dy);
			ctx.stroke();
		}
		let eased = this.easing(this.state);
		ctx.save();
		ctx.translate(this.x + Math.round(eased * this.move_dx), this.y + Math.round(eased * this.move_dy));
		ctx.rotate(this.rotation);

		ctx.drawImage(game_instance.tileset_image, this.gate_type.sx, this.gate_type.sy, this.gate_type.width, this.gate_type.height,
			this.dx, this.dy, this.gate_type.width, this.gate_type.height);
		ctx.rotate(-this.rotation);
		ctx.drawImage(game_instance.tileset_image, 128, 32, 16, 16, -8, -8, 16, 16);

		ctx.restore();
	}

	update_switch(obj : SwitchObject|null, instant = false) : void {
		super.update_switch(obj);
		this.switched_on = this.switches_on.size > 0 || !this.tag;
		if(!this.continuous) this.transition_target = this.switched_on ? 1 : 0;
		if(instant && !this.continuous) {
			this.state = this.transition_target;
			this.update_collision();
		}
	}

	private update_collision() : void {
		let eased = this.easing(this.state);
		let easing_derivative = this.easing_derivative(this.state);
		let r = this.rotation;
		let c = Math.cos(r);
		let s = Math.sin(r);

		let corners : [number,number,number,number][] = [];
		for(let i = 0; i < corner_orderings.length; i++) {
			let lx = this.dx + this.gate_type.width * corner_orderings[i][0];
			let ly = this.dy + this.gate_type.height * corner_orderings[i][1];
			let x = lx*c - ly*s;
			let y = lx*s + ly*c;

			let vx=0, vy=0;
			if(this.continuous ? this.switched_on : this.state != this.transition_target) {
				let multiplier = 1 / this.transition_time * easing_derivative * Math.sign(this.transition_target - this.state);
				vx += this.move_dx * multiplier;
				vy += this.move_dy * multiplier;
				vx += -y * (this.rotation_final - this.rotation_initial) * multiplier;
				vy += x * (this.rotation_final - this.rotation_initial) * multiplier;
			}

			x += this.x + this.move_dx * eased;
			y += this.y + this.move_dy * eased;

			corners.push([x,y,vx,vy]);
		}
		for(let i = 0; i < this.lines.length; i++) {
			let line = this.lines[i];
			line.x1 = corners[i][0];
			line.y1 = corners[i][1];
			line.vx1 = corners[i][2];
			line.vy1 = corners[i][3];
			let n = (i+1) % corners.length;
			line.x2 = corners[n][0];
			line.y2 = corners[n][1];
			line.vx2 = corners[n][2];
			line.vy2 = corners[n][3];
		}
	}

	easing(x:number) {
		const a = this.easing_constant;
		return (1-x)*(x**a) + x*(1-(1-x)**a);
	}
	easing_derivative(x:number) {
		const a = this.easing_constant;
		return a*(x**(a-1))-(a+1)*(x**a)+1-(1-x)**a+a*x*((1-x)**(a-1));
	}
}

export class ExitObject extends MapObject {
	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		for(let i = 0; i < 100; i++) this.simulate(0.01);
	}
	particles : [number,number,number][] = [];
	particle_timer : number = 0;
	simulate(dt : number) {
		if(game_instance.player) {
			if(Math.abs(game_instance.player.x - this.x) < 20 && Math.abs(game_instance.player.y - this.y) < 1) {
				game_instance.advance_map();
			}
		}
		this.particle_timer -= dt;
		while(this.particle_timer < 0) {
			this.particle_timer += 0.03;
			let cos = Math.cos(Math.random() * Math.PI);
			this.particles.push([(Math.sign(cos) - cos) * 32, 2 + Math.random()*2, 0]);
		}
		for(let i = 0; i < this.particles.length; i++) {
			this.particles[i][2] += dt;
			if(this.particles[i][2] > 1) {
				this.particles.splice(i, 1);
				i--;
			}
		}
	}
	draw(ctx : CanvasRenderingContext2D) : void {
		for(let particle of this.particles) {
			ctx.fillStyle = `rgba(128, 140, 255, ${1 - particle[2]})`;
			ctx.fillRect(this.x + particle[0], this.y + -particle[2]*64, particle[1], particle[1]);
		}
		ctx.drawImage(game_instance.tileset_image, 96, 64, 64, 32, this.x-32, this.y, 64, 32);
	}
}

export class ItemObject extends MapObject {
	picked_up = false;

	private timer : number = 0;
	simulate(dt : number) {
		if(this.picked_up) return;
		this.timer += dt * 2;
		if(this.timer > Math.PI*2) this.timer -= Math.PI*2;

		if(game_instance.player) {
			let dx = game_instance.player.x - this.x;
			let dy = game_instance.player.y - this.y;
			if((dx*dx+dy*dy) < 32*32) {
				this.picked_up = true;
				this.pick_up();
			}
		}
	}
	protected get_float_y() {
		return Math.round(Math.sin(this.timer) * 3);
	}

	pick_up() {}
}

export class ThreadExtensionObject extends ItemObject {
	length_to_add = 300;

	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		this.length_to_add = this.float_property(this.length_to_add, "length_to_add");
	}
	draw(ctx : CanvasRenderingContext2D) {
		if(this.picked_up) return;
		ctx.drawImage(game_instance.tileset_image, 0, 160, 32, 32, this.x-16, this.y-16 + this.get_float_y(), 32, 32);
	}
	pick_up() {
		game_instance.thread_extend_sound.play();
		if(game_instance.player) game_instance.player.thread_limit += this.length_to_add;
	}
}

export class BonusCoinObject extends ItemObject {
	particle_timer = 0;
	particles : [number,number,number,number,number][] = [];
	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		for(let i = 0; i < 100; i++) this.simulate(0.01);
	}
	simulate(dt:number) {
		super.simulate(dt);
		if(!this.picked_up) {
			this.particle_timer -= dt;
			while(this.particle_timer < 0) {
				this.particle_timer += 0.03;
				let angle = Math.random() * Math.PI * 2;
				this.particles.push([this.get_float_y(), Math.cos(angle), Math.sin(angle), 0, Math.random()]);
			}
		}
		for(let i = 0; i < this.particles.length; i++) {
			this.particles[i][3] += dt;
			if(this.particles[i][3] > 1) {
				this.particles.splice(i, 1);
				i--;
			}
		}
	}
	draw(ctx : CanvasRenderingContext2D) {
		for(let particle of this.particles) {
			ctx.fillStyle = `rgba(171, 106, 202, ${1 - particle[3]})`;
			ctx.fillRect(this.x + particle[2] * particle[3] * 32 - 2*particle[4], this.y + particle[0] + particle[1] * particle[3] * 32 - 2*particle[4], 4*particle[4], 4*particle[4]);
		}
		if(this.picked_up) return;
		ctx.drawImage(game_instance.tileset_image, 32, 160, 32, 32, this.x-16, this.y-16 + this.get_float_y(), 32, 32);
	}
	pick_up() {
		for(let i = 0; i < 100; i++) {
			let angle = Math.random() * Math.PI * 2;
			let dist_fac = Math.random();
			this.particles.push([this.get_float_y(), Math.cos(angle)*4*dist_fac, Math.sin(angle)*4*dist_fac, 0, Math.random()]);
		}
		game_instance.bonus_coin_sound.play();
	}
}

export class TextObject extends MapObject {
	constructor(x:number, y:number, properties?:TiledProperty[], public text?:TiledText, public width = 128, public height = 32) {
		super(x, y, properties);
	}
	
	draw(ctx : CanvasRenderingContext2D) {
		if(this.text) {
			ctx.font = "16px sans-serif";
			ctx.fillStyle = this.text.color;
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillText(this.text.text, this.x, this.y, this.width);
		}
	}
}
