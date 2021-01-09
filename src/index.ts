import { Line } from "./collision";
import { Moon, OrthoMoon } from "./lighting";
import { maps_list } from "./maps_list";
import { ExitObject, GateObject, MapObject, SwitchableObject, SwitchObject } from "./objects";
import { PlayerObject } from "./player";
import { Sound } from "./sound";

export class Game {
	canvas : HTMLCanvasElement;
	zoom : number = 1;
	lines : Line[] = [];
	objects : MapObject[] = [];
	tagged_objects = new Map<string, SwitchableObject>();
	
	player : PlayerObject|null = null;
	moon : Moon|null = null;
	last_time : number = -1;
	spawn_coordinates : [number,number] = [0,0];
	arrow_left = false; arrow_right = false; arrow_up = false; arrow_down = false;

	audio_ctx = new AudioContext();
	
	tileset_image : HTMLImageElement = new Image();
	moon_image : HTMLImageElement = new Image();
	title_image : HTMLImageElement = new Image();

	awoo_playing = false;
	awoo_sound = new Sound("awoo.ogg");
	switch_on_sound = new Sound("switch_on.ogg");
	switch_off_sound = new Sound("switch_off.ogg");

	tiles : number[] = [];
	tiles_width = 0;
	tiles_height = 0;
	current_map_index : number = -1;
	next_map_index : number|null = null;
	next_map_fade : number = 0;

	star_map = new Map<string, string>();

	constructor() {
		this.canvas = document.createElement("canvas");
		this.tileset_image.src = "tileset.png";
		this.moon_image.src = "moon.png";
		this.title_image.src = "title.png";
		window.addEventListener("DOMContentLoaded", this.dom_content_loaded.bind(this));
	}

	advance_map(target? : number) : void {
		if(this.next_map_index) return;
		if(target == undefined) {
			if(maps_list.length > this.current_map_index+1) {
				target = this.current_map_index+1;
			} else {
				target = -2;
			}
		}
		this.next_map_index = target;
	}

	load_map(index : number) {
		this.objects.length = 0;
		this.lines.length = 0;
		this.tagged_objects.clear();
		this.current_map_index = index;
		if(index >= 0) {
			let map = maps_list[index];
			for(let layer of map.layers) {
				if(layer.name == "Objects" && layer.objects) {
					let objects = layer.objects;
					for(let object of objects) {
						if(object.polygon) {
							for(let i = 0; i < object.polygon.length; i++) {
								let next = i+1;
								if(next == object.polygon.length) next = 0;
								let a = object.polygon[i];
								let b = object.polygon[next];
								this.lines.push(new Line(object.x + a.x, object.y + a.y, object.x + b.x, object.y + b.y));
							}
						}
						if(object.polyline) {
							for(let i = 0; i < object.polyline.length-1; i++) {
								let next = i+1;
								let a = object.polyline[i];
								let b = object.polyline[next];
								this.lines.push(new Line(object.x + a.x, object.y + a.y, object.x + b.x, object.y + b.y));
							}
						}
						if(object.type == "spawn") {
							this.spawn_coordinates = [object.x, object.y];
						} else if(object.type == "switch") {
							this.objects.push(new SwitchObject(object.x, object.y, object.properties));
						} else if(object.type == "gate") {
							this.objects.push(new GateObject(object.x, object.y, object.properties));
						} else if(object.type == "exit") {
							this.objects.push(new ExitObject(object.x, object.y, object.properties));
						}
					}
				} else if(layer.name == "Background" && layer.data) {
					this.tiles_width = layer.width ?? 0;
					this.tiles_height = layer.height ?? 0;
					this.tiles = layer.data;
				}
			}
			this.objects.push(this.player = new PlayerObject(this.spawn_coordinates[0], this.spawn_coordinates[1]));
			this.moon = new OrthoMoon();
		} else {
			this.moon = null;
			this.tiles_width = 0;
			this.tiles_height = 0;
			this.tiles = [];
		}
	}

	private simulate(dt : number) : void {
		if(this.next_map_index != null) {
			this.next_map_fade = Math.min(this.next_map_fade + dt*3, 1);
			if(this.next_map_fade >= 1) { this.load_map(this.next_map_index); this.next_map_index = null; }
		} else {
			this.next_map_fade = Math.max(this.next_map_fade - dt*3, 0);
		}
		if(this.player && this.player.y > 1000) this.advance_map(this.current_map_index);
		for(let object of this.objects) object.simulate(dt);
	}

	private keydown(e : KeyboardEvent) : void {
		this.audio_ctx.resume();
		if(e.code == "ArrowLeft" || e.code == "KeyA") this.arrow_left = true;
		if(e.code == "ArrowRight" || e.code == "KeyD") this.arrow_right = true;
		if(e.code == "ArrowUp" || e.code == "KeyW" || e.code == "Space") { this.arrow_up = true; this.player?.jump(); }
		if(e.code == "ArrowDown" || e.code == "KeyS") this.arrow_down = true;
		if(e.code == "KeyE" && this.player && !this.player.is_werewolf) {
			for(let object of this.objects) {
				if(object != this.player && object.in_interact_range(this.player.x, this.player.y)) {
					object.interact();
				}
			}
		}
		if(this.current_map_index == -1 && e.code == "KeyE") this.advance_map(0);
		if(e.code == "KeyR") this.advance_map(this.current_map_index);
	}
	private keyup(e : KeyboardEvent) : void {
		if(e.code == "ArrowLeft" || e.code == "KeyA") this.arrow_left = false;
		if(e.code == "ArrowRight" || e.code == "KeyD") this.arrow_right = false;
		if(e.code == "ArrowUp" || e.code == "KeyW" || e.code == "Space") this.arrow_up = false;
		if(e.code == "ArrowDown" || e.code == "KeyS") this.arrow_down = false;
	}

