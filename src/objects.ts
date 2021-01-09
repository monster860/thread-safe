import { game_instance } from ".";
import { Line } from "./collision";
import { TiledProperty } from "./types";

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
}

export class SwitchObject extends MapObject {
	is_on = false;
	facing_right = false;
	target_tag = "";
	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		this.facing_right = this.bool_property(this.facing_right, "facing_right");
		this.target_tag = this.string_property(this.target_tag, "target_tag");
		this.is_on = this.bool_property(false, "is_on");
		this.update_tagged(true);
	}

	draw(ctx : CanvasRenderingContext2D) : void {
		let sx = 0;
		let sy = 64;
		if(this.is_on) sy += 32;
		if(this.facing_right) sx += 16;
		ctx.drawImage(game_instance.tileset_image, sx, sy, 16, 32, this.x - (this.facing_right ? 0 : 16), this.y - 32, 16, 32);
		if(game_instance.player && !game_instance.player.is_werewolf && this.in_interact_range(game_instance.player.x, game_instance.player.y)) this.draw_interact_icon(ctx, this.x, this.y-32);
	}

	in_interact_range(x:number, y:number) : boolean {
		let dx = x - this.x;
		let dy = y - this.y;
		return (dx*dx+dy*dy) < 32*32;
	}

	interact() : void {
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

	update_switch(obj : SwitchObject, instant = false) : void {
		let spl = obj.target_tag.split("|");
		let invert = spl.includes("!" + this.tag);
		if(obj.is_on != invert) this.switches_on.add(obj);
		else this.switches_on.delete(obj);
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

export class GateObject extends SwitchableObject {
	gate_type : GateType;
	dx = 0; dy = 0;
	rotation_initial = 0; rotation_final = 0;
	transition_time = 0;
	state = 0;
	transition_target = 0;

	lines : Line[] = [];

	constructor(x:number, y:number, properties?:TiledProperty[]) {
		super(x, y, properties);
		let gate_type_string = this.properties.get("gate_type");
		if(typeof gate_type_string != "string") throw new Error("Missing gate type!");
		let gate_type = gate_types[gate_type_string];
		if(!gate_type) throw new Error("invalid gate type " + gate_type_string);
		this.gate_type = gate_type;

		this.dx = this.float_property(this.dx, "dx");
		this.dy = this.float_property(this.dx, "dy");
		this.rotation_initial = this.float_property(this.rotation_initial, "rotation_initial") * Math.PI / 180;
		this.rotation_final = this.float_property(0, "rotation_final") * Math.PI / 180;
		this.transition_time = this.float_property(0, "transition_time");

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

		this.update_collision();
	}

	simulate(dt : number) : void {
		if(this.state != this.transition_target) {
			let error = this.transition_target - this.state;
			console.log(dt);
			this.state += Math.min(Math.abs(error), dt / this.transition_time) * Math.sign(error);
			this.update_collision();
		}
	}

	get rotation() : number {
		return this.rotation_final * (this.state) + this.rotation_initial * (1 - this.state);
	}

	draw(ctx : CanvasRenderingContext2D) : void {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(this.rotation);

		ctx.drawImage(game_instance.tileset_image, this.gate_type.sx, this.gate_type.sy, this.gate_type.width, this.gate_type.height,
			this.dx, this.dy, this.gate_type.width, this.gate_type.height);

		ctx.restore();
	}

	update_switch(obj : SwitchObject, instant = false) : void {
		super.update_switch(obj);
		this.transition_target = this.switches_on.size > 0 ? 1 : 0;
		if(instant) {
			this.state = this.transition_target;
			this.update_collision();
		}
	}

	private update_collision() : void {
		let r = this.rotation;
		let c = Math.cos(r);
		let s = Math.sin(r);

		let corners : [number,number][] = [];
		for(let i = 0; i < corner_orderings.length; i++) {
			let lx = this.dx + this.gate_type.width * corner_orderings[i][0];
			let ly = this.dy + this.gate_type.height * corner_orderings[i][1];
			let x = lx*c - ly*s;
			let y = lx*s + ly*c;
			x += this.x;
			y += this.y;
			corners.push([x,y]);
		}
		for(let i = 0; i < this.lines.length; i++) {
			let line = this.lines[i];
			line.x1 = corners[i][0];
			line.y1 = corners[i][1];
			let n = (i+1) % corners.length;
			line.x2 = corners[n][0];
			line.y2 = corners[n][1];
		}
	}
}

export class ExitObject extends MapObject {
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
