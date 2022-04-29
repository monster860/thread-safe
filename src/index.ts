import { Line } from "./collision";
import { maps_list } from "./maps_list";
import { BonusCoinObject, ExitObject, GateObject, MapObject, SwitchableObject, SwitchObject, TextObject, ThreadExtensionObject } from "./objects";
import { PlayerObject } from "./player";
import { Sound } from "./sound";

export class Game {
	canvas : HTMLCanvasElement;
	zoom : number = 1;
	lines : Line[] = [];
	objects : MapObject[] = [];
	tagged_objects = new Map<string, SwitchableObject>();
	
	player : PlayerObject|null = null;
	last_time : number = -1;
	spawn_coordinates : [number,number] = [0,0];
	arrow_left = false; arrow_right = false; arrow_up = false; arrow_down = false;
	debug_pause = false; debug_slow = false;
	debug_enabled = false;

	audio_ctx = new AudioContext();
	audio_scale = 1/32;
	
	tileset_image : HTMLImageElement = new Image();
	moon_image : HTMLImageElement = new Image();
	title_image : HTMLImageElement = new Image();

	switch_on_sound = new Sound("switch_on.ogg");
	switch_off_sound = new Sound("switch_off.ogg");
	thread_extend_sound = new Sound("thread_extend.ogg");
	bonus_coin_sound = new Sound("bonus_coin.ogg");

	tiles : number[] = [];
	tiles_width = 0;
	tiles_height = 0;
	current_map_index : number = -1;
	next_map_index : number|null = null;
	next_map_fade : number = 0;

	star_map = new Map<string, string>();
	tile_rand : Map<string, number> = new Map();

	nya_tokens : Map<string, boolean> = new Map();

	collision_display = false;
	grass_level = 4;

	fade_overlay : HTMLDivElement;

	audio : HTMLAudioElement;
	target_music = "meh.ogg";
	curr_music = "meh.ogg";
	music_fade = 1;
	end_nya_token_count = 0;

	constructor() {
		this.canvas = document.createElement("canvas");
		this.fade_overlay = document.createElement("div");
		this.audio = document.createElement("audio");
		this.tileset_image.src = "tileset.png";
		this.moon_image.src = "moon.png";
		this.title_image.src = "title.png";
		window.addEventListener("DOMContentLoaded", this.dom_content_loaded.bind(this));

		for(let [index, map] of maps_list.entries()) {
			for(let layer of map.layers) {
				if(layer.name == "Objects" && layer.objects) {
					for(let object of layer.objects) {
						if(object.type == "bonus_coin") {
							this.nya_tokens.set(`${index}-${object.x}-${object.y}`, false);
						}
					}
				}
			}
		}
	}

	advance_map(target? : number) : void {
		if(this.next_map_index) return;
		if(target == undefined) {
			for(let object of this.objects) {
				if(object instanceof BonusCoinObject && object.picked_up) {
					let id = `${this.current_map_index}-${object.x}-${object.y}`;
					if(!this.nya_tokens.has(id)) console.error("Unknown nya token " + id);
					this.nya_tokens.set(`${this.current_map_index}-${object.x}-${object.y}`, true);
				}
			}
			if(maps_list.length > this.current_map_index+1) {
				target = this.current_map_index+1;
			} else {
				this.end_nya_token_count = 0;
				for(let token of this.nya_tokens.values()) {
					if(token) this.end_nya_token_count++;
				}

				this.target_music = "";
				target = -2;
			}
		}
		this.next_map_index = target;
	}