	private frame(time : number) : void {
		if(this.last_time == -1) this.last_time = time;
		if(this.last_time < time - 500) this.last_time = time - 500;
		while(this.last_time < time) {
			let next_time = Math.min(this.last_time + 5, time);
			this.simulate((next_time - this.last_time) * 0.001);
			this.last_time = next_time;
		}
		let c = this.canvas;
		let rect = c.getBoundingClientRect();
		let int_width = Math.round(rect.width * window.devicePixelRatio);
		let int_height = Math.round(rect.height * window.devicePixelRatio);
		if(int_width != c.width || int_height != c.height) {
			c.width = int_width;
			c.height = int_height;
		}
		let ctx = c.getContext("2d");
		if(!ctx) throw new Error("No 2d rendering context somehow");
		ctx.setTransform();
		ctx.clearRect(0, 0, c.width, c.height);
		ctx.scale(2,2);

		let parallax_x = Math.round((this.player ? -this.player.x/4 : 0) * 2) / 2;
		let parallax_y = Math.round((this.player ? -this.player.y/4 : 0) * 2) / 2;
		for(let star_y = Math.floor(-parallax_y / 32) * 32; star_y <= -parallax_y+this.canvas.height/2; star_y += 32) {
			for(let star_x = Math.floor(-parallax_x / 32) * 32; star_x <= -parallax_x+this.canvas.width/2; star_x += 32) {
				let mapped = this.star_map.get(star_x+","+star_y);
				let color:string, offx:number, offy:number;
				if(mapped) {
					let split = mapped.split(";");
					color = split[0];
					offx = +split[1];
					offy = +split[1];
				} else {
					color = ["#ffffff", "#aaaa88", "#8888ff", "#88ffff"][Math.floor(Math.random() * 4)];	
					offx = Math.floor(Math.random() * 32);
					offy = Math.floor(Math.random() * 32);
					this.star_map.set(star_x+","+star_y, color+";"+offx+";"+offy);
				}
				ctx.fillStyle = color;
				ctx.fillRect(star_x+parallax_x+offx, star_y+parallax_y+offy, 1, 1);
			}
		}
		ctx.drawImage(this.moon_image, 200 + parallax_x, 100 + parallax_y);

		if(this.player)
			ctx.translate(Math.round(-this.player.x) + Math.round(this.canvas.width/2/2), Math.round(-this.player.y) + Math.round(this.canvas.height*2/3/2));

		ctx.imageSmoothingEnabled = false;

		for(let y = 0; y < this.tiles_height; y++) {
			for(let x = 0; x < this.tiles_width; x++) {
				let tilenum = this.tiles[y*this.tiles_width + x] - 1;
				if(tilenum >= 0) {
					let sx = (tilenum % 16)*32;
					let sy = Math.floor(tilenum / 16)*32;
					ctx.drawImage(this.tileset_image, sx, sy, 32, 32, x*32, y*32, 32, 32);
				}
			}
		}

		/*ctx.strokeStyle = "green";
		ctx.beginPath();
		for(let line of this.lines) {
			ctx.moveTo(line.x1, line.y1);
			ctx.lineTo(line.x2, line.y2);
		}
		ctx.stroke();
		*/

		for(let object of this.objects) {
			//ctx.fillStyle = this.moon?.is_point_lit(object.x + object.bound_x + object.bound_width/2, object.y + object.bound_y + object.bound_height/2) ? "green" : "red";
			//ctx.fillRect(object.x+object.bound_x, object.y+object.bound_y, object.bound_width, object.bound_height);
			object.draw(ctx);
		}
		this.moon?.draw(ctx);

		if(this.current_map_index == -2) {
			ctx.fillStyle = "white";
			ctx.font = "Verdana 60px";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("You reached the end of the game", c.width/2/2, c.height/2/2);
			ctx.font = "Verdana 30px";
			ctx.fillText("Yeee", c.width/2/2, c.height/2/2 + 60);

		} else if(this.current_map_index == -1) {
			ctx.drawImage(this.title_image, c.width/2/2 - 120, c.height/2/2 - 100);
			ctx.fillStyle = "white";
			ctx.font = "30px Verdana";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("Press E to play", c.width/2/2, c.height/2/2 + 50);
		}

		//ctx.fillStyle = "white";
		//ctx.fillText(""+this.player?.velocity_x, 64, 64);
		ctx.setTransform();
		if(this.next_map_fade) {
			ctx.fillStyle = `rgba(0,0,0,${this.next_map_fade})`;
			ctx.fillRect(0, 0, c.width, c.height);
		}
	}

	private dom_content_loaded() : void {
		this.load_map(-1);
		document.body.appendChild(this.canvas);
		this.canvas.id = "the_canvas";

		document.addEventListener("keydown", this.keydown.bind(this));
		document.addEventListener("keyup", this.keyup.bind(this));

		window.requestAnimationFrame(this.frame_loop.bind(this));
	}

	private frame_loop(time : number) : void {
		try {
			this.frame(time);
		} catch(e) {
			console.error(e);
			this.canvas.width = this.canvas.width;
		}
		window.requestAnimationFrame(this.frame_loop.bind(this));
	}
}

export const game_instance = new Game();
console.log(game_instance);