	load_map(index : number) {
		for(let object of this.objects) object.cleanup();
		this.objects.length = 0;
		this.lines.length = 0;
		this.tagged_objects.clear();
		this.current_map_index = index;
		this.grass_level = 1000;
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
						if(object.text) {
							this.objects.push(new TextObject(object.x, object.y, object.properties, object.text, object.width, object.height))
						}
						if(object.type == "spawn") {
							this.spawn_coordinates = [object.x, object.y];
						} else if(object.type == "switch") {
							this.objects.push(new SwitchObject(object.x, object.y, object.properties));
						} else if(object.type == "gate") {
							this.objects.push(new GateObject(object.x, object.y, object.properties));
						} else if(object.type == "exit") {
							this.objects.push(new ExitObject(object.x, object.y, object.properties));
						} else if(object.type == "thread_extension") {
							this.objects.push(new ThreadExtensionObject(object.x, object.y, object.properties));
						} else if(object.type == "bonus_coin") {
							this.objects.push(new BonusCoinObject(object.x, object.y, object.properties));
						} else if(object.type) {
							console.warn("Unrecognized object type " + object.type);
						}
					}
				} else if(layer.name == "Background" && layer.data) {
					this.tiles_width = layer.width ?? 0;
					this.tiles_height = layer.height ?? 0;
					this.tiles = layer.data;
					if(layer.properties) {
						for(let property of layer.properties) {
							if(property.name == "grass_level") {
								this.grass_level = property.value as number;
							}
						}
					}
				}
			}
			this.objects.push(this.player = new PlayerObject(this.spawn_coordinates[0], this.spawn_coordinates[1]));
		} else {
			this.tiles_width = 0;
			this.tiles_height = 0;
			this.tiles = [];
			this.player = null;
		}
	}

	private simulate(dt : number) : void {
		if(this.next_map_index != null) {
			this.next_map_fade = Math.min(this.next_map_fade + dt*3, 1);
			if(this.next_map_fade >= 1) { this.load_map(this.next_map_index); this.next_map_index = null; }
		} else {
			this.next_map_fade = Math.max(this.next_map_fade - dt*3, 0);
		}
		this.fade_overlay.style.opacity = ""+this.next_map_fade;
		if(this.target_music != this.curr_music) {
			this.music_fade -= dt;
			if(this.music_fade <= 0) {
				this.music_fade = 1;
				this.curr_music = this.target_music;
				if(this.curr_music != null) {
					this.audio.src = this.target_music;
					this.audio.currentTime = 0;
					this.audio.play();
				} else {
					this.audio.currentTime = 0;
					this.audio.pause();
				}
			}
		}
		this.audio.volume = this.music_fade;
		for(let object of this.objects) object.simulate(dt);
	}

	private keydown(e : KeyboardEvent) : void {
		this.audio_ctx.resume();
		if(e.code == "ArrowLeft" || e.code == "KeyA") this.arrow_left = true;
		if(e.code == "ArrowRight" || e.code == "KeyD") this.arrow_right = true;
		if(e.code == "ArrowUp" || e.code == "KeyW" || e.code == "Space") { this.arrow_up = true; this.player?.jump(); }
		if(e.code == "ArrowDown" || e.code == "KeyS") this.arrow_down = true;
		if(this.debug_enabled) {
			if(e.code == "KeyP") this.debug_pause = true;
			if(e.code == "KeyO") this.debug_slow = true;
			if(e.code == "KeyL") this.collision_display = !this.collision_display;
		}
		if(e.code == "KeyE" && this.player) {
			for(let object of this.objects) {
				if(object != this.player && object.in_interact_range(this.player.x, this.player.y)) {
					object.interact();
				}
			}
		}
		if(this.current_map_index == -1 && e.code == "KeyE") {
			this.audio.play();
			this.advance_map(0);
		}
		if(e.code == "KeyR") this.advance_map(this.current_map_index);
	}
	private keyup(e : KeyboardEvent) : void {
		if(e.code == "ArrowLeft" || e.code == "KeyA") this.arrow_left = false;
		if(e.code == "ArrowRight" || e.code == "KeyD") this.arrow_right = false;
		if(e.code == "ArrowUp" || e.code == "KeyW" || e.code == "Space") this.arrow_up = false;
		if(e.code == "ArrowDown" || e.code == "KeyS") this.arrow_down = false;
		if(e.code == "KeyP") this.debug_pause = false;
		if(e.code == "KeyO") this.debug_slow = false;
	}

	private frame(time : number) : void {
		let timescale = 1;
		if(this.debug_pause) timescale = 0;
		if(this.debug_slow) timescale = 0.1;
		if(this.last_time == -1) this.last_time = time;
		if(this.last_time < time - 500) this.last_time = time - 500;
		if(timescale <= 0) {
			this.last_time = time;
		} else {
			while(this.last_time < time) {
				let next_time = Math.min(this.last_time + 2.5 / timescale, time);
				this.simulate((next_time - this.last_time) * 0.001 * timescale);
				this.last_time = next_time;
			}
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

		if(this.player)
			ctx.translate(Math.round(-this.player.x) + Math.round(this.canvas.width/2/2), Math.round(-this.player.y) + Math.round(this.canvas.height*2/3/2));

		ctx.imageSmoothingEnabled = false;

		if(this.tiles.length && this.player) {
			let start_x = Math.floor(this.player.x/32 - this.canvas.width/2/2/32);
			let start_y = Math.floor(this.player.y/32 - this.canvas.height*2/3/2/32);
			let end_x = Math.ceil(this.player.x/32 + this.canvas.width/2/2/32);
			let end_y = Math.ceil(this.player.y/32 + this.canvas.height*1/3/2/32);
			for(let y = start_y; y < end_y; y++) {
				for(let x = start_x; x < end_x; x++) {
					let tilenum = this.tiles[y*this.tiles_width + x] - 1;
					if(x < 0 || y < 0 || x >= this.tiles_width || y >= this.tiles_height) {
						tilenum = -1;
						let rand = this.tile_rand.get(`${x},${y}`);
						if(!rand) {
							rand = Math.random();
							this.tile_rand.set(`${x},${y}`, rand);
						}
						if(y == this.grass_level) {
							tilenum = 6 + Math.floor(rand * 4);
						} else if(y > this.grass_level) {
							tilenum = 2 + Math.floor(rand * 4);
						}
					}
					if(tilenum >= 0) {
						let sx = (tilenum % 16)*32;
						let sy = Math.floor(tilenum / 16)*32;
						if(tilenum >= 2 && tilenum <= 9) {
							ctx.fillStyle = "black";
							ctx.fillRect(x*32, y*32, 32, 32);
							ctx.globalAlpha = Math.max(0.3, 0.95 ** (y-this.grass_level));
						}
						ctx.drawImage(this.tileset_image, sx, sy, 32, 32, x*32, y*32, 32, 32);
						ctx.globalAlpha = 1;
					}
				}
			}
		}
		

		for(let object of this.objects) {
			object.draw(ctx);
		}

		if(this.collision_display) {
			ctx.lineCap = "butt";
			ctx.strokeStyle = "red";
			ctx.lineWidth = 1;
			ctx.beginPath();
			for(let line of this.lines) {
				let dx = line.x2 - line.x1;
				let dy = line.y2 - line.y1;
				let inv_mag = 1/Math.sqrt(dx*dx+dy*dy) * 0.5;
				dx *= inv_mag; dy *= inv_mag;
				ctx.moveTo(line.x1+dy, line.y1-dx);
				ctx.lineTo(line.x2+dy, line.y2-dx);
			}
			ctx.stroke();

			ctx.strokeStyle = "green";
			ctx.lineWidth = 1;
			ctx.beginPath();
			for(let line of this.lines) {
				let dx = line.x2 - line.x1;
				let dy = line.y2 - line.y1;
				let inv_mag = 1/Math.sqrt(dx*dx+dy*dy) * 0.5;
				dx *= inv_mag; dy *= inv_mag;
				ctx.moveTo(line.x1-dy, line.y1+dx);
				ctx.lineTo(line.x2-dy, line.y2+dx);
			}
			ctx.stroke();

			ctx.strokeStyle = "yellow";
			ctx.lineWidth = 1;
			ctx.beginPath();
			const VEL_SCALE = 0.1;
			for(let line of this.lines) {
				if(line.vx1 || line.vy1) {
					ctx.moveTo(line.x1, line.y1);
					ctx.lineTo(line.x1+line.vx1*VEL_SCALE, line.y1+line.vy1*VEL_SCALE);
				}
				if(line.vx2 || line.vy2) {
					ctx.moveTo(line.x2, line.y2);
					ctx.lineTo(line.x2+line.vx2*VEL_SCALE, line.y2+line.vy2*VEL_SCALE);
				}
			}
			ctx.stroke();
		}

		if(this.current_map_index == -2) {
			let token_text = "Now get all the nya tokens";
			if(this.end_nya_token_count >= this.nya_tokens.size) {
				token_text = "Congratulations on getting all the nya tokens!";
			} else if(this.end_nya_token_count > 0) {
				token_text = "Now get the rest of the nya tokens";
			}
			ctx.fillStyle = "white";
			ctx.font = "30px Verdana";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("You reached the end of the game", c.width/2/2, c.height/2/2);

			ctx.font = "20px Verdana";
			ctx.fillText(token_text, c.width/2/2, c.height/2/2 + 60);

			let collect_text = `${this.end_nya_token_count} / ${this.nya_tokens.size}`;
			let measurement = ctx.measureText(collect_text);
			measurement.width;
			ctx.fillText(collect_text, c.width/2/2 + 20, c.height/2/2 + 92);
			ctx.drawImage(game_instance.tileset_image, 32, 160, 32, 32, c.width/2/2 - measurement.width/2 - 20, c.height/2/2 + 92 - 16, 32, 32);

		} else if(this.current_map_index == -1) {
			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(this.title_image, c.width/2/2 - this.title_image.width/2, c.height/2/2 - this.title_image.height/2);
			ctx.imageSmoothingEnabled = false;
			ctx.fillStyle = "white";
			ctx.font = "30px Verdana";
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.fillText("Press E to play", c.width/2/2, c.height/2 - 30);
		}

		//ctx.fillStyle = "white";
		//ctx.fillText(""+this.player?.velocity_x, 64, 64);
		ctx.setTransform();

		if(this.player) {
			ctx.fillStyle = "white";
			ctx.font = "30px Verdana";
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillText(`Thread length: ${this.player.thread_length.toFixed(1)} / ${this.player.thread_limit.toFixed(1)}`, 30, 15);
			if(this.debug_enabled) ctx.fillText(`${this.player.x|0},${this.player.y|0}`, 30, 45);
		}
	}

	private dom_content_loaded() : void {
		this.load_map(-1);
		document.body.appendChild(this.canvas);
		this.canvas.id = "the_canvas";
		document.body.appendChild(this.fade_overlay);
		this.fade_overlay.id = "fade_overlay";

		document.body.appendChild(this.audio);
		this.audio.src = this.target_music;
		this.curr_music = this.target_music;
		this.audio.loop = true;

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